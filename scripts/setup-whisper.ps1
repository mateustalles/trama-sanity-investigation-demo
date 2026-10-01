$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$install = Join-Path $root ".local\whisper"
$archive = Join-Path $install "whisper-bin-x64.zip"
$binaryUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip"
$binarySha256 = "49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a"
$model = Join-Path $install "models\ggml-base.bin"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
$modelSha1 = "465707469ff3a37a2b9b8d8f89f2f99de7299dac"

New-Item -ItemType Directory -Force -Path $install,(Join-Path $install "models") | Out-Null

if (-not (Test-Path $archive)) {
  Write-Host "Downloading whisper.cpp v1.9.2..."
  Invoke-WebRequest -Uri $binaryUrl -OutFile $archive
}
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant() -ne $binarySha256) {
  throw "The whisper.cpp archive checksum does not match the official release."
}

$bin = Join-Path $install "bin"
if (-not (Test-Path (Join-Path $bin "Release\whisper-cli.exe"))) {
  if (Test-Path $bin) { Remove-Item -LiteralPath $bin -Recurse -Force }
  Expand-Archive -LiteralPath $archive -DestinationPath $bin -Force
}

if (-not (Test-Path $model)) {
  Write-Host "Downloading the multilingual Whisper base model..."
  Invoke-WebRequest -Uri $modelUrl -OutFile $model
}
if ((Get-FileHash -Algorithm SHA1 -LiteralPath $model).Hash.ToLowerInvariant() -ne $modelSha1) {
  throw "The Whisper model checksum does not match the official model index."
}

Write-Host "Local transcription is ready in $install"
