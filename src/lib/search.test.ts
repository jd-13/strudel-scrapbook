import { describe, expect, it } from 'vitest';
import type { Library } from './types';
import { fuzzyScore, search, sortSnippets } from './search';
import seed from '../seed/seed.json';

const lib = seed as Library;
const names = (q: string) => search(lib.snippets, lib.categories, q).map((s) => s.name);

describe('fuzzyScore', () => {
  it('prefers exact, then word-start substrings, then loose subsequences', () => {
    const exact = fuzzyScore('swing', 'swing');
    const start = fuzzyScore('swing', 'boom bap swing');
    const inner = fuzzyScore('wing', 'boom bap swing');
    const loose = fuzzyScore('bbs', 'boom bap swing');
    expect(exact).toBeGreaterThan(start);
    expect(start).toBeGreaterThan(inner);
    expect(inner).toBeGreaterThan(loose);
    expect(loose).toBeGreaterThan(0);
  });
  it('rejects scattered matches', () => {
    expect(fuzzyScore('abc', 'a long sentence that barely contains c')).toBe(0);
  });
});

describe('search', () => {
  it('ranks name matches first', () => {
    expect(names('tresillo')[0]).toBe('Tresillo');
    expect(names('clave')[0]).toBe('Son clave');
  });
  it('matches tags and categories', () => {
    expect(names('reich')).toEqual(expect.arrayContaining(['Clapping phase', 'Step phasing']));
    expect(names('euclidean').length).toBeGreaterThanOrEqual(4);
  });
  it('matches code by substring', () => {
    expect(names('swingBy')).toContain('Boom bap with swing');
    expect(names('voicing')).toContain('Voice-led comping');
  });
  it('requires every term to match', () => {
    const r = names('linear iter');
    expect(r).toEqual(['Rotate it']);
  });
  it('allows fuzzy name matching', () => {
    expect(names('bmbp')[0]).toBe('Boom bap with swing');
  });
});

describe('sortSnippets', () => {
  it('sorts by name and by recency', () => {
    const s = sortSnippets(lib.snippets, 'name');
    expect(s[0].name.localeCompare(s[1].name)).toBeLessThanOrEqual(0);
    const r = sortSnippets(lib.snippets, 'created');
    expect(r[0].created >= r[r.length - 1].created).toBe(true);
  });
});
