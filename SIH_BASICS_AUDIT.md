# SIH-26242 — RPL Basics Audit (page-by-page, per role)

**Branch:** `sih-26242-rpl`
**Scope:** Every page/button reachable in the RPL Compass app, for each role.
**Method:** Source review of `src/app/(rpl)/**`, `src/components/rpl/**`,
`src/lib/auth-redirect.ts`, `src/app/(rpl)/rpl/layout.tsx`; dead-end hunt via
grep for `router.replace('/')`, "Access denied" cards without an exit, and
navigation calls. Findings are fixed on this branch, **one commit per fix**.

Legend: **OK** = no dead end found · **FIXED** = dead end found and fixed on this
branch (commit noted) · **UNVERIFIED** = believed fixed but not confirmed against
a running stack (reason stated).

Roles in scope: **Guest** (signed out), **Candidate**, **Assessor**, **Admin**.
Legacy Quorena roles (`executive`, `commander`, `gladiator`) are treated as
candidates for RPL and are noted where they matter.

---

## 1. Route / role matrix (as designed)

| Route | Guest | Candidate | Assessor | Admin | Executive |
|---|---|---|---|---|---|
| `/login` | ✅ | → role home | → role home | → role home | → `/rpl` |
| `/rpl` | → `/login?next=` | ✅ | ✅ | ✅ | ✅ |
| `/rpl/declare` | → `/login?next=` | ✅ | → own home + toast | → own home + toast | ✅ (worker) |
| `/rpl/declare/result` | → `/login` | ✅ | → own home + toast | → own home + toast | ✅ |
| `/rpl/status` | → `/login?next=` | ✅ | ✅ | ✅ | ✅ |
| `/rpl/profile/[workerId]` | → `/login?next=` | ✅ (own) | ✅ | ✅ | ✅ |
| `/rpl/assessor` | → `/login?next=` | → own home + toast | ✅ | → own home + toast | ✅ |
| `/rpl/assess` | → `/login?next=` | → own home + toast | ✅ | → own home + toast | ✅ |
| `/rpl/assess/[id]` | → `/login?next=` | → own home + toast | ✅ | → own home + toast | ✅ |
| `/rpl/admin` | → `/login?next=` | → own home + toast | → own home + toast | ✅ | ✅ |
| `/rpl/consistency/[packId]` | → `/login?next=` | → own home + toast | → own home + toast | ✅ | ✅ |
| `/rpl/certify/[workerId]` | → `/login?next=` | → own home + toast | → own home + toast | → own home + toast | ✅ |
| `/rpl/forge` | → `/login?next=` | → own home + toast | → own home + toast | → own home + toast | ✅ |

The **authoritative** guard is `src/app/(rpl)/rpl/layout.tsx` (`isBlockedForRole`
+ `router.replace(getRoleHome(role))` with the "Access redirected" toast). Page
level guards below are redundant but were racing the layout guard toward `/`.

---

## 2. Guest (signed out)

| Page / control | Expected | Finding |
|---|---|---|
| `/rpl` home | Public landing; "Sign in" CTA | OK |
| "Declare your skills" CTA | → `/login?next=/rpl/declare` | OK (layout) |
| `/rpl/declare` deep link | → `/login?next=/rpl/declare` | OK (layout) |
| `/rpl/declare/result` deep link | Sign-in card with a way forward | **FIXED-2** (card had no sign-in link) |
| `/login` inline errors | Inline, never global takeover | OK (Part 1.1) |

## 3. Candidate

| Page / control | Expected | Finding |
|---|---|---|
| `/rpl` | Role home | OK |
| `/rpl/declare` wizard + result | Worker keeps access | OK |
| `/rpl/status` | Own declaration status or designed access state | OK |
| `/rpl/profile/[workerId]` | Own profile; other worker → designed 403 | OK (Part 1.5) |
| `/rpl/assessor`, `/rpl/assess*` | → `/rpl` + "Access redirected" toast | **FIXED-1** (page guard raced to `/`) |
| `/rpl/admin`, `/rpl/consistency` | → `/rpl` + toast | **FIXED-1** (admin page guard raced to `/`) |
| `/rpl/certify`, `/rpl/forge` | → `/rpl` + toast | **FIXED-1** |

