#!/usr/bin/env python3
"""Draw the home-screen icons from かずぴょん.

iOS ignores an SVG apple-touch-icon, so the icon has to be a real PNG. Rather
than keep a hand-drawn file in sync with the mascot, redraw it here from the same
geometry as mascotSVG() in src/js/03-art.js (viewBox 0 0 100 100, mood "happy").

Run by hand after changing the mascot; the PNGs are committed so neither build.sh
nor CI needs Python or Pillow.

    python3 tools/make-icons.py

Needs Pillow.  pip install pillow
"""
import os
from PIL import Image, ImageDraw

PAPER = (0xFB, 0xF4, 0xE9)      # --paper
YEL   = (0xF5, 0xC0, 0x42)      # --c-yellow
PINK  = (0xF3, 0x84, 0xAE)      # --c-pink
INK   = (0x2E, 0x2A, 0x3F)      # --ink
RED   = (0xF2, 0x60, 0x4C)      # --c-red

# the mascot's own bounding box in viewBox units, squared up
X0, Y0, SIDE = 2.5, -2.0, 95.0
SS = 4                          # supersampling, for clean edges at 180px


def draw(out_px):
    n = out_px * SS
    pad = n * 0.045
    k = (n - 2 * pad) / SIDE
    P = lambda x, y: (pad + (x - X0) * k, pad + (y - Y0) * k)
    S = lambda v: v * k

    def quad(p0, p1, p2, steps=64):
        pts = []
        for i in range(steps + 1):
            t = i / steps
            u = 1 - t
            pts.append(P(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                         u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
        return pts

    img = Image.new('RGBA', (n, n), PAPER + (255,))

    def ear(cx, svg_rot):
        lay = Image.new('RGBA', (n, n), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        d.rounded_rectangle([P(cx - 7, -2), P(cx + 7, 34)], radius=S(7),
                            fill=YEL + (255,), outline=INK + (255,), width=int(S(3.4)))
        d.rounded_rectangle([P(cx - 3.4, 4), P(cx + 3.4, 28)], radius=S(3.4), fill=PINK + (255,))
        # SVG rotates clockwise for positive angles, PIL counter-clockwise
        return lay.rotate(-svg_rot, center=P(cx, 30), resample=Image.BICUBIC)

    img.alpha_composite(ear(37, -12))
    img.alpha_composite(ear(63, 12))

    d = ImageDraw.Draw(img)
    d.ellipse([P(19, 31), P(81, 93)], fill=YEL + (255,), outline=INK + (255,), width=int(S(3.6)))

    cheeks = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cheeks)
    for cx in (33, 67):                                  # opacity .85
        cd.ellipse([P(cx - 6.4, 63.8), P(cx + 6.4, 72.2)], fill=PINK + (217,))
    img.alpha_composite(cheeks)

    for cx in (38, 62):                                  # "happy" eyes are arcs
        pts = quad((cx - 7, 52), (cx, 44), (cx + 7, 52))
        d.line(pts, fill=INK + (255,), width=int(S(4.5)), joint='curve')
        for cap in (pts[0], pts[-1]):                    # round caps
            r = S(4.5) / 2
            d.ellipse([cap[0] - r, cap[1] - r, cap[0] + r, cap[1] + r], fill=INK + (255,))

    mouth = quad((38, 62), (50, 78), (62, 62))           # M38 62 Q50 78 62 62 Z
    d.polygon(mouth, fill=RED + (255,))
    d.line(mouth + [mouth[0]], fill=INK + (255,), width=int(S(3.4)), joint='curve')

    return img.convert('RGB').resize((out_px, out_px), Image.LANCZOS)


here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')
for size in (180, 192, 512):
    path = os.path.join(here, 'icon-%d.png' % size)
    draw(size).save(path, optimize=True)
    print('wrote', os.path.relpath(path), os.path.getsize(path), 'bytes')
