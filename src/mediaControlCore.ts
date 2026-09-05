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

export interface CompletionOptions {
  /** Whether to send a pause command when music is playing. If false, the notification sound plays instead (subject to playNotificationSound), regardless of playback state. */
  pauseMusic: boolean;
  /** Whether to play the notification sound when there's nothing to pause (either nothing is playing, or pauseMusic is disabled). If false, nothing happens in that case. */
  playNotificationSound: boolean;
  /**
   * Whether to also play the notification sound right after pausing playing music (subject to
   * playNotificationSound). If false, pausing happens silently instead — the classic "pause
   * without ringing" behavior, with the notification sound reserved for when there was nothing to
   * pause in the first place.
   */
  ringWhenPausing: boolean;
}

export const DEFAULT_COMPLETION_OPTIONS: CompletionOptions = {
  pauseMusic: true,
  playNotificationSound: true,
  ringWhenPausing: true,
};

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
 * 2. [Case A] Playing, and pauseMusic is enabled -> send a pause command, record "we paused it",
 *    then (if ringWhenPausing and playNotificationSound are both enabled) also play the
 *    notification sound, so completion is noticeable even while you're away from the screen.
 * 3. [Case B] Otherwise (nothing playing, or pauseMusic is disabled) — if playNotificationSound is
 *    disabled, do nothing. Otherwise:
 *    - if we were the one who paused it last time and it hasn't been resumed yet, the music is
 *      simply still in the paused state we left it in; don't notify again (avoids dinging on
 *      every single turn)
 *    - otherwise, play the notification sound
 */
export async function handleTaskCompletion(
  soundFilePath: string,
  options: CompletionOptions,
  log: Logger
): Promise<void> {
  try {
    const playing = await isMediaPlaying();

    if (options.pauseMusic && playing) {
      log('Detected music playing -> sending pause command');
      await pauseMedia();
      writeState({ pausedByUs: true });

      if (options.playNotificationSound && options.ringWhenPausing) {
        log('Also playing the notification sound after pausing');
        await playLocalSound(soundFilePath, log);
      }
      return;
    }

    if (!options.playNotificationSound) {
      log('Notification sound is disabled -> nothing to do');
      return;
    }

    if (readState().pausedByUs) {
      log('Music is still in the paused state we left it in (not yet resumed) -> skipping notification');
      return;
    }

    log(
      playing
        ? 'Music is playing but pausing is disabled -> playing the notification sound instead'
        : 'No music currently playing -> playing the notification sound instead'
    );
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
 * Called when the user sends their next message: only sends a resume command if autoResume is
 * enabled AND we genuinely paused the music last time. If last time we played the notification
 * sound instead (meaning there was no music to begin with), or the music wasn't paused by us,
 * this does nothing — avoids incorrect resume actions.
 */
export async function resumeIfWePausedIt(autoResume: boolean, log: Logger): Promise<void> {
  if (!autoResume) {
    log('Auto-resume is disabled -> leaving music as-is');
    return;
  }

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
    case 'win32':
      return isMediaPlayingWindows();
    default:
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

/**
 * Windows media control: uses the same WinRT API Windows' own Now Playing / Media Control
 * overlay is built on (GlobalSystemMediaTransportControlsSessionManager), via a PowerShell
 * interop shim — there's no CLI equivalent to nowplaying-cli/playerctl available out of the box
 * on Windows. Requires Windows 10+; runs through powershell.exe (Windows PowerShell 5.1, bundled
 * with every Windows 10/11 install) specifically rather than pwsh/PowerShell 7, since the
 * WinRT projection this technique relies on (System.Runtime.WindowsRuntime) has had inconsistent
 * support in PowerShell 7's .NET-Core-based runtime.
 *
 * Caveat: this hasn't been verified against a real Windows machine — it's built from the same
 * documented technique other open-source Windows Now Playing tools use, but if the WinRT call
 * fails for any reason (older Windows, no active session, policy restrictions), every function
 * here falls back to nircmd's media-key toggle (https://www.nirsoft.net/utils/nircmd.html, must
 * be installed and on PATH), same as before this existed. isMediaPlayingWindows() has no such
 * fallback since nircmd can't report playback state — it just reports "not playing" on failure,
 * consistent with how the other platforms behave when their detection tool is unavailable.
 */
const POWERSHELL_MEDIA_BOILERPLATE = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$sessionManager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

# The "current" session (the one Windows itself guesses is most relevant) is often not the one
# actually playing when several apps expose a media session at once (e.g. a paused Spotify plus a
# playing browser tab). So instead of trusting GetCurrentSession() alone, this scans every session
# for one matching the requested status, checking "current" first only as a tie-breaker preference.
# PlaybackStatus is a WinRT enum: comparing its .ToString() against the status name (rather than
# the previous "compare to the raw '4'" check) is required because PowerShell's Write-Output
# serializes an enum value as its name (e.g. "Playing"), not its underlying integer.
function Find-Session([string]$Status) {
    if ($null -eq $sessionManager) { return $null }
    $current = $sessionManager.GetCurrentSession()
    if ($null -ne $current -and $current.GetPlaybackInfo().PlaybackStatus.ToString() -eq $Status) {
        return $current
    }
    foreach ($s in $sessionManager.GetSessions()) {
        if ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq $Status) {
            return $s
        }
    }
    return $null
}
`;

async function runWindowsMediaScript(actionScript: string): Promise<string> {
  const scriptPath = path.join(os.tmpdir(), `pause-on-done-media-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(scriptPath, POWERSHELL_MEDIA_BOILERPLATE + actionScript, 'utf8');
  try {
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { timeout: 5000, windowsHide: true }
    );
    return stdout.trim();
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Best-effort cleanup — a leftover temp .ps1 file is harmless.
    }
  }
}

async function isMediaPlayingWindows(): Promise<boolean> {
  try {
    const output = await runWindowsMediaScript(`
$playing = Find-Session 'Playing'
Write-Output ($(if ($null -ne $playing) { 'true' } else { 'false' }))
`);
    return output === 'true';
  } catch {
    return false;
  }
}

async function pauseMediaWindows(): Promise<void> {
  try {
    await runWindowsMediaScript(`
$target = Find-Session 'Playing'
if ($null -ne $target) {
    Await ($target.TryPauseAsync()) ([bool]) | Out-Null
}
`);
    return;
  } catch {
    // Fall through to the nircmd fallback below
  }

  try {
    await execAsync('nircmd sendkeypress mediaplaypause');
  } catch {
    throw new Error(
      'Could not pause media playback on Windows. Install nircmd and add it to PATH as a fallback — see the setup notes.'
    );
  }
}

async function resumeMediaWindows(): Promise<void> {
  try {
    await runWindowsMediaScript(`
$target = Find-Session 'Paused'
if ($null -eq $target) { $target = $sessionManager.GetCurrentSession() }
if ($null -ne $target) {
    Await ($target.TryPlayAsync()) ([bool]) | Out-Null
}
`);
    return;
  } catch {
    // Fall through to the nircmd fallback below
  }

  try {
    // nircmd's media key is a toggle rather than a true "play" command, so this fallback only
    // actually resumes if the track happens to be paused right now.
    await execAsync('nircmd sendkeypress mediaplaypause');
  } catch {
    throw new Error(
      'Could not resume media playback on Windows. Install nircmd and add it to PATH as a fallback — see the setup notes.'
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
      await resumeMediaWindows();
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
