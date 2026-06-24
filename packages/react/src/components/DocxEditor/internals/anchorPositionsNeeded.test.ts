import { describe, expect, test } from 'bun:test';

import { shouldComputeAnchorPositions } from './anchorPositionsNeeded';

describe('shouldComputeAnchorPositions', () => {
  test('skips anchor work when nothing consumes anchor positions', () => {
    expect(shouldComputeAnchorPositions([], [])).toBe(false);
  });

  test('keeps anchor work for sidebar items', () => {
    expect(shouldComputeAnchorPositions([{} as never], [])).toBe(true);
  });

  test('keeps anchor work for comment margin markers', () => {
    expect(shouldComputeAnchorPositions([], [{} as never])).toBe(true);
  });
});
