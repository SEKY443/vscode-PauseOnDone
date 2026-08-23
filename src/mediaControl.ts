import * as vscode from 'vscode';
import {
  handleTaskCompletion as coreHandleTaskCompletion,
  forcePause as coreForcePause,
  forceResume as coreForceResume,
  forceToggle as coreForceToggle,
  forceBell as coreForceBell,
} from './mediaControlCore';
import { resolveSoundPath, Logger } from './soundPlayer';

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

/**
 * Thin vscode-aware wrapper: reads the pauseOnDone.soundFile setting, resolves it to an absolute
 * path, and adapts vscode.OutputChannel into a plain Logger callback. All the real logic lives
 * in mediaControlCore.ts.
 */
export async function handleTaskCompletion(outputChannel: vscode.OutputChannel): Promise<void> {
  await coreHandleTaskCompletion(resolveConfiguredSoundPath(), toLogger(outputChannel));
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
