#!/usr/bin/env bash
# THE verification battery — single implementation (CI, /deploy-checklist and
# the push-gate hook both call this; CLAUDE.md "Verification" documents it).
# Modes:
#   quick (default) — mobile tsc+jest, admin tsc, web tsc + css parse,
#     backend load + node:test.
#     Used by the push-gate before every push: fast, catches whole classes.
#   full — quick + RN release bundle + admin build + web build.
#     Used by CI and before deploys.
# Contract: a failing step does NOT stop the run —
# everything is attempted, then reported together. Missing node_modules is a
# FAILURE, not a skip: what cannot be verified is not verified.
set -uo pipefail
cd "$(dirname "$0")/../.."
mode="${1:-quick}"

declare -a results=()
fail=0

step() { # step <name> <dir> <command...>
  local name="$1" dir="$2"; shift 2
  if [ ! -d "$dir/node_modules" ]; then
    results+=("FAIL  $name — $dir/node_modules missing (run: cd $dir && npm ci)")
    fail=1; return
  fi
  if (cd "$dir" && "$@") >/tmp/pati-verify-step.log 2>&1; then
    results+=("ok    $name")
  else
    results+=("FAIL  $name")
    echo "--- $name output (last 25 lines) ---"
    tail -25 /tmp/pati-verify-step.log
    fail=1
  fi
}

step "mobile tsc"      mobile  npx tsc --noEmit
step "mobile jest"     mobile  npx jest --ci
step "admin tsc"       admin   npx tsc --noEmit
step "web tsc"         web     npx tsc --noEmit
# The stylesheet is hand-merged at the end of every track; an unbalanced
# brace nests the rest of the file into one rule and the build still
# passes (2026-09-08 merge). esbuild's CSS parser refuses it here.
step "web css"         web     npx esbuild src/theme.css --log-override:css-syntax-error=error --outfile=/tmp/pati-theme-check.css
step "backend load"    backend node -e "require('./src/app.js')"
# The backend's only unit tests so far (badge thresholds); node:test, no
# database needed. No path argument: a bare directory is not a test file
# to node:test (it fails with "test failed"), the default discovery
# (**/*.test.js, node_modules excluded) is what we want.
step "backend test"    backend node --test

if [ "$mode" = "full" ]; then
  step "mobile bundle" mobile  npx react-native bundle --platform ios --dev false --entry-file index.js --bundle-output /tmp/pati-bundle.js
  step "admin build"   admin   npm run build
  step "web build"     web     npm run build
fi

echo ""
echo "=== verify ($mode) ==="
printf '%s\n' "${results[@]}"
exit $fail
