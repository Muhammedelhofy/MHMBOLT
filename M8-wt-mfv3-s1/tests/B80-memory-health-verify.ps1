# Build-80: Recall scope fix + memory-health endpoint — offline, pure PS 5.1.
# Verifies:
#   1. Tier 1 recall no longer excludes currentSessionId
#   2. Build-80 comment present explaining the fix
#   3. Tier 2 recall still excludes currentSessionId (raw turns / summaries)
#   4. memory-health endpoint exists and has correct shape
#   5. endpoint returns facts + summaries + summary block
#   6. endpoint is GET-only, CORS-open, Supabase-gated

$ErrorActionPreference = 'Stop'
$pass = 0; $fail = 0

function Assert-True {
  param([string]$label, [bool]$cond)
  if ($cond) { Write-Host ("  PASS  " + $label) -ForegroundColor Green; $script:pass++ }
  else        { Write-Host ("  FAIL  " + $label) -ForegroundColor Red;   $script:fail++ }
}

$memPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\lib\memory.js"))
$mem = [IO.File]::ReadAllText($memPath, [Text.Encoding]::UTF8)

Write-Host "Build-80 memory health verify`n"

# 1. Tier 1 fix: currentSessionId exclusion removed from facts query
Write-Host "-- 1. Tier 1 recall scope fix --"
Assert-True "Build-80 fix comment present"                  ($mem -match "Build-80 fix")
# The profile/operational query must NOT have neq(session_id) immediately before it.
# Build-85e added a graceful-degrade fallback duplicating the Tier-2 pool query
# (for hosts whose merged_into column isn't migrated yet), so there are now 2
# occurrences instead of 1 -- both still in Tier 2, none in Tier 1.
$neqMatches = [regex]::Matches($mem, '\.neq\("session_id", currentSessionId\)')
Assert-True "neq(session_id) occurrences are Tier 2 only, not Tier 1" ($neqMatches.Count -ge 1)
Assert-True "Tier 1 still filters is_current=true"          ($mem -match '\.eq\("is_current", true\)')
# Build-140 split the combined .in("memory_type", ["profile","operational"])
# query into two separate _fetchFacts(type, limit) calls (profile recalled in
# full, operational capped to the newest N) so profile facts never get crowded
# out by churning operational rows.
Assert-True "Tier 1 still filters memory_type profile/oper" ($mem -match '_fetchFacts\("profile"' -and $mem -match '_fetchFacts\("operational"')

# 2. Tier 2 still excludes currentSessionId (raw turns should not bleed in)
Write-Host "`n-- 2. Tier 2 exclusion unchanged --"
# Every remaining neq must come AFTER the Tier 2 marker in the file.
$tier2Pos = $mem.IndexOf("Tier 2 ")
$allAfterTier2 = $true
foreach ($m in $neqMatches) { if ($m.Index -le $tier2Pos) { $allAfterTier2 = $false } }
Assert-True "all Tier 2 neq occurrences come after Tier 1 section" $allAfterTier2

# 3. memory-health endpoint -- RETIRED (2026-06-21, commit b69ba61: Hobby 12-fn
#    consolidation deleted api/memory-health.js outright as a confirmed-dead
#    endpoint with zero runtime callers; the feature was never reached via HTTP,
#    only via lib/memory.js directly. Nothing replaced it -- there is no
#    lib/handlers equivalent, unlike the ingest endpoints in the same commit.
#    Sections 3-5 (which asserted on api/memory-health.js's body) are gone with it.

# Summary
Write-Host ""
$total = $pass + $fail
$color = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host ("Build-80 memory health verify: " + $pass + "/" + $total + " passed") -ForegroundColor $color
if ($fail -gt 0) { exit 1 }
