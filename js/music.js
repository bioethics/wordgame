/* ═══ THE COMPOSING ROOM — a generative jazz house band for Great Work ════════
 *
 * No samples, no audio files. Everything below is synthesised on the fly with
 * the Web Audio API, and what gets played is decided bar by bar from a small
 * body of music theory: functional harmony in a chosen key, piano voicings
 * chosen by voice-leading distance (rootless Evans shapes, Powell shells,
 * So What quartals, five-voice ballad chords), walking bass built from chord
 * tones and approach notes, and a right hand that thinks in phrases: anchor
 * tones on the strong beats, bebop line-filling between them, licks, motifs
 * remembered and sequenced through the next chord.
 *
 * Every mood writes itself a HEAD when it starts — an eight-bar theme over the
 * plain chart — and plays it at the top and every third chorus, with solos
 * over the decorated chart in between. That is what makes a mood a tune.
 *
 * Seventeen moods in five families (see MOODS). Mood changes wait for the
 * two-bar phrase, then play a BREAK: one hit on the V of the new key, silence,
 * the hi-hat counting two beats in the new tempo under a pickup line, and the
 * new band walks in on the downbeat.
 *
 * Usage:
 *   Music.start('workshop')             // first call needs a user gesture
 *   Music.setMood('editor')             // at the phrase; { now: true } for the next bar
 *   Music.cue('good')                   // an off-grid flourish, in the current key
 *   Music.stop()
 *
 * The scheduler follows the "two clocks" pattern: a coarse JS timer looks a
 * little way ahead and hands whole bars to the sample-accurate audio clock.
 */
