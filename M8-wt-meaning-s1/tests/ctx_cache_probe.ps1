# ctx_cache_probe.ps1 -- B-178 context-cache live probe (SPEC §5 Probe B).
#
# Thin wrapper around tests/ctx_cache_probe.js. Finds node via PATH first, then
# the Kimi bundled runtime (the B-177 / P1-P3 harness pattern). NETWORK + keys
# required, so this is NOT a *.test.ps1 (never enters the offline battery).
#
# Set keys locally FIRST (never committed, never echoed):
#     $env:GROQ_API_KEY = "gsk_..."; $env:GEMINI_API_KEY = "..."   # this shell only
#   OR put   GROQ_API_KEY=...  /  GEMINI_API_KEY=...   in   M8/.env.local  (gitignored)
#
# Run from the M8/ directory:
#     powershell -File tests/ctx_cache_probe.ps1
#
# Prints only "<provider> key: set|missing" -- never the value. Verdict table is
# written to reports/build-178-cache-probe.{json,md}. INFORMATIVE, not blocking.

$ErrorActionPreference = "Stop"

# Locate node: PATH first, then Kimi bundled runtime.
$_nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($_nodeCmd) { $nodeBin = $_nodeCmd.Source }
else { $nodeBin = "$env:LOCALAPPDATA\Programs\kimi-desktop\resources\resources\runtime\node.exe" }
if (-not (Test-Path $nodeBin)) {
  Write-Host "FATAL: node not found. Add Node.js to PATH or install it from nodejs.org."
  exit 1
}

# node_modules must be present (llm.js requires @google/genai at load).
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$m8Root    = Split-Path -Parent $scriptDir
if (-not (Test-Path (Join-Path $m8Root "node_modules\@google\genai"))) {
  Write-Host "FATAL: node_modules missing (@google/genai). Run 'npm install' in M8/ first."
  exit 1
}

$probe = Join-Path $scriptDir "ctx_cache_probe.js"
& $nodeBin $probe
exit $LASTEXITCODE
