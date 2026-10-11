"""Sketch: the Itsy Bitsy Spider keeps getting washed out... until he discovers the waterspout is a WATERSLIDE."""
import math, sys
import numpy as np
from PIL import Image, ImageDraw
from sketchkit import *

DUR = 25.8
SPOUT_X, TOP_Y, BOT_Y = 470, 620, 1010
OUTLET = (640, 1100)
PUDDLE = (790, 1500)
SPR = 640
SC = (320, 320)
RAIN = [(4.8, 6.8), (10.8, 13.2), (18.3, 20.6), (24.6, 99)]
rng = np.random.default_rng(3)
DROPS = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(900, 1400)) for _ in range(150)]


def weather(t):
    w = 0.0
    for a, b in RAIN:
        w = max(w, seg(t, a - 0.3, a) * (1 - seg(t, b, b + 0.5)))
    return w


def _background(rainy):
    top, bot = ((70, 80, 115), (120, 130, 155)) if rainy else ((120, 200, 255), (200, 240, 255))
    img = gradient(top, bot)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 380, W, 1420], fill=(196, 110, 90))
    for row in range(23):
        y = 380 + row * 46
        off = (row % 2) * 60
        for col in range(-1, 10):
            bx = col * 120 + off
            d.rectangle([bx + 4, y + 4, bx + 116, y + 42], fill=(214, 128, 104))
    d.rectangle([0, 360, W, 390], fill=(140, 70, 60))
    d.rounded_rectangle([700, 700, 980, 960], 20, fill=(255, 240, 200), outline=(120, 70, 50), width=14)
    d.line([(840, 700), (840, 960)], fill=(120, 70, 50), width=10)
    d.line([(700, 830), (980, 830)], fill=(120, 70, 50), width=10)
    d.rectangle([SPOUT_X - 48, 330, SPOUT_X + 48, 1100], fill=(110, 140, 170), outline=(60, 80, 110), width=6)
    d.rectangle([SPOUT_X - 30, 330, SPOUT_X - 14, 1100], fill=(170, 200, 225))
    d.rounded_rectangle([SPOUT_X - 70, 330, SPOUT_X + 70, 380], 10, fill=(90, 120, 150), outline=(60, 80, 110), width=6)
    d.rounded_rectangle([SPOUT_X - 48, 1060, OUTLET[0], 1140], 30, fill=(110, 140, 170), outline=(60, 80, 110), width=6)
    d.rectangle([0, 1420, W, H], fill=(90, 190, 90))
    for i in range(0, W, 30):
        d.polygon([(i, 1425), (i + 15, 1398), (i + 30, 1425)], fill=(90, 190, 90))
    for k, fx in enumerate(range(90, W, 170)):
        if abs(fx - PUDDLE[0]) < 200:
            continue
        fy = 1700 + (k % 2) * 70
        d.line([(fx, fy), (fx, fy + 70)], fill=(40, 130, 50), width=8)
        col = [(255, 120, 160), (255, 220, 60), (150, 120, 255)][k % 3]
        for j in range(5):
            a = j * 1.2566
            d.ellipse([fx + 22 * math.cos(a) - 16, fy + 22 * math.sin(a) - 16,
                       fx + 22 * math.cos(a) + 16, fy + 22 * math.sin(a) + 16], fill=col)
        d.ellipse([fx - 13, fy - 13, fx + 13, fy + 13], fill=(255, 250, 220))
    if rainy:
        d.rectangle([0, 380, W, 1420], fill=(0, 0, 0, 70))
    return img


BG_SUN, BG_RAIN = _background(False), _background(True)


# ---------------------------------------------------------------- characters
def leaf_shape(d, cx, cy, L, rot, fill=(110, 200, 80)):
    pts = []
    for i in range(21):
        u = i / 20
        pts.append((u * L - L / 2, math.sin(u * math.pi) * L * 0.28))
    for i in range(20, -1, -1):
        u = i / 20
        pts.append((u * L - L / 2, -math.sin(u * math.pi) * L * 0.28))
    c, s = math.cos(rot), math.sin(rot)
    poly = [(cx + x * c - y * s, cy + x * s + y * c) for x, y in pts]
    d.polygon(poly, fill=fill, outline=INK)
    d.line([(cx - L / 2 * c, cy - L / 2 * s), (cx + L / 2 * c, cy + L / 2 * s)], fill=(60, 140, 50), width=5)
    d.line([(cx - L / 2 * c, cy - L / 2 * s), (cx - (L / 2 + 30) * c, cy - (L / 2 + 30) * s)], fill=(60, 140, 50), width=7)


