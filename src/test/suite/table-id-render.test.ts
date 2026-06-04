import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Regression guard: the table view's ID column previously rendered
// `c.id.slice(-8)`, which silently dropped the repo prefix from longer IDs
// (e.g. `mock-000001` became `k-000001`). The same `.slice(-8)` truncation
// was also applied to the copy-confirmation toast, so it misreported the
// clipboard contents. This suite asserts those two patterns stay removed.

const BOARD_JS_PATH = path.resolve(__dirname, '..', '..', '..', 'src', 'webview', 'board.js');

suite('Table ID rendering regression', () => {
    let source: string;

    suiteSetup(() => {
        source = fs.readFileSync(BOARD_JS_PATH, 'utf8');
    });

    test('table ID column render uses the full ID, not the last 8 characters', () => {
        const renderMatch = source.match(
            /render:\s*\(c\)\s*=>\s*`<span class="table-id copy-id"[^`]*`/
        );
        assert.ok(renderMatch, 'expected to find the table ID column render function');
        const rendered = renderMatch![0];
        assert.ok(
            !/c\.id\.slice\(-8\)/.test(rendered),
            'table ID render must not truncate via c.id.slice(-8)'
        );
        assert.ok(
            /\$\{escapeHtml\(c\.id\)\}<\/span>/.test(rendered),
            'table ID render must emit the escaped full ID inside the span'
        );
    });

    test('copy-to-clipboard toast reports the full ID, not the last 8 characters', () => {
        const toastMatch = source.match(
            /post\('issue\.copyToClipboard',\s*\{\s*text:\s*fullId\s*\}\);[\s\S]{0,200}?toast\(`Copied:[^`]*`\)/
        );
        assert.ok(toastMatch, 'expected to find the copy-id click handler');
        const handler = toastMatch![0];
        assert.ok(
            !/fullId\.slice\(-8\)/.test(handler),
            'copy toast must not truncate via fullId.slice(-8)'
        );
        assert.ok(
            /toast\(`Copied:\s*\$\{fullId\}`\)/.test(handler),
            'copy toast must report the full clipboard contents'
        );
    });
});
