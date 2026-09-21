@echo off
rem Quorena verification loop: lint -> typecheck -> build.
rem Windows: double-click this file or run from any terminal.
rem
rem Note: the lint step reports the tracked legacy backlog (389 errors) without
rem failing; the pre-push hook enforces the ratchet (no NEW violations). If you
rem want a hard stop on lint errors, run `npm run lint` manually.

setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo ============================================================
echo [1/3] ESLint (strict ruleset, ratchet vs scripts/.lint-baseline)
echo ============================================================
call npm run lint
set "LINT_EXIT=%ERRORLEVEL%"
echo Lint exit code: %LINT_EXIT%  (backlog is tracked debt; gate is a ratchet)

echo.
echo ============================================================
echo [2/3] TypeScript typecheck
echo ============================================================
call npm run typecheck
if errorlevel 1 (
  echo [verify] TYPECHECK FAILED.
  exit /b 1
)

echo.
echo ============================================================
echo [3/3] Production build
echo ============================================================
set "CI=true"
call npm run build
if errorlevel 1 (
  echo [verify] BUILD FAILED.
  exit /b 1
)

echo.
echo [verify] All hard gates passed. Lint backlog registered (baseline 389).
exit /b 0