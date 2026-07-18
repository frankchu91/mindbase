#!/usr/bin/env bash
# Smoke-check plugin structure before publishing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

FAIL=0
check() {
  if [[ -e "$1" ]]; then
    echo "  ✓ $1"
  else
    echo "  ✗ MISSING: $1"
    FAIL=1
  fi
}

echo "→ Verifying ${PLUGIN_ROOT}"
check ".claude-plugin/plugin.json"
check ".claude-plugin/marketplace.json"
check ".mcp.json"
check "README.md"
check "mcp-server/dist/cli.js"

if [[ $FAIL -ne 0 ]]; then
  echo "✗ Verification failed. Run: pnpm -F @mindbase/plugin build"
  exit 1
fi
echo "✓ Plugin verified"
