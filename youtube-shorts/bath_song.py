"""'Bath Time Bubbles' - original CoComelon-style toddler song video (soft 3D look, sung vocals, camera cuts).

    python3 bath_song_audio.py      # builds out/bath-song.wav + lip-sync envelope (needs Kokoro voices/)
    python3 bath_song.py            # renders out/bath-time-bubbles.mp4
    python3 bath_song.py 9.5 20     # preview frames
"""
import math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from toon3d import *
from bath_song_audio import BEAT, DUR, QUACKS, SPLASHES, POPS

SKIN = (255, 208, 178)
SKIN_WARM = (240, 120, 100)
HAIR = (125, 78, 48)
DUCK = (255, 212, 40)
BEAK = (255, 140, 30)
FOAM = (250, 252, 255)
HX, HY = 540, 905           # toddler head centre (design coords)
TUB_TOP = 1215
DUCK_HOME = (255, 1150)
FONT = "fonts/Fredoka.ttf"
_fonts = {}


def font(size):
    if size not in _fonts:
        f = ImageFont.truetype(FONT, size)
        f.set_variation_by_name("Bold")
        _fonts[size] = f
    return _fonts[size]


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out_back(x):
    x = clamp(x)
    return 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2


def lerp(a, b, t):
    return a + (b - a) * t


def lerp2(p, q, t):
    return (lerp(p[0], q[0], t), lerp(p[1], q[1], t))


def seg(x, a, b):
    return clamp((x - a) / (b - a))


MOUTH = np.load("out/bath-song-mouth.npy")


def mouth_open(t):
    i = int(t * FPS)
    if i >= len(MOUTH):
        return 0.0
    v = MOUTH[max(0, i - 1):i + 2].mean()
    return clamp(v * 1.3) ** 0.7


# ---------------------------------------------------------------- static layers
def build_background():
    img = Image.new("RGB", (WW, WH))
    arr = np.zeros((WH, WW, 3))
    ys = np.linspace(0, 1, WH)[:, None]
    for c, (a, b) in enumerate(zip((206, 238, 242), (168, 218, 228))):
        arr[..., c] = a * (1 - ys) + b * ys
    img = Image.fromarray(arr.astype(np.uint8))
    p = Painter(img)
    # tiles
    for row in range(16):
        for col in range(11):
            x, y = col * 104 - 10, row * 104 + 10
            if y > 1560:
                continue
            p.rrect([x + 4, y + 4, x + 100, y + 100], 14, fill=(214, 242, 246))
            p.rrect([x + 8, y + 8, x + 96, y + 50], 12, fill=(222, 247, 250))
    # window with sky
    p.rrect([120, 250, 460, 640], 40, fill=(255, 255, 255))
    p.rrect([145, 275, 435, 615], 30, fill=(150, 210, 255))
    for (cx, cy, r) in [(220, 470, 40), (265, 450, 52), (315, 470, 40), (350, 360, 26), (380, 350, 34), (410, 362, 24)]:
        p.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255))
    p.line([(290, 275), (290, 615)], fill=(255, 255, 255), width=14)
    p.line([(145, 445), (435, 445)], fill=(255, 255, 255), width=14)
    # shelf with bottles
    p.tube((690, 660), (1010, 660), 13, (205, 150, 105))
    for (x, top, r, col) in [(750, 560, 32, (255, 140, 180)), (840, 535, 38, (170, 130, 255)), (935, 585, 28, (120, 215, 150))]:
        p.tube((x, top), (x, 642 - r * 0.3), r, col, spec=0.45, shin=40)
        p.ball(x, top - r - 8, r * 0.45, r * 0.35, (255, 255, 255))
    # towel on a hook
    p.ball(985, 760, 18, 18, (230, 230, 240))
    p.rrect([905, 770, 1065, 1150], 30, fill=(255, 170, 190))
    for k in range(3):
        p.rrect([905, 980 + k * 40, 1065, 996 + k * 40], 4, fill=(255, 225, 235))
    # floor + bath mat
    p.d.rectangle([0, 1560 * S, WW, WH], fill=(242, 222, 190))
    for k in range(6):
        y = 1580 + k * 60
        p.line([(0, y), (1080, y)], fill=(230, 205, 170), width=4)
    p.rrect([170, 1690, 910, 1830], 60, fill=(130, 200, 245))
    for k in range(18):
        x = 210 + k * 38
        p.ellipse([x - 9, 1745, x + 9, 1763], fill=(160, 215, 250))
    img = img.filter(ImageFilter.GaussianBlur(3.2 * S))
    # tub shadow on the floor (sharp-ish, it's near the subject)
    p = Painter(img)
    p.shadow(540, 1585, 470, 45, 0.35)
    return img


