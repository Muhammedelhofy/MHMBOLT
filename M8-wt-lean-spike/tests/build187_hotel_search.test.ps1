# Build-187 Travel lane hotels extension (live hotel search) -- PS 5.1 pure mirror (ASCII, no Node).
#
# Re-implements the PURE surface of lib/tools/hotelSearch.js (normalizeHotels) and the
# lib/travel.js hotels helpers (hotelsEnabled gate logic, planHotelSearch, renderHotelsBlock)
# and asserts the SAME deterministic outputs on this Node-less host -- so a PS-only fail vs
# a JS pass means a mirror bug, not a source bug. Mirrors build184_flight_search.test.ps1's
# shape exactly (the hotels analog of B-184's flights). The star separator is built via
# [char] so this file stays ASCII. Ends with the D8/privacy source greps on hotelSearch.js.

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

$STAR = [char]0x2605   # black star (rating marker)

# ---- ported pure helpers -----------------------------------------------------------
$CITY_COUNTRY = @{ riyadh='Saudi Arabia'; cairo='Egypt'; alexandria='Egypt'; hurghada='Egypt'; sharm='Egypt' }
function CityCountry([string]$c) {
  if (-not $c) { return $null }
  $k = $c.Trim().ToLower()
  if ($CITY_COUNTRY.ContainsKey($k)) { return $CITY_COUNTRY[$k] }
  $base = (($k -split '[,(/]')[0]).Trim()
  if ($CITY_COUNTRY.ContainsKey($base)) { return $CITY_COUNTRY[$base] }
  return $null
}
function ValidIso([string]$s) { if (-not $s) { return $false }; return [bool]($s -match '^\d{4}-\d{2}-\d{2}$') }

# normalizeHotels: SerpApi google_hotels payload (hashtable) -> canonical offers,
# cheapest-known-price first, unpriced entries sink to the end, cap.
function Normalize-Hotels($data, [string]$currency, [int]$max) {
  if (-not $currency) { $currency = 'SAR' }
  if ($max -le 0) { $max = 5 }
  if (-not $data) { return @{ offers = @(); source = 'serpapi' } }
  $props = @(); if ($data.ContainsKey('properties') -and $data.properties) { $props = @($data.properties) }
  $offers = @()
  foreach ($p in $props) {
    if (-not $p) { continue }
    if (-not $p.name) { continue }
    $price = $null
    if ($p.ContainsKey('rate_per_night') -and $p.rate_per_night -and $p.rate_per_night.ContainsKey('extracted_lowest')) {
      $v = $p.rate_per_night.extracted_lowest
      if (($v -is [int]) -or ($v -is [double])) { $price = $v }
    }
    $rating = $null
    if ($p.ContainsKey('overall_rating') -and (($p.overall_rating -is [int]) -or ($p.overall_rating -is [double]))) { $rating = $p.overall_rating }
    $reviews = $null
    if ($p.ContainsKey('reviews') -and (($p.reviews -is [int]) -or ($p.reviews -is [double]))) { $reviews = $p.reviews }
    $cls = $null
    if ($p.ContainsKey('hotel_class') -and $p.hotel_class) { $cls = $p.hotel_class }
    $offers += @{ name = $p.name; pricePerNight = $price; currency = $currency; rating = $rating; reviews = $reviews; hotelClass = $cls }
  }
  # stable sort: priced ascending first, then unpriced (index-stable within each group)
  $priced = @($offers | Where-Object { $null -ne $_.pricePerNight } | Sort-Object { $_.pricePerNight })
  $unpriced = @($offers | Where-Object { $null -eq $_.pricePerNight })
  $sorted = @($priced + $unpriced)
  if ($sorted.Count -gt $max) { $sorted = $sorted[0..($max - 1)] }
  return @{ offers = @($sorted); source = 'serpapi' }
}

# planHotelSearch: trip -> SerpApi params, or null (fall-through) when it can't run.
function Plan-Hotel-Search($trip) {
  if (-not $trip) { return $null }
  $needs = @($trip.needs); if ($needs.Count -eq 0) { $needs = @('flights') }
  if ($needs -notcontains 'hotels') { return $null }
  if (-not $trip.destCity) { return $null }
  $checkIn = if ($trip.depart -and (ValidIso $trip.depart)) { $trip.depart } else { $null }
  $checkOut = if ($trip.ret -and (ValidIso $trip.ret)) { $trip.ret } else { $null }
  if ((-not $checkIn) -or (-not $checkOut)) { return $null }
  $country = CityCountry $trip.destCity
  $q = if ($country) { "$($trip.destCity), $country" } else { $trip.destCity }
  $adults = if ($trip.adults -and $trip.adults -gt 0) { $trip.adults } else { 1 }
  $p = @{ q = $q; check_in_date = $checkIn; check_out_date = $checkOut; currency = 'SAR'; adults = $adults }
  if ($trip.children -and $trip.children -gt 0) { $p['children'] = $trip.children }
  return $p
}

