# B-191 transcript fixes -- PS 5.1 mirror (ASCII-only, no Node).
#
# The JS test (tests/build191_fixes.test.js) is the authoritative contract; this mirror
# re-implements the SAME pure logic so it runs on this Node-less host. Per the PS-mirror
# rule: a PS-only fail with a JS pass means a MIRROR bug, not a source bug -- fix the mirror.
#
# ASCII-ONLY: the CJK citation brackets and any Arabic are built from [char]0xNNNN codes
# at runtime -- a literal non-ASCII byte in a .ps1 is mangled by PS 5.1's codepage read.
#
# FIX 1 (wallet<->travel present-tie) is mirrored in tests/intent_gate_test.ps1. This file
# mirrors the pure helpers of FIX 2/3/4:
#   FIX 2  sanitizeSourceTitle (layer a) + stripSourceTokens (layer b)
#   FIX 3  isBalanceQuery
#   FIX 4  countryName / isCountryOrigin / originCountryAsk (English parts; JS covers AR)

$ErrorActionPreference = 'Stop'
$script:pass = 0
$script:fail = 0
$script:failLines = @()

function Assert-Eq([string]$label, $got, $exp) {
  if ("$got" -ceq "$exp") { $script:pass++ }
  else { $script:fail++; $line = "  FAIL  $label  (got '$got', exp '$exp')"; $script:failLines += $line; Write-Host $line -ForegroundColor Red }
}
function Assert-True([string]$label, [bool]$cond) {
  if ($cond) { $script:pass++ }
  else { $script:fail++; $line = "  FAIL  $label"; $script:failLines += $line; Write-Host $line -ForegroundColor Red }
}

# CJK citation brackets, built from code points (ASCII source).
$OPEN  = [string]([char]0x3014) + [string]([char]0x3010)   # left  brackets
$CLOSE = [string]([char]0x3015) + [string]([char]0x3011)   # right brackets

