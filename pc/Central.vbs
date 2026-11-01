' Abre a Central no PC: liga o ajudante (escondido) e abre o app em tela cheia
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
d = fs.GetParentFolderName(WScript.ScriptFullName)
On Error Resume Next
Set t = fs.CreateTextFile(d & "\vbs_ok.txt", True): t.WriteLine Now: t.Close
' o ajudante já está ligado? se for uma versão antiga, reinicia com a nova
k = ""
If fs.FileExists(d & "\ajudante_chave.js") Then
  Set f = fs.OpenTextFile(d & "\ajudante_chave.js", 1): tx = f.ReadAll: f.Close
  i = InStr(tx, "'"): If i > 0 Then k = Mid(tx, i + 1, InStr(i + 1, tx, "'") - i - 1)
End If
v = ""
Set x = CreateObject("MSXML2.XMLHTTP")
x.Open "GET", "http://localhost:47803/?k=" & k, False
x.Send
If Err.Number = 0 Then v = x.responseText
Err.Clear
If InStr(v, """versao"":36") > 0 Then
  ' tudo certo
ElseIf InStr(v, "versao") > 0 Then
  Set x = CreateObject("MSXML2.XMLHTTP"): x.Open "GET", "http://localhost:47803/reiniciar?k=" & k, False: x.Send
  Err.Clear
  WScript.Sleep 3000
Else
  sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & d & "\ajudante.ps1""", 0, False
  WScript.Sleep 2500
End If
On Error GoTo 0
' se a janela da Central ja estava aberta, so traz para a frente e recarrega
If sh.AppActivate("Central no PC") Then
  WScript.Sleep 500: sh.SendKeys "{F5}": WScript.Quit
End If
' se a Central foi instalada como app do Edge, abre por ele (ícone próprio na barra de tarefas)
pwa = sh.ExpandEnvironmentStrings("%APPDATA%") & "\Microsoft\Windows\Start Menu\Programs\Central no PC.lnk"
If fs.FileExists(pwa) Then
  sh.Run """" & pwa & """", 1, False
Else
  sh.Run "msedge --app=http://localhost:47803/app/Central.html --start-maximized --window-size=1920,1080 --window-position=0,0", 1, False
End If
