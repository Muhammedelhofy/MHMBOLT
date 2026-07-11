"use strict";
/**
 * lib/source-token-filter.js — B-191 (FIX 2, layer b), the code-guaranteed OUTPUT filter.
 *
 * A knowledge source ingested from the Obsidian vault is titled "vault:<path>.md"
 * (tools/vault-ingest.js). On 2026-07-08 the fallback model echoed that internal title
 * ("vault:Prime Claude.md") verbatim into a user reply — a privacy/trust break: the user
 * must NEVER see an internal source token or the vault path.
 *
 * Layer (a) (lib/knowledge-intake.js sanitizeSourceTitle) stops the "vault:" token from
 * being composed into the prompt in the first place. This layer is belt-and-suspenders:
 * the SAME pattern as the DO-sentinel marker strip (lib/do-sentinel.js) — a deterministic
 * scrub of the FINAL reply, so even if the token leaks from stored memory or a future
 * injection path, it can never reach the user or be persisted.
 *
 * PURE + zero deps ⇒ PS-mirror-testable; the orchestrator owns the intercept.
 */

// A vault source token, optionally wrapped in citation brackets 〔…〕 (U+3014/5),
// 【…】 (U+3010/1), or [ … ]. Non-greedy up to the note extension, which is always
// present on vault titles (paths from vault-ingest end at a .md/.txt/.markdown file).
const VAULT_BRACKETED_RE = /[〔【\[]\s*vault:[^〕】\]\n]*[〕】\]]/gi;
// Bare token: "vault:<name>.<ext>" (handles a space in the note name, e.g. "Prime Claude.md").
const VAULT_BARE_RE = /vault:[^\n〔【\[〕】\]]*?\.(?:md|markdown|txt)\b/gi;
// Last-resort: a bare "vault:" prefix followed by a path-ish token with no recognizable
// extension (e.g. a bare "vault:Projects/M8"). Tight — stops at whitespace/punctuation.
const VAULT_PREFIX_RE = /vault:[^\s〔【\[〕】\])(,.;]+/gi;

/**
 * Strip any leaked internal knowledge-source token from a reply. Idempotent; a reply
 * with no such token is returned unchanged (byte-identical). Never throws.
 * @param {string} text
 * @returns {string}
 */
function stripSourceTokens(text) {
  let s = String(text == null ? "" : text);
  s = s.replace(VAULT_BRACKETED_RE, "");
  s = s.replace(VAULT_BARE_RE, "");
  s = s.replace(VAULT_PREFIX_RE, "");
  // Tidy an empty bracket pair or a doubled space the removal may have left behind,
  // WITHOUT touching bracket pairs that still hold real content (e.g. a math ⟦n⟧).
  s = s.replace(/[〔【\[]\s*[〕】\]]/g, "");
  s = s.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;)])/g, "$1");
  return s;
}

module.exports = { stripSourceTokens, VAULT_BRACKETED_RE, VAULT_BARE_RE, VAULT_PREFIX_RE };
