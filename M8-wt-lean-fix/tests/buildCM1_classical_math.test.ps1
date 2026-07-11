# tests/buildCM1_classical_math.test.ps1
# PS-5.1 ASCII MIRROR of Build-CM1 "Classical-math checker pack" (no local Node -- the exact
# integer arithmetic is reimplemented inline, same discipline as tests/kernel-conjecture-verify.ps1
# and tests/buildR3_baselens.test.ps1). Covers:
#   1. sumProperDivisors s(k) + trial-division primality (the pure core)
#   2. amicable_pair: 220/284, 1184/1210, 2620/2924 verified; a non-pair falsified
#   3. perfect_number: 6,28,496,8128 verified; 12 abundant, 10 deficient
#   4. euclid_euler: p=2,3,5,7,13 give perfect numbers; p=11 (2^11-1=2047=23x89) does not
#   5. thabit_rule: n=2 -> (220,284), n=4 -> (17296,18416); n=3 -> no pair (r=287=7x41)
#   6. classical-math-v1.json: 6 seeds, 4 bound to the NEW checkers, 2 honestly unbound
#   7. STATIC WIRE GUARDS: M8_CLASSICAL_MATH switch, CLASSICAL_TEMPLATES, pack load, api=10, no migration
# "PASS" = exit 0. (All [long] arithmetic -- every figure stays < 2^53, exact without BigInt.)

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

# ---- pure-core mirrors (exact [long] arithmetic) ---------------------------
function SumProper([long]$k) {
  if ($k -lt 2) { return 0 }
  [long]$total = 1
  [long]$r = [long][math]::Floor([math]::Sqrt([double]$k))
  for ([long]$i = 2; $i -le $r; $i++) {
    if ($k % $i -eq 0) {
      $total += $i
      [long]$j = [long]($k / $i)
      if ($j -ne $i) { $total += $j }
    }
  }
  return $total
}
function IsPrime([long]$m) {
  if ($m -lt 2) { return $false }
  if ($m % 2 -eq 0) { return ($m -eq 2) }
  if ($m % 3 -eq 0) { return ($m -eq 3) }
  for ([long]$i = 5; $i * $i -le $m; $i += 6) {
    if (($m % $i -eq 0) -or ($m % ($i + 2) -eq 0)) { return $false }
  }
  return $true
}
function Pow2([int]$e) { return [long][math]::Pow(2, $e) }

Write-Output "`nBuild-CM1 classical-math checker (pure-core mirror)`n"

# ---- 1. pure core ----------------------------------------------------------
OkEq 6   (SumProper 6)   "s(6) = 6"
OkEq 28  (SumProper 28)  "s(28) = 28"
OkEq 16  (SumProper 12)  "s(12) = 16 (abundant)"
OkEq 8   (SumProper 10)  "s(10) = 8 (deficient)"
OkEq 284 (SumProper 220) "s(220) = 284"
OkEq 220 (SumProper 284) "s(284) = 220"
Ok (IsPrime 127) "127 is prime (Mersenne 2^7-1)"
Ok (-not (IsPrime 2047)) "2047 = 23x89 is NOT prime (2^11-1)"
Ok (-not (IsPrime 8388607)) "8388607 is NOT prime (2^23-1)"

# ---- 2. amicable_pair ------------------------------------------------------
Ok ((SumProper 220) -eq 284 -and (SumProper 284) -eq 220) "220/284 amicable (s swaps)"
Ok ((SumProper 1184) -eq 1210 -and (SumProper 1210) -eq 1184) "1184/1210 amicable"
Ok ((SumProper 2620) -eq 2924 -and (SumProper 2924) -eq 2620) "2620/2924 amicable"
Ok (-not ((SumProper 220) -eq 285 -and (SumProper 285) -eq 220)) "220/285 NOT amicable"

# ---- 3. perfect_number -----------------------------------------------------
foreach ($n in 6,28,496,8128) { Ok ((SumProper $n) -eq $n) "$n is perfect (s(n)=n)" }
Ok ((SumProper 12) -gt 12) "12 is abundant (s>n), not perfect"
Ok ((SumProper 10) -lt 10) "10 is deficient (s<n), not perfect"

# ---- 4. euclid_euler: 2^p-1 prime => 2^(p-1)(2^p-1) perfect ----------------
foreach ($p in 2,3,5,7,13) {
  [long]$mer = (Pow2 $p) - 1
  [long]$form = (Pow2 ($p - 1)) * $mer
  Ok ((IsPrime $mer) -and ((SumProper $form) -eq $form)) "euclid_euler p=$p -> form $form perfect"
}
[long]$mer11 = (Pow2 11) - 1
Ok (-not (IsPrime $mer11)) "euclid_euler p=11: 2^11-1=2047 composite -> no perfect number"

