import { describe, expect, it } from 'vitest';
import { blocksOf, placeOf, sourceHref } from '@/components/ask/answer';
import type { Citation } from '@/lib/api/ask';
import { findPassage } from '@/screens/doc';
import { scopeLabel, scopeOf } from '@/screens/parts/composer';

const doc: Citation = {
  n: 1,
  available: true,
  fileId: 'f_launch',
  kind: 'document',
  title: 'Lagos launch plan',
  page: 3,
  startMs: null,
  endMs: null,
  quote: 'Unreliable   connectivity\non field visits.',
};
const moment: Citation = {
  ...doc,
  n: 2,
  fileId: 'f_weekly',
  kind: 'audio',
  page: null,
  startMs: 188_400,
  endMs: 230_000,
};

describe('where a citation opens', () => {
  it('says the page or the moment', () => {
    expect(placeOf(doc)).toBe('page 3');
    expect(placeOf(moment)).toBe('3:08');
    expect(placeOf({ page: null, startMs: null })).toBe('');
  });

  it('opens a document at the page with the passage to mark', () => {
    const href = sourceHref('/ask/c_1', doc)!;
    const url = new URL(href, 'http://x');
    expect(url.pathname).toBe('/ask/c_1/doc/f_launch');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('hl')).toBe('Unreliable connectivity on field visits.');
  });

  it('opens a meeting playing from the moment', () => {
    expect(sourceHref('/ask/c_1', moment)).toBe('/ask/c_1/meeting/f_weekly?t=188&play=1');
  });

  it('has nowhere to go for a source you can no longer open', () => {
    expect(sourceHref('/ask', { ...doc, available: false })).toBeNull();
    expect(sourceHref('/ask', { ...doc, fileId: null })).toBeNull();
  });
});

describe('answer text', () => {
  it('reads paragraphs, headings and both kinds of list', () => {
    expect(blocksOf('## Risks\nThree of them.\n- one\n- two\n\n1. first\n2) second')).toEqual([
      { kind: 'h', text: 'Risks' },
      { kind: 'p', lines: ['Three of them.'] },
      { kind: 'ul', items: ['one', 'two'] },
      { kind: 'ol', items: ['first', 'second'] },
    ]);
  });

  it('keeps a half-streamed answer readable', () => {
    expect(blocksOf('The plan names [1')).toEqual([{ kind: 'p', lines: ['The plan names [1'] }]);
    expect(blocksOf('')).toEqual([]);
  });
});

describe('scope', () => {
  it('turns a chip and picked files into what the API reads', () => {
    expect(scopeOf('all')).toEqual({});
    expect(scopeOf('meetings')).toEqual({ kind: 'meetings' });
    expect(scopeOf('c:col_1')).toEqual({ collectionId: 'col_1' });
    // Picked files win over the chip.
    expect(scopeOf('c:col_1', [{ id: 'f_1', title: 'A', kind: 'document' }])).toEqual({
      fileIds: ['f_1'],
    });
  });

  it('says it plainly', () => {
    expect(scopeLabel({})).toBe('All sources');
    expect(scopeLabel({ fileIds: ['a'] })).toBe('1 file');
    expect(scopeLabel({ fileIds: ['a', 'b'] })).toBe('2 files');
    expect(scopeLabel({ collectionId: 'c' }, [{ id: 'c', name: 'Product' }])).toBe('Product');
    expect(scopeLabel({ collectionId: 'gone' }, [])).toBe('A collection');
  });
});

describe('finding a cited passage on its page', () => {
  const pages = [
    { page: 1, text: 'Overview\n\nWe launch in Lagos in March.' },
    {
      page: 3,
      text: '## Risks\n\n- Unreliable connectivity on field visits.\n- Data residency questions.\n\nPricing in naira.',
    },
  ];

  it('marks every block the passage spans, across a heading and a list', () => {
    const found = findPassage(pages, 'Risks Unreliable connectivity on field visits.', 3);
    expect(found?.page).toBe(3);
    expect([...found!.blocks]).toEqual([0, 1]);
  });

  it('looks beyond the cited page when the passage moved', () => {
    expect(findPassage(pages, 'We launch in Lagos in March', 3)?.page).toBe(1);
  });

  it('gives up on quotes too short to place or not on any page', () => {
    expect(findPassage(pages, 'Risks', 3)).toBeNull();
    expect(findPassage(pages, 'Nothing like this appears anywhere', null)).toBeNull();
  });
});
