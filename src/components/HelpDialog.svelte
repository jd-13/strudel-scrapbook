<script lang="ts">
  import { onMount } from 'svelte';
  import { lib } from '../lib/library.svelte';
  import { engine } from '../lib/engine.svelte';

  let { onclose, onintro }: { onclose: () => void; onintro: () => void } = $props();
  let root: HTMLDivElement;
  onMount(() => root.focus());

  // Each key list mixes keys and separators ('/' or 'or').
  const GROUPS: [string, [string[], string][]][] = [
    ['Move', [
      [['h', 'j', 'k', 'l'], 'left, down, up, right'],
      [['gg', '/', 'G'], 'first / last snippet'],
      [[']', '/', '['], 'next / previous section'],
      [['/'], 'search (Enter: back to results, Esc: clear)'],
      [['s'], 'cycle sort order'],
    ]],
    ['Selected snippet', [
      [['space'], 'play / stop'],
      [['y'], 'copy code'],
      [['Y'], 'copy with a Strudel @title/@tag header'],
      [['o'], 'open in strudel.cc'],
      [['e', 'or', 'Enter'], 'edit'],
      [['D'], 'duplicate'],
      [['dd'], 'delete (u to undo)'],
    ]],
    ['Library', [
      [['n'], 'new snippet'],
      [['p'], 'new from clipboard (code, strudel.cc link or @title header)'],
      [['C'], 'categories'],
      [['x'], 'export JSON'],
      [['X'], 'import JSON (also drop files on the page)'],
      [['Esc'], 'stop playback'],
      [['?'], 'this help'],
    ]],
    ['In the editor', [
      [['Ctrl Enter'], 'play / stop the draft'],
      [['Ctrl S'], 'save'],
      [['Esc'], 'close (in vim, after leaving insert mode)'],
      [['Tab'], 'next field'],
    ]],
  ];
  const isSep = (k: string, i: number) => i > 0 && (k === 'or' || k === '/');

  const lastExport = $derived(lib.settings.lastExport ? new Date(lib.settings.lastExport).toLocaleString() : 'never');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" tabindex="-1" bind:this={root}
    onkeydown={(e) => (e.key === 'Escape' || e.key === '?') && (e.preventDefault(), onclose())}>
    <h2 id="help-title">Keys</h2>
    <div class="groups">
      {#each GROUPS as [title, keys]}
        <section>
          <h3>{title}</h3>
          <dl>
            {#each keys as [ks, what]}<dt>{#each ks as k, i}{#if isSep(k, i)}<span class="or">{k}</span>{:else}<kbd>{k}</kbd>{/if}{/each}</dt><dd>{what}</dd>{/each}
          </dl>
        </section>
      {/each}
    </div>
    <h3>Storage</h3>
    <ul class="muted facts">
      <li>{lib.snippets.length} snippets in {lib.categories.length} categories, kept in this browser for this address only.</li>
      <li>
        {#if lib.persisted === true}Persistent storage is granted, so the browser won't clear it to free space.
        {:else if lib.persisted === false}Persistent storage was not granted. The browser may clear this data when space runs low, so export regularly. Installing the app usually helps.
        {:else}Persistent storage is requested after your first change.{/if}
      </li>
      <li>Last export: {lastExport}. Exports are the real backup.</li>
      {#if lib.storageError}<li class="err">{lib.storageError}</li>{/if}
      <li>Strudel engine: {engine.status}{engine.error ? ` (${engine.error})` : ''}.</li>
    </ul>
    <p class="muted small">Grids and sound come from <a href="https://strudel.cc" target="_blank" rel="noopener">Strudel</a> (AGPL-3.0-or-later), loaded in your browser. Samples load from Strudel's sample CDN the first time they play.</p>
    <div class="row end">
      <button type="button" onclick={onintro}>Show the introduction</button>
      <button type="button" onclick={onclose}>Close <kbd>Esc</kbd></button>
    </div>
  </div>
</div>

<style>
  .dialog:focus { outline: none; }
  .groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px 24px; }
  h3 { font-size: 0.95rem; margin: 0 0 6px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; margin: 0; font-size: 0.88rem; }
  dt { white-space: nowrap; }
  dd { margin: 0; color: var(--muted); }
  .or { color: var(--muted); font-size: 0.8em; padding: 0 4px; }
  dt kbd + kbd { margin-left: 3px; }
  .facts { margin: 0; padding-left: 18px; font-size: 0.88rem; display: flex; flex-direction: column; gap: 3px; }
  .err { color: var(--danger); }
  .small { font-size: 0.8rem; margin: 0; }
  a { color: var(--ink); }
</style>
