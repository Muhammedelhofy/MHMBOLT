/**
 * M8 Meaning-First v2 — S3: the notes extraction ladder (tests/meaning_v2_s3_notes.test.js)
 *
 * Run: NODE_PATH=<M8>/node_modules node tests/meaning_v2_s3_notes.test.js
 *
 * S3 clones extractTaskLLM into extractNoteLLM (spec §4.3): a note-ROUTED phrasing
 * the deterministic parseNoteCapture misses → ONE free-LLM normalise → re-parse
 * through parseNoteCapture → SAVE or a specific ASK (never the generic card).
 * (No wallet twin: classifyMoneyIntent already IS the wallet ladder — see the PS mirror.)
 *
 * The LLM leg is live-only (BUILD live test). Offline we assert the DETERMINISTIC
 * guarantees + the gates, which need no network:
 *   A) the re-parse invariant parseNoteCapture("note: "+X) === X (the model never has
 *      structural authority — the same parser the regex path uses validates the content),
 *   B) the spend/kill gates short-circuit BEFORE any LLM call,
 *   C) the extractor prompt shape.
 */
const path = require("path");
const orch = require(path.join(__dirname, "..", "lib", "orchestrator"));
const { extractNoteLLM, parseNoteCapture, NOTE_EXTRACT_SYSTEM, noteExtractAsk } = orch;

let pass = 0; const fails = [];
function ok(label, cond) { if (cond) pass++; else { fails.push(label); console.log("  FAIL  " + label); } }

console.log("\nM8 Meaning-First v2 — S3 notes ladder\n" + "=".repeat(60));

// ── A) deterministic re-parse invariant (pure) ───────────────────────────────
for (const c of ["the landlord returned the deposit", "car service is due every 6 months",
                 "iqama renewal is in March", "the wifi password changed"]) {
  ok("re-parse keeps content: " + c.slice(0, 24), parseNoteCapture("note: " + c) === c);
}
ok("parseNoteCapture null on a question", parseNoteCapture("what is the capital of france") === null);
ok("noteExtractAsk is a non-empty EN string", typeof noteExtractAsk === "function" && /note/i.test(noteExtractAsk(false)));
ok("noteExtractAsk has an AR form", /[؀-ۿ]/.test(noteExtractAsk(true)));

// ── B) gates short-circuit BEFORE the LLM (no network) ────────────────────────
(async () => {
  ok("non-notes msg → null (domain gate)", (await extractNoteLLM("what is the weather in riyadh")) === null);
  ok("empty msg → null", (await extractNoteLLM("")) === null);
  ok("over-long msg → null", (await extractNoteLLM("x ".repeat(150))) === null);

  const saved = process.env.M8_NOTE_EXTRACT;
  process.env.M8_NOTE_EXTRACT = "0"; // kill switch: even a NOTES-routed msg must not call the LLM
  const killed = await extractNoteLLM("note down that the deposit came back");
  process.env.M8_NOTE_EXTRACT = saved;
  ok("M8_NOTE_EXTRACT=0 kill switch → null (no LLM)", killed === null);

  // ── C) prompt shape ────────────────────────────────────────────────────────
  const p = String(NOTE_EXTRACT_SYSTEM);
  ok("prompt: op note|none schema", /"op":"note"\|"none"/.test(p) && /content/.test(p));
  ok("prompt: forbids inventing content", /NEVER invent/i.test(p));
  ok("prompt: has worked + none examples", /=>\s*\{"op":"note"/.test(p) && /=>\s*\{"op":"none"/.test(p));

  console.log("=".repeat(60));
  console.log("\nResults: " + pass + "/" + (pass + fails.length) + " passed, " + fails.length + " failed\n");
  if (fails.length) { console.log("Failed:\n" + fails.map((f) => "  - " + f).join("\n") + "\n"); process.exit(1); }
  else console.log("All S3 notes-ladder offline cases passed.\n");
})();
