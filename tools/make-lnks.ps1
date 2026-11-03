# 生成快捷方式 .lnk
$ErrorActionPreference = 'Stop'
$ws = New-Object -ComObject WScript.Shell

function Mk($path, $target, $a, $workdir, $icon, $style) {
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = $target
  $s.Arguments = $a
  $s.WorkingDirectory = $workdir
  $s.WindowStyle = $style
  if ($icon) { $s.IconLocation = $icon }
  $s.Save()
  Write-Host ('OK ' + $path)
}

Mk 'C:\Users\ted\Desktop\map\启动局域网服务.lnk' `
   'C:\Program Files\nodejs\node.exe' `
   '"C:\Users\ted\Desktop\map\lanpub\server.js"' `
   'C:\Users\ted\Desktop\map\lanpub' `
   'C:\Users\ted\Desktop\map\lanpub\map.ico' 7

Mk 'C:\Users\ted\Desktop\map\desktop\启动地图.lnk' `
   'C:\Users\ted\Desktop\map\desktop\node_modules\electron\dist\electron.exe' `
   '"C:\Users\ted\Desktop\map\desktop"' `
   'C:\Users\ted\Desktop\map\desktop' `
   'C:\Users\ted\Desktop\map\lanpub\map.ico' 1

Mk 'C:\Users\ted\Desktop\map\防火墙放行(点一次).lnk' `
   'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
   '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\ted\Desktop\map\lanpub\fw.ps1"' `
   'C:\Users\ted\Desktop\map' `
   '' 7
