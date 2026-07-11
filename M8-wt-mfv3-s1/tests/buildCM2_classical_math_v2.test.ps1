# tests/buildCM2_classical_math_v2.test.ps1
# PS-5.1 ASCII MIRROR of Build-CM2 "Classical-math checker pack v2" (no local Node -- the arithmetic
# is reimplemented inline, same discipline as tests/buildCM1_classical_math.test.ps1 and
# tests/buildR3_baselens.test.ps1). Covers:
#   1. figurate identities verified over a range by computing BOTH sides:
#      hexagonal_triangular H(n)=T(2n-1); nicomachus_cubes sum k^3 = T(n)^2; square n^2 = T(n-1)+T(n)
#   2. pell_fundamental via the sqrt(N) continued fraction, verified in [bigint]: N=2,3,7,13,61 ->
#      x^2 - N*y^2 = 1; the headline N=61 -> (1766319049, 226153980)
#   3. classical-math-v2.json: 6 seeds, 4 bound to the NEW checkers, 2 honestly unbound; citations
#      name Brahmagupta/Bhaskara (Pell) and Nicomachus (figurate)
#   4. STATIC WIRE GUARDS: M8_CLASSICAL_MATH_V2 switch, CLASSICAL_V2_TEMPLATES, pack load, api=10, no migration
# "PASS" = exit 0. (Figurate stays in [long] < 2^53; Pell uses [bigint] since x exceeds 2^53.)

$ErrorActionPreference = 'Stop'
$script:pass = 0; $script:fail = 0
function Ok($cond, $label) {
  if ($cond) { $script:pass++; Write-Output ("  PASS  " + $label) }
  else       { $script:fail++; Write-Output ("  FAIL  " + $label) }
}
function OkEq($expected, $actual, $label) {
  if ("$expected" -eq "$actual") { $script:pass++; Write-Output ("  PASS  " + $label) }
  else { $script:fail++; Write-Output ("  FAIL  " + $label + "  exp=[" + $expected + "] got=[" + $actual + "]") }
}

# ---- pure-core mirrors ------------------------------------------------------
function Tri([long]$n) { return [long]($n * ($n + 1) / 2) }        # T(n) = n(n+1)/2
function Hex([long]$n) { return [long]($n * (2 * $n - 1)) }        # H(n) = n(2n-1)

# Figurate identity checker over [1..Max] -- returns $true iff both sides match at every n.
# NB: the bound param is named $Max (NOT $N) on purpose -- PowerShell variables are CASE-INSENSITIVE,
# so a $N parameter would alias the $n loop counter and make "$n -le $N" always true (infinite loop).
function CheckFigurate([string]$kind, [long]$Max) {
  if ($kind -eq 'hexagonal_triangular') {
    for ([long]$n = 1; $n -le $Max; $n++) { if ((Hex $n) -ne (Tri (2 * $n - 1))) { return $false } }
    return $true
  }
  if ($kind -eq 'nicomachus_cubes') {
    [long]$cubeSum = 0
    for ([long]$n = 1; $n -le $Max; $n++) { $cubeSum += $n * $n * $n; if ($cubeSum -ne ((Tri $n) * (Tri $n))) { return $false } }
    return $true
  }
  if ($kind -eq 'square_consecutive_triangular') {
    for ([long]$n = 1; $n -le $Max; $n++) { if (($n * $n) -ne ((Tri ($n - 1)) + (Tri $n))) { return $false } }
    return $true
  }
  return $false
}

