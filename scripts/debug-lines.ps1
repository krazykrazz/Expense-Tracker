$lines = [System.IO.File]::ReadAllLines("$PSScriptRoot\create-pr-from-main.ps1")
for ($i = 110; $i -lt 120; $i++) {
    Write-Host ("{0}: {1}" -f ($i+1), $lines[$i])
}
