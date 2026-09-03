@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p MONTH=급여월을 입력하세요 (예: 2026-08, 비우면 이번 달): 
node download.mjs %MONTH% %*
pause
