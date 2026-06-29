param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
    dotnet test tests/GpoManager.Analysis.Tests/GpoManager.Analysis.Tests.csproj -c $Configuration
    Write-Host "Tests Analysis : OK"
}
finally {
    Pop-Location
}
