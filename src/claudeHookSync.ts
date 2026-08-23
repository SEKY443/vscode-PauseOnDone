import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  CLAUDE_SETTINGS_PATH,
  buildHookCommand,
  readClaudeSettings,
  removeHook,
  syncHookPathsInSettings,
  upsertHook,
  writeClaudeSettings,
} from './claudeHookSyncCore';
import { STATE_FILE } from './mediaControlCore';

/**
 * Called on every activation. Keeps a previously-configured Claude Code hook's path in sync with
 * this extension's current install location (see claudeHookSyncCore.ts for why that's needed).
 * Only touches hook entries that are already ours — never adds one that wasn't there before.
 */
export function syncClaudeHookPaths(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): void {
  const settings = readClaudeSettings();
  if (!settings) {
    return;
  }

  const hookRunnerCommand = buildHookCommand(path.join(context.extensionPath, 'out', 'hookRunner.js'));
  const resumeRunnerCommand = buildHookCommand(path.join(context.extensionPath, 'out', 'resumeRunner.js'));

  const changed = syncHookPathsInSettings(settings, hookRunnerCommand, resumeRunnerCommand);
  if (!changed) {
    return;
  }

  try {
    writeClaudeSettings(settings);
    outputChannel.appendLine(
      '[Pause on Done] Updated a stale hook path in ~/.claude/settings.json (extension was likely updated to a new version)'
    );
  } catch (err) {
    outputChannel.appendLine(`[Pause on Done] Failed to update ~/.claude/settings.json: ${err}`);
  }
}

/**
 * Explicit, user-triggered setup: adds (or re-syncs) the Stop + UserPromptSubmit hooks pointing
 * at this extension's current install path into ~/.claude/settings.json, after showing exactly
 * what will be written and getting confirmation. Preserves any other existing settings/hooks.
 */
export async function setupClaudeHook(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<void> {
  const hookRunnerCommand = buildHookCommand(path.join(context.extensionPath, 'out', 'hookRunner.js'));
  const resumeRunnerCommand = buildHookCommand(path.join(context.extensionPath, 'out', 'resumeRunner.js'));

  const choice = await vscode.window.showInformationMessage(
    `Pause on Done will add two hooks to ${CLAUDE_SETTINGS_PATH}:\n` +
      `- Stop -> ${hookRunnerCommand}\n` +
      `- UserPromptSubmit -> ${resumeRunnerCommand}\n` +
      'Existing settings and any other hooks you already have configured will be preserved.',
    { modal: true },
    'Set Up Hook'
  );

  if (choice !== 'Set Up Hook') {
    return;
  }

  const settings = readClaudeSettings() ?? {};
  settings.hooks = settings.hooks ?? {};

  upsertHook(settings.hooks, 'Stop', 'hookRunner.js', hookRunnerCommand);
  upsertHook(settings.hooks, 'UserPromptSubmit', 'resumeRunner.js', resumeRunnerCommand);

  try {
    writeClaudeSettings(settings);
    outputChannel.appendLine(`[Pause on Done] Wrote Claude Code hooks to ${CLAUDE_SETTINGS_PATH}`);
    void vscode.window.showInformationMessage(
      'Pause on Done: Claude Code hook set up. Start a new `claude` session for it to take effect.'
    );
  } catch (err) {
    outputChannel.appendLine(`[Pause on Done] Failed to write Claude Code settings: ${err}`);
    void vscode.window.showErrorMessage(`Pause on Done: failed to write ${CLAUDE_SETTINGS_PATH}: ${err}`);
  }
}

/**
 * Explicit, user-triggered teardown: the inverse of setupClaudeHook. Removes this extension's
 * Stop/UserPromptSubmit hook entries from ~/.claude/settings.json (leaving any other hooks
 * untouched) and deletes the leftover state file, after confirmation.
 *
 * There's no reliable way to run this automatically when the extension is actually uninstalled —
 * VS Code calls deactivate() on every disable/reload/update too, not just on uninstall, so wiring
 * cleanup into deactivate() would incorrectly strip the hook every time VS Code merely restarts,
 * breaking the whole point of the hook (working even when VS Code isn't running). Run this
 * command once, right before uninstalling the extension from the Extensions view.
 */
export async function removeClaudeHook(outputChannel: vscode.OutputChannel): Promise<void> {
  const settings = readClaudeSettings();
  if (!settings?.hooks) {
    void vscode.window.showInformationMessage('Pause on Done: no Claude Code hook is currently configured — nothing to remove.');
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `Pause on Done will remove its Stop and UserPromptSubmit hooks from ${CLAUDE_SETTINGS_PATH}. ` +
      'Any other hooks you have configured will be left untouched. Run this before uninstalling the extension.',
    { modal: true },
    'Remove Hook'
  );

  if (choice !== 'Remove Hook') {
    return;
  }

  const removedStop = removeHook(settings.hooks, 'Stop', 'hookRunner.js');
  const removedResume = removeHook(settings.hooks, 'UserPromptSubmit', 'resumeRunner.js');

  if (!removedStop && !removedResume) {
    void vscode.window.showInformationMessage('Pause on Done: no matching hook entries were found — nothing to remove.');
    return;
  }

  try {
    writeClaudeSettings(settings);
    outputChannel.appendLine(`[Pause on Done] Removed Claude Code hooks from ${CLAUDE_SETTINGS_PATH}`);
  } catch (err) {
    outputChannel.appendLine(`[Pause on Done] Failed to update Claude Code settings: ${err}`);
    void vscode.window.showErrorMessage(`Pause on Done: failed to update ${CLAUDE_SETTINGS_PATH}: ${err}`);
    return;
  }

  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // Fine if it doesn't exist — nothing to clean up.
  }

  void vscode.window.showInformationMessage(
    'Pause on Done: Claude Code hook removed. You can now uninstall the extension from the Extensions view.'
  );
}
