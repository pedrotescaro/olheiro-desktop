param(
  [string]$VendorDir = "vendor\tesseract",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VendorPath = Join-Path $RepoRoot $VendorDir
$DownloadsPath = Join-Path $RepoRoot "vendor\_downloads"
$RequiredLanguages = @("eng", "por", "spa", "osd")

function Assert-InWorkspace([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "vendor"))
  if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Caminho fora de vendor/: $full"
  }
}

function Test-TesseractBundle {
  if (-not (Test-Path (Join-Path $VendorPath "tesseract.exe"))) {
    return $false
  }
  foreach ($lang in $RequiredLanguages) {
    if (-not (Test-Path (Join-Path $VendorPath "tessdata\$lang.traineddata"))) {
      return $false
    }
  }
  return $true
}

function Copy-InstalledTesseract {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Tesseract-OCR")
    (Join-Path ${env:ProgramFiles(x86)} "Tesseract-OCR")
  ) | Where-Object { $_ -and (Test-Path (Join-Path $_ "tesseract.exe")) }

  $candidates = @($candidates)
  if ($candidates.Count -eq 0) {
    return $false
  }

  $source = $candidates[0]
  Write-Host "[Olheiro] Copiando Tesseract instalado de $source"
  New-Item -ItemType Directory -Force -Path $VendorPath | Out-Null
  Copy-Item -Path (Join-Path $source "*") -Destination $VendorPath -Recurse -Force
  return $true
}

function Install-TesseractFromRelease {
  New-Item -ItemType Directory -Force -Path $DownloadsPath | Out-Null
  $api = "https://api.github.com/repos/UB-Mannheim/tesseract/releases/latest"
  Write-Host "[Olheiro] Baixando metadata do Tesseract: $api"
  $release = Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "OlheiroBuild" }
  $asset = $release.assets |
    Where-Object { $_.name -match "^tesseract-ocr-w64-setup.*\.exe$" } |
    Sort-Object -Property name -Descending |
    Select-Object -First 1

  if (-not $asset) {
    throw "Nao encontrei instalador w64 do Tesseract no release mais recente."
  }

  $installer = Join-Path $DownloadsPath $asset.name
  if (-not (Test-Path $installer)) {
    Write-Host "[Olheiro] Baixando $($asset.name)"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer
  }

  Write-Host "[Olheiro] Instalando Tesseract portatil em $VendorPath"
  New-Item -ItemType Directory -Force -Path $VendorPath | Out-Null
  $arguments = @(
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    "/SP-",
    "/DIR=""$VendorPath"""
  )
  $process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Instalador do Tesseract retornou codigo $($process.ExitCode)."
  }
}

function Ensure-LanguageData {
  $tessdata = Join-Path $VendorPath "tessdata"
  New-Item -ItemType Directory -Force -Path $tessdata | Out-Null

  foreach ($lang in $RequiredLanguages) {
    $target = Join-Path $tessdata "$lang.traineddata"
    if ((Test-Path $target) -and ((Get-Item $target).Length -gt 1024)) {
      continue
    }
    $url = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/$lang.traineddata"
    Write-Host "[Olheiro] Baixando idioma OCR $lang"
    Invoke-WebRequest -Uri $url -OutFile $target
  }
}

function Optimize-TesseractRuntime {
  Get-ChildItem -LiteralPath $VendorPath -Filter "*.html" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $VendorPath -Filter "*.exe" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "tesseract.exe" } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $VendorPath -Filter "unins*" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $VendorPath -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @("doc", "include", "lib") } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  $tessdata = Join-Path $VendorPath "tessdata"
  if (Test-Path $tessdata) {
    Get-ChildItem -LiteralPath $tessdata -Filter "*.traineddata" -File -ErrorAction SilentlyContinue |
      Where-Object { $RequiredLanguages -notcontains $_.BaseName } |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }
}

Assert-InWorkspace $VendorPath

if ($Force -and (Test-Path $VendorPath)) {
  Remove-Item -LiteralPath $VendorPath -Recurse -Force
}

if (-not (Test-TesseractBundle)) {
  if (Test-Path $VendorPath) {
    Remove-Item -LiteralPath $VendorPath -Recurse -Force
  }
  if (-not (Copy-InstalledTesseract)) {
    Install-TesseractFromRelease
  }
}

Ensure-LanguageData
Optimize-TesseractRuntime

if (-not (Test-TesseractBundle)) {
  throw "Bundle do Tesseract ficou incompleto."
}

$version = & (Join-Path $VendorPath "tesseract.exe") --version | Select-Object -First 1
Write-Host "[Olheiro] Tesseract portatil pronto: $version"
