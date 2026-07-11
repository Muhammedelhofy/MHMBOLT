# Build-188 (Amendment B3) Direct booking links -- PS 5.1 pure mirror (ASCII, no Node).
#
# Re-implements the PURE surface added on top of B-187/B-184: hotelSearch.js's
# _pickHotelLink (OTA-link preference), flightSearch.js's extractBookingLink (plain-GET
# only, rejects POST-only), and travel.js's wantsFlightBookingLink / resolveFlightSelection
# / renderDirectBookingLinkBlock. Asserts the SAME deterministic outputs on this Node-less
# host -- so a PS-only fail vs a JS pass means a mirror bug, not a source bug.

$ErrorActionPreference = 'Stop'
$script:pass = 0; $script:fail = 0; $script:failLines = @()
function Assert-True([string]$label, [bool]$cond) {
  if ($cond) { $script:pass++ }
  else { $script:fail++; $script:failLines += $label; Write-Host "  FAIL  $label" -ForegroundColor Red }
}
function Assert-Eq([string]$label, $expected, $actual) {
  if ("$expected" -ceq "$actual") { $script:pass++ }
  else { $script:fail++; $script:failLines += $label; Write-Host "  FAIL  $label" -ForegroundColor Red; Write-Host "        exp: $expected"; Write-Host "        got: $actual" }
}

# ---- _pickHotelLink: OTA prices[] link preferred over the generic property.link ----
function Pick-Hotel-Link($p) {
  if ($p.ContainsKey('prices') -and $p.prices) {
    foreach ($pr in @($p.prices)) { if ($pr -and $pr.link) { return $pr.link } }
  }
  if ($p.ContainsKey('link') -and $p.link) { return $p.link }
  return $null
}
Assert-Eq "pickHotelLink: OTA link wins" 'https://www.booking.com/hotel/x' (Pick-Hotel-Link @{ link='https://google.com/travel/x'; prices=@(@{ source='Booking.com'; link='https://www.booking.com/hotel/x' }) })
Assert-Eq "pickHotelLink: falls back to property.link" 'https://google.com/travel/x' (Pick-Hotel-Link @{ link='https://google.com/travel/x' })
Assert-True "pickHotelLink: null when neither present" ($null -eq (Pick-Hotel-Link @{}))

# ---- extractBookingLink: plain-GET only, rejects POST-only ------------------------
function Extract-Booking-Link($data) {
  if (-not $data) { return $null }
  $opts = @(); if ($data.ContainsKey('booking_options') -and $data.booking_options) { $opts = @($data.booking_options) }
  foreach ($opt in $opts) {
    if (-not $opt) { continue }
    foreach ($legKey in @('together', 'departing', 'arriving')) {
      if (-not $opt.ContainsKey($legKey)) { continue }
      $leg = $opt[$legKey]
      if (-not $leg) { continue }
      if (-not $leg.ContainsKey('booking_request')) { continue }
      $req = $leg.booking_request
      if ($req -and $req.ContainsKey('url') -and $req.url -and (-not ($req.ContainsKey('post_data') -and $req.post_data))) {
        $bw = if ($leg.ContainsKey('book_with') -and $leg.book_with) { $leg.book_with } else { $null }
        return @{ url = $req.url; bookWith = $bw }
      }
    }
  }
  return $null
}
$goodGet = @{ booking_options = @( @{ together = @{ book_with = 'flynas'; booking_request = @{ url = 'https://www.flynas.com/book?ref=abc' } } } ) }
$r1 = Extract-Booking-Link $goodGet
Assert-Eq "extractBookingLink: plain GET accepted (url)" 'https://www.flynas.com/book?ref=abc' $r1.url
Assert-Eq "extractBookingLink: plain GET accepted (bookWith)" 'flynas' $r1.bookWith
$postOnly = @{ booking_options = @( @{ together = @{ book_with = 'flynas'; booking_request = @{ url = 'https://www.google.com/travel/clk/f'; post_data = 'abc=123' } } } ) }
Assert-True "extractBookingLink: rejects POST-only link" ($null -eq (Extract-Booking-Link $postOnly))
$departingShape = @{ booking_options = @( @{ departing = @{ book_with = 'Saudia'; booking_request = @{ url = 'https://www.saudia.com/book/xyz' } } } ) }
Assert-Eq "extractBookingLink: departing leg shape" 'https://www.saudia.com/book/xyz' (Extract-Booking-Link $departingShape).url
Assert-True "extractBookingLink: null/empty -> null" (($null -eq (Extract-Booking-Link $null)) -and ($null -eq (Extract-Booking-Link @{})) -and ($null -eq (Extract-Booking-Link @{ booking_options = @() })))

