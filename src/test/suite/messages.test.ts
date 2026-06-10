import * as assert from 'assert';
import {
    IssueUpdateSchema,
    IssueCreateSchema,
    CommentAddSchema,
    LabelSchema,
    DependencySchema,
    IssueIdSchema,
    UIStateSchema,
    migrateUIState,
    STATUS_ALL_VALUES,
    STATUS_ACTIVE_VALUES,
    PRIORITY_ALL_VALUES,
    TYPE_ALL_VALUES
} from '../../types';

suite('Message Validation Tests', () => {
    test('IssueCreateSchema: Valid issue passes', () => {
        const validIssue = {
            title: 'Test Issue',
            description: 'Test description',
            priority: 2,
            issue_type: 'task'
        };

        const result = IssueCreateSchema.safeParse(validIssue);
        assert.ok(result.success, 'Valid issue should pass validation');
    });

    test('IssueCreateSchema: Rejects empty title', () => {
        const invalidIssue = {
            title: '',
            description: 'Test description'
        };

        const result = IssueCreateSchema.safeParse(invalidIssue);
        assert.ok(!result.success, 'Empty title should fail validation');
    });

    test('IssueCreateSchema: Rejects title over 500 chars', () => {
        const invalidIssue = {
            title: 'A'.repeat(501),
            description: 'Test'
        };

        const result = IssueCreateSchema.safeParse(invalidIssue);
        assert.ok(!result.success, 'Title over 500 chars should fail validation');
    });

    test('IssueCreateSchema: Rejects invalid issue type', () => {
        const invalidIssue = {
            title: 'Test',
            issue_type: 'invalid-type'
        };

        const result = IssueCreateSchema.safeParse(invalidIssue);
        assert.ok(!result.success, 'Invalid issue_type should fail validation');
    });

    test('IssueCreateSchema: Rejects invalid priority', () => {
        const invalidIssue = {
            title: 'Test',
            priority: 10 // Only 0-4 allowed
        };

        const result = IssueCreateSchema.safeParse(invalidIssue);
        assert.ok(!result.success, 'Priority out of range should fail validation');
    });

    test('IssueUpdateSchema: Valid update passes', () => {
        const validUpdate = {
            id: 'beads-kanban-1',
            updates: {
                title: 'Updated Title',
                priority: 1
            }
        };

        const result = IssueUpdateSchema.safeParse(validUpdate);
        assert.ok(result.success, 'Valid update should pass validation');
    });

    test('IssueUpdateSchema: Rejects empty id', () => {
        const invalidUpdate = {
            id: '',
            updates: { title: 'Test' }
        };

        const result = IssueUpdateSchema.safeParse(invalidUpdate);
        assert.ok(!result.success, 'Invalid UUID should fail validation');
    });

    test('IssueUpdateSchema: Rejects description over 10000 chars', () => {
        const invalidUpdate = {
            id: 'beads-kanban-1',
            updates: {
                description: 'A'.repeat(10001)
            }
        };

        const result = IssueUpdateSchema.safeParse(invalidUpdate);
        assert.ok(!result.success, 'Description over 10000 chars should fail validation');
    });

    test('CommentAddSchema: Valid comment passes', () => {
        const validComment = {
            id: 'beads-kanban-1',
            text: 'This is a comment',
            author: 'User'
        };

        const result = CommentAddSchema.safeParse(validComment);
        assert.ok(result.success, 'Valid comment should pass validation');
    });

    test('CommentAddSchema: Rejects empty text', () => {
        const invalidComment = {
            id: 'beads-kanban-1',
            text: '',
            author: 'User'
        };

        const result = CommentAddSchema.safeParse(invalidComment);
        assert.ok(!result.success, 'Empty comment text should fail validation');
    });

    test('LabelSchema: Valid label passes', () => {
        const validLabel = {
            id: 'beads-kanban-1',
            label: 'bug'
        };

        const result = LabelSchema.safeParse(validLabel);
        assert.ok(result.success, 'Valid label should pass validation');
    });

    test('LabelSchema: Rejects label over 100 chars', () => {
        const invalidLabel = {
            id: 'beads-kanban-1',
            label: 'A'.repeat(101)
        };

        const result = LabelSchema.safeParse(invalidLabel);
        assert.ok(!result.success, 'Label over 100 chars should fail validation');
    });

    test('DependencySchema: Valid dependency passes', () => {
        const validDep = {
            id: 'beads-kanban-1',
            otherId: 'beads-kanban-2',
            type: 'blocks'
        };

        const result = DependencySchema.safeParse(validDep);
        assert.ok(result.success, 'Valid dependency should pass validation');
    });

    test('DependencySchema: Rejects invalid type', () => {
        const invalidDep = {
            id: 'beads-kanban-1',
            otherId: 'beads-kanban-2',
            type: 'invalid-type'
        };

        const result = DependencySchema.safeParse(invalidDep);
        assert.ok(!result.success, 'Invalid dependency type should fail validation');
    });

    test('IssueIdSchema: Accepts IDs with dots in suffix', () => {
        const validIds = ['smth-abc.3', 'beads-hct.2', 'smth-abc7.3', 'beads-kanban-3ae'];
        for (const id of validIds) {
            const result = IssueIdSchema.safeParse(id);
            assert.ok(result.success, `ID "${id}" should pass validation`);
        }
    });

    test('IssueIdSchema: Rejects IDs with consecutive special characters', () => {
        const invalidIds = ['smth--abc', 'smth..abc', 'smth-.abc'];
        for (const id of invalidIds) {
            const result = IssueIdSchema.safeParse(id);
            assert.ok(!result.success, `ID "${id}" should fail validation`);
        }
    });

    test('UIStateSchema: Empty object passes (all fields optional)', () => {
        const result = UIStateSchema.safeParse({});
        assert.ok(result.success, 'Empty UI state should pass validation');
    });

    test('UIStateSchema: Full valid payload passes', () => {
        const valid = {
            viewMode: 'table',
            collapsedColumns: ['ready', 'blocked'],
            tableSorting: [{ id: 'title', dir: 'asc' }],
            tableColumnVisibility: { type: true, priority: false },
            tableColumnOrder: ['id', 'title', 'priority'],
            tableFilters: { search: 'foo', labels: ['bug'] }
        };
        const result = UIStateSchema.safeParse(valid);
        assert.ok(result.success, 'Valid full UI state should pass validation');
    });

    test('UIStateSchema: Rejects invalid viewMode', () => {
        const invalid = { viewMode: 'list' };
        const result = UIStateSchema.safeParse(invalid);
        assert.ok(!result.success, 'Unknown viewMode should fail validation');
    });

    test('UIStateSchema: Rejects invalid sort direction', () => {
        const invalid = { tableSorting: [{ id: 'title', dir: 'sideways' }] };
        const result = UIStateSchema.safeParse(invalid);
        assert.ok(!result.success, 'Unknown sort direction should fail validation');
    });

    test('UIStateSchema: Rejects tableSorting entry missing id', () => {
        const invalid = { tableSorting: [{ dir: 'asc' }] };
        const result = UIStateSchema.safeParse(invalid);
        assert.ok(!result.success, 'tableSorting entry without id should fail validation');
    });

    test('UIStateSchema: Caps tableSorting at 5 entries', () => {
        const six = Array.from({ length: 6 }, (_, i) => ({ id: `col${i}`, dir: 'asc' as const }));
        const result = UIStateSchema.safeParse({ tableSorting: six });
        assert.ok(!result.success, 'tableSorting with 6 entries should fail (max 5)');
    });

    test('UIStateSchema: Caps collapsedColumns at 20 entries', () => {
        const twentyOne = Array.from({ length: 21 }, (_, i) => `c${i}`);
        const result = UIStateSchema.safeParse({ collapsedColumns: twentyOne });
        assert.ok(!result.success, 'collapsedColumns with 21 entries should fail (max 20)');
    });

    test('UIStateSchema: Rejects collapsedColumns containing non-string', () => {
        const invalid = { collapsedColumns: ['ready', 42] };
        const result = UIStateSchema.safeParse(invalid);
        assert.ok(!result.success, 'collapsedColumns with non-string entry should fail');
    });

    test('UIStateSchema: Rejects tableColumnVisibility with non-boolean values', () => {
        const invalid = { tableColumnVisibility: { type: 'yes' } };
        const result = UIStateSchema.safeParse(invalid);
        assert.ok(!result.success, 'tableColumnVisibility values must be boolean');
    });

    test('UIStateSchema: tableFilters is permissive (forward-compat with shape changes)', () => {
        // Filter shape may evolve; current schema accepts any record value.
        const flexible = { tableFilters: { priority: ['1', '2'], assignee: 'alice' } };
        const result = UIStateSchema.safeParse(flexible);
        assert.ok(result.success, 'tableFilters should accept arbitrary value shapes');
    });

    test('UIStateSchema: topBarFilters accepts arrays of selected values', () => {
        const valid = { topBarFilters: { priority: ['0', '1'], type: ['bug'], status: ['open'] } };
        const result = UIStateSchema.safeParse(valid);
        assert.ok(result.success, 'topBarFilters with valid arrays should pass');
    });

    test('UIStateSchema: topBarFilters accepts empty arrays (None selected)', () => {
        const valid = { topBarFilters: { priority: [], type: [], status: [] } };
        const result = UIStateSchema.safeParse(valid);
        assert.ok(result.success, 'topBarFilters with empty arrays should pass');
    });

    test('UIStateSchema: topBarFilters rejects non-array entries', () => {
        const invalid = { topBarFilters: { status: 'open' } };
        const result = UIStateSchema.safeParse(invalid);
        assert.ok(!result.success, 'topBarFilters entries must be arrays');
    });

    test('UIStateSchema: topBarFiltersVersion accepts literal 2', () => {
        const valid = { topBarFiltersVersion: 2 };
        const result = UIStateSchema.safeParse(valid);
        assert.ok(result.success, 'topBarFiltersVersion: 2 should pass');
    });

    test('UIStateSchema: topBarFiltersVersion rejects other numbers', () => {
        const invalid = { topBarFiltersVersion: 1 };
        const result = UIStateSchema.safeParse(invalid);
        assert.ok(!result.success, 'topBarFiltersVersion must be the literal 2');
    });
});

