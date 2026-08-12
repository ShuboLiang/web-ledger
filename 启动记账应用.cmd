@echo off
chcp 65001 >nul
cd /d "%~dp0"
set AUTO_OPEN=1
echo 正在启动轻账，请保持此窗口开启……
call npm run build
if errorlevel 1 goto :end
npm start
:end
pause
