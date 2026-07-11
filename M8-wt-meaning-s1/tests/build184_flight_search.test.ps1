# Build-184 Travel PHASE B (live flight search) -- PS 5.1 pure mirror (ASCII, no Node).
#
# Re-implements the PURE surface of lib/tools/flightSearch.js (toISO, normalizeFlights)
# and the lib/travel.js Phase-B helpers (flightsEnabled gate logic, planFlightSearch,
# _durLabel, renderFlightsBlock) and asserts the SAME deterministic outputs on this
# Node-less host -- so a PS-only fail vs a JS pass means a mirror bug, not a source bug.
# The two Unicode separators the block uses (em-dash, right-arrow) are built via [char]
# so this file stays ASCII. Ends with the D8/privacy source greps on flightSearch.js.

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

$DASH  = [char]0x2014   # em dash
$ARROW = [char]0x2192   # right arrow

# ---- ported pure helpers -----------------------------------------------------------
$CITY_IATA = @{ riyadh='RUH'; jeddah='JED'; dammam='DMM'; cairo='CAI'; alexandria='HBE'; dubai='DXB' }
function CityToIata([string]$c) {
  if (-not $c) { return $null }
  $k = $c.Trim().ToLower()
  if ($CITY_IATA.ContainsKey($k)) { return $CITY_IATA[$k] }
  $base = (($k -split '[,(/]')[0]).Trim()
  if ($CITY_IATA.ContainsKey($base)) { return $CITY_IATA[$base] }
  return $null
}
function ValidIata([string]$s) { if (-not $s) { return $false }; return [bool]($s -cmatch '^[A-Z]{3}$') }
function ValidIso([string]$s)  { if (-not $s) { return $false }; return [bool]($s -match '^\d{4}-\d{2}-\d{2}$') }

# toISO: "YYYY-MM-DD HH:MM" | "...THH:MM" -> naive ISO; else null.
function To-ISO($t) {
  if (-not $t) { return $null }
  $s = [string]$t
  if ($s -match '^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})') { return ($matches[1] + 'T' + $matches[2]) }
  return $null
}

# _durLabel: minutes -> "3h15m" | "2h" | "45m" | ""
function Dur-Label($min) {
  if (-not (($min -is [int]) -or ($min -is [double])) -or ($min -le 0)) { return '' }
  $h = [int][Math]::Floor($min / 60); $m = [int]($min % 60)
  if (($h -gt 0) -and ($m -gt 0)) { return ("{0}h{1:D2}m" -f $h, $m) }
  if ($h -gt 0) { return ("{0}h" -f $h) }
  return ("{0}m" -f $m)
}

# normalizeFlights: SerpApi payload (hashtable) -> canonical offers. best before other, cap.
function Normalize-Flights($data, [string]$currency, [int]$max) {
  if (-not $currency) { $currency = 'SAR' }
  if ($max -le 0) { $max = 5 }
  if (-not $data) { return @{ offers = @(); source = 'serpapi' } }
  $best = @(); if ($data.ContainsKey('best_flights') -and $data.best_flights) { $best = @($data.best_flights) }
  $other = @(); if ($data.ContainsKey('other_flights') -and $data.other_flights) { $other = @($data.other_flights) }
  $itin = @($best + $other)
  $offers = @()
  foreach ($it in $itin) {
    if ($offers.Count -ge $max) { break }
    if (-not $it) { continue }
    $legs = @(); if ($it.ContainsKey('flights') -and $it.flights) { $legs = @($it.flights) }
    if ($legs.Count -eq 0) { continue }
    $first = $legs[0]; $last = $legs[$legs.Count - 1]
    $carriers = @()
    foreach ($l in $legs) { if ($l.airline -and ($carriers -notcontains $l.airline)) { $carriers += $l.airline } }
    $price = $null
    if ($it.ContainsKey('price') -and (($it.price -is [int]) -or ($it.price -is [double]))) { $price = $it.price }
    $departISO = To-ISO $first.departure_airport.time
    $arriveISO = To-ISO $last.arrival_airport.time
    $dur = $null
    if ($it.ContainsKey('total_duration') -and (($it.total_duration -is [int]) -or ($it.total_duration -is [double]))) { $dur = $it.total_duration }
    $stops = [Math]::Max(0, $legs.Count - 1)
    $carrier = if ($carriers.Count) { ($carriers -join ' / ') } else { $null }
    $fn = if ($first.flight_number) { $first.flight_number } else { $null }
    $offers += @{ price = $price; currency = $currency; carrier = $carrier; flightNumber = $fn; departISO = $departISO; arriveISO = $arriveISO; durationMin = $dur; stops = $stops }
  }
  return @{ offers = @($offers); source = 'serpapi' }
}