def build_tub_front():
    spr = sphere(505 * S, 340 * S, (246, 249, 253), amb=0.7, diff=0.4, spec=0.45, shin=35, rim=0.05)
    w, h = spr.size
    cut = int((TUB_TOP - (1290 - 340)) * S)
    out = spr.copy()
    out.paste((0, 0, 0, 0), (0, 0, w, cut))
    return out


BG = build_background()
TUB = build_tub_front()

rng = np.random.default_rng(8)
FOAM_BACK = [(x, 1150 + rng.uniform(-12, 8), rng.uniform(40, 70), rng.uniform(0, 6)) for x in np.linspace(110, 970, 17)]
FOAM_FRONT = [(x, 1205 + rng.uniform(-10, 10), rng.uniform(42, 78), rng.uniform(0, 6)) for x in np.linspace(95, 985, 19)]
AMBIENT = []
for i in range(46):
    st = rng.uniform(0, DUR)
    AMBIENT.append(dict(t0=st, x=rng.uniform(120, 960), r=rng.uniform(14, 42), v=rng.uniform(70, 140),
                        life=rng.uniform(2.0, 5.5), ph=rng.uniform(0, 6)))


# ---------------------------------------------------------------- choreography
def shot(b):
    """camera (zoom, focus) for beat b - hard cuts on the bar lines."""
    shots = [(0, 1.0, (540, 960), 1.08, (540, 980)), (8, 1.25, (540, 1010), 1.3, (540, 1000)),
             (16, 1.62, (540, 900), 1.7, (540, 905)), (20, 1.35, (640, 1030), 1.4, (650, 1040)),
             (24, 1.12, (540, 1000), 1.16, (540, 1000)), (32, 1.6, (330, 1080), 1.66, (320, 1090)),
             (36, 1.35, (430, 1060), 1.4, (430, 1060)), (40, 1.04, (540, 980), 1.08, (540, 980)),
             (48, 1.32, (540, 930), 1.42, (540, 920)), (56, 1.1, (540, 990), 1.14, (540, 990)),
             (64, 1.36, (540, 900), 1.42, (540, 900)), (72, 1.25, (540, 960), 1.02, (540, 970)), (999, 0, 0, 0, 0)]
    for (a, z0, f0, z1, f1), nxt in zip(shots, shots[1:]):
        if a <= b < nxt[0]:
            p = ease((b - a) / (nxt[0] - a))
            return lerp(z0, z1, p), lerp2(f0, f1, p)
    return 1.0, (540, 960)


def splash_since(b):
    s = [b - x for x in SPLASHES if 0 <= b - x < 1.0]
    return min(s) if s else None