# ---------------------------------------------------------------------------
# FIX 2 -- mirror of lib/knowledge-intake.js sanitizeSourceTitle
# ---------------------------------------------------------------------------
function Sanitize-SourceTitle([string]$title) {
  $t = "$title".Trim()
  $m = [regex]::Match($t, '^vault:(.+)$', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) {
    $rest = $m.Groups[1].Value
    $parts = $rest -split '[\\/]'
    $t = $parts[$parts.Length - 1]
    $t = [regex]::Replace($t, '\.(?:md|markdown|txt)$', '', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
  }
  return $t
}

# ---------------------------------------------------------------------------
# FIX 2 -- mirror of lib/source-token-filter.js stripSourceTokens
# ---------------------------------------------------------------------------
$RX_BRACKETED = '[' + $OPEN + '\[]\s*vault:[^' + $CLOSE + '\]\n]*[' + $CLOSE + '\]]'
$RX_BARE      = 'vault:[^\n' + $OPEN + '\[' + $CLOSE + '\]]*?\.(?:md|markdown|txt)\b'
$RX_PREFIX    = 'vault:[^\s' + $OPEN + '\[' + $CLOSE + '\])(,.;]+'
$RX_EMPTY     = '[' + $OPEN + '\[]\s*[' + $CLOSE + '\]]'
function Strip-SourceTokens([string]$text) {
  $ci = [Text.RegularExpressions.RegexOptions]::IgnoreCase
  $s = "$text"
  $s = [regex]::Replace($s, $RX_BRACKETED, '', $ci)
  $s = [regex]::Replace($s, $RX_BARE, '', $ci)
  $s = [regex]::Replace($s, $RX_PREFIX, '', $ci)
  $s = [regex]::Replace($s, $RX_EMPTY, '')
  $s = [regex]::Replace($s, '[ \t]{2,}', ' ')
  $s = [regex]::Replace($s, '[ \t]+([.,;)])', '$1')
  return $s
}

# ---------------------------------------------------------------------------
# FIX 3 -- mirror of lib/wallet.js isBalanceQuery
# ---------------------------------------------------------------------------
$RX_BAL = '\bbalance\b|\bhow much (?:is|do i have|have i got|is (?:there )?)?\s*(?:left|remaining|in (?:my|the) wallet|do i have)\b|\bhow much (?:money )?(?:do i|have i|i)\s*(?:have|got)\b|\bwhat(?:''s| is| do i have)\b[^?]*\bleft\b'
$RX_SPEND = '\bspen[dt]\b'
function Is-BalanceQuery([string]$msg) {
  $ci = [Text.RegularExpressions.RegexOptions]::IgnoreCase
  if ([regex]::IsMatch($msg, $RX_SPEND, $ci)) { return $false }
  return [regex]::IsMatch($msg, $RX_BAL, $ci)
}

# ---------------------------------------------------------------------------
# FIX 4 -- mirror of lib/travel.js countryName / isCountryOrigin / originCountryAsk
# ---------------------------------------------------------------------------
$COUNTRY_NAMES = @{
  'egypt' = 'Egypt'; 'saudi arabia' = 'Saudi Arabia'; 'ksa' = 'Saudi Arabia'; 'the kingdom' = 'Saudi Arabia';
  'uae' = 'the UAE'; 'united arab emirates' = 'the UAE'; 'the emirates' = 'the UAE'; 'emirates' = 'the UAE';
  'qatar' = 'Qatar'; 'oman' = 'Oman'; 'jordan' = 'Jordan'; 'lebanon' = 'Lebanon'; 'turkey' = 'Turkey';
  'uk' = 'the UK'; 'united kingdom' = 'the UK'; 'britain' = 'the UK'; 'england' = 'the UK';
  'france' = 'France'; 'spain' = 'Spain'; 'italy' = 'Italy'; 'germany' = 'Germany';
  'usa' = 'the USA'; 'us' = 'the USA'; 'united states' = 'the USA'; 'america' = 'the USA';
  'india' = 'India'; 'indonesia' = 'Indonesia'; 'malaysia' = 'Malaysia'; 'thailand' = 'Thailand';
}
# City keys that resolve to an airport (mirror of the country-relevant CITY_IATA rows).
$CITY_IATA_KEYS = @('kuwait','kuwait city','bahrain','manama','singapore','male','maldives','muscat','doha')
function Country-Name([string]$name) {
  if (-not $name) { return $null }
  $k = "$name".Trim().ToLower()
  if ($COUNTRY_NAMES.ContainsKey($k)) { return $COUNTRY_NAMES[$k] }
  $base = ($k -split '[,(/]')[0].Trim()
  if ($COUNTRY_NAMES.ContainsKey($base)) { return $COUNTRY_NAMES[$base] }
  return $null
}
function CityResolves([string]$city) {
  $k = "$city".Trim().ToLower()
  return ($CITY_IATA_KEYS -contains $k)
}
function Is-CountryOrigin($trip) {
  $city = $trip.origin.city
  if (-not $city) { return $false }
  return ((Country-Name $city) -ne $null) -and (-not (CityResolves $city))
}
function Origin-CountryAsk($trip, [bool]$ar) {
  if (-not (Is-CountryOrigin $trip)) { return $null }
  $src = $trip.origin.source
  if ($src -ne 'stated' -and $src -ne 'confirmed') { return $null }
  if ($ar) { return "ASK_AR" }  # AR text is non-ASCII; JS asserts the Arabic string
  return ("Which city in " + (Country-Name $trip.origin.city) + " are you flying from?")
}

# FIX 4b -- mirror of lib/travel.js detectStatedCountryOrigin (English anchors only).
$COUNTRY_TOKENS = ($COUNTRY_NAMES.Keys | Where-Object { $_ -ne 'us' } | Sort-Object { $_.Length } -Descending)
$TOK_ALT = ($COUNTRY_TOKENS | ForEach-Object { [regex]::Escape($_) -replace '\\ ', '\s+' }) -join '|'
$RX_FROM_COUNTRY = '(?:\b(?:from|flying\s+from|depart(?:ing)?\s+from|leaving\s+from|out\s+of|travell?ing\s+from))\s+(?:the\s+)?(' + $TOK_ALT + ')\b'
function Detect-StatedCountryOrigin([string]$text) {
  $m = [regex]::Match("$text", $RX_FROM_COUNTRY, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

# ===========================================================================
Write-Host "B-191 fixes mirror -- FIX 2/3/4 pure logic`n"

# -- FIX 2 layer (a)
Assert-Eq "FIX2a vault title relabelled" (Sanitize-SourceTitle 'vault:Prime Claude.md') 'Prime Claude'
Assert-Eq "FIX2a vault path basename"    (Sanitize-SourceTitle 'vault:Muhammad-OS/NORTH_STAR.md') 'NORTH_STAR'
Assert-Eq "FIX2a non-vault untouched"    (Sanitize-SourceTitle 'Al-Bidayah Vol 1') 'Al-Bidayah Vol 1'

# -- FIX 2 layer (b)
$b1 = Strip-SourceTokens 'According to vault:Prime Claude.md you prefer tables.'
Assert-True "FIX2b bare token stripped" (-not $b1.Contains('vault:'))
$b2 = Strip-SourceTokens ([string]([char]0x3010) + 'vault:Prime Claude.md' + [string]([char]0x3011) + ' in your notes.')
Assert-True "FIX2b bracketed token stripped" (-not $b2.Contains('vault:'))
$b3 = Strip-SourceTokens 'The result done is established.'
Assert-Eq "FIX2b clean reply unchanged" $b3 'The result done is established.'

# -- FIX 3
Assert-True "FIX3 balance-of-wallet is balance"  (Is-BalanceQuery 'what is the balance of my wallet now?')
Assert-True "FIX3 how much left is balance"      (Is-BalanceQuery 'how much do I have left?')
Assert-True "FIX3 spend-query NOT balance"       (-not (Is-BalanceQuery 'how much did I spend this month?'))
Assert-True "FIX3 add-expense NOT balance"       (-not (Is-BalanceQuery 'add 50 sar lunch'))

# -- FIX 4
$tripEgypt  = @{ origin = @{ city = 'Egypt';  source = 'stated' } }
$tripCairo  = @{ origin = @{ city = 'Cairo';  source = 'stated' } }
$tripKuwait = @{ origin = @{ city = 'Kuwait'; source = 'stated' } }
$tripEnv    = @{ origin = @{ city = 'Egypt';  source = 'env' } }
Assert-True "FIX4 Egypt is country origin"      (Is-CountryOrigin $tripEgypt)
Assert-True "FIX4 Cairo is a city (no country)" (-not (Is-CountryOrigin $tripCairo))
Assert-True "FIX4 Kuwait city-state resolves"   (-not (Is-CountryOrigin $tripKuwait))
Assert-Eq   "FIX4 stated country asks city" (Origin-CountryAsk $tripEgypt $false) 'Which city in Egypt are you flying from?'
Assert-True "FIX4 inferred country -> no ask"   ($null -eq (Origin-CountryAsk $tripEnv $false))

# -- FIX 4b (detector)
Assert-Eq   "FIX4b flying-from-Egypt -> Egypt"   (Detect-StatedCountryOrigin 'find me flights to Dubai next month, flying from Egypt') 'Egypt'
Assert-Eq   "FIX4b from-Saudi-Arabia"            (Detect-StatedCountryOrigin 'book a flight to Dubai, flying from Saudi Arabia') 'Saudi Arabia'
Assert-Eq   "FIX4b from-the-UAE -> UAE"          (Detect-StatedCountryOrigin 'flights from the UAE to London') 'UAE'
Assert-True "FIX4b from-Cairo (city) -> null"    ($null -eq (Detect-StatedCountryOrigin 'flights from Cairo to Dubai'))
Assert-True "FIX4b to-Egypt (dest) -> null"      ($null -eq (Detect-StatedCountryOrigin 'a trip to Egypt in August'))
Assert-True "FIX4b outside-egypt (no anchor)"    ($null -eq (Detect-StatedCountryOrigin 'recommend a trip outside egypt with this budget'))

# ===========================================================================
Write-Host ""
if ($script:fail -gt 0) {
  Write-Host "=== B-191 mirror: $($script:pass) PASS / $($script:fail) FAIL ===" -ForegroundColor Red
  $script:failLines | ForEach-Object { Write-Host $_ }
  exit 1
}
Write-Host "=== B-191 mirror: $($script:pass) PASS / 0 FAIL ===" -ForegroundColor Green
Write-Host "All mirror assertions passed."
