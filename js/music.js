/* ═══ THE COMPOSING ROOM — a generative jazz house band for Great Work ════════
 *
 * No samples, no audio files. Everything below is synthesised on the fly with
 * the Web Audio API, and what gets played is decided bar by bar from a small
 * body of music theory: functional harmony in a chosen key, rootless piano
 * voicings chosen by voice-leading distance, walking bass lines built from
 * chord tones and approach notes, and a right hand that thinks in phrases —
 * anchor tones on the strong beats, bebop line-filling between them, motifs
 * remembered and sequenced through the next chord.
 *
 * Five moods, each a different arrangement of the same small band:
 *
 *   workshop     medium swing, piano trio, brushes on the ride       (default)
 *   calm         a ballad, half-note bass, brushes, vibraphone, lush voicings
 *   market       jaunty two-feel, stride left hand, a clarinet takes the tune
 *   blackmarket  slow minor, line clichés, tritone subs, a low drone under it
 *   editor       fast, a bass ostinato that refuses to move while the harmony
 *                slides above it, stabs in a three-against-four cross rhythm
 *
 * Usage:
 *   Music.start('workshop')      // first call needs a user gesture (browser rule)
 *   Music.setMood('editor')      // changes on the next bar line, through a ii–V pivot
 *   Music.cue('good')            // an off-grid flourish, in the current key
 *   Music.stop()
 *
 * The scheduler follows the "two clocks" pattern: a coarse JS timer looks a
 * little way ahead and hands whole bars to the sample-accurate audio clock.
 * Nothing here needs the game; the game only needs the four calls above.
 */
