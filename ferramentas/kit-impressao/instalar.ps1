# GR Software - instalador da impressao (QZ Tray + certificado GR)
# Instala o QZ Tray (programa gratuito de impressao), confia no certificado da GR e libera a impressao direta.
$ErrorActionPreference = 'Continue'
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$cert = Join-Path $pasta 'gr-impressao.crt'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
  exit
}
$Host.UI.RawUI.WindowTitle = 'GR Software - Impressao'
function Passo($t) { Write-Host ''; Write-Host "==> $t" -ForegroundColor Cyan }
Write-Host 'GR Software - instalacao da impressao direta' -ForegroundColor Green
if (-not (Test-Path $cert)) {
  Write-Host 'Nao achei o arquivo gr-impressao.crt. Extraia TODO o ZIP (botao direito > Extrair tudo) e rode de novo.' -ForegroundColor Red
  Read-Host 'Aperte Enter para sair'; exit
}
$qzDir = Join-Path $env:ProgramFiles 'QZ Tray'
$console = Join-Path $qzDir 'qz-tray-console.exe'
if (-not (Test-Path $console)) {
  Passo 'Baixando o QZ Tray (programa de impressao)...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  try {
    $rel = Invoke-RestMethod -UseBasicParsing 'https://api.github.com/repos/qzind/tray/releases/latest' -Headers @{ 'User-Agent' = 'GR-Software' }
    $asset = $rel.assets | Where-Object { $_.name -match 'x86_64\.exe$' } | Select-Object -First 1
    if (-not $asset) { $asset = $rel.assets | Where-Object { $_.name -match '\.exe$' } | Select-Object -First 1 }
    $exe = Join-Path $env:TEMP $asset.name
    Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile $exe
    Passo "Instalando $($asset.name)..."
    Start-Process $exe -ArgumentList '/S' -Wait
    if (-not (Test-Path $console)) { Write-Host 'Abrindo o instalador: clique em Avancar ate terminar.' -ForegroundColor Yellow; Start-Process $exe -Wait }
  } catch {
    Write-Host "Nao consegui baixar o QZ Tray automaticamente: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Baixe em https://qz.io/download/ , instale e rode este instalador de novo.' -ForegroundColor Yellow
    Start-Process 'https://qz.io/download/'; Read-Host 'Aperte Enter para sair'; exit
  }
}
if (-not (Test-Path $console)) { Write-Host 'O QZ Tray nao foi instalado. Rode de novo.' -ForegroundColor Red; Read-Host 'Aperte Enter para sair'; exit }
Passo 'Fechando o QZ Tray para configurar...'
Get-Process | Where-Object { $_.ProcessName -match '^qz-tray' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2
Passo 'Instalando o certificado da GR (confianca)...'
$ov = Join-Path $qzDir 'override.crt'
if ((Test-Path $ov) -and ((Get-FileHash $ov).Hash -ne (Get-FileHash $cert).Hash)) {
  Copy-Item $ov (Join-Path $qzDir 'override-anterior.crt') -Force
  Write-Host 'Ja havia outro certificado; guardei uma copia em override-anterior.crt.' -ForegroundColor Yellow
}
Copy-Item $cert $ov -Force
Passo 'Liberando a impressao do sistema GR (lista de permitidos)...'
& $console --allow $cert | Out-Host
Passo 'Abrindo o QZ Tray...'
$tray = Join-Path $qzDir 'qz-tray.exe'
if (Test-Path $tray) { Start-Process $tray }
Write-Host ''
Write-Host 'PRONTO! Agora no caixa: Ajustes > Impressora > Escolher impressora.' -ForegroundColor Green
Write-Host 'Se aparecer a pergunta do QZ uma vez, marque "Remember this decision" e clique em Allow.' -ForegroundColor Green
Read-Host 'Aperte Enter para fechar'
