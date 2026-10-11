/* Turning queried haps into what the grids draw. Pure, so it can be tested without the engine. */

export interface Hit {
  t: number; // start, in cycles
  d: number; // duration, in cycles
}
export interface DrumEv extends Hit {
  s: string;
  gain: number;
  layer: Layer;
}
export interface NoteEv extends Hit {
  m: number; // midi
  layer: Layer;
}
/** 0 = in both pattern and base, 1 = only in pattern (added/moved), 2 = only in base (removed). */
export type Layer = 0 | 1 | 2;

export interface Events {
  drums: DrumEv[];
  notes: NoteEv[];
}

export interface RawHap {
  t: number;
  d: number;
  value: unknown;
}

// Sounds that are pitched instruments rather than drum samples.
const PITCHED = /^(sine|square|triangle|tri|sawtooth|saw|sqr|supersaw|pulse|zzfx|z_\w+|piano|gm_\w+|wt_\w+|folkharp|organ_\w+|\w*(synth|bass|lead|pad|strings|harp|marimba|vibraphone|glockenspiel|xylophone))$/i;

const NAMES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function toMidi(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const m = v.trim().match(/^([a-gA-G])([#bsf]*)(-?\d+)?$/);
  if (!m) return parseFloat(v);
  let pc = NAMES[m[1].toLowerCase()];
  for (const ch of m[2]) pc += ch === '#' || ch === 's' ? 1 : -1;
  return ((m[3] !== undefined ? +m[3] : 3) + 1) * 12 + pc;
}

export function hapsToEvents(haps: RawHap[]): Events {
  const drums: DrumEv[] = [];
  const notes: NoteEv[] = [];
  for (const { t, d, value } of haps) {
    const v: Record<string, unknown> =
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : typeof value === 'number' ? { n: value } : { s: String(value) };
    const s = typeof v.s === 'string' ? v.s : undefined;
    const gain = typeof v.gain === 'number' ? v.gain : typeof v.velocity === 'number' ? v.velocity : 1;
    const pitched = v.note !== undefined || v.freq !== undefined || (v.n !== undefined && (s === undefined || PITCHED.test(s)));
    if (pitched) {
      const raw = v.note ?? v.n;
      const m = raw !== undefined ? toMidi(raw) : 69 + 12 * Math.log2(Number(v.freq) / 440);
      if (Number.isFinite(m)) notes.push({ t, d, m: Math.round(m), layer: 0 });
    } else if (s !== undefined) {
      const name = v.n !== undefined ? `${s}:${v.n}` : s;
      drums.push({ t, d, s: name, gain, layer: 0 });
    }
  }
  return { drums, notes };
}

const tkey = (t: number) => Math.round(t * 960);

function classifyList<T extends Hit & { layer: Layer }>(ev: T[], base: T[] | null, key: (e: T) => string): T[] {
  if (!base) return ev;
  const inBase = new Set(base.map(key));
  const inPat = new Set(ev.map(key));
  return [
    ...base.filter((e) => !inPat.has(key(e))).map((e) => ({ ...e, layer: 2 as Layer })),
    ...ev.map((e) => ({ ...e, layer: (inBase.has(key(e)) ? 0 : 1) as Layer })),
  ];
}

/** Mark hits as shared, added, or removed relative to a base pattern. */
export function classify(ev: Events, base: Events | null): Events {
  return {
    drums: classifyList(ev.drums, base?.drums ?? null, (e) => tkey(e.t) + ':' + e.s),
    notes: classifyList(ev.notes, base?.notes ?? null, (e) => tkey(e.t) + ':' + e.m),
  };
}

/** No two drum hits start together (removed hits don't count). */
export function isLinear(drums: DrumEv[]): boolean {
  const seen = new Set<number>();
  for (const e of drums) {
    if (e.layer === 2) continue;
    const k = tkey(e.t);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

/** Whether the code uses randomness, so a drawn grid is only one possible outcome. */
export function isRandom(code: string): boolean {
  const strings = code.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? [];
  if (strings.some((s) => /[?|]/.test(s))) return true;
  const bare = code.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
  return /\b(rand|irand|perlin|brand|brandBy|choose\w*|wchoose\w*|degrade\w*|undegrade\w*|sometimes\w*|someCycles\w*|often|rarely|almostNever|almostAlways|shuffle|scramble|randcat|wrandcat|randL|chooseCycles)\b/.test(bare);
}

// Row order for drum grids, top to bottom; unknown sounds go first.
const ORDER = ['cr', 'rd', 'oh', 'hh', 'cb', 'cp', 'rim', 'sd', 'ht', 'mt', 'lt', 'bd'];

export function drumRows(drums: DrumEv[]): string[] {
  const used = [...new Set(drums.map((e) => e.s))];
  const rank = (s: string) => {
    const i = ORDER.indexOf(s.split(':')[0]);
    return i < 0 ? -1 : i;
  };
  return used.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
