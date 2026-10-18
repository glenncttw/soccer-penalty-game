"""Stylised seamless grass texture: thin V / Y / arc tufts drawn as light strokes on a mid-green base.

Writes grass_albedo.png, grass_normal.png (OpenGL tangent space) and grass_height.png.
Glyphs are drawn as they should look on screen (square tufts, round dots); the game's
textureStretch makes up for the low camera angle.

Run with no arguments to remake the pictures in the game (python3 tools/make_grass_texture.py --out <folder>),
then save grass_albedo.png as WebP (quality 90) and grass_normal.png as JPEG (quality 85, no chroma
subsampling) into public/assets/grass/. Needs numpy and Pillow. See docs/grass-textures.md.
"""
import argparse
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

p = argparse.ArgumentParser()
p.add_argument('--out', default='.')
p.add_argument('--size', type=int, default=1024)
p.add_argument('--tufts', type=int, default=900)
p.add_argument('--length', type=float, default=40, help='blade length in output pixels')
p.add_argument('--width', type=float, default=0.13, help='blade root width as a fraction of its length')
p.add_argument('--dots', type=int, default=350)
p.add_argument('--seed', type=int, default=7)
p.add_argument('--base', default='#5b9535')
p.add_argument('--root', default='#649d3a')
p.add_argument('--tip', default='#b4da72')
p.add_argument('--shadow', default='#3d6b26')
p.add_argument('--dot', default='#b9dd7c')
p.add_argument('--mottle', type=float, default=0.12, help='soft darker and lighter patches in the base, +-')
p.add_argument('--ss', type=int, default=4, help='supersampling')
a = p.parse_args()

rng = random.Random(a.seed)
S = a.size
SS = a.ss
W = S * SS


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)


BASE, ROOT, TIP, SHADOW, DOT = map(hexrgb, (a.base, a.root, a.tip, a.shadow, a.dot))

# Base with soft patches about a tuft or two across; seamless because the noise grid wraps.
nrng = np.random.default_rng(a.seed)
cells_n = max(4, int(S / (a.length * 1.5)))
grid = nrng.uniform(-1, 1, (cells_n, cells_n))
big = Image.fromarray(((np.tile(grid, (3, 3)) + 1) * 127.5).astype(np.uint8)).resize((3 * W, 3 * W), Image.BICUBIC)
noise = np.asarray(big.crop((W, W, 2 * W, 2 * W))).astype(float) / 127.5 - 1
base = np.clip(BASE[None, None, :] * (1 + a.mottle * noise[..., None]), 0, 255).astype(np.uint8)
albedo = Image.fromarray(base, 'RGB')
height = Image.new('L', (W, W), 0)
da = ImageDraw.Draw(albedo)
dh = ImageDraw.Draw(height)


def blade(root, angle, length, bend, width):
    """Points of a tapered curved blade: list of (left, right, t) along it. Angle 0 = straight up."""
    x0, y0 = root
    dx, dy = math.sin(angle), -math.cos(angle)
    tip = (x0 + dx * length, y0 + dy * length)
    nx, ny = -dy, dx  # perpendicular
    ctrl = (x0 + dx * length * 0.5 + nx * bend * length, y0 + dy * length * 0.5 + ny * bend * length)
    pts = []
    n = 14
    for i in range(n + 1):
        t = i / n
        bx = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * ctrl[0] + t * t * tip[0]
        by = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * ctrl[1] + t * t * tip[1]
        tx = 2 * (1 - t) * (ctrl[0] - x0) + 2 * t * (tip[0] - ctrl[0])
        ty = 2 * (1 - t) * (ctrl[1] - y0) + 2 * t * (tip[1] - ctrl[1])
        tl = math.hypot(tx, ty) or 1
        px, py = -ty / tl, tx / tl
        w = width * (1 - t) ** 0.8 * 0.5 + 0.15 * SS  # pointed tip, round-ish root
        pts.append(((bx + px * w, by + py * w), (bx - px * w, by - py * w), t))
    return pts


