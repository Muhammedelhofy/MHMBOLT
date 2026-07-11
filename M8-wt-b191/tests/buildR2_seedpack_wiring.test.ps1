# tests/buildR2_seedpack_wiring.test.ps1
# PS-5.1 MIRROR of Build-R2 "digital-root seed pack + narration wiring".
# Node is absent on the host, so this: (1) validates data/seed-packs/digital-root-v1.json
# under the SAME schema rules as lib/seed-pack.js validateSeed/validatePack, re-implemented in
# PowerShell; (2) asserts the honesty axis (16 seeds, matches_templates EMPTY on every seed,
# 2 negative / 1 unsourced / 1 leap / kernel-majority, the two required honesty ids); (3)
# STATICALLY proves the JS wire: seed-pack multi-pack load + PACKS, kernel-conjecture requires
# ./seed-pack and appends seedMatchLine in a holds branch, and renders in R1's tortoise-bracket
# citation style. "PASS" = exit 0.
#
# PS-5.1 discipline: ASCII-only source. The tortoise bracket is built from a CHAR CODE
# (U+3014), never as a literal. Empty JSON arrays deserialize to $null in 5.1, so every array
# is wrapped in @(...) before .Count (the B-157/B-165 mirror gotcha).

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

$LB = [string][char]0x3014   # left tortoise bracket (R1 cited-recall glyph)

$root     = Split-Path $PSScriptRoot -Parent
$packFile = Join-Path $root 'data\seed-packs\digital-root-v1.json'
$spFile   = Join-Path $root 'lib\seed-pack.js'
$kcFile   = Join-Path $root 'lib\kernel-conjecture.js'
$colFile  = Join-Path $root 'data\seed-packs\collatz-v1.json'
foreach ($f in @($packFile,$spFile,$kcFile,$colFile)) {
  if (-not (Test-Path $f)) { Write-Host ("  FAIL  missing file: " + $f); exit 1 }
}