def toddler(t):
    b = t / BEAT
    st = dict(tilt=6 * math.sin(math.pi * b / 2), bob=-12 * abs(math.sin(math.pi * b)), look=(0, 0),
              cross=0.0, blink=0.0, happy_eyes=False, brows=0.0, mouth=mouth_open(t), foam_hair=0.0,
              hands=((300, 1200), (780, 1200)), sponge=None, foot=0.0, wow=False, nod=0.0)
    # blink every ~3.3s
    ph = (t + 0.7) % 3.3
    if ph < 0.13:
        st["blink"] = math.sin(ph / 0.13 * math.pi)
    rest = ((300, 1200), (780, 1200))
    if b < 8:
        w = math.sin(t * 13)
        st["hands"] = ((300, 1188), (800 + 35 * w, 820)) if 0.5 <= b < 7 else rest
        st["brows"] = 1.0
    elif b < 16:
        sway = math.sin(math.pi * b / 2)
        st["hands"] = ((310 + 15 * sway, 1188), (770 + 15 * sway, 1188))
        if b >= 14:
            up = ease_out_back(seg(b, 14, 14.5))
            st["hands"] = (lerp2(rest[0], (330, 800), up), lerp2(rest[1], (750, 800), up))
            st["brows"] = 1.0
    elif b < 20:
        if b >= 17.4:
            st["cross"] = clamp((b - 17.4) * 3) if b < 19 else 0.0
            st["look"] = (0, 0.7) if b < 19 else (0, 0)
        if b >= 19:
            st["happy_eyes"] = b < 20
            st["mouth"] = max(st["mouth"], 0.5)
    elif b < 24:
        st["foot"] = ease_out_back(seg(b, 20, 20.6)) * (1 - seg(b, 23.6, 24))
        st["look"] = (0.9, 0.8)
    elif b < 28:
        a = t * 9
        st["hands"] = ((330, 1150), (440 + 55 * math.cos(a), 1065 + 35 * math.sin(a)))
        st["sponge"] = 1
    elif b < 32:
        s = splash_since(b)
        if s is not None and s < 0.6:
            k = s / 0.6
            y = 1190 - 230 * math.sin(k * math.pi) if k > 0.15 else 1190
            st["hands"] = ((330, y), (750, y))
        else:
            st["hands"] = ((330, 1000), (750, 1000)) if b % 1 > 0.6 else rest
        st["happy_eyes"] = 30 <= b < 32
    elif b < 40:
        st["look"] = (-1, 0.4)
        st["hands"] = ((240, 1060), (780, 1188)) if b >= 35.5 else rest
    elif b < 48:
        s = splash_since(b)
        if s is not None and s < 0.8:
            k = s / 0.8
            y = lerp(800, 1190, ease(k * 2)) if k < 0.5 else 1190
            st["hands"] = ((330, y), (750, y))
        else:
            dance = math.sin(math.pi * b)
            st["hands"] = ((330 - 30 * dance, 860), (750 - 30 * dance, 860))
        st["brows"] = 1.0
        st["happy_eyes"] = 44 <= b < 46
    elif b < 56:
        st["wow"] = 49 <= b < 54
        st["look"] = (math.sin(t * 2.2) * 0.9, -0.5) if 50 <= b < 54 else (0, 0)
        st["happy_eyes"] = 54 <= b < 56
        st["hands"] = ((360, 1000), (720, 1000)) if 49 <= b < 54 else rest
    elif b < 64:
        s = splash_since(b)
        if b < 60:
            if s is not None and s < 0.8:
                k = s / 0.8
                y = lerp(800, 1190, ease(k * 2)) if k < 0.5 else 1190
                st["hands"] = ((330, y), (750, y))
            else:
                st["hands"] = ((330, 880), (750, 880))
        else:
            a = t * 12
            st["hands"] = ((345 + 14 * math.sin(a), 800 + 18 * math.cos(a)), (735 - 14 * math.sin(a), 800 - 18 * math.cos(a)))
            st["happy_eyes"] = True
            st["foam_hair"] = seg(b, 60, 63.5)
    elif b < 72:
        st["foam_hair"] = 1.0
        if 68 <= b < 70:
            st["nod"] = math.sin((b - 68) * math.pi * 2) * 1.0
        st["brows"] = 1.0 if b >= 68 else 0.0
    else:
        st["foam_hair"] = 1.0 - seg(b, 72.2, 72.6)
        up = ease_out_back(seg(b, 72.4, 73.0))
        st["hands"] = (lerp2(rest[0], (300, 760), up), lerp2(rest[1], (780, 760), up))
        st["happy_eyes"] = 73.5 <= b < 76
        st["brows"] = 1.0
        st["tilt"] = 10 * math.sin(t * 9) * (1 - seg(b, 72.4, 74)) if b < 74 else st["tilt"]
    return st