# ---- 5. thabit_rule: p=3*2^(n-1)-1, q=3*2^n-1, r=9*2^(2n-1)-1 --------------
function ThabitPair([int]$n) {
  [long]$p = 3 * (Pow2 ($n - 1)) - 1
  [long]$q = 3 * (Pow2 $n) - 1
  [long]$r = 9 * (Pow2 (2 * $n - 1)) - 1
  $all = (IsPrime $p) -and (IsPrime $q) -and (IsPrime $r)
  if (-not $all) { return @{ ok = $false } }
  [long]$a = (Pow2 $n) * $p * $q
  [long]$b = (Pow2 $n) * $r
  $amic = ((SumProper $a) -eq $b) -and ((SumProper $b) -eq $a) -and ($a -ne $b)
  return @{ ok = $amic; a = $a; b = $b; p = $p; q = $q; r = $r }
}
$t2 = ThabitPair 2
Ok ($t2.ok -and $t2.a -eq 220 -and $t2.b -eq 284) "Thabit n=2 -> (220,284) amicable"
$t4 = ThabitPair 4
Ok ($t4.ok -and $t4.a -eq 17296 -and $t4.b -eq 18416) "Thabit n=4 -> (17296,18416) amicable"
$t3 = ThabitPair 3
Ok (-not $t3.ok) "Thabit n=3 -> NO pair (r=287=7x41 composite)"

# ---- 6. classical-math-v1.json: bindings -----------------------------------
$root = Split-Path $PSScriptRoot -Parent
$packFile = Join-Path $root 'data\seed-packs\classical-math-v1.json'
if (-not (Test-Path $packFile)) { Write-Output "  FAIL  missing pack file"; exit 1 }
$pack = [IO.File]::ReadAllText($packFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
$seeds = @($pack.seeds)
OkEq 6 $seeds.Count "classical-math-v1 has 6 seeds"
$boundIds = @($seeds | Where-Object { (@($_.matches_templates)).Count -gt 0 } | ForEach-Object { $_.id } | Sort-Object)
$expectedBound = @("aliquot-classification-nicomachus","amicable-numbers-concept","euclid-euler-perfect","thabit-amicable-rule") | Sort-Object
OkEq 4 $boundIds.Count "4 seeds bound to the NEW checkers"
OkEq ($expectedBound -join ',') ($boundIds -join ',') "bound seeds are exactly the CM1 checker set"
$unbound = @($seeds | Where-Object { (@($_.matches_templates)).Count -eq 0 } | ForEach-Object { $_.id } | Sort-Object)
OkEq 2 $unbound.Count "2 seeds honestly unbound (leap + open problems)"
OkEq "perfect-number-significance-leap,perfect-numbers-open-problems" ($unbound -join ',') "unbound = the leap + open-problems seeds"
$byId = @{}; foreach ($s in $seeds) { $byId[$s.id] = $s }
OkEq "amicable_pair" (@($byId["amicable-numbers-concept"].matches_templates)[0]) "amicable-numbers-concept binds amicable_pair"
OkEq "thabit_rule" (@($byId["thabit-amicable-rule"].matches_templates)[0]) "thabit-amicable-rule binds thabit_rule"
Ok (@($byId["euclid-euler-perfect"].matches_templates) -contains "perfect_number" -and @($byId["euclid-euler-perfect"].matches_templates) -contains "euclid_euler") "euclid-euler-perfect binds perfect_number + euclid_euler"
# every seed carries a source_citation + a curation verification record (R2 schema)
Ok (@($seeds | Where-Object { $_.source_citation -and $_.verification.method -and $_.verification.date }).Count -eq 6) "all 6 seeds carry citation + curation verification record"
# Thabit citation names the mathematician (the required 'verify not quote' attribution)
Ok ($byId["thabit-amicable-rule"].source_citation -match 'Thabit ibn Qurra') "Thabit seed citation names Thabit ibn Qurra"
Ok ($byId["euclid-euler-perfect"].source_citation -match 'Euclid' -and $byId["euclid-euler-perfect"].source_citation -match 'Euler') "Euclid-Euler seed citation names Euclid AND Euler"

# ---- 7. STATIC WIRE GUARDS (grep the JS source) ----------------------------
$kcFile = Join-Path $root 'lib\kernel-conjecture.js'
$kc = [IO.File]::ReadAllText($kcFile, [Text.Encoding]::UTF8)
Ok ($kc -match 'M8_CLASSICAL_MATH') "kernel-conjecture.js defines M8_CLASSICAL_MATH kill-switch"
Ok ($kc -match 'const\s+CLASSICAL_TEMPLATES\s*=') "kernel-conjecture.js defines CLASSICAL_TEMPLATES"
Ok ($kc -match 'function\s+classicalMathEnabled') "kernel-conjecture.js defines classicalMathEnabled"
Ok ($kc -match 'function\s+sumProperDivisors') "kernel-conjecture.js defines sumProperDivisors"
Ok ($kc -match 'classical-math-v1\.json') "kernel-conjecture.js loads classical-math-v1.json directly"
Ok ($kc -match 'function\s+detectClassicalMathTest') "kernel-conjecture.js defines detectClassicalMathTest"

$apiDir = Join-Path $root 'api'
$apiCount = @(Get-ChildItem $apiDir -Filter *.js -ErrorAction SilentlyContinue).Count
OkEq 10 $apiCount "CM1 added no new api/ function (still 10)"
$migDir = Join-Path $root 'migrations'
$cmSql = 0
if (Test-Path $migDir) { $cmSql = @(Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -match 'cm1|classical|amicable|perfect' }).Count }
OkEq 0 $cmSql "CM1 added no SQL migration"

Write-Output ""
Write-Output ("Build-CM1 classical-math checker PS mirror: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
