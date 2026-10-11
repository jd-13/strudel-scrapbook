import { describe, expect, it } from 'vitest';
import type { Category, Library, Snippet } from './types';
import { merge, mergeStrudel, parseImport, serialize, strudelStatus, toExportFile } from './backup';
import seed from '../seed/seed.json';

const cat = (id: string, order = 0, updated = '2026-01-01T00:00:00.000Z'): Category => ({ id, name: id, blurb: '', order, updated });
const snip = (id: string, updated: string, extra: Partial<Snippet> = {}): Snippet => ({
  id, name: id, description: '', category: 'a', tags: [], code: `s("${id}")`, base: null, cycles: 2, source: null,
  created: '2026-01-01T00:00:00.000Z', updated, ...extra,
});
const libOf = (snippets: Snippet[], deleted: Library['deleted'] = [], categories = [cat('a')]): Library => ({ categories, snippets, deleted });

describe('parseImport', () => {
  it('round-trips our own export', () => {
    const lib = seed as Library;
    const parsed = parseImport(serialize(lib));
    expect(parsed.kind).toBe('scrapbook');
    if (parsed.kind === 'scrapbook') {
      expect(parsed.library.snippets).toHaveLength(lib.snippets.length);
      expect(parsed.library.categories).toHaveLength(lib.categories.length);
    }
  });
  it('recognises a strudel.cc patterns export', () => {
    const file = { abc: { id: 'abc', code: '// @title Hi\ns("bd")', created_at: 1700000000000, collection: 'user' } };
    const parsed = parseImport(JSON.stringify(file));
    expect(parsed).toEqual({ kind: 'strudel', patterns: [{ id: 'abc', code: '// @title Hi\ns("bd")', created_at: 1700000000000 }] });
  });
  it('never mistakes our export for a strudel.cc one', () => {
    const ours = toExportFile(libOf([snip('x', '2026-01-02')]));
    expect(parseImport(JSON.stringify(ours)).kind).toBe('scrapbook');
  });
  it('rejects other JSON with a clear message', () => {
    expect(() => parseImport('{"foo": 1}')).toThrow(/Not a Strudel Scrapbook export/);
    expect(() => parseImport('[1,2]')).toThrow(/Not a Strudel Scrapbook export/);
    expect(() => parseImport('nope')).toThrow(/not valid JSON/);
    expect(() => parseImport('{"format":"strudel-scrapbook","version":2,"snippets":[],"categories":[]}')).toThrow(/version/);
  });
  it('creates categories that snippets refer to but the file lacks', () => {
    const file = { format: 'strudel-scrapbook', version: 1, categories: [], snippets: [snip('x', '2026-01-02', { category: 'ghost' })], deleted: [] };
    const parsed = parseImport(JSON.stringify(file));
    expect(parsed.kind === 'scrapbook' && parsed.library.categories.map((c) => c.id)).toEqual(['ghost']);
  });
});

