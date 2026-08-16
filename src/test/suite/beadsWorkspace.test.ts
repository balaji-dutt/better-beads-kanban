import * as assert from 'assert';
import * as path from 'path';
import {
    resolveBeadsRoot,
    describeResolution,
    DEFAULT_MAX_ASCEND
} from '../../beadsWorkspace';

// The extension used to assume workspaceFolders[0]. These cases pin the
// replacement: an explicit picker choice outranks discovery, a direct hit in
// any root outranks an ancestor hit above any other root, and the fallback
// never behaves worse than the old index-0 assumption.

const probe = (withBeads: string[]) => {
    const set = new Set(withBeads);
    return (repoRoot: string) => set.has(repoRoot);
};

const ROOT_A = path.join(path.sep, 'work', 'alpha');
const ROOT_B = path.join(path.sep, 'work', 'beta');
const NESTED = path.join(ROOT_A, 'src', 'webview');

suite('resolveBeadsRoot', () => {
    test('no workspace folders yields no root', () => {
        const result = resolveBeadsRoot({ roots: [], hasBeadsDir: probe([]) });

        assert.strictEqual(result.kind, 'none');
        assert.strictEqual(result.root, null);
    });

    test('a single root containing .beads resolves directly', () => {
        const result = resolveBeadsRoot({ roots: [ROOT_A], hasBeadsDir: probe([ROOT_A]) });

        assert.strictEqual(result.kind, 'direct');
        assert.strictEqual(result.root, ROOT_A);
    });

    test('finds .beads in the second root - the original defect', () => {
        const result = resolveBeadsRoot({
            roots: [ROOT_A, ROOT_B],
            hasBeadsDir: probe([ROOT_B])
        });

        assert.strictEqual(result.kind, 'direct');
        assert.strictEqual(result.root, ROOT_B);
    });

    test('several roots with .beads: first wins, all are reported', () => {
        const result = resolveBeadsRoot({
            roots: [ROOT_A, ROOT_B],
            hasBeadsDir: probe([ROOT_A, ROOT_B])
        });

        assert.strictEqual(result.kind, 'direct');
        assert.strictEqual(result.root, ROOT_A);
        assert.deepStrictEqual(result.candidates, [ROOT_A, ROOT_B]);
    });

    test('walks upward when no root contains .beads', () => {
        const result = resolveBeadsRoot({ roots: [NESTED], hasBeadsDir: probe([ROOT_A]) });

        assert.strictEqual(result.kind, 'ancestor');
        assert.strictEqual(result.root, ROOT_A);
    });

    test('a direct hit in root B beats an ancestor hit above root A', () => {
        // The two passes exist for exactly this case: a single-pass loop over
        // roots would adopt ROOT_A's parent before ever testing ROOT_B.
        const result = resolveBeadsRoot({
            roots: [NESTED, ROOT_B],
            hasBeadsDir: probe([ROOT_A, ROOT_B])
        });

        assert.strictEqual(result.kind, 'direct');
        assert.strictEqual(result.root, ROOT_B);
    });

    test('the upward walk is bounded by maxAscend', () => {
        const deep = path.join(ROOT_A, 'a', 'b', 'c', 'd', 'e', 'f', 'g');

        assert.strictEqual(
            resolveBeadsRoot({ roots: [deep], hasBeadsDir: probe([ROOT_A]), maxAscend: 2 }).kind,
            'none'
        );
        assert.strictEqual(
            resolveBeadsRoot({ roots: [deep], hasBeadsDir: probe([ROOT_A]), maxAscend: 20 }).kind,
            'ancestor'
        );
    });

    test('the upward walk terminates at the filesystem root', () => {
        // Would hang or throw if the dirname fixed point were not handled.
        const result = resolveBeadsRoot({
            roots: [path.sep],
            hasBeadsDir: probe([]),
            maxAscend: DEFAULT_MAX_ASCEND
        });

        assert.strictEqual(result.kind, 'none');
        assert.strictEqual(result.root, path.sep);
    });

    test('a valid persisted choice outranks discovery', () => {
        const result = resolveBeadsRoot({
            roots: [ROOT_A],
            persisted: ROOT_B,
            hasBeadsDir: probe([ROOT_A, ROOT_B])
        });

        assert.strictEqual(result.kind, 'persisted');
        assert.strictEqual(result.root, ROOT_B);
    });

    test('a stale persisted choice is ignored', () => {
        const result = resolveBeadsRoot({
            roots: [ROOT_A],
            persisted: path.join(path.sep, 'gone'),
            hasBeadsDir: probe([ROOT_A])
        });

        assert.strictEqual(result.kind, 'direct');
        assert.strictEqual(result.root, ROOT_A);
    });

    test('an empty persisted value is ignored', () => {
        const result = resolveBeadsRoot({
            roots: [ROOT_A],
            persisted: '',
            hasBeadsDir: probe([ROOT_A])
        });

        assert.strictEqual(result.kind, 'direct');
    });

    test('falls back to the first root, never worse than the old behaviour', () => {
        const result = resolveBeadsRoot({
            roots: [ROOT_A, ROOT_B],
            hasBeadsDir: probe([])
        });

        assert.strictEqual(result.kind, 'none');
        assert.strictEqual(result.root, ROOT_A);
    });
});

suite('describeResolution', () => {
    test('names the chosen root for every kind', () => {
        const kinds = [
            resolveBeadsRoot({ roots: [ROOT_A], hasBeadsDir: probe([ROOT_A]) }),
            resolveBeadsRoot({ roots: [ROOT_A, ROOT_B], hasBeadsDir: probe([ROOT_A, ROOT_B]) }),
            resolveBeadsRoot({ roots: [NESTED], hasBeadsDir: probe([ROOT_A]) }),
            resolveBeadsRoot({ roots: [ROOT_A], persisted: ROOT_B, hasBeadsDir: probe([ROOT_B]) })
        ];

        for (const resolution of kinds) {
            assert.ok(describeResolution(resolution).includes(resolution.root as string));
        }
    });

    test('says so when nothing is open', () => {
        const described = describeResolution(resolveBeadsRoot({ roots: [], hasBeadsDir: probe([]) }));

        assert.ok(described.length > 0);
        assert.ok(!described.includes('null'));
    });
});
