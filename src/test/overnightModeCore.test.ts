import * as assert from 'assert';
import {
  applyOvernightMode,
  DEFAULT_OVERNIGHT_MODE_CONFIG,
  isWithinOvernightWindow,
  OvernightModeConfig,
  parseTimeToMinutes,
} from '../overnightModeCore';
import { CompletionOptions } from '../mediaControlCore';

function at(hours: number, minutes: number): Date {
  const date = new Date(2024, 0, 1);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

describe('parseTimeToMinutes', () => {
  it('parses a valid HH:mm time', () => {
    assert.strictEqual(parseTimeToMinutes('22:00'), 22 * 60);
    assert.strictEqual(parseTimeToMinutes('00:00'), 0);
    assert.strictEqual(parseTimeToMinutes('23:59'), 23 * 60 + 59);
  });

  it('returns null for malformed input', () => {
    assert.strictEqual(parseTimeToMinutes('24:00'), null);
    assert.strictEqual(parseTimeToMinutes('9:00'), null);
    assert.strictEqual(parseTimeToMinutes('09:60'), null);
    assert.strictEqual(parseTimeToMinutes('not a time'), null);
    assert.strictEqual(parseTimeToMinutes(''), null);
  });
});

describe('isWithinOvernightWindow', () => {
  const wrapping: OvernightModeConfig = { ...DEFAULT_OVERNIGHT_MODE_CONFIG, enabled: true, startTime: '22:00', endTime: '07:00' };
  const sameDay: OvernightModeConfig = { ...DEFAULT_OVERNIGHT_MODE_CONFIG, enabled: true, startTime: '01:00', endTime: '05:00' };

  it('returns false when disabled, regardless of time', () => {
    assert.strictEqual(isWithinOvernightWindow({ ...wrapping, enabled: false }, at(23, 0)), false);
  });

  it('handles a window that wraps past midnight', () => {
    assert.strictEqual(isWithinOvernightWindow(wrapping, at(23, 0)), true, '23:00 should be inside 22:00->07:00');
    assert.strictEqual(isWithinOvernightWindow(wrapping, at(3, 0)), true, '03:00 should be inside 22:00->07:00');
    assert.strictEqual(isWithinOvernightWindow(wrapping, at(22, 0)), true, 'start time should be inclusive');
    assert.strictEqual(isWithinOvernightWindow(wrapping, at(7, 0)), false, 'end time should be exclusive');
    assert.strictEqual(isWithinOvernightWindow(wrapping, at(12, 0)), false, 'midday should be outside the window');
  });

  it('handles a same-day window', () => {
    assert.strictEqual(isWithinOvernightWindow(sameDay, at(3, 0)), true);
    assert.strictEqual(isWithinOvernightWindow(sameDay, at(1, 0)), true, 'start time should be inclusive');
    assert.strictEqual(isWithinOvernightWindow(sameDay, at(5, 0)), false, 'end time should be exclusive');
    assert.strictEqual(isWithinOvernightWindow(sameDay, at(23, 0)), false);
  });

  it('returns false for malformed or identical start/end times', () => {
    assert.strictEqual(isWithinOvernightWindow({ ...wrapping, startTime: 'nope' }, at(23, 0)), false);
    assert.strictEqual(isWithinOvernightWindow({ ...wrapping, startTime: '22:00', endTime: '22:00' }, at(22, 0)), false);
  });
});

describe('applyOvernightMode', () => {
  const baseOptions: CompletionOptions = { pauseMusic: true, playNotificationSound: true, ringWhenPausing: true };

  it('returns the base options unchanged when outside the window', () => {
    const overnight: OvernightModeConfig = { ...DEFAULT_OVERNIGHT_MODE_CONFIG, enabled: true, startTime: '22:00', endTime: '07:00' };
    assert.deepStrictEqual(applyOvernightMode(baseOptions, overnight, at(12, 0)), baseOptions);
  });

  it('returns the base options unchanged when disabled, even during what would be the window', () => {
    const overnight: OvernightModeConfig = { ...DEFAULT_OVERNIGHT_MODE_CONFIG, enabled: false, startTime: '22:00', endTime: '07:00' };
    assert.deepStrictEqual(applyOvernightMode(baseOptions, overnight, at(23, 0)), baseOptions);
  });

  it('forces pauseMusic off for the "ringOnly" behavior inside the window', () => {
    const overnight: OvernightModeConfig = {
      ...DEFAULT_OVERNIGHT_MODE_CONFIG,
      enabled: true,
      startTime: '22:00',
      endTime: '07:00',
      behavior: 'ringOnly',
    };

    const result = applyOvernightMode(baseOptions, overnight, at(23, 0));
    assert.deepStrictEqual(result, { ...baseOptions, pauseMusic: false });
  });

  it('sets overnightAutoResumeDelaySeconds for the "autoResumeAfterDelay" behavior inside the window', () => {
    const overnight: OvernightModeConfig = {
      ...DEFAULT_OVERNIGHT_MODE_CONFIG,
      enabled: true,
      startTime: '22:00',
      endTime: '07:00',
      behavior: 'autoResumeAfterDelay',
      autoResumeDelaySeconds: 42,
    };

    const result = applyOvernightMode(baseOptions, overnight, at(23, 0));
    assert.deepStrictEqual(result, { ...baseOptions, overnightAutoResumeDelaySeconds: 42 });
  });
});
