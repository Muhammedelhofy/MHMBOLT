# tests/buildR4_health_rail.test.ps1
# PS-5.1 ASCII MIRROR of Build-R4 "Health rail + historical-text mode" (no local Node).
# Faithful-by-construction: the health TRIGGER test uses the ACTUAL HEALTH_SHAPE_RE regex
# extracted from lib/discovery.js and run through .NET regex, so the mirror can never drift
# from the source pattern. Covers:
#   1. detectHealthContext behaviour: canary fires, planted-context follow-up fires, and it
#      DOES NOT fire on fleet / wallet / generic-collision / 3-6-9 number-theory turns.
#   2. sec-2b two-truths rule (pure): world-claim -> speculative (even from an established source),
#      text-fact inherits; OFF (opts absent) -> inherits (byte-identical to pre-R4).
#   3. M8_HEALTH_RAIL kill-switch semantics (default ON; off/0 -> disabled).
#   4. STATIC WIRE GUARDS: detector/directive/switch defined & exported in discovery.js, both
#      orchestrator inject sites present and switch-gated, the two-truths layer + healthTextModeFor
#      wired in knowledge-intake.js, the signed-off never-list wording present (ASCII fragments),
#      no new api/ fn, no SQL migration.
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

$root     = Split-Path $PSScriptRoot -Parent
$discFile = Join-Path $root 'lib\discovery.js'
$orchFile = Join-Path $root 'lib\orchestrator.js'
$kiFile   = Join-Path $root 'lib\knowledge-intake.js'
$disc = [IO.File]::ReadAllText($discFile, [Text.Encoding]::UTF8)
$orch = [IO.File]::ReadAllText($orchFile, [Text.Encoding]::UTF8)
$ki   = [IO.File]::ReadAllText($kiFile,   [Text.Encoding]::UTF8)

Write-Output "`nBuild-R4 health rail + historical-text mode (PS-5.1 mirror)`n"

# ---- 0. extract the REAL HEALTH_SHAPE_RE from source (no drift possible) ----
$reMatch = [regex]::Match($disc, 'const\s+HEALTH_SHAPE_RE\s*=\s*/(.*?)/i;')
Ok ($reMatch.Success) "extracted HEALTH_SHAPE_RE literal from discovery.js"
$pat = $reMatch.Groups[1].Value
$opts = [Text.RegularExpressions.RegexOptions]::IgnoreCase

# mirror of detectHealthContext: this turn + last 4 USER turns (array of strings), joined
function DetectHealth([string]$message, [string[]]$userTurns) {
  $recent = ''
  if ($userTurns) { $recent = (($userTurns | Select-Object -Last 4) -join "`n") }
  $joined = "$message`n$recent"
  return [regex]::IsMatch($joined, $pat, $opts)
}

# ---- 1. the topical trigger ------------------------------------------------
Ok (DetectHealth "Ibn Sina recommended X for headaches - should I take it?" @())      "canary fires (Ibn Sina + headaches)"
Ok (DetectHealth "what remedy did al-Razi prescribe for smallpox?" @())               "al-Razi treatment turn fires"
Ok (DetectHealth "so should I take it?" @("Ibn Sina used willow bark for fever"))     "planted-context follow-up fires"
Ok (DetectHealth "what dose?" @("the text lists a herbal treatment for migraine"))    "bare 'dose?' fires on prior medical context"
Ok (-not (DetectHealth "what is driver 12 net earnings and tier this month?" @()))    "fleet turn does NOT fire"
Ok (-not (DetectHealth "show me the wallet balance in SAR and EGP" @()))              "wallet turn does NOT fire"
Ok (-not (DetectHealth "fleet health is strong, healthy utilization, the vehicle body shop, a pain point in onboarding" @())) "generic collision words do NOT fire"
Ok (-not (DetectHealth "is vortex math real? test the 3-6-9 digital root doubling claim to 10000" @())) "3-6-9 number-theory lane does NOT fire (R1-R3 untouched)"
Ok (-not (DetectHealth "so our surviving conjecture is basically proven now, right?" @())) "upgrade-pressure research turn does NOT fire the health rail"