(function () {
'use strict';

/* ─── Chance ─────────────────────────────────────────────────────────────────── */
let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
function rand() {                       // mulberry32: small, seedable, good enough
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = p => rand() < p;
const pick = arr => arr[Math.floor(rand() * arr.length)];
function weighted(pairs) {              // [[value, weight], ...]
  let total = 0;
  for (const p of pairs) total += p[1];
  let r = rand() * total;
  for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
  return pairs[pairs.length - 1][0];
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const mod12 = n => ((n % 12) + 12) % 12;

/* ─── Names ──────────────────────────────────────────────────────────────────── */
const FLATS  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const SHARP_MAJOR = [7, 2, 9, 4, 11];    // G D A E B
const SHARP_MINOR = [4, 11, 6, 1, 8];    // e b f# c# g#
function noteName(pc, key, minor) {
  const sharp = (minor ? SHARP_MINOR : SHARP_MAJOR).includes(key);
  return (sharp ? SHARPS : FLATS)[mod12(pc)];
}

/* ─── Chord qualities ────────────────────────────────────────────────────────────
 * scale:    the chord-scale the right hand improvises on (semitones from root)
 * tones:    what counts as a "landing" note on a strong beat
 * voicings: rootless left-hand shapes, the Bill Evans A and B forms — the bass
 *           has the root, so the piano spends its four fingers on colour
 */
const QUAL = {
  maj7:    { sym: 'Δ7',   scale: [0, 2, 4, 5, 7, 9, 11],    tones: [0, 4, 7, 11, 14],   voicings: [[4, 7, 11, 14], [11, 14, 16, 19]] },
  maj6:    { sym: '6',    scale: [0, 2, 4, 5, 7, 9, 11],    tones: [0, 4, 7, 9, 14],    voicings: [[4, 7, 9, 14],  [9, 14, 16, 19]] },
  min7:    { sym: 'm7',   scale: [0, 2, 3, 5, 7, 9, 10],    tones: [0, 3, 7, 10, 14],   voicings: [[3, 7, 10, 14], [10, 14, 15, 19]] },
  min6:    { sym: 'm6',   scale: [0, 2, 3, 5, 7, 9, 11],    tones: [0, 3, 7, 9, 14],    voicings: [[3, 7, 9, 14],  [9, 14, 15, 19]] },
  minMaj7: { sym: 'mΔ7',  scale: [0, 2, 3, 5, 7, 9, 11],    tones: [0, 3, 7, 11, 14],   voicings: [[3, 7, 11, 14], [11, 14, 15, 19]] },
  dom7:    { sym: '7',    scale: [0, 2, 4, 5, 7, 9, 10],    tones: [0, 4, 7, 10, 14],   voicings: [[4, 9, 10, 14], [10, 14, 16, 21]] },
  dom7sus: { sym: '7sus', scale: [0, 2, 4, 5, 7, 9, 10],    tones: [0, 5, 7, 10, 14],   voicings: [[5, 10, 14, 17], [10, 14, 17, 21]] },
  dom7b9:  { sym: '7♭9',  scale: [0, 1, 3, 4, 6, 7, 9, 10], tones: [0, 4, 7, 10, 13],   voicings: [[4, 7, 10, 13], [10, 13, 16, 19]] },
  dom7alt: { sym: '7alt', scale: [0, 1, 3, 4, 6, 8, 10],    tones: [0, 4, 10, 15, 20],  voicings: [[4, 8, 10, 15], [10, 15, 16, 20]] },
  min7b5:  { sym: 'ø7',   scale: [0, 2, 3, 5, 6, 8, 10],    tones: [0, 3, 6, 10],       voicings: [[3, 6, 10, 14], [10, 14, 15, 18]] },
  dim7:    { sym: '°7',   scale: [0, 2, 3, 5, 6, 8, 9, 11], tones: [0, 3, 6, 9],        voicings: [[3, 6, 9, 14],  [9, 14, 15, 18]] },
};
const isMinorQ = q => q.startsWith('min');
const isDomQ   = q => q.startsWith('dom');

function chordName(ch, key, minor) { return noteName(ch.root, key, minor) + QUAL[ch.q].sym; }
function chordScale(ch) { return QUAL[ch.q].scale.map(i => mod12(ch.root + i)); }
function chordTones(ch) { return QUAL[ch.q].tones.map(i => mod12(ch.root + i)); }

/* pitch-class → the midi note of that class nearest a reference note */
function nearest(pc, ref) {
  let m = ref + mod12(pc - ref);
  if (m - ref > 6) m -= 12;
  return m;
}
function inRange(m, lo, hi) {
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}
/* the nearest scale tone to m (ties resolve downward, the jazz default) */
function snapToScale(m, scalePcs) {
  for (let d = 0; d < 7; d++) {
    if (scalePcs.includes(mod12(m - d))) return m - d;
    if (scalePcs.includes(mod12(m + d))) return m + d;
  }
  return m;
}
/* the scale tones strictly between a and b, walking from a toward b */
function scaleWalk(a, b, scalePcs) {
  const out = [];
  const step = b > a ? 1 : -1;
  for (let m = a + step; m !== b; m += step) if (scalePcs.includes(mod12(m))) out.push(m);
  return out;
}

/* ─── Voicing by voice leading ───────────────────────────────────────────────────
 * Every A/B shape in every octave whose bottom note sits inside [lo, hi] is a
 * candidate; the winner is the one whose four notes move least from the last
 * chord's four notes. That single rule is most of what makes a pianist sound
 * like a pianist rather than a chord chart.
 */
function voice(ch, prev, lo, hi, lush) {
  const cands = [];
  for (const tpl of QUAL[ch.q].voicings) {
    for (let oct = 24; oct <= 84; oct += 12) {
      const notes = tpl.map(i => ch.root + i + oct).sort((a, b) => a - b);
      if (notes[0] < lo || notes[0] > hi) continue;
      let cost = 0;
      if (prev) for (let i = 0; i < notes.length; i++) cost += Math.abs(notes[i] - (prev[i] ?? prev[prev.length - 1]));
      else cost = Math.abs(notes[0] - (lo + hi) / 2);
      cands.push({ notes, cost });
    }
  }
  cands.sort((a, b) => a.cost - b.cost);
  let v = (cands.length > 1 && chance(0.15)) ? cands[1].notes : cands[0].notes;
  if (lush) {                            // a fifth voice: the next scale tone at least a minor third up
    const sc = chordScale(ch);
    let m = v[v.length - 1] + 3;
    while (!sc.includes(mod12(m))) m++;
    v = [...v, m];
  }
  return v;
}

/* ─── Progressions ───────────────────────────────────────────────────────────────
 * Templates are written as semitone offsets from the tonic plus a quality, bars
 * split by '|', two chords in a bar split by a space. '0maj7 | 9min7' is I – vi.
 */
function parseProg(str, key) {
  return str.split('|').map(bar => bar.trim().split(/\s+/).filter(Boolean).map(tok => {
    const m = /^(\d+)([A-Za-z0-9]+)$/.exec(tok);
    if (!m || !QUAL[m[2]]) throw new Error('bad chord token ' + tok);
    return { root: mod12(key + Number(m[1])), q: m[2] };
  }));
}

/* the ii–V (or iiø–V7alt) that leads into a key: used as the turnaround into a
 * new key and as the pivot bar when the mood changes under the player */
function pivotChords(key, minor) {
  return minor
    ? [{ root: mod12(key + 2), q: 'min7b5' }, { root: mod12(key + 7), q: 'dom7alt' }]
    : [{ root: mod12(key + 2), q: 'min7' },   { root: mod12(key + 7), q: 'dom7' }];
}

/* Substitutions, applied fresh every chorus so the same chart never plays the
 * same way twice: tritone subs on dominants that resolve down a fifth, ♭9 or
 * altered colour on dominants headed for minor chords, the minor-iv sigh on a
 * IV going home, and secondary dominants tucked into the back half of a bar. */
function decorate(bars, subs) {
  const out = bars.map(b => b.map(c => ({ ...c })));
  const flat = [];
  out.forEach(bar => bar.forEach(c => flat.push(c)));
  for (let i = 0; i < flat.length; i++) {
    const cur = flat[i], next = flat[(i + 1) % flat.length];
    const downFifth = mod12(cur.root + 5) === next.root;
    if (cur.q === 'dom7' && downFifth) {
      if (i > 0 && chance(subs.tritone))     { cur.root = mod12(cur.root + 6); cur.sub = 'tritone'; }   // never the top of the chorus
      else if (isMinorQ(next.q) && chance(0.6)) cur.q = 'dom7b9';
      else if (chance(subs.alt))             cur.q = 'dom7alt';
    }
    if (cur.q === 'maj7' && next.q.startsWith('maj') && mod12(cur.root + 7) === next.root && chance(subs.minorIV)) cur.q = 'min6';
    if (cur.q === 'maj7' && i === flat.length - 1 && chance(0.4)) cur.q = 'maj6';
  }
  for (let bi = 0; bi < out.length; bi++) {
    const bar = out[bi], nextBar = out[(bi + 1) % out.length];
    if (bar.length !== 1 || !chance(subs.secondary)) continue;
    const target = nextBar[0];
    if (target.q === 'dim7' || isDomQ(bar[0].q)) continue;
    const v = { root: mod12(target.root + 7), q: isMinorQ(target.q) ? 'dom7b9' : 'dom7', sub: 'secondary' };
    if (v.root === bar[0].root) continue;
    bar.push(v);
  }
  return out;
}

/* ─── Rhythm vocabularies ───────────────────────────────────────────────────────
 * A cell is a few notes that fill `len` beats: [offset, duration] pairs, in
 * beats, where .5 is a swung eighth and thirds are triplets. The right hand
 * strings cells together until the bar is full, so its rhythm is always made
 * of things a player would actually play, never a random sprinkle.
 */
const C = (len, w, n) => ({ len, w, n });
const TRIP = [[0, 1 / 3], [1 / 3, 1 / 3], [2 / 3, 1 / 3]];
const CELLS = {
  swing: [
    C(1, 5, [[0, .5], [.5, .5]]), C(1, 3, [[0, 1]]), C(1, 2, [[.5, .5]]), C(1, 1.2, TRIP), C(1, 1.5, []),
    C(2, 2, [[0, 1.5], [1.5, .5]]), C(2, 2.5, [[0, .5], [.5, 1.5]]), C(2, 1.5, [[.5, 1.5]]), C(2, 1, [[0, 2]]),
  ],
  ballad: [
    C(1, 2, [[0, 1]]), C(2, 4, [[0, 2]]), C(2, 2, [[0, 1.5], [1.5, .5]]), C(2, 2.5, [[.5, 1.5]]),
    C(1, 2, [[0, .5], [.5, .5]]), C(1, 3, []), C(3, 2, [[0, 3]]), C(4, 1, [[0, 4]]), C(1, 1, TRIP),
  ],
  bounce: [
    C(1, 5, [[0, .5], [.5, .5]]), C(1, 2, [[0, 1]]), C(2, 3, [[0, .5], [.5, 1.5]]), C(2, 2, [[0, 1.5], [1.5, .5]]),
    C(1, 1, []), C(1, 1.5, [[.5, .5]]), C(1, 1, TRIP), C(2, 1, [[0, 2]]),
  ],
  smoky: [
    C(1, 3, [[0, .5], [.5, .5]]), C(1, 2, [[0, 1]]), C(2, 3, [[.5, 1.5]]), C(2, 2, [[0, 1.5], [1.5, .5]]),
    C(1, 2, []), C(2, 2, [[0, 2]]), C(1, 1.5, TRIP), C(3, 1, [[0, 3]]),
  ],
  tense: [
    C(1, 5, [[0, .5], [.5, .5]]), C(1, 2.5, TRIP), C(1, 1.5, [[.5, .5]]), C(1, 1, []), C(2, 1.5, [[.5, 1.5]]),
    C(1, 1, [[0, 1]]), C(2, 1.5, [[0, .5], [.5, .5], [1, .5], [1.5, .5]]),
  ],
};

/* bass ostinati for the editor: [beat, semitones above the tonic] */
const RIFFS = [
  [[0, 0], [.5, 0], [1.5, 10], [2, 0], [3, 7], [3.5, 10]],
  [[0, 0], [1, 3], [1.5, 5], [2, 6], [2.5, 5], [3, 3]],
  [[0, 0], [.5, 12], [1, 0], [2, 0], [2.5, 10], [3, 6], [3.5, 7]],
];

/* ─── Moods ─────────────────────────────────────────────────────────────────────
 * bpm/swing   swing is the position of the upbeat inside the beat: .5 is
 *             straight, .667 is a triplet feel; old records sit in between
 * keys        candidate tonics; flat keys for the horn-band moods, because
 *             that is where those tunes have always lived
 * templates   eight-bar charts, offsets from the tonic (see parseProg)
 * subs        how often each substitution fires when a chorus is decorated
 * bass        walk | two | pedal          drums   ride | brushes | two | smoky | tense
 * comp        charleston | ballad | stride | stabs
 * voiceLo/Hi  where the bottom note of the left-hand voicing may sit
 * melody      register, rhythm vocabulary, phrase/rest lengths in bars, base
 *             velocity, grace-note chance, who plays the tune
 */
const MOODS = {
  workshop: {
    label: 'The Workshop', blurb: 'Medium swing. Piano trio, brushes on the ride, rootless voicings, room to think.',
    bpm: 104, swing: .64, beats: 4, minor: false, keys: [5, 10, 3, 7, 8],
    templates: [
      '0maj7 | 9min7 | 2min7 | 7dom7 | 4min7 | 9dom7 | 2min7 | 7dom7',                  // I vi ii V iii VI ii V
      '0maj7 | 1dim7 | 2min7 | 7dom7 | 0maj7 9dom7 | 5maj7 5min6 | 4min7 9dom7 | 2min7 7dom7',
      '2min7 | 7dom7 | 0maj7 | 5maj7 | 11min7b5 | 4dom7b9 | 9min7 | 2min7 7dom7',         // the Autumn Leaves shape
      '0maj7 | 10dom7 | 0maj7 | 10dom7 | 5maj7 | 5min6 | 0maj7 4min7 | 2min7 7dom7',      // I and the backdoor ♭VII7
    ],
    subs: { tritone: .2, alt: .1, minorIV: .25, secondary: .15 },
    bass: 'walk', drums: 'ride', comp: 'charleston', lush: false, voiceLo: 50, voiceHi: 60,
    melody: { lo: 67, hi: 86, cells: CELLS.swing, phrase: [2, 3, 3, 4], rest: [1, 2, 2, 3], vel: .5, grace: .08, lead: 'piano' },
    extras: [], reverb: .5, revCut: 5500, modulate: .3,
  },
  calm: {
    label: 'Calm', blurb: 'A ballad at sixty. Half-note bass, brush sweeps, a vibraphone, five-voice chords rolled slowly.',
    bpm: 60, swing: .6, beats: 4, minor: false, keys: [1, 3, 8, 5, 6],
    templates: [
      '0maj7 | 5maj7 | 4min7 | 9min7 | 2min7 | 7dom7sus | 0maj7 | 5min6',
      '0maj7 | 10maj7 | 5maj7 | 5min6 | 0maj7 | 9min7 | 2min7 | 7dom7sus',                // the borrowed ♭VIIΔ, lydian and far away
      '0maj7 | 9min7 | 5maj7 | 7dom7sus | 4min7 | 1maj7 | 2min7 | 7dom7sus',              // a Neapolitan Δ7 for the ache
      '0maj7 | 2min7 | 4min7 | 5min6 | 0maj7 | 8maj7 | 10dom7 | 7dom7sus',
    ],
    subs: { tritone: .05, alt: 0, minorIV: .3, secondary: .05 },
    bass: 'two', drums: 'brushes', comp: 'ballad', lush: true, voiceLo: 48, voiceHi: 58,
    melody: { lo: 72, hi: 91, cells: CELLS.ballad, phrase: [1, 2, 2], rest: [1, 2, 2, 3], vel: .36, grace: .04, lead: 'piano' },
    extras: ['vibes'], reverb: .95, revCut: 4200, modulate: .25,
  },
  market: {
    label: 'The Market', blurb: 'Jaunty two-feel. Stride left hand, a clarinet takes the tune, sixth chords and a walking-up bass.',
    bpm: 136, swing: .6, beats: 4, minor: false, keys: [5, 10, 0, 7, 3],
    templates: [
      '0maj6 9min7 | 2min7 7dom7 | 0maj6 9min7 | 2min7 7dom7 | 0maj6 0dom7 | 5maj6 6dim7 | 0maj6 7dom7 | 0maj6 7dom7',  // rhythm changes, A section
      '9dom7 | 9dom7 | 2dom7 | 2dom7 | 7dom7 | 7dom7 | 0maj6 | 0maj6 7dom7',                 // the Sweet Georgia Brown cycle
      '0maj6 | 1dim7 | 2min7 | 7dom7 | 0maj6 | 5maj6 5min6 | 0maj6 9dom7 | 2min7 7dom7',
      '0dom7 | 5dom7 | 0dom7 | 0dom7 | 5dom7 | 5dom7 | 0dom7 | 7dom7',                       // jump-band eight
    ],
    subs: { tritone: .15, alt: 0, minorIV: .2, secondary: .12 },
    bass: 'two', drums: 'two', comp: 'stride', lush: false, voiceLo: 55, voiceHi: 64,
    melody: { lo: 60, hi: 82, cells: CELLS.bounce, phrase: [2, 3, 4, 4], rest: [1, 1, 2], vel: .5, grace: .12, lead: 'clarinet', leadChance: .65 },
    extras: ['clarinet'], reverb: .4, revCut: 6000, modulate: .35,
  },
  blackmarket: {
    label: 'The Black Market', blurb: 'Slow minor. Line clichés, tritone substitutes, a drone under the floorboards, the vibes shimmering.',
    bpm: 82, swing: .66, beats: 4, minor: true, keys: [0, 7, 5, 2, 10],
    templates: [
      '0minMaj7 | 0min7 | 0min6 | 8maj7 | 2min7b5 | 7dom7alt | 0min6 | 2min7b5 7dom7b9',    // the descending line cliché
      '0min6 | 0min6 | 2min7b5 | 7dom7alt | 0min6 | 8dom7 | 7dom7alt | 0min6',
      '0min7 | 5min7 | 1dom7 | 0min6 | 3maj7 | 8maj7 | 2min7b5 | 7dom7b9',                 // ♭II7 where the V should be
      '0min6 | 5min7 | 0min6 | 0dom7 | 5min7 | 5min7 | 0min6 8dom7 | 7dom7alt',            // a minor blues, bent
    ],
    subs: { tritone: .3, alt: .4, minorIV: 0, secondary: .1 },
    bass: 'walk', drums: 'smoky', comp: 'charleston', lush: false, voiceLo: 46, voiceHi: 56,
    melody: { lo: 58, hi: 79, cells: CELLS.smoky, phrase: [2, 2, 3], rest: [1, 2, 3, 3], vel: .42, grace: .1, lead: 'piano' },
    extras: ['drone', 'vibes'], reverb: .7, revCut: 3600, modulate: .2,
  },
  editor: {
    label: 'The Editor', blurb: 'Fast and cornered. A bass ostinato that will not move while the harmony slides above it; stabs in three against four.',
    bpm: 148, swing: .58, beats: 4, minor: true, keys: [2, 0, 4, 9, 5],
    templates: [
      '0min7 | 1maj7 | 0min7 | 7dom7alt | 0min7 | 8dom7 | 1dom7 | 7dom7alt',               // Phrygian ♭II, then ♭VI7 – ♭II7 – V7alt
      '0min7 | 0min7 | 6min7b5 | 5min7 | 0min7 | 10dom7 | 8maj7 | 7dom7alt',
      '0minMaj7 | 3maj7 | 0minMaj7 | 6dim7 | 0min7 | 1maj7 | 7dom7alt | 7dom7alt',
    ],
    subs: { tritone: .25, alt: .6, minorIV: 0, secondary: .1 },
    bass: 'pedal', drums: 'tense', comp: 'stabs', lush: false, voiceLo: 56, voiceHi: 66,
    melody: { lo: 70, hi: 89, cells: CELLS.tense, phrase: [2, 2, 4], rest: [1, 1, 2], vel: .62, grace: .05, lead: 'piano' },
    extras: [], reverb: .3, revCut: 6500, modulate: .15,
  },
};

/* ═══ THE PLAYERS ═══════════════════════════════════════════════════════════════
 * Each part takes the bar's context — its chords, the chord coming next, the
 * mood, where we are in the chart — and returns events in bar-relative beats:
 * { inst, pos, midi, vel, dur }. Positions ending in .5 are swung eighths.
 */

/* ─── The bass ─────────────────────────────────────────────────────────────────── */
const BASS_LO = 28, BASS_HI = 50;

/* a note that leads the ear to the next root: chromatic from below (the bebop
 * default), from above, the dominant a fifth up, or a scale step */
function approach(targetPc, ref, sc) {
  const t = nearest(targetPc, ref);
  return weighted([[t - 1, 3], [t + 1, 2], [nearest(mod12(targetPc + 7), ref), 2], [snapToScale(t - 2, sc), 1.5]]);
}

function bassPart(cx, st) {
  const { chords, nextChord, beats, md } = cx;
  const ev = [];
  const push = (pos, midi, vel, dur) => {
    midi = inRange(midi, BASS_LO, BASS_HI);
    st.last = midi;
    ev.push({ inst: 'bass', pos, midi, vel: vel + (rand() - .5) * .08, dur });
  };
  const per = beats / chords.length;

  if (md.bass === 'pedal' && !cx.release) {           // the ostinato: deaf to the chords above it
    const tonic = inRange(nearest(cx.key, 36), 30, 41);
    for (const [pos, off] of st.riff) push(pos, tonic + off, pos === 0 ? .85 : .7, .45);
    return ev;
  }
  chords.forEach((ch, ci) => {
    const start = ci * per;
    const nextRoot = ci + 1 < chords.length ? chords[ci + 1].root : nextChord.root;
    const sc = chordScale(ch), tones = chordTones(ch);
    const root = nearest(ch.root, st.last ?? 38);

    if (md.bass === 'two' && !cx.release) {           // half notes, the old dance-band feel
      push(start, root, .78, per >= 4 ? 1.9 : 1.4);
      if (per >= 4) {
        const mid = weighted([[nearest(tones[2], root), 3], [nearest(tones[1], root), 2], [root + (chance(.5) ? 12 : -12), 1]]);
        push(start + 2, mid, .66, 1.4);
        if (chance(.35)) push(start + 3.5, approach(nextRoot, mid, sc), .55, .45);
      } else if (chance(.4)) push(start + 1.5, approach(nextRoot, root, sc), .55, .45);
      return;
    }
    // walking: root, a chord tone, another, then something that leans on the next bar
    push(start, root, .82, .95);
    if (per >= 4) {
      const b2 = weighted([[nearest(tones[1], root), 3], [nearest(tones[2], root), 2], [snapToScale(root + 2, sc), 2], [root + 12, .5]]);
      push(start + 1, b2, .68, .95);
      const b3 = weighted([[nearest(tones[2], b2), 3], [nearest(tones[3] ?? tones[2], b2), 2], [nearest(tones[1], b2), 1], [snapToScale(b2 + (b2 > root ? 2 : -2), sc), 2]]);
      push(start + 2, b3, .7, .95);
      const b4 = approach(nextRoot, b3, sc);
      push(start + 3, b4, .72, chance(.15) ? .6 : .95);
      if (chance(.12)) push(start + 3 + 2 / 3, b4, .4, .3);    // a triplet skip on the way to the bar line
    } else if (per >= 2) {
      push(start + 1, approach(nextRoot, root, sc), .7, .95);
    }
  });
  return ev;
}

/* ─── The drums ────────────────────────────────────────────────────────────────── */
function drumsPart(cx) {
  const { beats, md, phraseBar } = cx;
  const ev = [];
  const hit = (inst, pos, vel, dur) => ev.push({ inst, pos, vel: clamp(vel + (rand() - .5) * .1, .05, 1), dur: dur || 0 });
  const first = phraseBar === 0;
  const style = md.drums;

  if (style === 'ride' || style === 'tense') {
    const tense = style === 'tense';
    for (let b = 0; b < beats; b++) {
      hit('ride', b, b % 2 === 0 ? .8 : .7);
      if (b % 2 === 1 || (tense && chance(.3))) hit('ride', b + .5, tense ? .62 : .55);     // spang-a-LANG
      if (b % 2 === 1) hit('hat', b, tense ? .75 : .6);
      if (!tense) hit('kick', b, .2);                                                        // feathered: felt, not heard
      if (chance(tense ? .32 : .14)) hit('snare', b + .5, tense ? .45 : .28);
      if (tense && chance(.28)) hit('kick', b + .5, .55);
      if (tense && chance(.2)) hit('snare', b + 2 / 3, .3);
    }
    if (first) hit(tense ? 'bell' : 'ride', 0, .95);
    if (tense && phraseBar % 4 === 3) { hit('snare', beats - .5, .7); hit('kick', beats - .5, .6); }
    else if (chance(.12)) { hit('kick', beats - .5, .5); hit('snare', beats - .5, .4); }
    return ev;
  }
  if (style === 'brushes') {
    for (let b = 0; b < beats; b++) {
      hit('sweep', b, b % 2 === 0 ? .7 : .55, 1);
      if (b % 2 === 1) hit('snare', b, .26);
      if (b % 2 === 1 && chance(.5)) hit('hat', b, .3);
      if (b === 0 && chance(.35)) hit('ride', 0, .35);
      if (b === 2 && chance(.2)) hit('ride', 2.5, .3);
    }
    return ev;
  }
  if (style === 'two') {
    for (let b = 0; b < beats; b++) {
      hit('sweep', b, .5, .9);
      if (b % 2 === 0) hit('kick', b, .45); else { hit('snare', b, .5); hit('hat', b, .5); }
      if (b % 2 === 1 && chance(.5)) hit('ride', b + .5, .4);
      if (chance(.1)) hit('snare', b + .5, .3);
    }
    if (first) hit('ride', 0, .6);
    if (phraseBar % 4 === 3 && chance(.5)) { hit('snare', beats - 1, .4); hit('snare', beats - 2 / 3, .35); hit('snare', beats - 1 / 3, .45); }
    return ev;
  }
  for (let b = 0; b < beats; b++) {                   // smoky: the ride pattern with holes in it
    if (chance(.75)) hit('ride', b, b === 0 ? .7 : .55);
    if (b % 2 === 1 && chance(.55)) hit('ride', b + .5, .45);
    if (b % 2 === 1) hit('hat', b, .5);
    if (b % 2 === 0) hit('sweep', b, .45, 2);
    if (b === 0) hit('kick', 0, .35);
    if (b === beats - 1 && chance(.25)) hit('rim', b, .5);
    if (chance(.1)) hit('snare', b + .5, .25);
  }
  return ev;
}

/* ─── The left hand ────────────────────────────────────────────────────────────── */
const COMP_PATTERNS = [[0, 1.5], [1.5], [3.5], [1.5, 3.5], [.5, 2.5], [0, 2.5], [1.5, 3], [2.5], []];

function compPart(cx, st) {
  const { chords, nextChord, beats, md } = cx;
  const ev = [];
  const per = beats / chords.length;
  const voicingOf = ch => (st.voicing = voice(ch, st.voicing, md.voiceLo, md.voiceHi, md.lush));
  const strike = (v, pos, vel, dur, roll) => v.forEach((m, i) => ev.push({
    inst: 'piano', pos, midi: m, dur, offset: roll ? i * roll : 0,
    vel: vel + (i === v.length - 1 ? .05 : 0) + (rand() - .5) * .06,
  }));
  const busy = st.melRest ? .12 : 0;                  // when the tune rests, the left hand answers

  if (md.comp === 'stride') {
    chords.forEach((ch, ci) => {
      const start = ci * per, v = voicingOf(ch);
      const root = inRange(nearest(ch.root, 43), 38, 50);
      const fifth = inRange(nearest(mod12(ch.root + 7), root), 36, 50);
      for (let b = 0; b < per; b++) {
        if (b % 2 === 0) ev.push({ inst: 'piano', pos: start + b, midi: (b === 0 || chance(.4)) ? root : fifth, vel: .6, dur: .45 });
        else strike(v, start + b, .42, .35);
      }
    });
    return ev;
  }
  if (md.comp === 'ballad') {
    chords.forEach((ch, ci) => {
      const start = ci * per, v = voicingOf(ch);
      strike(v, start, .34, per - .2, .05);
      if (per >= 4 && chance(.45)) strike(v, start + (chance(.5) ? 2 : 2.5), .26, 1.3, .03);
    });
    return ev;
  }
  if (md.comp === 'stabs') {                          // one hit every three swung eighths, across the bar lines
    let pos = st.stab;
    while (pos < beats - 1e-6) {
      const v = voicingOf(chords[Math.min(chords.length - 1, Math.floor(pos / per))]);
      strike(v, pos, .58, .3);
      ev.push({ inst: 'piano', pos, midi: v[v.length - 1] + 12, vel: .55, dur: .3 });
      pos += 1.5;
    }
    st.stab = (cx.phraseBar % 8 === 7) ? 0 : pos - beats;
    return ev;
  }
  chords.forEach((ch, ci) => {                        // charleston: sparse, on the "and"s
    const start = ci * per, v = voicingOf(ch);
    let pat = per >= 4 ? pick(COMP_PATTERNS) : [pick([0, .5, 1.5])];
    if (!pat.length && chance(busy + .3)) pat = [1.5];
    pat.forEach((p, i) => {
      const next = pat[i + 1] ?? per;
      strike(v, start + p, .42 + busy, Math.min(next - p, 2) - .1 + (chance(.3) ? .8 : 0), chance(.25) ? .018 : 0);
    });
  });
  if (chance(.2 + busy) && !ev.some(e => e.pos > beats - .6)) strike(voicingOf(nextChord), beats - .5, .45, .8);   // the anticipation
  return ev;
}

/* ─── The tune ─────────────────────────────────────────────────────────────────── */
function pickStrong(ch, st, lo, hi, ref) {
  const tones = chordTones(ch);
  const cands = [];
  for (let m = lo; m <= hi; m++) if (tones.includes(mod12(m))) cands.push(m);
  const leap = chance(.15);
  let dir = st.dir;
  if (ref > hi - 4) dir = -1; else if (ref < lo + 4) dir = 1;
  const scored = cands.map(m => {
    const d = m - ref, ad = Math.abs(d);
    let s;
    if (ad === 0) s = leap ? 8 : 2.5;
    else if (leap) s = Math.abs(ad - 8) + (Math.sign(d) === dir ? 0 : 2);
    else s = Math.max(0, ad - 2) * 1.3 + (Math.sign(d) === dir ? 0 : 1.5) + (ad > 5 ? 3 : 0);
    s += Math.abs(m - (lo + hi) / 2) / 14;
    return [m, s + rand() * 1.2];
  });
  scored.sort((x, y) => x[1] - y[1]);
  const m = scored[0][0];
  if (Math.abs(m - ref) > 5) st.dir = -Math.sign(m - ref) || dir;   // a leap is answered by steps the other way
  else st.dir = chance(.15) ? -dir : dir;
  return m;
}

/* n notes that get from a to b: a scale run when the distance fits, skips when
 * it is too far, chromatic passing tones (added late, the way bebop does it)
 * when it is too near, and the enclosure — above, then below, then home */
function fillLine(a, b, n, sc) {
  if (n <= 0) return [];
  const dist = Math.abs(b - a);
  if (n === 1) {
    if (dist === 0) return [weighted([[b - 1, 2], [snapToScale(b + 2, sc), 2], [b + 1, 1]])];
    return [weighted([[b - 1, 3], [snapToScale(b + 2, sc), 2], [snapToScale(a + (b > a ? 2 : -2), sc), 2]])];
  }
  if (n === 2 && dist <= 4 && chance(.5)) return [snapToScale(b + 2, sc), b - 1];
  const steps = scaleWalk(a, b, sc);
  if (steps.length === n) return steps;
  if (steps.length > n) {
    if (chance(.35)) { const out = []; for (let k = 0; k < n; k++) out.push(steps[Math.round((k + 1) * (steps.length - 1) / n)]); return out; }
    return steps.slice(steps.length - n);
  }
  const out = [...steps];
  const dir = b >= a ? 1 : -1;
  for (let k = out.length; k >= 0 && out.length < n; k--) {
    const from = k === 0 ? a : out[k - 1], to = k === out.length ? b : out[k];
    if (Math.abs(to - from) === 2) out.splice(k, 0, from + dir);
  }
  while (out.length < n) {                            // still short: a neighbour figure before the line
    out.unshift(chance(.5) ? a - 1 : snapToScale(a + 2, sc));
    if (out.length < n) out.unshift(a);
  }
  return out.slice(0, n);
}

function melodyPart(cx, st) {
  const { chords, nextChord, beats, md } = cx;
  const M = md.melody;
  const ev = [];
  const per = beats / chords.length;
  const chordAt = pos => chords[Math.min(chords.length - 1, Math.floor(pos / per))];

  if (st.rest > 0) {                                  // resting — but maybe a pickup into the next phrase
    st.rest--;
    st.melRest = true;
    if (st.rest === 0 && chance(.6)) {
      const tones = chordTones(nextChord), sc = chordScale(nextChord);
      const target = inRange(nearest(tones[1], (M.lo + M.hi) / 2), M.lo, M.hi);
      const n = pick([1, 2, 3]);
      const line = n === 1 ? [target - 1] : n === 2 ? [snapToScale(target + 2, sc), target - 1] : [target - 3, target - 2, target - 1];
      line.forEach((m, i) => ev.push({ inst: st.lead, pos: beats - (n - i) * .5, midi: m, vel: M.vel * .8, dur: .45 }));
      st.prev = line[line.length - 1];
    }
    return ev;
  }
  st.melRest = false;
  if (st.active === 0) {                              // a new phrase: how long, and who plays it
    st.active = pick(M.phrase);
    st.phraseLen = st.active;
    st.lead = (M.lead === 'clarinet' && chance(M.leadChance ?? 1)) ? 'clarinet' : 'piano';
    st.motif = null;
  }
  const inst = st.lead;
  const lo = inst === 'clarinet' ? 58 : M.lo, hi = inst === 'clarinet' ? 80 : M.hi;
  const center = (lo + hi) / 2;
  const lastBar = st.active === 1;

  const reuse = !!st.motif && (st.phraseLen - st.active === 1 ? chance(.55) : chance(.25));
  let cells;
  if (reuse) cells = st.motif.cells.map(c => ({ ...c }));
  else {
    cells = [];
    let pos = 0;
    while (pos < beats - 1e-6) {
      const remain = beats - pos;
      const opts = M.cells.filter(c => c.len <= remain + 1e-6);
      const cell = weighted(opts.map(c => [c, c.w]));
      for (const n of cell.n) cells.push({ pos: pos + n[0], dur: n[1] });
      pos += cell.len;
    }
  }
  if (lastBar) cells = cells.filter(c => c.pos < beats - 1.4);     // end early, let it ring
  if (!cells.length) {
    st.active--;
    if (st.active === 0) st.rest = pick(M.rest);
    return ev;
  }
  const notes = cells.map(c => ({ ...c, strong: Math.abs(c.pos - Math.round(c.pos)) < .02 || c.dur >= 1 }));
  if (lastBar) notes[notes.length - 1].strong = true;

  const pitches = new Array(notes.length).fill(null);
  if (reuse && st.motif.shape.length === notes.length) {      // sequence the motif through the new chords
    const first = pickStrong(chordAt(notes[0].pos), st, lo, hi, st.prev ?? center);
    pitches[0] = first;
    for (let i = 1; i < notes.length; i++) pitches[i] = clamp(snapToScale(first + st.motif.shape[i], chordScale(chordAt(notes[i].pos))), lo, hi);
  } else {
    let prevA = st.prev ?? center, lastIdx = -1;
    for (let i = 0; i < notes.length; i++) {
      if (!notes[i].strong) continue;
      const anticipates = notes[i].pos >= beats - .6 && chance(.5);
      pitches[i] = pickStrong(anticipates ? nextChord : chordAt(notes[i].pos), st, lo, hi, prevA);
      const gap = i - lastIdx - 1;
      if (gap > 0) {
        const line = fillLine(prevA, pitches[i], gap, chordScale(chordAt(notes[lastIdx + 1].pos)));
        for (let k = 0; k < gap; k++) pitches[lastIdx + 1 + k] = clamp(line[k], lo - 2, hi + 2);
      }
      prevA = pitches[i];
      lastIdx = i;
    }
    if (lastIdx < notes.length - 1) {                 // trailing weak notes head for the next chord
      const gap = notes.length - 1 - lastIdx;
      const target = pickStrong(nextChord, st, lo, hi, prevA);
      const line = fillLine(prevA, target, gap, chordScale(chordAt(notes[lastIdx + 1].pos)));
      for (let k = 0; k < gap; k++) pitches[lastIdx + 1 + k] = clamp(line[k], lo - 2, hi + 2);
    }
  }
  if (!st.motif) st.motif = { cells: cells.map(c => ({ ...c })), shape: pitches.map(p => p - pitches[0]) };

  notes.forEach((n, i) => {
    const m = pitches[i];
    const upbeat = Math.abs(n.pos - Math.floor(n.pos) - .5) < .02;
    let vel = M.vel + (upbeat ? .07 : 0) + (n.strong && n.dur >= 1 ? .04 : 0) + (m - center) / 90 + (rand() - .5) * .08;
    let dur = inst === 'clarinet' ? n.dur + .04 : n.dur - (n.dur >= 1 ? .1 : .05);
    if (lastBar && i === notes.length - 1) { dur = Math.max(dur, 2.5); vel -= .06; }
    if (inst === 'piano' && n.strong && chance(M.grace)) ev.push({ inst, pos: n.pos - .09, midi: m - 1, vel: vel * .55, dur: .08 });
    ev.push({ inst, pos: n.pos, midi: m, vel: clamp(vel, .1, .95), dur });
  });
  st.prev = pitches[pitches.length - 1];
  st.active--;
  if (st.active === 0) st.rest = pick(M.rest);
  return ev;
}

/* ─── The guests ───────────────────────────────────────────────────────────────── */
function extrasPart(cx, st) {
  const { chords, md } = cx;
  const ev = [];
  if (!md.extras.includes('vibes')) return ev;
  const ch = chords[0];
  const v = st.voicing || voice(ch, null, md.voiceLo, md.voiceHi, false);
  const top = v[v.length - 1] + 12;
  if (md.comp === 'ballad') {
    if (chance(.4)) {
      ev.push({ inst: 'vibes', pos: 0, midi: top, vel: .32, dur: 3.5 });
      if (chance(.6)) ev.push({ inst: 'vibes', pos: 0, midi: v[v.length - 2] + 12, vel: .26, dur: 3.5 });
    }
    if (st.melRest && chance(.35)) {                  // a small answer while the piano is quiet
      const sc = chordScale(ch);
      let m = snapToScale(top + 2, sc);
      [2.5, 3, 3.5].forEach((pos, i) => { ev.push({ inst: 'vibes', pos, midi: m, vel: .28, dur: i === 2 ? 2 : .5 }); m = snapToScale(m + (chance(.5) ? 2 : -2), sc); });
    }
  } else if (chance(.3)) {                            // black market: a shimmer on top of the chord, high and thin
    ev.push({ inst: 'vibes', pos: chance(.5) ? 0 : 1.5, midi: top, vel: .25, dur: 2.5 });
  }
  return ev;
}

/* ═══ THE INSTRUMENTS ═══════════════════════════════════════════════════════════
 * Everything is built from oscillators, noise and filters at the moment it is
 * needed, so a note costs nothing until it sounds and nothing once it has
 * stopped. The piano is the one worth reading: a handful of slightly
 * inharmonic partials, two detuned "strings" on the lowest ones for the
 * beating that makes a real piano sing, a hammer of filtered noise, a
 * two-stage decay (the prompt sound, then the aftersound), a damper on
 * note-off, and a low-pass that opens with velocity — play soft and it is a
 * felt piano, play hard and it is a bar upright.
 */
const A = { ctx: null, bus: {}, drone: null };
const BUSES = { piano: [1, .25], bass: [.9, .08], drums: [.8, .18], vibes: [.8, .45], clarinet: [.8, .3], drone: [1, .5] };  // [level, reverb send]

function noiseBuffer(ctx, pink) {
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) { d[i] = w; continue; }
    b0 = .997 * b0 + .029 * w; b1 = .985 * b1 + .032 * w; b2 = .95 * b2 + .048 * w;   // Kellet's cheap pink
    d[i] = (b0 + b1 + b2 + w * .05) * 2.5;
  }
  return buf;
}

/* a room, from noise that decays and darkens as it goes */
function makeIR(ctx, seconds) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const env = Math.pow(1 - x, 2.4) * Math.exp(-2.5 * x) * (i < sr * .012 ? .25 : 1);
      const a = .55 - .42 * x;
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * env * .55;
    }
  }
  return buf;
}

