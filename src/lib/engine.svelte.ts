/* The Strudel engine, loaded on demand. Grids come from evaluating the code ourselves
   and querying the pattern (so drawing never touches what's playing); playback goes
   through the real REPL scheduler and superdough. */

import type { RawHap } from './events';

// @strudel/web ships no types.
type Strudel = any;

const CDN = 'https://strudel.b-cdn.net';
const DEFAULT_CPS = 0.5; // 1 cycle = 2 s, Strudel's default

let mod: Strudel = null;
let repl: Strudel = null;
let ready: Promise<void> | null = null;
let sounds: Promise<unknown> | null = null;
let audio: Promise<unknown> | null = null;

export const engine = $state({
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  error: '',
  /** Key of what's playing (a snippet id, or 'editor'). */
  playing: null as string | null,
  playingCycles: 1,
  playError: '',
});

export function init(): Promise<void> {
  ready ??= (async () => {
    engine.status = 'loading';
    try {
      mod = await import('@strudel/web');
      repl = await mod.initStrudel({
        onEvalError: (err: Error) => {
          engine.playError = err?.message ?? String(err);
        },
      });
      engine.status = 'ready';
    } catch (e) {
      engine.status = 'failed';
      engine.error = e instanceof Error ? e.message : String(e);
      throw e;
    }
  })();
  return ready;
}

/** Sample maps used by strudel.cc's default sounds (bd, sd, hh…, .bank(), piano). Small JSON; samples load on use. */
function loadSounds() {
  sounds ??= Promise.all([
    mod.samples(`${CDN}/uzu-drumkit.json`, `${CDN}/uzu-drumkit/`, { prebake: true }),
    mod.samples(`${CDN}/tidal-drum-machines.json`, `${CDN}/tidal-drum-machines/machines/`, { prebake: true }),
    mod.samples(`${CDN}/piano.json`, `${CDN}/piano/`, { prebake: true }),
  ]).then(() => mod.aliasBank(`${CDN}/tidal-drum-machines-alias.json`));
  return sounds;
}

/* ---------- querying ---------- */

const cache = new Map<string, Promise<RawHap[]>>();
// Things a snippet may call that would affect playback; no-ops while querying.
const SIDE_EFFECTS = ['setcps', 'setCps', 'setcpm', 'setCpm', 'hush', 'samples', 'all', 'each'];

async function evaluateQuietly(code: string): Promise<unknown> {
  const proto = mod.Pattern.prototype;
  const g = globalThis as Record<string, unknown>;
  const savedP = proto.p;
  const saved = SIDE_EFFECTS.map((k) => g[k]);
  const labelled: unknown[] = [];
  proto.p = function (id: unknown) {
    if (typeof id === 'string' && (id.startsWith('_') || id.endsWith('_'))) return mod.silence;
    labelled.push(this);
    return this;
  };
  SIDE_EFFECTS.forEach((k) => (g[k] = () => mod.silence));
  try {
    const { output } = mod.transpiler(code, { emitMiniLocations: false, emitWidgets: false, addReturn: true });
    const pat = await Function(`"use strict";return (async()=>{${output}})()`)();
    return labelled.length ? mod.stack(...labelled) : pat;
  } finally {
    proto.p = savedP;
    SIDE_EFFECTS.forEach((k, i) => (g[k] = saved[i]));
  }
}

async function runQuery(code: string, cycles: number): Promise<RawHap[]> {
  await init();
  const pat = await evaluateQuietly(code);
  if (!mod.isPattern(pat)) throw new Error("The code didn't produce a pattern.");
  const out: RawHap[] = [];
  for (const h of (pat as any).queryArc(0, cycles)) {
    if (!h.whole || (typeof h.hasOnset === 'function' && !h.hasOnset())) continue;
    const t = +h.whole.begin;
    const d = +h.whole.end - t;
    if (t < -1e-9 || t >= cycles - 1e-9 || !Number.isFinite(d)) continue;
    out.push({ t, d, value: h.value });
  }
  return out;
}

/** Haps with onsets in [0, cycles). Cached per code + cycles. */
export function query(code: string, cycles: number): Promise<RawHap[]> {
  const key = cycles + '\n' + code;
  let p = cache.get(key);
  if (!p) {
    p = runQuery(code, cycles);
    cache.set(key, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/* ---------- playback ---------- */

export async function play(key: string, code: string, cycles: number) {
  engine.playError = '';
  engine.playing = key;
  engine.playingCycles = cycles;
  try {
    await init();
    const ctx = mod.getAudioContext();
    await ctx.resume(); // keyboard presses count as a user gesture; superdough only listens for clicks
    audio ??= mod.initAudio();
    await Promise.all([audio, loadSounds()]);
    if (engine.playing !== key) return; // stopped or replaced while loading
    repl.stop();
    repl.setCps(DEFAULT_CPS);
    const pat = await repl.evaluate(code, true);
    if (!pat && engine.playing === key) {
      engine.playing = null;
      engine.playError ||= 'Could not play this code.';
    }
  } catch (e) {
    engine.playing = null;
    engine.playError = e instanceof Error ? e.message : String(e);
  }
}

export function stop() {
  engine.playing = null;
  repl?.stop();
}

export function toggle(key: string, code: string, cycles: number) {
  if (engine.playing === key) stop();
  else play(key, code, cycles);
}

/** Current position within the loop, 0..1, for the playhead. */
export function position(): number {
  if (!repl || !engine.playing) return -1;
  const c = repl.scheduler.now();
  if (!(c > 0)) return -1;
  return (c % engine.playingCycles) / engine.playingCycles;
}
