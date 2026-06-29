param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [string]$OutputDir = "artifacts/publish"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
    Write-Host "Restauration des packages..."
    dotnet restore GpoManager.sln

    Write-Host "Compilation ($Configuration)..."
    dotnet build GpoManager.sln -c $Configuration --no-restore

    Write-Host "Publication self-contained win-x64..."
    $publishPath = Join-Path $root $OutputDir
    if (Test-Path $publishPath) {
        Remove-Item $publishPath -Recurse -Force
    }

    dotnet publish src/GpoManager.App/GpoManager.App.csproj `
        -c $Configuration `
        -r win-x64 `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -o $publishPath

    Write-Host "Publication terminée : $publishPath"
}
finally {
    Pop-Location
}
