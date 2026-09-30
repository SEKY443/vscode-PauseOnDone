import * as vscode from 'vscode';
import { ConfirmationAlertConfig, HookConfig, writeHookConfig } from './hookConfigCore';
import { OvernightModeBehavior, OvernightModeConfig } from './overnightModeCore';

/** Reads the pauseOnDone.confirmationAlert.* settings into a ConfirmationAlertConfig. */
export function readConfirmationAlertConfig(config: vscode.WorkspaceConfiguration): ConfirmationAlertConfig {
  return {
    enabled: config.get<boolean>('confirmationAlert.enabled', false),
  };
}

/**
 * Reads the pauseOnDone.overnightMode.* settings into an OvernightModeConfig. Shared by
 * syncHookConfigFromSettings below and mediaControl.ts's own resolveConfiguredCompletionOptions,
 * so the terminal-scanning path and the Claude Code hook path apply Overnight Mode identically.
 */
export function readOvernightModeConfig(config: vscode.WorkspaceConfiguration): OvernightModeConfig {
  return {
    enabled: config.get<boolean>('overnightMode.enabled', false),
    startTime: config.get<string>('overnightMode.startTime', '22:00'),
    endTime: config.get<string>('overnightMode.endTime', '07:00'),
    behavior: config.get<OvernightModeBehavior>('overnightMode.behavior', 'ringOnly'),
    autoResumeDelaySeconds: config.get<number>('overnightMode.autoResumeDelaySeconds', 10),
  };
}

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
    overnightMode: readOvernightModeConfig(config),
    confirmationAlert: readConfirmationAlertConfig(config),
  };

  try {
    writeHookConfig(hookConfig);
  } catch (err) {
    outputChannel.appendLine(`[Pause on Done] Failed to sync settings to the Claude Code hook config file: ${err}`);
  }
}
