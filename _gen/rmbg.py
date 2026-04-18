"""Remove white (and near-white) background from PNG, feather edges."""
import sys, os
from PIL import Image

def remove_white(path, threshold=230, feather=15):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    pixels = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            # pure/near white = high min (all channels high) and low saturation
            if mn >= threshold:
                # fully transparent
                pixels[x, y] = (r, g, b, 0)
            elif mn >= threshold - feather:
                # partial alpha (gradient edge)
                t = (mn - (threshold - feather)) / feather
                alpha = int(255 * (1 - t))
                pixels[x, y] = (r, g, b, alpha)
    im.save(path, 'PNG')
    return path

for p in sys.argv[1:]:
    if os.path.isfile(p):
        remove_white(p)
        print(f"✓ {p}")
