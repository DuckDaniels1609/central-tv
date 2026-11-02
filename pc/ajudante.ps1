# Ajudante da Central no PC: abre os programas e pastas que estão em
# "Área de trabalho antiga" (na Área de Trabalho). Só aceita pedidos deste PC
# (localhost) e com a chave gerada aqui. Não abre nada fora dessa pasta.
$ErrorActionPreference = 'Stop'
$aqui0 = Split-Path -Parent $MyInvocation.MyCommand.Path
try { Start-Transcript -Path (Join-Path $aqui0 'ajudante_log.txt') -Force | Out-Null } catch {}
trap { "ERRO: $($_.Exception.Message) (linha $($_.InvocationInfo.ScriptLineNumber))" | Out-File -FilePath (Join-Path $aqui0 'ajudante_erro.txt') -Encoding UTF8; break }
$porta = 47803
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$mesa = [Environment]::GetFolderPath('Desktop')
$base = Join-Path $mesa ([string][char]0x00C1 + 'rea de trabalho antiga')
$atalhos = Join-Path $base 'Atalhos'
New-Item -ItemType Directory -Force -Path $atalhos | Out-Null
Add-Type -AssemblyName System.Drawing

$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$porta/")
try { $http.Start() } catch { "porta ocupada: $($_.Exception.Message)" | Out-File (Join-Path $aqui 'ajudante_erro.txt') -Encoding UTF8; exit 0 }
# chave nova a cada início; a página lê pelo arquivo ao lado dela
$chave = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
Set-Content -Path (Join-Path $aqui 'ajudante_chave.js') -Value "window.AJUDANTE_CHAVE='$chave';" -Encoding UTF8


function Responder($ctx, $codigo, $tipo, [byte[]]$corpo) {
  $r = $ctx.Response
  $r.StatusCode = $codigo
  $r.Headers['Access-Control-Allow-Origin'] = '*'
  $r.Headers['Cache-Control'] = 'no-store'
  $r.ContentType = $tipo
  $r.OutputStream.Write($corpo, 0, $corpo.Length)
  $r.Close()
}
function Json($ctx, $obj) { Responder $ctx 200 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 4 -Compress))) }
function Achar($nome) {
  # só nomes simples, dentro da pasta (nada de ..\ ou caminhos)
  if (-not $nome -or $nome -match '[\\/:]' -or $nome -match '^\.') { return $null }
  foreach ($d in @($atalhos, $base)) { $p = Join-Path $d $nome; if (Test-Path -LiteralPath $p) { return (Get-Item -LiteralPath $p) } }
  return $null
}
# ---------- clipes para revisar (Valorant e momentos do F9); apagar manda para a Lixeira ----------
function ClipesRaizes {
  $g = 'F:\Grava' + [char]0x00E7 + [char]0x00F5 + 'es da Stream'
  @(@{ n = 'Valorant'; p = (Join-Path $g ('Grava' + [char]0x00E7 + [char]0x00E3 + 'o Valorant\clipes')) },
    @{ n = 'Valorant (testes)'; p = (Join-Path $g 'Clipes Valorant') },
    @{ n = 'Momentos (F9)'; p = (Join-Path $g 'Momentos') },
    @{ n = 'Street Fighter 6'; p = (Join-Path $g ('Grava' + [char]0x00E7 + [char]0x00E3 + 'o SF6\partidas')) })
}
function NomeSimples($x) { return ($x -and $x -notmatch '[\\/:*?"<>|]' -and $x -notmatch '^\.') }
function ClipePasta($r, $pasta) {
  $raizes = @(ClipesRaizes); $i = [int]$r; if ($i -lt 0 -or $i -ge $raizes.Count) { return $null }
  if ($pasta -eq '' -or $null -eq $pasta) { $d = $raizes[$i].p } elseif (NomeSimples $pasta) { $d = Join-Path $raizes[$i].p $pasta } else { return $null }
  if (Test-Path -LiteralPath $d -PathType Container) { return $d } else { return $null }
}
function ClipeArq($r, $pasta, $arq) {
  $d = ClipePasta $r $pasta; if (-not $d -or -not (NomeSimples $arq) -or [IO.Path]::GetExtension($arq).ToLower() -notin @('.mp4', '.mkv')) { return $null }
  $f = Join-Path $d $arq; if (Test-Path -LiteralPath $f -PathType Leaf) { return $f } else { return $null }
}
function RevisaoLer($d) { $f = Join-Path $d 'revisao.json'; try { if (Test-Path -LiteralPath $f) { return @((Get-Content -LiteralPath $f -Raw -Encoding UTF8 | ConvertFrom-Json).manter) } } catch {}; return @() }
function RevisaoGravar($d, $lista) { $f = Join-Path $d 'revisao.json'; [IO.File]::WriteAllText($f, (@{ manter = @($lista | Where-Object { $_ } | Select-Object -Unique) } | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false)) }
function ClipesLista {
  $raizes = @(ClipesRaizes); $out = @()
  for ($i = 0; $i -lt $raizes.Count; $i++) {
    if (-not (Test-Path -LiteralPath $raizes[$i].p)) { continue }
    $pastas = @(@{ nome = ''; d = $raizes[$i].p }) + @(Get-ChildItem -LiteralPath $raizes[$i].p -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '^[._]' } | ForEach-Object { @{ nome = $_.Name; d = $_.FullName } })
    foreach ($pa in $pastas) {
      $vs = @(Get-ChildItem -LiteralPath $pa.d -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @('.mp4', '.mkv') } | Sort-Object Name)
      if (-not $vs.Count) { continue }
      $man = RevisaoLer $pa.d
      $out += @{ r = $i; grupo = $raizes[$i].n; pasta = $pa.nome; quando = ($vs | Measure-Object -Property LastWriteTime -Maximum).Maximum.ToString('yyyy-MM-ddTHH:mm:ss');
                 clipes = @($vs | ForEach-Object { @{ arq = $_.Name; mb = [math]::Round($_.Length / 1MB, 1); manter = ($man -contains $_.Name) } }) }
    }
  }
  return @($out | Sort-Object { $_.quando } -Descending)
}
function MandarVideo($ctx, $f) {
  $fs = [IO.File]::OpenRead($f)
  try {
    $tam = $fs.Length; $ini = [long]0; $fim = $tam - 1; $r = $ctx.Response
    $r.Headers['Access-Control-Allow-Origin'] = '*'; $r.Headers['Accept-Ranges'] = 'bytes'; $r.ContentType = 'video/mp4'; if ($f -like '*.mkv') { $r.ContentType = 'video/webm' }
    $rg = [string]$ctx.Request.Headers['Range']
    if ($rg -match 'bytes=(\d*)-(\d*)') {
      if ($matches[1]) { $ini = [long]$matches[1] }; if ($matches[2]) { $fim = [long]$matches[2] }
      $fim = [math]::Min([math]::Min($fim, $ini + 8MB - 1), $tam - 1)
      $r.StatusCode = 206; $r.Headers['Content-Range'] = "bytes $ini-$fim/$tam"
    }
    $len = $fim - $ini + 1; $r.ContentLength64 = $len; $fs.Position = $ini
    $buf = New-Object byte[] 65536; $rest = $len
    while ($rest -gt 0) { $n = $fs.Read($buf, 0, [int][math]::Min(65536, $rest)); if ($n -le 0) { break }; $r.OutputStream.Write($buf, 0, $n); $rest -= $n }
    $r.Close()
  } catch { try { $ctx.Response.Abort() } catch {} } finally { $fs.Close() }
}
# coleção de cenas em uso no OBS Studio (lida do disco; o OBS grava ao trocar de cena ou fechar)
function ObsColecao {
  $od = Join-Path $env:APPDATA 'obs-studio'
  $ini = @(); foreach ($n in 'user.ini', 'global.ini') { $f = Join-Path $od $n; if (Test-Path $f) { $ini += Get-Content -LiteralPath $f -Encoding UTF8 } }
  $col = ($ini | Where-Object { $_ -like 'SceneCollectionFile=*' } | Select-Object -First 1); $prof = ($ini | Where-Object { $_ -like 'ProfileDir=*' } | Select-Object -First 1)
  if (-not $col) { return $null }
  $arq = Join-Path $od ('basic\scenes\' + $col.Substring(20))
  if (-not (Test-Path -LiteralPath $arq)) { return $null }
  $cx = 1920; $cy = 1080
  if ($prof) { $bi = Join-Path $od ('basic\profiles\' + $prof.Substring(11) + '\basic.ini'); if (Test-Path -LiteralPath $bi) { foreach ($l in Get-Content -LiteralPath $bi) { if ($l -like 'BaseCX=*') { $cx = [int]$l.Substring(7) }; if ($l -like 'BaseCY=*') { $cy = [int]$l.Substring(7) } } } }
  $it = Get-Item -LiteralPath $arq
  return @{ arquivo = $it.Name; nome = [IO.Path]::GetFileNameWithoutExtension($it.Name); txt = [IO.File]::ReadAllText($arq, [Text.Encoding]::UTF8); cx = $cx; cy = $cy; mudou = $it.LastWriteTime.ToString('s') }
}
# controle remoto do OBS (obs-websocket 5, embutido no OBS 28+). A senha fica só no config do OBS, neste PC.
function WsEnviar($ws, $obj, $ct) {
  $b = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 6 -Compress))
  $seg = New-Object 'System.ArraySegment[byte]' (, $b)
  $null = $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).GetAwaiter().GetResult()
}
function WsLer($ws, $ct) {
  $buf = New-Object byte[] 65536; $ms = New-Object IO.MemoryStream
  do {
    $seg = New-Object 'System.ArraySegment[byte]' (, $buf)
    $res = $ws.ReceiveAsync($seg, $ct).GetAwaiter().GetResult()
    if ($res.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { throw 'o OBS fechou a conexão' }
    $ms.Write($buf, 0, $res.Count)
  } while (-not $res.EndOfMessage)
  return ([Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json)
}
function ObsWs($pedidos) {
  $cfgF = Join-Path $env:APPDATA 'obs-studio\plugin_config\obs-websocket\config.json'
  $cfg = [IO.File]::ReadAllText($cfgF, [Text.Encoding]::UTF8) | ConvertFrom-Json
  if (-not $cfg.server_enabled) { throw 'o controle remoto do OBS está desligado (Ferramentas > Configurações do servidor WebSocket)' }
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ct = (New-Object System.Threading.CancellationTokenSource 4000).Token
  try {
    $null = $ws.ConnectAsync([Uri]('ws://127.0.0.1:' + $cfg.server_port), $ct).GetAwaiter().GetResult()
    $hello = WsLer $ws $ct
    $id = @{ rpcVersion = 1; eventSubscriptions = 0 }
    if ($hello.d.authentication) {
      $sha = [Security.Cryptography.SHA256]::Create()
      $sec = [Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$cfg.server_password + $hello.d.authentication.salt)))
      $id.authentication = [Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sec + $hello.d.authentication.challenge)))
    }
    WsEnviar $ws @{ op = 1; d = $id } $ct
    $r = WsLer $ws $ct; if ($r.op -ne 2) { throw 'o OBS recusou a conexão' }
    $saida = @(); $n = 0
    foreach ($p in $pedidos) {
      $n++; $req = @{ requestType = $p.t; requestId = "c$n" }; if ($p.d) { $req.requestData = $p.d }
      WsEnviar $ws @{ op = 6; d = $req } $ct
      do { $r = WsLer $ws $ct } while ($r.op -ne 7)
      $saida += , $r.d
    }
    return , $saida
  } finally { try { if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) { $null = $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'ok', (New-Object System.Threading.CancellationTokenSource 2000).Token).GetAwaiter().GetResult() } } catch {}; try { $ws.Dispose() } catch {} }
}
function Lista($pasta, $soAtalhos) {
  Get-ChildItem -LiteralPath $pasta -Force | Where-Object { $_.Name -ne 'desktop.ini' -and $_.Name -ne 'Atalhos' -and (-not $soAtalhos -or $_.Extension -in '.lnk', '.url', '.exe') } |
    Sort-Object Name | ForEach-Object { @{ f = $_.Name; nome = [IO.Path]::GetFileNameWithoutExtension($_.Name); pasta = $_.PSIsContainer; ext = $_.Extension.ToLower() } }
}
function IconeDe($item) {
  $alvo = $item.FullName
  if ($item.Extension -eq '.lnk') {
    try { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($alvo); $ic = ($s.IconLocation -split ',')[0]; if ($ic -and (Test-Path $ic)) { $alvo = $ic } elseif ($s.TargetPath -and (Test-Path $s.TargetPath)) { $alvo = $s.TargetPath } } catch {}
  } elseif ($item.Extension -eq '.url') {
    $l = Get-Content -LiteralPath $alvo | Where-Object { $_ -like 'IconFile=*' } | Select-Object -First 1
    if ($l) { $ic = $l.Substring(9); if (Test-Path $ic) { $alvo = $ic } }
  }
  if ($item.PSIsContainer) { return $null }
  try {
    if ($alvo -like '*.ico') { $bmp = (New-Object System.Drawing.Icon($alvo, 256, 256)).ToBitmap() }
    else { $bmp = ([System.Drawing.Icon]::ExtractAssociatedIcon($alvo)).ToBitmap() }
    $ms = New-Object IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); return $ms.ToArray()
  } catch { return $null }
}

