import math, sys, random
import numpy as np
from PIL import Image, ImageDraw
from engine import *

U = 0.21
g, C, D, E, F, G = 67, 72, 74, 76, 77, 79
song = Song("Itsy Bitsy Spider", [
    dict(text="The it-sy bit-sy spi-der climbed up the wa-ter spout", unit=U, offset=1, notes=[
        (g, 1), (C, 2), (C, 1), (C, 2), (D, 1), (E, 3), (E, 2), (E, 1), (D, 2), (C, 1), (D, 2), (E, 1), (C, 6)]),
    dict(text="Down came the rain and washed the spi-der out!", unit=U, notes=[
        (E, 3), (E, 2), (F, 1), (G, 5), (G, 1), (F, 2), (E, 1), (F, 2), (G, 1), (E, 6)]),
    dict(text="Out came the sun and dried up all the rain", unit=U, notes=[
        (C, 3), (C, 2), (D, 1), (E, 5), (E, 1), (D, 2), (C, 1), (D, 2), (E, 1), (C, 4)]),
    dict(text="And the it-sy bit-sy spi-der climbed up the spout a-gain!", unit=U, offset=2, notes=[
        (g, 1), (g, 1), (C, 2), (C, 1), (C, 2), (D, 1), (E, 3), (E, 2), (E, 1), (D, 2), (C, 1), (D, 2), (E, 1),
        (C, 6)]),
], key=60, window=3, sub="Sing along!")

SPOUT_X, TOP_Y, BOT_Y = 470, 560, 1010
rng = random.Random(3)
DROPS = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(900, 1400)) for _ in range(140)]
BRICKS = []
for row in range(0, 30):
    y = 380 + row * 46
    off = (row % 2) * 60
    for col in range(-1, 10):
        BRICKS.append((col * 120 + off, y))


def weather(t):
    """0 = sunny, 1 = rainy"""
    a2, b2 = song.line_spans[1]
    a3, b3 = song.line_spans[2]
    if t < a2 - 0.6:
        return 0.15
    if t < a2:
        return lerp(0.15, 1, (t - (a2 - 0.6)) / 0.6)
    if t < a3:
        return 1.0
    return lerp(1, 0, ease((t - a3) / 1.6))


def spider_pos(t, st):
    (a1, b1), (a2, b2), (a3, b3), (a4, b4) = song.line_spans
    x = SPOUT_X
    if t < a1:
        return x, BOT_Y, 0, False
    if t < b1:
        return x, lerp(BOT_Y, TOP_Y, ease((t - a1) / (b1 - a1))), 0, True
    if t < a2 + (b2 - a2) * 0.4:
        return x, TOP_Y + math.sin(t * 20) * 4, 0, False
    if t < b2:
        p = ease((t - a2 - (b2 - a2) * 0.4) / ((b2 - a2) * 0.6))
        # washed down & out with a tumble
        return lerp(x, 760, p), lerp(TOP_Y, BOT_Y + 30, p) - 140 * math.sin(p * math.pi), p * 6.28 * 1.5, False
    if t < a4:
        p = ease((t - a3) / (a4 - a3))
        return lerp(760, x, p), BOT_Y + lerp(30, 0, p), 0, p > 0.05 and p < 0.95
    if t < b4:
        return x, lerp(BOT_Y, TOP_Y, ease((t - a4) / (b4 - a4))), 0, True
    return x, TOP_Y, 0, False


