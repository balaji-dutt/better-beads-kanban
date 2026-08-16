import * as assert from 'assert';
import {
    sanitizeError,
    sanitizeErrorWithContext,
    isBdMissingError,
    isBdNotExecutableError
} from '../../sanitizeError';

// A missing bd binary used to be reported as a missing database: Node emits
// "spawn bd ENOENT", and the generic ENOENT branch claimed it 33 lines before
// the bd-specific branch could be reached. The bd branch also matched a shell
// phrasing ("bd: command not found") that Node never produces, so it was dead.

const DB_NOT_FOUND = 'Database file not found';

suite('sanitizeError - bd spawn failures', () => {
    const missingCases: Array<[string, string]> = [
        ['bare command', 'spawn bd ENOENT'],
        ['adapter wrapping', 'bd CLI not reachable: spawn bd ENOENT'],
        ['absolute bdPath', 'bd CLI not reachable: spawn /usr/local/bin/bd ENOENT'],
        ['windows executable', 'spawn bd.exe ENOENT'],
        ['windows path with spaces', 'spawn C:\\Program Files\\bd\\bd.exe ENOENT'],
        ['legacy shell phrasing', 'bd: command not found']
    ];

    for (const [label, message] of missingCases) {
        test(`reports a missing binary, not a missing database (${label})`, () => {
            const result = sanitizeErrorWithContext(new Error(message));

            assert.ok(
                !result.includes(DB_NOT_FOUND),
                `"${message}" was reported as a database problem: ${result}`
            );
            assert.ok(result.includes('bd'), `message should name bd: ${result}`);
            assert.ok(result.includes('PATH'), `message should name PATH: ${result}`);
            assert.ok(
                result.includes('beadsKanban.bdPath'),
                `message should name the bdPath setting: ${result}`
            );
        });
    }

    test('a non-executable bd is not reported as a database permission problem', () => {
        const result = sanitizeErrorWithContext(new Error('spawn /usr/local/bin/bd EACCES'));

        assert.ok(!result.includes('database file'), result);
        assert.ok(result.includes('bd'), result);
        assert.ok(result.includes('beadsKanban.bdPath'), result);
    });

    test('a genuine filesystem ENOENT still reports the database', () => {
        const result = sanitizeErrorWithContext(
            new Error("ENOENT: no such file or directory, open '/Users/someone/repo/.beads/issues.jsonl'")
        );

        assert.ok(result.includes(DB_NOT_FOUND), result);
    });

    test('a genuine filesystem EACCES still reports the database', () => {
        const result = sanitizeErrorWithContext(new Error('EACCES: permission denied'));

        assert.ok(result.includes('Permission denied accessing database file'), result);
    });
});

suite('sanitizeError - spawn predicates', () => {
    test('isBdMissingError matches every shape Node emits', () => {
        assert.strictEqual(isBdMissingError('spawn bd ENOENT'), true);
        assert.strictEqual(isBdMissingError('spawn bd.exe ENOENT'), true);
        assert.strictEqual(isBdMissingError('spawn C:\\Program Files\\bd\\bd.exe ENOENT'), true);
        assert.strictEqual(isBdMissingError('bd command not found'), true);
    });

    test('isBdMissingError ignores unrelated ENOENT', () => {
        assert.strictEqual(isBdMissingError('ENOENT: no such file or directory'), false);
        assert.strictEqual(isBdMissingError('spawn bd EACCES'), false);
    });

    test('isBdNotExecutableError matches EACCES and EPERM only', () => {
        assert.strictEqual(isBdNotExecutableError('spawn /usr/local/bin/bd EACCES'), true);
        assert.strictEqual(isBdNotExecutableError('spawn bd EPERM'), true);
        assert.strictEqual(isBdNotExecutableError('spawn bd ENOENT'), false);
    });
});

suite('sanitizeError - path scrubbing', () => {
    test('scrubs unix, windows and UNC paths', () => {
        // Avoid the substring " at ", which the stack-trace stripper removes
        // along with everything after it.
        assert.ok(sanitizeError(new Error('cannot open /Users/someone/secret/file')).includes('[PATH]'));
        assert.ok(sanitizeError(new Error('cannot open C:\\Users\\someone\\secret')).includes('[PATH]'));
        assert.ok(sanitizeError(new Error('cannot open \\\\server\\share\\x')).includes('[PATH]'));
    });

    test('strips stack-trace tails', () => {
        assert.strictEqual(sanitizeError(new Error('boom at Object.<anonymous>')), 'boom');
    });

    test('an empty message falls back to a generic string', () => {
        assert.strictEqual(
            sanitizeError(new Error('')),
            'An error occurred while processing your request.'
        );
    });

    test('an absolute bdPath is scrubbed, which is why the raw message is matched', () => {
        // Guards the design decision in isBdMissingError: after scrubbing, the
        // binary name is gone, so a sanitized-string match on "bd" would fail.
        const scrubbed = sanitizeError(new Error('spawn /usr/local/bin/bd ENOENT'));

        assert.ok(scrubbed.includes('[PATH]'), scrubbed);
        assert.ok(!scrubbed.includes('/usr/local/bin/bd'), scrubbed);
    });
});
