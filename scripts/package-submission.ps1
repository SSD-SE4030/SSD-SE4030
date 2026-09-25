$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $workspace 'output'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$zipPath = Join-Path $outputDirectory 'SE4030_ICare_Submission.zip'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath }
$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Push-Location $workspace
  try {
    $paths = & git -c core.quotepath=false ls-files
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed' }
    foreach ($relativePath in $paths) {
      if ($relativePath -match '(^|/)(\.env|node_modules|build)(/|$)' -or ($relativePath -match '(^|/)\.env\.' -and $relativePath -notmatch '\.env\.example$')) { continue }
      $absolutePath = Join-Path $workspace $relativePath
      if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) { continue }
      $entryName = $relativePath.Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $absolutePath, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { Pop-Location }
} finally { $archive.Dispose() }
Write-Output $zipPath
