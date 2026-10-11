import math, sys, random
from PIL import Image, ImageDraw
from engine import *

U = 0.55
C, D, E, F, G, A = 72, 74, 76, 77, 79, 81
L1 = [(C, 1), (C, 1), (G, 1), (G, 1), (A, 1), (A, 1), (G, 2)]
L2 = [(F, 1), (F, 1), (E, 1), (E, 1), (D, 1), (D, 1), (C, 2)]
L3 = [(G, 1), (G, 1), (F, 1), (F, 1), (E, 1), (E, 1), (D, 2)]
song = Song("Twinkle Twinkle", [
    dict(text="Twin-kle, twin-kle, lit-tle star", notes=L1, unit=U),
    dict(text="How I won-der what you are!", notes=L2, unit=U),
    dict(text="Up a-bove the world so high", notes=L3, unit=U),
    dict(text="Like a dia-mond in the sky!", notes=L3, unit=U),
    dict(text="Twin-kle, twin-kle, lit-tle star", notes=L1, unit=U),
    dict(text="How I won-der what you are!", notes=L2, unit=U),
], key=60, window=2, sub="Sing along!")

rng = random.Random(7)
STARS = [(rng.uniform(0, W), rng.uniform(380, 1700), rng.uniform(2, 6), rng.uniform(0, 6.28), rng.uniform(1.5, 4))
         for _ in range(110)]
BG = gradient((14, 18, 64), (92, 46, 140))


def star_pts(cx, cy, r_out, r_in, rot):
    pts = []
    for i in range(10):
        r = r_out if i % 2 == 0 else r_in
        a = rot - math.pi / 2 + i * math.pi / 5
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def sparkle(d, x, y, s, col):
    d.polygon([(x, y - s), (x + s * 0.25, y - s * 0.25), (x + s, y), (x + s * 0.25, y + s * 0.25),
               (x, y + s), (x - s * 0.25, y + s * 0.25), (x - s, y), (x - s * 0.25, y - s * 0.25)], fill=col)


