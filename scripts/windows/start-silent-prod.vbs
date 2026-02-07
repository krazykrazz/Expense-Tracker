Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Navigate two levels up to project root (scripts/windows/ -> project root)
projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))

' Start backend server in production mode (hidden)
WshShell.Run "cmd /c cd /d """ & projectRoot & "\backend"" && npm start", 0, False

' Optional: Show a notification that the app started
WshShell.Popup "Expense Tracker is starting in the background..." & vbCrLf & vbCrLf & "Access at: http://localhost:2424", 3, "Expense Tracker", 64
