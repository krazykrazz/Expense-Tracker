<#
.SYNOPSIS
    Runs backend and frontend tests and generates a failure summary report.

.DESCRIPTION
    Executes backend (Jest) and frontend (Vitest) tests, parses output for failures,
    and writes a structured summary to test-failure-summary.txt in the project root.
    Raw output is saved to test-backend-raw.txt and test-frontend-raw.txt for detailed review.

.PARAMETER SkipBackend
    Skip backend tests.

.PARAMETER SkipFrontend
    Skip frontend tests.

.PARAMETER FastPBT
    Use reduced PBT iterations for faster execution during development.

.PARAMETER OutputDir
    Directory for output files. Defaults to project root.

.EXAMPLE
    .\scripts\run-test-summary.ps1
    .\scripts\run-test-summary.ps1 -FastPBT
    .\scripts\run-test-summary.ps1 -SkipFrontend
    .\scripts\run-test-summary.ps1 -SkipBackend -SkipFrontend  # (no-op, but valid)
#>

param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$FastPBT,
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSScriptRoot

if ($OutputDir -eq "") {
    $OutputDir = $projectRoot
}

$reportPath = Join-Path $OutputDir "test-failure-summary.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$branch = & git -C $projectRoot branch --show-current 2>$null
if (-not $branch) { $branch = "(unknown)" }

$separator = "============================================"
$subSeparator = "-- {0} {1}" 

# ── Helpers ──────────────────────────────────────────────

function Strip-Ansi {
    param([string]$text)
    # Remove ANSI escape sequences
    return $text -replace '\x1b\[[0-9;]*m', '' -replace '\[[\d;]*m', ''
}

function Parse-JestOutput {
    param([string[]]$lines)

    $results = @{
        Suites = 0; SuitesPassed = 0; SuitesFailed = 0
        Tests = 0; Passed = 0; Failed = 0
        FailedSuiteNames = [System.Collections.Generic.List[string]]::new()
    }

    foreach ($rawLine in $lines) {
        $line = Strip-Ansi $rawLine

        # Parse summary lines
        if ($line -match "Test Suites:\s*(.+)") {
            $parts = $Matches[1]
            if ($parts -match "(\d+)\s+failed") { $results.SuitesFailed = [int]$Matches[1] }
            if ($parts -match "(\d+)\s+passed") { $results.SuitesPassed = [int]$Matches[1] }
            if ($parts -match "(\d+)\s+total")  { $results.Suites = [int]$Matches[1] }
        }
        if ($line -match "^Tests:\s*(.+)") {
            $parts = $Matches[1]
            if ($parts -match "(\d+)\s+failed") { $results.Failed = [int]$Matches[1] }
            if ($parts -match "(\d+)\s+passed") { $results.Passed = [int]$Matches[1] }
            if ($parts -match "(\d+)\s+total")  { $results.Tests = [int]$Matches[1] }
        }

        # Capture failed suite names
        # Jest FAIL lines: "FAIL services/foo.test.js (5.2 s)" or "FAIL services/foo.test.js"
        # Must start with FAIL (after optional whitespace), followed by a path containing .test.
        if ($line -match "^\s*FAIL\s+(\S+\.test\S+)") {
            # Strip trailing duration like " (5.2 s)"
            $suiteName = $Matches[1].Trim()
            if ($suiteName -and -not $results.FailedSuiteNames.Contains($suiteName)) {
                $results.FailedSuiteNames.Add($suiteName)
            }
        }
    }

    return $results
}

