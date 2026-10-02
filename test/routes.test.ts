import { describe, expect, it } from 'vitest';
import { compareStacks, parentOf, parseStack, pushPath, tabOf } from '@/lib/nav/routes';

const keys = (path: string) => parseStack(path).map((e) => e.key);
const kinds = (path: string) => parseStack(path).map((e) => e.kind);

describe('tabOf', () => {
  it('reads the tab from the first segment', () => {
    expect(tabOf('/docs/d_1')).toBe('docs');
    expect(tabOf('/meetings')).toBe('meetings');
  });

  it('returns null outside the app', () => {
    expect(tabOf('/status')).toBeNull();
    expect(tabOf('/')).toBeNull();
  });
});

describe('parseStack', () => {
  it('turns a tab root into a one-screen stack', () => {
    expect(parseStack('/docs')).toEqual([{ key: '/docs', kind: 'docs', role: 'list' }]);
  });

  it('reads a tab’s own items in the short form', () => {
    expect(parseStack('/docs/d_42')[1]).toEqual({
      key: '/docs/d_42',
      kind: 'doc',
      id: 'd_42',
      role: 'detail',
    });
    expect(kinds('/meetings/m_7')).toEqual(['meetings', 'meeting']);
    expect(kinds('/ask/t_1')).toEqual(['ask', 'thread']);
  });

  it('rebuilds a deep stack from the URL, so back works straight away', () => {
    expect(keys('/docs/collection/c_1/doc/d_42')).toEqual([
      '/docs',
      '/docs/collection/c_1',
      '/docs/collection/c_1/doc/d_42',
    ]);
  });

  it('lets any kind be pushed onto any tab', () => {
    expect(kinds('/home/meeting/m_7/doc/d_1')).toEqual(['home', 'meeting', 'doc']);
  });

  it('accepts named screens only in their own tab', () => {
    expect(kinds('/profile/appearance')).toEqual(['profile', 'appearance']);
    expect(kinds('/home/appearance')).toEqual(['home', 'not-found']);
  });

  it('puts one "not found" screen on top of a bad path, keeping the good part', () => {
    const stack = parseStack('/docs/d_1/nonsense/more');
    expect(stack.map((e) => e.kind)).toEqual(['docs', 'doc', 'not-found']);
    expect(stack[2]!.key).toBe('/docs/d_1/nonsense/more');
  });

  it('ignores query strings, hashes and trailing slashes', () => {
    expect(keys('/docs/d_1/?page=3#top')).toEqual(['/docs', '/docs/d_1']);
  });

  it('is empty outside the app', () => {
    expect(parseStack('/status')).toEqual([]);
  });
});

describe('parentOf', () => {
  it('is the screen below the top one', () => {
    expect(parentOf('/docs/collection/c_1/doc/d_2')).toBe('/docs/collection/c_1');
    expect(parentOf('/docs')).toBeNull();
  });
});

describe('pushPath', () => {
  it('uses the short form for a tab’s own items at the root', () => {
    expect(pushPath('/docs', 'doc', 'd_1')).toBe('/docs/d_1');
    expect(pushPath('/ask', 'thread', 't 1')).toBe('/ask/t%201');
  });

  it('uses /kind/id everywhere else', () => {
    expect(pushPath('/docs/collection/c_1', 'doc', 'd_2')).toBe('/docs/collection/c_1/doc/d_2');
    expect(pushPath('/home', 'meeting', 'm_1')).toBe('/home/meeting/m_1');
    expect(pushPath('/docs/d_1', 'meeting', 'm_1')).toBe('/docs/d_1/meeting/m_1');
  });
});

describe('compareStacks', () => {
  const s = (path: string) => parseStack(path);

  it('tells push, pop, replace and same apart', () => {
    expect(compareStacks(s('/docs'), s('/docs/d_1'))).toEqual({ type: 'push', common: 1 });
    expect(compareStacks(s('/docs/d_1'), s('/docs'))).toEqual({ type: 'pop', common: 1 });
    expect(compareStacks(s('/docs/d_1'), s('/docs/d_2'))).toEqual({ type: 'replace', common: 1 });
    expect(compareStacks(s('/docs/d_1'), s('/docs/d_1'))).toEqual({ type: 'same' });
  });
});