(function () {
'use strict';

/* ─── Chance ─────────────────────────────────────────────────────────────────── */
let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
function rand() {                       // mulberry32
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = p => rand() < p;
const pick = arr => arr[Math.floor(rand() * arr.length)];
function weighted(pairs) {
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
const SHARP_MAJOR = [7, 2, 9, 4, 11], SHARP_MINOR = [4, 11, 6, 1, 8];
function noteName(pc, key, minor) {
  return ((minor ? SHARP_MINOR : SHARP_MAJOR).includes(key) ? SHARPS : FLATS)[mod12(pc)];
}
const keyName = (key, minor) => noteName(key, key, minor) + (minor ? ' minor' : ' major');

/* ─── Chord qualities ────────────────────────────────────────────────────────────
 * scale     the chord-scale the right hand improvises on (semitones from root)
 * bebop     the passing tone that turns it into an eight-note bebop scale, so
 *           that chord tones land on the beats when a line runs down through it
 * tones     landing notes for a strong beat
 * third/seventh  the two notes a Powell shell is made of
 * voicings  rootless left-hand shapes, the Evans A and B forms
 * quartal   stacks of fourths, the So What sound
 */
const QUAL = {
  maj7:    { sym: 'Δ7',    third: 4, seventh: 11, scale: [0, 2, 4, 5, 7, 9, 11],    bebop: 8,  tones: [0, 4, 7, 11, 14],  voicings: [[4, 7, 11, 14], [11, 14, 16, 19]], quartal: [[2, 7, 11, 16], [4, 9, 14, 19]] },
  maj7s11: { sym: 'Δ7♯11', third: 4, seventh: 11, scale: [0, 2, 4, 6, 7, 9, 11],    bebop: 8,  tones: [0, 4, 7, 11, 18],  voicings: [[4, 7, 11, 18], [11, 14, 18, 19]], quartal: [[2, 6, 11, 16], [6, 11, 16, 21]] },
  maj6:    { sym: '6',     third: 4, seventh: 9,  scale: [0, 2, 4, 5, 7, 9, 11],    bebop: 8,  tones: [0, 4, 7, 9, 14],   voicings: [[4, 7, 9, 14],  [9, 14, 16, 19]],  quartal: [[2, 7, 9, 14], [4, 9, 14, 19]] },
  min7:    { sym: 'm7',    third: 3, seventh: 10, scale: [0, 2, 3, 5, 7, 9, 10],    bebop: 4,  tones: [0, 3, 7, 10, 14],  voicings: [[3, 7, 10, 14], [10, 14, 15, 19]], quartal: [[2, 7, 12, 17], [5, 10, 15, 19]] },
  min6:    { sym: 'm6',    third: 3, seventh: 9,  scale: [0, 2, 3, 5, 7, 9, 11],    bebop: 8,  tones: [0, 3, 7, 9, 14],   voicings: [[3, 7, 9, 14],  [9, 14, 15, 19]] },
  minMaj7: { sym: 'mΔ7',   third: 3, seventh: 11, scale: [0, 2, 3, 5, 7, 9, 11],    bebop: 8,  tones: [0, 3, 7, 11, 14],  voicings: [[3, 7, 11, 14], [11, 14, 15, 19]] },
  dom7:    { sym: '7',     third: 4, seventh: 10, scale: [0, 2, 4, 5, 7, 9, 10],    bebop: 11, tones: [0, 4, 7, 10, 14],  voicings: [[4, 9, 10, 14], [10, 14, 16, 21]], quartal: [[4, 9, 14, 19], [10, 16, 21, 26]] },
  dom7sus: { sym: '7sus',  third: 5, seventh: 10, scale: [0, 2, 4, 5, 7, 9, 10],    bebop: 11, tones: [0, 5, 7, 10, 14],  voicings: [[5, 10, 14, 17], [10, 14, 17, 21]], quartal: [[5, 10, 14, 19], [10, 14, 19, 24]] },
  dom7b9:  { sym: '7♭9',   third: 4, seventh: 10, scale: [0, 1, 3, 4, 6, 7, 9, 10], bebop: null, tones: [0, 4, 7, 10, 13], voicings: [[4, 7, 10, 13], [10, 13, 16, 19]] },
  dom7alt: { sym: '7alt',  third: 4, seventh: 10, scale: [0, 1, 3, 4, 6, 8, 10],    bebop: null, tones: [0, 4, 10, 15, 20], voicings: [[4, 8, 10, 15], [10, 15, 16, 20]], quartal: [[10, 15, 20, 25], [4, 8, 13, 18]] },
  min7b5:  { sym: 'ø7',    third: 3, seventh: 10, scale: [0, 2, 3, 5, 6, 8, 10],    bebop: null, tones: [0, 3, 6, 10],     voicings: [[3, 6, 10, 14], [10, 14, 15, 18]] },
  dim7:    { sym: '°7',    third: 3, seventh: 9,  scale: [0, 2, 3, 5, 6, 8, 9, 11], bebop: null, tones: [0, 3, 6, 9],      voicings: [[3, 6, 9, 14],  [9, 14, 15, 18]] },
};
const BLUES_DOM = [0, 2, 3, 4, 5, 6, 7, 9, 10];       // mixolydian with the ♭3 and ♭5 let in
const isMinorQ = q => q.startsWith('min');
const isDomQ   = q => q.startsWith('dom');

function chordName(ch, key, minor) { return noteName(ch.root, key, minor) + QUAL[ch.q].sym; }
function chordTones(ch) { return QUAL[ch.q].tones.map(i => mod12(ch.root + i)); }
/* the scale a line moves through: bebop adds the passing tone, blue lets the
 * flat third and fifth into a dominant chord */
function chordScale(ch, flavour) {
  const Q = QUAL[ch.q];
  let sc = Q.scale;
  if (flavour === 'blue' && ch.q === 'dom7') sc = BLUES_DOM;
  else if (flavour === 'bebop' && Q.bebop != null) sc = [...sc, Q.bebop].sort((a, b) => a - b);
  return sc.map(i => mod12(ch.root + i));
}

function nearest(pc, ref) {             // the midi note of pitch class pc nearest ref
  let m = ref + mod12(pc - ref);
  if (m - ref > 6) m -= 12;
  return m;
}
function inRange(m, lo, hi) { while (m < lo) m += 12; while (m > hi) m -= 12; return m; }
function snapToScale(m, scalePcs) {     // nearest scale tone, ties downward
  for (let d = 0; d < 7; d++) {
    if (scalePcs.includes(mod12(m - d))) return m - d;
    if (scalePcs.includes(mod12(m + d))) return m + d;
  }
  return m;
}
function scaleWalk(a, b, scalePcs) {    // scale tones strictly between a and b, from a toward b
  const out = [], step = b > a ? 1 : -1;
  for (let m = a + step; m !== b; m += step) if (scalePcs.includes(mod12(m))) out.push(m);
  return out;
}

/* ─── Voicing by voice leading ───────────────────────────────────────────────────
 * Every shape in every octave whose bottom note sits inside [lo, hi] is a
 * candidate; the winner is the one whose notes move least from the last
 * chord's. mode: rootless | shell | quartal | lush | crunch
 */
function voice(ch, prev, lo, hi, mode) {
  const Q = QUAL[ch.q];
  let shapes;
  if (mode === 'shell') shapes = [[0, Q.seventh], [0, Q.third], [Q.third, Q.seventh], [Q.third, Q.seventh + 12]];
  else if (mode === 'quartal' && Q.quartal) shapes = Q.quartal;
  else shapes = Q.voicings;
  const cands = [];
  for (const tpl of shapes) {
    for (let oct = 12; oct <= 84; oct += 12) {
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
  const sc = chordScale(ch);
  if (mode === 'lush' || (mode === 'quartal' && ch.q === 'min7')) {   // a fifth voice on top
    let m = v[v.length - 1] + (mode === 'quartal' ? 4 : 3);
    while (!sc.includes(mod12(m))) m++;
    v = [...v, m];
  }
  if (mode === 'crunch' && chance(0.6)) {                             // Monk: a minor second in the chord
    const top = v[v.length - 1];
    v = isDomQ(ch.q) ? [...v, nearest(mod12(ch.root + 1), top + 3)] : [...v.slice(0, -1), top - 1, top];
    v.sort((a, b) => a - b);
  }
  return v;
}

/* ─── Progressions ───────────────────────────────────────────────────────────────
 * Templates are semitone offsets from the tonic plus a quality, bars split by
 * '|', two chords in a bar split by a space. '0maj7 | 9min7' is I – vi.
 */
function parseProg(str, key) {
  return str.split('|').map(bar => bar.trim().split(/\s+/).filter(Boolean).map(tok => {
    const m = /^(\d+)([A-Za-z0-9]+)$/.exec(tok);
    if (!m || !QUAL[m[2]]) throw new Error('bad chord token ' + tok);
    return { root: mod12(key + Number(m[1])), q: m[2] };
  }));
}
function pivotChords(key, minor) {
  return minor
    ? [{ root: mod12(key + 2), q: 'min7b5' }, { root: mod12(key + 7), q: 'dom7alt' }]
    : [{ root: mod12(key + 2), q: 'min7' },   { root: mod12(key + 7), q: 'dom7' }];
}
const dominantOf = (key, minor) => ({ root: mod12(key + 7), q: minor ? 'dom7alt' : 'dom7' });
const tonicChord = (key, minor) => ({ root: key, q: minor ? 'min6' : 'maj7' });

/* Substitutions, applied fresh to every solo chorus: tritone subs on dominants
 * resolving down a fifth (never on the top of the chorus), ♭9 or altered colour
 * on dominants headed for minor chords, the minor-iv on a IV going home, and
 * secondary dominants tucked into the back half of a bar. */
function decorate(bars, subs) {
  const out = bars.map(b => b.map(c => ({ ...c })));
  const flat = [];
  out.forEach(bar => bar.forEach(c => flat.push(c)));
  for (let i = 0; i < flat.length; i++) {
    const cur = flat[i], next = flat[(i + 1) % flat.length];
    const downFifth = mod12(cur.root + 5) === next.root;
    if (cur.q === 'dom7' && downFifth) {
      if (i > 0 && chance(subs.tritone))     { cur.root = mod12(cur.root + 6); cur.sub = 'tritone'; }
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
    if (target.q === 'dim7' || isDomQ(bar[0].q) || target.root === bar[0].root) continue;
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
 * of things a player would play, never a random sprinkle.
 */
const C = (len, w, n) => ({ len, w, n });
const TRIP = [[0, 1 / 3], [1 / 3, 1 / 3], [2 / 3, 1 / 3]];
const RUN4 = [[0, .5], [.5, .5], [1, .5], [1.5, .5]];
const CELLS = {
  swing:   [C(1, 5, [[0, .5], [.5, .5]]), C(1, 3, [[0, 1]]), C(1, 2, [[.5, .5]]), C(1, 1.2, TRIP), C(1, 1.5, []),
            C(2, 2, [[0, 1.5], [1.5, .5]]), C(2, 2.5, [[0, .5], [.5, 1.5]]), C(2, 1.5, [[.5, 1.5]]), C(2, 1, [[0, 2]])],
  bebop:   [C(1, 6, [[0, .5], [.5, .5]]), C(2, 5, RUN4), C(1, 1, TRIP), C(1, .8, [[.5, .5]]), C(1, .5, []),
            C(2, .8, [[.5, 1.5]]), C(1, .8, [[0, 1]]), C(2, 1, [[0, .5], [.5, .5], [1, 1]])],
  ballad:  [C(1, 2, [[0, 1]]), C(2, 4, [[0, 2]]), C(2, 2, [[0, 1.5], [1.5, .5]]), C(2, 2.5, [[.5, 1.5]]),
            C(1, 2, [[0, .5], [.5, .5]]), C(1, 3, []), C(3, 2, [[0, 3]]), C(4, 1, [[0, 4]]), C(1, 1, TRIP)],
  bounce:  [C(1, 5, [[0, .5], [.5, .5]]), C(1, 2, [[0, 1]]), C(2, 3, [[0, .5], [.5, 1.5]]), C(2, 2, [[0, 1.5], [1.5, .5]]),
            C(1, 1, []), C(1, 1.5, [[.5, .5]]), C(1, 1, TRIP), C(2, 1, [[0, 2]]), C(2, 1.5, RUN4)],
  smoky:   [C(1, 3, [[0, .5], [.5, .5]]), C(1, 2, [[0, 1]]), C(2, 3, [[.5, 1.5]]), C(2, 2, [[0, 1.5], [1.5, .5]]),
            C(1, 2, []), C(2, 2, [[0, 2]]), C(1, 1.5, TRIP), C(3, 1, [[0, 3]])],
  tense:   [C(1, 5, [[0, .5], [.5, .5]]), C(1, 2.5, TRIP), C(1, 1.5, [[.5, .5]]), C(1, 1, []), C(2, 1.5, [[.5, 1.5]]),
            C(1, 1, [[0, 1]]), C(2, 2, RUN4)],
  angular: [C(1, 2, [[0, .5], [.5, .5]]), C(1, 3, [[.5, .5]]), C(1, 2.5, []), C(2, 2, [[.5, .5], [1.5, .5]]), C(1, 1.5, [[0, 1]]),
            C(2, 1, [[0, .5], [1, .5], [1.5, .5]]), C(2, 1.5, [[.5, 1.5]]), C(1, 1, TRIP), C(2, 1, [[0, 2]])],
  rag:     [C(1, 4, [[0, .5], [.5, .5]]), C(1, 3, [[0, .25], [.25, .5], [.75, .25]]), C(1, 2, [[0, .5], [.5, .25], [.75, .25]]),
            C(2, 2, [[0, .5], [.5, 1], [1.5, .5]]), C(1, 1.5, [[0, 1]]), C(2, 1, [[0, 2]]), C(1, .5, []), C(2, 2, RUN4)],
  modal:   [C(1, 4, [[0, .5], [.5, .5]]), C(1, 2, [[0, 1]]), C(2, 2, [[0, .5], [.5, .5], [1, 1]]), C(2, 2, [[.5, 1.5]]),
            C(1, 1.5, []), C(2, 1, [[0, 2]]), C(1, 1, TRIP), C(2, 1, [[0, 1.5], [1.5, .5]]), C(2, 2, RUN4)],
  waltz:   [C(3, 3, [[0, 2], [2, 1]]), C(3, 2, [[0, 1], [1, 1], [2, 1]]), C(3, 2, [[0, 3]]), C(1, 2, [[0, .5], [.5, .5]]),
            C(1, 1.5, [[0, 1]]), C(1, 1, []), C(2, 1.5, [[0, 1.5], [1.5, .5]]), C(2, 1, [[.5, 1.5]])],
};

/* bass ostinati: [beat, semitones above the pedal note] */
const RIFFS = {
  four: [
    [[0, 0], [.5, 0], [1.5, 10], [2, 0], [3, 7], [3.5, 10]],
    [[0, 0], [1, 3], [1.5, 5], [2, 6], [2.5, 5], [3, 3]],
    [[0, 0], [.5, 12], [1, 0], [2, 0], [2.5, 10], [3, 6], [3.5, 7]],
  ],
  five: [
    [[0, 0], [1, 7], [2, 10], [3, 0], [3.5, 3], [4, 7]],
    [[0, 0], [.5, 0], [1, 3], [2, 5], [3, 0], [4, 10]],
    [[0, 0], [1, 7], [1.5, 12], [2, 10], [3, 7], [4, 5], [4.5, 3]],
  ],
};

/* ─── Moods ─────────────────────────────────────────────────────────────────────
 * family     which room of the game this belongs to
 * bpm/swing  swing is the position of the upbeat inside the beat: .5 straight,
 *            .667 a triplet feel; old records sit in between
 * beats      per bar: 3, 4 or 5
 * keys       candidate tonics; flat keys for the horn-band moods
 * templates  charts, offsets from the tonic (see parseProg); 8, 12 or 16 bars
 * subs       how often each substitution fires on a solo chorus
 * bass       walk | two | pedal | none        drums   ride | bebop | brushes | two | smoky | tense | cool | waltz | five | none
 * comp       charleston | shells | ballad | stride | stabs | quartal | arpeggio | tremolo
 * voicing    rootless | shell | quartal | lush | crunch    voiceLo/Hi  where the bottom voice may sit
 * flavour    bebop | blue | null   — what the lines run through
 * melody     register, vocabulary, phrase/rest lengths in bars, base velocity,
 *            grace-note chance, licks and their odds, who plays the tune
 * head       whether the mood writes and plays a theme
 * feel       timing offsets in seconds, by part: + is behind the beat
 */
const M8 = {                                                       // recurring charts
  turnaround:   '0maj7 | 9min7 | 2min7 | 7dom7 | 4min7 | 9dom7 | 2min7 | 7dom7',
  dimPassing:   '0maj7 | 1dim7 | 2min7 | 7dom7 | 0maj7 9dom7 | 5maj7 5min6 | 4min7 9dom7 | 2min7 7dom7',
  leaves:       '2min7 | 7dom7 | 0maj7 | 5maj7 | 11min7b5 | 4dom7b9 | 9min7 | 2min7 7dom7',
  backdoor:     '0maj7 | 10dom7 | 0maj7 | 10dom7 | 5maj7 | 5min6 | 0maj7 4min7 | 2min7 7dom7',
  confirmation: '0maj7 | 11min7b5 4dom7b9 | 9min7 2dom7 | 7min7 0dom7 | 5dom7 | 4min7 9dom7 | 2min7 | 7dom7',
  rhythmA:      '0maj6 9min7 | 2min7 7dom7 | 0maj6 9min7 | 2min7 7dom7 | 0maj6 0dom7 | 5maj6 6dim7 | 0maj6 7dom7 | 0maj6 7dom7',
  rhythmB:      '4dom7 | 4dom7 | 9dom7 | 9dom7 | 2dom7 | 2dom7 | 7dom7 | 7dom7',
  georgia:      '9dom7 | 9dom7 | 2dom7 | 2dom7 | 7dom7 | 7dom7 | 0maj6 | 0maj6 7dom7',
  alice:        '0maj7 | 11min7b5 4dom7b9 | 9min7 2dom7 | 7min7 0dom7 | 5dom7 | 5min7 10dom7 | 4min7 9dom7 | 3min7 8dom7 | 2min7 | 7dom7 | 0maj7 9min7 | 2min7 7dom7',
  blues:        '0dom7 | 5dom7 | 0dom7 | 7min7 0dom7 | 5dom7 | 5dom7 | 0dom7 | 4min7 9dom7 | 2min7 | 7dom7 | 0dom7 9dom7 | 2min7 7dom7',
  bluesPlain:   '0dom7 | 5dom7 | 0dom7 | 0dom7 | 5dom7 | 6dim7 | 0dom7 | 9dom7 | 2min7 | 7dom7 | 0dom7 | 7dom7',
  minorBlues:   '0min6 | 0min6 | 0min6 | 0min7 | 5min7 | 5min7 | 0min6 | 0min6 | 8dom7 | 7dom7alt | 0min6 | 7dom7alt',
  cliche:       '0minMaj7 | 0min7 | 0min6 | 8maj7 | 2min7b5 | 7dom7alt | 0min6 | 2min7b5 7dom7b9',
};
const SUBS = {
  none:  { tritone: 0,   alt: 0,  minorIV: 0,   secondary: 0 },
  light: { tritone: .12, alt: .05, minorIV: .2, secondary: .1 },
  full:  { tritone: .25, alt: .12, minorIV: .25, secondary: .18 },
  dark:  { tritone: .3,  alt: .45, minorIV: 0,   secondary: .1 },
};
const FEEL = { jazz: { bass: .008, ride: -.004, melody: .01 }, lazy: { bass: .014, ride: 0, melody: .02 }, tight: { bass: .002, ride: -.006, melody: .004 }, none: {} };
const mel = (o) => Object.assign({ lo: 67, hi: 86, cells: CELLS.swing, phrase: [2, 3, 3, 4], rest: [1, 2, 2], vel: .5, grace: .08, lead: 'piano', leadChance: 1, licks: {} }, o);

const MOODS = {
  /* ── The Workshop: the game's default table, laid back but literate ── */
  workshop: {
    family: 'Workshop', label: 'The Workshop', blurb: 'Medium bebop, trio. Powell shells under the lines, brushes on the ride, room to think.',
    bpm: 132, swing: .64, beats: 4, minor: false, keys: [5, 10, 3, 7, 8],
    templates: [M8.turnaround, M8.dimPassing, M8.leaves, M8.backdoor, M8.confirmation],
    subs: SUBS.full, bass: 'walk', drums: 'ride', comp: 'shells', voicing: 'shell', voiceLo: 43, voiceHi: 53, flavour: 'bebop',
    melody: mel({ lo: 65, hi: 86, cells: CELLS.bebop, phrase: [2, 3, 4], rest: [1, 2, 2], vel: .5, licks: { arp: .18, enclosure: .12 } }),
    extras: [], reverb: .45, revCut: 5500, modulate: .3, head: true, feel: FEEL.jazz,
  },
  bebop: {
    family: 'Workshop', label: 'The Press Run', blurb: 'Up-tempo bebop. Rhythm changes and Bird blues, sticks on the ride, bombs from the kit, lines that do not stop for breath.',
    bpm: 196, swing: .6, beats: 4, minor: false, keys: [10, 5, 3, 0, 8],
    templates: [M8.rhythmA, M8.rhythmB, M8.alice, M8.confirmation],
    subs: SUBS.full, bass: 'walk', drums: 'bebop', comp: 'shells', voicing: 'shell', voiceLo: 43, voiceHi: 53, flavour: 'bebop',
    melody: mel({ lo: 64, hi: 88, cells: CELLS.bebop, phrase: [2, 4, 4, 6], rest: [1, 1, 2], vel: .56, grace: .05, licks: { arp: .25, enclosure: .18 } }),
    extras: [], reverb: .35, revCut: 6000, modulate: .35, head: true, feel: FEEL.tight,
  },
  cool: {
    family: 'Workshop', label: 'The Reading Room', blurb: 'Cool school. Straighter eighths, quartal chords, the bass in two, brushes; lydian and unhurried.',
    bpm: 116, swing: .56, beats: 4, minor: false, keys: [0, 5, 3, 7, 10],
    templates: [
      '0maj7s11 | 0maj7s11 | 5maj7s11 | 5maj7s11 | 2min7 | 7dom7sus | 0maj7 | 9min7',
      '0maj7 | 3maj7s11 | 8maj7 | 1maj7s11 | 0maj7 | 10maj7s11 | 5maj7 | 7dom7sus',
      '2min7 | 7dom7 | 0maj7s11 | 0maj7s11 | 4min7 | 9dom7 | 2min7 | 7dom7sus',
    ],
    subs: SUBS.light, bass: 'two', drums: 'cool', comp: 'quartal', voicing: 'quartal', voiceLo: 50, voiceHi: 60, flavour: null,
    melody: mel({ lo: 65, hi: 84, cells: CELLS.modal, phrase: [2, 2, 3], rest: [1, 2, 2], vel: .42, grace: .04 }),
    extras: ['vibes'], reverb: .55, revCut: 5000, modulate: .25, head: true, feel: FEEL.lazy,
  },
  modal: {
    family: 'Workshop', label: 'The Long Gallery', blurb: 'Modal. One chord for eight bars, So What voicings, a walking bass with nowhere it has to be.',
    bpm: 138, swing: .62, beats: 4, minor: true, keys: [2, 0, 4, 9, 7],
    templates: [
      '0min7 | 0min7 | 0min7 | 0min7 | 0min7 | 0min7 | 0min7 | 0min7 | 1min7 | 1min7 | 1min7 | 1min7 | 0min7 | 0min7 | 0min7 | 0min7',
      '0min7 | 0min7 | 0min7 | 0min7 | 5min7 | 5min7 | 0min7 | 0min7 | 10dom7sus | 10dom7sus | 0min7 | 0min7 | 5min7 | 5min7 | 0min7 | 0min7',
    ],
    subs: SUBS.none, bass: 'walk', drums: 'ride', comp: 'quartal', voicing: 'quartal', voiceLo: 50, voiceHi: 60, flavour: null,
    melody: mel({ lo: 62, hi: 86, cells: CELLS.modal, phrase: [2, 4, 4], rest: [1, 2, 2], vel: .48, grace: .04, licks: { arp: .1 } }),
    extras: [], reverb: .45, revCut: 5500, modulate: .15, head: true, feel: FEEL.jazz,
  },
  blues: {
    family: 'Workshop', label: 'The Late Shift', blurb: 'A slow blues, twelve bars, triplet feel. The flat third and fifth let into the lines; the piano leans on the beat.',
    bpm: 72, swing: .68, beats: 4, minor: false, keys: [5, 10, 3, 0, 7],
    templates: [M8.blues, M8.bluesPlain],
    subs: SUBS.light, bass: 'walk', drums: 'ride', comp: 'charleston', voicing: 'rootless', voiceLo: 48, voiceHi: 58, flavour: 'blue',
    melody: mel({ lo: 60, hi: 84, cells: CELLS.smoky, phrase: [2, 2, 4], rest: [1, 2, 2], vel: .5, grace: .14, licks: { blues: .25, hammer: .08 } }),
    extras: [], reverb: .5, revCut: 5000, modulate: .12, head: true, feel: FEEL.lazy,
  },

  /* ── Calm ── */
  calm: {
    family: 'Calm', label: 'Calm', blurb: 'A ballad at sixty. Half-note bass, brush sweeps, a vibraphone, five-voice chords rolled slowly.',
    bpm: 60, swing: .6, beats: 4, minor: false, keys: [1, 3, 8, 5, 6],
    templates: [
      '0maj7 | 5maj7 | 4min7 | 9min7 | 2min7 | 7dom7sus | 0maj7 | 5min6',
      '0maj7 | 10maj7s11 | 5maj7 | 5min6 | 0maj7 | 9min7 | 2min7 | 7dom7sus',
      '0maj7 | 9min7 | 5maj7 | 7dom7sus | 4min7 | 1maj7s11 | 2min7 | 7dom7sus',
      '0maj7 | 2min7 | 4min7 | 5min6 | 0maj7 | 8maj7s11 | 10dom7 | 7dom7sus',
    ],
    subs: { tritone: .05, alt: 0, minorIV: .3, secondary: .05 }, bass: 'two', drums: 'brushes', comp: 'ballad', voicing: 'lush', voiceLo: 48, voiceHi: 58, flavour: null,
    melody: mel({ lo: 72, hi: 91, cells: CELLS.ballad, phrase: [1, 2, 2], rest: [1, 2, 2, 3], vel: .36, grace: .04 }),
    extras: ['vibes'], reverb: .95, revCut: 4200, modulate: .25, head: true, feel: FEEL.lazy,
  },
  nocturne: {
    family: 'Calm', label: 'Nocturne', blurb: 'Solo piano, rubato. Broken chords under a slow line, lydian colours, the time breathing a little each bar.',
    bpm: 54, swing: .58, beats: 4, minor: false, keys: [1, 3, 8, 6, 10],
    templates: [
      '0maj7 | 5maj7s11 | 4min7 | 9min7 | 2min7 | 7dom7sus | 0maj7 | 8maj7s11',
      '0maj7 | 9min7 | 5maj7s11 | 5min6 | 0maj7 | 3maj7s11 | 2min7 | 7dom7sus',
      '0maj7 | 2min7 | 4min7 | 5maj7s11 | 0maj7 | 1maj7s11 | 10maj7s11 | 7dom7sus',
    ],
    subs: SUBS.none, bass: 'none', drums: 'none', comp: 'arpeggio', voicing: 'lush', voiceLo: 40, voiceHi: 50, flavour: null, rubato: .1,
    melody: mel({ lo: 72, hi: 93, cells: CELLS.ballad, phrase: [1, 2, 2], rest: [1, 1, 2], vel: .34, grace: .06 }),
    extras: [], reverb: 1, revCut: 4000, modulate: .2, head: true, feel: FEEL.none,
  },
  waltz: {
    family: 'Calm', label: 'The Waltz', blurb: 'A jazz waltz in three. Brushes, the bass on one and three, a vibraphone in the corners; gentle and a little wistful.',
    bpm: 138, swing: .6, beats: 3, minor: false, keys: [5, 10, 3, 8, 0],
    templates: [
      '0maj7 | 0maj7 | 4dom7 | 4dom7 | 9min7 | 9min7 | 2dom7 | 2dom7 | 2min7 | 7dom7 | 0maj7 | 5maj7 | 11min7b5 | 4dom7b9 | 9min7 | 2min7 7dom7',
      '0maj7 | 5maj7 | 0maj7 | 5maj7 | 2min7 | 7dom7 | 0maj7 | 9min7 | 2min7 | 7dom7 | 4min7 | 9dom7 | 2min7 | 7dom7 | 0maj7 | 7dom7sus',
    ],
    subs: SUBS.light, bass: 'two', drums: 'waltz', comp: 'ballad', voicing: 'rootless', voiceLo: 50, voiceHi: 60, flavour: null,
    melody: mel({ lo: 67, hi: 88, cells: CELLS.waltz, phrase: [2, 4, 4], rest: [2, 2, 4], vel: .42, grace: .05 }),
    extras: ['vibes'], reverb: .7, revCut: 4800, modulate: .25, head: true, feel: FEEL.jazz,
  },

  /* ── The Market ── */
  market: {
    family: 'Market', label: 'The Market', blurb: 'Jaunty two-feel. Stride left hand, a clarinet takes the tune, sixth chords and a bass walking up to things.',
    bpm: 144, swing: .6, beats: 4, minor: false, keys: [5, 10, 0, 7, 3],
    templates: [M8.rhythmA, M8.georgia, M8.dimPassing, '0dom7 | 5dom7 | 0dom7 | 0dom7 | 5dom7 | 5dom7 | 0dom7 | 7dom7'],
    subs: SUBS.light, bass: 'two', drums: 'two', comp: 'stride', voicing: 'rootless', voiceLo: 55, voiceHi: 64, flavour: null,
    melody: mel({ lo: 60, hi: 82, cells: CELLS.bounce, phrase: [2, 3, 4, 4], rest: [1, 1, 2], vel: .5, grace: .12, lead: 'clarinet', leadChance: .7, licks: { enclosure: .08 } }),
    extras: ['clarinet'], reverb: .4, revCut: 6000, modulate: .35, head: true, feel: FEEL.jazz,
  },
  hot: {
    family: 'Market', label: 'The Fair', blurb: 'Hot jazz, four to the bar. A muted trumpet and a clarinet trade the tune, riffs behind them, the whole stall bouncing.',
    bpm: 176, swing: .6, beats: 4, minor: false, keys: [10, 5, 3, 8, 0],
    templates: [M8.rhythmA, M8.georgia, '0maj6 | 0maj6 | 0maj6 | 0maj6 | 7dom7 | 7dom7 | 7dom7 | 7dom7 | 0maj6 | 0dom7 | 5maj6 | 6dim7 | 0maj6 7dom7 | 0maj6 9dom7 | 2min7 7dom7 | 0maj6 7dom7'],
    subs: SUBS.light, bass: 'walk', drums: 'two', comp: 'stride', voicing: 'rootless', voiceLo: 55, voiceHi: 64, flavour: null,
    melody: mel({ lo: 60, hi: 82, cells: CELLS.bounce, phrase: [2, 4, 4], rest: [1, 1, 2], vel: .55, grace: .1, lead: 'trumpet', leadChance: .55, licks: { enclosure: .1, hammer: .1 } }),
    extras: ['clarinet', 'trumpet'], reverb: .35, revCut: 6500, modulate: .3, head: true, feel: FEEL.tight,
  },
  rag: {
    family: 'Market', label: 'The Rag', blurb: 'Ragtime, solo piano, straight time. A striding left hand, syncopations in the right, the circle of dominants going round.',
    bpm: 108, swing: .5, beats: 4, minor: false, keys: [0, 5, 10, 3, 7],
    templates: [
      '0maj6 | 0maj6 | 7dom7 | 7dom7 | 7dom7 | 7dom7 | 0maj6 | 0maj6 | 0maj6 | 0dom7 | 5maj6 | 5maj6 | 0maj6 | 7dom7 | 0maj6 | 0maj6',
      '0maj6 | 4dom7 | 9dom7 | 9dom7 | 2dom7 | 2dom7 | 7dom7 | 7dom7 | 0maj6 | 0dom7 | 5maj6 | 6dim7 | 0maj6 | 7dom7 | 0maj6 | 0maj6',
    ],
    subs: SUBS.none, bass: 'none', drums: 'none', comp: 'stride', voicing: 'rootless', voiceLo: 52, voiceHi: 62, flavour: null,
    melody: mel({ lo: 67, hi: 88, cells: CELLS.rag, phrase: [4, 4, 8], rest: [0, 1], vel: .5, grace: .16 }),
    extras: [], reverb: .4, revCut: 5500, modulate: .25, head: true, feel: FEEL.none,
  },

  /* ── The Black Market ── */
  blackmarket: {
    family: 'Black Market', label: 'The Black Market', blurb: 'Slow minor. Line clichés, tritone substitutes, a drone under the floorboards, the vibes shimmering.',
    bpm: 84, swing: .66, beats: 4, minor: true, keys: [0, 7, 5, 2, 10],
    templates: [
      M8.cliche,
      '0min6 | 0min6 | 2min7b5 | 7dom7alt | 0min6 | 8dom7 | 7dom7alt | 0min6',
      '0min7 | 5min7 | 1dom7 | 0min6 | 3maj7 | 8maj7 | 2min7b5 | 7dom7b9',
      '0min6 | 5min7 | 0min6 | 0dom7 | 5min7 | 5min7 | 0min6 8dom7 | 7dom7alt',
    ],
    subs: SUBS.dark, bass: 'walk', drums: 'smoky', comp: 'charleston', voicing: 'rootless', voiceLo: 46, voiceHi: 56, flavour: 'blue',
    melody: mel({ lo: 58, hi: 79, cells: CELLS.smoky, phrase: [2, 2, 3], rest: [1, 2, 3, 3], vel: .42, grace: .1, licks: { blues: .12 } }),
    extras: ['drone', 'vibes'], reverb: .7, revCut: 3600, modulate: .2, head: true, feel: FEEL.lazy,
  },
  noir: {
    family: 'Black Market', label: 'The Alley', blurb: 'Crime jazz. A minor blues, chords trembling in the piano, rim clicks, the drone, the vibes catching light off something.',
    bpm: 96, swing: .64, beats: 4, minor: true, keys: [2, 0, 7, 9, 5],
    templates: [M8.minorBlues, '0min6 | 5min7 | 0min6 | 0dom7b9 | 5min7 | 5min7 | 0min6 | 3dom7 | 2min7b5 | 7dom7alt | 0min6 | 2min7b5 7dom7alt'],
    subs: SUBS.dark, bass: 'walk', drums: 'smoky', comp: 'tremolo', voicing: 'rootless', voiceLo: 48, voiceHi: 58, flavour: 'blue',
    melody: mel({ lo: 58, hi: 80, cells: CELLS.smoky, phrase: [2, 2, 3], rest: [1, 2, 2], vel: .44, grace: .1, licks: { blues: .2, hammer: .1 } }),
    extras: ['drone', 'vibes'], reverb: .65, revCut: 3800, modulate: .15, head: true, feel: FEEL.lazy,
  },
  monk: {
    family: 'Black Market', label: 'The Fence', blurb: 'Angular and sly. Minor seconds inside the chords, whole-tone runs, hammered notes, rests where you expected the next thing.',
    bpm: 112, swing: .66, beats: 4, minor: false, keys: [10, 0, 3, 5],
    templates: [M8.bluesPlain, '0maj6 | 1dom7 | 0maj6 | 8dom7 | 5maj7 | 6dim7 | 0maj6 9dom7 | 2min7 7dom7', M8.backdoor],
    subs: SUBS.light, bass: 'walk', drums: 'ride', comp: 'charleston', voicing: 'crunch', voiceLo: 46, voiceHi: 56, flavour: 'blue',
    melody: mel({ lo: 60, hi: 86, cells: CELLS.angular, phrase: [1, 2, 2, 3], rest: [1, 1, 2], vel: .55, grace: .06, licks: { wholetone: .2, hammer: .15, blues: .08 } }),
    extras: [], reverb: .4, revCut: 5500, modulate: .15, head: true, feel: FEEL.jazz,
  },

  /* ── The Editor ── */
  editor: {
    family: 'Editor', label: 'The Editor', blurb: 'Fast and cornered. A bass ostinato that will not move while the harmony slides above it; stabs in three against four.',
    bpm: 152, swing: .58, beats: 4, minor: true, keys: [2, 0, 4, 9, 5],
    templates: [
      '0min7 | 1maj7 | 0min7 | 7dom7alt | 0min7 | 8dom7 | 1dom7 | 7dom7alt',
      '0min7 | 0min7 | 6min7b5 | 5min7 | 0min7 | 10dom7 | 8maj7 | 7dom7alt',
      '0minMaj7 | 3maj7 | 0minMaj7 | 6dim7 | 0min7 | 1maj7 | 7dom7alt | 7dom7alt',
    ],
    subs: SUBS.dark, bass: 'pedal', riffs: RIFFS.four, drums: 'tense', comp: 'stabs', voicing: 'quartal', voiceLo: 56, voiceHi: 66, flavour: 'bebop',
    melody: mel({ lo: 70, hi: 89, cells: CELLS.tense, phrase: [2, 2, 4], rest: [1, 1, 2], vel: .62, grace: .05, licks: { enclosure: .12, wholetone: .1 } }),
    extras: [], reverb: .3, revCut: 6500, modulate: .15, head: true, feel: FEEL.tight,
  },
  five: {
    family: 'Editor', label: 'The Deadline', blurb: 'Five in a bar. The bass counts three-and-two and will not stop, the ride rides it, quartal hits on one and four. Propulsive, cornered, tidy.',
    bpm: 172, swing: .6, beats: 5, minor: true, keys: [3, 2, 0, 7, 10],
    templates: [
      '0min7 | 7min7 | 0min7 | 7min7 | 0min7 | 7min7 | 0min7 | 7min7',
      '0min7 | 7min7 | 0min7 | 7min7 | 8maj7 | 3dom7 | 8maj7 | 7dom7alt',
    ],
    subs: SUBS.none, bass: 'pedal', riffs: RIFFS.five, riffFollows: true, drums: 'five', comp: 'quartal', voicing: 'quartal', voiceLo: 52, voiceHi: 62, flavour: null,
    melody: mel({ lo: 65, hi: 88, cells: CELLS.modal, phrase: [2, 2, 4], rest: [1, 1, 2], vel: .55, grace: .04, licks: { arp: .12 } }),
    extras: [], reverb: .35, revCut: 6000, modulate: .1, head: true, feel: FEEL.tight,
  },
  chase: {
    family: 'Editor', label: 'The Chase', blurb: 'Very fast, minor bebop. Cherokee changes at a sprint, the kit dropping bombs, lines running for the door.',
    bpm: 232, swing: .58, beats: 4, minor: true, keys: [2, 0, 7, 9, 5],
    templates: [
      '0min6 | 2min7b5 7dom7alt | 0min6 | 5min7 10dom7 | 3maj7 | 8maj7 | 2min7b5 | 7dom7alt',
      '0min6 | 2min7b5 7dom7 | 0min6 | 2min7b5 7dom7 | 0min6 | 5min7 | 2min7b5 7dom7alt | 0min6 8dom7',
      '2min7 | 7dom7 | 0maj7 | 0maj7 | 0min7 | 5dom7 | 10maj7 | 10maj7 | 10min7 | 3dom7 | 8maj7 | 8maj7 | 2min7b5 | 7dom7alt | 0min6 | 2min7b5 7dom7alt',
    ],
    subs: SUBS.dark, bass: 'walk', drums: 'bebop', comp: 'shells', voicing: 'shell', voiceLo: 43, voiceHi: 53, flavour: 'bebop',
    melody: mel({ lo: 65, hi: 89, cells: CELLS.bebop, phrase: [2, 4, 4], rest: [1, 1, 2], vel: .6, grace: .04, licks: { arp: .25, enclosure: .2 } }),
    extras: [], reverb: .3, revCut: 6500, modulate: .3, head: true, feel: FEEL.tight,
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
  if (md.bass === 'none') return ev;
  const push = (pos, midi, vel, dur) => {
    midi = inRange(midi, BASS_LO, BASS_HI);
    st.last = midi;
    ev.push({ inst: 'bass', pos, midi, vel: vel + (rand() - .5) * .08, dur });
    return midi;
  };
  const per = beats / chords.length;

  if (md.bass === 'pedal' && !cx.release) {             // the ostinato, deaf to the chords above it
    const pedal = inRange(nearest(md.riffFollows ? chords[0].root : cx.key, 36), 30, 41);
    for (const [pos, off] of st.riff) if (pos < beats) push(pos, pedal + off, pos === 0 ? .85 : .7, .45);
    return ev;
  }
  chords.forEach((ch, ci) => {
    const start = ci * per;
    const nextRoot = ci + 1 < chords.length ? chords[ci + 1].root : nextChord.root;
    const sc = chordScale(ch), tones = chordTones(ch);
    const root = nearest(ch.root, st.last ?? 38);

    if (md.bass === 'two' && !cx.release) {             // half notes; in three, one and three
      const second = per >= 3 ? 2 : 1;
      push(start, root, .78, second - .1);
      if (per >= 2) {
        const mid = push(start + second, weighted([[nearest(tones[2], root), 3], [nearest(tones[1], root), 2], [root + (chance(.5) ? 12 : -12), 1]]), .66, Math.max(.6, per - second - .1));
        if (per >= 4 && chance(.35)) push(start + per - .5, approach(nextRoot, mid, sc), .55, .45);
        else if (per === 3 && chance(.3)) push(start + 2.5, approach(nextRoot, mid, sc), .5, .45);
      }
      return;
    }
    // walking: the root, chord tones and steps, then something that leans on the next bar
    let prev = push(start, root, .82, .95);
    for (let b = 1; b < per - 1; b++) {
      const opts = b === 1
        ? [[nearest(tones[1], prev), 3], [nearest(tones[2], prev), 2], [snapToScale(prev + 2, sc), 2], [prev + 12, .5]]
        : [[nearest(tones[2], prev), 3], [nearest(tones[3] ?? tones[2], prev), 2], [nearest(tones[1], prev), 1], [snapToScale(prev + (prev > root ? 2 : -2), sc), 2]];
      prev = push(start + b, weighted(opts), .68 + .02 * b, .95);
    }
    if (per >= 2) {
      const last = push(start + per - 1, approach(nextRoot, prev, sc), .72, chance(.15) ? .6 : .95);
      if (per >= 4 && chance(.12)) push(start + per - 1 / 3, last, .4, .3);      // a triplet skip into the bar line
    }
  });
  return ev;
}

/* ─── The drums ────────────────────────────────────────────────────────────────── */
function drumsPart(cx) {
  const { beats, md, phraseBar } = cx;
  const ev = [];
  const style = md.drums;
  if (style === 'none') return ev;
  const hit = (inst, pos, vel, dur) => ev.push({ inst, pos, vel: clamp(vel + (rand() - .5) * .1, .05, 1), dur: dur || 0 });
  const first = phraseBar === 0;
  const fourth = phraseBar >= 0 && phraseBar % 4 === 3;

  if (style === 'waltz') {                              // ride 1, 2, and-of-2, 3; hat on 2; a feathered one
    hit('ride', 0, .75); hit('ride', 1, .6); hit('ride', 1.5, .5); hit('ride', 2, .65);
    hit('hat', 1, .55); if (chance(.4)) hit('hat', 2, .4);
    hit('kick', 0, .2);
    if (chance(.2)) hit('snare', 2.5, .3);
    if (first) hit('ride', 0, .9);
    if (fourth && chance(.5)) { hit('snare', 2, .35); hit('snare', 2 + 2 / 3, .4); }
    return ev;
  }
  if (style === 'five') {                               // three and two
    for (let b = 0; b < 5; b++) hit('ride', b, b === 0 || b === 3 ? .8 : .6);
    hit('ride', 1.5, .5); hit('ride', 3.5, .5);
    hit('hat', 1, .6); hit('hat', 3, .6); hit('kick', 0, .35); hit('kick', 3, .3);
    if (chance(.3)) hit('snare', 2.5, .4);
    if (chance(.25)) hit('snare', 4.5, .45);
    if (first) hit('bell', 0, .8);
    if (fourth) { hit('snare', 4, .5); hit('snare', 4.5, .6); }
    return ev;
  }
  if (style === 'ride' || style === 'bebop' || style === 'tense') {
    const bombs = style === 'ride' ? .12 : .3;
    for (let b = 0; b < beats; b++) {
      hit('ride', b, b % 2 === 1 ? .8 : .7);                                     // two and four lean
      if (b % 2 === 1 || (style !== 'ride' && chance(.3))) hit('ride', b + .5, .5);
      if (b % 2 === 1) hit('hat', b, style === 'tense' ? .75 : .6);
      if (style === 'ride') hit('kick', b, .18);                                  // feathered: felt, not heard
      if (chance(bombs)) hit('snare', b + .5, style === 'ride' ? .28 : .45);
      if (style !== 'ride' && chance(bombs * .8)) hit('kick', b + .5, .5);
      if (style !== 'ride' && chance(.15)) hit('snare', b + 2 / 3, .25);
    }
    if (first) hit(style === 'ride' ? 'ride' : 'bell', 0, .95);
    if (fourth && style !== 'ride') { hit('snare', beats - .5, .65); hit('kick', beats - .5, .55); }
    else if (chance(.12)) { hit('kick', beats - .5, .45); hit('snare', beats - .5, .35); }
    return ev;
  }
  if (style === 'brushes' || style === 'cool') {
    for (let b = 0; b < beats; b++) {
      hit('sweep', b, b % 2 === 0 ? .7 : .55, 1);
      if (b % 2 === 1) hit('snare', b, style === 'cool' ? .32 : .24);
      if (b % 2 === 1 && chance(.5)) hit('hat', b, .3);
      if (style === 'cool' && b % 2 === 1) hit('ride', b + .5, .3);
      if (b === 0 && chance(.35)) hit('ride', 0, .35);
    }
    return ev;
  }
  if (style === 'two') {
    for (let b = 0; b < beats; b++) {
      hit('sweep', b, .45, .9);
      if (b % 2 === 0) hit('kick', b, .45); else { hit('snare', b, .5); hit('hat', b, .5); }
      if (b % 2 === 1 && chance(.5)) hit('ride', b + .5, .4);
      if (chance(.1)) hit('snare', b + .5, .3);
    }
    if (first) hit('ride', 0, .6);
    if (fourth && chance(.5)) { hit('snare', beats - 1, .4); hit('snare', beats - 2 / 3, .35); hit('snare', beats - 1 / 3, .45); }
    return ev;
  }
  for (let b = 0; b < beats; b++) {                     // smoky: the ride pattern with holes in it
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
  const voicingOf = ch => (st.voicing = voice(ch, st.voicing, md.voiceLo, md.voiceHi, md.voicing));
  const strike = (v, pos, vel, dur, roll) => v.forEach((m, i) => ev.push({
    inst: 'piano', pos, midi: m, dur, offset: roll ? i * roll : 0,
    vel: vel + (i === v.length - 1 ? .04 : 0) + (rand() - .5) * .06,
  }));
  const busy = st.melRest ? .12 : 0;                    // when the tune rests, the left hand answers

  switch (md.comp) {
    case 'stride': {                                    // a bass note, a chord, a bass note, a chord
      chords.forEach((ch, ci) => {
        const start = ci * per, v = voicingOf(ch);
        const root = inRange(nearest(ch.root, 41), 36, 48);
        const fifth = inRange(nearest(mod12(ch.root + 7), root), 34, 48);
        for (let b = 0; b < per; b++) {
          if (b % 2 === 0) ev.push({ inst: 'piano', pos: start + b, midi: (b === 0 || chance(.4)) ? root : fifth, vel: .58, dur: .45 });
          else strike(v, start + b, .38, .3);
        }
      });
      return ev;
    }
    case 'ballad': {                                    // rolled, slowly, and left to ring
      chords.forEach((ch, ci) => {
        const start = ci * per, v = voicingOf(ch);
        strike(v, start, .32, per - .2, .05);
        if (per >= 4 && chance(.45)) strike(v, start + (chance(.5) ? 2 : 2.5), .24, 1.3, .03);
        else if (per === 3 && chance(.4)) strike(v, start + 2, .24, .9, .03);
      });
      return ev;
    }
    case 'arpeggio': {                                  // nocturne: the chord broken upward, pedal down
      chords.forEach((ch, ci) => {
        const start = ci * per, v = voicingOf(ch);
        const seq = [inRange(nearest(ch.root, 40), 33, 45), ...v].slice(0, per * 2);
        seq.forEach((m, i) => ev.push({ inst: 'piano', pos: start + i * .5, midi: m, vel: .3 - i * .012, dur: per - i * .5 }));
        if (per >= 4 && chance(.4)) ev.push({ inst: 'piano', pos: start + per - .5, midi: v[1], vel: .22, dur: .6 });
      });
      return ev;
    }
    case 'tremolo': {                                   // noir: the chord trembling, two voices against two
      chords.forEach((ch, ci) => {
        const start = ci * per, v = voicingOf(ch);
        if (chance(.45)) {
          const lo = v.slice(0, 2), hi = v.slice(2);
          const len = Math.min(per, 2);
          for (let k = 0; k < len * 6; k++) (k % 2 ? hi : lo).forEach(m => ev.push({ inst: 'piano', pos: start + k / 6, midi: m, vel: .3 - k * .008, dur: 1 / 6 }));
          if (per >= 4 && chance(.5)) strike(v, start + 2.5, .34, 1.3);
        } else strike(v, start + pick([0, 1.5, 2.5]), .38, 1.4, .015);
      });
      return ev;
    }
    case 'stabs': {                                     // one hit every three swung eighths, across the bar lines
      let pos = st.stab;
      while (pos < beats - 1e-6) {
        const v = voicingOf(chords[Math.min(chords.length - 1, Math.floor(pos / per))]);
        strike(v, pos, .56, .3);
        ev.push({ inst: 'piano', pos, midi: v[v.length - 1] + 12, vel: .5, dur: .3 });
        pos += 1.5;
      }
      st.stab = (cx.phraseBar % 8 === 7) ? 0 : pos - beats;
      return ev;
    }
    case 'quartal': {                                   // So What hits: on one, and where the ride skips
      chords.forEach((ch, ci) => {
        const start = ci * per, v = voicingOf(ch);
        const pat = beats === 5 ? [0, 3] : per >= 4 ? pick([[0, 1.5], [0, 2.5], [1.5, 3], [0], [2.5], [0, 1.5, 3.5]]) : [0];
        pat.forEach((p, i) => strike(v, start + p, .4 + busy, Math.min((pat[i + 1] ?? per) - p, 2) - .1, chance(.2) ? .012 : 0));
      });
      return ev;
    }
    case 'shells': {                                    // Powell: two notes, low, in the gaps of the line
      chords.forEach((ch, ci) => {
        const start = ci * per, v = voicingOf(ch);
        const pat = per >= 4 ? weighted([[[0], 3], [[0, 2.5], 2], [[.5], 1.5], [[1.5], 1.5], [[0, 3.5], 1], [[], 1]]) : [pick([0, .5])];
        pat.forEach((p, i) => strike(v, start + p, .36 + busy, Math.min((pat[i + 1] ?? per) - p, 2.5) - .1));
      });
      if (chance(.15 + busy)) strike(voicingOf(nextChord), beats - .5, .38, .7);
      return ev;
    }
    default: {                                          // charleston: sparse, on the "and"s
      chords.forEach((ch, ci) => {
        const start = ci * per, v = voicingOf(ch);
        let pat = per >= 4 ? pick(COMP_PATTERNS).filter(p => p < per) : [pick([0, .5, 1.5].filter(p => p < per))];
        if (!pat.length && chance(busy + .3)) pat = [1.5];
        pat.forEach((p, i) => {
          const next = pat[i + 1] ?? per;
          strike(v, start + p, .4 + busy, Math.min(next - p, 2) - .1 + (chance(.3) ? .8 : 0), chance(.25) ? .018 : 0);
        });
      });
      if (chance(.2 + busy) && !ev.some(e => e.pos > beats - .6)) strike(voicingOf(nextChord), beats - .5, .42, .8);   // the anticipation
      return ev;
    }
  }
}

/* ─── The guests ───────────────────────────────────────────────────────────────── */
function extrasPart(cx, st) {
  const { chords, beats, md } = cx;
  const ev = [];
  if (!md.extras.includes('vibes')) return ev;
  const ch = chords[0];
  const v = st.voicing || voice(ch, null, md.voiceLo, md.voiceHi, 'rootless');
  const top = Math.min(v[v.length - 1] + 12, 94);
  const sc = chordScale(ch);
  const soft = ['ballad', 'arpeggio'].includes(md.comp) || ['waltz', 'cool'].includes(md.drums);
  if (soft) {
    if (chance(.4)) {
      ev.push({ inst: 'vibes', pos: 0, midi: top, vel: .32, dur: Math.min(beats - .5, 3.5) });
      if (chance(.6)) ev.push({ inst: 'vibes', pos: 0, midi: v[v.length - 2] + 12, vel: .26, dur: Math.min(beats - .5, 3.5) });
    }
    if (st.melRest && chance(.35)) {                    // a small answer while the piano is quiet
      let m = snapToScale(top + 2, sc);
      const start = beats - 1.5;
      [start, start + .5, start + 1].forEach((pos, i) => { ev.push({ inst: 'vibes', pos, midi: m, vel: .28, dur: i === 2 ? 2 : .5 }); m = snapToScale(m + (chance(.5) ? 2 : -2), sc); });
    }
  } else if (chance(.3)) {                              // a shimmer on top of the chord, high and thin
    ev.push({ inst: 'vibes', pos: chance(.5) ? 0 : 1.5, midi: top, vel: .25, dur: 2.5 });
  }
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
  while (out.length < n) {
    out.unshift(chance(.5) ? a - 1 : snapToScale(a + 2, sc));
    if (out.length < n) out.unshift(a);
  }
  return out.slice(0, n);
}

/* Licks: whole-bar figures the vocabulary knows by heart. Each returns
 * [{ pos, dur, midi }] in swung eighths, or null if it does not fit the bar. */
const above = (pc, m) => m + 1 + mod12(pc - m - 1);          // the next note of class pc strictly above m
function lick(kind, ch, st, lo, hi, beats, flavour) {
  const tones = chordTones(ch), sc = chordScale(ch, flavour);
  const tone = i => tones[Math.min(i, tones.length - 1)];
  const ref = st.prev ?? (lo + hi) / 2;
  const eighths = (pitches, start = 0) => pitches.map((m, i) => ({ pos: start + i * .5, dur: .5, midi: m }));
  switch (kind) {
    case 'arp': {                                       // up the arpeggio, down the scale
      let m = inRange(nearest(tone(1), ref - 5), lo, hi - 12);
      const up = [m];
      for (const i of [2, 3, 4]) { m = above(tone(i), m); up.push(m); }
      const down = [];
      let d = m;
      for (let i = up.length; i < beats * 2; i++) { const nx = scaleWalk(d, d - 12, sc)[0]; if (nx == null) break; d = nx; down.push(d); }
      return eighths([...up, ...down]);
    }
    case 'enclosure': {                                 // above, below, home — then away down the scale, from the and-of-one
      const target = inRange(nearest(tone(weighted([[1, 3], [2, 2], [3, 2]])), ref), lo + 3, hi - 3);
      const line = [snapToScale(target + 2, sc), target - 1, target];
      let d = target;
      const dir = chance(.6) ? -1 : 1;
      while (line.length < beats * 2 - 1) { const nx = scaleWalk(d, d + dir * 12, sc)[0]; if (nx == null) break; d = nx; line.push(d); }
      return eighths(line, .5);
    }
    case 'blues': {                                     // the blues run: 5 ♭5 4 ♭3 1 ♭7 — and a long one on the root
      if (beats !== 4) return null;
      const r = inRange(nearest(ch.root, ref), lo, hi - 8);
      const notes = eighths([r + 7, r + 6, r + 5, r + 3, r, r - 2], .5);
      notes.push({ pos: 3.5, dur: 1.5, midi: r });
      return notes;
    }
    case 'wholetone': {                                 // Monk: down the whole-tone scale from somewhere high, then stop
      const top = clamp(ref + pick([5, 7, 9]), lo + 8, hi);
      const n = pick([4, 5, 6]);
      const run = [];
      for (let i = 0; i < n; i++) run.push(top - 2 * i);
      return eighths(run, pick([0, .5, 1]));
    }
    case 'hammer': {                                    // the same note four times, then a step down
      const m = inRange(nearest(tone(weighted([[1, 2], [2, 2], [4, 1]])), ref), lo, hi);
      const notes = eighths([m, m, m, m]);
      notes.push({ pos: 2, dur: 1, midi: snapToScale(m - 2, sc) });
      return notes;
    }
  }
  return null;
}

/* the shape of a head: four-bar groups; a motif, its sequence, something new,
 * a cadence — and the second group opens by restating the motif */
const HEAD_PLAN = i => (Math.floor(i / 4) % 2 === 0 ? ['new', 'seq', 'new', 'end'] : ['seq', 'new', 'new', 'end'])[i % 4];

function melodyPart(cx, st) {
  const { chords, nextChord, beats, md } = cx;
  const M = md.melody;
  const ev = [];
  const per = beats / chords.length;
  const chordAt = pos => chords[Math.min(chords.length - 1, Math.floor(pos / per))];
  const scaleOf = ch => chordScale(ch, md.flavour);
  const head = cx.headPlan;

  if (!head) {
    if (st.rest > 0) {                                  // resting — but maybe a pickup into the next phrase
      st.rest--;
      st.melRest = true;
      if (st.rest === 0 && chance(.6)) {
        const line = pickupNotes(nextChord, st, M, md.flavour);
        line.forEach((m, i) => ev.push({ inst: st.lead, pos: beats - (line.length - i) * .5, midi: m, vel: M.vel * .8, dur: .45 }));
        st.prev = line[line.length - 1];
      }
      return ev;
    }
    st.melRest = false;
    if (st.active === 0) {                              // a new phrase: how long, and who plays it
      st.active = pick(M.phrase);
      st.phraseLen = st.active;
      st.lead = (M.lead !== 'piano' && chance(M.leadChance)) ? M.lead : 'piano';
      st.motif = null;
    }
  } else {
    st.melRest = false;
    if (cx.phraseBar % 4 === 0) { st.active = 4; st.phraseLen = 4; }
    st.lead = M.lead;
  }
  const inst = st.lead;
  const lo = inst === 'piano' ? M.lo : 58, hi = inst === 'piano' ? M.hi : inst === 'clarinet' ? 80 : 82;
  const center = (lo + hi) / 2;
  const lastBar = head ? head === 'end' : st.active === 1;
  const reuse = head ? (head === 'seq' && !!st.motif) : (!!st.motif && (st.phraseLen - st.active === 1 ? chance(.55) : chance(.25)));
  const finish = () => { st.active--; if (st.active === 0 && !head) st.rest = pick(M.rest); return ev; };

  if (!reuse && !lastBar) {                             // sometimes, a lick the fingers know
    for (const [kind, p] of Object.entries(M.licks)) {
      if (!chance(p)) continue;
      const notes = lick(kind, chords[0], st, lo, hi, beats, md.flavour);
      if (!notes || !notes.length) break;
      notes.forEach((n, i) => ev.push({
        inst, pos: n.pos, midi: clamp(n.midi, lo - 2, hi + 2), dur: n.dur - .05,
        vel: clamp(M.vel + (i === notes.length - 1 ? -.04 : (i % 2 ? .06 : 0)) + (rand() - .5) * .06, .1, .95),
      }));
      st.prev = notes[notes.length - 1].midi;
      if (!st.motif) st.motif = { cells: notes.map(n => ({ pos: n.pos, dur: n.dur })), shape: notes.map(n => n.midi - notes[0].midi) };
      return finish();
    }
  }

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
  if (!cells.length) return finish();
  const notes = cells.map(c => ({ ...c, strong: Math.abs(c.pos - Math.round(c.pos)) < .02 || c.dur >= 1 }));
  if (lastBar) notes[notes.length - 1].strong = true;

  const pitches = new Array(notes.length).fill(null);
  if (reuse && st.motif.shape.length === notes.length) {      // sequence the motif through the new chords
    const first = pickStrong(chordAt(notes[0].pos), st, lo, hi, st.prev ?? center);
    pitches[0] = first;
    for (let i = 1; i < notes.length; i++) pitches[i] = clamp(snapToScale(first + st.motif.shape[i], scaleOf(chordAt(notes[i].pos))), lo, hi);
  } else {
    let prevA = st.prev ?? center, lastIdx = -1;
    for (let i = 0; i < notes.length; i++) {
      if (!notes[i].strong) continue;
      const anticipates = notes[i].pos >= beats - .6 && chance(.5);
      pitches[i] = pickStrong(anticipates ? nextChord : chordAt(notes[i].pos), st, lo, hi, prevA);
      const gap = i - lastIdx - 1;
      if (gap > 0) {
        const line = fillLine(prevA, pitches[i], gap, scaleOf(chordAt(notes[lastIdx + 1].pos)));
        for (let k = 0; k < gap; k++) pitches[lastIdx + 1 + k] = clamp(line[k], lo - 2, hi + 2);
      }
      prevA = pitches[i];
      lastIdx = i;
    }
    if (lastIdx < notes.length - 1) {                   // trailing weak notes head for the next chord
      const gap = notes.length - 1 - lastIdx;
      const target = pickStrong(nextChord, st, lo, hi, prevA);
      const line = fillLine(prevA, target, gap, scaleOf(chordAt(notes[lastIdx + 1].pos)));
      for (let k = 0; k < gap; k++) pitches[lastIdx + 1 + k] = clamp(line[k], lo - 2, hi + 2);
    }
  }
  if (!st.motif) st.motif = { cells: cells.map(c => ({ ...c })), shape: pitches.map(p => p - pitches[0]) };

  notes.forEach((n, i) => {
    const m = pitches[i];
    const upbeat = Math.abs(n.pos - Math.floor(n.pos) - .5) < .02;
    let vel = M.vel + (upbeat ? .07 : 0) + (n.strong && n.dur >= 1 ? .04 : 0) + (m - center) / 90 + (rand() - .5) * .08;
    let dur = inst === 'piano' ? n.dur - (n.dur >= 1 ? .1 : .05) : n.dur + .04;
    if (lastBar && i === notes.length - 1) { dur = Math.max(dur, 2.5); vel -= .06; }
    if (inst === 'piano' && n.strong && chance(M.grace)) ev.push({ inst, pos: n.pos - .09, midi: m - 1, vel: vel * .55, dur: .08 });
    ev.push({ inst, pos: n.pos, midi: m, vel: clamp(vel, .1, .95), dur });
  });
  st.prev = pitches[pitches.length - 1];
  return finish();
}

/* one to three notes that lead into a chord: chromatic from below, or the
 * enclosure — used for pickups into a phrase and for the count-in of a break */
function pickupNotes(ch, st, M, flavour) {
  const tones = chordTones(ch), sc = chordScale(ch, flavour);
  const target = inRange(nearest(tones[1], st.prev ?? (M.lo + M.hi) / 2), M.lo, M.hi);
  const n = pick([1, 2, 3]);
  return n === 1 ? [target - 1] : n === 2 ? [snapToScale(target + 2, sc), target - 1] : [target - 3, target - 2, target - 1];
}

/* the head: written once, over the plain chart, in the mood's lead voice */
function generateHead(md, prog, key) {
  const st = { prev: null, dir: 1, active: 0, rest: 0, phraseLen: 0, motif: null, lead: md.melody.lead, melRest: false };
  return prog.map((bar, i) => melodyPart({ chords: bar, nextChord: prog[(i + 1) % prog.length][0], beats: md.beats, md, phraseBar: i, key, headPlan: HEAD_PLAN(i) }, st));
}

/* ═══ THE INSTRUMENTS ═══════════════════════════════════════════════════════════
 * Everything is built from oscillators, noise and filters at the moment it is
 * needed. The piano is the one worth reading. A stack of steady sine partials
 * is an organ; what makes a piano is a spectrum that MOVES — bright for a few
 * tens of milliseconds, then darkening at a rate that depends on the note. So:
 * a rich waveform (forty harmonics, with the notches a hammer leaves when it
 * strikes an eighth of the way along the string) through a low-pass whose
 * cutoff opens with velocity and then sweeps down; under it a long-ringing
 * fundamental and a slightly sharp third partial; in front of it a knock on
 * the soundboard and a click. Two detuned oscillators give the beating that
 * makes a real piano sing, each note sits in the stereo field where it would
 * on the keyboard, and the whole piano runs through a short soundboard
 * convolution. The kit is filtered noise all the way down: a ride is a ping,
 * a body and a sizzle at three different decay rates, not a chord of square
 * waves.
 */
const A = { ctx: null, bus: {}, drone: null };
const BUSES = { piano: [1, .22, 0], bass: [1, .06, -.12], drums: [.7, .16, 0], vibes: [.8, .45, .25], clarinet: [.8, .3, -.2], trumpet: [.8, .3, .2], drone: [1, .5, 0] };   // [level, reverb send, pan]

function noiseBuffer(ctx, pink) {
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) { d[i] = w; continue; }
    b0 = .997 * b0 + .029 * w; b1 = .985 * b1 + .032 * w; b2 = .95 * b2 + .048 * w;
    d[i] = (b0 + b1 + b2 + w * .05) * 2.5;
  }
  return buf;
}
/* a room (or, short and bright, a soundboard): noise that decays and darkens */
function makeIR(ctx, seconds, bright) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const env = Math.pow(1 - x, bright ? 1.6 : 2.4) * Math.exp(-(bright ? 1.5 : 2.5) * x) * (!bright && i < sr * .012 ? .25 : 1);
      const a = bright ? .8 - .3 * x : .55 - .42 * x;
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * env * (bright ? .9 : .55);
    }
  }
  return buf;
}
function satCurve(drive) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  return c;
}
function makePianoWave(ctx) {
  const N = 40, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) im[n] = Math.pow(n, -1.05) * Math.abs(Math.sin(Math.PI * n * .12)) * Math.exp(-n / 26);
  return ctx.createPeriodicWave(re, im);
}

function buildGraph() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.ctx = ctx;
  A.noise = noiseBuffer(ctx, false);
  A.pink = noiseBuffer(ctx, true);
  A.pianoWave = makePianoWave(ctx);

  A.master = ctx.createGain();            A.master.gain.value = 0;
  A.comp = ctx.createDynamicsCompressor();
  A.comp.threshold.value = -18; A.comp.knee.value = 10; A.comp.ratio.value = 2.5; A.comp.attack.value = .01; A.comp.release.value = .28;
  A.sat = ctx.createWaveShaper();         A.sat.curve = satCurve(1.4); A.sat.oversample = '2x';
  A.tone = ctx.createBiquadFilter();      A.tone.type = 'lowpass';   A.tone.frequency.value = 11000; A.tone.Q.value = .4;
  A.shelf = ctx.createBiquadFilter();     A.shelf.type = 'highshelf'; A.shelf.frequency.value = 5000; A.shelf.gain.value = -1.5;
  A.wow = ctx.createDelay(.05);           A.wow.delayTime.value = .012;
  A.trim = ctx.createGain();              A.trim.gain.value = .7;
  A.sum = ctx.createGain();
  A.sum.connect(A.trim); A.trim.connect(A.wow); A.wow.connect(A.shelf); A.shelf.connect(A.tone); A.tone.connect(A.sat); A.sat.connect(A.comp); A.comp.connect(A.master); A.master.connect(ctx.destination);

  A.wowDepth = ctx.createGain(); A.wowDepth.gain.value = 0;      // the turntable
  A.flutDepth = ctx.createGain(); A.flutDepth.gain.value = 0;
  const wowLfo = ctx.createOscillator(); wowLfo.frequency.value = .43; wowLfo.connect(A.wowDepth); A.wowDepth.connect(A.wow.delayTime); wowLfo.start();
  const flutLfo = ctx.createOscillator(); flutLfo.frequency.value = 6.1; flutLfo.connect(A.flutDepth); A.flutDepth.connect(A.wow.delayTime); flutLfo.start();

  A.revIn = ctx.createBiquadFilter(); A.revIn.type = 'lowpass'; A.revIn.frequency.value = 5000;    // the room
  A.reverb = ctx.createConvolver(); A.reverb.buffer = makeIR(ctx, 2.4, false);
  A.revGain = ctx.createGain(); A.revGain.gain.value = .5;
  A.revIn.connect(A.reverb); A.reverb.connect(A.revGain); A.revGain.connect(A.sum);

  A.board = ctx.createConvolver(); A.board.buffer = makeIR(ctx, .2, true);                        // the piano's soundboard
  A.boardGain = ctx.createGain(); A.boardGain.gain.value = .18;
  A.board.connect(A.boardGain); A.boardGain.connect(A.sum);

  for (const name in BUSES) {
    const [level, send, pan] = BUSES[name];
    const g = ctx.createGain(), s = ctx.createGain(), p = ctx.createStereoPanner();
    g.gain.value = level; s.gain.value = send; p.pan.value = pan;
    g.connect(p); p.connect(A.sum); p.connect(s); s.connect(A.revIn);
    if (name === 'piano') p.connect(A.board);
    A.bus[name] = { g, send: s, level, muted: false };
  }

  const hiss = ctx.createBufferSource(); hiss.buffer = A.pink; hiss.loop = true;                   // surface noise
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
const panner = (p, dest) => { const n = A.ctx.createStereoPanner(); n.pan.value = p; n.connect(dest); return n; };
function noiseHit(t, dest, { pink, type = 'bandpass', freq, q = 1, tau, gain, hold = 0 }) {
  const src = A.ctx.createBufferSource(); src.buffer = pink ? A.pink : A.noise;
  const f = filt(type, freq, q), g = A.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setTargetAtTime(0, t + hold, tau);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, rand() * 1.5); src.stop(t + hold + tau * 6 + .02);
}
function ping(t, dest, f, a, tau) {                     // a sine that rings and dies
  const o = osc('sine', f), g = A.ctx.createGain();
  g.gain.setValueAtTime(a, t); g.gain.setTargetAtTime(0, t, tau);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + tau * 7 + .05);
}

/* ─── Piano ─────────────────────────────────────────────────────────────────── */
function playPiano(t, midi, vel, dur) {
  const ctx = A.ctx, f = mtof(midi);
  const v = Math.pow(clamp(vel, .05, 1), 1.7);
  const tEnd = t + Math.max(dur, .04);
  const out = panner(clamp((midi - 60) / 38, -.65, .65), A.bus.piano.g);
  const ring = clamp(8 * Math.pow(2, -(midi - 40) / 24), .5, 8);      // how long the bottom of the note lasts

  const lp = filt('lowpass', 1000, .6);                               // the body, through a closing filter
  lp.frequency.setValueAtTime(clamp(f * (2.5 + 14 * v), 600, 14000), t);
  lp.frequency.setTargetAtTime(clamp(f * 1.6, 300, 6000), t + .005, clamp(.12 + .45 * (1 - (midi - 36) / 60), .08, .6));
  const gA = ctx.createGain();
  gA.gain.setValueAtTime(0, t);
  gA.gain.linearRampToValueAtTime(.5 * v, t + .0015);
  gA.gain.setTargetAtTime(.28 * v, t + .0015, .05);                   // the prompt sound
  gA.gain.setTargetAtTime(0, t + .06, ring * .35);                    // the aftersound
  gA.gain.setTargetAtTime(0, tEnd, .06);                              // the damper
  for (const det of [-1.6, 1.6]) {
    const o = ctx.createOscillator(); o.setPeriodicWave(A.pianoWave); o.frequency.value = f; o.detune.value = det + (rand() - .5);
    o.connect(lp); o.start(t); o.stop(tEnd + .9);
  }
  lp.connect(gA); gA.connect(out);

  const oB = osc('sine', f), gB = ctx.createGain();                    // the singing fundamental
  gB.gain.setValueAtTime(0, t);
  gB.gain.linearRampToValueAtTime(.32 * v, t + .003);
  gB.gain.setTargetAtTime(0, t + .003, ring * .9);
  gB.gain.setTargetAtTime(0, tEnd, .08);
  oB.connect(gB); gB.connect(out); oB.start(t); oB.stop(tEnd + 1.2);

  if (midi < 84) {                                                    // a slightly sharp third partial: the metal in the tone
    const oC = osc('sine', f * 3 * Math.sqrt(1 + 9 * (midi < 60 ? .00012 : .0004))), gC = ctx.createGain();
    gC.gain.setValueAtTime(0, t);
    gC.gain.linearRampToValueAtTime(.1 * v * (midi < 72 ? 1 : .4), t + .002);
    gC.gain.setTargetAtTime(0, t + .002, ring * .25);
    gC.gain.setTargetAtTime(0, tEnd, .05);
    oC.connect(gC); gC.connect(out); oC.start(t); oC.stop(tEnd + .6);
  }
  const th = osc('sine', 190), gT = ctx.createGain();                 // the hammer: a knock, then a click
  th.frequency.setValueAtTime(190, t); th.frequency.exponentialRampToValueAtTime(55, t + .035);
  gT.gain.setValueAtTime(.35 * v * (midi < 60 ? 1 : .45), t); gT.gain.setTargetAtTime(0, t + .004, .018);
  th.connect(gT); gT.connect(out); th.start(t); th.stop(t + .15);
  noiseHit(t, out, { freq: clamp(f * 4, 1200, 7000), q: .7, tau: .003, gain: .18 * v });
}

/* ─── Upright bass ──────────────────────────────────────────────────────────── */
function playBass(t, midi, vel, dur) {
  const ctx = A.ctx, f = mtof(midi), v = Math.pow(vel, 1.3);
  const out = gainNode(.55 * v);
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
  [['triangle', .55], ['sawtooth', .18], ['sine', .5]].forEach(([type, a]) => {
    const o = osc(type, f);
    o.frequency.setValueAtTime(f * 1.025, t);                          // the finger pulls it sharp, then it settles
    o.frequency.exponentialRampToValueAtTime(f, t + .05);
    const g = gainNode(a);
    o.connect(g); g.connect(lp); o.start(t); o.stop(tEnd + .4);
  });
  lp.connect(env); env.connect(out); out.connect(A.bus.bass.g);
  noiseHit(t, out, { freq: 1200, q: 1, tau: .006, gain: .12 * v });
  ping(t, out, 70, .12 * v, .03);                                      // the body's thump
}

/* ─── The kit ───────────────────────────────────────────────────────────────── */
const drumOut = pan => panner(pan, A.bus.drums.g);
function playRide(t, v) {
  const out = drumOut(.35), k = 1 + (rand() - .5) * .08;
  noiseHit(t, out, { freq: 3600 * k, q: 5, tau: .07, gain: .22 * v });                 // the stick
  ping(t, out, 2900 * k, .05 * v, .04);
  noiseHit(t, out, { freq: 6800 * k, q: 1.6, tau: .32, gain: .11 * v });               // the body
  noiseHit(t, out, { type: 'highpass', freq: 8500, tau: .55, gain: .035 * v * v });    // the sizzle
}
function playBell(t, v) {
  const out = drumOut(.35), k = 1 + (rand() - .5) * .04;
  [[1, .12], [1.5, .06], [2.4, .04]].forEach(([r, a]) => ping(t, out, 1180 * r * k, a * v, .35));
  noiseHit(t, out, { freq: 4200 * k, q: 3, tau: .25, gain: .1 * v });
}
function playHat(t, v) {
  const out = drumOut(-.3);
  noiseHit(t, out, { type: 'highpass', freq: 7500, tau: .022, gain: .14 * v });
  noiseHit(t, out, { freq: 9800, q: 2, tau: .03, gain: .08 * v });
}
function playKick(t, v) {
  const out = drumOut(0);
  const o = osc('sine', 96), g = A.ctx.createGain();
  o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(48, t + .06);
  g.gain.setValueAtTime(.8 * v, t); g.gain.setTargetAtTime(0, t + .01, .075);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + .5);
  noiseHit(t, out, { freq: 2200, q: 1, tau: .004, gain: .06 * v });                    // the beater
}
function playSnare(t, v) {                                                             // a brush tap
  const out = drumOut(.05);
  noiseHit(t, out, { freq: 2000, q: .7, tau: .04, gain: .25 * v });
  noiseHit(t, out, { type: 'highpass', freq: 4500, tau: .09, gain: .1 * v });          // the wires
  ping(t, out, 185, .2 * v, .045); ping(t, out, 330, .08 * v, .04);
}
function playRim(t, v) {
  const out = drumOut(.05);
  noiseHit(t, out, { type: 'highpass', freq: 3000, tau: .01, gain: .3 * v });
  ping(t, out, 820, .16 * v, .012); ping(t, out, 1370, .1 * v, .01);
}
function playSweep(t, dur, v) {                                                        // the brush circling the head
  const out = drumOut(-.1);
  const src = A.ctx.createBufferSource(); src.buffer = A.pink;
  const f = filt('bandpass', 1500, .9), g = A.ctx.createGain();
  f.frequency.setValueAtTime(1500, t); f.frequency.linearRampToValueAtTime(4200, t + dur * .7); f.frequency.linearRampToValueAtTime(2000, t + dur);
  g.gain.setValueAtTime(.003, t); g.gain.linearRampToValueAtTime(.08 * v, t + dur * .55); g.gain.linearRampToValueAtTime(.004, t + dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t, rand()); src.stop(t + dur + .02);
}

/* ─── Vibraphone ───────────────────────────────────────────────────────────── */
function playVibes(t, midi, vel, dur) {
  const ctx = A.ctx, f = mtof(midi), tEnd = t + dur;
  const out = gainNode(.22 * vel), trem = gainNode(1);
  const lfo = osc('sine', 5.2), depth = gainNode(.4);
  lfo.connect(depth); depth.connect(trem.gain); lfo.start(t); lfo.stop(tEnd + 2);
  out.connect(trem); trem.connect(A.bus.vibes.g);
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

/* ─── The horns ─────────────────────────────────────────────────────────────── */
function playClarinet(t, midi, vel, dur) {
  const ctx = A.ctx, f = mtof(midi), tEnd = t + dur;
  const out = gainNode(.12 * vel);
  const lp = filt('lowpass', f * 2, 1.2);
  lp.frequency.exponentialRampToValueAtTime(f * 3.2, t + .08);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + .05);
  env.gain.setTargetAtTime(.8, t + .05, .2);
  env.gain.setTargetAtTime(0, tEnd, .06);
  const vib = osc('sine', 5.3), vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t); vibDepth.gain.linearRampToValueAtTime(7, t + .6);
  vib.connect(vibDepth); vib.start(t); vib.stop(tEnd + .5);
  [['square', .45], ['sine', .55]].forEach(([type, a]) => {
    const o = osc(type, f), g = gainNode(a);
    vibDepth.connect(o.detune);
    o.connect(g); g.connect(lp); o.start(t); o.stop(tEnd + .5);
  });
  lp.connect(env); env.connect(out); out.connect(A.bus.clarinet.g);
  noiseHit(t, out, { pink: true, freq: f * 2.5, q: 1, tau: .2, hold: Math.max(0, dur - .1), gain: .05 * vel });
}
function playTrumpet(t, midi, vel, dur) {                              // with a Harmon mute in it
  const ctx = A.ctx, f = mtof(midi), tEnd = t + dur;
  const out = gainNode(.11 * vel);
  const mute = filt('bandpass', 1900, 2.6);                            // the mute's resonance
  const muteLfo = osc('sine', .5), muteDepth = gainNode(180);
  muteLfo.connect(muteDepth); muteDepth.connect(mute.frequency); muteLfo.start(t); muteLfo.stop(tEnd + .5);
  const lp = filt('lowpass', clamp(f * 5, 1500, 9000), .8);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + .03);
  env.gain.setTargetAtTime(.75, t + .03, .15);
  env.gain.setTargetAtTime(0, tEnd, .05);
  const vib = osc('sine', 5.6), vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t); vibDepth.gain.linearRampToValueAtTime(9, t + .45);
  vib.connect(vibDepth); vib.start(t); vib.stop(tEnd + .5);
  [['sawtooth', .6], ['square', .25]].forEach(([type, a]) => {
    const o = osc(type, f), g = gainNode(a);
    vibDepth.connect(o.detune);
    o.connect(g); g.connect(mute); o.start(t); o.stop(tEnd + .5);
  });
  mute.connect(lp); lp.connect(env); env.connect(out); out.connect(A.bus.trumpet.g);
  noiseHit(t, out, { pink: true, freq: 2500, q: 1.5, tau: .15, hold: Math.max(0, dur - .1), gain: .03 * vel });
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
    setPitch(m) { const nf = mtof(m); oscs.forEach(o => o.frequency.setTargetAtTime(o.type === 'sine' ? nf * 2 : nf, ctx.currentTime, .8)); },
    stop() { out.gain.setTargetAtTime(0, ctx.currentTime, 1.2); setTimeout(() => { oscs.forEach(o => o.stop()); lfo.stop(); }, 6000); },
  };
}
function stopDrone() { if (A.drone) { A.drone.stop(); A.drone = null; } }

