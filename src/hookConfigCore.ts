import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Pure logic (no vscode API dependency), so it can be unit tested outside the Extension Host and
 * used directly by the standalone hookRunner.ts/resumeRunner.ts scripts, which have no access to
 * vscode.workspace.getConfiguration() at all (they're plain Node processes invoked by Claude
 * Code's hook mechanism, not running inside VS Code).
 *
 * Stored under the user's home directory (not the OS temp dir like STATE_FILE in
 * mediaControlCore.ts) since this is a persistent preference snapshot, not ephemeral run state.
 */
export const HOOK_CONFIG_PATH = path.join(os.homedir(), '.pause-on-done', 'config.json');

export interface HookConfig {
  enabled: boolean;
  pauseMusic: boolean;
  playNotificationSound: boolean;
  autoResume: boolean;
}

export const DEFAULT_HOOK_CONFIG: HookConfig = {
  enabled: true,
  pauseMusic: true,
  playNotificationSound: true,
  autoResume: true,
};

/**
 * Reads the synced config, falling back to all-enabled defaults if the file is missing,
 * unreadable, or malformed — so hook scripts keep working (matching the pre-existing behavior)
 * even before the VS Code extension has ever run to write this file, or if it's been deleted.
 */
export function readHookConfig(configPath: string = HOOK_CONFIG_PATH): HookConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      pauseMusic: parsed.pauseMusic !== false,
      playNotificationSound: parsed.playNotificationSound !== false,
      autoResume: parsed.autoResume !== false,
    };
  } catch {
    return { ...DEFAULT_HOOK_CONFIG };
  }
}

export function writeHookConfig(config: HookConfig, configPath: string = HOOK_CONFIG_PATH): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