suite('migrateUIState', () => {
    test('Returns null/undefined/primitive inputs unchanged', () => {
        assert.strictEqual(migrateUIState(null), null);
        assert.strictEqual(migrateUIState(undefined), undefined);
        assert.strictEqual(migrateUIState(42), 42);
        assert.strictEqual(migrateUIState('hello'), 'hello');
    });

    test('Returns arrays unchanged (defensive: workspaceState shape should be object)', () => {
        const input = [1, 2, 3];
        assert.strictEqual(migrateUIState(input), input);
    });

    test('Version-2 payload passes through with no modification', () => {
        const v2 = {
            topBarFiltersVersion: 2,
            topBarFilters: { priority: [], type: [], status: [] }
        };
        const out = migrateUIState(v2) as Record<string, unknown>;
        // Empty arrays preserved → current-shape "None" intent honored.
        const tb = out.topBarFilters as Record<string, unknown>;
        assert.deepStrictEqual(tb.priority, []);
        assert.deepStrictEqual(tb.type, []);
        assert.deepStrictEqual(tb.status, []);
        assert.strictEqual(out.topBarFiltersVersion, 2);
    });

    test('Legacy payload: empty arrays are expanded to full universes', () => {
        const legacy = {
            topBarFilters: { priority: [], type: [], status: [] }
        };
        const out = migrateUIState(legacy) as Record<string, unknown>;
        const tb = out.topBarFilters as Record<string, unknown>;
        assert.deepStrictEqual(tb.priority, [...PRIORITY_ALL_VALUES]);
        assert.deepStrictEqual(tb.type, [...TYPE_ALL_VALUES]);
        assert.deepStrictEqual(tb.status, [...STATUS_ALL_VALUES]);
        assert.strictEqual(out.topBarFiltersVersion, 2);
    });

    test('Legacy payload: non-empty arrays are preserved verbatim, only empty arrays expand', () => {
        const legacy = {
            topBarFilters: {
                priority: ['0', '1'],
                type: [],
                status: ['open', 'in_progress']
            }
        };
        const out = migrateUIState(legacy) as Record<string, unknown>;
        const tb = out.topBarFilters as Record<string, unknown>;
        assert.deepStrictEqual(tb.priority, ['0', '1']);
        assert.deepStrictEqual(tb.type, [...TYPE_ALL_VALUES]);
        assert.deepStrictEqual(tb.status, ['open', 'in_progress']);
        assert.strictEqual(out.topBarFiltersVersion, 2);
    });

    test('Legacy payload without topBarFilters: stamps version but adds no filter data', () => {
        const legacy = { viewMode: 'kanban', collapsedColumns: ['blocked'] };
        const out = migrateUIState(legacy) as Record<string, unknown>;
        assert.strictEqual(out.viewMode, 'kanban');
        assert.deepStrictEqual(out.collapsedColumns, ['blocked']);
        assert.strictEqual(out.topBarFiltersVersion, 2);
        assert.strictEqual(out.topBarFilters, undefined);
    });

    test('Migration output validates cleanly against UIStateSchema', () => {
        const legacy = {
            viewMode: 'table' as const,
            topBarFilters: { priority: [], type: ['bug'], status: [] }
        };
        const migrated = migrateUIState(legacy);
        const result = UIStateSchema.safeParse(migrated);
        assert.ok(result.success, `Migrated payload should parse: ${(result as { success: false; error: { message: string } }).error?.message}`);
    });

    test('Migration is pure: does not mutate the input', () => {
        const input = {
            topBarFilters: { priority: [], type: ['bug'], status: [] }
        };
        const inputCopy = JSON.parse(JSON.stringify(input));
        migrateUIState(input);
        assert.deepStrictEqual(input, inputCopy, 'Input must not be mutated');
    });

    test('STATUS_ACTIVE_VALUES is a strict subset of STATUS_ALL_VALUES', () => {
        for (const v of STATUS_ACTIVE_VALUES) {
            assert.ok(
                (STATUS_ALL_VALUES as readonly string[]).includes(v),
                `Active value "${v}" must appear in STATUS_ALL_VALUES`
            );
        }
        assert.ok(
            STATUS_ALL_VALUES.length > STATUS_ACTIVE_VALUES.length,
            'STATUS_ALL must be strictly larger than STATUS_ACTIVE (else there is no Closed to exclude)'
        );
    });
});