def draw_blade(pts, offset, shade):
    ox, oy = offset

    def outline(part, d=0.0):
        side = [(l[0] + ox + d, l[1] + oy + d) for l, _, _ in part]
        back = [(r[0] + ox + d, r[1] + oy + d) for _, r, _ in reversed(part)]
        return side + back

    # Shadow: the whole blade nudged down-right, drawn first, so each blade gets a darker edge.
    da.polygon(outline(pts, 1.6 * SS), fill=tuple(int(c) for c in SHADOW))
    dh.polygon(outline(pts), fill=225)
    # Colour from root to tip: each step paints the rest of the blade, so there are no seams.
    for i in range(len(pts) - 1):
        t = pts[i][2]
        col = BASE + (ROOT + (TIP - ROOT) * t ** 1.3 - BASE) * shade
        da.polygon(outline(pts[i:]), fill=tuple(int(np.clip(c, 0, 255)) for c in col))


GRID = max(1, round(math.sqrt(a.tufts)))
cells = [(i, j) for i in range(GRID) for j in range(GRID)]


def tuft(k):
    # One tuft per grid cell, jittered: evenly spread, no clumps or bald spots.
    i, j = cells[k % len(cells)]
    x, y = (i + rng.uniform(0.0, 1.0)) * W / GRID, (j + rng.uniform(0.0, 1.0)) * W / GRID
    L = a.length * SS * rng.uniform(0.75, 1.25)
    width = L * a.width * rng.uniform(0.8, 1.2)
    kind = rng.random()
    blades = []
    if kind < 0.4:  # V
        s = rng.uniform(0.25, 0.55)
        tilt = rng.uniform(-0.15, 0.15)
        blades = [(tilt - s, -rng.uniform(0.05, 0.2)), (tilt + s, rng.uniform(0.05, 0.2))]
    elif kind < 0.75:  # Y
        s = rng.uniform(0.3, 0.6)
        tilt = rng.uniform(-0.15, 0.15)
        blades = [(tilt - s, -0.15), (tilt + rng.uniform(-0.1, 0.1), rng.uniform(-0.08, 0.08)), (tilt + s, 0.15)]
    else:  # lying over: one or two arcs bending to one side
        side = rng.choice((-1, 1))
        blades = [(side * rng.uniform(0.5, 1.1), side * rng.uniform(0.25, 0.4))]
        if rng.random() < 0.5:
            blades.append((side * rng.uniform(0.1, 0.4), side * rng.uniform(0.15, 0.3)))
    out = []
    shade = rng.uniform(0.6, 1.25)  # some tufts stand out more than others
    for ang, bend in blades:
        out.append(blade((x, y), ang, L * rng.uniform(0.8, 1.1), bend, width))
    return shade, out


margin = a.length * SS * 1.6
tufts = [tuft(k) for k in range(GRID * GRID)]
tufts.sort(key=lambda bl: bl[1][0][0][0][1])  # back to front: lower roots drawn last
for bl in tufts:
    xs = [q[0] for pts in bl[1] for side in pts for q in side[:2]]
    ys = [q[1] for pts in bl[1] for side in pts for q in side[:2]]
    for ox in (-W, 0, W):
        for oy in (-W, 0, W):
            if max(xs) + ox < -margin or min(xs) + ox > W + margin or max(ys) + oy < -margin or min(ys) + oy > W + margin:
                continue
            for pts in bl[1]:
                draw_blade(pts, (ox, oy), bl[0])

for _ in range(a.dots):
    x, y = rng.uniform(0, W), rng.uniform(0, W)
    r = rng.uniform(1.0, 1.8) * SS
    for ox in (-W, 0, W):
        for oy in (-W, 0, W):
            da.ellipse((x + ox - r, y + oy - r, x + ox + r, y + oy + r), fill=tuple(int(c) for c in DOT))
            dh.ellipse((x + ox - r, y + oy - r, x + ox + r, y + oy + r), fill=200)

alb = albedo.resize((S, S), Image.LANCZOS)
hgt = height.resize((S, S), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.6))
alb.save(f'{a.out}/grass_albedo.png')
hgt.save(f'{a.out}/grass_height.png')

h = np.asarray(hgt).astype(float) / 255
# Seamless gradients (wrap around). OpenGL: green points up the picture (toward the goal).
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
k = 6.0
n = np.dstack((-gx * k, gy * k, np.ones_like(h)))
n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(np.clip((n * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)).save(f'{a.out}/grass_normal.png')
m = np.asarray(alb).reshape(-1, 3).astype(float)
print('albedo mean', m.mean(0).round(1), 'luma std', (m @ [.3, .6, .1]).std().round(1), 'normal z mean', n[..., 2].mean().round(3))