function buildGraph() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.ctx = ctx;
  A.noise = noiseBuffer(ctx, false);
  A.pink = noiseBuffer(ctx, true);

  A.master = ctx.createGain();            A.master.gain.value = 0;
  A.comp = ctx.createDynamicsCompressor();
  A.comp.threshold.value = -16; A.comp.knee.value = 12; A.comp.ratio.value = 3; A.comp.attack.value = .008; A.comp.release.value = .3;
  A.tone = ctx.createBiquadFilter();      A.tone.type = 'lowpass';   A.tone.frequency.value = 11000; A.tone.Q.value = .4;
  A.shelf = ctx.createBiquadFilter();     A.shelf.type = 'highshelf'; A.shelf.frequency.value = 5000; A.shelf.gain.value = -1.5;
  A.wow = ctx.createDelay(.05);           A.wow.delayTime.value = .012;
  A.sum = ctx.createGain();
  A.sum.connect(A.wow); A.wow.connect(A.shelf); A.shelf.connect(A.tone); A.tone.connect(A.comp); A.comp.connect(A.master); A.master.connect(ctx.destination);

  // the turntable: a slow wow and a fast flutter on the delay line
  A.wowDepth = ctx.createGain(); A.wowDepth.gain.value = 0;
  A.flutDepth = ctx.createGain(); A.flutDepth.gain.value = 0;
  const wowLfo = ctx.createOscillator(); wowLfo.frequency.value = .43; wowLfo.connect(A.wowDepth); A.wowDepth.connect(A.wow.delayTime); wowLfo.start();
  const flutLfo = ctx.createOscillator(); flutLfo.frequency.value = 6.1; flutLfo.connect(A.flutDepth); A.flutDepth.connect(A.wow.delayTime); flutLfo.start();

  // the room
  A.revIn = ctx.createBiquadFilter(); A.revIn.type = 'lowpass'; A.revIn.frequency.value = 5000;
  A.reverb = ctx.createConvolver(); A.reverb.buffer = makeIR(ctx, 2.4);
  A.revGain = ctx.createGain(); A.revGain.gain.value = .5;
  A.revIn.connect(A.reverb); A.reverb.connect(A.revGain); A.revGain.connect(A.sum);

  for (const name in BUSES) {
    const g = ctx.createGain(), send = ctx.createGain();
    g.gain.value = BUSES[name][0]; send.gain.value = BUSES[name][1];
    g.connect(A.sum); g.connect(send); send.connect(A.revIn);
    A.bus[name] = { g, send, level: BUSES[name][0], muted: false };
  }

  // surface noise: hiss always, crackle from the scheduler
  const hiss = ctx.createBufferSource(); hiss.buffer = A.pink; hiss.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
  A.hiss = ctx.createGain(); A.hiss.gain.value = 0;
  hiss.connect(hp); hp.connect(lp); lp.connect(A.hiss); A.hiss.connect(A.shelf); hiss.start();
  A.crackle = ctx.createGain(); A.crackle.gain.value = 1; A.crackle.connect(A.shelf);
  return ctx;
}

