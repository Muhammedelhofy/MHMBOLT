# Build-177 — Groq migration: groqQuirks() mirror + source wiring checks.
# PS 5.1 mirror of lib/llm.js groqQuirks (Node ABSENT in the offline battery).
# The JS test (build177_groq_migration_test.js) is the authoritative contract; a
# PS-only fail with a JS pass = a MIRROR bug, not a source bug -> fix the mirror.
# Pure ASCII, no Unicode.
#
# TWO layers:
#   (A) LOGIC  -- groqQuirks ported to PS, asserted per model family + kill-switch.
#   (B) WIRING -- asserts the SOURCE lands: default swapped to openai/gpt-oss-120b,
#                 payloadHook wired into generateGroq + generateCerebras, kill-switch
#                 present, and the privacy wall holds (no groq/compound* in the file).

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else     { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red }
}

# ---------------------------------------------------------------------------
# (A) groqQuirks mirror -- returns a hashtable of the resulting payload.
#     $env overrides read live, same as the source.
# ---------------------------------------------------------------------------
function Groq-Quirks([string]$model, [hashtable]$payload) {
  if ("$($env:M8_GROQ_QUIRKS)" -eq "0") { return $payload }  # kill-switch: identity
  $m = ("" + $model).ToLower()
  $floorRaw = "$($env:M8_GROQ_MIN_MAXTOKENS)"
  $floor = 1024
  if ($floorRaw -match '^\d+$') { $floor = [int]$floorRaw }
  $curMax = 0; if ($payload.ContainsKey('max_tokens') -and $payload['max_tokens']) { $curMax = [int]$payload['max_tokens'] }
  if ($m -match 'gpt-oss') {
    $p = $payload.Clone()
    $p['include_reasoning'] = $false
    $effort = "$($env:M8_GROQ_REASONING_EFFORT)"; if (-not $effort) { $effort = "low" }
    $p['reasoning_effort'] = $effort
    $p['max_tokens'] = [Math]::Max($curMax, $floor)
    return $p
  }
  if ($m -match 'qwen') {
    $p = $payload.Clone()
    $p['reasoning_format'] = "hidden"
    $p['reasoning_effort'] = "none"
    $p['max_tokens'] = [Math]::Max($curMax, $floor)
    return $p
  }
  return $payload  # llama / anything else: unchanged (same reference)
}

function Reset-Env {
  Remove-Item Env:M8_GROQ_QUIRKS -ErrorAction SilentlyContinue
  Remove-Item Env:M8_GROQ_REASONING_EFFORT -ErrorAction SilentlyContinue
  Remove-Item Env:M8_GROQ_MIN_MAXTOKENS -ErrorAction SilentlyContinue
}

Write-Host "-- (A) groqQuirks logic --"
Reset-Env
$oss = Groq-Quirks "openai/gpt-oss-120b" @{ max_tokens = 60 }
Check "gpt-oss include_reasoning=false" ($oss['include_reasoning'] -eq $false)
Check "gpt-oss reasoning_effort=low"     ($oss['reasoning_effort'] -eq "low")
Check "gpt-oss max_tokens floored 60->1024" ($oss['max_tokens'] -eq 1024)

$ossBig = Groq-Quirks "openai/gpt-oss-120b" @{ max_tokens = 2048 }
Check "gpt-oss floor never lowers 2048"  ($ossBig['max_tokens'] -eq 2048)

$ossNone = Groq-Quirks "openai/gpt-oss-120b" @{}
Check "gpt-oss absent max_tokens -> floor 1024" ($ossNone['max_tokens'] -eq 1024)

$env:M8_GROQ_REASONING_EFFORT = "medium"
$ossEff = Groq-Quirks "openai/gpt-oss-120b" @{ max_tokens = 60 }
Check "gpt-oss effort env override -> medium" ($ossEff['reasoning_effort'] -eq "medium")
Reset-Env

$env:M8_GROQ_MIN_MAXTOKENS = "512"
$ossFloor = Groq-Quirks "openai/gpt-oss-120b" @{ max_tokens = 60 }
Check "gpt-oss floor env override -> 512" ($ossFloor['max_tokens'] -eq 512)
Reset-Env

