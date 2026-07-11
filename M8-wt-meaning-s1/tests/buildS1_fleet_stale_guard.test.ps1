# tests/buildS1_fleet_stale_guard.test.ps1
# PS-5.1 ASCII MIRROR of Build-S1 "fleet-staleness guard" (no local Node).
# Covers:
#   1. detectFleetStale semantics (pure reimplementation of lib/fleet.js's version):
#      STALE only once record._syncedAt is older than the 3-day default threshold;
#      unknown sync time fails SAFE (never stale).
#   2. fleetStaleGuardEnabled kill-switch semantics (default ON; off/0 -> disabled),
#      mirroring healthRailEnabled's case-insensitive convention.
#   3. fleetStaleDirective framing text (extracted from source, no drift possible).
#   4. STATIC WIRE GUARDS: detector/directive/switch defined & exported in fleet.js,
#      both orchestrator compose sites gated on fleetCtx.text && fleetStaleGuardEnabled(),
#      the mutation calls fleetStaleDirective(...) at exactly 2 sites.
# "PASS" = exit 0.

$ErrorActionPreference = 'Stop'
$script:pass = 0; $script:fail = 0
function Ok($cond, $label) {
  if ($cond) { $script:pass++; Write-Output ("  PASS  " + $label) }
  else       { $script:fail++; Write-Output ("  FAIL  " + $label) }
}
function OkEq($expected, $actual, $label) {
  if ("$expected" -eq "$actual") { $script:pass++; Write-Output ("  PASS  " + $label) }
  else { $script:fail++; Write-Output ("  FAIL  " + $label + "  exp=[" + $expected + "] got=[" + $actual + "]") }
}

$root      = Split-Path $PSScriptRoot -Parent
$fleetFile = Join-Path $root 'lib\fleet.js'
$orchFile  = Join-Path $root 'lib\orchestrator.js'
$fleet = [IO.File]::ReadAllText($fleetFile, [Text.Encoding]::UTF8)
$orch  = [IO.File]::ReadAllText($orchFile,  [Text.Encoding]::UTF8)

Write-Output "`nBuild-S1 fleet-staleness guard (PS-5.1 mirror)`n"

# ---- 1. detectFleetStale -- pure reimplementation (default 3-day threshold) ----
function DetectFleetStale([Nullable[double]]$syncedHoursAgo, [string]$asOfDate, [int]$thresholdDays = 3) {
  if ($null -eq $syncedHoursAgo) { return @{ stale = $false; asOfDate = $asOfDate; daysStale = $null } }
  $daysStale = [Math]::Round(($syncedHoursAgo / 24.0) * 10) / 10
  $stale = $daysStale -ge $thresholdDays
  return @{ stale = $stale; asOfDate = $asOfDate; daysStale = $daysStale }
}

$fresh = DetectFleetStale 2 "5 Jul 2026"
Ok (-not $fresh.stale) "FRESH mock (synced 2h ago): stale = false"
OkEq "5 Jul 2026" $fresh.asOfDate "FRESH mock: asOfDate = newest entry period"

$stale = DetectFleetStale 100 "5 Jul 2026"
Ok ($stale.stale) "STALE mock (synced ~4.2 days ago, default 3d threshold): stale = true"
Ok ($stale.daysStale -gt 4 -and $stale.daysStale -lt 4.5) "STALE mock: daysStale is a plausible ~4.2"

$borderline = DetectFleetStale 60 "5 Jul 2026"
Ok (-not $borderline.stale) "borderline mock (2.5 days, under 3d default): stale = false"

$unknown = DetectFleetStale $null "5 Jul 2026"
Ok (-not $unknown.stale) "unknown sync time: stale = false (fail-safe)"
OkEq "" "$($unknown.daysStale)" "unknown sync time: daysStale is null"

$thirtyHours = DetectFleetStale 30 "5 Jul 2026"
Ok (-not $thirtyHours.stale) "30h-old sync: NOT stale at default 3-day threshold"

# ---- 2. kill-switch semantics (mirror of fleetStaleGuardEnabled) --------------
function FleetStaleGuardEnabled([string]$v) { $x = "$v".Trim().ToLower(); return ($x -ne '0' -and $x -ne 'off') }
Ok (FleetStaleGuardEnabled '')      "fleetStaleGuardEnabled default ON (empty)"
Ok (-not (FleetStaleGuardEnabled 'off')) "fleetStaleGuardEnabled('off') = false"
Ok (-not (FleetStaleGuardEnabled '0'))   "fleetStaleGuardEnabled('0') = false"
Ok (-not (FleetStaleGuardEnabled 'OFF')) "fleetStaleGuardEnabled('OFF') case-insensitive = false"

# ---- 3. fleetStaleDirective framing (extract the REAL template from source) --
$dirMatch = [regex]::Match($fleet, 'function fleetStaleDirective\(staleInfo\) \{([\s\S]*?)\n\}')
Ok ($dirMatch.Success) "extracted fleetStaleDirective body from fleet.js"
$dirBody = $dirMatch.Groups[1].Value
Ok ($dirBody -match 'frozen as of') "directive: leads with the frozen-as-of framing"
Ok ($dirBody -match 'nightly sync has stopped') "directive: names the nightly sync having stopped"
Ok ($dirBody -match 'NEVER describe these numbers as') "directive: forbids today/currently/now/live wording"
Ok ($dirBody -match 'honest ARCHIVE, not a refusal') "directive: explicitly NOT a refusal"
Ok ($dirBody -match 'an earlier date') "directive: has a fallback for a missing asOfDate"

# ---- 4. STATIC WIRE GUARDS -----------------------------------------------------
# fleet.js
Ok ($fleet -match 'function\s+detectFleetStale\s*\(')      "fleet.js defines detectFleetStale"
Ok ($fleet -match 'M8_FLEET_STALE_GUARD')                  "fleet.js defines M8_FLEET_STALE_GUARD kill-switch"
Ok ($fleet -match 'function\s+fleetStaleGuardEnabled\s*\(') "fleet.js defines fleetStaleGuardEnabled"
Ok ($fleet -match 'function\s+fleetStaleDirective\s*\(')   "fleet.js defines fleetStaleDirective"
Ok ($fleet -match 'M8_FLEET_STALE_DAYS \|\| 3')             "fleet.js reads M8_FLEET_STALE_DAYS (default 3)"
Ok ($fleet -match 'fleetStaleGuardEnabled, detectFleetStale, fleetStaleDirective') "fleet.js exports the three S1 symbols"

# orchestrator.js -- both compose sites, each switch-gated
$gate = ([regex]::Matches($orch, 'fleetCtx\.text\s*&&\s*fleetStaleGuardEnabled\(\)')).Count
OkEq 2 $gate "orchestrator gates the guard at BOTH compose sites (fleetCtx.text && fleetStaleGuardEnabled())"
$directiveCalls = ([regex]::Matches($orch, 'fleetStaleDirective\(')).Count
OkEq 2 $directiveCalls "orchestrator calls fleetStaleDirective(...) at exactly 2 sites (buffered + stream)"
Ok ($orch -match 'getFleetRecord, decodeHistory, fleetStaleGuardEnabled, detectFleetStale, fleetStaleDirective') "orchestrator imports the S1 symbols from ./fleet"

Write-Output ""
Write-Output ("Build-S1 fleet-staleness guard PS mirror: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
