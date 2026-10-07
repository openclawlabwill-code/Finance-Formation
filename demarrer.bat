@echo off
chcp 65001 >nul
cd /d "%~dp0"
title FinanceForma
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable.
  echo Installez la version LTS depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)
if not exist .env (
  if exist .env.example copy .env.example .env >nul
)
echo FinanceForma demarre sur http://localhost:3000
echo Laissez cette fenetre ouverte. Fermez-la (ou Ctrl+C) pour arreter le serveur.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server\index.js
pause
