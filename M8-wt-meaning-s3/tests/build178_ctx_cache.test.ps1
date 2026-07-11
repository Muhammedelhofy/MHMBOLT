# Build-178 - context-cache (D2 layout + D6 usage/telemetry).
# PS 5.1 mirror of the three pure additions + static wiring checks on the JS.
# Node is ABSENT in the offline battery: this mirror re-implements
#   (1) lib/llm.js extractUsage()          (provider-usage capture)
#   (2) lib/context-telemetry.js formatCompact() ROWS/CACHE segments
#   (3) lib/orchestrator.js buildSystemPrompt() layout REORDER (label level)
# and asserts by-construction values, then greps the JS for the wiring + the
# privacy/scope invariants. The REAL byte-level layout parity (buildSystemPrompt
# OFF == pre-B178 HEAD; ON == order-only) is proven separately against the live
# JS via the Kimi-node harness recorded in reports/build-178-cache-probe.md.

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}
function Is-Num($v) { return ($v -is [int]) -or ($v -is [long]) -or ($v -is [double]) -or ($v -is [decimal]) }

# =============================================================================
# (1) extractUsage(providerName, data) -> { promptTokens, cachedTokens }
#     Mirror of lib/llm.js. gemini* -> usageMetadata.*Count ; else -> usage.*
# =============================================================================
function Extract-Usage([string]$provider, $data) {
  $out = @{ promptTokens = $null; cachedTokens = $null }
  if ($null -eq $data) { return $out }
  $p = ([string]$provider).ToLower()
  if ($p.StartsWith("gemini")) {
    $u = $data.usageMetadata
    if ($null -ne $u) {
      if (Is-Num $u.promptTokenCount)        { $out.promptTokens = $u.promptTokenCount }
      if (Is-Num $u.cachedContentTokenCount) { $out.cachedTokens = $u.cachedContentTokenCount }
    }
  } else {
    $u = $data.usage
    if ($null -ne $u) {
      if (Is-Num $u.prompt_tokens) { $out.promptTokens = $u.prompt_tokens }
      $d = $u.prompt_tokens_details
      if ($null -ne $d -and (Is-Num $d.cached_tokens)) { $out.cachedTokens = $d.cached_tokens }
    }
  }
  return $out
}

# gemini shape
$gem = [pscustomobject]@{ usageMetadata = [pscustomobject]@{ promptTokenCount = 3200; cachedContentTokenCount = 512 } }
$rg = Extract-Usage "gemini" $gem
Check "u1 gemini prompt"  ($rg.promptTokens -eq 3200)
Check "u1 gemini cached"  ($rg.cachedTokens -eq 512)
# gemini2 provider name still reads the gemini shape (StartsWith gemini)
$rg2 = Extract-Usage "gemini2" $gem
Check "u2 gemini2 reads gemini shape" (($rg2.promptTokens -eq 3200) -and ($rg2.cachedTokens -eq 512))
# openai-compat shape (groq) with cached details
$oc = [pscustomobject]@{ usage = [pscustomobject]@{ prompt_tokens = 3200; prompt_tokens_details = [pscustomobject]@{ cached_tokens = 512 } } }
$ro = Extract-Usage "groq" $oc
Check "u3 groq prompt"    ($ro.promptTokens -eq 3200)
Check "u3 groq cached"    ($ro.cachedTokens -eq 512)
# openai-compat WITHOUT cached details -> prompt set, cached null (no hit reported yet)
$ocn = [pscustomobject]@{ usage = [pscustomobject]@{ prompt_tokens = 3200 } }
$ron = Extract-Usage "cerebras" $ocn
Check "u4 no-details prompt" ($ron.promptTokens -eq 3200)
Check "u4 no-details cached null" ($null -eq $ron.cachedTokens)
# absent usage -> nulls, never throws
$ra = Extract-Usage "groq" ([pscustomobject]@{})
Check "u5 absent -> both null" (($null -eq $ra.promptTokens) -and ($null -eq $ra.cachedTokens))
# null data -> nulls
$rn = Extract-Usage "gemini" $null
Check "u6 null data -> both null" (($null -eq $rn.promptTokens) -and ($null -eq $rn.cachedTokens))

