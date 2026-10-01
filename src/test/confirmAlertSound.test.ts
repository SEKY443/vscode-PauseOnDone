import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIRMATION_ALERT_SOUND_FILE } from '../mediaControlCore';

// Compiled tests run from out/test, so the extension root (where the bundled sound lives) is two levels up.
const EXTENSION_ROOT = path.join(__dirname, '..', '..');

describe('bundled confirmation alert sound', () => {
  const wavPath = path.join(EXTENSION_ROOT, CONFIRMATION_ALERT_SOUND_FILE);

  it('exists at the extension root', () => {
    assert.ok(fs.existsSync(wavPath), `${CONFIRMATION_ALERT_SOUND_FILE} should exist at the extension root`);
  });

  it('is a 16-bit PCM WAV (playable by Windows System.Media.SoundPlayer) and stays short', () => {
    const header = fs.readFileSync(wavPath).subarray(0, 44);
    assert.strictEqual(header.toString('ascii', 0, 4), 'RIFF');
    assert.strictEqual(header.toString('ascii', 8, 12), 'WAVE');
    assert.strictEqual(header.readUInt16LE(20), 1, 'audio format should be PCM');
    assert.strictEqual(header.readUInt16LE(34), 16, 'should be 16-bit');

    const sampleRate = header.readUInt32LE(24);
    const blockAlign = header.readUInt16LE(32);
    const dataSize = header.readUInt32LE(40);
    const durationMs = (dataSize / blockAlign / sampleRate) * 1000;
    assert.ok(durationMs > 0 && durationMs < 3000, `should be a short alert (under 3s), got ${durationMs.toFixed(0)}ms`);
  });
});
