import * as path from 'path';
import * as fs from 'fs';
import playSound = require('play-sound');

// play-sound automatically finds an available player program per platform:
// macOS -> afplay (built into the OS, no extra install needed)
// Linux -> aplay / mpg123 / mplayer, etc. (any one of these installed is enough)
// Windows -> built-in PowerShell / mplay32, etc.
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

    player.play(absoluteFilePath, (err: unknown) => {
      if (err) {
        log(`Failed to play sound — the system may be missing an available player (e.g. install mpg123 or aplay on Linux): ${err}`);
      }
      resolve();
    });
  });
}
