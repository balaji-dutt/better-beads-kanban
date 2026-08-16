import * as assert from 'assert';
import { BEADS_WATCH_PATTERNS, shouldTriggerRefresh } from '../../beadsWatch';

// bd 1.x replaced SQLite with Dolt, so the old `.beads/**\/*.{db,sqlite,sqlite3}`
// glob could never match anything in a Dolt-backed repository and auto-refresh
// never fired. The patterns below are the contract; the predicate keeps the
// server's own churn from triggering a reload on every log line.

suite('BEADS_WATCH_PATTERNS', () => {
    test('watches both the bd-level files and the Dolt journal', () => {
        // Locks the contract: a regression back to a SQLite-only glob fails here.
        assert.deepStrictEqual([...BEADS_WATCH_PATTERNS], [
            '.beads/*',
            '.beads/{dolt,embeddeddolt}/*/.dolt/noms/*'
        ]);
    });

    test('the top-level pattern is present for Windows client mode', () => {
        // On Windows bd talks to a Dolt server hosted elsewhere and there is no
        // local dolt/ directory, so only the top-level pattern can ever fire.
        assert.ok(BEADS_WATCH_PATTERNS.includes('.beads/*'));
    });
});

suite('shouldTriggerRefresh', () => {
    const shouldRefresh = [
        '/repo/.beads/last-touched',
        '/repo/.beads/interactions.jsonl',
        '/repo/.beads/issues.jsonl',
        '/repo/.beads/beads.db',
        '/repo/.beads/dolt/dots/.dolt/noms/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
        '/repo/.beads/dolt/dots/.dolt/noms/manifest'
    ];

    for (const fsPath of shouldRefresh) {
        test(`refreshes on ${fsPath}`, () => {
            assert.strictEqual(shouldTriggerRefresh(fsPath), true);
        });
    }

    const shouldIgnore = [
        '/repo/.beads/dolt-server.log',
        '/repo/.beads/dolt-server.pid',
        '/repo/.beads/dolt-server.port',
        '/repo/.beads/dolt-server.lock',
        '/repo/.beads/.exclusive-lock',
        '/repo/.beads/.local_version',
        '/repo/.beads/bd.sock',
        '/repo/.beads/export-state.json',
        '/repo/.beads/in-progress-claude.json',
        '/repo/.beads/beads.db-wal',
        '/repo/.beads/beads.db-shm',
        '/repo/.beads/beads.db-journal',
        '/repo/.beads/dolt/dots/.dolt/noms/LOCK',
        '/repo/.beads/dolt/dots/.dolt/git-remote-cache/x/repo.git/objects/ab/cdef',
        '/repo/.beads/dolt/.dolt/stats/.dolt/noms/manifest',
        '/repo/.beads/dolt/dots/.dolt/noms/temptf/scratch',
        '/repo/.beads/dolt/dots/.dolt/noms/oldgen/chunk'
    ];

    for (const fsPath of shouldIgnore) {
        test(`ignores ${fsPath}`, () => {
            assert.strictEqual(shouldTriggerRefresh(fsPath), false);
        });
    }

    test('applies the same rules to Windows separators', () => {
        assert.strictEqual(shouldTriggerRefresh('C:\\repo\\.beads\\last-touched'), true);
        assert.strictEqual(shouldTriggerRefresh('C:\\repo\\.beads\\dolt-server.log'), false);
        assert.strictEqual(
            shouldTriggerRefresh('C:\\repo\\.beads\\dolt\\dots\\.dolt\\noms\\manifest'),
            true
        );
    });
});
