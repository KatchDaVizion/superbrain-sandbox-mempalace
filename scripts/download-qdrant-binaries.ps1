# Download official Qdrant binaries for all supported platforms (Windows dev environment).
# Run once before building: .\scripts\download-qdrant-binaries.ps1
# Or via npm: npm run postinstall:qdrant

param(
  [string]$Version = "v1.12.4"
)

$ErrorActionPreference = "Stop"

$BaseUrl = "https://github.com/qdrant/qdrant/releases/download/$Version"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DestDir = Join-Path (Split-Path -Parent $ScriptDir) "resources\binaries"

$MinSizeBytes = 10MB

$Platforms = @{
  "qdrant-linux-x64"  = @{ Archive = "qdrant-x86_64-unknown-linux-musl.tar.gz"; Binary = "qdrant" }
  "qdrant-mac-x64"    = @{ Archive = "qdrant-x86_64-apple-darwin.tar.gz";        Binary = "qdrant" }
  "qdrant-mac-arm64"  = @{ Archive = "qdrant-aarch64-apple-darwin.tar.gz";       Binary = "qdrant" }
  "qdrant-win-x64"    = @{ Archive = "qdrant-x86_64-pc-windows-msvc.zip";        Binary = "qdrant.exe" }
}

Write-Host "=== Qdrant binary downloader ===" -ForegroundColor Cyan
Write-Host "Version: $Version"
Write-Host "Destination: $DestDir"
Write-Host ""

$failed = 0

foreach ($platform in $Platforms.Keys) {
  $cfg    = $Platforms[$platform]
  $OutDir = Join-Path $DestDir $platform
  $OutBin = Join-Path $OutDir $cfg.Binary

  if (Test-Path $OutBin) {
    $size = (Get-Item $OutBin).Length
    if ($size -gt $MinSizeBytes) {
      Write-Host "[skip] $platform — binary exists ($size bytes)"
      continue
    }
    Write-Host "[warn] $platform — binary too small ($size bytes), re-downloading"
  }

  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  $tmp = [System.IO.Path]::GetTempFileName()

  try {
    $url = "$BaseUrl/$($cfg.Archive)"
    Write-Host "[download] $platform — $url"
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing

    $dlSize = (Get-Item $tmp).Length
    if ($dlSize -lt $MinSizeBytes) {
      Write-Error "[error] $platform — downloaded file too small ($dlSize bytes)"
      $failed++
      continue
    }

    Write-Host "[extract] $platform — extracting $($cfg.Binary)"
    if ($cfg.Archive.EndsWith(".zip")) {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)
      $entry = $zip.Entries | Where-Object { $_.Name -eq $cfg.Binary }
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $OutBin, $true)
      $zip.Dispose()
    } else {
      tar -xzf $tmp -C $OutDir $cfg.Binary
    }

    $finalSize = (Get-Item $OutBin).Length
    Write-Host "[done] $platform — $OutBin ($finalSize bytes)" -ForegroundColor Green
  } catch {
    Write-Host "[error] $platform — $_" -ForegroundColor Red
    $failed++
  } finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }
}

Write-Host ""
if ($failed -gt 0) {
  Write-Host "[error] $failed platform(s) failed." -ForegroundColor Red
  exit 1
}
Write-Host "=== All platforms ready ===" -ForegroundColor Green
