# Build-169d — system-prompt context diet (E2 step 2: CUT, from B-169c's map)
# PS 5.1 mirror of orchestrator.js buildSystemPrompt() section-selection logic
# (Node is ABSENT on this host) + static wiring checks on the JS.

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

# ── mirror of buildSystemPrompt (labels instead of paragraph text) ─────────────
# Keep the selection logic IDENTICAL to lib/orchestrator.js buildSystemPrompt().
function Build-PromptSections($all, $fleetLoaded, $financeLoaded, $chartLikely, $exportLikely, $crossBook, $dietEnabled) {
  $isAll = ($all -eq $true) -or (-not $dietEnabled)
  $parts = New-Object System.Collections.ArrayList
  [void]$parts.Add("HEAD")
  if ($isAll) {
    [void]$parts.Add("FLEET_INTEGRITY"); [void]$parts.Add("FLEET_NO_DATA"); [void]$parts.Add("FINANCE_NO_DATA")
  } else {
    if ($fleetLoaded) { [void]$parts.Add("FLEET_INTEGRITY") } else { [void]$parts.Add("FLEET_NO_DATA") }
    if (-not $financeLoaded) { [void]$parts.Add("FINANCE_NO_DATA") }
  }
  [void]$parts.Add("MID")
  if ($isAll -or $chartLikely)  { [void]$parts.Add("CHARTS") }
  if ($isAll -or $exportLikely) { [void]$parts.Add("EXPORTS") }
  if ($isAll -or $crossBook)    { [void]$parts.Add("CROSS_BOOK") }
  [void]$parts.Add("ABILITIES")   # Build-176: capability-grounded never-decline list, every turn
  [void]$parts.Add("STYLE")
  return $parts
}

# ── Matrix: every branch of the selection logic ───────────────────────────────
# 1. all:true (the back-compat constant) → every section, canonical order
$m1 = Build-PromptSections $true $false $false $false $false $false $true
Check "m1 all -> 10 sections" ($m1.Count -eq 10)
Check "m1 canonical order"   (($m1 -join ",") -eq "HEAD,FLEET_INTEGRITY,FLEET_NO_DATA,FINANCE_NO_DATA,MID,CHARTS,EXPORTS,CROSS_BOOK,ABILITIES,STYLE")

# 2. kill switch (diet disabled) → identical to all:true even with lean flags
$m2 = Build-PromptSections $false $false $false $false $false $false $false
Check "m2 kill switch = full prompt" (($m2 -join ",") -eq ($m1 -join ","))

# 3. plain general/web turn (diet on, nothing loaded) → the lean prompt
$m3 = Build-PromptSections $false $false $false $false $false $false $true
Check "m3 lean turn -> 6 sections"  ($m3.Count -eq 6)
Check "m3 lean order"               (($m3 -join ",") -eq "HEAD,FLEET_NO_DATA,FINANCE_NO_DATA,MID,ABILITIES,STYLE")
Check "m3 keeps NO-DATA guard"      ($m3 -contains "FLEET_NO_DATA")
Check "m3 drops integrity"          (-not ($m3 -contains "FLEET_INTEGRITY"))

# 4. fleet turn → INTEGRITY in, NO-DATA out — never both, never neither
$m4 = Build-PromptSections $false $true $false $true $false $false $true
Check "m4 fleet -> integrity"       ($m4 -contains "FLEET_INTEGRITY")
Check "m4 fleet -> no NO-DATA"      (-not ($m4 -contains "FLEET_NO_DATA"))
Check "m4 fleet -> charts rule in"  ($m4 -contains "CHARTS")
foreach ($combo in @($true, $false)) {
  $mx = Build-PromptSections $false $combo $false $false $false $false $true
  $hasI = $mx -contains "FLEET_INTEGRITY"; $hasN = $mx -contains "FLEET_NO_DATA"
  Check ("m4 exactly one fleet rule (fleetLoaded=" + $combo + ")") ($hasI -ne $hasN)
}

# 5. finance turn → FINANCE_NO_DATA dropped (the P&L packet carries its rules)
$m5 = Build-PromptSections $false $false $true $false $false $false $true
Check "m5 finance -> no FINANCE_NO_DATA" (-not ($m5 -contains "FINANCE_NO_DATA"))
Check "m5 finance -> still fleet NO-DATA" ($m5 -contains "FLEET_NO_DATA")