/* ═══ THE BANDLEADER ════════════════════════════════════════════════════════════
 * Counts the band in, hands each bar to the audio clock a little before it is
 * due, and handles the things a bandleader handles: the key, the chart, the
 * head, when to take it somewhere else, and how to get from one mood to the
 * next without anybody noticing the join. A mood change waits for the
 * two-bar phrase, then plays a BREAK: the band hits the V of the new key on
 * one and stops; the hi-hat counts two beats in the new tempo; a pickup line
 * leads to the downbeat; the new arrangement walks in on it. The key is kept
 * if the new mood shares the old one's mode, and moves to the relative if
 * not, so the join is a turn rather than a cut.
 */
const LOOKAHEAD = .45, TICK_MS = 30;
const S = {
  running: false, mood: null, pending: null, pendingAt: 0, key: 0, nextKey: null, forceMod: false,
  bpm: 100, swing: .6,
  prog: [], template: null, headTemplate: null, head: null, headKey: 0, headChorus: false,
  barIndex: 0, chorus: 0, absBar: 0, pivot: null,
  nextBarTime: 0, timer: null, volume: .8, patina: .45,
  mel: null, bassSt: null, comp: null, curChords: [], curBarStart: 0, curPhraseBar: 0, beatDur: .6, isBreak: false,
};
const listeners = { note: [], bar: [], mood: [] };
const emit = (kind, payload) => listeners[kind].forEach(cb => { try { cb(payload); } catch (e) { console.error(e); } });
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

