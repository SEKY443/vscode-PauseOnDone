import * as vscode from 'vscode';
import { resetCooldown } from './completionDetector';
import { setExtensionRootPath, handleTaskCompletion } from './mediaControl';
import { checkAndPromptInstall } from './dependencyInstaller';
import { startWatchingTerminals } from './terminalWatcher';
import { syncClaudeHookPaths, setupClaudeHook, removeClaudeHook, promptToSetupClaudeHookIfMissing } from './claudeHookSync';
import { syncHookConfigFromSettings } from './hookConfig';

let outputChannel: vscode.OutputChannel;

/**
 * Extension entry point.
 *
 * Terminal keyword scanning uses VS Code's stable Shell Integration API (see terminalWatcher.ts),
 * so it can be packaged and published normally. However this mechanism never fires for
 * full-screen interactive programs that take over the terminal, like `claude` (verified through
 * real testing). Those AI CLI tools are instead handled through their own official hook
 * mechanisms, which call the compiled standalone script hookRunner.ts directly (no running
 * VS Code required) — see the project notes for setup.
 */
export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Pause on Done');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('[Pause on Done] Extension activated');

  // Record the extension's install path so relative soundFile settings can be resolved correctly
  setExtensionRootPath(context.extensionPath);

  // Start watching all terminals' command output for keyword/AI completion signal matches (see terminalWatcher.ts)
  startWatchingTerminals(context, outputChannel);

  // Manual test command: run "Pause on Done: Manual Test Trigger" from the Command Palette (Cmd+Shift+P)
  // to verify the media detection/pause/play-sound logic without needing a real terminal keyword match
  const testCommand = vscode.commands.registerCommand('pauseOnDone.testTrigger', () => {
    outputChannel.appendLine('[Pause on Done] Manual test triggered');
    resetCooldown();
    void handleTaskCompletion(outputChannel);
  });
  context.subscriptions.push(testCommand);

  // Manual dependency re-check command: run "Pause on Done: Check and Install Dependencies" from the
  // Command Palette. Forces the prompt again even if it has already been shown before (forcePrompt = true).
  const checkDepsCommand = vscode.commands.registerCommand('pauseOnDone.checkDependencies', () => {
    void checkAndPromptInstall(context, outputChannel, /* forcePrompt */ true);
  });
  context.subscriptions.push(checkDepsCommand);

  // On first activation (or in an environment that hasn't been prompted yet), automatically check
  // whether the recommended media control tool is missing. This only shows a notification — the
  // actual install command only runs once the user clicks the button (see dependencyInstaller.ts).
  void checkAndPromptInstall(context, outputChannel);

  // Setup command for the Claude Code Stop/UserPromptSubmit hooks: from the Command Palette, run
  // "Pause on Done: Set Up Claude Code Hook". Shows exactly what will be written before doing so.
  const setupHookCommand = vscode.commands.registerCommand('pauseOnDone.setupClaudeHook', () => {
    void setupClaudeHook(context, outputChannel);
  });
  context.subscriptions.push(setupHookCommand);

  // Teardown command: run "Pause on Done: Remove Claude Code Hook" once before uninstalling the
  // extension, since VS Code's own uninstall has no way to know about — or clean up — a file we
  // wrote outside its own management (~/.claude/settings.json). See claudeHookSync.ts for why
  // this can't just run automatically on deactivate().
  const removeHookCommand = vscode.commands.registerCommand('pauseOnDone.removeClaudeHook', () => {
    void removeClaudeHook(outputChannel);
  });
  context.subscriptions.push(removeHookCommand);

  // If a Claude Code hook pointing at this extension was already set up previously, keep its path
  // in sync — VS Code installs each extension version into a new versioned directory, so an
  // absolute path baked into ~/.claude/settings.json would otherwise silently go stale on every
  // update (see claudeHookSync.ts for details). Never adds a hook that wasn't already there.
  syncClaudeHookPaths(context, outputChannel);

  // First-run only: if no Claude Code hook is configured yet, proactively ask whether to set one
  // up (same pattern as checkAndPromptInstall above) rather than leaving it undiscoverable behind
  // a Command Palette entry. Still requires an explicit click before writing anything.
  void promptToSetupClaudeHookIfMissing(context, outputChannel);

  // Snapshot the current pauseOnDone.* settings into ~/.pause-on-done/config.json, so the
  // standalone hook scripts (which have no access to VS Code's settings at all) can honor them
  // too — otherwise pauseMusic/playNotificationSound/autoResume/enabled would only affect the
  // terminal-scanning path. Re-synced on every change so edits in Settings take effect right away.
  syncHookConfigFromSettings(outputChannel);
  const configChangeListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('pauseOnDone')) {
      syncHookConfigFromSettings(outputChannel);
    }
  });
  context.subscriptions.push(configChangeListener);
}

export function deactivate(): void {
  // All listeners are registered via context.subscriptions, so VS Code disposes them
  // automatically when the extension is deactivated — no extra cleanup needed here.
}
