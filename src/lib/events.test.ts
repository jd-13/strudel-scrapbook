import { describe, expect, it } from 'vitest';
import { classify, drumRows, hapsToEvents, isLinear, isRandom, toMidi } from './events';

describe('hapsToEvents', () => {
  it('sends drum sounds to the grid and pitched values to the roll', () => {
    const ev = hapsToEvents([
      { t: 0, d: 0.25, value: { s: 'bd' } },
      { t: 0.25, d: 0.25, value: { s: 'hh', gain: 0.3 } },
      { t: 0, d: 0.5, value: { note: 'c3' } },
      { t: 0.5, d: 0.5, value: { note: 60, s: 'sawtooth' } },
      { t: 0.5, d: 0.5, value: { n: 4, s: 'piano' } },
    ]);
    expect(ev.drums.map((e) => [e.s, e.gain])).toEqual([['bd', 1], ['hh', 0.3]]);
    expect(ev.notes.map((e) => e.m)).toEqual([48, 60, 4]);
  });
  it('treats n on a drum sample as a variant, not a pitch', () => {
    const ev = hapsToEvents([{ t: 0, d: 1, value: { s: 'bd', n: 2 } }]);
    expect(ev.drums[0].s).toBe('bd:2');
    expect(ev.notes).toHaveLength(0);
  });
  it('reads frequencies', () => {
    expect(hapsToEvents([{ t: 0, d: 1, value: { freq: 440 } }]).notes[0].m).toBe(69);
  });
});

describe('toMidi', () => {
  it('parses note names with accidentals and default octave', () => {
    expect(toMidi('c4')).toBe(60);
    expect(toMidi('bb3')).toBe(58);
    expect(toMidi('f#2')).toBe(42);
    expect(toMidi('eb')).toBe(51);
    expect(toMidi(64)).toBe(64);
  });
});

describe('classify', () => {
  it('marks added, shared and removed hits against a base', () => {
    const pat = hapsToEvents([{ t: 0, d: 0.25, value: { s: 'bd' } }, { t: 0.5, d: 0.25, value: { s: 'sd' } }]);
    const base = hapsToEvents([{ t: 0, d: 0.25, value: { s: 'bd' } }, { t: 0.75, d: 0.25, value: { s: 'sd' } }]);
    const out = classify(pat, base);
    expect(out.drums.map((e) => [e.t, e.s, e.layer])).toEqual([[0.75, 'sd', 2], [0, 'bd', 0], [0.5, 'sd', 1]]);
  });
});

describe('isLinear / drumRows', () => {
  it('detects overlapping hits, ignoring removed ones', () => {
    const ev = hapsToEvents([{ t: 0, d: 0.25, value: { s: 'bd' } }, { t: 0, d: 0.25, value: { s: 'hh' } }]).drums;
    expect(isLinear(ev)).toBe(false);
    expect(isLinear([ev[0], { ...ev[1], layer: 2 }])).toBe(true);
  });
  it('orders rows cymbals on top, kick at the bottom, unknowns first', () => {
    const ev = hapsToEvents(['bd', 'hh', 'sd', 'cowbell2', 'oh'].map((s, i) => ({ t: i / 8, d: 0.1, value: { s } }))).drums;
    expect(drumRows(ev)).toEqual(['cowbell2', 'oh', 'hh', 'sd', 'bd']);
  });
});

describe('isRandom', () => {
  it('spots randomness in mini-notation and functions', () => {
    expect(isRandom('s("hh*16?")')).toBe(true);
    expect(isRandom('n("0 [2|4]")')).toBe(true);
    expect(isRandom('n(irand(8).segment(8))')).toBe(true);
    expect(isRandom('n("0 2").degradeBy(0.4)')).toBe(true);
    expect(isRandom('s("bd*4").sometimes(x => x.fast(2))')).toBe(true);
  });
  it('ignores deterministic code', () => {
    expect(isRandom('s("bd ~ [~ bd] ~").swingBy(1/3, 4)')).toBe(false);
    expect(isRandom('n("0 1 2").scale("C:minor:pentatonic")')).toBe(false);
  });
});
