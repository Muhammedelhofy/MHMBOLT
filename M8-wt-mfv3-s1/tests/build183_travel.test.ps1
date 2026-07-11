# Build-183 Travel lane -- PS 5.1 pure-composer mirror (ASCII, no Node).
#
# Per the PS-mirror rule, this re-implements lib/travel.js's PURE composers (city->IATA,
# origin resolution + confirm, the D4 booking-link templates, clarify-once, the D5 search
# plan) and asserts the SAME deterministic outputs on this Node-less host -- so a PS-only
# fail vs a JS pass means a mirror bug, not a source bug. Arabic paths are covered by the
# JS test (build183_travel.test.js); this file stays ASCII. Ends with the D8 doctrine grep.

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

# ---- ported pure helpers (mirror of lib/travel.js) -------------------------------
$CITY_IATA = @{
  riyadh='RUH'; jeddah='JED'; jedda='JED'; dammam='DMM'; khobar='DMM'; medina='MED'; madinah='MED';
  cairo='CAI'; alexandria='HBE'; sharm='SSH'; hurghada='HRG'; luxor='LXR'; aswan='ASW';
  dubai='DXB'; doha='DOH'; kuwait='KWI'; manama='BAH'; bahrain='BAH'; muscat='MCT'; amman='AMM';
  beirut='BEY'; istanbul='IST'; london='LHR'; paris='CDG'; madrid='MAD'; rome='FCO';
}
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
function Yymmdd([string]$iso)  { return $iso.Substring(2,2) + $iso.Substring(5,2) + $iso.Substring(8,2) }
function EncURI([string]$s)    { return [uri]::EscapeDataString($s) }

# Origin resolution (D3): stated/confirmed trusted; else profile>env, tagged.
function Resolve-Origin($originCity, $originSrc, $homeCity, $profileCity) {
  if ($originCity -and ($originSrc -eq 'stated' -or $originSrc -eq 'confirmed')) {
    return @{ city = $originCity; source = $originSrc; iata = (CityToIata $originCity) }
  }
  if ($profileCity) { return @{ city = $profileCity; source = 'profile'; iata = (CityToIata $profileCity) } }
  $hc = if ($homeCity) { $homeCity } else { 'Riyadh' }
  return @{ city = $hc; source = 'env'; iata = (CityToIata $hc) }
}
function Origin-Inferred($src) { return ($src -eq 'profile' -or $src -eq 'env') }
function Origin-Confirm-Clause($city, $src) {
  if (-not (Origin-Inferred $src)) { return '' }
  return "Assuming you're flying from $city (tell me if not) -"
}

