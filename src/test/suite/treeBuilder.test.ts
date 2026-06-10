import * as assert from 'assert';
import {
    buildDisplayTree,
    flattenVisibleRows,
    defaultExpanded,
    DEFAULT_TREE_SORT,
    TreeCardInput,
    TreeNode,
    TreeRow,
    TreeSortSpec
} from '../../webview/treeBuilder';

function card(id: string, parentId?: string, fields?: Partial<TreeCardInput>): TreeCardInput {
    return {
        id,
        title: id,
        ...(parentId ? { parent: { id: parentId, title: parentId } } : {}),
        ...fields
    };
}

function allIds(cards: TreeCardInput[]): Set<string> {
    return new Set(cards.map(c => c.id));
}

function ids(nodes: TreeNode[]): string[] {
    return nodes.map(n => n.id);
}

function findNode(roots: TreeNode[], id: string): TreeNode | undefined {
    for (const root of roots) {
        if (root.id === id) { return root; }
        const found = findNode(root.children, id);
        if (found) { return found; }
    }
    return undefined;
}

function collectIds(roots: TreeNode[]): string[] {
    const out: string[] = [];
    const walk = (n: TreeNode): void => { out.push(n.id); n.children.forEach(walk); };
    roots.forEach(walk);
    return out;
}

function rowById(rows: TreeRow[], id: string): TreeRow {
    const row = rows.find(r => r.id === id);
    assert.ok(row, `expected a row for ${id}`);
    return row as TreeRow;
}

const TITLE_ASC: TreeSortSpec = { id: 'title', dir: 'asc' };
const expandAll = (): boolean => true;

/**
 * Shared connector fixture (titles equal ids, sorted title asc):
 *   root1
 *   ├── a
 *   │   ├── a1
 *   │   │   └── a1x
 *   │   └── a2
 *   └── b
 *   root2
 */
function connectorFixture(): TreeCardInput[] {
    return [
        card('root1'),
        card('root2'),
        card('a', 'root1'),
        card('b', 'root1'),
        card('a1', 'a'),
        card('a2', 'a'),
        card('a1x', 'a1')
    ];
}

suite('treeBuilder buildDisplayTree — structure', () => {
    test('cards without a parent become sorted roots', () => {
        const cards = [card('b-root'), card('a-root'), card('c-root')];
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        assert.deepStrictEqual(ids(roots), ['a-root', 'b-root', 'c-root']);
        assert.ok(roots.every(r => r.depth === 0 && r.children.length === 0));
    });

    test('child nests under its parent with correct depth', () => {
        const cards = [card('p'), card('c', 'p'), card('gc', 'c')];
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        assert.deepStrictEqual(ids(roots), ['p']);
        assert.deepStrictEqual(ids(roots[0].children), ['c']);
        assert.deepStrictEqual(ids(roots[0].children[0].children), ['gc']);
        assert.strictEqual(findNode(roots, 'gc')?.depth, 2);
    });

    test('orphan whose parent is not in the input set becomes a root', () => {
        const cards = [card('p'), card('orphan', 'missing-parent')];
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        assert.deepStrictEqual(ids(roots), ['orphan', 'p']);
    });

    test('self-parent is treated as a root without looping', () => {
        const cards = [card('loner', 'loner'), card('p'), card('c', 'p')];
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        assert.deepStrictEqual(ids(roots), ['loner', 'p']);
        assert.deepStrictEqual(collectIds(roots).sort(), ['c', 'loner', 'p']);
    });

    test('two-node cycle renders every card exactly once', () => {
        const cards = [card('x', 'y'), card('y', 'x'), card('solo')];
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rendered = collectIds(roots);
        assert.deepStrictEqual([...rendered].sort(), ['solo', 'x', 'y']);
        assert.strictEqual(rendered.length, 3);
    });

    test('three-node cycle renders every card exactly once', () => {
        const cards = [card('ca', 'cb'), card('cb', 'cc'), card('cc', 'ca')];
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rendered = collectIds(roots);
        assert.deepStrictEqual([...rendered].sort(), ['ca', 'cb', 'cc']);
        assert.strictEqual(rendered.length, 3);
    });

    test('cycle breaking is deterministic regardless of input order', () => {
        const forward = [card('ca', 'cb'), card('cb', 'cc'), card('cc', 'ca')];
        const reversed = [...forward].reverse();
        const a = collectIds(buildDisplayTree(forward, allIds(forward), TITLE_ASC));
        const b = collectIds(buildDisplayTree(reversed, allIds(reversed), TITLE_ASC));
        assert.deepStrictEqual(a, b);
    });
});

