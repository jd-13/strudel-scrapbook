<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { CardAction, Category, Snippet, SortMode } from './lib/types';
  import { SORT_LABELS, blankSnippet, newId, now } from './lib/types';
  import {
    lib, load, categoryName, sortedCategories, saveSnippet, removeSnippet, restoreSnippet,
    saveCategories, saveSettings, snapshot,
  } from './lib/library.svelte';
  import { search, sortSnippets } from './lib/search';
  import { renderDescription } from './lib/text';
  import { withHeader, extractMetadata } from './lib/strudelMeta';
  import { codeFromStrudelUrl, isStrudelIdUrl, strudelLink } from './lib/strudelUrl';
  import { parseImport, textFileToSnippet, type Parsed } from './lib/backup';
  import { downloadExport, pickFiles } from './lib/files';
  import { engine, init, stop, toggle } from './lib/engine.svelte';
  import { pwa, applyUpdate } from './lib/pwa.svelte';
  import Card from './components/Card.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import CategoriesDialog from './components/CategoriesDialog.svelte';
  import HelpDialog from './components/HelpDialog.svelte';

  /* ---------- state ---------- */
  let query = $state('');
  let searchEl: HTMLInputElement;
  let selectedId = $state<string | null>(null);
  let editor = $state<{ snippet: Snippet; isNew: boolean } | null>(null);
  let importing = $state<{ parsed: Parsed; fileName: string } | null>(null);
  let showHelp = $state(false);
  let showCategories = $state(false);
  let dragging = $state(false);
  let lastDeleted: Snippet | null = null;
  let pending: { key: string; at: number } | null = null;

  interface Toast { id: number; text: string; undo?: boolean }
  let toasts = $state<Toast[]>([]);
  let toastSeq = 0;
  function toast(text: string, opts: { undo?: boolean; ms?: number } = {}) {
    const id = ++toastSeq;
    toasts = [...toasts.filter((t) => !(opts.undo && t.undo)), { id, text, undo: opts.undo }];
    setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), opts.ms ?? (opts.undo ? 8000 : 3000));
  }

  onMount(() => {
    load();
    init().catch(() => {});
  });

  /* ---------- what's shown ---------- */
  interface Section { id: string; title: string; blurb: string; items: Snippet[] }

  const sections = $derived.by((): Section[] => {
    if (query.trim()) {
      const items = search(lib.snippets, lib.categories, query);
      return [{ id: 'results', title: `${items.length} ${items.length === 1 ? 'match' : 'matches'}`, blurb: '', items }];
    }
    if (lib.settings.sort === 'category') {
      return sortedCategories()
        .map((c) => ({ id: c.id, title: c.name, blurb: c.blurb, items: sortSnippets(lib.snippets.filter((s) => s.category === c.id), 'category') }))
        .filter((s) => s.items.length);
    }
    return [{ id: 'all', title: SORT_LABELS[lib.settings.sort], blurb: '', items: sortSnippets(lib.snippets, lib.settings.sort) }];
  });
  const flat = $derived(sections.flatMap((s) => s.items));
  const selected = $derived(flat.find((s) => s.id === selectedId) ?? null);
  const grouped = $derived(!query.trim() && lib.settings.sort === 'category');

  $effect(() => {
    if (flat.length && !flat.some((s) => s.id === selectedId)) selectedId = flat[0].id;
  });

  /* ---------- navigation ---------- */
  function cardEl(id: string | null) {
    return id ? document.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"]`) : null;
  }

  async function select(id: string | undefined | null, scroll = true) {
    if (!id) return;
    selectedId = id;
    if (scroll) {
      await tick();
      cardEl(id)?.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Spatial move between cards; falls back to reading order. */
  function move(dir: 'h' | 'j' | 'k' | 'l') {
    const i = flat.findIndex((s) => s.id === selectedId);
    if (i < 0) return select(flat[0]?.id);
    const cur = cardEl(selectedId)?.getBoundingClientRect();
    if (!cur) return select(flat[Math.max(0, Math.min(flat.length - 1, i + (dir === 'j' || dir === 'l' ? 1 : -1)))].id);
    const cx = cur.left + cur.width / 2;
    const rects = flat.map((s) => ({ id: s.id, r: cardEl(s.id)?.getBoundingClientRect() })).filter((x) => x.r && x.id !== selectedId) as { id: string; r: DOMRect }[];
    let best: string | undefined;
    if (dir === 'h' || dir === 'l') {
      const sameRow = rects.filter((x) => Math.abs(x.r.top - cur.top) < 8 && (dir === 'l' ? x.r.left > cur.left : x.r.left < cur.left));
      sameRow.sort((a, b) => Math.abs(a.r.left - cur.left) - Math.abs(b.r.left - cur.left));
      best = sameRow[0]?.id ?? flat[i + (dir === 'l' ? 1 : -1)]?.id;
    } else {
      const cand = rects.filter((x) => (dir === 'j' ? x.r.top >= cur.bottom - 2 : x.r.bottom <= cur.top + 2));
      if (cand.length) {
        const edge = dir === 'j' ? Math.min(...cand.map((x) => x.r.top)) : Math.max(...cand.map((x) => x.r.top));
        const row = cand.filter((x) => Math.abs(x.r.top - edge) < 8);
        row.sort((a, b) => Math.abs(a.r.left + a.r.width / 2 - cx) - Math.abs(b.r.left + b.r.width / 2 - cx));
        best = row[0]?.id;
      }
    }
    select(best);
  }

  function jumpSection(dir: 1 | -1) {
    const si = sections.findIndex((s) => s.items.some((x) => x.id === selectedId));
    const target = sections[si + dir];
    if (target) select(target.items[0].id);
    else if (dir === -1 && sections[si]) select(sections[si].items[0].id);
  }

  /* ---------- actions ---------- */
  const currentCategory = () => selected?.category ?? sortedCategories()[0]?.id ?? 'uncategorised';

  async function copy(s: Snippet, header: boolean) {
    const text = header ? withHeader(s, categoryName(s.category)) : s.code;
    try {
      await navigator.clipboard.writeText(text);
      toast(header ? `Copied ${s.name} with header` : `Copied ${s.name}`);
    } catch {
      toast('Copying was blocked by the browser.');
    }
  }

  function act(s: Snippet, a: CardAction) {
    selectedId = s.id;
    if (a === 'play') toggle(s.id, s.code, s.cycles);
    else if (a === 'copy') copy(s, false);
    else if (a === 'copyHeader') copy(s, true);
    else if (a === 'edit') editor = { snippet: s, isNew: false };
  }

  function newSnippet(fill: Partial<Snippet> = {}) {
    editor = { snippet: { ...blankSnippet(currentCategory()), ...fill }, isNew: true };
  }

  async function pasteNew() {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      newSnippet();
      toast('Clipboard access was blocked; paste into the code field.');
      return;
    }
    if (!text.trim()) return newSnippet();
    if (isStrudelIdUrl(text)) {
      toast('That link points at a saved strudel.cc pattern; open it and copy the code instead.');
      return;
    }
    const code = codeFromStrudelUrl(text) ?? text;
    const meta = extractMetadata(code);
    newSnippet({ name: meta.name, tags: meta.tags, description: meta.description, code: meta.code });
  }

  async function duplicate(s: Snippet) {
    const t = now();
    const copy = { ...$state.snapshot(s), id: newId(), name: `${s.name} (copy)`, source: null, created: t, updated: t } as Snippet;
    await saveSnippet(copy, { touch: false });
    await select(copy.id);
    toast(`Duplicated ${s.name}`);
  }

  async function remove(s: Snippet) {
    const i = flat.findIndex((x) => x.id === s.id);
    const next = flat[i + 1] ?? flat[i - 1];
    if (engine.playing === s.id) stop();
    lastDeleted = (await removeSnippet(s.id)) ?? null;
    if (next) select(next.id, false);
    toast(`Deleted ${s.name}. Press u to undo.`, { undo: true });
  }

  async function undo() {
    if (!lastDeleted) return;
    const s = lastDeleted;
    lastDeleted = null;
    await restoreSnippet(s);
    toasts = toasts.filter((t) => !t.undo);
    await select(s.id);
    toast(`Restored ${s.name}`);
  }

  function cycleSort() {
    const modes = Object.keys(SORT_LABELS) as SortMode[];
    const next = modes[(modes.indexOf(lib.settings.sort) + 1) % modes.length];
    saveSettings({ sort: next });
    toast(`Sort: ${SORT_LABELS[next]}`);
  }

  function exportAll() {
    downloadExport(snapshot());
    saveSettings({ lastExport: now() });
    toast(`Exported ${lib.snippets.length} snippets`);
  }

  async function importFiles(files: File[]) {
    const json = files.filter((f) => /\.json$/i.test(f.name) || f.type === 'application/json');
    const text = files.filter((f) => !json.includes(f) && /\.(txt|strudel|js|mjs)$/i.test(f.name));
    if (json.length) {
      try {
        importing = { parsed: parseImport(await json[0].text()), fileName: json[0].name };
        if (json.length > 1) toast('Importing one JSON file at a time; drop the others afterwards.');
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { ms: 6000 });
      }
      return;
    }
    if (text.length === 1) {
      const s = textFileToSnippet(text[0].name, await text[0].text(), currentCategory());
      editor = { snippet: s, isNew: true };
    } else if (text.length > 1) {
      let cat = lib.categories.find((c) => c.id === 'imported');
      if (!cat) {
        cat = { id: 'imported', name: 'Imported', blurb: 'Snippets added from files.', order: Math.max(-1, ...lib.categories.map((c) => c.order)) + 1, updated: now() };
        await saveCategories([cat]);
      }
      for (const f of text) await saveSnippet(textFileToSnippet(f.name, await f.text(), cat.id), { touch: false });
      toast(`Added ${text.length} snippets to Imported`);
    } else if (files.length) toast('Drop a .json export, or .txt / .strudel / .js files.');
  }

  async function onEditorSave(s: Snippet, newCategory: Category | null) {
    if (newCategory) await saveCategories([newCategory]);
    const saved = await saveSnippet(s);
    editor = null;
    query = query && !search([saved], lib.categories, query).length ? '' : query;
    await select(saved.id);
    toast(`Saved ${saved.name}`);
  }

  /* ---------- keyboard ---------- */
  const overlayOpen = () => !!(editor || importing || showHelp || showCategories);

  function twoKey(key: string): boolean {
    const t = performance.now();
    if (pending && pending.key === key && t - pending.at < 800) {
      pending = null;
      return true;
    }
    pending = { key, at: t };
    return false;
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      searchEl.blur();
      select(flat[0]?.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      query = '';
      searchEl.blur();
      tick().then(() => cardEl(selectedId)?.scrollIntoView({ block: 'center' }));
    }
  }

  function onKey(e: KeyboardEvent) {
    if (overlayOpen() || e.defaultPrevented) return;
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const s = selected;
    const k = e.key;
    let handled = true;
    switch (k) {
      case 'j': case 'k': case 'h': case 'l': move(k); break;
      case 'ArrowDown': move('j'); break;
      case 'ArrowUp': move('k'); break;
      case 'ArrowLeft': move('h'); break;
      case 'ArrowRight': move('l'); break;
      case 'g': if (twoKey('g')) select(flat[0]?.id); break;
      case 'G': select(flat[flat.length - 1]?.id); break;
      case ']': jumpSection(1); break;
      case '[': jumpSection(-1); break;
      case '/': searchEl.focus(); searchEl.select(); break;
      case ' ': if (s) toggle(s.id, s.code, s.cycles); break;
      case 'y': if (s) copy(s, false); break;
      case 'Y': if (s) copy(s, true); break;
      case 'o': if (s) window.open(strudelLink(s.code), '_blank', 'noopener'); break;
      case 'e': case 'Enter': if (s) editor = { snippet: s, isNew: false }; break;
      case 'n': newSnippet(); break;
      case 'p': pasteNew(); break;
      case 'D': if (s) duplicate(s); break;
      case 'd': if (s && twoKey('d')) remove(s); break;
      case 'u': undo(); break;
      case 's': cycleSort(); break;
      case 'x': exportAll(); break;
      case 'X': pickFiles('.json,.txt,.strudel,.js,application/json,text/plain').then(importFiles); break;
      case 'C': showCategories = true; break;
      case '?': showHelp = true; break;
      case 'Escape':
        if (engine.playing) stop();
        else if (query) query = '';
        break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }

  /* ---------- drag and drop ---------- */
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (overlayOpen() || !e.dataTransfer?.files.length) return;
    importFiles([...e.dataTransfer.files]);
  }