# D4 booking links (mirror of buildBookingLinks) -- $trip is a hashtable.
function Build-Booking-Links($trip) {
  $links = @()
  $dest = $trip.destCity
  if (-not $dest) { return @() }
  $origin = $trip.originCity
  $depIso = if ($trip.depart -and (ValidIso $trip.depart)) { $trip.depart } else { $null }
  $retIso = if ($trip.ret -and (ValidIso $trip.ret)) { $trip.ret } else { $null }
  $oIata = if ($trip.originIata -and (ValidIata $trip.originIata)) { $trip.originIata } else { CityToIata $origin }
  $dIata = if ($trip.destIata -and (ValidIata $trip.destIata)) { $trip.destIata } else { CityToIata $dest }
  $adults = $trip.adults; $children = $trip.children
  $needs = @($trip.needs)
  $general = ($needs.Count -eq 0)
  $wantFlights = ($needs -contains 'flights') -or $general
  $wantHotels  = ($needs -contains 'hotels') -or $general -or ($needs -contains 'itinerary')
  $wantFood    = ($needs -contains 'food') -or ($needs -contains 'restaurants') -or ($needs -contains 'attractions') -or ($needs -contains 'itinerary') -or $general

  if ($wantFlights -and $origin) {
    $parts = "Flights from $origin to $dest"
    if ($depIso) { $parts += " on $depIso" }
    if ($retIso) { $parts += " returning $retIso" }
    $links += @{ label = 'Google Flights'; url = ("https://www.google.com/travel/flights?q=" + (EncURI $parts)) }
  }
  if ($wantFlights -and $oIata -and $dIata -and $depIso) {
    $seg = if ($retIso) { (Yymmdd $depIso) + "/" + (Yymmdd $retIso) } else { (Yymmdd $depIso) }
    $url = "https://www.skyscanner.net/transport/flights/" + $oIata.ToLower() + "/" + $dIata.ToLower() + "/" + $seg + "/"
    $qp = @(); if ($adults) { $qp += "adults=$adults" }; if ($children) { $qp += "children=$children" }
    if ($qp.Count) { $url += "?" + ($qp -join "&") }
    $links += @{ label = 'Skyscanner'; url = $url }
  }
  if ($wantHotels) {
    $url = "https://www.booking.com/searchresults.html?ss=" + (EncURI $dest)
    if ($depIso) { $url += "&checkin=$depIso" }
    if ($retIso) { $url += "&checkout=$retIso" }
    if ($adults) { $url += "&group_adults=$adults" }
    if ($children) { $url += "&group_children=$children" }
    $links += @{ label = 'Booking.com'; url = $url }
  }
  if ($wantFood) {
    $links += @{ label = 'Google Maps (restaurants)'; url = ("https://www.google.com/maps/search/" + (EncURI "restaurants in $dest")) }
    if (($needs -contains 'attractions') -or ($needs -contains 'itinerary') -or $general) {
      $links += @{ label = 'Google Maps (things to do)'; url = ("https://www.google.com/maps/search/" + (EncURI "things to do in $dest")) }
    }
  }
  return $links
}

# Clarify-once (flights + no dates -> origin confirm + ONE question).
function Travel-Clarify($trip) {
  if (-not $trip.destCity) { return $null }
  $needs = @($trip.needs); if ($needs.Count -eq 0) { $needs = @('flights') }
  $primary = $needs[0]
  $hasDates = ($trip.depart -and (ValidIso $trip.depart)) -or $trip.flex
  if ($primary -eq 'flights' -and -not $hasDates) {
    $clause = Origin-Confirm-Clause $trip.originCity $trip.originSrc
    if ($clause) { return "$clause what dates are you thinking?" }
    return "Sure - what dates are you thinking?"
  }
  return $null
}

# City -> country, to disambiguate search text (mirror of travel.js CITY_COUNTRY).
$CITY_COUNTRY = @{ riyadh='Saudi Arabia'; jeddah='Saudi Arabia'; dammam='Saudi Arabia';
  cairo='Egypt'; alexandria='Egypt'; sharm='Egypt'; dubai='UAE'; doha='Qatar'; london='UK'; paris='France' }
function CityCountry([string]$c) {
  if (-not $c) { return $null }
  $k = $c.Trim().ToLower()
  if ($CITY_COUNTRY.ContainsKey($k)) { return $CITY_COUNTRY[$k] }
  $base = (($k -split '[,(/]')[0]).Trim()
  if ($CITY_COUNTRY.ContainsKey($base)) { return $CITY_COUNTRY[$base] }
  return $null
}
# D5 search plan (cap; live needs get a code-composed query; knowledge needs don't).
function Travel-Search-Plan($trip, [int]$cap) {
  if ($cap -le 0) { $cap = 2 }
  $needs = @($trip.needs); if ($needs.Count -eq 0) { $needs = @('flights') }
  $dest = $trip.destCity; $origin = $trip.originCity
  $ctry = CityCountry $dest
  $destQ = if ($dest -and $ctry) { "$dest, $ctry" } else { $dest }
  $q = @()
  foreach ($n in $needs) {
    if ($q.Count -ge $cap) { break }
    if ($n -eq 'flights' -and $dest -and $origin) { $q += "flights from $origin to $destQ" }
    elseif ($n -eq 'hotels' -and $dest) { $q += "hotels in $destQ" }
    elseif (($n -eq 'food' -or $n -eq 'restaurants') -and $dest) { $q += "restaurants in $destQ" }
  }
  return @($q | Select-Object -First $cap)
}

Write-Host "Build-183 Travel lane -- PS 5.1 pure-composer mirror`n"

