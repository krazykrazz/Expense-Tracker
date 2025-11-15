Set WshShell = CreateObject("WScript.Shell")

' Get the directory where this script is located
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Stop the servers silently
WshShell.Run "cmd /c cd /d """ & scriptDir & """ && stop-servers.bat", 0, True

' Show notification
WshShell.Popup "Expense Tracker servers have been stopped.", 2, "Expense Tracker", 64
