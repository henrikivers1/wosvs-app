"""Sketch: Hey Diddle Diddle - the cow really, REALLY wants to jump over the moon."""
import math, sys
import numpy as np
from PIL import Image, ImageDraw
from sketchkit import *

DUR = 26.5
FEET = 1365                  # cow's feet on the hill
START = (330, FEET)
TRAMP = (575, 1390)          # trampoline mat centre
LAND_X = 840                 # where she lands after hopping over the moon
SPR = 800
COW_K = 1.22                 # cow sprite scale
CP = (400, 690)              # cow sprite: feet pivot
CC = (400, 520)              # cow sprite: body centre
MOON_SKY = (640, 640, 150)
MOON_LOW = (650, 1290, 95)
rng = np.random.default_rng(4)
STARS = [(rng.uniform(0, W), rng.uniform(80, 1150), rng.uniform(2, 6), rng.uniform(0, 6)) for _ in range(90)]


def _background():
    img = gradient((20, 24, 70), (80, 60, 150))
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([-300, 1180, 1380, 2600], fill=(70, 150, 85))
    d.ellipse([-200, 1230, 1280, 2600], fill=(85, 175, 95))
    for k, fx in enumerate(range(60, W, 160)):
        fy = 1660 + (k % 2) * 90
        d.line([(fx, fy), (fx, fy + 50)], fill=(40, 120, 50), width=6)
        col = [(255, 160, 200), (255, 230, 110), (180, 160, 255)][k % 3]
        for j in range(5):
            a = j * 1.2566
            d.ellipse([fx + 17 * math.cos(a) - 12, fy + 17 * math.sin(a) - 12,
                       fx + 17 * math.cos(a) + 12, fy + 17 * math.sin(a) + 12], fill=col)
    return img


BG = _background()


# ---------------------------------------------------------------- characters
SPOTS = [(-70, -30, 46, 34), (60, 20, 40, 30), (-10, 60, 30, 22), (85, -50, 26, 22)]


