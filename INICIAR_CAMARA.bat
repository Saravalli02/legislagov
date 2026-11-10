@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   CAMARA DE NEVES PAULISTA - SITE + PAINEL
echo ============================================
echo.
echo Site:   http://127.0.0.1:8765
echo Painel: http://127.0.0.1:8765/painel/
echo Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.
echo.
where py >nul 2>&1
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8765"
  py -3 -m http.server 8765 --bind 127.0.0.1
  goto :end
)
where python >nul 2>&1
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8765"
  python -m http.server 8765 --bind 127.0.0.1
  goto :end
)
echo ERRO: Python nao encontrado. Instale pelo python.org e tente novamente.
pause
:end
