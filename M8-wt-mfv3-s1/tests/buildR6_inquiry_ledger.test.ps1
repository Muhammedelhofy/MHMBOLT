# tests/buildR6_inquiry_ledger.test.ps1
# PS-5.1 MIRROR of Build-R6 "Inquiry ledger" (lib/inquiry-ledger.js + lib/notebook.js wiring).
# Node may be absent on the host, so this: (1) re-implements the honesty-relevant PURE logic
# (kill-switch, looksInquiryRead, topicNorm + seedsForQuestion match/expand over the REAL seed
# packs, normalizeSeedItem class mapping, noteVerdict/classifyNote) in PowerShell and asserts
# the flagship 3-6-9 split; (2) STATICALLY proves the JS wire: notebook branch gated + ephemeral-
# skip + lazy require, ?fn=inquiries routed, handler GET-only/read-only, rides the EXISTING
# seed-pack (no new datastore), api/ still 10 functions, no new migration.
#
# PS-5.1 discipline: ASCII-only source -> the tortoise-bracket citation glyphs are built from
# CHAR CODES (U+3014 / U+3015), the B-182/B-184 Unicode-from-code-points pattern. "PASS" = exit 0.

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

$LB = [string][char]0x3014   # left  tortoise bracket
$RB = [string][char]0x3015   # right tortoise bracket

$root       = Split-Path $PSScriptRoot -Parent
$ledgerFile = Join-Path $root 'lib\inquiry-ledger.js'
$nbFile     = Join-Path $root 'lib\notebook.js'
$apiFile    = Join-Path $root 'api\knowledge.js'
$hdlFile    = Join-Path $root 'lib\handlers\inquiries.js'
$drPack     = Join-Path $root 'data\seed-packs\digital-root-v1.json'
$czPack     = Join-Path $root 'data\seed-packs\collatz-v1.json'
foreach ($f in @($ledgerFile,$nbFile,$apiFile,$hdlFile,$drPack,$czPack)) {
  if (-not (Test-Path $f)) { Write-Host ("  FAIL  missing file: " + $f); exit 1 }
}
$ledger = [IO.File]::ReadAllText($ledgerFile, [Text.Encoding]::UTF8)
$nb     = [IO.File]::ReadAllText($nbFile,     [Text.Encoding]::UTF8)
$api    = [IO.File]::ReadAllText($apiFile,    [Text.Encoding]::UTF8)
$hdl    = [IO.File]::ReadAllText($hdlFile,    [Text.Encoding]::UTF8)

# ---- [1] kill-switch semantics (mirror inquiryLedgerEnabled) ------------------
Write-Host "`n[1] kill-switch M8_INQUIRY_LEDGER"
function LedgerEnabled([string]$v) { $t = ($v).Trim().ToLower(); return ($t -ne '0' -and $t -ne 'off') }
Check "default/blank ON" (LedgerEnabled '')
Check "off  -> disabled" (-not (LedgerEnabled 'off'))
Check "0    -> disabled" (-not (LedgerEnabled '0'))
Check "on   -> enabled"  (LedgerEnabled 'on')

# ---- [2] looksInquiryRead (mirror INQUIRY_READ_RE) ---------------------------
Write-Host "`n[2] looksInquiryRead"
$inqRe = "(\bwhat('?s|\s+is)?\s+(still\s+)?open\b|\bwhat('?s|\s+is)?\s+the\s+inquir\w*\b|\bopen\s+(question|inquir|thread|line)\w*\b|\bstanding\s+question\w*\b|\bwhere\s+do\s+we\s+stand\b|\binquiry\s+(ledger|thread|on)\b)"
function LooksInquiry([string]$m) { return [regex]::IsMatch($m, $inqRe, 'IgnoreCase') }
foreach ($m in @("what's open on the 3-6-9 question?","what is still open on collatz?","any open questions on digital roots?","where do we stand on the vortex idea?","what's the inquiry on 3-6-9?","show me the inquiry ledger")) {
  Check ("fires: " + $m) (LooksInquiry $m)
}
foreach ($m in @("how are my drivers doing today","send my wallet balance","what time is it","open the door","log a conjecture on collatz: every orbit terminates")) {
  Check ("silent: " + $m) (-not (LooksInquiry $m))
}

