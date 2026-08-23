import * as vscode from 'vscode';
import { handleTaskCompletion, forcePause, forceResume, forceToggle, forceBell } from './mediaControl';
import { findCompletionMatch, findMagicToken } from './matching';

let lastTriggerTimestamp = 0;

/**
 * Checks whether a chunk of terminal output text contains a "task completed" keyword/AI signal,
 * and if so calls triggerCompletion() to fire it (subject to the cooldown period).
 *
 * The matching logic itself lives in matching.ts (no vscode API dependency, so it's easy to unit
 * test) — this function is only responsible for reading user settings and applying the result.
 *
 * @param text The currently accumulated terminal output buffer text
 * @param outputChannel Output channel used for debug logging
 */
export function checkAndHandleCompletion(text: string, outputChannel: vscode.OutputChannel): void {
  const config = vscode.workspace.getConfiguration('pauseOnDone');
  const userKeywords = config.get<string[]>('completionKeywords', []);
  const enableAiSignal = config.get<boolean>('enableAiSignalDetection', true);

  const match = findCompletionMatch(text, userKeywords, enableAiSignal);
  if (!match) {
    return;
  }

  triggerCompletion(`Completion signal detected: "${match}"`, outputChannel);
}

/**
 * Checks for an explicit debug token (!PODBell! / !PODStop! / !PODResume! / !PODToggle! / !POD!)
 * and dispatches directly to the matching action if found — bypassing the cooldown entirely,
 * since these are deliberate, unambiguous signals rather than fuzzy guesses (a debug session
 * might reasonably send several in quick succession while testing).
 *
 * @returns true if a token was found and handled, so the caller can skip the regular fuzzy
 * keyword/AI-signal check for the same buffer content.
 */
export function checkAndHandleMagicToken(text: string, outputChannel: vscode.OutputChannel): boolean {
  const token = findMagicToken(text);
  if (!token) {
    return false;
  }

  switch (token) {
    case 'bell':
      outputChannel.appendLine('[Pause on Done] Debug token detected: !PODBell!');
      void forceBell(outputChannel);
      break;
    case 'stop':
      outputChannel.appendLine('[Pause on Done] Debug token detected: !PODStop!');
      void forcePause(outputChannel);
      break;
    case 'resume':
      outputChannel.appendLine('[Pause on Done] Debug token detected: !PODResume!');
      void forceResume(outputChannel);
      break;
    case 'toggle':
      outputChannel.appendLine('[Pause on Done] Debug token detected: !PODToggle!');
      void forceToggle(outputChannel);
      break;
    case 'normal':
      outputChannel.appendLine('[Pause on Done] Debug token detected: !POD!');
      void handleTaskCompletion(outputChannel);
      break;
  }

  return true;
}

/**
 * Triggers the media control flow after task completion (subject to the cooldown period, to avoid
 * repeated triggers in a short time window). Shared by keyword matching (checkAndHandleCompletion)
 * and any other "task might be done" signal sources, since they're all just different ways of
 * detecting the same thing.
 */
export function triggerCompletion(reason: string, outputChannel: vscode.OutputChannel): void {
  const config = vscode.workspace.getConfiguration('pauseOnDone');
  const cooldownSeconds = config.get<number>('cooldownSeconds', 5);

  const now = Date.now();
  if (now - lastTriggerTimestamp < cooldownSeconds * 1000) {
    return;
  }
  lastTriggerTimestamp = now;

  outputChannel.appendLine(`[Pause on Done] ${reason} -> triggering media control`);
  void handleTaskCompletion(outputChannel);
}

/**
 * Used by the "manual test" command: resets the cooldown timer so the next detection is
 * guaranteed to trigger.
 */
export function resetCooldown(): void {
  lastTriggerTimestamp = 0;
}
