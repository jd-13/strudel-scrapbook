<script lang="ts">
  import { untrack } from 'svelte';
  import type { EditorView } from '@codemirror/view';
  import type { Category, Snippet } from '../lib/types';
  import { now, slug } from '../lib/types';
  import { lib, saveSettings, sortedCategories } from '../lib/library.svelte';
  import { extractMetadata, getMetadata } from '../lib/strudelMeta';
  import { engine, stop, toggle } from '../lib/engine.svelte';
  import CodeEditor, { vimWantsEscape } from './CodeEditor.svelte';
  import Viz from './Viz.svelte';

  let {
    initial,
    isNew,
    onsave,
    onclose,
  }: { initial: Snippet; isNew: boolean; onsave: (s: Snippet, newCategory: Category | null) => void; onclose: () => void } = $props();

  const PLAY_KEY = 'editor';
  // The dialog edits a copy taken when it opens.
  const start = untrack(() => $state.snapshot(initial)) as Snippet;
  const startCategory = lib.categories.find((c) => c.id === start.category)?.name ?? start.category;

  let name = $state(start.name);
  let category = $state(startCategory);
  let tagsText = $state(start.tags.join(', '));
  let cycles = $state(start.cycles);
  let description = $state(start.description);
  let code = $state(start.code);
  let base = $state(start.base ?? '');
  let showBase = $state(!!start.base);
  let preview = $state(start.code);
  let previewBase = $state(start.base ?? '');
  let codeView = $state<EditorView>();
  let baseView = $state<EditorView>();
  let error = $state('');
  let nameInput: HTMLInputElement;

  const cycleCount = $derived(Math.max(1, Math.min(16, Math.round(Number(cycles)) || 1)));
  const tags = $derived([...new Set(tagsText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]);
  const dirty = $derived(
    name !== start.name || category !== startCategory || tags.join(',') !== start.tags.join(',') || cycleCount !== start.cycles ||
      description !== start.description || code !== start.code || (showBase ? base : '') !== (start.base ?? ''),
  );

  // Preview follows the code after a short pause.
  $effect(() => {
    const c = code, b = showBase ? base : '';
    const t = setTimeout(() => ((preview = c), (previewBase = b)), 450);
    return () => clearTimeout(t);
  });

  // Pasting code with a Strudel metadata header fills the fields and strips the header.
  $effect(() => {
    const c = code;
    if (!/^\s*\/\//.test(c)) return;
    const meta = getMetadata(c);
    if (!('title' in meta || 'tag' in meta || 'details' in meta)) return;
    const x = extractMetadata(c);
    if (x.code === c.trim()) return;
    if (x.name && !name.trim()) name = x.name;
    if (x.tags.length) tagsText = [...new Set([...tags, ...x.tags])].join(', ');
    if (x.description && !description.trim()) description = x.description;
    code = x.code;
  });

  /* ---------- tag suggestions ---------- */
  const allTags = $derived([...new Set(lib.snippets.flatMap((s) => s.tags))].sort());
  const partial = $derived(tagsText.split(',').pop()!.trim().toLowerCase());
  let tagFocus = $state(false);
  let pick = $state(-1);
  const suggestions = $derived(
    partial ? allTags.filter((t) => t.includes(partial) && !tags.slice(0, -1).includes(t) && t !== partial).sort((a, b) => +!a.startsWith(partial) - +!b.startsWith(partial)).slice(0, 8) : [],
  );
  $effect(() => {
    suggestions;
    pick = -1;
  });
  function acceptTag(t: string) {
    const parts = tagsText.split(',');
    parts[parts.length - 1] = ' ' + t;
    tagsText = parts.join(',').replace(/^\s+/, '') + ', ';
    pick = -1;
  }
  function tagKeys(e: KeyboardEvent) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') (pick = (pick + 1) % suggestions.length), e.preventDefault();
    else if (e.key === 'ArrowUp') (pick = (pick - 1 + suggestions.length) % suggestions.length), e.preventDefault();
    else if (e.key === 'Enter' && pick >= 0) acceptTag(suggestions[pick]), e.preventDefault(), e.stopPropagation();
    else if (e.key === 'Escape' && pick >= 0) (pick = -1), e.preventDefault(), e.stopPropagation();
  }

  /* ---------- actions ---------- */
  function playDraft() {
    preview = code;
    previewBase = showBase ? base : '';
    toggle(PLAY_KEY, code, cycleCount);
  }

  function save() {
    if (!code.trim()) {
      error = 'Add some code first.';
      codeView?.focus();
      return;
    }
    const catName = category.trim() || 'Uncategorised';
    const existing = lib.categories.find((c) => c.name.toLowerCase() === catName.toLowerCase() || c.id === catName);
    let newCategory: Category | null = null;
    if (!existing) {
      let id = slug(catName);
      while (lib.categories.some((c) => c.id === id)) id += '-2';
      newCategory = { id, name: catName, blurb: '', order: Math.max(-1, ...lib.categories.map((c) => c.order)) + 1, updated: now() };
    }
    if (engine.playing === PLAY_KEY) stop();
    onsave(
      {
        ...start,
        name: name.trim() || 'Untitled',
        category: existing?.id ?? newCategory!.id,
        tags,
        cycles: cycleCount,
        description: description.trim(),
        code: code.replace(/\s+$/, ''),
        base: showBase && base.trim() ? base.replace(/\s+$/, '') : null,
      },
      newCategory,
    );
  }

  function close() {
    if (dirty && !confirm('Discard your changes?')) return;
    if (engine.playing === PLAY_KEY) stop();
    onclose();
  }

  function keys(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      save();
    } else if (mod && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      playDraft();
    } else if (mod && e.key === '.') {
      e.preventDefault();
      stop();
    } else if (e.key === 'Escape') {
      const inCode = (e.target as HTMLElement).closest?.('.cm-editor');
      if (inCode && lib.settings.vim) {
        const v = codeView?.dom.contains(e.target as Node) ? codeView : baseView;
        if (vimWantsEscape(v)) return; // let vim leave insert/visual mode
      }
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  $effect(() => {
    if (!isNew || start.code) nameInput?.focus();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onkeydowncapture={keys} onmousedown={(e) => e.target === e.currentTarget && close()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title">
    <div class="row head">
      <h2 id="editor-title">{isNew ? 'New snippet' : 'Edit snippet'}</h2>
      <label class="inline"><input type="checkbox" checked={lib.settings.vim} onchange={(e) => saveSettings({ vim: e.currentTarget.checked })} /> Vim keys in code</label>
    </div>

    <div class="grid3">
      <label>Name <input type="text" bind:value={name} bind:this={nameInput} placeholder="Boom bap with swing" /></label>
      <label>Category
        <input type="text" bind:value={category} list="category-list" placeholder="Pick or type a new one" />
        <datalist id="category-list">{#each sortedCategories() as c}<option value={c.name}></option>{/each}</datalist>
      </label>
      <label>Cycles <input type="number" min="1" max="16" bind:value={cycles} /></label>
    </div>

    <div class="tags">
      <label>Tags, comma separated
        <input type="text" bind:value={tagsText} onkeydown={tagKeys} onfocus={() => (tagFocus = true)} onblur={() => setTimeout(() => (tagFocus = false), 150)}
          placeholder="drums, swing" autocomplete="off" role="combobox" aria-expanded={tagFocus && suggestions.length > 0} aria-controls="tag-suggestions" />
      </label>
      {#if tagFocus && suggestions.length}
        <ul id="tag-suggestions" class="suggest" role="listbox">
          {#each suggestions as t, i}
            <li role="option" aria-selected={i === pick}><button type="button" tabindex="-1" class:active={i === pick} onmousedown={(e) => (e.preventDefault(), acceptTag(t))}>#{t}</button></li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="field">
      <span class="lbl">Code <span class="hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> play/stop · paste a <code>// @title</code> header to fill the fields</span></span>
      <CodeEditor bind:value={code} bind:view={codeView} vimMode={lib.settings.vim} label="Code" autofocus={isNew && !start.code} />
    </div>

    <div class="field">
      <div class="row between">
        <span class="lbl">Preview</span>
        <button type="button" class="primary" onclick={playDraft}>{engine.playing === PLAY_KEY ? 'Stop' : 'Play'}</button>
      </div>
      <Viz code={preview} base={previewBase || null} cycles={cycleCount} playKey={PLAY_KEY} label={name || 'draft'} />
      {#if engine.playing === PLAY_KEY && engine.playError}<p class="err">{engine.playError}</p>{/if}
    </div>

    <div class="field">
      <label class="inline"><input type="checkbox" bind:checked={showBase} /> Compare against a base pattern (hits it lacks are highlighted, hits it has that the code drops are dashed)</label>
      {#if showBase}<CodeEditor bind:value={base} bind:view={baseView} vimMode={lib.settings.vim} label="Base code" />{/if}
    </div>

    <label>Description <textarea bind:value={description} rows="3" placeholder="What makes it interesting. Use `backticks` for code."></textarea></label>

    {#if error}<p class="err">{error}</p>{/if}
    <div class="row end">
      <button type="button" onclick={close}>Cancel <kbd>Esc</kbd></button>
      <button type="button" class="primary" onclick={save}>Save <kbd>Ctrl S</kbd></button>
    </div>
  </div>
</div>

<style>
  .head { justify-content: space-between; }
  .grid3 { display: grid; grid-template-columns: 2fr 2fr 0.8fr; gap: 10px; }
  @media (max-width: 600px) { .grid3 { grid-template-columns: 1fr; } }
  .inline { flex-direction: row; align-items: center; gap: 8px; font-size: 0.85rem; }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .lbl { font-size: 0.82rem; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; }
  .hint { font-size: 0.75rem; }
  .between { justify-content: space-between; }
  .tags { position: relative; }
  .suggest { position: absolute; z-index: 2; left: 0; right: 0; top: 100%; margin: 2px 0 0; padding: 6px; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 4px; }
  .suggest button.active { background: var(--ink); color: var(--bg); }
  .err { margin: 0; color: var(--danger); font-family: var(--mono); font-size: 0.8rem; }
</style>
