# Build-179 - context-rank (D3 rank/freshness + D5 budgets/HH-gate + D4 dedupe).
# PS 5.1 offline mirror of the pure lib/context-signal.js core + kill-switch
# identity + static wiring/privacy greps on the JS. ASCII-only (PS-5.1).
# Node is ABSENT in the offline battery: this re-implements the pure functions
# and asserts by-construction values, then greps the real JS for the wiring +
# the doctrine invariants (no content-regex lane logic; no new api/ fn; the
# M8_VAULT_INGEST privacy default). The heavy end-to-end selector behaviour on
# REAL recall data is proven separately in reports/build-179-selector-replay.md.

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}
function Is-Num($v) { return ($v -is [int]) -or ($v -is [long]) -or ($v -is [double]) -or ($v -is [decimal]) }
function Clamp([double]$n,[double]$lo,[double]$hi){ if($n -lt $lo){return $lo}; if($n -gt $hi){return $hi}; return $n }
function To-Ms([string]$s){ return [double]([datetimeoffset]::Parse($s, [System.Globalization.CultureInfo]::InvariantCulture).ToUnixTimeMilliseconds()) }

$DAY = 86400000.0
$NOW = To-Ms "2026-07-03T12:00:00Z"

# =============================================================================
# (1) scoreRow mirror: 2.0*sim + 1.0*(trust/4) + 1.0*fresh + 0.5*(imp-1)/4
#     fresh = 1/(1+ageDays/halfLife); hl operational 45 / summary 21 / raw 14.
#     sim = similarity | _score/8 | 0.35 neutral.
# =============================================================================
function Half-Life($row){
  if ($row.memory_type -eq "operational") { return 45.0 }
  if ($row.memory_type -eq "summary" -or $row.role -eq "summary") { return 21.0 }
  return 14.0
}
function Score-Row($row, [double]$nowMs){
  if ($null -eq $row) { return 0.0 }
  $sim = 0.35
  if (Is-Num $row.similarity) { $sim = [double]$row.similarity }
  elseif (Is-Num $row._score) { $sim = [double]$row._score / 8.0 }
  $sim = Clamp $sim 0 1
  $trustRaw = if (Is-Num $row.trust_level) { [double]$row.trust_level } else { 0.0 }
  $trust = Clamp ($trustRaw / 4.0) 0 1
  $hl = Half-Life $row
  $created = if ($row.created_at) { To-Ms $row.created_at } else { $nowMs }
  $ageDays = [Math]::Max(0.0, ($nowMs - $created) / $DAY)
  $fresh = 1.0 / (1.0 + $ageDays / $hl)
  $impRaw = if (Is-Num $row.importance) { [double]$row.importance } else { 1.0 }
  $imp = Clamp $impRaw 1 5
  $importance = ($imp - 1) / 4.0
  return 2.0*$sim + 1.0*$trust + 1.0*$fresh + 0.5*$importance
}
# a fresh, high-sim operational row must outrank an old low-sim raw turn
$rFresh = @{ memory_type="operational"; role="summary"; trust_level=4; importance=3; similarity=0.82; created_at="2026-07-01T12:00:00Z" }
$rOld   = @{ memory_type="session";     role="user";    trust_level=4; importance=1; _score=1;         created_at="2025-09-06T12:00:00Z" }
$sF = Score-Row $rFresh $NOW
$sO = Score-Row $rOld $NOW
Check "s1 fresh operational outranks old raw" ($sF -gt $sO)
# neutral prior applies when neither similarity nor _score present
$rNeutral = @{ memory_type="session"; role="user"; trust_level=4; importance=1; created_at="2026-07-03T00:00:00Z" }
$sN = Score-Row $rNeutral $NOW
# sim=0.35 -> 0.70 ; trust=1 ; fresh ~1 ; importance 0  => ~2.7
Check "s2 neutral prior ~ 0.35 sim" (($sN -gt 2.5) -and ($sN -lt 2.9))
# freshness decays with age (same row, older = lower)
$rY = @{ memory_type="session"; role="user"; trust_level=4; importance=1; similarity=0.5; created_at="2026-07-03T00:00:00Z" }
$rZ = @{ memory_type="session"; role="user"; trust_level=4; importance=1; similarity=0.5; created_at="2025-07-03T00:00:00Z" }
Check "s3 fresher row scores higher" ((Score-Row $rY $NOW) -gt (Score-Row $rZ $NOW))

