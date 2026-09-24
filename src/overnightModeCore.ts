import type { CompletionOptions } from './mediaControlCore';

export type OvernightModeBehavior = 'ringOnly' | 'autoResumeAfterDelay';

export interface OvernightModeConfig {
  enabled: boolean;
  /** 24-hour "HH:mm" local time, e.g. "22:00". */
  startTime: string;
  /** 24-hour "HH:mm" local time, e.g. "07:00". May be earlier than startTime — see isWithinOvernightWindow. */
  endTime: string;
  /**
   * "ringOnly": never send a pause command during the window — behaves like pauseMusic: false.
   * "autoResumeAfterDelay": still pauses (and still rings immediately, per ringWhenPausing) but
   * auto-resumes after autoResumeDelaySeconds instead of waiting for the next message.
   */
  behavior: OvernightModeBehavior;
  autoResumeDelaySeconds: number;
}

export const DEFAULT_OVERNIGHT_MODE_CONFIG: OvernightModeConfig = {
  enabled: false,
  startTime: '22:00',
  endTime: '07:00',
  behavior: 'ringOnly',
  autoResumeDelaySeconds: 10,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parses a "HH:mm" 24-hour time string into minutes since midnight, or null if malformed. */
export function parseTimeToMinutes(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Whether `now` falls within [startTime, endTime) in local time. Supports both a same-day window
 * (e.g. "01:00"->"05:00", where startTime < endTime) and one that wraps past midnight (e.g.
 * "22:00"->"07:00", where startTime > endTime) using the exact same two fields — which form it is
 * is inferred purely from whether startTime is before or after endTime.
 */
export function isWithinOvernightWindow(config: OvernightModeConfig, now: Date = new Date()): boolean {
  if (!config.enabled) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(config.startTime);
  const endMinutes = parseTimeToMinutes(config.endTime);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * Adjusts a base CompletionOptions for Overnight Mode, if `now` falls within the configured
 * window — otherwise returns `base` unchanged. Kept separate from mediaControlCore.ts's own
 * options resolution so the window/behavior logic has a single, independently-testable home; the
 * resulting options still flow through the exact same handleTaskCompletion path as normal, so no
 * duplicate pause/ring/resume logic exists anywhere.
 */
export function applyOvernightMode(
  base: CompletionOptions,
  overnight: OvernightModeConfig,
  now: Date = new Date()
): CompletionOptions {
  if (!isWithinOvernightWindow(overnight, now)) {
    return base;
  }

  if (overnight.behavior === 'ringOnly') {
    return { ...base, pauseMusic: false };
  }

  return { ...base, overnightAutoResumeDelaySeconds: overnight.autoResumeDelaySeconds };
}
