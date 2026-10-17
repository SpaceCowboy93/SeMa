@echo off
title SeMaCalendar – Dev Server
cd /d "%~dp0"
echo.
echo  Starting SeMaCalendar dev server...
echo  Open http://localhost:3000 in your browser.
echo  Press Ctrl+C to stop.
echo.
npm run dev
pause
