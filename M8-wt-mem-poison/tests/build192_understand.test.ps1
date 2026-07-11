# B-192 (Meaning-First v3 S1) -- PS 5.1 mirror, PURE HELPERS ONLY.
#
# DOCTRINE SCOPE (vault "M8 DOCTRINE" 2026-07-08, M8_MEANING_FIRST_V3_PLAN.md):
# mirrors serve COMPUTE/VALIDATION layers only. This file mirrors exactly three
# deterministic functions from lib/understand.js -- understandMode(),
# normalizeUnderstanding(), liveLabel()/shadowAgrees() -- and MUST NEVER grow
# assertions about the MEANING output of understand(). Meaning is scored by
# tests/understand_fixtures_test.js (pass-rate + shadow telemetry), not here.
# PS-fail + JS-pass = a mirror bug: fix THIS file, not the source.
#
# Run:  powershell -ExecutionPolicy Bypass -File tests\build192_understand.test.ps1

$ErrorActionPreference = "Stop"
$script:pass = 0; $script:fail = 0
function Assert-Eq($name, $got, $want) {
  if ("$got" -eq "$want") { $script:pass++; Write-Host "[OK]   $name" }
  else { $script:fail++; Write-Host "[FAIL] $name -- got '$got' want '$want'" }
}

# ---- mirror: understandMode() ------------------------------------------------
function Get-UnderstandMode([string]$envVal) {
  $v = ("$envVal").Trim().ToLower()
  if ($v -eq "off" -or $v -eq "0") { return "off" }
  if ($v -eq "on") { return "on" }
  return "shadow"
}
Assert-Eq "mode default"      (Get-UnderstandMode "")        "shadow"
Assert-Eq "mode off"          (Get-UnderstandMode "off")     "off"
Assert-Eq "mode 0"            (Get-UnderstandMode "0")       "off"
Assert-Eq "mode on"           (Get-UnderstandMode "ON ")     "on"
Assert-Eq "mode junk->shadow" (Get-UnderstandMode "banana")  "shadow"

# ---- mirror: normalizeUnderstanding() core rules ------------------------------
$MENU = @("driver_profile","knowledge","docs","notes","tasks","wallet","finance","fleet","memory","travel","web","chat","none")
function Clamp01($n) {
  $x = 0.0
  if (-not [double]::TryParse("$n", [ref]$x)) { return 0 }
  if ([double]::IsNaN($x) -or [double]::IsInfinity($x)) { return 0 }
  if ($x -lt 0) { return 0 }; if ($x -gt 1) { return 1 }; return $x
}
function StrOrNull([object]$v, [int]$max) {
  if ($v -isnot [string]) { return $null }
  $s = $v.Trim()
  if (-not $s -or $s -match '^(?i)(null|none|n/a)$') { return $null }
  if ($s.Length -gt $max) { return $s.Substring(0, $max) }
  return $s
}
function Normalize-Capability([string]$c) {
  $cap = ("$c").Trim().ToLower()
  if ($MENU -notcontains $cap) { return "none" }
  return $cap
}
function Normalize-Intent([string]$i) {
  $s = ("$i").Trim().ToLower() -replace '\s+', '_'
  if ($s -match '^[a-z][a-z_]{1,23}(\.[a-z][a-z_]{1,23})?$') { return $s }
  return "unknown"
}
Assert-Eq "cap WALLET->wallet"   (Normalize-Capability "WALLET")   "wallet"
Assert-Eq "cap offmenu->none"    (Normalize-Capability "banking")  "none"
Assert-Eq "intent Wallet.Read"   (Normalize-Intent "Wallet.Read")  "wallet.read"
Assert-Eq "intent garbage"       (Normalize-Intent "??!")          "unknown"
Assert-Eq "intent spaced"        (Normalize-Intent "tasks add")    "tasks_add"
Assert-Eq "clamp 1.7->1"         (Clamp01 "1.7")  "1"
Assert-Eq "clamp -2->0"          (Clamp01 -2)     "0"
Assert-Eq "clamp NaN->0"         (Clamp01 "abc")  "0"
Assert-Eq "ref 'none'->null"     ("$(StrOrNull ' none ' 160)")     ""
Assert-Eq "ref keeps text"       (StrOrNull "the last expense" 160) "the last expense"

# ---- mirror: liveLabel() + shadowAgrees() -------------------------------------
function Get-LiveLabel($lookupDomain, $arbDomain, $intentDomain, $intentBand) {
  if ($lookupDomain) { return "$lookupDomain" }
  if ($arbDomain -and $arbDomain -ne "neutral" -and $arbDomain -ne "ask") { return "$arbDomain" }
  if ($intentDomain -and $intentBand -ne "none") { return "$intentDomain" }
  return "chat"
}
function Test-ShadowAgrees([string]$capability, [string]$label) {
  $c = $capability; if ($c -eq "none") { $c = "chat" }
  return ($c -eq $label)
}
Assert-Eq "label lookup wins"    (Get-LiveLabel "knowledge" "wallet" $null $null) "knowledge"
Assert-Eq "label arb"            (Get-LiveLabel $null "fleet" $null $null)        "fleet"
Assert-Eq "label neutral+intent" (Get-LiveLabel $null "neutral" "tasks" "strong") "tasks"
Assert-Eq "label band none"      (Get-LiveLabel $null "neutral" "tasks" "none")   "chat"
Assert-Eq "agree none~chat"      (Test-ShadowAgrees "none" "chat")                "True"
Assert-Eq "agree wallet/fleet"   (Test-ShadowAgrees "wallet" "fleet")             "False"

Write-Host ""
Write-Host "B-192 PS mirror (pure helpers only): $script:pass passed, $script:fail failed"
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
