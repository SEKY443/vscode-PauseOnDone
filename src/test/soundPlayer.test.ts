import * as assert from 'assert';
import * as path from 'path';
import { resolveSoundPath } from '../soundPlayer';

describe('resolveSoundPath', () => {
  it('resolves a relative path against the extension root path', () => {
    const result = resolveSoundPath('bell_sound.wav', '/ext/root');
    assert.strictEqual(result, path.join('/ext/root', 'bell_sound.wav'));
  });

  it('resolves a nested relative path against the extension root path', () => {
    const result = resolveSoundPath('sounds/custom.wav', '/ext/root');
    assert.strictEqual(result, path.join('/ext/root', 'sounds/custom.wav'));
  });

  it('returns an absolute path unchanged', () => {
    const abs = path.resolve('/tmp/custom-sound.wav');
    const result = resolveSoundPath(abs, '/ext/root');
    assert.strictEqual(result, abs);
  });
});
