# E1 — Turn Integrity. PS 5.1 mirrors of the two PURE decision functions
# (lockDecision in lib/turn-lock.js, upsertRetryDecision in lib/cas-retry.js) —
# Node is ABSENT on this host — plus static wiring checks on the JS.
# Contract: M8/E1_TURN_INTEGRITY_SPEC.md.

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

# ── mirror of lockDecision(existingRow, nowMs) ────────────────────────────────
# expired (expires_at strictly before now) -> "takeover"; else -> "busy";
# missing/invalid expires_at -> "takeover".
function Lock-Decision($expiresAtIso, [double]$nowMs) {
  if ([string]::IsNullOrEmpty($expiresAtIso)) { return "takeover" }
  try { $exp = ([datetimeoffset]$expiresAtIso).ToUnixTimeMilliseconds() }
  catch { return "takeover" }
  if ($exp -lt $nowMs) { return "takeover" } else { return "busy" }
}

$now = ([datetimeoffset]"2026-07-02T14:00:00Z").ToUnixTimeMilliseconds()
Check "lock: fresh row (expires future) -> busy"     ((Lock-Decision "2026-07-02T14:03:00Z" $now) -eq "busy")
Check "lock: expired row -> takeover"                 ((Lock-Decision "2026-07-02T13:57:00Z" $now) -eq "takeover")
# boundary: expires_at == now -> NOT strictly before -> busy
Check "lock: boundary (expires==now) -> busy"         ((Lock-Decision "2026-07-02T14:00:00Z" $now) -eq "busy")
Check "lock: null expires -> takeover"                ((Lock-Decision $null $now) -eq "takeover")
Check "lock: garbage expires -> takeover"             ((Lock-Decision "not-a-date" $now) -eq "takeover")

# ── mirror of upsertRetryDecision({phase, casRows, errCode, attempt}) ─────────
$MAX = 2
function Is-Conflict($errCode) {
  $s = [string]$errCode
  if ($s -eq "23505") { return $true }
  return ($s -match 'duplicate key|already exists|ux_m8_conversations_current_fact|ux_m8_research_notes_current_singleton')
}
function Upsert-Retry([string]$phase, $casRows, $errCode, [int]$attempt) {
  $a = if ($attempt) { $attempt } else { 1 }
  if ($phase -eq "supersede") {
    if ([int]$casRows -gt 0) { return "proceed" }
    if ($a -lt $MAX) { return "retry" } else { return "give_up" }
  }
  if ($phase -eq "insert") {
    if (-not (Is-Conflict $errCode)) { return "proceed" }
    if ($a -lt $MAX) { return "retry" } else { return "give_up" }
  }
  return "give_up"
}

# supersede phase
Check "cas: supersede casRows>0 -> proceed"           ((Upsert-Retry "supersede" 1 $null 1) -eq "proceed")
Check "cas: supersede 0 rows attempt1 -> retry"       ((Upsert-Retry "supersede" 0 $null 1) -eq "retry")
Check "cas: supersede 0 rows attempt2 -> give_up"     ((Upsert-Retry "supersede" 0 $null 2) -eq "give_up")
# insert phase — clean
Check "cas: insert no error -> proceed"               ((Upsert-Retry "insert" $null $null 1) -eq "proceed")
Check "cas: insert non-conflict err -> proceed"       ((Upsert-Retry "insert" $null "some other error" 1) -eq "proceed")
# insert phase — conflict by code
Check "cas: insert 23505 attempt1 -> retry"           ((Upsert-Retry "insert" $null "23505" 1) -eq "retry")
Check "cas: insert 23505 attempt2 -> give_up"         ((Upsert-Retry "insert" $null "23505" 2) -eq "give_up")
# insert phase — conflict by index-name message
Check "cas: insert index-name msg attempt1 -> retry"  ((Upsert-Retry "insert" $null "duplicate key value violates ux_m8_conversations_current_fact" 1) -eq "retry")
Check "cas: insert notebook index msg -> retry"       ((Upsert-Retry "insert" $null "ux_m8_research_notes_current_singleton" 1) -eq "retry")
# unknown phase -> give_up (defensive)
Check "cas: unknown phase -> give_up"                 ((Upsert-Retry "wat" 1 $null 1) -eq "give_up")

