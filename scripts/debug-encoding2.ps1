$bytes = [System.IO.File]::ReadAllBytes("$PSScriptRoot\promote-feature.ps1")
Write-Host "promote-feature.ps1 - First 3 bytes: $($bytes[0]), $($bytes[1]), $($bytes[2])"
$nonAscii = 0
for ($i = 0; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -gt 127) { $nonAscii++ }
}
Write-Host "Non-ASCII bytes: $nonAscii"