# ---- CITY / SHAPE -----------------------------------------------------------------
Assert-Eq "cityToIata Riyadh"       'RUH' (CityToIata 'Riyadh')
Assert-Eq "cityToIata Alexandria"   'HBE' (CityToIata 'Alexandria')
Assert-Eq "cityToIata 'Cairo, Egypt' strips country" 'CAI' (CityToIata 'Cairo, Egypt')
Assert-True "cityToIata unknown -> null"  ($null -eq (CityToIata 'Atlantis'))
Assert-True "validIata RUH / not ruh"     ((ValidIata 'RUH') -and -not (ValidIata 'ruh') -and -not (ValidIata 'RU'))
Assert-True "validIso 2026-08-14 / not Aug" ((ValidIso '2026-08-14') -and -not (ValidIso 'Aug 14'))
Assert-Eq "yymmdd 2026-08-14"       '260814' (Yymmdd '2026-08-14')

# ---- D3 ORIGIN --------------------------------------------------------------------
$o1 = Resolve-Origin 'Jeddah' 'stated' 'Riyadh' $null
Assert-True "resolveOrigin trusts a stated origin"     (($o1.city -eq 'Jeddah') -and ($o1.source -eq 'stated'))
Assert-Eq  "stated origin -> no confirm clause"        '' (Origin-Confirm-Clause $o1.city $o1.source)
$o2 = Resolve-Origin $null $null 'Riyadh' $null
Assert-True "resolveOrigin env fallback = Riyadh/env"  (($o2.city -eq 'Riyadh') -and ($o2.source -eq 'env') -and ($o2.iata -eq 'RUH'))
Assert-Eq  "inferred origin -> composed confirm clause" "Assuming you're flying from Riyadh (tell me if not) -" (Origin-Confirm-Clause $o2.city $o2.source)
$o3 = Resolve-Origin $null $null 'Riyadh' 'Dammam'
Assert-True "resolveOrigin prefers a profile city"     (($o3.city -eq 'Dammam') -and ($o3.source -eq 'profile') -and ($o3.iata -eq 'DMM'))

# ---- D4 LINKS (canary trip Riyadh -> Alexandria) ---------------------------------
$trip = @{ originCity='Riyadh'; originIata='RUH'; destCity='Alexandria'; destIata='HBE';
           depart='2026-08-14'; ret='2026-08-21'; adults=2; children=2; needs=@('flights','hotels') }
$links = Build-Booking-Links $trip
$byLabel = @{}; foreach ($l in $links) { $byLabel[$l.label] = $l.url }
Assert-Eq  "Google Flights URL exact" "https://www.google.com/travel/flights?q=Flights%20from%20Riyadh%20to%20Alexandria%20on%202026-08-14%20returning%202026-08-21" $byLabel['Google Flights']
Assert-Eq  "Skyscanner URL exact"     "https://www.skyscanner.net/transport/flights/ruh/hbe/260814/260821/?adults=2&children=2" $byLabel['Skyscanner']
Assert-Eq  "Booking.com URL exact"    "https://www.booking.com/searchresults.html?ss=Alexandria&checkin=2026-08-14&checkout=2026-08-21&group_adults=2&group_children=2" $byLabel['Booking.com']
Assert-True "flights+hotels needs -> no Maps link"  (-not $byLabel.ContainsKey('Google Maps (restaurants)'))

# no destination -> zero links
Assert-True "no destination -> zero links" ((Build-Booking-Links @{ originCity='Riyadh'; destCity=$null }).Count -eq 0)
# no depart date -> Skyscanner omitted, Google Flights kept
$nd = Build-Booking-Links @{ originCity='Riyadh'; originIata='RUH'; destCity='Cairo'; destIata='CAI'; needs=@('flights') }
$ndL = @($nd | ForEach-Object { $_.label })
Assert-True "no depart -> Skyscanner omitted, Google Flights kept" (($ndL -notcontains 'Skyscanner') -and ($ndL -contains 'Google Flights'))
# hotels-only -> Booking, no Google Flights
$ho = Build-Booking-Links @{ originCity='Riyadh'; destCity='Cairo'; needs=@('hotels') }
$hoL = @($ho | ForEach-Object { $_.label })
Assert-True "hotels-only -> Booking present, no Google Flights" (($hoL -contains 'Booking.com') -and ($hoL -notcontains 'Google Flights'))