# planFlightSearch: trip -> SerpApi params, or null (fall-through) when it can't run.
function Plan-Flight-Search($trip) {
  if (-not $trip) { return $null }
  $needs = @($trip.needs); if ($needs.Count -eq 0) { $needs = @('flights') }
  if ($needs -notcontains 'flights') { return $null }
  $oIata = if ($trip.originIata -and (ValidIata $trip.originIata)) { $trip.originIata } else { CityToIata $trip.originCity }
  $dIata = if ($trip.destIata -and (ValidIata $trip.destIata)) { $trip.destIata } else { CityToIata $trip.destCity }
  $depart = if ($trip.depart -and (ValidIso $trip.depart)) { $trip.depart } else { $null }
  if ((-not $oIata) -or (-not $dIata) -or (-not $depart)) { return $null }
  $ret = if ($trip.ret -and (ValidIso $trip.ret)) { $trip.ret } else { $null }
  $adults = if ($trip.adults -and $trip.adults -gt 0) { $trip.adults } else { 1 }
  $children = if ($trip.children -and $trip.children -gt 0) { $trip.children } else { 0 }
  $p = @{ departure_id = $oIata; arrival_id = $dIata; outbound_date = $depart; currency = 'SAR'; adults = $adults; children = $children }
  if ($ret) { $p['return_date'] = $ret }
  return $p
}

# canonicalizeTripIata: a KNOWN city gets its curated (correct) airport code.
function Canonicalize-Trip-Iata($trip) {
  if (-not $trip) { return $trip }
  if ($trip.originCity) { $c = CityToIata $trip.originCity; if ($c) { $trip.originIata = $c } }
  if ($trip.destCity)   { $c = CityToIata $trip.destCity;   if ($c) { $trip.destIata   = $c } }
  return $trip
}

# renderFlightsBlock: offers (array of hashtables) -> the LIVE FLIGHTS block, or "".
function Render-Flights-Block($offers) {
  if ((-not $offers) -or (@($offers).Count -eq 0)) { return '' }
  $sepDash  = " $DASH "
  $sepArrow = " $ARROW "
  $rows = @()
  foreach ($o in (@($offers) | Select-Object -First 5)) {
    if (-not $o) { continue }
    $price = if ($null -ne $o.price) { "$($o.currency) $($o.price)" } else { 'price n/a' }
    $carrier = if ($o.carrier) { $o.carrier } else { 'airline n/a' }
    $fn = if ($o.flightNumber) { " $($o.flightNumber)" } else { '' }
    $dep = if ($o.departISO) { $o.departISO -replace 'T', ' ' } else { '?' }
    $arr = if ($o.arriveISO) { $o.arriveISO -replace 'T', ' ' } else { '?' }
    $dur = Dur-Label $o.durationMin
    $stops = ''
    if ($null -ne $o.stops) { if ($o.stops -eq 0) { $stops = 'nonstop' } else { $stops = "$($o.stops) stop" + $(if ($o.stops -gt 1) { 's' } else { '' }) } }
    $tailParts = @(); if ($dur) { $tailParts += "($dur)" }; if ($stops) { $tailParts += $stops }
    $tail = ($tailParts -join ' ')
    $line = "- $carrier$fn$sepDash$price$sepDash" + "depart $dep$sepArrow" + "arrive $arr"
    if ($tail) { $line += "$sepDash$tail" }
    $rows += $line
  }
  if ($rows.Count -eq 0) { return '' }
  $hdr = 'LIVE FLIGHTS (real current offers from Google Flights via SerpApi - present these EXACT prices/times/airlines, cheapest first; do NOT invent or alter any figure):'
  return ($hdr + "`n" + ($rows -join "`n"))
}

Write-Host "Build-184 Travel PHASE B (flight search) -- PS 5.1 pure mirror`n"

# ---- toISO -------------------------------------------------------------------------
Assert-Eq  "toISO space form"  '2026-08-14T02:00' (To-ISO '2026-08-14 02:00')
Assert-Eq  "toISO T form"      '2026-08-14T09:30' (To-ISO '2026-08-14T09:30')
Assert-True "toISO garbage -> null" ($null -eq (To-ISO 'Aug 14'))

# ---- _durLabel ---------------------------------------------------------------------
Assert-Eq  "durLabel 195 -> 3h15m" '3h15m' (Dur-Label 195)
Assert-Eq  "durLabel 300 -> 5h"    '5h'    (Dur-Label 300)
Assert-Eq  "durLabel 45 -> 45m"    '45m'   (Dur-Label 45)
Assert-Eq  "durLabel 0 -> ''"      ''      (Dur-Label 0)

