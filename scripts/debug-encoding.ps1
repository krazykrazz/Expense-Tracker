$bytes = [System.IO.File]::ReadAllBytes("$PSScriptRoot\create-pr-from-main.ps1")
Write-Host "File size: $($bytes.Length) bytes"
Write-Host "First 3 bytes: $($bytes[0]), $($bytes[1]), $($bytes[2])"

# Check for any non-ASCII bytes
$nonAscii = @()
for ($i = 0; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -gt 127) {
        $nonAscii += "$i`:$($bytes[$i])"
    }
}
Write-Host "Non-ASCII byte positions (first 30): $($nonAscii[0..29] -join ', ')"
Write-Host "Total non-ASCII bytes: $($nonAscii.Length)"