def cow_sprite(t, eyes="open", mouth="smile", look=(0, 0), brow=None, legs=0.0, tail=0.0, tear=None, sit=False):
    img, d = canvas((SPR, SPR))
    x, y = CC
    # tail
    tx = x + 135
    tw = math.sin(t * 5) * 20 + tail
    d.line([(tx, y + 10), (tx + 40, y - 30 + tw), (tx + 60, y - 70 + tw)], fill=INK, width=8, joint="curve")
    d.ellipse([tx + 44, y - 92 + tw, tx + 76, y - 58 + tw], fill=(60, 40, 40))
    # legs
    for i, lx in enumerate((-95, -40, 40, 95)):
        sw = legs * (1 if i % 2 else -1)
        top, bot = y + 80, CP[1] - (30 if sit else 0)
        d.rounded_rectangle([x + lx - 22 + sw, top, x + lx + 22 + sw, bot], 12, fill=(255, 255, 255), outline=INK, width=5)
        d.rounded_rectangle([x + lx - 24 + sw, bot - 26, x + lx + 24 + sw, bot], 8, fill=(70, 50, 50), outline=INK, width=5)
    # body
    d.rounded_rectangle([x - 150, y - 100, x + 150, y + 120], 100, fill=(255, 255, 255), outline=INK, width=7)
    for (sx, sy, rx, ry) in SPOTS:
        d.ellipse([x + sx - rx, y + sy - ry, x + sx + rx, y + sy + ry], fill=(50, 40, 50))
    d.ellipse([x - 55, y + 60, x + 55, y + 112], fill=(255, 190, 200), outline=INK, width=4)
    # head
    hx, hy = x, y - 170
    for side in (-1, 1):  # ears + horns
        d.ellipse([hx + side * 120 - 45, hy - 60, hx + side * 120 + 45, hy - 20], fill=(255, 200, 210), outline=INK, width=5)
        d.polygon([(hx + side * 48, hy - 92), (hx + side * 80, hy - 150), (hx + side * 70, hy - 88)],
                  fill=(255, 240, 200), outline=INK)
    d.ellipse([hx - 115, hy - 115, hx + 115, hy + 95], fill=(255, 255, 255), outline=INK, width=7)
    d.ellipse([hx + 25, hy - 110, hx + 95, hy - 50], fill=(50, 40, 50))
    # collar + bell
    d.arc([x - 90, y - 125, x + 90, y - 55], 20, 160, fill=(220, 40, 60), width=14)
    d.ellipse([x - 22, y - 70, x + 22, y - 26], fill=(255, 205, 40), outline=INK, width=5)
    # eyes
    for side in (-1, 1):
        cx, cy = hx + side * 44, hy - 30
        if eyes == "happy":
            d.arc([cx - 24, cy - 12, cx + 24, cy + 24], 200, 340, fill=INK, width=8)
            continue
        if eyes == "dizzy":
            for k in range(3):
                r = 7 + k * 8
                d.arc([cx - r, cy - r, cx + r, cy + r], t * 600 + k * 90, t * 600 + k * 90 + 250, fill=INK, width=5)
            continue
        d.ellipse([cx - 26, cy - 32, cx + 26, cy + 32], fill="white", outline=INK, width=5)
        px, py = cx + look[0] * 10, cy + look[1] * 14
        d.ellipse([px - 13, py - 13, px + 13, py + 13], fill=INK)
        d.ellipse([px - 7, py - 9, px - 1, py - 3], fill="white")
        if eyes == "sad":
            d.chord([cx - 30, cy - 36, cx + 30, cy + 8], 180, 360, fill=(255, 255, 255))
            d.line([(cx - 28, cy - 12), (cx + 28, cy - 12)], fill=INK, width=5)
    if brow == "determined":
        for side in (-1, 1):
            d.line([(hx + side * 16, hy - 62), (hx + side * 72, hy - 82)], fill=INK, width=10)
    elif brow == "sad":
        for side in (-1, 1):
            d.line([(hx + side * 16, hy - 84), (hx + side * 70, hy - 64)], fill=INK, width=9)
    # muzzle
    my = hy + 52
    d.ellipse([hx - 82, my - 48, hx + 82, my + 48], fill=(255, 185, 195), outline=INK, width=6)
    d.ellipse([hx - 42, my - 22, hx - 22, my - 2], fill=(150, 70, 90))
    d.ellipse([hx + 22, my - 22, hx + 42, my - 2], fill=(150, 70, 90))
    if mouth == "smile":
        d.arc([hx - 34, my - 4, hx + 34, my + 34], 20, 160, fill=INK, width=6)
    elif mouth == "O":
        d.ellipse([hx - 20, my + 4, hx + 20, my + 40], fill=(120, 20, 40), outline=INK, width=4)
    elif mouth == "grin":
        d.chord([hx - 44, my - 4, hx + 44, my + 42], 0, 180, fill=(120, 20, 40), outline=INK, width=5)
    elif mouth == "sad":
        d.arc([hx - 30, my + 18, hx + 30, my + 48], 200, 340, fill=INK, width=6)
    elif mouth == "flat":
        d.line([(hx - 26, my + 24), (hx + 26, my + 24)], fill=INK, width=6)
    if tear is not None:
        tx, ty = hx - 44, hy - 4 + tear * 120
        d.ellipse([tx - 10, ty - 10, tx + 10, ty + 14], fill=(120, 190, 255), outline=INK, width=3)
    return img


