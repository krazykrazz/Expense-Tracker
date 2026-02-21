<#
.SYNOPSIS
    Runs backend and frontend tests and generates a failure summary report.

.DESCRIPTION
    Executes backend (Jest) and frontend (Vitest) tests, parses output for failures,
    and writes a structured summary to test-failure-summary.txt in the project root.
    Raw output is saved to test-backend-raw.txt and test-frontend-raw.txt for detailed review.

    The summary includes inline failure details: test name, error message, counterexample
    (for PBT), and source location — so you rarely need to open the raw files.

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

        if ($line -match "^\s*FAIL\s+(\S+\.test\S+)") {
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

        if ($line -match "Test Files\s+(.+)") {
            $parts = $Matches[1]
            if ($parts -match "(\d+)\s+failed") { $results.SuitesFailed = [int]$Matches[1] }
            if ($parts -match "(\d+)\s+passed") { $results.SuitesPassed = [int]$Matches[1] }
            if ($parts -match "\((\d+)\)\s*$") { $results.Suites = [int]$Matches[1] }
            elseif ($parts -match "(\d+)\s+total") { $results.Suites = [int]$Matches[1] }
            if ($results.Suites -eq 0) { $results.Suites = $results.SuitesFailed + $results.SuitesPassed }
        }
        if ($line -match "^\s+Tests\s+(.+)") {
            $parts = $Matches[1]
            if ($parts -match "(\d+)\s+failed") { $results.Failed = [int]$Matches[1] }
            if ($parts -match "(\d+)\s+passed") { $results.Passed = [int]$Matches[1] }
            if ($parts -match "\((\d+)\)\s*$") { $results.Tests = [int]$Matches[1] }
            elseif ($parts -match "(\d+)\s+total") { $results.Tests = [int]$Matches[1] }
            if ($results.Tests -eq 0) { $results.Tests = $results.Failed + $results.Passed }
        }

        if ($line -match "^\s*FAIL\s+(\S+\.test\.\S+?)(?:\s+>|\s*$)") {
            $suiteName = $Matches[1].Trim()
            if ($suiteName -and -not $results.FailedSuiteNames.Contains($suiteName)) {
                $results.FailedSuiteNames.Add($suiteName)
            }
        }
    }

    return $results
}

# ── Failure Detail Extraction ────────────────────────────
# Parses raw test output to extract per-test failure details:
#   - Test name (full path)
#   - Error message / cause
#   - PBT counterexample (if applicable)
#   - Source location

