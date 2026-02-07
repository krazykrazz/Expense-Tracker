Set WshShell = CreateObject("WScript.Shell")

' Get the directory where this script is located
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Start backend server in production mode (hidden)
WshShell.Run "cmd /c cd /d """ & scriptDir & "\backend"" && npm start", 0, False

' Optional: Show a notification that the app started
WshShell.Popup "Expense Tracker is starting in the background..." & vbCrLf & vbCrLf & "Access at: http://localhost:2424", 3, "Expense Tracker", 64