def scene(t, st):
    img = BG.copy()
    d = ImageDraw.Draw(img, "RGBA")
    # background twinkles
    for (x, y, s, ph, sp) in STARS:
        k = 0.5 + 0.5 * math.sin(t * sp + ph)
        if s > 4.5:
            sparkle(d, x, y, s * (1 + 1.6 * k), (255, 255, 220, int(120 + 135 * k)))
        else:
            r = s * (0.6 + 0.6 * k)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, int(90 + 160 * k)))
    # shooting stars
    for ts in (3.5, 13.0, 23.5):
        p = (t - ts) / 0.9
        if 0 <= p <= 1:
            x, y = lerp(150, 950, p), lerp(420, 760, p)
            for k in range(14):
                q = k / 14
                d.ellipse([x - 160 * q - 6 * (1 - q), y - 68 * q - 6 * (1 - q), x - 160 * q + 6 * (1 - q),
                           y - 68 * q + 6 * (1 - q)], fill=(255, 255, 230, int(255 * (1 - q) * (1 - p * 0.6))))
    # moon
    d.ellipse([110, 420, 270, 580], fill=(255, 245, 200))
    d.ellipse([155, 400, 315, 560], fill=BG.getpixel((235, 480)))
    # hills
    d.ellipse([-300, 1580, 700, 2300], fill=(34, 60, 90))
    d.ellipse([350, 1620, 1400, 2300], fill=(26, 48, 80))
    for hx in (180, 820):
        d.rectangle([hx - 40, 1640, hx + 40, 1720], fill=(60, 40, 70))
        d.polygon([(hx - 60, 1645), (hx, 1590), (hx + 60, 1645)], fill=(80, 50, 90))
        d.rectangle([hx - 12, 1660, hx + 12, 1690], fill=(255, 220, 120))
    # hero star
    line = st["line"]
    up = 0.0
    if line == 2:
        up = ease(st["lp"]) * 90
    elif line == 3:
        up = 90 * (1 - ease(st["lp"]))
    cx = W / 2 + math.sin(t * 1.3) * 40
    cy = 830 + math.sin(t * 2.2) * 25 - up
    intro_s = ease_out_back(t / 0.7)
    scale = (1 + 0.09 * st["pulse"]) * intro_s
    rot = math.sin(t * 1.7) * 0.12
    diamond = line == 3 and st["phase"] == "sing"
    body = (255, 222, 60) if not diamond else lerp_col((255, 222, 60), (170, 240, 255), math.sin(st["lp"] * math.pi) * 1.4)
    R = 250 * scale
    # glow
    for g in range(6, 0, -1):
        rr = R * (1 + g * 0.09)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 240, 150, 10 + int(10 * st["pulse"])))
    # rays rotating
    for i in range(12):
        a = t * 0.6 + i * math.pi / 6
        r1, r2 = R * 1.08, R * (1.3 + 0.08 * math.sin(t * 4 + i))
        d.line([(cx + r1 * math.cos(a), cy + r1 * math.sin(a)), (cx + r2 * math.cos(a), cy + r2 * math.sin(a))],
               fill=(255, 250, 200, 140), width=8)
    d.polygon(star_pts(cx + 8, cy + 14, R, R * 0.5, rot), fill=(0, 0, 0, 60))
    d.polygon(star_pts(cx, cy, R * 1.04, R * 0.54, rot), fill=(255, 150, 0))
    d.polygon(star_pts(cx, cy, R, R * 0.5, rot), fill=body)
    d.polygon(star_pts(cx - R * 0.05, cy - R * 0.07, R * 0.6, R * 0.3, rot), fill=lerp_col(body, (255, 255, 255), 0.35))
    # face
    fy = cy + R * 0.08
    blink = (t % 3.7) < 0.12
    for sx in (-1, 1):
        ex, ey = cx + sx * R * 0.2, fy - R * 0.08
        if blink:
            d.line([(ex - 22, ey), (ex + 22, ey)], fill=(60, 30, 20), width=8)
        else:
            d.ellipse([ex - 24, ey - 32, ex + 24, ey + 32], fill=(60, 30, 20))
            d.ellipse([ex - 10, ey - 22, ex + 4, ey - 6], fill=(255, 255, 255))
        d.ellipse([cx + sx * R * 0.33 - 26, fy + R * 0.06 - 14, cx + sx * R * 0.33 + 26, fy + R * 0.06 + 14],
                  fill=(255, 120, 120, 150))
    mouth_open = 0.35 + 0.65 * st["pulse"] if st["phase"] == "sing" else 0.3
    mw, mh = R * 0.2, R * 0.16 * mouth_open + 6
    d.chord([cx - mw, fy + R * 0.05 - mh, cx + mw, fy + R * 0.12 + mh], 0, 180, fill=(140, 40, 40))
    # sparkles flying off on notes
    for e in song.events:
        dt = t - e["t"]
        if 0 <= dt < 1.0:
            a = (e["idx"] * 2.4 + e["line"]) % 6.28
            dist = R * 1.1 + dt * 260
            sparkle(d, cx + dist * math.cos(a), cy + dist * math.sin(a), 26 * (1 - dt),
                    (255, 255, 200, int(255 * (1 - dt))))
    if diamond:
        for i in range(4):
            a = t * 3 + i * 1.57
            sparkle(d, cx + R * 0.9 * math.cos(a), cy + R * 0.9 * math.sin(a), 34, (220, 250, 255, 230))
    # outro: star waves goodnight
    if st["phase"] == "outro":
        p = (t - song.sing_end)
        for i in range(30):
            a = i * 0.7 + p
            dist = 100 + p * 500 * (0.5 + (i % 5) / 5)
            sparkle(d, cx + dist * math.cos(a), cy + dist * math.sin(a), 22, (255, 255, 200, max(0, int(255 - p * 90))))
    draw_title(d, song, t)
    return img


if __name__ == "__main__":
    pv = [float(x) for x in sys.argv[1:]] or None
    render(song, scene, "out/twinkle-twinkle-short.mp4", preview_times=pv)
    print(song.duration)
