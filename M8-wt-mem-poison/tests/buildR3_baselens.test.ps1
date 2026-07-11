# tests/buildR3_baselens.test.ps1
# PS-5.1 MIRROR of Build-R3 "Base-b lens" (no local Node — pure math reimplemented inline,
# same discipline as tests/kernel-conjecture-verify.ps1). Covers:
#   1. digitalRootOfGenBase (digital root in an ARBITRARY radix, mod radix-1, 0 -> radix-1)
#      for the doubling generator: base10 period 6 / base12 period 10 / base16 period 4 —
#      the honest "different base -> different cycle" experiment, hand-verified.
#   2. kgonal generalizes triangular/square/pentagonal/hexagonal (sides=3/4/5/6)
#   3. primes_mod: n-th prime mod m
#   4. digital-root-v1.json: 8 seeds now bound (R3), 8 stay unbound — exact id list
#   5. STATIC WIRE GUARDS: M8_BASE_LENS kill-switch present, BASE_TEMPLATES/BASE_GENERATORS
#      defined, no new api/ fn, no SQL migration, Lean stretch wired to ./leanClient
# "PASS" = exit 0.

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

# ---- pure-core mirrors (flat loops, no nested calls in hot paths) ----------
function ModExp([long]$b, [long]$e, [long]$m) {
  if ($m -eq 1) { return 0 }
  [long]$r = 1; [long]$bb = (($b % $m) + $m) % $m; [long]$ee = $e
  while ($ee -gt 0) { if ($ee -band 1) { $r = ($r * $bb) % $m }; $bb = ($bb * $bb) % $m; $ee = [math]::Floor($ee / 2) }
  return $r
}
# digital root of 2^n in an ARBITRARY radix (mod radix-1, 0 -> radix-1)
function DrPowBase([int]$base, [int]$n, [int]$radix) {
  $modv = $radix - 1
  $r = ModExp $base $n $modv
  if ($r -eq 0) { return $modv } else { return $r }
}
# k-gonal number ((sides-2)n^2-(sides-4)n)/2, digital root in base 10 (mod 9, 0->9)
function DrKgonal([int]$sides, [int]$n) {
  $val = (($sides - 2) * $n * $n - ($sides - 4) * $n) / 2
  $r = $val % 9
  if ($r -eq 0) { return 9 } else { return $r }
}
function DrTri([int]$n)  { $v = ($n * ($n + 1)) / 2; $r = $v % 9; if ($r -eq 0) { 9 } else { $r } }
function DrSq([int]$n)   { $v = $n * $n; $r = $v % 9; if ($r -eq 0) { 9 } else { $r } }
function DrPent([int]$n) { $v = ($n * (3 * $n - 1)) / 2; $r = $v % 9; if ($r -eq 0) { 9 } else { $r } }
function DrHex([int]$n)  { $v = $n * (2 * $n - 1); $r = $v % 9; if ($r -eq 0) { 9 } else { $r } }

Write-Output "`nBuild-R3 base-b lens (pure-core mirror)`n"

# ---- 1. the honest "different base -> different cycle" doubling experiment --
$h10 = $true; for ($n = 1; $n -le 600; $n++) { if ((DrPowBase 2 $n 10) -ne (DrPowBase 2 ($n + 6) 10)) { $h10 = $false; break } }
Ok $h10 "base10: dr(2^n) periodic period 6 (ord_9(2)=6) -> HOLDS (regression)"
$h12 = $true; for ($n = 1; $n -le 600; $n++) { if ((DrPowBase 2 $n 12) -ne (DrPowBase 2 ($n + 10) 12)) { $h12 = $false; break } }
Ok $h12 "base12: dr(2^n) periodic period 10 (ord_11(2)=10) -> HOLDS (a DIFFERENT cycle)"
$h12wrong = $true; for ($n = 1; $n -le 600; $n++) { if ((DrPowBase 2 $n 12) -ne (DrPowBase 2 ($n + 6) 12)) { $h12wrong = $false; break } }
Ok (-not $h12wrong) "base12: period 6 (the base-10 answer) is FALSIFIED for base 12"
$h16 = $true; for ($n = 1; $n -le 600; $n++) { if ((DrPowBase 2 $n 16) -ne (DrPowBase 2 ($n + 4) 16)) { $h16 = $false; break } }
Ok $h16 "base16: dr(2^n) periodic period 4 (ord_15(2)=4) -> HOLDS (a DIFFERENT cycle again)"

# ---- 2. kgonal generalizes the existing figurate generators ----------------
$triOk = $true; for ($n = 1; $n -le 30; $n++) { if ((DrKgonal 3 $n) -ne (DrTri $n)) { $triOk = $false; break } }
Ok $triOk "kgonal(sides=3) == triangular for n=1..30"
$sqOk = $true; for ($n = 1; $n -le 30; $n++) { if ((DrKgonal 4 $n) -ne (DrSq $n)) { $sqOk = $false; break } }
Ok $sqOk "kgonal(sides=4) == square for n=1..30"
$pentOk = $true; for ($n = 1; $n -le 30; $n++) { if ((DrKgonal 5 $n) -ne (DrPent $n)) { $pentOk = $false; break } }
Ok $pentOk "kgonal(sides=5) == pentagonal for n=1..30"
$hexOk = $true; for ($n = 1; $n -le 30; $n++) { if ((DrKgonal 6 $n) -ne (DrHex $n)) { $hexOk = $false; break } }
Ok $hexOk "kgonal(sides=6) == hexagonal for n=1..30"
# a genuinely new k-gonal family (heptagonal, sides=7) is checkable and period-9 like the rest
$heptOk = $true; for ($n = 1; $n -le 60; $n++) { if ((DrKgonal 7 $n) -ne (DrKgonal 7 ($n + 9))) { $heptOk = $false; break } }
Ok $heptOk "heptagonal (sides=7, new) digital root periodic period 9 -> HOLDS"

