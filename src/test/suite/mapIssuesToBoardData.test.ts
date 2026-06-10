import * as assert from 'assert';
import * as vscode from 'vscode';
import { DaemonBeadsAdapter } from '../../daemonBeadsAdapter';
import { BoardCard, BoardData, EnrichedCard } from '../../types';

/**
 * Pure data-mapping tests for DaemonBeadsAdapter.mapIssuesToBoardData.
 *
 * These tests do not hit the bd daemon — they pass synthetic issue objects
 * (matching the `bd show --json` shape) directly into the private mapper
 * and assert that each card's parent/children/blocked_by/blocks fields are
 * populated from the issue's OWN `dependencies` / `dependents` arrays,
 * not from a cross-issue lookup that breaks when the related issue lives
 * in a different column slice.
 */
suite('DaemonBeadsAdapter mapIssuesToBoardData', () => {
    let adapter: DaemonBeadsAdapter;
    let output: vscode.OutputChannel;

    function callMap(issues: unknown[]): BoardData {
        return (adapter as unknown as {
            mapIssuesToBoardData(issues: unknown[]): BoardData;
        }).mapIssuesToBoardData(issues);
    }

    function findCard(data: BoardData, id: string): BoardCard {
        const card = (data.cards || []).find(c => c.id === id);
        if (!card) {
            assert.fail(`Card ${id} not present in mapped board data`);
        }
        return card;
    }

    /** Minimal scaffold for an issue payload that satisfies mapIssuesToBoardData. */
    function makeIssue(overrides: Record<string, unknown>): Record<string, unknown> {
        return {
            id: 'beads-test',
            title: 'Test Issue',
            description: '',
            status: 'open',
            priority: 2,
            issue_type: 'task',
            created_at: '2025-01-01T00:00:00Z',
            created_by: 'tester',
            updated_at: '2025-01-01T00:00:00Z',
            dependencies: [],
            dependents: [],
            ...overrides
        };
    }

    setup(() => {
        output = vscode.window.createOutputChannel('Test');
        // Workspace root is unused by mapIssuesToBoardData; an empty string is fine.
        adapter = new DaemonBeadsAdapter('', output);
    });

    teardown(() => {
        try { adapter.dispose(); } catch { /* ignore */ }
        try { output.dispose(); } catch { /* ignore */ }
    });

    test('child card exposes parent when parent issue is absent from batch', () => {
        // Cross-slice scenario: only the child is in the batch.
        const child = makeIssue({
            id: 'beads-child',
            title: 'Child Issue',
            dependencies: [
                {
                    id: 'beads-parent',
                    title: 'Parent Issue',
                    created_at: '2025-01-01T00:00:00Z',
                    created_by: 'tester',
                    dependency_type: 'parent-child'
                }
            ]
        });

        const data = callMap([child]);
        const card = findCard(data, 'beads-child');

        assert.ok(card.parent, 'child card should have parent populated');
        assert.strictEqual(card.parent?.id, 'beads-parent');
        assert.strictEqual(card.parent?.title, 'Parent Issue');
    });

    test('parent card exposes children when child issues are absent from batch', () => {
        // Cross-slice scenario: only the parent is in the batch.
        const parent = makeIssue({
            id: 'beads-parent',
            title: 'Parent Issue',
            dependents: [
                {
                    id: 'beads-child-a',
                    title: 'Child A',
                    created_at: '2025-01-01T00:00:00Z',
                    created_by: 'tester',
                    dependency_type: 'parent-child'
                },
                {
                    id: 'beads-child-b',
                    title: 'Child B',
                    created_at: '2025-01-01T00:00:00Z',
                    created_by: 'tester',
                    dependency_type: 'parent-child'
                }
            ]
        });

        const data = callMap([parent]);
        const card = findCard(data, 'beads-parent');

        assert.ok(Array.isArray(card.children), 'parent card should have children array');
        assert.strictEqual(card.children?.length, 2);
        const childIds = (card.children || []).map(c => c.id).sort();
        assert.deepStrictEqual(childIds, ['beads-child-a', 'beads-child-b']);
    });

    test('blocked card exposes blocked_by when blocker issue is absent from batch', () => {
        // Cross-slice scenario: only the blocked issue is in the batch.
        const blocked = makeIssue({
            id: 'beads-blocked',
            title: 'Blocked Issue',
            status: 'open',
            dependencies: [
                {
                    id: 'beads-blocker',
                    title: 'Blocker Issue',
                    created_at: '2025-01-01T00:00:00Z',
                    created_by: 'tester',
                    dependency_type: 'blocks'
                }
            ]
        });

        const data = callMap([blocked]);
        const card = findCard(data, 'beads-blocked');

        assert.ok(Array.isArray(card.blocked_by), 'blocked card should have blocked_by array');
        assert.strictEqual(card.blocked_by?.length, 1);
        assert.strictEqual(card.blocked_by?.[0].id, 'beads-blocker');
        assert.strictEqual(card.blocked_by_count, 1, 'blocked_by_count should match blocker count');
        assert.strictEqual(card.is_ready, false, 'open issue with a blocker must not be ready');
    });

    test('blocker card exposes blocks when blocked issue is absent from batch', () => {
        // Cross-slice scenario: only the blocker is in the batch.
        const blocker = makeIssue({
            id: 'beads-blocker',
            title: 'Blocker Issue',
            dependents: [
                {
                    id: 'beads-blocked',
                    title: 'Blocked Issue',
                    created_at: '2025-01-01T00:00:00Z',
                    created_by: 'tester',
                    dependency_type: 'blocks'
                }
            ]
        });

        const data = callMap([blocker]);
        const card = findCard(data, 'beads-blocker');

        assert.ok(Array.isArray(card.blocks), 'blocker card should have blocks array');
        assert.strictEqual(card.blocks?.length, 1);
        assert.strictEqual(card.blocks?.[0].id, 'beads-blocked');
    });

    test('open issue with no blockers is ready and has empty relationship arrays undefined', () => {
        const standalone = makeIssue({ id: 'beads-solo', status: 'open' });

        const data = callMap([standalone]);
        const card = findCard(data, 'beads-solo');

        assert.strictEqual(card.is_ready, true, 'open issue with no blockers should be ready');
        assert.strictEqual(card.blocked_by_count, 0);
        assert.strictEqual(card.parent, undefined);
        assert.strictEqual(card.children, undefined);
        assert.strictEqual(card.blocked_by, undefined);
        assert.strictEqual(card.blocks, undefined);
    });
});

