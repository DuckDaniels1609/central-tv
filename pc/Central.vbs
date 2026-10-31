' Abre a Central no PC: liga o ajudante (escondido) e abre o app em 1920x1080
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
d = fs.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & d & "\ajudante.ps1""", 0, False
WScript.Sleep 2000
sh.Run "msedge --app=""file:///" & Replace(d, "\", "/") & "/Central.html"" --window-size=1920,1080 --window-position=0,0", 1, False
