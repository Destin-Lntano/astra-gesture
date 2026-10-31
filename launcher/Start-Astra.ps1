param([switch]$NoBrowser, [int]$Port = 0)
$ErrorActionPreference = 'Stop'
$server = $null
try {
    $packageRoot = Split-Path -Parent $PSScriptRoot
    $webRoot = Join-Path $packageRoot 'web'
    Add-Type -TypeDefinition ([System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'AstraServer.cs')))
    $server = New-Object AstraServer
    $assignedPort = $server.Start($webRoot, $Port)
    $url = 'http://127.0.0.1:' + $assignedPort + '/'
    Write-Host ''
    Write-Host '  ASTRA - Local Observatory' -ForegroundColor Cyan
    Write-Host ('  Open: ' + $url) -ForegroundColor Green
    Write-Host '  Keep this window open while using the website.'
    Write-Host '  Close the browser tab, then close this window to stop.'
    Write-Host '  No internet connection or extra software is required.'
    Write-Host ''
    if (-not $NoBrowser) { Start-Process $url }
    while ($true) { Start-Sleep -Milliseconds 250 }
} catch {
    Write-Host ('Unable to start: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $server) { $server.Dispose() }
}