def draw_moon(d, x, y, r, t, eyes="open", mouth="smile", look=(0, 0), brow=None, shake=0.0):
    x += shake * math.sin(t * 60)
    for k in range(4, 0, -1):
        g = r + k * 22
        d.ellipse([x - g, y - g, x + g, y + g], fill=(255, 250, 200, 14))
    d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 242, 175), outline=(220, 190, 110), width=max(3, int(r / 20)))
    for (cx, cy, cr) in [(-0.5, -0.45, 0.16), (0.55, 0.35, 0.12), (-0.25, 0.6, 0.09)]:
        d.ellipse([x + cx * r - cr * r, y + cy * r - cr * r, x + cx * r + cr * r, y + cy * r + cr * r],
                  fill=(240, 222, 150))
    s = r / 150
    for side in (-1, 1):
        cx, cy = x + side * 48 * s, y - 25 * s
        if eyes == "happy" or (eyes == "wink" and side == 1):
            d.arc([cx - 24 * s, cy - 12 * s, cx + 24 * s, cy + 24 * s], 200, 340, fill=INK, width=max(3, int(7 * s)))
            continue
        d.ellipse([cx - 16 * s, cy - 20 * s, cx + 16 * s, cy + 20 * s], fill=INK)
        d.ellipse([cx - 8 * s + look[0] * 4 * s, cy - 14 * s + look[1] * 6 * s, cx - 1 * s + look[0] * 4 * s,
                   cy - 6 * s + look[1] * 6 * s], fill="white")
    if brow == "sad":
        for side in (-1, 1):
            d.line([(x + side * 20 * s, y - 70 * s), (x + side * 70 * s, y - 55 * s)], fill=INK, width=max(3, int(7 * s)))
    for side in (-1, 1):
        d.ellipse([x + side * 85 * s - 20 * s, y + 15 * s, x + side * 85 * s + 20 * s, y + 35 * s], fill=(255, 190, 160))
    my = y + 35 * s
    if mouth == "smile":
        d.arc([x - 45 * s, my - 30 * s, x + 45 * s, my + 20 * s], 20, 160, fill=INK, width=max(3, int(7 * s)))
    elif mouth == "laugh":
        d.chord([x - 55 * s, my - 22 * s, x + 55 * s, my + 52 * s], 0, 180, fill=(120, 20, 40), outline=INK, width=5)
    elif mouth == "o":
        d.ellipse([x - 14 * s, my - 4 * s, x + 14 * s, my + 24 * s], fill=(120, 20, 40))
    elif mouth == "sad":
        d.arc([x - 34 * s, my + 2 * s, x + 34 * s, my + 34 * s], 200, 340, fill=INK, width=max(3, int(7 * s)))


def draw_trampoline(d, x, y, sag=0.0, scale=1.0):
    if scale <= 0.01:
        return
    w = 200 * scale
    for lx in (-0.8, 0.8):
        d.line([(x + lx * w, y), (x + lx * w * 1.1, y + 70 * scale)], fill=INK, width=int(12 * scale) + 1)
    d.ellipse([x - w, y - 34 * scale, x + w, y + 34 * scale], fill=(40, 40, 60), outline=INK, width=5)
    d.ellipse([x - w * 0.85, y - 24 * scale + sag * 30, x + w * 0.85, y + 24 * scale + sag * 30], fill=(70, 120, 230))
    d.ellipse([x - w, y - 34 * scale, x + w, y + 34 * scale], outline=(255, 90, 90), width=int(10 * scale) + 1)


def draw_dish_spoon(d, x, y, t, face=1):
    run = t * 16
    for i, (ox, kind) in enumerate([(-75, "dish"), (75, "spoon")]):
        px = x + ox
        py = y - abs(math.sin(run + i)) * 18
        for k in (-1, 1):  # legs
            fx = px + k * 18 + math.sin(run + i + (k > 0) * math.pi) * 18 * face
            d.line([(px + k * 12, py + 40), (fx, py + 82)], fill=INK, width=7)
            d.ellipse([fx - 12, py + 74, fx + 12, py + 88], fill=INK)
        if kind == "dish":
            d.ellipse([px - 70, py - 60, px + 70, py + 50], fill=(255, 255, 255), outline=INK, width=6)
            d.ellipse([px - 52, py - 44, px + 52, py + 34], outline=(90, 140, 230), width=7)
        else:
            d.rounded_rectangle([px - 8, py + 10, px + 8, py + 70], 6, fill=(200, 205, 220), outline=INK, width=4)
            d.ellipse([px - 46, py - 70, px + 46, py + 30], fill=(215, 220, 235), outline=INK, width=6)
        ey = py - 18
        for k in (-1, 1):
            d.arc([px + k * 20 - 11, ey - 9, px + k * 20 + 11, ey + 11], 200, 340, fill=INK, width=5)
        d.chord([px - 20, ey + 6, px + 20, ey + 34], 0, 180, fill=(120, 20, 40))
    # holding hands
    d.line([(x - 15, y - 5), (x + 15, y - 5)], fill=INK, width=7)


