<script lang="ts">
  import type { NoteEv } from '../lib/events';

  let { events, cycles, width, playhead = -1, label }: { events: NoteEv[]; cycles: number; width: number; playhead?: number; label: string } = $props();

  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const BLACK = [1, 3, 6, 8, 10];
  const L = 46, T = 4, B = 16;
  const pc = (m: number) => ((m % 12) + 12) % 12;

  const W = $derived(Math.max(260, width || 400));
  const lo = $derived(Math.min(...events.map((e) => e.m)) - 1);
  const hi = $derived(Math.max(...events.map((e) => e.m)) + 1);
  const rows = $derived(hi - lo + 1);
  const rh = $derived(Math.max(4, Math.min(10, 150 / rows)));
  const PW = $derived(W - L - 2);
  const PH = $derived(rows * rh);
  const H = $derived(T + PH + B);
  const cw = $derived(PW / cycles);
  const y = (m: number) => T + (hi - m) * rh;
  const pitches = $derived(Array.from({ length: rows }, (_, i) => lo + i));
  const labels = $derived.by(() => {
    const ls = pitches.filter((m) => pc(m) === 0);
    return ls.length ? ls : [lo + 1];
  });
  const quarters = $derived(Array.from({ length: cycles * 4 + 1 }, (_, q) => q));
</script>

<svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label="Piano roll of {label} over {cycles} cycles">
  <rect x={L} y={T} width={PW} height={PH} fill="var(--roll)" />
  {#each pitches as m}
    {#if BLACK.includes(pc(m))}<rect x={L} y={y(m)} width={PW} height={rh} fill="var(--roll-dark-key)" />{/if}
  {/each}
  {#each labels as m}
    <line x1={L} x2={L + PW} y1={y(m) + rh} y2={y(m) + rh} stroke="var(--line)" stroke-width="1" />
    <text x={L - 5} y={y(m) + rh / 2 + 3} text-anchor="end" font-family="var(--mono)" font-size="9.5" fill="var(--muted)">{NAMES[pc(m)]}{Math.floor(m / 12) - 1}</text>
  {/each}
  {#each quarters as q}
    {@const x = L + (q / 4) * cw}
    <line x1={x} x2={x} y1={T} y2={T + PH} stroke={q % 4 === 0 ? 'var(--line-strong)' : 'var(--line)'} stroke-width={q % 4 === 0 ? 1 : 0.5} />
    {#if q % 4 === 0 && q < cycles * 4}
      <text x={x + 3} y={H - 4} font-family="var(--mono)" font-size="9.5" fill="var(--muted)">{q / 4 + 1}</text>
    {/if}
  {/each}
  {#each events as e}
    {@const x = L + e.t * cw + 0.75}
    {@const w = Math.max(2, Math.min(e.d * cw, L + PW - x) - 1.5)}
    {#if e.layer === 2}
      <rect {x} y={y(e.m) + 0.75} width={w} height={rh - 1.5} rx="1.5" fill="none" stroke="var(--ghost)" stroke-width="1" stroke-dasharray="3 2" />
    {:else}
      <rect {x} y={y(e.m) + 0.75} width={w} height={rh - 1.5} rx="1.5" fill={e.layer ? 'var(--layer)' : 'var(--note)'} />
    {/if}
  {/each}
  {#if playhead >= 0}
    <line x1={L + playhead * PW} x2={L + playhead * PW} y1={T} y2={T + PH} stroke="var(--ink)" stroke-width="1.5" />
  {/if}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; }
</style>
