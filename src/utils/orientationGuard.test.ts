import { describe, expect, it } from 'vitest';
import { shouldShowOrientationOverlay } from './orientationGuard';

describe('shouldShowOrientationOverlay', () => {
  it('blocks a tablet or mobile device in landscape', () => {
    expect(shouldShowOrientationOverlay(1180, 820, true)).toBe(true);
  });

  it('allows a tablet or mobile device in portrait', () => {
    expect(shouldShowOrientationOverlay(820, 1180, true)).toBe(false);
  });

  it('allows a desktop browser in landscape', () => {
    expect(shouldShowOrientationOverlay(1363, 936, false)).toBe(false);
  });
});