def spider_sprite(t, eyes="open", mouth="smile", look=(0, 0), legs="idle", brow=None, prop=None):
    img, d = canvas((SPR, SPR))
    x, y = SC
    R = 72
    if prop == "leaf_back":
        leaf_shape(d, x + 10, y - 20, 230, -1.2)
    if prop == "leaf_ride":
        leaf_shape(d, x, y + 70, 300, 0.0)
        d.arc([x + 110, y + 20, x + 200, y + 100], 270, 90, fill=INK, width=6)
    ph = t * (22 if legs == "climb" else 30 if legs == "flail" else 3)
    for side in (-1, 1):
        for k in range(4):
            a0 = math.radians(-50 + k * 32)
            amp = {"climb": 0.35, "flail": 0.5}.get(legs, 0.08)
            ang = a0 + math.sin(ph + k * 1.3 + (side > 0) * 1.5) * amp
            if legs == "up" and k == 0:
                ang = math.radians(-80) + math.sin(t * 12) * 0.15
            dx, dy = math.cos(ang) * side, math.sin(ang)
            kx, ky = x + dx * R * 1.5, y + dy * R * 1.2 - 40
            fx, fy = x + dx * R * 2.2, y + dy * R * 1.8 + 30
            if legs == "up" and k == 0:
                fx, fy = x + side * R * 1.3, y - R * 2.0
                kx, ky = x + side * R * 1.5, y - R * 1.0
            d.line([(x + dx * R * 0.6, y + dy * R * 0.4), (kx, ky), (fx, fy)], fill=INK, width=14, joint="curve")
            d.ellipse([fx - 9, fy - 9, fx + 9, fy + 9], fill=INK)
    d.ellipse([x - R, y - R, x + R, y + R], fill=(110, 50, 170), outline=INK, width=8)
    d.ellipse([x - R * 0.55, y - R * 0.75, x - R * 0.05, y - R * 0.35], fill=(160, 100, 220))
    for side in (-1, 1):
        cx, cy = x + side * 30, y - 12
        if eyes == "happy":
            d.arc([cx - 22, cy - 14, cx + 22, cy + 20], 200, 340, fill=INK, width=7)
            continue
        if eyes == "dizzy":
            for k in range(3):
                r = 6 + k * 8
                d.arc([cx - r, cy - r, cx + r, cy + r], t * 600 + k * 90, t * 600 + k * 90 + 250, fill="white", width=5)
            continue
        big = 1.25 if eyes == "puppy" else 1.0
        d.ellipse([cx - 26 * big, cy - 30 * big, cx + 26 * big, cy + 30 * big], fill="white", outline=INK, width=4)
        pr = 16 if eyes == "puppy" else 12
        px, py = cx + look[0] * 8, cy + look[1] * 10
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(30, 20, 40))
        d.ellipse([px - pr * 0.5, py - pr * 0.7, px, py - pr * 0.2], fill="white")
        if eyes == "puppy":
            d.ellipse([px + 2, py + 2, px + 8, py + 8], fill="white")
    if brow == "angry":
        for side in (-1, 1):
            d.line([(x + side * 8, y - 42), (x + side * 56, y - 58)], fill=INK, width=9)
    elif brow == "worried":
        for side in (-1, 1):
            d.line([(x + side * 8, y - 60), (x + side * 56, y - 46)], fill=INK, width=8)
    if mouth == "smile":
        d.chord([x - 30, y + 14, x + 30, y + 50], 0, 180, fill=(60, 10, 30))
    elif mouth == "laugh":
        d.chord([x - 36, y + 6, x + 36, y + 62], 0, 180, fill=(60, 10, 30))
        d.chord([x - 18, y + 36, x + 18, y + 60], 180, 360, fill=(255, 120, 140))
    elif mouth == "O":
        d.ellipse([x - 16, y + 18, x + 16, y + 54], fill=(60, 10, 30))
    elif mouth == "flat":
        d.line([(x - 22, y + 34), (x + 22, y + 34)], fill=(60, 10, 30), width=7)
    elif mouth == "wavy":
        d.line([(x - 26 + i * 6.5, y + 34 + 5 * math.sin(i * 1.5)) for i in range(9)], fill=(60, 10, 30), width=6)
    d.ellipse([x - 62, y + 10, x - 38, y + 26], fill=(240, 130, 190))
    d.ellipse([x + 38, y + 10, x + 62, y + 26], fill=(240, 130, 190))
    if prop in ("umbrella", "umbrella_flipped"):
        hx, hy = x + 80, y - 40
        cy = y - 230
        d.line([(hx, hy), (hx, cy)], fill=INK, width=8)
        d.arc([hx - 26, hy - 20, hx + 2, hy + 14], 0, 180, fill=INK, width=7)
        if prop == "umbrella":
            d.pieslice([hx - 150, cy - 90, hx + 150, cy + 90], 180, 360, fill=(240, 60, 80), outline=INK, width=6)
            for k in (-1, 1):
                d.pieslice([hx - 50, cy - 90, hx + 50, cy + 90], 180, 360, fill=(255, 255, 255) if k > 0 else None,
                           outline=INK, width=5)
        else:
            d.pieslice([hx - 130, cy - 130, hx + 130, cy + 50], 0, 180, fill=(240, 60, 80), outline=INK, width=6)
            d.line([(hx - 130, cy - 40), (hx + 130, cy - 40)], fill=INK, width=6)
    if prop == "umbrella_hat":
        d.pieslice([x - 110, y - R - 120, x + 110, y - R + 30], 0, 180, fill=(240, 60, 80), outline=INK, width=6)
        d.line([(x, y - R - 50), (x + 20, y - R - 170)], fill=INK, width=8)
    return img


