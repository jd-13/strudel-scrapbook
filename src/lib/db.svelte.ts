/* A thin promise wrapper over IndexedDB: one store each for snippets and
   categories, and a key-value store for tombstones and settings. */

import type { Category, Library, Snippet } from './types';

const DB_NAME = 'strudel-scrapbook';
type StoreName = 'snippets' | 'categories' | 'kv';

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('snippets', { keyPath: 'id' });
      db.createObjectStore('categories', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function write(stores: StoreName[], fn: (tx: IDBTransaction) => void) {
  const tx = (await open()).transaction(stores, 'readwrite');
  fn(tx);
  return done(tx);
}

export async function loadAll(): Promise<{ library: Library; kv: Record<string, unknown> }> {
  const tx = (await open()).transaction(['snippets', 'categories', 'kv'], 'readonly');
  const [snippets, categories, keys, values] = await Promise.all([
    result(tx.objectStore('snippets').getAll() as IDBRequest<Snippet[]>),
    result(tx.objectStore('categories').getAll() as IDBRequest<Category[]>),
    result(tx.objectStore('kv').getAllKeys()),
    result(tx.objectStore('kv').getAll()),
  ]);
  const kv: Record<string, unknown> = {};
  keys.forEach((k, i) => (kv[String(k)] = values[i]));
  const deleted = Array.isArray(kv.deleted) ? (kv.deleted as Library['deleted']) : [];
  return { library: { snippets, categories, deleted }, kv };
}

export const putSnippets = (snippets: Snippet[]) => write(['snippets'], (tx) => snippets.forEach((s) => tx.objectStore('snippets').put($state.snapshot(s))));

export const putCategories = (cats: Category[]) => write(['categories'], (tx) => cats.forEach((c) => tx.objectStore('categories').put($state.snapshot(c))));

export const deleteCategory = (id: string) => write(['categories'], (tx) => tx.objectStore('categories').delete(id));

export const setKV = (key: string, value: unknown) => write(['kv'], (tx) => tx.objectStore('kv').put($state.snapshot(value), key));

/** Delete a snippet and record its tombstone list in one transaction. */
export const deleteSnippet = (id: string, deleted: Library['deleted']) =>
  write(['snippets', 'kv'], (tx) => {
    tx.objectStore('snippets').delete(id);
    tx.objectStore('kv').put($state.snapshot(deleted), 'deleted');
  });

/** Restore a snippet and its updated tombstone list in one transaction. */
export const restoreSnippet = (s: Snippet, deleted: Library['deleted']) =>
  write(['snippets', 'kv'], (tx) => {
    tx.objectStore('snippets').put($state.snapshot(s));
    tx.objectStore('kv').put($state.snapshot(deleted), 'deleted');
  });

/** Replace the whole library atomically. */
export const replaceAll = (lib: Library) =>
  write(['snippets', 'categories', 'kv'], (tx) => {
    const s = tx.objectStore('snippets');
    const c = tx.objectStore('categories');
    s.clear();
    c.clear();
    lib.snippets.forEach((x) => s.put($state.snapshot(x)));
    lib.categories.forEach((x) => c.put($state.snapshot(x)));
    tx.objectStore('kv').put($state.snapshot(lib.deleted), 'deleted');
  });