/**
 * Pure data-mapping tests for DaemonBeadsAdapter.mapBdListIssuesToEnrichedCards.
 *
 * The Kanban board's initial load uses `getBoardMinimal`, which calls
 * `bd list --json --all` and feeds the result through this mapper. The
 * `bd list` output uses an edge-style `dependencies` array
 * (`{ issue_id, depends_on_id, type }`) and a top-level `parent` string,
 * with no `dependents` field — so this mapper has to build reverse
 * indices to populate `children` and `blocks`. These tests assert that
 * all four relationship fields land on the resulting EnrichedCards.
 */
suite('DaemonBeadsAdapter mapBdListIssuesToEnrichedCards', () => {
    let adapter: DaemonBeadsAdapter;
    let output: vscode.OutputChannel;

    function callMap(issues: unknown[]): EnrichedCard[] {
        return (adapter as unknown as {
            mapBdListIssuesToEnrichedCards(issues: unknown[]): EnrichedCard[];
        }).mapBdListIssuesToEnrichedCards(issues);
    }

    function findCard(cards: EnrichedCard[], id: string): EnrichedCard {
        const card = cards.find(c => c.id === id);
        if (!card) {
            assert.fail(`Card ${id} not present in mapped enriched cards`);
        }
        return card;
    }

    /** Minimal scaffold matching the `bd list --json --all` per-issue shape. */
    function makeListIssue(overrides: Record<string, unknown>): Record<string, unknown> {
        return {
            id: 'beads-test',
            title: 'Test Issue',
            description: '',
            status: 'open',
            priority: 2,
            issue_type: 'task',
            created_at: '2025-01-01T00:00:00Z',
            created_by: 'tester',
            updated_at: '2025-01-01T00:00:00Z',
            dependency_count: 0,
            dependent_count: 0,
            ...overrides
        };
    }

    setup(() => {
        output = vscode.window.createOutputChannel('Test');
        adapter = new DaemonBeadsAdapter('', output);
    });

    teardown(() => {
        try { adapter.dispose(); } catch { /* ignore */ }
        try { output.dispose(); } catch { /* ignore */ }
    });

    test('parent affordance resolves from top-level parent string + same-batch title lookup', () => {
        const parent = makeListIssue({ id: 'beads-parent', title: 'Parent Issue' });
        const child = makeListIssue({
            id: 'beads-child',
            title: 'Child Issue',
            parent: 'beads-parent',
            dependencies: [
                {
                    issue_id: 'beads-child',
                    depends_on_id: 'beads-parent',
                    type: 'parent-child',
                    created_at: '2025-01-01T00:00:00Z',
                    created_by: 'tester'
                }
            ]
        });

        const cards = callMap([parent, child]);
        const childCard = findCard(cards, 'beads-child');

        assert.ok(childCard.parent, 'child card should have parent populated');
        assert.strictEqual(childCard.parent?.id, 'beads-parent');
        assert.strictEqual(childCard.parent?.title, 'Parent Issue',
            'parent title must be resolved from the parent issue in the same batch');
    });

    test('parent affordance falls back to dependencies edge when top-level parent is absent', () => {
        // Defensive: some bd versions / issue types may omit the convenience
        // `parent` string but still carry the parent-child edge in dependencies.
        const parent = makeListIssue({ id: 'beads-parent', title: 'Parent Issue' });
        const child = makeListIssue({
            id: 'beads-child',
            title: 'Child Issue',
            dependencies: [
                {
                    issue_id: 'beads-child',
                    depends_on_id: 'beads-parent',
                    type: 'parent-child',
                    created_at: '2025-01-01T00:00:00Z',
                    created_by: 'tester'
                }
            ]
        });

        const cards = callMap([parent, child]);
        const childCard = findCard(cards, 'beads-child');

        assert.ok(childCard.parent, 'child card should have parent populated from dependencies edge');
        assert.strictEqual(childCard.parent?.id, 'beads-parent');
        assert.strictEqual(childCard.parent?.title, 'Parent Issue');
    });

    test('children are populated by reverse-indexing child issues dependencies', () => {
        // bd list does not return a `dependents` field on the parent, so the
        // mapper must invert each child's dependencies edge to find children.
        const parent = makeListIssue({ id: 'beads-parent', title: 'Parent Issue' });
        const childA = makeListIssue({
            id: 'beads-child-a',
            title: 'Child A',
            parent: 'beads-parent',
            dependencies: [
                { issue_id: 'beads-child-a', depends_on_id: 'beads-parent', type: 'parent-child' }
            ]
        });
        const childB = makeListIssue({
            id: 'beads-child-b',
            title: 'Child B',
            parent: 'beads-parent',
            dependencies: [
                { issue_id: 'beads-child-b', depends_on_id: 'beads-parent', type: 'parent-child' }
            ]
        });

        const cards = callMap([parent, childA, childB]);
        const parentCard = findCard(cards, 'beads-parent');

        assert.ok(Array.isArray(parentCard.children), 'parent card should have children array');
        assert.strictEqual(parentCard.children?.length, 2);
        const childIds = (parentCard.children || []).map(c => c.id).sort();
        assert.deepStrictEqual(childIds, ['beads-child-a', 'beads-child-b']);
        assert.deepStrictEqual(
            (parentCard.children || []).map(c => c.title).sort(),
            ['Child A', 'Child B'],
            'children titles must come from the children issues in the same batch'
        );
    });

    test('blocked_by is populated from the issue own dependencies edges', () => {
        const blocker = makeListIssue({ id: 'beads-blocker', title: 'Blocker Issue' });
        const blocked = makeListIssue({
            id: 'beads-blocked',
            title: 'Blocked Issue',
            status: 'open',
            dependencies: [
                {
                    issue_id: 'beads-blocked',
                    depends_on_id: 'beads-blocker',
                    type: 'blocks'
                }
            ]
        });

        const cards = callMap([blocker, blocked]);
        const blockedCard = findCard(cards, 'beads-blocked');

        assert.ok(Array.isArray(blockedCard.blocked_by));
        assert.strictEqual(blockedCard.blocked_by?.length, 1);
        assert.strictEqual(blockedCard.blocked_by?.[0].id, 'beads-blocker');
        assert.strictEqual(blockedCard.blocked_by?.[0].title, 'Blocker Issue');
    });

    test('blocks is populated by reverse-indexing blocked issues dependencies', () => {
        const blocker = makeListIssue({ id: 'beads-blocker', title: 'Blocker Issue' });
        const blocked = makeListIssue({
            id: 'beads-blocked',
            title: 'Blocked Issue',
            dependencies: [
                { issue_id: 'beads-blocked', depends_on_id: 'beads-blocker', type: 'blocks' }
            ]
        });

        const cards = callMap([blocker, blocked]);
        const blockerCard = findCard(cards, 'beads-blocker');

        assert.ok(Array.isArray(blockerCard.blocks));
        assert.strictEqual(blockerCard.blocks?.length, 1);
        assert.strictEqual(blockerCard.blocks?.[0].id, 'beads-blocked');
        assert.strictEqual(blockerCard.blocks?.[0].title, 'Blocked Issue');
    });

    test('issue without relationships has all four fields undefined', () => {
        const solo = makeListIssue({ id: 'beads-solo' });

        const cards = callMap([solo]);
        const soloCard = findCard(cards, 'beads-solo');

        assert.strictEqual(soloCard.parent, undefined);
        assert.strictEqual(soloCard.children, undefined);
        assert.strictEqual(soloCard.blocked_by, undefined);
        assert.strictEqual(soloCard.blocks, undefined);
    });
});