# ---- normalizeFlights (canned SerpApi payload) -------------------------------------
$canned = @{
  best_flights = @(
    @{ flights = @( @{ departure_airport = @{ id='RUH'; time='2026-08-14 02:00' }; arrival_airport = @{ id='HBE'; time='2026-08-14 04:15' }; airline='flynas'; flight_number='XY 123' } ); total_duration = 195; price = 780 }
  )
  other_flights = @(
    @{ flights = @(
        @{ departure_airport = @{ id='RUH'; time='2026-08-14 09:00' }; arrival_airport = @{ id='CAI'; time='2026-08-14 11:00' }; airline='Saudia'; flight_number='SV 375' },
        @{ departure_airport = @{ id='CAI'; time='2026-08-14 13:00' }; arrival_airport = @{ id='HBE'; time='2026-08-14 14:00' }; airline='EgyptAir'; flight_number='MS 99' }
      ); total_duration = 300; price = 1450 }
  )
}
$norm = Normalize-Flights $canned 'SAR' 5
Assert-Eq  "normalize source serpapi" 'serpapi' $norm.source
Assert-Eq  "normalize offer count 2"  2 $norm.offers.Count
$o0 = $norm.offers[0]; $o1 = $norm.offers[1]
Assert-Eq  "offer0 price 780"          780 $o0.price
Assert-Eq  "offer0 currency SAR"       'SAR' $o0.currency
Assert-Eq  "offer0 carrier flynas"     'flynas' $o0.carrier
Assert-Eq  "offer0 flightNumber"       'XY 123' $o0.flightNumber
Assert-Eq  "offer0 departISO"          '2026-08-14T02:00' $o0.departISO
Assert-Eq  "offer0 arriveISO"          '2026-08-14T04:15' $o0.arriveISO
Assert-Eq  "offer0 durationMin 195"    195 $o0.durationMin
Assert-Eq  "offer0 stops 0 (nonstop)"  0 $o0.stops
Assert-Eq  "offer1 carriers joined"    'Saudia / EgyptAir' $o1.carrier
Assert-Eq  "offer1 stops 1 (legs-1)"   1 $o1.stops
Assert-Eq  "offer1 arrive = LAST leg"  '2026-08-14T14:00' $o1.arriveISO
Assert-Eq  "normalize cap max=1"       1 (Normalize-Flights $canned 'SAR' 1).offers.Count
Assert-Eq  "normalize null -> 0"       0 (Normalize-Flights $null 'SAR' 5).offers.Count
$noleg = @{ best_flights = @( @{ flights = @() }, $canned.best_flights[0] ) }
Assert-Eq  "normalize skips no-leg itinerary" 1 (Normalize-Flights $noleg 'SAR' 5).offers.Count

# ---- planFlightSearch --------------------------------------------------------------
$p = Plan-Flight-Search @{ originCity='Riyadh'; originIata='RUH'; destCity='Alexandria'; destIata='HBE'; depart='2026-08-14'; ret='2026-08-21'; adults=2; children=2; needs=@('flights') }
Assert-Eq  "plan departure_id RUH"  'RUH' $p.departure_id
Assert-Eq  "plan arrival_id HBE"    'HBE' $p.arrival_id
Assert-Eq  "plan outbound_date"     '2026-08-14' $p.outbound_date
Assert-Eq  "plan return_date"       '2026-08-21' $p.return_date
Assert-Eq  "plan currency SAR"      'SAR' $p.currency
Assert-Eq  "plan adults 2"          2 $p.adults
$p2 = Plan-Flight-Search @{ originCity='Riyadh'; destCity='Cairo'; depart='2026-09-01'; needs=@('flights') }
Assert-Eq  "plan resolves IATA from city (RUH)" 'RUH' $p2.departure_id
Assert-Eq  "plan resolves IATA from city (CAI)" 'CAI' $p2.arrival_id
Assert-Eq  "plan default adults 1"  1 $p2.adults
Assert-True "plan flex-only -> null"       ($null -eq (Plan-Flight-Search @{ originCity='Riyadh'; destCity='Cairo'; flex='mid-August'; needs=@('flights') }))
Assert-True "plan no-flights-need -> null"  ($null -eq (Plan-Flight-Search @{ originCity='Riyadh'; destCity='Cairo'; depart='2026-09-01'; needs=@('hotels') }))
Assert-True "plan unresolvable dest -> null" ($null -eq (Plan-Flight-Search @{ originCity='Riyadh'; destCity='Atlantis'; depart='2026-09-01'; needs=@('flights') }))