# 6. export-shaped ask + cross-book packet → their rules ride along
$m6 = Build-PromptSections $false $false $false $false $true $true $true
Check "m6 export rule in"           ($m6 -contains "EXPORTS")
Check "m6 cross-book rule in"       ($m6 -contains "CROSS_BOOK")
Check "m6 charts still out"         (-not ($m6 -contains "CHARTS"))

# 7. core sections present in EVERY combination (the never-cut floor)
$allCombos = @()
foreach ($fl in @($true,$false)) { foreach ($fin in @($true,$false)) {
  $allCombos += ,(Build-PromptSections $false $fl $fin $false $false $false $true) } }
$coreOk = $true
foreach ($c in $allCombos) {
  if (-not (($c -contains "HEAD") -and ($c -contains "MID") -and ($c -contains "STYLE"))) { $coreOk = $false }
  if ($c[0] -ne "HEAD" -or $c[$c.Count-1] -ne "STYLE") { $coreOk = $false }
}
Check "m7 HEAD/MID/STYLE always present, HEAD first, STYLE last" $coreOk

# ── Static wiring checks on the JS ────────────────────────────────────────────
$root = Split-Path -Parent $PSScriptRoot
$or = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw

foreach ($c in @("M8_PROMPT_CORE_HEAD","RULE_FLEET_INTEGRITY","RULE_FLEET_NO_DATA","RULE_FINANCE_NO_DATA","M8_PROMPT_CORE_MID","RULE_CHARTS","RULE_FILE_EXPORTS","RULE_CROSS_BOOK","M8_PROMPT_ABILITIES","M8_PROMPT_STYLE")) {
  Check ("s1 const " + $c) ($or.Contains("const " + $c + " = ``"))
}
# Build-176: the abilities list is a CORE section pushed every turn (the never-decline floor)
Check "s1b buildSystemPrompt pushes ABILITIES" ($or.Contains("parts.push(M8_PROMPT_ABILITIES)"))
Check "s2 kill switch M8_PROMPT_DIET"        ($or.Contains("M8_PROMPT_DIET"))
Check "s3 mutually exclusive fleet ternary"  ($or.Contains("f.fleetLoaded ? RULE_FLEET_INTEGRITY : RULE_FLEET_NO_DATA"))
Check "s4 finance rule gated"                ($or.Contains("if (!f.financeLoaded) parts.push(RULE_FINANCE_NO_DATA)"))
Check "s5 back-compat full constant"         ($or.Contains("const M8_SYSTEM_PROMPT = buildSystemPrompt({ all: true })"))
$sites = ([regex]::Matches($or, "buildSystemPrompt\(\{\r?\n")).Count
Check "s6 both compose sites call builder"   ($sites -eq 2)
foreach ($flag in @("fleetLoaded:","financeLoaded:","chartLikely:","exportLikely:","crossBook:")) {
  $n = ([regex]::Matches($or, [regex]::Escape($flag))).Count
  Check ("s7 flag " + $flag + " at both sites") ($n -ge 2)
}
Check "s8 joins with blank line"             ($or.Contains('parts.join("\n\n")'))
# the paragraphs must exist EXACTLY once each (no duplicate copies left behind)
foreach ($p in @("FLEET DATA INTEGRITY (hard rule):","FLEET NO-DATA RULE (hard stop","FINANCE / P&L NO-DATA RULE","CHARTS & GRAPHICS (hard rule","FILE EXPORTS (hard rule","CROSS-BOOK ANALYSIS (hard rule):")) {
  $n = ([regex]::Matches($or, [regex]::Escape($p))).Count
  Check ("s9 single copy: " + $p.Substring(0, [Math]::Min(30, $p.Length))) ($n -eq 1)
}
# stream + buffered flag sources: alerts and morning brief count as fleet-loaded
Check "s10 buffered counts brief+alerts"     ($or.Contains("fleetCtx.text || morningBriefProactive || (_alertsOpen"))
Check "s11 stream counts brief+alerts"       ($or.Contains("fleetCtx.text || morningBriefProactiveS || (_alertsOpenS"))

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
