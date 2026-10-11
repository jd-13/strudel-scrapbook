<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Category } from '../lib/types';
  import { now, slug } from '../lib/types';
  import { lib, removeCategory, saveCategories, sortedCategories } from '../lib/library.svelte';

  let { onclose, initial = null }: { onclose: () => void; initial?: string | null } = $props();

  const cats = $derived(sortedCategories());
  const counts = $derived(new Map(cats.map((c) => [c.id, lib.snippets.filter((s) => s.category === c.id).length])));
  let cursor = $state(0);
  let editing = $state<string | null>(null);
  let draftName = $state('');
  let draftBlurb = $state('');
  let message = $state('');
  let root: HTMLDivElement;
  let pendingD = false;

  onMount(() => {
    const i = initial ? cats.findIndex((c) => c.id === initial) : -1;
    if (i >= 0) cursor = i;
    root.focus();
  });

  async function startEdit(c: Category) {
    editing = c.id;
    draftName = c.name;
    draftBlurb = c.blurb;
    await tick();
    root.querySelector<HTMLInputElement>('.edit input')?.focus();
  }

  async function commit() {
    const c = cats.find((x) => x.id === editing);
    if (!c) return;
    const name = draftName.trim() || c.name;
    if (lib.categories.some((x) => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) {
      message = `There is already a category called ${name}.`;
      return;
    }
    await saveCategories([{ ...c, name, blurb: draftBlurb.trim(), updated: now() }]);
    editing = null;
    message = '';
    root.focus();
  }

  async function addCategory() {
    let id = slug('new category');
    while (lib.categories.some((c) => c.id === id)) id += '-2';
    const c: Category = { id, name: 'New category', blurb: '', order: Math.max(-1, ...lib.categories.map((x) => x.order)) + 1, updated: now() };
    await saveCategories([c]);
    cursor = cats.findIndex((x) => x.id === id);
    startEdit(c);
  }

  async function move(dir: -1 | 1) {
    const j = cursor + dir;
    if (j < 0 || j >= cats.length) return;
    // Renumber so orders are distinct, then swap the two.
    const list = cats.map((c, i) => ({ ...c, order: i }));
    [list[cursor].order, list[j].order] = [j, cursor];
    const t = now();
    await saveCategories(list.map((c) => ({ ...c, updated: c.id === list[cursor].id || c.id === list[j].id ? t : c.updated })));
    cursor = j;
  }

  async function remove() {
    const c = cats[cursor];
    if (!c) return;
    if (counts.get(c.id)) {
      message = `${c.name} still has ${counts.get(c.id)} snippets. Move them first.`;
      return;
    }
    await removeCategory(c.id);
    cursor = Math.min(cursor, cats.length - 1);
    message = `Deleted ${c.name}.`;
  }

  function keys(e: KeyboardEvent) {
    if (editing) {
      if (e.key === 'Escape') (e.preventDefault(), (editing = null), root.focus());
      else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement && !e.metaKey && !e.ctrlKey)) (e.preventDefault(), commit());
      return;
    }
    const k = e.key;
    if (k === 'Escape') onclose();
    else if (k === 'j' || k === 'ArrowDown') cursor = Math.min(cats.length - 1, cursor + 1);
    else if (k === 'k' || k === 'ArrowUp') cursor = Math.max(0, cursor - 1);
    else if (k === 'J') move(1);
    else if (k === 'K') move(-1);
    else if (k === 'Enter' || k === 'e') cats[cursor] && startEdit(cats[cursor]);
    else if (k === 'n') addCategory();
    else if (k === 'd') {
      if (pendingD) remove();
      pendingD = !pendingD;
      setTimeout(() => (pendingD = false), 800);
      return;
    } else return;
    e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cat-title" tabindex="-1" bind:this={root} onkeydown={keys}>
    <h2 id="cat-title">Categories</h2>
    <ul class="list">
      {#each cats as c, i (c.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <li class:cursor={i === cursor} onclick={() => (cursor = i)}>
          {#if editing === c.id}
            <div class="edit">
              <label>Name <input type="text" bind:value={draftName} /></label>
              <label>Blurb, shown under the section heading <textarea rows="2" bind:value={draftBlurb}></textarea></label>
              <div class="row end">
                <button type="button" onclick={() => (editing = null)}>Cancel <kbd>Esc</kbd></button>
                <button type="button" class="primary" onclick={commit}>Save <kbd>Enter</kbd></button>
              </div>
            </div>
          {:else}
            <span class="name">{c.name}</span>
            <span class="muted count">{counts.get(c.id)}</span>
            {#if c.blurb}<span class="muted blurb">{c.blurb}</span>{/if}
          {/if}
        </li>
      {/each}
    </ul>
    {#if message}<p class="muted msg">{message}</p>{/if}
    <p class="muted keys">
      <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>J</kbd>/<kbd>K</kbd> reorder · <kbd>e</kbd> rename and edit blurb · <kbd>n</kbd> new · <kbd>dd</kbd> delete (empty only) · <kbd>Esc</kbd> close
    </p>
    <div class="row end"><button type="button" onclick={onclose}>Done</button></div>
  </div>
</div>

<style>
  .dialog:focus { outline: none; }
  .list { list-style: none; margin: 0; padding: 0; max-height: 60vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 4px; background: var(--roll); }
  .list li { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; padding: 8px 12px; border-bottom: 1px solid var(--line); cursor: pointer; }
  .list li:last-child { border-bottom: 0; }
  .list li.cursor { background: var(--roll-alt); box-shadow: inset 3px 0 0 var(--layer); }
  .name { font-weight: 600; }
  .count { font-family: var(--mono); font-size: 0.8rem; }
  .blurb { flex-basis: 100%; font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .edit { flex-basis: 100%; display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
  .keys, .msg { font-size: 0.8rem; margin: 0; }
</style>