# ---------------------------------------------------------------- choreography
def moon_state(t):
    x, y, r = MOON_SKY
    ex = dict(eyes="open", mouth="smile", look=(0, 0), brow=None, shake=0.0)
    if 17.6 <= t < 22.2:
        p = ease((t - 17.6) / 1.4)
        x, y, r = (lerp(a, b, p) for a, b in zip(MOON_SKY, MOON_LOW))
    elif t >= 22.2:
        q = ease((t - 22.0) / 1.6)
        x, y, r = (lerp(a, b, q) for a, b in zip(MOON_LOW, MOON_SKY))
    y += 8 * math.sin(t * 1.5)
    cow_pos = cow_state(t)[0]
    ex["look"] = (clamp((cow_pos[0] - x) / 300, -1, 1), clamp((cow_pos[1] - 300 - y) / 400, -1, 1))
    if 4.5 <= t < 5.6:
        ex.update(eyes="happy", mouth="laugh", shake=4)
    elif 9.1 <= t < 10.2:
        ex.update(look=(0, -1), mouth="o")
    elif 10.8 <= t < 12.4:
        ex.update(eyes="happy", mouth="laugh", shake=10)
    elif 12.6 <= t < 15.0:
        ex.update(look=(clamp((dish_x(t) - x) / 300, -1, 1), 1))
    elif 16.7 <= t < 17.8:
        ex.update(brow="sad", mouth="sad")
    elif 18.9 <= t < 20.0:
        ex.update(eyes="wink", mouth="smile")
    elif 22.2 <= t < 23.8:
        ex.update(eyes="happy", mouth="laugh", shake=2)
    return (x, y, r), ex


def dish_x(t):
    if 12.6 <= t < 15.0:
        return lerp(-200, W + 200, (t - 12.6) / 2.4)
    if 23.4 <= t < 25.4:
        return lerp(W + 200, -200, (t - 23.4) / 2.0)
    return None


