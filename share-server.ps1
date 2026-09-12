# share-server.ps1 — one-command LAN host for DEAD GATE multiplayer.
# Run:  powershell -ExecutionPolicy Bypass -File share-server.ps1 [port]
# Then tell friends your IP + room code (both are printed below).
param([int]$Port = 8901)

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Python must exist.
try { Get-Command python -ErrorAction Stop | Out-Null }
catch {
  Write-Host ''
  Write-Host '  Python not found. Install it from https://www.python.org/downloads/' -ForegroundColor Red
  Write-Host '  (tick "Add python.exe to PATH" during setup), then run this again.'
  pause; exit 1
}

# 2. Show this PC's LAN addresses so friends know where to connect.
$ips = @()
try {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress -Unique
} catch {
  $ips = @('127.0.0.1')
}
$lan = @($ips | Where-Object { $_ -like '192.168.*' -or $_ -like '10.*' -or $_ -like '172.1[6-9].*' -or $_ -like '172.2*.*' -or $_ -like '172.3[01].*' })
if (-not $lan.Count) { $lan = @($ips) }

Write-Host ''
Write-Host '  DEAD GATE — multiplayer host' -ForegroundColor Green
Write-Host '  ================================'
foreach ($ip in $lan) {
  Write-Host "  Friends open:  http://$($ip):$Port/" -ForegroundColor Yellow
}
Write-Host "  You open:      http://localhost:$Port/" -ForegroundColor Yellow
Write-Host ''

# 3. Open Windows Firewall for the port (needs one admin run; otherwise
# Windows usually asks with an "Allow access?" popup on first run).
$ruleName = "DEAD GATE $Port"
try {
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
      ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow | Out-Null
      Write-Host '  Firewall: port opened.' -ForegroundColor Green
    } else {
      Write-Host '  Firewall: not running as admin, so the port was NOT auto-opened.' -ForegroundColor DarkYellow
      Write-Host '  If friends cannot connect: right-click PowerShell > Run as administrator,'
      Write-Host "  then run this script once — or click Allow if Windows asks."
    }
  } else {
    Write-Host '  Firewall: port already open.' -ForegroundColor Green
  }
} catch {
  Write-Host '  Firewall: could not check rules; if friends cannot connect, allow the popup or run as admin.'
}
Write-Host ''
Write-Host '  Steps:  1) keep this window open   2) open the URL above'
Write-Host '         3) MULTIPLAYER > CREATE      4) tell friends the IP + 4-letter code'
Write-Host '         5) wait for them in the roster, then START HUNT'
Write-Host '  Stop the server any time with Ctrl+C.'
Write-Host ''

# 4. Serve (foreground — closing/Ctrl+C stops sharing).
& python "$dir\server.py" $Port
