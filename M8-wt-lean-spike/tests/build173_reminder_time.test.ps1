# Build-173 — reminder clock-time parsing + delivery wiring.
# PS 5.1 mirror of _parseKsaTime / _ksaDateTimeISO / _taskClock (Node ABSENT)
# + static wiring checks. Saved UTF-8 BOM (Arabic literals).

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

function Norm-Digits([string]$s) {
  if ($null -eq $s) { return "" }
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $s.ToCharArray()) {
    $c = [int][char]$ch
    if ($c -ge 0x0660 -and $c -le 0x0669) { [void]$sb.Append([string]($c - 0x0660)) } else { [void]$sb.Append($ch) }
  }
  return $sb.ToString()
}

# ── mirror of _parseKsaTime → returns hashtable @{hour;minute} or $null ───────
function Parse-KsaTime([string]$text) {
  $s = "" + $text
  $m = [regex]::Match($s, '\b(noon|midday)\b', 'IgnoreCase'); if ($m.Success) { return @{ hour = 12; minute = 0 } }
  $m = [regex]::Match($s, '\bmidnight\b', 'IgnoreCase');      if ($m.Success) { return @{ hour = 0; minute = 0 } }
  $m = [regex]::Match($s, '\b(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)', 'IgnoreCase')
  if ($m.Success) {
    $h = [int]$m.Groups[1].Value; $min = if ($m.Groups[2].Success) { [int]$m.Groups[2].Value } else { 0 }
    $pm = $m.Groups[3].Value -match 'p'
    if ($h -eq 12) { if ($pm) { $h = 12 } else { $h = 0 } } elseif ($pm) { $h += 12 }
    if ($h -ge 0 -and $h -le 23 -and $min -ge 0 -and $min -le 59) { return @{ hour = $h; minute = $min } }
  }
  $m = [regex]::Match($s, '(?:الساعة\s*)?([0-9٠-٩]{1,2})(?::([0-9٠-٩]{2}))?\s*(صباح[اً]?|مساء[اً]?|عصر[اً]?|ظهر[اً]?|ليل[اً]?|ص|م)\b')
  if ($m.Success) {
    $h = [int](Norm-Digits $m.Groups[1].Value); $min = if ($m.Groups[2].Success) { [int](Norm-Digits $m.Groups[2].Value) } else { 0 }
    $g3 = $m.Groups[3].Value
    $ev = ($g3 -match 'مساء|عصر|ليل') -or ($g3 -eq 'م')
    if ($g3 -match 'ظهر') { $h = 12 } elseif ($h -eq 12) { if ($ev) { $h = 12 } else { $h = 0 } } elseif ($ev) { $h += 12 }
    if ($h -ge 0 -and $h -le 23) { return @{ hour = $h; minute = $min } }
  }
  $m = [regex]::Match($s, '\b(?:at\s+|@\s*)(\d{1,2}):(\d{2})\b')
  if ($m.Success) {
    $h = [int]$m.Groups[1].Value; $min = [int]$m.Groups[2].Value
    if ($h -ge 0 -and $h -le 23 -and $min -ge 0 -and $min -le 59) { return @{ hour = $h; minute = $min } }
  }
  $m = [regex]::Match($s, '\b(?:at\s+|@\s*)(\d{1,2})\b(?!\s*(?:st|nd|rd|th|%|k|kg|km|sar|riyals?|pm|am|:))', 'IgnoreCase')
  if ($m.Success) {
    $h = [int]$m.Groups[1].Value
    if ($h -ge 0 -and $h -le 23) { if ($h -ge 1 -and $h -le 6) { $h += 12 }; return @{ hour = $h; minute = 0 } }
  }
  return $null
}

function eq2($a, $exH, $exM) { return ($null -ne $a) -and ($a.hour -eq $exH) -and ($a.minute -eq $exM) }

Check "at 11am -> 11:00"        (eq2 (Parse-KsaTime "call the bank at 11am") 11 0)
Check "at 9:30 pm -> 21:30"     (eq2 (Parse-KsaTime "at 9:30 pm") 21 30)
Check "at 5pm -> 17:00"         (eq2 (Parse-KsaTime "at 5pm") 17 0)
Check "at noon -> 12:00"        (eq2 (Parse-KsaTime "at noon") 12 0)
Check "at midnight -> 0:00"     (eq2 (Parse-KsaTime "at midnight") 0 0)
Check "12am -> 0:00"            (eq2 (Parse-KsaTime "at 12am") 0 0)
Check "12pm -> 12:00"           (eq2 (Parse-KsaTime "at 12pm") 12 0)
Check "at 17:00 -> 17:00"       (eq2 (Parse-KsaTime "at 17:00") 17 0)
Check "meeting at 11 -> 11:00"  (eq2 (Parse-KsaTime "meeting at 11") 11 0)
Check "at 5 -> 17:00 (1-6 pm)"  (eq2 (Parse-KsaTime "at 5") 17 0)
Check "arabic 11 صباحا -> 11"   (eq2 (Parse-KsaTime "الساعة ١١ صباحا") 11 0)
Check "arabic 5 مساء -> 17"     (eq2 (Parse-KsaTime "ذكرني الساعة ٥ مساء") 17 0)
# non-times
Check "no time -> null"         ($null -eq (Parse-KsaTime "call the bank"))
Check "buy 3 apples -> null"    ($null -eq (Parse-KsaTime "buy 3 apples"))
Check "the 30th -> null"        ($null -eq (Parse-KsaTime "at 30th"))
Check "500 sar -> null"         ($null -eq (Parse-KsaTime "pay at 500 sar"))

