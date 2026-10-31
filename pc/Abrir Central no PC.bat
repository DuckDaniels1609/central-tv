@echo off
rem Abre a Central no PC numa janela propria e cria o atalho na Area de Trabalho (so na primeira vez)
set "ARQ=%~dp0Central.html"
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $l=Join-Path $d 'Central no PC.lnk'; if(!(Test-Path $l)){ $e=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut($l); $s.TargetPath=$e; $s.Arguments='--start-maximized --app=\"'+$env:ARQ+'\"'; $s.IconLocation=$e+',0'; $s.Save() }"
start "" msedge --app="%ARQ%" --start-maximized