function playVoice(inst, t, midi, vel, dur) {
  switch (inst) {
    case 'piano':    playPiano(t, midi, vel, dur); break;
    case 'bass':     playBass(t, midi, vel, dur); break;
    case 'vibes':    playVibes(t, midi, vel, dur); break;
    case 'clarinet': playClarinet(t, midi, vel, dur); break;
    case 'trumpet':  playTrumpet(t, midi, vel, dur); break;
    case 'ride':     playRide(t, vel); break;
    case 'bell':     playBell(t, vel); break;
    case 'hat':      playHat(t, vel); break;
    case 'kick':     playKick(t, vel); break;
    case 'snare':    playSnare(t, vel); break;
    case 'rim':      playRim(t, vel); break;
    case 'sweep':    playSweep(t, dur, vel); break;
  }
  emit('note', { inst, midi, vel, t, tEnd: t + dur });
}
function playEvent(ev, barStart, beatDur, swing, feel) {
  const off = (feel[ev.part] ?? feel[ev.inst] ?? 0) + (rand() - .5) * .006;     // the feel, and a human hand
  const t = barStart + tOf(ev.pos, beatDur, swing) + (ev.offset || 0) + off;
  const tEnd = ev.dur ? barStart + tOf(ev.pos + ev.dur, beatDur, swing) + (ev.offset || 0) + off : t + .1;
  playVoice(ev.inst, t, ev.midi, ev.vel, Math.max(.03, tEnd - t));
}