$qwen = Groq-Quirks "qwen/qwen3.6-27b" @{ max_tokens = 100 }
Check "qwen reasoning_format=hidden"     ($qwen['reasoning_format'] -eq "hidden")
Check "qwen reasoning_effort=none"        ($qwen['reasoning_effort'] -eq "none")
Check "qwen max_tokens floored"           ($qwen['max_tokens'] -eq 1024)
Check "qwen does NOT set include_reasoning" (-not $qwen.ContainsKey('include_reasoning'))

$llamaBase = @{ max_tokens = 60 }
$llama = Groq-Quirks "llama-3.3-70b-versatile" $llamaBase
Check "llama identity (same reference)"  ([object]::ReferenceEquals($llama, $llamaBase))
$llama8 = Groq-Quirks "llama-3.1-8b-instant" $llamaBase
Check "llama-3.1-8b identity"            ([object]::ReferenceEquals($llama8, $llamaBase))
$mis = Groq-Quirks "mistral-small-latest" $llamaBase
Check "unknown model identity"          ([object]::ReferenceEquals($mis, $llamaBase))

$env:M8_GROQ_QUIRKS = "0"
$killBase = @{ model = "openai/gpt-oss-120b"; max_tokens = 60 }
$kill = Groq-Quirks "openai/gpt-oss-120b" $killBase
Check "kill-switch M8_GROQ_QUIRKS=0 -> identity" ([object]::ReferenceEquals($kill, $killBase))
Reset-Env
$env:M8_GROQ_QUIRKS = "1"
$on = Groq-Quirks "openai/gpt-oss-120b" @{ max_tokens = 60 }
Check "kill-switch only '0' disables (=='1' active)" ($on['include_reasoning'] -eq $false)
Reset-Env

# purity: input untouched
$pureBase = @{ model = "openai/gpt-oss-120b"; max_tokens = 60 }
[void](Groq-Quirks "openai/gpt-oss-120b" $pureBase)
Check "purity: input max_tokens still 60" ($pureBase['max_tokens'] -eq 60)
Check "purity: input has no include_reasoning" (-not $pureBase.ContainsKey('include_reasoning'))

# ---------------------------------------------------------------------------
# (B) source wiring -- assert the change actually landed in lib/llm.js
# ---------------------------------------------------------------------------
Write-Host "-- (B) source wiring --"
$llmPath = Join-Path (Split-Path -Parent $PSScriptRoot) "lib\llm.js"
Check "lib/llm.js exists" (Test-Path $llmPath)
$src = Get-Content $llmPath -Raw

Check "groqQuirks function defined"        ($src -match 'function\s+groqQuirks\s*\(')
Check "groqQuirks exported"                ($src -match 'module\.exports[^}]*groqQuirks')
Check "GROQ default = openai/gpt-oss-120b" ($src -match 'GROQ_MODEL\s*\|\|\s*"openai/gpt-oss-120b"')
Check "old llama-3.3 no longer the GROQ default" (-not ($src -match 'GROQ_MODEL\s*\|\|\s*"llama-3\.3-70b-versatile"'))
Check "generateGroq wires payloadHook: groqQuirks" ($src -match 'payloadHook:\s*groqQuirks')
Check "CEREBRAS default = gpt-oss-120b"     ($src -match 'CEREBRAS_MODEL\s*\|\|\s*"gpt-oss-120b"')
Check "kill-switch M8_GROQ_QUIRKS present"  ($src -match 'M8_GROQ_QUIRKS')
Check "max_tokens floor env present"        ($src -match 'M8_GROQ_MIN_MAXTOKENS')
Check "payloadHook applied in OpenAI-compat path" ($src -match 'finalPayload')
# privacy wall: no server-side agentic web-tool models anywhere in the adapter
Check "privacy: no groq/compound* in llm.js" (-not ($src -match 'compound'))

Write-Host ""
$total = $pass + $fail
Write-Host "=== Build-177 groqQuirks mirror: $pass PASS / $fail FAIL (of $total) ==="
if ($fail -gt 0) { exit 1 } else { exit 0 }