function setPatina(amount) {
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  A.wowDepth.gain.setTargetAtTime(.0011 * amount, t, .2);
  A.flutDepth.gain.setTargetAtTime(.00012 * amount, t, .2);
  A.hiss.gain.setTargetAtTime(.012 * amount, t, .2);
  A.shelf.gain.setTargetAtTime(-1.5 - 4 * amount, t, .2);
  A.tone.frequency.setTargetAtTime(11000 - 4500 * amount, t, .2);
}

function crackle(t, amount) {
  const ctx = A.ctx;
  const src = ctx.createBufferSource(); src.buffer = A.noise;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + rand() * 3000; f.Q.value = 1.2;
  const g = ctx.createGain();
  const len = .001 + rand() * .003, a = (.01 + rand() * .05) * amount;
  g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(.0005, t + len);
  src.connect(f); f.connect(g); g.connect(A.crackle);
  src.start(t, rand()); src.stop(t + len + .01);
}

const osc = (type, f) => { const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
const gainNode = v => { const g = A.ctx.createGain(); g.gain.value = v; return g; };
const filt = (type, f, q) => { const b = A.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
function noiseHit(t, dest, { pink, type = 'bandpass', freq, q = 1, tau, gain, hold = 0 }) {
  const src = A.ctx.createBufferSource(); src.buffer = pink ? A.pink : A.noise;
  const f = filt(type, freq, q), g = A.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setTargetAtTime(0, t + hold, tau);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, rand() * 1.5); src.stop(t + hold + tau * 6 + .02);
}

/* ─── Piano ─────────────────────────────────────────────────────────────────── */
function playPiano(t, midi, vel, dur) {
  const ctx = A.ctx, bus = A.bus.piano.g;
  const f = mtof(midi);
  const nP = midi < 48 ? 7 : midi < 64 ? 6 : midi < 76 ? 5 : 4;
  const B = midi < 60 ? .00015 : .0004;                       // inharmonicity: strings are stiff, not ideal
  const v = Math.pow(clamp(vel, .05, 1), 1.5);
  const out = gainNode(.13 * v);
  const lp = filt('lowpass', clamp(f * (1.8 + 7 * vel), 400, 14000), .4);
  out.connect(lp); lp.connect(bus);
  const base = clamp(7 * Math.pow(2, -(midi - 40) / 26), .7, 7);   // the bass strings ring for seconds, the top for less than one
  const roll = 1.6 - .5 * vel;
  const tEnd = t + Math.max(dur, .04);
  for (let n = 1; n <= nP; n++) {
    const fn = f * n * Math.sqrt(1 + B * n * n);
    if (fn > 15000) break;
    const amp = Math.pow(n, -roll) * Math.abs(Math.sin(Math.PI * n * .125)) * 1.35;   // hammer strikes an eighth of the way along
    const T = base / (1 + .32 * (n - 1));
    const strings = n <= 2 ? 2 : 1;
    for (let s = 0; s < strings; s++) {
      const o = osc('sine', fn);
      o.detune.value = strings === 2 ? (s ? 1.4 : -1.4) + (rand() - .5) * 1.2 : (rand() - .5) * 2;
      const g = ctx.createGain(), a = amp / strings;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + .004);
      g.gain.setTargetAtTime(a * .45, t + .004, .06 + .08 / n);
      g.gain.setTargetAtTime(0, t + .2, T / 2.5);
      g.gain.setTargetAtTime(0, tEnd, .09);                     // the damper
      o.connect(g); g.connect(out);
      o.start(t); o.stop(tEnd + .8);
    }
  }
  noiseHit(t, out, { freq: clamp(f * 3, 800, 6000), q: .8, tau: .004, gain: .25 * v });
}

