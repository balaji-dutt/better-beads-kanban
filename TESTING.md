# Testing Documentation

This document describes the testing infrastructure for the Agent Native Abstraction Layer for Beads VS Code extension.

## Table of Contents

- [Extension Test Suite](#extension-test-suite)
- [Integration Tests](#integration-tests)
- [Continuous Improvement](#continuous-improvement)

## Extension Test Suite

`npm test` runs the VS Code extension tests via `@vscode/test-cli`, which downloads a
real VS Code build and runs the suites under `out/test/suite/`.

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
keeps CI green, since the workflow does not install bd.

### A note on performance testing

This document previously described a SQLite-based performance harness
(`scripts/generate-test-db.js`, `scripts/benchmark-loading.js`). Both were removed:
bd 1.x dropped the SQLite backend entirely in favour of Dolt, so neither script
could produce a database the extension can read. Any future performance work needs
to build its fixtures through the `bd` CLI, as the test suite above now does.

## Integration Tests

The project includes several integration test scripts to validate adapter behavior and data consistency:

### Test Scripts

| Script | Purpose | Command |
| -------- | --------- | --------- |
| `test-adapter-integration.js` | Test DaemonBeadsAdapter field mapping | `npm run test:adapter` |
| `test-bd-cli.js` | Test bd CLI integration | `npm run test:bd-cli` |
| `test-message-validation.js` | Test Zod validation schemas | `npm run test:validation` |
| `test-field-mapping.js` | Test field mapping between adapters | `npm run test:field-mapping` |
| `test-round-trip.js` | Test data round-trip consistency | `npm run test:round-trip` |
| `test-all.js` | Run all integration tests | `npm run test:all` |

### Running Tests

```bash
# Run all tests
npm test

# Run specific integration test
npm run test:adapter

# Run all integration tests
npm run test:all

# Run with coverage
npm run test:coverage
```

## Continuous Improvement

### Future Optimizations

1. **Virtual Scrolling** (beads-1iyo - Phase 2):
   - Further reduce DOM nodes for very large columns
   - Target: Support 1,000+ items per column without performance degradation
   - Estimated improvement: 50% faster rendering for large columns

2. **Index Optimization:**
   - Add composite indexes for common query patterns
   - Target: 20% faster count queries

3. **Caching Strategy:**
   - Cache column counts to avoid repeated queries
   - Target: 50% faster board refresh operations

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
