import type { Category, Snippet, SortMode } from './types';

/* Every whitespace-separated term must match somewhere. Name, tags and category
   match fuzzily (letters in order, close together); description and code only by
   substring, since a long text matches almost any letters in order. */

const WEIGHTS = { name: 4, tag: 3, category: 2.5, description: 1.5, code: 1 };

const isWordStart = (text: string, i: number) => i === 0 || /[^a-z0-9]/.test(text[i - 1]);

export function substringScore(term: string, text: string): number {
  const i = text.indexOf(term);
  if (i < 0) return 0;
  if (text === term) return 2.5;
  return 1 + (isWordStart(text, i) ? 0.5 : 0);
}

export function fuzzyScore(term: string, text: string): number {
  const sub = substringScore(term, text);
  if (sub) return sub;
  // Greedy in-order match; reward compact matches and word starts.
  let ti = 0;
  let first = -1;
  let starts = 0;
  for (let i = 0; i < text.length && ti < term.length; i++) {
    if (text[i] === term[ti]) {
      if (first < 0) first = i;
      if (isWordStart(text, i)) starts++;
      ti++;
      if (ti === term.length) {
        const span = i - first + 1;
        if (span > term.length * 3 + 2) return 0;
        return 0.3 + 0.4 * (term.length / span) + 0.1 * Math.min(starts, 3);
      }
    }
  }
  return 0;
}

export function scoreSnippet(terms: string[], s: Snippet, categoryName: string): number {
  const name = s.name.toLowerCase();
  const cat = categoryName.toLowerCase();
  const desc = s.description.toLowerCase();
  const code = s.code.toLowerCase();
  const tags = s.tags.map((t) => t.toLowerCase());
  let total = 0;
  for (const term of terms) {
    const best = Math.max(
      fuzzyScore(term, name) * WEIGHTS.name,
      ...tags.map((t) => fuzzyScore(term, t) * WEIGHTS.tag),
      fuzzyScore(term, cat) * WEIGHTS.category,
      substringScore(term, desc) * WEIGHTS.description,
      substringScore(term, code) * WEIGHTS.code,
    );
    if (best <= 0) return 0;
    total += best;
  }
  return total;
}

export const terms = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/** Snippets matching `query`, best first. */
export function search(snippets: Snippet[], categories: Category[], query: string): Snippet[] {
  const t = terms(query);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return snippets
    .map((s) => ({ s, score: scoreSnippet(t, s, catName.get(s.category) ?? '') }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .map((r) => r.s);
}

export function sortSnippets(snippets: Snippet[], mode: SortMode): Snippet[] {
  const out = [...snippets];
  if (mode === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  else if (mode === 'updated') out.sort((a, b) => b.updated.localeCompare(a.updated));
  else if (mode === 'created') out.sort((a, b) => b.created.localeCompare(a.created));
  else out.sort((a, b) => a.created.localeCompare(b.created) || a.name.localeCompare(b.name));
  return out;
}
