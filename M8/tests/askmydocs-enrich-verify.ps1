# M8/tests/askmydocs-enrich-verify.ps1
# Build-D  feat/askmydocs-enrich -- PS 5.1 verification mirror
#
# Asserts (via M8 API -- anon key blocked by RLS on career tables; use fn=status instead):
#   1. Source 38 (Bolt Fleet) in raw_snippets with node_count=5
#   2. Source 39 (Kafala/Delivery) in raw_snippets with node_count=6
#   3. Career corpus total = 44 nodes across sources 34-39
#   4. fn=embed-backfill for [38,39] returns total=0 (all already embedded)
#   5. Prior sources 34-37 still intact with expected node counts
#
# PS 5.1 notes: no & in inline args; no ">=" in labels; no Set-StrictMode

$ErrorActionPreference = 'Stop'

$M8 = 'https://m8-alpha.vercel.app/api/knowledge'

function Get-M8Status {
    Invoke-RestMethod ($M8 + '?fn=status') -Method GET
}

function Invoke-Backfill {
    param([string]$ids)
    $body = '{"source_ids":[' + $ids + ']}'
    Invoke-RestMethod ($M8 + '?fn=embed-backfill') -Method POST -Body $body -ContentType 'application/json'
}

$pass = 0; $fail = 0

function Check {
    param([bool]$ok, [string]$label)
    if ($ok) { Write-Host "  PASS  $label" -ForegroundColor Green; $script:pass++ }
    else      { Write-Host "  FAIL  $label" -ForegroundColor Red;   $script:fail++ }
}

Write-Host ''
Write-Host '=== askmydocs-enrich-verify (Build-D) ===' -ForegroundColor Cyan

# -- 1. Pull status -----------------------------------------------------------
Write-Host ''
Write-Host '[1] Fetching fn=status ...' -ForegroundColor Yellow
$status = Get-M8Status
Check -ok ($status.ok -eq $true) -label 'fn=status returned ok=true'

$snippets = @($status.raw_snippets)
Check -ok ($snippets.Count -gt 0) -label "raw_snippets non-empty (got $($snippets.Count))"

# -- 2. Sources 38 and 39 present with correct node counts --------------------
Write-Host ''
Write-Host '[2] Sources 38 and 39 present in raw_snippets' -ForegroundColor Yellow

$src38 = $snippets | Where-Object { $_.id -eq 38 }
$src39 = $snippets | Where-Object { $_.id -eq 39 }

Check -ok ($null -ne $src38) -label 'Source 38 (Bolt Fleet) present'
Check -ok ($null -ne $src39) -label 'Source 39 (Kafala/Delivery) present'

if ($null -ne $src38) {
    Check -ok ($src38.node_count -eq 5) -label "Source 38 node_count=5 (got $($src38.node_count))"
}
if ($null -ne $src39) {
    Check -ok ($src39.node_count -eq 6) -label "Source 39 node_count=6 (got $($src39.node_count))"
}

# -- 3. Prior career sources 34-37 still intact -------------------------------
Write-Host ''
Write-Host '[3] Prior career sources 34-37 intact' -ForegroundColor Yellow

$src34 = $snippets | Where-Object { $_.id -eq 34 }
$src35 = $snippets | Where-Object { $_.id -eq 35 }
$src36 = $snippets | Where-Object { $_.id -eq 36 }
$src37 = $snippets | Where-Object { $_.id -eq 37 }

Check -ok ($null -ne $src34 -and $src34.node_count -eq 5)  -label "Source 34 node_count=5 (got $($src34.node_count))"
Check -ok ($null -ne $src35 -and $src35.node_count -eq 5)  -label "Source 35 node_count=5 (got $($src35.node_count))"
Check -ok ($null -ne $src36 -and $src36.node_count -eq 5)  -label "Source 36 node_count=5 (got $($src36.node_count))"
Check -ok ($null -ne $src37 -and $src37.node_count -eq 18) -label "Source 37 node_count=18 (got $($src37.node_count))"

# -- 4. Career corpus total ---------------------------------------------------
Write-Host ''
Write-Host '[4] Career corpus total = 44 nodes' -ForegroundColor Yellow

$careerIds  = @(34, 35, 36, 37, 38, 39)
$careerSnips = @($snippets | Where-Object { $careerIds -contains $_.id })
Check -ok ($careerSnips.Count -eq 6) -label "All 6 career sources present (got $($careerSnips.Count))"

$totalNodes = 0
foreach ($s in $careerSnips) { $totalNodes += $s.node_count }
Check -ok ($totalNodes -eq 44) -label "Total career nodes = 44 (got $totalNodes)"

# -- 5. Embeddings: backfill returns total=0 (nothing left to embed) ----------
Write-Host ''
Write-Host '[5] Embeddings: all nodes already embedded (backfill total=0)' -ForegroundColor Yellow

$bf = Invoke-Backfill -ids '38,39'
Check -ok ($bf.ok -eq $true)    -label 'embed-backfill returned ok=true'
Check -ok ($bf.total -eq 0)     -label "embed-backfill total=0 -- all embedded (got $($bf.total))"
Check -ok ($bf.failed -eq 0)    -label "embed-backfill failed=0 (got $($bf.failed))"

# -- Result -------------------------------------------------------------------
Write-Host ''
if ($fail -eq 0) {
    Write-Host "  PASSED: $pass   FAILED: $fail" -ForegroundColor Green
} else {
    Write-Host "  PASSED: $pass   FAILED: $fail" -ForegroundColor Red
    exit 1
}