function newChorus() {
  const md = MOODS[S.mood];
  if (S.nextKey != null) { S.key = S.nextKey; S.nextKey = null; if (A.drone) A.drone.setPitch(dronePitch()); }
  S.chorus++;
  S.headChorus = !!(S.head && S.chorus % 3 === 0);
  if (S.headChorus) {                                   // the head goes over the plain chart it was written on
    S.template = S.headTemplate;
    S.prog = parseProg(S.template, S.key);
  } else {
    if (S.template == null || chance(.55)) S.template = pick(md.templates);
    S.prog = decorate(parseProg(S.template, S.key), md.subs);
    if (S.forceMod || chance(md.modulate)) {            // plan it now: the last bar becomes a ii–V into the new key
      S.forceMod = false;
      S.nextKey = mod12(S.key + weighted([[5, 3], [9, 1], [3, 1], [2, 1]]));
      S.prog[S.prog.length - 1] = pivotChords(S.nextKey, md.minor);
    }
  }
  S.barIndex = 0;
  if (md.bass === 'pedal') S.bassSt.riff = pick(md.riffs);
}

function enterMood(name, opts = {}) {
  const md = MOODS[name], prev = S.mood;
  S.mood = name; S.pending = null;
  S.key = opts.key ?? pick(md.keys);
  S.nextKey = null; S.forceMod = false;
  S.bpm = md.bpm; S.swing = md.swing;
  S.mel = { prev: null, dir: 1, active: 0, rest: 0, phraseLen: 0, motif: null, lead: md.melody.lead, melRest: true };
  S.bassSt = { last: null, riff: (md.riffs || RIFFS.four)[0] };
  S.comp = { voicing: null, stab: 0, melRest: true };
  S.headTemplate = pick(md.templates);
  S.template = S.headTemplate;
  S.head = md.head ? generateHead(md, parseProg(S.headTemplate, S.key), S.key) : null;
  S.headKey = S.key;
  S.chorus = -1;
  S.pivot = null;
  newChorus();
  if (A.ctx) applyMoodAudio(md);
  emit('mood', { mood: name, from: prev });
}
function applyMoodAudio(md) {
  const t = A.ctx.currentTime;
  A.revGain.gain.setTargetAtTime(md.reverb * .6, t, 1);
  A.revIn.frequency.setTargetAtTime(md.revCut, t, 1);
  if (md.extras.includes('drone')) startDrone(dronePitch()); else stopDrone();
}
/* the key to arrive in: the same one if the modes agree, else the relative */
const keyFor = (to, fromKey, fromMinor) => to.minor === fromMinor ? fromKey : mod12(fromMinor ? fromKey + 3 : fromKey + 9);

