# consolidate-fns-ab-verify.ps1 - PS 5.1 ASCII mirror of consolidate-fns-ab-verify.js
# Static structural checks for Hobby 12-fn consolidation pass 2 (merges A + B).
#   A: api/chat-stream.js  -> api/chat.js router  (?fn=stream)
#   B: api/tasks.js + api/transcribe.js -> api/util.js router (?fn=tasks|transcribe)
# PS cannot execute the JS router dispatch (no require.cache) so the dispatch-by-
# case is checked statically; the .js test proves the live dispatch. ASCII only.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot   # tests/ -> repo root
$pass = 0; $fail = 0
function Ok($m)  { $script:pass++; Write-Host "  PASS $m" }
function Bad($m) { $script:fail++; Write-Host "  FAIL $m" }
function Check($cond, $m) { if ($cond) { Ok $m } else { Bad $m } }

Write-Host "== api function count =="
$api = Get-ChildItem (Join-Path $root "api") -Filter *.js | ForEach-Object { $_.Name }
Check ($api.Count -eq 10) ("api/*.js count = 10 (got " + $api.Count + ")")
Check ($api -contains "chat.js") "chat.js present"
Check ($api -contains "util.js") "util.js present"

Write-Host "== deleted standalones =="
foreach ($f in @("api\chat-stream.js","api\tasks.js","api\transcribe.js")) {
  Check (-not (Test-Path (Join-Path $root $f))) "$f is deleted"
}

Write-Host "== relocated handlers =="
foreach ($f in @("lib\handlers\chat-buffered.js","lib\handlers\chat-stream.js","lib\handlers\tasks.js","lib\handlers\transcribe.js")) {
  $p = Join-Path $root $f
  Check (Test-Path $p) "$f exists"
  if (Test-Path $p) {
    $src = Get-Content $p -Raw
    Check (-not ($src -match 'require\("\.\./lib/')) "$f has no stale ../lib/ require"
  }
}

Write-Host "== router dispatch cases (static) =="
$chat = Get-Content (Join-Path $root "api\chat.js") -Raw
Check ($chat -match 'case "stream":')   "chat router dispatches fn=stream"
Check ($chat -match 'case "buffered":') "chat router dispatches fn=buffered"
Check ($chat -match 'chatBuffered')      "chat router default -> chatBuffered"
$util = Get-Content (Join-Path $root "api\util.js") -Raw
Check ($util -match 'case "tasks":')      "util router dispatches fn=tasks"
Check ($util -match 'case "transcribe":') "util router dispatches fn=transcribe"
Check ($util -match 'sizeLimit: "12mb"')  "util router sets bodyParser 12mb"

Write-Host "== vercel.json =="
$vj = Get-Content (Join-Path $root "vercel.json") -Raw | ConvertFrom-Json
$rw = @()
foreach ($r in $vj.rewrites) { $rw += ($r.source + " => " + $r.destination) }
Check ($rw -contains "/api/chat-stream => /api/chat?fn=stream") "rewrite chat-stream -> chat?fn=stream"
Check ($rw -contains "/api/tasks => /api/util?fn=tasks")        "rewrite tasks -> util?fn=tasks"
Check ($rw -contains "/api/transcribe => /api/util?fn=transcribe") "rewrite transcribe -> util?fn=transcribe"
Check ($vj.rewrites[$vj.rewrites.Count - 1].source -eq "/api/(.*)") "catch-all rewrite is last"

$fnKeys = $vj.functions.PSObject.Properties.Name
Check (-not ($fnKeys -contains "api/chat-stream.js")) "functions block no longer lists chat-stream.js"
foreach ($k in $fnKeys) {
  Check (Test-Path (Join-Path $root $k)) ("functions[" + $k + "] file exists")
}

$cronPaths = @($vj.crons | ForEach-Object { $_.path }) | Sort-Object
$wantCron  = @("/api/cron-explore","/api/cron-summarize","/api/cron-verify","/api/morning-brief","/api/push-cron") | Sort-Object
Check ($vj.crons.Count -eq 5) ("crons length = 5 (got " + $vj.crons.Count + ")")
Check (($cronPaths -join ",") -eq ($wantCron -join ",")) "cron paths unchanged (hands-off zone)"

Write-Host ""
Write-Host ("== RESULT: " + $pass + " passed / " + $fail + " failed ==")
if ($fail -ne 0) { exit 1 } else { exit 0 }