# =============================================================================
# (2) formatCompact ROWS/CACHE segments (mirror of the B-178 additions).
#     Cache/rows sit right after the header so the 280-cap never truncates CACHE.
# =============================================================================
function Format-Compact($analysis, [string]$lane, $extra) {
  $parts = New-Object System.Collections.ArrayList
  [void]$parts.Add("L:" + $(if ($lane) { $lane } else { "?" }))
  [void]$parts.Add("TOT:" + [int]$analysis.total)
  [void]$parts.Add("H:" + [int]$analysis.historyTurns + "t/" + [int]$analysis.historyChars + "c")
  if ($null -ne $extra -and $null -ne $extra.rows) { [void]$parts.Add("ROWS:" + [int]$extra.rows) }
  if ($null -ne $extra -and $null -ne $extra.usage -and (($null -ne $extra.usage.promptTokens) -or ($null -ne $extra.usage.cachedTokens))) {
    $cached = $(if ($null -ne $extra.usage.cachedTokens) { $extra.usage.cachedTokens } else { 0 })
    $prompt = $(if ($null -ne $extra.usage.promptTokens) { $extra.usage.promptTokens } else { 0 })
    $prov   = $(if ($extra.provider) { $extra.provider } else { "?" })
    [void]$parts.Add("CACHE:" + $prov + ":" + $cached + "/" + $prompt)
  }
  if ([int]$analysis.head -gt 0) { [void]$parts.Add("HEAD:" + [int]$analysis.head) }
  foreach ($sec in $analysis.sections) { [void]$parts.Add($sec.label + ":" + [int]$sec.chars) }
  return ($parts -join " ").Substring(0, [Math]::Min(280, ($parts -join " ").Length))
}

$an = [pscustomobject]@{ total = 25158; historyTurns = 6; historyChars = 4000; head = 0;
  sections = @([pscustomobject]@{ label = "SYS"; chars = 16396 }, [pscustomobject]@{ label = "MEM"; chars = 5155 }) }
$ex = @{ usage = @{ promptTokens = 3200; cachedTokens = 512 }; provider = "groq"; rows = 14 }
$fc = Format-Compact $an "fleet" $ex
Check "f1 has ROWS:14"            ($fc.Contains("ROWS:14"))
Check "f2 has CACHE:groq:512/3200" ($fc.Contains("CACHE:groq:512/3200"))
# CACHE must come BEFORE the sections (near front -> survives the 280 cap)
Check "f3 CACHE before sections"  ($fc.IndexOf("CACHE:") -lt $fc.IndexOf("SYS:"))
# absent usage -> no CACHE segment (back-compat with B-168 rows)
$fc2 = Format-Compact $an "fleet" @{ rows = 14 }
Check "f4 rows only, no CACHE"     (($fc2.Contains("ROWS:14")) -and (-not $fc2.Contains("CACHE:")))
# no extra at all -> byte-identical to the B-168 row shape (no ROWS/CACHE)
$fc3 = Format-Compact $an "fleet" $null
Check "f5 no extra -> no ROWS/CACHE" ((-not $fc3.Contains("ROWS:")) -and (-not $fc3.Contains("CACHE:")))
# cached=0 is still reported (a measured MISS is data, not absence)
$ex0 = @{ usage = @{ promptTokens = 3200; cachedTokens = 0 }; provider = "groq"; rows = 0 }
$fc4 = Format-Compact $an "web" $ex0
Check "f6 cached=0 reported"       ($fc4.Contains("CACHE:groq:0/3200"))
Check "f7 rows=0 reported"         ($fc4.Contains("ROWS:0"))