function Parse-VitestOutput {
    param([string[]]$lines)

    $results = @{
        Suites = 0; SuitesPassed = 0; SuitesFailed = 0
        Tests = 0; Passed = 0; Failed = 0
        FailedSuiteNames = [System.Collections.Generic.List[string]]::new()
    }

    foreach ($rawLine in $lines) {
        $line = Strip-Ansi $rawLine

        # Vitest summary: " Test Files  3 failed | 159 passed (162)"
        if ($line -match "Test Files\s+(.+)") {
            $parts = $Matches[1]
            if ($parts -match "(\d+)\s+failed") { $results.SuitesFailed = [int]$Matches[1] }
            if ($parts -match "(\d+)\s+passed") { $results.SuitesPassed = [int]$Matches[1] }
            # Total in parens at end: "(162)"
            if ($parts -match "\((\d+)\)\s*$") { $results.Suites = [int]$Matches[1] }
            elseif ($parts -match "(\d+)\s+total") { $results.Suites = [int]$Matches[1] }
            # Fallback: sum failed + passed
            if ($results.Suites -eq 0) { $results.Suites = $results.SuitesFailed + $results.SuitesPassed }
        }
        # Vitest: "      Tests  4 failed | 2089 passed | 12 skipped (2105)"
        if ($line -match "^\s+Tests\s+(.+)") {
            $parts = $Matches[1]
            if ($parts -match "(\d+)\s+failed") { $results.Failed = [int]$Matches[1] }
            if ($parts -match "(\d+)\s+passed") { $results.Passed = [int]$Matches[1] }
            if ($parts -match "\((\d+)\)\s*$") { $results.Tests = [int]$Matches[1] }
            elseif ($parts -match "(\d+)\s+total") { $results.Tests = [int]$Matches[1] }
            if ($results.Tests -eq 0) { $results.Tests = $results.Failed + $results.Passed }
        }

        # Vitest FAIL lines: " FAIL  src/hooks/useTabState.pbt.test.js > test name > ..."
        # After ANSI strip: " FAIL  src/path/file.test.js > description"
        # Extract just the file path (up to first " > " or end of line)
        if ($line -match "^\s*FAIL\s+(\S+\.test\.\S+?)(?:\s+>|\s*$)") {
            $suiteName = $Matches[1].Trim()
            if ($suiteName -and -not $results.FailedSuiteNames.Contains($suiteName)) {
                $results.FailedSuiteNames.Add($suiteName)
            }
        }
    }

    return $results
}


# ── Report Building ──────────────────────────────────────

$report = [System.Collections.Generic.List[string]]::new()
$report.Add($separator)
$report.Add("  TEST FAILURE SUMMARY")
$report.Add("  Branch: $branch")
$report.Add("  Date:   $timestamp")
if ($FastPBT) { $report.Add("  Mode:   FastPBT (reduced iterations)") }
$report.Add($separator)
$report.Add("")

$totalSuites = 0
$totalPassed = 0
$totalFailed = 0
$allFailedSuites = [System.Collections.Generic.List[string]]::new()

# ── Backend Tests ────────────────────────────────────────

if (-not $SkipBackend) {
    $report.Add(($subSeparator -f "BACKEND (Jest)", ("-" * 30)))
    $report.Add("")

    Write-Host "`n[1/2] Running backend tests..." -ForegroundColor Cyan
    $backendStart = Get-Date

    if ($FastPBT) {
        $env:FAST_PBT = "true"
    }

    $backendRawPath = Join-Path $OutputDir "test-backend-raw.txt"
    Push-Location (Join-Path $projectRoot "backend")
    try {
        $backendRaw = & npx jest --no-coverage --forceExit 2>&1
    } finally {
        Pop-Location
    }

    $backendOutput = $backendRaw | Out-String
    $backendLines = $backendOutput -split "`n"
    $backendOutput | Out-File -FilePath $backendRawPath -Encoding UTF8

    $backendDuration = [math]::Round(((Get-Date) - $backendStart).TotalSeconds, 1)

    $be = Parse-JestOutput $backendLines

    $totalSuites += $be.Suites
    $totalPassed += $be.Passed
    $totalFailed += $be.Failed
    foreach ($s in $be.FailedSuiteNames) { $allFailedSuites.Add($s) }

    $report.Add("Suites: $($be.SuitesPassed) passed, $($be.SuitesFailed) failed, $($be.Suites) total")
    $report.Add("Tests:  $($be.Passed) passed, $($be.Failed) failed, $($be.Tests) total")
    $report.Add("Time:   ${backendDuration}s")
    $report.Add("")

    if ($be.FailedSuiteNames.Count -gt 0) {
        $report.Add("Failed suites:")
        foreach ($s in $be.FailedSuiteNames) {
            $report.Add("  FAIL  $s")
        }
        $report.Add("")
        $report.Add("(See test-backend-raw.txt for full failure details)")
    }
    else {
        $report.Add("All backend tests passed.")
    }
    $report.Add("")

    if ($be.SuitesFailed -gt 0) {
        Write-Host "  Backend: $($be.Passed) passed, $($be.Failed) failed (${backendDuration}s)" -ForegroundColor Red
    } else {
        Write-Host "  Backend: $($be.Passed) passed, 0 failed (${backendDuration}s)" -ForegroundColor Green
    }
}

