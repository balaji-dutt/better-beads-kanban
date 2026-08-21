# Testing Documentation

This document describes the testing infrastructure for the Better Beads Kanban VS Code extension.

## Table of Contents

- [Extension Test Suite](#extension-test-suite)
- [Writing a Test](#writing-a-test)
- [Integration Tests](#integration-tests)
- [Manual QA Before a Release](#manual-qa-before-a-release)
- [Continuous Improvement](#continuous-improvement)

## Extension Test Suite

`npm test` runs the VS Code extension tests via `@vscode/test-cli`, which downloads a
real VS Code build and runs the suites under `out/test/suite/`.

`npm run verify` is the full gate — `tsc --noEmit`, then `eslint`, then the suite. That
is what `scripts/release-fork-vsix.sh` runs before packaging, so it is the thing to run
before claiming work is done.

### The bd fixture

`src/test/suite/daemonAdapter.test.ts` exercises `DaemonBeadsAdapter` against a real
`bd` CLI, so it needs a real database. The suite builds a throwaway one in
`.test-workspace/` (gitignored):

- `bd init --non-interactive --prefix bktest` creates an embedded Dolt database.
  No external dolt server is required.
- A handful of issues are seeded through the adapter itself, spread across
  `open` / `in_progress` / `blocked` / `closed`, so the board assertions have data
  to check rather than short-circuiting on an empty board.
- The fixture is removed in `suiteTeardown`.

If `bd` is not on `PATH` the whole suite skips rather than failing. That is what
keeps CI green, since the workflow does not install bd. Use the `skipIfNoBd` guard
for any new test that shells out to `bd`.

### A note on performance testing

This document previously described a SQLite-based performance harness
(`scripts/generate-test-db.js`, `scripts/benchmark-loading.js`). Both were removed:
bd 1.x dropped the SQLite backend entirely in favour of Dolt, so neither script
could produce a database the extension can read. Any future performance work needs
to build its fixtures through the `bd` CLI, as the test suite above now does.

## Writing a Test

**The suite uses Mocha's `tdd` interface: `suite()` and `test()`, with node's built-in
`assert`.** This is set by `ui: 'tdd'` in `.vscode-test.mjs` and `src/test/suite/index.ts`.

Do not use `describe()` / `it()`, and do not import `chai`. Both `chai` and `sinon`
are present in `devDependencies` for historical reasons, but no test file imports
either — a test written against them will not register and will silently not run.

Taken from `src/test/suite/messages.test.ts`:

```typescript
import * as assert from 'assert';
import { migrateUIState } from '../../types';

suite('migrateUIState', () => {
    test('Returns null/undefined/primitive inputs unchanged', () => {
        assert.strictEqual(migrateUIState(null), null);
        assert.strictEqual(migrateUIState(undefined), undefined);
        assert.strictEqual(migrateUIState(42), 42);
    });
});
```

Two rules that have earned their place (see also the Security Rules in `CLAUDE.md`):

- **Assert the specific constraint named in the test title.** `assert.ok(x || !x)`
  always passes and has shipped here before.
- **When testing "rejects X", confirm the rejection is for the right reason.** A Zod
  schema rejecting your input because you misspelled a required field name is not
  evidence that it rejects X.

## Integration Tests

Standalone scripts that validate adapter behaviour and data consistency against a
real `bd`, outside the VS Code host:

| Script | Purpose | Command |
| -------- | --------- | --------- |
| `test-adapter-integration.js` | Test DaemonBeadsAdapter field mapping | `npm run test:adapter` |
| `test-bd-cli.js` | Test bd CLI integration | `npm run test:bd-cli` |
| `test-message-validation.js` | Test Zod validation schemas | `npm run test:validation` |
| `test-field-mapping.js` | Test field mapping between adapters | `npm run test:field-mapping` |
| `test-round-trip.js` | Test data round-trip consistency | `npm run test:round-trip` |
| `test-all.js` | Run all integration tests | `npm run test:all` |

`npm run test:all` writes a `test-summary.md` at the repo root. That file is a local
artifact and is gitignored — do not commit it.

### Running Tests

```bash
# Full gate: typecheck, lint, extension suite
npm run verify

# Extension suite only
npm test

# A specific integration script
npm run test:adapter

# All integration scripts
npm run test:all

# With coverage
npm run test:coverage
```

## Manual QA Before a Release

The automated suites do not touch the webview. Walk this before cutting a release
(see [RELEASING.md](RELEASING.md)); `scripts/seed-test-data.sh` gives you a
representative database to walk it against.

1. **Board load and filtering**
   - Board loads with the seeded dataset; column distribution looks right
     (Ready / In Progress / Blocked / Closed).
   - Search, Priority, Type and Status filters each narrow the board.
   - Status defaults to "Active" on a first load, so closed issues are hidden.
   - "Clear Filters" returns to that first-load default, not to all-checked.

2. **CRUD and status changes**
   - Create an issue through the dialog; edit an existing one through the same dialog.
   - In create mode, the relationship and comment sections stay disabled until the
     issue exists.
   - Update title, description, priority, type, assignee, estimate and dates.
   - Drag a card between columns and confirm the status actually changed in `bd show`.

3. **Table view**
   - Toggle between views; the same issues appear in each.
   - Sorting: single column by click, multi-column with Shift+click, default Updated desc.
   - Filtering by search, priority, type, status, assignee, labels.
   - Row click opens the detail dialog; clicking an ID copies it.
   - "Load More" pages in correctly.

4. **Tree view**
   - Hierarchy matches `bd list`'s tree output.
   - Filtering keeps matching issues visible with their ancestor chain dimmed as context.
   - Expansion state survives closing and reopening the panel.
   - Sibling sort (Updated / Priority / Title / Created) applies at every level.

5. **Graph view**
   - Renders dependency edges; nodes open the detail dialog.

6. **Relationships and labels**
   - Add and remove labels.
   - Add and remove parent-child and blocks dependencies.
   - `blocked_by` / `blocks` / `children` render correctly afterwards.

7. **Comments and markdown**
   - Add a comment containing markdown and a link; confirm it renders and is sanitized.
   - Oversized markdown is rejected with feedback rather than hanging the webview.

8. **Context actions**
   - "Add to Chat" and "Copy Context" both work end to end.
   - Large payloads are rejected with a clear message.

9. **Read-only mode**
   - Set `beadsKanban.readOnly` and confirm every mutation is blocked with feedback.

10. **Daemon actions**
    - Show status, list daemons, health check, restart, stop, logs.
    - The status bar reflects the actual daemon state.

11. **Error handling**
    - Open a folder with no `.beads` directory and confirm the error is actionable.
    - Point `beadsKanban.bdPath` at a nonexistent binary and confirm the failure is
      readable and does not leak internal paths.

## Continuous Improvement

### Future Optimizations

Virtual scrolling for very large columns is tracked as `bbk-jsi`: reduce DOM nodes so a
column can hold 1,000+ items without degrading. Incremental loading caps how many cards
are *loaded*, not how many end up in the DOM once they are.

### Testing Best Practices

1. **Test with realistic data**
   - Seed fixtures through the `bd` CLI so they match what the extension actually reads
   - Include dependencies, labels, and comments, not just bare issues

2. **Watch the pending count, not just the failure count**
   - A suite that skips is not a suite that passes
   - `daemonAdapter.test.ts` skips wholesale when `bd` is missing, which is easy to
     mistake for green

3. **Exercise both the schema and the CLI paths**
   - `messages.test.ts` / `security.test.ts` cover Zod validation in isolation
   - `daemonAdapter.test.ts` covers the round trip through the real `bd` binary
