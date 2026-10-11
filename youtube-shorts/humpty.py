"""Sketch: Humpty Dumpty keeps nearly falling... then a little bird lands on his head. Turns out he bounces!"""
import math, sys
import numpy as np
from PIL import Image, ImageDraw
from sketchkit import *

DUR = 25.6
WALL_X0, WALL_X1, WALL_TOP, GROUND = 300, 780, 1020, 1450
SEAT = (540, 1035)          # where Humpty's bottom sits on the wall
RX, RY = 150, 190           # egg radii
SPR = 900
SC = (450, 470)             # egg centre inside the sprite
BOTTOM = (SC[0], SC[1] + RY)
EGG = (255, 247, 228)
EGG_SHADE = (240, 222, 196)
CONTACTS = [16.75, 17.55, 18.25, 19.15]   # ground / wall contacts while bouncing
GROUND_Y = 1560


# ---------------------------------------------------------------- static layers
def _egg_body():
    img, d = canvas((SPR, SPR))
    x, y = SC
    d.ellipse([x - RX + 10, y - RY + 14, x + RX + 10, y + RY + 14], fill=EGG_SHADE)
    d.ellipse([x - RX, y - RY, x + RX, y + RY], fill=EGG)
    # belt, clipped to the egg
    band, bd = canvas((SPR, SPR))
    bd.rectangle([0, y + 70, SPR, y + 118], fill=(130, 70, 200))
    bd.rectangle([0, y + 70, SPR, y + 80], fill=(160, 100, 230))
    mask = Image.new("L", (SPR, SPR), 0)
    ImageDraw.Draw(mask).ellipse([x - RX, y - RY, x + RX, y + RY], fill=255)
    img.paste(band, (0, 0), Image.composite(band.getchannel("A"), Image.new("L", (SPR, SPR), 0), mask))
    d.rounded_rectangle([x - 26, y + 68, x + 26, y + 120], 8, fill=(255, 205, 40), outline=INK, width=5)
    d.rounded_rectangle([x - 12, y + 82, x + 12, y + 106], 4, fill=(130, 70, 200))
    d.ellipse([x - RX, y - RY, x + RX, y + RY], outline=INK, width=8)
    d.ellipse([x - 95, y - 150, x - 45, y - 70], fill=(255, 255, 255))
    return img


EGG_LAYER = _egg_body()


def _background():
    img = gradient((110, 195, 255), (205, 238, 255))
    d = ImageDraw.Draw(img, "RGBA")
    for (cx, r, col) in [(150, 420, (150, 210, 130)), (820, 520, (130, 200, 120))]:
        d.ellipse([cx - r, GROUND - r * 0.45, cx + r, GROUND + r * 0.6], fill=col)
    d.rectangle([0, GROUND, W, H], fill=(95, 190, 95))
    for i in range(0, W, 28):
        d.polygon([(i, GROUND + 4), (i + 14, GROUND - 20), (i + 28, GROUND + 4)], fill=(95, 190, 95))
    for k, fx in enumerate(range(70, W, 190)):
        fy = 1680 + (k % 2) * 80
        d.line([(fx, fy), (fx, fy + 60)], fill=(40, 130, 50), width=7)
        col = [(255, 120, 160), (255, 220, 60), (150, 120, 255)][k % 3]
        for j in range(5):
            a = j * 1.2566
            d.ellipse([fx + 20 * math.cos(a) - 14, fy + 20 * math.sin(a) - 14,
                       fx + 20 * math.cos(a) + 14, fy + 20 * math.sin(a) + 14], fill=col)
        d.ellipse([fx - 11, fy - 11, fx + 11, fy + 11], fill=(255, 250, 220))
    # brick wall
    d.rectangle([WALL_X0 + 14, WALL_TOP + 14, WALL_X1 + 14, GROUND + 30], fill=(0, 0, 0, 50))
    d.rectangle([WALL_X0, WALL_TOP, WALL_X1, GROUND + 30], fill=(170, 90, 75))
    for row in range(12):
        y = WALL_TOP + 30 + row * 40
        off = (row % 2) * 50
        for col in range(-1, 6):
            x = WALL_X0 + col * 100 + off
            x0, x1 = max(WALL_X0 + 4, x + 4), min(WALL_X1 - 4, x + 96)
            if x1 > x0 + 10 and y + 36 < GROUND + 30:
                d.rectangle([x0, y + 4, x1, y + 36], fill=(205, 112, 90))
    d.rounded_rectangle([WALL_X0 - 20, WALL_TOP - 4, WALL_X1 + 20, WALL_TOP + 36], 10, fill=(150, 150, 165),
                        outline=INK, width=5)
    d.rectangle([WALL_X0, WALL_TOP + 36, WALL_X1, GROUND + 30], outline=INK, width=5)
    return img


