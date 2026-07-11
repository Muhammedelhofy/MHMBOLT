# Build-169e — memory recall char budget (E2 diet: MEM floor 5-6k -> capped)
# PS 5.1 mirror of lib/memory.js trimRecallRows() (Node is ABSENT on this host)
# + static wiring checks on the JS.

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

function New-Row([int]$id, [string]$type, [int]$chars, [string]$created) {
  New-Object PSObject -Property @{
    id = $id; memory_type = $type; content = ("x" * $chars); created_at = [datetime]$created
  }
}

# Mirror of trimRecallRows — keep the logic IDENTICAL to lib/memory.js.
function Trim-RecallRows($rows, [int]$budget) {
  $list = @($rows | Where-Object { $null -ne $_ })
  if ($budget -le 0) { return $list }
  $profile = @($list | Where-Object { $_.memory_type -eq "profile" })
  $ops     = @($list | Where-Object { $_.memory_type -eq "operational" } | Sort-Object -Property created_at -Descending)
  $rest    = @($list | Where-Object { $_.memory_type -ne "profile" -and $_.memory_type -ne "operational" })
  $keepIds = New-Object System.Collections.Generic.HashSet[int]
  $used = 0
  foreach ($r in $profile) { [void]$keepIds.Add($r.id); $used += $r.content.Length }
  foreach ($r in ($ops + $rest)) {
    $c = $r.content.Length
    if (($used + $c) -gt $budget) { continue }   # first-fit skip, not stop
    [void]$keepIds.Add($r.id); $used += $c
  }
  return @($list | Where-Object { $keepIds.Contains($_.id) })
}

# ── Case 1: kill switch (budget 0) → untouched ────────────────────────────────
$rows = @(
  (New-Row 1 "profile"     100 "2026-01-01"),
  (New-Row 2 "operational" 900 "2026-06-01"),
  (New-Row 3 "summary"     800 "2026-05-01")
)
$t1 = Trim-RecallRows $rows 0
Check "c1 budget 0 -> all rows" ($t1.Count -eq 3)

# ── Case 2: profile NEVER trimmed, even over budget ───────────────────────────
$bigProfile = @((New-Row 1 "profile" 3000 "2026-01-01"), (New-Row 2 "profile" 3000 "2026-01-02"))
$t2 = Trim-RecallRows $bigProfile 1000
Check "c2 profile survives any budget" ($t2.Count -eq 2)

# ── Case 3: operational newest-first under the cap ────────────────────────────
$rows3 = @(
  (New-Row 1 "profile"     500  "2026-01-01"),
  (New-Row 2 "operational" 2000 "2026-06-01"),   # older op
  (New-Row 3 "operational" 2000 "2026-06-15"),   # NEWER op — must win the budget
  (New-Row 4 "summary"     2000 "2026-05-01")
)
$t3 = Trim-RecallRows $rows3 2600   # 500 profile + room for exactly ONE 2000-row
# NOTE: @(...) wrapping is load-bearing — in PS 5.1 a single Where-Object hit
# has no .Count (the classic mirror gotcha).
Check "c3 keeps 2 rows"          ($t3.Count -eq 2)
Check "c3 newest op kept"        (@($t3 | Where-Object { $_.id -eq 3 }).Count -eq 1)
Check "c3 older op dropped"      (@($t3 | Where-Object { $_.id -eq 2 }).Count -eq 0)
Check "c3 tier-2 dropped"        (@($t3 | Where-Object { $_.id -eq 4 }).Count -eq 0)

# ── Case 4: tier-2 admitted after ops when room remains ───────────────────────
$t4 = Trim-RecallRows $rows3 4700   # 500 + 2000 + 2000 = 4500 <= 4700 → one more
Check "c4 both ops + nothing else" ($t4.Count -eq 3)
$t4b = Trim-RecallRows $rows3 6600  # room for everything
Check "c4b all rows fit"           ($t4b.Count -eq 4)

# ── Case 5: first-fit — a too-big row is skipped, a smaller LATER row fits ────
$rows5 = @(
  (New-Row 1 "operational" 5000 "2026-06-15"),   # too big for the budget
  (New-Row 2 "operational" 300  "2026-06-01"),   # older but fits
  (New-Row 3 "summary"     200  "2026-05-01")    # fits after
)
$t5 = Trim-RecallRows $rows5 600
Check "c5 big row skipped"       (@($t5 | Where-Object { $_.id -eq 1 }).Count -eq 0)
Check "c5 small op kept"         (@($t5 | Where-Object { $_.id -eq 2 }).Count -eq 1)
Check "c5 tier-2 kept"           (@($t5 | Where-Object { $_.id -eq 3 }).Count -eq 1)

# ── Case 6: output preserves the caller's original order ─────────────────────
$t6 = Trim-RecallRows $rows3 6600
Check "c6 original order kept"   ((($t6 | ForEach-Object { $_.id }) -join ",") -eq "1,2,3,4")

# ── Static wiring checks ──────────────────────────────────────────────────────
$root = Split-Path -Parent $PSScriptRoot
$js = Get-Content (Join-Path $root "lib\memory.js") -Raw
Check "s1 env M8_RECALL_CHAR_BUDGET"     ($js.Contains("M8_RECALL_CHAR_BUDGET"))
Check "s2 default 4500"                  ($js -match 'n > 0 \? n : 4500')
Check "s3 recallMemory applies trim"     ($js.Contains("return trimRecallRows(merged, recallCharBudget())"))
Check "s4 kill accepts off"              ($js -match '"off" \|\| raw === "0"')
Check "s5 profile never trimmed comment" ($js.Contains("NEVER trimmed"))
Check "s6 exported for tests"            ($js.Contains("trimRecallRows,"))
Check "s7 first-fit continue"            ($js.Contains("continue;                   // first-fit skip"))

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