# ---- 3. primes_mod: n-th prime mod m ----------------------------------------
function NthPrime([int]$count) {
  $primes = New-Object System.Collections.Generic.List[int]
  $i = 2
  while ($primes.Count -lt $count) {
    $isPrime = $true
    foreach ($p in $primes) { if ($p * $p -gt $i) { break }; if ($i % $p -eq 0) { $isPrime = $false; break } }
    if ($isPrime) { [void]$primes.Add($i) }
    $i++
  }
  return $primes[$count - 1]
}
$primesMod9 = @(1,2,3,4,5) | ForEach-Object { (NthPrime $_) % 9 }
OkEq "2,3,5,7,2" ($primesMod9 -join ',') "primes_mod n=1..5 mod 9 = 2,3,5,7,2 (primes 2,3,5,7,11)"
OkEq 29 (NthPrime 10) "nthPrime(10) = 29"

# ---- 4. digital-root-v1.json: 8 seeds bound (R3), 8 stay unbound -----------
$root = Split-Path $PSScriptRoot -Parent
$packFile = Join-Path $root 'data\seed-packs\digital-root-v1.json'
if (-not (Test-Path $packFile)) { Write-Output "  FAIL  missing pack file"; exit 1 }
$pack = [IO.File]::ReadAllText($packFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
$seeds = @($pack.seeds)
$boundIds = @($seeds | Where-Object { (@($_.matches_templates)).Count -gt 0 } | ForEach-Object { $_.id } | Sort-Object)
$expectedBound = @("digital-root-period-9","doubling-orbit-124875","fibonacci-digital-root-period-24","fibonacci-pisano-period-9","lucas-mod-9-period-24","squares-digital-root-period-9","three-six-nine-are-the-non-units","triangular-digital-root-period-9") | Sort-Object
OkEq 8 $boundIds.Count "8 seeds now bound (R3)"
OkEq ($expectedBound -join ',') ($boundIds -join ',') "bound seeds are exactly the R3 set"
$unboundCount = @($seeds | Where-Object { (@($_.matches_templates)).Count -eq 0 }).Count
OkEq 8 $unboundCount "8 seeds stay unbound (no honest template exists for them)"
# spot-check the exact pattern strings (the discriminating-slot design)
$byId = @{}; foreach ($s in $seeds) { $byId[$s.id] = $s }
OkEq "dr_periodic:base=2" (@($byId["doubling-orbit-124875"].matches_templates)[0]) "doubling-orbit-124875 binds dr_periodic:base=2"
OkEq "dr_set:k=3" (@($byId["three-six-nine-are-the-non-units"].matches_templates)[0]) "three-six-nine-are-the-non-units binds dr_set:k=3"
OkEq "mod_cycle:generator=fib" (@($byId["fibonacci-pisano-period-9"].matches_templates)[0]) "fibonacci-pisano-period-9 binds mod_cycle:generator=fib"

# ---- 5. STATIC WIRE GUARDS (grep the JS source) -----------------------------
$kcFile = Join-Path $root 'lib\kernel-conjecture.js'
$kc = [IO.File]::ReadAllText($kcFile, [Text.Encoding]::UTF8)
Ok ($kc -match 'M8_BASE_LENS') "kernel-conjecture.js defines M8_BASE_LENS kill-switch"
Ok ($kc -match 'const\s+BASE_TEMPLATES\s*=') "kernel-conjecture.js defines BASE_TEMPLATES"
Ok ($kc -match 'const\s+BASE_GENERATORS\s*=') "kernel-conjecture.js defines BASE_GENERATORS"
Ok ($kc -match "require\(['""]\./leanClient['""]\)") "kernel-conjecture.js requires ./leanClient (Lean stretch)"
Ok ($kc -match 'leanVerifyDigitSumMod9') "kernel-conjecture.js exports leanVerifyDigitSumMod9"
Ok ($kc -match 'kgonal') "kernel-conjecture.js defines the kgonal generator"
Ok ($kc -match 'primes_mod') "kernel-conjecture.js defines the primes_mod generator"

$apiDir = Join-Path $root 'api'
$apiCount = @(Get-ChildItem $apiDir -Filter *.js -ErrorAction SilentlyContinue).Count
OkEq 10 $apiCount "R3 added no new api/ function (still 10)"
$migDir = Join-Path $root 'migrations'
$r3sql = 0
if (Test-Path $migDir) { $r3sql = @(Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -match 'r3|base.?lens' }).Count }
OkEq 0 $r3sql "R3 added no SQL migration"

Write-Output ""
Write-Output ("Build-R3 base-b lens PS mirror: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
