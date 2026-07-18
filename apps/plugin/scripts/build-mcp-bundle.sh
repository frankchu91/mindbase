#!/usr/bin/env bash
# Build apps/mcp into apps/plugin/mcp-server/ for plugin packaging.
#
# Uses `pnpm deploy` to produce a fully self-contained mcp-server directory:
#   apps/plugin/mcp-server/
#   ├── dist/                (esbuild bundle from apps/mcp)
#   ├── node_modules/        (all runtime deps, including native bindings)
#   └── package.json         (production-only manifest)
#
# This is required because tsup marks runtime deps (@modelcontextprotocol/sdk,
# better-sqlite3, proper-lockfile, rss-parser, zod, etc.) as external — so the
# bundle needs a node_modules/ alongside it to resolve them.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${PLUGIN_ROOT}/../.." && pwd)"
DEST="${PLUGIN_ROOT}/mcp-server"

echo "→ Building mindbase-mcp"
cd "${REPO_ROOT}/apps/mcp"
pnpm build

echo "→ Deploying self-contained mcp-server → ${DEST}"
rm -rf "${DEST}"
# pnpm deploy: copies the workspace pkg + its production deps into DEST as a
# portable folder (no symlinks into the pnpm store, no dev deps).
# --legacy is needed because deploy has changed behavior across pnpm versions.
cd "${REPO_ROOT}"
pnpm deploy --filter=mindbase-mcp --prod --legacy "${DEST}"

echo "→ Verifying bundle can boot"
if [[ ! -f "${DEST}/dist/cli.js" ]]; then
  echo "✗ Missing ${DEST}/dist/index.js after deploy"
  exit 1
fi
if [[ ! -d "${DEST}/node_modules/@modelcontextprotocol" ]]; then
  echo "✗ Missing @modelcontextprotocol in ${DEST}/node_modules"
  exit 1
fi
# MCP servers are stdio-based: they read JSON-RPC from stdin. Sending EOF makes
# them exit 0 gracefully. If deps are missing they crash immediately with a
# non-zero exit. So: run with </dev/null; any non-zero exit code is a real bug.
if node "${DEST}/dist/cli.js" </dev/null >/tmp/mcp-verify.stdout 2>/tmp/mcp-verify.stderr; then
  echo "  ✓ MCP server boots cleanly (exit 0)"
else
  echo "✗ MCP server crashed on startup (exit $?)"
  echo "STDOUT:"; cat /tmp/mcp-verify.stdout
  echo "STDERR:"; cat /tmp/mcp-verify.stderr
  exit 1
fi

echo "→ Plugin MCP server ready at ${DEST}"
echo "  bundle:      $(ls -lh "${DEST}/dist/cli.js" | awk '{print $5}')"
echo "  node_modules: $(du -sh "${DEST}/node_modules" 2>/dev/null | awk '{print $1}')"