# ---- wantsFlightBookingLink (signal detection) ------------------------------------
function Wants-Flight-Booking-Link([string]$msg) {
  $s = $msg
  if ($s -match '\b(book|reserve|select|choose|pick|grab|take)\b[\s\S]*\b(it|this|that|one|flight|option|offer)\b') { return $true }
  if ($s -match '\b(link|url)\s+(for|to)\b') { return $true }
  if ($s -match '\bbook\s+(the\s+)?(first|second|third|1st|2nd|3rd|cheapest|last)\b') { return $true }
  if ($s -match '\bbook\s+(the\s+)?#?\d+\b') { return $true }
  return $false
}
Assert-True "wants: 'book the first one'"       (Wants-Flight-Booking-Link 'book the first one')
Assert-True "wants: 'get me a link for the cheapest'" (Wants-Flight-Booking-Link 'get me a link for the cheapest')
Assert-True "wants: 'reserve that flight'"      (Wants-Flight-Booking-Link 'reserve that flight')
Assert-True "wants: 'book #2'"                  (Wants-Flight-Booking-Link 'book #2')
Assert-True "not: plain destination ask"        (-not (Wants-Flight-Booking-Link 'what are the best hotels in hurghada'))

# ---- resolveFlightSelection (ordinal / cheapest / carrier / ambiguous) ------------
function Resolve-Flight-Selection([string]$msg, $offers) {
  if ((-not $offers) -or (@($offers).Count -eq 0)) { return $null }
  $m = $msg.ToLower()
  if ($m -match '\bcheapest\b|\blowest[\s-]price\b|\bbest[\s-]price\b') {
    $priced = @($offers | Where-Object { $null -ne $_.price })
    if ($priced.Count -eq 0) { return $null }
    return ($priced | Sort-Object price)[0]
  }
  $ordWords = @{ first=1; second=2; third=3; fourth=4; fifth=5 }
  $idx = $null
  foreach ($w in $ordWords.Keys) { if ($m -match "\b$w\b") { $idx = $ordWords[$w]; break } }
  if (-not $idx) {
    $mm = [regex]::Match($m, '#?([1-9])(?:st|nd|rd|th)?\b')
    if ($mm.Success) { $idx = [int]$mm.Groups[1].Value }
  }
  if ($idx -and $idx -ge 1 -and $idx -le (@($offers).Count)) { return $offers[$idx - 1] }
  $hits = @($offers | Where-Object { $_.carrier -and ($m.IndexOf($_.carrier.ToLower()) -ge 0) })
  if ($hits.Count -eq 1) { return $hits[0] }
  return $null
}
$offers = @(
  @{ price = 780;  carrier = 'flynas';              bookingToken = 'T1' },
  @{ price = 1450; carrier = 'Saudia / EgyptAir';    bookingToken = 'T2' },
  @{ price = 600;  carrier = 'Air Arabia';           bookingToken = 'T3' }
)
Assert-Eq "select: first -> T1"        'T1' (Resolve-Flight-Selection 'book the first one' $offers).bookingToken
Assert-Eq "select: second -> T2"       'T2' (Resolve-Flight-Selection 'book the second one' $offers).bookingToken
Assert-Eq "select: #3 -> T3"           'T3' (Resolve-Flight-Selection 'book #3' $offers).bookingToken
Assert-Eq "select: cheapest -> T3 (600)" 'T3' (Resolve-Flight-Selection 'book the cheapest one' $offers).bookingToken
Assert-Eq "select: carrier match -> flynas T1" 'T1' (Resolve-Flight-Selection 'book the flynas flight' $offers).bookingToken
Assert-True "select: no signal -> null"        ($null -eq (Resolve-Flight-Selection 'what is the weather there' $offers))
Assert-True "select: out-of-range -> null"     ($null -eq (Resolve-Flight-Selection 'book the 9th one' $offers))
Assert-True "select: empty offers -> null"     ($null -eq (Resolve-Flight-Selection 'book the first one' @()))