def duck_state(t):
    b = t / BEAT
    x, y = DUCK_HOME
    y += 7 * math.sin(t * 2.4)
    x += 10 * math.sin(t * 0.9)
    quack, sq = 0.0, 1.0
    for q in QUACKS + [4.5, 77]:
        s = b - q
        if 0 <= s < 0.8:
            quack = max(quack, math.sin(clamp(s / 0.5) * math.pi))
            sq = 1 + 0.18 * math.exp(-s * 6) * math.cos(s * 18)
    hop = 0
    if 40 <= b < 48 or 56 <= b < 60:
        hop = 22 * abs(math.sin(math.pi * b))
    return x, y - hop, quack, sq


# ---------------------------------------------------------------- drawing
def draw_foam(p, row, t):
    for i, (x, y, r, ph) in enumerate(row):
        p.ball(x, y + 4 * math.sin(t * 1.8 + ph), r, r * 0.86, FOAM, amb=0.74, diff=0.32, spec=0.25, rim=0.05)


def draw_head(t, st):
    """Toddler head in its own layer (design units scaled by S), returned with its centre offset."""
    size = int(760 * S)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    p = Painter(layer)
    cx, cy = 380, 400
    # ears + head
    for side in (-1, 1):
        p.ball(cx + side * 182, cy + 18, 40, 52, SKIN, warm=SKIN_WARM)
        p.ball(cx + side * 182, cy + 18, 20, 30, (245, 180, 160), amb=0.8, diff=0.2, spec=0.0)
    p.ball(cx, cy, 192, 180, SKIN, warm=SKIN_WARM, spec=0.22, shin=22)
    # hair tuft + curl
    p.ball(cx - 10, cy - 150, 120, 46, HAIR, rot=-8, spec=0.3)
    for k, (dx, dy, r) in enumerate([(30, -196, 30), (52, -222, 24), (40, -248, 19), (16, -252, 15)]):
        p.ball(cx + dx, cy + dy, r, r, HAIR, spec=0.35)
    # cheeks
    for side in (-1, 1):
        p.paste(soft_blob(48 * S, 32 * S, (255, 120, 130), 0.45), cx + side * 112, cy + 70)
    # eyes
    for side in (-1, 1):
        ex, ey = cx + side * 70, cy - 8
        if st["happy_eyes"] or st["blink"] > 0.6:
            p.arc([ex - 38, ey - 22, ex + 38, ey + 30], 200, 340, fill=(60, 35, 30), width=11)
            continue
        big = 1.18 if st["wow"] else 1.0
        sy = 1 - 0.8 * st["blink"]
        p.ball(ex, ey, 46 * big, 54 * big * sy, (255, 255, 255), amb=0.85, diff=0.2, spec=0.2)
        lx = st["look"][0] * 12 - side * st["cross"] * 14
        ly = st["look"][1] * 12
        p.ball(ex + lx, ey + ly + 4, 36 * big, 42 * big * sy, (85, 50, 30), spec=0.5, shin=40)
        p.ball(ex + lx, ey + ly + 6, 20 * big, 24 * big * sy, (20, 12, 10), spec=0.0)
        p.ellipse([ex + lx - 22, ey + ly - 22, ex + lx - 6, ey + ly - 6], fill=(255, 255, 255))
        p.ellipse([ex + lx + 10, ey + ly + 14, ex + lx + 18, ey + ly + 22], fill=(255, 255, 255))
        # eyebrow
        by = ey - 72 - 14 * st["brows"]
        p.arc([ex - 34, by, ex + 34, by + 30], 200, 340, fill=HAIR, width=9)
    # nose
    p.ball(cx, cy + 50, 24, 18, (246, 180, 152), spec=0.4)
    # mouth (lip-synced)
    m = st["mouth"]
    mx, my = cx, cy + 108
    if m < 0.08:
        p.arc([mx - 38, my - 26, mx + 38, my + 16], 25, 155, fill=(150, 60, 60), width=9)
    else:
        w = 34 + 14 * m
        h = 14 + 58 * m
        p.chord([mx - w, my - h * 0.35, mx + w, my + h], 0, 180, fill=(120, 30, 45))
        p.chord([mx - w * 0.6, my + h * 0.35, mx + w * 0.6, my + h * 0.98], 180, 360, fill=(255, 120, 140))
        p.chord([mx - w * 0.9, my - h * 0.32, mx + w * 0.9, my + h * 0.2], 0, 180, fill=(255, 255, 255))
        p.chord([mx - w, my - h * 0.35, mx + w, my + h], 0, 180, outline=(150, 60, 60), width=6)
    # foam hair
    fh = st["foam_hair"]
    if fh > 0:
        for k, (dx, dy, r) in enumerate([(-90, -150, 62), (-30, -180, 72), (40, -175, 68), (95, -145, 58),
                                         (-50, -240, 60), (20, -255, 66), (-5, -320, 56), (55, -300, 48)]):
            kk = clamp(fh * 8 - k)
            if kk > 0:
                rr = r * ease_out_back(kk)
                p.ball(cx + dx, cy + dy + 6 * math.sin(t * 3 + k), rr, rr * 0.9, FOAM, amb=0.75, diff=0.3, spec=0.3)
    return layer, (cx, cy)


