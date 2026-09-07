# Superseded — see ARCHITECTURE.md (repo root)

This file is a **legacy duplicate** of the canonical architecture document and is now **out of date on purpose**.

It previously described: `pdfreader` (now `pdfjs-dist`), Gemini `2.0 Flash` (shut down 2026-06-01; Forge uses `gemini-3.6-flash` → `gemini-3.5-flash`, catalog default `gemini-2.5-flash-lite`), a `score = 500 + 500 × max(0, 1 − elapsed / timeLimit)` scoring formula (dead legacy code in `src/services/game.service.ts:111` — live scoring is `computeCorrectScore` in `src/lib/battle-machine.ts:77` with per-arena max/min config), a 5-state quiz machine, "SlidingWindowLimiter", and other claims that no longer match the code.

**The up-to-date, code-grounded reference is [`ARCHITECTURE.md`](../ARCHITECTURE.md) at the repository root.** Treat this file as deleted; it exists only to prevent stale links from resolving to confidently-wrong content.