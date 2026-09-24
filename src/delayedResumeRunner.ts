import { resumeIfWePausedIt } from './mediaControlCore';

/**
 * Standalone entry point with no VS Code dependency, spawned as a detached background process by
 * mediaControlCore.ts's scheduleDelayedResume() — never invoked directly by a Claude Code hook.
 *
 * Invocation: node <path to this file after compilation>/delayedResumeRunner.js <delaySeconds>
 *
 * Waits the given number of seconds, then resumes playback only if it's still in the paused state
 * this tool left it in (resumeIfWePausedIt already guards against resuming music the user paused
 * themselves in the meantime, or double-resuming if the user's next message already triggered
 * resumeRunner.ts first). Passing `true` bypasses the pauseOnDone.autoResume gate deliberately:
 * this delayed resume is Overnight Mode's own explicit behavior, not the "resume on next message"
 * feature that setting controls.
 */
void (async () => {
  const log = (message: string) => {
    console.error(`[Pause on Done] ${message}`);
  };

  const delaySeconds = Number(process.argv[2]);
  if (!Number.isFinite(delaySeconds) || delaySeconds <= 0) {
    log(`Invalid delay argument, exiting without resuming: ${process.argv[2]}`);
    process.exit(0);
  }

  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  await resumeIfWePausedIt(true, log);

  process.exit(0);
})();
