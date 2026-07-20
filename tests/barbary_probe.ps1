# Barbary fleet roster — DISCOVERY PROBE (pure PowerShell, no Node needed).
#
# Purpose: pull the real Barbary driver roster from Bolt's API and print exactly
# which fields Bolt returns (so we can see if IQAMA / EMAIL exist, and the PHONE
# format) BEFORE writing any sheet-sync code. Read-only. Writes nothing anywhere.
#
# HOW TO RUN (just one line — it will PROMPT you to paste the two values):
#   powershell -ExecutionPolicy Bypass -File tests\barbary_probe.ps1
#
# Paste the Client ID at the first prompt, the Secret at the second (hidden).
# No quotes, no env vars. Then copy the whole output back to me.

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# --- Credentials: prompt directly, so no PowerShell quoting can break them ---
Write-Host "Enter the Barbary API credentials (nothing is saved to disk):" -ForegroundColor Cyan
$cid = (Read-Host "  Barbary CLIENT ID").Trim()
$secure = Read-Host "  Barbary CLIENT SECRET (input hidden)" -AsSecureString
$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$sec    = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $cid -or -not $sec) {
  Write-Host "ERROR: both Client ID and Secret are required." -ForegroundColor Red
  exit 1
}
# Confirm both were captured (lengths only — never prints the secret value)
Write-Host ("CLIENT_ID length: {0}  |  CLIENT_SECRET length: {1}" -f $cid.Length, $sec.Length) -ForegroundColor Yellow

# Unix epoch seconds (UTC), robust on PowerShell 5.1
$now   = [int64](New-TimeSpan -Start (Get-Date "1970-01-01T00:00:00Z").ToUniversalTime() -End (Get-Date).ToUniversalTime()).TotalSeconds
$start = $now - (30 * 86400)

try {
  # 1) OAuth token (client_credentials)
  $tok = Invoke-RestMethod -Method Post -Uri "https://oidc.bolt.eu/token" `
    -ContentType "application/x-www-form-urlencoded" `
    -Body @{ client_id = $cid; client_secret = $sec; grant_type = "client_credentials"; scope = "fleet-integration:api" }
  $hdr = @{ Authorization = "Bearer $($tok.access_token)" }
  Write-Host "Token OK." -ForegroundColor Green

  # 2) Companies on this account
  $comp = Invoke-RestMethod -Method Get -Headers $hdr `
    -Uri "https://node.bolt.eu/fleet-integration-gateway/fleetIntegration/v1/getCompanies"
  $companyIds = @($comp.data.company_ids)
  Write-Host ("Companies: " + ($companyIds -join ", "))

  # 3) Drivers per company (first page = up to 1000, plenty for discovery)
  $all = @()
  foreach ($c in $companyIds) {
    $body = @{ company_id = $c; start_ts = $start; end_ts = $now; offset = 0; limit = 1000 } | ConvertTo-Json
    $resp = Invoke-RestMethod -Method Post -Headers $hdr -ContentType "application/json" -Body $body `
      -Uri "https://node.bolt.eu/fleet-integration-gateway/fleetIntegration/v1/getDrivers"
    if ($resp.data.drivers) { $all += @($resp.data.drivers) }
  }
  Write-Host ("Drivers pulled: " + $all.Count) -ForegroundColor Cyan
  if ($all.Count -eq 0) { Write-Host "No drivers returned."; exit 0 }

  # 4) Show the exact field names + one sample so we can map sheet columns
  $sample = $all[0]
  Write-Host "`n=== FIELD NAMES Bolt returns per driver ==="
  $sample.PSObject.Properties.Name | Sort-Object | ForEach-Object { Write-Host " - $_" }

  Write-Host "`n=== SAMPLE DRIVER (first roster row, values shown) ==="
  $sample | ConvertTo-Json -Depth 6
}
catch {
  Write-Host "PROBE FAILED:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}
