# M8 Meaning-First v2 -- last-keyword-gap fixture mirror (PS 5.1, ASCII, no Node).
#
# The JS test (meaning_v2_test.js) is the authoritative contract; this mirror
# re-implements the SAME pure v2 detectors + the SAME per-category contract so it
# runs on this host (Node is ABSENT). Per the PS-mirror rule: a PS-only fail with
# a JS pass means a MIRROR bug, not a source bug -- fix the mirror.
#
# TWO layers (same shape as intent_gate_test.ps1):
#   (A) LOGIC  -- the intended pure detectors (detectDoneClaim / detectCapabilityDenial /
#                 isAcceptance / isRefusal / parseDoMarker + the write-lane zero-keyword
#                 score) ported to PS and run over every ENGLISH fixture case. This is the
#                 host-runnable REFERENCE implementation of the pure functions S2-S5 must
#                 build in JS -- it validates the design against Muhammad's real phrasings
#                 + real replies BEFORE the live orchestrator is touched. It PASSES now.
#                 Arabic cases are counted+skipped (ASCII-only file; JS covers them).
#   (B) WIRING -- asserts the SOURCE modules land: lib/do-sentinel.js, lib/claim-audit.js,
#                 lib/pending-action.js, the capability-registry CAPABILITIES/buildAbilitiesPrompt
#                 exports, and the orchestrator M8_DO_SENTINEL kill-switch + prompt rules.
#                 RED until S2-S5, GREEN after -- the build's red/green signal on this host.
#
# The detector regexes here are the REFERENCE the JS modules copy; keep them in sync.

$ErrorActionPreference = 'Stop'
$script:pass = 0
$script:fail = 0
$script:skip = 0
$script:failLines = @()

