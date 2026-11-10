@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Importando noticias e fotos do site atual da Camara (pode levar alguns minutos)...
echo.
where py >nul 2>&1
if %errorlevel%==0 (py -3 ferramentas\importar_site_antigo.py %*) else (python ferramentas\importar_site_antigo.py %*)
echo.
pause
