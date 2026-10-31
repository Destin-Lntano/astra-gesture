@echo off
title ASTRA - Local Observatory
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\Start-Astra.ps1"
if errorlevel 1 (
  echo.
  echo Please extract the entire ZIP first, then try again.
  pause
)
