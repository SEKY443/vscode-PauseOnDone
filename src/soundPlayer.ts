import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import playSound = require('play-sound');

const execFileAsync = promisify(execFile);

// play-sound automatically finds an available player program per platform:
// macOS -> afplay (built into the OS, no extra install needed)
// Linux -> aplay / mpg123 / mplayer, etc. (any one of these installed is enough)
// Windows is handled separately (see playWindowsSound below) rather than through play-sound: its
// only usable fallback there is a bare "powershell.exe <file>" invocation, which doesn't actually
// play anything (PowerShell tries to parse the sound file as a script) and, since powershell.exe
// is a console-subsystem executable, briefly flashes a console window on screen while it fails.
const player = playSound({});

/** A simple logging callback, so this module has no dependency on vscode.OutputChannel and can be used in plain Node (see hookRunner.ts). */
export type Logger = (message: string) => void;

/**
 * Pure path resolution logic (no vscode API or filesystem dependency, easy to unit test):
 * an absolute path is returned as-is; a relative path is treated as relative to the extension's
 * install directory.
 */
export function resolveSoundPath(soundFile: string, rootPath: string): string {
  return path.isAbsolute(soundFile) ? soundFile : path.join(rootPath, soundFile);
}

/**
 * Plays a local sound file (given an already-resolved absolute path).
 * If the file doesn't exist, only logs a warning — doesn't throw or interrupt the caller's flow.
 */
export function playLocalSound(absoluteFilePath: string, log: Logger): Promise<void> {
  return new Promise((resolve) => {
    if (!fs.existsSync(absoluteFilePath)) {
      log(`Sound file not found, please check the pauseOnDone.soundFile setting: ${absoluteFilePath}`);
      resolve();
      return;
    }

    if (process.platform === 'win32') {
      playWindowsSound(absoluteFilePath)
        .catch((err) => {
          log(`Failed to play sound via PowerShell: ${err}`);
        })
        .finally(resolve);
      return;
    }

    player.play(absoluteFilePath, (err: unknown) => {
      if (err) {
        log(`Failed to play sound — the system may be missing an available player (e.g. install mpg123 or aplay on Linux): ${err}`);
      }
      resolve();
    });
  });
}

/**
 * Plays a .wav file on Windows using the built-in System.Media.SoundPlayer .NET class (no
 * third-party player needed), via a temp .ps1 script — the same pattern used for Windows media
 * control in mediaControlCore.ts. Runs fully hidden: -WindowStyle Hidden asks PowerShell itself to
 * stay hidden, and windowsHide (a Node child_process option) additionally suppresses the console
 * window Windows would otherwise flash for a console-subsystem process like powershell.exe.
 *
 * Only .wav is supported (a SoundPlayer limitation) — matches the default pauseOnDone.soundFile.
 */
async function playWindowsSound(absoluteFilePath: string): Promise<void> {
  const scriptPath = path.join(os.tmpdir(), `pause-on-done-sound-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  const escapedPath = absoluteFilePath.replace(/'/g, "''");
  fs.writeFileSync(scriptPath, `(New-Object Media.SoundPlayer '${escapedPath}').PlaySync()`, 'utf8');
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
      { windowsHide: true, timeout: 10000 }
    );
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Best-effort cleanup — a leftover temp .ps1 file is harmless.
    }
  }
}