def ik(sh, hand, side, l1=118, l2=112):
    dx, dy = hand[0] - sh[0], hand[1] - sh[1]
    d = math.hypot(dx, dy)
    d2 = min(d, l1 + l2 - 1)
    a = math.atan2(dy, dx)
    cosb = clamp((l1 * l1 + d2 * d2 - l2 * l2) / (2 * l1 * d2), -1, 1)
    bnd = math.acos(cosb) * side
    return (sh[0] + l1 * math.cos(a + bnd), sh[1] + l1 * math.sin(a + bnd))


def draw_arm(p, sh, hand, side, sponge=False):
    el = ik(sh, hand, side)
    p.tube(sh, el, 33, SKIN, warm=SKIN_WARM)
    p.tube(el, hand, 30, SKIN, warm=SKIN_WARM)
    p.ball(hand[0], hand[1], 40, 38, SKIN, warm=SKIN_WARM)
    if sponge:
        p.ball(hand[0] + 10, hand[1] - 10, 62, 42, (255, 225, 80), rot=-15, amb=0.7, diff=0.4, spec=0.1)
        for (ox, oy) in [(-20, -20), (15, -28), (30, 0), (-5, 2), (40, -25)]:
            p.ellipse([hand[0] + ox - 6, hand[1] + oy - 6, hand[0] + ox + 6, hand[1] + oy + 6], fill=(230, 190, 50))


def draw_duck(p, t):
    x, y, quack, sq = duck_state(t)
    p.shadow(x + 10, y + 60, 90, 18, 0.18)
    p.ball(x, y + 10, 100 * sq, 72 / sq, DUCK, spec=0.4, shin=30)
    p.ball(x - 35, y + 4, 46, 30, (255, 195, 30), rot=-20, spec=0.2)
    p.ball(x - 102, y - 25, 30, 22, DUCK, rot=-40)
    hx, hy = x + 32, y - 78 - 12 * quack
    p.ball(hx, hy, 60, 58, DUCK, spec=0.4, shin=30)
    # beak (opens on quack)
    p.ball(hx + 62, hy + 12 - 10 * quack, 40, 15, BEAK, rot=-6 - 18 * quack, spec=0.4)
    p.ball(hx + 58, hy + 26 + 12 * quack, 34, 12, (235, 110, 20), rot=6 + 18 * quack)
    # eye
    p.ball(hx + 16, hy - 12, 13, 16, (25, 20, 20), spec=0.6, shin=50)
    p.ellipse([hx + 10, hy - 22, hx + 17, hy - 15], fill=(255, 255, 255))
    p.paste(soft_blob(16 * S, 10 * S, (255, 120, 80), 0.5), hx + 30, hy + 12)


