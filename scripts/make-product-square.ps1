param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [int]$Size = 1600,

  [int]$Quality = 86
)

$ErrorActionPreference = 'Stop'

if (!(Get-Command magick -ErrorAction SilentlyContinue)) {
  throw 'ImageMagick magick command was not found.'
}

if (!(Test-Path -LiteralPath $InputPath)) {
  throw "Input image not found: $InputPath"
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and !(Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

magick $InputPath -auto-orient -resize "${Size}x${Size}^" -gravity center -extent "${Size}x${Size}" -quality $Quality $OutputPath

Write-Host "Created square product image: $OutputPath"
