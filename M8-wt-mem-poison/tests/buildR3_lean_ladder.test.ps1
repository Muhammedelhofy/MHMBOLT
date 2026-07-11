# tests/buildR3_lean_ladder.test.ps1
# PS-5.1 MIRROR of Build-R3 STRETCH WIRING (no local Node — the eligibility predicate is
# reimplemented inline, the rest are static source guards, same discipline as
# tests/buildR3_baselens.test.ps1). Covers:
#   1. eligibility scoping: ONLY held base-10 dr templates (dr_periodic/dr_constant/dr_set);
#      mod_cycle + dr_base_* EXCLUDED (the Lean theorem is 10a+b, base-10 / mod-9 only)
#   2. STATIC WIRE GUARDS: M8_LEAN_LADDER kill-switch, the four runKernelTest call sites,
#      the ⚡ PROVEN line is code-guarded by status==='proven', the honest fail-safe pending
#      line, the exports, and the theorem receipt constant are all present in source
# "PASS" = exit 0.

$ErrorActionPreference = 'Stop'
$script:pass = 0; $script:fail = 0
function Ok($cond, $label) {
  if ($cond) { $script:pass++; Write-Output ("  PASS  " + $label) }
  else       { $script:fail++; Write-Output ("  FAIL  " + $label) }
}

Write-Output "`nBuild-R3 Lean-ladder wiring (PS mirror)`n"

# ---- 1. eligibility predicate reimplemented inline (mirrors leanLadderEligible) ----
$eligTemplates = @("dr_periodic", "dr_constant", "dr_set")
function LadderEligible([string]$template, [bool]$holds) {
  return ($holds -and ($eligTemplates -contains $template))
}
Ok (LadderEligible "dr_periodic" $true)  "eligible: held dr_periodic"
Ok (LadderEligible "dr_constant" $true)  "eligible: held dr_constant"
Ok (LadderEligible "dr_set"      $true)  "eligible: held dr_set"
Ok (-not (LadderEligible "mod_cycle" $true))        "EXCLUDED: mod_cycle (not mod 9)"
Ok (-not (LadderEligible "dr_base_periodic" $true)) "EXCLUDED: dr_base_* (base b != 10)"
Ok (-not (LadderEligible "dr_periodic" $false))     "EXCLUDED: a falsified dr_periodic"

# ---- 2. STATIC WIRE GUARDS (grep the JS source) -----------------------------
$root = Split-Path $PSScriptRoot -Parent
$kcFile = Join-Path $root 'lib\kernel-conjecture.js'
$kc = [IO.File]::ReadAllText($kcFile, [Text.Encoding]::UTF8)

Ok ($kc -match 'M8_LEAN_LADDER') "kernel-conjecture.js defines M8_LEAN_LADDER kill-switch"
Ok ($kc -match 'function leanLadderEnabled') "defines leanLadderEnabled"
Ok ($kc -match 'function leanLadderEligible') "defines leanLadderEligible"
Ok ($kc -match 'async function leanLadderLine') "defines async leanLadderLine"
Ok ($kc -match 'const\s+LEAN_LADDER_TEMPLATES\s*=\s*\["dr_periodic",\s*"dr_constant",\s*"dr_set"\]') "LEAN_LADDER_TEMPLATES = the 3 base-10 dr templates"

# the four held-return points in runKernelTest each append the ladder
$wireCount = ([regex]::Matches($kc, 'await leanLadderLine\(')).Count
Ok ($wireCount -ge 4) "runKernelTest wires leanLadderLine at all 4 held-return points (found $wireCount)"

# the ⚡ PROVEN claim is emitted ONLY inside the status==='proven' branch (honesty guard)
Ok ($kc -match 'r\.status === "proven" && r\.theorem') "PROVEN line is code-guarded by status==='proven'"
Ok ($kc -match 'PROVEN \(Lean-verified\)') "renders the PROVEN (Lean-verified) tier"
Ok ($kc -match '0 sorry, 0 errors') "PROVEN tier cites 0 sorry, 0 errors"
Ok ($kc -match 'GROUNDWORK, not the specific pattern') "PROVEN tier scopes to GROUNDWORK, not the pattern"
Ok ($kc -match 'Machine-check pending') "cold/unreachable degrades to an honest 'Machine-check pending'"
Ok ($kc -match 'base10_two_digit_mod9') "the Lean theorem receipt constant is present"

# exported for the JS unit test / reuse
Ok ($kc -match 'leanLadderEnabled,\s*LEAN_LADDER_TEMPLATES,\s*leanLadderEligible,\s*leanLadderLine') "exports the ladder helpers"

# no new api/ fn and no SQL migration (narration-only build)
$apiDir = Join-Path $root 'api'
$apiCount = @(Get-ChildItem $apiDir -Filter *.js -ErrorAction SilentlyContinue).Count
Ok ($apiCount -eq 10) "added no new api/ function (still 10, found $apiCount)"
$migDir = Join-Path $root 'migrations'
$ladderSql = 0
if (Test-Path $migDir) { $ladderSql = @(Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -match 'ladder|lean.?ladder' }).Count }
Ok ($ladderSql -eq 0) "added no SQL migration"

Write-Output ""
Write-Output ("Build-R3 Lean-ladder wiring PS mirror: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
