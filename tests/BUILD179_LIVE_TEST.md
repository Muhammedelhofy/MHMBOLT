# Build-179 — Live Test: identity-key the courier-profile / driver-panel / ambassador layer

**Branch:** `feat/s3-profile-identity` · **File:** `index.html`
**What changed:** courier profiles (+ ambassador / model / funnel / nationality) and the driver
panel are now keyed by **driver IDENTITY** (phone-9 preferred, uuid fallback), not by lowercased
name. Two REAL same-named drivers no longer collapse onto one profile / one panel.

Prior identity work: B-175 (S1 block-state), B-176 (S2 merges). This is the S2-deferred profile
migration — the `identSigsOf` / resolver ladder extended to the profile store.

---

## A. Automated fixture tests (already run, 44/44 PASS)

Run on the served worktree (`PORT=3037 serve.ps1`) via the browser JS console. Two REAL
same-named drivers, different phones/uuids, different ambassadors, one blocked:

- `Mohammed Alsubaie` · +966542720081 · uuidA · active · ambassador **Omar**
- `MOHAMMED ALSUBAIE` · +966508846337 · uuidB · suspended · ambassador **Khalid**

Batch 1 (23/23) — resolver + reads + panel:
- collision resolves to two DISTINCT phone-preferred keys (`ph:542720081` vs `ph:508846337`)
- driverId-only and phone-only (05-form) of the same driver converge to the SAME key (union)
- a bare ambiguous name (no identity) → `nm:` (never picks either driver)
- migration SPLITS the shared `Omar` profile onto driver A only (sheet phone→ambassador match);
  never onto B; unresolvable collision (no ambassador match) stays name-keyed + **flagged**
- `getCourierProfile` / `courierAmbassadorFor` / `dkAmbTag` return each driver's OWN ambassador
- **`openModal` with driver B's identity opens the BLOCKED driver (uuidB / CAMRY-2)**, and with
  A's identity opens the ACTIVE driver (uuidA / YARIS-1) — the confirmed bug, fixed.

Batch 2 (21/21) — migration lifecycle + no-regression:
- `driverRowMatches`: identity-strict for a collision **with** identity; plain name-match for a
  name-only caller (Finance still sums by name — unchanged); a legacy phone-only row joins via union
- end-to-end `migrateProfilesToIdentity`: writes a one-time **backup**, re-keys unambiguous names,
  splits the collision, keeps a profile-only driver name-keyed, sets the schema flag, leaves NO
  legacy name-keys behind
- **idempotent** second run is a no-op; `restoreProfilesPreS3()` brings the backup back
- legacy name-keyed profiles still read correctly for UNAMBIGUOUS names before migration (no blanking)
- an ambiguous name + identity does NOT fall back to a shared legacy name bucket (no cross-contam)

`node --check` on the extracted inline script = **SYNTAX_OK**.

> The served worktree has no Supabase config (`supabaseOn()===false`), so the real-cloud eyeball
> below must be done once on your loaded dashboard. Same limitation the B-176 live test noted.

---

## B. Real-cloud eyeball (do this once on your loaded dashboard, after deploy)

The migration runs automatically at boot (after the cloud pull) and again after the onboarding
sheet loads. It is safe/idempotent and writes a backup key first.

1. Open the dashboard (Captains tab). Find a known same-name pair — **Mohammed / Abdullah /
   Meshari / Turki / Majed Alsubaie**. Each appears as two rows (case differs).
2. **Ambassador tag:** each of the two rows should now show ITS OWN ambassador (or "—"), not the
   same one on both. (Nothing tagged + no sheet phone match → "—", never the other driver's.)
3. **Open the panel:** click the **blocked/suspended** row → the panel must show the BLOCKED
   driver (that row's phone / plate / suspension), NOT the active earner. Click the active row →
   the active driver. Before this build both opened the same (active) panel.
4. **Model / funnel** badges (Finance › By Captain sort by model): the two rows read independently.
5. **Migration audit (console):** open DevTools console and look for
   `[S3] profile migration: {split, rekeyed, kept, flagged}`. If `flagged` is non-empty, those
   collision names could NOT be split by phone (no matching sheet ambassador) and were kept
   name-keyed on purpose — tag their ambassador in the sheet (with a phone) and reload to finish.
6. **Rollback (only if needed):** in the console run `restoreProfilesPreS3()` then reload — it
   restores the exact pre-migration profile store from the backup key.

### Known deferrals (documented, not bugs)
- **Foreign-name map** (`lookupForeignName`) stays name-keyed: its Excel source carries no
  phone/uuid, so a same-name collision can't be split there. Both same-name rows share one foreign
  name until the upload gains a phone column.
- **Finance By-Captain** still collapses a same-name pair into one net row (pre-existing, money
  layer). Such a collapsed row now shows the default deal rather than one driver's — safer (never
  the wrong deal), but the split deal lives on the identity (visible in each driver's panel).
- Monthly **overrides** and **reconcile** remain name-keyed (out of scope; unambiguous names correct).