function Extract-JestFailureDetails {
    param([string[]]$lines)

    $failures = [System.Collections.Generic.List[hashtable]]::new()
    $cleanLines = $lines | ForEach-Object { Strip-Ansi $_ }

    # Jest outputs a "Summary of all failing tests" section at the end.
    # Format:
    #   FAIL services/backupService.pbt.test.js (298.939 s)
    #     <bullet> SuiteName > GroupName > TestName
    #       <error details, counterexample, cause, stack>
    #
    # The bullet character is garbled Unicode on Windows (e.g. "ΓùÅ").
    # We detect test entries by: indented line starting with a non-ASCII char
    # that follows a FAIL suite line, containing " > " path separators.

    $inSummary = $false
    $currentSuite = ""

    for ($i = 0; $i -lt $cleanLines.Count; $i++) {
        $line = $cleanLines[$i]

        # Detect the "Summary of all failing tests" section
        if ($line -match 'Summary of all failing tests') {
            $inSummary = $true
            continue
        }

        if (-not $inSummary) { continue }

        # Track current suite in the summary
        if ($line -match '^\s*FAIL\s+(\S+\.test\S+)') {
            $currentSuite = $Matches[1].Trim()
            continue
        }

        # Match test name lines: indented, contain separator chars (garbled "›" = "ΓÇ║" on Windows, or ">")
        # These are the bullet-pointed test names under each FAIL suite
        if ($currentSuite -ne "" -and $line -match '^\s+\S+\s+(.+(?:ΓÇ║|›|>).+)') {
            $testName = $Matches[1].Trim()
            $errorMsg = ""
            $counterexample = ""
            $source = ""
            $cause = ""

            # Scan ahead for error details (up to 50 lines or next test/suite marker)
            $scanLimit = [Math]::Min($i + 50, $cleanLines.Count - 1)
            for ($j = $i + 1; $j -le $scanLimit; $j++) {
                $detail = $cleanLines[$j]

                # Stop at next test entry (indented line with separators after non-ASCII char)
                # or next FAIL suite line
                if ($detail -match '^\s*FAIL\s+\S+\.test') { break }
                if ($detail -match '^\s+\S+\s+.+(?:ΓÇ║|›|>).+' -and $detail -notmatch '^\s+at\s+') { break }

                # PBT counterexample
                if ($detail -match 'Counterexample:\s*(.+)') {
                    $counterexample = $Matches[1].Trim()
                }
                # PBT seed info
                if ($detail -match 'Property failed after (\d+) tests') {
                    $errorMsg = "Property failed after $($Matches[1]) tests"
                }
                # Cause line (Jest shows "Cause:" then the actual cause on the next non-empty line)
                if ($detail -match '^\s*Cause:\s*$') {
                    for ($k = $j + 1; $k -le $scanLimit; $k++) {
                        $causeLine = $cleanLines[$k].Trim()
                        if ($causeLine -ne "") {
                            $cause = $causeLine
                            break
                        }
                    }
                }
                # Direct error messages (EBUSY, ENOENT, expect failures, thrown errors)
                if ($detail -match '^\s*(Expected|Received|Error:|EBUSY|ENOENT|SQLITE_ERROR|TypeError|ReferenceError)') {
                    if ($errorMsg -eq "") {
                        $errorMsg = $detail.Trim()
                    }
                }
                # Also catch inline error messages that start with the error type directly
                if ($detail -match '^\s+(EBUSY|ENOENT):\s+(.+)') {
                    if ($errorMsg -eq "") {
                        $errorMsg = $detail.Trim()
                    }
                }
                # Source location: "at Object.<anonymous> (file.test.js:123:45)"
                if ($detail -match 'at\s+.*\(.*\.test\.\S+:\d+:\d+\)' -and $source -eq "") {
                    $source = $detail.Trim()
                }
                # Alternative source: "  > 123 |  code here"
                if ($detail -match '^\s*>\s*\d+\s*\|' -and $source -eq "") {
                    $source = $detail.Trim()
                }
            }

            $failure = @{
                TestName = "$currentSuite > $testName"
                Error = if ($cause -ne "") { $cause } elseif ($errorMsg -ne "") { $errorMsg } else { "(see raw output)" }
                Counterexample = $counterexample
                Source = $source
            }
            $failures.Add($failure)
        }
    }

    return $failures
}