</script>

<svelte:window
  onkeydown={onKey}
  ondragover={(e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); dragging = true; } }}
  ondragleave={(e) => { if (!e.relatedTarget) dragging = false; }}
  ondrop={onDrop}
/>

<div class="page">
  <header>
    <div class="titlebar">
      <h1>Strudel Scrapbook</h1>
      <div class="tools">
        <button type="button" onclick={() => newSnippet()}>New <kbd>n</kbd></button>
        <button type="button" onclick={pasteNew}>Paste <kbd>p</kbd></button>
        <button type="button" onclick={() => (showCategories = true)}>Categories <kbd>C</kbd></button>
        <button type="button" onclick={exportAll}>Export <kbd>x</kbd></button>
        <button type="button" onclick={() => pickFiles('.json,.txt,.strudel,.js,application/json,text/plain').then(importFiles)}>Import <kbd>X</kbd></button>
        <button type="button" onclick={() => (showHelp = true)}>Keys <kbd>?</kbd></button>
      </div>
    </div>
    <div class="searchbar">
      <input
        type="search" placeholder="Search names, tags, descriptions and code" aria-label="Search snippets"
        bind:value={query} bind:this={searchEl} onkeydown={onSearchKey} autocomplete="off" spellcheck="false"
      />
      <kbd class="slash" aria-hidden="true">/</kbd>
      <button type="button" class="sort" onclick={cycleSort} title="Change sort order">{SORT_LABELS[lib.settings.sort]} <kbd>s</kbd></button>
    </div>
    <ul class="legend">
      <li><span class="sw n"></span>hit or note</li>
      <li><span class="sw q"></span>quiet hit</li>
      <li><span class="sw l"></span>added by a transform</li>
      <li><span class="sw g"></span>removed by it</li>
      <li class="status">
        {lib.snippets.length} snippets ·
        {#if engine.status === 'ready'}grids from the Strudel engine{:else if engine.status === 'failed'}Strudel engine failed to load{:else}loading the Strudel engine…{/if}
      </li>
    </ul>
    {#if grouped && sections.length > 1}
      <nav aria-label="Sections">
        {#each sections as sec}<a href="#sec-{sec.id}" onclick={() => select(sec.items[0].id, false)}>{sec.title}</a>{/each}
      </nav>
    {/if}
    {#if lib.storageError}<p class="banner err">{lib.storageError}</p>{/if}
  </header>

  <main>
    {#if !lib.loaded}
      <p class="muted">Loading your library…</p>
    {:else if !flat.length}
      <div class="empty">
        {#if query}
          <p>Nothing matches “{query}”. <kbd>Esc</kbd> clears the search.</p>
        {:else}
          <p>Your library is empty. Press <kbd>n</kbd> for a new snippet, <kbd>p</kbd> to paste one, or <kbd>X</kbd> to import an export.</p>
        {/if}
      </div>
    {:else}
      {#each sections as sec (sec.id)}
        <section id="sec-{sec.id}">
          <div class="sec-head">
            <h2>{sec.title}</h2>
            {#if sec.blurb}<p class="blurb">{@html renderDescription(sec.blurb)}</p>{/if}
          </div>
          <div class="grid">
            {#each sec.items as s (s.id)}
              <Card snippet={s} categoryName={categoryName(s.category)} selected={s.id === selectedId} showCategory={!grouped}
                onselect={() => (selectedId = s.id)} onaction={(a) => act(s, a)} />
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  </main>

  <footer class="muted">
    Snippets live in this browser only, so export regularly (<kbd>x</kbd>). Patterns are evaluated and played by
    <a href="https://strudel.cc" target="_blank" rel="noopener">Strudel</a> (AGPL-3.0-or-later) with its default sample sets.
  </footer>
</div>

{#if dragging}<div class="dropzone" aria-hidden="true"><p>Drop a JSON export, a strudel.cc patterns export, or code files</p></div>{/if}

<div class="toasts" aria-live="polite">
  {#if pwa.updateReady}
    <div class="toast"><span>A new version is ready.</span><button type="button" class="primary" onclick={applyUpdate}>Reload</button></div>
  {/if}
  {#each toasts as t (t.id)}
    <div class="toast"><span>{t.text}</span>{#if t.undo}<button type="button" onclick={undo}>Undo <kbd>u</kbd></button>{/if}</div>
  {/each}
</div>

{#if editor}
  <!-- CodeMirror loads with the editor, keeping it out of the main bundle. -->
  {#await import('./components/EditorDialog.svelte') then { default: EditorDialog }}
    <EditorDialog initial={editor.snippet} isNew={editor.isNew} onsave={onEditorSave} onclose={() => (editor = null)} />
  {/await}
{/if}
{#if importing}
  <ImportDialog parsed={importing.parsed} fileName={importing.fileName} onclose={() => (importing = null)}
    ondone={(msg) => { importing = null; toast(msg, { ms: 5000 }); }} />
{/if}
{#if showCategories}<CategoriesDialog initial={selected?.category ?? null} onclose={() => (showCategories = false)} />{/if}
{#if showHelp}<HelpDialog onclose={() => (showHelp = false)} />{/if}

<style>
  .page { max-width: 1120px; margin: 0 auto; padding: 28px 20px 64px; display: flex; flex-direction: column; gap: 32px; }
  @media (max-width: 600px) { .page { padding-inline: 16px; } }
  header { display: flex; flex-direction: column; gap: 14px; }
  .titlebar { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: flex-end; justify-content: space-between; }
  h1 { font-family: var(--display); font-weight: 800; font-size: clamp(2rem, 6vw, 3.1rem); line-height: 1; letter-spacing: -0.02em; margin: 0; }
  .tools { display: flex; flex-wrap: wrap; gap: 6px; }
  .searchbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; align-items: center; padding: 8px 0; background: var(--bg); }
  .searchbar input { font-size: 1rem; padding: 9px 12px 9px 36px; }
  .slash { position: absolute; left: 10px; pointer-events: none; }
  .sort { white-space: nowrap; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 0.82rem; color: var(--muted); margin: 0; padding: 0; list-style: none; }
  .legend li { display: flex; align-items: center; gap: 7px; }
  .legend .status { font-family: var(--mono); font-size: 0.76rem; margin-left: auto; }
  .sw { width: 12px; height: 11px; border-radius: 2px; flex: none; }
  .sw.n { background: var(--note); } .sw.q { background: var(--note); opacity: 0.4; } .sw.l { background: var(--layer); }
  .sw.g { border: 1.5px dashed var(--ghost); }
  nav { display: flex; flex-wrap: wrap; gap: 8px; }
  nav a { font-family: var(--mono); font-size: 0.78rem; color: var(--ink); text-decoration: none; border: 1px solid var(--line-strong); padding: 4px 10px; border-radius: 999px; }
  nav a:hover { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .banner { margin: 0; padding: 8px 12px; border-radius: 4px; border: 1px solid var(--danger); }
  .err { color: var(--danger); }
  main { display: flex; flex-direction: column; gap: 40px; }
  section { display: flex; flex-direction: column; gap: 16px; scroll-margin-top: 70px; }
  .sec-head { display: flex; flex-direction: column; gap: 4px; border-top: 2px solid var(--ink); padding-top: 12px; }
  h2 { font-family: var(--display); font-weight: 600; font-size: 1.5rem; line-height: 1.15; margin: 0; }
  .blurb { margin: 0; color: var(--muted); max-width: 68ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); gap: 18px; }
  .empty { padding: 40px 0; color: var(--muted); }
  footer { font-size: 0.85rem; max-width: 70ch; }
  footer a { color: var(--ink); }
  .dropzone { position: fixed; inset: 12px; z-index: 60; border: 3px dashed var(--layer); border-radius: 12px; background: color-mix(in srgb, var(--bg) 85%, transparent); display: grid; place-items: center; pointer-events: none; font-family: var(--display); font-size: 1.4rem; }
  .toasts { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 70; display: flex; flex-direction: column; gap: 8px; align-items: center; width: min(560px, calc(100% - 32px)); }
  .toast { display: flex; gap: 12px; align-items: center; justify-content: space-between; width: 100%; background: var(--ink); color: var(--bg); padding: 9px 12px; border-radius: 6px; font-size: 0.88rem; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25); }
  .toast button { color: var(--bg); border-color: var(--bg); }
  .toast button:hover { background: var(--bg); color: var(--ink); }
</style>
