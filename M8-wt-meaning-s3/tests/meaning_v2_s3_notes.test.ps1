# M8 Meaning-First v2 -- S3 notes ladder mirror (PS 5.1, ASCII, no Node).
#
# The JS test (meaning_v2_s3_notes.test.js) owns the deterministic re-parse + gate
# behaviour; this host-runnable mirror asserts (A) the pure re-parse invariant and
# (B) that the SOURCE wiring landed -- including the ANTI-DRIFT guard that we did
# NOT add a redundant extractWalletLLM (the wallet lane's classifyMoneyIntent intent
# brain already IS that ladder; a twin would just duplicate it (spec 4.3 reconciled).

$ErrorActionPreference = 'Stop'
$script:pass = 0; $script:fail = 0; $script:failLines = @()
function Assert-True([string]$label, [bool]$cond) {
  if ($cond) { $script:pass++ } else { $script:fail++; $script:failLines += ("  FAIL  " + $label); Write-Host ("  FAIL  " + $label) -ForegroundColor Red }
}
function Read-Safe([string]$p) { if (Test-Path $p) { return [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) } return '' }
function Test-Rx([string]$s, [string]$pat) { return [regex]::IsMatch($s, $pat, [Text.RegularExpressions.RegexOptions]::IgnoreCase) }

Write-Host "M8 Meaning-First v2 -- S3 notes ladder mirror`n"

# --- (A) pure: the re-parse invariant "note: <content>" -> <content> ---------
# parseNoteCapture's first branch; the ladder relies on it so the model never has
# structural authority over what is stored.
function ReParse([string]$content) {
  $m = [regex]::Match(("note: " + $content), '^notes?\s*:\s*(.+)', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) { return $m.Groups[1].Value.Trim() } return $null
}
foreach ($c in @('the landlord returned the deposit','car service is due every 6 months','iqama renewal is in March')) {
  Assert-True ("re-parse keeps content: " + $c.Substring(0, [Math]::Min(20,$c.Length))) ((ReParse $c) -eq $c)
}

# --- (B) source wiring ----------------------------------------------------------
$orch = Read-Safe ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\lib\orchestrator.js')))

Assert-True "extractNoteLLM defined"                        (Test-Rx $orch 'async function\s+extractNoteLLM')
Assert-True "gated by M8_NOTE_EXTRACT kill-switch"          (Test-Rx $orch 'M8_NOTE_EXTRACT')
Assert-True "spend-guarded on resolveIntent domain=notes"   (Test-Rx $orch 'extractNoteLLM[\s\S]{0,900}?intent\.domain !== "notes"')
Assert-True "extractor uses temperature 0"                  (Test-Rx $orch 'extractNoteLLM[\s\S]{0,1400}?temperature:\s*0')
Assert-True "extractor calls the provider waterfall"        (Test-Rx $orch 'extractNoteLLM[\s\S]{0,1400}?providerOrder')
Assert-True "re-parses deterministically via parseNoteCapture" (Test-Rx $orch 'parseNoteCapture\("note: " \+ content')
Assert-True "ASKs on miss (never silent / never card)"      (Test-Rx $orch 'ask:\s*_noteExtractAsk')
Assert-True "wired into handleNotesCommand before the offers" (Test-Rx $orch 'await extractNoteLLM\(m\)')
Assert-True "ladder runs BEFORE the free-form TASK offer"   ($orch.IndexOf('await extractNoteLLM(m)') -gt 0 -and $orch.IndexOf('await extractNoteLLM(m)') -lt $orch.IndexOf('Free-form TASK offer'))

# --- ANTI-DRIFT guard: NO redundant wallet twin -----------------------------
Assert-True "NO extractWalletLLM (would duplicate classifyMoneyIntent)" (-not (Test-Rx $orch 'function\s+extractWalletLLM'))
Assert-True "the wallet ladder that already exists is classifyMoneyIntent" (Test-Rx $orch 'classifyMoneyIntent\(')

Write-Host ("`n=== S3 notes-ladder mirror: {0} PASS / {1} FAIL ===" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { $script:failLines | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }; exit 1 }
else { Write-Host "All S3 mirror assertions passed." -ForegroundColor Green; exit 0 }