def draw_cloud(d, x, y, t, w, mood="smirk", shake=0.0):
    x += shake * math.sin(t * 55)
    c = lerp_col((250, 250, 255), (150, 155, 175), w)
    for (ox, oy, r) in [(-150, 20, 95), (-60, -40, 120), (60, -50, 125), (160, 15, 100), (0, 40, 110)]:
        d.ellipse([x + ox - r, y + oy - r, x + ox + r, y + oy + r], fill=c, outline=lerp_col((200, 205, 220), (110, 115, 135), w), width=5)
    for (ox, oy, r) in [(-150, 20, 95), (-60, -40, 120), (60, -50, 125), (160, 15, 100), (0, 40, 110)]:
        d.ellipse([x + ox - r + 7, y + oy - r + 7, x + ox + r - 7, y + oy + r - 7], fill=c)
    for side in (-1, 1):
        ex, ey = x + side * 50, y - 10
        if mood in ("laugh", "happy"):
            d.arc([ex - 20, ey - 10, ex + 20, ey + 20], 200, 340, fill=INK, width=7)
        elif mood == "sigh":
            d.line([(ex - 18, ey + 4), (ex + 18, ey + 4)], fill=INK, width=7)
        else:
            d.ellipse([ex - 13, ey - 17, ex + 13, ey + 17], fill=INK)
            d.ellipse([ex - 6, ey - 12, ex, ey - 6], fill="white")
    my = y + 35
    if mood == "smirk":
        d.arc([x - 40, my - 30, x + 50, my + 10], 10, 150, fill=INK, width=7)
    elif mood == "laugh":
        d.chord([x - 45, my - 20, x + 45, my + 40], 0, 180, fill=(120, 20, 40), outline=INK, width=5)
    elif mood == "sigh":
        d.ellipse([x - 12, my - 6, x + 12, my + 18], fill=(120, 20, 40))
    else:
        d.arc([x - 40, my - 30, x + 40, my + 10], 20, 160, fill=INK, width=7)
    for side in (-1, 1):
        d.ellipse([x + side * 95 - 20, y + 15, x + side * 95 + 20, y + 33], fill=(255, 190, 200))