def draw_bubbles(p, t, front):
    b = t / BEAT
    for i, bb in enumerate(AMBIENT):
        if (i % 2 == 0) != front:
            continue
        s = t - bb["t0"]
        if not (0 <= s < bb["life"] + 0.25):
            continue
        x = bb["x"] + 30 * math.sin(s * 2 + bb["ph"])
        y = 1150 - bb["v"] * s - 0.5 * 20 * s * s
        if s < bb["life"]:
            p.bubble(x, y, bb["r"] * min(1, s * 4))
        else:
            pop(p, x, y, bb["r"], (s - bb["life"]) / 0.25)


def pop(p, x, y, r, k):
    if k >= 1:
        return
    a = int(200 * (1 - k))
    rr = r * (1 + 1.2 * k)
    p.ellipse([x - rr, y - rr, x + rr, y + rr], outline=(255, 255, 255, a), width=4)
    for i in range(8):
        ang = i * math.pi / 4 + 0.3
        dx, dy = math.cos(ang) * rr * 1.4, math.sin(ang) * rr * 1.4
        p.ellipse([x + dx - 5, y + dy - 5, x + dx + 5, y + dy + 5], fill=(220, 240, 255, a))


def draw_droplets(p, t):
    b = t / BEAT
    for k, sb in enumerate(SPLASHES):
        s = (b - sb) * BEAT
        if not (0 <= s < 0.9):
            continue
        r = np.random.default_rng(k + 3)
        for i in range(26):
            side = -1 if i % 2 else 1
            x0 = 540 + side * r.uniform(150, 260)
            vx, vy = side * r.uniform(60, 420), -r.uniform(700, 1300)
            x, y = x0 + vx * s, 1170 + vy * s + 0.5 * 2600 * s * s
            if y > 1240:
                continue
            rad = r.uniform(7, 15)
            p.ball(x, y, rad, rad * 1.15, (190, 225, 255), amb=0.75, diff=0.3, spec=0.7, shin=40)


def draw_sparkles(p, t, b):
    if b < 72.4:
        return
    for i in range(10):
        ang = i * 2 * math.pi / 10 + t * 0.6
        rr = 330 + 30 * math.sin(t * 3 + i)
        x, y = HX + rr * math.cos(ang), HY + 40 + rr * 0.9 * math.sin(ang)
        k = 0.5 + 0.5 * math.sin(t * 8 + i * 1.7)
        s = 16 + 26 * k
        pts = []
        for j in range(8):
            rad = s if j % 2 == 0 else s * 0.28
            a2 = j * math.pi / 4
            pts.append((x + rad * math.cos(a2), y + rad * math.sin(a2)))
        p.polygon(pts, fill=(255, 250, 200, int(140 + 110 * k)))


def draw_foot(p, t, k):
    if k <= 0:
        return
    x, y = 790, 1200 - 150 * k
    wig = math.sin(t * 14) * 6
    p.ball(x, y + 30, 62, 80, SKIN, rot=10, warm=SKIN_WARM)
    for i, (dx, r) in enumerate([(-44, 22), (-18, 18), (6, 16), (27, 14), (45, 12)]):
        p.ball(x + dx, y - 42 + abs(dx) * 0.25 + (wig if i % 2 else -wig), r, r * 1.1, SKIN, warm=SKIN_WARM)
    b = t / BEAT
    for i, (dx, dy, r) in enumerate([(-44, -80, 26), (0, -78, 20), (40, -70, 22)]):
        if b < 23:
            p.bubble(x + dx, y + dy + 4 * math.sin(t * 3 + i), r)
        else:
            pop(p, x + dx, y + dy, r, (b - 23) * 1.5 - i * 0.15)


