# Barbary sync — REAL WRITE (this DOES overwrite the "Barbary Fleet" tab).
#
# Runs /api/bolt/sync-barbary (no dry flag): pulls the full Barbary roster and
# rewrites the Barbary Fleet tab. Safe to run any time — it's a full overwrite,
# and it refuses to write if the pull comes back empty/partial.
#
# HOW TO RUN:
#   powershell -ExecutionPolicy Bypass -File tests\barbary_write.ps1
#   - "Dashboard base URL"  -> https://mhmbolt.vercel.app
#   - "BARBARY_SYNC_KEY"    -> the value you set in Vercel (input hidden)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = (Read-Host "Dashboard base URL (e.g. https://mhmbolt.vercel.app)").Trim().TrimEnd("/")
$secure = Read-Host "BARBARY_SYNC_KEY (the value you set in Vercel; input hidden)" -AsSecureString
$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $base -or -not $secret) { Write-Host "Both values required." -ForegroundColor Red; exit 1 }

$uri = "$base/api/bolt/sync-barbary"
Write-Host "Calling (REAL WRITE): $uri" -ForegroundColor Yellow
try {
  $resp = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Authorization = "Bearer $secret" }
  $resp | ConvertTo-Json -Depth 6
  if ($resp.ok -and -not $resp.dryRun) {
    Write-Host ("`nDONE: wrote {0} drivers to the Barbary Fleet tab. Go check the sheet." -f $resp.drivers) -ForegroundColor Green
  }
}
catch {
  Write-Host "WRITE FAILED:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}