BG = _background()


# ---------------------------------------------------------------- characters
def draw_bird(d, x, y, t, flying=True, face=1, look=(0, 0), happy=False, k=1.35):
    flapa = math.sin(t * 38) if flying else 0.15

    def P(px, py):
        return (x + px * k, y + py * k)

    def box(a, b, c, e):
        return [x + a * k, y + b * k, x + c * k, y + e * k]
    d.polygon([P(-face * 26, 6), P(-face * 62, -14), P(-face * 58, 20)], fill=(60, 130, 220), outline=INK)
    d.ellipse(box(-34, -32, 34, 32), fill=(90, 170, 255), outline=INK, width=4)
    d.ellipse(box(-20, -4, 26, 28), fill=(200, 230, 255))
    wy = -4 - flapa * 26
    d.polygon([P(-face * 4, 0), P(-face * 44, wy - 18), P(-face * 34, wy + 14)], fill=(60, 130, 220), outline=INK)
    ex = face * 12
    if happy:
        d.arc(box(ex - 9, -18, ex + 9, -2), 200, 340, fill=INK, width=4)
    else:
        d.ellipse(box(ex - 9, -20, ex + 9, -2), fill="white", outline=INK, width=3)
        d.ellipse(box(ex - 4 + look[0] * 3, -15 + look[1] * 3, ex + 4 + look[0] * 3, -7 + look[1] * 3), fill=INK)
    d.polygon([P(face * 30, -10), P(face * 52, -4), P(face * 30, 4)], fill=(255, 160, 40), outline=INK)
    if not flying:
        for kk in (-8, 8):
            d.line([P(kk, 30), P(kk, 44)], fill=(255, 160, 40), width=4)


