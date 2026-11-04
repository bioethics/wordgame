# Fetches Datamuse's neighbours of every dictionary word, for the Register
# Foundry's link data. Run from a Claude Code session whose network allows
# api.datamuse.com:
#
#   python3 -I tools/foundry/fetch-datamuse.py <sources dir> [budget]
#
# Two relations, in this order:
#   ml   "means like": Datamuse's blend of word embeddings, WordNet and its
#        thesaurus. The kind of neighbour the old lists were seeded from.
#   trg  "triggers": words that turn up near this one in running text more
#        than chance would have them. Association, not synonymy (GHOST →
#        haunted, story, town).
# Up to 100 neighbours each. Answers are appended to
# <sources dir>/datamuse/<rel>.jsonl as they arrive, one {"w", "r"} per line,
# so a run that stops part-way picks up where it left off. Datamuse asks
# keyless callers to stay under 100,000 requests a day; the budget (default
# 95,000) is how many this run may make, and the 164,000 or so for both
# relations take two days.
import concurrent.futures, json, os, re, sys, threading, time, urllib.error, urllib.parse, urllib.request

SRC = sys.argv[1]
budget = int(sys.argv[2]) if len(sys.argv) > 2 else 95000
HERE = os.path.dirname(os.path.abspath(__file__))
WL = os.path.join(HERE, '..', '..', 'wordlists')
ex = {l.strip().lower() for l in open(os.path.join(WL, 'excluded-slurs.txt')) if l.strip() and not l.startswith('#')}
words = sorted({l.strip().lower() for l in open(os.path.join(WL, 'wordlist.txt')) if re.fullmatch(r'[A-Za-z]+', l.strip())} - ex)
os.makedirs(os.path.join(SRC, 'datamuse'), exist_ok=True)


def ask(param, w):
    url = f'https://api.datamuse.com/words?{param}={urllib.parse.quote(w)}&max=100'
    req = urllib.request.Request(url, headers={'User-Agent': 'great-work-wordlists/1'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return [[x['word'], x.get('score', 0)] for x in json.load(r) if ' ' not in x['word']]
        except urllib.error.HTTPError as e:
            if e.code in (403, 407):
                raise SystemExit(f'api.datamuse.com refused ({e.code}): allow it in the environment\'s network settings')
            time.sleep(2 ** attempt)
        except (urllib.error.URLError, TimeoutError) as e:
            if 'Forbidden' in str(e) or '403' in str(e):
                raise SystemExit(f'api.datamuse.com is blocked here ({e}): allow it in the environment\'s network settings')
            time.sleep(2 ** attempt)
    return None


# One request first, so a blocked host stops the run before 82,000 are queued.
probe = ask('ml', 'ghost')
if probe is None:
    raise SystemExit('api.datamuse.com did not answer: try again later')
print('probe: ghost means like', ' '.join(w for w, _ in probe[:12]), flush=True)

for rel, param in [('ml', 'ml'), ('trg', 'rel_trg')]:
    if budget <= 0:
        break
    path = os.path.join(SRC, 'datamuse', rel + '.jsonl')
    done = set()
    if os.path.exists(path):
        for line in open(path):
            try:
                done.add(json.loads(line)['w'])
            except ValueError:
                pass  # a line cut off by an interrupted run; refetched below
    todo = [w for w in words if w not in done][:budget]
    budget -= len(todo)
    print(f'{rel}: {len(done)} cached, fetching {len(todo)}', flush=True)
    lock, got, failed, t0 = threading.Lock(), 0, 0, time.time()
    with open(path, 'a') as out, concurrent.futures.ThreadPoolExecutor(8) as pool:
        for w, r in pool.map(lambda w: (w, ask(param, w)), todo):
            with lock:
                if r is None:
                    failed += 1
                    continue
                out.write(json.dumps({'w': w, 'r': r}) + '\n')
                got += 1
                if got % 2000 == 0:
                    out.flush()
                    print(f'  {got}/{len(todo)} in {time.time() - t0:.0f}s', flush=True)
    print(f'{rel}: fetched {got}, failed {failed} (rerun to retry them)', flush=True)