$pack = [IO.File]::ReadAllText($packFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
$sp   = [IO.File]::ReadAllText($spFile,   [Text.Encoding]::UTF8)
$kc   = [IO.File]::ReadAllText($kcFile,   [Text.Encoding]::UTF8)

# valid enums (mirror of lib/seed-pack.js)
$RESULT_TYPES = @('theorem','conjecture','computational_result','counterexample','survey_claim')
$SCOPES       = @('finite','asymptotic','density','structural')
$PROOF        = @('proved','conditional','empirical')
$KERNEL_LEAP  = @('kernel','leap','unsourced')

# ---- pack-level ----
CheckEq "pack id" "digital-root-v1" $pack.pack
$seeds = @($pack.seeds)
CheckEq "seed count is 16" 16 $seeds.Count
Check   "seed count in 15-20" ($seeds.Count -ge 15 -and $seeds.Count -le 20)
$ids = @($seeds | ForEach-Object { $_.id })
CheckEq "all seed ids unique" $seeds.Count (@($ids | Sort-Object -Unique).Count)

# ---- per-seed schema mirror (validateSeed) ----
$badSchema = 0
foreach ($s in $seeds) {
  $ok = $true
  if (-not ($s.id -match '^[a-z0-9-]+$')) { $ok = $false }
  if ([string]::IsNullOrWhiteSpace($s.title)) { $ok = $false }
  if ($null -eq $s.statement -or ([string]$s.statement).Length -lt 40) { $ok = $false }
  if ($RESULT_TYPES -notcontains $s.result_type) { $ok = $false }
  if ($SCOPES -notcontains $s.scope) { $ok = $false }
  if ($null -ne $s.proof_strength -and $PROOF -notcontains $s.proof_strength) { $ok = $false }
  if ($s.negative_result -isnot [bool]) { $ok = $false }
  if ([string]::IsNullOrWhiteSpace($s.source_citation)) { $ok = $false }
  if ([string]::IsNullOrWhiteSpace([string]$s.author) -or [string]::IsNullOrWhiteSpace([string]$s.year)) { $ok = $false }
  if ($null -eq $s.verification -or [string]::IsNullOrWhiteSpace($s.verification.method) -or [string]::IsNullOrWhiteSpace($s.verification.date)) { $ok = $false }
  if ($KERNEL_LEAP -notcontains $s.kernel_leap) { $ok = $false }
  if (-not $ok) { $badSchema = $badSchema + 1; Write-Host ("        schema-bad seed: " + $s.id) }
}
CheckEq "every seed passes the schema mirror" 0 $badSchema

# ---- matches_templates: R3 populated 8/16 seeds (see buildR3_baselens.test.ps1) ----
$nonEmpty = 0
foreach ($s in $seeds) { if ((@($s.matches_templates)).Count -ne 0) { $nonEmpty = $nonEmpty + 1 } }
CheckEq "8 seeds now bound (R3), 8 stay unbound" 8 $nonEmpty

# ---- honesty axis ----
$neg   = @($seeds | Where-Object { $_.negative_result -eq $true })
$uns   = @($seeds | Where-Object { $_.kernel_leap -eq 'unsourced' })
$leap  = @($seeds | Where-Object { $_.kernel_leap -eq 'leap' })
$kern  = @($seeds | Where-Object { $_.kernel_leap -eq 'kernel' })
CheckEq "exactly 2 negative/honesty seeds" 2 $neg.Count
CheckEq "exactly 1 unsourced seed" 1 $uns.Count
CheckEq "exactly 1 leap seed" 1 $leap.Count
Check   "kernel seeds are the majority" ($kern.Count -ge 12)
Check   "honesty seeds carry no proof_strength" (@($neg | Where-Object { $null -ne $_.proof_strength }).Count -eq 0)
Check   "tesla-369-quote-unsourced present + unsourced" (@($seeds | Where-Object { $_.id -eq 'tesla-369-quote-unsourced' -and $_.kernel_leap -eq 'unsourced' }).Count -eq 1)
Check   "rodin-vortex-energy-leap present + leap" (@($seeds | Where-Object { $_.id -eq 'rodin-vortex-energy-leap' -and $_.kernel_leap -eq 'leap' }).Count -eq 1)
Check   "rodin-doubling-kernel-classical present + kernel" (@($seeds | Where-Object { $_.id -eq 'rodin-doubling-kernel-classical' -and $_.kernel_leap -eq 'kernel' }).Count -eq 1)
foreach ($id in @('dr-equals-n-mod-9','doubling-orbit-124875','threes-and-sixes-doubling','fibonacci-pisano-period-9')) {
  Check ("positive fact present: " + $id) ((@($seeds | Where-Object { $_.id -eq $id })).Count -eq 1)
}

# ---- STATIC WIRE GUARDS (grep the JS source) ----
Check "seed-pack.js loads digital-root-v1.json" ($sp -match "digital-root-v1\.json")
Check "seed-pack.js defines PACKS array"        ($sp -match "const\s+PACKS\s*=\s*\[")
Check "seedKnownMatch iterates PACKS"           ($sp -match "for\s*\(const pack of PACKS\)")
Check "kernel-conjecture requires ./seed-pack"  ($kc -match "require\(['""]\./seed-pack['""]\)")
Check "kernel-conjecture appends seedMatchLine(claim)" ($kc -match "seedMatchLine\(claim\)")
Check "kernel-conjecture renders R1 tortoise-bracket citation" ($kc.Contains($LB))

# ---- R2 adds no api/ fn, no migration ----
Check "R2 added no api/seed-pack.js" (-not (Test-Path (Join-Path $root 'api\seed-pack.js')))
$migDir = Join-Path $root 'migrations'
$r2sql = 0
if (Test-Path $migDir) { $r2sql = @(Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -match 'r2|digital' }).Count }
CheckEq "R2 added no SQL migration" 0 $r2sql

Write-Host ""
if ($script:fail -eq 0) { Write-Host "Build-R2 PS mirror: ALL GREEN"; exit 0 }
else { Write-Host ("Build-R2 PS mirror: " + $script:fail + " FAILED"); exit 1 }
