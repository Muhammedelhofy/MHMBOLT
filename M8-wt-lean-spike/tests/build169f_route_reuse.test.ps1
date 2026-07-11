# Build-169f — kill the double routing on delegated turns
# orchestrateStream runs the full front-door (arbiter + registry + optional
# B-166 semantic LLM tie-break), then a NON-streamable turn delegates to
# orchestrate(), which used to re-run the whole router (~2s tax, and a second
# m8_router_misses row, and a re-decision on money-STRIPPED history that could
# diverge from the front-door). Now the stream passes its route through.
# Static wiring checks (pure plumbing — no logic to mirror; Node ABSENT).

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

$root = Split-Path -Parent $PSScriptRoot
$or = Get-Content (Join-Path $root "lib\orchestrator.js") -Raw

# 1. orchestrate() accepts the precomputed route
Check "s1 orchestrate signature takes precomputedRoute" `
  ($or.Contains("async function orchestrate({ message, sessionId, history, attachments, precomputedRoute })"))

# 2. buffered path reuses it instead of re-running the router
Check "s2 route reused when provided" `
  ($or.Contains("const _route = precomputedRoute || await resolveDomainRoute(baseMessage, history);"))

# 3. the delegate forwards its already-computed route
Check "s3 delegate forwards _routeS" `
  ($or.Contains("precomputedRoute: _routeS"))

# 4. no duplicate m8_router_misses row on a delegated turn
Check "s4 duplicate logRoute suppressed" `
  ($or.Contains("if (!precomputedRoute) logRoute(baseMessage, _arb.domain, _arb.why, _arb.confidence)"))

# 5. exactly TWO resolveDomainRoute call sites remain (stream front-door +
#    buffered fallback) — a third would mean the double-run crept back
$calls = ([regex]::Matches($or, "await resolveDomainRoute\(")).Count
Check "s5 exactly 2 resolveDomainRoute call sites" ($calls -eq 2)

# 6. exactly ONE delegation site, and it carries the route
$deleg = ([regex]::Matches($or, [regex]::Escape("await orchestrate({"))).Count
Check "s6 exactly 1 delegation site" ($deleg -eq 1)

# 7. the stream still applies its own clarified/ask handling BEFORE delegating
Check "s7 stream ask-clarifier precedes delegation" `
  ($or.IndexOf('if (_arbS.domain === "ask")') -lt $or.IndexOf("precomputedRoute: _routeS"))

Write-Host ""
Write-Host ("RESULT: {0} passed, {1} failed" -f $pass, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