def humpty_sprite(t, eyes="open", mouth="smile", look=(0, 0), arms=(20, 20), legs=(0, 0), brow=None,
                  bird=None, blush=True):
    img, d = canvas((SPR, SPR))
    x, y = SC
    # legs (behind)
    for side, sw in zip((-1, 1), legs):
        hx, hy = x + side * 55, y + RY - 20
        ang = math.radians(sw)
        fx, fy = hx + math.sin(ang) * 130, hy + math.cos(ang) * 130
        d.line([(hx, hy), (fx, fy)], fill=INK, width=16)
        d.ellipse([fx - 22 + side * 16, fy - 16, fx + 22 + side * 16, fy + 16], fill=(200, 40, 70), outline=INK, width=4)
    img.alpha_composite(EGG_LAYER)
    d = ImageDraw.Draw(img)
    # arms
    for side, a in zip((-1, 1), arms):
        sx, sy = x + side * (RX - 12), y + 40
        ang = math.radians(a)
        ex, ey = sx + side * math.cos(ang) * 70, sy - math.sin(ang) * 70 + 10
        hx, hy = ex + side * math.cos(ang + side * 0.0) * 60, ey - math.sin(ang) * 60
        d.line([(sx, sy), (ex, ey), (hx, hy)], fill=INK, width=14, joint="curve")
        d.ellipse([hx - 26, hy - 26, hx + 26, hy + 26], fill="white", outline=INK, width=5)
    # blush
    if blush:
        for side in (-1, 1):
            d.ellipse([x + side * 90 - 26, y - 5, x + side * 90 + 26, y + 18], fill=(255, 196, 190))
    # eyes
    for side in (-1, 1):
        cx, cy = x + side * 48, y - 60
        if eyes == "happy":
            d.arc([cx - 26, cy - 14, cx + 26, cy + 26], 200, 340, fill=INK, width=8)
            continue
        if eyes == "dizzy":
            for k in range(3):
                r = 8 + k * 9
                d.arc([cx - r, cy - r, cx + r, cy + r], t * 600 + k * 90, t * 600 + k * 90 + 250, fill=INK, width=5)
            continue
        big = 1.25 if eyes == "wide" else 1.0
        ew, eh = 30 * big, 40 * big
        d.ellipse([cx - ew, cy - eh, cx + ew, cy + eh], fill="white", outline=INK, width=6)
        pr = 10 if eyes == "wide" else 15
        px, py = cx + look[0] * 11, cy + look[1] * 16
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=INK)
        d.ellipse([px - pr * 0.5, py - pr * 0.7, px, py - pr * 0.2], fill="white")
        if eyes == "smug":
            d.chord([cx - ew - 4, cy - eh - 4, cx + ew + 4, cy + eh * 0.6], 180, 360, fill=EGG)
            d.line([(cx - ew, cy - 4), (cx + ew, cy - 4)], fill=INK, width=6)
    # brows
    if brow == "worried":
        for side in (-1, 1):
            d.line([(x + side * 20, y - 118), (x + side * 72, y - 104)], fill=INK, width=8)
    elif brow == "mischief":
        d.line([(x - 76, y - 122), (x - 22, y - 106)], fill=INK, width=8)
        d.line([(x + 22, y - 112), (x + 76, y - 130)], fill=INK, width=8)
    # mouth
    my = y + 22
    if mouth == "smile":
        d.arc([x - 50, my - 30, x + 50, my + 26], 20, 160, fill=INK, width=8)
    elif mouth == "grin":
        d.chord([x - 62, my - 26, x + 62, my + 44], 0, 180, fill=(120, 20, 40), outline=INK, width=6)
        d.rectangle([x - 44, my + 9, x + 44, my + 18], fill="white")
    elif mouth == "laugh":
        d.chord([x - 58, my - 30, x + 58, my + 60], 0, 180, fill=(120, 20, 40), outline=INK, width=6)
        d.chord([x - 30, my + 22, x + 30, my + 58], 180, 360, fill=(255, 120, 140))
    elif mouth == "o":
        d.ellipse([x - 14, my - 2, x + 14, my + 26], fill=(120, 20, 40), outline=INK, width=4)
    elif mouth == "O":
        d.ellipse([x - 30, my - 12, x + 30, my + 50], fill=(120, 20, 40), outline=INK, width=6)
    elif mouth == "worried":
        pts = [(x - 46 + i * 8, my + 12 + 7 * math.sin(i * 1.3)) for i in range(13)]
        d.line(pts, fill=INK, width=7, joint="curve")
    elif mouth == "flat":
        d.line([(x - 34, my + 12), (x + 34, my + 12)], fill=INK, width=8)
    if bird is not None:
        hop, look_b = bird
        draw_bird(d, x + 8, y - RY - 42 - hop, t, flying=False, face=-1, look=look_b, happy=hop == 0 and look_b == (0, 0))
    return img


# ---------------------------------------------------------------- choreography
def bird_world(t):
    """Bird position in world coords when it is NOT perched, else None."""
    if 11.3 <= t < 12.9:
        p = (t - 11.3) / 1.6
        x = lerp(1220, SEAT[0] + 8, ease(p))
        y = lerp(470, SEAT[1] - 2 * RY - 42, ease(p)) + 40 * math.sin(p * 9) * (1 - p)
        return x, y, -1
    if 16.0 <= t < 21.4:
        p = ease((t - 16.0) / 0.9)
        x, y = lerp(SEAT[0] + 8, 230, p), lerp(SEAT[1] - 2 * RY - 42, 560, p) + 10 * math.sin(t * 5)
        return x, y, 1
    if 21.4 <= t < 22.3:
        p = (t - 21.4) / 0.9
        return lerp(230, SEAT[0] + 8, ease(p)), lerp(560, SEAT[1] - 2 * RY - 42, ease(p)) - 50 * math.sin(p * math.pi), 1
    if t >= 23.5:
        p = ease((t - 23.5) / 0.6)
        x, y = lerp(SEAT[0] + 8, 640, p), lerp(SEAT[1] - 2 * RY - 42, 600, p) + 10 * math.sin(t * 5)
        q = ease((t - 24.7) / 0.8)
        return lerp(x, 1250, q), lerp(y, 420, q), 1 if q > 0 else -1
    return None