# ---------------------------------------------------------------- choreography
def cloud_state(t):
    keys = [(0, 1400), (3.6, 1400), (4.3, 600), (6.8, 600), (7.6, 900), (10.2, 900), (10.8, 600), (13.6, 600),
            (14.4, 900), (17.8, 900), (18.2, 600), (20.8, 600), (21.6, 900), (23.8, 900), (24.4, 600)]
    x = kf(t, keys)
    mood, shake = "smirk", 0.0
    if 6.9 <= t < 7.9 or 13.3 <= t < 14.6:
        mood, shake = "laugh", 6
    elif 17.9 <= t < 18.3:
        mood = "sigh"
    elif 20.6 <= t < 22.0:
        mood = "happy"
    elif 24.0 <= t < 24.6:
        mood = "sigh"
    return x, 420 + 10 * math.sin(t * 1.3), mood, shake


def washed(t, t0, prop_ex=None):
    """Tumble down the spout from t0 (0.9s), shoot out of the outlet and splash into the puddle (at t0+1.4)."""
    if t < t0 + 0.9:
        p = (t - t0) / 0.9
        return (SPOUT_X, lerp(TOP_Y, OUTLET[1] - 30, p * p)), p * 900
    x, y = arc(t, t0 + 0.9, t0 + 1.4, OUTLET[0], OUTLET[1] - 30, PUDDLE[0], PUDDLE[1] - 40, 120)
    return (x, y), 900 + (t - t0 - 0.9) * 900


def climb(t, t0, t1, y0=BOT_Y, y1=TOP_Y):
    return SPOUT_X, lerp(y0, y1, ease((t - t0) / (t1 - t0)))


def spider_state(t):
    ex = dict(eyes="open", mouth="smile", look=(0, 0), legs="idle")
    pos, rot, sc = (SPOUT_X, BOT_Y), 0.0, (1.0, 1.0)
    if t < 0.5:
        ex.update(look=(0, -1))
    elif t < 3.0:
        pos = climb(t, 0.5, 3.0)
        ex.update(legs="climb", look=(0, -1))
    elif t < 4.4:
        pos = (SPOUT_X, TOP_Y)
        ex.update(eyes="happy", mouth="laugh", legs="up")
    elif t < 5.0:
        pos = (SPOUT_X, TOP_Y)
        ex.update(look=(0.6, -1), mouth="O")
    elif t < 6.4:
        pos, rot = washed(t, 5.0)
        ex.update(eyes="open", mouth="O", legs="flail", brow="worried")
    elif t < 7.6:
        pos = (PUDDLE[0], PUDDLE[1] - 40)
        sc = wobble(t - 6.4, 0.3)
        ex.update(eyes="dizzy", mouth="wavy")
    elif t < 8.3:
        pos = (PUDDLE[0], PUDDLE[1] - 40)
        ex.update(brow="angry", mouth="flat", prop="umbrella" if t >= 8.0 else None)
    elif t < 8.8:
        pos = arc(t, 8.3, 8.8, PUDDLE[0], PUDDLE[1] - 40, SPOUT_X, BOT_Y, 120)
        ex.update(brow="angry", mouth="flat", prop="umbrella", legs="flail")
    elif t < 10.0:
        pos = climb(t, 8.8, 10.0)
        ex.update(brow="angry", mouth="flat", prop="umbrella", legs="climb")
    elif t < 10.8:
        pos = (SPOUT_X, TOP_Y)
        ex.update(eyes="open", mouth="smile", look=(0.6, -1), prop="umbrella")
    elif t < 11.4:
        pos = (SPOUT_X, TOP_Y)
        ex.update(eyes="puppy" if t > 11.0 else "open", mouth="O", look=(0, -1),
                  prop="umbrella_flipped" if t >= 11.0 else "umbrella")
    elif t < 12.8:
        pos, rot = washed(t, 11.4)
        ex.update(mouth="O", legs="flail", brow="worried")
    elif t < 15.8:
        pos = (PUDDLE[0], PUDDLE[1] - 40)
        sc = wobble(t - 12.8, 0.3)
        stomp = 14.0 <= t < 14.6
        if stomp:
            sc = (1.06, 1 - 0.08 * abs(math.sin((t - 14.0) * 16)))
        ex.update(brow="angry", mouth="flat", prop="umbrella_hat" if t >= 13.3 else None,
                  legs="flail" if stomp else "idle")
        if t >= 14.6:
            ex.update(brow=None, mouth="O" if t > 15.3 else "flat", look=(1, -0.6 + clamp((t - 14.6) / 0.8) * 1.3))
    elif t < 16.2:
        pos = arc(t, 15.8, 16.2, PUDDLE[0], PUDDLE[1] - 40, SPOUT_X, BOT_Y, 140)
        ex.update(eyes="happy", mouth="laugh", prop="leaf_back", legs="flail")
    elif t < 17.2:
        pos = climb(t, 16.2, 17.2)
        ex.update(mouth="laugh", prop="leaf_back", legs="climb")
    elif t < 18.4:
        pos = (SPOUT_X, TOP_Y - 30)
        ex.update(prop="leaf_ride", look=(0.7, -1), legs="up" if t < 18.0 else "idle", mouth="laugh")
    elif t < 19.2:
        p = (t - 18.4) / 0.8
        pos = (SPOUT_X, lerp(TOP_Y - 30, OUTLET[1] - 60, p ** 1.5))
        ex.update(eyes="happy", mouth="laugh", prop="leaf_ride")
    elif t < 20.2:
        pos = arc(t, 19.2, 20.2, OUTLET[0], OUTLET[1] - 60, PUDDLE[0], PUDDLE[1] - 40, 420)
        rot = 360 * ease((t - 19.2) / 1.0)
        ex.update(eyes="happy", mouth="laugh", prop="leaf_ride", legs="up")
    elif t < 22.2:
        pos = (PUDDLE[0], PUDDLE[1] - 40)
        sc = wobble(t - 20.2, 0.35)
        ex.update(eyes="happy", mouth="laugh", prop="leaf_ride", legs="up")
    elif t < 22.5:
        pos = arc(t, 22.2, 22.5, PUDDLE[0], PUDDLE[1] - 40, SPOUT_X, BOT_Y, 100)
        ex.update(eyes="happy", mouth="laugh", prop="leaf_back", legs="flail")
    elif t < 23.2:
        pos = climb(t, 22.5, 23.2, BOT_Y, TOP_Y - 30)
        ex.update(eyes="happy", mouth="laugh", prop="leaf_back", legs="climb")
    elif t < 25.0:
        pos = (SPOUT_X, TOP_Y - 30)
        ex.update(eyes="puppy", mouth="smile", look=(0.7, -1), prop="leaf_ride")
        if t >= 24.6:
            ex.update(eyes="happy", mouth="laugh", legs="up")
    else:
        p = (t - 25.0) / 0.8
        pos = (SPOUT_X, lerp(TOP_Y - 30, OUTLET[1] - 60, p ** 1.5))
        ex.update(eyes="happy", mouth="laugh", prop="leaf_ride")
    return pos, rot, sc, ex


