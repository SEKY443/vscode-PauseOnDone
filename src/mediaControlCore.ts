import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { playLocalSound, Logger } from './soundPlayer';

const execAsync = promisify(exec);

// Tracks "did we pause the music ourselves last time", so the next turn can decide whether to
// resume playback automatically, and so we don't replay the notification sound while the music
// is still paused from our own earlier action (see handleTaskCompletion).
// This has to be a file: the Stop hook and the UserPromptSubmit hook are each separate node
// processes with no shared memory, so the filesystem is the only way to pass this state between
// them. Stored in the OS temp dir, so it naturally resets on reboot.
export const STATE_FILE = path.join(os.tmpdir(), 'pause-on-done-state.json');

interface PersistedState {
  pausedByUs: boolean;
}

function readState(): PersistedState {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { pausedByUs: parsed.pausedByUs === true };
  } catch {
    return { pausedByUs: false };
  }
}

function writeState(state: PersistedState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // A write failure (e.g. temp dir permission issue) shouldn't crash the main flow —
    // worst case, auto-resume just won't happen next time.
  }
}

/**
 * Pure Node logic (no vscode API dependency), so it can be shared by both:
 * - The VS Code extension itself (mediaControl.ts is a thin wrapper that reads vscode settings
 *   then calls into here)
 * - hookRunner.ts / resumeRunner.ts (standalone scripts called directly by the official hook
 *   mechanisms of Claude Code / Codex CLI / Gemini CLI)
 * avoiding duplicated logic between the two.
 *
 * Main flow on task completion:
 * 1. Check whether the system currently has music/media playing
 * 2. [Case A] Playing -> send a pause command, and record "we paused it"
 * 3. [Case B] Not playing, but we were the one who paused it last time and it hasn't been resumed
 *    yet -> the music is simply still in the paused state we left it in; don't notify again
 *    (avoids dinging on every single turn)
 * 4. [Case C] Not playing, and it wasn't us who paused it -> genuinely no music was playing, so
 *    play the notification sound
 */
export async function handleTaskCompletion(soundFilePath: string, log: Logger): Promise<void> {
  try {
    const playing = await isMediaPlaying();

    if (playing) {
      log('Detected music playing -> sending pause command');
      await pauseMedia();
      writeState({ pausedByUs: true });
      return;
    }

    if (readState().pausedByUs) {
      log('Music is still in the paused state we left it in (not yet resumed) -> skipping notification');
      return;
    }

    log('No music currently playing -> playing the notification sound instead');
    writeState({ pausedByUs: false });
    await playLocalSound(soundFilePath, log);
  } catch (err) {
    log(`Error in media control flow: ${err}`);
  }
}

/**
 * Debug helpers for the !PODBell! / !PODStop! / !PODResume! / !PODToggle! magic tokens
 * (see matching.ts). Unlike handleTaskCompletion/resumeIfWePausedIt, these are direct, explicit
 * commands — they don't consult or preserve the "did we pause it" heuristic state beyond keeping
 * it consistent for whichever normal flow runs next.
 */

export async function forcePause(log: Logger): Promise<void> {
  try {
    log('Debug token: force-pausing media');
    await pauseMedia();
    writeState({ pausedByUs: true });
  } catch (err) {
    log(`Error force-pausing media: ${err}`);
  }
}

export async function forceResume(log: Logger): Promise<void> {
  try {
    log('Debug token: force-resuming media');
    await resumeMedia();
  } catch (err) {
    log(`Error force-resuming media: ${err}`);
  } finally {
    writeState({ pausedByUs: false });
  }
}

export async function forceToggle(log: Logger): Promise<void> {
  try {
    const playing = await isMediaPlaying();
    if (playing) {
      log('Debug token: toggling media -> pause');
      await pauseMedia();
      writeState({ pausedByUs: true });
    } else {
      log('Debug token: toggling media -> resume');
      await resumeMedia();
      writeState({ pausedByUs: false });
    }
  } catch (err) {
    log(`Error toggling media: ${err}`);
  }
}

export async function forceBell(soundFilePath: string, log: Logger): Promise<void> {
  log('Debug token: force-playing the notification sound');
  await playLocalSound(soundFilePath, log);
}

/**
 * Called when the user sends their next message: only sends a resume command if we genuinely
 * paused the music last time. If last time we played the notification sound instead (meaning
 * there was no music to begin with), or the music wasn't paused by us, this does nothing —
 * avoids incorrect resume actions.
 */
export async function resumeIfWePausedIt(log: Logger): Promise<void> {
  const state = readState();
  if (!state.pausedByUs) {
    log('Music was not paused by this tool last time -> skipping auto-resume');
    return;
  }

  try {
    log('Detected music that this tool paused earlier -> resuming playback');
    await resumeMedia();
  } catch (err) {
    log(`Error resuming playback: ${err}`);
  } finally {
    writeState({ pausedByUs: false });
  }
}