# =============================================================================
# (3) buildSystemPrompt layout REORDER (label-level mirror of the D2 filter).
# =============================================================================
function Build-Parts($all,$fleetLoaded,$financeLoaded,$chartLikely,$exportLikely,$crossBook,$dietEnabled) {
  $isAll = ($all -eq $true) -or (-not $dietEnabled)
  $parts = New-Object System.Collections.ArrayList
  [void]$parts.Add("HEAD")
  if ($isAll) { [void]$parts.Add("FLEET_INTEGRITY"); [void]$parts.Add("FLEET_NO_DATA"); [void]$parts.Add("FINANCE_NO_DATA") }
  else {
    if ($fleetLoaded) { [void]$parts.Add("FLEET_INTEGRITY") } else { [void]$parts.Add("FLEET_NO_DATA") }
    if (-not $financeLoaded) { [void]$parts.Add("FINANCE_NO_DATA") }
  }
  [void]$parts.Add("MID")
  if ($isAll -or $chartLikely)  { [void]$parts.Add("CHARTS") }
  if ($isAll -or $exportLikely) { [void]$parts.Add("EXPORTS") }
  if ($isAll -or $crossBook)    { [void]$parts.Add("CROSS_BOOK") }
  [void]$parts.Add("ABILITIES")
  [void]$parts.Add("STYLE")
  return ,$parts
}
function Reorder-Layout($parts) {
  $STATIC = @("HEAD","MID","ABILITIES","STYLE")
  $out = New-Object System.Collections.ArrayList
  foreach ($s in $STATIC) { [void]$out.Add($s) }
  foreach ($p in $parts) { if ($STATIC -notcontains $p) { [void]$out.Add($p) } }   # lane rules keep relative order
  return ,$out
}

# OFF (layout off) order == the canonical B-169d order (byte-identity proxy at label level)
$off = Build-Parts $true $false $false $false $false $false $true
Check "L1 OFF canonical all-rules order" (($off -join ",") -eq "HEAD,FLEET_INTEGRITY,FLEET_NO_DATA,FINANCE_NO_DATA,MID,CHARTS,EXPORTS,CROSS_BOOK,ABILITIES,STYLE")
# ON order == static head first, then lane rules in original relative order
$on = Reorder-Layout $off
Check "L2 ON static-head-first"          (($on -join ",") -eq "HEAD,MID,ABILITIES,STYLE,FLEET_INTEGRITY,FLEET_NO_DATA,FINANCE_NO_DATA,CHARTS,EXPORTS,CROSS_BOOK")
# Across the full flag matrix: ON is a pure REORDER of OFF (same SET, order-only)
$matrixOk = $true; $headOk = $true
foreach ($all in @($true,$false)) { foreach ($fl in @($true,$false)) { foreach ($fin in @($true,$false)) {
  foreach ($ch in @($true,$false)) { foreach ($ex2 in @($true,$false)) { foreach ($cb in @($true,$false)) {
    $o = Build-Parts $all $fl $fin $ch $ex2 $cb $true
    $r = Reorder-Layout $o
    if ((($o | Sort-Object) -join ",") -ne (($r | Sort-Object) -join ",")) { $matrixOk = $false }
    $r4 = @($r)[0..3] -join ","
    if ($r4 -ne "HEAD,MID,ABILITIES,STYLE") { $headOk = $false }
  } } } } } }
Check "L3 ON==REORDER(OFF) over full matrix (order-only)" $matrixOk
Check "L4 ON head is always HEAD,MID,ABILITIES,STYLE"      $headOk

# =============================================================================
# (4) Static wiring checks on the JS.
# =============================================================================
$root = Split-Path -Parent $PSScriptRoot
$llm  = Get-Content (Join-Path $root "lib\llm.js") -Raw
$orch = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw
$tel  = Get-Content (Join-Path $root "lib\context-telemetry.js") -Raw

