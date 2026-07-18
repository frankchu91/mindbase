# Contributing to MindBase

Thanks for your interest in contributing! Here's how to get started.

## Setup

```bash
git clone https://github.com/frankchu91/mindbase.git
cd mindbase
pnpm install
pnpm test        # Make sure everything passes
```

## Project Structure

- `packages/core/` -- framework-agnostic library (storage, wiki index, graph, compile, search, adapters)
- `apps/mcp/` -- MCP server (published to npm as `mindbase-mcp`)
- `apps/plugin/` -- Claude Code plugin (slash commands, sub-agents, hooks; bundles the MCP server)
- `apps/server/` -- Express API server (serves the web UI + `/api/tree/*`)
- `apps/web/` -- React 19 + Vite + Zustand frontend
- `apps/browser-ext/` -- browser extension (web clipper)

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `pnpm test` and `pnpm typecheck` to verify
4. Submit a pull request

## Code Style

- TypeScript strict mode (`strict: true`)
- No unused imports or variables
- Tests live next to source files (`foo.test.ts` alongside `foo.ts`) in `packages/core`
- Use the existing patterns -- check nearby files before introducing new abstractions

## Tests

```bash
pnpm -F @mindbase/core test       # Core library tests
pnpm -F @mindbase/core test:watch # Watch mode
```

All new features in `packages/core` should include tests.

## Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
