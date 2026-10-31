# Backup da Central: junta o que só existe neste PC num .zip com data.
# Contém chaves (GitHub, SmartThings, certificado Samsung): guarde só em lugar privado.
$ErrorActionPreference = 'Continue'
$hoje = Get-Date -Format 'yyyy-MM-dd_HHmm'
$tv = 'F:\PS5\Ferramentas\tv'
$destBase = if ($env:OneDrive -and (Test-Path $env:OneDrive)) { Join-Path $env:OneDrive 'Backup da Central' } else { 'F:\Backups\Central' }
New-Item -ItemType Directory -Force -Path $destBase | Out-Null
$tmp = Join-Path $env:TEMP ('central_backup_' + $hoje)
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
Write-Host 'Copiando a pasta da TV e do app do PC...'
robocopy $tv (Join-Path $tmp 'tv') /E /R:1 /W:1 /NFL /NDL /NJH /NJS /XD 'backup_antes_online' | Out-Null
$cert = Join-Path $env:USERPROFILE 'SamsungCertificate'
if (Test-Path $cert) { Write-Host 'Copiando o certificado Samsung...'; robocopy $cert (Join-Path $tmp 'SamsungCertificate') /E /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null }
foreach ($p in @('C:\tizen-studio-data\profile', (Join-Path $env:USERPROFILE 'tizen-studio-data\profile'))) { if (Test-Path $p) { robocopy $p (Join-Path $tmp 'tizen-profile') /E /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null } }
$mesa = [Environment]::GetFolderPath('Desktop')
$atalhos = Join-Path $mesa ([string][char]0x00C1 + 'rea de trabalho antiga\Atalhos')
if (Test-Path $atalhos) { robocopy $atalhos (Join-Path $tmp 'Atalhos') /E /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null }
@"
Backup da Central do Daniel - $hoje
tv\                 = F:\PS5\Ferramentas\tv (app da TV, app do PC, scripts, chaves locais, fundos, músicas)
SamsungCertificate\ = certificado para instalar o app na TV (com tizen-profile\)
Atalhos\            = atalhos dos programas da tela 'Meus programas'
O resto (código e dados) está no GitHub: DuckDaniels1609/central-tv e DuckDaniels1609/central-dados (ver MANUAL.md).
"@ | Set-Content (Join-Path $tmp 'LEIA-ME.txt') -Encoding UTF8
$zip = Join-Path $destBase ('Central-backup-' + $hoje + '.zip')
Write-Host 'Compactando...'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($tmp, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)
Remove-Item $tmp -Recurse -Force
# guarda só os 5 mais novos
Get-ChildItem $destBase -Filter 'Central-backup-*.zip' | Sort-Object Name -Descending | Select-Object -Skip 5 | Remove-Item -Force
$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ''
Write-Host "Pronto! Backup salvo em: $zip ($mb MB)"
