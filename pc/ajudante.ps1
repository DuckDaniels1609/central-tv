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

while ($http.IsListening) {
  $ctx = $http.GetContext()
  try {
    $q = $ctx.Request.QueryString
    "$(Get-Date -f HH:mm:ss) $($ctx.Request.Url.AbsolutePath)" | Out-Host
    $cam = $ctx.Request.Url.AbsolutePath
    # páginas do app (só para este PC: confere o Host; sem liberar para outros sites)
    if ($cam -like '/app/*' -or $cam -like '/fundos/*') {
      $hostOk = $ctx.Request.Headers['Host'] -eq "localhost:$porta"
      $nome = [IO.Path]::GetFileName([Uri]::UnescapeDataString($cam))
      $permitidos = @{ 'Central.html' = 'text/html; charset=utf-8'; 'icone.png' = 'image/png'; 'icone192.png' = 'image/png'; 'icone512.png' = 'image/png'; 'central.ico' = 'image/x-icon'; 'manifest.json' = 'application/manifest+json' }
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
      '/mal/status' { $h = MalLer; $nome = ''; if ($h['access']) { try { $nome = (MalChamar 'GET' '/v2/users/@me' '' | ConvertFrom-Json).name } catch { $nome = '' } }; Json $ctx @{ cid = [bool]$h['cid']; conectado = [bool]$nome; usuario = $nome } }
      '/mal/sair' { $h = MalLer; $h.Remove('access'); $h.Remove('refresh'); MalGravar $h; Json $ctx @{ ok = $true } }
      '/mal/api' {
        $c2 = [string]$q['caminho']; $m2 = ([string]$q['metodo']).ToUpper(); if (-not $m2) { $m2 = 'GET' }
        if (-not $c2.StartsWith('/v2/') -or $m2 -notin 'GET', 'PATCH', 'DELETE') { Responder $ctx 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('caminho')); continue }
        try { $txt = MalChamar $m2 $c2 ([string]$q['corpo']); if (-not $txt) { $txt = '{}' }; Responder $ctx 200 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($txt)) }
        catch { Responder $ctx 502 'text/plain' ([Text.Encoding]::UTF8.GetBytes('mal: ' + $_.Exception.Message)) }
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
      default  { Json $ctx @{ ok = $true; versao = 7 } }
    }
  } catch { try { Responder $ctx 500 'text/plain' ([Text.Encoding]::UTF8.GetBytes($_.Exception.Message)) } catch {} }
}
