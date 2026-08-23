import { resumeIfWePausedIt } from './mediaControlCore';

/**
 * Standalone entry point with no VS Code dependency, called directly by AI CLI tools' "user
 * submitted the next message" hook (Claude Code's UserPromptSubmit hook, Gemini CLI's
 * BeforeAgent hook).
 *
 * Invocation: node <path to this file after compilation, i.e. out/resumeRunner.js>
 *
 * Only resumes playback if hookRunner.js genuinely paused the music the last time it ran.
 * In every other case (there was no music playing to begin with, or the music wasn't paused
 * by this tool), it does nothing.
 */
void (async () => {
  await resumeIfWePausedIt((message) => {
    console.error(`[Pause on Done] ${message}`);
  });

  process.exit(0);
})();
