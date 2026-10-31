' Abre a Central no PC: liga o ajudante (escondido) e abre o app em 1920x1080
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
d = fs.GetParentFolderName(WScript.ScriptFullName)
On Error Resume Next
Set t = fs.CreateTextFile(d & "\vbs_ok.txt", True): t.WriteLine Now: t.Close
On Error GoTo 0
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & d & "\ajudante.ps1""", 0, False
WScript.Sleep 2000
sh.Run "msedge --app=""file:///" & Replace(d, "\", "/") & "/Central.html"" --window-size=1920,1080 --window-position=0,0", 1, False
