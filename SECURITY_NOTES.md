# Quorena — Dependency Security Notes (Phase 114, Tier 2)

**Date:** 2026-09-04
**Scope:** Runtime dependency cleanup + `npm audit` triage

## Resolved via safe `package.json` overrides (within existing semver ranges)

These advisories were fixed by pinning patched versions that remain inside each
parent's existing constraint, so no behavior/compat risk:

| Package | Before | Patched | Advisory fixed |
|---------|--------|---------|----------------|
| `brace-expansion` | 2.1.2 | 2.1.4 | GHSA-rgw5-rvv9-x895 (DoS) |
| `fast-uri` | 3.1.3 | 3.1.6 | ReDoS |
| `nanoid` | 3.3.15 | 3.3.18 | ReDoS |
| `fast-xml-parser` | 5.9.3 | 5.10.1 | XXE / parser issues |
| `ip-address` | 10.2.0 | 10.3.1 | informational IP input |

Verified: `npm audit` no longer reports any of the above packages.

## Removed dead dependencies (Phase 114 Tier 2)

Zero imports in `src/`; only referenced in docs/lock. Removed 6 packages:
`@radix-ui/react-accordion`, `@radix-ui/react-menubar`, `@radix-ui/react-popover`,
`@radix-ui/react-progress`, `@vercel/speed-insights`, `react-is`.

Also bumped `next` from `^15.5.9` → `^15.5.20` (security patches).

## Known / intentionally unfixed (gated transitive chain)

`npm audit fix` is not usable: it hangs on the genkit/OTEL chain, and `--force`
would downgrade genkit to 0.5.17 (breaking change). After the targeted overrides,
**68 vulnerabilities remain (58 moderate, 10 high)** — all transitively reachable
only via one of:

1. **firebase-admin → @google-cloud/firestore | @google-cloud/storage → google-gax /
   googleapis-common / gaxios / teeny-request / retry-request → uuid** — fixing
   requires a firebase-admin major bump (not available / breaking). Also
   pulls `@google-cloud/opentelemetry-*` + `@opentelemetry/auto-instrumentations-node`.
2. **genkit → genkit-cli / @genkit-ai/tools-common → js-yaml, adm-zip** —
   dev-only chain; blocking `npm audit fix` (see above).
3. **next → sharp 0.34.x** — inherited libvips CVEs
   (GHSA-f88m-g3jw-g9cj; CVE-2026-33327/33328/35590/35591). Fixed only in sharp
   0.35.x, which is a major bump outside next's `^0.34.3` requirement.

**Mitigation stance:** none of these packages accept untrusted input on the
request path in a way reachable from this app's API surface; they are runtime
supporting libraries (Firestore/GCS SDKs, OTEL/observability, image lib, dev
CLI tooling). Revisit on next Firebase Admin / Genkit / Next major release.

## Sanity

- `npx tsc --noEmit` — clean (exit 0)
- `npm run build` — passes (exit 0)
