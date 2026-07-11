# Build-182 - Arabic-aware relation resolution (the B-181 residual).
# PS 5.1 offline mirror of the two new PURE helpers in lib/orchestrator.js
# (rosterLatinAliasFor + profileNamesRelationEntity) plus static wiring/doctrine
# greps on the real JS. ASCII-only source (PS-5.1 gotcha): Arabic test strings are
# built from Unicode code points via U(), never typed as literal characters, so this
# file has no file-encoding dependency (no UTF-8-BOM requirement).
# PS-mirror rule: PS-fail + JS-pass = a mirror bug, fix here not the source.

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}
function U([int[]]$codepoints) { -join ($codepoints | ForEach-Object { [char]$_ }) }

# Arabic literals built from code points (sara / sara-alt-spelling / muhammad / a
# stranger name NOT in the roster), mirroring lib/orchestrator.js's _MEMBER_ALIASES.
$AR_Sara      = U 0x0633,0x0627,0x0631,0x0629              # سارة
$AR_SaraAlt   = U 0x0633,0x0627,0x0631,0x0627              # سارا
$AR_SaraAlt2  = U 0x0633,0x0627,0x0631,0x0647              # ساره
$AR_Muhammad  = U 0x0645,0x062D,0x0645,0x062F              # محمد
$AR_Stranger  = U 0x062C,0x0648,0x0646,0x0627,0x062B,0x0627,0x0646  # جوناثان

# =============================================================================
# (1) rosterLatinAliasFor mirror - AR name -> roster Latin base, else null.
#     Scoped to ONLY this alias table (his own roster) - never a general
#     transliteration table, so a name with no roster alias returns null.
# =============================================================================
$MemberAliases = @{
  sara     = @("sara", "sarah", $AR_Sara, $AR_SaraAlt, $AR_SaraAlt2)
  muhammad = @("muhammad", "mohammed", "mohamed", "mohammad", $AR_Muhammad)
}
function Roster-Latin-Alias([string]$name) {
  $s = ([string]$name).Trim()
  if ($s -eq "") { return $null }
  $low = $s.ToLower()
  foreach ($base in $MemberAliases.Keys) {
    if (($MemberAliases[$base] -contains $low) -or ($MemberAliases[$base] -contains $s)) { return $base }
  }
  return $null
}
Check "A1 AR sara -> sara base"        ((Roster-Latin-Alias $AR_Sara) -eq "sara")
Check "A2 AR sara-alt -> sara base"    ((Roster-Latin-Alias $AR_SaraAlt) -eq "sara")
Check "A3 AR muhammad -> muhammad base" ((Roster-Latin-Alias $AR_Muhammad) -eq "muhammad")
Check "A4 Latin Sara -> sara (ci)"     ((Roster-Latin-Alias "Sara") -eq "sara")
Check "A5 AR stranger -> null"         ((Roster-Latin-Alias $AR_Stranger) -eq $null)
Check "A6 empty/null -> null"          ((Roster-Latin-Alias "") -eq $null -and (Roster-Latin-Alias $null) -eq $null)

# =============================================================================
# (2) profileNamesRelationEntity mirror - does a stored PROFILE row name this
#     entity, checked against the name AND its roster Latin equivalent.
# =============================================================================
function Profile-Names-Relation([string]$name, $pastMemory) {
  if ($pastMemory -eq $null) { return $false }
  $ln  = ([string]$name).ToLower()
  $alt = Roster-Latin-Alias $name
  foreach ($r in @($pastMemory)) {
    if ($r -eq $null) { continue }
    if ($r.memory_type -ne "profile") { continue }
    $c = ([string]$r.content).ToLower()
    if ($c.Contains($ln)) { return $true }
    if ($alt -and $c.Contains($alt)) { return $true }
  }
  return $false
}
$pmSaraLatin = @(@{ memory_type = "profile"; content = "Sara is your wife" })
Check "B1 AR name matches Latin profile row via alias" ((Profile-Names-Relation $AR_Sara $pmSaraLatin) -eq $true)
Check "B2 Latin name still matches directly"           ((Profile-Names-Relation "Sara" $pmSaraLatin) -eq $true)
Check "B3 AR stranger does NOT match"                  ((Profile-Names-Relation $AR_Stranger $pmSaraLatin) -eq $false)
Check "B4 null pastMemory -> false"                    ((Profile-Names-Relation $AR_Sara $null) -eq $false)
$pmNonProfile = @(@{ memory_type = "mention"; content = "Sara is your wife" })
Check "B5 non-profile memory_type ignored"              ((Profile-Names-Relation $AR_Sara $pmNonProfile) -eq $false)