suite('treeBuilder buildDisplayTree — filtering', () => {
    test('deep match pulls in the full ancestor chain as non-matching context', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, new Set(['a1x']), TITLE_ASC);
        assert.deepStrictEqual(collectIds(roots), ['root1', 'a', 'a1', 'a1x']);
        assert.strictEqual(findNode(roots, 'root1')?.matches, false);
        assert.strictEqual(findNode(roots, 'a')?.matches, false);
        assert.strictEqual(findNode(roots, 'a1')?.matches, false);
        assert.strictEqual(findNode(roots, 'a1x')?.matches, true);
    });

    test('descendantMatch is set on every ancestor of a match and nowhere else', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, new Set(['a1x', 'b']), TITLE_ASC);
        assert.strictEqual(findNode(roots, 'root1')?.descendantMatch, true);
        assert.strictEqual(findNode(roots, 'a')?.descendantMatch, true);
        assert.strictEqual(findNode(roots, 'a1')?.descendantMatch, true);
        assert.strictEqual(findNode(roots, 'a1x')?.descendantMatch, false);
        assert.strictEqual(findNode(roots, 'b')?.descendantMatch, false);
    });

    test('matching parent whose children all fail the filter renders with no children', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, new Set(['a1']), TITLE_ASC);
        const a1 = findNode(roots, 'a1');
        assert.ok(a1);
        assert.strictEqual(a1?.matches, true);
        assert.deepStrictEqual(a1?.children, []);
        const rows = flattenVisibleRows(roots, expandAll, true);
        assert.strictEqual(rowById(rows, 'a1').hasChildren, false);
    });

    test('no filter narrowing: every card renders and matches', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        assert.strictEqual(collectIds(roots).length, cards.length);
        const rows = flattenVisibleRows(roots, expandAll, false);
        assert.ok(rows.every(r => r.matches));
    });

    test('matched ids absent from the card list are ignored', () => {
        const cards = [card('p'), card('c', 'p')];
        const roots = buildDisplayTree(cards, new Set(['c', 'ghost']), TITLE_ASC);
        assert.deepStrictEqual(collectIds(roots), ['p', 'c']);
    });
});

suite('treeBuilder connectors', () => {
    test('hand-checked guides and joiners for the full fixture', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rows = flattenVisibleRows(roots, expandAll, false);
        assert.deepStrictEqual(
            rows.map(r => r.id),
            ['root1', 'a', 'a1', 'a1x', 'a2', 'b', 'root2']
        );
        // Equivalent of bd list's '', '├── ', '│   ├── ', '│   │   └── ',
        // '│   └── ', '└── ', '' prefixes.
        assert.deepStrictEqual(rowById(rows, 'root1').guides, []);
        assert.deepStrictEqual(rowById(rows, 'a').guides, []);
        assert.strictEqual(rowById(rows, 'a').isLast, false);
        assert.deepStrictEqual(rowById(rows, 'a1').guides, [true]);
        assert.strictEqual(rowById(rows, 'a1').isLast, false);
        assert.deepStrictEqual(rowById(rows, 'a1x').guides, [true, true]);
        assert.strictEqual(rowById(rows, 'a1x').isLast, true);
        assert.deepStrictEqual(rowById(rows, 'a2').guides, [true]);
        assert.strictEqual(rowById(rows, 'a2').isLast, true);
        assert.deepStrictEqual(rowById(rows, 'b').guides, []);
        assert.strictEqual(rowById(rows, 'b').isLast, true);
        assert.deepStrictEqual(rowById(rows, 'root2').guides, []);
    });

    test('blank spacer segment under a last-child ancestor', () => {
        // root → a (last child's subtree) gets a `false` guide segment where
        // bd list would print four spaces.
        const cards = [
            card('root'),
            card('a', 'root'),
            card('a1', 'a'),
            card('a1x', 'a1')
        ];
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rows = flattenVisibleRows(roots, expandAll, false);
        // a is root's only (last) child, so the segments for levels "a" and
        // "a1" are both blank — bd list would print eight spaces before a1x.
        assert.deepStrictEqual(rowById(rows, 'a1').guides, [false]);
        assert.deepStrictEqual(rowById(rows, 'a1x').guides, [false, false]);
        assert.strictEqual(rowById(rows, 'a1x').isLast, true);
    });

    test('last-sibling decisions follow the displayed tree, not the full tree', () => {
        const cards = connectorFixture();
        // Filter matches only a1x: a2 and b are filtered out, so a1 becomes
        // the last displayed child of a, and a the last displayed child of
        // root1 — no dangling guide columns under pruned branches.
        const roots = buildDisplayTree(cards, new Set(['a1x']), TITLE_ASC);
        const rows = flattenVisibleRows(roots, expandAll, true);
        assert.deepStrictEqual(rows.map(r => r.id), ['root1', 'a', 'a1', 'a1x']);
        assert.strictEqual(rowById(rows, 'a').isLast, true);
        assert.strictEqual(rowById(rows, 'a1').isLast, true);
        assert.deepStrictEqual(rowById(rows, 'a1').guides, [false]);
        assert.deepStrictEqual(rowById(rows, 'a1x').guides, [false, false]);
    });
});

