# MHM fleet -> Barbary's sheet ("MHM Fleet" tab) — verify / write.
#
# Pushes OUR fleet roster into Barbary's Google Sheet. DRY mode fetches + reports
# without writing; WRITE mode does the real overwrite.
#
# HOW TO RUN (one line — it prompts for everything):
#   powershell -ExecutionPolicy Bypass -File tests\mhm_to_barbary.ps1
#   - "Dashboard base URL" -> https://mhmbolt.vercel.app
#   - "Mode"               -> type DRY (safe) or WRITE
#   - "BARBARY_SYNC_KEY"   -> the value you set in Vercel (input hidden)
#
# Copy the whole output back to me.

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = (Read-Host "Dashboard base URL (e.g. https://mhmbolt.vercel.app)").Trim().TrimEnd("/")
$mode = (Read-Host "Mode - type DRY (safe, no write) or WRITE").Trim().ToUpper()
$secure = Read-Host "BARBARY_SYNC_KEY (the value you set in Vercel; input hidden)" -AsSecureString
$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $base -or -not $secret) { Write-Host "Base URL and key are required." -ForegroundColor Red; exit 1 }

$uri = "$base/api/bolt/sync-mhm-to-barbary"
if ($mode -ne "WRITE") { $uri = "$uri`?dry=1"; Write-Host "DRY RUN (no write): $uri" -ForegroundColor Cyan }
else { Write-Host "REAL WRITE to Barbary's MHM Fleet tab: $uri" -ForegroundColor Yellow }

try {
  $resp = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Authorization = "Bearer $secret" }
  $resp | ConvertTo-Json -Depth 6
  if ($resp.ok -and -not $resp.dryRun) {
    Write-Host ("`nDONE: wrote {0} drivers to Barbary's MHM Fleet tab." -f $resp.drivers) -ForegroundColor Green
  }
}
catch {
  Write-Host "FAILED:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}
