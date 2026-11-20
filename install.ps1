$ErrorActionPreference = "Stop"
$TargetRoot = Join-Path $env:USERPROFILE ".gemini\config\plugins"
$SourceRoot = Join-Path $PSScriptRoot "plugins"

New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null

Get-ChildItem -Directory $SourceRoot | ForEach-Object {
    $dest = Join-Path $TargetRoot $_.Name
    if (Test-Path $dest) {
        Remove-Item -Recurse -Force $dest
    }
    Copy-Item -Recurse -Force $_.FullName $dest
    Write-Host "[OK] Installed $($_.Name) -> $dest" -ForegroundColor Green
}

Write-Host "`nAll 3 plugins installed! Open Antigravity Customizations to view or toggle them." -ForegroundColor Cyan
