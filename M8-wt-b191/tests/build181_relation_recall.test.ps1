# Build-181 - entity-relation recall ("is X my <relation>?" surfaces the pinned fact).
# PS 5.1 offline mirror of the two PURE cores in lib/orchestrator.js
# (relationProbeFrom + resolveRelationEntity) plus static wiring/doctrine greps on
# the real JS. ASCII-only (PS-5.1): the EN shape is mirrored directly; the Arabic
# RE + the AR routing anchor are asserted by grepping the JS / driven by the JSON
# fixture (intent_gate_test.ps1), so this file needs no Arabic literals.
# PS-mirror rule: PS-fail + JS-pass = a mirror bug, fix here not the source.

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

# =============================================================================
# (1) relationProbeFrom mirror (EN). Copula + name-span + possessive; relation NP
#     is FREE TEXT. Kill-switch M8_RELATION_RECALL=off/0 -> null. ASCII subset of
#     the source RE (straight apostrophe, ASCII '?'); the curly-apostrophe + Arabic
#     variants are asserted present by the JS greps in section (3).
# =============================================================================
$RelRe = "\b(?:is|was|isn'?t|wasn'?t)\s+(.{2,40}?)\s+(?:my|our)\s+(.{2,60}?)(?:\s*[?.!,]|$)"
function Name-Ok([string]$n){
  $s = ([string]$n).Trim()
  if ($s.Length -lt 2) { return $false }
  if ($s -match '\d') { return $false }
  $toks = @($s -split '\s+' | Where-Object { $_ -ne "" })
  return ($toks.Count -ge 1 -and $toks.Count -le 4)
}
function Relation-Probe([string]$msg, [string]$flag){
  $v = ([string]$flag).Trim().ToLower()
  if ($v -eq "0" -or $v -eq "off") { return $null }
  $s = [string]$msg
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  $m = [regex]::Match($s, $RelRe, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if (-not $m.Success) { return $null }
  $name = ($m.Groups[1].Value).Trim().TrimEnd('?','.',',','!').Trim()
  $rel  = ($m.Groups[2].Value).Trim().TrimEnd('?','.',',','!').Trim()
  if ((Name-Ok $name) -and $rel.Length -ge 2) { return @{ name=$name; relation=$rel } }
  return $null
}
function Probe-Is($msg, $name, $rel){
  $r = Relation-Probe $msg "on"
  return ($r -ne $null -and $r.name -eq $name -and $r.relation -eq $rel)
}
Check "A1 canonical is Sara my wife"        (Probe-Is "is Sara my wife?" "Sara" "wife")
Check "A2 relation free text sister"        (Probe-Is "is Sara my sister?" "Sara" "sister")
Check "A3 negation isn't"                   (Probe-Is "isn't Sara my wife?" "Sara" "wife")
Check "A4 past copula was"                  (Probe-Is "was Sara my wife?" "Sara" "wife")
Check "A5 lowercase chat"                   (Probe-Is "is sara my wife" "sara" "wife")
Check "A6 conversational prefix ok,"        (Probe-Is "ok, is Sara my wife?" "Sara" "wife")
Check "A7 temporal tail"                    (Probe-Is "is Sara my wife this month?" "Sara" "wife this month")
Check "A8 or-compound"                      (Probe-Is "is Sara my wife or my sister?" "Sara" "wife or my sister")
Check "A9 our possessive"                   (Probe-Is "is Khalid our partner?" "Khalid" "partner")
Check "A10 two-token name"                  (Probe-Is "is Abu Omar my neighbor?" "Abu Omar" "neighbor")
# rejects
Check "A11 reject no name-span"             ((Relation-Probe "is my wife coming?" "on") -eq $null)
Check "A12 reject statement"                ((Relation-Probe "Sara is my wife" "on") -eq $null)
Check "A13 reject tag-question"             ((Relation-Probe "Sara is my wife, right?" "on") -eq $null)
Check "A14 reject not a relation shape"     ((Relation-Probe "how much did Sara spend in June" "on") -eq $null)
Check "A15 reject digits in name"           ((Relation-Probe "is 2024 my year?" "on") -eq $null)
Check "A16 reject empty"                    ((Relation-Probe "" "on") -eq $null)
Check "A17 shape-only match (junk name)"    ((Relation-Probe "is the sky my favorite color" "on") -ne $null)
# kill-switch
Check "K1 off -> null"                      ((Relation-Probe "is Sara my wife?" "off") -eq $null)
Check "K2 0 -> null"                        ((Relation-Probe "is Sara my wife?" "0") -eq $null)
Check "K3 on -> live"                       ((Relation-Probe "is Sara my wife?" "on") -ne $null)

# =============================================================================
# (2) resolveRelationEntity mirror + the SS4 PII invariant (unresolved -> null).
# =============================================================================
$CardTypes = @("person","company","organization")
function Resolve-Rel([string]$name, $card, $member, $pastMemory){
  if ($card) {
    $m = [regex]::Match([string]$card, '^\s*\[(\w+)\]')
    if ($m.Success -and ($CardTypes -contains $m.Groups[1].Value.ToLower())) {
      return @{ entityCard=$card; knownPersonCard=$false; via="tracked entity card" }
    }
  }
  if ($member) { return @{ entityCard=$null; knownPersonCard=$true; via="household member" } }
  if ($pastMemory) {
    $ln = ([string]$name).ToLower()
    foreach ($r in @($pastMemory)) {
      if ($r.memory_type -eq "profile" -and ([string]$r.content).ToLower().Contains($ln)) {
        return @{ entityCard=$null; knownPersonCard=$true; via="stored profile memory" }
      }
    }
  }
  return $null
}
$pmSara = @(@{ memory_type="profile"; content="Muhammad's wife is Sara" })
$r1 = Resolve-Rel "Sara" $null @{ id=1; name="Sara" } @()
Check "B1 member hit"          ($r1 -ne $null -and $r1.knownPersonCard -eq $true -and $r1.via -eq "household member")
$r2 = Resolve-Rel "Sara" $null $null $pmSara
Check "B2 profile row hit"     ($r2 -ne $null -and $r2.knownPersonCard -eq $true -and $r2.via -eq "stored profile memory")
$r3 = Resolve-Rel "Terras" "[company] Terras`n  bar" $null @()
Check "B3 company card"        ($r3 -ne $null -and $r3.entityCard -ne $null -and $r3.via -eq "tracked entity card")
$r4 = Resolve-Rel "Khalid" "[person] Khalid" $null @()
Check "B4 person card"         ($r4 -ne $null -and $r4.via -eq "tracked entity card")
$r5 = Resolve-Rel "Riyadh" "[place] Riyadh" $null @()
Check "B5 place card rejected" ($r5 -eq $null)
# SS4 invariant: unresolved stranger -> null (caller writes zero state)
Check "B6 SS4 stranger -> null"       ((Resolve-Rel "Jonathan" $null $null $pmSara) -eq $null)
Check "B7 SS4 non-person card -> null" ((Resolve-Rel "Jonathan" "[place] Jonathan Park" $null $pmSara) -eq $null)
Check "B8 SS4 no signals -> null"     ((Resolve-Rel "Jonathan" $null $null $null) -eq $null)
$r9 = Resolve-Rel "Sara" "[person] Sara" @{ id=1; name="Sara" } @()
Check "B9 card outranks member"       ($r9 -ne $null -and $r9.via -eq "tracked entity card")

# =============================================================================
# (3) Static wiring + doctrine greps on the REAL JS.
# =============================================================================
$root = Split-Path -Parent $PSScriptRoot
$orch = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw

Check "w-en-re defined"        ($orch.Contains("const RELATION_PROBE_RE ="))
Check "w-ar-re defined"        ($orch.Contains("const RELATION_PROBE_AR_RE ="))
Check "w-probe fn"             ($orch.Contains("function relationProbeFrom(message)"))
Check "w-resolver fn"          ($orch.Contains("function resolveRelationEntity(name, signals)"))
Check "w-killswitch"           ($orch.Contains("M8_RELATION_RECALL"))
Check "w-exports probe+resolver" ($orch -match "module.exports[\s\S]*relationProbeFrom, resolveRelationEntity")
# buffered on-ramp only runs when the who-is RE did NOT claim the turn
Check "w-buffered gate !entityCardName" ($orch.Contains("if (!entityCardName) {") )
# entityCardName stays the who-is-only const (guard never sees a relation name)
Check "w-entityCardName still const" ($orch.Contains("const entityCardName = entityCardNameFrom(baseMessage)"))
# state armed ONLY inside the resolution branch (the SS4 invariant, structurally)
Check "w-relationAsk on hit"   ($orch.Contains("relationAsk = { name: _probe.name, relation: _probe.relation, via: _res.via }"))
Check "w-telemetry on hit"     ($orch.Contains('log("relation_recall"'))
# compose: relation-check directive wired at both card + known-person sites
Check "w-relationCheck directive" ($orch.Contains("RELATION CHECK:"))
Check "w-directive grounds only" ($orch.Contains("do NOT use general/world knowledge or the web to confirm or deny a personal relation"))
# stream: resolved probe flips non-streamable (delegate, one implementation)
Check "w-stream flag"          ($orch.Contains("let relationProbeS = false;"))
Check "w-stream in conjunction" ($orch.Contains("const streamable = !relationProbeS &&"))

# -- ZERO-DIFF guardrails (SS4): the B-167 surfaces must be byte-identical --
Check "g-guard condition intact" ($orch.Contains('process.env.M8_GROUNDING_GUARD === "1" && entityCardName && !entityCardSuppressSearch && !_ggAcceptedSearch && !isCheckableFact(baseMessage)'))
Check "g-consent accept intact"  ($orch.Contains("looksAffirmative(baseMessage) && lastWasGroundingOffer(history)"))
Check "g-decideAction gate intact" ($orch.Contains("!entityCardSuppressSearch && !forceKnowledgeLookup && !_ggAcceptedSearch"))

# -- DOCTRINE: no relation vocabulary in the REGEXES (meaning-first, no keyword lane).
#    The word list may appear in comments / the directive-example text, but NEVER in
#    the two probe RE definitions. Extract each RE literal line and assert it is clean.
$vocab = 'wife|husband|brother|sister|boss|partner|father|mother|son|daughter|uncle|aunt|cousin'
$enReLine = ($orch -split "`n" | Where-Object { $_ -match 'const RELATION_PROBE_RE =' }) -join ""
$arReLine = ($orch -split "`n" | Where-Object { $_ -match 'const RELATION_PROBE_AR_RE =' }) -join ""
Check "d-en-re no relation vocab" (-not ($enReLine -match $vocab))
Check "d-ar-re no relation vocab" (-not ($arReLine -match $vocab))
Check "d-en-re is structural"     ($enReLine -match 'my\|our')

# -- SCOPE: routing SSOTs must have ZERO diff for this build (assert files unchanged
#    is a git concern; here assert the probe added NO routing symbols to them).
foreach ($f in @("capability-registry.js","domain-arbiter.js")) {
  $txt = Get-Content (Join-Path $root ("lib\" + $f)) -Raw
  Check ("s-no relation-recall in " + $f) (-not ($txt.Contains("relationProbeFrom") -or $txt.Contains("RELATION_PROBE")))
}
# no new api/ function (Vercel 12-fn cap FULL)
$apiCount = (Get-ChildItem (Join-Path $root "api") -Recurse -Filter *.js | Measure-Object).Count
Check "s-api fn count <= 12"     ($apiCount -le 12)

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
