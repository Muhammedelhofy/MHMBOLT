# tests/buildR1_cited_recall.test.ps1
# PS-5.1 MIRROR of Build-R1 "cited source spine" (lib/knowledge-intake.js + lib/orchestrator.js).
# Node is absent on the host, so this: (1) re-implements the PURE functions (formatCitation,
# renderKgHit, buildSourceCardShape, citedRecallEnabled) in PowerShell and asserts the exact
# ON/OFF strings + the D6 kill-switch IDENTITY; (2) STATICALLY proves the JS wire (D1..D6):
# cited rendering, citation-into-metadata, source-card route, the ONE-compose-site D4 directive.
#
# PS-5.1 discipline: ASCII-only source (no box chars corrupt the parser) -> the Unicode
# citation glyphs are built from CHAR CODES: middle dot U+00B7, brackets U+3014/U+3015,
# em-dash U+2014 (the B-182/B-184 Unicode-from-code-points pattern). "PASS" = exit 0.

$ErrorActionPreference = 'Stop'
$script:fail = 0
function Check([string]$name, [bool]$cond) {
  if ($cond) { Write-Host ("  PASS  " + $name) }
  else { Write-Host ("  FAIL  " + $name); $script:fail = $script:fail + 1 }
}
function CheckEq([string]$name, $expected, $actual) {
  if ("$expected" -eq "$actual") { Write-Host ("  PASS  " + $name) }
  else { Write-Host ("  FAIL  " + $name + "  exp=[" + $expected + "] got=[" + $actual + "]"); $script:fail = $script:fail + 1 }
}

# Unicode glyphs from char codes (never as literals in this ASCII-only file).
$MIDDOT = [string][char]0x00B7   # middle dot  (class separator)
$LB     = [string][char]0x3014   # left  tortoise bracket
$RB     = [string][char]0x3015   # right tortoise bracket
$SEP    = " " + [string][char]0x2014 + " "   # space + EM DASH + space (title convention)

$root  = Split-Path $PSScriptRoot -Parent
$kiFile   = Join-Path $root 'lib\knowledge-intake.js'
$orchFile = Join-Path $root 'lib\orchestrator.js'
$apiFile  = Join-Path $root 'api\knowledge.js'
$hdlFile  = Join-Path $root 'lib\handlers\source-card.js'
foreach ($f in @($kiFile,$orchFile,$apiFile,$hdlFile)) {
  if (-not (Test-Path $f)) { Write-Host ("  FAIL  missing file: " + $f); exit 1 }
}
$ki   = [IO.File]::ReadAllText($kiFile,   [Text.Encoding]::UTF8)
$orch = [IO.File]::ReadAllText($orchFile, [Text.Encoding]::UTF8)
$api  = [IO.File]::ReadAllText($apiFile,  [Text.Encoding]::UTF8)
$hdl  = [IO.File]::ReadAllText($hdlFile,  [Text.Encoding]::UTF8)