# ---- [3] seedsForQuestion — match + one-hop expand over the REAL packs --------
Write-Host "`n[3] seedsForQuestion (real seed packs)"
$allSeeds = @()
$allSeeds += (Get-Content $czPack -Raw -Encoding UTF8 | ConvertFrom-Json).seeds
$allSeeds += (Get-Content $drPack -Raw -Encoding UTF8 | ConvertFrom-Json).seeds
$broad = @('mod9','digital_root')
function TopicNorm([string]$s) { return ($s.ToLower() -replace '[^a-z0-9]+','') }
function SeedMatches($seed, [string]$qNorm) {
  foreach ($k in $seed.keywords) { $kn = TopicNorm $k; if ($kn.Length -ge 3 -and $qNorm.Contains($kn)) { return $true } }
  return $false
}
function SeedRank($s) { switch ($s.kernel_leap) { 'kernel' {0} 'leap' {2} 'unsourced' {2} default {1} } }
function SeedsForQuestion([string]$q) {
  $qNorm = TopicNorm $q
  if ($qNorm.Length -lt 3) { return @() }
  $direct = @($allSeeds | Where-Object { SeedMatches $_ $qNorm })
  if ($direct.Count -eq 0) { return @() }
  $feat = @{}
  foreach ($s in $direct) { foreach ($f in $s.related_features) { if ($broad -notcontains $f) { $feat[$f] = $true } } }
  $chosen = [ordered]@{}
  foreach ($s in $direct) { if (-not $chosen.Contains($s.id)) { $chosen[$s.id] = $s } }
  if ($feat.Count -gt 0) {
    foreach ($s in $allSeeds) {
      if ($chosen.Contains($s.id)) { continue }
      $hit = $false; foreach ($f in $s.related_features) { if ($feat.Contains($f)) { $hit = $true; break } }
      if ($hit) { $chosen[$s.id] = $s }
    }
  }
  $arr = @($chosen.Values) | Sort-Object @{Expression={SeedRank $_}}, @{Expression={$_.id}}
  return @($arr | Select-Object -First 8)
}
$s369 = SeedsForQuestion "what's open on the 3-6-9 question?"
$ids  = @($s369 | ForEach-Object { $_.id })
Check "3-6-9 matches 5..8 curated seeds" ($s369.Count -ge 5 -and $s369.Count -le 8)
Check "includes doubling-orbit kernel" ($ids -contains 'doubling-orbit-124875')
Check "includes 3-6-9 non-units kernel" ($ids -contains 'three-six-nine-are-the-non-units')
Check "includes Tesla-quote UNSOURCED seed" ($ids -contains 'tesla-369-quote-unsourced')
Check "includes Rodin energy LEAP seed" ($ids -contains 'rodin-vortex-energy-leap')
Check "kernels rank before leap/unsourced" ($s369[0].kernel_leap -eq 'kernel')
Check "off-topic -> no stretch match" ((SeedsForQuestion "what's open on the office lease renewal?").Count -eq 0)

# ---- [4] normalizeSeedItem class + citation ----------------------------------
Write-Host "`n[4] normalizeSeedItem"
function SeedClass($kl, $ps) {
  if ($kl -eq 'kernel') { return 'established' }
  if ($kl -eq 'leap' -or $kl -eq 'unsourced') { return 'speculative' }
  if ($ps -eq 'proved') { return 'established' } else { return 'speculative' }
}
function SeedCite($seed) { if ($seed.kernel_leap -eq 'unsourced') { return 'no primary source on file' } else { return [string]$seed.source_citation } }
$kernel    = $allSeeds | Where-Object { $_.id -eq 'doubling-orbit-124875' } | Select-Object -First 1
$leap      = $allSeeds | Where-Object { $_.id -eq 'rodin-vortex-energy-leap' } | Select-Object -First 1
$unsourced = $allSeeds | Where-Object { $_.id -eq 'tesla-369-quote-unsourced' } | Select-Object -First 1
CheckEq "kernel -> established" "established" (SeedClass $kernel.kernel_leap $kernel.proof_strength)
CheckEq "leap -> speculative"   "speculative" (SeedClass $leap.kernel_leap $leap.proof_strength)
CheckEq "unsourced -> speculative" "speculative" (SeedClass $unsourced.kernel_leap $unsourced.proof_strength)
CheckEq "unsourced citation honest" "no primary source on file" (SeedCite $unsourced)
Check "kernel carries a real citation" ((SeedCite $kernel).Length -gt 5 -and (SeedCite $kernel) -ne 'no primary source on file')

