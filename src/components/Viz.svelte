<script lang="ts">
  import { engine, init, position, query } from '../lib/engine.svelte';
  import { classify, hapsToEvents, type Events } from '../lib/events';
  import DrumGrid from './DrumGrid.svelte';
  import PianoRoll from './PianoRoll.svelte';

  let {
    code,
    base = null,
    cycles,
    playKey,
    label,
    events = $bindable(null),
  }: { code: string; base?: string | null; cycles: number; playKey: string; label: string; events?: Events | null } = $props();

  let error = $state('');
  let width = $state(0);
  let playhead = $state(-1);

  $effect(() => {
    const c = code, b = base, n = cycles;
    let cancelled = false;
    error = '';
    if (!c.trim()) {
      events = null;
      return;
    }
    (async () => {
      try {
        await init();
        const ev = hapsToEvents(await query(c, n));
        let baseEv: Events | null = null;
        if (b && b.trim()) {
          try {
            baseEv = hapsToEvents(await query(b, n));
          } catch {
            baseEv = null; // a broken base just means no comparison
          }
        }
        if (!cancelled) events = classify(ev, baseEv);
      } catch (e) {
        if (!cancelled) {
          events = null;
          error = e instanceof Error ? e.message : String(e);
        }
      }
    })();
    return () => (cancelled = true);
  });

  $effect(() => {
    if (engine.playing !== playKey) {
      playhead = -1;
      return;
    }
    let raf = 0;
    const tick = () => {
      playhead = position();
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });

  const empty = $derived(events && !events.drums.length && !events.notes.length);
</script>

<div class="viz" bind:clientWidth={width}>
  {#if error}
    <p class="error">{error}</p>
  {:else if engine.status === 'failed'}
    <p class="note">The Strudel engine could not load: {engine.error}</p>
  {:else if !events}
    <div class="placeholder" aria-hidden="true"></div>
  {:else if empty}
    <p class="note">No hits in the first {cycles} {cycles === 1 ? 'cycle' : 'cycles'}.</p>
  {:else}
    {#if events.drums.length}<DrumGrid events={events.drums} {cycles} {width} {playhead} {label} />{/if}
    {#if events.notes.length}<PianoRoll events={events.notes} {cycles} {width} {playhead} {label} />{/if}
  {/if}
</div>

<style>
  .viz { width: 100%; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .placeholder { height: 72px; border-radius: 4px; background: var(--roll); border: 1px dashed var(--line); }
  .error { margin: 0; font-family: var(--mono); font-size: 0.78rem; color: var(--danger); white-space: pre-wrap; }
  .note { margin: 0; font-size: 0.85rem; color: var(--muted); }
</style>
