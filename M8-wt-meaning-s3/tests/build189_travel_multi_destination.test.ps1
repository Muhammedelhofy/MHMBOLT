# Build-189 Travel lane multi-candidate destination fix -- PS 5.1 pure mirror (ASCII, no Node).
#
# Re-implements the PURE surface of the B-188 fix -- normalizeTrip's destinationCandidates
# handling (dedupe/cap/needs-2-plus/ignored-when-destination-present) and the
# destinationChoiceClarify + travelClarify precedence (ambiguous destination fires FIRST,
# before origin/dates) -- and asserts the SAME deterministic outputs on this Node-less host,
# so a PS-only fail vs a JS pass means a mirror bug, not a source bug. Arabic wording is
# checked via [char] codepoints so this file stays ASCII. Ends with the orchestrator.js
# static wire-guard greps (the widened gate + guarded resolveOrigin call).

$ErrorActionPreference = 'Stop'
$script:pass = 0; $script:fail = 0; $script:failLines = @()
function Assert-True([string]$label, [bool]$cond) {
  if ($cond) { $script:pass++ }
  else { $script:fail++; $script:failLines += $label; Write-Host "  FAIL  $label" -ForegroundColor Red }
}
function Assert-Eq([string]$label, $expected, $actual) {
  if ("$expected" -ceq "$actual") { $script:pass++ }
  else { $script:fail++; $script:failLines += $label; Write-Host "  FAIL  $label" -ForegroundColor Red; Write-Host "        exp: $expected"; Write-Host "        got: $actual" }
}

# ---- ported pure helpers (mirror of lib/travel.js) ----------------------------------

# normalizeTrip's destination/destinationCandidates slice only (the rest of normalizeTrip
# -- dates/party/needs -- is unchanged by B-188 and already covered by build183's mirror).
function Normalize-Destination($destCity, $candidates) {
  # candidates: array of hashtables @{ city=...; iata=... } (already-parsed-ish, mirrors
  # the JS city()/iata() coercion by simply requiring a non-empty string city).
  if ($destCity) {
    return @{ destination = @{ city = $destCity }; destinationCandidates = $null }
  }
  if ($candidates -and @($candidates).Count -gt 0) {
    $seen = @{}
    $cands = @()
    foreach ($c in @($candidates)) {
      if (-not $c) { continue }
      if (-not $c.city) { continue }
      $key = $c.city.Trim().ToLower()
      if ($seen.ContainsKey($key)) { continue }
      $seen[$key] = $true
      $cands += @{ city = $c.city.Trim(); iata = $c.iata }
      if (@($cands).Count -ge 4) { break }
    }
    if (@($cands).Count -ge 2) { return @{ destination = $null; destinationCandidates = $cands } }
  }
  return $null # no destination reconstructable
}

# destinationChoiceClarify: composes the ONE disambiguating question.
function Destination-Choice-Clarify($candidates, [bool]$ar) {
  $names = @($candidates | ForEach-Object { $_.city })
  if ($names.Count -le 1) {
    $list = if ($names.Count -eq 1) { $names[0] } else { '' }
  } elseif ($ar) {
    $AR_OR = [char]0x0623 + [char]0x0648  # "أو"
    $list = ($names[0..($names.Count - 2)] -join ([char]0x060C + ' ') ) + " $AR_OR " + $names[$names.Count - 1]
  } else {
    $list = ($names[0..($names.Count - 2)] -join ', ') + ' or ' + $names[$names.Count - 1]
  }
  if ($ar) {
    $AYYUHUMA = [char]0x0623 + [char]0x064A + [char]0x0647 + [char]0x0645 + [char]0x0627 + [char]0x062A + [char]0x0642 + [char]0x0635 + [char]0x062F
    return "$list -- $AYYUHUMA`?"
  }
  return "$list -- which one did you mean?"
}