function TrocarIcone([byte[]]$png) {
  # PNG dentro de um .ico (Windows Vista em diante aceita); nome novo a cada troca para o Windows não usar o ícone antigo guardado
  Get-ChildItem -LiteralPath $aqui -Filter 'icone_*.ico' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  if ($png) {
    $ico = Join-Path $aqui ('icone_' + (Get-Date -f yyyyMMddHHmmss) + '.ico')
    $fs = [IO.File]::Create($ico); $bw = New-Object IO.BinaryWriter($fs)
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
    $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$png.Length); $bw.Write([uint32]22); $bw.Write($png); $bw.Close()
  } else { $ico = Join-Path $aqui 'central.ico' }
  $w = New-Object -ComObject WScript.Shell
  foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))) {
    $l = Join-Path $d 'Central no PC.lnk'
    if (Test-Path -LiteralPath $l) { $sc = $w.CreateShortcut($l); $sc.IconLocation = $ico + ',0'; $sc.Save() }
  }
  try { & ie4uinit.exe -show } catch {}
}

# ---------- MyAnimeList (OAuth oficial; a senha fica só no site do MAL) ----------
$malArq = Join-Path $aqui 'mal.dat'
$malRedirect = "http://localhost:$porta/mal/retorno"
function MalLer() {
  if (-not (Test-Path $malArq)) { return @{} }
  try { $sec = (Get-Content $malArq -Raw).Trim() | ConvertTo-SecureString; $txt = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)); $o = $txt | ConvertFrom-Json; $h = @{}; $o.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }; return $h } catch { return @{} }
}
function MalGravar($h) { ($h | ConvertTo-Json -Compress) | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $malArq }
function MalToken($h, $form) {
  $wc = New-Object System.Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8; $wc.Headers['Content-Type'] = 'application/x-www-form-urlencoded'
  $r = $wc.UploadString('https://myanimelist.net/v1/oauth2/token', 'POST', $form) | ConvertFrom-Json
  $h['access'] = $r.access_token; $h['refresh'] = $r.refresh_token; $h['expira'] = [DateTimeOffset]::UtcNow.AddSeconds([int]$r.expires_in - 120).ToUnixTimeSeconds(); MalGravar $h; return $h
}
function MalChamar($metodo, $caminho, $corpo) {
  $h = MalLer
  if (-not $h['access']) { throw 'MAL não conectado' }
  if ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -gt [long]$h['expira']) { $h = MalToken $h ('client_id=' + $h['cid'] + '&grant_type=refresh_token&refresh_token=' + [Uri]::EscapeDataString($h['refresh'])) }
  for ($t = 0; $t -lt 2; $t++) {
    $wc = New-Object System.Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8; $wc.Headers['Authorization'] = 'Bearer ' + $h['access']
    try {
      if ($metodo -eq 'GET') { return $wc.DownloadString('https://api.myanimelist.net' + $caminho) }
      $wc.Headers['Content-Type'] = 'application/x-www-form-urlencoded'; return $wc.UploadString('https://api.myanimelist.net' + $caminho, $metodo, [string]$corpo)
    } catch [System.Net.WebException] {
      $st = 0; if ($_.Exception.Response) { $st = [int]$_.Exception.Response.StatusCode }
      if ($st -eq 401 -and $t -eq 0) { $h = MalToken $h ('client_id=' + $h['cid'] + '&grant_type=refresh_token&refresh_token=' + [Uri]::EscapeDataString($h['refresh'])); continue }
      throw
    }
  }
}

# backup semanal automático do que só existe neste PC (pasta da TV, certificado Samsung, atalhos)
$bkMarca = Join-Path $aqui 'ultimo_backup.txt'
$bkScript = Join-Path (Split-Path $aqui -Parent | Split-Path -Parent) 'fazer_backup_central.ps1'
$script:bkVisto = [DateTime]::MinValue
function BackupSeVencido() {
  if (((Get-Date) - $script:bkVisto).TotalHours -lt 1) { return }
  $script:bkVisto = Get-Date
  if (-not (Test-Path $bkScript)) { return }
  $ult = [DateTime]::MinValue; if (Test-Path $bkMarca) { try { $ult = [DateTime]::Parse((Get-Content $bkMarca -Raw).Trim()) } catch {} }
  if (((Get-Date) - $ult).TotalDays -ge 7) {
    (Get-Date).ToString('o') | Set-Content $bkMarca
    Start-Process powershell -WindowStyle Hidden -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $bkScript + '"')
  }
}
try { BackupSeVencido } catch {}