/* the break: a hit, a silence, a count, a pickup — and the new band on the downbeat */
function scheduleBreak(barStart) {
  const from = MOODS[S.mood], to = MOODS[S.pending];
  const oldBeat = 60 / S.bpm, newBeat = 60 / to.bpm;
  const newKey = keyFor(to, S.key, from.minor);
  const fromVoicing = S.comp.voicing, fromBass = S.bassSt.last ?? 38;
  enterMood(S.pending, { key: newKey });
  const t0 = barStart, t1 = t0 + 2 * oldBeat;
  const V = dominantOf(newKey, to.minor);
  const v = voice(V, fromVoicing, from.voiceLo, from.voiceHi, from.voicing === 'shell' ? 'rootless' : from.voicing);
  v.forEach((m, i) => playVoice('piano', t0 + i * .012, m, .5 + (i === v.length - 1 ? .06 : 0), oldBeat * 1.6));
  if (from.bass !== 'none') playVoice('bass', t0, inRange(nearest(V.root, fromBass), BASS_LO, BASS_HI), .8, oldBeat * 1.6);
  if (from.drums !== 'none') { playVoice('kick', t0, null, .7, .1); playVoice('ride', t0, null, .9, .1); if (!['brushes', 'cool'].includes(from.drums)) playVoice('bell', t0 + .01, null, .5, .1); }
  if (to.drums !== 'none') { playVoice('hat', t1, null, .55, .05); playVoice('hat', t1 + newBeat, null, .6, .05); }
  const M = to.melody, line = pickupNotes(S.prog[0][0], S.mel, M, to.flavour);
  line.forEach((m, i) => {
    const pos = 2 - (line.length - i) * .5;
    playVoice(M.lead, t1 + tOf(pos, newBeat, to.swing) + (to.feel.melody || 0), m, M.vel * .85, tOf(pos + .45, newBeat, to.swing) - tOf(pos, newBeat, to.swing));
  });
  S.mel.prev = line[line.length - 1];
  S.curChords = [V]; S.curBarStart = t0; S.beatDur = newBeat; S.curPhraseBar = -1; S.isBreak = true;
  emit('bar', barInfo());
  S.nextBarTime = t1 + 2 * newBeat;
  S.absBar++;
}