def cow_state(t):
    """-> (pos, pivot, rot, sx, sy, expression, trampoline sag)"""
    ex = dict(eyes="open", mouth="smile", look=(0.3, -1))
    pos, pivot, rot, sx, sy = START, CP, 0.0, 1.0, 1.0
    sag = 0.0
    if t < 2.4:
        if t >= 1.3:
            ex.update(brow="determined", mouth="O" if 1.4 <= t < 2.1 else "flat")
        elif 0.5 <= t < 1.0:
            ex.update(mouth="O")
    elif t < 3.4:
        sy = lerp(1, 0.8, ease((t - 2.4) / 0.4))
        sx = 2 - sy
        ex.update(brow="determined", mouth="flat", legs=3 * math.sin(t * 40))
    elif t < 4.1:
        x, y = arc(t, 3.4, 4.1, START[0], FEET, START[0], FEET, 260)
        pos = (x, y)
        sx, sy = 0.92, 1.1
        ex.update(brow="determined", mouth="grin", legs=8)
    elif t < 5.8:
        sx, sy = wobble(t - 4.1, 0.25)
        if t < 4.9:
            ex.update(eyes="dizzy", mouth="flat")
        else:
            ex.update(eyes="sad", mouth="flat", look=(1, -0.5))
    elif t < 6.4:
        ex.update(look=(1, 0.5), mouth="O")
    elif t < 12.0:
        hops = [(6.4, START, 6.9, (TRAMP[0], TRAMP[1] - 30), 140),
                (6.9, (TRAMP[0], TRAMP[1] - 30), 7.5, (TRAMP[0], TRAMP[1] - 30), 200),
                (7.5, (TRAMP[0], TRAMP[1] - 30), 8.3, (TRAMP[0], TRAMP[1] - 30), 420)]
        done = False
        for (a, p0, b, p1, h) in hops:
            if a <= t < b:
                pos = arc(t, a, b, p0[0], p0[1], p1[0], p1[1], h)
                sx, sy = 0.94, 1.08
                if a > 6.5:
                    sag = max(0, 1 - (t - a) / 0.12)
                ex.update(eyes="happy" if a > 7 else "open", mouth="grin", legs=10)
                done = True
        if done:
            pass  # mid-hop, set above
        elif t < 9.0:
            p = (t - 8.3) / 0.7
            pos = (TRAMP[0], lerp(TRAMP[1] - 30, -500, ease(p ** 0.7)))
            sag = max(0, 1 - (t - 8.3) / 0.15)
            sx, sy = 0.85, 1.25
            ex.update(eyes="happy", mouth="grin")
        elif t < 10.1:
            pos = (TRAMP[0], -900)
        elif t < 10.7:
            p = (t - 10.1) / 0.6
            pos, pivot = (TRAMP[0], lerp(-500, TRAMP[1] - 230, p * p)), CC
            rot = 180
            ex.update(eyes="open", mouth="O", look=(0, -1))
        else:
            pivot, rot = CC, 180
            pos = (TRAMP[0], TRAMP[1] - 230 + 24 * math.exp(-(t - 10.7) * 6) * math.cos((t - 10.7) * 20))
            sag = 0.8 + 0.4 * math.exp(-(t - 10.7) * 5) * math.cos((t - 10.7) * 20)
            ex.update(eyes="dizzy" if t < 11.4 else "sad", mouth="flat", legs=14 * math.sin(t * 22))
    elif t < 12.6:
        p = (t - 12.0) / 0.6
        x, y = arc(t, 12.0, 12.6, TRAMP[0], TRAMP[1] - 230, START[0], FEET - (CP[1] - CC[1]) * COW_K, 120)
        pos, pivot, rot = (x, y), CC, lerp(180, 360, ease(p))
        ex.update(mouth="O")
    elif t < 15.0:
        dx = dish_x(t)
        sx, sy = wobble(t - 12.6, 0.2)
        ex.update(look=(clamp((dx - START[0]) / 300, -1, 1), 0.6), mouth="O" if t < 13.6 else "smile")
    elif t < 19.5:
        sy = lerp(1, 0.9, ease((t - 15.0) / 0.3))
        sx = 1.04
        ex.update(eyes="sad", brow="sad", mouth="sad", look=(0, 0.8), sit=True,
                  tear=((t - 15.6) / 1.2) if 15.6 <= t < 16.8 else None)
        if t >= 17.9:
            m = moon_state_pos(t)
            ex.update(look=(clamp((m[0] - START[0]) / 300, -1, 1), clamp((m[1] - 1000) / 400, -1, 1)))
    elif t < 20.2:
        sx, sy = wobble(t - 19.5, 0.2)
        ex.update(eyes="open", mouth="O" if t < 20.0 else "grin", look=(1, 0.3))
    elif t < 21.4:
        pos = arc(t, 20.2, 21.4, START[0], FEET, LAND_X, FEET, 380)
        sx, sy = 0.94, 1.08
        ex.update(eyes="happy", mouth="O", legs=12)
    elif t < 25.2:
        sx, sy = wobble(t - 21.4, 0.25)
        pos = (LAND_X, FEET - abs(math.sin((t - 21.9) * 7)) * 50 * (t > 21.9 and t < 23.2))
        ex.update(eyes="happy", mouth="grin", legs=10 * math.sin(t * 14), tail=30 * math.sin(t * 10))
        if t > 23.4:
            dx = dish_x(t) or 0
            ex.update(eyes="open", look=(clamp((dx - LAND_X) / 300, -1, 1), 0.6))
    elif t < 25.9:
        pos = arc(t, 25.2, 25.9, LAND_X, FEET, START[0], FEET, 200)
        sx, sy = 0.94, 1.08
        ex.update(eyes="happy", mouth="grin", legs=10)
    else:
        sx, sy = wobble(t - 25.9, 0.2)
    return pos, pivot, rot, sx, sy, ex, sag