# travelClarify: ambiguous-destination check runs FIRST, before origin/dates.
function Travel-Clarify-B188($trip) {
  if (-not $trip) { return $null }
  if ((-not $trip.destCity) -and $trip.destinationCandidates -and (@($trip.destinationCandidates).Count -ge 2)) {
    return (Destination-Choice-Clarify $trip.destinationCandidates $false)
  }
  if (-not $trip.destCity) { return $null }
  $needs = @($trip.needs); if ($needs.Count -eq 0) { $needs = @('flights') }
  $primary = $needs[0]
  $hasDates = ($trip.depart) -or $trip.flex
  if ($primary -eq 'flights' -and -not $hasDates) {
    if ($trip.originSrc -eq 'env' -or $trip.originSrc -eq 'profile') {
      return "Assuming you're flying from $($trip.originCity) (tell me if not) - what dates are you thinking?"
    }
    return 'Sure - what dates are you thinking?'
  }
  return $null
}

Write-Host "Build-189 Travel lane multi-candidate destination -- PS 5.1 pure mirror`n"

# ---- normalizeTrip destinationCandidates slice ---------------------------------------
$nt1 = Normalize-Destination $null @(@{ city = 'Hurghada'; iata = $null }, @{ city = 'Sharm El Sheikh'; iata = 'SSH' })
Assert-True "2 candidates: trip stays alive"          ($null -ne $nt1)
Assert-True "2 candidates: destination stays null"    ($null -eq $nt1.destination)
Assert-Eq  "2 candidates: count 2"                    2 (@($nt1.destinationCandidates).Count)
Assert-Eq  "2 candidates: first city order preserved" 'Hurghada' $nt1.destinationCandidates[0].city
Assert-Eq  "2 candidates: second city order preserved" 'Sharm El Sheikh' $nt1.destinationCandidates[1].city

$nt2 = Normalize-Destination $null @(@{ city = 'Hurghada' })
Assert-True "1 candidate + no destination -> null (not ambiguous, just absent)" ($null -eq $nt2)

$nt3 = Normalize-Destination $null @(@{ city = 'Hurghada' }, @{ city = 'HURGHADA' }, @{ city = 'Sharm' })
Assert-Eq  "duplicate candidate (case-insensitive) deduped -> 2" 2 (@($nt3.destinationCandidates).Count)

$nt4 = Normalize-Destination $null @(@{ city = 'A' }, @{ city = 'B' }, @{ city = 'C' }, @{ city = 'D' }, @{ city = 'E' })
Assert-Eq  "candidates capped at 4"                    4 (@($nt4.destinationCandidates).Count)

$nt5 = Normalize-Destination 'Cairo' @(@{ city = 'Hurghada' }, @{ city = 'Sharm' })
Assert-Eq  "decided destination wins, candidates ignored" 'Cairo' $nt5.destination.city
Assert-True "decided destination -> destinationCandidates null" ($null -eq $nt5.destinationCandidates)

Assert-True "no destination + no candidates -> null" ($null -eq (Normalize-Destination $null @()))

# ---- destinationChoiceClarify ---------------------------------------------------------
$two = Destination-Choice-Clarify @(@{ city = 'Hurghada' }, @{ city = 'Sharm El Sheikh' }) $false
Assert-True "2-candidate EN names both cities joined with 'or'" ($two -match 'Hurghada or Sharm El Sheikh')
Assert-True "2-candidate EN exactly one question mark"          ((([regex]::Matches($two, '\?')).Count) -eq 1)
Assert-True "2-candidate EN ends with a disambiguating question" ($two -match 'which one')

$three = Destination-Choice-Clarify @(@{ city = 'Bali' }, @{ city = 'Phuket' }, @{ city = 'Krabi' }) $false
Assert-True "3-candidate EN oxford-style list" ($three -match 'Bali, Phuket or Krabi')
Assert-True "3-candidate EN exactly one question mark" ((([regex]::Matches($three, '\?')).Count) -eq 1)

