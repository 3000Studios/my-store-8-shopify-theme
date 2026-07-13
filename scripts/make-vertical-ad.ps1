param(
  [Parameter(Mandatory = $true)]
  [string]$InputImage,

  [Parameter(Mandatory = $true)]
  [string]$OutputVideo,

  [int]$Seconds = 8,

  [string]$Caption = ''
)

$ErrorActionPreference = 'Stop'

if (!(Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw 'FFmpeg command was not found.'
}

if (!(Test-Path -LiteralPath $InputImage)) {
  throw "Input image not found: $InputImage"
}

$outputDirectory = Split-Path -Parent $OutputVideo
if ($outputDirectory -and !(Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$safeCaption = $Caption.Replace("'", "\\'")
$drawText = ''
if ($safeCaption.Trim().Length -gt 0) {
  $drawText = ",drawtext=text='$safeCaption':fontcolor=white:fontsize=58:box=1:boxcolor=black@0.58:boxborderw=28:x=(w-text_w)/2:y=h-260"
}

$frames = [Math]::Max(1, $Seconds * 30)
$filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0015,1.08)':d=$frames:s=1080x1920:fps=30,format=yuv420p$drawText"

ffmpeg -y -loop 1 -i $InputImage -t $Seconds -vf $filter -c:v libx264 -pix_fmt yuv420p -movflags +faststart $OutputVideo

Write-Host "Created vertical ad video: $OutputVideo"