# ---- canonicalizeTripIata (ALY -> HBE lesson) --------------------------------------
$ct = @{ originCity='Riyadh'; originIata='OLD'; destCity='Alexandria'; destIata='ALY'; depart='2026-08-15'; needs=@('flights') }
Canonicalize-Trip-Iata $ct | Out-Null
Assert-Eq  "canonicalize Alexandria ALY -> HBE" 'HBE' $ct.destIata
Assert-Eq  "canonicalize Riyadh OLD -> RUH"     'RUH' $ct.originIata
$cu = @{ originCity='Riyadh'; destCity='Nowhereville'; destIata='NWH'; needs=@('flights') }
Canonicalize-Trip-Iata $cu | Out-Null
Assert-Eq  "canonicalize unknown city keeps code" 'NWH' $cu.destIata
Assert-Eq  "plan after canonicalize -> HBE"       'HBE' (Plan-Flight-Search $ct).arrival_id

# ---- renderFlightsBlock (exact-string mirror, Unicode separators via [char]) --------
$block = Render-Flights-Block $norm.offers
$expLine0 = "- flynas XY 123 $DASH SAR 780 $DASH depart 2026-08-14 02:00 $ARROW arrive 2026-08-14 04:15 $DASH (3h15m) nonstop"
$expLine1 = "- Saudia / EgyptAir SV 375 $DASH SAR 1450 $DASH depart 2026-08-14 09:00 $ARROW arrive 2026-08-14 14:00 $DASH (5h) 1 stop"
Assert-True "render: header line present"    ($block -match '^LIVE FLIGHTS')
Assert-True "render: line 0 exact"           ($block -match [regex]::Escape($expLine0))
Assert-True "render: line 1 exact"           ($block -match [regex]::Escape($expLine1))
Assert-True "render: cheapest first (780 < 1450)" ($block.IndexOf('780') -lt $block.IndexOf('1450'))
Assert-Eq  "render: empty -> ''"             '' (Render-Flights-Block @())
$naRow = Render-Flights-Block @(@{ stops = 0 })
Assert-True "render: missing price/carrier tolerated" (($naRow -match 'price n/a') -and ($naRow -match 'airline n/a'))

# ---- D8 payment boundary + privacy: SOURCE greps on flightSearch.js ----------------
$fsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\tools\flightSearch.js'))
$fs = [IO.File]::ReadAllText($fsPath, [Text.Encoding]::UTF8)
Assert-True "D8: no booking/order/checkout endpoint in tool source" (-not ($fs -match 'flight-orders|/orders\b|/booking\b|/payment\b|/reservation\b|/checkout\b'))
Assert-True "D8: no card-shaped field in tool source"               (-not ($fs -match 'card_number|cardnumber|\bcvv\b|\bcvc\b|card_holder'))
Assert-True "tool is read-only google_flights SERP"                 ($fs -match 'google_flights')
Assert-True "tool hits only serpapi search.json endpoint"           ($fs -match 'serpapi\.com/search\.json')
Assert-True "tool has a hard timeout (7s discipline)"               ($fs -match 'FLIGHT_TIMEOUT_MS\s*=\s*7000' -and ($fs -match 'AbortController'))
Assert-True "privacy: no passenger-name / email field in source"    (-not ($fs -match '\bpassenger_name\b|\bemail\b|\bfirst_name\b|\blast_name\b'))

# ---- travel.js Phase-B wiring/doctrine greps ---------------------------------------
$tvPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\travel.js'))
$tv = [IO.File]::ReadAllText($tvPath, [Text.Encoding]::UTF8)
Assert-True "travel.js exports flightsEnabled/planFlightSearch/renderFlightsBlock" (($tv -match 'flightsEnabled') -and ($tv -match 'planFlightSearch') -and ($tv -match 'renderFlightsBlock'))
Assert-True "travel.js flightsEnabled gates on M8_TRAVEL_FLIGHTS + SERPAPI_KEY" (($tv -match 'M8_TRAVEL_FLIGHTS') -and ($tv -match 'SERPAPI_KEY'))
Assert-True "travel.js packet keeps the D8 boundary (unchanged)" (($tv -match 'NEVER book or pay') -and ($tv -match 'confirm and pay'))

Write-Host ("`n=== Build-184 flight-search mirror: {0} PASS / {1} FAIL ===" -f $script:pass, $script:fail)
if ($script:fail -gt 0) {
  Write-Host "`nFAILURES:" -ForegroundColor Yellow
  $script:failLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  exit 1
}
Write-Host "All Build-184 flight-search mirror assertions passed." -ForegroundColor Green