$ar = Destination-Choice-Clarify @(@{ city = 'Hurghada' }, @{ city = 'Sharm' }) $true
$AR_OR = [char]0x0623 + [char]0x0648
Assert-True "2-candidate AR names both cities + Arabic connective" (($ar -match 'Hurghada') -and ($ar -match 'Sharm') -and ($ar.Contains($AR_OR)))

# ---- travelClarify: ambiguous destination fires FIRST --------------------------------
$ambiguous = @{ destCity = $null; destinationCandidates = @(@{ city = 'Hurghada' }, @{ city = 'Sharm El Sheikh' }); needs = @('hotels') }
$clar = Travel-Clarify-B188 $ambiguous
Assert-True "travelClarify fires on ambiguous destination"        ($null -ne $clar)
Assert-True "travelClarify ambiguous text names both candidates"  (($clar -match 'Hurghada') -and ($clar -match 'Sharm El Sheikh'))
Assert-True "travelClarify ambiguous asks exactly ONE question"   ((([regex]::Matches($clar, '\?')).Count) -eq 1)

$notAmbiguous = @{ destCity = $null; destinationCandidates = @(@{ city = 'Hurghada' }); needs = @('hotels') }
Assert-True "travelClarify: single candidate not treated as ambiguous -> null" ($null -eq (Travel-Clarify-B188 $notAmbiguous))

$resolved = @{ destCity = 'Alexandria'; originCity = 'Riyadh'; originSrc = 'env'; depart = $null; needs = @('flights') }
$clarResolved = Travel-Clarify-B188 $resolved
Assert-True "regression: resolved destination -> original origin-confirm clarify" (($clarResolved -match "Assuming you're flying from Riyadh") -and ($clarResolved -notmatch 'which one'))

$ready = @{ destCity = 'Alexandria'; originCity = 'Riyadh'; originSrc = 'env'; depart = '2026-08-14'; needs = @('flights') }
Assert-True "regression: fully resolved trip -> travelClarify null" ($null -eq (Travel-Clarify-B188 $ready))

Assert-True "travelClarify(null) -> null" ($null -eq (Travel-Clarify-B188 $null))

# ---- orchestrator.js static wire guards ----------------------------------------------
$orPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\orchestrator.js'))
$or = [IO.File]::ReadAllText($orPath, [Text.Encoding]::UTF8)
Assert-True "orchestrator: computes _ambiguousDest off destinationCandidates.length >= 2" ($or -match '_ambiguousDest\s*=.*destinationCandidates.*length\s*>=\s*2')
Assert-True "orchestrator: widened gate admits resolved OR ambiguous destination"        ($or -match 'if\s*\(trip\s*&&\s*\(_hasDest\s*\|\|\s*_ambiguousDest\)\)')
Assert-True "orchestrator: resolveOrigin still gated to only when a destination resolved" ($or -match 'if\s*\(_hasDest\)')
Assert-True "orchestrator: travelClarify still called + still returns early"             (($or -match 'travel\.travelClarify\(trip, _ar\)') -and ($or -match 'if \(_clar\) \{'))

# ---- travel.js static wire guards -----------------------------------------------------
$tvPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\travel.js'))
$tv = [IO.File]::ReadAllText($tvPath, [Text.Encoding]::UTF8)
Assert-True "travel.js exports destinationChoiceClarify"        ($tv -match 'destinationChoiceClarify')
Assert-True "travel.js extractor schema documents destinationCandidates" ($tv -match 'destinationCandidates')
Assert-True "travel.js D8 payment boundary still intact (unchanged by B-188)" (($tv -match 'NEVER book or pay') -and ($tv -match 'confirm and pay'))

Write-Host ("`n=== Build-189 multi-destination mirror: {0} PASS / {1} FAIL ===" -f $script:pass, $script:fail)
if ($script:fail -gt 0) {
  Write-Host "`nFAILURES:" -ForegroundColor Yellow
  $script:failLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  exit 1
}
Write-Host "All Build-189 multi-destination mirror assertions passed." -ForegroundColor Green
