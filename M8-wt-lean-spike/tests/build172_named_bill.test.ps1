# Build-172 — named-bill / credit-card coverage.
# PS 5.1 mirror of parseNamedBillQuery + getNamedBill fuzzy match (Node ABSENT)
# + static wiring checks. Saved UTF-8 BOM (Arabic literals).

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

# ── mirror of _cleanBillSubject + parseNamedBillQuery ─────────────────────────
function Clean-BillSubject([string]$s) {
  $t = $s
  $t = [regex]::Replace($t, '\b(bill|payment|amount|the|my|our|for|on|this|month|please|to|pay)\b', ' ', 'IgnoreCase')
  $t = [regex]::Replace($t, '[.؟?!،]+$', '')
  $t = [regex]::Replace($t, '\s{2,}', ' ').Trim()
  if ($t.Length -ge 2) { return $t } else { return $null }
}
function Parse-NamedBill([string]$raw) {
  $m = ($raw + "").Trim()
  if ([string]::IsNullOrEmpty($m) -or $m.Length -gt 140) { return $null }
  $oblig = [regex]::IsMatch($m, '\b(how much|amount|owe|have to pay|need to pay|do i (?:have to )?pay|due|balance|payment)\b', 'IgnoreCase')
  $arOblig = [regex]::IsMatch($m, 'كم|أدفع|ادفع|علي\b|مستحق|رصيد|دفعة')
  if ([regex]::IsMatch($m, '\bcredit\s*card\b', 'IgnoreCase') -and ($oblig -or [regex]::IsMatch($m, '\bpay\b','IgnoreCase'))) { return "credit card" }
  if ([regex]::IsMatch($m, 'بطاقة\s*(?:ائتمان|الائتمان)?') -and $arOblig) { return "بطاقة" }
  if (($oblig -or $arOblig) -and ([regex]::IsMatch($m, '\b(bill|payment)\b','IgnoreCase') -or [regex]::IsMatch($m,'فاتورة'))) {
    $x = [regex]::Match($m.ToLower(), '(?:my|the|our|for|on)\s+([a-z][a-z\s]{1,30}?)\s+(?:bill|payment)\b')
    if ($x.Success) { return (Clean-BillSubject $x.Groups[1].Value) }
    $x = [regex]::Match($m, 'فاتورة\s+(?:الـ|ال)?([^\s؟?]+)')
    if ($x.Success) { return (Clean-BillSubject $x.Groups[1].Value) }
  }
  return $null
}

# ── fires on the reported case + close cousins ────────────────────────────────
Check "credit card amount I have to pay -> credit card" ((Parse-NamedBill "credit card amount I have to pay") -eq "credit card")
Check "how much is my credit card -> credit card"       ((Parse-NamedBill "how much is my credit card") -eq "credit card")
Check "credit card balance -> credit card"              ((Parse-NamedBill "what's my credit card balance") -eq "credit card")
Check "owe on the internet bill -> internet"            ((Parse-NamedBill "how much do I owe on the internet bill") -eq "internet")
Check "my rent payment -> rent"                         ((Parse-NamedBill "what is my rent payment") -eq "rent")
Check "arabic credit card"                              ((Parse-NamedBill "كم علي أدفع لبطاقة الائتمان") -eq "بطاقة")

# ── does NOT steal spend/income/other lanes (returns null) ────────────────────
Check "how much did I spend -> null"        ($null -eq (Parse-NamedBill "how much did I spend this month"))
Check "what's my income -> null"            ($null -eq (Parse-NamedBill "what's my income this month"))
Check "owe Khalid (no bill word) -> null"   ($null -eq (Parse-NamedBill "how much do I owe Khalid"))
Check "pay attention -> null"               ($null -eq (Parse-NamedBill "how much do I have to pay attention"))
Check "budget question -> null"             ($null -eq (Parse-NamedBill "am I over budget"))
Check "empty -> null"                       ($null -eq (Parse-NamedBill ""))

# ── mirror of getNamedBill fuzzy match ────────────────────────────────────────
function Match-Bill([string]$subject, $billNames) {
  $q = $subject.ToLower().Trim()
  if ([string]::IsNullOrEmpty($q)) { return $null }
  $qTokens = @($q -split '\s+' | Where-Object { $_.Length -ge 3 })
  foreach ($name in $billNames) {
    $n = ("" + $name).ToLower()
    if ([string]::IsNullOrEmpty($n)) { continue }
    if ($n.Contains($q) -or $q.Contains($n)) { return $name }
    foreach ($t in $qTokens) { if ($n.Contains($t)) { return $name } }
  }
  return $null
}
$bills = @("Visa Credit Card", "Internet", "Rent")
Check "credit card ~ Visa Credit Card" ((Match-Bill "credit card" $bills) -eq "Visa Credit Card")
Check "internet ~ Internet"            ((Match-Bill "internet" $bills) -eq "Internet")
Check "electricity ~ (none)"           ($null -eq (Match-Bill "electricity" $bills))
Check "empty bills -> none"            ($null -eq (Match-Bill "credit card" @()))

# ── Static wiring ─────────────────────────────────────────────────────────────
$root = Split-Path -Parent $PSScriptRoot
$or = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw
$wl = Get-Content (Join-Path $root "lib\wallet.js") -Raw
Check "js has parseNamedBillQuery"        ($or.Contains("function parseNamedBillQuery"))
Check "js last-resort lane calls getNamedBill" ($or.Contains("_wallet.getNamedBill(billSubject)"))
Check "js honest not-found (no capability lie)" ($or.Contains("Add it in the wallet and I'll track it"))
Check "wallet exports getNamedBill"       ($wl.Contains("getNamedBill"))
# not 7-day gated: the honest not-found branch lists ALL active bills (no dueInDays window)
Check "wallet getNamedBill lists all active bills" ($wl.Contains("found: false, any: true"))

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