def frame(t):
    b = t / BEAT
    world = BG.copy()
    p = Painter(world)
    st = toddler(t)
    draw_bubbles(p, t, front=False)
    # tub back rim + back foam
    p.tube((105, 1150), (975, 1150), 24, (240, 244, 250), amb=0.75, diff=0.35, spec=0.4)
    draw_foam(p, FOAM_BACK, t)
    # body
    hx, hy = HX, HY + st["bob"] + st["nod"] * 18
    p.ball(540, 1135 + st["bob"] * 0.5, 165, 95, SKIN, warm=SKIN_WARM)
    p.ball(540, 1060 + st["bob"] * 0.7, 70, 60, SKIN, warm=SKIN_WARM)
    # giant bubble behind the head
    gb = ease(seg(b, 48.5, 52)) if 48.5 <= b < 54 else 0
    head, (cx, cy) = draw_head(t, st)
    rot = st["tilt"] + st["nod"] * 3
    head = head.rotate(-rot, Image.BICUBIC)
    world.paste(head, (int(hx * S - cx * S), int(hy * S - cy * S)), head)
    if gb > 0:
        p.bubble(hx, hy - 20, 120 + 220 * gb)
    if 54 <= b < 54.5:
        pop(p, hx, hy - 20, 340, (b - 54) * 2)
    # nose bubble
    if 16 <= b < 19:
        k = ease(seg(b, 16, 17.4))
        nx, ny = lerp(760, hx, k), lerp(640, hy + 52, k) - 60 * math.sin(k * math.pi)
        p.bubble(nx, ny, 34 + 6 * math.sin(t * 6) * (b >= 17.4))
    if 19 <= b < 19.6:
        pop(p, hx, hy + 52, 36, (b - 19) / 0.5)
    # foam hair burst at the outro
    if 72.2 <= b < 73.2:
        k = (b - 72.2)
        for i in range(10):
            ang = -math.pi / 2 + (i - 4.5) * 0.3
            x, y = hx + math.cos(ang) * 400 * k, hy - 200 + math.sin(ang) * 400 * k + 600 * k * k
            p.ball(x, y, 40 * (1 - k), 36 * (1 - k), FOAM, amb=0.75, diff=0.3)
    draw_foam(p, FOAM_FRONT, t)
    world.paste(TUB, (int((540 - 505) * S) - 1, int((1290 - 340) * S) - 1), TUB)
    p.tube((80, TUB_TOP + 4), (1000, TUB_TOP + 4), 30, (250, 252, 255), amb=0.75, diff=0.35, spec=0.5, shin=40)
    for fx in (175, 905):
        p.ball(fx, 1555, 48, 36, (240, 190, 60), spec=0.6, shin=40)
    # arms + foot + duck
    draw_foot(p, t, st["foot"])
    draw_arm(p, (395, 1090 + st["bob"] * 0.6), st["hands"][0], -1)
    draw_arm(p, (685, 1090 + st["bob"] * 0.6), st["hands"][1], 1, sponge=st["sponge"] is not None)
    draw_duck(p, t)
    draw_droplets(p, t)
    draw_bubbles(p, t, front=True)
    for pb in POPS:
        if 0 <= b - pb < 0.5 and pb not in (19, 23, 54):
            pop(p, 540 + 260 * math.sin(pb * 1.7), 760 + 120 * math.cos(pb), 40, (b - pb) * 2)
    draw_sparkles(p, t, b)
    zoom, focus = shot(b)
    out = shoot(world, zoom, focus)
    draw_title(out, t)
    return out


def draw_title(img, t):
    if t > 5.6:
        return
    d = ImageDraw.Draw(img, "RGBA")
    k_in = ease_out_back(seg(t, 0.15, 0.75))
    k_out = 1 - ease(seg(t, 5.0, 5.5))
    k = k_in * k_out
    if k <= 0.01:
        return
    for i, (text, y, size, col) in enumerate([("Bath Time", 250, 150, (255, 255, 255)),
                                              ("Bubbles!", 410, 170, (255, 214, 60))]):
        s = int(size * k)
        if s < 8:
            continue
        wob = 8 * math.sin(t * 4 + i)
        d.text((W / 2 + 8, y + wob + 10), text, font=font(s), fill=(20, 80, 140, 90), anchor="mm")
        d.text((W / 2, y + wob), text, font=font(s), fill=col, anchor="mm", stroke_width=max(2, s // 11),
               stroke_fill=(40, 120, 220))


if __name__ == "__main__":
    pv = [float(x) for x in sys.argv[1:]]
    if pv:
        for x in pv:
            frame(x).save(f"out/pv/bath_t{x:05.1f}.png")
    else:
        render_parallel(frame, DUR, "out/bath-song.wav", "out/bath-time-bubbles.mp4", workers=4)
        print("done")
