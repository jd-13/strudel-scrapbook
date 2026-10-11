import { describe, expect, it } from 'vitest';
import { extractMetadata, getMetadata, withHeader } from './strudelMeta';

describe('getMetadata (same rules as Strudel)', () => {
  it('reads a quoted first comment as the title', () => {
    expect(getMetadata('// "Coconut riddim"\ns("bd")').title).toBe('Coconut riddim');
  });
  it('prefers nothing over a quoted title that is not first', () => {
    expect(getMetadata('// hello\n// "Not a title"').title).toBeUndefined();
  });
  it('reads @title, repeated and comma-separated tags, and details', () => {
    const m = getMetadata('// @title Boom bap\n// @tag drums, swing\n// @tag hip-hop\n// @details Lazy   feel');
    expect(m.title).toBe('Boom bap');
    expect(m.tag).toEqual(['drums', 'swing', 'hip-hop']);
    expect(m.details).toBe('Lazy feel');
  });
  it('reads block comments', () => {
    const m = getMetadata('/* @title Block\n@tag a, b */\ns("hh*8")');
    expect(m.title).toBe('Block');
    expect(m.tag).toEqual(['a', 'b']);
  });
  it('allows several keys on one line', () => {
    expect(getMetadata('// @by alice @license CC0')).toEqual({ by: ['alice'], license: ['CC0'] });
  });
});

describe('extractMetadata', () => {
  it('fills fields and strips the leading metadata lines only', () => {
    const x = extractMetadata('// @title Tresillo\n// @tag drums, Euclidean\n\n// the kick\ns("bd(3,8)")');
    expect(x.name).toBe('Tresillo');
    expect(x.tags).toEqual(['drums', 'euclidean']);
    expect(x.code).toBe('// the kick\ns("bd(3,8)")');
  });
  it('leaves code without a header alone', () => {
    const code = '// just a comment\nn("0 2 4")';
    expect(extractMetadata(code)).toEqual({ name: '', tags: [], description: '', code });
  });
  it('folds author and url into the description', () => {
    expect(extractMetadata('// @details Nice\n// @by bob\ns("bd")').description).toBe('Nice (by bob)');
  });
});

describe('withHeader', () => {
  it('round-trips through extractMetadata', () => {
    const s = { name: 'Boom bap with swing', tags: ['drums', 'swing'], description: '`.swingBy(1/3, 4)` delays the off-beats.', code: 's("bd sd").swingBy(1/3, 4)' };
    const text = withHeader(s, 'Grooves');
    expect(text.split('\n')[0]).toBe('// @title Boom bap with swing');
    const back = extractMetadata(text);
    expect(back.name).toBe(s.name);
    expect(back.tags).toEqual(['drums', 'swing', 'grooves']);
    expect(back.description).toBe('.swingBy(1/3, 4) delays the off-beats.');
    expect(back.code).toBe(s.code);
  });
  it('keeps @ and commas from breaking the header', () => {
    const back = extractMetadata(withHeader({ name: 'a@b', tags: ['x,y'], description: 'mail me @ home', code: 's("bd")' }));
    expect(back.name).toBe('ab');
    expect(back.tags).toEqual(['x y']);
    expect(back.description).toBe('mail me home');
  });
});
