# M8 Intent Gate -- routing fixture mirror (PS 5.1, ASCII, no Node).
#
# The JS test (intent_gate_test.js) is the authoritative contract; this mirror
# re-implements the SAME pure resolveIntent() logic + the SAME pass/fail contract
# so it runs on this host (Node is ABSENT). Per the PS-mirror rule: a PS-only fail
# with a JS pass means a MIRROR bug, not a source bug -- fix the mirror.
#
# TWO layers:
#   (A) LOGIC  -- the intended resolveIntent() ported to PS, run over every
#                 ENGLISH fixture case. Validates the DESIGN against Muhammad's
#                 real phrasings BEFORE the live orchestrator is touched. Arabic
#                 cases are counted+skipped (ASCII-only file; JS covers them).
#   (B) WIRING -- asserts the SOURCE changes land: capability-registry.js exports
#                 resolveIntent, orchestrator has the M8_INTENT_GATE kill-switch,
#                 and the _CAP_*_RE action-gate regexes are NET-DELETED. These are
#                 RED until step 1, GREEN after -- the build's red/green signal.
#
# English signal regexes are copied from lib/capability-registry.js (English parts
# only; Arabic alternates dropped -- they never match English and can't live in an
# ASCII file). Keep in sync with the source; the JS test is the full-fidelity one.

$ErrorActionPreference = 'Stop'
$script:pass = 0
$script:fail = 0
$script:skip = 0
$script:failLines = @()

function Assert-True([string]$label, [bool]$cond) {
  if ($cond) { $script:pass++ }
  else { $script:fail++; $script:failLines += ("  FAIL  " + $label); Write-Host ("  FAIL  " + $label) -ForegroundColor Red }
}

# ---------------------------------------------------------------------------
# Registry signals -- English mirror of lib/capability-registry.js
# ---------------------------------------------------------------------------
$DOMAINS = @('driver_profile','knowledge','docs','notes','tasks','wallet','finance','fleet','memory','travel','web','chat')