suite('treeBuilder flattenVisibleRows — expansion', () => {
    test('default expansion shows roots and their immediate children only', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rows = flattenVisibleRows(roots, (_id, depth) => defaultExpanded(depth), false);
        assert.deepStrictEqual(rows.map(r => r.id), ['root1', 'a', 'b', 'root2']);
        const a = rowById(rows, 'a');
        assert.strictEqual(a.hasChildren, true);
        assert.strictEqual(a.expanded, false);
    });

    test('expanding a deeper node reveals its children', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rows = flattenVisibleRows(
            roots,
            (id, depth) => id === 'a' || defaultExpanded(depth),
            false
        );
        assert.deepStrictEqual(rows.map(r => r.id), ['root1', 'a', 'a1', 'a2', 'b', 'root2']);
    });

    test('collapsing a root hides its whole subtree', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rows = flattenVisibleRows(roots, () => false, false);
        assert.deepStrictEqual(rows.map(r => r.id), ['root1', 'root2']);
        assert.strictEqual(rowById(rows, 'root1').expanded, false);
    });

    test('with a filter active, collapsed ancestors of a match auto-expand', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, new Set(['a1x']), TITLE_ASC);
        const rows = flattenVisibleRows(roots, () => false, true);
        assert.deepStrictEqual(rows.map(r => r.id), ['root1', 'a', 'a1', 'a1x']);
    });

    test('with a filter active, collapsed branches without matches stay hidden', () => {
        const cards = connectorFixture();
        // b matches; a's subtree contains no match, so collapsing a hides it.
        const roots = buildDisplayTree(cards, new Set(['root1', 'a', 'b']), TITLE_ASC);
        const rows = flattenVisibleRows(
            roots,
            (id, depth) => id !== 'a' && defaultExpanded(depth),
            true
        );
        assert.deepStrictEqual(rows.map(r => r.id), ['root1', 'a', 'b']);
        assert.strictEqual(rowById(rows, 'a').expanded, false);
    });

    test('without a filter, expansion state fully governs visibility', () => {
        const cards = connectorFixture();
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rows = flattenVisibleRows(roots, (id, depth) => id !== 'a' && defaultExpanded(depth), false);
        assert.deepStrictEqual(rows.map(r => r.id), ['root1', 'a', 'b', 'root2']);
    });

    test('leaf rows report expanded false even when marked expanded', () => {
        const cards = [card('only')];
        const roots = buildDisplayTree(cards, allIds(cards), TITLE_ASC);
        const rows = flattenVisibleRows(roots, expandAll, false);
        assert.strictEqual(rowById(rows, 'only').expanded, false);
        assert.strictEqual(rowById(rows, 'only').hasChildren, false);
    });
});

