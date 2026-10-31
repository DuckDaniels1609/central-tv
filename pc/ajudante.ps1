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
    if ($q['k'] -ne $chave) { Responder $ctx 403 'text/plain' ([Text.Encoding]::UTF8.GetBytes('chave')); continue }
    switch ($ctx.Request.Url.AbsolutePath) {
      '/apps'  { Json $ctx @{ apps = @(Lista $atalhos $true); pastas = @(Lista $base $false) } }
      '/icone' { $it = Achar $q['f']; $png = if ($it) { IconeDe $it } else { $null }; if ($png) { Responder $ctx 200 'image/png' $png } else { Responder $ctx 404 'text/plain' ([byte[]]@()) } }
      '/abrir' { $it = Achar $q['f']; if ($it) { (New-Object -ComObject Shell.Application).ShellExecute($it.FullName); Json $ctx @{ ok = $true } } else { Responder $ctx 404 'text/plain' ([byte[]]@()) } }
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
      default  { Json $ctx @{ ok = $true; versao = 4 } }
    }
  } catch { try { Responder $ctx 500 'text/plain' ([Text.Encoding]::UTF8.GetBytes($_.Exception.Message)) } catch {} }
}