def draw_spider(d, x, y, rot, walking, t, st, happy=True):
    R = 78
    sing = st["phase"] == "sing"
    # thread
    d.line([(x, 330), (x, y - R)], fill=(255, 255, 255, 120), width=3) if not walking and rot == 0 else None
    ph = t * (18 if walking else 3)
    for side in (-1, 1):
        for k in range(4):
            a0 = math.radians(-50 + k * 32) + rot
            wig = math.sin(ph + k * 1.3 + (side > 0) * 1.5) * (0.35 if walking else 0.08)
            ang = a0 + wig
            dx = math.cos(ang) * side
            dy = math.sin(ang)
            kx, ky = x + dx * R * 1.5, y + dy * R * 1.2 - 40
            fx, fy = x + dx * R * 2.2, y + dy * R * 1.8 + 30
            d.line([(x + dx * R * 0.6, y + dy * R * 0.4), (kx, ky), (fx, fy)], fill=(40, 20, 60), width=14, joint="curve")
            d.ellipse([fx - 9, fy - 9, fx + 9, fy + 9], fill=(40, 20, 60))
    d.ellipse([x - R + 6, y - R + 12, x + R + 6, y + R + 12], fill=(0, 0, 0, 60))
    d.ellipse([x - R, y - R, x + R, y + R], fill=(110, 50, 170), outline=(40, 20, 60), width=8)
    d.ellipse([x - R * 0.55, y - R * 0.75, x - R * 0.05, y - R * 0.35], fill=(160, 100, 220))
    ex = math.cos(rot) * 0
    for sx in (-1, 1):
        cx, cy = x + sx * 30 + ex, y - 12
        d.ellipse([cx - 26, cy - 30, cx + 26, cy + 30], fill=(255, 255, 255), outline=(40, 20, 60), width=4)
        look = -1 if walking else 1
        d.ellipse([cx - 12, cy - 14 + look * 8, cx + 12, cy + 10 + look * 8], fill=(30, 20, 40))
        d.ellipse([cx - 5, cy - 10 + look * 8, cx + 2, cy - 3 + look * 8], fill=(255, 255, 255))
    if rot != 0:  # dizzy "o" mouth
        d.ellipse([x - 14, y + 26, x + 14, y + 54], fill=(60, 10, 30))
    else:
        open_ = 0.3 + 0.7 * st["pulse"] if sing else 0.4
        d.chord([x - 30, y + 18 - 14 * open_, x + 30, y + 40 + 22 * open_], 0, 180, fill=(60, 10, 30))
    d.ellipse([x - 62, y + 10, x - 38, y + 26], fill=(255, 130, 170, 160))
    d.ellipse([x + 38, y + 10, x + 62, y + 26], fill=(255, 130, 170, 160))