# -- llm.js (D6 usage capture) --
Check "w1 extractUsage defined"        ($llm.Contains("function extractUsage(providerName, data)"))
Check "w2 extractUsage exported"       ($llm -match "module\.exports = \{[^}]*extractUsage")
Check "w3 gemini usage wired"          ($llm.Contains('meta.usage = extractUsage("gemini", result)'))
Check "w4 openai-compat usage wired"   ($llm.Contains("meta.usage = extractUsage(providerName, data)"))
Check "w5 stream usage wired"          ($llm.Contains('meta.usage = extractUsage("gemini", { usageMetadata: streamUsage })'))
Check "w6 generate passes meta to fn"  ($llm.Contains("fn({ systemInstruction, contents, genConfig, meta })"))
$metaFwd = ([regex]::Matches($llm, [regex]::Escape("meta:              args.meta,"))).Count
Check "w7 all 6 openai-compat wrappers forward meta" ($metaFwd -eq 6)
# request payload unchanged: meta is NOT added to any payload object
Check "w8 meta not in request payload" (-not ($llm -match "payload\.meta") )

# -- orchestrator.js (D2 layout) --
Check "w9 M8_CTX_LAYOUT kill-switch"   ($orch.Contains("M8_CTX_LAYOUT"))
Check "w10 ctxLayoutEnabled defined"   ($orch.Contains("function ctxLayoutEnabled()"))
Check "w11 OFF returns untouched join" ($orch.Contains('if (!ctxLayoutEnabled()) return parts.join("\n\n");'))
Check "w12 ON reorders via filter"     ($orch.Contains("parts.filter((p) => STATIC.indexOf(p) === -1)"))
Check "w13 ON concat static+lane"      ($orch.Contains('return STATIC.concat(laneRules).join("\n\n");'))
# both telemetry call sites now pass usage/provider/rows (post-LLM).
# B-179 changed `rows:` from the recall pool (pastMemory.length) to the INJECTED
# selected count (selectedMem/selectedMemS.length) — match the stable prefix.
$usageSites = ([regex]::Matches($orch, [regex]::Escape("usage: meta.usage, provider: meta.provider, rows: selectedMem"))).Count
Check "w14 both telemetry sites pass usage" ($usageSites -eq 2)
# buffered telemetry moved POST-LLM: recordPacket no longer precedes log("llm_start")
$idxRec = $orch.IndexOf("await recordPacket({ systemInstruction, history, lane: ctxLane")
$idxStart = $orch.IndexOf('log("llm_start")')
Check "w15 buffered telemetry is post-LLM" (($idxRec -gt $idxStart) -and ($idxStart -gt 0))

# -- context-telemetry.js (D6 v2) --
Check "w16 formatCompact takes extra"  ($tel.Contains("function formatCompact(analysis, lane, extra)"))
Check "w17 CACHE segment emitted"      ($tel.Contains('`CACHE:${x.provider || "?"}:'))
Check "w18 ROWS segment emitted"       ($tel.Contains('`ROWS:${x.rows}`'))
Check "w19 ctx:cache console line"     ($tel.Contains('"[M8] ctx:cache"'))
Check "w20 recordPacket accepts usage/provider/rows" ($tel.Contains("async function recordPacket({ systemInstruction, history, lane, db, usage, provider, rows }"))

# =============================================================================
# (5) Privacy + scope invariants (acceptance 5).
# =============================================================================
# telemetry stays sizes/tokens only -> no message/content field is ever posted
Check "p1 no content in telemetry row" (-not ($tel -match "message:\s|content:\s|text:\s"))
Check "p2 sizes-only note kept"        ($tel.Contains("labels+counts only"))
# no new api/ function was added (Vercel 12-fn cap FULL)
$apiCount = (Get-ChildItem (Join-Path $root "api") -Recurse -Filter *.js | Measure-Object).Count
Check "p3 api fn count <= 12 (cap FULL, none added)" ($apiCount -le 12)

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