def leaf_falling(t):
    if 14.5 <= t < 15.8:
        p = clamp((t - 14.5) / 1.1)
        x = lerp(1000, PUDDLE[0] + 170, p) + 60 * math.sin(p * 9)
        y = lerp(250, PUDDLE[1] - 20, ease(p))
        return x, y, 0.5 * math.sin(p * 9)
    return None


def frame(t):
    w = weather(t)
    img = Image.blend(BG_SUN, BG_RAIN, w) if 0 < w < 1 else (BG_RAIN if w >= 1 else BG_SUN).copy()
    d = ImageDraw.Draw(img, "RGBA")
    # sun peeks when dry
    sun = 1 - w
    if sun > 0.05:
        sx, sy = 160, 520
        a = int(255 * sun)
        for i in range(12):
            ang = t * 0.8 + i * math.pi / 6
            d.line([(sx + 110 * math.cos(ang), sy + 110 * math.sin(ang)), (sx + 155 * math.cos(ang), sy + 155 * math.sin(ang))],
                   fill=(255, 200, 40, a), width=14)
        d.ellipse([sx - 95, sy - 95, sx + 95, sy + 95], fill=(255, 214, 50, a), outline=(255, 160, 0, a), width=7)
        d.ellipse([sx - 36, sy - 26, sx - 16, sy - 2], fill=(90, 50, 0, a))
        d.ellipse([sx + 16, sy - 26, sx + 36, sy - 2], fill=(90, 50, 0, a))
        d.arc([sx - 44, sy - 26, sx + 44, sy + 44], 20, 160, fill=(90, 50, 0, a), width=7)
    # puddle
    grow = clamp(seg(t, 5.2, 6.2) + 0.0)
    d.ellipse([PUDDLE[0] - 230 * grow, PUDDLE[1] - 45 * grow, PUDDLE[0] + 230 * grow, PUDDLE[1] + 45 * grow],
              fill=(100, 160, 230, 220))
    # water gushing out of the outlet + down the pipe
    if w > 0.5:
        k = clamp((w - 0.5) * 2)
        d.rectangle([SPOUT_X - 40, 340, SPOUT_X + 40, 1100], fill=(130, 190, 255, int(110 * k)))
        for i in range(18):
            p = ((t * 2.2 + i / 18) % 1)
            x = OUTLET[0] + p * (PUDDLE[0] - OUTLET[0] + 40)
            y = OUTLET[1] + p * p * (PUDDLE[1] - OUTLET[1] - 30)
            r = 22 * k
            d.ellipse([x - r, y - r, x + r, y + r], fill=(130, 190, 255, 220))
    # leaf
    lf = leaf_falling(t)
    if lf:
        leaf_shape(d, lf[0], lf[1], 230, lf[2])
    pos, rot, sc, ex = spider_state(t)
    # thread when hanging still at the top
    if rot == 0 and abs(pos[0] - SPOUT_X) < 1 and pos[1] <= TOP_Y + 1 and ex.get("legs") != "climb":
        d.line([(SPOUT_X, 330), (SPOUT_X, pos[1] - 70)], fill=(255, 255, 255, 140), width=3)
    place(img, spider_sprite(t, **ex), pos[0], pos[1], SC, sc[0], sc[1], rot)
    # splashes
    for ts in (6.4, 12.8, 20.2):
        s = t - ts
        if 0 <= s < 0.7:
            for i in range(12):
                a = math.pi + i * math.pi / 11
                r = 60 + s * 520
                x = PUDDLE[0] + math.cos(a) * r * 0.8
                y = PUDDLE[1] - 30 + math.sin(a) * r * 0.9 + 900 * s * s
                rr = 18 * (1 - s / 0.7)
                d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(140, 200, 255, 230))
    # rain
    if w > 0.3:
        a = int(220 * clamp((w - 0.3) / 0.5))
        for (x0, y0, sp) in DROPS:
            y = (y0 + t * sp) % (H - 380) + 380
            x = (x0 - t * (420 if 10.8 < t < 11.5 else 120)) % W
            d.line([(x, y), (x - 8, y + 34)], fill=(200, 225, 255, a), width=5)
    # wind gust
    if 10.7 <= t < 11.5:
        p = (t - 10.7) / 0.8
        for i in range(4):
            yy = 300 + i * 70
            xx = lerp(W + 100, -300, p) + i * 60
            d.arc([xx - 200, yy - 30, xx + 200, yy + 30], 190, 350, fill=(255, 255, 255, 200), width=6)
    cx, cy, mood, shake = cloud_state(t)
    draw_cloud(d, cx, cy, t, w, mood, shake)
    if 4.4 <= t < 4.75:  # first raindrop
        p = (t - 4.4) / 0.35
        y = lerp(cy + 120, TOP_Y - 80, p)
        d.ellipse([SPOUT_X - 10, y - 14, SPOUT_X + 10, y + 14], fill=(140, 200, 255), outline=INK, width=3)
    if 6.4 < t < 7.6:
        dizzy_stars(d, pos[0], pos[1] - 100, t, rx=90, ry=24)
    # bubbles
    bubble(d, SPOUT_X - 200, TOP_Y - 130, "?", seg(t, 4.75, 4.95) * (t < 5.0), tail=1)
    bubble(d, SPOUT_X - 200, TOP_Y - 130, "!", seg(t, 11.05, 11.2) * (t < 11.4), col=(230, 50, 50), tail=1)
    bubble(d, PUDDLE[0] - 120, PUDDLE[1] - 300, "bulb", seg(t, 15.35, 15.55) * (t < 15.9), tail=1)
    bubble(d, PUDDLE[0], PUDDLE[1] - 290, "♥", seg(t, 20.7, 20.9) * (t < 22.0))
    bubble(d, SPOUT_X - 200, TOP_Y - 160, "♥?", seg(t, 23.4, 23.6) * (t < 24.5), tail=1)
    title(d, "Itsy Bitsy Spider", t, color=(255, 255, 255), stroke=(110, 50, 170), sub="Waterslide!?", y=170)
    return camera(img, t, [(6.4, 14), (12.8, 14), (20.2, 24)])