# Pell fundamental via the sqrt(N) continued fraction -- [bigint] convergents (x exceeds 2^53).
function PellFundamental([int]$N) {
  $a0 = [int][math]::Floor([math]::Sqrt([double]$N))
  if ($a0 * $a0 -eq $N) { return $null }
  $Nb = [bigint]$N
  $m = 0; $d = 1; $a = $a0
  $hPrev = [bigint]1; $h = [bigint]$a0
  $kPrev = [bigint]0; $k = [bigint]1
  $steps = 0
  while ($true) {
    if (($h * $h - $Nb * $k * $k) -eq [bigint]1) { return @{ x = $h; y = $k; cf = $steps } }
    if ($steps -ge 5000) { return $null }
    $steps++
    $m = $d * $a - $m
    $d = ($N - $m * $m) / $d
    $a = [int][math]::Floor(($a0 + $m) / $d)
    $hNext = ([bigint]$a) * $h + $hPrev; $hPrev = $h; $h = $hNext
    $kNext = ([bigint]$a) * $k + $kPrev; $kPrev = $k; $k = $kNext
  }
}

Write-Output "`nBuild-CM2 classical-math checker v2 (pure-core mirror)`n"

# ---- 1. figurate identities (verified over a range) ------------------------
# Range kept modest (1..1200) so the PS-5.1 mirror stays snappy; the identities are proven, and the
# < 2^53 exactness at the JS cap is asserted separately below as a single T(13000)^2 computation.
Ok (CheckFigurate 'hexagonal_triangular' 1200)          "hexagonal_triangular: H(n)=T(2n-1) for n=1..1200"
Ok (CheckFigurate 'nicomachus_cubes' 1200)              "nicomachus_cubes: sum k^3 = T(n)^2 for n=1..1200"
Ok (CheckFigurate 'square_consecutive_triangular' 1200) "square_consecutive_triangular: n^2 = T(n-1)+T(n) for n=1..1200"
OkEq 28 (Hex 4) "H(4) = 28 (= T(7))"
OkEq (Tri 7) (Hex 4) "H(4) equals T(7)"
# exactness: sum-of-cubes RHS T(n)^2 stays < 2^53 at the JS cap 13000
[double]$maxSafe = [math]::Pow(2, 53)
Ok (([double](Tri 13000)) * ([double](Tri 13000)) -lt $maxSafe) "T(13000)^2 < 2^53 (figurate exactness cap)"

# ---- 2. pell_fundamental (verified in [bigint]) ----------------------------
foreach ($pair in @(@(2, '3', '2'), @(3, '2', '1'), @(7, '8', '3'), @(13, '649', '180'))) {
  $r = PellFundamental ([int]$pair[0])
  Ok ($r -ne $null -and "$($r.x)" -eq $pair[1] -and "$($r.y)" -eq $pair[2] -and ($r.x * $r.x - ([bigint]$pair[0]) * $r.y * $r.y) -eq [bigint]1) "pell N=$($pair[0]) -> ($($pair[1]),$($pair[2])), x^2-N y^2=1"
}
$r61 = PellFundamental 61
Ok ($r61 -ne $null -and "$($r61.x)" -eq '1766319049' -and "$($r61.y)" -eq '226153980') "pell HEADLINE N=61 -> (1766319049, 226153980)"
Ok (($r61.x * $r61.x - ([bigint]61) * $r61.y * $r61.y) -eq [bigint]1) "pell N=61 satisfies x^2 - 61 y^2 = 1 exactly (bigint)"
Ok ((PellFundamental 49) -eq $null) "pell N=49 (perfect square) -> no solution (null)"

