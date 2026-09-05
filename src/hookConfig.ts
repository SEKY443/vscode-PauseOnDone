import * as vscode from 'vscode';
import { HookConfig, writeHookConfig } from './hookConfigCore';

/**
 * Snapshots the current pauseOnDone.* settings into ~/.pause-on-done/config.json, so the
 * standalone hook scripts (hookRunner.ts/resumeRunner.ts) — which have no access to VS Code's
 * settings system at all — can honor them too. Without this, settings like pauseMusic/
 * playNotificationSound/autoResume would only ever affect the terminal-scanning path.
 */
export function syncHookConfigFromSettings(outputChannel: vscode.OutputChannel): void {
  const config = vscode.workspace.getConfiguration('pauseOnDone');
  const hookConfig: HookConfig = {
    enabled: config.get<boolean>('enabled', true),
    pauseMusic: config.get<boolean>('pauseMusic', true),
    playNotificationSound: config.get<boolean>('playNotificationSound', true),
    ringWhenPausing: config.get<boolean>('ringWhenPausing', true),
    autoResume: config.get<boolean>('autoResume', true),
  };

  try {
    writeHookConfig(hookConfig);
  } catch (err) {
    outputChannel.appendLine(`[Pause on Done] Failed to sync settings to the Claude Code hook config file: ${err}`);
  }
}