/* ─── Upright bass ──────────────────────────────────────────────────────────── */
function playBass(t, midi, vel, dur) {
  const ctx = A.ctx, bus = A.bus.bass.g;
  const f = mtof(midi), v = Math.pow(vel, 1.3);
  const out = gainNode(.5 * v);
  const lp = filt('lowpass', 1000, 1.1);
  lp.frequency.setValueAtTime(clamp(f * 7, 300, 2500), t);
  lp.frequency.exponentialRampToValueAtTime(clamp(f * 2.4, 120, 800), t + .12);
  const env = ctx.createGain();
  const tEnd = t + Math.max(dur, .08), tau = clamp(dur * .5, .25, .9);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + .006);
  env.gain.setTargetAtTime(.5, t + .006, .12);
  env.gain.setTargetAtTime(0, t + .1, tau);
  env.gain.setTargetAtTime(0, tEnd, .05);
  [['triangle', .55], ['sawtooth', .22], ['sine', .45]].forEach(([type, a]) => {
    const o = osc(type, f);
    o.frequency.setValueAtTime(f * 1.025, t);                   // the finger pulls the string sharp, then it settles
    o.frequency.exponentialRampToValueAtTime(f, t + .05);
    const g = gainNode(a);
    o.connect(g); g.connect(lp);
    o.start(t); o.stop(tEnd + .4);
  });
  lp.connect(env); env.connect(out); out.connect(bus);
  noiseHit(t, out, { freq: 1200, q: 1, tau: .006, gain: .12 * v });
}