# ── Pure-function mirrors ─────────────────────────────────────────────────────
function FirstNz {
  foreach ($a in $args) {
    if ($null -ne $a) { $s = ([string]$a).Trim(); if ($s.Length -gt 0) { return $s } }
  }
  return $null
}
function SplitWork([string]$title) {
  $t = [string]$title; $i = $t.IndexOf($SEP)
  if ($i -ge 0) { return $t.Substring(0, $i).Trim() } else { return $t.Trim() }
}
function SplitLocator([string]$title) {
  $t = [string]$title; $i = $t.IndexOf($SEP)
  if ($i -ge 0) { return $t.Substring($i + $SEP.Length).Trim() } else { return "" }
}
function FormatCitation($meta, [string]$title) {
  if ($null -eq $meta) { $meta = @{} }
  $c = $meta['citation']; if ($null -eq $c) { $c = @{} }
  $author  = FirstNz $c['author'] $meta['author']
  $work    = FirstNz $c['work']   $meta['book_title'] (SplitWork $title)
  $year    = FirstNz $c['year']   $meta['year']
  $locator = FirstNz $c['locator'] $meta['chapter_title'] (SplitLocator $title)
  if (-not $author -and -not $work -and -not $year) { return $null }
  if ($author -and $work) { $head = "$author, $work" }
  elseif ($author)        { $head = $author }
  elseif ($work)          { $head = $work }
  else                    { $head = "" }
  $s = $head
  if ($year)    { $s = $s + " (" + $year + ")" }
  if ($locator) { if ($s) { $s = $s + ", " + $locator } else { $s = $locator } }
  $s = $s.Trim()
  if ($s.Length -gt 0) { return $s } else { return $null }
}
function CitedEnabled([string]$v) { $lv = ([string]$v).Trim().ToLower(); return ($lv -ne '0' -and $lv -ne 'off') }
function RenderKgHit($node, $srcRow, [bool]$citedOn) {
  if ($node.kind -eq 'claim') { $kind = 'Claim' } else { $kind = 'Entity' }
  if (-not $citedOn) { return "[$kind] " + $node.label + ": " + $node.content }
  $sc = $node.source_class
  if ($sc -eq 'established' -or $sc -eq 'speculative') { $tag = "[" + $kind + $MIDDOT + $sc + "]" } else { $tag = "[$kind]" }
  $line = "$tag " + $node.label + ": " + $node.content
  $cite = $null
  if ($null -ne $srcRow) { $cite = FormatCitation $srcRow.metadata $srcRow.title }
  if ($cite) { $line = $line + " " + $LB + $cite + $RB }
  return $line
}
function BuildCard($src, $nodes) {
  $meta = $src['metadata']; if ($null -eq $meta) { $meta = @{} }
  $c = $meta['citation']; if ($null -eq $c) { $c = @{} }
  $est = 0; $spec = 0; $claims = New-Object System.Collections.Generic.List[object]
  foreach ($nd in @($nodes)) {
    if ($nd.source_class -eq 'established') { $est++ }
    elseif ($nd.source_class -eq 'speculative') { $spec++ }
    if ($nd.kind -eq 'claim' -and $claims.Count -lt 5) { $claims.Add($nd.label) }
  }
  $pending = 0; if ($src['pending_nodes']) { $pending = @($src['pending_nodes']).Count }
  $incomplete = -not ((FirstNz $c['author']) -and (FirstNz $c['work']) -and (FirstNz $c['year']))
  return [pscustomobject]@{
    citation = (FormatCitation $meta $src['title'])
    citation_incomplete = [bool]$incomplete
    established = $est; speculative = $spec; pending = $pending
    sample_count = $claims.Count
  }
}

# ── [1] formatCitation ────────────────────────────────────────────────────────
Write-Host "[1] formatCitation (PS mirror)"
$teslaMeta = @{ book_title = "The Problem of Increasing Human Energy"; author = "Nikola Tesla"; year = "1900";
  citation = @{ author = "Nikola Tesla"; work = "The Problem of Increasing Human Energy"; year = "1900" } }
CheckEq "full record + chapter locator" `
  "Nikola Tesla, The Problem of Increasing Human Energy (1900), III. The Sun's Energy" `
  (FormatCitation $teslaMeta ("The Problem of Increasing Human Energy" + $SEP + "III. The Sun's Energy"))
CheckEq "whole-doc: no locator" `
  "Nikola Tesla, The Problem of Increasing Human Energy (1900)" `
  (FormatCitation $teslaMeta "The Problem of Increasing Human Energy")
CheckEq "legacy metadata (author+book_title+year)" `
  ("Ibn Kathir, Al-Bidaya wa al-Nihaya (1370), Chapter 2") `
  (FormatCitation (@{ author="Ibn Kathir"; book_title="Al-Bidaya wa al-Nihaya"; year="1370" }) ("Al-Bidaya wa al-Nihaya" + $SEP + "Chapter 2"))
