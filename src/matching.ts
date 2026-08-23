/**
 * Pure logic module: no dependency on the `vscode` API, so it can be unit tested directly
 * outside the Extension Host. completionDetector.ts reads vscode settings and calls into
 * the functions here.
 */

/**
 * Built-in AI/script completion signal regex.
 * Matches patterns like "Done for 5s", "Compacted for 12s", "Thought for 1m 3s", "Ran for 3s" —
 * the "word + for + duration" style commonly seen in status lines of AI coding tools like
 * Claude Code / Cursor.
 *
 * Note: this does NOT require the word to end in a regular "-ed" suffix (e.g. Compacted),
 * because common status words are often irregular verbs (Done, Thought, Ran, Read, Sent...).
 * What's actually distinctive is the trailing "for + number + time unit" structure, so that's
 * used as the primary signal instead.
 */
export const AI_SIGNAL_PATTERN = /\b[A-Za-z]{2,}\s+for\s+(?:\d+\s*(?:ms|s|m|h)\b\s*)+/i;

/**
 * Other common generic completion signals (not in the "for <duration>" format).
 */
export const BUILTIN_SIGNALS: RegExp[] = [
  /\bdone\b/i,
  /\bcompleted\b/i,
  /\bfinished\b/i,
  /\bsuccess(?:fully)?\b/i,
  /\btask complete\b/i,
  /✔|✓/,
];

/**
 * Looks for a "task completed" signal in a chunk of text, checked in this order:
 * 1. User-defined keywords (case-insensitive, substring match)
 * 2. Built-in AI completion signal "word + for + duration" (e.g. "Done for 5s", can be disabled via enableAiSignal)
 * 3. Other common completion words (done / completed / finished / success / ✔ etc.)
 *
 * @returns The matched string (for logging), or null if nothing matched
 */
export function findCompletionMatch(
  text: string,
  userKeywords: string[],
  enableAiSignal: boolean
): string | null {
  const lowerText = text.toLowerCase();
  for (const keyword of userKeywords) {
    if (keyword && lowerText.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }

  if (!enableAiSignal) {
    return null;
  }

  const aiMatch = text.match(AI_SIGNAL_PATTERN);
  if (aiMatch) {
    return aiMatch[0].trim();
  }

  for (const pattern of BUILTIN_SIGNALS) {
    if (pattern.test(text)) {
      return pattern.source;
    }
  }

  return null;
}

/**
 * Explicit debug tokens: unlike the fuzzy keyword/AI-signal matching above, these are exact,
 * deliberate markers meant to be echoed into a terminal while testing, so matching is
 * case-sensitive and unambiguous. None of these strings are substrings of each other (they all
 * diverge right after "!POD"), so match order doesn't matter for correctness.
 *
 * - !PODBell!    -> force-play the notification sound, regardless of playback state
 * - !PODStop!    -> force-pause, regardless of current state
 * - !PODResume!  -> force-resume, regardless of whether this tool was the one that paused it
 * - !PODToggle!  -> pause if currently playing, resume if not
 * - !POD!        -> run the same smart "pause if playing, else notify" logic as the AI CLI hooks
 */
export type MagicToken = 'bell' | 'stop' | 'resume' | 'toggle' | 'normal';

const MAGIC_TOKEN_PATTERNS: ReadonlyArray<{ token: MagicToken; pattern: RegExp }> = [
  { token: 'bell', pattern: /!PODBell!/ },
  { token: 'stop', pattern: /!PODStop!/ },
  { token: 'resume', pattern: /!PODResume!/ },
  { token: 'toggle', pattern: /!PODToggle!/ },
  { token: 'normal', pattern: /!POD!/ },
];

export function findMagicToken(text: string): MagicToken | null {
  for (const { token, pattern } of MAGIC_TOKEN_PATTERNS) {
    if (pattern.test(text)) {
      return token;
    }
  }
  return null;
}
