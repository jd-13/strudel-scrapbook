/* Strudel keeps titles and tags in comments: `// @title …`, `// @tag a, b`, `// @details …`,
   or a first comment of the form `// "Title"`. getMetadata is a port of
   website/src/metadata_parser.js from uzu/strudel. */

import type { Snippet } from './types';

const ALLOW_MANY = ['by', 'url', 'genre', 'license', 'tag'];

export type Metadata = Record<string, string | string[]>;

export function getMetadata(code: string): Metadata {
  const comments = [...code.matchAll(/\/\*([\s\S]*?)\*\/|\/\/(.*)$/gm)].map((c) => (c[1] || c[2] || '').trim());
  const tags: Metadata = {};
  const [prefix, title] = (comments[0] || '').split('"');
  if (prefix.trim() === '' && title !== undefined) tags.title = title;

  for (const comment of comments) {
    for (const match of comment.split('@').slice(1)) {
      let [tag, value] = match.split(/ (.*)/s);
      tag = tag.trim();
      value = (value || '').replaceAll(/ +/g, ' ').trim();
      if (ALLOW_MANY.includes(tag)) {
        const list = value
          .split(/[,\n]/)
          .map((t) => t.trim())
          .filter((t) => t !== '');
        tags[tag] = tag in tags ? (tags[tag] as string[]).concat(list) : list;
      } else {
        value = value.replaceAll(/\s+/g, ' ');
        tags[tag] = tag in tags ? tags[tag] + ' ' + value : value;
      }
    }
  }
  return tags;
}

export interface Extracted {
  name: string;
  tags: string[];
  description: string;
  /** Code with the leading metadata comment block removed. */
  code: string;
}

const asList = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Read metadata from a snippet's comments, and strip the leading run of comment lines that carry it. */
export function extractMetadata(code: string): Extracted {
  const meta = getMetadata(code);
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let sawMeta = false;
  while (i < lines.length) {
    const l = lines[i].trim();
    if (l === '') {
      i++;
      continue;
    }
    const m = /^\/\/(.*)$/.exec(l);
    if (!m) break;
    const body = m[1].trim();
    if (/^@\w+/.test(body) || (i === firstNonBlank(lines) && /^"[^"]*"/.test(body))) {
      sawMeta = true;
      i++;
      continue;
    }
    break;
  }
  const extras = [...asList(meta.by).map((b) => 'by ' + b), ...asList(meta.url), ...asList(meta.license)];
  const details = typeof meta.details === 'string' ? meta.details : '';
  let description = details;
  if (extras.length) description = details ? `${details} (${extras.join(' · ')})` : extras.join(' · ');
  return {
    name: typeof meta.title === 'string' ? meta.title.trim() : '',
    tags: dedupe([...asList(meta.tag), ...asList(meta.genre)].map((t) => t.toLowerCase())),
    description,
    code: sawMeta ? lines.slice(i).join('\n').trim() : code.trim(),
  };
}

function firstNonBlank(lines: string[]) {
  return lines.findIndex((l) => l.trim() !== '');
}

const dedupe = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** A value safe for a one-line metadata comment: no backticks, no `@` (which would start a new key). */
const plain = (s: string) => s.replace(/[`@]/g, '').replace(/\s+/g, ' ').trim();

/** Code with a Strudel metadata header, as copied by `Y`. */
export function withHeader(s: Pick<Snippet, 'name' | 'tags' | 'description' | 'code'>, categoryName?: string): string {
  const tags = dedupe([...s.tags, ...(categoryName ? [categoryName.toLowerCase()] : [])].map((t) => plain(t.replace(/,/g, ' '))));
  const head = [`// @title ${plain(s.name) || 'Untitled'}`];
  if (tags.length) head.push(`// @tag ${tags.join(', ')}`);
  const d = plain(s.description);
  if (d) head.push(`// @details ${d}`);
  return head.join('\n') + '\n' + s.code;
}
