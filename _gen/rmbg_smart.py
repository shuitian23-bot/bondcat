"""Smart bg removal: sample corners for dominant bg color, remove similar pixels."""
import sys, os
from PIL import Image

def color_dist(c1, c2):
    return max(abs(c1[0]-c2[0]), abs(c1[1]-c2[1]), abs(c1[2]-c2[2]))

def remove_bg(path, threshold=40, feather=15):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    pixels = im.load()
    # Sample 4 corners
    corners = [pixels[0,0], pixels[w-1,0], pixels[0,h-1], pixels[w-1,h-1]]
    # RGB only
    rgbs = [c[:3] for c in corners if c[3] > 0]
    if not rgbs:
        return
    # Use first non-transparent corner as bg color (assume consistent)
    bg = rgbs[0]
    # Check all corners within threshold — if yes, it's single bg
    if not all(color_dist(c, bg) < threshold for c in rgbs):
        # Corners disagree, fall back to white-only removal
        bg = (255, 255, 255)
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            d = color_dist((r,g,b), bg)
            if d < threshold:
                pixels[x, y] = (r, g, b, 0)
            elif d < threshold + feather:
                t = (d - threshold) / feather
                alpha = int(255 * t)
                pixels[x, y] = (r, g, b, alpha)
    im.save(path, 'PNG')
    print(f"✓ {path} (bg={bg})")

for p in sys.argv[1:]:
    if os.path.isfile(p):
        remove_bg(p)
