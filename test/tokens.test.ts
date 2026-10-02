import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { springEasing, springs } from '@/lib/motion/spring';

/**
 * The design tokens keep their promises: every text pairing meets WCAG AA (4.5:1) in both
 * themes, and the spring curves in CSS match the maths in src/lib/motion/spring.ts.
 */

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}\n', css.indexOf(':root {')));

type RGBA = [number, number, number, number];
type Theme = 'light' | 'dark';

/** The raw value of a custom property in :root. */
function raw(name: string): string {
  const match = new RegExp(`--${name}:\\s*([\\s\\S]*?);`).exec(root);
  if (!match) throw new Error(`No --${name} in tokens.css`);
  return match[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

/** Splits light-dark(a, b) at its top-level comma. */
function themed(value: string, theme: Theme): string {
  if (!value.startsWith('light-dark(')) return value;
  const inner = value.slice('light-dark('.length, -1);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++;
    else if (inner[i] === ')') depth--;
    else if (inner[i] === ',' && depth === 0)
      return (theme === 'light' ? inner.slice(0, i) : inner.slice(i + 1)).trim();
  }
  throw new Error(`Bad light-dark(): ${value}`);
}

function parse(color: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(color);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
  throw new Error(`Unsupported colour in test: ${color}`);
}

function token(name: string, theme: Theme): RGBA {
  return parse(themed(raw(name), theme));
}

/** Paints `top` (possibly translucent) over an opaque `under`. */
function over(top: RGBA, under: RGBA): RGBA {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a)).concat(1) as RGBA;
}

/** color-mix(in srgb, color p%, transparent) painted over `under`. */
function tint(color: RGBA, share: number, under: RGBA): RGBA {
  return over([color[0], color[1], color[2], share], under);
}

function luminance([r, g, b]: RGBA): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(text: RGBA, background: RGBA): number {
  const fg = luminance(over(text, background));
  const bg = luminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

const AA = 4.5;
const themes: Theme[] = ['light', 'dark'];

describe('text contrast (WCAG AA, both themes)', () => {
  for (const theme of themes) {
    const card = token('card', theme);
    const background = token('background', theme);
    const elevated = token('elevated', theme);

    it(`${theme}: body and secondary text on cards and the page`, () => {
      for (const surface of [card, background, elevated]) {
        expect(contrast(token('foreground', theme), surface)).toBeGreaterThanOrEqual(AA);
        expect(contrast(token('muted-foreground', theme), surface)).toBeGreaterThanOrEqual(AA);
      }
    });

    it(`${theme}: white on the indigo and red fills`, () => {
      const white = parse('#ffffff');
      expect(contrast(white, token('primary', theme))).toBeGreaterThanOrEqual(AA);
      expect(contrast(white, parse(raw('destructive')))).toBeGreaterThanOrEqual(AA);
    });

    it(`${theme}: indigo, red, green and orange text on cards`, () => {
      for (const name of ['primary-text', 'destructive-text', 'success-text', 'warning-text']) {
        expect(contrast(token(name, theme), card), name).toBeGreaterThanOrEqual(AA);
      }
    });

    it(`${theme}: sensitivity labels on their own tint`, () => {
      const share = theme === 'light' ? 0.1 : 0.16;
      for (const name of [
        'label-public',
        'label-internal',
        'label-confidential',
        'label-restricted',
        'label-accent',
      ]) {
        const label = token(name, theme);
        expect(contrast(label, tint(label, share, card)), name).toBeGreaterThanOrEqual(AA);
      }
    });
  }

  it('dark: indigo text on elevated surfaces uses the lifted value', () => {
    const elevated = token('elevated', 'dark');
    expect(contrast(parse('#9a98ff'), elevated)).toBeGreaterThanOrEqual(AA);
    expect(css).toContain('--primary-text: light-dark(#5856d6, #9a98ff)');
  });
});

describe('spring curves in CSS', () => {
  // tokens.css was generated with these settings: 60 points a second, settled within 0.2%.
  const settings = { resolution: 1 / 60, restDelta: 0.002, restSpeed: 0.02 };

  for (const name of ['standard', 'snappy', 'push'] as const) {
    it(`--spring-${name} matches springs.${name}`, () => {
      const expected = springEasing(springs[name], 0, settings);
      const points = raw(`spring-${name}`)
        .replace(/^linear\(|\)$/g, '')
        .split(',')
        .map((p) => Number(p.trim()));
      const want = expected.easing
        .replace(/^linear\(|\)$/g, '')
        .split(',')
        .map((p) => Number(p.trim()));
      expect(points).toEqual(want);
      expect(raw(`duration-${name}`)).toBe(`${expected.duration}ms`);
    });
  }
});
