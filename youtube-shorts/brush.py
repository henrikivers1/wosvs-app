import math, sys, random
from PIL import Image, ImageDraw
from engine import *

g, C, D, E, F, G, A = 67, 72, 74, 76, 77, 79, 81
N1 = [(C, 1), (D, 1), (E, 1), (C, 1)] * 2
N2 = [(E, 1), (F, 1), (G, 2)] * 2
N3 = [(G, .5), (A, .5), (G, .5), (F, .5), (E, 1), (C, 1)] * 2
N4 = [(C, 1), (g, 1), (C, 2)] * 2
T = ["Brush your teeth now, brush your teeth now", "Up and down, round and round",
     "Sug-ar bugs, go a-way! Sug-ar bugs, go a-way!", "Shin-y smile! Shin-y smile!"]


def rnd(unit, rest=0.0):
    ls = [dict(text=t, notes=n, unit=unit) for t, n in zip(T, [N1, N2, N3, N4])]
    ls[0]["rest_before"] = rest
    return ls


song = Song("Brush Your Teeth!", rnd(0.5) + rnd(0.37, rest=1.4), key=60, window=2, sub="Sing along!")
FAST_AT = song.line_spans[4][0]
POPS = sorted(e["t"] for e in song.events if e["line"] in (2, 6) and e["idx"] in (2, 5, 8, 11))
CX, CY = W / 2, 770
BUGS = [(-1.0, -0.55, (120, 210, 60)), (1.0, -0.4, (180, 90, 230)), (-0.8, 0.35, (255, 140, 40)),
        (0.85, 0.45, (120, 210, 60)), (-0.35, -1.05, (180, 90, 230)), (0.45, -1.0, (255, 140, 40)),
        (-0.5, 0.95, (120, 210, 60)), (0.55, 0.9, (180, 90, 230))]
rng = random.Random(5)
BUBS = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(14, 50), rng.uniform(40, 110)) for _ in range(26)]
BG = gradient((120, 225, 210), (60, 160, 220))


def brush_pos(t):
    st = song.state(t)
    li = st["line"] % 4
    a, b = song.line_spans[st["line"]]
    u = song.lines[st["line"]]["unit"]
    beat = (t - a) / u
    if t < song.intro:
        p = ease(t / song.intro)
        return lerp(W + 400, CX + 260, p), CY - 190
    if st["phase"] == "outro" or (song.line_spans[3][1] < t < FAST_AT - 0.3):
        return CX + 420, CY + 380
    if song.line_spans[3][1] < t < FAST_AT:
        p = ease((t - (FAST_AT - 0.3)) / 0.3)
        return lerp(CX + 420, CX, p), lerp(CY + 380, CY - 190, p)
    if li == 0:
        return CX + 130 * math.sin(beat * math.pi), CY - 190
    if li == 1:
        if beat < 4:
            return CX + 260, CY + 20 - 170 * math.sin(beat * math.pi)
        ang = beat * math.pi
        return CX + 250 * math.cos(ang), CY + 20 + 230 * math.sin(ang)
    if li == 2:  # chase the bugs
        nxt = [p for p in POPS if p >= t]
        i = POPS.index(nxt[0]) if nxt else len(POPS) - 1
        bx, by, _ = BUGS[i]
        return CX + bx * 230 + 30 * math.sin(t * 40), CY + by * 260 + 15 * math.cos(t * 40)
    # li == 3: back off to show the smile
    p = ease(beat / 2)
    return lerp(CX + 30, CX + 420, p), lerp(CY + 260, CY + 380, p)


