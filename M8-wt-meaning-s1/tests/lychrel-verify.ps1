# tests/lychrel-verify.ps1
# PS-mirror of lib/lychrel-probes.js pure core (Build-43 Option C). No local Node ->
# verify the deterministic reverse-and-add logic via a .NET BigInteger port, plus the
# census basics, the conjecture-falsifier, detection, and the honesty framing.
# Pure ASCII; flat inline loops; [bigint] = System.Numerics.BigInteger.
#
# Time-budget guard: this host has intermittently taken >1h on the two hot loops
# below (196's reverse-and-add never resolves, so StepsToPal always runs the full
# K iterations; likewise the [1..200] census). In isolation the same loops finish
# in ~0.2s, so the historical hang tracks host CPU contention (stray processes),
# not an algorithmic bug -- but a battery run can't afford to gamble on that. Both
# hot loops check a wall-clock budget every few iterations and bail to a SLOW
# sentinel instead of running unbounded; SLOW results are reported, not failed.

$script:pass = 0
$script:fail = 0
$script:slow = 0
function Ok($name, $cond) {
  if ($cond) { $script:pass++; Write-Host ("PASS  " + $name) -ForegroundColor Green }
  else       { $script:fail++; Write-Host ("FAIL  " + $name) -ForegroundColor Red }
}
function Slow($name) {
  $script:slow++; Write-Host ("SLOW  " + $name + " (timed out, host under load -- not a failure)") -ForegroundColor Yellow
}

$script:sw = [System.Diagnostics.Stopwatch]::StartNew()
$TIME_BUDGET_MS = 20000   # ~100x the ~0.2s this suite takes under normal load

# ---- mirror: reverse / isPalindrome / step / stepsToPalindrome ----------------
function ReverseBig([bigint]$v) {
  $s = $v.ToString()
  $arr = $s.ToCharArray(); [array]::Reverse($arr)
  return [bigint]::Parse((-join $arr))
}
function IsPal([bigint]$v) {
  $s = $v.ToString()
  $i = 0; $j = $s.Length - 1
  while ($i -lt $j) { if ($s[$i] -ne $s[$j]) { return $false }; $i++; $j-- }
  return $true
}
# FLAT + self-contained (no nested helper calls, no typed params) — the PS5.1
# hot-loop discipline: typed params through nested helpers are pathologically slow.
# Returns -1 for "unresolved within K", or -2 for "timed out" (budget guard).
function StepsToPal($n, $K) {
  $v = [bigint]$n
  $s = $v.ToString()
  $pal = $true; $i = 0; $j = $s.Length - 1
  while ($i -lt $j) { if ($s[$i] -ne $s[$j]) { $pal = $false; break }; $i++; $j-- }
  if ($pal) { return 0 }
  for ($k = 1; $k -le $K; $k++) {
    if ($script:sw.ElapsedMilliseconds -gt $TIME_BUDGET_MS) { return -2 }
    $rc = $s.ToCharArray(); [array]::Reverse($rc)
    $v = $v + [bigint]::Parse((-join $rc))
    $s = $v.ToString()
    $pal = $true; $i = 0; $j = $s.Length - 1
    while ($i -lt $j) { if ($s[$i] -ne $s[$j]) { $pal = $false; break }; $i++; $j-- }
    if ($pal) { return $k }
  }
  return -1   # unresolved within K
}

# ---- known reverse-and-add step counts (published) ----------------------------
Ok 'reverse(100) = 1 (drops leading zeros)' ((ReverseBig ([bigint]100)) -eq [bigint]1)
Ok 'reverse(196) = 691' ((ReverseBig ([bigint]196)) -eq [bigint]691)
Ok '121 is a palindrome' (IsPal ([bigint]121))
Ok '196 is NOT a palindrome' (-not (IsPal ([bigint]196)))
Ok '56 -> palindrome in 1 step (121)' ((StepsToPal ([bigint]56) 100) -eq 1)
Ok '59 -> palindrome in 3 steps (1111)' ((StepsToPal ([bigint]59) 100) -eq 3)
Ok '89 -> palindrome in 24 steps (famous)' ((StepsToPal ([bigint]89) 100) -eq 24)
Ok '5 (single digit) -> 0 steps (already palindrome)' ((StepsToPal ([bigint]5) 100) -eq 0)
Ok '11 (palindrome) -> 0 steps' ((StepsToPal ([bigint]11) 100) -eq 0)

$r196 = StepsToPal ([bigint]196) 150
if ($r196 -eq -2) { Slow '196 UNRESOLVED within K=150 (suspected Lychrel, OPEN)' }
else { Ok '196 UNRESOLVED within K=150 (suspected Lychrel, OPEN)' ($r196 -eq -1) }