# ---- 2. the sec-2b two-truths rule (pure reimplementation) -----------------
function EffectiveClass([string]$sourceClass, [string]$layer, [bool]$healthTextMode) {
  if ($healthTextMode -and ($layer.ToLower() -eq 'world-claim')) { return 'speculative' }
  return $sourceClass
}
OkEq 'speculative' (EffectiveClass 'established' 'world-claim' $true)  "ON: world-claim from established -> speculative"
OkEq 'established' (EffectiveClass 'established' 'text-fact'  $true)  "ON: text-fact from established -> inherits established"
OkEq 'speculative' (EffectiveClass 'speculative' 'world-claim' $true) "ON: world-claim from speculative stays speculative"
OkEq 'established' (EffectiveClass 'established' 'world-claim' $false) "OFF: world-claim inherits established (pre-R4 identity)"
OkEq 'established' (EffectiveClass 'established' ''           $true)  "ON: absent layer defaults to text-fact (inherits)"

# ---- 2b. ensureHealthClose -- the DETERMINISTIC coda (mirror) --------------
# Extract the blessed sentence from source so the .ps1 stays ASCII (it holds an em-dash).
$csMatch = [regex]::Match($disc, 'const\s+HEALTH_CLOSE_SENTENCE\s*=\s*"(.*?)";')
Ok ($csMatch.Success) "extracted HEALTH_CLOSE_SENTENCE literal from discovery.js"
$close = $csMatch.Groups[1].Value
function EnsureClose([string]$response, [bool]$isHealth, [bool]$railOn, [string]$closeSentence) {
  if (-not $railOn) { return $response }
  if (-not $isHealth) { return $response }
  $text = "$response"
  if ($text.Contains($closeSentence)) { return $response }
  $sep = ''
  if ($text.Length -ne 0) { if ($text.EndsWith("`n")) { $sep = "`n" } else { $sep = "`n`n" } }
  return $text + $sep + $closeSentence
}
$long = 'Ibn Sina recorded willow bark for headache; no modern evidence; see a clinician.'
$codedPS = EnsureClose $long $true $true $close
Ok ($codedPS.EndsWith($close) -and $codedPS.StartsWith($long)) "coda: appends verbatim close when model omitted it"
$already = "Some answer.`n`n$close"
Ok ((EnsureClose $already $true $true $close) -eq $already) "coda: idempotent (no duplicate when already present)"
Ok ((EnsureClose 'Fleet earned 47079 SAR.' $false $true $close) -eq 'Fleet earned 47079 SAR.') "coda: non-health turn untouched"
Ok ((EnsureClose $long $true $false $close) -eq $long) "coda: OFF-identity (rail off returns response untouched)"

# ---- 3. kill-switch semantics (mirror of healthRailEnabled) ----------------
function HealthRailEnabled([string]$v) { $x = "$v".Trim().ToLower(); return ($x -ne '0' -and $x -ne 'off') }
Ok (HealthRailEnabled '')      "healthRailEnabled default ON (empty)"
Ok (-not (HealthRailEnabled 'off')) "healthRailEnabled('off') = false"
Ok (-not (HealthRailEnabled '0'))   "healthRailEnabled('0') = false"
Ok (-not (HealthRailEnabled 'OFF')) "healthRailEnabled('OFF') case-insensitive = false"

