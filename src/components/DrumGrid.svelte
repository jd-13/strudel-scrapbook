<script lang="ts">
  import { drumRows, type DrumEv } from '../lib/events';

  let { events, cycles, width, playhead = -1, label }: { events: DrumEv[]; cycles: number; width: number; playhead?: number; label: string } = $props();

  const rh = 16, L = 46, T = 4, B = 16;
  const W = $derived(Math.max(260, width || 400));
  const rows = $derived(drumRows(events));
  const PW = $derived(W - L - 2);
  const PH = $derived(rows.length * rh);
  const H = $derived(T + PH + B);
  const cw = $derived(PW / cycles);
  const beats = $derived(Array.from({ length: cycles * 4 + 1 }, (_, b) => b));
  const rowIndex = $derived(new Map(rows.map((r, i) => [r, i])));

  function rect(e: DrumEv) {
    const x = L + e.t * cw + 0.75;
    const w = Math.max(2, Math.min(e.d * cw, cw / 16, L + PW - x) - 1.5);
    return { x, y: T + rowIndex.get(e.s)! * rh + 2.5, w, h: rh - 5 };
  }
  const opacity = (g: number) => Math.max(0.3, Math.min(1, 0.1 + 0.9 * g)).toFixed(2);
</script>

<svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label="Drum grid of {label} over {cycles} cycles">
  <rect x={L} y={T} width={PW} height={PH} fill="var(--roll)" />
  {#each rows as name, r}
    {#if r % 2}<rect x={L} y={T + r * rh} width={PW} height={rh} fill="var(--roll-alt)" />{/if}
    <text x={L - 6} y={T + r * rh + rh / 2 + 3.5} text-anchor="end" font-family="var(--mono)" font-size="10.5" fill="var(--muted)">{name}</text>
  {/each}
  {#each beats as b}
    {@const x = L + (b / 4) * cw}
    <line x1={x} x2={x} y1={T} y2={T + PH} stroke={b % 4 === 0 ? 'var(--line-strong)' : 'var(--line)'} stroke-width="1" />
    {#if b % 4 === 0 && b < cycles * 4}
      <text x={x + 3} y={H - 4} font-family="var(--mono)" font-size="9.5" fill="var(--muted)">{b / 4 + 1}</text>
    {/if}
  {/each}
  {#each events as e}
    {@const r = rect(e)}
    {#if e.layer === 2}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="1.5" fill="none" stroke="var(--ghost)" stroke-width="1" stroke-dasharray="3 2" />
    {:else}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="1.5" fill={e.layer ? 'var(--layer)' : 'var(--note)'} fill-opacity={opacity(e.gain)} />
    {/if}
  {/each}
  {#if playhead >= 0}
    <line x1={L + playhead * PW} x2={L + playhead * PW} y1={T} y2={T + PH} stroke="var(--ink)" stroke-width="1.5" />
  {/if}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; }
</style>
