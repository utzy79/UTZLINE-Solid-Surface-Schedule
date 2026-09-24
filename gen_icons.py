#!/usr/bin/env python3
# Generates UTZLINE Solid Surface Schedule's icon set: a solid-surface
# slab/countertop glyph (a beveled rectangular slab with a diagonal sheen
# highlight and a couple of subtle grain veins, reading as "stone/solid
# surface material") plus the same small checkmark "scheduled/on track"
# tick badge the main Scheduler's own icon used, in this app's own accent
# color (#4f5fe0 -- an indigo, chosen because it's the one hue not already
# used by any sibling app: Site Measure/Viewer are orange-red
# (#c8391c / #ff6a3d), Install ITP is green (#1f8a4c), Manufacture ITP is
# purple (#7c3fd1), Delivery ITP is amber, UTZLINE Projects is crimson
# (#ff3b3b), the main UTZLINE Scheduler is blue/teal (#1f8fbf), and
# Machine Schedule is teal/cyan).
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT, exist_ok=True)

BG = (14, 22, 26, 255)       # --bg
ACCENT = (79, 95, 224, 255)  # --accent #4f5fe0
ACCENT_DK = (46, 56, 148, 255)
WHITE = (240, 250, 253, 255)

def draw_slab(d, cx, cy, size, color, sheen_color):
    # size = overall glyph width. A slightly-perspective countertop slab:
    # a beveled rounded rectangle with a top highlight edge, a diagonal
    # sheen band, and a couple of thin grain veins -- reads as a Solid
    # Surface material sample rather than a generic panel.
    w = size
    h = size * 0.62
    x0 = cx - w / 2
    y0 = cy - h / 2
    r = size * 0.09

    # slab body outline
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=r, outline=color, width=max(2, int(size * 0.055)))
    # top bevel edge (a thin lighter strip along the top, like a polished
    # front edge profile on a countertop)
    bevel_h = h * 0.16
    d.rounded_rectangle([x0, y0, x0 + w, y0 + bevel_h], radius=r, fill=color)

    # diagonal sheen highlight -- a soft parallelogram band crossing the
    # slab, in the accent color, suggesting a polished/reflective surface
    sheen_w = w * 0.22
    pts = [
        (x0 + w * 0.30, y0 + h),
        (x0 + w * 0.30 + sheen_w, y0 + h),
        (x0 + w * 0.62 + sheen_w, y0),
        (x0 + w * 0.62, y0),
    ]
    d.polygon(pts, fill=sheen_color)

    # a couple of thin grain veins (stone/solid-surface texture cue)
    vein_w = max(1, int(size * 0.018))
    d.line([x0 + w * 0.14, y0 + h * 0.42, x0 + w * 0.40, y0 + h * 0.68], fill=color, width=vein_w)
    d.line([x0 + w * 0.68, y0 + h * 0.30, x0 + w * 0.90, y0 + h * 0.55], fill=color, width=vein_w)

    # checkmark "tick" bottom-right corner -- same "scheduled/on track"
    # badge the main Scheduler's own icon used, kept for family consistency
    tick_cx = x0 + w * 0.86
    tick_cy = y0 + h * 1.04
    tick_r = size * 0.135
    d.ellipse([tick_cx - tick_r, tick_cy - tick_r, tick_cx + tick_r, tick_cy + tick_r], fill=sheen_color)
    lw = max(2, int(size * 0.03))
    d.line([tick_cx - tick_r * 0.5, tick_cy, tick_cx - tick_r * 0.1, tick_cy + tick_r * 0.4], fill=WHITE, width=lw)
    d.line([tick_cx - tick_r * 0.1, tick_cy + tick_r * 0.4, tick_cx + tick_r * 0.55, tick_cy - tick_r * 0.35], fill=WHITE, width=lw)

def make_icon(path, size, maskable):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, size, size], fill=BG)
        glyph_size = size * 0.66  # keep inside the safe zone
    else:
        d.rounded_rectangle([0, 0, size, size], radius=size * 0.18, fill=BG)
        glyph_size = size * 0.76
    draw_slab(d, size / 2, size / 2, glyph_size, WHITE, ACCENT)
    img.save(path)

make_icon(os.path.join(OUT, "icon-192.png"), 192, False)
make_icon(os.path.join(OUT, "icon-512.png"), 512, False)
make_icon(os.path.join(OUT, "icon-192-maskable.png"), 192, True)
make_icon(os.path.join(OUT, "icon-512-maskable.png"), 512, True)
print("done")
