import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_OVERNIGHT_MODE_CONFIG, OvernightModeConfig } from './overnightModeCore';

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
  ringWhenPausing: boolean;
  autoResume: boolean;
  overnightMode: OvernightModeConfig;
}

export const DEFAULT_HOOK_CONFIG: HookConfig = {
  enabled: true,
  pauseMusic: true,
  playNotificationSound: true,
  ringWhenPausing: true,
  autoResume: true,
  overnightMode: DEFAULT_OVERNIGHT_MODE_CONFIG,
};

/**
 * Reads the synced config, falling back to all-enabled defaults if the file is missing,
 * unreadable, or malformed — so hook scripts keep working (matching the pre-existing behavior)
 * even before the VS Code extension has ever run to write this file, or if it's been deleted.
 *
 * Note the asymmetry for overnightMode.enabled: every other flag here fails OPEN (defaults to
 * true, preserving pre-existing behavior) on a missing/malformed value, but overnightMode.enabled
 * fails CLOSED (defaults to false). Overnight Mode changes default pause behavior only during a
 * specific time window, so a malformed config should never have it silently switch on — the safe
 * failure here is "behave normally", not "start suppressing pauses at arbitrary hours".
 */
export function readHookConfig(configPath: string = HOOK_CONFIG_PATH): HookConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const overnight = parsed.overnightMode ?? {};
    return {
      enabled: parsed.enabled !== false,
      pauseMusic: parsed.pauseMusic !== false,
      playNotificationSound: parsed.playNotificationSound !== false,
      ringWhenPausing: parsed.ringWhenPausing !== false,
      autoResume: parsed.autoResume !== false,
      overnightMode: {
        enabled: overnight.enabled === true,
        startTime: typeof overnight.startTime === 'string' ? overnight.startTime : DEFAULT_OVERNIGHT_MODE_CONFIG.startTime,
        endTime: typeof overnight.endTime === 'string' ? overnight.endTime : DEFAULT_OVERNIGHT_MODE_CONFIG.endTime,
        behavior: overnight.behavior === 'autoResumeAfterDelay' ? 'autoResumeAfterDelay' : 'ringOnly',
        autoResumeDelaySeconds:
          typeof overnight.autoResumeDelaySeconds === 'number' && overnight.autoResumeDelaySeconds > 0
            ? overnight.autoResumeDelaySeconds
            : DEFAULT_OVERNIGHT_MODE_CONFIG.autoResumeDelaySeconds,
      },
    };
  } catch {
    return { ...DEFAULT_HOOK_CONFIG };
  }
}

export function writeHookConfig(config: HookConfig, configPath: string = HOOK_CONFIG_PATH): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
