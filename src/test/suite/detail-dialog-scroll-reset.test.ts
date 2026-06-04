import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Regression guard for the detail-dialog scroll reset. openDetail() reuses
// the static #detailDialog markup across opens, so any retained scrollTop
// on the form's scroll container carries forward and the next open lands
// near Save/Comments instead of the title. Both .dialogForm and its
// .edit-form-container child are scrollable (the latter because its
// `overflow-x: hidden` promotes its unset overflow-y to `auto` per CSS
// spec), so both need a reset. The resets must come after showModal()
// because assigning scrollTop on a hidden descendant (closed <dialog>) is
// a no-op. This suite locks the resets down on both elements and the
// post-showModal ordering.

const BOARD_JS_PATH = path.resolve(__dirname, '..', '..', '..', 'src', 'webview', 'board.js');

suite('Detail dialog scroll reset regression', () => {
    let source: string;

    suiteSetup(() => {
        source = fs.readFileSync(BOARD_JS_PATH, 'utf8');
    });

    test('form.scrollTop is reset to 0 immediately after detDialog.showModal()', () => {
        assert.ok(
            /detDialog\.showModal\(\)\s*;[\s\S]{0,500}?form\.scrollTop\s*=\s*0\s*;/.test(source),
            'expected `form.scrollTop = 0;` to follow `detDialog.showModal();` ' +
                '(the assignment must run after showModal so the form has real layout)'
        );
    });

    test('.edit-form-container.scrollTop is reset to 0 after detDialog.showModal()', () => {
        // .edit-form-container scrolls because its overflow-x: hidden CSS
        // promotes overflow-y to auto. Without resetting its scrollTop the
        // bug returns.
        assert.ok(
            /detDialog\.showModal\(\)\s*;[\s\S]{0,500}?\.edit-form-container[\s\S]{0,200}?\.scrollTop\s*=\s*0\s*;/.test(source),
            'expected `.edit-form-container` scrollTop to be reset to 0 after `detDialog.showModal();`'
        );
    });

    test('scroll resets do NOT appear before detDialog.showModal()', () => {
        // Guard against the wrong order. Assigning scrollTop on a hidden
        // descendant is a no-op (display: none has no layout), so any reset
        // that runs before showModal() is dead code.
        assert.ok(
            !/form\.scrollTop\s*=\s*0\s*;\s*detDialog\.showModal\(\)\s*;/.test(source),
            'form.scrollTop must NOT be reset before showModal() — that ordering is a no-op'
        );
    });

    test('detDialog.showModal() has a single call site', () => {
        const matches = source.match(/detDialog\.showModal\(\)/g) ?? [];
        assert.strictEqual(
            matches.length,
            1,
            'expected exactly one detDialog.showModal() call site so the scroll reset cannot be bypassed'
        );
    });
});