def scene(t, st):
    w = weather(t)
    top = lerp_col((120, 200, 255), (70, 80, 110), w)
    bot = lerp_col((200, 240, 255), (120, 130, 150), w)
    img = gradient(top, bot)
    d = ImageDraw.Draw(img, "RGBA")
    # sun
    sun = 1 - w
    sx, sy = 880, lerp(560, 470, sun)
    if sun > 0.05:
        a = int(255 * min(1, sun * 1.3))
        for i in range(12):
            ang = t * 0.8 + i * math.pi / 6
            r1, r2 = 125, 175 + 14 * math.sin(t * 5 + i)
            d.line([(sx + r1 * math.cos(ang), sy + r1 * math.sin(ang)), (sx + r2 * math.cos(ang), sy + r2 * math.sin(ang))],
                   fill=(255, 200, 40, a), width=16)
        d.ellipse([sx - 110, sy - 110, sx + 110, sy + 110], fill=(255, 214, 50, a), outline=(255, 160, 0, a), width=8)
        d.ellipse([sx - 40, sy - 30, sx - 18, sy - 2], fill=(90, 50, 0, a))
        d.ellipse([sx + 18, sy - 30, sx + 40, sy - 2], fill=(90, 50, 0, a))
        d.arc([sx - 50, sy - 30, sx + 50, sy + 50], 20, 160, fill=(90, 50, 0, a), width=8)
    # brick wall
    d.rectangle([0, 380, W, 1420], fill=(196, 110, 90))
    for (bx, by) in BRICKS:
        if by < 1420:
            d.rectangle([bx + 4, by + 4, bx + 116, by + 42], fill=(214, 128, 104))
    d.rectangle([0, 360, W, 390], fill=(140, 70, 60))
    d.rectangle([0, 380, W, 1420], fill=(0, 0, 0, int(80 * w)))
    # window
    d.rounded_rectangle([680, 700, 960, 960], 20, fill=(255, 240, 200), outline=(120, 70, 50), width=14)
    d.line([(820, 700), (820, 960)], fill=(120, 70, 50), width=10)
    d.line([(680, 830), (960, 830)], fill=(120, 70, 50), width=10)
    # waterspout
    d.rectangle([SPOUT_X - 48, 330, SPOUT_X + 48, 1100], fill=(110, 140, 170), outline=(60, 80, 110), width=6)
    d.rectangle([SPOUT_X - 30, 330, SPOUT_X - 14, 1100], fill=(170, 200, 225))
    d.rounded_rectangle([SPOUT_X - 70, 330, SPOUT_X + 70, 380], 10, fill=(90, 120, 150), outline=(60, 80, 110), width=6)
    d.rounded_rectangle([SPOUT_X - 48, 1060, SPOUT_X + 150, 1140], 30, fill=(110, 140, 170), outline=(60, 80, 110), width=6)
    # grass
    d.rectangle([0, 1420, W, H], fill=(90, 190, 90))
    for i in range(0, W, 30):
        d.polygon([(i, 1425), (i + 15, 1395 + 10 * math.sin(i + t * 3)), (i + 30, 1425)], fill=(90, 190, 90))
    for i, fx in enumerate(range(90, W, 170)):
        fy = 1700 + (i % 2) * 70
        d.line([(fx, fy), (fx, fy + 70)], fill=(40, 130, 50), width=8)
        col = [(255, 120, 160), (255, 220, 60), (150, 120, 255)][i % 3]
        for k in range(5):
            a = k * 1.2566 + t
            d.ellipse([fx + 22 * math.cos(a) - 16, fy + 22 * math.sin(a) - 16, fx + 22 * math.cos(a) + 16, fy + 22 * math.sin(a) + 16], fill=col)
        d.ellipse([fx - 13, fy - 13, fx + 13, fy + 13], fill=(255, 250, 220))
    # puddle drying up
    pw = 260 * clamp(w * 1.2) if t > song.line_spans[1][0] else 0
    if pw > 5:
        d.ellipse([W / 2 - pw, 1580, W / 2 + pw, 1650], fill=(100, 160, 230, 200))
    # water gushing during line 2
    a2, b2 = song.line_spans[1]
    if a2 + (b2 - a2) * 0.35 < t < song.line_spans[2][0] + 0.8:
        k = 1 if t < b2 else 1 - (t - b2) / 0.8
        for i in range(18):
            p = ((t * 2.2 + i / 18) % 1)
            x = SPOUT_X + 150 + p * 330
            y = 1100 + p * p * 90
            r = 22 * k
            d.ellipse([x - r, y - r, x + r, y + r], fill=(130, 190, 255, 220))
        d.rectangle([SPOUT_X - 40, 340, SPOUT_X + 40, 1100], fill=(130, 190, 255, int(110 * k)))
    # clouds
    cl = clamp(w * 1.5)
    cx = lerp(-450, -130, ease(cl))
    for (ox, oy, r) in [(0, 0, 110), (120, -50, 130), (250, 0, 110), (130, 40, 100)]:
        c = lerp_col((255, 255, 255), (160, 165, 180), w)
        d.ellipse([cx + ox - r, 470 + oy - r, cx + ox + r, 470 + oy + r], fill=c + (240,))
    cx2 = lerp(W + 300, 700, ease(cl))
    for (ox, oy, r) in [(0, 0, 100), (110, -40, 120), (220, 0, 100)]:
        c = lerp_col((255, 255, 255), (150, 155, 170), w)
        d.ellipse([cx2 + ox - r, 560 + oy - r, cx2 + ox + r, 560 + oy + r], fill=c + (240,))
    # rain
    if w > 0.3:
        a = int(220 * clamp((w - 0.3) / 0.5))
        for (x0, y0, sp) in DROPS:
            y = (y0 + t * sp) % (H - 380) + 380
            x = (x0 - t * 120) % W
            d.line([(x, y), (x - 8, y + 34)], fill=(200, 225, 255, a), width=5)
    # spider
    x, y, rot, walking = spider_pos(t, st)
    draw_spider(d, x, y, rot, walking, t, st)
    draw_title(d, song, t, color=(255, 255, 255), stroke=(110, 50, 170))
    return img


if __name__ == "__main__":
    pv = [float(x) for x in sys.argv[1:]] or None
    render(song, scene, "out/itsy-bitsy-spider-short.mp4", preview_times=pv)
    print(song.duration)
