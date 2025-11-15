# Expense Tracker System Tray Application
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Get script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Create icon (using a built-in icon)
$icon = [System.Drawing.SystemIcons]::Application

# Create context menu
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

# Menu: Open App
$menuOpen = New-Object System.Windows.Forms.ToolStripMenuItem
$menuOpen.Text = "Open Expense Tracker"
$menuOpen.Add_Click({
    Start-Process "http://localhost:5173"
})
$contextMenu.Items.Add($menuOpen)

# Menu: Separator
$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

# Menu: Start Servers
$menuStart = New-Object System.Windows.Forms.ToolStripMenuItem
$menuStart.Text = "Start Servers"
$menuStart.Add_Click({
    $notifyIcon.ShowBalloonTip(3000, "Expense Tracker", "Starting servers...", [System.Windows.Forms.ToolTipIcon]::Info)
    
    # Start backend
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$scriptPath\backend`" && npm run dev" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    
    # Start frontend
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$scriptPath\frontend`" && npm run dev" -WindowStyle Hidden
    
    Start-Sleep -Seconds 2
    $notifyIcon.ShowBalloonTip(3000, "Expense Tracker", "Servers started! Access at http://localhost:5173", [System.Windows.Forms.ToolTipIcon]::Info)
})
$contextMenu.Items.Add($menuStart)

# Menu: Stop Servers
$menuStop = New-Object System.Windows.Forms.ToolStripMenuItem
$menuStop.Text = "Stop Servers"
$menuStop.Add_Click({
    $notifyIcon.ShowBalloonTip(2000, "Expense Tracker", "Stopping servers...", [System.Windows.Forms.ToolTipIcon]::Info)
    
    # Kill processes on port 2424 and 5173
    Get-NetTCPConnection -LocalPort 2424 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    
    Start-Sleep -Seconds 1
    $notifyIcon.ShowBalloonTip(2000, "Expense Tracker", "Servers stopped!", [System.Windows.Forms.ToolTipIcon]::Info)
})
$contextMenu.Items.Add($menuStop)

# Menu: Separator
$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

# Menu: Exit
$menuExit = New-Object System.Windows.Forms.ToolStripMenuItem
$menuExit.Text = "Exit"
$menuExit.Add_Click({
    # Stop servers before exiting
    Get-NetTCPConnection -LocalPort 2424 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    
    $notifyIcon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})
$contextMenu.Items.Add($menuExit)

# Create system tray icon
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = $icon
$notifyIcon.Text = "Expense Tracker"
$notifyIcon.Visible = $true
$notifyIcon.ContextMenuStrip = $contextMenu

# Double-click to open app
$notifyIcon.Add_DoubleClick({
    Start-Process "http://localhost:5173"
})

# Show initial notification
$notifyIcon.ShowBalloonTip(3000, "Expense Tracker", "System tray icon loaded! Right-click for options.", [System.Windows.Forms.ToolTipIcon]::Info)

# Auto-start servers on launch
$notifyIcon.ShowBalloonTip(3000, "Expense Tracker", "Starting servers...", [System.Windows.Forms.ToolTipIcon]::Info)

# Start backend
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$scriptPath\backend`" && npm run dev" -WindowStyle Hidden
Start-Sleep -Seconds 3

# Start frontend
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$scriptPath\frontend`" && npm run dev" -WindowStyle Hidden

Start-Sleep -Seconds 2
$notifyIcon.ShowBalloonTip(3000, "Expense Tracker", "Ready! Access at http://localhost:5173", [System.Windows.Forms.ToolTipIcon]::Info)

# Keep script running
[System.Windows.Forms.Application]::Run()
