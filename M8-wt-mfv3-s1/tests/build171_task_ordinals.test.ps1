# Build-171 — task ordinals ("mark the 1st done", "delete task 2").
# PS 5.1 mirror of _parseTaskOrdinal + _sortTasksListOrder (Node ABSENT on host)
# + static wiring checks on lib/orchestrator.js.

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

# ── mirror of _normDigits + _parseTaskOrdinal ─────────────────────────────────
function Norm-Digits([string]$s) {
  if ($null -eq $s) { return "" }
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $s.ToCharArray()) {
    $code = [int][char]$ch
    if ($code -ge 0x0660 -and $code -le 0x0669) { [void]$sb.Append([string]($code - 0x0660)) }
    else { [void]$sb.Append($ch) }
  }
  return $sb.ToString()
}
function Parse-TaskOrdinal([string]$q) {
  $s = (Norm-Digits $q).Trim().ToLower()
  if ([string]::IsNullOrEmpty($s)) { return $null }
  $s = $s -replace '^the\s+', ''
  $s = $s -replace '\s+(?:tasks?|ones?|to-?dos?|items?)$', ''
  $s = $s -replace '^(?:ال)?مهمة\s+', ''
  $s = $s -replace '\s+المهمة$', ''
  $s = $s.Trim()
  $words = @{
    "first"=1;"second"=2;"third"=3;"fourth"=4;"fifth"=5;"sixth"=6;"seventh"=7;"eighth"=8;"ninth"=9;"tenth"=10
    "الأول"=1;"الاول"=1;"الأولى"=1;"الاولى"=1;"الثاني"=2;"الثانية"=2;"الثالث"=3;"الثالثة"=3;"الرابع"=4;"الرابعة"=4;"الخامس"=5;"الخامسة"=5
  }
  if ($words.ContainsKey($s)) { return $words[$s] }
  $m = [regex]::Match($s, '^#?(\d{1,2})$')
  if (-not $m.Success) { $m = [regex]::Match($s, '^(?:task|number|no\.?|item|رقم)\s*#?\s*(\d{1,2})$') }
  if (-not $m.Success) { $m = [regex]::Match($s, '^(\d{1,2})(?:st|nd|rd|th)$') }
  if ($m.Success) { $n = [int]$m.Groups[1].Value; if ($n -ge 1) { return $n } else { return $null } }
  return $null
}

# ── ordinal parses (the whole string must be an ordinal) ──────────────────────
Check "the 1st task -> 1"        ((Parse-TaskOrdinal "the 1st task") -eq 1)
Check "first -> 1"               ((Parse-TaskOrdinal "first") -eq 1)
Check "the first one -> 1"       ((Parse-TaskOrdinal "the first one") -eq 1)
Check "task 2 -> 2"              ((Parse-TaskOrdinal "task 2") -eq 2)
Check "#3 -> 3"                  ((Parse-TaskOrdinal "#3") -eq 3)
Check "number 4 -> 4"           ((Parse-TaskOrdinal "number 4") -eq 4)
Check "the 2nd one -> 2"        ((Parse-TaskOrdinal "the 2nd one") -eq 2)
Check "second -> 2"             ((Parse-TaskOrdinal "second") -eq 2)
Check "bare 5 -> 5"            ((Parse-TaskOrdinal "5") -eq 5)
Check "arabic الأولى -> 1"      ((Parse-TaskOrdinal "الأولى") -eq 1)
Check "arabic رقم ٢ -> 2"       ((Parse-TaskOrdinal "رقم ٢") -eq 2)

# ── NON-ordinals must return null (real titles that merely contain a number) ──
Check "2 PRs to review -> null"  ($null -eq (Parse-TaskOrdinal "2 pull requests to review"))
Check "call Ahmad -> null"       ($null -eq (Parse-TaskOrdinal "call Ahmad"))
Check "gym task -> null"         ($null -eq (Parse-TaskOrdinal "gym"))
Check "empty -> null"            ($null -eq (Parse-TaskOrdinal ""))
Check "buy 3 apples -> null"     ($null -eq (Parse-TaskOrdinal "buy 3 apples"))

# ── _sortTasksListOrder mirror: due_at asc (undated last), created_at desc tie ─
function Sort-ListOrder($tasks) {
  return @($tasks | Sort-Object -Property `
    @{ Expression = { if ($_.due_at) { 0 } else { 1 } } }, `
    @{ Expression = { $_.due_at } }, `
    @{ Expression = { $_.created_at }; Descending = $true })
}
$T = @(
  [pscustomobject]@{ id="a"; due_at=$null;        created_at="2026-07-01T10:00:00Z" },
  [pscustomobject]@{ id="b"; due_at="2026-07-05"; created_at="2026-06-01T10:00:00Z" },
  [pscustomobject]@{ id="c"; due_at="2026-07-03"; created_at="2026-06-02T10:00:00Z" },
  [pscustomobject]@{ id="d"; due_at=$null;        created_at="2026-07-02T10:00:00Z" }
)
$ord = Sort-ListOrder $T
# expected: c (due 07-03), b (due 07-05), then undated newest-first: d (07-02), a (07-01)
Check "sort order c,b,d,a"       ((($ord | ForEach-Object { $_.id }) -join ",") -eq "c,b,d,a")
Check "1st = c"                  ($ord[0].id -eq "c")
Check "3rd = d (undated newest)" ($ord[2].id -eq "d")

# ── Static wiring on the JS ───────────────────────────────────────────────────
$root = Split-Path -Parent $PSScriptRoot
$or = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw
Check "js has _parseTaskOrdinal"        ($or.Contains("function _parseTaskOrdinal"))
Check "js has _sortTasksListOrder"      ($or.Contains("function _sortTasksListOrder"))
Check "js wires ordinal before matcher" ($or.Contains("const _ord = _parseTaskOrdinal(cmd.q)"))
Check "js out-of-range guard"           ($or -match "there's no #\$\{_ord\}")
Check "js resolves via list order"      ($or.Contains("_sortTasksListOrder(openTasks"))

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
