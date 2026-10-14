#!/usr/bin/env bash
# Offline checks; Node.js 18+ required. Override the executable with NODE.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="${NODE:-node}"
cd "$ROOT"
for source in app/js/*.js tools/*.js; do
  "$NODE" --check "$source"
done
bash tools/build-bundle.sh --check
"$NODE" --test tests/*.test.js
# Verify the public export allowlist, not the private development checkout.
PUBLIC_CHECK="$(mktemp -d)"
trap 'rm -rf "$PUBLIC_CHECK"' EXIT
"$NODE" tools/prepare-public.js "$PUBLIC_CHECK/source"
"$NODE" tools/privacy-audit.js --tree "$PUBLIC_CHECK/source"
