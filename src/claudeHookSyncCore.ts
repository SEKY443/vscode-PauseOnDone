import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Pure logic (no vscode API dependency), so it can be unit tested outside the Extension Host.
 * claudeHookSync.ts is the thin vscode-aware wrapper that reads context.extensionPath and shows
 * UI prompts, then calls into the functions here.
 */

export const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

export interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

export interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}

export interface ClaudeSettings {
  hooks?: Record<string, HookGroup[] | undefined>;
  [key: string]: unknown;
}

export function readClaudeSettings(settingsPath: string = CLAUDE_SETTINGS_PATH): ClaudeSettings | null {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeClaudeSettings(settings: ClaudeSettings, settingsPath: string = CLAUDE_SETTINGS_PATH): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export function buildHookCommand(scriptPath: string): string {
  return `node "${scriptPath}"`;
}

/**
 * VS Code installs each extension version into a versioned directory
 * (e.g. ~/.vscode/extensions/<publisher>.pause-on-done-1.2.3), so the extension's install path
 * changes on every update. Since Claude Code's hook config is a plain absolute path string with
 * no templating, a hook set up against one version's path silently breaks the next time this
 * extension auto-updates.
 *
 * Rewrites any hook entry that can be positively identified as our own (by the hookRunner.js /
 * resumeRunner.js filename appearing in its command) to point at the given current command,
 * mutating `settings` in place. Returns true if anything actually changed. Never adds a new hook
 * entry — that requires explicit user consent via the setup flow.
 */
export function syncHookPathsInSettings(
  settings: ClaudeSettings,
  currentHookRunnerCommand: string,
  currentResumeRunnerCommand: string
): boolean {
  if (!settings.hooks) {
    return false;
  }

  let changed = false;
  changed = rewriteMatchingCommands(settings.hooks.Stop, 'hookRunner.js', currentHookRunnerCommand) || changed;
  changed =
    rewriteMatchingCommands(settings.hooks.UserPromptSubmit, 'resumeRunner.js', currentResumeRunnerCommand) ||
    changed;
  return changed;
}

function rewriteMatchingCommands(groups: HookGroup[] | undefined, scriptName: string, newCommand: string): boolean {
  if (!groups) {
    return false;
  }
  let changed = false;
  for (const group of groups) {
    for (const hook of group.hooks) {
      if (hook.type === 'command' && hook.command.includes(scriptName) && hook.command !== newCommand) {
        hook.command = newCommand;
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Adds (or re-syncs, if one already exists) a hook entry for the given event name, identified by
 * scriptName appearing in its command. Appends to the existing hooks array for that event rather
 * than replacing it, so any other hooks already configured for that event are preserved.
 * Mutates `hooks` in place.
 */
export function upsertHook(
  hooks: Record<string, HookGroup[] | undefined>,
  eventName: string,
  scriptName: string,
  command: string,
  timeoutSeconds = 15
): void {
  const groups = hooks[eventName] ?? [];
  hooks[eventName] = groups;

  for (const group of groups) {
    for (const hook of group.hooks) {
      if (hook.type === 'command' && hook.command.includes(scriptName)) {
        hook.command = command;
        return;
      }
    }
  }

  groups.push({
    matcher: '',
    hooks: [{ type: 'command', command, timeout: timeoutSeconds }],
  });
}

/**
 * The inverse of upsertHook: removes any hook entry for the given event that can be identified
 * as ours (by scriptName appearing in its command). Removes now-empty hook groups, and removes
 * the event key entirely if no groups are left. Any other hooks configured for the same event —
 * ours or not — are left untouched. Mutates `hooks` in place. Returns true if anything changed.
 *
 * There's no reliable way for an extension to distinguish "being uninstalled" from "just being
 * disabled or reloaded" from within its own deactivate() — so this can't run automatically on
 * uninstall without risking silently removing the hook every time VS Code merely restarts. It's
 * meant to be run explicitly, once, right before actually uninstalling.
 */
export function removeHook(hooks: Record<string, HookGroup[] | undefined>, eventName: string, scriptName: string): boolean {
  const groups = hooks[eventName];
  if (!groups) {
    return false;
  }

  let changed = false;
  const remainingGroups: HookGroup[] = [];

  for (const group of groups) {
    const remainingHooks = group.hooks.filter((hook) => {
      const isOurs = hook.type === 'command' && hook.command.includes(scriptName);
      if (isOurs) {
        changed = true;
      }
      return !isOurs;
    });

    if (remainingHooks.length > 0) {
      remainingGroups.push({ ...group, hooks: remainingHooks });
    }
  }

  if (remainingGroups.length > 0) {
    hooks[eventName] = remainingGroups;
  } else {
    delete hooks[eventName];
  }

  return changed;
}