# renderHotelsBlock: offers (array of hashtables) -> the LIVE HOTELS block, or "".
function Render-Hotels-Block($offers) {
  if ((-not $offers) -or (@($offers).Count -eq 0)) { return '' }
  $rows = @()
  foreach ($o in (@($offers) | Select-Object -First 5)) {
    if (-not $o) { continue }
    if (-not $o.name) { continue }
    $price = if ($null -ne $o.pricePerNight) { "$($o.currency) $($o.pricePerNight)/night" } else { 'price n/a' }
    $rating = if ($null -ne $o.rating) { " - $($o.rating)$STAR" + $(if ($null -ne $o.reviews) { " ($($o.reviews))" } else { '' }) } else { '' }
    $cls = if ($o.hotelClass) { " - $($o.hotelClass)" } else { '' }
    $rows += "- $($o.name)$cls$rating - $price"
  }
  if ($rows.Count -eq 0) { return '' }
  $hdr = 'LIVE HOTELS (real current listings from Google Hotels via SerpApi - present these EXACT names/prices, best-value first; do NOT invent or alter any figure):'
  return ($hdr + "`n" + ($rows -join "`n"))
}

Write-Host "Build-187 Travel lane hotels extension (hotel search) -- PS 5.1 pure mirror`n"

# ---- normalizeHotels ----------------------------------------------------------------
$canned = @{
  properties = @(
    @{ name = 'Steigenberger Pure Lifestyle'; rate_per_night = @{ lowest = 'SAR 560'; extracted_lowest = 560 }; overall_rating = 8.7; reviews = 3200; hotel_class = '5-star hotel' },
    @{ name = 'Sunrise Azalea Aqua Park Resort'; rate_per_night = @{ lowest = 'SAR 420'; extracted_lowest = 420 }; overall_rating = 9.2; reviews = 5100; hotel_class = '5-star hotel' },
    @{ name = 'No Price Listed Inn'; overall_rating = 7.1 }
  )
}
$norm = Normalize-Hotels $canned 'SAR' 5
Assert-Eq  "normalize source serpapi"        'serpapi' $norm.source
Assert-Eq  "normalize offer count 3"         3 $norm.offers.Count
Assert-Eq  "normalize cheapest first"        'Sunrise Azalea Aqua Park Resort' $norm.offers[0].name
Assert-Eq  "normalize second cheapest"       'Steigenberger Pure Lifestyle' $norm.offers[1].name
Assert-Eq  "normalize unpriced sinks to end" 'No Price Listed Inn' $norm.offers[2].name
Assert-Eq  "offer0 price 420"                420 $norm.offers[0].pricePerNight
Assert-Eq  "offer0 currency SAR"             'SAR' $norm.offers[0].currency
Assert-Eq  "offer0 rating 9.2"               9.2 $norm.offers[0].rating
Assert-Eq  "offer0 reviews 5100"             5100 $norm.offers[0].reviews
Assert-Eq  "offer0 class"                    '5-star hotel' $norm.offers[0].hotelClass
Assert-Eq  "normalize cap max=1"             1 (Normalize-Hotels $canned 'SAR' 1).offers.Count
Assert-Eq  "normalize null -> 0"             0 (Normalize-Hotels $null 'SAR' 5).offers.Count
$noname = @{ properties = @( @{ rate_per_night = @{ extracted_lowest = 100 } }, $canned.properties[0] ) }
Assert-Eq  "normalize skips no-name entry"   1 (Normalize-Hotels $noname 'SAR' 5).offers.Count

# ---- planHotelSearch -----------------------------------------------------------------
$p = Plan-Hotel-Search @{ destCity='Hurghada'; depart='2026-08-15'; ret='2026-08-20'; adults=2; children=1; needs=@('hotels') }
Assert-Eq  "plan q dest+country"        'Hurghada, Egypt' $p.q
Assert-Eq  "plan check_in_date"         '2026-08-15' $p.check_in_date
Assert-Eq  "plan check_out_date"        '2026-08-20' $p.check_out_date
Assert-Eq  "plan currency SAR"          'SAR' $p.currency
Assert-Eq  "plan adults 2"              2 $p.adults
Assert-Eq  "plan children 1"            1 $p.children
$p2 = Plan-Hotel-Search @{ destCity='Atlantis'; depart='2026-09-01'; ret='2026-09-05'; needs=@('hotels') }
Assert-Eq  "plan unresolvable country omits hint" 'Atlantis' $p2.q
Assert-Eq  "plan default adults 1"      1 $p2.adults
Assert-True "plan no-hotels-need -> null"        ($null -eq (Plan-Hotel-Search @{ destCity='Cairo'; depart='2026-09-01'; ret='2026-09-05'; needs=@('flights') }))
Assert-True "plan no-destination -> null"        ($null -eq (Plan-Hotel-Search @{ depart='2026-09-01'; ret='2026-09-05'; needs=@('hotels') }))
Assert-True "plan no check-out -> null"          ($null -eq (Plan-Hotel-Search @{ destCity='Cairo'; depart='2026-09-01'; needs=@('hotels') }))
Assert-True "plan no trip -> null"               ($null -eq (Plan-Hotel-Search $null))

