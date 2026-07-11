# tests/buildCM3_classical_math_v3.test.ps1
# PS-5.1 ASCII MIRROR of Build-CM3 "Classical-math checker pack v3" (no local Node -- the arithmetic
# is reimplemented inline, same discipline as tests/buildCM1_classical_math.test.ps1 and
# tests/buildCM2_classical_math_v2.test.ps1). Covers:
#   1. gcd + Euclid's-formula construction: (m^2-n^2, 2mn, m^2+n^2), verified for several (m,n)
#   2. pyth_triple: a^2+b^2=c^2 direct check (3,4,5 / 5,12,13 / 8,15,17 / 20,21,29 / 6,8,10 non-primitive)
#   3. pyth_primitive: a^2+b^2=c^2 AND gcd(a,b,c)=1 (6,8,10 and 9,12,15 correctly FAIL primitivity)
#   4. euclid_triple: m>n>0, coprime, opposite parity -> primitive; m=4,n=2 (not coprime) -> NOT primitive
#   5. classical-math-v3.json: 5 seeds, 3 bound to the NEW checkers, 2 honestly unbound; citations
#      name Euclid (Book I Prop.47 / Book X Lemma 1), MathWorld, Plutarch, Plimpton 322
#   6. STATIC WIRE GUARDS: M8_CLASSICAL_MATH_V3 switch, CLASSICAL_V3_TEMPLATES, pack load, api=10, no migration
# "PASS" = exit 0. Every value here stays well under 2^53 -- all exact in PowerShell [long] (no [bigint] needed).
#
# NB (the R3/CM2 mirror gotcha): PowerShell variables are CASE-INSENSITIVE, so a loop counter named
# to alias a function parameter silently breaks the loop. No such collision exists in this mirror
# (Tri/gcd helpers take distinct-named params), but kept in mind per the recurring lesson.

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
function GcdInt([long]$x, [long]$y) {
  $x = [Math]::Abs($x); $y = [Math]::Abs($y)
  while ($y -ne 0) { $t = $y; $y = $x % $y; $x = $t }
  return $x
}
function Gcd3([long]$x, [long]$y, [long]$z) { return GcdInt (GcdInt $x $y) $z }
function EuclidTriple([long]$m, [long]$n) {
  return @{ a = [long]($m * $m - $n * $n); b = [long](2 * $m * $n); c = [long]($m * $m + $n * $n) }
}
function IsPythTriple([long]$a, [long]$b, [long]$c) { return ($a * $a + $b * $b) -eq ($c * $c) }

Write-Output "`nBuild-CM3 classical-math checker v3 (pure-core mirror)`n"

# ---- 1. gcd + Euclid's-formula construction --------------------------------
OkEq 6 (GcdInt 12 18) "gcdInt(12,18)=6"
OkEq 1 (GcdInt 17 5) "gcdInt(17,5)=1"
OkEq 2 (Gcd3 6 8 10) "gcd3(6,8,10)=2"
OkEq 1 (Gcd3 3 4 5) "gcd3(3,4,5)=1"
$t21 = EuclidTriple 2 1
Ok ($t21.a -eq 3 -and $t21.b -eq 4 -and $t21.c -eq 5) "euclidTriple(2,1) = (3,4,5)"
$t32 = EuclidTriple 3 2
Ok ($t32.a -eq 5 -and $t32.b -eq 12 -and $t32.c -eq 13) "euclidTriple(3,2) = (5,12,13)"
$t43 = EuclidTriple 4 3
Ok ($t43.a -eq 7 -and $t43.b -eq 24 -and $t43.c -eq 25) "euclidTriple(4,3) = (7,24,25)"
$t42 = EuclidTriple 4 2
Ok ($t42.a -eq 12 -and $t42.b -eq 16 -and $t42.c -eq 20) "euclidTriple(4,2) = (12,16,20) [non-primitive: gcd(m,n)=2]"

# ---- 2. pyth_triple: a^2+b^2=c^2 --------------------------------------------
$triples = @(@(3,4,5), @(5,12,13), @(8,15,17), @(20,21,29), @(7,24,25), @(9,40,41), @(12,35,37), @(6,8,10), @(9,12,15))
foreach ($tr in $triples) {
  Ok (IsPythTriple $tr[0] $tr[1] $tr[2]) "pyth_triple ($($tr[0]),$($tr[1]),$($tr[2])) HOLDS"
}
Ok (-not (IsPythTriple 3 4 6)) "pyth_triple (3,4,6) FALSIFIED (not a triple)"