def draw_tooth(d, s, mood, t, st):
    cx, cy = CX, CY + math.sin(t * 2.4) * 12

    def shapes(pad, col):
        r = lambda v: v * s
        d.rounded_rectangle([cx - r(230) - pad, cy - r(190) - pad, cx + r(230) + pad, cy + r(150) + pad], int(r(120)), fill=col)
        for sx in (-1, 1):
            ex = cx + sx * r(115)
            d.ellipse([ex - r(125) - pad, cy - r(300) - pad, ex + r(125) + pad, cy - r(60) + pad], fill=col)
            rx = cx + sx * r(120)
            d.rounded_rectangle([rx - r(85) - pad, cy + r(40) - pad, rx + r(85) + pad, cy + r(330) + pad], int(r(80)), fill=col)
        d.ellipse([cx - r(60) - pad, cy - r(260) - pad, cx + r(60) + pad, cy - r(160) + pad], fill=col)

    d.rounded_rectangle([cx - 230 * s + 14, cy - 290 * s + 22, cx + 230 * s + 14, cy + 330 * s + 22], 120, fill=(0, 0, 0, 40))
    shapes(12, (150, 185, 215))
    shapes(0, (255, 255, 255))
    d.ellipse([cx - 175 * s, cy - 255 * s, cx - 110 * s, cy - 160 * s], fill=(225, 245, 255))
    # face
    fy = cy - 40 * s
    blink = (t % 3.3) < 0.12
    for sx in (-1, 1):
        ex = cx + sx * 85 * s
        if blink:
            d.line([(ex - 26, fy), (ex + 26, fy)], fill=(40, 40, 70), width=9)
        else:
            d.ellipse([ex - 30, fy - 38, ex + 30, fy + 38], fill=(40, 40, 70))
            d.ellipse([ex - 13, fy - 26, ex + 3, fy - 8], fill=(255, 255, 255))
        if mood < 0.5:  # worried brows
            d.line([(ex - 34 * sx, fy - 62), (ex + 30 * sx, fy - 46)], fill=(40, 40, 70), width=9)
        d.ellipse([cx + sx * 150 * s - 30, fy + 40 - 16, cx + sx * 150 * s + 30, fy + 40 + 16], fill=(255, 140, 160, 150))
    my = fy + 70
    sing = 0.4 + 0.6 * st["pulse"] if st["phase"] == "sing" else 0.5
    if mood < 0.5:
        d.chord([cx - 45, my - 4, cx + 45, my + 20 + 30 * sing], 180, 360, fill=(150, 40, 60))
    else:
        w = lerp(45, 95, mood)
        d.chord([cx - w, my - 30, cx + w, my + 30 + 40 * sing * mood], 0, 180, fill=(150, 40, 60))
        d.ellipse([cx - w * 0.5, my + 10 + 20 * sing * mood, cx + w * 0.5, my + 30 + 40 * sing * mood], fill=(255, 120, 140))


def draw_bug(d, x, y, col, t, i):
    r = 48
    x += 8 * math.sin(t * 6 + i)
    y += 8 * math.cos(t * 7 + i * 2)
    for sx in (-1, 1):
        d.line([(x + sx * 15, y - r + 8), (x + sx * 32, y - r - 32)], fill=(40, 40, 60), width=6)
        d.ellipse([x + sx * 32 - 9, y - r - 41, x + sx * 32 + 9, y - r - 23], fill=col)
    pts = []
    for k in range(16):
        a = k / 16 * 6.283
        rr = r * (1 + 0.12 * math.sin(a * 5 + t * 8))
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    d.polygon(pts, fill=col, outline=(40, 40, 60), width=5)
    for sx in (-1, 1):
        d.ellipse([x + sx * 17 - 11, y - 14, x + sx * 17 + 11, y + 8], fill=(255, 255, 255))
        d.ellipse([x + sx * 17 - 5, y - 6, x + sx * 17 + 5, y + 4], fill=(20, 20, 30))
        d.line([(x + sx * 30, y - 26), (x + sx * 6, y - 16)], fill=(20, 20, 30), width=6)
    d.arc([x - 16, y + 10, x + 16, y + 30], 200, 340, fill=(20, 20, 30), width=5)


def draw_brush(d, x, y):
    d.rounded_rectangle([x + 70, y - 22, x + 470, y + 22], 22, fill=(60, 130, 240), outline=(30, 70, 160), width=5)
    d.rounded_rectangle([x - 90, y - 28, x + 100, y + 28], 26, fill=(60, 130, 240), outline=(30, 70, 160), width=5)
    for k in range(9):
        bx = x - 78 + k * 19
        col = (255, 255, 255) if k % 2 else (120, 230, 255)
        d.rounded_rectangle([bx, y - 95, bx + 15, y - 24], 6, fill=col, outline=(120, 170, 200), width=2)
    d.ellipse([x - 70, y - 135, x + 70, y - 80], fill=(140, 230, 220))  # toothpaste
    d.ellipse([x - 40, y - 150, x + 30, y - 105], fill=(220, 255, 250))


def sparkle(d, x, y, s, col):
    d.polygon([(x, y - s), (x + s * 0.25, y - s * 0.25), (x + s, y), (x + s * 0.25, y + s * 0.25),
               (x, y + s), (x - s * 0.25, y + s * 0.25), (x - s, y), (x - s * 0.25, y - s * 0.25)], fill=col)


