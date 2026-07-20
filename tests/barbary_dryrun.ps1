# Barbary sync — POST-DEPLOY VERIFICATION (dry run: fetches + reports, writes NOTHING).
#
# Run this AFTER the branch is deployed, to confirm the live endpoint pulls the full
# Barbary roster before we let it write the sheet. It calls /api/bolt/sync-barbary?dry=1
# which returns the driver count + a 3-row sample and does NOT touch the sheet.
#
# HOW TO RUN (one line — it prompts for the two values):
#   powershell -ExecutionPolicy Bypass -File tests\barbary_dryrun.ps1
#
#   - "Dashboard base URL"  -> your deployed dashboard, e.g. https://your-dash.vercel.app
#   - "CRON_SECRET"         -> the value you set in Vercel (input hidden)
#
# Copy the whole output back to me.

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = (Read-Host "Dashboard base URL (e.g. https://your-dash.vercel.app)").Trim().TrimEnd("/")
$secure = Read-Host "CRON_SECRET (input hidden)" -AsSecureString
$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $base -or -not $secret) { Write-Host "Both values required." -ForegroundColor Red; exit 1 }

$uri = "$base/api/bolt/sync-barbary?dry=1"
Write-Host "Calling (dry run, no write): $uri" -ForegroundColor Cyan
try {
  $resp = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Authorization = "Bearer $secret" }
  $resp | ConvertTo-Json -Depth 6
}
catch {
  Write-Host "DRY RUN FAILED:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}