$SIG = @{
  driver_profile = @{ strong = '\bdriver\s+profiles?\b|\b(?:set|update)\s+\w+(?:''s)?\s+(?:rental|salary|fuel)\b'; present = $null }
  knowledge = @{ strong = '\bsearch\s+my\s+(?:books?|docs?|documents?|sources?|cv|resume|knowledge)\b|\bwhat\s+(?:does|do|did)\s+[\w\s]{1,30}?\s+say\s+about\b|\baccording\s+to\s+(?:my\s+)?(?:books?|sources?|cv)\b|\bin\s+my\s+(?:cv|resume|books?|documents?)\b|\bmy\s+cv\b'; present = $null }
  docs = @{ strong = '\b(make|create|write|draft|build|generate|prepare|design|put\s+together|give\s+me|i\s+need)\b.{0,40}\b(plan|brief|summary|report|deck|slides?|presentation|proposal|outline|document|memo|agenda|one[-\s]?pager|action\s+plan|checklist)\b|\b(slide\s+deck|pitch\s+deck|power\s?point)\b'; present = $null }
  notes = @{ strong = '\b(?:search|check|find\s+in|look\s+in)\s+my\s+notes?\b|^\s*note\s*:|\b(?:take|make|add|leave|write|jot)\s+(?:a\s+|this\s+)?note\b|\bjot\s+(?:this\s+)?down\b'; present = '\bnotes?\b|\bnote\s+(?:that|down|about)\b|\b(?:fyi|for\s+the\s+record)\b|\bremember\s+that\b' }
  tasks = @{ strong = $null; present = '\b(tasks?|reminders?|to-?dos?)\b|\bremind\s+me\b|\b(?:on\s+)?my\s+(?:to-?do\s+)?list\b' }
  wallet = @{ strong = '\bmy\s+(spend(?:ing)?|expenses?|wallet|budget|bills?|transactions?|money)\b|\b(?:did|do|does|how much did)\s+i\s+(?:spend|spent|pay|paid)\b|\bi\s+(?:spent|paid)\b|\bmy\s+(?:last|recent|latest)\s+(?:expenses?|transactions?|purchases?)\b|\b(?:did|have|has)\s+\w+\s+pa(?:y|id)\b|\b(?:paid|pay)\s+(?:the\s+|for\s+|my\s+|our\s+)?(?:rent|electricity|water|internet|bills?|fees?|school\s+fees?|tuition|subscription|installment)\b'; present = '\b(expenses?|wallet|spending|budget|bills?)\b|\bspent\b|\bspend\b(?!\s+(?:time|the\s+night|the\s+day|the\s+weekend))' }
  finance = @{ strong = '\bp\s*&\s*l\b|\bpnl\b|\bprofit\w*\b|\b(?:net\s+|gross\s+)?margin\b|\brevenue\b|\boperating\s+(?:costs?|expenses?)\b|\bcogs\b|\bcost\s+of\s+goods\s+sold\b|\b(?:marketing|advertising|ad)\s+spend\b|\bspend(?:ing)?\s+on\s+(?:marketing|ads?|advertising)\b|\bunit\s+economics\b|\bbreak[\s-]?even\b|\bbottom\s+line\b|\bcost\s+per\s+order\b|\bfinancial\s+(?:situation|health|analysis)\b'; present = $null }
  fleet = @{ strong = '\b(drivers?|captains?|couriers?|fleet|riders?)\b'; present = '\b(bikes?|motorbikes?|utili[sz]ation|acceptance\s+rate|payroll|earnings|tier|bonus|cash\s+collection|morning\s+brief|daily\s+brief|fleet\s+brief|active\s+drivers?|[56]k\s+target)\b' }
  memory = @{ strong = $null; present = '\b(?:who\s+(?:is|was|are)|tell\s+me\s+about|what\s+do\s+(?:you|we)\s+know\s+about|do\s+you\s+(?:remember|recall)|what\s+did\s+i\s+(?:say|tell\s+you)\s+about|remind\s+me\s+(?:who|what|about))\b|\bmy\s+(?:wife|husband|brother|sister|son|daughter|mother|father|friend|colleague|boss)\b' }
  # B-183 TRAVEL (English signal parts only -- ASCII file; JS covers the Arabic alternations).
  travel = @{ strong = '\b(?:travel|traveling|travelling|getaway|getaways)\b|\bflights?\b|\bfly(?:ing)?\s+(?:to|from|out)\b|\btrip\s+to\b|\bbook(?:ing)?\s+(?:me\s+|us\s+|him\s+|her\s+|them\s+)?(?:a\s+|my\s+|the\s+)?(?:flight|ticket|seat|hotel|trip|holiday|vacation)\b|\bitinerary\b|\bplane\s+tickets?\b|\bair\s?fares?\b'; present = '\b(?:hotels?|accommodations?|hostels?|airbnb|resorts?|guesthouses?)\b|\b(?:trip|getaway|holiday|vacation|honeymoon)\b|\bdestinations?\b|\bwhere\s+(?:should|could|can)\s+(?:we|i)\s+(?:go|travel|visit)\b' }
  web = @{ strong = $null; present = '\b(weather|temperature|forecast|humidity)\b|\b(scores?|who\s+won|match(?:es)?|fixtures?|standings)\b|\b(exchange\s+rate|stock\s+price|share\s+price|price\s+of)\b|\b(flights?|hotels?|airbnb)\b|\b(latest|recent|breaking)\s+(?:news|updates?)\b|\bnews\b|\b(near(?:by|est)?|closest)\b|\bwho\s+(?:founded|owns|invented|acquired)\b' }
  chat = @{ strong = $null; present = $null }
}

# DOC_READ_DOMINANT (English) -- from lib/domain-arbiter.js.
$DOC_READ = '\bmy\s+(?:cv|resumes?|docs?|documents?|books?|sources?|knowledge\s*base)\b[^?.!]{0,45}?\b(?:say|says|said|states?|mentions?|shows?|covers?|includes?|about)\b|\b(?:in|according\s+to|from|search(?:ing)?|pull\s+from|look\s+in|check)\s+(?:my\s+)?(?:cv|resumes?|docs?|documents?|books?|sources?|knowledge\s*base)\b|\bwhat(?:''?s| is| are| does| do| did)?\b[^?.!]{0,30}?\bmy\s+(?:cv|resumes?|docs?|documents?|books?|sources?|knowledge\s*base)\b'

# Tight context-lean gate: anaphor / continuation cue + short. Excludes greetings
# ("hey M8") and novel sentences -- only reached when the registry finds NO signal.
$LEAN_CUE = '^(?:and|also|now|then|so|what\s+about|how\s+about|and\s+in|in)\b|\b(?:it|that|this|these|those|them|same|instead|too|again)\b'

