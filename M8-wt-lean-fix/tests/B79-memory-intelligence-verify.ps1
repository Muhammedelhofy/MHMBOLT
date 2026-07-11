# Build-79: Live Fact Extraction -- offline, pure PS 5.1.
# Verifies:
#   1. SUMMARY_ROW_THRESHOLD lowered from 10 to 4
#   2. FACT_EXTRACT_SYSTEM prompt exists and is conservative
#   3. _maybeExtractFact function defined
#   4. _maybeExtractFact wired into saveMemory (fire-and-forget)
#   5. extractImmediateFact exported
#   6. Fleet-figure guard still present (NEVER store earnings)
#   7. Ephemeral session guard in _maybeExtractFact

$ErrorActionPreference = 'Stop'
$pass = 0; $fail = 0

function Assert-True {
  param([string]$label, [bool]$cond)
  if ($cond) { Write-Host ("  PASS  " + $label) -ForegroundColor Green; $script:pass++ }
  else        { Write-Host ("  FAIL  " + $label) -ForegroundColor Red;   $script:fail++ }
}

$memPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\lib\memory.js"))
$mem = [IO.File]::ReadAllText($memPath, [Text.Encoding]::UTF8)

Write-Host "Build-79 memory intelligence verify`n"

# 1. SUMMARY_ROW_THRESHOLD lowered to 4
Write-Host "-- 1. SUMMARY_ROW_THRESHOLD --"
Assert-True "threshold default is now 4"          ($mem -match '"4"')
Assert-True "threshold comment mentions Build-79"  ($mem -match "Build-79")
Assert-True "threshold NOT still 10 as default"    (-not ($mem -match '"10"\s*\)'))

# 2. FACT_EXTRACT_SYSTEM prompt
Write-Host "`n-- 2. FACT_EXTRACT_SYSTEM prompt --"
Assert-True "FACT_EXTRACT_SYSTEM defined"              ($mem -match "FACT_EXTRACT_SYSTEM")
Assert-True "prompt is conservative (only if clearly)" ($mem -match "clearly and explicitly stated")
Assert-True "prompt bans fleet earnings"               ($mem -match "NEVER extract")
Assert-True "prompt distinguishes profile/operational" ($mem -match '"profile" = identity')
Assert-True "prompt uses free providers hint"          ($mem -match "groq,mistral") # B-185: cerebras dropped, dead 400 hop

# 3. _maybeExtractFact function defined
Write-Host "`n-- 3. _maybeExtractFact defined --"
Assert-True "_maybeExtractFact function exists"         ($mem -match "async function _maybeExtractFact")
Assert-True "ephemeral session guard present"           ($mem -match "isEphemeralSession\(sessionId\)" )
Assert-True "short message guard (length < 10)"         ($mem -match "userMessage\.length < 10")
Assert-True "calls upsertFact on valid result"          ($mem -match "upsertFact\(getClient\(\), sessionId")
Assert-True "catch block is non-fatal"                  ($mem -match "/\* background, non-fatal \*/")
Assert-True "uses FACT_EXTRACT_SYSTEM as system prompt" ($mem -match "systemInstruction: FACT_EXTRACT_SYSTEM")
Assert-True "caps user message at 600 chars"            ($mem -match "\.slice\(0, 600\)")
Assert-True "maxOutputTokens small (120)"               ($mem -match "maxOutputTokens: 120")

# 4. Wired into saveMemory (E1 §P4 chained; Build-170 AWAITED)
# E1 §P4: the two per-turn extractors are CHAINED (capture -> extract) in ONE
# promise ending in .catch, sequential so they can't race upsertFact on the same
# message. Build-170: the chain is now AWAITED (was fire-and-forget) so the durable
# fact lands before saveMemory returns — the Vercel lambda could freeze after the
# HTTP response yet before the background write, dropping isolated single-turn facts.
# .catch stays so a dropped fact never throws (non-fatal, matches Build-110 reflector).
Write-Host "`n-- 4. saveMemory wiring --"
Assert-True "_maybeExtractFact called in saveMemory"   ($mem -match "_maybeExtractFact\(sessionId, userMessage\)")
Assert-True "extractor chained after capture (E1)"     ($mem -match "(?s)_maybeCaptureRelationship\(sessionId, userMessage\)[\s\S]{0,120}\.then\(\(\) => _maybeExtractFact\(sessionId, userMessage\)\)")
Assert-True "chain is AWAITED (Build-170)"             ($mem -match "(?s)await\s+_maybeCaptureRelationship\(sessionId, userMessage\)")
Assert-True "chain still ends in .catch (non-fatal)"   ($mem -match "(?s)\.then\(\(\) => _maybeExtractFact\(sessionId, userMessage\)\)[\s\S]{0,60}\.catch\(\(\) => \{\}\)")

# 5. Exported as extractImmediateFact
Write-Host "`n-- 5. exports --"
Assert-True "extractImmediateFact exported"            ($mem -match "extractImmediateFact: _maybeExtractFact")

# 6. Fleet-figure guard unchanged
Write-Host "`n-- 6. fleet-figure guard --"
Assert-True "isFleetFigureFact guard still present"    ($mem -match "function isFleetFigureFact")
Assert-True "upsertFact still calls guard"             ($mem -match "isFleetFigureFact\(key, statement\)")

# 7. Existing ephemeral guard on saveMemory unchanged
Write-Host "`n-- 7. saveMemory ephemeral guard --"
Assert-True "saveMemory still guards ephemeral"        (($mem -split "function saveMemory")[1] -match "isEphemeralSession")

# Summary
Write-Host ""
$total = $pass + $fail
$color = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host ("Build-79 memory intelligence verify: " + $pass + "/" + $total + " passed") -ForegroundColor $color
if ($fail -gt 0) { exit 1 }