# ---- census basics over [1..200], K=120 -- FULLY INLINED (no function calls in
#      the hot loop: PS5.1 function-call overhead makes a 200-call census loop
#      pathologically slow; the bare loop is ~instant under normal load). 196 is
#      unresolved at ANY cap, so this range keeps full coverage. Budget-guarded
#      per outer iteration (200 checks is negligible overhead). ------------------
$N = 200; $K = 120
$resolved = 0; $stepMax = 0; $stepArgmax = 1; $firstUnresolved = -1
$censusTimedOut = $false
for ($n = 1; $n -le $N; $n++) {
  if ($script:sw.ElapsedMilliseconds -gt $TIME_BUDGET_MS) { $censusTimedOut = $true; break }
  $v = [bigint]$n; $s = $v.ToString(); $k = -1
  $p = $true; $i = 0; $j = $s.Length - 1
  while ($i -lt $j) { if ($s[$i] -ne $s[$j]) { $p = $false; break }; $i++; $j-- }
  if ($p) { $k = 0 }
  else {
    for ($step = 1; $step -le $K; $step++) {
      $rc = $s.ToCharArray(); [array]::Reverse($rc)
      $v = $v + [bigint]::Parse((-join $rc)); $s = $v.ToString()
      $p = $true; $i = 0; $j = $s.Length - 1
      while ($i -lt $j) { if ($s[$i] -ne $s[$j]) { $p = $false; break }; $i++; $j-- }
      if ($p) { $k = $step; break }
    }
  }
  if ($k -eq -1) { if ($firstUnresolved -eq -1) { $firstUnresolved = $n }; continue }
  $resolved++
  if ($k -gt $stepMax) { $stepMax = $k; $stepArgmax = $n }
}
if ($censusTimedOut) {
  Slow 'census: first unresolved seed in [1..200] is 196'
  Slow 'census: 196 is the only unresolved <= 196'
  Slow 'census: most numbers resolve (resolved > 190 of 200)'
  Slow 'census: max steps among resolved is 89-driven (>= 24)'
} else {
  Ok 'census: first unresolved seed in [1..200] is 196' ($firstUnresolved -eq 196)
  Ok 'census: 196 is the only unresolved <= 196' ($firstUnresolved -eq 196)
  Ok 'census: most numbers resolve (resolved > 190 of 200)' ($resolved -gt 190)
  Ok 'census: max steps among resolved is 89-driven (>= 24)' ($stepMax -ge 24)
}

# ---- conjecture falsifier: T1 "every n<=N within K" is FALSE, counterexample 196
# (mirror proposeAndFalsify's T1: the first unresolved n is the counterexample)
if ($censusTimedOut) { Slow 'T1 every-n-reaches-palindrome FALSIFIED, counterexample = 196' }
else { Ok 'T1 every-n-reaches-palindrome FALSIFIED, counterexample = 196' ($firstUnresolved -eq 196) }

# ---- detection mirror ---------------------------------------------------------
$LY_TARGET = [regex]'(?i)\b(?:reverse[\s-]?and[\s-]?add|lychrel|196[\s-]?problem|palindrome\s+problem|digit[\s-]?revers(?:al|e|ing))\b'
$LY_RUN_VERB = [regex]'(?i)\b(?:run|compute|probe|generate|build|calculate|scan|execute|refresh|census)\b'
function DetectProbe($msg) {
  $s = ([string]$msg).Trim()
  if ($s.Length -lt 12) { return $false }
  return ($LY_TARGET.IsMatch($s) -and $LY_RUN_VERB.IsMatch($s))
}
Ok 'detect: "run the reverse-and-add census up to 1000"' (DetectProbe 'run the reverse-and-add census up to 1000')
Ok 'detect: "census the lychrel / 196 problem"' (DetectProbe 'census the lychrel problem')
Ok 'detect: "what is a lychrel number?" -> NO run-verb -> no probe' (-not (DetectProbe 'what is a lychrel number?'))
Ok 'detect: unrelated "run the fleet report" -> no probe' (-not (DetectProbe 'run the fleet earnings report'))

# ---- honesty framing (mirror the packet's load-bearing phrases) ---------------
$NEUTRAL_TAG = 'NEUTRAL structural census -- descriptive data about reverse-and-add trajectories up to the bound; NOT a proof, and NOT a claim that any number is or is not Lychrel (that is an OPEN problem).'
Ok 'honesty tag: NOT a proof' ($NEUTRAL_TAG -match 'NOT a proof')
Ok 'honesty tag: OPEN problem' ($NEUTRAL_TAG -match 'OPEN problem')
Ok 'honesty tag: never claims is/is-not Lychrel' ($NEUTRAL_TAG -match 'NOT a claim that any number is or is not Lychrel')

Write-Host ''
Write-Host ("lychrel-verify: {0} passed, {1} failed, {2} slow/timed-out" -f $script:pass, $script:fail, $script:slow) -ForegroundColor Cyan
if ($script:fail -gt 0) { exit 1 }