def perched(t):
    return 12.9 <= t < 16.0 or 22.3 <= t < 23.5


def humpty_state(t):
    """Returns dict(pos, pivot, rot, sx, sy, expression kwargs)."""
    ex = dict(eyes="open", mouth="smile", look=(0, 0), arms=(-35, -35), legs=(8 * math.sin(t * 4), -8 * math.sin(t * 4)))
    rot = 0.0
    pos, pivot = SEAT, BOTTOM
    sx = sy = 1.0
    if t < 2.0:
        ex.update(arms=(-35, 55 + 25 * math.sin(t * 14)))
        if t < 0.5:
            sx, sy = wobble(t, 0.15)
    elif t < 4.8:
        ex.update(eyes="happy", mouth="o", legs=(25 * math.sin(t * 6), 25 * math.sin(t * 6 + 1.2)))
    elif t < 6.4:
        rot = kf(t, [(4.8, 0), (5.15, -16), (5.45, -24), (5.75, -10), (6.0, -17), (6.4, 0)])
        f = math.sin(t * 30)
        ex.update(eyes="wide", mouth="O", brow="worried", arms=(60 * f, -60 * f), legs=(30 * f, -30 * f))
    elif t < 7.8:
        ex.update(eyes="happy", mouth="flat" if t < 7.0 else "smile", arms=(-35, 120))
    elif t < 9.5:
        rot = kf(t, [(7.8, 0), (8.15, 18), (8.45, 28), (8.8, 13), (9.1, 23), (9.5, 0)])
        f = math.sin(t * 34)
        ex.update(eyes="wide", mouth="O", brow="worried", arms=(70 * f, -70 * f), legs=(35 * f, -35 * f))
    elif t < 11.3:
        ex.update(eyes="smug", mouth="grin", arms=(-60, -60))
    elif t < 12.9:
        bx = bird_world(t)
        ex.update(look=(clamp((bx[0] - 540) / 300, -1, 1), -0.8), mouth="smile")
    elif t < 14.8:
        ex.update(look=(0, -1), mouth="o" if t < 13.8 else "smile", arms=(-35, -35))
    elif t < 16.0:
        rot = kf(t, [(14.9, 0), (15.2, 4), (16.0, 14)], linear)
        ex.update(eyes="wide", mouth="worried", brow="worried", look=(0, 0), arms=(-50, -50))
    elif t < CONTACTS[0]:
        p = (t - 16.0) / (CONTACTS[0] - 16.0)
        c0 = (SEAT[0] + RY * math.sin(math.radians(14)), SEAT[1] - RY * math.cos(math.radians(14)))
        c1 = (760, GROUND_Y - RY)
        pos = (lerp(c0[0], c1[0], p), lerp(c0[1], c1[1], p * p))
        pivot, rot = SC, lerp(14, 360, p ** 1.4)
        ex.update(eyes="wide", mouth="O", arms=(80, 80), legs=(-30, 30))
    elif t < 23.6:
        # bounces: [contact, takeoff] on the ground, then flights between contacts
        hops = [(CONTACTS[0], (760, GROUND_Y), CONTACTS[1], (690, GROUND_Y), 700),
                (CONTACTS[1], (690, GROUND_Y), CONTACTS[2], (610, GROUND_Y), 560),
                (CONTACTS[2], (610, GROUND_Y), CONTACTS[3], SEAT, 420)]
        GT = 0.12
        done = False
        for (c, p0, c2, p1, hgt) in hops:
            if c <= t < c + GT:
                s = (t - c) / GT
                pos, pivot = p0, BOTTOM
                sx, sy = 1 + 0.38 * math.sin(math.pi * s), 1 - 0.36 * math.sin(math.pi * s)
                done = True
                break
            if c + GT <= t < c2:
                x, y = arc(t, c + GT, c2, p0[0], p0[1] - RY, p1[0], p1[1] - RY, hgt)
                pos, pivot = (x, y), SC
                rot = 360 * ease((t - c - GT) / (c2 - c - GT))
                sx, sy = 0.94, 1.08
                done = True
                break
        joy = t > CONTACTS[1]
        ex.update(eyes="happy" if joy else "wide", mouth="laugh" if joy else "O", arms=(70, 70), legs=(-25, 25))
        if not done:
            since = t - CONTACTS[3]
            sx, sy = wobble(since, 0.3, 18, 5)
            if t < 20.6:
                ex.update(eyes="dizzy", mouth="worried", arms=(-40, -40), legs=(0, 0))
            elif t < 21.4:
                ex.update(eyes="happy", mouth="laugh", arms=(70, 70), legs=(25 * math.sin(t * 9), -25 * math.sin(t * 9)))
            elif t < 22.5:
                bx = bird_world(t) or (540, 600, 1)
                ex.update(look=(clamp((bx[0] - 540) / 300, -1, 1), -0.9), mouth="smile")
            else:
                ex.update(eyes="smug", mouth="grin", look=(0.4, 0.3), arms=(-55, -55))
    elif t < 24.6:
        x, y = arc(t, 23.6, 24.6, SEAT[0], SEAT[1] - RY, 720, 2150, 140)
        pos, pivot, rot = (x, y), SC, 200 * ease((t - 23.6) / 1.0)
        ex.update(eyes="happy", mouth="laugh", arms=(80, 80), legs=(-35, 35))
    else:
        # off-screen BOING... and back up onto the wall, ready to loop
        x, y = arc(t, 24.6, 25.45, 720, 2150, SEAT[0], SEAT[1] - RY, 380)
        pos, pivot, rot = (x, y), SC, lerp(200, 360, ease((t - 24.6) / 0.85))
        ex.update(eyes="happy", mouth="laugh", arms=(80, 80), legs=(-35, 35))
        if t >= 25.45:
            pos, pivot, rot = SEAT, BOTTOM, 0
            sx, sy = wobble(t - 25.45, 0.15)
            ex.update(eyes="open", mouth="smile", arms=(-35, -35))
    if perched(t):
        hop = 14 * abs(math.sin((t - 14.75) * 9)) if 14.75 <= t < 15.1 else 0
        bl = (0, 0) if t < 14.75 else (1, 1)
        ex["bird"] = (hop, bl)
    return pos, pivot, rot, sx, sy, ex


