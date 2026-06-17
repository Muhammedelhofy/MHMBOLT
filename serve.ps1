$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"

# -- Bolt API proxy state --
$script:boltToken = $null
$script:boltTokenExpiry = [DateTime]::MinValue

function Get-BoltConfig {
    $p = Join-Path $root 'bolt-config.json'
    if (Test-Path $p) { return Get-Content $p -Raw | ConvertFrom-Json }
    return $null
}

function Get-BoltToken {
    if ($script:boltToken -and [DateTime]::UtcNow -lt $script:boltTokenExpiry) {
        return $script:boltToken
    }
    $cfg = Get-BoltConfig
    if (-not $cfg) { return $null }
    try {
        $body = "client_id=$([Uri]::EscapeDataString($cfg.client_id))&client_secret=$([Uri]::EscapeDataString($cfg.client_secret))&grant_type=client_credentials&scope=fleet-integration:api"
        $resp = Invoke-WebRequest -Uri 'https://oidc.bolt.eu/token' -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded' -UseBasicParsing
        $data = $resp.Content | ConvertFrom-Json
        $script:boltToken = $data.access_token
        $script:boltTokenExpiry = [DateTime]::UtcNow.AddSeconds([int]$data.expires_in - 30)
        Write-Host "Bolt token refreshed, expires $($script:boltTokenExpiry.ToString('HH:mm:ss')) UTC"
        return $script:boltToken
    } catch {
        Write-Host "Bolt token error: $_"
        return $null
    }
}

function Invoke-BoltAPI {
    param([string]$Method, [string]$Path, $Body = $null)
    $token = Get-BoltToken
    if (-not $token) { throw 'Could not obtain Bolt token - check bolt-config.json' }
    $uri = "https://node.bolt.eu/fleet-integration-gateway$Path"
    $headers = @{ Authorization = "Bearer $token" }
    if ($Method -eq 'GET') {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers -UseBasicParsing
    } else {
        $json = $Body | ConvertTo-Json -Compress -Depth 5
        $resp = Invoke-WebRequest -Uri $uri -Method POST -Headers $headers -Body $json -ContentType 'application/json' -UseBasicParsing
    }
    return $resp.Content | ConvertFrom-Json
}

function Send-JsonResponse {
    param($res, $obj, [int]$status = 200)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 10 -Compress))
    $res.StatusCode = $status
    $res.ContentType = 'application/json; charset=utf-8'
    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
}

