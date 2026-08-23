import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ClaudeSettings,
  buildHookCommand,
  readClaudeSettings,
  removeHook,
  syncHookPathsInSettings,
  upsertHook,
  writeClaudeSettings,
} from '../claudeHookSyncCore';

describe('buildHookCommand', () => {
  it('quotes the script path so paths containing spaces work', () => {
    const result = buildHookCommand('/some path/out/hookRunner.js');
    assert.strictEqual(result, 'node "/some path/out/hookRunner.js"');
  });
});

describe('syncHookPathsInSettings', () => {
  it('rewrites a stale hookRunner.js path and leaves unrelated hooks untouched', () => {
    const settings: ClaudeSettings = {
      hooks: {
        Stop: [
          { matcher: '', hooks: [{ type: 'command', command: 'echo unrelated-hook-should-survive' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'node "/old/stale/path/out/hookRunner.js"' }] },
        ],
      },
    };

    const changed = syncHookPathsInSettings(
      settings,
      'node "/new/current/path/out/hookRunner.js"',
      'node "/new/current/path/out/resumeRunner.js"'
    );

    assert.strictEqual(changed, true);
    assert.strictEqual(settings.hooks!.Stop![0].hooks[0].command, 'echo unrelated-hook-should-survive');
    assert.strictEqual(settings.hooks!.Stop![1].hooks[0].command, 'node "/new/current/path/out/hookRunner.js"');
  });

  it('returns false and makes no changes when the path is already current', () => {
    const settings: ClaudeSettings = {
      hooks: {
        Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'node "/current/out/hookRunner.js"' }] }],
      },
    };

    const changed = syncHookPathsInSettings(settings, 'node "/current/out/hookRunner.js"', 'node "/current/out/resumeRunner.js"');

    assert.strictEqual(changed, false);
  });

  it('returns false when there are no hooks configured at all', () => {
    const settings: ClaudeSettings = {};
    const changed = syncHookPathsInSettings(settings, 'node "/x/hookRunner.js"', 'node "/x/resumeRunner.js"');
    assert.strictEqual(changed, false);
  });
});

describe('upsertHook', () => {
  it('appends a new hook group when the event has no existing hooks', () => {
    const hooks: Record<string, { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }[] | undefined> = {};
    upsertHook(hooks, 'Stop', 'hookRunner.js', 'node "/x/out/hookRunner.js"');

    assert.strictEqual(hooks.Stop!.length, 1);
    assert.strictEqual(hooks.Stop![0].hooks[0].command, 'node "/x/out/hookRunner.js"');
  });

  it('preserves an existing unrelated hook group for the same event', () => {
    const hooks = {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo something-else' }] }],
    };
    upsertHook(hooks, 'Stop', 'hookRunner.js', 'node "/x/out/hookRunner.js"');

    assert.strictEqual(hooks.Stop.length, 2);
    assert.strictEqual(hooks.Stop[0].hooks[0].command, 'echo something-else');
    assert.strictEqual(hooks.Stop[1].hooks[0].command, 'node "/x/out/hookRunner.js"');
  });

  it('updates an existing hookRunner.js entry in place instead of duplicating it', () => {
    const hooks = {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'node "/old/out/hookRunner.js"' }] }],
    };
    upsertHook(hooks, 'Stop', 'hookRunner.js', 'node "/new/out/hookRunner.js"');

    assert.strictEqual(hooks.Stop.length, 1);
    assert.strictEqual(hooks.Stop[0].hooks[0].command, 'node "/new/out/hookRunner.js"');
  });
});

describe('removeHook', () => {
  it('removes a matching hook and deletes the event key when nothing is left', () => {
    const hooks = {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'node "/x/out/hookRunner.js"' }] }],
    };
    const changed = removeHook(hooks, 'Stop', 'hookRunner.js');

    assert.strictEqual(changed, true);
    assert.strictEqual(hooks.Stop, undefined);
  });

  it('removes only the matching hook and keeps unrelated hooks in the same group', () => {
    const hooks = {
      Stop: [
        {
          matcher: '',
          hooks: [
            { type: 'command', command: 'echo unrelated-hook-should-survive' },
            { type: 'command', command: 'node "/x/out/hookRunner.js"' },
          ],
        },
      ],
    };
    const changed = removeHook(hooks, 'Stop', 'hookRunner.js');

    assert.strictEqual(changed, true);
    assert.strictEqual(hooks.Stop!.length, 1);
    assert.strictEqual(hooks.Stop![0].hooks.length, 1);
    assert.strictEqual(hooks.Stop![0].hooks[0].command, 'echo unrelated-hook-should-survive');
  });

  it('keeps unrelated hook groups for the same event untouched', () => {
    const hooks = {
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: 'echo unrelated-hook-should-survive' }] },
        { matcher: '', hooks: [{ type: 'command', command: 'node "/x/out/hookRunner.js"' }] },
      ],
    };
    const changed = removeHook(hooks, 'Stop', 'hookRunner.js');

    assert.strictEqual(changed, true);
    assert.strictEqual(hooks.Stop!.length, 1);
    assert.strictEqual(hooks.Stop![0].hooks[0].command, 'echo unrelated-hook-should-survive');
  });

  it('returns false and makes no changes when there is nothing to remove', () => {
    const hooks = {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo unrelated' }] }],
    };
    const changed = removeHook(hooks, 'Stop', 'hookRunner.js');

    assert.strictEqual(changed, false);
    assert.strictEqual(hooks.Stop!.length, 1);
  });

  it('returns false when the event has no hooks configured at all', () => {
    const hooks = {};
    const changed = removeHook(hooks, 'Stop', 'hookRunner.js');
    assert.strictEqual(changed, false);
  });
});

describe('readClaudeSettings / writeClaudeSettings', () => {
  it('round-trips settings through a real temp file', () => {
    const tmpPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pause-on-done-test-')), 'settings.json');

    const written: ClaudeSettings = { model: 'claude-sonnet-5', hooks: { Stop: [] } };
    writeClaudeSettings(written, tmpPath);

    const readBack = readClaudeSettings(tmpPath);
    assert.deepStrictEqual(readBack, written);
  });

  it('returns null for a path that does not exist', () => {
    const result = readClaudeSettings('/definitely/does/not/exist/settings.json');
    assert.strictEqual(result, null);
  });
});
