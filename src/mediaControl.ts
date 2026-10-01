import * as vscode from 'vscode';
import {
  handleTaskCompletion as coreHandleTaskCompletion,
  forcePause as coreForcePause,
  forceResume as coreForceResume,
  forceToggle as coreForceToggle,
  forceBell as coreForceBell,
  playConfirmationAlert as corePlayConfirmationAlert,
  CONFIRMATION_ALERT_SOUND_FILE,
  CompletionOptions,
} from './mediaControlCore';
import { resolveSoundPath, Logger } from './soundPlayer';
import { readOvernightModeConfig } from './hookConfig';
import { applyOvernightMode } from './overnightModeCore';

let extensionRootPath = '';

/**
 * Called by extension.ts during activate() to record the extension's install path, so that a
 * relative soundFile setting value can be resolved correctly.
 */
export function setExtensionRootPath(rootPath: string): void {
  extensionRootPath = rootPath;
}

function toLogger(outputChannel: vscode.OutputChannel): Logger {
  return (message) => outputChannel.appendLine(`[Pause on Done] ${message}`);
}

function resolveConfiguredSoundPath(): string {
  const config = vscode.workspace.getConfiguration('pauseOnDone');
  const soundFile = config.get<string>('soundFile', 'bell_sound.wav');
  return resolveSoundPath(soundFile, extensionRootPath);
}

function resolveConfiguredCompletionOptions(): CompletionOptions {
  const config = vscode.workspace.getConfiguration('pauseOnDone');
  const baseOptions: CompletionOptions = {
    pauseMusic: config.get<boolean>('pauseMusic', true),
    playNotificationSound: config.get<boolean>('playNotificationSound', true),
    ringWhenPausing: config.get<boolean>('ringWhenPausing', true),
  };
  return applyOvernightMode(baseOptions, readOvernightModeConfig(config));
}

/**
 * Thin vscode-aware wrapper: reads the pauseOnDone.* settings, resolves the sound path to an
 * absolute path, and adapts vscode.OutputChannel into a plain Logger callback. All the real
 * logic lives in mediaControlCore.ts.
 */
export async function handleTaskCompletion(outputChannel: vscode.OutputChannel): Promise<void> {
  await coreHandleTaskCompletion(resolveConfiguredSoundPath(), resolveConfiguredCompletionOptions(), toLogger(outputChannel));
}

/** Debug token !PODStop! — force-pause, regardless of current state. */
export async function forcePause(outputChannel: vscode.OutputChannel): Promise<void> {
  await coreForcePause(toLogger(outputChannel));
}

/** Debug token !PODResume! — force-resume, regardless of whether this tool paused it. */
export async function forceResume(outputChannel: vscode.OutputChannel): Promise<void> {
  await coreForceResume(toLogger(outputChannel));
}

/** Debug token !PODToggle! — pause if playing, resume if not. */
export async function forceToggle(outputChannel: vscode.OutputChannel): Promise<void> {
  await coreForceToggle(toLogger(outputChannel));
}

/** Debug token !PODBell! — force-play the notification sound, regardless of playback state. */
export async function forceBell(outputChannel: vscode.OutputChannel): Promise<void> {
  await coreForceBell(resolveConfiguredSoundPath(), toLogger(outputChannel));
}

/**
 * "Pause on Done: Test Confirmation Alert" command — lets you verify the alert sound
 * without needing to actually trigger a real Claude Code permission notification. Always
 * plays regardless of pauseOnDone.confirmationAlert.enabled, mirroring how testTrigger always
 * runs regardless of pauseOnDone.enabled.
 */
export async function triggerConfirmationAlert(outputChannel: vscode.OutputChannel): Promise<void> {
  const soundFilePath = resolveSoundPath(CONFIRMATION_ALERT_SOUND_FILE, extensionRootPath);
  await corePlayConfirmationAlert(soundFilePath, toLogger(outputChannel));
}
