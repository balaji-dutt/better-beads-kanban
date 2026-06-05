import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Markdown Preview Toggle Handler', () => {
    const boardJsPath = path.resolve(__dirname, '..', '..', '..', 'src', 'webview', 'board.js');

    let boardJs: string;

    suiteSetup(() => {
        boardJs = fs.readFileSync(boardJsPath, 'utf8');
    });

    test('no .toggle-preview handler uses style.display in board.js', () => {
        const matches = boardJs.match(/\.toggle-preview[\s\S]{0,800}?style\.display/g) ?? [];
        assert.strictEqual(
            matches.length,
            0,
            'Found a .toggle-preview binding in board.js that touches style.display. ' +
            'Inline style.display cannot override `.hidden { display: none !important; }` ' +
            'on the preview pane, so the preview will silently stay invisible. ' +
            'Use classList.add/remove("hidden") instead.'
        );
    });
});
