import * as path from 'path';
import { CONFIRMATION_ALERT_SOUND_FILE, playConfirmationAlert } from './mediaControlCore';
import { resolveSoundPath } from './soundPlayer';
import { readHookConfig } from './hookConfigCore';

/**
 * Standalone entry point with no VS Code dependency, called directly by Claude Code's
 * Notification hook (matcher: "permission_prompt|idle_prompt" — see claudeHookSync.ts), which
 * fires when Claude needs your permission for something (including exiting plan mode) or has been
 * waiting idle for your input. Deliberately does NOT touch pause/resume state at all — this is a
 * standalone "something needs your attention" alert, independent of the task-completion flow in
 * hookRunner.ts.
 *
 * Invocation: node <path to this file after compilation, i.e. out/notificationRunner.js>
 *
 * Claude Code attaches a JSON payload via stdin describing the notification, but all we need is
 * the fact that it fired (the Notification event's matcher already filtered to the types we care
 * about before invoking this at all), so the payload is ignored entirely.
 */
void (async () => {
  const log = (message: string) => {
    // Deliberately writing to stderr, matching hookRunner.ts/resumeRunner.ts: the Notification
    // hook is documented as unable to affect Claude Code's behavior either way, so this is purely
    // for our own debugging, but keeping stdout clear is a cheap habit to keep everywhere.
    console.error(`[Pause on Done] ${message}`);
  };

  const hookConfig = readHookConfig();
  if (!hookConfig.enabled) {
    log('Disabled via pauseOnDone.enabled -> skipping confirmation alert');
    process.exit(0);
  }
  if (!hookConfig.confirmationAlert.enabled) {
    log('Confirmation alert disabled via pauseOnDone.confirmationAlert.enabled -> skipping');
    process.exit(0);
  }
  if (!hookConfig.playNotificationSound) {
    log('Notification sound disabled via pauseOnDone.playNotificationSound -> skipping confirmation alert');
    process.exit(0);
  }

  const extensionRoot = path.join(__dirname, '..');
  const soundFilePath = resolveSoundPath(CONFIRMATION_ALERT_SOUND_FILE, extensionRoot);

  await playConfirmationAlert(soundFilePath, log);

  process.exit(0);
})();
