@echo off
chcp 65001 >nul
title Backup da Central
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fazer_backup_central.ps1"
echo.
pause
