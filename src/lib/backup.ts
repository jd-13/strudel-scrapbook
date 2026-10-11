import type { Category, ExportFile, Library, Snippet, Tombstone } from './types';
import { extractMetadata } from './strudelMeta';
import { newId, now } from './types';

/* ---------- export ---------- */

// Fixed key order so exports diff cleanly.
const catOut = (c: Category): Category => ({ id: c.id, name: c.name, blurb: c.blurb, order: c.order, updated: c.updated });
const snipOut = (s: Snippet): Snippet => ({
  id: s.id,
  name: s.name,
  description: s.description,
  category: s.category,
  tags: s.tags,
  code: s.code,
  base: s.base,
  cycles: s.cycles,
  source: s.source,
  created: s.created,
  updated: s.updated,
});

export function toExportFile(lib: Library, subset?: Snippet[]): ExportFile {
  return {
    format: 'strudel-scrapbook',
    version: 1,
    exported: now(),
    categories: [...lib.categories].sort((a, b) => a.order - b.order).map(catOut),
    snippets: [...(subset ?? lib.snippets)].sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id)).map(snipOut),
    deleted: subset ? [] : [...lib.deleted].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export const serialize = (lib: Library) => JSON.stringify(toExportFile(lib), null, 2) + '\n';

export const exportFileName = (d = new Date()) => `strudel-scrapbook-${d.toISOString().slice(0, 10)}.json`;

/* ---------- parse + validate ---------- */

export interface StrudelPattern {
  id: string;
  code: string;
  created_at?: number;
}

export type Parsed =
  | { kind: 'scrapbook'; library: Library }
  | { kind: 'strudel'; patterns: StrudelPattern[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

export function parseImport(text: string): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (isObj(data) && data.format === 'strudel-scrapbook') return { kind: 'scrapbook', library: validateScrapbook(data) };
  if (isObj(data) && !('format' in data)) {
    const values = Object.values(data);
    if (values.length && values.every((v) => isObj(v) && typeof v.code === 'string')) {
      return {
        kind: 'strudel',
        patterns: Object.entries(data).map(([key, v]) => {
          const p = v as Record<string, unknown>;
          return {
            id: str(p.id, key) || key,
            code: p.code as string,
            created_at: typeof p.created_at === 'number' ? p.created_at : undefined,
          };
        }),
      };
    }
  }
  throw new Error('Not a Strudel Scrapbook export or a strudel.cc patterns export.');
}

function validateScrapbook(data: Record<string, unknown>): Library {
  if (data.version !== 1) throw new Error(`Unsupported export version: ${String(data.version)}.`);
  if (!Array.isArray(data.snippets) || !Array.isArray(data.categories)) throw new Error('Export is missing its snippets or categories.');
  const t = now();
  const categories: Category[] = data.categories.map((c, i) => {
    if (!isObj(c) || typeof c.id !== 'string') throw new Error(`Category ${i + 1} has no id.`);
    return { id: c.id, name: str(c.name, c.id), blurb: str(c.blurb), order: typeof c.order === 'number' ? c.order : i, updated: str(c.updated, t) };
  });
  const snippets: Snippet[] = data.snippets.map((s, i) => {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.code !== 'string') throw new Error(`Snippet ${i + 1} has no id or code.`);
    return {
      id: s.id,
      name: str(s.name),
      description: str(s.description),
      category: str(s.category, 'uncategorised'),
      tags: Array.isArray(s.tags) ? s.tags.filter((x): x is string => typeof x === 'string') : [],
      code: s.code,
      base: typeof s.base === 'string' ? s.base : null,
      cycles: typeof s.cycles === 'number' && s.cycles > 0 ? Math.min(16, Math.round(s.cycles)) : 2,
      source: isObj(s.source) ? { strudel: typeof s.source.strudel === 'string' ? s.source.strudel : undefined } : null,
      created: str(s.created, t),
      updated: str(s.updated, str(s.created, t)),
    };
  });
  const deleted: Tombstone[] = Array.isArray(data.deleted)
    ? data.deleted.filter((d): d is Tombstone => isObj(d) && typeof d.id === 'string' && typeof d.at === 'string')
    : [];
  return ensureCategories({ categories, snippets, deleted });
}

/** Create any category a snippet refers to but the library lacks. */
export function ensureCategories(lib: Library): Library {
  const have = new Set(lib.categories.map((c) => c.id));
  let order = Math.max(-1, ...lib.categories.map((c) => c.order)) + 1;
  const extra: Category[] = [];
  for (const s of lib.snippets) {
    if (!have.has(s.category)) {
      have.add(s.category);
      extra.push({ id: s.category, name: s.category, blurb: '', order: order++, updated: now() });
    }
  }
  return extra.length ? { ...lib, categories: [...lib.categories, ...extra] } : lib;
}

/* ---------- merge ---------- */

