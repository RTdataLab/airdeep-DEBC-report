@echo off
chcp 65001 >nul
title ?? ?? ??? ??
cd /d "%~dp0"
set "PYCMD="
where python >nul 2>nul && set "PYCMD=python"
if not defined PYCMD (where py >nul 2>nul && set "PYCMD=py")
if not defined PYCMD (echo [??] Python? ???? ?? ????. & pause & exit /b)
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:8002"
%PYCMD% -m http.server 8002
pause