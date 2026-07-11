# tests/buildE5_dr_proposer_examples.test.ps1
# PS-5.1 MIRROR of the E5 miss-mining follow-up: digital-root proposer worked examples.
# No local Node -- same discipline as tests/buildR3_baselens.test.ps1 (pure math reimplemented
# inline, STATIC WIRE GUARDS via source grep for the parts that are JS template-literal prompt
# text rather than pure math). Covers:
#   1. the doubling/vortex worked-example CLAIM is itself a true, checkable fact (period 6) --
#      hand-verified, same experiment as buildR3_baselens.test.ps1 part 1, kept self-contained.
#   2. STATIC WIRE GUARDS: M8_DR_PROPOSER_EXAMPLES kill-switch + drProposerExamplesEnabled +
#      both worked-examples consts are defined; the worked-examples block sits inside
#      buildProposeSystem/buildMultiProposeSystem (gated) and NOT inside buildLiteralSystem
#      (explicit-phrasing lane stays untouched); no new api/ fn, no SQL migration.
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

Write-Output "`nE5 digital-root proposer worked examples (PS mirror)`n"

# ---- 1. the doubling/vortex worked example is a TRUE, checkable claim (period 6) -----------
function ModExp([long]$b, [long]$e, [long]$m) {
  if ($m -eq 1) { return 0 }
  [long]$r = 1; [long]$bb = (($b % $m) + $m) % $m; [long]$ee = $e
  while ($ee -gt 0) { if ($ee -band 1) { $r = ($r * $bb) % $m }; $bb = ($bb * $bb) % $m; $ee = [math]::Floor($ee / 2) }
  return $r
}
function DrPow([int]$base, [int]$n) {
  $r = ModExp $base $n 9
  if ($r -eq 0) { return 9 } else { return $r }
}
$h10 = $true
for ($n = 1; $n -le 600; $n++) { if ((DrPow 2 $n) -ne (DrPow 2 ($n + 6))) { $h10 = $false; break } }
Ok $h10 "the doubling/vortex worked example (dr of 2^n, period 6) HOLDS -- a real claim, not a fabricated one"

# ---- 2. STATIC WIRE GUARDS (grep the JS source) --------------------------------------------
$root = Split-Path $PSScriptRoot -Parent
$kcFile = Join-Path $root 'lib\kernel-conjecture.js'
$kc = [IO.File]::ReadAllText($kcFile, [Text.Encoding]::UTF8)

Ok ($kc -match 'M8_DR_PROPOSER_EXAMPLES') "kernel-conjecture.js defines M8_DR_PROPOSER_EXAMPLES kill-switch"
Ok ($kc -match 'function\s+drProposerExamplesEnabled\s*\(') "kernel-conjecture.js defines drProposerExamplesEnabled()"
Ok ($kc -match 'const\s+DR_PROPOSER_WORKED_EXAMPLES_SINGLE\s*=') "kernel-conjecture.js defines DR_PROPOSER_WORKED_EXAMPLES_SINGLE"
Ok ($kc -match 'const\s+DR_PROPOSER_WORKED_EXAMPLES_MULTI\s*=') "kernel-conjecture.js defines DR_PROPOSER_WORKED_EXAMPLES_MULTI"
Ok ($kc -match 'drProposerExamplesEnabled,\s*DR_PROPOSER_WORKED_EXAMPLES_SINGLE,\s*DR_PROPOSER_WORKED_EXAMPLES_MULTI') "the E5 switch + both blocks are exported"

# the worked-example claim text itself must appear verbatim in source (the R4 lesson: a
# required verbatim line must be code-guaranteed, not prompt-hoped -- here, hand-checked JSON).
Ok ($kc -match [regex]::Escape('"template":"dr_periodic","generator":"power","params":{"base":2,"period":6}')) "the doubling worked-example claim JSON appears verbatim in source"

# ---- 2b. POST-DEPLOY FIX -- the raw-message fallback in runKernelTest. Live self-verify caught
#          that a bare "test the doubling digital-root claim" never reaches the worked-examples
#          fix at all: knowledge-intake's proposeDecomposition needs BOTH a kernel AND a leap, and
#          a bare test-request has no leap, so it honestly returns null first. Static source
#          coverage only (runKernelTest calls the real, non-injectable ./llm generate()). --------
$rktStart = $kc.IndexOf('async function runKernelTest(')
Ok ($rktStart -ge 0) "runKernelTest is defined in source"
if ($rktStart -ge 0) {
  $rktEnd = $kc.IndexOf("`nasync function leanVerifyDigitSumMod9", $rktStart)
  $rktBody = $kc.Substring($rktStart, $rktEnd - $rktStart)
  Ok ($rktBody -match 'if \(!dec \|\| !dec\.kernel\) \{') "runKernelTest has a no-kernel branch"
  Ok ($rktBody -match 'drProposerExamplesEnabled\(\)') "runKernelTest's no-kernel branch references drProposerExamplesEnabled()"
  Ok ($rktBody -match 'rawKernel = \{ label: message, content: message \}') "runKernelTest's fallback builds a kernel from the RAW message (label AND content)"
  Ok ($rktBody -match 'bestKernelConjecture\(rawKernel\)') "runKernelTest's fallback calls bestKernelConjecture on the raw kernel"
  Ok ($rktBody -match "I couldn't turn that into a machine-checkable number-pattern claim") "runKernelTest still falls back to the honest decline if the raw-kernel attempt also yields nothing"
  Ok ($rktBody -match 'kernelToConjecture\(rawKernel\)') "runKernelTest retries with the deterministic single-candidate proposer (kernelToConjecture) before declining"
  Ok ($rktBody -match 'singleResult\.holds') "runKernelTest's single-candidate retry only returns early when the claim actually HOLDS"
}

