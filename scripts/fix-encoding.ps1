$filePath = "$PSScriptRoot\create-pr-from-main.ps1"
$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($filePath, $content, $utf8Bom)
Write-Host "Fixed: Added UTF-8 BOM to create-pr-from-main.ps1"

# Verify
$bytes = [System.IO.File]::ReadAllBytes($filePath)
Write-Host "First 3 bytes: $($bytes[0]), $($bytes[1]), $($bytes[2])"
