param(
  [int]$Port = 3000,
  [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $repoRoot ".trama\runtime"
$toolsDir = Join-Path $repoRoot ".trama\tools"
$webLog = Join-Path $runtimeDir "web.log"
$webErrorLog = Join-Path $runtimeDir "web.error.log"
$tunnelLog = Join-Path $runtimeDir "tunnel.log"
$tunnelErrorLog = Join-Path $runtimeDir "tunnel.error.log"
$cloudflared = Join-Path $toolsDir "cloudflared.exe"

New-Item -ItemType Directory -Force -Path $runtimeDir, $toolsDir | Out-Null
Remove-Item -LiteralPath $webLog, $webErrorLog, $tunnelLog, $tunnelErrorLog -Force -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $cloudflared)) {
  Write-Host "Baixando o Cloudflare Tunnel para o ambiente local..."
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflared
}

$web = $null
$tunnel = $null
$ownsWeb = $false
try {
  try { $ready = (Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $ready = $false }
  if ($ready) {
    Write-Host "Usando o Trama que já está aberto na porta $Port."
  } else {
    Write-Host "Iniciando o Trama..."
    $previousPort = $env:PORT
    $env:PORT = "$Port"
    $web = Start-Process -FilePath "pnpm.cmd" -ArgumentList @("--filter", "@trama/web", "dev") -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $webLog -RedirectStandardError $webErrorLog -PassThru
    $env:PORT = $previousPort
    $ownsWeb = $true
    $deadline = (Get-Date).AddSeconds(45)
    do {
      if ($web.HasExited) { throw "O Trama não iniciou. Consulte $webErrorLog" }
      try { $ready = (Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $ready = $false }
      if (-not $ready) { Start-Sleep -Milliseconds 500 }
    } until ($ready -or (Get-Date) -gt $deadline)
    if (-not $ready) { throw "O Trama não respondeu em 45 segundos. Consulte $webLog" }
  }

  Write-Host "Abrindo um túnel temporário..."
  $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @("tunnel", "--url", "http://localhost:$Port", "--no-autoupdate") -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErrorLog -PassThru

  $deadline = (Get-Date).AddSeconds(30)
  $publicUrl = $null
  do {
    if ($tunnel.HasExited) { throw "O túnel não iniciou. Consulte $tunnelErrorLog" }
    $content = ((Get-Content -LiteralPath $tunnelLog, $tunnelErrorLog -Raw -ErrorAction SilentlyContinue) -join "`n")
    $match = [regex]::Match($content, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($match.Success) { $publicUrl = $match.Value; break }
    Start-Sleep -Milliseconds 500
  } until ((Get-Date) -gt $deadline)
  if (-not $publicUrl) { throw "O Cloudflare não devolveu um endereço em 30 segundos. Consulte $tunnelErrorLog" }

  Write-Host ""
  Write-Host "Trama local:  http://localhost:$Port" -ForegroundColor Green
  Write-Host "Trama remoto: $publicUrl" -ForegroundColor Cyan
  Write-Warning "Este túnel temporário ainda não possui autenticação. Não compartilhe o endereço."
  Write-Host "Pressione Ctrl+C para encerrar o Trama e o túnel."
  if ($KeepRunning) { Wait-Process -Id $tunnel.Id } else { Wait-Process -Id $tunnel.Id }
} finally {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
  if ($ownsWeb -and $web -and -not $web.HasExited) { Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue }
}
