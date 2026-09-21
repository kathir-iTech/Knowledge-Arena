#!/bin/sh
# Quorena pre-push hook installer (macOS/Linux).
set -e
repo_root="$(git rev-parse --show-toplevel)"
source="$repo_root/scripts/git-hooks/pre-push"
target="$repo_root/.git/hooks/pre-push"

if [ ! -d "$repo_root/.git/hooks" ]; then
  echo "[install-git-hooks] No .git/hooks directory found."
  exit 1
fi

cp "$source" "$target"
chmod +x "$target"
echo "[install-git-hooks] Installed pre-push gate at .git/hooks/pre-push."
echo "[install-git-hooks] Next push will run: lint (ratchet) -> typecheck -> build."