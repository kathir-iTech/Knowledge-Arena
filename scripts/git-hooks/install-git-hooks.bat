@echo off
rem Quorena pre-push hook installer (Windows).
rem Copies scripts\git-hooks\pre-push into the local .git\hooks\ directory.

setlocal enabledelayedexpansion
set "SOURCE_HOOK=%~dp0pre-push"

for /f "delims=" %%i in ('git rev-parse --show-toplevel') do set "REPO_ROOT=%%i"
if not defined REPO_ROOT (
  echo [install-git-hooks] Could not determine the git repository root.
  exit /b 1
)

if not exist "%REPO_ROOT%\.git\hooks" (
  echo [install-git-hooks] No .git\hooks directory found — not a git work tree?
  exit /b 1
)

copy /Y "%SOURCE_HOOK%" "%REPO_ROOT%\.git\hooks\pre-push" >nul
if errorlevel 1 (
  echo [install-git-hooks] Copy failed.
  exit /b 1
)

echo [install-git-hooks] Installed pre-push gate at .git\hooks\pre-push.
echo [install-git-hooks] Next push will run: lint (ratchet) -^> typecheck -^> build.
echo [install-git-hooks] Re-run this installer after every `git clone` / re-init.
exit /b 0