function Extract-VitestFailureDetails {
    param([string[]]$lines)

    $failures = [System.Collections.Generic.List[hashtable]]::new()
    $cleanLines = $lines | ForEach-Object { Strip-Ansi $_ }

    # Vitest outputs a "Failed Tests N" section at the end with structured failure info
    # Format:
    #   <decorators> Failed Tests 1 <decorators>
    #
    #    FAIL  src/file.test.jsx > Suite > Test Name
    #   Error: Property failed after 41 tests
    #   { seed: ..., path: "..." }
    #   Counterexample: [...]
    #   ...
    #   Caused by: AssertionError: expected false to be true
    #   ...
    #    <arrow> src/file.test.jsx:462:56

    $inFailedSection = $false

    for ($i = 0; $i -lt $cleanLines.Count; $i++) {
        $line = $cleanLines[$i]

        # Detect the "Failed Tests" summary section
        if ($line -match 'Failed Tests \d+') {
            $inFailedSection = $true
            continue
        }

        # In the failed section, look for "FAIL  path > suite > test" lines
        if ($inFailedSection -and $line -match '^\s*FAIL\s+(.+)') {
            $testPath = $Matches[1].Trim()
            $errorMsg = ""
            $counterexample = ""
            $source = ""
            $cause = ""

            # Scan ahead for details
            $scanLimit = [Math]::Min($i + 50, $cleanLines.Count - 1)
            for ($j = $i + 1; $j -le $scanLimit; $j++) {
                $detail = $cleanLines[$j]

                # Stop at next FAIL or section boundary (the decorators line)
                if ($detail -match '^\s*FAIL\s+' -or $detail -match '^\s*Test Files\s+') {
                    break
                }
                # Also stop at the closing decorator line
                if ($detail -match '^\S+\[[\d/]+\]\S+') {
                    break
                }

                if ($detail -match 'Counterexample:\s*(.+)') {
                    $counterexample = $Matches[1].Trim()
                }
                if ($detail -match 'Property failed after (\d+) tests') {
                    $errorMsg = "Property failed after $($Matches[1]) tests"
                }
                # Vitest uses "Caused by:" (not "Cause:")
                if ($detail -match 'Caused by:\s*(.+)') {
                    $cause = $Matches[1].Trim()
                }
                # Also catch "Error:" lines (but not "Error: Property failed" which is already handled)
                if ($detail -match '^(Error|AssertionError|TypeError|ReferenceError):\s*(.+)' -and $detail -notmatch 'Property failed after') {
                    if ($errorMsg -eq "" -or $errorMsg -match '^Property failed') {
                        $assertMsg = $Matches[0].Trim()
                        if ($errorMsg -match '^Property failed') {
                            $errorMsg = "$errorMsg - $assertMsg"
                        } else {
                            $errorMsg = $assertMsg
                        }
                    }
                }
                if ($detail -match '^\s*(Expected|Received|EBUSY|ENOENT|TypeError|ReferenceError)') {
                    if ($cause -eq "") { $cause = $detail.Trim() }
                }
                # Source: Vitest uses arrow chars (garbled on Windows) followed by file:line:col
                # Pattern: " <arrow> src/file.test.jsx:123:45"
                if ($detail -match '^\s*\S+\s+(src/\S+\.test\.\S+:\d+:\d+)' -and $source -eq "") {
                    $source = $Matches[1].Trim()
                }
            }

            $failure = @{
                TestName = $testPath
                Error = if ($cause -ne "") {
                    if ($errorMsg -ne "") { "$errorMsg`n             Cause: $cause" } else { $cause }
                } elseif ($errorMsg -ne "") { $errorMsg } else { "(see raw output)" }
                Counterexample = $counterexample
                Source = $source
            }
            $failures.Add($failure)
        }

        # Also stop the failed section at the summary line
        if ($inFailedSection -and $line -match '^\s*Test Files\s+') {
            $inFailedSection = $false
        }
    }

    return $failures
}

function Format-FailureDetails {
    param(
        [System.Collections.Generic.List[hashtable]]$failures,
        [string]$runner
    )

    $output = [System.Collections.Generic.List[string]]::new()

    if ($failures.Count -eq 0) {
        return $output
    }

    $output.Add("")
    $output.Add("  Failure Details:")
    $output.Add("  " + ("-" * 40))

    $num = 0
    foreach ($f in $failures) {
        $num++
        $output.Add("")
        $output.Add("  [$num] $($f.TestName)")
        $output.Add("       Error: $($f.Error)")
        if ($f.Counterexample -ne "") {
            $output.Add("       Counterexample: $($f.Counterexample)")
        }
        if ($f.Source -ne "") {
            $output.Add("       Source: $($f.Source)")
        }
    }

    $output.Add("")

    return $output
}

# ── Report Building ──────────────────────────────────────