function scheduleBar() {
  const barStart = S.nextBarTime;
  if (S.pending && S.pending !== S.mood && S.absBar >= S.pendingAt) { scheduleBreak(barStart); return; }
  const md = MOODS[S.mood];
  const beats = md.beats;
  let beatDur = 60 / S.bpm;
  if (md.rubato) beatDur *= 1 + (rand() - .5) * md.rubato + (S.barIndex % 8 === 7 ? md.rubato * .8 : 0);   // breathing, and a lean at the end of the phrase
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
    release: md.bass === 'pedal' && (phraseBar < 0 || phraseBar % 4 === 3),    // the ostinato lets go every fourth bar
  };
  const events = [...bassPart(cx, S.bassSt), ...drumsPart(cx)];
  if (S.headChorus && phraseBar >= 0 && S.head[phraseBar]) {
    const delta = mod12(S.key - S.headKey + 6) - 6;    // transpose the head the short way round
    const hb = S.head[phraseBar];
    for (const e of hb) events.push({ ...e, midi: e.midi + delta, part: 'melody' });
    if (hb.length) S.mel.prev = hb[hb.length - 1].midi + delta;
    S.mel.melRest = false; S.mel.rest = 0; S.mel.active = 0;
  } else {
    for (const e of melodyPart(cx, S.mel)) events.push({ ...e, part: 'melody' });
  }
  S.comp.melRest = S.mel.melRest;
  events.push(...compPart(cx, S.comp), ...extrasPart(cx, S.comp));
  for (const ev of events) playEvent(ev, barStart, beatDur, S.swing, md.feel);
  S.curChords = bar; S.curBarStart = barStart; S.beatDur = beatDur; S.curPhraseBar = phraseBar; S.isBreak = false;
  emit('bar', barInfo());
  S.nextBarTime = barStart + beats * beatDur;
  if (phraseBar >= 0) S.barIndex++;
  S.absBar++;
}