# ---- D8: every composed URL is a read-only search/browse surface -----------------
$SAFE = '^https://(www\.google\.com/travel/flights\?|www\.skyscanner\.net/transport/flights/|www\.booking\.com/searchresults\.html\?|www\.google\.com/maps/search/)'
$allUrls = @()
$allUrls += ($links  | ForEach-Object { $_.url })
$allUrls += ($nd     | ForEach-Object { $_.url })
$allUrls += ($ho     | ForEach-Object { $_.url })
$allUrls += ((Build-Booking-Links @{ originCity='Riyadh'; destCity='Cairo'; needs=@('itinerary','attractions') }) | ForEach-Object { $_.url })
$allSafe = $true; foreach ($u in $allUrls) { if ($u -notmatch $SAFE) { $allSafe = $false } }
Assert-True "D8: all composed URLs are read-only search/browse surfaces" (($allUrls.Count -gt 0) -and $allSafe)

# ---- CLARIFY-ONCE ----------------------------------------------------------------
$clar = Travel-Clarify @{ destCity='Alexandria'; originCity='Riyadh'; originSrc='env'; depart=$null; needs=@('flights') }
Assert-Eq  "clarify: origin confirm + ONE date question" "Assuming you're flying from Riyadh (tell me if not) - what dates are you thinking?" $clar
Assert-True "clarify asks exactly one question"          ((([regex]::Matches($clar,'\?')).Count) -eq 1)
Assert-True "clarify: dates present -> null"             ($null -eq (Travel-Clarify @{ destCity='Alexandria'; originCity='Riyadh'; originSrc='env'; depart='2026-08-14'; needs=@('flights') }))
Assert-True "clarify: hotels need + no dates -> null"    ($null -eq (Travel-Clarify @{ destCity='Alexandria'; originCity='Riyadh'; originSrc='env'; depart=$null; needs=@('hotels') }))
Assert-True "clarify: stated origin -> no re-confirm"    ((Travel-Clarify @{ destCity='Alexandria'; originCity='Jeddah'; originSrc='stated'; depart=$null; needs=@('flights') }) -notmatch 'Assuming')

# ---- D5 SEARCH PLAN --------------------------------------------------------------
$plan = Travel-Search-Plan @{ destCity='Alexandria'; originCity='Riyadh'; needs=@('flights','hotels','food') } 2
Assert-True "search plan respects the cap (2)"          ($plan.Count -eq 2)
Assert-True "flights query composed with origin+dest"   ($plan[0] -match 'flights from Riyadh to Alexandria')
Assert-True "search query disambiguates dest w/ country" ($plan[0] -match 'Alexandria, Egypt')
Assert-Eq  "cityCountry Alexandria -> Egypt"            'Egypt' (CityCountry 'Alexandria')
$kn = Travel-Search-Plan @{ destCity='Alexandria'; originCity='Riyadh'; needs=@('itinerary','attractions') } 2
Assert-True "itinerary/attractions -> no search queries" ($kn.Count -eq 0)

# ---- source doctrine grep (D8 structural) ----------------------------------------
$tvPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\travel.js'))
$tv = [IO.File]::ReadAllText($tvPath, [Text.Encoding]::UTF8)
Assert-True "travel.js: payment boundary in the directive"  (($tv -match 'NEVER book or pay') -and ($tv -match 'confirm and pay'))
Assert-True "travel.js: D8 grep -- no booking-create/payment endpoint" (-not ($tv -match 'flight-orders|/orders\b|/payment\b|/reservation\b|/checkout\b|card_number|cvv'))

Write-Host ("`n=== Build-183 travel mirror: {0} PASS / {1} FAIL ===" -f $script:pass, $script:fail)
if ($script:fail -gt 0) {
  Write-Host "`nFAILURES:" -ForegroundColor Yellow
  $script:failLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  exit 1
}
Write-Host "All Build-183 travel mirror assertions passed." -ForegroundColor Green
