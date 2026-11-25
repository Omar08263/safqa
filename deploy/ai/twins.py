#!/usr/bin/env python3
"""🧬 Cross-store twins: finds the SAME product listed by different stores, even
when titles are written differently, so every product page can say
"نفس المنتج في محل تاني بسعر أرخص".

Inspired by entity-resolution tools (dedupeio/dedupe, MIT): blocking + scoring.
Ours: multilingual-e5-small title embeddings (already built by embed-catalog.mjs)
as the blocking/similarity signal, then hard guards so we never show a wrong match:
  * different store only
  * model codes (e.g. SM-A155F, 55UR7800) must agree when both titles have one
  * capacities/sizes (128GB, 55 inch, 2000W, 10000mAh) must agree
  * price ratio within 0.55..1.8
Output (static, zero D1 writes): OUT/twins/<2 hex>.json shards + meta.json.
Usage: python3 deploy/ai/twins.py [AI_DIR]   (default ~/.safqa/pages-assets/ai)
"""
import json, os, re, sys, time
from collections import defaultdict
import numpy as np

AI = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.safqa/pages-assets/ai')
idx = json.load(open(os.path.join(AI, 'index.json')))
items, dim = idx['items'], idx['dim']
V = np.fromfile(os.path.join(AI, 'vecs.bin'), dtype=np.int8).astype(np.float32).reshape(-1, dim)
assert len(V) == len(items), (len(V), len(items))
V /= np.linalg.norm(V, axis=1, keepdims=True) + 1e-9

AR_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')
UNIT = {'gb': 'gb', 'جيجا': 'gb', 'tb': 'tb', 'تيرا': 'tb', 'inch': 'in', 'بوصة': 'in', 'بوصه': 'in', '"': 'in', 'w': 'w', 'وات': 'w', 'mah': 'mah', 'hz': 'hz', 'l': 'l', 'لتر': 'l', 'kg': 'kg', 'كيلو': 'kg', 'hp': 'hp', 'حصان': 'hp', 'ton': 'ton', 'طن': 'ton', 'mm': 'mm', 'مم': 'mm', 'cm': 'cm', 'سم': 'cm', 'mbps': 'mbps', 'ah': 'ah'}
unit_re = re.compile(r'(\d+(?:\.\d+)?)\s*(gb|tb|inch|mah|mbps|hz|hp|ton|mm|cm|ah|w|l|kg|مم|سم|جيجا|تيرا|بوصة|بوصه|وات|لتر|كيلو|حصان|طن|")(?![a-z])', re.I)
code_re = re.compile(r'\b(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*\b', re.I)
STOP = {'5g', '4g', '3g', 'wifi', 'usb', 'ddr4', 'ddr5', 'hdmi', 'ssd', 'hdd', 'rgb', 'led', 'lte', 'nfc', 'gen2', 'gen3', 'gen4', 'usb3', 'type-c', 'wi-fi', 'bt5', 'm2', 'nvme', 'pd', 'x2', 'x3', '2in1', '1st', '2nd', '3rd'}

