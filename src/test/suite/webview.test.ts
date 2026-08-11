import * as assert from 'assert';
import * as vscode from 'vscode';
import { getWebviewHtml } from '../../webview';

suite('Webview Security Tests', () => {
    let mockWebview: vscode.Webview;
    let mockUri: vscode.Uri;

    setup(() => {
        // Create mock webview
        const panel = vscode.window.createWebviewPanel(
            'test',
            'Test',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        mockWebview = panel.webview;
        mockUri = vscode.Uri.file(__dirname);
        panel.dispose();
    });

    test('CSP: Has strict default-src none', () => {
        const html = getWebviewHtml(mockWebview, mockUri);
        assert.ok(html.includes("default-src 'none'"), 'CSP should have default-src none');
    });

    test('CSP: No unsafe-inline in script-src', () => {
        const html = getWebviewHtml(mockWebview, mockUri);
        const cspMatch = html.match(/script-src ([^;]+)/);
        assert.ok(cspMatch, 'CSP should have script-src directive');
        assert.ok(!cspMatch[1].includes('unsafe-inline'), 'script-src should not allow unsafe-inline');
    });

    test('CSP: Has nonce-based script execution', () => {
        const html = getWebviewHtml(mockWebview, mockUri);
        const cspMatch = html.match(/script-src ([^;]+)/);
        assert.ok(cspMatch, 'CSP should have script-src directive');
        assert.ok(cspMatch[1].includes("'nonce-"), 'script-src should use nonce');
    });

    test('CSP: Restricts img-src to webview context only', () => {
        const html = getWebviewHtml(mockWebview, mockUri);
        const cspMatch = html.match(/img-src ([^;]+)/);
        assert.ok(cspMatch, 'CSP should have img-src directive');
        // VS Code's webview.cspSource may include scoped https domains (e.g., https://*.vscode-cdn.net)
        // We want to ensure it's not unrestricted (just "https:" by itself)
        const imgSrc = cspMatch[1].trim();
        // Check it's not just "https:" which would allow any https URL
        assert.ok(!imgSrc.match(/\bhttps:\s*(?:;|$)/), 'img-src should not allow unrestricted https');
        // Should include webview source or data: URIs
        assert.ok(imgSrc.includes('data:') || imgSrc.includes('vscode') || imgSrc.includes('https://'),
                 'img-src should allow data: URIs or webview resources');
    });

    test('CSP: Has base-uri none', () => {
        const html = getWebviewHtml(mockWebview, mockUri);
        assert.ok(html.includes("base-uri 'none'"), 'CSP should restrict base-uri');
    });

    test('CSP: Has form-action none', () => {
        const html = getWebviewHtml(mockWebview, mockUri);
        assert.ok(html.includes("form-action 'none'"), 'CSP should restrict form actions');
    });

    test('Nonce: Generated uniquely per request', () => {
        const html1 = getWebviewHtml(mockWebview, mockUri);
        const html2 = getWebviewHtml(mockWebview, mockUri);

        const nonce1 = html1.match(/nonce-([a-f0-9]+)/)?.[1];
        const nonce2 = html2.match(/nonce-([a-f0-9]+)/)?.[1];

        assert.ok(nonce1, 'First HTML should have nonce');
        assert.ok(nonce2, 'Second HTML should have nonce');
        assert.notStrictEqual(nonce1, nonce2, 'Nonces should be unique per request');
        assert.ok(nonce1.length >= 16, 'Nonce should be at least 16 characters (cryptographically secure)');
    });

    test('DOMPurify: Script is included for sanitization', () => {
        const html = getWebviewHtml(mockWebview, mockUri);
        assert.ok(html.includes('purify'), 'HTML should include DOMPurify library');
    });

    // Replaces a test skipped since v0.0.3 because it looked for an input id
    // ("newTitle") that no longer exists anywhere in the source - so un-skipping
    // it would only have failed on a missing element. The concern it was written
    // for is real: an input that accepts more than the schema allows becomes a
    // save-time validation failure, which is exactly how the unbounded estimate
    // field bit us.
    //
    // Bounds are asserted only on short single-line inputs. The markdown
    // textareas are deliberately left unbounded: maxlength truncates a paste
    // silently, and quietly losing part of a pasted plan document is worse than
    // a clear "Too big" message on save.
    test('Field bounds: capped text inputs carry a matching maxlength', () => {
        const html = getWebviewHtml(mockWebview, mockUri);

        const bounded: Array<[string, number]> = [
            ['editTitle', 500],      // IssueUpdateSchema: title max 500
            ['editAssignee', 100],   // assignee max 100
            ['editExtRef', 200]      // external_ref max 200
        ];

        for (const [id, cap] of bounded) {
            const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
            assert.ok(input, `Should have an input with id="${id}"`);
            assert.ok(
                input![0].includes(`maxlength="${cap}"`),
                `#${id} should carry maxlength="${cap}" to match the schema, got: ${input![0]}`
            );
        }
    });

    test('Field bounds: the estimate input cannot go negative', () => {
        const html = getWebviewHtml(mockWebview, mockUri);
        const input = html.match(/<input[^>]*id="editEst"[^>]*>/);

        assert.ok(input, 'Should have an input with id="editEst"');
        assert.ok(
            input![0].includes('min="0"'),
            `#editEst should carry min="0"; the schema rejects negatives, got: ${input![0]}`
        );
    });
});