def scene(t, st):
    img = BG.copy()
    d = ImageDraw.Draw(img, "RGBA")
    for (x, y0, r, sp) in BUBS:
        y = (y0 - t * sp) % (H + 200) - 100
        d.ellipse([x - r, y - r, x + r, y + r], outline=(255, 255, 255, 140), width=4, fill=(255, 255, 255, 30))
        d.ellipse([x - r * 0.5, y - r * 0.6, x - r * 0.15, y - r * 0.25], fill=(255, 255, 255, 160))
    popped = sum(1 for p in POPS if p <= t)
    mood = clamp(popped / len(BUGS) * 1.3) if popped < len(BUGS) else 1.0
    if st["line"] % 4 == 3 and st["phase"] == "sing" and popped >= 4:
        mood = max(mood, 0.8)
    scale = ease_out_back(t / 0.7) * (1 + 0.04 * st["pulse"])
    draw_tooth(d, scale, mood, t, st)
    # bugs
    for i, (bx, by, col) in enumerate(BUGS):
        x, y = CX + bx * 230, CY + by * 260
        if t < POPS[i]:
            if t > 0.4 + i * 0.12:
                draw_bug(d, x, y, col, t, i)
        elif t < POPS[i] + 0.5:
            p = (t - POPS[i]) / 0.5
            r = 40 + 120 * p
            d.ellipse([x - r, y - r, x + r, y + r], outline=col + (int(255 * (1 - p)),), width=10)
            for k in range(8):
                a = k * 0.785
                sparkle(d, x + r * math.cos(a), y + r * math.sin(a), 18 * (1 - p), (255, 255, 255, int(255 * (1 - p))))
            outlined(d, (x, y - 40 - 60 * p), "POP!", int(60 + 20 * p), (255, 255, 255) + (int(255 * (1 - p)),),
                     stroke=(255, 64, 129), sw=6)
    # foam trail
    if st["phase"] == "sing" or (0 < t - FAST_AT + 1.4 < 1.4):
        for k in range(16):
            ts = math.floor(t / 0.09) * 0.09 - k * 0.09
            if ts < song.intro:
                continue
            age = t - ts
            bx, by = brush_pos(ts)
            jit = (math.sin(ts * 91.7) * 60, math.cos(ts * 57.3) * 40)
            r = 14 + 22 * (1 - age / 1.5)
            x, y = bx + jit[0], by - 90 + jit[1] - age * 80
            if age < 1.4:
                d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, int(220 * (1 - age / 1.4))),
                          outline=(180, 230, 255, int(220 * (1 - age / 1.4))), width=3)
    bx, by = brush_pos(t)
    draw_brush(d, bx, by)
    # shiny smile sparkles
    if st["line"] % 4 == 3 or st["phase"] == "outro":
        for k in range(7):
            a = k * 0.9 + t * 1.5
            s = 30 + 14 * math.sin(t * 9 + k)
            sparkle(d, CX + 300 * math.cos(a), CY - 20 + 330 * math.sin(a), s, (255, 255, 255, 240))
    # FASTER banner
    p = (t - (FAST_AT - 1.4)) / 2.0
    if 0 <= p <= 1:
        sz = int(lerp(40, 120, ease_out_back(p * 3))) if p < 0.33 else 120
        a = 255 if p < 0.8 else int(255 * (1 - p) / 0.2)
        rot = math.sin(t * 20) * 8
        outlined(d, (CX, CY + rot), "FASTER!", sz, (255, 230, 0, a), stroke=(220, 30, 90, a), sw=12)
    draw_title(d, song, t, color=(255, 255, 255), stroke=(30, 110, 200))
    return img


def extra(buf, add, tone, midi_hz):
    # slide-whistle up into the fast round
    import numpy as np
    from engine import SR
    t0 = FAST_AT - 1.25
    n = int(1.0 * SR)
    tt = np.arange(n) / SR
    f = 500 * 2 ** (tt * 1.6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, tt / 0.05) * np.minimum(1, (1 - tt) / 0.1) * 0.18
    add(buf, t0, s)
    for p in POPS:
        n = int(0.12 * SR)
        tt = np.arange(n) / SR
        f = 900 - 3000 * tt
        add(buf, p, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 30) * 0.25)


if __name__ == "__main__":
    pv = [float(x) for x in sys.argv[1:]] or None
    render(song, scene, "out/brush-your-teeth-short.mp4", audio_extra=extra, preview_times=pv)
    print(song.duration, song.line_spans)