$scriptStart = Get-Date

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
$allFailureDetails = [System.Collections.Generic.List[hashtable]]::new()
$backendDuration = 0
$frontendDuration = 0

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

    if ($be.FailedSuiteNames.Count -gt 0) {
        $report.Add("")
        $report.Add("Failed suites:")
        foreach ($s in $be.FailedSuiteNames) {
            $report.Add("  FAIL  $s")
        }

        # Extract and append inline failure details
        $beFailures = Extract-JestFailureDetails $backendLines
        $beDetails = Format-FailureDetails $beFailures "Jest"
        foreach ($line in $beDetails) { $report.Add($line) }
        foreach ($f in $beFailures) { $allFailureDetails.Add($f) }

        $report.Add("(Full output: test-backend-raw.txt)")
    }
    else {
        $report.Add("")
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

    if ($fe.FailedSuiteNames.Count -gt 0) {
        $report.Add("")
        $report.Add("Failed suites:")
        foreach ($s in $fe.FailedSuiteNames) {
            $report.Add("  FAIL  $s")
        }

        # Extract and append inline failure details
        $feFailures = Extract-VitestFailureDetails $frontendLines
        $feDetails = Format-FailureDetails $feFailures "Vitest"
        foreach ($line in $feDetails) { $report.Add($line) }
        foreach ($f in $feFailures) { $allFailureDetails.Add($f) }

        $report.Add("(Full output: test-frontend-raw.txt)")
    }
    else {
        $report.Add("")
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

$totalDuration = [math]::Round(((Get-Date) - $scriptStart).TotalSeconds, 1)

$report.Add($separator)
$report.Add("  TOTALS")
$report.Add($separator)
$report.Add("Suites: $totalSuites total")
$report.Add("Tests:  $totalPassed passed, $totalFailed failed, $($totalPassed + $totalFailed) total")
$report.Add("")

$report.Add("TIMING:")
if (-not $SkipBackend) {
    $report.Add("  Backend:  ${backendDuration}s")
}
if (-not $SkipFrontend) {
    $report.Add("  Frontend: ${frontendDuration}s")
}
$report.Add("  Total:    ${totalDuration}s")
$report.Add("")

if ($allFailedSuites.Count -gt 0) {
    $report.Add("ALL FAILED SUITES ($($allFailedSuites.Count)):")
    foreach ($s in $allFailedSuites) {
        $report.Add("  - $s")
    }
    $report.Add("")

    # ── Consolidated Failure Details ─────────────────────
    $report.Add($separator)
    $report.Add("  ALL FAILURE DETAILS ($($allFailureDetails.Count) tests)")
    $report.Add($separator)

    $num = 0
    foreach ($f in $allFailureDetails) {
        $num++
        $report.Add("")
        $report.Add("  [$num] $($f.TestName)")
        $report.Add("       Error: $($f.Error)")
        if ($f.Counterexample -ne "") {
            $report.Add("       Counterexample: $($f.Counterexample)")
        }
        if ($f.Source -ne "") {
            $report.Add("       Source: $($f.Source)")
        }
    }
    $report.Add("")
}
else {
    $report.Add("All tests passed.")
}

$report.Add("Report written: $timestamp")
$report.Add("Raw output: test-backend-raw.txt, test-frontend-raw.txt")

# ── Write Report ─────────────────────────────────────────

$report | Out-File -FilePath $reportPath -Encoding UTF8

Write-Host ""
Write-Host "Summary: $reportPath" -ForegroundColor Cyan
Write-Host "Total execution time: ${totalDuration}s" -ForegroundColor Cyan

# Also print failure details to console for quick visibility
if ($allFailureDetails.Count -gt 0) {
    Write-Host ""
    Write-Host "  FAILURE DETAILS:" -ForegroundColor Red
    Write-Host "  $("-" * 50)" -ForegroundColor DarkGray
    $num = 0
    foreach ($f in $allFailureDetails) {
        $num++
        Write-Host "  [$num] " -ForegroundColor Red -NoNewline
        Write-Host $f.TestName -ForegroundColor White
        Write-Host "       Error: " -ForegroundColor DarkGray -NoNewline
        Write-Host $f.Error -ForegroundColor Yellow
        if ($f.Counterexample -ne "") {
            Write-Host "       Counterexample: " -ForegroundColor DarkGray -NoNewline
            Write-Host $f.Counterexample -ForegroundColor Magenta
        }
        if ($f.Source -ne "") {
            Write-Host "       Source: " -ForegroundColor DarkGray -NoNewline
            Write-Host $f.Source -ForegroundColor DarkCyan
        }
    }
    Write-Host ""
}

if ($totalFailed -gt 0) {
    Write-Host "Result:  $totalPassed passed, $totalFailed failed across $totalSuites suites" -ForegroundColor Red
    exit 1
}
else {
    Write-Host "Result:  $totalPassed passed, 0 failed across $totalSuites suites" -ForegroundColor Green
    exit 0
}