/**
 * Checks whether the system currently has media playing (dispatches by platform).
 */
async function isMediaPlaying(): Promise<boolean> {
  switch (process.platform) {
    case 'darwin':
      return isMediaPlayingMac();
    case 'linux':
      return isMediaPlayingLinux();
    default:
      // Windows currently has no stable, install-free CLI to check global playback state,
      // so conservatively treat it as "not playing" and fall back to the notification sound.
      return false;
  }
}

/**
 * macOS playback detection:
 * Prefers nowplaying-cli (brew install nowplaying-cli), which reads system-level Now Playing
 * info (MPNowPlayingInfoCenter) — so it covers more than just Spotify/Apple Music, including
 * media playing in a browser. Falls back to AppleScript, asking Spotify and Music.app
 * individually, if it's not installed.
 */
async function isMediaPlayingMac(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('nowplaying-cli get playbackRate');
    const rate = parseFloat(stdout.trim());
    if (!Number.isNaN(rate)) {
      return rate > 0;
    }
  } catch {
    // nowplaying-cli not installed or failed to run — fall through to the AppleScript fallback
  }

  const appleScript = `
    set isPlaying to false
    tell application "System Events"
      if (exists process "Spotify") then
        tell application "Spotify"
          if player state is playing then set isPlaying to true
        end tell
      end if
      if (exists process "Music") then
        tell application "Music"
          if player state is playing then set isPlaying to true
        end tell
      end if
    end tell
    return isPlaying
  `;

  try {
    const { stdout } = await execAsync(`osascript -e '${escapeAppleScript(appleScript)}'`);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Linux playback detection: uses playerctl (installable via apt/pacman on most distros).
 */
async function isMediaPlayingLinux(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('playerctl status');
    return stdout.trim().toLowerCase() === 'playing';
  } catch {
    // playerctl not installed, or no MPRIS-compatible player currently running
    return false;
  }
}

/**
 * Sends a system-level "play/pause" command to pause the music.
 */
async function pauseMedia(): Promise<void> {
  switch (process.platform) {
    case 'darwin':
      await pauseMediaMac();
      return;
    case 'linux':
      await execAsync('playerctl pause');
      return;
    case 'win32':
      await pauseMediaWindows();
      return;
    default:
      return;
  }
}

async function pauseMediaMac(): Promise<void> {
  try {
    // nowplaying-cli can send a pause command directly to whichever app is "currently playing" —
    // the most reliable option
    await execAsync('nowplaying-cli pause');
    return;
  } catch {
    // Fallback: pause Spotify / Music.app individually via AppleScript
  }

  const appleScript = `
    tell application "System Events"
      if (exists process "Spotify") then
        tell application "Spotify" to pause
      end if
      if (exists process "Music") then
        tell application "Music" to pause
      end if
    end tell
  `;
  await execAsync(`osascript -e '${escapeAppleScript(appleScript)}'`);
}

async function pauseMediaWindows(): Promise<void> {
  // Windows has no built-in CLI to simulate the hardware media key —
  // requires installing nircmd separately (https://www.nirsoft.net/utils/nircmd.html) and adding it to PATH.
  try {
    await execAsync('nircmd sendkeypress mediaplaypause');
  } catch {
    throw new Error(
      'On Windows, nircmd must be installed and added to PATH to send media keys — see the setup notes.'
    );
  }
}

/**
 * Sends a system-level "resume playback" command (the counterpart to pauseMedia).
 */
async function resumeMedia(): Promise<void> {
  switch (process.platform) {
    case 'darwin':
      await resumeMediaMac();
      return;
    case 'linux':
      await execAsync('playerctl play');
      return;
    case 'win32':
      // Windows uses the hardware media key (play/pause toggle) — same command as
      // pauseMediaWindows, since it's a toggle: sending it twice is "pause -> resume".
      await pauseMediaWindows();
      return;
    default:
      return;
  }
}

async function resumeMediaMac(): Promise<void> {
  try {
    await execAsync('nowplaying-cli play');
    return;
  } catch {
    // Fallback: resume Spotify / Music.app individually via AppleScript
  }

  const appleScript = `
    tell application "System Events"
      if (exists process "Spotify") then
        tell application "Spotify" to play
      end if
      if (exists process "Music") then
        tell application "Music" to play
      end if
    end tell
  `;
  await execAsync(`osascript -e '${escapeAppleScript(appleScript)}'`);
}

function escapeAppleScript(script: string): string {
  return script.replace(/'/g, "'\\''");
}