# ── mirror of _ksaDateISO + _ksaDateTimeISO: KSA 11:00 => UTC 08:00 ──────────
function Ksa-DateISO([int]$off) {
  $d = (Get-Date).ToUniversalTime().AddHours(3).AddDays($off)
  return $d.ToString("yyyy-MM-dd")
}
function Ksa-DateTimeISO([int]$off, [int]$h, [int]$mi) {
  $dateISO = Ksa-DateISO $off
  $hh = "{0:D2}" -f $h; $mm = "{0:D2}" -f $mi
  return [datetimeoffset]::Parse("$dateISO`T$hh`:$mm`:00+03:00").UtcDateTime
}
$dt = Ksa-DateTimeISO 0 11 0
Check "KSA 11:00 -> UTC hour 8"  ($dt.Hour -eq 8 -and $dt.Minute -eq 0)
$dt2 = Ksa-DateTimeISO 0 21 30
Check "KSA 21:30 -> UTC hour 18" ($dt2.Hour -eq 18 -and $dt2.Minute -eq 30)

# ── mirror of _taskClock: timed shows clock, date-only sentinel shows nothing ─
function Task-Clock($utcDate, [bool]$ar) {
  if ($null -eq $utcDate) { return "" }
  $ksa = $utcDate.AddHours(3)
  $h = $ksa.Hour; $mi = $ksa.Minute
  if ($mi -eq 0 -and ($h -eq 0 -or $h -eq 3)) { return "" }
  $mm = "{0:D2}" -f $mi
  if ($ar) { return " الساعة $h`:$mm" }
  $h12 = $h % 12; if ($h12 -eq 0) { $h12 = 12 }
  $ap = if ($h -lt 12) { "am" } else { "pm" }
  return " at $h12`:$mm$ap"
}
Check "clock 11:00 -> at 11:00am"  ((Task-Clock (Ksa-DateTimeISO 0 11 0) $false) -eq " at 11:00am")
Check "clock 21:30 -> at 9:30pm"   ((Task-Clock (Ksa-DateTimeISO 0 21 30) $false) -eq " at 9:30pm")
# date-only: a bare date is UTC midnight = 03:00 KSA -> no clock
$dateOnly = [datetimeoffset]::Parse("2026-07-03T00:00:00+00:00").UtcDateTime
Check "date-only (UTC midnight) -> no clock" ((Task-Clock $dateOnly $false) -eq "")

# ── B-175: reminder ROUTING — no-"to"/about phrasings must create a reminder ──
function Remind-Creates([string]$m) {
  if ($m -match '^remind me\s+(?:at|by|@|around|on|tomorrow|today|tonight|this|next|every|in)\b.+?\s+to\s+.+') { return $true }
  if ($m -match '^remind me (?:to|that i (?:need to|should|have to))\s+.+') { return $true }
  if ($m -match '^remind me\b') {
    $rest = ($m -replace '^remind me\s+','').Trim()
    $about = $rest -match '^(?:about|of|regarding)\s+.+'
    $hasWhen = ($null -ne (Parse-KsaTime $rest)) -or ($rest -match '\btomorrow\b|\btmrw\b|\btoday\b|\btonight\b')
    if ($about -or $hasWhen) { return $true }
  }
  return $false
}
Check "route: today at 9:47pm about the match" (Remind-Creates "remind me today at 9:47 pm about the match")
Check "route: to call the bank"                (Remind-Creates "remind me to call the bank")
Check "route: at 5pm about the meeting"         (Remind-Creates "remind me at 5pm about the meeting")
Check "route: about the match (no time)"        (Remind-Creates "remind me about the match")
Check "route: tomorrow about the game"          (Remind-Creates "remind me tomorrow about the game")
Check "route: why the sky is blue -> NO"        (-not (Remind-Creates "remind me why the sky is blue"))
Check "route: what we discussed -> NO"          (-not (Remind-Creates "remind me what we discussed"))

# ── Static wiring ─────────────────────────────────────────────────────────────
$root = Split-Path -Parent $PSScriptRoot
$or = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw
$pc = Get-Content (Join-Path $root "lib\handlers\push-cron.js") -Raw
$wf = Get-Content (Join-Path $root ".github\workflows\push-ping.yml") -Raw
Check "js has _parseKsaTime"        ($or.Contains("function _parseKsaTime"))
Check "js has _ksaDateTimeISO"      ($or.Contains("function _ksaDateTimeISO"))
Check "js has _dueForTime"          ($or.Contains("function _dueForTime"))
Check "js _addFrom uses _parseKsaTime" ($or.Contains("const _tm = _parseKsaTime(title)"))
Check "js time-lead remind pattern" ($or.Contains("^remind me\s+((?:at|by|@|around|on|tomorrow"))
Check "cron fires on due<=now"      ($pc.Contains(".lte(`"due_at`", nowISO)"))
Check "cron no longer end-of-today" (-not $pc.Contains("todayEnd"))
Check "workflow every 15 min"       ($wf.Contains("*/15 * * * *"))
Check "workflow calls push-cron"    ($wf.Contains("/api/push-cron"))
Check "workflow uses CRON_SECRET"   ($wf.Contains("secrets.CRON_SECRET"))
# B-175 wiring
Check "js has no-to remind block"   ($or.Contains("const _about = _rest.match"))
Check "js _addFrom strips about"    ($or.Contains("^(?:about|of|regarding)\s+"))

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