function Test-Rx([string]$s, [string]$pat) {
  if (-not $pat) { return $false }
  return [regex]::IsMatch($s, $pat, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

function Score-Message([string]$s) {
  $scores = @{}
  foreach ($d in $DOMAINS) {
    $def = $SIG[$d]
    # B-183 kill-switch mirror: travel row inert when M8_TRAVEL_LANE=off (default ON).
    if ($d -eq 'travel' -and ($env:M8_TRAVEL_LANE -match '^(off|0)$')) { $scores[$d] = 0; continue }
    if (Test-Rx $s $def.strong) { $scores[$d] = 2 }
    elseif (Test-Rx $s $def.present) { $scores[$d] = 1 }
    else { $scores[$d] = 0 }
  }
  return $scores
}

function Pick-Domain($scores) {
  $best = 'chat'; $bestScore = 0; $second = $null; $secondScore = 0
  foreach ($d in $DOMAINS) {
    $v = [int]$scores[$d]
    if ($v -gt $bestScore) { $second = $best; $secondScore = $bestScore; $best = $d; $bestScore = $v }
    elseif ($v -gt $secondScore -and $d -ne $best) { $second = $d; $secondScore = $v }
  }
  if ($bestScore -eq 0) { return @{ domain = 'chat'; ambiguous = $false; runnerUp = $null; top = 0 } }
  $amb = ($secondScore -eq $bestScore -and $second -and $second -ne $best)
  $ru = $null; if ($amb) { $ru = $second }
  return @{ domain = $best; ambiguous = [bool]$amb; runnerUp = $ru; top = $bestScore }
}

function Lean-FollowUp([string]$s) {
  $wc = (($s -split '\s+') | Where-Object { $_ -ne '' }).Count
  if ($wc -gt 7) { return $false }
  return (Test-Rx $s $LEAN_CUE)
}

# Optional-property read that tolerates $null / PSCustomObject / hashtable.
function Opt($opts, [string]$name) {
  if ($null -eq $opts) { return $null }
  if ($opts -is [hashtable]) { return $opts[$name] }
  $p = $opts.PSObject.Properties[$name]
  if ($p) { return $p.Value }
  return $null
}

function Resolve-Intent([string]$msg, $opts) {
  $s = "$msg".Trim()
  if ((-not $s) -or ($s.Length -gt 200)) { return @{ domain = 'chat'; band = 'none'; why = 'empty_or_long' } }
  $scores = Score-Message $s
  if (Opt $opts 'fleetSignal') { $scores['fleet'] = [Math]::Max([int]$scores['fleet'], 2) }
  # B-180: a household name is a wallet hint EXCEPT on an identity/recall question
  # ("who is Sara" / "is Sara my wife" score memory>0) -- those are MEMORY, not wallet.
  if ((Opt $opts 'memberHit') -and -not (Opt $opts 'fleetSignal') -and ([int]$scores['memory'] -le 0)) { $scores['wallet'] = [Math]::Max([int]$scores['wallet'], 2) }

  if (Test-Rx $s $DOC_READ) { return @{ domain = 'knowledge'; band = 'strong'; why = 'doc_read_dominant' } }

  $w = [int]$scores['wallet']; $f = [int]$scores['fleet']
  if ($w -gt 0 -and $f -gt 0) {
    if ($w -ge 2) { return @{ domain = 'wallet'; band = 'strong'; why = 'contest_wallet_strong' } }
    $arb = Opt $opts 'arb'
    if ($arb) {
      $ad = Opt $arb 'domain'; $ac = [double](Opt $arb 'confidence')
      if (($ad -eq 'wallet' -or $ad -eq 'fleet') -and $ac -ge 0.6) {
        $b = 'medium'; if ($ac -ge 0.85) { $b = 'strong' }
        return @{ domain = $ad; band = $b; why = ('arb:' + (Opt $arb 'why')) }
      }
    }
    return @{ domain = 'ask'; band = 'medium'; why = 'contest_wallet_fleet' }
  }

  $pick = Pick-Domain $scores
  if ($pick.domain -eq 'chat') {
    if ((Lean-FollowUp $s) -and (Opt $opts 'walletRef')) { return @{ domain = 'wallet'; band = 'weak'; why = 'wallet_context' } }
    if ((Lean-FollowUp $s) -and (Opt $opts 'fleetRef')) { return @{ domain = 'fleet'; band = 'weak'; why = 'fleet_context' } }
    return @{ domain = 'chat'; band = 'none'; why = 'no_signal' }
  }
  $band = 'medium'
  if (-not $pick.ambiguous) { if ([int]$pick.top -ge 2) { $band = 'strong' } else { $band = 'medium' } }
  $why = 'registry'; if ($pick.ambiguous) { $why = 'contest' }
  return @{ domain = $pick.domain; band = $band; runnerUp = $pick.runnerUp; why = $why }
}

# ---------------------------------------------------------------------------
# (A) LOGIC -- run the fixture through the ported resolveIntent()
# ---------------------------------------------------------------------------
Write-Host "M8 Intent Gate mirror -- (A) resolveIntent logic over real phrasings`n"

$fixPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'fixtures\routing_phrasings.json'))
$fx = Get-Content -Raw -Encoding UTF8 $fixPath | ConvertFrom-Json
$cases = $fx.cases