# ── Frontend Tests ───────────────────────────────────────

if (-not $SkipFrontend) {
    $report.Add(($subSeparator -f "FRONTEND (Vitest)", ("-" * 28)))
    $report.Add("")

    Write-Host "`n[2/2] Running frontend tests..." -ForegroundColor Cyan
    $frontendStart = Get-Date

    $frontendRawPath = Join-Path $OutputDir "test-frontend-raw.txt"
    Push-Location (Join-Path $projectRoot "frontend")
    try {
        $frontendRaw = & npx vitest --run 2>&1
    } finally {
        Pop-Location
    }

    $frontendOutput = $frontendRaw | Out-String
    $frontendLines = $frontendOutput -split "`n"
    $frontendOutput | Out-File -FilePath $frontendRawPath -Encoding UTF8

    $frontendDuration = [math]::Round(((Get-Date) - $frontendStart).TotalSeconds, 1)

    $fe = Parse-VitestOutput $frontendLines

    $totalSuites += $fe.Suites
    $totalPassed += $fe.Passed
    $totalFailed += $fe.Failed
    foreach ($s in $fe.FailedSuiteNames) { $allFailedSuites.Add($s) }

    $report.Add("Suites: $($fe.SuitesPassed) passed, $($fe.SuitesFailed) failed, $($fe.Suites) total")
    $report.Add("Tests:  $($fe.Passed) passed, $($fe.Failed) failed, $($fe.Tests) total")
    $report.Add("Time:   ${frontendDuration}s")
    $report.Add("")

    if ($fe.FailedSuiteNames.Count -gt 0) {
        $report.Add("Failed suites:")
        foreach ($s in $fe.FailedSuiteNames) {
            $report.Add("  FAIL  $s")
        }
        $report.Add("")
        $report.Add("(See test-frontend-raw.txt for full failure details)")
    }
    else {
        $report.Add("All frontend tests passed.")
    }
    $report.Add("")

    if ($fe.SuitesFailed -gt 0) {
        Write-Host "  Frontend: $($fe.Passed) passed, $($fe.Failed) failed (${frontendDuration}s)" -ForegroundColor Red
    } else {
        Write-Host "  Frontend: $($fe.Passed) passed, 0 failed (${frontendDuration}s)" -ForegroundColor Green
    }
}

# ── Totals ───────────────────────────────────────────────

$report.Add($separator)
$report.Add("  TOTALS")
$report.Add($separator)
$report.Add("Suites: $totalSuites total")
$report.Add("Tests:  $totalPassed passed, $totalFailed failed, $($totalPassed + $totalFailed) total")
$report.Add("")

if ($allFailedSuites.Count -gt 0) {
    $report.Add("ALL FAILED SUITES ($($allFailedSuites.Count)):")
    foreach ($s in $allFailedSuites) {
        $report.Add("  - $s")
    }
}
else {
    $report.Add("All tests passed.")
}

$report.Add("")
$report.Add("Report written: $timestamp")
$report.Add("Raw output: test-backend-raw.txt, test-frontend-raw.txt")

# ── Write Report ─────────────────────────────────────────

$report | Out-File -FilePath $reportPath -Encoding UTF8

Write-Host ""
Write-Host "Summary: $reportPath" -ForegroundColor Cyan
if ($totalFailed -gt 0) {
    Write-Host "Result:  $totalPassed passed, $totalFailed failed across $totalSuites suites" -ForegroundColor Red
    exit 1
}
else {
    Write-Host "Result:  $totalPassed passed, 0 failed across $totalSuites suites" -ForegroundColor Green
    exit 0
}