## 4. Assessor

| Page / control | Expected | Finding |
|---|---|---|
| `/rpl/assessor` queue | ✅ accessible | OK |
| `/rpl/assess` list | ✅ accessible | OK |
| `/rpl/assess/[id]` scoring | ✅ accessible | **FIXED-3** (Access-denied card had no exit) |
| `/rpl/declare` | → `/rpl/assessor` + toast | OK (layout) |
| `/rpl/admin`, `/rpl/certify`, `/rpl/forge` | → `/rpl/assessor` + toast | **FIXED-1** |

## 5. Admin

| Page / control | Expected | Finding |
|---|---|---|
| `/rpl/admin` overview | ✅ accessible | OK |
| Demo data load/remove controls | ✅ with toast | OK |
| `/rpl/consistency/[packId]` | ✅ accessible | OK |
| `/rpl/assessor`, `/rpl/assess*` | → `/rpl/admin` + toast | **FIXED-1** |
| `/rpl/certify`, `/rpl/forge` | → `/rpl/admin` + toast | **FIXED-1** |
| Admin opening `/rpl/declare` | → `/rpl/admin` + toast, no stuck skeleton | OK (Part 1.5; test (g)) |

## 6. Executive / Commander / Gladiator (legacy, RPL-treated as candidate)

| Page / control | Expected | Finding |
|---|---|---|
| `/rpl/forge` | Executive only | **FIXED-3** (page allowed commander but layout denies; access-denied card had no exit) |
| `/rpl/certify/[workerId]` | Executive only | **FIXED-3** (card had no exit) |
| `/rpl/consistency/[packId]` | Executive + admin | OK |

---

## 7. Fix log (one commit per fix)

### FIX-1 — Page-level guards race the layout guard toward `/`
**Dead end:** Seven pages redirect unauthorised/wrong-role visitors with
`router.replace('/')` — the Quorena quiz landing, *not* the user's own RPL home.
When it fired at the same time as the layout guard it produced a flicker to `/`
instead of the designed "Access redirected" hand-off (Part 1.5).

**Files:** `src/app/(rpl)/rpl/assess/page.tsx`,
`.../assess/[assessmentId]/page.tsx`, `.../assessor/page.tsx`,
`.../certify/[workerId]/page.tsx`, `.../admin/page.tsx`.

**Fix:** unauthorised → `router.replace('/login')`; wrong-role →
`router.replace(getRoleHome(user.role))` (keeps the user inside `/rpl`).

### FIX-2 — `/rpl/declare/result` signed-out card was a dead end
**Dead end:** "Access denied — Please sign in" with **no** sign-in control.
**Fix:** add a "Sign in" button → `/login?next=/rpl/declare/result`, and a
"Start a new declaration" button on the "No declaration reference" card.

### FIX-3 — "Access denied" cards had no exit
**Dead end:** `/rpl/forge`, `/rpl/assess/[id]`, `/rpl/assess`, `/rpl/certify`
render a bare "Access denied" card with no way back to the user's workspace.
**Fix:** every card gains a "Go to my workspace" link built from
`getRoleHome(user?.role)` (falling back to `/login`).

---

## 8. UNVERIFIED items (with reason)

| Item | Reason |
|---|---|
| FIX-1 redirect behaviour under a live browser session | Playwright emulator stack was interrupted by the sandbox restart; verified by source + unit-level reasoning only. |
| FIX-3 "Go to my workspace" link for `admin` role | `getRoleHome('admin') === '/rpl/admin'` confirmed in `auth-redirect.ts`; not clicked live. |
| `/rpl/status` cross-worker 403 | Uses the same `DeclarationAccessState` covered by test (f); page not re-opened live after Part 1. |
