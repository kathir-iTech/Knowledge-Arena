# RPL Compass: Complete Project Guide
SIH 2026 · Problem Statement SIH26242 · Team ZYN6 · PSG iTech
Status as of 14 Oct 2026 · Branch `sih-26242-rpl` (never merged to main, deleted after SIH) · HEAD `e2a1d9d` (completion pass, pushed — redeploys preview)

> How to read this: sections 1-3 explain what the project is and how the website works. Sections 4-7 are the honest status (done / unverified / pending). Section 8 is the plan.
> Labels used throughout: **VERIFIED** = seen working live. **BUILT, NOT VERIFIED** = code exists, nobody has watched it work on the preview. **NOT BUILT** = missing.

---

## 1. What is this project?

### The real-world problem (SIH26242, Ministry of Skill Development)
Millions of Indian workers (electricians, plumbers, data-entry operators) learned their trade on the job and have **no certificate**. The government has a scheme called **RPL (Recognition of Prior Learning)**: it certifies the skills you already have, without making you sit a course again. In practice RPL is slow, paper-heavy, and **inconsistent**: two assessors can give the same worker very different scores. The problem statement asks for an **AI-assisted skill assessment tool** that makes this fair, fast, and trustworthy.

### Our answer: RPL Compass
A web app where:
1. A worker **declares** the skills they have (in English, Hindi or Tamil).
2. AI **matches** them to an official qualification pack (NSQF = National Skills Qualification Framework, levels 1-10) and suggests a level.
3. A human **assessor** scores the worker on each criterion (1-4 rubric). AI can suggest a score, but the **human decides**.
4. The system **measures how much assessors agree** with each other (Cohen's kappa). If agreement is low, admins get an alert.
5. An admin/assessor **certifies**, and the worker gets a certificate with a human-readable reference code.

**Core idea in one line: "AI-Proposed ≠ AI-Decided"**: AI helps, humans sign, and we *measure* the fairness of the humans.

### Why it is built on top of Quorena
Quorena (formerly Knowledge Arena) is your earlier quiz-battle platform. To save time, RPL Compass reuses its stack: login, Firebase, AI plumbing, UI kit. The old Quorena screens are **quarantined** (they redirect to `/rpl`) so judges only see RPL Compass.

---

## 2. Who uses the website (roles) and how it works step by step

| Role | Who | Home page after login |
|---|---|---|
| **Candidate** | The worker being assessed | `/rpl` |
| **Assessor** | A trained evaluator who scores candidates | `/rpl/assessor` |
| **Admin** | Programme officer monitoring everything | `/rpl/admin` |

Anyone can sign up as a **Candidate** (email/password or Google). Assessor and Admin **cannot be self-assigned**: they come from server-side env lists (`RPL_ASSESSOR_EMAILS`, `RPL_ADMIN_EMAILS`).

### 2.1 Candidate journey
1. **Landing page `/`**: explains the product; "Sign in" goes to `/login`.
2. **Login `/login`**: tabs *Sign in* / *Create account*, plus *Continue with Google* (popup).
3. **Dashboard `/rpl`**: entry point, language toggle (EN / HI / TA).
4. **Declare `/rpl/declare`**: pick a trade/qualification and tick which skills you have done (must claim at least one). Optionally add evidence.
5. **Result `/rpl/declare/result`**: shows your **reference code** (e.g. `RPL-2VHP-N7AA`), the **matched pack** (e.g. Plumber, NSQF 4), a match %, the **NSQF ladder**, an **evidence timeline**, and a **certificate card** (status pending until certified).
6. **Status `/rpl/status`**: progress tracker for your case.
7. **Profile `/rpl/profile/[workerId]`**: your competency profile (radar chart, ladder). You can only see your own.

### 2.2 Assessor journey
1. **Assessor home `/rpl/assessor`**: shows *your own* consistency: per-pack kappa, who you are paired with, and per-criterion difference versus the panel average (so you can see if you are systematically harsh or lenient).
2. **Pending assessments `/rpl/assess`**: queue of candidates to score.
3. **Score `/rpl/assess/[assessmentId]`**: score each criterion 1-4. Button to get an **AI suggestion** (Gemini). The system records whether you used it (`aiSuggestionUsed`) so bias can be analysed.
4. **Certification review `/rpl/certify/[workerId]` is admin-only** (tested: assessors are redirected away). The assessor's submitted scores feed the profile the admin signs.

### 2.3 Admin journey
1. **Admin overview `/rpl/admin`**: live metrics, alerts (e.g. kappa below 0.4), and **Load demo data / Remove demo data** buttons.
2. **Certification review `/rpl/certify/[workerId]`**: full profile recomputed on the server at signing time, a draft recommendation, then admin sign-off (assessors cannot open this page).
2. **Consistency report `/rpl/consistency/[packId]`**: overall agreement (Cohen's weighted kappa, Fleiss for 3+ raters, 95% CI, Landis & Koch label like "Fair" / "Moderate"), per-criterion breakdown, demo badge when data is seeded.
3. **Forge `/rpl/forge`**: AI turns raw NCVET qualification-pack text into a structured assessment pack (Gemini; cached 30 days; rejects scanned PDFs).

### 2.4 The "behind the scenes" pipeline (the 5 steps from your PPT)
**Declare → Match → Score → Measure → Certify**
- *Match*: Genkit flow `rpl-matching-flow.ts` (Gemini) maps declared skills to a pack.
- *Score*: assessors via `/api/rpl/assess`.
- *Measure*: `kappa.ts` computes agreement; `recompute-consistency.ts` refreshes it after every assessment; `kappa-monitor.ts` raises alerts.
- *Certify*: `/api/rpl/certify`.

---

## 3. Architecture (how the pieces fit)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind/shadcn UI | Pages in `src/app/(rpl)/rpl/` |
| Auth | Firebase Auth (email/password + Google **popup**) | Redirect flow abandoned (browser storage partitioning) |
| Session | Server session cookie via `/api/auth/session` | Role stored as a **custom claim**; client refreshes token and re-mints cookie |
| Database | Firestore (collections in `rpl-collections.ts`) | Spark plan, $0 |
| AI | Genkit + Gemini free tier, 3-key rotation | Flows: matching, forge |
| Hosting | Vercel Hobby, **preview** deployment of this branch | URL: `knowledge-arena-git-sih-26242-rpl-…vercel.app` |
| Security | Nonce + strict-dynamic CSP in middleware; route quarantine; env-based roles | |
| Offline | Service worker `public/rpl-sw.js` (scoped `/rpl/`) + IndexedDB queue | Replays with a fresh token |
| i18n | `src/lib/rpl/i18n.ts` (EN/HI/TA) | Machine-drafted, with a test that blocks mixed-script garbage |

### Important setup facts
- The Firebase project is **shared with Quorena**, so old Quorena accounts exist. A guard stops env roles from overwriting a Quorena-role account.
- The Admin SDK key (`FIREBASE_SERVICE_ACCOUNT_KEY`) must be for the **same project** as the client config. Check `/api/health/auth` on the preview URL: expect `match: true` (it was).
- Firebase **Authorized domains** must include the preview alias (done).
- **Do not deploy Firestore rules**; not needed and risky for the shared project.
- NSQF packs shipped: ELE/Q1301 Electrician (L4), CON/Q0304 Plumber (L4), SSC/Q2212 IT-ITeS Data Entry (L3).

---

## 4. What is DONE

### 4.1 VERIFIED (seen working: live preview + local emulator runs 14 Oct)
- Email/password sign-up and sign-in; Google popup sign-in ("Welcome, leetcode").
- Session handshake: all `/api/*` calls returned 200 in the latest HAR; health check `match: true`.
- Quorena isolation: Google login no longer lands on the old Quorena dashboard.
- Candidate declare → result flow end to end (reference code `RPL-2VHP-N7AA`, Plumber, NSQF 4, 25% match) — live AND emulator e2e (Suite 1 green).
- Reference codes are human-readable, not UIDs.
- Declaration validation (must claim at least one skill).
- Sign-out and login redirect basics fixed (the `?next=` race, global error takeover).
- i18n quality test: 132 strings, 0 failures (4 garbage-text bugs fixed).
- **Assessor scoring end to end (emulator, Suite 2 green):** commander creates → opens from queue → pre-scored renders → scores 1-4 → saves draft → reload preserves → submits → API confirms `submitted`.
- **Admin demo load (emulator, API-verified):** RPL-native admin POSTs `/api/rpl/admin/demo` → 200; ELE/Q1301 recomputes **κ=0.3846 Fair, CI [-0.03, 0.80]**; CON 0.765 Substantial; SSC 0.455 Moderate. **κ<0.4 alert fires live** on the admin page ("Low agreement κ=0.385").
- **Access control (emulator, Suite 4 + login-chain green):** gladiator→`/rpl/admin` bounced to `/rpl`; commander→`/rpl/certify` bounced; worker cannot read another profile (403); commander gets 401 on admin API; env-listed Quorena account refused with 403 ENV_ROLE_CONFLICT (never rewritten).
- **Login chain + UI (15/15 green):** session mint with role claim, no spinner hang, `?next=` round-trip, coded errors, signup→candidate→`/rpl`, sign-out, wrong-role redirect WITH visible toast.
- **Role model fixed (commit `e2a1d9d`):** RPL-native `admin`/`assessor`/`candidate` now accepted everywhere alongside legacy `executive`/`commander`/`gladiator` (`src/lib/rpl/roles.ts`). Forge + certify are admin-only; assess surfaces admit assessor+admin; evidence upload admits candidate-for-own; demo load admits executive+admin. Before this fix the §5.2 fake accounts would have 401'd.
- Offline logic suites 12/12, typecheck clean, lint clean, production build green (124/124 pages, `e2a1d9d` pushed to preview).

### 4.2 BUILT, locally exercised but not live-clicked (code exists; emulator e2e green, needs preview clicks)
- Admin and assessor accounts, role routing, env role lists.
- Demo data loader (admin POST/DELETE `/api/rpl/admin/demo`) — API-verified, not button-clicked on preview.
- Assessor scoring screens; AI suggestion endpoint (`/api/rpl/assess/suggest`) — scoring UI verified, suggestion button not clicked.
- Consistency/kappa pages with real data; kappa alerts — API + admin page verified with seeded data.
- Evidence upload (`/api/rpl/evidence`, `evidence-upload.ts`) — candidate-for-own guard fixed, upload flow not clicked.
- Certification sign-off — guard fixed to admin-only, sign-off click not done.
- Offline queue and replay — logic tests pass, browser offline toggle not done.
- Forge (AI pack builder) — guard fixed to admin-only, run not done (needs Gemini key + real PDF).
- Landing page lower sections (fixed: were a reveal-timing capture artifact; spec now scrolls first — fresh captures show all sections).
- Hindi/Tamil display correctness (machine-drafted; needs native review).
- Design system integration (components exist: `CompassMark`, `KappaGauge`, `CompetencyRadar`, `NsqfLadder`, `EvidenceTimeline`, `CertificateCard`, `LanguageToggle`). An earlier "design complete" claim by OpenCode was false; corrected later.

### 4.3 Codebase size (HEAD `79b1270`)
12 RPL pages, 15 RPL API routes, 15 library modules in `src/lib/rpl/`, 2 Genkit flows, 8 RPL components.

---

## 5. What is PENDING

### 5.1 Known bugs / visual issues (status 14 Oct — most fixed in `e2a1d9d`)
1. **Radar chart** looks empty (single dot) when only one pack is present. — FIXED: `<3 axes` renders a bar list.
2. **Certificate card** shows "Pending 4 NSQF" (awkward wording). — FIXED: "Pending sign-off / NSQF Level 4".
3. **Inconsistent match numbers**: declare page showed "Match 10" while the result showed "25% match". — FIXED honestly: different metrics, different labels ("Relevance n%" = keyword match on declare; "n% match" = claimed-unit share on result).
4. **4 unexplained console errors** on the candidate pages. — NOT REPRODUCED 14 Oct: console-error census over `/rpl`, `/rpl/declare`, `/rpl/status` (emulator) found **0 errors, 0 pageerrors**. Likely fixed earlier or preview-state-specific; still glance at the console during the preview pass.
5. **Toast test failures** (a) Welcome toast and (g) Access-redirected toast. — Redirect toast FIXED (10s duration, login-chain green); Welcome toast still unproven.
6. **Forge and Assess pages** still contain legacy text such as "Only commanders and executives can use the RPL Forge". — FIXED: all guards + copy use candidate/assessor/admin (`roles.ts`), certify is admin-only per tested contract.
7. **Landing page** lower sections blank in a desktop screenshot. — FIXED/EXPLAINED: reveal-transition capture artifact; spec scrolls first, fresh captures show every section; added no-observer fallback + reduced-motion CSS.

### 5.2 Verification work (status 14 Oct)
1. Set Preview env vars with **fake** emails: `RPL_ADMIN_EMAILS=admin@rplcompass.test`, `RPL_ASSESSOR_EMAILS=assessor1@rplcompass.test,assessor2@rplcompass.test`. Do not put your real Gmail there. Then redeploy. (Local dev needs `RPL_ASSESSOR_EMAILS=glad2@test.local,...` for the A2 conflict test.)
2. Create those accounts via Sign up (plus `candidate1@rplcompass.test`). — Done locally via claims; do for real on preview.
3. As admin, click **Load demo data**; confirm the consistency page for ELE/Q1301 shows **κ ≈ 0.38 "Fair"**. — DONE LOCALLY (API: 200, κ=0.3846 Fair, alert fires). Still needs the preview button click.
4. As assessor: score a candidate, request an AI suggestion, check it is flagged. — Scoring DONE LOCALLY (Suite 2); suggestion + flag still needs preview.
5. As candidate: upload evidence; as assessor/admin: certify; check the certificate card updates. — STILL NEEDS preview (guards fixed, flows unclicked).
6. Offline test: go offline in DevTools, submit, come back online, confirm replay. — STILL NEEDS preview.
7. Regression specs not yet run on this branch: `login-chain`, `login-ui`, `rpl-e2e`, service worker. — DONE LOCALLY except service worker: `login-chain`+`login-ui` 15/15, `rpl-e2e` 6/6, `rpl-screenshots` 10/10. Service-worker offline replay still unrun.

### 5.3 Honesty problem to fix before finals
- **PPT claims κ = 0.71 and 0.58. Our seeded data computes κ = 0.3846 (Fair, CI [-0.03, 0.80]).** The 0.71/0.58 numbers are not supported by anything in the app. Options: (a) change the PPT/demo story to the computed value and present it as exactly the problem the tool detects ("our tool flagged low agreement, which is the point"), or (b) generate a realistic seeded dataset that honestly yields higher agreement and label it **synthetic demo data**. Never show invented numbers as real results.

### 5.4 Quality and polish (finals are in December, so there is time)
- Pixel-level design review. OpenCode cannot see images, so you or I must review screenshots.
- Hindi/Tamil native-speaker review.
- A guided **demo mode** for judges: "Suresh Kumar, Electrician" walkthrough from the PPT.
- Empty/loading/error states on every page.
- Mobile layout check (workers will use phones).
- Gemini quota handling (batching, graceful fallback when rate-limited).

### 5.5 Repo and security hygiene
- ~25 internal docs in repo root (`AUDIT.md`, `PHASE*-REPORT.md`, etc.): repo is **public**, move or remove on this branch.
- `screenshots-sih/` (16 PNGs) is tracked in git: untrack.
- Add an HTTP-referrer restriction to the Firebase web API key (after everything works).
- Never give OpenCode the full-admin service key; branch never merges; Firestore rules not deployed.

### 5.6 Not built / PPT promises to check
Compare each PPT claim to reality before finals:

| PPT claim | Reality |
|---|---|
| AI-Proposed ≠ AI-Decided | Built (human signs, `aiSuggestionUsed` flag), needs live proof |
| Per-criterion 1-4 rubric | Built, unverified live |
| Cohen's κ live | Built; computed seed κ = 0.38, not 0.71 |
| κ < 0.4 admin alert | Built, unverified live |
| Offline-first | Built (SW + IndexedDB), unverified live |
| 5-step pipeline | All steps exist in code; only Declare→Result verified |
| EN/HI/TA | Built; Hindi/Tamil unreviewed |
| Demo "Suresh Kumar, Electrician" | Demo loader exists; unverified |

---

## 6. Honest progress estimate (revised 14 Oct after the completion pass)
- **Code-complete versus PPT:** roughly **85%** (role model, guards, labels, overview all coherent now).
- **Verified (emulator e2e + API, not preview clicks):** roughly **70%** (auth, declare, scoring, demo load, κ + alert, access control, login chain/UI).
- **Demo-ready for judges:** about **60%** — the app works, but preview clicks (evidence, certify, suggestion, offline), console-error pass, and HI/TA review remain.
These are judgement estimates, not measurements.

---

## 7. Risks
1. **Unverified features** may fail when first exercised (assessor/admin flows have never been watched live).
2. **κ mismatch** with the submitted PPT could cost credibility if a judge checks.
3. **Weaker OpenCode models overclaim.** Always verify against the repo/screenshots.
4. **Free tiers** (Gemini, Vercel Hobby, Firebase Spark) can rate-limit during a demo; have a pre-seeded fallback.
5. **Public repo** with internal docs and a web API key in config.
6. **Shared Firebase project** with Quorena: careful with roles and rules.

---

## 8. Proposed roadmap (Oct → Dec)

| Phase | Goal | Output |
|---|---|---|
| **1. Prove it** (now) | Env vars, create 4 accounts, load demo data, click through every role | A checklist of what works/breaks, with screenshots |
| **2. Fix** | Bugs from 5.1 + whatever Phase 1 finds; role-guard cleanup | Next OpenCode prompt, driven by your test results |
| **3. Honest numbers** | Decide the κ story (5.3), update PPT/demo data | Consistent PPT ↔ app |
| **4. Polish** | Design review, mobile, empty states, HI/TA review, guided demo mode | Judge-ready UI |
| **5. Hygiene** | Clean repo, untrack screenshots, restrict API key | Safe public branch |
| **6. Rehearse** | Full demo script, offline fallback, backup recording | Finals-ready |

**Next step:** do Phase 1 steps 5.2 (1-3) first, then tell me what you see on `/rpl/admin` and the consistency page. I will turn the findings into the next OpenCode prompt.