/* ─── The kit ───────────────────────────────────────────────────────────────── */
const CYMBAL = [1, 1.4471, 1.617, 1.9265, 2.5028, 2.6637, 3.4];
function metal(t, { f0, bp, hp, tau, gain, sizzle }) {
  const ctx = A.ctx, bus = A.bus.drums.g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(gain, t);
  out.gain.setTargetAtTime(0, t + .002, tau);
  const b = filt('bandpass', bp, .7), h = filt('highpass', hp);
  out.connect(b); b.connect(h); h.connect(bus);
  for (const r of CYMBAL) { const o = osc('square', f0 * r); o.connect(out); o.start(t); o.stop(t + tau * 6); }
  if (sizzle) noiseHit(t, bus, { type: 'highpass', freq: 7000, tau: tau * .8, gain: gain * sizzle });
}
const playRide = (t, v) => metal(t, { f0: 360, bp: 6500, hp: 4000, tau: .42, gain: .07 * v, sizzle: .6 });
const playBell = (t, v) => metal(t, { f0: 520, bp: 3200, hp: 2200, tau: .6, gain: .09 * v, sizzle: .2 });
const playHat  = (t, v) => metal(t, { f0: 420, bp: 9000, hp: 7000, tau: .035, gain: .05 * v });
function playKick(t, v) {
  const o = osc('sine', 105), g = A.ctx.createGain();
  o.frequency.setValueAtTime(105, t); o.frequency.exponentialRampToValueAtTime(42, t + .07);
  g.gain.setValueAtTime(.9 * v, t); g.gain.setTargetAtTime(0, t + .01, .09);
  o.connect(g); g.connect(A.bus.drums.g); o.start(t); o.stop(t + .5);
}
function playSnare(t, v) {                                       // a brush tap, or a light stick
  const bus = A.bus.drums.g;
  noiseHit(t, bus, { freq: 2200, q: .8, tau: .045, gain: .25 * v });
  const o = osc('sine', 185), g = A.ctx.createGain();
  g.gain.setValueAtTime(.25 * v, t); g.gain.setTargetAtTime(0, t, .04);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + .3);
}
function playRim(t, v) {
  const bus = A.bus.drums.g;
  noiseHit(t, bus, { type: 'highpass', freq: 2500, tau: .012, gain: .3 * v });
  const o = osc('sine', 880), g = A.ctx.createGain();
  g.gain.setValueAtTime(.2 * v, t); g.gain.setTargetAtTime(0, t, .01);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + .1);
}
function playSweep(t, dur, v) {                                  // the brush circling the head
  const src = A.ctx.createBufferSource(); src.buffer = A.pink;
  const f = filt('bandpass', 3000, .4), g = A.ctx.createGain();
  g.gain.setValueAtTime(.002, t);
  g.gain.linearRampToValueAtTime(.09 * v, t + dur * .6);
  g.gain.linearRampToValueAtTime(.003, t + dur);
  src.connect(f); f.connect(g); g.connect(A.bus.drums.g);
  src.start(t, rand()); src.stop(t + dur + .02);
}