# =============================================================================
# (2) renderedLen mirror (numeric, no unicode literals) — tag+space+prefix+content+nl
# =============================================================================
function ProvTagLen($trust){ $t = if($null -eq $trust){4}else{$trust}; if($t -ge 4){return 12}elseif($t -ge 3){return 12}else{return 13} }
function LinePrefixLen($row){ if($row.role -eq "summary"){return 2}elseif($row.role -eq "assistant"){return 4}else{return 10} }
function Rendered-Len($row){ $c = if($row.content -is [string]){$row.content.Length}else{0}; return (ProvTagLen $row.trust_level) + 1 + (LinePrefixLen $row) + $c + 1 }
# "[~ inferred] Muhammed: hi" -> 12 + 1 + 10 + 2 + 1 = 26
$rr = @{ trust_level=3; role="user"; content="hi" }
Check "r1 rendered len user" ((Rendered-Len $rr) -eq 26)
# summary row: "[? low-trust] * xx" -> 13 + 1 + 2 + 2 + 1 = 19
$rs = @{ trust_level=1; role="summary"; content="xx" }
Check "r2 rendered len summary low-trust" ((Rendered-Len $rs) -eq 19)

# =============================================================================
# (3) laneBudget mirror + M8_CTX_BUDGETS/override kill switches.
# =============================================================================
$LANE_BUDGETS = @{ fleet=1800; finance=1800; web=3000; general=3000; knowledge=2400; research=2400; notebook=2400 }
$FLAT = 4500
function Normalize-Lane([string]$lane){ return ($lane.ToLower() -replace '^stream:', '').Trim() }
function Lane-Budget([string]$lane, [bool]$budgetsOn){
  if (-not $budgetsOn) { return $FLAT }
  $k = Normalize-Lane $lane
  $env = [Environment]::GetEnvironmentVariable("M8_RECALL_BUDGET_" + $k.ToUpper())
  if ($env) { $n = 0; if ([int]::TryParse($env, [ref]$n) -and $n -gt 0) { return $n } }
  if ($LANE_BUDGETS.ContainsKey($k)) { return $LANE_BUDGETS[$k] }
  return $FLAT
}
Check "b1 fleet budget 1800"           ((Lane-Budget "fleet" $true) -eq 1800)
Check "b2 web budget 3000"             ((Lane-Budget "web" $true) -eq 3000)
Check "b3 stream:finance -> 1800"      ((Lane-Budget "stream:finance" $true) -eq 1800)
Check "b4 budgets OFF -> flat 4500"    ((Lane-Budget "fleet" $false) -eq 4500)
Check "b5 unknown lane -> flat 4500"   ((Lane-Budget "banana" $true) -eq 4500)