# ---- [5] noteVerdict / classifyNote ------------------------------------------
Write-Host "`n[5] classifyNote"
function NoteVerdict([string]$c) {
  if ([regex]::IsMatch($c, '\bfalsified\b|\bcounter\s*-?\s*example\b|\bbreaks?\s+(down\s+)?at\b|\bfails?\s+at\s+n\b|\bdisprove', 'IgnoreCase')) { return 'falsified' }
  if ([regex]::IsMatch($c, '\blean[_\s-]?verified\b|\bmachine-?checked\b|\bproven\s+in\s+lean\b', 'IgnoreCase')) { return 'verified' }
  if ([regex]::IsMatch($c, '\bobserved\b|\btested\s+(to|through)\b|\bholds?\s+(to|through)\b|\bperiod\s+\d+\b|\bthrough\s+n\s*=', 'IgnoreCase')) { return 'observed' }
  return $null
}
function ClassifyNote($kind, $content) {
  switch ($kind) {
    'status'         { return @{ bucket='status' } }
    'next_step'      { return @{ bucket='next_check' } }
    'dead_end'       { return @{ bucket='dead_end' } }
    'counterexample' { return @{ bucket='check'; verdict='falsified' } }
    'conjecture'     { return @{ bucket='question' } }
    default {
      if ($kind -eq 'evidence' -or $kind -eq 'note') {
        $v = NoteVerdict $content
        if ($v) { return @{ bucket='check'; verdict=$v } } else { return @{ bucket='evidence' } }
      }
      return @{ bucket='skip' }
    }
  }
}
CheckEq "OBSERVED evidence -> observed" "observed" (ClassifyNote 'evidence' "OBSERVED through n=10000, period 6 in base 10").verdict
CheckEq "counterexample -> falsified" "falsified" (ClassifyNote 'counterexample' "fails at n=27").verdict
CheckEq "lean_verified -> verified" "verified" (ClassifyNote 'evidence' "lean_verified: the identity holds").verdict
CheckEq "soft evidence -> evidence" "evidence" (ClassifyNote 'evidence' "3,6,9 are the non-units mod 9").bucket
CheckEq "next_step -> next_check" "next_check" (ClassifyNote 'next_step' "x").bucket
CheckEq "conjecture -> question" "question" (ClassifyNote 'conjecture' "x").bucket

# ---- [6] additive notebook write vocab (static: open-question -> conjecture) --
Write-Host "`n[6] notebook write vocab (additive, static)"
Check "KIND_ALT gains open-question alt" ($nb.Contains('open\\s*-?\\s*question'))
Check "canonKind maps open-question to conjecture" ($nb.Contains('/^open\s*-?\s*question/'))

# ---- [7] packet honesty invariants (static: the deterministic renderer) -------
Write-Host "`n[7] packet honesty (static)"
Check "packet builds tortoise-bracket refs from CITE_L/CITE_R" ($ledger.Contains($LB) -and $ledger.Contains($RB))
Check "established/speculative split labels present" ($ledger.Contains('ESTABLISHED (cited') -and $ledger.Contains('SPECULATIVE / UNSOURCED'))
Check "checks reported OBSERVED/FALSIFIED not proven" ($ledger.Contains('evidence, not proof') -and $ledger.Contains('FALSIFIED'))
Check "no-fabrication directive in packet" ($ledger.Contains('Never fabricate a citation or a check'))
Check "not-yet-proven refuses proven without Lean" ($ledger.Contains("machine-checked (Lean) verification"))

# ---- [8] STATIC WIRE GUARDS --------------------------------------------------
Write-Host "`n[8] static wire guards"
Check "notebook lazy-requires inquiry-ledger" ($nb.Contains('require("./inquiry-ledger")'))
Check "notebook branch gated on switch" ($nb.Contains('inq.inquiryLedgerEnabled()'))
Check "notebook branch skips ephemeral + looksInquiryRead" ($nb.Contains('!isEphemeralSession(sessionId)') -and $nb.Contains('looksInquiryRead'))
Check "notebook branch fails safe" ($nb.Contains('inquiry-ledger read error (non-fatal)'))
Check "ledger rides existing seed-pack ALL_SEEDS" ($ledger.Contains('require("./seed-pack")') -and $ledger.Contains('ALL_SEEDS'))
Check "ledger reuses notebook store no CREATE TABLE" ($ledger.Contains('require("./notebook")') -and -not $ledger.ToLower().Contains('create table'))
Check "kill-switch name M8_INQUIRY_LEDGER" ($ledger.Contains('M8_INQUIRY_LEDGER'))
Check "inquiries case in router" ($api.Contains('case "inquiries":'))
Check "inquiries handler required" ($api.Contains('require("../lib/handlers/inquiries")'))
Check "handler GET-only + read-only" ($hdl.Contains('GET only') -and -not $hdl.Contains('.insert(') -and -not $hdl.Contains('persistNote') -and -not $hdl.Contains('populateGraph'))
Check "handler honours kill-switch" ($hdl.Contains('disabled: true') -and $hdl.Contains('inquiryLedgerEnabled'))
$apiCount = (Get-ChildItem (Join-Path $root 'api') -Filter *.js).Count
CheckEq "api/ still exactly 10 functions" 10 $apiCount
$migDir = Join-Path $root 'migrations'
$r6migs = 0
if (Test-Path $migDir) { $r6migs = @(Get-ChildItem $migDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'r6|inquiry' }).Count }
CheckEq "zero R6 migration files" 0 $r6migs

# ---- result ------------------------------------------------------------------
Write-Host "`n================ BUILD-R6 INQUIRY LEDGER (PS-5.1 MIRROR) ================"
if ($script:fail -gt 0) { Write-Host ("  FAIL: " + $script:fail); Write-Host "  RESULT: FAIL"; exit 1 }
Write-Host "  RESULT: ALL GREEN"; exit 0