# ---- 4. STATIC WIRE GUARDS -------------------------------------------------
# discovery.js
Ok ($disc -match 'const\s+HEALTH_SHAPE_RE\s*=')       "discovery.js defines HEALTH_SHAPE_RE"
Ok ($disc -match 'function\s+detectHealthContext\s*\(') "discovery.js defines detectHealthContext"
Ok ($disc -match 'const\s+HEALTH_RAIL_DIRECTIVE\s*=')  "discovery.js defines HEALTH_RAIL_DIRECTIVE"
Ok ($disc -match 'M8_HEALTH_RAIL')                     "discovery.js defines M8_HEALTH_RAIL kill-switch"
Ok ($disc -match 'function\s+healthRailEnabled\s*\(')  "discovery.js defines healthRailEnabled"
Ok ($disc -match 'const\s+HEALTH_CLOSE_SENTENCE\s*=')   "discovery.js defines HEALTH_CLOSE_SENTENCE (single source of truth)"
Ok ($disc -match 'function\s+ensureHealthClose\s*\(')   "discovery.js defines ensureHealthClose (deterministic coda)"
# the signed-off never-list wording is present (ASCII fragments only)
Ok ($disc -match 'OPERATIONAL NEVER-LIST')             "directive: OPERATIONAL NEVER-LIST present"
Ok ($disc -match 'NO dosing')                          "directive: bans dosing"
Ok ($disc -match 'NO advice to start, stop, change, replace, or combine') "directive: bans start/stop/replace medication"
Ok ($disc -match 'NO diagnosis')                       "directive: bans diagnosis"
Ok ($disc -match 'Historical consensus is NOT clinical evidence') "directive: historical consensus is not clinical evidence"
Ok ($disc -match 'history-of-medicine RESEARCH, never medical advice') "directive: history-of-medicine framing"
Ok ($disc -match 'a clinician decides treatment')      "directive: standing-close fragment present (ASCII)"
Ok ($disc -match 'HISTORICAL FRAMING IS MANDATORY')    "directive: historical framing mandatory"
Ok ($disc -match 'THE PRIVACY SEAM')                   "directive: privacy seam present"

# orchestrator.js -- both compose sites, each switch-gated
$gate = ([regex]::Matches($orch, 'healthRailEnabled\(\)\s*&&\s*detectHealthContext\(message,\s*history\)')).Count
OkEq 2 $gate "orchestrator gates the rail at BOTH compose sites (healthRailEnabled() && detectHealthContext)"
$inject = ([regex]::Matches($orch, '\$\{HEALTH_RAIL_DIRECTIVE\}')).Count
OkEq 2 $inject "orchestrator appends HEALTH_RAIL_DIRECTIVE at exactly 2 sites (buffered + stream)"
Ok ($orch -match 'detectHealthContext, HEALTH_RAIL_DIRECTIVE, healthRailEnabled') "orchestrator imports the R4 symbols from ./discovery"
$coda = ([regex]::Matches($orch, 'ensureHealthClose\(response, message, history\)')).Count
OkEq 2 $coda "orchestrator applies the deterministic coda at BOTH paths (buffered + stream)"

# knowledge-intake.js -- the two-truths layer + lazy switch read (no cycle)
Ok ($ki -match 'const\s+HEALTH_TEXT_LAYER_SYSTEM\s*=')  "knowledge-intake.js defines HEALTH_TEXT_LAYER_SYSTEM"
Ok ($ki -match 'const\s+HEALTH_TEXT_LAYER_EXAMPLE\s*=') "knowledge-intake.js defines HEALTH_TEXT_LAYER_EXAMPLE (worked example)"
Ok ($ki -match 'function\s+healthTextModeFor\s*\(')     "knowledge-intake.js defines healthTextModeFor"
Ok ($ki -match "require\(['""]\./discovery['""]\)\.healthRailEnabled\(\)") "knowledge-intake.js reads the switch via lazy ./discovery require"
Ok ($ki -match 'parseExtractionOutput\(raw,\s*source_class,\s*source_doc_id,\s*mode\s*=\s*"math",\s*opts') "parseExtractionOutput threads the opts arg"
Ok ($ki -match 'WORKED EXAMPLE') "knowledge-intake.js layer example is a concrete worked example (R3 lesson)"

# no new api/ fn, no SQL migration
$apiDir = Join-Path $root 'api'
$apiCount = @(Get-ChildItem $apiDir -Filter *.js -ErrorAction SilentlyContinue).Count
OkEq 10 $apiCount "R4 added no new api/ function (still 10)"
$migDir = Join-Path $root 'migrations'
$r4sql = 0
if (Test-Path $migDir) { $r4sql = @(Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -match 'r4|health.?rail|two.?truths' }).Count }
OkEq 0 $r4sql "R4 added no SQL migration"

Write-Output ""
Write-Output ("Build-R4 health rail PS mirror: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
