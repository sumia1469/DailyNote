Option Explicit
Dim shell, fso, root, shortcut
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count <> 1 Then WScript.Quit 1
root = fso.GetAbsolutePathName(WScript.Arguments(0))
If Not fso.FileExists(fso.BuildPath(root, "Start_DailyNote.bat")) Then WScript.Quit 1
Set shortcut = shell.CreateShortcut(fso.BuildPath(shell.SpecialFolders("Desktop"), "DailyNote.lnk"))
shortcut.TargetPath = fso.BuildPath(root, "Start_DailyNote.bat")
shortcut.WorkingDirectory = root
shortcut.IconLocation = fso.BuildPath(root, "public\images\dailynote.ico") & ",0"
shortcut.Description = "DailyNote Local Server"
shortcut.WindowStyle = 1
shortcut.Save