suite('treeBuilder sorting', () => {
    function sortFixture(): TreeCardInput[] {
        return [
            card('p1', undefined, { title: 'Beta', priority: 1, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' }),
            card('p2', undefined, { title: 'alpha', priority: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-03T00:00:00Z' }),
            card('c1', 'p1', { title: 'zeta', priority: 0, created_at: '2026-01-05T00:00:00Z', updated_at: '2026-02-02T00:00:00Z' }),
            card('c2', 'p1', { title: 'Echo', priority: 2, created_at: '2026-01-04T00:00:00Z', updated_at: '2026-02-04T00:00:00Z' })
        ];
    }

    function rootOrder(cards: TreeCardInput[], sort: TreeSortSpec): string[] {
        return ids(buildDisplayTree(cards, allIds(cards), sort));
    }

    function childOrder(cards: TreeCardInput[], sort: TreeSortSpec, parentId: string): string[] {
        const roots = buildDisplayTree(cards, allIds(cards), sort);
        return ids(findNode(roots, parentId)?.children || []);
    }

    test('title sort is case-insensitive, both directions', () => {
        const cards = sortFixture();
        assert.deepStrictEqual(rootOrder(cards, { id: 'title', dir: 'asc' }), ['p2', 'p1']);
        assert.deepStrictEqual(rootOrder(cards, { id: 'title', dir: 'desc' }), ['p1', 'p2']);
    });

    test('priority sort, both directions', () => {
        const cards = sortFixture();
        assert.deepStrictEqual(childOrder(cards, { id: 'priority', dir: 'asc' }, 'p1'), ['c1', 'c2']);
        assert.deepStrictEqual(childOrder(cards, { id: 'priority', dir: 'desc' }, 'p1'), ['c2', 'c1']);
    });

    test('created_at sort, both directions', () => {
        const cards = sortFixture();
        assert.deepStrictEqual(rootOrder(cards, { id: 'created_at', dir: 'asc' }), ['p2', 'p1']);
        assert.deepStrictEqual(rootOrder(cards, { id: 'created_at', dir: 'desc' }), ['p1', 'p2']);
    });

    test('updated_at sort, both directions', () => {
        const cards = sortFixture();
        assert.deepStrictEqual(childOrder(cards, { id: 'updated_at', dir: 'asc' }, 'p1'), ['c1', 'c2']);
        assert.deepStrictEqual(childOrder(cards, { id: 'updated_at', dir: 'desc' }, 'p1'), ['c2', 'c1']);
    });

    test('sort applies independently at each level', () => {
        const cards = sortFixture();
        const sort: TreeSortSpec = { id: 'priority', dir: 'asc' };
        assert.deepStrictEqual(rootOrder(cards, sort), ['p1', 'p2']);
        assert.deepStrictEqual(childOrder(cards, sort, 'p1'), ['c1', 'c2']);
    });

    test('missing priority defaults to medium (2)', () => {
        const cards = [
            card('np', undefined, { title: 'no priority' }),
            card('hi', undefined, { priority: 0 }),
            card('lo', undefined, { priority: 3 })
        ];
        assert.deepStrictEqual(rootOrder(cards, { id: 'priority', dir: 'asc' }), ['hi', 'np', 'lo']);
    });

    test('ties break by id ascending regardless of direction', () => {
        const cards = [
            card('zz', undefined, { priority: 1 }),
            card('aa', undefined, { priority: 1 })
        ];
        assert.deepStrictEqual(rootOrder(cards, { id: 'priority', dir: 'asc' }), ['aa', 'zz']);
        assert.deepStrictEqual(rootOrder(cards, { id: 'priority', dir: 'desc' }), ['aa', 'zz']);
    });

    test('DEFAULT_TREE_SORT is updated_at descending', () => {
        assert.deepStrictEqual(DEFAULT_TREE_SORT, { id: 'updated_at', dir: 'desc' });
    });
});

suite('treeBuilder defaultExpanded', () => {
    test('top-level rows default expanded, deeper rows collapsed', () => {
        assert.strictEqual(defaultExpanded(0), true);
        assert.strictEqual(defaultExpanded(1), false);
        assert.strictEqual(defaultExpanded(5), false);
    });
});
