import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_CONFIRMATION_ALERT_CONFIG, DEFAULT_HOOK_CONFIG, HookConfig, readHookConfig, writeHookConfig } from '../hookConfigCore';
import { DEFAULT_OVERNIGHT_MODE_CONFIG } from '../overnightModeCore';

describe('readHookConfig', () => {
  it('returns all-enabled defaults when the file does not exist', () => {
    const result = readHookConfig('/definitely/does/not/exist/config.json');
    assert.deepStrictEqual(result, DEFAULT_HOOK_CONFIG);
  });

  it('returns all-enabled defaults when the file contains malformed JSON', () => {
    const tmpPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pause-on-done-hookconfig-test-')), 'config.json');
    fs.writeFileSync(tmpPath, '{ not valid json');

    const result = readHookConfig(tmpPath);
    assert.deepStrictEqual(result, DEFAULT_HOOK_CONFIG);
  });

  it('round-trips a fully-specified config through a real file', () => {
    const tmpPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pause-on-done-hookconfig-test-')), 'config.json');
    const written: HookConfig = {
      enabled: true,
      pauseMusic: false,
      playNotificationSound: true,
      ringWhenPausing: false,
      autoResume: false,
      overnightMode: {
        enabled: true,
        startTime: '23:30',
        endTime: '06:15',
        behavior: 'autoResumeAfterDelay',
        autoResumeDelaySeconds: 30,
      },
      confirmationAlert: { enabled: true },
    };

    writeHookConfig(written, tmpPath);
    const readBack = readHookConfig(tmpPath);

    assert.deepStrictEqual(readBack, written);
  });

  it('treats a missing individual field as enabled (fails open, not closed)', () => {
    const tmpPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pause-on-done-hookconfig-test-')), 'config.json');
    fs.writeFileSync(tmpPath, JSON.stringify({ pauseMusic: false }));

    const result = readHookConfig(tmpPath);
    assert.deepStrictEqual(result, {
      enabled: true,
      pauseMusic: false,
      playNotificationSound: true,
      ringWhenPausing: true,
      autoResume: true,
      overnightMode: DEFAULT_OVERNIGHT_MODE_CONFIG,
      confirmationAlert: DEFAULT_CONFIRMATION_ALERT_CONFIG,
    });
  });

  it('treats a missing or malformed overnightMode as disabled (fails closed, not open)', () => {
    const tmpPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pause-on-done-hookconfig-test-')), 'config.json');
    fs.writeFileSync(tmpPath, JSON.stringify({ overnightMode: { enabled: 'yes', autoResumeDelaySeconds: -5 } }));

    const result = readHookConfig(tmpPath);
    assert.deepStrictEqual(result.overnightMode, DEFAULT_OVERNIGHT_MODE_CONFIG);
  });

  it('treats a missing or malformed confirmationAlert as disabled (fails closed, not open)', () => {
    const tmpPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pause-on-done-hookconfig-test-')), 'config.json');
    fs.writeFileSync(tmpPath, JSON.stringify({ confirmationAlert: { enabled: 'yes' } }));

    const result = readHookConfig(tmpPath);
    assert.deepStrictEqual(result.confirmationAlert, DEFAULT_CONFIRMATION_ALERT_CONFIG);
  });

  it('creates the parent directory if it does not exist yet', () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pause-on-done-hookconfig-test-'));
    const nestedPath = path.join(parentDir, 'nested', 'config.json');

    writeHookConfig(DEFAULT_HOOK_CONFIG, nestedPath);

    assert.ok(fs.existsSync(nestedPath));
    assert.deepStrictEqual(readHookConfig(nestedPath), DEFAULT_HOOK_CONFIG);
  });
});