def audio(buf):
    music(buf, 0.0, 4.4, bpm=132, key=60, vol=0.75)
    add(buf, 0.3, voice("hup!", 430, seed=1))
    for k in range(14):
        add(buf, 0.6 + k * 0.17, tiptoe(k, 0.15, 72))
    add(buf, 3.0, tada(79, 0.12))
    add(buf, 3.2, voice("ta-daa!", 450, seed=2))
    add(buf, 3.7, whoosh(0.6, 0.12))
    add(buf, 4.7, plink(1400, 0.3))
    add(buf, 4.8, crash(0.08, 2.0))
    add(buf, 5.0, voice("wa-aa-aah!", 460, rate=0.9, seed=3))
    add(buf, 5.0, slide(1600, 400, 1.3, 0.18))
    add(buf, 6.4, splash(0.5))
    add(buf, 6.9, voice("hi-hi-hi-hi!", 180, rate=1.2, seed=4))
    add(buf, 7.7, voice("hmph!", 380, seed=5))
    add(buf, 8.0, pop(0.4))
    music(buf, 8.3, 10.0, bpm=170, key=62, vol=0.5, sneaky=True)
    for k in range(10):
        add(buf, 8.8 + k * 0.12, tiptoe(k, 0.13, 74))
    add(buf, 10.35, voice("heh-heh!", 420, seed=6))
    add(buf, 10.7, whoosh(0.9, 0.35, bright=3))
    add(buf, 11.0, boing(260, 0.4, 0.3))
    add(buf, 11.1, voice("eep!", 560, seed=7))
    add(buf, 11.4, slide(1600, 400, 1.3, 0.18))
    add(buf, 11.4, voice("wa-aah!", 470, seed=8))
    add(buf, 12.8, splash(0.5))
    add(buf, 13.3, pop(0.3))
    add(buf, 13.4, voice("ha-ha-ha-ha!", 170, rate=1.1, seed=9))
    for k in range(4):
        add(buf, 14.0 + k * 0.15, thud(0.25))
    add(buf, 14.05, voice("hmph! hmph!", 380, rate=1.2, seed=10))
    add(buf, 14.5, slide(900, 600, 1.1, 0.06))
    add(buf, 15.4, tone(midi_hz(96), 0.6, "bell", 0.25))
    add(buf, 15.4, tone(midi_hz(103), 0.6, "bell", 0.15))
    add(buf, 15.5, voice("oo!", 520, seed=11))
    for k in range(8):
        add(buf, 16.2 + k * 0.12, tiptoe(k, 0.15, 76))
    add(buf, 17.5, voice("hey! hey!", 460, rate=1.1, seed=12))
    add(buf, 17.95, voice("ha-ah.", 170, rate=0.8, seed=13))
    add(buf, 18.3, crash(0.06, 2.0))
    music(buf, 18.4, 22.2, bpm=150, key=62, vol=0.9)
    add(buf, 18.4, voice("wheeeeeeeeee!", 480, rate=1.0, seed=14))
    add(buf, 18.4, slide(1200, 500, 0.8, 0.1))
    add(buf, 19.2, slide(500, 1500, 0.5, 0.12))
    add(buf, 19.7, slide(1500, 600, 0.5, 0.12))
    add(buf, 20.2, splash(0.6))
    add(buf, 20.2, tada(74, 0.12))
    add(buf, 20.5, voice("ha-ha-ha-ha!", 470, rate=1.2, seed=15))
    for k in range(6):
        add(buf, 22.5 + k * 0.11, tiptoe(k + 2, 0.15, 79))
    add(buf, 23.4, voice("pleeease?", 500, rate=0.9, seed=16))
    add(buf, 24.0, voice("ha-aaah.", 160, rate=0.9, seed=17))
    add(buf, 24.6, crash(0.06, 1.2))
    add(buf, 24.6, voice("yay!", 520, seed=18))
    music(buf, 24.6, DUR, bpm=150, key=62, vol=0.9)
    add(buf, 25.0, voice("wheee!", 480, seed=19))


if __name__ == "__main__":
    pv = [float(x) for x in sys.argv[1:]] or None
    render(DUR, frame, audio, "out/itsy-bitsy-waterslide-sketch.mp4", preview_times=pv)
