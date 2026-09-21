# Quorena — Security Notes

**Last updated:** 2026-09-15
**Scope:** Cryptographic submission workflow, hardening-sprint changes, dependency posture, verification status.

---

## 1. Cryptographic submission workflow (Hardening Sprint)

Every answer in a live battle is integrity-signed by the client and verified by
the server before a single write. Detail lives in `SECURITY.md` and the code
itself; this is the operational summary.

### Canonical payload (`src/lib/submit-answer.ts`)
```
quizId | questionId | selectedOption | nonce | floor(clientTime)
```

### Key derivation
```
quorena:submit:<quizId>:<userId>:<sessionToken>
```
- `sessionToken` is minted at join (`participantService.joinQuiz`), stored on
  `participants/{uid}.session_token`, and mirrored into `sessionStorage`
  (`getSessionToken`, `src/services/battle.service.ts:24`).
- The server reads it from the participant doc and derives the key against the
  **verified** `auth.uid` — a client-supplied `user_id` is never trusted.

### Sign / verify
- Web Crypto `crypto.subtle` HMAC-SHA256 → lowercase hex.
- Server verify uses `timingSafeEqual` (constant-time).
- Freshness window: `|Date.now() − clientTime| ≤ 5000ms`
  (`SUBMIT_CLOCK_SKEW_TOLERANCE_MS`), governed on the server only.
- Nonce: 8–128 chars, required, random (UUID when available).

### One-shot idempotency
`POST /api/battle/submit` performs existence-check + write inside ONE
`db.runTransaction`. Concurrent double-taps resolve to
`{ ok: true, alreadySubmitted: true }`; a prior answer is never overwritten.

### Threat boundary (be precise)
The session token is client-visible, so this is **payload integrity / replay &
impersonation defense**, NOT zero-knowledge or anti-self-cheat. A participant
can always sign their own requests; the actual anti-cheat enforcement is the
server-only write path (live-only + current-question binding + one-shot
idempotency) plus rules-locked client writes.

## 2. Hardening sprint — change register

| Change | Where | Why |
|---|---|---|
| Client submission writes disabled | `firestore.rules.template` (`submissions`: create/update → false) | Kill forged `submittedAt`, double-submits, self-scored answers |
| `/api/battle/submit` added | `src/app/api/battle/submit/route.ts` | Sole server write path (Admin SDK) |
| HMAC signing | `src/lib/submit-answer.ts`, `submissionService.submitAnswer` | Tamper/replay/impersonation defense |
| `created_by` fallback role-gated | rules `questions`/`answerKeys`/`config` create | Gladiator can no longer author keys/questions/config |
| `config/settings` immutable mid-battle | rules `config` update | Creator/exec can't rewrite scoring once started |
| Nonce CSP + dynamic render | `src/middleware.ts`, `src/app/layout.tsx` | XSS/injection + exfiltration defense |
| PPR pinned off | `next.config.ts` (`experimental.ppr: false`) | Static shells would bake nonce-less scripts |
| Dependent install repaired (jose) | `npm install` (pruned 229 extraneous) | `firebase-admin`→`jwks-rsa` couldn't resolve `jose`; build was broken |

## 3. Dependency posture (Phase 114 — preserved)

### Resolved via safe `package.json` overrides
| Package | Before | Patched | Advisory fixed |
|---------|--------|---------|----------------|
| `brace-expansion` | 2.1.2 | 2.1.4 | GHSA-rgw5-rvv9-x895 (DoS) |
| `fast-uri` | 3.1.3 | 3.1.6 | ReDoS |
| `nanoid` | 3.3.15 | 3.3.18 | ReDoS |
| `fast-xml-parser` | 5.9.3 | 5.10.1 | XXE / parser issues |
| `ip-address` | 10.2.0 | 10.3.1 | informational IP input |

### Removed dead dependencies
`@radix-ui/react-accordion`, `@radix-ui/react-menubar`,
`@radix-ui/react-popover`, `@radix-ui/react-progress`, `@vercel/speed-insights`,
`react-is`. Next bumped `^15.5.9 → ^15.5.20`.

### Known / intentionally unfixed (gated transitive chain)
`npm audit fix` hangs on the genkit/OTEL chain; `--force` would downgrade
genkit (breaking). Remaining advisories are transitively reachable only via:
1. `firebase-admin → @google-cloud/firestore|storage → google-gax/gaxios/...` (needs a major bump),
2. `genkit → genkit-cli → js-yaml, adm-zip` (dev-only),
3. `next → sharp 0.34.x` (fixed only in 0.35.x major bump).

**Stance:** none accept untrusted input on the request path; revisit on the next
Firebase Admin / Genkit / Next major release.

## 4. Verification status

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | clean; all pages `ƒ (Dynamic)` |
| `npm run lint` | runs — ESLint 9 + `eslint-config-next@15` + strict `.eslintrc.json` ruleset. Hardening delta is clean; legacy repo has a tracked backlog of explicit `any` annotations (see `SECURITY.md` §8). `next lint` prints a deprecation notice (removed in Next 16 → migrate to ESLint CLI + flat config when upgrading). |
| `npm run rules:generate` | clean; `firestore.rules` generated from template (source of truth) |

---

## Appendix: Code Quality Static Analysis Baseline (2026-09-15)

The repository has integrated a strict ESLint ruleset to prevent type widening
and code decay.

**Current Legacy Backlog (pre-hardening debt to be refactored incrementally):**

* **Total Flags:** 389 errors across 132 files.
* **Type Widening (`no-explicit-any`):** 246 instances.
* **Dead Code (`no-unused-vars`):** 90 instances.
* **Hygiene / Hooks (`exhaustive-deps`, etc.):** 53 instances.

**Enforcement Policy:** All new features, API routes, and components MUST pass
the linter with zero errors. Existing backlog files are to be refactored
exclusively under localized testing cycles.

**How the gate works (lint ratchet):**
- A `pre-push` git hook (see below) runs `lint → typecheck → build` before any
  `git push` succeeds.
- The lint step is enforced as a **ratchet**: the live error count is compared
  against the registered baseline in `scripts/git-hooks/.lint-baseline`
  (currently `389`). A push is blocked only if the count **grows**. New code
  with a new `any`/unused-var increases the count → blocked. Refactoring
  backlog (reducing the count) is always allowed.
- The baseline is intentionally version-controlled; when a rule/configuration
  change legitimately alters the count, update `scripts/git-hooks/.lint-baseline`
  in the same commit that changes the ruleset.
- `typecheck` and `build` are hard gates (failure always blocks the push).

**Verification loop shortcut:** `scripts/dev-verify.bat` (Windows) /
`scripts/dev-verify.sh` (macOS/Linux) run the same `lint → typecheck → build`
pipeline from one command.

**Tooling:** ESLint `9.39.5` + `eslint-config-next@15.5.23` + `.eslintrc.json`
strict ruleset (`@typescript-eslint/no-explicit-any`, `no-unused-vars`,
`no-console`, `react-hooks/exhaustive-deps`). `next lint` is deprecated —
migrate to the ESLint CLI + flat config (`eslint.config.mjs`) when upgrading to
Next 16.

### Git hook installation

Hooks live in `scripts/git-hooks/` (tracked) and are copied into
`.git/hooks/` locally (`.git` is not a shared resource):

- Windows (cmd): `scripts\git-hooks\install-git-hooks.bat`
- macOS/Linux: `./scripts/git-hooks/install-git-hooks.sh`

`.gitattributes` pins `eol=lf` for hook/script files so Git-for-Windows never
corrupts them with CRLF. Re-run the installer after cloning or re-initializing
the repo.