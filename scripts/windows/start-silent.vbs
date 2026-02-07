Set WshShell = CreateObject("WScript.Shell")

' Get the directory where this script is located
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Start backend server (hidden)
WshShell.Run "cmd /c cd /d """ & scriptDir & "\backend"" && npm run dev", 0, False

' Wait 3 seconds for backend to initialize
WScript.Sleep 3000

' Start frontend dev server (hidden)
WshShell.Run "cmd /c cd /d """ & scriptDir & "\frontend"" && npm run dev", 0, False

' Optional: Show a notification that the app started
WshShell.Popup "Expense Tracker is starting in the background..." & vbCrLf & vbCrLf & "Access at: http://localhost:5173", 3, "Expense Tracker", 64