describe('merge', () => {
  it('adds new, takes newer, keeps ours when same or newer', () => {
    const ours = libOf([snip('keep', '2026-03-01'), snip('older-here', '2026-01-05')]);
    const theirs = libOf([snip('keep', '2026-02-01'), snip('older-here', '2026-01-09', { name: 'theirs' }), snip('fresh', '2026-01-01')]);
    const { library, counts } = merge(ours, theirs);
    expect(counts).toEqual({ added: 1, updated: 1, kept: 1, deleted: 0 });
    expect(library.snippets.find((s) => s.id === 'older-here')!.name).toBe('theirs');
    expect(library.snippets.map((s) => s.id).sort()).toEqual(['fresh', 'keep', 'older-here']);
  });
  it('applies their deletions only when newer than our edit', () => {
    const ours = libOf([snip('gone', '2026-01-01'), snip('edited-after', '2026-05-01')]);
    const theirs = libOf([], [{ id: 'gone', at: '2026-02-01' }, { id: 'edited-after', at: '2026-02-01' }]);
    const { library, counts } = merge(ours, theirs);
    expect(counts.deleted).toBe(1);
    expect(library.snippets.map((s) => s.id)).toEqual(['edited-after']);
    expect(library.deleted).toEqual([{ id: 'gone', at: '2026-02-01' }]);
  });
  it('does not resurrect what we deleted after their version', () => {
    const ours = libOf([], [{ id: 'x', at: '2026-04-01' }]);
    const { library, counts } = merge(ours, libOf([snip('x', '2026-03-01')]));
    expect(library.snippets).toHaveLength(0);
    expect(counts.kept).toBe(1);
  });
  it('re-adds a snippet edited after our deletion', () => {
    const ours = libOf([], [{ id: 'x', at: '2026-02-01' }]);
    const { library, counts } = merge(ours, libOf([snip('x', '2026-03-01')]));
    expect(counts.added).toBe(1);
    expect(library.deleted).toEqual([]);
  });
  it('merges categories by id, newer wins, appending new ones after ours', () => {
    const ours = libOf([], [], [cat('a', 0, '2026-01-01'), cat('b', 1, '2026-05-01')]);
    const theirs = libOf([], [], [{ ...cat('a', 3, '2026-02-01'), name: 'A2' }, { ...cat('b', 0, '2026-01-01'), name: 'B-old' }, cat('c', 0)]);
    const { library } = merge(ours, theirs);
    const byId = Object.fromEntries(library.categories.map((c) => [c.id, c]));
    expect(byId.a.name).toBe('A2');
    expect(byId.a.order).toBe(0); // keeps our position
    expect(byId.b.name).toBe('b');
    expect(byId.c.order).toBe(2);
  });
  it('is a no-op when merging a library into itself', () => {
    const lib = seed as Library;
    const { library, counts } = merge(lib, lib);
    expect(counts).toEqual({ added: 0, updated: 0, kept: lib.snippets.length, deleted: 0 });
    expect(library.snippets).toHaveLength(lib.snippets.length);
  });
});

describe('strudel.cc import', () => {
  const target = cat('from-strudel', 5);
  const p = { id: 'p1', code: '// @title Hello\n// @tag drums\ns("bd*4")', created_at: Date.parse('2026-01-01T00:00:00Z') };

  it('reads metadata, keeps the Strudel id, and creates the category', () => {
    const { library, counts } = mergeStrudel(libOf([]), [p], target);
    expect(counts.added).toBe(1);
    const s = library.snippets[0];
    expect(s).toMatchObject({ name: 'Hello', tags: ['drums'], code: 's("bd*4")', category: 'from-strudel', source: { strudel: 'p1' }, created: '2026-01-01T00:00:00.000Z' });
    expect(library.categories.map((c) => c.id)).toContain('from-strudel');
  });
  it('updates rather than duplicates on re-import, unless edited here since', () => {
    const first = mergeStrudel(libOf([]), [p], target).library;
    expect(strudelStatus(first, p)).toBe('same');
    const changed = { ...p, code: '// @title Hello\ns("bd*8")' };
    expect(strudelStatus(first, changed)).toBe('update');
    const second = mergeStrudel(first, [changed], target);
    expect(second.counts.updated).toBe(1);
    expect(second.library.snippets).toHaveLength(1);
    expect(second.library.snippets[0].code).toBe('s("bd*8")');

    const editedHere = { ...first, snippets: first.snippets.map((s) => ({ ...s, updated: '2026-06-01T00:00:00.000Z' })) };
    const third = mergeStrudel(editedHere, [changed], target);
    expect(third.counts.kept).toBe(1);
    expect(third.library.snippets[0].code).toBe('s("bd*4")');
  });
  it('names untitled patterns by date', () => {
    const { library } = mergeStrudel(libOf([]), [{ id: 'z', code: 's("hh")', created_at: Date.parse('2026-01-01T12:00:00Z') }], target);
    expect(library.snippets[0].name).toBe(new Date(Date.parse('2026-01-01T12:00:00Z')).toLocaleDateString());
  });
});

describe('export format', () => {
  it('writes keys in a fixed order', () => {
    const text = serialize(libOf([snip('x', '2026-01-02')]));
    const obj = JSON.parse(text);
    expect(Object.keys(obj)).toEqual(['format', 'version', 'exported', 'categories', 'snippets', 'deleted']);
    expect(Object.keys(obj.snippets[0])).toEqual(['id', 'name', 'description', 'category', 'tags', 'code', 'base', 'cycles', 'source', 'created', 'updated']);
  });
});
