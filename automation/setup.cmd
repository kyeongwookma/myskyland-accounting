@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js가 없습니다. https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행하세요. & pause & exit /b 1)
call npm ci --no-audit --no-fund || (echo 설치 실패 & pause & exit /b 1)
echo 설치 완료. download.cmd 를 실행하세요.
pause
