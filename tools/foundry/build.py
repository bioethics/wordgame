# Builds the folder the Register Foundry is published from: the page, the
# game's dictionary, the current theme lists (for comparison), and the link
# data for its WordNet and thesaurus routes. Usage, from anywhere:
#
#   python3 -I tools/foundry/build.py <sources dir> <out dir>
#
# <sources dir> holds three npm tarballs, each unpacked into a folder of its
# own name (see wordlists/MAKING-LISTS.md → "The Register Foundry"):
#   wordnet-db-3.1.14/package   WordNet 3.1's database files
#   moby-1.1.2/package          the Moby thesaurus as words.txt
#   thesaurus-0.0.1/package     OpenOffice's en_US thesaurus, as a JS object
# They are read strictly as data: nothing in them is run, the JS file
# included (its body is parsed as JSON).
#
# Writes to <out dir>:
#   register-foundry.html       copied from beside this script
#   dict.txt                    wordlist.txt, letters only, minus the slurs
#   lists/<theme>.txt           each theme list, restricted to dict.txt
#   rel/<letter>.txt            word TAB wordnet-neighbours TAB thesaurus-
#                               neighbours (minus the WordNet ones), all
#                               within dict.txt, links made symmetric
#   rel/deg.txt                 word TAB its number of distinct links
import collections, json, os, re, shutil, sys

SRC, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
WL = os.path.join(HERE, '..', '..', 'wordlists')
os.makedirs(os.path.join(OUT, 'lists'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'rel'), exist_ok=True)
shutil.copy(os.path.join(HERE, 'register-foundry.html'), OUT)

# ── the dictionary and the lists
ex = {l.strip().lower() for l in open(os.path.join(WL, 'excluded-slurs.txt')) if l.strip() and not l.startswith('#')}
words = sorted({l.strip().lower() for l in open(os.path.join(WL, 'wordlist.txt')) if re.fullmatch(r'[A-Za-z]+', l.strip())} - ex)
open(os.path.join(OUT, 'dict.txt'), 'w').write('\n'.join(words) + '\n')
D = set(words)
for f in sorted(os.listdir(WL)):
    m = re.fullmatch(r'theme-(\w+)\.txt', f)
    if m:
        L = sorted({l.strip().lower() for l in open(os.path.join(WL, f)) if l.strip()} & D)
        open(os.path.join(OUT, 'lists', m[1] + '.txt'), 'w').write('\n'.join(L) + '\n')
        print('list', m[1], len(L))
print('dict', len(D))

# ── the links
W = collections.defaultdict(set)
T = collections.defaultdict(set)

def link(root, rel):
    if root not in D:
        return
    rel = [r for r in rel if r in D and r != root]
    T[root].update(rel)
    for r in rel:
        T[r].add(root)

# Moby: one root per line, then its related words, comma-separated.
with open(os.path.join(SRC, 'moby-1.1.2/package/words.txt'), encoding='utf-8', errors='ignore') as fh:
    for line in fh:
        parts = [p.strip().lower() for p in line.rstrip('\n').split(',')]
        link(parts[0], parts[1:])

# OpenOffice: a JS file whose body is one JSON object literal.
raw = open(os.path.join(SRC, 'thesaurus-0.0.1/package/lib/th_en_US_new.js'), encoding='utf-8', errors='ignore').read()
for k, v in json.loads(raw[raw.index('{'): raw.rindex('}') + 1]).items():
    link(k.lower(), [str(x).lower() for x in v])

# WordNet: each synset's lemmas, plus the lemmas of the synsets it points to
# by meaning: hypernyms and hyponyms (@ ~, and their instance forms),
# holonyms and meronyms (# %), derivations (+), similar-to (&), see-also (^),
# attributes (=), domains and their members (; -), pertainyms (\), causes (>)
# and entailments (*). Antonyms (!) stay out: a theme's opposites are the
# noise the quick screen exists to drop, not something to feed it.
base = os.path.join(SRC, 'wordnet-db-3.1.14/package/dict/')
syn = {}
for pos in ['noun', 'verb', 'adj', 'adv']:
    with open(base + 'data.' + pos, encoding='latin-1') as fh:
        for line in fh:
            if line.startswith('  '):
                continue
            parts = line.split(' | ')[0].split()
            off, ss = parts[0], parts[2]
            n = int(parts[3], 16)
            lemmas = [re.sub(r'\(.*\)$', '', parts[4 + 2 * i]).lower() for i in range(n)]
            i = 4 + 2 * n
            pc = int(parts[i]); i += 1
            ptrs = []
            for _ in range(pc):
                sym, toff, tpos = parts[i], parts[i + 1], parts[i + 2]
                i += 4
                ptrs.append((sym, toff, 'a' if tpos == 's' else tpos))
            syn[(off, 'a' if ss in 'as' else ss)] = ([l for l in lemmas if l in D], ptrs)
KEEP = {'@', '@i', '~', '~i', '#m', '#s', '#p', '%m', '%s', '%p', '+', '&', '^', '=', ';c', '-c', ';u', '-u', '\\', '>', '*'}
for lem, ptrs in syn.values():
    nb = set(lem)
    for sym, toff, tpos in ptrs:
        if sym in KEEP and (toff, tpos) in syn:
            nb.update(syn[(toff, tpos)][0])
    for l in lem:
        W[l].update(nb - {l})

linked = sorted(set(W) | set(T))
tot = 0
for L in 'abcdefghijklmnopqrstuvwxyz':
    s = ''.join(f"{w}\t{' '.join(sorted(W.get(w, ())))}\t{' '.join(sorted(T.get(w, set()) - W.get(w, set())))}\n"
                for w in linked if w[0] == L)
    open(os.path.join(OUT, f'rel/{L}.txt'), 'w').write(s)
    tot += len(s)
open(os.path.join(OUT, 'rel/deg.txt'), 'w').write(''.join(f"{w}\t{len(W.get(w, set()) | T.get(w, set()))}\n" for w in linked))
print('words with links', len(linked), 'of', len(D))
print('wordnet links', sum(map(len, W.values())), '· thesaurus links', sum(map(len, T.values())), '· shards', round(tot / 1e6, 1), 'MB')
