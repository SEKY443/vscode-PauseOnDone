import * as assert from 'assert';
import * as vscode from 'vscode';
import * as pkg from '../../package.json';

// This test file runs inside a real VS Code Extension Development Host (launched by
// @vscode/test-electron), so it can verify the extension actually activates, commands are
// really registered, and the configuration defaults match package.json.
//
// The extension ID is derived from package.json rather than hardcoded, so this doesn't need to
// be updated every time the publisher field changes (e.g. once a real Marketplace publisher ID
// replaces the placeholder before publishing).
const EXTENSION_ID = `${pkg.publisher}.${pkg.name}`;

describe('Extension activation', () => {
  it('is discoverable and activates without throwing', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension "${EXTENSION_ID}" should be discoverable`);

    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });

  it('registers the manual test-trigger and dependency-check commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('pauseOnDone.testTrigger'), 'pauseOnDone.testTrigger should be registered');
    assert.ok(
      commands.includes('pauseOnDone.checkDependencies'),
      'pauseOnDone.checkDependencies should be registered'
    );
    assert.ok(
      commands.includes('pauseOnDone.setupClaudeHook'),
      'pauseOnDone.setupClaudeHook should be registered'
    );
    assert.ok(
      commands.includes('pauseOnDone.removeClaudeHook'),
      'pauseOnDone.removeClaudeHook should be registered'
    );
  });

  it('exposes the expected configuration defaults declared in package.json', () => {
    const config = vscode.workspace.getConfiguration('pauseOnDone');
    assert.strictEqual(config.get('enabled'), true);
    assert.strictEqual(config.get('enableAiSignalDetection'), true);
    assert.strictEqual(config.get('soundFile'), 'bell_sound.wav');
    assert.strictEqual(config.get('pauseMusic'), true);
    assert.strictEqual(config.get('playNotificationSound'), true);
    assert.strictEqual(config.get('ringWhenPausing'), true);
    assert.strictEqual(config.get('autoResume'), true);
    assert.strictEqual(config.get('cooldownSeconds'), 5);
    assert.strictEqual(config.get('autoPromptInstallDependencies'), true);
    assert.strictEqual(config.get('autoPromptSetupClaudeHook'), true);
    assert.deepStrictEqual(config.get('completionKeywords'), [
      'Done',
      'Process finished',
      'Success',
      'BUILD SUCCESSFUL',
    ]);
  });
});