# =============================================================================
# (4) selectMemoryForLane mirror: pin profile+contradiction, rank rest, budget +
#     14-row cap, first-fit; PASS-THROUGH when rank off (kill-switch identity).
# =============================================================================
function Select-Mem($rows, [int]$budget, [int]$rowCap, [double]$nowMs, [bool]$rankOn){
  if (-not $rankOn) { return ,@($rows) }                     # pass-through identity
  $pinned = @(); $cand = @()
  foreach($r in $rows){ if(($r.memory_type -eq "profile") -or $r.contradiction_flag){ $pinned += $r } else { $cand += $r } }
  $scored = $cand | ForEach-Object { [pscustomobject]@{ r=$_; s=(Score-Row $_ $nowMs) } } | Sort-Object -Property s -Descending
  $keepIds = New-Object System.Collections.Generic.HashSet[int]
  foreach($p in $pinned){ [void]$keepIds.Add([int]$p.id) }
  $used = 0; $n = 0
  foreach($it in $scored){
    if ($n -ge $rowCap) { break }
    $c = Rendered-Len $it.r
    if (($budget -gt 0) -and (($used + $c) -gt $budget)) { continue }  # first-fit skip
    [void]$keepIds.Add([int]$it.r.id); $used += $c; $n++
  }
  return ,@($rows | Where-Object { $keepIds.Contains([int]$_.id) })
}
$rows = @(
  @{ id=1; memory_type="profile";     role="user";      trust_level=4; importance=5; content="Sara is your wife";                   created_at="2025-05-29T12:00:00Z" },
  @{ id=2; memory_type="operational"; role="summary";   trust_level=4; importance=3; similarity=0.82; content="June fleet net tracked"; created_at="2026-07-01T12:00:00Z" },
  @{ id=3; memory_type="session";     role="user";      trust_level=4; importance=1; _score=1; content=("z" * 400);                  created_at="2025-09-06T12:00:00Z" },
  @{ id=4; memory_type="session";     role="assistant"; trust_level=4; importance=2; similarity=0.75; content="driver Ahmed strong month"; created_at="2026-06-28T12:00:00Z" },
  @{ id=5; memory_type="session";     role="user";      trust_level=4; importance=1; contradiction_flag=$true; content="conflict row"; created_at="2026-06-23T12:00:00Z" }
)
# tiny budget: only the pinned rows (1,5) plus whichever fit; id3 is 400+ chars so it is skipped
$selTiny = Select-Mem $rows 60 14 $NOW $true
$idsTiny = ($selTiny | ForEach-Object { $_.id } | Sort-Object)
Check "sel1 profile pinned kept"       ($idsTiny -contains 1)
Check "sel2 contradiction pinned kept" ($idsTiny -contains 5)
Check "sel3 huge row skipped by budget" (-not ($idsTiny -contains 3))
# generous budget: everything fits, chronological order preserved
$selAll = Select-Mem $rows 5000 14 $NOW $true
$orderAll = ($selAll | ForEach-Object { $_.id }) -join ","
Check "sel4 all fit under big budget"  ($selAll.Count -eq 5)
Check "sel5 chronological order kept"  ($orderAll -eq "1,2,3,4,5")
# row cap: cap 1 non-pinned -> pinned(1,5) + top-scored single (id2)
$selCap = Select-Mem $rows 5000 1 $NOW $true
$idsCap = ($selCap | ForEach-Object { $_.id } | Sort-Object)
Check "sel6 row cap keeps pinned + top1" (($idsCap -contains 1) -and ($idsCap -contains 5) -and ($idsCap -contains 2) -and ($idsCap.Count -eq 3))
# KILL-SWITCH: rank off -> exact input passthrough (identity)
$selOff = Select-Mem $rows 60 14 $NOW $false
Check "sel7 rank OFF passthrough identity" ((($selOff | ForEach-Object { $_.id }) -join ",") -eq "1,2,3,4,5")

