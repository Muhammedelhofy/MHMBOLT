# Build-168 — context-packet telemetry (E2 step 1: MEASURE)
# PS 5.1 mirror of lib/context-telemetry.js analyzePacket() + static wiring checks.
# Node is ABSENT on this host: the mirror re-implements the pure classifier and
# asserts against by-construction expected values, then greps the JS for the
# safety invariants (kill switch, awaited insert, tight timeout, 2 call sites).

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

# ── mirror of MARKERS (keep in sync with lib/context-telemetry.js) ────────────
# B-169c: order is PRIORITY — same-offset collisions resolve to the EARLIER entry
# (specific prompt-rule / report headers before the generic "FLEET "/"COMPANY ").
$MARKERS = @(
  @("SYS",      "CURRENT DATE:"),
  @("SYS",      "FLEET DATA INTEGRITY"),
  @("SYS",      "FLEET NO-DATA RULE"),
  @("MEM",      "RELEVANT MEMORY"),
  @("HH",       "HOUSEHOLD ("),
  @("CONFLICT", ("NOTE " + [char]0x2014 + " possible conflicting")),
  @("EVID",     "GROUNDED EVIDENCE"),
  @("KG",       "KNOWLEDGE GRAPH"),
  @("ENT",      "KNOWN ENTITIES"),
  @("BRIDGE",   "ENTITY <-> GRAPH LINKS"),
  @("TOPICS",   "RECURRING TOPICS"),
  @("CARD",     "ENTITY CARD"),
  @("WEB",      "WEB SEARCH RESULTS"),
  @("FIN",      "FLEET P&L"),
  @("FLEET",    "COMPANY P&L"),
  @("FLEET",    "FLEET "),
  @("COMPANY",  "COMPANY "),
  @("EOSB",     "EOSB "),
  @("RESEARCH", "RESEARCH ")
)

function Analyze-Packet([string]$s) {
  $hits = New-Object System.Collections.ArrayList
  for ($mi = 0; $mi -lt $MARKERS.Count; $mi++) {
    $label = $MARKERS[$mi][0]; $prefix = $MARKERS[$mi][1]
    if ($s.StartsWith($prefix)) { [void]$hits.Add((New-Object PSObject -Property @{ label = $label; start = 0; pri = $mi })) }
    $needle = "`n`n" + $prefix
    $from = 0
    while ($true) {
      if ($from -ge $s.Length) { break }
      $idx = $s.IndexOf($needle, $from)
      if ($idx -lt 0) { break }
      [void]$hits.Add((New-Object PSObject -Property @{ label = $label; start = $idx; pri = $mi }))
      $from = $idx + $needle.Length
    }
  }
  # B-169c explicit tie-break: (start, pri) — mirrors the JS comparator exactly.
  $sorted = @($hits | Sort-Object -Property start, pri)
  # de-dupe identical starts
  $uniq = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $sorted.Count; $i++) {
    if ($i -eq 0) { [void]$uniq.Add($sorted[$i]) }
    elseif ($sorted[$i].start -ne $sorted[$i - 1].start) { [void]$uniq.Add($sorted[$i]) }
  }
  $byLabel = @{}
  for ($i = 0; $i -lt $uniq.Count; $i++) {
    if ($i + 1 -lt $uniq.Count) { $end = $uniq[$i + 1].start } else { $end = $s.Length }
    $size = $end - $uniq[$i].start
    if ($byLabel.ContainsKey($uniq[$i].label)) { $byLabel[$uniq[$i].label] = $byLabel[$uniq[$i].label] + $size }
    else { $byLabel[$uniq[$i].label] = $size }
  }
  if ($uniq.Count -gt 0) { $head = $uniq[0].start } else { $head = $s.Length }
  return New-Object PSObject -Property @{ total = $s.Length; sections = $byLabel; head = $head }
}

# ── Case 1: SYS + MEM + WEB — exact by-construction sizes ─────────────────────
$sys = "CURRENT DATE: Today is Thursday. SYSTEM PROMPT body here."
$mem = "`n`nRELEVANT MEMORY (past sessions):`nBoss prefers structured answers"
$web = "`n`nWEB SEARCH RESULTS (live, retrieved now):`nsnippet one`nsnippet two"
$a1 = Analyze-Packet ($sys + $mem + $web)
Check "c1 total"      ($a1.total -eq ($sys.Length + $mem.Length + $web.Length))
Check "c1 head=0"     ($a1.head -eq 0)
Check "c1 SYS size"   ($a1.sections["SYS"] -eq $sys.Length)
Check "c1 MEM size"   ($a1.sections["MEM"] -eq $mem.Length)
Check "c1 WEB size"   ($a1.sections["WEB"] -eq $web.Length)
Check "c1 3 sections" ($a1.sections.Keys.Count -eq 3)

# ── Case 2: marker WORD inside content (no \n\n boundary) must NOT split ──────
$mem2 = "`n`nRELEVANT MEMORY (past):`nwe reviewed FLEET numbers and KNOWLEDGE GRAPH ideas inline"
$a2 = Analyze-Packet ($sys + $mem2)
Check "c2 no FLEET section" (-not $a2.sections.ContainsKey("FLEET"))
Check "c2 no KG section"    (-not $a2.sections.ContainsKey("KG"))
Check "c2 MEM absorbs tail" ($a2.sections["MEM"] -eq $mem2.Length)

