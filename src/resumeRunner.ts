import { resumeIfWePausedIt } from './mediaControlCore';
import { readHookConfig } from './hookConfigCore';

/**
 * Standalone entry point with no VS Code dependency, called directly by AI CLI tools' "user
 * submitted the next message" hook (Claude Code's UserPromptSubmit hook, Gemini CLI's
 * BeforeAgent hook).
 *
 * Invocation: node <path to this file after compilation, i.e. out/resumeRunner.js>
 *
 * Only resumes playback if hookRunner.js genuinely paused the music the last time it ran, and
 * pauseOnDone.autoResume is enabled. In every other case (there was no music playing to begin
 * with, the music wasn't paused by this tool, or auto-resume is turned off), it does nothing.
 */
void (async () => {
  const log = (message: string) => {
    console.error(`[Pause on Done] ${message}`);
  };

  const hookConfig = readHookConfig();
  if (!hookConfig.enabled) {
    log('Disabled via pauseOnDone.enabled -> skipping');
    process.exit(0);
  }

  await resumeIfWePausedIt(hookConfig.autoResume, log);

  process.exit(0);
})();