export interface MergeCounts {
  added: number;
  updated: number;
  /** In the file, but ours is the same or newer. */
  kept: number;
  /** Removed here because the file deleted them later than our last edit. */
  deleted: number;
}

export interface MergeResult {
  library: Library;
  counts: MergeCounts;
}

export function merge(current: Library, incoming: Library): MergeResult {
  const counts: MergeCounts = { added: 0, updated: 0, kept: 0, deleted: 0 };
  const snippets = new Map(current.snippets.map((s) => [s.id, s]));
  const tombs = new Map(current.deleted.map((d) => [d.id, d.at]));

  for (const inc of incoming.snippets) {
    const ours = snippets.get(inc.id);
    const tomb = tombs.get(inc.id);
    if (ours) {
      if (inc.updated > ours.updated) {
        snippets.set(inc.id, inc);
        counts.updated++;
      } else counts.kept++;
    } else if (tomb && tomb >= inc.updated) {
      counts.kept++; // we deleted it after this version was made
    } else {
      snippets.set(inc.id, inc);
      tombs.delete(inc.id);
      counts.added++;
    }
  }
  for (const d of incoming.deleted) {
    const ours = snippets.get(d.id);
    if (ours && d.at > ours.updated) {
      snippets.delete(d.id);
      counts.deleted++;
    }
    if (!snippets.has(d.id) && (!tombs.has(d.id) || tombs.get(d.id)! < d.at)) tombs.set(d.id, d.at);
  }

  const cats = new Map(current.categories.map((c) => [c.id, c]));
  let order = Math.max(-1, ...current.categories.map((c) => c.order)) + 1;
  for (const c of [...incoming.categories].sort((a, b) => a.order - b.order)) {
    const ours = cats.get(c.id);
    if (!ours) cats.set(c.id, { ...c, order: order++ });
    else if (c.updated > ours.updated) cats.set(c.id, { ...c, order: ours.order });
  }

  return {
    library: ensureCategories({
      categories: [...cats.values()],
      snippets: [...snippets.values()],
      deleted: [...tombs].map(([id, at]) => ({ id, at })),
    }),
    counts,
  };
}

/* ---------- strudel.cc ---------- */

export function strudelPatternToSnippet(p: StrudelPattern, category: string): Snippet {
  const meta = extractMetadata(p.code);
  const created = p.created_at ? new Date(p.created_at).toISOString() : now();
  return {
    id: newId(),
    name: meta.name || (p.created_at ? new Date(p.created_at).toLocaleDateString() : p.id),
    description: meta.description,
    category,
    tags: meta.tags,
    code: meta.code,
    base: null,
    cycles: 2,
    source: { strudel: p.id },
    created,
    updated: created,
  };
}

/** Add strudel.cc patterns; ones imported before (same Strudel id) are updated in place when newer. */
export function mergeStrudel(current: Library, patterns: StrudelPattern[], category: Category): MergeResult {
  const counts: MergeCounts = { added: 0, updated: 0, kept: 0, deleted: 0 };
  const byStrudelId = new Map(current.snippets.filter((s) => s.source?.strudel).map((s) => [s.source!.strudel!, s]));
  const snippets = new Map(current.snippets.map((s) => [s.id, s]));
  for (const p of patterns) {
    const fresh = strudelPatternToSnippet(p, category.id);
    const ours = byStrudelId.get(p.id);
    if (!ours) {
      snippets.set(fresh.id, fresh);
      counts.added++;
    } else if (fresh.code !== ours.code && fresh.updated >= ours.updated) {
      // Strudel never changes created_at, so an untouched import has updated === created_at
      // and takes the new code; one edited here since has a later `updated` and is kept.
      snippets.set(ours.id, { ...fresh, id: ours.id, category: ours.category, cycles: ours.cycles, base: ours.base, created: ours.created });
      counts.updated++;
    } else counts.kept++;
  }
  const categories = current.categories.some((c) => c.id === category.id) ? current.categories : [...current.categories, category];
  return { library: { ...current, categories, snippets: [...snippets.values()] }, counts };
}

/** Preview what a strudel.cc import would do, per pattern. */
export function strudelStatus(current: Library, p: StrudelPattern): 'new' | 'update' | 'same' {
  const ours = current.snippets.find((s) => s.source?.strudel === p.id);
  if (!ours) return 'new';
  const fresh = strudelPatternToSnippet(p, ours.category);
  return fresh.code !== ours.code && fresh.updated >= ours.updated ? 'update' : 'same';
}

/** One snippet from a dropped .txt/.strudel/.js file. */
export function textFileToSnippet(fileName: string, text: string, category: string): Snippet {
  const meta = extractMetadata(text);
  const t = now();
  return {
    id: newId(),
    name: meta.name || fileName.replace(/\.[^/.]+$/, ''),
    description: meta.description,
    category,
    tags: meta.tags,
    code: meta.code,
    base: null,
    cycles: 2,
    source: null,
    created: t,
    updated: t,
  };
}
