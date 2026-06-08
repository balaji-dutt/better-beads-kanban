import * as assert from 'assert';
import { buildRelationshipBadges, CardLike } from '../../webview/cardRelationships';

/**
 * Unit tests for the pure helper that turns relationship fields on a Kanban
 * card into compact badge descriptors. The helper has no DOM and no vscode
 * dependency, so each test exercises it with synthetic card-like objects.
 */
suite('buildRelationshipBadges', () => {

    function findByCls(badges: ReturnType<typeof buildRelationshipBadges>, cls: string) {
        return badges.find(b => b.cls === cls);
    }

    test('returns empty array when no relationship fields are set', () => {
        const out = buildRelationshipBadges({});
        assert.deepStrictEqual(out, []);
    });

    test('returns empty array when relationship arrays are present but empty', () => {
        const card: CardLike = {
            blocked_by: [],
            blocks: [],
            children: []
        };
        const out = buildRelationshipBadges(card);
        assert.deepStrictEqual(out, []);
    });

    test('emits blocked-by badge with glyph, count, and tooltip when blocked_by array is populated', () => {
        const card: CardLike = {
            blocked_by: [
                { id: 'a', title: 'First blocker' },
                { id: 'b', title: 'Second blocker' }
            ]
        };
        const badges = buildRelationshipBadges(card);
        assert.strictEqual(badges.length, 1);
        const b = badges[0];
        assert.strictEqual(b.cls, 'badge-rel-blocked-by');
        assert.strictEqual(b.text, '⛔ 2');
        assert.match(b.title, /^Blocked by:/);
        assert.ok(b.title.includes('First blocker'), 'tooltip should list first blocker title');
        assert.ok(b.title.includes('Second blocker'), 'tooltip should list second blocker title');
    });

    test('falls back to count-only blocked badge when blocked_by array is absent but blocked_by_count > 0', () => {
        const card: CardLike = { blocked_by_count: 3 };
        const badges = buildRelationshipBadges(card);
        assert.strictEqual(badges.length, 1);
        assert.strictEqual(badges[0].cls, 'badge-blocked');
        assert.strictEqual(badges[0].text, 'blocked:3');
        assert.match(badges[0].title, /3 issues/);
    });

    test('uses singular "issue" in count-only fallback when blocked_by_count is 1', () => {
        const card: CardLike = { blocked_by_count: 1 };
        const badges = buildRelationshipBadges(card);
        assert.match(badges[0].title, /1 issue \(/);
    });

    test('prefers populated blocked_by array over blocked_by_count when both are present', () => {
        const card: CardLike = {
            blocked_by: [{ id: 'x', title: 'Real blocker' }],
            blocked_by_count: 5
        };
        const badges = buildRelationshipBadges(card);
        assert.strictEqual(badges.length, 1);
        assert.strictEqual(badges[0].cls, 'badge-rel-blocked-by');
        assert.strictEqual(badges[0].text, '⛔ 1');
    });

    test('emits blocks badge when blocks array is populated', () => {
        const card: CardLike = {
            blocks: [
                { id: 'p', title: 'Downstream task' }
            ]
        };
        const badges = buildRelationshipBadges(card);
        const blocks = findByCls(badges, 'badge-rel-blocks');
        assert.ok(blocks, 'should emit a blocks badge');
        assert.strictEqual(blocks!.text, '→ 1');
        assert.ok(blocks!.title.includes('Downstream task'));
    });

    test('emits children badge when children array is populated', () => {
        const card: CardLike = {
            children: [
                { id: 'c1', title: 'Subtask one' },
                { id: 'c2', title: 'Subtask two' },
                { id: 'c3', title: 'Subtask three' }
            ]
        };
        const badges = buildRelationshipBadges(card);
        const children = findByCls(badges, 'badge-rel-children');
        assert.ok(children, 'should emit a children badge');
        assert.strictEqual(children!.text, '⤷ 3');
        for (const t of ['Subtask one', 'Subtask two', 'Subtask three']) {
            assert.ok(children!.title.includes(t), `tooltip should mention ${t}`);
        }
    });

    test('emits all three badges in fixed order (blocked-by, blocks, children) when all are populated', () => {
        const card: CardLike = {
            blocked_by: [{ id: 'a', title: 'A' }],
            blocks: [{ id: 'b', title: 'B' }],
            children: [{ id: 'c', title: 'C' }]
        };
        const badges = buildRelationshipBadges(card);
        assert.strictEqual(badges.length, 3);
        assert.strictEqual(badges[0].cls, 'badge-rel-blocked-by');
        assert.strictEqual(badges[1].cls, 'badge-rel-blocks');
        assert.strictEqual(badges[2].cls, 'badge-rel-children');
    });

    test('falls back to id when a relationship entry has no title', () => {
        const card: CardLike = {
            children: [{ id: 'orphan-id' }]
        };
        const badges = buildRelationshipBadges(card);
        assert.ok(badges[0].title.includes('orphan-id'));
    });

    test('ignores non-array values defensively', () => {
        const card = {
            blocked_by: 'not an array' as unknown as CardLike['blocked_by'],
            blocks: null as unknown as CardLike['blocks'],
            children: undefined as unknown as CardLike['children']
        };
        const out = buildRelationshipBadges(card as CardLike);
        assert.deepStrictEqual(out, []);
    });
});
