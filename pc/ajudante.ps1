# Ajudante da Central no PC: abre os programas e pastas que estão em
# "Área de trabalho antiga" (na Área de Trabalho). Só aceita pedidos deste PC
# (localhost) e com a chave gerada aqui. Não abre nada fora dessa pasta.
$ErrorActionPreference = 'Stop'
$aqui0 = Split-Path -Parent $MyInvocation.MyCommand.Path
try { Start-Transcript -Path (Join-Path $aqui0 'ajudante_log.txt') -Force | Out-Null } catch {}
trap { "ERRO: $($_.Exception.Message) (linha $($_.InvocationInfo.ScriptLineNumber))" | Out-File -FilePath (Join-Path $aqui0 'ajudante_erro.txt') -Encoding UTF8; break }
$porta = 47801
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$mesa = [Environment]::GetFolderPath('Desktop')
$base = Join-Path $mesa ([string][char]0x00C1 + 'rea de trabalho antiga')
$atalhos = Join-Path $base 'Atalhos'
New-Item -ItemType Directory -Force -Path $atalhos | Out-Null
Add-Type -AssemblyName System.Drawing

# chave nova a cada início; a página lê pelo arquivo ao lado dela
$chave = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
Set-Content -Path (Join-Path $aqui 'ajudante_chave.js') -Value "window.AJUDANTE_CHAVE='$chave';" -Encoding UTF8

$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$porta/")
try { $http.Start() } catch { "porta ocupada: $($_.Exception.Message)" | Out-File (Join-Path $aqui 'ajudante_erro.txt') -Encoding UTF8; exit 0 }

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

while ($http.IsListening) {
  $ctx = $http.GetContext()
  try {
    $q = $ctx.Request.QueryString
    "$(Get-Date -f HH:mm:ss) $($ctx.Request.Url.AbsolutePath)" | Out-Host
    if ($q['k'] -ne $chave) { Responder $ctx 403 'text/plain' ([Text.Encoding]::UTF8.GetBytes('chave')); continue }
    switch ($ctx.Request.Url.AbsolutePath) {
      '/apps'  { Json $ctx @{ apps = @(Lista $atalhos $true); pastas = @(Lista $base $false) } }
      '/icone' { $it = Achar $q['f']; $png = if ($it) { IconeDe $it } else { $null }; if ($png) { Responder $ctx 200 'image/png' $png } else { Responder $ctx 404 'text/plain' ([byte[]]@()) } }
      '/abrir' { $it = Achar $q['f']; if ($it) { (New-Object -ComObject Shell.Application).ShellExecute($it.FullName); Json $ctx @{ ok = $true } } else { Responder $ctx 404 'text/plain' ([byte[]]@()) } }
      '/sair'  { Json $ctx @{ ok = $true }; $http.Stop(); break }
      '/pasta' { (New-Object -ComObject Shell.Application).Open($base); Json $ctx @{ ok = $true } }
      default  { Json $ctx @{ ok = $true; versao = 1 } }
    }
  } catch { try { Responder $ctx 500 'text/plain' ([Text.Encoding]::UTF8.GetBytes($_.Exception.Message)) } catch {} }
}