# ── Static wiring checks ──────────────────────────────────────────────────────
$root = Split-Path -Parent $PSScriptRoot
$turnLock  = Get-Content (Join-Path $root "lib\turn-lock.js") -Raw
$casRetry  = Get-Content (Join-Path $root "lib\cas-retry.js") -Raw
$memory    = Get-Content (Join-Path $root "lib\memory.js") -Raw
$notebook  = Get-Content (Join-Path $root "lib\notebook.js") -Raw
$consol    = Get-Content (Join-Path $root "lib\memory-consolidator.js") -Raw
$alerting  = Get-Content (Join-Path $root "lib\alerting.js") -Raw
$apiChat   = Get-Content (Join-Path $root "api\chat.js") -Raw
$apiStream = Get-Content (Join-Path $root "api\chat-stream.js") -Raw
$orch      = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw

# turn-lock module
Check "tl: kill flag M8_TURN_LOCK"                   ($turnLock.Contains("M8_TURN_LOCK"))
Check "tl: fail-open on error"                        ($turnLock.Contains("failOpen: true"))
Check "tl: TTL 200000 default"                        ($turnLock -match '"200000"')
Check "tl: exempts eval/battery"                      ($turnLock -match 'eval\|l5_\|eval_\|od_\|battery_')
Check "tl: exports lockDecision"                      ($turnLock -match 'lockDecision')
# NB: assert the stable ASCII text, not the ⏳ byte — PS 5.1 Get-Content -Raw
# reads in the ANSI codepage and mangles the emoji (test-mirror gotcha; the JS
# genuinely carries the emoji).
Check "tl: BUSY_MESSAGE text present"                 ($turnLock.Contains("still working on your previous message"))

# lock lives in HANDLERS only, NOT the orchestrator (delegation trap)
Check "wire: api/chat acquires lock"                 ($apiChat.Contains("acquireTurnLock"))
Check "wire: api/chat releases in finally"           ($apiChat -match 'finally\s*\{\s*await releaseTurnLock')
Check "wire: api/chat-stream acquires lock"          ($apiStream.Contains("acquireTurnLock"))
Check "wire: stream busy emits done+full"            ($apiStream.Contains("done: true, full: BUSY_MESSAGE"))
Check "wire: orchestrator does NOT import turn-lock" (-not ($orch -match 'require\(.{1,3}\./turn-lock'))

# CAS shared helper + both write paths
Check "cas: helper exports upsertRetryDecision"      ($casRetry.Contains("upsertRetryDecision"))
Check "cas: helper exports casWritesEnabled"         ($casRetry.Contains("casWritesEnabled"))
Check "cas: kill flag M8_CAS_WRITES"                 ($casRetry.Contains("M8_CAS_WRITES"))
Check "mem: upsertFact uses upsertRetryDecision"     ($memory.Contains("upsertRetryDecision({ phase"))
Check "mem: upsertFact CAS eq(is_current).select"    ($memory -match '\.eq\("id", cur\.id\)\.eq\("is_current", true\)\.select\("id"\)')
Check "mem: keeps pre-E1 path behind flag"           ($memory.Contains("if (!casWritesEnabled())"))
Check "nb: persistNote uses upsertRetryDecision"     ($notebook.Contains("upsertRetryDecision({ phase"))
Check "nb: persistNote singleton-only CAS"           ($notebook.Contains("!isSingleton || !casWritesEnabled()"))

# P4 extractor chaining (sequential, one promise)
Check "p4: extractors chained sequentially"          ($memory -match '_maybeCaptureRelationship\(sessionId, userMessage\)\s*\r?\n\s*\.then\(\(\)\s*=>\s*_maybeExtractFact')

# P4 alert CAS
Check "p4: patchAlert takes expectedState"           ($alerting.Contains("expectedState"))
Check "p4: applyAndCollect passes row.state"         ($alerting -match 'patchAlert\(condition, driverKey, t\.fields, row && row\.state\)')

# P5 consolidator fence + CAS
Check "p5: consolidator min-age env"                 ($consol.Contains("M8_CONSOLIDATOR_MIN_AGE_MIN"))
Check "p5: fetchFacts recency fence lt(created_at)"  ($consol -match '\.lt\("created_at"')
Check "p5: merge CAS eq(is_current).select"          ($consol -match '\.eq\("is_current", true\)\s*\r?\n\s*\.select\("id"\)')

# migration objects
$mig = Get-Content (Join-Path $root "migrations\E1_turn_integrity.sql") -Raw
Check "mig: creates m8_turn_locks"                   ($mig.Contains("create table if not exists public.m8_turn_locks"))
Check "mig: ux conversations current fact"           ($mig.Contains("ux_m8_conversations_current_fact"))
Check "mig: ux research notes singleton"             ($mig.Contains("ux_m8_research_notes_current_singleton"))

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