$VALID_BANDS = @('strong','medium','weak','none')

foreach ($c in $cases) {
  if ($c.lang -eq 'ar') { $script:skip++; continue }   # ASCII-only file; JS covers Arabic

  $r = Resolve-Intent $c.msg $c.opts
  $dom = $r.domain; $band = $r.band

  $acc = @()
  if (($c.PSObject.Properties.Name -contains 'acceptable') -and $c.acceptable) { $acc = @($c.acceptable) }
  else { $acc = @($c.domain) }
  $mustNot = @()
  if (($c.PSObject.Properties.Name -contains 'must_not') -and $c.must_not) { $mustNot = @($c.must_not) }
  $askOk = (($c.PSObject.Properties.Name -contains 'ask_ok') -and $c.ask_ok)

  $ok = $false; $reason = ''
  if ($VALID_BANDS -notcontains $band) {
    $ok = $false; $reason = "bad band '$band'"
  }
  elseif ($mustNot -contains $dom -and $band -eq 'strong') {
    $ok = $false; $reason = "CONFIDENT mis-route to forbidden '$dom' (strong)"
  }
  elseif ($acc -contains $dom) {
    $ok = $true
  }
  elseif ($askOk -and $band -ne 'strong') {
    $ok = $true
  }
  else {
    $ok = $false; $reason = "got '$dom'/$band, expected [$($acc -join ', ')]"
  }

  if ($ok) { $script:pass++ }
  else {
    $script:fail++
    $line = "  FAIL  {0}  -> {1}" -f $c.id, $reason
    $script:failLines += $line
    Write-Host $line -ForegroundColor Red
    Write-Host ("          `"" + $c.msg + "`"") -ForegroundColor DarkGray
  }
}

Write-Host ("`n  (A) logic: {0} pass, {1} fail, {2} skipped (Arabic, JS-only)`n" -f $script:pass, $script:fail, $script:skip)

# ---------------------------------------------------------------------------
# (A2) STEP 2 -- medium-band write-fork clarifier (trigger + pick resolution)
# ---------------------------------------------------------------------------
Write-Host "-- (A2) step-2 clarifier logic --"
$WRITE_FORK = @('tasks','notes','wallet','driver_profile')
function Clarify-Fires($r) {
  if ($r.why -ne 'contest') { return $false }
  if (-not $r.runnerUp) { return $false }
  return (($WRITE_FORK -contains $r.domain) -and ($WRITE_FORK -contains $r.runnerUp))
}
# tasks<->notes is a genuine write fork -> ASK.  tasks<->web is NOT (web is read-only).
$r1 = Resolve-Intent 'Is there any notes or todo that I am missing?' $null
Assert-True "tasks<->notes contest triggers the clarifier" (Clarify-Fires $r1)
$r2 = Resolve-Intent 'Remind me today at 9:47 pm about the match' $null
Assert-True "tasks<->web contest does NOT clarify (lane handles it)" (-not (Clarify-Fires $r2))
$r3 = Resolve-Intent 'how did the fleet do yesterday' $null
Assert-True "clean fleet signal does NOT clarify" (-not (Clarify-Fires $r3))

# pickedDomainFrom -- resolve the user's reply against the OFFERED pair.
$PICK_KW = @{
  tasks = '\b(task|reminder|to-?do|remind)\b'; notes = '\bnotes?\b';
  wallet = '\b(wallet|expenses?|personal|spend(?:ing)?|money)\b'; driver_profile = '\b(driver\s*profile|profile|rental|salary)\b'
}
function Picked-From([string]$msg, $pair) {
  $s = "$msg".Trim(); if ((-not $s) -or ($s.Length -gt 40)) { return $null }
  foreach ($d in $pair) { if ($PICK_KW[$d] -and (Test-Rx $s $PICK_KW[$d])) { return $d } }
  return $null
}
Assert-True "pick 'the note one' -> notes"  ((Picked-From 'the note one' @('tasks','notes')) -eq 'notes')
Assert-True "pick 'task' -> tasks"          ((Picked-From 'task' @('tasks','notes')) -eq 'tasks')
Assert-True "pick a fresh long question -> null" ($null -eq (Picked-From 'actually what is the weather in riyadh today please' @('tasks','notes')))
Write-Host ""

# ---------------------------------------------------------------------------
# (A3) STEP 3 -- weak-band grounding note logic (the never-decline layer 2)
# ---------------------------------------------------------------------------
Write-Host "-- (A3) step-3 grounding-note logic --"
$GROUNDING_HINT = @{ tasks=1; notes=1; wallet=1; driver_profile=1 }
function Grounding-Fires($domain) { return $GROUNDING_HINT.ContainsKey($domain) }
Assert-True "grounds a fell-through tasks intent"        (Grounding-Fires 'tasks')
Assert-True "grounds a fell-through wallet intent"       (Grounding-Fires 'wallet')
Assert-True "does NOT ground a chat turn"                (-not (Grounding-Fires 'chat'))
Assert-True "does NOT ground knowledge (packet/search)"  (-not (Grounding-Fires 'knowledge'))
Assert-True "does NOT ground fleet (packet-handled)"     (-not (Grounding-Fires 'fleet'))
Write-Host ""

# ---------------------------------------------------------------------------
# (B) WIRING -- source assertions (RED until step 1, GREEN after)
# ---------------------------------------------------------------------------
Write-Host "-- (B) source wiring (red until step 1 lands) --"
$capPath  = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\capability-registry.js'))
$orchPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\orchestrator.js'))
$cap  = [IO.File]::ReadAllText($capPath,  [Text.Encoding]::UTF8)
$orch = [IO.File]::ReadAllText($orchPath, [Text.Encoding]::UTF8)

Assert-True "capability-registry.js defines resolveIntent()"        ($cap -match 'function\s+resolveIntent')
Assert-True "capability-registry.js exports resolveIntent"          ($cap -match 'resolveIntent\s*,' -or $cap -match 'resolveIntent\s*}')
Assert-True "orchestrator wires M8_INTENT_GATE kill-switch"         ($orch -match 'M8_INTENT_GATE')
# Assert the DEFINITIONS are gone (a doc-comment mention must not trip these).
Assert-True "_CAP_ACTION_RE definition NET-DELETED"                (-not ($orch -match 'const\s+_CAP_ACTION_RE'))
Assert-True "_CAP_TASK_RE definition NET-DELETED"                  (-not ($orch -match 'const\s+_CAP_TASK_RE'))
Assert-True "_CAP_NOTE_RE definition NET-DELETED"                  (-not ($orch -match 'const\s+_CAP_NOTE_RE'))
Assert-True "capabilityFallback consumes intent (not crud)"        ($orch -match 'function\s+capabilityFallback\(message,\s*arb,\s*intent\)')
# Step 2 -- generalised medium-band clarifier
$daPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\domain-arbiter.js'))
$da = [IO.File]::ReadAllText($daPath, [Text.Encoding]::UTF8)
Assert-True "domain-arbiter defines clarifierTextFor()"            ($da -match 'function\s+clarifierTextFor')
Assert-True "domain-arbiter defines pickedDomainFrom()"            ($da -match 'function\s+pickedDomainFrom')
Assert-True "domain-arbiter exports clarifierTextFor"              ($da -match 'clarifierTextFor\s*,')
Assert-True "orchestrator fires the write-fork clarifier"          ($orch -match '_WRITE_FORK' -and $orch -match 'clarifierTextFor\(')
Assert-True "clarifier resolution generalised (pickedDomainFrom)"  ($orch -match 'pickedDomainFrom\(')
# Step 3 -- capability-grounded prompt (negative test: the prompt FORBIDS "I can't")
Assert-True "M8_PROMPT_ABILITIES constant defined"                ($orch -match 'const\s+M8_PROMPT_ABILITIES')
Assert-True "buildSystemPrompt injects abilities every turn"      ($orch -match 'parts\.push\(M8_PROMPT_ABILITIES\)')
Assert-True "abilities list forbids denying reminders"           ($orch -match "NEVER claim you lack" )
Assert-True "abilities list names reminders/expenses/fleet"       (($orch -match 'Reminders & tasks') -and ($orch -match 'Wallet ') -and ($orch -match 'Fleet '))
Assert-True "weakBandGroundingNote defined + wired (both paths)"  (($orch -match 'function\s+weakBandGroundingNote') -and (([regex]::Matches($orch,'weakBandGroundingNote\(_route')).Count -ge 1) -and (([regex]::Matches($orch,'systemInstruction \+= weakBandGroundingNote')).Count -ge 2))
# Step 4 -- tasks in-lane LLM extraction ladder
Assert-True "extractTaskLLM defined"                              ($orch -match 'async function\s+extractTaskLLM')
Assert-True "extractTaskLLM wired into handleTasksCommand"        ($orch -match 'await extractTaskLLM\(message\)')
Assert-True "extractor gated by M8_TASK_EXTRACT kill-switch"      ($orch -match 'M8_TASK_EXTRACT')
Assert-True "extractor uses temperature 0 (deterministic)"        ($orch -match 'async function extractTaskLLM[\s\S]{0,2500}?temperature:\s*0')
Assert-True "extractor calls the waterfall, not a hardcoded model" ($orch -match 'async function extractTaskLLM[\s\S]{0,2500}?providerOrder')
Assert-True "extractor re-parses deterministically (dates safe)"  ($orch -match 'classifyTaskCommand\(canonical\)')
Assert-True "extractor ASKS on failure (never silent/'I cant')"   ($orch -match 'ask:\s*_taskExtractAsk')
# Step 5 -- semantic tiebreaker for the medium-band write fork
$srPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\semantic-router.js'))
$sr = [IO.File]::ReadAllText($srPath, [Text.Encoding]::UTF8)
Assert-True "orchestrator has the medium-band semantic tiebreaker" ($orch -match 'intent-sem-confirm' -and $orch -match 'M8_INTENT_SEMANTIC')
Assert-True "tiebreaker gated to CONTEST write-forks only"        ($orch -match "intent\.why === ""contest""[\s\S]{0,400}?scoreSemantic")
Assert-True "tiebreaker uses the strict FLIP_CONF/FLIP_MARGIN bar" ($orch -match 'FLIP_CONF' -and $orch -match 'FLIP_MARGIN')
Assert-True "tiebreaker CONFIRMS a candidate, never originates"    ($orch -match '_sem\.domain === intent\.domain \|\| _sem\.domain === intent\.runnerUp')
Assert-True "FLIP_SAFE_DOMAINS still {knowledge,web,memory} only"  ($sr -match 'FLIP_SAFE_DOMAINS\s*=\s*Object\.freeze\(\["knowledge",\s*"web",\s*"memory"\]\)')
Assert-True "tasks exemplars enriched (no-keyword reminder)"      ($sr -match 'pop up a notification')
Assert-True "wallet exemplars enriched (household bill)"          ($sr -match 'internet bill')

# ---------------------------------------------------------------------------
# (B-180) ROUTING MIS-ROUTE FIX -- source assertions for the two live mis-routes
# (identity-question-as-wallet ; business-cost-line-as-wallet). The load-bearing
# arbiter + wallet-gate changes aren't exercised by the resolveIntent logic above,
# so assert they LANDED in source.
# ---------------------------------------------------------------------------
Write-Host "`n-- (B-180) routing mis-route fix wiring --"
$finPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\finance.js'))
$fin = [IO.File]::ReadAllText($finPath, [Text.Encoding]::UTF8)
Assert-True "registry FINANCE_STRONG owns COGS/marketing spend"    (($cap -match '\\bcogs\\b') -and ($cap -match 'marketing\|advertising\|ad'))
Assert-True "registry gates memberHit bump on an identity Q"       ($cap -match 'memberHit[\s\S]{0,120}?scores\.memory')
Assert-True "arbiter identity guard (memberHit NOT wallet on recall)" (($da -match '_identityQ') -and ($da -match 'MEMORY_PRESENT'))
Assert-True "classifyAll gates memberHit bump on an identity Q"     ($da -match 'memberHit[\s\S]{0,140}?scores\.memory')
Assert-True "finance detector FINANCE_RE owns COGS/marketing spend" (($fin -match 'cogs') -and ($fin -match 'marketing'))
Assert-True "wallet gate defers a finance-STRONG cost line"        ($orch -match 'FINANCE_STRONG\.test\(m\)')

# ---------------------------------------------------------------------------
# (B-183) TRAVEL LANE -- source wiring + the payment-boundary doctrine grep
# ---------------------------------------------------------------------------
Write-Host "`n-- (B-183) travel lane wiring --"
$tvPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\travel.js'))
$tv = [IO.File]::ReadAllText($tvPath, [Text.Encoding]::UTF8)
$slotsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\slots.js'))
$slots = [IO.File]::ReadAllText($slotsPath, [Text.Encoding]::UTF8)
Assert-True "registry: travel between memory and web in DOMAINS"     ($cap -match '"memory",\s*"travel",\s*"web"')
Assert-True "registry: REGISTRY.travel row (search,read)"            ($cap -match 'travel:\s*\{\s*actions:\s*\["search",\s*"read"\]')
Assert-True "registry: TRAVEL_STRONG + TRAVEL_PRESENT defined"       (($cap -match 'const\s+TRAVEL_STRONG') -and ($cap -match 'const\s+TRAVEL_PRESENT'))
Assert-True "registry: travel kill-switch travelLaneEnabled()"       (($cap -match 'function\s+travelLaneEnabled') -and ($cap -match 'M8_TRAVEL_LANE'))
Assert-True "registry: scoreMessage gates travel on the flag"        ($cap -match 'd === "travel" && !travelLaneEnabled')
Assert-True "lib/travel.js exports extractor + all pure composers"   (($tv -match 'extractTripState') -and ($tv -match 'buildBookingLinks') -and ($tv -match 'buildTravelDirective') -and ($tv -match 'travelClarify') -and ($tv -match 'travelSearchPlan'))
Assert-True "extractor: temperature 0 + provider waterfall"          (($tv -match 'temperature:\s*0') -and ($tv -match 'providerOrder'))
Assert-True "D3 confirm-inferred-origin is COMPOSED (not a hope)"    (($tv -match 'function\s+originConfirmClause') -and ($tv -match 'tell me if not'))
Assert-True "D8 payment boundary lives in the directive"            (($tv -match 'NEVER book or pay') -and ($tv -match 'confirm and pay'))
Assert-True "D4 links-only rule (LLM never writes URLs)"            ($tv -match 'ONLY from the BOOKING LINKS block')
Assert-True "orchestrator wires the travel packet (flag+extractor)"  (($orch -match 'travelLaneEnabled\(\)') -and ($orch -match 'extractTripState') -and ($orch -match 'travelPacket'))
Assert-True "orchestrator: recentlyDiscussedTravel follow-up lean"   ($orch -match 'function\s+recentlyDiscussedTravel')
Assert-True "free-form task offer yields to a travel-context follow-up" ($orch -match 'looksLikeFreeformTask\(m\) && !recentlyDiscussedTravel\(history\)')
Assert-True "ABILITIES: travel line + payment boundary"             (($orch -match 'Travel .{0,90}BOOKING LINKS') -and ($orch -match 'NEVER books or pays'))
Assert-True "slots.js origin env-lifted to M8_HOME_CITY"            ($slots -match 'M8_HOME_CITY')
# * D8 STRUCTURAL: no booking-create / payment endpoint anywhere in the travel module
# (the Booking browse URL's legit &checkout= date param must NOT trip this).
Assert-True "D8 grep: no booking-create/payment endpoint in travel.js" (-not ($tv -match 'flight-orders|/orders\b|/payment\b|/reservation\b|/checkout\b|card_number|cvv'))

# ---------------------------------------------------------------------------
Write-Host ("`n=== Intent Gate mirror: {0} PASS / {1} FAIL / {2} SKIP ===" -f $script:pass, $script:fail, $script:skip)
if ($script:fail -gt 0) {
  Write-Host "`nFAILURES:" -ForegroundColor Yellow
  $script:failLines | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
  exit 1
} else {
  Write-Host "All mirror assertions passed." -ForegroundColor Green
  exit 0
}