def moon_state_pos(t):
    if 17.6 <= t < 22.2:
        p = ease((t - 17.6) / 1.4)
        return tuple(lerp(a, b, p) for a, b in zip(MOON_SKY, MOON_LOW))
    return MOON_SKY


def frame(t):
    img = BG.copy()
    d = ImageDraw.Draw(img, "RGBA")
    for (sx_, sy_, r, ph) in STARS:
        a = 0.5 + 0.5 * math.sin(t * 2.5 + ph)
        rr = r * (0.7 + 0.5 * a)
        d.ellipse([sx_ - rr, sy_ - rr, sx_ + rr, sy_ + rr], fill=(255, 250, 220, int(120 + 120 * a)))
    (mx, my, mr), mex = moon_state(t)
    moon_front = 17.6 <= t < 22.4
    if not moon_front:
        draw_moon(d, mx, my, mr, t, **mex)
    pos, pivot, rot, sx, sy, ex, sag = cow_state(t)
    # trampoline
    tsc = ease_out_back(seg(t, 5.8, 6.15)) * (1 - seg(t, 12.7, 12.9))
    draw_trampoline(d, TRAMP[0], TRAMP[1], sag, tsc)
    if moon_front:
        draw_moon(d, mx, my, mr, t, **mex)
        if 17.6 <= t < 19.2:
            for i in range(6):
                a = t * 4 + i
                d.polygon(star_pts(mx + 140 * math.cos(a), my + 140 * math.sin(a) - 40, 16, 7), fill=(255, 240, 150))
    # shadow
    if pos[1] > 1000 and rot == 0:
        h = clamp(1 - (FEET - pos[1]) / 500)
        d.ellipse([pos[0] - 150 * h, FEET - 14, pos[0] + 150 * h, FEET + 14], fill=(0, 0, 0, int(60 * h)))
    if pos[1] > -400:
        place(img, cow_sprite(t, **ex), pos[0], pos[1], pivot, sx * COW_K, sy * COW_K, rot)
    # sparkle trail over the moon
    if 20.2 <= t < 21.6:
        for k in range(10):
            tt = t - k * 0.05
            if tt < 20.2:
                break
            x, y = arc(tt, 20.2, 21.4, START[0], FEET, LAND_X, FEET, 380)
            d.polygon(star_pts(x, y - 200, 20 - k * 1.5, 8 - k * 0.6, tt * 5), fill=(255, 230, 100, 255 - k * 22))
    dx = dish_x(t)
    if dx is not None:
        draw_dish_spoon(d, dx, 1490, t, face=1 if t < 20 else -1)
    # bubbles
    bubble(d, START[0] + 200, 680, "?", seg(t, 4.3, 4.5) * (t < 4.9), tail=-1)
    bubble(d, START[0] + 200, 680, "!", seg(t, 5.9, 6.05) * (t < 6.4), col=(230, 50, 50))
    bubble(d, mx - 170, my - 190, "?", seg(t, 9.25, 9.45) * (t < 10.1), size=90, tail=1)
    bubble(d, START[0] + 200, 680, "?", seg(t, 13.2, 13.4) * (t < 14.4))
    bubble(d, START[0] + 200, 680, "♥", seg(t, 19.6, 19.8) * (t < 20.2))
    confetti(d, t, 21.4)
    title(d, "Hey Diddle Diddle", t, color=(255, 236, 120), stroke=(70, 40, 140), sub="Over the moon?!")
    return camera(img, t, [(4.1, 22), (10.7, 30), (21.4, 14)], zoom=1.05)


def crickets(d, vol=0.06):
    out = np.zeros(int(d * SR) + SR)
    k = 0.0
    while k < d:
        for j in range(3):
            tt = np.arange(int(0.025 * SR)) / SR
            add(out, k + j * 0.04, np.sin(2 * np.pi * 4600 * tt) * np.sin(np.pi * tt / 0.025) * vol)
        k += 0.42
    return out