# ---- 3. pyth_primitive: a^2+b^2=c^2 AND gcd(a,b,c)=1 ------------------------
$primitives = @(@(3,4,5), @(5,12,13), @(8,15,17), @(20,21,29), @(7,24,25), @(9,40,41), @(12,35,37))
foreach ($tr in $primitives) {
  $isPrim = (IsPythTriple $tr[0] $tr[1] $tr[2]) -and ((Gcd3 $tr[0] $tr[1] $tr[2]) -eq 1)
  Ok $isPrim "pyth_primitive ($($tr[0]),$($tr[1]),$($tr[2])) HOLDS (primitive)"
}
Ok ((IsPythTriple 6 8 10) -and ((Gcd3 6 8 10) -ne 1)) "pyth_primitive (6,8,10) FALSIFIED (gcd=2, not primitive)"
Ok ((IsPythTriple 9 12 15) -and ((Gcd3 9 12 15) -ne 1)) "pyth_primitive (9,12,15) FALSIFIED (gcd=3, not primitive)"
Ok (-not (IsPythTriple 3 4 6)) "pyth_primitive (3,4,6) FALSIFIED (not even a triple)"

# ---- 4. euclid_triple: m>n>0, coprime, opposite parity -> primitive ---------
$pairs = @(@(2,1), @(3,2), @(4,1), @(5,2), @(4,3), @(5,4), @(6,1), @(6,5))
foreach ($p in $pairs) {
  $m = $p[0]; $n = $p[1]
  $tr = EuclidTriple $m $n
  $preOk = ($m -gt $n) -and ($n -gt 0) -and ((GcdInt $m $n) -eq 1) -and (($m % 2) -ne ($n % 2))
  $holds = (IsPythTriple $tr.a $tr.b $tr.c) -and $preOk -and ((Gcd3 $tr.a $tr.b $tr.c) -eq 1)
  Ok $holds "euclid_triple m=$m,n=$n HOLDS (primitive)"
}
$r61 = EuclidTriple 6 5
OkEq "11,60,61" ("$($r61.a),$($r61.b),$($r61.c)") "euclid_triple m=6,n=5 -> (11,60,61)"
$r42 = EuclidTriple 4 2
$preOk42 = (4 -gt 2) -and (2 -gt 0) -and ((GcdInt 4 2) -eq 1) -and ((4 % 2) -ne (2 % 2))
Ok ((IsPythTriple $r42.a $r42.b $r42.c) -and (-not $preOk42) -and ($r42.a -eq 12) -and ($r42.b -eq 16) -and ($r42.c -eq 20) -and ((Gcd3 $r42.a $r42.b $r42.c) -eq 4)) "euclid_triple m=4,n=2 FALSIFIED (not coprime -> not primitive, though a valid triple)"
$preOk31 = (3 -gt 1) -and (1 -gt 0) -and ((GcdInt 3 1) -eq 1) -and ((3 % 2) -ne (1 % 2))
Ok (-not $preOk31) "euclid_triple m=3,n=1 FALSIFIED (both odd -> same parity, not primitive)"