# ---- 3. classical-math-v2.json: bindings -----------------------------------
$root = Split-Path $PSScriptRoot -Parent
$packFile = Join-Path $root 'data\seed-packs\classical-math-v2.json'
if (-not (Test-Path $packFile)) { Write-Output "  FAIL  missing pack file"; exit 1 }
$pack = [IO.File]::ReadAllText($packFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
$seeds = @($pack.seeds)
OkEq 6 $seeds.Count "classical-math-v2 has 6 seeds"
$boundIds = @($seeds | Where-Object { (@($_.matches_templates)).Count -gt 0 } | ForEach-Object { $_.id } | Sort-Object)
$expectedBound = @("hexagonal-are-triangular", "nicomachus-sum-of-cubes", "pell-fundamental-cf", "square-consecutive-triangulars") | Sort-Object
OkEq 4 $boundIds.Count "4 seeds bound to the NEW checkers"
OkEq ($expectedBound -join ',') ($boundIds -join ',') "bound seeds are exactly the CM2 checker set"
$unbound = @($seeds | Where-Object { (@($_.matches_templates)).Count -eq 0 } | ForEach-Object { $_.id } | Sort-Object)
OkEq 2 $unbound.Count "2 seeds honestly unbound (leap + misnomer)"
OkEq "figurate-sacred-geometry-leap,pell-name-misnomer" ($unbound -join ',') "unbound = the leap + misnomer seeds"
$byId = @{}; foreach ($s in $seeds) { $byId[$s.id] = $s }
OkEq "figurate_identity:kind=nicomachus_cubes" (@($byId["nicomachus-sum-of-cubes"].matches_templates)[0]) "nicomachus seed pins kind=nicomachus_cubes"
OkEq "figurate_identity:kind=hexagonal_triangular" (@($byId["hexagonal-are-triangular"].matches_templates)[0]) "hexagonal seed pins kind=hexagonal_triangular"
OkEq "pell_fundamental" (@($byId["pell-fundamental-cf"].matches_templates)[0]) "pell seed binds pell_fundamental"
# every seed carries a source_citation + a curation verification record (R2 schema)
Ok (@($seeds | Where-Object { $_.source_citation -and $_.verification.method -and $_.verification.date }).Count -eq 6) "all 6 seeds carry citation + curation verification record"
# Pell citation names the mathematicians (verify-not-quote attribution); figurate cites Nicomachus
Ok ($byId["pell-fundamental-cf"].source_citation -match 'Brahmagupta' -and $byId["pell-fundamental-cf"].source_citation -match 'Bhaskara') "Pell seed citation names Brahmagupta AND Bhaskara"
Ok ($byId["nicomachus-sum-of-cubes"].source_citation -match 'Nicomachus') "Nicomachus seed citation names Nicomachus"
Ok ($byId["pell-name-misnomer"].source_citation -match 'Euler') "misnomer seed citation names Euler (the misattribution)"

# ---- 4. STATIC WIRE GUARDS (grep the JS source) ----------------------------
$kcFile = Join-Path $root 'lib\kernel-conjecture.js'
$kc = [IO.File]::ReadAllText($kcFile, [Text.Encoding]::UTF8)
Ok ($kc -match 'M8_CLASSICAL_MATH_V2') "kernel-conjecture.js defines M8_CLASSICAL_MATH_V2 kill-switch"
Ok ($kc -match 'const\s+CLASSICAL_V2_TEMPLATES\s*=') "kernel-conjecture.js defines CLASSICAL_V2_TEMPLATES"
Ok ($kc -match 'function\s+classicalMathV2Enabled') "kernel-conjecture.js defines classicalMathV2Enabled"
Ok ($kc -match 'function\s+pellFundamental') "kernel-conjecture.js defines pellFundamental"
Ok ($kc -match 'function\s+checkFigurateIdentity') "kernel-conjecture.js defines checkFigurateIdentity"
Ok ($kc -match 'classical-math-v2\.json') "kernel-conjecture.js loads classical-math-v2.json directly"
Ok ($kc -match 'function\s+detectClassicalMathV2Test') "kernel-conjecture.js defines detectClassicalMathV2Test"
# CM1's pack is left untouched
$v1File = Join-Path $root 'data\seed-packs\classical-math-v1.json'
Ok (Test-Path $v1File) "CM1's classical-math-v1.json still present (untouched)"

$apiDir = Join-Path $root 'api'
$apiCount = @(Get-ChildItem $apiDir -Filter *.js -ErrorAction SilentlyContinue).Count
OkEq 10 $apiCount "CM2 added no new api/ function (still 10)"
$migDir = Join-Path $root 'migrations'
$cmSql = 0
if (Test-Path $migDir) { $cmSql = @(Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -match 'cm2|figurate|pell' }).Count }
OkEq 0 $cmSql "CM2 added no SQL migration"

Write-Output ""
Write-Output ("Build-CM2 classical-math checker v2 PS mirror: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