def frame(t):
    img = BG.copy()
    d = ImageDraw.Draw(img, "RGBA")
    # drifting clouds
    for i, (cx0, cy, s) in enumerate([(200, 470, 1.0), (760, 640, 0.75), (1100, 420, 0.6)]):
        cx = (cx0 + t * 18 * (1 + i * 0.3)) % (W + 400) - 200
        for (ox, oy, r) in [(0, 0, 70), (75, -30, 85), (155, 0, 70)]:
            d.ellipse([cx + (ox - r) * s, cy + (oy - r) * s, cx + (ox + r) * s, cy + (oy + r) * s], fill=(255, 255, 255, 235))
    pos, pivot, rot, sx, sy, ex = humpty_state(t)
    # ground shadow
    if 1100 < pos[1] < GROUND_Y - 40:
        gy = GROUND_Y
        h = clamp(1 - (gy - (pos[1] + (RY if pivot == SC else 0))) / 900)
        r = 130 * (0.4 + 0.6 * h)
        d.ellipse([pos[0] - r, gy - 16, pos[0] + r, gy + 16], fill=(0, 0, 0, int(70 * h)))
    spr = humpty_sprite(t, **ex)
    place(img, spr, pos[0], pos[1], pivot, sx, sy, rot)
    b = bird_world(t)
    if b:
        look = (-b[2], 1) if 16.0 <= t < 21.4 else (0, 0)
        draw_bird(d, b[0], b[1], t, flying=True, face=b[2], look=look)
    # whistling notes
    music_notes(d, SEAT[0] + 70, SEAT[1] - RY - 20, t, 2.2, 4.8)
    # bubbles
    bx, by = SEAT[0] + 210, SEAT[1] - 2 * RY - 120
    bubble(d, bx, by, "?", seg(t, 13.0, 13.25) * (t < 13.85))
    bubble(d, bx, by, "♥", seg(t, 13.9, 14.15) * (t < 14.75))
    bubble(d, bx, by, "!", seg(t, 15.05, 15.25) * (t < 16.0), col=(230, 50, 50))
    if 19.15 < t < 20.6:
        dizzy_stars(d, pos[0], SEAT[1] - 2 * RY - 10, t)
    if 16.0 <= t < 17.2:
        bubble(d, 330, 420, "!!", seg(t, 16.15, 16.35), size=90, col=(230, 50, 50), tail=1)
    title(d, "Humpty Dumpty", t, sub="Uh-oh...!")
    shakes = [(CONTACTS[0], 26), (CONTACTS[3], 12)]
    return camera(img, t, shakes, zoom=1.12, focus=(W / 2, 900))


