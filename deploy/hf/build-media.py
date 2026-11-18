#!/usr/bin/env python3
"""Convert crawled store gallery images to web-sized WebP for the static site.

Input:  deploy/live/media.json + $SAFQA_STATE_DIR/media-raw/<productId>/<file>
Output: <out>/media/<productId>/<n>.webp (1200px max) and <n>-t.webp (360px thumb)
Usage:  python3 deploy/hf/build-media.py <out-dir>
"""
import json, os, sys
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
state = os.environ.get("SAFQA_STATE_DIR", "/home/box/.safqa")
raw = os.path.join(state, "media-raw")
cache = os.path.join(state, "media-web")
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "apps/web/public")
media = json.load(open(os.path.join(root, "deploy/live/media.json")))["products"]
count = 0
for pid, entry in media.items():
    for i, img in enumerate(entry.get("images", [])):
        src = os.path.join(raw, pid, img["file"])
        if not os.path.exists(src):
            continue
        dst_dir = os.path.join(cache, pid)
        os.makedirs(dst_dir, exist_ok=True)
        full = os.path.join(dst_dir, f"{i}.webp")
        thumb = os.path.join(dst_dir, f"{i}-t.webp")
        if not (os.path.exists(full) and os.path.getmtime(full) >= os.path.getmtime(src)):
            im = Image.open(src)
            im = im.convert("RGBA") if im.mode in ("P", "LA") else im
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
            big = bg.copy(); big.thumbnail((1200, 1200)); big.save(full, "WEBP", quality=82, method=5)
            small = bg.copy(); small.thumbnail((360, 360)); small.save(thumb, "WEBP", quality=78, method=5)
        count += 1
target = os.path.join(out, "media")
os.makedirs(target, exist_ok=True)
os.system(f"cp -r '{cache}/.' '{target}/'")
print(f"media: {count} images -> {target}")
