export interface Category {
  id: string;
  name: string;
  blurb: string;
  order: number;
  updated: string;
}

export interface Snippet {
  id: string;
  name: string;
  /** Plain text; `backticks` render as code. */
  description: string;
  category: string;
  tags: string[];
  code: string;
  /** Optional comparison pattern: hits only in `code` are highlighted, hits only here are drawn dashed. */
  base: string | null;
  cycles: number;
  source: { strudel?: string } | null;
  created: string;
  updated: string;
}

export interface Tombstone {
  id: string;
  at: string;
}

export interface Library {
  categories: Category[];
  snippets: Snippet[];
  deleted: Tombstone[];
}

export interface ExportFile extends Library {
  format: 'strudel-scrapbook';
  version: 1;
  exported: string;
}

export type SortMode = 'category' | 'updated' | 'created' | 'name';

export const SORT_LABELS: Record<SortMode, string> = {
  category: 'By category',
  updated: 'Recently updated',
  created: 'Recently added',
  name: 'By name',
};

export const now = () => new Date().toISOString();

export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'category';

export function blankSnippet(category: string): Snippet {
  const t = now();
  return {
    id: newId(),
    name: '',
    description: '',
    category,
    tags: [],
    code: '',
    base: null,
    cycles: 2,
    source: null,
    created: t,
    updated: t,
  };
}

export type CardAction = 'play' | 'copy' | 'copyHeader' | 'edit';