# ---- 5. classical-math-v3.json: bindings -----------------------------------
$root = Split-Path $PSScriptRoot -Parent
$packFile = Join-Path $root 'data\seed-packs\classical-math-v3.json'
if (-not (Test-Path $packFile)) { Write-Output "  FAIL  missing pack file"; exit 1 }
$pack = [IO.File]::ReadAllText($packFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
$seeds = @($pack.seeds)
OkEq 5 $seeds.Count "classical-math-v3 has 5 seeds"
$boundIds = @($seeds | Where-Object { (@($_.matches_templates)).Count -gt 0 } | ForEach-Object { $_.id } | Sort-Object)
$expectedBound = @("euclid-formula-primitive-triples", "primitive-pythagorean-triple-definition", "pythagorean-triple-definition") | Sort-Object
OkEq 3 $boundIds.Count "3 seeds bound to the NEW checkers"
OkEq ($expectedBound -join ',') ($boundIds -join ',') "bound seeds are exactly the CM3 checker set"
$unbound = @($seeds | Where-Object { (@($_.matches_templates)).Count -eq 0 } | ForEach-Object { $_.id } | Sort-Object)
OkEq 2 $unbound.Count "2 seeds honestly unbound (leap + context)"
OkEq "plimpton-322-predates-pythagoras,pythagorean-sacred-triangle-leap" ($unbound -join ',') "unbound = the leap + context seeds"
$byId = @{}; foreach ($s in $seeds) { $byId[$s.id] = $s }
OkEq "pyth_triple" (@($byId["pythagorean-triple-definition"].matches_templates)[0]) "definition seed binds pyth_triple"
OkEq "pyth_primitive" (@($byId["primitive-pythagorean-triple-definition"].matches_templates)[0]) "primitive-definition seed binds pyth_primitive"
OkEq "euclid_triple" (@($byId["euclid-formula-primitive-triples"].matches_templates)[0]) "Euclid's-formula seed binds euclid_triple"
# every seed carries a source_citation + a curation verification record (R2 schema)
Ok (@($seeds | Where-Object { $_.source_citation -and $_.verification.method -and $_.verification.date }).Count -eq 5) "all 5 seeds carry citation + curation verification record"
Ok ($byId["euclid-formula-primitive-triples"].source_citation -match 'Book X' -and $byId["euclid-formula-primitive-triples"].source_citation -match 'Lemma 1') "Euclid's-formula seed citation names Book X, Lemma 1"
Ok ($byId["pythagorean-triple-definition"].source_citation -match 'Euclid' -and $byId["pythagorean-triple-definition"].source_citation -match 'Proposition 47') "definition seed citation names Euclid + Proposition 47"
Ok ($byId["primitive-pythagorean-triple-definition"].source_citation -match 'MathWorld') "primitive-definition seed citation names MathWorld"
Ok ($byId["pythagorean-sacred-triangle-leap"].source_citation -match 'Plutarch' -and $byId["pythagorean-sacred-triangle-leap"].statement -match 'Osiris') "leap seed citation names Plutarch + Osiris reading"
Ok ($byId["plimpton-322-predates-pythagoras"].source_citation -match 'Plimpton 322') "context seed citation names Plimpton 322"

# ---- 6. STATIC WIRE GUARDS (grep the JS source) ----------------------------
$kcFile = Join-Path $root 'lib\kernel-conjecture.js'
$kc = [IO.File]::ReadAllText($kcFile, [Text.Encoding]::UTF8)
Ok ($kc -match 'M8_CLASSICAL_MATH_V3') "kernel-conjecture.js defines M8_CLASSICAL_MATH_V3 kill-switch"
Ok ($kc -match 'const\s+CLASSICAL_V3_TEMPLATES\s*=') "kernel-conjecture.js defines CLASSICAL_V3_TEMPLATES"
Ok ($kc -match 'function\s+classicalMathV3Enabled') "kernel-conjecture.js defines classicalMathV3Enabled"
Ok ($kc -match 'function\s+euclidTriple') "kernel-conjecture.js defines euclidTriple"
Ok ($kc -match 'function\s+gcd3') "kernel-conjecture.js defines gcd3"
Ok ($kc -match 'classical-math-v3\.json') "kernel-conjecture.js loads classical-math-v3.json directly"
Ok ($kc -match 'function\s+detectClassicalMathV3Test') "kernel-conjecture.js defines detectClassicalMathV3Test"
# CM1/CM2's packs are left untouched
$v1File = Join-Path $root 'data\seed-packs\classical-math-v1.json'
$v2File = Join-Path $root 'data\seed-packs\classical-math-v2.json'
Ok (Test-Path $v1File) "CM1's classical-math-v1.json still present (untouched)"
Ok (Test-Path $v2File) "CM2's classical-math-v2.json still present (untouched)"

$apiDir = Join-Path $root 'api'
$apiCount = @(Get-ChildItem $apiDir -Filter *.js -ErrorAction SilentlyContinue).Count
OkEq 10 $apiCount "CM3 added no new api/ function (still 10)"
$migDir = Join-Path $root 'migrations'
$cmSql = 0
if (Test-Path $migDir) { $cmSql = @(Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -match 'cm3|pythagorean|euclid' }).Count }
OkEq 0 $cmSql "CM3 added no SQL migration"

Write-Output ""
Write-Output ("Build-CM3 classical-math checker v3 PS mirror: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
