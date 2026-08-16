/**
 * Locating the Beads repository for a VS Code window.
 *
 * The extension used to assume `workspaceFolders[0]`, which happened to work
 * only because the folder holding `.beads` was listed first. In a multi-root
 * workspace where it is not first, or when a subfolder of the repo is opened
 * directly, the board pointed at the wrong directory and bd reported a missing
 * database.
 *
 * This module is deliberately free of any `vscode` import so the resolution
 * rules can be unit-tested without an Extension Development Host. The caller
 * injects the filesystem probe.
 */
import * as path from 'path';

export const BEADS_DIR = '.beads';

/**
 * workspaceState key holding the folder chosen through the repository picker.
 * Namespaced to match the `beadsKanban.uiState` key already in use; the old
 * un-namespaced `beadsRepoPath` was written but never read.
 */
export const REPO_PATH_STATE_KEY = 'beadsKanban.repoPath';

/** Levels to climb before giving up, so an unrelated ancestor cannot be adopted. */
export const DEFAULT_MAX_ASCEND = 6;

export type BeadsResolution =
    | { kind: 'persisted'; root: string; candidates: string[] }
    | { kind: 'direct'; root: string; candidates: string[] }
    | { kind: 'ancestor'; root: string; candidates: string[] }
    | { kind: 'none'; root: string | null; candidates: [] };

export interface ResolveInput {
    /** Workspace root paths, in workspaceFolders index order. */
    roots: string[];
    /** Previously picked folder, which may since have moved or been deleted. */
    persisted?: string;
    /** True when `<repoRoot>/.beads` exists and is a directory. */
    hasBeadsDir: (repoRoot: string) => boolean;
    maxAscend?: number;
}

/**
 * Resolve the folder that contains `.beads`.
 *
 * Order:
 *   1. the persisted picker choice, if it still has a `.beads` directory —
 *      an explicit user action outranks any guess;
 *   2. the first workspace root that directly contains `.beads`;
 *   3. an upward walk from each root, bounded by `maxAscend`;
 *   4. `roots[0]`, so behaviour is never worse than before.
 *
 * Steps 2 and 3 are separate passes on purpose: a direct hit in the second
 * root must beat an ancestor hit above the first.
 */
export function resolveBeadsRoot(input: ResolveInput): BeadsResolution {
    const { roots, persisted, hasBeadsDir } = input;
    const maxAscend = input.maxAscend ?? DEFAULT_MAX_ASCEND;

    if (persisted && hasBeadsDir(persisted)) {
        return { kind: 'persisted', root: persisted, candidates: [persisted] };
    }

    const direct = roots.filter((root) => hasBeadsDir(root));
    if (direct.length > 0) {
        return { kind: 'direct', root: direct[0], candidates: direct };
    }

    for (const root of roots) {
        // Pass 1 already tested the root itself, so start at its parent.
        let dir = path.dirname(root);
        for (let level = 0; level < maxAscend; level++) {
            if (hasBeadsDir(dir)) {
                return { kind: 'ancestor', root: dir, candidates: [dir] };
            }
            const parent = path.dirname(dir);
            if (parent === dir) {
                break; // filesystem root
            }
            dir = parent;
        }
    }

    return { kind: 'none', root: roots.length > 0 ? roots[0] : null, candidates: [] };
}

/** One-line summary for the output channel. */
export function describeResolution(resolution: BeadsResolution): string {
    switch (resolution.kind) {
        case 'persisted':
            return `Using previously selected repository: ${resolution.root}`;
        case 'direct':
            return resolution.candidates.length > 1
                ? `Found ${BEADS_DIR} in ${resolution.candidates.length} workspace roots; using ${resolution.root} (others: ${resolution.candidates.slice(1).join(', ')})`
                : `Found ${BEADS_DIR} in workspace root: ${resolution.root}`;
        case 'ancestor':
            return `No workspace root contains ${BEADS_DIR}; using ancestor: ${resolution.root}`;
        case 'none':
            return resolution.root === null
                ? `No workspace folder is open; cannot locate ${BEADS_DIR}.`
                : `No ${BEADS_DIR} directory found; falling back to ${resolution.root}`;
    }
}
