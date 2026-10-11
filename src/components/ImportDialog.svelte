<script lang="ts">
  import { onMount } from 'svelte';
  import type { Category } from '../lib/types';
  import { now } from '../lib/types';
  import { merge, mergeStrudel, strudelStatus, type Parsed } from '../lib/backup';
  import { extractMetadata } from '../lib/strudelMeta';
  import { applyLibrary, lib, snapshot, sortedCategories } from '../lib/library.svelte';
  import { downloadExport } from '../lib/files';

  let { parsed, fileName, onclose, ondone }: { parsed: Parsed; fileName: string; onclose: () => void; ondone: (msg: string) => void } = $props();

  let busy = $state(false);
  let root: HTMLDivElement;
  onMount(() => root.focus());

  /* ---------- scrapbook export ---------- */
  const preview = $derived(parsed.kind === 'scrapbook' ? merge(snapshot(), parsed.library).counts : null);

  async function doMerge() {
    if (parsed.kind !== 'scrapbook' || busy) return;
    busy = true;
    const { library, counts } = merge(snapshot(), parsed.library);
    await applyLibrary(library);
    ondone(`Merged: ${counts.added} added, ${counts.updated} updated, ${counts.deleted} deleted.`);
  }

  async function doReplace() {
    if (parsed.kind !== 'scrapbook' || busy) return;
    if (!confirm(`Replace your whole library (${lib.snippets.length} snippets) with the ${parsed.library.snippets.length} in this file? A backup of the current library downloads first.`)) return;
    busy = true;
    downloadExport(snapshot(), 'strudel-scrapbook-before-replace');
    await applyLibrary(parsed.library);
    ondone(`Replaced the library with ${parsed.library.snippets.length} snippets from ${fileName}.`);
  }

  /* ---------- strudel.cc export ---------- */
  const NEW_CAT = '__new__';
  const patterns = $derived(parsed.kind === 'strudel' ? parsed.patterns : []);
  const rows = $derived(
    patterns.map((p) => {
      const m = extractMetadata(p.code);
      return { p, name: m.name || (p.created_at ? new Date(p.created_at).toLocaleDateString() : p.id), tags: m.tags, status: strudelStatus(snapshot(), p) };
    }),
  );
  let chosen = $state<boolean[]>([]);
  let cursor = $state(0);
  let target = $state(lib.categories.some((c) => c.id === 'from-strudel') ? 'from-strudel' : NEW_CAT);
  $effect(() => {
    chosen = rows.map((r) => r.status !== 'same');
  });
  const count = $derived(chosen.filter(Boolean).length);

  async function doStrudel() {
    if (busy || !count) return;
    busy = true;
    const cat: Category =
      target === NEW_CAT
        ? { id: 'from-strudel', name: 'From strudel.cc', blurb: 'Patterns imported from the strudel.cc Patterns tab.', order: Math.max(-1, ...lib.categories.map((c) => c.order)) + 1, updated: now() }
        : lib.categories.find((c) => c.id === target)!;
    const pick = patterns.filter((_, i) => chosen[i]);
    const { library, counts } = mergeStrudel(snapshot(), pick, cat);
    await applyLibrary(library);
    ondone(`From strudel.cc: ${counts.added} added, ${counts.updated} updated${counts.kept ? `, ${counts.kept} unchanged` : ''}.`);
  }

  function scrollCursor() {
    queueMicrotask(() => root.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }));
  }

  function keys(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
      return;
    }
    if (tag === 'SELECT' && e.key !== 'Enter') return;
    if (parsed.kind === 'scrapbook') {
      if (e.key === 'm' || e.key === 'Enter') (e.preventDefault(), doMerge());
      else if (e.key === 'r') (e.preventDefault(), doReplace());
      return;
    }
    if (e.key === 'j' || e.key === 'ArrowDown') (cursor = Math.min(rows.length - 1, cursor + 1)), scrollCursor(), e.preventDefault();
    else if (e.key === 'k' || e.key === 'ArrowUp') (cursor = Math.max(0, cursor - 1)), scrollCursor(), e.preventDefault();
    else if (e.key === ' ' && tag !== 'INPUT') (chosen[cursor] = !chosen[cursor]), e.preventDefault();
    else if (e.key === 'a') {
      const all = chosen.every(Boolean);
      chosen = chosen.map(() => !all);
    } else if (e.key === 'Enter') (e.preventDefault(), doStrudel());
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" tabindex="-1" bind:this={root} onkeydown={keys}>
    {#if parsed.kind === 'scrapbook' && preview}
      <h2 id="import-title">Import {fileName}</h2>
      <p class="muted">
        The file has {parsed.library.snippets.length} snippets in {parsed.library.categories.length} categories. Your library has {lib.snippets.length}.
      </p>
      <dl class="counts">
        <div><dt>New</dt><dd>{preview.added}</dd></div>
        <div><dt>Newer than yours</dt><dd>{preview.updated}</dd></div>
        <div><dt>Same or older</dt><dd>{preview.kept}</dd></div>
        <div><dt>Deleted in the file</dt><dd>{preview.deleted}</dd></div>
      </dl>
      <p class="muted"><strong>Merge</strong> keeps the newer version of each snippet and adds the rest. <strong>Replace</strong> makes your library exactly the file, after downloading a backup.</p>
      <div class="row end">
        <button type="button" onclick={onclose}>Cancel <kbd>Esc</kbd></button>
        <button type="button" class="danger" disabled={busy} onclick={doReplace}>Replace <kbd>r</kbd></button>
        <button type="button" class="primary" disabled={busy} onclick={doMerge}>Merge <kbd>m</kbd></button>
      </div>
    {:else}
      <h2 id="import-title">Import from strudel.cc</h2>
      <p class="muted">{rows.length} patterns in {fileName}. Names and tags come from their <code>// @title</code> and <code>// @tag</code> comments.</p>
      <label class="target">Into category
        <select bind:value={target}>
          {#if !lib.categories.some((c) => c.id === 'from-strudel')}<option value={NEW_CAT}>New: From strudel.cc</option>{/if}
          {#each sortedCategories() as c}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      <ul class="list">
        {#each rows as r, i}
          <li data-row={i} class:cursor={i === cursor}>
            <label class="item">
              <input type="checkbox" bind:checked={chosen[i]} tabindex="-1" />
              <span class="name">{r.name}</span>
              {#if r.tags.length}<span class="muted mono">{r.tags.map((t) => '#' + t).join(' ')}</span>{/if}
              <span class="status {r.status}">{r.status === 'new' ? 'new' : r.status === 'update' ? 'update' : 'already here'}</span>
            </label>
          </li>
        {/each}
      </ul>
      <p class="muted keys"><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>space</kbd> toggle · <kbd>a</kbd> all/none · <kbd>Enter</kbd> import</p>
      <div class="row end">
        <button type="button" onclick={onclose}>Cancel <kbd>Esc</kbd></button>
        <button type="button" class="primary" disabled={busy || !count} onclick={doStrudel}>Import {count} <kbd>Enter</kbd></button>
      </div>
    {/if}
  </div>
</div>

<style>
  .dialog:focus { outline: none; }
  .counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0; }
  @media (max-width: 600px) { .counts { grid-template-columns: repeat(2, 1fr); } }
  .counts div { background: var(--roll); border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; }
  .counts dt { font-size: 0.75rem; color: var(--muted); }
  .counts dd { margin: 0; font-family: var(--display); font-size: 1.5rem; font-weight: 600; }
  .target { max-width: 320px; }
  .list { list-style: none; margin: 0; padding: 0; max-height: 50vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 4px; background: var(--roll); }
  .list li { border-bottom: 1px solid var(--line); }
  .list li:last-child { border-bottom: 0; }
  .list li.cursor { background: var(--roll-alt); box-shadow: inset 3px 0 0 var(--layer); }
  .item { flex-direction: row; align-items: center; gap: 10px; padding: 7px 10px; color: var(--ink); font-size: 0.9rem; cursor: pointer; }
  .name { font-weight: 600; }
  .mono { font-family: var(--mono); font-size: 0.75rem; }
  .status { margin-left: auto; font-family: var(--mono); font-size: 0.72rem; text-transform: uppercase; color: var(--muted); }
  .status.new { color: var(--note); }
  .status.update { color: var(--layer); }
  .keys { font-size: 0.8rem; margin: 0; }
</style>
