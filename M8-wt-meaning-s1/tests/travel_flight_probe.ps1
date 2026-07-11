# Build-184 -- LIVE flight probe wrapper (PS 5.1, ASCII).
#
# Thin wrapper around tests/travel_flight_probe.js. Loads M8/.env.local (gitignored)
# so SERPAPI_KEY is available WITHOUT ever being pasted in chat or committed, finds
# node via PATH then the Kimi bundled runtime (the ctx_cache_probe / P1-P3 pattern),
# and runs the probe. NETWORK + key required; read-only search (no booking/payment).
#
# The key is loaded into the process env only; it is NEVER printed by this script.

$ErrorActionPreference = 'Stop'
$m8Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$probe = Join-Path $m8Root 'tests\travel_flight_probe.js'

# Load .env.local (KEY=VALUE per line, '#' comments ignored) into the process env.
$envFile = Join-Path $m8Root '.env.local'
if (Test-Path $envFile) {
  foreach ($line in [IO.File]::ReadAllLines($envFile)) {
    $t = $line.Trim()
    if ((-not $t) -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    $k = $t.Substring(0, $i).Trim()
    $v = $t.Substring($i + 1).Trim()
    if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) { $v = $v.Substring(1, $v.Length - 2) }
    Set-Item -Path ("Env:" + $k) -Value $v
  }
}

if (-not $env:SERPAPI_KEY) {
  Write-Host "SERPAPI_KEY not found (env or M8/.env.local). Set it, then re-run." -ForegroundColor Yellow
  Write-Host "  In PowerShell for this shell only:  `$env:SERPAPI_KEY = '<your key>'" -ForegroundColor Yellow
  exit 0
}

# Locate node: PATH first, then Kimi bundled runtime.
$_nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($_nodeCmd) { $nodeBin = $_nodeCmd.Source }
else { $nodeBin = "$env:LOCALAPPDATA\Programs\kimi-desktop\resources\resources\runtime\node.exe" }
if (-not (Test-Path $nodeBin)) {
  Write-Host "FATAL: node not found. Add Node.js to PATH or install it from nodejs.org." -ForegroundColor Red
  exit 1
}

& $nodeBin $probe
exit $LASTEXITCODE