function Handle-BoltRoute {
    param($req, $res, [string]$apiPath)

    # /api/bolt/status - tells dashboard if credentials are configured
    if ($apiPath -eq '/api/bolt/status') {
        $cfg = Get-BoltConfig
        Send-JsonResponse $res @{ configured = ($null -ne $cfg) }
        return
    }

    # /api/bolt/sync - fetch + aggregate one day of orders
    if ($apiPath -eq '/api/bolt/sync') {
        try {
            $reader   = New-Object System.IO.StreamReader($req.InputStream)
            $bodyText = $reader.ReadToEnd()
            $reqData  = $bodyText | ConvertFrom-Json
            $dateStr  = $reqData.date

            $d       = [DateTime]::ParseExact($dateStr, 'yyyy-MM-dd', $null)
            $startTs = [long][System.DateTimeOffset]::new($d.Year, $d.Month, $d.Day, 0, 0, 0, [TimeSpan]::Zero).ToUnixTimeSeconds()
            $endTs   = $startTs + 86400

            Write-Host "Bolt sync: $dateStr  ts=$startTs to $endTs"

            # Get company IDs
            $compResp = Invoke-BoltAPI -Method GET -Path '/fleetIntegration/v1/getCompanies'
            if (-not $compResp -or -not $compResp.data) { throw 'getCompanies returned no data' }
            $companyIds = @($compResp.data.company_ids)
            Write-Host "Companies: $($companyIds -join ', ')"

            # Paginate through all orders for the day
            $allOrders = [System.Collections.Generic.List[object]]::new()
            foreach ($cid in $companyIds) {
                $offset = 0
                $limit  = 500
                $total  = 999999
                while ($allOrders.Count -lt $total) {
                    $reqBody = @{ offset = $offset; limit = $limit; company_ids = @($cid); start_ts = $startTs; end_ts = $endTs }
                    $resp = Invoke-BoltAPI -Method POST -Path '/fleetIntegration/v1/getFleetOrders' -Body $reqBody
                    if (-not $resp -or -not $resp.data) { break }
                    $total = [int]$resp.data.total_orders
                    $page  = $resp.data.orders
                    if (-not $page -or $page.Count -eq 0) { break }
                    foreach ($o in $page) { $allOrders.Add($o) }
                    $offset += $page.Count
                    Write-Host "  fetched $($allOrders.Count) / $total orders (company $cid)"
                    if ($page.Count -lt $limit) { break }
                }
            }

            # Aggregate per driver
            $driverMap = @{}
            foreach ($order in $allOrders) {
                $uuid = "$($order.driver_uuid)"
                if (-not $driverMap.ContainsKey($uuid)) {
                    $driverMap[$uuid] = @{
                        name=''; driverId=''; phone=''
                        hoursOnline=0; orders=0
                        netEarnings=0.0; grossEarnings=0.0; tips=0.0
                        commission=0.0; bookingFees=0.0; cashEarnings=0.0
                        distanceTotal=0.0; distanceAvg=0.0
                        acceptance=0; acceptanceTotal=0; rating=0; score=0
                        utilization=0; finishRate=0; finishRateAll=0
                        netPerHour=0; grossPerHour=0; campaign=0
                        collectedCash=0; projectedPayout=0; actualPayout=0
                        payoutGap=0; cashGap=0; activeCategories=''
                        isActive=$false; _cnt=0
                    }
                }
                $dr = $driverMap[$uuid]
                if ($order.driver_name)  { $dr.name  = "$($order.driver_name)"  }
                if ($order.driver_phone) { $dr.phone = "$($order.driver_phone)" }
                $dr.driverId = $uuid

                $p = $order.order_price
                if ($p) {
                    $dr.netEarnings   += [double]($p.net_earnings)
                    $dr.grossEarnings += [double]($p.ride_price)
                    $dr.tips          += [double]($p.tip)
                    $dr.commission    += [double]($p.commission)
                    $dr.bookingFees   += [double]($p.booking_fee)
                    if ("$($order.payment_method)" -eq 'cash') {
                        $dr.cashEarnings += [double]($p.ride_price)
                    }
                }
                $dr.distanceTotal += [double]($order.ride_distance)
                $dr.orders++
                $dr._cnt++
            }

            # Finalize and round
            $drivers = @()
            foreach ($dr in $driverMap.Values) {
                if ($dr._cnt -gt 0) { $dr.distanceAvg = [Math]::Round($dr.distanceTotal / $dr._cnt, 2) }
                $dr.netEarnings   = [Math]::Round($dr.netEarnings,   2)
                $dr.grossEarnings = [Math]::Round($dr.grossEarnings, 2)
                $dr.tips          = [Math]::Round($dr.tips,          2)
                $dr.commission    = [Math]::Round($dr.commission,    2)
                $dr.bookingFees   = [Math]::Round($dr.bookingFees,   2)
                $dr.cashEarnings  = [Math]::Round($dr.cashEarnings,  2)
                $dr.distanceTotal = [Math]::Round($dr.distanceTotal, 2)
                $dr.isActive      = ($dr.orders -gt 0 -or $dr.grossEarnings -gt 0)
                $dr.Remove('_cnt')
                $drivers += $dr
            }

            Write-Host "Bolt sync done: $($allOrders.Count) orders, $($drivers.Count) drivers"
            Send-JsonResponse $res @{
                ok          = $true
                date        = $dateStr
                totalOrders = $allOrders.Count
                driverCount = $drivers.Count
                drivers     = $drivers
            }
        } catch {
            Write-Host "Bolt sync error: $_"
            Send-JsonResponse $res @{ ok = $false; error = "$_" } -status 500
        }
        return
    }

    Send-JsonResponse $res @{ error = 'Unknown API path' } -status 404
}

# -- Main request loop --
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $urlPath = $req.Url.LocalPath

    # CORS preflight
    if ($req.HttpMethod -eq 'OPTIONS') {
        $res.Headers.Add('Access-Control-Allow-Origin', '*')
        $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
        $res.StatusCode = 204
        $res.OutputStream.Close()
        continue
    }

    # Bolt API proxy
    if ($urlPath.StartsWith('/api/bolt/')) {
        Handle-BoltRoute $req $res $urlPath
        continue
    }

    # Static file serving
    $urlPath = $urlPath.TrimStart('/')
    if ($urlPath -eq '') { $urlPath = 'index.html' }
    $filePath = Join-Path $root $urlPath

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $mime = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css'  { 'text/css' }
            '.js'   { 'application/javascript' }
            '.png'  { 'image/png' }
            '.jpg'  { 'image/jpeg' }
            '.svg'  { 'image/svg+xml' }
            default { 'application/octet-stream' }
        }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $res.ContentType = $mime
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $urlPath")
        $res.ContentLength64 = $msg.Length
        $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
}
