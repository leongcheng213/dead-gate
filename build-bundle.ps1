# build-bundle.ps1 — assemble dead-gate-runchat.html: the whole game
# (engine + 3D models + logic) inlined into one self-contained file for RunChat.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = [System.IO.File]::ReadAllText("$dir\index.html")
$inline = @{
  './three.min.js'        = 'three.min.js'
  './models/ammo-icon.js' = 'models\ammo-icon.js'
  './main.js'             = 'main.js'
}
$kept = @()
foreach ($ln in ($html -split "`n")) {
  if ($ln -match 'document\.write') { continue } # CDN fallbacks: not needed, engine is inlined
  if ($ln -match '<script src="([^"]+)"></script>') {
    $src = $Matches[1]
    if ($inline.ContainsKey($src)) {
      $js = [System.IO.File]::ReadAllText("$dir\" + $inline[$src]).Replace('</script', '<\/script')
      $kept += '<script>' + $js + '</script>'
      continue
    }
  }
  $kept += $ln
}
[System.IO.File]::WriteAllText("$dir\dead-gate-runchat.html", ($kept -join "`n"))
echo "bundle bytes=" + [System.IO.File]::ReadAllText("$dir\dead-gate-runchat.html").Length