# =============================================================================
# (5) dedupeAgainstBlocks mirror (Jaccard >= 0.5) — Tier-2 dup dropped, pinned/
#     Tier-1 never touched (kill-switch: caller guards on M8_GRAPH_RECALL).
# =============================================================================
$STOP = @("the","a","an","and","or","but","of","to","in","on","at","for","with","from","by","is","are","was","were","be","been","being","it","its","this","that","these","those","as","into","about","over","than","then","so","such","not","no","yes")
function Word-Set([string]$t){
  $set = New-Object System.Collections.Generic.HashSet[string]
  if ([string]::IsNullOrEmpty($t)) { return $set }
  $clean = ($t.ToLower() -replace '[^\p{L}\p{N}\s]', ' ')
  foreach($w in ($clean -split '\s+')){ if($w.Length -ge 3 -and ($STOP -notcontains $w)){ [void]$set.Add($w) } }
  return $set
}
function Jaccard($a,$b){
  if ($a.Count -eq 0 -and $b.Count -eq 0) { return 0.0 }
  $inter = 0; foreach($w in $a){ if($b.Contains($w)){ $inter++ } }
  $uni = $a.Count + $b.Count - $inter
  if ($uni -eq 0) { return 0.0 }
  return [double]$inter / [double]$uni
}
function Dedupe-Blocks($rows, $lines, [double]$threshold){
  $lineSets = @(); foreach($l in $lines){ $ws = Word-Set $l; if($ws.Count -gt 0){ $lineSets += ,$ws } }
  if ($lineSets.Count -eq 0) { return ,@($rows) }
  $out = @()
  foreach($r in $rows){
    if (($r.memory_type -eq "profile") -or ($r.memory_type -eq "operational") -or $r.contradiction_flag) { $out += $r; continue }
    $ws = Word-Set $r.content
    if ($ws.Count -eq 0) { $out += $r; continue }
    $drop = $false
    foreach($ls in $lineSets){ if((Jaccard $ws $ls) -ge $threshold){ $drop = $true; break } }
    if (-not $drop) { $out += $r }
  }
  return ,@($out)
}
$blk = @("[Entity] driver Ahmed strong month")
$ded = Dedupe-Blocks $rows $blk 0.5
$idsDed = ($ded | ForEach-Object { $_.id } | Sort-Object)
Check "ded1 tier-2 dup (id4) dropped" (-not ($idsDed -contains 4))
Check "ded2 profile pinned kept"      ($idsDed -contains 1)
Check "ded3 contradiction kept"       ($idsDed -contains 5)
Check "ded4 non-dup tier-2 kept"      ($idsDed -contains 3)
# empty blocks -> untouched
$dedNone = Dedupe-Blocks $rows @() 0.5
Check "ded5 no blocks -> all kept"    ($dedNone.Count -eq 5)

# =============================================================================
# (6) householdGate mirror: (i) wallet/money, (ii) roster-name, (iii) person path.
# =============================================================================
function Household-Gate($domain, $message, $recentTurns, $roster, $personCard){
  $d = ([string]$domain).ToLower()
  if ($d -eq "wallet" -or $d -eq "money") { return $true }      # (i)
  if ($personCard) { return $true }                             # (iii)
  if ($roster -and $roster.Count -gt 0) {                       # (ii)
    $parts = @([string]$message)
    if ($recentTurns) { $rt = @($recentTurns); $take = [Math]::Min(2, $rt.Count); if($take -gt 0){ $parts += $rt[($rt.Count-$take)..($rt.Count-1)] } }
    $blob = " " + (($parts -join " `n ").ToLower()) + " "
    foreach($name in $roster){
      $nm = ([string]$name).Trim().ToLower()
      if ($nm.Length -lt 2) { continue }
      if ($blob.Contains(" $nm ") -or $blob.Contains(" $nm,") -or $blob.Contains(" $nm.")) { return $true }
    }
  }
  return $false
}
Check "hh1 wallet domain -> inject"    (Household-Gate "wallet" "how much left" $null @("Sara","Muhammad") $false)
Check "hh2 roster name in msg -> inject" (Household-Gate "fleet" "how is Sara doing today" $null @("Sara","Muhammad") $false)
Check "hh3 person-card path -> inject"  (Household-Gate "fleet" "who is he" $null @("Sara") $true)
Check "hh4 no signal -> no inject"      (-not (Household-Gate "fleet" "fleet net today" $null @("Sara","Muhammad") $false))
Check "hh5 roster name in recent turn"  (Household-Gate "general" "and her?" @("what did Sara spend") @("Sara") $false)

