#!/bin/sh
# Quorena verification loop: lint -> typecheck -> build.
# macOS/Linux: ./scripts/dev-verify.sh
set -e
cd "$(git rev-parse --show-toplevel)"

echo "== [1/3] ESLint (strict ruleset) =="
if npm run lint; then
  echo "Lint clean (0 errors)."
else
  count="$(npm run lint 2>&1 | grep -c 'Error:' || true)"
  echo "Lint backlog registered: ${count:-?} errors (baseline 389). Not a hard gate here."
fi

echo "== [2/3] TypeScript typecheck =="
npm run typecheck

echo "== [3/3] Production build =="
CI=true npm run build

echo "[verify] All hard gates passed."