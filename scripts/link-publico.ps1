# Liga o SAGA em modo de produção e cria um link público (Cloudflare Tunnel).
# Uso: dois cliques em LINK-PUBLICO.cmd (na pasta do projeto). O link muda a cada vez.
# Para desligar: feche as janelas "SAGA - site" e "SAGA - link publico".

$ErrorActionPreference = "Stop"
$projeto = Split-Path -Parent $PSScriptRoot
Set-Location $projeto

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) { $cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }
if (-not (Test-Path $cloudflared)) {
  Write-Host "Cloudflare Tunnel não encontrado. Instale com:  winget install --id Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}
if (netstat -ano | Select-String ":3000 .*LISTENING") {
  Write-Host "Já existe algo usando a porta 3000 (provavelmente o npm run dev). Feche essa janela e rode de novo." -ForegroundColor Red
  exit 1
}

# Versão de produção (só refaz se o código mudou desde o último build)
$ultimoBuild = Get-Item ".next\BUILD_ID" -ErrorAction SilentlyContinue
$codigoMudou = -not $ultimoBuild -or (Get-ChildItem app, components, lib, prisma -Recurse -File | Where-Object { $_.LastWriteTime -gt $ultimoBuild.LastWriteTime })
if ($codigoMudou) {
  Write-Host "Preparando a versão de produção (npm run build)..." -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Host "O build falhou. Veja o erro acima." -ForegroundColor Red; exit 1 }
}

$log = Join-Path $env:TEMP "saga-tunel.log"
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projeto'; `$host.UI.RawUI.WindowTitle = 'SAGA - site'; npm start"
Start-Sleep -Seconds 5
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle = 'SAGA - link publico'; & '$cloudflared' tunnel --no-autoupdate --url http://localhost:3000 2>&1 | Tee-Object -FilePath '$log'"

Write-Host "Gerando o link..." -ForegroundColor Yellow
$url = $null
for ($i = 0; $i -lt 45 -and -not $url; $i++) {
  Start-Sleep -Seconds 2
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}
if (-not $url) { Write-Host "Não consegui o link. Veja a janela 'SAGA - link publico'." -ForegroundColor Red; exit 1 }

Set-Clipboard -Value $url
Write-Host ""
Write-Host "Link público do SAGA (já copiado):" -ForegroundColor Green
Write-Host "  $url" -ForegroundColor Cyan
Write-Host ""
Write-Host "Funciona enquanto este computador e as duas janelas ficarem abertos."
