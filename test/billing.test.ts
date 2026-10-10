import { describe, expect, it } from 'vitest';
import { compactNumber, formatBytes, formatPrice, meterLevel } from '@/lib/api/billing';

describe('usage and billing formatting', () => {
  it('says how full a meter is', () => {
    expect(meterLevel(10, 100)).toBe('ok');
    expect(meterLevel(80, 100)).toBe('near');
    expect(meterLevel(100, 100)).toBe('full');
    expect(meterLevel(5, null)).toBe('none');
    expect(meterLevel(0, 0)).toBe('none');
  });

  it('formats prices from kobo, bytes and token counts', () => {
    expect(formatPrice(1_500_000, 'NGN')).toMatch(/15,000$/);
    expect(formatPrice(150_050, 'NGN')).toMatch(/1,500\.50$/);
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
    expect(formatBytes(4096)).toBe('4 KB');
    expect(compactNumber(200_000)).toBe('200K');
  });
});