VARIANTS = {'pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'se', 'xt', 'ti', 'super', 'air', 'fe', 'neo', 'prime', 'edge', 'note', 'oled', 'qled', 'tuf', 'rog', 'strix', 'gt', 'gts', 'frame', 'x3d', 'v2', 'v3', 'ii', 'iii', 'airflow', 'ddr3', 'ddr4', 'ddr5', 'gddr6', 'gddr6x', 'gddr7', 'hdd', 'ssd', 'wireless', 'wired'}
num_re = re.compile(r'(?<![\d.])\d{3,6}(?![\d.])')
def feats(t: str):
    t = (t or '').translate(AR_DIGITS).lower()
    units = defaultdict(set)
    for n, u in unit_re.findall(t):
        u = UNIT.get(u.lower(), u.lower())
        v = float(n)
        if u == 'tb':
            u, v = 'gb', v * 1000
        units[u].add(v)
    clean = unit_re.sub(' ', t)
    codes = set()
    for c in code_re.findall(clean):
        c2 = c.replace('-', '')
        if len(c2) >= 3 and c not in STOP and c2 not in STOP:
            codes.add(c2)
    order = num_re.findall(clean)
    nums = set(order)
    first = order[0] if order else None
    words = re.findall(r'[a-z0-9]+', clean)
    brand = words[0] if words and re.match(r'^[a-z]', t.strip()) and words[0].isalpha() else None
    return units, codes, nums, set(words) & VARIANTS, brand, first

F = [feats(f"{x.get('t','')} {x.get('e','')}") for x in items]
store = [x.get('s') or '' for x in items]
price = np.array([float(x.get('p') or 0) for x in items])

def compatible(i, j, sim):
    if store[i] == store[j] or not price[i] or not price[j]:
        return False
    r = price[i] / price[j]
    if r < 0.55 or r > 1.8:
        return False
    (ui, ci, ni, vi, bi, fi), (uj, cj, nj, vj, bj, fj) = F[i], F[j]
    if fi and fj and fi != fj:
        return False
    if bi and bj and bi != bj:
        return False
    if vi != vj:
        # wired/wireless or hdd/ssd only conflict when both sides say it
        if (vi ^ vj) - {'wireless', 'wired', 'hdd', 'ssd'} or ({'wireless', 'wired'} & vi and {'wireless', 'wired'} & vj and vi & {'wireless', 'wired'} != vj & {'wireless', 'wired'}) or ({'hdd', 'ssd'} & vi and {'hdd', 'ssd'} & vj and vi & {'hdd', 'ssd'} != vj & {'hdd', 'ssd'}):
            return False
    for u in set(ui) & set(uj):
        if max(ui[u]) != max(uj[u]):
            return False
    D = lambda c: re.sub(r'\D', '', c)
    for a, nn, cc in ((ci, nj, cj), (cj, ni, ci)):
        for c in a:
            if D(c) in nn and c not in cc:
                return False
    if ni and nj and not (ni & nj):
        return False
    if ci and cj:
        if not (ci & cj):
            return False
        sk = lambda c: re.sub(r'\d+', '#', c)
        for a in ci - cj:
            for b in cj - ci:
                if a[:3] == b[:3] or sk(a) == sk(b) or re.sub(r'\D', '', a) == re.sub(r'\D', '', b):
                    return False
    gap = abs(1 - r)
    if gap > 0.15 and set(ui) != set(uj):
        return False
    if gap > 0.3 and sim < 0.98:
        return False
    need = 0.93 if (ci and cj) else 0.95
    if gap > 0.3:
        need = max(need, 0.97)
    return sim >= need

t0 = time.time()
n = len(items)
twins = defaultdict(list)
CH = 1024
for a in range(0, n, CH):
    S = V[a:a + CH] @ V.T
    for k in range(S.shape[0]):
        i = a + k
        S[k, i] = -1
        cand = np.argpartition(-S[k], 16)[:16]
        for j in cand[np.argsort(-S[k][cand])]:
            s = float(S[k, j])
            if s < 0.90:
                break
            if compatible(i, int(j), s):
                twins[i].append((int(j), s))
print(f'scored {n} products in {time.time() - t0:.1f}s; with twins: {len(twins)}')

out = os.path.join(AI, 'twins'); os.makedirs(out, exist_ok=True)
shards = defaultdict(dict)
gaps = []
for i, lst in twins.items():
    seen, rows = set(), []
    for j, s in sorted(lst, key=lambda x: -x[1]):
        if store[j] in seen:
            continue
        seen.add(store[j])
        x = items[j]
        rows.append({'id': x['id'], 't': x.get('t'), 'p': x.get('p'), 's': x.get('s'), 'i': x.get('i'), 'u': x.get('u'), 'm': round(s, 3)})
        if len(rows) == 4:
            break
    if not rows:
        continue
    pid = items[i]['id']
    shards[pid[1:3]][pid] = rows
    best = min(rows, key=lambda r: r['p'] or 1e12)
    if best['p'] and price[i] > best['p']:
        gaps.append({'id': pid, 't': items[i].get('t'), 'p': items[i].get('p'), 's': store[i], 'twin': best, 'save': round(price[i] - best['p']), 'pct': round(100 * (price[i] - best['p']) / price[i], 1)})
for k, v in shards.items():
    json.dump(v, open(os.path.join(out, f'{k}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
gaps.sort(key=lambda g: -g['pct'])
meta = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'model': idx.get('model'), 'products': n, 'withTwins': sum(len(v) for v in shards.values()),
        'shards': len(shards), 'topGaps': [g for g in gaps if g['save'] >= 50][:40], 'method': 'e5-small cosine ≥0.90 + model-code/capacity/price guards, cross-store only'}
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), ensure_ascii=False, indent=0)
print('twins:', meta['withTwins'], 'gaps:', len(meta['topGaps']))