def audio(buf):
    music(buf, 0.0, 4.8, bpm=128, key=60, vol=0.8)
    add(buf, 0.4, voice("hi-ya!", 300, seed=2))
    add(buf, 2.2, whistle_tune([(0, 1), (4, 1), (7, 1), (12, 2), (9, 1), (7, 1), (4, 2), (5, 1), (7, 1), (4, 1),
                                (0, 3)], unit=0.16))
    # wobble 1
    add(buf, 4.85, voice("a-aah!", 380, rate=1.3, seed=3))
    add(buf, 5.0, wobble_whistle(900, 1.3, rate=6, depth=0.2))
    add(buf, 6.55, voice("fyoo.", 280, rate=0.8, seed=4))
    # wobble 2
    add(buf, 7.85, voice("wo-wo-woah!", 340, rate=1.2, seed=5))
    add(buf, 8.0, wobble_whistle(800, 1.4, rate=7, depth=0.25))
    music(buf, 10.0, 14.8, bpm=128, key=60, vol=0.7)
    add(buf, 9.8, voice("heh-heh!", 250, seed=6))
    # bird
    for k in range(10):
        add(buf, 11.3 + k * 0.16, flap(0.08))
    add(buf, 11.6, chirp(0.18))
    add(buf, 12.4, chirp(0.2, 3600))
    add(buf, 13.0, pop(0.25))
    add(buf, 13.9, voice("aww~", 320, rate=0.7, seed=7))
    add(buf, 14.3, chirp(0.18, 3400))
    add(buf, 14.8, plink(1500, 0.25))
    add(buf, 14.9, creak(0.8, 0.2))
    add(buf, 15.3, voice("uh-oh.", 240, rate=0.9, seed=8))
    # fall
    add(buf, 16.0, chirp(0.2, 3800))
    for k in range(6):
        add(buf, 16.0 + k * 0.12, flap(0.08))
    add(buf, 16.0, slide(1700, 300, 0.75, 0.28))
    add(buf, 16.05, voice("waaa!", 400, rate=0.9, seed=9) * 0.8)
    # bounces
    add(buf, CONTACTS[0], thud(0.4))
    for i, c in enumerate(CONTACTS[:3]):
        add(buf, c, boing(140 + i * 45, 0.7, 0.45))
    add(buf, CONTACTS[1] + 0.1, voice("wheee!", 420, seed=10) * 0.7)
    add(buf, CONTACTS[3], pop(0.4))
    add(buf, CONTACTS[3], boing(300, 0.5, 0.3))
    add(buf, CONTACTS[3] + 0.3, slide(500, 350, 0.9, 0.08))
    # victory
    add(buf, 20.6, voice("hee-hee-hee!", 330, rate=1.1, seed=11))
    music(buf, 20.6, DUR, bpm=140, key=62, vol=0.85)
    for k in range(6):
        add(buf, 21.4 + k * 0.15, flap(0.08))
    add(buf, 22.2, chirp(0.18))
    add(buf, 22.6, voice("heh-heh.", 240, seed=12))
    add(buf, 23.6, voice("wheeeeee!", 360, rate=1.0, seed=13))
    add(buf, 23.6, slide(500, 1500, 0.5, 0.15))
    add(buf, 24.6, boing(120, 0.8, 0.5))
    add(buf, 25.45, pop(0.35))


if __name__ == "__main__":
    pv = [float(x) for x in sys.argv[1:]] or None
    render(DUR, frame, audio, "out/humpty-dumpty-sketch.mp4", preview_times=pv)