# ---- 2c. POST-DEPLOY FIX #2 -- Groq-first provider order for the two kernel-derived proposer
#          calls. Live self-verify showed Gemini (prod's global-default first provider) does not
#          reliably make the inference the worked example teaches, while Groq (gpt-oss-120b) does,
#          hand-verified locally against the real key. Scoped to ONLY these two calls. -----------
Ok ($kc -match 'const\s+DR_PROPOSER_PROVIDER_ORDER\s*=\s*"groq,') "kernel-conjecture.js defines DR_PROPOSER_PROVIDER_ORDER, groq-first"
Ok ($kc -match 'DR_PROPOSER_PROVIDER_ORDER,') "DR_PROPOSER_PROVIDER_ORDER is exported"
$providerOrderExpr = 'providerOrder: drProposerExamplesEnabled\(\) \? DR_PROPOSER_PROVIDER_ORDER : undefined'
$ktcStart = $kc.IndexOf('async function kernelToConjecture(')
if ($ktcStart -ge 0) {
  $ktcBody = $kc.Substring($ktcStart, [Math]::Min(800, $kc.Length - $ktcStart))
  Ok ($ktcBody -match $providerOrderExpr) "kernelToConjecture() passes the groq-first providerOrder, gated by drProposerExamplesEnabled()"
} else {
  Ok $false "kernelToConjecture() found in source"
}
$pkcStart = $kc.IndexOf('async function proposeKernelCandidates(')
if ($pkcStart -ge 0) {
  $pkcEnd = $pkcStart + 800
  $pkcBody = $kc.Substring($pkcStart, [Math]::Min($pkcEnd, $kc.Length) - $pkcStart)
  Ok ($pkcBody -match $providerOrderExpr) "proposeKernelCandidates() passes the groq-first providerOrder, gated by drProposerExamplesEnabled()"
} else {
  Ok $false "proposeKernelCandidates() found in source"
}

# ---- 3. the block sits inside buildProposeSystem/buildMultiProposeSystem (gated), and is
#         ABSENT from buildLiteralSystem (explicit-phrasing lane untouched) -----------------
function ExtractFn([string]$src, [string]$fnName) {
  $startPat = 'function ' + $fnName + '('
  $start = $src.IndexOf($startPat)
  if ($start -lt 0) { return $null }
  $next = $src.IndexOf("`nfunction ", $start + 1)
  if ($next -lt 0) { $next = $src.Length }
  return $src.Substring($start, $next - $start)
}
$proposeBody = ExtractFn $kc 'buildProposeSystem'
$multiBody   = ExtractFn $kc 'buildMultiProposeSystem'
$literalBody = ExtractFn $kc 'buildLiteralSystem'

Ok ($null -ne $proposeBody -and $proposeBody -match 'drProposerExamplesEnabled\(\)') "buildProposeSystem() gates the worked-examples block on drProposerExamplesEnabled()"
Ok ($null -ne $proposeBody -and $proposeBody -match 'DR_PROPOSER_WORKED_EXAMPLES_SINGLE') "buildProposeSystem() appends DR_PROPOSER_WORKED_EXAMPLES_SINGLE"
Ok ($null -ne $multiBody -and $multiBody -match 'drProposerExamplesEnabled\(\)') "buildMultiProposeSystem() gates the worked-examples block on drProposerExamplesEnabled()"
Ok ($null -ne $multiBody -and $multiBody -match 'DR_PROPOSER_WORKED_EXAMPLES_MULTI') "buildMultiProposeSystem() appends DR_PROPOSER_WORKED_EXAMPLES_MULTI"
Ok ($null -ne $literalBody -and $literalBody -notmatch 'DR_PROPOSER_WORKED_EXAMPLES' -and $literalBody -notmatch 'drProposerExamplesEnabled') "buildLiteralSystem() is UNTOUCHED by the E5 switch (explicit-phrasing lane byte-identical)"

# ---- 4. no new api/ fn, no SQL migration ----------------------------------------------------
$apiDir = Join-Path $root 'api'
$apiCount = @(Get-ChildItem $apiDir -Filter *.js -ErrorAction SilentlyContinue).Count
OkEq 10 $apiCount "E5 fix added no new api/ function (10, post-Session-86 consolidation)"
$migDir = Join-Path $root 'migrations'
$e5sql = 0
if (Test-Path $migDir) { $e5sql = @(Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -match 'e5|dr.?propos' }).Count }
OkEq 0 $e5sql "E5 fix added no SQL migration"

Write-Output ""
Write-Output ("E5 dr-proposer-examples PS mirror: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