# =============================================================================
# (7) Static wiring + doctrine greps on the REAL JS.
# =============================================================================
$root = Split-Path -Parent $PSScriptRoot
$csig = Get-Content (Join-Path $root "lib\context-signal.js") -Raw
$orch = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw
$mem  = Get-Content (Join-Path $root "lib\memory.js") -Raw

# -- context-signal.js exports the pure core --
foreach($fn in @("selectMemoryForLane","scoreRow","laneBudget","dedupeAgainstBlocks","householdGate","renderMemoryRow","renderedLen")){
  Check "w-export $fn" ($csig -match ("module.exports[\s\S]*" + [regex]::Escape($fn)))
}
Check "w-kill M8_RECALL_RANK"   ($csig.Contains("M8_RECALL_RANK"))
Check "w-kill M8_CTX_BUDGETS"   ($csig.Contains("M8_CTX_BUDGETS"))
Check "w-kill M8_HH_GATE"       ($csig.Contains("M8_HH_GATE"))
Check "w-kill M8_GRAPH_RECALL"  ($csig.Contains("M8_GRAPH_RECALL"))
# per-lane budget override env
Check "w-lane-override env"     ($csig.Contains("M8_RECALL_BUDGET_"))
# reuse Build-84 Jaccard (no second impl)
Check "w-reuse jaccard"         ($csig.Contains('require("./answer-engine")') -and $csig.Contains("jaccard"))

# -- memory.js rank-mode --
Check "w-mem recallRankEnabled" ($mem.Contains("function recallRankEnabled()"))
Check "w-mem rank early-return" ($mem.Contains("if (recallRankEnabled()) return merged;"))

# -- orchestrator.js wires BOTH compose sites --
Check "w-orch require ctxSignal"    ($orch.Contains('require("./context-signal")'))
$selCalls = ([regex]::Matches($orch, [regex]::Escape("_ctxSignal.selectMemoryForLane("))).Count
Check "w-orch select at both sites" ($selCalls -ge 2)
$hhCalls = ([regex]::Matches($orch, [regex]::Escape("_ctxSignal.householdGate("))).Count
Check "w-orch hhGate at both sites"  ($hhCalls -ge 2)
Check "w-orch dedupe wired"         ($orch.Contains("_ctxSignal.dedupeAgainstBlocks("))
Check "w-orch shared renderRow"     ($orch.Contains("_ctxSignal.renderMemoryRow("))
Check "w-orch hh gate kill honored" ($orch.Contains("!_ctxSignal.hhGateEnabled() || _ctxSignal.householdGate("))
Check "w-orch graph kill honored"   ($orch.Contains("_ctxSignal.graphRecallEnabled() && entityCard"))

# =============================================================================
# (8) Doctrine / privacy / scope invariants (acceptance 5).
# =============================================================================
# no content-regex lane classification: the selector must not test message text
# with a keyword regex to pick a lane. (Guard: no /.../.test on a 'lane' decision
# in context-signal.js — lane comes from structural packet flags in orchestrator.)
Check "p1 no regex .test in selector"  (-not ($csig -match "\.test\("))
# vault ingest defaults OFF (privacy opt-in)
Check "p2 vault default OFF"           ($csig.Contains('v === "on" || v === "1" || v === "true"'))
Check "p3 vault gate exported"         ($csig -match "module.exports[\s\S]*vaultIngestEnabled")
# no new api/ function (Vercel 12-fn cap FULL)
$apiCount = (Get-ChildItem (Join-Path $root "api") -Recurse -Filter *.js | Measure-Object).Count
Check "p4 api fn count <= 12"          ($apiCount -le 12)
# household gate is structural: it matches HIS roster list, not a hardcoded name
Check "p5 hh gate uses roster list"    ($csig.Contains("roster") -and $csig.Contains("entityCardPersonal"))

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
