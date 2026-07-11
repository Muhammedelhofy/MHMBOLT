# groq_live_probe.ps1 -- B-177 Groq migration GO/NO-GO gate (SPEC §5).
#
# Thin wrapper around tests/groq_live_probe.js. Finds node via PATH first, then
# the Kimi bundled runtime (the P1-P3 harness pattern). NETWORK + a Groq key are
# required, so this is NOT a *.test.ps1 (never enters the offline battery).
#
# Set the key locally FIRST (never committed, never echoed):
#     $env:GROQ_API_KEY = "gsk_..."        # this shell only
#   OR put   GROQ_API_KEY=gsk_...   in   M8/.env.local   (gitignored)
#
# Run from the M8/ directory:
#     powershell -File tests/groq_live_probe.ps1
#
# The probe prints "key: set" / "key: missing" only -- it never prints the value.
# Verdict table is written to reports/build-177-probe.{json,md}.

$ErrorActionPreference = "Stop"

# Locate node: PATH first, then Kimi bundled runtime.
$_nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($_nodeCmd) { $nodeBin = $_nodeCmd.Source }
else { $nodeBin = "$env:LOCALAPPDATA\Programs\kimi-desktop\resources\resources\runtime\node.exe" }
if (-not (Test-Path $nodeBin)) {
  Write-Host "FATAL: node not found. Add Node.js to PATH or install it from nodejs.org."
  exit 1
}

# node_modules must be present (llm.js requires @google/genai at load). If absent,
# tell the user to install deps rather than failing cryptically.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$m8Root    = Split-Path -Parent $scriptDir
if (-not (Test-Path (Join-Path $m8Root "node_modules\@google\genai"))) {
  Write-Host "FATAL: node_modules missing (@google/genai). Run 'npm install' in M8/ first."
  exit 1
}

$probe = Join-Path $scriptDir "groq_live_probe.js"
& $nodeBin $probe
exit $LASTEXITCODE
