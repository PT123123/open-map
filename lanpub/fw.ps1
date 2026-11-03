# 放行 Windows 防火墙 8080-8090 端口（需管理员，会弹出 UAC 确认）
$rule = 'advfirewall firewall add rule name=OpenMapLAN dir=in action=allow protocol=TCP localport=8080-8090'
Start-Process -FilePath 'netsh.exe' -ArgumentList $rule -Verb RunAs -Wait
Write-Host '完成。本窗口可以关闭。'
Start-Sleep -Seconds 3