function Assert-True([string]$label, [bool]$cond) {
  if ($cond) { $script:pass++ }
  else { $script:fail++; $script:failLines += ("  FAIL  " + $label); Write-Host ("  FAIL  " + $label) -ForegroundColor Red }
}
function Read-Safe([string]$path) {
  if (Test-Path $path) { return [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }
  return ''
}
function Test-Rx([string]$s, [string]$pat) {
  if (-not $pat) { return $false }
  return [regex]::IsMatch($s, $pat, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

# ---------------------------------------------------------------------------
# (A) REFERENCE detectors -- the pure v2 logic, English parts (spec 4.1/4.2/4.4)
# ---------------------------------------------------------------------------
# Done-claim (spec 4.4) EXTENDED per the fixture: the draft 4.4 regex misses
# "Noted / marked as ..." (case c-false-done-priority is a REAL false_done it drops),
# so the reference adds noted/marked/"I'll remind|note|keep|track" and "Added ... to your".
$RX_DONE = '\bi(?:''ve| have)?\s+(?:set|added|saved|created|logged|scheduled|recorded)\b|(?:reminder|task|note|expense).{0,20}(?:set|added|saved)|\bdone[.!]|\bnoted[,.!]|\bmarked as\b|\bi''?ll\s+(?:remind|note|keep|track)\b|\badded\b.{0,40}\bto your\b'
# Capability-denial (the false_cant / D4 reverse-lie side).
$RX_DENY = '\bi\s+(?:can''?t|cannot|can not)\s+(?:directly\s+)?(?:set|add|save|create|log|record|schedule|remind|store|track|access|send|delete|ingest)\b|\bi\s+(?:don''?t|do not)\s+have\s+(?:the ability|access)\b|\bi''?m\s+(?:just\s+)?(?:a|an)\s+(?:text|language|ai)\b|\bas an ai\b|\bnot hooked into\b|\bi''?m not able to\b|\bdon''?t have the ability\b'
# Closed grammatical class (spec 4.2) -- function words, not content vocab. English only.
$RX_ACCEPT = '^\s*(?:yes|yeah|yep|yup|ya|sure|ok(?:ay)?|k|do it|go ahead|go for it|please do|yes please|do that|sounds good|perfect|great)\b'
$RX_REFUSE = '^\s*(?:no|nope|nah|never ?mind|forget (?:it|about it)|cancel|stop|skip it|don''?t)\b'

function Detect-Done([string]$t)   { return (Test-Rx $t $RX_DONE) }
function Detect-Deny([string]$t)   { return (Test-Rx $t $RX_DENY) }
function Is-Acceptance([string]$t) { return (Test-Rx $t $RX_ACCEPT) }
function Is-Refusal([string]$t)    { return (Test-Rx $t $RX_REFUSE) }

# DO-sentinel marker (spec 4.1). Markers use U+27E6 / U+27E7 -- built from char codes
# so THIS file stays pure-ASCII. DO_MENU is writes-only.
$L = [char]0x27E6; $R = [char]0x27E7   # left/right white square brackets
$DO_MENU = @('driver_profile','notes','tasks','wallet')  # sorted, writes-only
# C1 tolerance (mirrors lib/do-sentinel.js): whitespace/case drift still parses+strips;
# ASCII-bracket fallback is TRAILING + menu-bound; strip is wide but DO-shaped only.
$RX_DOMS = '(tasks|wallet|notes|driver_profile)'
$RX_DO       = '(?i)^\s*' + [regex]::Escape($L) + '\s*DO\s*:\s*' + $RX_DOMS + '\s*' + [regex]::Escape($R) + '\s*$'
$RX_DO_TRAIL = '(?i)' + [regex]::Escape($L) + '\s*DO\s*:\s*' + $RX_DOMS + '\s*' + [regex]::Escape($R) + '\s*$'
$RX_DO_ASCII = '(?i)[\[({]{1,2}\s*DO\s*:\s*' + $RX_DOMS + '\s*[\])}]{1,2}\s*$'
$RX_DO_ANY   = '(?i)' + [regex]::Escape($L) + '\s*DO\s*:[^' + $R + ']*' + [regex]::Escape($R)
function Parse-DoMarker([string]$t) {
  $m = [regex]::Match($t, $RX_DO)
  if ($m.Success) { return $m.Groups[1].Value.ToLower() }
  return $null
}
function Parse-TrailMarker([string]$t) {
  $m = [regex]::Match($t, $RX_DO_TRAIL)
  if (-not $m.Success) { $m = [regex]::Match($t, $RX_DO_ASCII) }
  if ($m.Success) { return $m.Groups[1].Value.ToLower() }
  return $null
}
function Strip-DoMarker([string]$t) {
  $s = [regex]::Replace($t, $RX_DO_ANY, '')
  return ([regex]::Replace($s, $RX_DO_ASCII, ''))
}

# Write-lane registry signals (English mirror of lib/capability-registry.js) -- only the
# 4 write lanes, enough to CONFIRM the zero_keyword_action cases score 0 on writes.
$WSIG = @{
  tasks          = @{ strong = $null; present = '\b(tasks?|reminders?|to-?dos?)\b|\bremind\s+me\b|\b(?:on\s+)?my\s+(?:to-?do\s+)?list\b' }
  wallet         = @{ strong = '\bmy\s+(spend(?:ing)?|expenses?|wallet|budget|bills?|transactions?|money)\b|\b(?:did|do|does|how much did)\s+i\s+(?:spend|spent|pay|paid)\b|\bi\s+(?:spent|paid)\b|\bmy\s+(?:last|recent|latest)\s+(?:expenses?|transactions?|purchases?)\b|\b(?:did|have|has)\s+\w+\s+pa(?:y|id)\b|\b(?:paid|pay)\s+(?:the\s+|for\s+|my\s+|our\s+)?(?:rent|electricity|water|internet|bills?|fees?|school\s+fees?|tuition|subscription|installment)\b'; present = '\b(expenses?|wallet|spending|budget|bills?)\b|\bspent\b|\bspend\b(?!\s+(?:time|the\s+night|the\s+day|the\s+weekend))' }
  notes          = @{ strong = '\b(?:search|check|find\s+in|look\s+in)\s+my\s+notes?\b|^\s*note\s*:|\b(?:take|make|add|leave|write|jot)\s+(?:a\s+|this\s+)?note\b|\bjot\s+(?:this\s+)?down\b'; present = '\bnotes?\b|\bnote\s+(?:that|down|about)\b|\b(?:fyi|for\s+the\s+record)\b|\bremember\s+that\b' }
  driver_profile = @{ strong = '\bdriver\s+profiles?\b|\b(?:set|update)\s+\w+(?:''s)?\s+(?:rental|salary|fuel)\b'; present = $null }
}
function Write-Max([string]$s) {
  $mx = 0
  foreach ($d in $WSIG.Keys) {
    $def = $WSIG[$d]
    if (Test-Rx $s $def.strong) { $v = 2 } elseif (Test-Rx $s $def.present) { $v = 1 } else { $v = 0 }
    if ($v -gt $mx) { $mx = $v }
  }
  return $mx
}

# ---------------------------------------------------------------------------
# (A) LOGIC -- run the fixture through the ported detectors
# ---------------------------------------------------------------------------
Write-Host "M8 Meaning-First v2 mirror -- (A) reference detectors over real phrasings`n"

$fixPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'fixtures\meaning_v2_phrasings.json'))
$fx = Get-Content -Raw -Encoding UTF8 $fixPath | ConvertFrom-Json
$cases = $fx.cases
$caps = $fx.capabilities_expected

# self-check: the marker round-trips (proves the [char] construction is correct)
Assert-True "DO_MENU is writes-only (4 lanes)" (($DO_MENU.Count -eq 4) -and ($DO_MENU -contains 'tasks') -and ($DO_MENU -notcontains 'fleet'))
Assert-True "parseDoMarker round-trips tasks"  ((Parse-DoMarker ($L + 'DO:tasks' + $R)) -eq 'tasks')
Assert-True "stripDoMarker removes the marker"  ((Strip-DoMarker ($L + 'DO:wallet' + $R + ' ')).Trim() -eq '')
Assert-True "parseDoMarker null on prose"       ($null -eq (Parse-DoMarker 'Sure, what time?'))

# C1 tweaks: code-guaranteed strip even when the model drifts (mirrors the JS P1 C1 block)
Assert-True "C1 tolerant ws parse+strip"    (((Parse-TrailMarker ("ok`n" + $L + 'DO: wallet ' + $R)) -eq 'wallet') -and ((Strip-DoMarker ("ok`n" + $L + 'DO: wallet ' + $R)).Trim() -eq 'ok'))
Assert-True "C1 tolerant case parse+strip"  (((Parse-TrailMarker ("ok`n" + $L + 'do:Wallet' + $R)) -eq 'wallet') -and ((Strip-DoMarker ("ok`n" + $L + 'do:Wallet' + $R)).Trim() -eq 'ok'))
Assert-True "C1 ascii fallback parse+strip" (((Parse-TrailMarker "ok`n[DO:tasks]") -eq 'tasks') -and ((Strip-DoMarker "ok`n[DO:tasks]").Trim() -eq 'ok'))
Assert-True "C1 ascii prose safe"           ((Strip-DoMarker 'Next step (DO: call the bank)') -eq 'Next step (DO: call the bank)')
Assert-True "C1 malformed white-bracket strips" ((((Strip-DoMarker ('ok ' + $L + 'DO:fleet|wallet' + $R + ' done')) -replace '\s+', ' ').Trim()) -eq 'ok done')
Assert-True "C1 math brackets safe"         ((Strip-DoMarker ('the semantics ' + $L + 'n' + $R + ' = n')) -eq ('the semantics ' + $L + 'n' + $R + ' = n'))

foreach ($c in $cases) {
  if ($c.lang -eq 'ar') { $script:skip++; continue }   # ASCII-only file; JS covers Arabic

  switch ($c.cat) {
    'zero_keyword_action' {
      $wm = Write-Max $c.msg
      Assert-True ("[{0}] zero-keyword (writeMax=0)" -f $c.id) ($wm -eq 0)
      Assert-True ("[{0}] do_domain is a write lane" -f $c.id) ($DO_MENU -contains $c.do_domain)
    }
    'pending_action' {
      $acc = Is-Acceptance $c.msg
      $ref = Is-Refusal $c.msg
      switch ($c.expect) {
        'accept'  { Assert-True ("[{0}] accept" -f $c.id) ($acc -and -not $ref) }
        'refuse'  { Assert-True ("[{0}] refuse" -f $c.id) ($ref -and -not $acc) }
        default   { Assert-True ("[{0}] neither (slot/deflect never a phantom yes)" -f $c.id) ((-not $acc) -and (-not $ref)) }
      }
    }
    'false_claim' {
      $done = Detect-Done $c.reply
      $deny = Detect-Deny $c.reply
      $wouldLogDone = ($done -and -not $c.had_sentinel)
      switch ($c.sub) {
        'false_done' { Assert-True ("[{0}] false_done fires (no sentinel)" -f $c.id) ($wouldLogDone) }
        'false_cant' {
          Assert-True ("[{0}] false_cant deny fires" -f $c.id) ($deny)
          $canDo = @(); if ($caps.PSObject.Properties.Name -contains $c.domain) { $canDo = @($caps.$($c.domain).canDo) }
          Assert-True ("[{0}] false_cant is-a-lie (canDo)" -f $c.id) ($canDo -contains $c.denied_ability)
        }
        'honest_cant' {
          Assert-True ("[{0}] honest_cant no done-claim" -f $c.id) (-not $done)
          $cantDo = @(); if ($caps.PSObject.Properties.Name -contains $c.domain) { $cantDo = @($caps.$($c.domain).cantDo) }
          Assert-True ("[{0}] honest_cant is-legit (cantDo)" -f $c.id) ($cantDo -contains $c.denied_ability)
        }
        'normal' { Assert-True ("[{0}] normal answer is quiet" -f $c.id) ((-not $done) -and (-not $deny)) }
        'normal_done_with_lane' { Assert-True ("[{0}] real 'Added' + sentinel not logged" -f $c.id) ($done -and $c.had_sentinel -and (-not $wouldLogDone)) }
      }
    }
  }
}
Write-Host ("`n  (A) reference logic: {0} pass, {1} fail, {2} skipped (Arabic, JS-only)`n" -f $script:pass, $script:fail, $script:skip)

# ---------------------------------------------------------------------------
# (B) WIRING -- source assertions (RED until S2-S5, GREEN after)
# ---------------------------------------------------------------------------
Write-Host "-- (B) source wiring (red until S2-S5 land) --"
$libDir  = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib'))
$doSent  = Read-Safe (Join-Path $libDir 'do-sentinel.js')
$audit   = Read-Safe (Join-Path $libDir 'claim-audit.js')
$pending = Read-Safe (Join-Path $libDir 'pending-action.js')
$cap     = Read-Safe (Join-Path $libDir 'capability-registry.js')
$orch    = Read-Safe (Join-Path $libDir 'orchestrator.js')

# S2 step 3 -- DO-sentinel
Assert-True "lib/do-sentinel.js exists"                    ($doSent -ne '')
Assert-True "do-sentinel: DO_MENU + parseDoMarker + strip"  (($doSent -match 'DO_MENU') -and ($doSent -match 'parseDoMarker') -and ($doSent -match 'stripDoMarker'))
Assert-True "orchestrator: M8_DO_SENTINEL 3-state switch"    ($orch -match 'M8_DO_SENTINEL')
Assert-True "orchestrator: intercepts the DO marker"        ($orch -match 'parseDoMarker' -or $orch -match 'do_sentinel')
# C1 tweaks -- negative worked example + unconditional strip w/ stray log + pre-STORE placement
Assert-True "do-sentinel: counter-example in prompt rule"   (($doSent -match 'Counter-example') -and ($doSent -match 'append NO tag'))
Assert-True "orchestrator: stray-marker telemetry"          ($orch -match 'do-sentinel:stray')
Assert-True "orchestrator: observe runs BEFORE the STORE"   ($orch.IndexOf('_doSentinelObserve(response, baseMessage') -lt $orch.IndexOf('await saveMemory(sessionId, message, response)'))
# S2 step 2 -- claim-audit
Assert-True "lib/claim-audit.js exists"                     ($audit -ne '')
Assert-True "claim-audit: detectDoneClaim defined"          ($audit -match 'detectDoneClaim')
Assert-True "claim-audit: detectCapabilityDenial defined"   ($audit -match 'detectCapabilityDenial')
Assert-True "orchestrator: claim-audit telemetry wired"     ($orch -match 'claim-audit' -or $orch -match 'detectDoneClaim')
# S2 step 1 -- CAPABILITIES single source
Assert-True "capability-registry: CAPABILITIES export"      ($cap -match 'CAPABILITIES')
Assert-True "capability-registry: buildAbilitiesPrompt()"   ($cap -match 'buildAbilitiesPrompt')
Assert-True "orchestrator: abilities prompt built from source, names travel" (($orch -match 'buildAbilitiesPrompt') -and ($orch -match 'travel'))
Assert-True "capability-registry: D4 never-claim-done rule present" ($cap -match 'never (say|claim|tell)[^\n]{0,60}(set|add|sav|log|schedul|creat)')
# S4 step 5 -- pendingAction
Assert-True "lib/pending-action.js exists"                 ($pending -ne '')
Assert-True "pending-action: isAcceptance + isRefusal"     (($pending -match 'isAcceptance') -and ($pending -match 'isRefusal'))
Assert-True "pending-action: PEND sentinel family"         ($pending -match 'PEND')
Assert-True "orchestrator: pendingAction re-entry wired"   ($orch -match 'isAcceptance' -or $orch -match 'pendingAction')

# ---------------------------------------------------------------------------
Write-Host ("`n=== Meaning-v2 mirror: {0} PASS / {1} FAIL / {2} SKIP ===" -f $script:pass, $script:fail, $script:skip)
if ($script:fail -gt 0) {
  Write-Host "`nFAILURES (A-fail = mirror/design bug; B-fail = source not built yet):" -ForegroundColor Yellow
  $script:failLines | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
  Write-Host "`n(Expected at S1: ALL (A) reference-logic asserts GREEN; ALL (B) wiring asserts RED until S2-S5.)" -ForegroundColor DarkGray
  exit 1
} else {
  Write-Host "All mirror assertions passed -- S2-S5 are complete." -ForegroundColor Green
  exit 0
}
