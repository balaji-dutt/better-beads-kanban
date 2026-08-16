/**
 * Deciding which `.beads` filesystem events should refresh the board.
 *
 * The previous watcher globbed `.beads/**\/*.{db,sqlite,sqlite3}`. bd 1.x
 * replaced SQLite with Dolt, so a Dolt-backed repository contains no file with
 * any of those extensions and auto-refresh could never fire for it.
 *
 * Two patterns are needed, and neither is sufficient alone:
 *
 *   - `.beads/*` catches the bd-level write signals (`last-touched`,
 *     `interactions.jsonl`) and any legacy SQLite database. On Windows, bd runs
 *     as a client against a Dolt server hosted elsewhere and there is no local
 *     `dolt/` directory at all, so this is the only pattern that works there.
 *   - `.beads/{dolt,embeddeddolt}/*\/.dolt/noms/*` catches the Dolt journal and
 *     manifest, which are what actually change when the local server writes.
 *
 * The second pattern's segment count structurally excludes the server's own
 * statistics database (`dolt/.dolt/stats/.dolt/noms/**`) and the server-root
 * `dolt/.dolt/noms/**`, both of which churn independently of any issue change.
 *
 * This module has no `vscode` import so the rules can be unit-tested.
 */

export const BEADS_WATCH_PATTERNS: readonly string[] = [
    '.beads/*',
    '.beads/{dolt,embeddeddolt}/*/.dolt/noms/*'
];

/** Path segments that only ever contain server or sync scratch data. */
const DENIED_SEGMENTS = new Set(['git-remote-cache', 'temptf', 'oldgen', 'stats']);

/** Runtime files that change constantly without any issue changing. */
const DENIED_BASENAMES = new Set([
    'dolt-server.log',
    'dolt-server.pid',
    'dolt-server.port',
    'dolt-server.lock',
    'dolt-server.activity',
    'LOCK',
    '.local_version',
    '.exclusive-lock',
    'export-state.json',
    'push-state.json',
    'sync-state.json',
    'bd.sock',
    'bd.sock.startlock'
]);

/** Suffixes that mark a lock, journal or sidecar rather than real content. */
const DENIED_SUFFIXES = ['-wal', '-shm', '-journal', '.lock', '.sock'];

/**
 * True when a change at `fsPath` should trigger a board refresh.
 *
 * Biased towards returning true: a false positive costs one debounced `bd list`
 * that the caller's self-save guard usually swallows, whereas a false negative
 * is the defect this module exists to fix.
 */
export function shouldTriggerRefresh(fsPath: string): boolean {
    const normalized = fsPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter((segment) => segment.length > 0);
    const basename = segments.length > 0 ? segments[segments.length - 1] : '';

    if (segments.some((segment) => DENIED_SEGMENTS.has(segment))) {
        return false;
    }
    if (DENIED_BASENAMES.has(basename)) {
        return false;
    }
    if (DENIED_SUFFIXES.some((suffix) => basename.endsWith(suffix))) {
        return false;
    }
    // Per-harness claim files, e.g. in-progress-claude.json.
    if (/^in-progress-.*\.json$/.test(basename)) {
        return false;
    }

    return true;
}