/* ─── Vibraphone ───────────────────────────────────────────────────────────── */
function playVibes(t, midi, vel, dur) {
  const ctx = A.ctx, bus = A.bus.vibes.g;
  const f = mtof(midi), tEnd = t + dur;
  const out = gainNode(.22 * vel);
  const trem = gainNode(1);
  const lfo = osc('sine', 5.2), depth = gainNode(.4);
  lfo.connect(depth); depth.connect(trem.gain); lfo.start(t); lfo.stop(tEnd + 2);
  out.connect(trem); trem.connect(bus);
  const scale = clamp(1.8 - (midi - 60) / 40, .6, 1.8);
  [[1, 1, 1.6], [4, .25, .5], [10, .05, .2]].forEach(([r, a, tau]) => {
    const o = osc('sine', f * r), g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + .005);
    g.gain.setTargetAtTime(0, t + .005, tau * scale);
    g.gain.setTargetAtTime(0, tEnd, .25);
    o.connect(g); g.connect(out); o.start(t); o.stop(tEnd + 1.5);
  });
  noiseHit(t, out, { freq: 2500, q: 1, tau: .004, gain: .1 * vel });
}

/* ─── Clarinet ─────────────────────────────────────────────────────────────── */
function playClarinet(t, midi, vel, dur) {
  const ctx = A.ctx, bus = A.bus.clarinet.g;
  const f = mtof(midi), tEnd = t + dur;
  const out = gainNode(.13 * vel);
  const lp = filt('lowpass', f * 2, 1.4);
  lp.frequency.exponentialRampToValueAtTime(f * 3.5, t + .08);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + .05);
  env.gain.setTargetAtTime(.8, t + .05, .2);
  env.gain.setTargetAtTime(0, tEnd, .06);
  const vib = osc('sine', 5.3), vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t); vibDepth.gain.linearRampToValueAtTime(7, t + .6);   // vibrato arrives late, as it should
  vib.connect(vibDepth); vib.start(t); vib.stop(tEnd + .5);
  [['square', .5], ['sine', .5]].forEach(([type, a]) => {
    const o = osc(type, f), g = gainNode(a);
    vibDepth.connect(o.detune);
    o.connect(g); g.connect(lp); o.start(t); o.stop(tEnd + .5);
  });
  lp.connect(env); env.connect(out); out.connect(bus);
  noiseHit(t, out, { pink: true, freq: f * 2.5, q: 1, tau: .2, hold: Math.max(0, dur - .1), gain: .05 * vel });
}

/* ─── The drone under the floorboards ──────────────────────────────────────── */
function startDrone(midi) {
  const ctx = A.ctx;
  if (A.drone) { A.drone.setPitch(midi); return; }
  const f = mtof(midi);
  const out = gainNode(0);
  const lp = filt('lowpass', 200, 2);
  const lfo = osc('sine', .07), depth = gainNode(90);
  lfo.connect(depth); depth.connect(lp.frequency); lfo.start();
  const oscs = [['sawtooth', -6, .5], ['sawtooth', 6, .5], ['sine', 0, .8]].map(([type, det, a]) => {
    const o = osc(type, type === 'sine' ? f * 2 : f); o.detune.value = det;
    const g = gainNode(a); o.connect(g); g.connect(lp); o.start(); return o;
  });
  lp.connect(out); out.connect(A.bus.drone.g);
  out.gain.setTargetAtTime(.06, ctx.currentTime, 2.5);
  A.drone = {
    out, oscs, lfo,
    setPitch(m) { const nf = mtof(m); oscs.forEach(o => o.frequency.setTargetAtTime(o.type === 'sine' ? nf * 2 : nf, ctx.currentTime, .8)); },
    stop() { out.gain.setTargetAtTime(0, ctx.currentTime, 1.2); setTimeout(() => { oscs.forEach(o => o.stop()); lfo.stop(); }, 6000); },
  };
}
function stopDrone() { if (A.drone) { A.drone.stop(); A.drone = null; } }

/* ═══ THE BANDLEADER ════════════════════════════════════════════════════════════
 * Counts the band in, hands each bar to the audio clock a little before it is
 * due, and handles the things a bandleader handles: the key, the chart, when
 * to take it somewhere else, and how to get there without anybody noticing
 * the join. A mood change never happens mid-bar: it waits for the bar line,
 * plays one ii–V into the new key at a tempo that is already drifting toward
 * the new one, and the new arrangement walks in on the downbeat.
 */
const LOOKAHEAD = .45, TICK_MS = 30;
const S = {
  running: false, mood: null, pending: null, key: 0, nextKey: null, forceMod: false,
  bpm: 100, swing: .6, targetBpm: 100, targetSwing: .6,
  prog: [], template: null, barIndex: 0, chorus: 0, absBar: 0, pivot: null,
  nextBarTime: 0, timer: null, volume: .8, patina: .45,
  mel: null, bassSt: null, comp: null, curChords: [], curBarStart: 0, curPhraseBar: 0, beatDur: .6,
};
const listeners = { note: [], bar: [], mood: [] };
const emit = (kind, payload) => listeners[kind].forEach(cb => { try { cb(payload); } catch (e) { console.error(e); } });
const tonicChord = (key, minor) => ({ root: key, q: minor ? 'min6' : 'maj7' });
const dronePitch = () => inRange(24 + S.key, 30, 41);

/* bar-relative beats → seconds, with the upbeats pushed late by the swing */
function tOf(pos, beatDur, swing) {
  const b = Math.floor(pos + 1e-6), f = pos - b;
  let off;
  if (Math.abs(f - .5) < .02) off = swing;
  else if (Math.abs(f - 1 / 3) < .02) off = 1 / 3;
  else if (Math.abs(f - 2 / 3) < .02) off = 2 / 3;
  else if (f < .5) off = f * (swing / .5);
  else off = swing + (f - .5) * ((1 - swing) / .5);
  return (b + off) * beatDur;
}

function playEvent(ev, barStart, beatDur, swing) {
  const t = barStart + tOf(ev.pos, beatDur, swing) + (ev.offset || 0);
  const tEnd = ev.dur ? barStart + tOf(ev.pos + ev.dur, beatDur, swing) + (ev.offset || 0) : t + .1;
  const dur = Math.max(.03, tEnd - t);
  switch (ev.inst) {
    case 'piano':    playPiano(t, ev.midi, ev.vel, dur); break;
    case 'bass':     playBass(t, ev.midi, ev.vel, dur); break;
    case 'vibes':    playVibes(t, ev.midi, ev.vel, dur); break;
    case 'clarinet': playClarinet(t, ev.midi, ev.vel, dur); break;
    case 'ride':     playRide(t, ev.vel); break;
    case 'bell':     playBell(t, ev.vel); break;
    case 'hat':      playHat(t, ev.vel); break;
    case 'kick':     playKick(t, ev.vel); break;
    case 'snare':    playSnare(t, ev.vel); break;
    case 'rim':      playRim(t, ev.vel); break;
    case 'sweep':    playSweep(t, dur, ev.vel); break;
  }
  emit('note', { inst: ev.inst, midi: ev.midi, vel: ev.vel, t, tEnd: t + dur });
}

function newChorus() {
  const md = MOODS[S.mood];
  if (S.nextKey != null) { S.key = S.nextKey; S.nextKey = null; if (A.drone) A.drone.setPitch(dronePitch()); }
  if (S.template == null || chance(.55)) S.template = pick(md.templates);
  S.prog = decorate(parseProg(S.template, S.key), md.subs);
  S.barIndex = 0;
  S.chorus++;
  if (S.forceMod || chance(md.modulate)) {          // plan the modulation now: the last bar becomes a ii–V into the new key
    S.forceMod = false;
    S.nextKey = mod12(S.key + weighted([[5, 3], [9, 1], [3, 1], [2, 1]]));
    S.prog[S.prog.length - 1] = pivotChords(S.nextKey, md.minor);
  }
  if (md.bass === 'pedal') S.bassSt.riff = pick(RIFFS);
}