# ===== Stream: jogo aberto, linha do tempo da gravação e leitor ao vivo do SF6 =====
$GRAV = 'F:\Grava' + [char]0x00E7 + [char]0x00F5 + 'es da Stream'
$PASTA_LIVES = Join-Path $GRAV 'Lives'
$PASTA_SF6 = Join-Path $GRAV ('Grava' + [char]0x00E7 + [char]0x00E3 + 'o SF6')
$sessF = Join-Path $aqui 'sessao_gravacao.json'
$leitorPid = Join-Path $aqui 'leitor_sf6.pid'
$clipPid = Join-Path $aqui 'clipes_valorant.pid'
$PASTA_VAL = Join-Path $GRAV ('Grava' + [char]0x00E7 + [char]0x00E3 + 'o Valorant')
$gravAtualF = Join-Path $GRAV ('Arte da stream\overlays\gravacao_atual.json')
function ProcRodando($f) { if (Test-Path $f) { $id = [int](Get-Content $f -Raw); return [bool](Get-Process -Id $id -ErrorAction SilentlyContinue) }; return $false }
function ProcParar($f) { if (Test-Path $f) { $id = [int](Get-Content $f -Raw); try { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } catch {}; Remove-Item $f -Force -ErrorAction SilentlyContinue } }
function PyDe($janela) {
  # caminho do Python gravado pelo "Instalar ferramentas.bat" (config.json da stream); senão, o do PATH
  $c = CfgStream; $p = $c.python; if ($janela) { $p = $c.pythonw }
  if ($c.ffmpeg -and (Test-Path $c.ffmpeg)) { $dirF = Split-Path $c.ffmpeg -Parent; if ($env:Path -notlike "*$dirF*") { $env:Path = $dirF + ';' + $env:Path } }
  if ($c.tesseract -and (Test-Path $c.tesseract)) { $dirT = Split-Path $c.tesseract -Parent; if ($env:Path -notlike "*$dirT*") { $env:Path = $dirT + ';' + $env:Path } }
  if ($p -and (Test-Path $p)) { return $p }
  $n = 'python'; if ($janela) { $n = 'pythonw' }
  return (Get-Command $n -ErrorAction SilentlyContinue).Source
}
function ProcIniciar($sc, $f) {
  $py = (PyDe $true); if (-not $py -or -not (Test-Path $sc)) { return }
  $pr = Start-Process $py -ArgumentList ('"' + $sc + '"') -WindowStyle Hidden -PassThru; Set-Content -Path $f -Value $pr.Id
}
function JogoAtual {
  $nomes = @(Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessName })
  if ($nomes -contains 'StreetFighter6') { return 'sf6' }
  if ($nomes -contains 'VALORANT-Win64-Shipping') { return 'valorant' }
  return ''
}
function LeitorRodando { if (Test-Path $leitorPid) { $id = [int](Get-Content $leitorPid -Raw); return [bool](Get-Process -Id $id -ErrorAction SilentlyContinue) }; return $false }
function LeitorParar { if (Test-Path $leitorPid) { $id = [int](Get-Content $leitorPid -Raw); try { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } catch {}; Remove-Item $leitorPid -Force -ErrorAction SilentlyContinue } }
function LeitorIniciar {
  $py = (PyDe $true); if (-not $py) { return }
  $sc = Join-Path $PASTA_SF6 '_analisador\leitor_ao_vivo.py'; if (-not (Test-Path $sc)) { return }
  $pr = Start-Process $py -ArgumentList ('"' + $sc + '"') -WindowStyle Hidden -PassThru
  Set-Content -Path $leitorPid -Value $pr.Id
}
# configuração da stream (atalho de marcar momento, troca de cena automática) e encerramento com contagem
$SCR = Join-Path $GRAV 'Arte da stream\_scripts'
$cfgStreamF = Join-Path $SCR 'config.json'
$atalhoPid = Join-Path $aqui 'atalho_momento.pid'
$encF = Join-Path $aqui 'encerrar_em.txt'
$comecouF = Join-Path $GRAV 'Arte da stream\overlays\jogo_comecou.json'
function CfgStream {
  $c = $null; try { $c = [IO.File]::ReadAllText($cfgStreamF, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch {}
  if (-not $c) { $c = [pscustomobject]@{} }
  if ($null -eq $c.tecla) { $c | Add-Member -NotePropertyName tecla -NotePropertyValue 'F9' -Force }
  if ($null -eq $c.autoCena) { $c | Add-Member -NotePropertyName autoCena -NotePropertyValue $false -Force }
  if ($null -eq $c.leitoresAoVivo) { $c | Add-Member -NotePropertyName leitoresAoVivo -NotePropertyValue $false -Force }
  if ($null -eq $c.cenas) { $c | Add-Member -NotePropertyName cenas -NotePropertyValue ([pscustomobject]@{ sf6 = 'Jogos de Luta'; valorant = 'Main Right' }) -Force }
  return $c
}
function CfgStreamGravar($c) { New-Item -ItemType Directory -Force -Path $SCR | Out-Null; [IO.File]::WriteAllText($cfgStreamF, ($c | ConvertTo-Json -Depth 4), [Text.Encoding]::UTF8) }
$script:jogoGrav = ''; $script:dirGrav = ''; $script:jogoAnt = ''; $script:cenaQuandoAbriu = ''; $script:autoPend = $false; $script:gravAnt = $false
# Captura do jogo (e não da tela inteira): cria "Jogo: Street Fighter 6", "Jogo: Valorant" e "Jogo (tela cheia)"
# nas cenas de jogo, por cima da "Tela 1", e oculta a "Tela 1" (assim a Central e outras janelas não aparecem).
$capOkF = Join-Path $aqui 'captura_jogo_ok4.txt'
function CapturaJogo {
  # de baixo para cima (logo acima da Tela 1): tela cheia, PS5 (4K Capture), Valorant, SF6
  $novos = @(
    @{ n = 'Jogo (tela cheia)'; k = 'game_capture'; s = @{ capture_mode = 'any_fullscreen'; capture_cursor = $false; anti_cheat_hook = $true } },
    @{ n = 'PS5 (4K Capture)'; k = 'window_capture'; s = @{ window = '4K Capture Utility::4KCaptureUtility.exe'; priority = 2; method = 2; cursor = $false; client_area = $true } },
    @{ n = 'Jogo: Valorant'; k = 'game_capture'; s = @{ capture_mode = 'window'; window = 'VALORANT::VALORANT-Win64-Shipping.exe'; priority = 2; capture_cursor = $false; anti_cheat_hook = $true } },
    @{ n = 'Jogo: Street Fighter 6'; k = 'game_capture'; s = @{ capture_mode = 'window'; window = 'Street Fighter 6::StreetFighter6.exe'; priority = 2; capture_cursor = $false; anti_cheat_hook = $true } }
  )
  $cenas = @(('S' + [char]0x00F3 + ' grava' + [char]0x00E7 + [char]0x00E3 + 'o'), 'Main Right', 'Jogos de Luta')
  $log = @()
  $ex = @((ObsWs @(@{ t = 'GetInputList' }))[0].responseData.inputs | ForEach-Object { $_.inputName })
  foreach ($cena in $cenas) {
    $rl = (ObsWs @(@{ t = 'GetSceneItemList'; d = @{ sceneName = $cena } }))[0]
    $its = @($rl.responseData.sceneItems)
    $tela = $its | Where-Object { ([string]$_.sourceName).Trim() -eq 'Tela 1' } | Select-Object -First 1
    if (-not $tela) { $log += "$cena sem Tela 1 (status $($rl.requestStatus.code) $($rl.requestStatus.comment); itens: $((@($its | ForEach-Object { $_.sourceName }) -join ', ')))"; continue }
    $ids = @{}
    foreach ($nv in $novos) {
      $ja = $its | Where-Object { $_.sourceName -eq $nv.n } | Select-Object -First 1
      if ($ja) { $ids[$nv.n] = [int]$ja.sceneItemId; continue }
      if ($ex -notcontains $nv.n) {
        $r = ObsWs @(@{ t = 'CreateInput'; d = @{ sceneName = $cena; inputName = $nv.n; inputKind = $nv.k; inputSettings = $nv.s; sceneItemEnabled = $true } }); $ex += $nv.n
      } else { $r = ObsWs @(@{ t = 'CreateSceneItem'; d = @{ sceneName = $cena; sourceName = $nv.n; sceneItemEnabled = $true } }) }
      $id = $r[0].responseData.sceneItemId
      if ($id) {
        $ids[$nv.n] = [int]$id
        $null = ObsWs @(@{ t = 'SetSceneItemTransform'; d = @{ sceneName = $cena; sceneItemId = [int]$id; sceneItemTransform = @{ positionX = 0; positionY = 0; alignment = 5; boundsType = 'OBS_BOUNDS_SCALE_INNER'; boundsWidth = 1920; boundsHeight = 1080; boundsAlignment = 0 } } })
        $log += "$cena + $($nv.n)"
      } else { $log += "$cena falhou $($nv.n): $($r[0].requestStatus.comment)" }
    }
    # ordem certa, logo acima da Tela 1
    $n = 1
    foreach ($nv in $novos) {
      if (-not $ids.ContainsKey($nv.n)) { continue }
      $idx = [int]((ObsWs @(@{ t = 'GetSceneItemIndex'; d = @{ sceneName = $cena; sceneItemId = [int]$tela.sceneItemId } }))[0].responseData.sceneItemIndex)
      $null = ObsWs @(@{ t = 'SetSceneItemIndex'; d = @{ sceneName = $cena; sceneItemId = $ids[$nv.n]; sceneItemIndex = $idx + $n } }); $n++
    }
    $null = ObsWs @(@{ t = 'SetSceneItemEnabled'; d = @{ sceneName = $cena; sceneItemId = [int]$tela.sceneItemId; sceneItemEnabled = $false } })
    $log += "$cena Tela 1 oculta"
  }
  Set-Content -Path $capOkF -Value ($log -join "`r`n") -Encoding UTF8
  return $log
}
# ---------- qual imagem de jogo fica ligada nas cenas (uma por vez, senão uma janela parada cobre a outra de preto) ----------
$script:fonteModo = 'auto'; $script:fonteAplicada = ''
$FONTES_JOGO = @{ valorant = @('Jogo: Valorant', 'Valorant'); sf6 = @('Jogo: Street Fighter 6'); ps5 = @('Elgato 4k ', 'PS5 (4K Capture)'); tela = @() }
function JogoAlvo {
  $p = @(Get-Process -Name 'StreetFighter6', 'VALORANT-Win64-Shipping' -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending)
  if (-not $p.Count) { return 'ps5' }
  if ($p[0].ProcessName -eq 'StreetFighter6') { return 'sf6' } else { return 'valorant' }
}
function FonteAplicar($alvo) {
  $todas = @(); foreach ($k in $FONTES_JOGO.Keys) { $todas += $FONTES_JOGO[$k] }; $todas += 'Jogo (tela cheia)'
  $cenas = @(('S' + [char]0x00F3 + ' grava' + [char]0x00E7 + [char]0x00E3 + 'o'), 'Main Right', 'Jogos de Luta')
  foreach ($cena in $cenas) {
    try {
      $its = @((ObsWs @(@{ t = 'GetSceneItemList'; d = @{ sceneName = $cena } }))[0].responseData.sceneItems | Where-Object { $todas -contains $_.sourceName })
      $ped = @($its | ForEach-Object { @{ t = 'SetSceneItemEnabled'; d = @{ sceneName = $cena; sceneItemId = [int]$_.sceneItemId; sceneItemEnabled = [bool]($FONTES_JOGO[$alvo] -contains $_.sourceName) } } })
      if ($ped.Count) { $null = ObsWs $ped }
    } catch {}
  }
  $script:fonteAplicada = $alvo
}
# ---------- CheatRunner do PS5 (192.168.7.5:9999): teste de acesso e envio de cheats ----------
$CR_URL = 'http://192.168.7.5:9999'
$script:crTestado = $false
function CrGet($cam) { $wc = New-Object System.Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8; return $wc.DownloadString($CR_URL + $cam) }
function CrTeste {
  $out = @("teste $(Get-Date -f 'yyyy-MM-dd HH:mm:ss')")
  foreach ($c in @('/', '/api/cheats?titleId=PPSA36992', '/api/cheats/state', '/api/logs')) {
    try { $t = CrGet $c; $out += "== $c OK ($($t.Length) bytes)"; $out += $t.Substring(0, [math]::Min(4000, $t.Length)) } catch { $out += "== $c ERRO: $($_.Exception.Message)" }
  }
  try { $h = CrGet '/'; [IO.File]::WriteAllText((Join-Path $aqui 'cheatrunner_index.html'), $h, (New-Object Text.UTF8Encoding $false))
    foreach ($m in [regex]::Matches($h, '<script[^>]+src="([^"]+)"')) { $src = $m.Groups[1].Value; if ($src -notmatch '^https?:') { try { $js = CrGet ('/' + $src.TrimStart('/')); [IO.File]::WriteAllText((Join-Path $aqui ('cheatrunner_' + ($src -replace '[^\w.]', '_'))), $js, (New-Object Text.UTF8Encoding $false)) } catch {} } }
  } catch {}
  [IO.File]::WriteAllText((Join-Path $aqui 'cheatrunner_teste.txt'), ($out -join "`r`n"), (New-Object Text.UTF8Encoding $false))
}
$script:tiqueEm = [DateTime]::MinValue
function Tique {
  if (((Get-Date) - $script:tiqueEm).TotalSeconds -lt 4) { return }
  $script:tiqueEm = Get-Date
  $jogo = JogoAtual; $obs = [bool](Get-Process obs64 -ErrorAction SilentlyContinue)
  $vivo = $false; $grav = $false; $durMs = 0
  if ($obs) { try { $r = ObsWs @(@{ t = 'GetStreamStatus' }, @{ t = 'GetRecordStatus' }); $vivo = [bool]$r[0].responseData.outputActive; $grav = [bool]$r[1].responseData.outputActive; $durMs = [double]$r[1].responseData.outputDuration } catch {} }
  # leitor ao vivo do SF6 (placar): só com o SF6 aberto e com live ou gravação; desliga sozinho fora disso
  $cfgS = CfgStream; $aoVivoOn = [bool]$cfgS.leitoresAoVivo
  if ($aoVivoOn -and $jogo -eq 'sf6' -and ($vivo -or $grav)) { if (-not (LeitorRodando)) { LeitorIniciar } } elseif (Test-Path $leitorPid) { LeitorParar }
  # atalho de "marcar momento" (F9 por padrão): ligado enquanto estiver gravando
  if ($grav) { if (-not (ProcRodando $atalhoPid)) { ProcIniciar (Join-Path $SCR 'atalho_momento.py') $atalhoPid } } elseif (Test-Path $atalhoPid) { ProcParar $atalhoPid }
  if ($obs -and -not (Test-Path $capOkF) -and ((Get-Date) - (Get-Process obs64 | Select-Object -First 1).StartTime).TotalSeconds -gt 20) { try { $null = CapturaJogo } catch { Set-Content -Path (Join-Path $aqui 'captura_jogo_erro.txt') -Value $_.Exception.Message } }
  if (-not $script:crTestado) { $script:crTestado = $true; try { CrTeste } catch {} }
  if ($obs) { $alvoF = $script:fonteModo; if ($alvoF -eq 'auto') { $alvoF = JogoAlvo }; if ($alvoF -ne $script:fonteAplicada) { FonteAplicar $alvoF } } else { $script:fonteAplicada = '' }
  if ($grav -and ($jogo -eq 'sf6' -or $jogo -eq 'valorant')) { $script:jogoGrav = $jogo }
  if ($grav -and -not $script:gravAnt) { $script:dirGrav = ''; try { $script:dirGrav = [string](ObsWs @(@{ t = 'GetRecordDirectory' }))[0].responseData.recordDirectory } catch {} }
  if ($script:gravAnt -and -not $grav) {
    # fim da gravação: momentos do F9 e, se foi SF6 ou Valorant, põe na pasta do jogo e corta
    $pg = Join-Path $SCR 'pos_gravacao.py'; $py = (PyDe $false)
    if ($py -and (Test-Path $pg)) { Start-Process $py -WindowStyle Minimized -ArgumentList ('"' + $pg + '" "' + $script:jogoGrav + '" "' + ($script:dirGrav -replace '/', '\') + '"') }
    $script:jogoGrav = ''
  }
  $script:gravAnt = $grav
  # encerrar a live: depois da contagem, para a stream e a gravação
  if (Test-Path $encF) {
    $quando = [double](Get-Content $encF -Raw)
    if ([DateTimeOffset]::Now.ToUnixTimeSeconds() -ge $quando) { Remove-Item $encF -Force; try { $null = ObsWs @(@{ t = 'StopStream' }, @{ t = 'StopRecord' }) } catch {} }
  }
  # troca de cena automática: só quando a partida começa de fato, e só se você não trocou de cena desde que abriu o jogo
  if ($obs -and $jogo -ne $script:jogoAnt) {
    $script:jogoAnt = $jogo; $script:autoPend = $false
    if ($jogo) { try { $script:cenaQuandoAbriu = [string](ObsWs @(@{ t = 'GetCurrentProgramScene' }))[0].responseData.currentProgramSceneName; $script:autoPend = $true; if (Test-Path $comecouF) { Remove-Item $comecouF -Force } } catch {} }
  }
  if ($script:autoPend -and $obs -and (Test-Path $comecouF)) {
    $script:autoPend = $false
    try {
      $cs = CfgStream; $alvo = [string]$cs.cenas.$jogo
      $agoraC = [string](ObsWs @(@{ t = 'GetCurrentProgramScene' }))[0].responseData.currentProgramSceneName
      if ($cs.autoCena -and $alvo -and $agoraC -eq $script:cenaQuandoAbriu -and $agoraC -ne $alvo) { $null = ObsWs @(@{ t = 'SetCurrentProgramScene'; d = @{ sceneName = $alvo } }) }
    } catch {}
  }
  # clipes de abates do Valorant para o BRB: só com Valorant aberto, ao vivo E gravando (os cortes saem da gravação)
  if ($aoVivoOn -and $jogo -eq 'valorant' -and $vivo -and $grav) { if (-not (ProcRodando $clipPid)) { ProcIniciar (Join-Path $PASTA_VAL '_analisador\clipes_ao_vivo.py') $clipPid } } elseif (Test-Path $clipPid) { ProcParar $clipPid }
  # informa aos leitores onde está a gravação e quando começou (para cortar dela enquanto grava)
  if ($grav) { try { $dirG = [string](ObsWs @(@{ t = 'GetRecordDirectory' }))[0].responseData.recordDirectory; $ini = [DateTimeOffset]::Now.ToUnixTimeSeconds() - [math]::Round($durMs / 1000); [IO.File]::WriteAllText($gravAtualF, (@{ pasta = $dirG; inicio = $ini } | ConvertTo-Json -Compress), [Text.Encoding]::UTF8) } catch {} }
  # linha do tempo da gravação (qual jogo em cada trecho). As gravações "por jogo" já têm o próprio fluxo.
  if (Test-Path (Join-Path $aqui 'gravando_jogo.txt')) { return }
  $sess = $null; if (Test-Path $sessF) { try { $sess = [IO.File]::ReadAllText($sessF) | ConvertFrom-Json } catch {} }
  $agora = [DateTimeOffset]::Now.ToUnixTimeSeconds()
  if ($grav -and -not $sess) {
    $dir = ''; try { $dir = [string](ObsWs @(@{ t = 'GetRecordDirectory' }))[0].responseData.recordDirectory } catch {}
    $sess = [pscustomobject]@{ inicio = [math]::Round($agora - $durMs / 1000); pasta = $dir; linha = @([pscustomobject]@{ t = [math]::Round($durMs / 1000); jogo = $jogo }) }
    [IO.File]::WriteAllText($sessF, ($sess | ConvertTo-Json -Depth 5), [Text.Encoding]::UTF8); return
  }
  if ($grav -and $sess) {
    $ult = @($sess.linha)[-1]
    if ($ult.jogo -ne $jogo) { $sess.linha = @($sess.linha) + [pscustomobject]@{ t = $agora - $sess.inicio; jogo = $jogo }; [IO.File]::WriteAllText($sessF, ($sess | ConvertTo-Json -Depth 5), [Text.Encoding]::UTF8) }
    return
  }
  if (-not $grav -and $sess) {
    # gravação terminou: guarda a linha do tempo e manda dividir por jogo (cada trecho vai para o seu analisador)
    $sess | Add-Member -NotePropertyName fim -NotePropertyValue ($agora - $sess.inicio) -Force
    $usouJogo = @($sess.linha | Where-Object { $_.jogo }).Count -gt 0
    if ($usouJogo -and $sess.pasta) {
      $tl = Join-Path $sess.pasta ('linha-do-tempo ' + (Get-Date -f 'yyyy-MM-dd HH-mm-ss') + '.json')
      [IO.File]::WriteAllText($tl, ($sess | ConvertTo-Json -Depth 5), [Text.Encoding]::UTF8)
      $div = Join-Path $PASTA_LIVES '_dividir\dividir_live.py'
      $py = (PyDe $false)
      if ($py -and (Test-Path $div)) { Start-Process cmd.exe -WindowStyle Minimized -ArgumentList ('/c timeout /t 20 /nobreak >nul & "' + $py + '" "' + $div + '" "' + $tl + '"') }
    }
    Remove-Item $sessF -Force -ErrorAction SilentlyContinue
  }
}

$tarefa = $null
while ($http.IsListening) {
  if (-not $tarefa) { $tarefa = $http.GetContextAsync() }
  if (-not $tarefa.Wait(5000)) { try { Tique } catch { try { Set-Content -Path (Join-Path $aqui 'tique_erro.txt') -Value ((Get-Date -f 'HH:mm:ss') + ' ' + $_.Exception.Message + ' (linha ' + $_.InvocationInfo.ScriptLineNumber + ')') } catch {} }; continue }
  $ctx = $tarefa.Result; $tarefa = $null
  try { Tique } catch { try { Set-Content -Path (Join-Path $aqui 'tique_erro.txt') -Value ((Get-Date -f 'HH:mm:ss') + ' ' + $_.Exception.Message + ' (linha ' + $_.InvocationInfo.ScriptLineNumber + ')') } catch {} }
  try {
    $q = $ctx.Request.QueryString
    "$(Get-Date -f HH:mm:ss) $($ctx.Request.Url.AbsolutePath)" | Out-Host
    $cam = $ctx.Request.Url.AbsolutePath
    try { BackupSeVencido } catch {}
    # páginas do app (só para este PC: confere o Host; sem liberar para outros sites)
    if ($cam -like '/app/*' -or $cam -like '/fundos/*') {
      $hostOk = $ctx.Request.Headers['Host'] -eq "localhost:$porta"
      $nome = [IO.Path]::GetFileName([Uri]::UnescapeDataString($cam))
      $permitidos = @{ 'Central.html' = 'text/html; charset=utf-8'; 'icone.png' = 'image/png'; 'icone192.png' = 'image/png'; 'icone512.png' = 'image/png'; 'central.ico' = 'image/x-icon'; 'manifest.json' = 'application/manifest+json'; 'exemplo-jogo.jpg' = 'image/jpeg' }
      if ($cam -like '/fundos/*') { $arq = Join-Path (Split-Path $aqui -Parent) ('fundos\' + $nome); $tipo = if ($nome -like '*.png') { 'image/png' } else { 'image/jpeg' }; $ok = $nome -match '^[\w-]+\.(jpg|png)$' }
      else { $arq = Join-Path $aqui $nome; $tipo = $permitidos[$nome]; $ok = [bool]$tipo }
      if (-not $hostOk -or -not $ok -or -not (Test-Path -LiteralPath $arq)) { $ctx.Response.StatusCode = 404; $ctx.Response.Close(); continue }
      $bytes = [IO.File]::ReadAllBytes($arq)
      if ($nome -eq 'Central.html') { $txt = [Text.Encoding]::UTF8.GetString($bytes).Replace('<head>', "<head><script>window.AJUDANTE_CHAVE='$chave';</script>"); $bytes = [Text.Encoding]::UTF8.GetBytes($txt) }
      $r = $ctx.Response; $r.StatusCode = 200; $r.ContentType = $tipo; $r.Headers['Cache-Control'] = 'no-store'; $r.OutputStream.Write($bytes, 0, $bytes.Length); $r.Close(); continue
    }
    if ($cam -eq '/mal/retorno') {
      $h = MalLer; $msg = ''
      if (-not $h['estado'] -or $q['state'] -ne $h['estado']) { $msg = 'Pedido inválido. Tente conectar de novo pela Central.' }
      elseif ($q['error']) { $msg = 'Autorização cancelada no MyAnimeList.' }
      else {
        try { $h = MalToken $h ('client_id=' + $h['cid'] + '&grant_type=authorization_code&code=' + [Uri]::EscapeDataString($q['code']) + '&code_verifier=' + $h['verif'] + '&redirect_uri=' + [Uri]::EscapeDataString($malRedirect)); $h.Remove('estado'); $h.Remove('verif'); MalGravar $h; $msg = 'Pronto! A Central está conectada ao seu MyAnimeList. Pode fechar esta janela.' }
        catch { $msg = 'Não consegui completar a conexão: ' + $_.Exception.Message }
      }
      $html = '<!doctype html><meta charset="utf-8"><title>Central</title><body style="font-family:system-ui;background:#100E2B;color:#F3F1FF;display:grid;place-items:center;height:100vh;margin:0"><h2 style="max-width:640px;text-align:center">' + [Net.WebUtility]::HtmlEncode($msg) + '</h2></body>'
      $b = [Text.Encoding]::UTF8.GetBytes($html); $r = $ctx.Response; $r.ContentType = 'text/html; charset=utf-8'; $r.OutputStream.Write($b, 0, $b.Length); $r.Close(); continue
    }
    if ($q['k'] -ne $chave) { Responder $ctx 403 'text/plain' ([Text.Encoding]::UTF8.GetBytes('chave')); continue }
    switch ($ctx.Request.Url.AbsolutePath) {
      '/apps'  { Json $ctx @{ apps = @(Lista $atalhos $true); pastas = @(Lista $base $false) } }
      '/icone' { $it = Achar $q['f']; $png = if ($it) { IconeDe $it } else { $null }; if ($png) { Responder $ctx 200 'image/png' $png } else { Responder $ctx 404 'text/plain' ([byte[]]@()) } }
      '/abrir' { $it = Achar $q['f']; if ($it) { (New-Object -ComObject Shell.Application).ShellExecute($it.FullName); Json $ctx @{ ok = $true } } else { Responder $ctx 404 'text/plain' ([byte[]]@()) } }
      '/ps5' {
        # só lê a pasta de troféus do PS5 da casa (web file manager do jailbreak)
        $pp = [string]$q['path']
        if (-not $pp.StartsWith('/user/home/13b5b6f1/trophy2/') -or $pp.Contains('..')) { Responder $ctx 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('caminho')); continue }
        $wc = New-Object System.Net.WebClient
        try {
          if ($q['tipo'] -eq 'fs') { $b = $wc.DownloadData('http://192.168.7.5:8888/fs?path=' + [Uri]::EscapeDataString($pp)); Responder $ctx 200 'application/octet-stream' $b }
          else { $b = $wc.DownloadData('http://192.168.7.5:8888/api/list?path=' + [Uri]::EscapeDataString($pp)); Responder $ctx 200 'application/json; charset=utf-8' $b }
        } catch { Responder $ctx 502 'text/plain' ([Text.Encoding]::UTF8.GetBytes('ps5: ' + $_.Exception.Message)) }
      }
      '/pc' {
        switch ($q['acao']) {
          'desligar'  { Start-Process shutdown.exe -ArgumentList '/s /t 5' -WindowStyle Hidden }
          'reiniciar' { Start-Process shutdown.exe -ArgumentList '/r /t 5' -WindowStyle Hidden }
          'travar'    { Start-Process rundll32.exe -ArgumentList 'user32.dll,LockWorkStation' }
          'dormir'    { Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false) }
          'agendar'   { $m = [int]$q['min']; if ($m -ge 1 -and $m -le 600) { Start-Process shutdown.exe -ArgumentList ('/s /t ' + ($m * 60)) -WindowStyle Hidden } }
          'cancelar'  { Start-Process shutdown.exe -ArgumentList '/a' -WindowStyle Hidden }
        }
        Json $ctx @{ ok = $true }
      }
      '/mal/config' {
        $cid = [string]$q['id']
        if ($cid -notmatch '^[0-9a-f]{20,64}$') { Responder $ctx 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('client id')); continue }
        $h = MalLer; $h['cid'] = $cid; MalGravar $h; Json $ctx @{ ok = $true }
      }
      '/mal/login' {
        $h = MalLer
        if (-not $h['cid']) { Responder $ctx 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('sem client id')); continue }
        $abc = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
        $h['verif'] = -join (1..96 | ForEach-Object { $abc[(Get-Random -Maximum $abc.Length)] }); $h['estado'] = -join (1..24 | ForEach-Object { $abc[(Get-Random -Maximum 62)] }); MalGravar $h
        $url = 'https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=' + $h['cid'] + '&code_challenge=' + $h['verif'] + '&code_challenge_method=plain&state=' + $h['estado'] + '&redirect_uri=' + [Uri]::EscapeDataString($malRedirect)
        $r = $ctx.Response; $r.StatusCode = 302; $r.RedirectLocation = $url; $r.Close()
      }
      '/jikan' {
        # onde assistir (lista de streaming do MAL, pela API pública Jikan): só o número do anime
        $idA = [string]$q['id']; if ($idA -notmatch '^\d{1,7}$') { Responder $ctx 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('id')); continue }
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $wc = New-Object System.Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
        $wc.Headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CentralDoDaniel/1.0'; $wc.Headers['Accept'] = 'application/json'
        try { $txt = $wc.DownloadString('https://api.jikan.moe/v4/anime/' + $idA + '/streaming'); Responder $ctx 200 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($txt)) }
        catch {
          $ex = $_.Exception; while ($ex.InnerException -and -not ($ex -is [Net.WebException])) { $ex = $ex.InnerException }
          $cod = 502; try { if ($ex.Response) { $cod = [int]$ex.Response.StatusCode } } catch {}
          if ($cod -lt 400) { $cod = 502 }
          Responder $ctx $cod 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes([string]$ex.Message))
        }
      }
      '/mal/status' { $h = MalLer; $nome = ''; if ($h['access']) { try { $nome = (MalChamar 'GET' '/v2/users/@me' '' | ConvertFrom-Json).name } catch { $nome = '' } }; Json $ctx @{ cid = [bool]$h['cid']; conectado = [bool]$nome; usuario = $nome } }
      '/mal/sair' { $h = MalLer; $h.Remove('access'); $h.Remove('refresh'); MalGravar $h; Json $ctx @{ ok = $true } }
      '/mal/api' {
        $c2 = [string]$q['caminho']; $m2 = ([string]$q['metodo']).ToUpper(); if (-not $m2) { $m2 = 'GET' }
        if (-not $c2.StartsWith('/v2/') -or $m2 -notin 'GET', 'PATCH', 'DELETE') { Responder $ctx 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('caminho')); continue }
        try { $txt = MalChamar $m2 $c2 ([string]$q['corpo']); if (-not $txt) { $txt = '{}' }; Responder $ctx 200 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($txt)) }
        catch { Responder $ctx 502 'text/plain' ([Text.Encoding]::UTF8.GetBytes('mal: ' + $_.Exception.Message)) }
      }
      '/obs/cenas' {
        $oc = ObsColecao
        if (-not $oc) { Responder $ctx 404 'text/plain' ([Text.Encoding]::UTF8.GetBytes('obs')); continue }
        $meta = @{ arquivo = $oc.arquivo; nome = $oc.nome; cx = $oc.cx; cy = $oc.cy; aberto = [bool](Get-Process obs64 -ErrorAction SilentlyContinue); mudou = $oc.mudou } | ConvertTo-Json -Compress
        Responder $ctx 200 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes('{"meta":' + $meta + ',"colecao":' + $oc.txt + '}'))
      }
      '/clipes/lista' { Responder $ctx 200 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @(ClipesLista) -Depth 6 -Compress))) }
      '/clipes/video' { $f = ClipeArq $q['r'] $q['pasta'] $q['arq']; if ($f) { MandarVideo $ctx $f } else { Responder $ctx 404 'text/plain' ([Text.Encoding]::UTF8.GetBytes('clipe')) } }
      '/clipes/manter' {
        $f = ClipeArq $q['r'] $q['pasta'] $q['arq']; if (-not $f) { Json $ctx @{ ok = $false; msg = 'clipe não encontrado' }; continue }
        $d = Split-Path $f -Parent; $L = @(RevisaoLer $d | Where-Object { $_ -ne $q['arq'] }); if ($q['v'] -eq '1') { $L += [string]$q['arq'] }
        RevisaoGravar $d $L; Json $ctx @{ ok = $true }
      }
      '/clipes/apagar' {
        # só a pedido (botão na Central): vai para a Lixeira, dá para recuperar
        $f = ClipeArq $q['r'] $q['pasta'] $q['arq']; if (-not $f) { Json $ctx @{ ok = $false; msg = 'clipe não encontrado' }; continue }
        try {
          Add-Type -AssemblyName Microsoft.VisualBasic
          [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($f, 'OnlyErrorDialogs', 'SendToRecycleBin')
          $d = Split-Path $f -Parent; RevisaoGravar $d @(RevisaoLer $d | Where-Object { $_ -ne $q['arq'] })
          "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') clipe para a Lixeira: $f" | Add-Content -LiteralPath (Join-Path $aqui 'clipes_apagados.log') -Encoding UTF8
          Json $ctx @{ ok = $true }
        } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/arquivo' {
        # só arquivos que a coleção de cenas do OBS usa (imagens e vídeos)
        $oc = ObsColecao; $p = ([string]$q['p']) -replace '/', '\'
        $lista = @([regex]::Matches($oc.txt, '"(?:file|local_file)"\s*:\s*"((?:[^"\\]|\\.)*)"') | ForEach-Object { ($_.Groups[1].Value -replace '\\\\', '\') -replace '/', '\' })
        $ext = [IO.Path]::GetExtension($p).ToLower()
        $tipos = @{ '.html' = 'text/html; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'; '.webp' = 'image/webp'; '.mp4' = 'video/mp4'; '.webm' = 'video/webm'; '.mov' = 'video/quicktime' }
        if (-not $oc -or -not ($lista -contains $p) -or -not $tipos[$ext] -or -not (Test-Path -LiteralPath $p)) { Responder $ctx 404 'text/plain' ([Text.Encoding]::UTF8.GetBytes('arquivo')); continue }
        Responder $ctx 200 $tipos[$ext] ([IO.File]::ReadAllBytes($p))
      }
      '/obs/estado' {
        if (-not (Get-Process obs64 -ErrorAction SilentlyContinue)) { Json $ctx @{ aberto = $false } }
        else {
          try {
            $r = ObsWs @(@{ t = 'GetCurrentProgramScene' }, @{ t = 'GetStreamStatus' }, @{ t = 'GetRecordStatus' }, @{ t = 'GetSceneList' })
            $cam = $null; try { $ci = @((ObsWs @(@{ t = 'GetSceneItemList'; d = @{ sceneName = $r[0].responseData.currentProgramSceneName } }))[0].responseData.sceneItems | Where-Object { $_.sourceName -in @('Camera', 'Webcam') }); if ($ci.Count) { $cam = [bool]$ci[0].sceneItemEnabled } } catch {}
            $amg = $null; try { $ra = (ObsWs @(@{ t = 'GetInputMute'; d = @{ inputName = 'Discord (amigos)' } }))[0]; if ($ra.requestStatus.result) { $amg = [bool]$ra.responseData.inputMuted } } catch {}
            Json $ctx @{ fonteModo = $script:fonteModo; fonteAtual = $script:fonteAplicada; amigosMudo = $amg; camera = $cam; aberto = $true; cena = $r[0].responseData.currentProgramSceneName; aoVivo = [bool]$r[1].responseData.outputActive; tempo = [string]$r[1].responseData.outputTimecode; gravando = [bool]$r[2].responseData.outputActive; tempoGrav = [string]$r[2].responseData.outputTimecode; cenas = @($r[3].responseData.scenes | ForEach-Object { $_.sceneName }) }
          } catch { Json $ctx @{ aberto = $true; erro = $_.Exception.Message } }
        }
      }
      '/obs/foto' {
        try { $r = ObsWs @(@{ t = 'GetSourceScreenshot'; d = @{ sourceName = [string]$q['cena']; imageFormat = 'jpg'; imageWidth = 1280; imageCompressionQuality = 75 } }); Json $ctx @{ ok = [bool]$r[0].requestStatus.result; img = [string]$r[0].responseData.imageData; msg = [string]$r[0].requestStatus.comment } }
        catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/gravar' {
        # gravar sem stream, por jogo: cada jogo grava na sua pasta; ao parar, o analisador daquele jogo roda sozinho
        $pastaGrav = 'F:\Grava' + [char]0x00E7 + [char]0x00F5 + 'es da Stream'
        $cenaSo = 'S' + [char]0x00F3 + ' grava' + [char]0x00E7 + [char]0x00E3 + 'o'
        $jogos = @{ sf6 = @{ pasta = (Join-Path $pastaGrav ('Grava' + [char]0x00E7 + [char]0x00E3 + 'o SF6')); bat = 'Analisar partidas.bat'; nome = 'Street Fighter 6' };
                    valorant = @{ pasta = (Join-Path $pastaGrav ('Grava' + [char]0x00E7 + [char]0x00E3 + 'o Valorant')); bat = 'Cortar Valorant.bat'; nome = 'Valorant' };
                    outro = @{ pasta = (Join-Path $pastaGrav $cenaSo); bat = ''; nome = 'outro jogo' } }
        $estF = Join-Path $aqui 'gravando_jogo.txt'
        try {
          if ($q['acao'] -eq 'jogo' -or $q['acao'] -eq 'so_jogo') {
            $jg = [string]$q['jogo']; if (-not $jogos.ContainsKey($jg)) { $jg = 'outro' }
            $J = $jogos[$jg]; New-Item -ItemType Directory -Force -Path $J.pasta | Out-Null
            $st = ObsWs @(@{ t = 'GetStreamStatus' })
            $ped = @(); if (-not $st[0].responseData.outputActive) { $ped += @{ t = 'SetCurrentProgramScene'; d = @{ sceneName = $cenaSo } } }
            $ped += @{ t = 'SetRecordDirectory'; d = @{ recordDirectory = $J.pasta } }; $ped += @{ t = 'StartRecord' }
            $r = ObsWs $ped
            $ok = [bool]$r[$r.Count - 1].requestStatus.result
            if ($ok) { Set-Content -Path $estF -Value $jg -Encoding UTF8 }
            Json $ctx @{ ok = $ok; jogo = $J.nome; msg = (@($r | ForEach-Object { $_.requestStatus.comment }) -join ' ') }
          } elseif ($q['acao'] -eq 'parar') {
            $r = ObsWs @(@{ t = 'StopRecord' }, @{ t = 'SetRecordDirectory'; d = @{ recordDirectory = $pastaGrav } })
            $jg = ''; if (Test-Path $estF) { $jg = (Get-Content $estF -Raw).Trim(); Remove-Item $estF -Force }
            $analise = ''
            if ($jg -and $jogos.ContainsKey($jg) -and $jogos[$jg].bat) {
              $J = $jogos[$jg]
              # espera o OBS fechar o arquivo e roda o analisador minimizado (ele pula gravações com menos de 1 min sem mexer)
              Start-Process cmd.exe -WorkingDirectory $J.pasta -WindowStyle Minimized -ArgumentList ('/c timeout /t 75 /nobreak >nul & call "' + $J.bat + '" auto')
              $analise = $J.nome
            }
            Json $ctx @{ ok = [bool]$r[0].requestStatus.result; analise = $analise; arquivo = [string]$r[0].responseData.outputPath; msg = [string]$r[0].requestStatus.comment }
          } elseif ($q['acao'] -eq 'qual') {
            $jg = ''; if (Test-Path $estF) { $jg = (Get-Content $estF -Raw).Trim() }; Json $ctx @{ ok = $true; jogo = $jg }
          } else { Json $ctx @{ ok = $false; msg = 'acao' } }
        } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/encerrar' {
        # encerrar a live: vai para a cena "End" e para tudo depois de N minutos (padrão 3)
        try {
          if ($q['acao'] -eq 'iniciar') {
            $min = 3; if ($q['min']) { $min = [double]$q['min'] }
            $null = ObsWs @(@{ t = 'SetCurrentProgramScene'; d = @{ sceneName = 'End' } })
            $quando = [DateTimeOffset]::Now.ToUnixTimeSeconds() + [math]::Round($min * 60); Set-Content -Path $encF -Value $quando
            Json $ctx @{ ok = $true; em = $quando }
          } elseif ($q['acao'] -eq 'cancelar') { if (Test-Path $encF) { Remove-Item $encF -Force }; Json $ctx @{ ok = $true }
          } elseif ($q['acao'] -eq 'ja') { if (Test-Path $encF) { Remove-Item $encF -Force }; $r = ObsWs @(@{ t = 'StopStream' }, @{ t = 'StopRecord' }); Json $ctx @{ ok = $true }
          } else { Json $ctx @{ ok = $false; msg = 'acao' } }
        } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/cortar' {
        # botão "Cortar" da Central: pega a gravação mais recente, põe na pasta do jogo e roda o cortador
        $jg = [string]$q['jogo']; $pg = Join-Path $SCR 'pos_gravacao.py'; $py = (PyDe $false)
        if ($jg -notin @('sf6', 'valorant')) { Json $ctx @{ ok = $false; msg = 'jogo' }; continue }
        if (-not $py -or -not (Test-Path $pg)) { Json $ctx @{ ok = $false; msg = 'Python ou pos_gravacao.py não encontrado (rode o Instalar ferramentas.bat)' }; continue }
        Start-Process $py -WindowStyle Minimized -ArgumentList ('"' + $pg + '" "' + $jg + '"'); Json $ctx @{ ok = $true }
      }
      '/obs/marcar' {
        $py = (PyDe $true); $sc = Join-Path $SCR 'atalho_momento.py'
        if ($py -and (Test-Path $sc)) { Start-Process $py -ArgumentList ('"' + $sc + '" --agora') -WindowStyle Hidden; Json $ctx @{ ok = $true } } else { Json $ctx @{ ok = $false; msg = 'Python ou o script não encontrado' } }
      }
      '/obs/config' {
        $c = CfgStream
        if ($q['tecla']) { $c.tecla = ([string]$q['tecla']).ToUpper(); CfgStreamGravar $c; ProcParar $atalhoPid }
        if ($q['auto']) { $c.autoCena = ($q['auto'] -eq '1'); CfgStreamGravar $c }
        $em = $null; if (Test-Path $encF) { $em = [double](Get-Content $encF -Raw) }
        Json $ctx @{ tecla = $c.tecla; autoCena = [bool]$c.autoCena; cenas = $c.cenas; encerrarEm = $em }
      }
      '/obs/captura-jogo' { try { if (Test-Path $capOkF) { Remove-Item $capOkF -Force }; Json $ctx @{ ok = $true; log = @(CapturaJogo) } } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } } }
      '/obs/fonte' {
        # imagem do jogo nas cenas: auto (o jogo aberto por último) ou fixa (valorant, sf6, ps5, tela)
        $m = [string]$q['modo']
        if ($m -in @('auto', 'valorant', 'sf6', 'ps5', 'tela')) { $script:fonteModo = $m; $alvoF = $m; if ($m -eq 'auto') { $alvoF = JogoAlvo }; try { FonteAplicar $alvoF } catch {} }
        Json $ctx @{ ok = $true; modo = $script:fonteModo; atual = $script:fonteAplicada }
      }
      '/obs/camadas' {
        # camadas da cena no ar (para mostrar/ocultar) e as fontes de som com mudo/ligado
        try {
          $cena = [string](ObsWs @(@{ t = 'GetCurrentProgramScene' }))[0].responseData.currentProgramSceneName
          $its = @((ObsWs @(@{ t = 'GetSceneItemList'; d = @{ sceneName = $cena } }))[0].responseData.sceneItems)
          $audK = @('wasapi_input_capture', 'wasapi_output_capture', 'wasapi_process_output_capture', 'coreaudio_input_capture', 'pulse_input_capture')
          $vis = @($its | Where-Object { $audK -notcontains $_.inputKind } | ForEach-Object { @{ id = [int]$_.sceneItemId; nome = [string]$_.sourceName; on = [bool]$_.sceneItemEnabled } })
          $aud = @($its | Where-Object { $audK -contains $_.inputKind -and $_.sceneItemEnabled } | ForEach-Object { [string]$_.sourceName })
          $sons = @()
          if ($aud.Count) { $rm = ObsWs @($aud | ForEach-Object { @{ t = 'GetInputMute'; d = @{ inputName = $_ } } }); for ($i = 0; $i -lt $aud.Count; $i++) { $sons += @{ nome = $aud[$i]; mudo = [bool]$rm[$i].responseData.inputMuted } } }
          [array]::Reverse($vis)
          Responder $ctx 200 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @{ ok = $true; cena = $cena; camadas = @($vis); sons = @($sons) } -Depth 5 -Compress)))
        } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/camada' {
        try {
          $cena = [string](ObsWs @(@{ t = 'GetCurrentProgramScene' }))[0].responseData.currentProgramSceneName
          $r = (ObsWs @(@{ t = 'SetSceneItemEnabled'; d = @{ sceneName = $cena; sceneItemId = [int]$q['id']; sceneItemEnabled = ($q['on'] -eq '1') } }))[0]
          Json $ctx @{ ok = [bool]$r.requestStatus.result; msg = [string]$r.requestStatus.comment }
        } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/mudo' {
        try { $r = (ObsWs @(@{ t = 'ToggleInputMute'; d = @{ inputName = [string]$q['fonte'] } }))[0]; Json $ctx @{ ok = [bool]$r.requestStatus.result; mudo = [bool]$r.responseData.inputMuted; msg = [string]$r.requestStatus.comment } }
        catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/ps5cheats' {
        # acao=teste: refaz o teste de acesso ao CheatRunner
        try { CrTeste; Json $ctx @{ ok = $true } } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/amigos' {
        # liga/desliga o som do Discord (fonte "Discord (amigos)") na live e na gravação
        try {
          $r = (ObsWs @(@{ t = 'ToggleInputMute'; d = @{ inputName = 'Discord (amigos)' } }))[0]
          if ($r.requestStatus.result) { Json $ctx @{ ok = $true; mudo = [bool]$r.responseData.inputMuted } } else { Json $ctx @{ ok = $false; msg = 'Não achei a fonte "Discord (amigos)" no OBS.' } }
        } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/camera' {
        # mostra/oculta a câmera (Webcam, Moldura e o grupo Camera) na cena que está no ar
        try {
          $cena = [string](ObsWs @(@{ t = 'GetCurrentProgramScene' }))[0].responseData.currentProgramSceneName
          $its = @((ObsWs @(@{ t = 'GetSceneItemList'; d = @{ sceneName = $cena } }))[0].responseData.sceneItems | Where-Object { $_.sourceName -in @('Camera', 'Webcam', ('Moldura da c' + [char]0x00E2 + 'mera')) })
          if (-not $its.Count) { Json $ctx @{ ok = $false; msg = 'Esta cena não tem câmera.' } }
          else {
            $vis = -not [bool]$its[0].sceneItemEnabled; if ($q['acao'] -eq 'mostrar') { $vis = $true } elseif ($q['acao'] -eq 'ocultar') { $vis = $false }
            $ped = @($its | ForEach-Object { @{ t = 'SetSceneItemEnabled'; d = @{ sceneName = $cena; sceneItemId = [int]$_.sceneItemId; sceneItemEnabled = $vis } } })
            $null = ObsWs $ped; Json $ctx @{ ok = $true; camera = $vis; cena = $cena }
          }
        } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/audio-padrao' {
        # o "Yeti Mic" e o "PC" apontavam para aparelhos do PC antigo: passam a usar o microfone e o som padrão do Windows
        try { $r = ObsWs @(@{ t = 'SetInputSettings'; d = @{ inputName = 'Yeti Mic'; inputSettings = @{ device_id = 'default' } } }, @{ t = 'SetInputSettings'; d = @{ inputName = 'PC'; inputSettings = @{ device_id = 'default' } } })
          Json $ctx @{ ok = ([bool]$r[0].requestStatus.result -and [bool]$r[1].requestStatus.result); msg = (@($r | ForEach-Object { $_.requestStatus.comment }) -join ' ') } }
        catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/jogo' { Json $ctx @{ jogo = (JogoAtual); placar = (LeitorRodando); sessao = (Test-Path $sessF) } }
      '/obs/stream' {
        # Stream + gravar: live e gravação juntas (a gravação vai para "Lives" e depois é dividida por jogo)
        try {
          if ($q['acao'] -eq 'iniciar') {
            New-Item -ItemType Directory -Force -Path $PASTA_LIVES | Out-Null
            # usa a cena que estiver no ar (Main Right / Jogos de Luta com câmera, Só gravação só o jogo)
            $r = ObsWs @(@{ t = 'SetRecordDirectory'; d = @{ recordDirectory = $PASTA_LIVES } }, @{ t = 'StartRecord' }, @{ t = 'StartStream' })
            Json $ctx @{ ok = [bool]$r[2].requestStatus.result; msg = (@($r | ForEach-Object { $_.requestStatus.comment }) -join ' ') }
          } elseif ($q['acao'] -eq 'parar') {
            $r = ObsWs @(@{ t = 'StopStream' }, @{ t = 'StopRecord' })
            Json $ctx @{ ok = [bool]$r[0].requestStatus.result -or [bool]$r[1].requestStatus.result; msg = (@($r | ForEach-Object { $_.requestStatus.comment }) -join ' ') }
          } else { Json $ctx @{ ok = $false; msg = 'acao' } }
        } catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/obs/foto-fonte' {
        # imagem de uma fonte do OBS (ex.: "Jogo: Street Fighter 6") em JPEG, para os leitores ao vivo lerem o jogo e não o monitor
        try {
          $w = 1280; if ($q['w']) { $w = [int]$q['w'] }
          $r = ObsWs @(@{ t = 'GetSourceScreenshot'; d = @{ sourceName = [string]$q['nome']; imageFormat = 'jpg'; imageWidth = $w; imageCompressionQuality = 85 } })
          $b64 = [string]$r[0].responseData.imageData
          if (-not $b64) { Responder $ctx 404 'text/plain' ([Text.Encoding]::UTF8.GetBytes([string]$r[0].requestStatus.comment)); continue }
          Responder $ctx 200 'image/jpeg' ([Convert]::FromBase64String($b64.Substring($b64.IndexOf(',') + 1)))
        } catch { Responder $ctx 500 'text/plain' ([Text.Encoding]::UTF8.GetBytes($_.Exception.Message)) }
      }
      '/obs/cena' {
        try { $r = ObsWs @(@{ t = 'SetCurrentProgramScene'; d = @{ sceneName = [string]$q['nome'] } }); Json $ctx @{ ok = [bool]$r[0].requestStatus.result; msg = [string]$r[0].requestStatus.comment } }
        catch { Json $ctx @{ ok = $false; msg = $_.Exception.Message } }
      }
      '/saude' {
        $discos = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { @{ letra = $_.DeviceID; nome = $_.VolumeName; total = [math]::Round($_.Size / 1GB, 1); livre = [math]::Round($_.FreeSpace / 1GB, 1) } })
        $os = Get-CimInstance Win32_OperatingSystem
        $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        $gpu = $null
        $nv = Get-Command nvidia-smi -ErrorAction SilentlyContinue
        if (-not $nv -and (Test-Path 'C:\Windows\System32\nvidia-smi.exe')) { $nv = 'C:\Windows\System32\nvidia-smi.exe' }
        if ($nv) { try { $l = (& $nv --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits | Select-Object -First 1) -split ',\s*'; $gpu = @{ nome = $l[0]; temp = [int]$l[1]; uso = [int]$l[2]; memUsada = [int]$l[3]; memTotal = [int]$l[4] } } catch {} }
        $ligado = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
        Json $ctx @{ discos = $discos; memTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1); memLivre = [math]::Round($os.FreePhysicalMemory / 1MB, 1); cpu = [int]$cpu; gpu = $gpu; horasLigado = $ligado }
      }
      '/sair'  { Json $ctx @{ ok = $true }; $http.Stop(); break }
      '/reiniciar' { Json $ctx @{ ok = $true }; $http.Stop(); Start-Process powershell -WindowStyle Hidden -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '"'); break }
      '/icone-app' {
        if ($q['padrao'] -eq '1') { TrocarIcone $null } else {
          $ms = New-Object IO.MemoryStream; $ctx.Request.InputStream.CopyTo($ms); $b = $ms.ToArray()
          if ($b.Length -lt 100 -or $b[0] -ne 0x89) { Responder $ctx 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('png')); continue }
          TrocarIcone $b
        }
        Json $ctx @{ ok = $true } }
      '/pasta' { (New-Object -ComObject Shell.Application).Open($base); Json $ctx @{ ok = $true } }
      default  { Json $ctx @{ ok = $true; versao = 39 } }
    }
  } catch { try { Responder $ctx 500 'text/plain' ([Text.Encoding]::UTF8.GetBytes($_.Exception.Message)) } catch {} }
}
