<script lang="ts">
  import type { CardAction, Snippet } from '../lib/types';
  import type { Events } from '../lib/events';
  import { isLinear, isRandom } from '../lib/events';
  import { highlight, renderDescription } from '../lib/text';
  import { strudelLink } from '../lib/strudelUrl';
  import { engine } from '../lib/engine.svelte';
  import Viz from './Viz.svelte';

  let {
    snippet,
    categoryName,
    selected,
    showCategory = false,
    onselect,
    onaction,
  }: {
    snippet: Snippet;
    categoryName: string;
    selected: boolean;
    showCategory?: boolean;
    onselect: () => void;
    onaction: (a: CardAction) => void;
  } = $props();

  let seen = $state(false);
  let events = $state<Events | null>(null);
  const playing = $derived(engine.playing === snippet.id);

  const tagline = $derived.by(() => {
    const t = [snippet.cycles + (snippet.cycles === 1 ? ' cycle' : ' cycles')];
    if (snippet.tags.includes('linear') && events?.drums.length && isLinear(events.drums)) t.push('no overlaps');
    if (isRandom(snippet.code)) t.push('sketch');
    return t.join(' · ');
  });

  function inview(node: HTMLElement) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen = true;
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article class="card" class:selected data-id={snippet.id} use:inview onclick={onselect} aria-current={selected ? 'true' : undefined}>
  <div class="card-top">
    <h3>{snippet.name || 'Untitled'}</h3>
    <span class="tag">{tagline}</span>
  </div>
  {#if showCategory || snippet.tags.length}
    <ul class="chips">
      {#if showCategory}<li class="cat">{categoryName}</li>{/if}
      {#each snippet.tags as t}<li>#{t}</li>{/each}
    </ul>
  {/if}
  <pre><code>{@html highlight(snippet.code)}</code></pre>
  {#if seen}
    <Viz code={snippet.code} base={snippet.base} cycles={snippet.cycles} playKey={snippet.id} label={snippet.name} bind:events />
  {:else}
    <div class="placeholder" aria-hidden="true"></div>
  {/if}
  {#if snippet.description}<p class="why">{@html renderDescription(snippet.description)}</p>{/if}
  {#if playing && engine.playError}<p class="err">{engine.playError}</p>{/if}
  <div class="actions">
    <button class="play primary" type="button" aria-pressed={playing} onclick={(e) => (e.stopPropagation(), onaction('play'))}>
      {playing ? 'Stop' : 'Play'} <kbd>space</kbd>
    </button>
    <button type="button" onclick={(e) => (e.stopPropagation(), onaction('copy'))}>Copy <kbd>y</kbd></button>
    <button type="button" onclick={(e) => (e.stopPropagation(), onaction('copyHeader'))} title="Copy with Strudel @title/@tag/@details header">
      Copy + header <kbd>Y</kbd>
    </button>
    <a class="btn" target="_blank" rel="noopener" href={strudelLink(snippet.code)} onclick={(e) => e.stopPropagation()}>Strudel <kbd>o</kbd></a>
    <button type="button" onclick={(e) => (e.stopPropagation(), onaction('edit'))}>Edit <kbd>e</kbd></button>
  </div>
</article>

<style>
  .card {
    min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 16px;
    display: flex; flex-direction: column; gap: 12px; scroll-margin: 110px 0 24px;
  }
  .card.selected { border-color: var(--layer); box-shadow: 0 0 0 2px var(--layer); }
  .card-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  h3 { font-family: var(--body); font-weight: 600; font-size: 1.02rem; margin: 0; }
  .tag { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); text-align: right; white-space: nowrap; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: -6px 0 0; padding: 0; list-style: none; font-family: var(--mono); font-size: 0.72rem; color: var(--muted); }
  .chips .cat { color: var(--ink); }
  .placeholder { height: 72px; border-radius: 4px; background: var(--roll); border: 1px dashed var(--line); }
  .why { margin: 0; font-size: 0.9rem; color: var(--muted); }
  .err { margin: 0; font-family: var(--mono); font-size: 0.78rem; color: var(--danger); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: auto; }
  .play { min-width: 68px; }
  .card:not(.selected) .actions kbd { visibility: hidden; }
  @media (max-width: 600px) { .actions kbd { display: none; } }
</style>