function enterMood(name, live) {
  const md = MOODS[name], prev = S.mood;
  S.mood = name; S.pending = null;
  S.key = pick(md.keys); S.nextKey = null; S.template = null; S.chorus = -1; S.forceMod = false;
  S.targetBpm = md.bpm; S.targetSwing = md.swing;
  if (!live) { S.bpm = md.bpm; S.swing = md.swing; }
  S.mel = { prev: null, dir: 1, active: 0, rest: live ? 1 : 0, phraseLen: 0, motif: null, lead: 'piano', melRest: true };
  S.bassSt = { last: null, riff: RIFFS[0] };
  S.comp = { voicing: null, stab: 0, melRest: true };
  newChorus();
  S.pivot = (live && prev) ? pivotChords(S.key, md.minor) : null;
  if (A.ctx) applyMoodAudio(md);
  emit('mood', { mood: name, from: prev });
}

function applyMoodAudio(md) {
  const t = A.ctx.currentTime;
  A.revGain.gain.setTargetAtTime(md.reverb * .6, t, 1);
  A.revIn.frequency.setTargetAtTime(md.revCut, t, 1);
  if (md.extras.includes('drone')) startDrone(dronePitch()); else stopDrone();
}

function scheduleBar() {
  const barStart = S.nextBarTime;
  if (S.pending && S.pending !== S.mood) enterMood(S.pending, true);
  S.bpm += (S.targetBpm - S.bpm) * .4;
  if (Math.abs(S.targetBpm - S.bpm) < .5) S.bpm = S.targetBpm;
  S.swing += (S.targetSwing - S.swing) * .4;
  const md = MOODS[S.mood];
  const beats = md.beats, beatDur = 60 / S.bpm;
  let bar, phraseBar, nextChord;
  if (S.pivot) {
    bar = S.pivot; S.pivot = null; phraseBar = -1;
    nextChord = tonicChord(S.nextKey ?? S.key, md.minor);
  } else {
    if (S.barIndex >= S.prog.length) newChorus();
    bar = S.prog[S.barIndex]; phraseBar = S.barIndex;
    const last = S.barIndex === S.prog.length - 1;
    nextChord = (last && S.nextKey != null) ? tonicChord(S.nextKey, md.minor) : S.prog[(S.barIndex + 1) % S.prog.length][0];
  }
  const cx = {
    chords: bar, nextChord, beats, md, phraseBar, absBar: S.absBar, key: S.key,
    release: md.bass === 'pedal' && (phraseBar < 0 || phraseBar % 4 === 3),   // the ostinato lets go every fourth bar
  };
  const events = [...bassPart(cx, S.bassSt), ...drumsPart(cx), ...melodyPart(cx, S.mel)];
  S.comp.melRest = S.mel.melRest;
  events.push(...compPart(cx, S.comp), ...extrasPart(cx, S.comp));
  for (const ev of events) playEvent(ev, barStart, beatDur, S.swing);
  S.curChords = bar; S.curBarStart = barStart; S.beatDur = beatDur; S.curPhraseBar = phraseBar;
  emit('bar', barInfo());
  S.nextBarTime = barStart + beats * beatDur;
  if (phraseBar >= 0) S.barIndex++;
  S.absBar++;
}

function barInfo() {
  const md = MOODS[S.mood];
  const name = c => chordName(c, S.key, md.minor);
  return {
    mood: S.mood, label: md.label, minor: md.minor,
    key: S.key, keyName: noteName(S.key, S.key, md.minor) + (md.minor ? ' minor' : ' major'),
    bpm: Math.round(S.bpm), swing: S.swing, beats: md.beats, beatDur: S.beatDur, barStart: S.curBarStart,
    chords: S.curChords.map(name), phraseBar: S.curPhraseBar, chorus: S.chorus,
    chart: S.prog.map(b => b.map(c => ({ name: name(c), sub: c.sub || null }))), lead: S.mel.lead, resting: S.mel.melRest,
    nextKey: S.nextKey == null ? null : noteName(S.nextKey, S.nextKey, md.minor) + (md.minor ? ' minor' : ' major'),
  };
}

function tick() {
  if (!S.running || !A.ctx) return;
  const now = A.ctx.currentTime;
  let guard = 0;
  while (S.nextBarTime < now + LOOKAHEAD && guard++ < 4) scheduleBar();
  if (S.patina > 0 && chance(.12 * S.patina)) crackle(now + .02 + rand() * .02, S.patina);
}

function start(mood) {
  if (S.running) { if (mood) setMood(mood); return; }
  if (!A.ctx) { buildGraph(); setPatina(S.patina); }
  const ctx = A.ctx;
  if (ctx.state === 'suspended') ctx.resume();
  enterMood((mood && MOODS[mood]) ? mood : (S.pending || S.mood || 'workshop'), false);
  S.running = true;
  S.nextBarTime = ctx.currentTime + .25;
  A.master.gain.cancelScheduledValues(ctx.currentTime);
  A.master.gain.setTargetAtTime(S.volume, ctx.currentTime, .4);
  S.timer = setInterval(tick, TICK_MS);
  tick();
}

function stop() {
  if (!S.running) return;
  S.running = false;
  clearInterval(S.timer); S.timer = null;
  const t = A.ctx.currentTime;
  A.master.gain.cancelScheduledValues(t);
  A.master.gain.setTargetAtTime(0, t, .25);
  stopDrone();
}

function setMood(name) {
  if (!MOODS[name]) throw new Error('The Composing Room has no mood called ' + name);
  if (!S.running) { S.pending = name; return; }
  S.pending = name === S.mood ? null : name;
}

/* Off-grid flourishes for game events. Each is spelled in the current key, so
 * it lands as a remark inside the music rather than a sound effect over it. */
function cue(name) {
  if (!A.ctx || !S.running) return;
  const t = A.ctx.currentTime + .03;
  const md = MOODS[S.mood];
  const k = S.key > 6 ? S.key - 12 : S.key;
  switch (name) {
    case 'good': {                                  // a rising 6/9 arpeggio at the top of the piano
      const steps = md.minor ? [0, 3, 7, 9, 12, 14, 19] : [0, 4, 7, 9, 12, 14, 16];
      steps.forEach((s, i) => playPiano(t + i * .055, 72 + k + s, .48 + i * .02, 1.6 - i * .1));
      break;
    }
    case 'bad': {                                   // a low diminished cluster, a rimshot, a kick
      [0, 3, 6, 9].forEach(s => playPiano(t, 46 + k + s, .62, 1.2));
      playRim(t, .8); playKick(t, .7);
      break;
    }
    case 'hire': {                                  // the vibes: an open fifth and a ninth
      playVibes(t, 67 + k, .45, 2.5); playVibes(t + .06, 74 + k, .4, 2.5); playVibes(t + .12, 81 + k, .35, 2.5);
      playPiano(t, 55 + k, .3, 2);
      break;
    }
    case 'page': {                                  // one high note: the ninth of whatever is sounding
      const ch = S.curChords[0] || tonicChord(S.key, md.minor);
      const m = inRange(nearest(mod12(ch.root + 2), 86), 82, 93);
      playPiano(t, m - 7, .3, .3); playPiano(t + .09, m, .42, .9);
      break;
    }
    case 'turn': {                                  // a brush sweep and the bell of the ride
      playSweep(t, .7, .8); playBell(t + .5, .7);
      break;
    }
  }
}

const Music = {
  moods: Object.keys(MOODS).map(id => ({ id, label: MOODS[id].label, blurb: MOODS[id].blurb, extras: MOODS[id].extras.slice() })),
  start, stop, setMood, cue,
  get running() { return S.running; },
  get mood() { return S.mood; },
  get pending() { return S.pending; },
  setVolume(v) { S.volume = clamp(v, 0, 1); if (A.ctx && S.running) A.master.gain.setTargetAtTime(S.volume, A.ctx.currentTime, .1); },
  setPatina(a) { S.patina = clamp(a, 0, 1); setPatina(S.patina); },
  setLevel(bus, v) { const b = A.bus[bus]; if (!b) return; b.level = clamp(v, 0, 1.5); if (!b.muted) b.g.gain.setTargetAtTime(b.level, A.ctx.currentTime, .05); },
  mute(bus, on) { const b = A.bus[bus]; if (!b) return; b.muted = !!on; b.g.gain.setTargetAtTime(on ? 0 : b.level, A.ctx.currentTime, .05); },
  modulate() {                                      // take it somewhere else at the next bar line
    if (!S.running) return;
    const md = MOODS[S.mood];
    S.nextKey = mod12(S.key + weighted([[5, 3], [9, 1], [3, 1], [2, 1]]));
    S.pivot = pivotChords(S.nextKey, md.minor);
    S.barIndex = S.prog.length;
    S.template = null;
  },
  on(kind, cb) { (listeners[kind] || (listeners[kind] = [])).push(cb); return () => Music.off(kind, cb); },
  off(kind, cb) { const l = listeners[kind]; if (!l) return; const i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); },
  state: () => S.mood ? barInfo() : null,
  now: () => A.ctx ? A.ctx.currentTime : 0,
  levels: () => Object.fromEntries(Object.entries(A.bus).map(([k, b]) => [k, { level: b.level, muted: b.muted }])),
  seed(n) { seed = n >>> 0; },
  _internals: { MOODS, QUAL, voice, parseProg, decorate, tick, S, A },
};
window.Music = Music;
})();
