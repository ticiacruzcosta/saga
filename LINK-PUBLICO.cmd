@echo off
rem Liga o SAGA e cria um link público (veja scripts\link-publico.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\link-publico.ps1"
pause