# ── Case 3: real \n\n-boundary FLEET packet IS split; repeated label merges ───
$fl1 = "`n`nFLEET DATA " + [char]0x2014 + " snapshot day one"
$fl2 = "`n`nFLEET ALERT " + [char]0x2014 + " tier slip"
$a3 = Analyze-Packet ($sys + $fl1 + $mem + $fl2)
Check "c3 FLEET merged size" ($a3.sections["FLEET"] -eq ($fl1.Length + $fl2.Length))
Check "c3 MEM intact"        ($a3.sections["MEM"] -eq $mem.Length)

# ── Case 4: packet not starting with a marker → head counted ──────────────────
$pre = "unlabelled preamble text"
$a4 = Analyze-Packet ($pre + $mem)
Check "c4 head size" ($a4.head -eq $pre.Length)

# ── Case 5 (B-169c): the system prompt's own "FLEET …" rule paragraphs count as
#    SYS, not FLEET — this was the phantom "FLEET 9.6k on every turn". ──────────
$em = [char]0x2014
$rule1 = "`n`nFLEET DATA INTEGRITY (hard rule): figures inside a FLEET DATA block are ground truth."
$rule2 = "`n`nFLEET NO-DATA RULE (hard stop $em the most important integrity rule): if no block, no numbers."
$a5 = Analyze-Packet ($sys + $rule1 + $rule2 + $mem)
Check "c5 no FLEET section"      (-not $a5.sections.ContainsKey("FLEET"))
Check "c5 SYS absorbs rule tail" ($a5.sections["SYS"] -eq ($sys.Length + $rule1.Length + $rule2.Length))
Check "c5 MEM intact"            ($a5.sections["MEM"] -eq $mem.Length)

# ── Case 6 (B-169c): a REAL fleet packet after the rules still labels FLEET,
#    and the fleet report's "COMPANY P&L" paragraph stays FLEET (not COMPANY) —
#    this was the phantom "COMPANY 11.5k on fleet turns". ───────────────────────
$rep  = "`n`nFLEET INTELLIGENCE REPORT $em June (day 2 of 30). ground truth."
$pnl  = "`n`nCOMPANY P&L (drivers with a cost profile: 5/9):`n  Rental income 9000 SAR"
$a6 = Analyze-Packet ($sys + $rule1 + $rep + $pnl + $mem2)
Check "c6 FLEET = report + P&L"  ($a6.sections["FLEET"] -eq ($rep.Length + $pnl.Length))
Check "c6 no COMPANY section"    (-not $a6.sections.ContainsKey("COMPANY"))
Check "c6 SYS = head + rule"     ($a6.sections["SYS"] -eq ($sys.Length + $rule1.Length))

# ── Case 7 (B-169c): finance "FLEET P&L" gets its own FIN label; the real
#    company REGISTRY packet still labels COMPANY. ──────────────────────────────
$finp = "`n`nFLEET P&L $em June 2026 (9 drivers). revenue minus costs."
$comp = "`n`nCOMPANY ROSTER $em the ONLY companies M8 has on record as Boss's:`n" + [char]0x2022 + " Bolt fleet"
$a7 = Analyze-Packet ($sys + $finp + $comp)
Check "c7 FIN owns FLEET P&L"    ($a7.sections["FIN"] -eq $finp.Length)
Check "c7 no FLEET section"      (-not $a7.sections.ContainsKey("FLEET"))
Check "c7 COMPANY = registry"    ($a7.sections["COMPANY"] -eq $comp.Length)

# ── Static wiring checks ──────────────────────────────────────────────────────
$root = Split-Path -Parent $PSScriptRoot
$jsPath = Join-Path $root "lib\context-telemetry.js"
$orch   = Join-Path $root "lib\orchestrator.js"
$js  = Get-Content $jsPath -Raw
$or  = Get-Content $orch -Raw

Check "s1 kill switch M8_CTX_TELEMETRY"      ($js.Contains("M8_CTX_TELEMETRY"))
Check "s2 lane ctx:packet"                   ($js.Contains('"ctx:packet"'))
Check "s3 tight 1500ms timeout"              ($js.Contains("1500"))
Check "s4 insert is awaited"                 ($js.Contains("await poster(row)"))
Check "s5 sizes-only privacy note"           ($js.Contains("labels+counts only"))
$callCount = ([regex]::Matches($or, "recordPacket\(\{")).Count
Check "s6 exactly 2 orchestrator call sites" ($callCount -eq 2)
$requireCount = ([regex]::Matches($or, 'require\("./context-telemetry"\)')).Count
Check "s7 both sites require the module"     ($requireCount -eq 2)
# both call sites must sit inside try{} so telemetry can never gate a reply
$guarded = ([regex]::Matches($or, "(?s)try \{\s*\r?\n\s*const \{ recordPacket \}")).Count
Check "s8 both call sites try-guarded"       ($guarded -eq 2)

# ── mirror-sync check: JS MARKERS list contains every mirrored label ──────────
$allLabels = $true
foreach ($m in $MARKERS) {
  if (-not $js.Contains('"' + $m[0] + '"')) { $allLabels = $false; Write-Host ("missing label in JS: " + $m[0]) }
}
Check "s9 marker labels in sync" $allLabels

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