CheckEq "partial: work + year only" "Vortex-Based Mathematics (2010)" `
  (FormatCitation (@{ citation=@{ work="Vortex-Based Mathematics"; year="2010" } }) "Vortex-Based Mathematics")
Check "nothing citable -> null" ($null -eq (FormatCitation (@{}) ""))
CheckEq "title-only citable as its work" "My CV" (FormatCitation (@{}) "My CV")
# locator prefers chapter_title (separator-agnostic) — the real Ibn Kathir book: legacy
# metadata + a " - " hyphen title the em-dash split cannot parse. Arabic built from bytes.
$ibnAuthor  = [string][char]0x0627 + [string][char]0x0628 + [string][char]0x0646 + " " + [string][char]0x0643 + [string][char]0x062B + [string][char]0x064A + [string][char]0x0631  # "ابن كثير"
$ibnBook    = "BID"   # placeholder work token (Arabic book title compared via metadata, not reconstructed here)
$ibnChapter = "CH-11-13"
$ibnMeta = @{ author=$ibnAuthor; book_title=$ibnBook; chapter_title=$ibnChapter }
CheckEq "chapter_title yields locator even with a hyphen title" `
  ($ibnAuthor + ", " + $ibnBook + ", " + $ibnChapter) `
  (FormatCitation $ibnMeta ($ibnBook + " - " + $ibnChapter))
CheckEq "splitWork strips chapter" "Book" (SplitWork ("Book" + $SEP + "Chapter 3"))
CheckEq "splitLocator chapter" "Chapter 3" (SplitLocator ("Book" + $SEP + "Chapter 3"))
CheckEq "splitLocator whole-doc empty" "" (SplitLocator "Book")

# ── [2] renderKgHit ON/OFF (identity) ─────────────────────────────────────────
Write-Host "[2] renderKgHit (PS mirror)"
$estNode = @{ kind="claim"; label="sun-radiant-energy"; content="the sun is a source of radiant energy"; source_class="established"; source_doc_id=99 }
$srcRow  = @{ title = ("The Problem of Increasing Human Energy" + $SEP + "III. The Sun's Energy"); metadata = $teslaMeta }
CheckEq "OFF = pre-R1 exact string" `
  "[Claim] sun-radiant-energy: the sun is a source of radiant energy" `
  (RenderKgHit $estNode $srcRow $false)
$expectedOn = "[Claim" + $MIDDOT + "established] sun-radiant-energy: the sun is a source of radiant energy " + $LB + "Nikola Tesla, The Problem of Increasing Human Energy (1900), III. The Sun's Energy" + $RB
CheckEq "ON = class label + verbatim citation" $expectedOn (RenderKgHit $estNode $srcRow $true)
$specNode = @{ kind="claim"; label="vortex-leap"; content="numbers encode the energy geometry of reality"; source_class="speculative" }
CheckEq "ON speculative + NO source -> label but NO ref (FP=0)" `
  ("[Claim" + $MIDDOT + "speculative] vortex-leap: numbers encode the energy geometry of reality") `
  (RenderKgHit $specNode $null $true)
$noClass = @{ kind="entity"; label="tesla"; content="inventor"; source_class=$null }
CheckEq "ON node with no source_class -> bare [Entity]" "[Entity] tesla: inventor" (RenderKgHit $noClass $null $true)
$seed = @{ kind="claim"; label="collatz-known"; content="known result form"; source_class=$null }
CheckEq "M2-seed ON == OFF identity" (RenderKgHit $seed $null $false) (RenderKgHit $seed $null $true)

# ── [3] kill-switch ───────────────────────────────────────────────────────────
Write-Host "[3] citedRecallEnabled"
Check "default (empty) -> ON" (CitedEnabled "")
Check "off -> disabled" (-not (CitedEnabled "off"))
Check "0 -> disabled"   (-not (CitedEnabled "0"))
Check "OFF (any case) -> disabled" (-not (CitedEnabled "OFF"))
Check "other value -> ON" (CitedEnabled "on")

# ── [4] source card shape ─────────────────────────────────────────────────────
Write-Host "[4] buildSourceCardShape"
$nodes = @(
  @{ source_class="established"; kind="claim";  label="c1"; content="claim one" }
  @{ source_class="established"; kind="claim";  label="c2"; content="claim two" }
  @{ source_class="speculative"; kind="entity"; label="e1"; content="entity one" }
  @{ source_class="established"; kind="claim";  label="c3"; content="claim three" }
  @{ source_class="established"; kind="claim";  label="c4"; content="claim four" }
  @{ source_class="established"; kind="claim";  label="c5"; content="claim five" }
  @{ source_class="established"; kind="claim";  label="c6"; content="overflow" }
)
$src = @{ title = ("The Problem of Increasing Human Energy" + $SEP + "III"); metadata = $teslaMeta; pending_nodes = @(1,2,3) }
$card = BuildCard $src $nodes
CheckEq "count established" 6 $card.established
CheckEq "count speculative" 1 $card.speculative
CheckEq "count pending" 3 $card.pending
CheckEq "sample capped at 5" 5 $card.sample_count
CheckEq "card citation resolves" "Nikola Tesla, The Problem of Increasing Human Energy (1900), III" $card.citation
Check "card citation_incomplete=false" (-not $card.citation_incomplete)
$bare = BuildCard (@{ title="Untitled document"; metadata=@{}; pending_nodes=$null }) @()
Check "no-citation source -> citation_incomplete=true" ($bare.citation_incomplete)
CheckEq "empty nodes -> zero counts" 0 ($bare.established + $bare.speculative)

# ── [5] JS wire (static) ──────────────────────────────────────────────────────
Write-Host "[5] JS wire is correct (static)"
# D1 — citation into metadata, no migration
Check "ingest writes metadata.citation" ($ki.Contains('total_chapters: totalChapters, citation'))
Check "buildCitationRecord defined" ($ki -match 'function\s+buildCitationRecord')
Check "stamps citation_incomplete" ($ki.Contains('rec.citation_incomplete'))
# D2 — parse grammar extended with citation keys
Check "parse grammar knows translator/url" ($ki.Contains('grab("translator")') -and ($ki.Contains('grab("url")')))
Check "grab lookahead includes translator" ($ki.Contains('translator|url|source_url'))
# D2 short-paste: structured text= body marker (requires '=' so prose 'text:'/'body:' can't misfire)
Check "short-paste body marker requires = (not :)" ($ki -match '\(\?:text\|body\)\\s\*=')
Check "short-paste threads cite into metadata.citation" ($ki.Contains('short-paste citation write'))
Check "buildKnowledgeIngestContext destructures cite" ($ki.Contains('const { source_class, raw_text, title, cite } = parseIngestMessage'))
# Mirror the free-text-vs-structured DECISION: presence of 'text=' picks structured; else free.
function ShortPasteMode([string]$m) { if ($m -match '\b(?:text|body)\s*=') { return 'structured' } else { return 'free' } }
CheckEq "structured when text= present" "structured" (ShortPasteMode "ingest as established, author=X, text=the body here")
CheckEq "free-text when no text=" "free" (ShortPasteMode "ingest this as established: the sun is a source of energy")
CheckEq "prose 'body:' stays free-text" "free" (ShortPasteMode "ingest this as established: The human body: an overview")
# D3 — cited rendering, keyword select widened, semantic intact
Check "keyword select widened" ($ki.Contains('.select("id, label, content, kind, confidence, source_doc_id, source_class")'))
Check "semantic renders via renderKgHits" ($ki.Contains('renderKgHits(semData, db)'))
Check "keyword renders via renderKgHits" ($ki.Contains('renderKgHits(hits, db)'))
Check "semantic RPC still called (match_kg_nodes intact)" ($ki.Contains('match_kg_nodes'))
Check "renderKgHit OFF branch = pre-R1 template" ($ki.Contains('return `[${kind}] ${n.label}: ${n.content}`'))
# D6 — rendering + directive gated on the SAME kill-switch
Check "renderKgHits gated on citedRecallEnabled" ($ki.Contains('if (!citedRecallEnabled())'))
Check "citedRecallEnabled function defined" ($ki -match 'function\s+citedRecallEnabled')
Check "kill-switch reads M8_CITED_RECALL" ($ki.Contains('M8_CITED_RECALL'))
# D4 — the ONE compose site (no drift)
$dirDef = ([regex]::Matches($orch, [regex]::Escape('CITED_RECALL_DIRECTIVE ='))).Count
CheckEq "D4 directive defined exactly once" 1 $dirDef
# The append INTERPOLATES ${CITED_RECALL_DIRECTIVE}; the definition uses "CITED_RECALL_DIRECTIVE ="
# (no ${...}). Exactly one interpolation == exactly one append site (no buffered/stream drift).
$dirUse = ([regex]::Matches($orch, [regex]::Escape('${CITED_RECALL_DIRECTIVE}'))).Count
CheckEq "D4 directive appended exactly once (single site)" 1 $dirUse
Check "D4 directive gated on citedRecallEnabled + kgContext" ($orch.Contains('citedRecallEnabled()') -and $orch.Contains('if (kgContext)'))
Check "D4 forbids fabricated citation" ($orch.Contains('never compose, complete, or embellish'))
Check "D4 forbids the word proven" ($orch -match 'Never say .proven')
# single-compose-site invariant: exactly one KG block + one GROUNDED block feed systemInstruction
$kgBlk  = ([regex]::Matches($orch, [regex]::Escape('KNOWLEDGE GRAPH (from ingested books'))).Count
$grBlk  = ([regex]::Matches($orch, [regex]::Escape('GROUNDED EVIDENCE (intent:'))).Count
CheckEq "one KNOWLEDGE GRAPH inject site" 1 $kgBlk
CheckEq "one GROUNDED EVIDENCE inject site" 1 $grBlk
# D5 — source-card routed in the existing 12-fn router; handler read-only
Check "source-card case in router" ($api.Contains('case "source-card":'))
Check "source-card handler required" ($api.Contains('require("../lib/handlers/source-card")'))
Check "handler GET-only + no write" (($hdl.Contains('GET only')) -and (-not ($hdl -match 'populateGraph|\.insert\(')))
# api dir still exactly 10 serverless functions
$apiCount = @(Get-ChildItem (Join-Path $root 'api') -Filter *.js).Count
CheckEq "api/ still exactly 10 functions" 10 $apiCount
# no R1 migration
$mig = @(Get-ChildItem (Join-Path $root 'migrations') -Filter *.sql | Where-Object { $_.Name -match 'r1|cited' }).Count
CheckEq "zero R1 migration files" 0 $mig

# ── result ────────────────────────────────────────────────────────────────────
Write-Host ""
if ($script:fail -gt 0) {
  Write-Host ("buildR1 cited-recall mirror: FAIL ({0} check(s) failed)" -f $script:fail)
  exit 1
}
Write-Host "buildR1 cited-recall mirror: OK (all checks passed)"
exit 0