function barInfo() {
  const md = MOODS[S.mood];
  const name = c => chordName(c, S.key, md.minor);
  return {
    mood: S.mood, label: md.label, family: md.family, minor: md.minor,
    key: S.key, keyName: keyName(S.key, md.minor),
    bpm: Math.round(S.bpm), swing: S.swing, beats: md.beats, beatDur: S.beatDur, barStart: S.curBarStart,
    chords: S.curChords.map(name), phraseBar: S.curPhraseBar, chorus: S.chorus, headChorus: S.headChorus, break: S.isBreak,
    chart: S.prog.map(b => b.map(c => ({ name: name(c), sub: c.sub || null }))), lead: S.mel.lead, resting: S.mel.melRest,
    nextKey: S.nextKey == null ? null : keyName(S.nextKey, md.minor),
    pending: S.pending && S.pending !== S.mood ? MOODS[S.pending].label : null,
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
  enterMood((mood && MOODS[mood]) ? mood : (S.pending || S.mood || 'workshop'));
  S.running = true;
  S.absBar = 0;
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
/* at the phrase (the next even bar of the chart) unless asked for now, or
 * unless the wait would be longer than a breath */
function setMood(name, opts = {}) {
  if (!MOODS[name]) throw new Error('The Composing Room has no mood called ' + name);
  if (!S.running) { S.pending = name; return; }
  if (name === S.mood) { S.pending = null; return; }
  S.pending = name;
  const barDur = MOODS[S.mood].beats * 60 / S.bpm;
  S.pendingAt = (opts.now || S.barIndex % 2 === 0 || barDur > 3.2) ? S.absBar : S.absBar + 1;
}

/* Off-grid flourishes for game events, spelled in the current key so each
 * lands as a remark inside the music rather than a sound effect over it. */
function cue(name) {
  if (!A.ctx || !S.running) return;
  const t = A.ctx.currentTime + .03;
  const md = MOODS[S.mood];
  const k = S.key > 6 ? S.key - 12 : S.key;
  switch (name) {
    case 'good': {                                      // a rising 6/9 arpeggio at the top of the piano
      const steps = md.minor ? [0, 3, 7, 9, 12, 14, 19] : [0, 4, 7, 9, 12, 14, 16];
      steps.forEach((s, i) => playPiano(t + i * .055, 72 + k + s, .48 + i * .02, 1.6 - i * .1));
      break;
    }
    case 'bad': {                                       // a low diminished cluster, a rimshot, a kick
      [0, 3, 6, 9].forEach(s => playPiano(t, 46 + k + s, .62, 1.2));
      playRim(t, .8); playKick(t, .7);
      break;
    }
    case 'hire': {                                      // the vibes: an open fifth and a ninth
      playVibes(t, 67 + k, .45, 2.5); playVibes(t + .06, 74 + k, .4, 2.5); playVibes(t + .12, 81 + k, .35, 2.5);
      playPiano(t, 55 + k, .3, 2);
      break;
    }
    case 'page': {                                      // one high note: the ninth of whatever is sounding
      const ch = S.curChords[0] || tonicChord(S.key, md.minor);
      const m = inRange(nearest(mod12(ch.root + 2), 86), 82, 93);
      playPiano(t, m - 7, .3, .3); playPiano(t + .09, m, .42, .9);
      break;
    }
    case 'turn': {                                      // a brush sweep and the bell of the ride
      playSweep(t, .7, .8); playBell(t + .5, .7);
      break;
    }
  }
}

const Music = {
  moods: Object.keys(MOODS).map(id => {
    const m = MOODS[id];
    return { id, family: m.family, label: m.label, blurb: m.blurb, bpm: m.bpm, beats: m.beats, extras: m.extras.slice(), without: [m.bass === 'none' && 'bass', m.drums === 'none' && 'drums'].filter(Boolean) };
  }),
  start, stop, setMood, cue,
  get running() { return S.running; },
  get mood() { return S.mood; },
  get pending() { return S.pending; },
  setVolume(v) { S.volume = clamp(v, 0, 1); if (A.ctx && S.running) A.master.gain.setTargetAtTime(S.volume, A.ctx.currentTime, .1); },
  setPatina(a) { S.patina = clamp(a, 0, 1); setPatina(S.patina); },
  setLevel(bus, v) { const b = A.bus[bus]; if (!b) return; b.level = clamp(v, 0, 1.5); if (!b.muted) b.g.gain.setTargetAtTime(b.level, A.ctx.currentTime, .05); },
  mute(bus, on) { const b = A.bus[bus]; if (!b) return; b.muted = !!on; b.g.gain.setTargetAtTime(on ? 0 : b.level, A.ctx.currentTime, .05); },
  modulate() {                                          // take it somewhere else at the next bar line
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
  _internals: { MOODS, QUAL, voice, parseProg, decorate, generateHead, tick, S, A },
};
window.Music = Music;
})();
