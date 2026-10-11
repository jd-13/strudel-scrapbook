import * as db from './db.svelte';
import type { Category, Library, Snippet, SortMode } from './types';
import { now } from './types';
import { ensureCategories } from './backup';
import seed from '../seed/seed.json';

export interface Settings {
  vim: boolean;
  sort: SortMode;
  lastExport: string | null;
  /** The welcome dialog has been dismissed. */
  introSeen: boolean;
}

const DEFAULT_SETTINGS: Settings = { vim: true, sort: 'category', lastExport: null, introSeen: false };

export const lib = $state({
  loaded: false,
  categories: [] as Category[],
  snippets: [] as Snippet[],
  deleted: [] as Library['deleted'],
  settings: { ...DEFAULT_SETTINGS } as Settings,
  /** Result of navigator.storage.persist(): true, false, or null if not asked yet / unsupported. */
  persisted: null as boolean | null,
  storageError: '',
});

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('strudel-scrapbook') : null;
channel?.addEventListener('message', () => reload());

function changed() {
  channel?.postMessage('changed');
  requestPersistence();
}

async function guard(p: Promise<unknown>) {
  try {
    await p;
    lib.storageError = '';
  } catch (e) {
    lib.storageError = 'Could not save to browser storage: ' + (e instanceof Error ? e.message : String(e));
  }
}

async function reload() {
  const { library, kv } = await db.loadAll();
  lib.categories = library.categories;
  lib.snippets = library.snippets;
  lib.deleted = library.deleted;
  lib.settings = { ...DEFAULT_SETTINGS, ...((kv.settings as Partial<Settings>) ?? {}) };
}

export async function load() {
  try {
    const { kv } = await db.loadAll();
    if (!kv.seeded) {
      await db.replaceAll(ensureCategories(seed as Library));
      await db.setKV('seeded', true);
    }
    await reload();
    if (navigator.storage?.persisted) lib.persisted = (await navigator.storage.persisted()) || null;
  } catch (e) {
    lib.storageError = 'Browser storage is unavailable, so changes will not be kept: ' + (e instanceof Error ? e.message : String(e));
    const s = seed as Library;
    lib.categories = s.categories;
    lib.snippets = s.snippets;
  }
  lib.loaded = true;
}

let askedPersist = false;
async function requestPersistence() {
  if (askedPersist || !navigator.storage?.persist) return;
  askedPersist = true;
  try {
    lib.persisted = await navigator.storage.persist();
  } catch {
    lib.persisted = false;
  }
}

export function categoryName(id: string) {
  return lib.categories.find((c) => c.id === id)?.name ?? id;
}

export function sortedCategories() {
  return [...lib.categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function saveSnippet(s: Snippet, opts: { touch?: boolean } = {}) {
  const next = { ...s, updated: opts.touch === false ? s.updated : now() };
  const i = lib.snippets.findIndex((x) => x.id === s.id);
  if (i >= 0) lib.snippets[i] = next;
  else lib.snippets.push(next);
  lib.deleted = lib.deleted.filter((d) => d.id !== s.id);
  await guard(db.restoreSnippet(next, lib.deleted));
  changed();
  return next;
}

export async function removeSnippet(id: string): Promise<Snippet | undefined> {
  const s = lib.snippets.find((x) => x.id === id);
  if (!s) return;
  const removed = $state.snapshot(s) as Snippet;
  lib.snippets = lib.snippets.filter((x) => x.id !== id);
  lib.deleted = [...lib.deleted.filter((d) => d.id !== id), { id, at: now() }];
  await guard(db.deleteSnippet(id, lib.deleted));
  changed();
  return removed;
}

export async function restoreSnippet(s: Snippet) {
  lib.snippets.push(s);
  lib.deleted = lib.deleted.filter((d) => d.id !== s.id);
  await guard(db.restoreSnippet(s, lib.deleted));
  changed();
}

export async function saveCategories(cats: Category[]) {
  for (const c of cats) {
    const i = lib.categories.findIndex((x) => x.id === c.id);
    if (i >= 0) lib.categories[i] = c;
    else lib.categories.push(c);
  }
  await guard(db.putCategories(cats));
  changed();
}

export async function removeCategory(id: string) {
  if (lib.snippets.some((s) => s.category === id)) throw new Error('Only empty categories can be deleted.');
  lib.categories = lib.categories.filter((c) => c.id !== id);
  await guard(db.deleteCategory(id));
  changed();
}

/** Replace everything (after an import). */
export async function applyLibrary(next: Library) {
  lib.categories = next.categories;
  lib.snippets = next.snippets;
  lib.deleted = next.deleted;
  await guard(db.replaceAll(next));
  changed();
}

export async function saveSettings(patch: Partial<Settings>) {
  lib.settings = { ...lib.settings, ...patch };
  await guard(db.setKV('settings', lib.settings));
}

export function snapshot(): Library {
  return $state.snapshot({ categories: lib.categories, snippets: lib.snippets, deleted: lib.deleted }) as Library;
}
