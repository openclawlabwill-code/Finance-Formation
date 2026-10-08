@echo off
chcp 65001 >nul
cd /d "%~dp0"
title FinanceForma
set "NODE_EXE=runtime\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
"%NODE_EXE%" --version >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable.
  echo Utilisez l'archive "FinanceForma-Windows" qui contient runtime\node.exe,
  echo ou installez Node.js LTS depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)
if not exist .env (
  if exist .env.example copy .env.example .env >nul
)
echo FinanceForma demarre sur http://localhost:3000
echo Laissez cette fenetre ouverte. Fermez-la (ou Ctrl+C) pour arreter le serveur.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
"%NODE_EXE%" server\index.js
pause
