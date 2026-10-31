@echo off
rem Cria os atalhos "Central no PC" (Area de Trabalho e Iniciar com o Windows) e abre a Central
set "VBS=%~dp0Central.vbs"
set "DIR=%~dp0"
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $e=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'; foreach($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))){ $s=$w.CreateShortcut((Join-Path $d 'Central no PC.lnk')); $s.TargetPath=Join-Path $env:WINDIR 'System32\wscript.exe'; $s.Arguments='\"'+$env:VBS+'\"'; $s.IconLocation=(Join-Path $env:DIR 'central.ico')+',0'; $s.Save() }"
wscript "%VBS%"