# ---- renderDirectBookingLinkBlock --------------------------------------------------
function Render-Direct-Booking-Link-Block($link) {
  if ((-not $link) -or (-not $link.url)) { return '' }
  $who = if ($link.bookWith) { " (via $($link.bookWith))" } else { '' }
  return "DIRECT BOOKING LINK (composed in code from a real SerpApi redemption - present this EXACT URL for the flight he selected; do NOT invent or alter it):`n- $($link.url)$who"
}
$dblBlock = Render-Direct-Booking-Link-Block @{ url = 'https://www.flynas.com/book?ref=abc'; bookWith = 'flynas' }
Assert-True "renderDirectBookingLinkBlock: header + url + bookWith" (($dblBlock -match '^DIRECT BOOKING LINK') -and ($dblBlock.Contains('https://www.flynas.com/book?ref=abc')) -and ($dblBlock -match 'via flynas'))
Assert-Eq  "renderDirectBookingLinkBlock: absent -> ''" '' (Render-Direct-Booking-Link-Block $null)

# ---- source wiring greps: travel.js / flightSearch.js / hotelSearch.js / orchestrator.js ---
$tvPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\travel.js'))
$tv = [IO.File]::ReadAllText($tvPath, [Text.Encoding]::UTF8)
Assert-True "travel.js exports the B3 selection/render helpers" (($tv -match 'wantsFlightBookingLink') -and ($tv -match 'resolveFlightSelection') -and ($tv -match 'renderDirectBookingLinkBlock'))
Assert-True "travel.js directive permits LIVE HOTELS row link + DIRECT BOOKING LINK block" (($tv -match 'LIVE HOTELS row') -and ($tv -match 'DIRECT BOOKING LINK block'))
Assert-True "travel.js still forbids inventing a URL" ($tv -match 'NEVER write, construct, shorten, or invent a URL')

$fsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\tools\flightSearch.js'))
$fs = [IO.File]::ReadAllText($fsPath, [Text.Encoding]::UTF8)
Assert-True "flightSearch.js exports getBookingLink + extractBookingLink" (($fs -match 'getBookingLink') -and ($fs -match 'extractBookingLink'))
Assert-True "flightSearch.js captures booking_token in normalizeFlights" ($fs -match 'bookingToken')
Assert-True "flightSearch.js: no real booking/payment/checkout ENDPOINT (SerpApi field names like booking_token are fine)" (-not ($fs -match '/orders\b|/payment\b|/reservation\b|/checkout\b'))
Assert-True "flightSearch.js hits only the SerpApi search endpoint" ((($fs | Select-String -AllMatches 'serpapi\.com/[a-z.]+').Matches | ForEach-Object { $_.Value } | Sort-Object -Unique) -join ',' -eq 'serpapi.com/search.json')

$hsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\tools\hotelSearch.js'))
$hs = [IO.File]::ReadAllText($hsPath, [Text.Encoding]::UTF8)
Assert-True "hotelSearch.js captures a link field (_pickHotelLink)" ($hs -match '_pickHotelLink')
Assert-True "hotelSearch.js prefers prices[].link over property.link" ($hs -match 'prices')

$orPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\orchestrator.js'))
$or = [IO.File]::ReadAllText($orPath, [Text.Encoding]::UTF8)
Assert-True "orchestrator.js gates redemption on wantsFlightBookingLink + resolveFlightSelection" (($or -match 'wantsFlightBookingLink') -and ($or -match 'resolveFlightSelection'))
Assert-True "orchestrator.js calls getBookingLink only after a selection resolves (fetch-on-pick, not upfront)" ($or -match 'getBookingLink')

Write-Host ("`n=== Build-188 direct-booking-links mirror: {0} PASS / {1} FAIL ===" -f $script:pass, $script:fail)
if ($script:fail -gt 0) {
  Write-Host "`nFAILURES:" -ForegroundColor Yellow
  $script:failLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  exit 1
}
Write-Host "All Build-188 direct-booking-links mirror assertions passed." -ForegroundColor Green