# =============================================================================
# (3) resolveRelationEntity mirror (updated to route pastMemory through the new
#     profile-names helper) - end-to-end AR resolution + the SS4 invariant.
# =============================================================================
$CardTypes = @("person", "company", "organization")
function Resolve-Rel([string]$name, $card, $member, $pastMemory) {
  if ($card) {
    $m = [regex]::Match([string]$card, '^\s*\[(\w+)\]')
    if ($m.Success -and ($CardTypes -contains $m.Groups[1].Value.ToLower())) {
      return @{ entityCard = $card; knownPersonCard = $false; via = "tracked entity card" }
    }
  }
  if ($member) { return @{ entityCard = $null; knownPersonCard = $true; via = "household member" } }
  if (Profile-Names-Relation $name $pastMemory) {
    return @{ entityCard = $null; knownPersonCard = $true; via = "stored profile memory" }
  }
  return $null
}
$pmWife = @(@{ memory_type = "profile"; content = "Muhammad's wife is Sara" })
$c1 = Resolve-Rel $AR_Sara $null $null $pmWife
Check "C1 AR sara resolves via stored profile memory" ($c1 -ne $null -and $c1.knownPersonCard -eq $true -and $c1.via -eq "stored profile memory")
$c2 = Resolve-Rel $AR_Stranger $null $null $pmWife
Check "C2 SS4: AR stranger name -> null (zero state)" ($c2 -eq $null)
$c3 = Resolve-Rel $AR_Sara $null @{ id = 1; name = "Sara" } @()
Check "C3 AR name + member hit -> household member (priority unchanged)" ($c3 -ne $null -and $c3.via -eq "household member")

# =============================================================================
# (4) Static wiring + doctrine greps on the REAL JS.
# =============================================================================
$root = Split-Path -Parent $PSScriptRoot
$orch = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw

Check "w-helper fn rosterLatinAliasFor"      ($orch.Contains("function _rosterLatinAliasFor(name)"))
Check "w-helper fn profileNamesRelationEntity" ($orch.Contains("function _profileNamesRelationEntity(name, pastMemory)"))
Check "w-resolver reuses shared helper"      ($orch.Contains("if (_profileNamesRelationEntity(name, sig.pastMemory)) {"))
Check "w-exports new helpers"                ($orch -match "rosterLatinAliasFor: _rosterLatinAliasFor, profileNamesRelationEntity: _profileNamesRelationEntity")
# both async call sites try the roster Latin fallback for matchMember
Check "w-buffered site AR fallback"          ($orch.Contains("if (!_member && _altLatin) { try { _member = await matchMember(_altLatin); } catch (_) { /* non-fatal */ } }"))
Check "w-stream site AR fallback"            ($orch.Contains("if (_altLatin) { try { if (await matchMember(_altLatin)) relationProbeS = true; } catch (_) { /* non-fatal */ } }"))
Check "w-stream site reuses shared helper"   ($orch.Contains("if (!relationProbeS) relationProbeS = _profileNamesRelationEntity(_rp.name, pastMemory);"))

# -- ZERO-DIFF guardrails (SS4, re-proven): entityCardName + the B-167 guard
#    condition + the exports of the B-181 pure fns must be byte-identical.
Check "g-entityCardName still const"         ($orch.Contains("const entityCardName = entityCardNameFrom(baseMessage)"))
Check "g-guard condition intact"             ($orch.Contains('process.env.M8_GROUNDING_GUARD === "1" && entityCardName && !entityCardSuppressSearch && !_ggAcceptedSearch && !isCheckableFact(baseMessage)'))
Check "g-b181 exports intact"                ($orch.Contains("relationProbeFrom, resolveRelationEntity,"))

# -- SCOPE: the AR alias table must stay scoped to the roster's OWN alias table -
#    only sara/muhammad bases, never a general name/transliteration list.
Check "d-helper reuses _MEMBER_ALIASES only" ($orch.Contains("for (const base of Object.keys(_MEMBER_ALIASES)) {"))
Check "d-no new alias table introduced"      (-not ($orch -match "_AR_NAME_TABLE|_TRANSLITERATION|_WORLD_NAMES"))

# -- SCOPE: routing SSOTs must have ZERO diff for this build.
foreach ($f in @("capability-registry.js", "domain-arbiter.js")) {
  $txt = Get-Content (Join-Path $root ("lib\" + $f)) -Raw
  Check ("s-no relation-recall in " + $f) (-not ($txt.Contains("rosterLatinAliasFor") -or $txt.Contains("profileNamesRelationEntity")))
}
# no new api/ function (Vercel 12-fn cap FULL)
$apiCount = (Get-ChildItem (Join-Path $root "api") -Recurse -Filter *.js | Measure-Object).Count
Check "s-api fn count <= 12" ($apiCount -le 12)

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
