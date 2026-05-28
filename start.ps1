param(
  [string]$Port = "8787"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvPath = Join-Path $ProjectRoot ".env.local"
$ExamplePath = Join-Path $ProjectRoot ".env.example"

if (-not (Test-Path $EnvPath)) {
  Copy-Item $ExamplePath $EnvPath
  Write-Host "已创建 .env.local，请打开后填入 OPENAI_API_KEY，再重新运行 start.ps1。" -ForegroundColor Yellow
  Write-Host $EnvPath
  exit 1
}

$env:PORT = $Port
Set-Location $ProjectRoot
node server.js