# ---- renderHotelsBlock (exact-string mirror, star via [char]) ------------------------
$block = Render-Hotels-Block $norm.offers
$expLine0 = "- Sunrise Azalea Aqua Park Resort - 5-star hotel - 9.2$STAR (5100) - SAR 420/night"
Assert-True "render: header line present"     ($block -match '^LIVE HOTELS')
Assert-True "render: line 0 exact"            ($block -match [regex]::Escape($expLine0))
Assert-True "render: cheapest first (420 < 560)" ($block.IndexOf('420') -lt $block.IndexOf('560'))
Assert-Eq  "render: empty -> ''"              '' (Render-Hotels-Block @())
$naRow = Render-Hotels-Block @(@{ name = 'Bare Hotel' })
Assert-True "render: missing price tolerated" ($naRow -match 'price n/a')
Assert-Eq  "render: no-name row skipped -> ''" '' (Render-Hotels-Block @(@{ pricePerNight = 100 }))

# ---- D8 payment boundary + privacy: SOURCE greps on hotelSearch.js -------------------
$hsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\tools\hotelSearch.js'))
$hs = [IO.File]::ReadAllText($hsPath, [Text.Encoding]::UTF8)
Assert-True "D8: no booking/order/checkout endpoint in tool source" (-not ($hs -match 'hotel-orders|/orders\b|/booking\b|/payment\b|/reservation\b|/checkout\b'))
Assert-True "D8: no card-shaped field in tool source"               (-not ($hs -match 'card_number|cardnumber|\bcvv\b|\bcvc\b|card_holder'))
Assert-True "tool is read-only google_hotels SERP"                  ($hs -match 'google_hotels')
Assert-True "tool hits only serpapi search.json endpoint"           ($hs -match 'serpapi\.com/search\.json')
Assert-True "tool has a hard timeout (7s discipline)"               ($hs -match 'HOTEL_TIMEOUT_MS\s*=\s*7000' -and ($hs -match 'AbortController'))
Assert-True "privacy: no guest-name / email field in source"        (-not ($hs -match '\bguest_name\b|\bemail\b|\bfirst_name\b|\blast_name\b'))

# ---- travel.js hotels wiring/doctrine greps -------------------------------------------
$tvPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\travel.js'))
$tv = [IO.File]::ReadAllText($tvPath, [Text.Encoding]::UTF8)
Assert-True "travel.js exports hotelsEnabled/planHotelSearch/renderHotelsBlock" (($tv -match 'hotelsEnabled') -and ($tv -match 'planHotelSearch') -and ($tv -match 'renderHotelsBlock'))
Assert-True "travel.js hotelsEnabled gates on M8_TRAVEL_HOTELS + SERPAPI_KEY" (($tv -match 'M8_TRAVEL_HOTELS') -and ($tv -match 'SERPAPI_KEY'))
Assert-True "travel.js packet keeps the D8 boundary (unchanged)" (($tv -match 'NEVER book or pay') -and ($tv -match 'confirm and pay'))
Assert-True "travel.js directive tells the model to admit missing live prices" ($tv -match "don't have live prices")

# ---- orchestrator.js wiring greps -----------------------------------------------------
$orPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\orchestrator.js'))
$or = [IO.File]::ReadAllText($orPath, [Text.Encoding]::UTF8)
Assert-True "orchestrator.js calls searchHotels from tools/hotelSearch" ($or -match "require\(.\./tools/hotelSearch.\)")
Assert-True "orchestrator.js gates hotel call on planHotelSearch + hotelsEnabled" ($or -match 'planHotelSearch' -and $or -match 'hotelsEnabled')
Assert-True "orchestrator.js RULE_FLEET_NO_DATA is scoped to fleet-shaped questions" ($or -match 'This rule applies ONLY when Muhammed.s CURRENT question is actually asking about fleet')

Write-Host ("`n=== Build-187 hotel-search mirror: {0} PASS / {1} FAIL ===" -f $script:pass, $script:fail)
if ($script:fail -gt 0) {
  Write-Host "`nFAILURES:" -ForegroundColor Yellow
  $script:failLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  exit 1
}
Write-Host "All Build-187 hotel-search mirror assertions passed." -ForegroundColor Green
