import * as assert from 'assert';
import { findCompletionMatch, findMagicToken, AI_SIGNAL_PATTERN, BUILTIN_SIGNALS } from '../matching';

describe('findCompletionMatch', () => {
  it('matches a user-defined keyword case-insensitively', () => {
    const result = findCompletionMatch('Build finished: SUCCESS', ['success'], false);
    assert.strictEqual(result, 'success');
  });

  it('returns null when no keyword matches and AI signal detection is disabled', () => {
    const result = findCompletionMatch('still running...', ['done'], false);
    assert.strictEqual(result, null);
  });

  it('user keyword takes priority over AI signal detection', () => {
    const result = findCompletionMatch('BUILD SUCCESSFUL in 3s', ['BUILD SUCCESSFUL'], true);
    assert.strictEqual(result, 'BUILD SUCCESSFUL');
  });

  it('matches the built-in AI "[verb]ed for [time]" signal, e.g. "Done for 5s"', () => {
    const result = findCompletionMatch('Done for 5s', [], true);
    assert.ok(result);
    assert.match(result as string, AI_SIGNAL_PATTERN);
  });

  it('matches AI signal with a compound duration like "1m 3s"', () => {
    const result = findCompletionMatch('Thought for 1m 3s', [], true);
    assert.ok(result);
  });

  it('matches AI signal for other verbs such as "Compacted for 12s"', () => {
    const result = findCompletionMatch('Compacted for 12s', [], true);
    assert.ok(result);
  });

  it('does not match the AI signal pattern when detection is disabled', () => {
    const result = findCompletionMatch('Compacted for 12s', [], false);
    assert.strictEqual(result, null);
  });

  it('falls back to generic completion words like "completed"', () => {
    const result = findCompletionMatch('Deployment completed', [], true);
    const completedPattern = BUILTIN_SIGNALS.find((p) => p.test('completed'));
    assert.strictEqual(result, completedPattern?.source);
  });

  it('matches the checkmark symbols ✔ / ✓', () => {
    const result = findCompletionMatch('Tests passed ✓', [], true);
    assert.ok(result);
  });

  it('does not false-positive on "undone" due to word-boundary matching', () => {
    // "\bdone\b" requires a word boundary on both sides; in "undone", the character before
    // "done" is "n" (also a \w character), so there's no boundary there — the done rule
    // correctly does not misfire on this text.
    const result = findCompletionMatch('The screen is undone', [], true);
    assert.strictEqual(result, null);
  });

  it('returns null for unrelated text', () => {
    const result = findCompletionMatch('installing dependencies...', [], true);
    assert.strictEqual(result, null);
  });
});

describe('findMagicToken', () => {
  it('matches !PODBell! as the bell token', () => {
    assert.strictEqual(findMagicToken('echo "!PODBell!"'), 'bell');
  });

  it('matches !PODStop! as the stop token', () => {
    assert.strictEqual(findMagicToken('some log line !PODStop! more text'), 'stop');
  });

  it('matches !PODResume! as the resume token', () => {
    assert.strictEqual(findMagicToken('!PODResume!'), 'resume');
  });

  it('matches !PODToggle! as the toggle token', () => {
    assert.strictEqual(findMagicToken('!PODToggle!'), 'toggle');
  });

  it('matches the bare !POD! as the normal token', () => {
    assert.strictEqual(findMagicToken('build finished !POD!'), 'normal');
  });

  it('does not mistake !PODBell! for the bare !POD! token', () => {
    // "!POD!" is not a substring of "!PODBell!" (it diverges right after "!POD"),
    // so only the more specific token should match.
    assert.strictEqual(findMagicToken('!PODBell!'), 'bell');
  });

  it('is case-sensitive, unlike the fuzzy keyword matching', () => {
    assert.strictEqual(findMagicToken('!podbell!'), null);
  });

  it('returns null when no token is present', () => {
    assert.strictEqual(findMagicToken('nothing special here'), null);
  });
});
