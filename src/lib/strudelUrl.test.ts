import { describe, expect, it } from 'vitest';
import { codeFromStrudelUrl, codeToHash, hashToCode, isStrudelIdUrl, strudelLink } from './strudelUrl';

describe('strudel.cc links', () => {
  it('round-trips unicode code', () => {
    const code = 'note("c3 e3") // café ♪';
    expect(hashToCode(codeToHash(code))).toBe(code);
  });
  it('matches Strudel\'s own encoding for ASCII', () => {
    expect(codeToHash('s("bd sd")')).toBe(encodeURIComponent(btoa('s("bd sd")')));
  });
  it('decodes code from a share link', () => {
    expect(codeFromStrudelUrl('  ' + strudelLink('s("hh*8")') + '\n')).toBe('s("hh*8")');
  });
  it('ignores other text and other hosts', () => {
    expect(codeFromStrudelUrl('s("bd")')).toBeNull();
    expect(codeFromStrudelUrl('https://example.com/#cygiYmQiKQ%3D%3D')).toBeNull();
    expect(codeFromStrudelUrl('https://strudel.cc/')).toBeNull();
  });
  it('spots saved-pattern links, which carry no code', () => {
    expect(isStrudelIdUrl('https://strudel.cc/?abc123')).toBe(true);
    expect(isStrudelIdUrl(strudelLink('s("bd")'))).toBe(false);
  });
});
