import * as path from 'path';
import { handleTaskCompletion } from './mediaControlCore';
import { resolveSoundPath } from './soundPlayer';
import { readHookConfig } from './hookConfigCore';

/**
 * Standalone entry point with no VS Code dependency, called directly by AI CLI tools' official
 * hook mechanisms (Claude Code's Stop hook, Gemini CLI's AfterAgent hook, Codex CLI's notify
 * config).
 *
 * Invocation: node <path to this file after compilation, i.e. out/hookRunner.js>
 *
 * These tools usually attach a JSON payload via stdin or an extra CLI argument (the format
 * differs per tool), but all we need is the fact that it was called — we don't need to parse
 * the payload, so it's ignored entirely.
 *
 * This path doesn't need VS Code running at all, and isn't subject to any Shell Integration /
 * Extension Development Host limitations, so it works fine in a packaged, published build, used
 * from any terminal environment.
 */
void (async () => {
  const log = (message: string) => {
    // Deliberately writing to stderr: some AI CLI hook mechanisms parse stdout as JSON output,
    // so writing here avoids interfering with that (our hook doesn't need to return any JSON).
    console.error(`[Pause on Done] ${message}`);
  };

  const hookConfig = readHookConfig();
  if (!hookConfig.enabled) {
    log('Disabled via pauseOnDone.enabled -> skipping');
    process.exit(0);
  }

  const extensionRoot = path.join(__dirname, '..');
  const soundFilePath = resolveSoundPath('bell_sound.wav', extensionRoot);

  await handleTaskCompletion(
    soundFilePath,
    { pauseMusic: hookConfig.pauseMusic, playNotificationSound: hookConfig.playNotificationSound },
    log
  );

  process.exit(0);
})();