def audio(buf):
    music(buf, 0.0, 2.4, bpm=120, key=60, vol=0.8)
    add(buf, 0.5, moo(0.6, 150, 0.32, rise=1.3, fall=1.2))
    add(buf, 1.4, moo(0.8, 125, 0.42, rise=1.2, fall=0.9))
    add(buf, 2.4, drumroll(1.0, 0.22))
    add(buf, 3.4, voice("hup!", 200, seed=3))
    add(buf, 3.4, slide(400, 1000, 0.35, 0.18))
    add(buf, 3.75, slide(1000, 400, 0.35, 0.18))
    add(buf, 4.1, thud(0.6))
    add(buf, 4.55, voice("hee-hee-hee!", 230, rate=1.1, seed=4))
    add(buf, 5.2, voice("mm-hmph!", 150, rate=0.9, seed=5))
    add(buf, 5.85, pop(0.45))
    add(buf, 5.95, plink(2000, 0.2))
    music(buf, 6.3, 8.3, bpm=150, key=62, vol=0.6, sneaky=True)
    for i, c in enumerate([6.9, 7.5, 8.3]):
        add(buf, c, boing(140 + i * 40, 0.6 + i * 0.1, 0.4 + i * 0.05))
    add(buf, 8.3, slide(500, 2200, 0.7, 0.2))
    add(buf, 8.4, moo(0.9, 160, 0.3, rise=1.5, fall=1.6))
    add(buf, 9.1, crickets(1.0))
    add(buf, 9.3, pop(0.2))
    add(buf, 10.1, slide(2200, 300, 0.6, 0.22))
    add(buf, 10.7, crash(0.25))
    add(buf, 10.7, thud(0.5))
    add(buf, 10.7, boing(110, 0.9, 0.4))
    add(buf, 10.95, voice("ha-ha-ha-ha-haa!", 210, rate=1.1, seed=6))
    add(buf, 12.0, slide(400, 900, 0.3, 0.12))
    add(buf, 12.6, pop(0.35))
    add(buf, 12.75, pop(0.25))
    # dish & spoon
    for k in range(16):
        add(buf, 12.6 + k * 0.15, tiptoe(k % 8 + (k // 8) * 2, 0.16, 76))
    add(buf, 13.4, voice("hi-hi-hi-hi!", 520, rate=1.4, seed=7) * 0.8)
    add(buf, 13.6, voice("hee-hee-hee!", 430, rate=1.4, seed=8) * 0.7)
    # sad
    add(buf, 15.0, sad_trombone(233, 0.32))
    add(buf, 16.0, moo(1.0, 100, 0.3, rise=1.0, fall=0.75))
    add(buf, 16.8, voice("aww~", 220, rate=0.7, seed=9))
    add(buf, 17.6, slide(1200, 500, 1.4, 0.08))
    music(buf, 17.6, 20.2, bpm=96, key=60, vol=0.55, sneaky=True)
    add(buf, 19.0, voice("go-o!", 230, seed=10))
    add(buf, 19.0, plink(2400, 0.15))
    add(buf, 19.6, moo(0.5, 150, 0.32, rise=1.4, fall=1.3))
    add(buf, 20.2, moo(1.3, 140, 0.42, rise=1.35, fall=1.05))
    add(buf, 20.2, slide(500, 1300, 1.2, 0.08))
    add(buf, 21.4, tada(72, 0.18))
    add(buf, 21.4, thud(0.3))
    music(buf, 21.4, DUR, bpm=140, key=62, vol=0.85)
    add(buf, 22.3, voice("hee-hee!", 230, seed=11))
    for k in range(13):
        add(buf, 23.4 + k * 0.15, tiptoe(k, 0.12, 79))
    add(buf, 24.0, voice("hi-hi-hi!", 520, rate=1.4, seed=12) * 0.6)
    add(buf, 25.2, slide(500, 1000, 0.35, 0.12))
    add(buf, 25.9, pop(0.3))


if __name__ == "__main__":
    pv = [float(x) for x in sys.argv[1:]] or None
    render(DUR, frame, audio, "out/hey-diddle-diddle-sketch.mp4", preview_times=pv)
