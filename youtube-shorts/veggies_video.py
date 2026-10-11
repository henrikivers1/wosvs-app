"""'Yum Yum Veggies' video: AI-generated stills (assets/veggies/1-9.png) cut to the song with Ken Burns motion,
smooth 60 fps motion, crossfades, sparkles, butterflies, karaoke captions and a subscribe end card.

    python3 veggies_song_audio.py   # instrumental sing-along -> out/veggies-karaoke.wav + exact word timings
    python3 veggies_video.py        # -> out/yum-yum-veggies.mp4
    python3 veggies_video.py 5 22   # preview frames
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from toon3d import W, H, FPS, render_parallel
from veggies_song_audio import BEAT, DUR, LEAD
from sing import parse_syllables

ASSETS = "assets/veggies"
FONT = "fonts/Fredoka.ttf"


def load(i):
    p = f"{ASSETS}/{i}.png"
    return Image.open(p).convert("RGB") if os.path.exists(p) else None


IMG = {i: load(i) for i in range(1, 10)}
FALLBACK = {6: 1, 7: 2, 8: 4, 9: 5}


def img(i):
    return IMG[i] if IMG[i] is not None else IMG[FALLBACK[i]]


# One smooth camera move per sung line: (start beat, image, zoom from, zoom to, focus from, focus to).
# Focus is a fraction of the picture; images 6-9 fall back to close-ups of 1-5 if missing.
def shots():
    have = lambda i: IMG[i] is not None
    s = [(0, 1, 1.0, 1.12, (.5, .5), (.45, .42)),
         (8, 2, 1.0, 1.15, (.5, .5), (.55, .45)),
         (16, 3, 1.14, 1.02, (.48, .45), (.5, .48)),
         (24, 4, 1.0, 1.15, (.5, .5), (.58, .45)),
         (32, 5, 1.0, 1.12, (.5, .55), (.5, .45)),
         (40, 6 if have(6) else 1, 1.0, 1.12, (.5, .55), (.5, .6)),
         (48, 7 if have(7) else 2, 1.12, 1.0, (.5, .45), (.5, .5)),
         (56, 8 if have(8) else 4, 1.0, 1.14, (.5, .5), (.5, .45)),
         (64, 9 if have(9) else 5, 1.0, 1.12, (.5, .5), (.48, .45)),
         (72, 9 if have(9) else 1, 1.0, 1.05, (.5, .5), (.5, .5)), (999, 1, 1, 1, (.5, .5), (.5, .5))]
    return s


SHOTS = shots()


def font(size, weight="Bold"):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(weight)
    return f


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


# ---------------------------------------------------------------- captions from the sung word timings
EVENTS = json.load(open("out/veggies-karaoke-words.json"))
LINES = []
_k = 0
for ln in LEAD:
    words = []
    for word, nsyl in parse_syllables(ln["text"]):
        ev = EVENTS[_k:_k + nsyl]
        _k += nsyl
        words.append(dict(text=word, t0=ev[0]["t"], t1=ev[-1]["t"] + ev[-1]["d"]))
    LINES.append(dict(t0=ln["start"] * BEAT, t1=(ln["start"] + 8) * BEAT, words=words))


def draw_caption(img, t):
    line = next((l for l in LINES if l["t0"] - 0.25 <= t < l["t1"] - 0.05), None)
    if not line:
        return
    d = ImageDraw.Draw(img, "RGBA")
    f = font(64)
    space = d.textlength(" ", font=f)
    widths = [d.textlength(w["text"], font=f) for w in line["words"]]
    # wrap into rows of max 900px
    rows, cur, cw = [], [], 0
    for i, w in enumerate(widths):
        if cur and cw + space + w > 900:
            rows.append(cur)
            cur, cw = [], 0
        cw += (space if cur else 0) + w
        cur.append(i)
    rows.append(cur)
    y = 1370
    pop = ease_out_back((t - line["t0"] + 0.25) / 0.3)
    for row in rows:
        rw = sum(widths[i] for i in row) + space * (len(row) - 1)
        x = W / 2 - rw / 2
        for i in row:
            w = line["words"][i]
            active = w["t0"] - 0.03 <= t < max(w["t1"], w["t0"] + 0.25)
            sung = t >= w["t0"] - 0.03
            if active:
                k = ease_out_back((t - w["t0"] + 0.03) / 0.15)
                pad = 14
                d.rounded_rectangle([x - pad, y - 44 - 6 * k, x + widths[i] + pad, y + 44 + 6 * k], 22,
                                    fill=(255, 64, 129, 235))
            col = (255, 255, 255) if (active or not sung) else (255, 236, 120)
            dy = -8 * math.sin(clamp((t - w["t0"]) / 0.2) * math.pi) if active else 0
            d.text((x, y + dy + (1 - pop) * 40), w["text"], font=f, fill=col, anchor="lm",
                   stroke_width=6, stroke_fill=(70, 30, 90))
            x += widths[i] + space
        y += 96


# ---------------------------------------------------------------- overlays
rng = np.random.default_rng(12)
SPARK = [(rng.uniform(40, W - 40), rng.uniform(150, 1250), rng.uniform(0, 6), rng.uniform(10, 26)) for _ in range(34)]
BUTTERFLIES = [(rng.uniform(0, 30), rng.uniform(170, 330), rng.uniform(0, 6),
                [(255, 160, 40), (120, 170, 255), (255, 120, 190)][i % 3]) for i in range(5)]


def star(d, x, y, s, a, col=(255, 250, 210)):
    pts = []
    for j in range(8):
        r = s if j % 2 == 0 else s * 0.3
        ang = j * math.pi / 4
        pts.append((x + r * math.cos(ang), y + r * math.sin(ang)))
    d.polygon(pts, fill=col + (int(a),))
    d.ellipse([x - s * 0.25, y - s * 0.25, x + s * 0.25, y + s * 0.25], fill=(255, 255, 255, int(a)))


def draw_sparkles(d, t, b):
    chorus = 40 <= b < 72
    n = len(SPARK) if chorus else len(SPARK) // 2
    for i, (x, y, ph, s) in enumerate(SPARK[:n]):
        k = math.sin(t * 2.6 + ph)
        if k > 0.2:
            star(d, x + 10 * math.sin(t + ph), y - (t * 20 + ph * 50) % 120, s * k, 230 * k)


def draw_butterfly(d, x, y, t, col, s=1.0):
    flap = abs(math.sin(t * 14))
    for side in (-1, 1):
        wx = side * 34 * s * (0.35 + 0.65 * flap)
        d.ellipse([x + min(0, wx), y - 30 * s, x + max(0, wx), y + 4 * s], fill=col + (235,), outline=(60, 30, 20, 200))
        d.ellipse([x + min(0, wx * 0.8), y, x + max(0, wx * 0.8), y + 24 * s], fill=col + (220,),
                  outline=(60, 30, 20, 200))
    d.line([(x, y - 22 * s), (x, y + 22 * s)], fill=(60, 30, 20, 255), width=max(2, int(5 * s)))


def draw_butterflies(d, t):
    for (t0, y0, ph, col) in BUTTERFLIES:
        for k in range(3):
            s = t - (t0 + k * 14)
            if 0 <= s < 9:
                x = -60 + s * 140
                y = y0 + 50 * math.sin(s * 1.3 + ph) + k * 40
                draw_butterfly(d, x, y, t + ph, col, 1.6)


FADE = 0.3   # seconds of crossfade into each new shot


def shot_frame(k, b):
    a, i, z0, z1, f0, f1 = SHOTS[k]
    p = ease((b - a) / (SHOTS[k + 1][0] - a))       # one continuous eased move per shot
    return kenburns(img(i), lerp(z0, z1, p), (lerp(f0[0], f1[0], p), lerp(f0[1], f1[1], p)))


def shot_index(b):
    for k in range(len(SHOTS) - 1):
        if SHOTS[k][0] <= b < SHOTS[k + 1][0]:
            return k
    return 0


def kenburns(src, zoom, focus, extra=1.0):
    sw, sh = src.size
    z = zoom * extra
    cw, ch = sw / z, sw / z * H / W
    if ch > sh / z * (sh / (sw * H / W)):
        ch = sh / z
        cw = ch * W / H
    x0 = clamp(focus[0] * sw - cw / 2, 0, sw - cw)
    y0 = clamp(focus[1] * sh - ch / 2, 0, sh - ch)
    return src.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))


def end_card(t, b):
    src = img(9) if IMG[9] is not None else img(1)
    bg = kenburns(src, 1.05, (.5, .5)).filter(ImageFilter.GaussianBlur(18))
    bg = Image.blend(bg, Image.new("RGB", (W, H), (255, 240, 250)), 0.25)
    d = ImageDraw.Draw(bg, "RGBA")
    k = ease_out_back((b - 72) / 1.2)
    # framed picture
    pic = kenburns(src, 1.15, (.47, .42)).resize((620, 1102), Image.LANCZOS)
    pk = 0.6 + 0.4 * k
    pic = pic.resize((int(620 * pk), int(1102 * pk)), Image.LANCZOS)
    mask = Image.new("L", pic.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pic.size[0], pic.size[1]], 50, fill=255)
    px, py = W // 2 - pic.size[0] // 2, 470
    d.rounded_rectangle([px - 14, py - 14, px + pic.size[0] + 14, py + pic.size[1] + 14], 60, fill=(255, 255, 255, 255))
    bg.paste(pic, (px, py), mask)
    for i, (text, y, size, col) in enumerate([("Like & Subscribe!", 210, 104, (255, 255, 255)),
                                              ("for more songs!", 330, 58, (255, 236, 120))]):
        kk = ease_out_back((b - 72.4 - i * 0.6) / 0.8)
        if kk > 0.02:
            d.text((W / 2, y + 6 * math.sin(t * 3 + i)), text, font=font(max(8, int(size * kk))), fill=col,
                   anchor="mm", stroke_width=max(2, int(size * kk) // 10), stroke_fill=(220, 40, 110))
    # subscribe button
    kb = ease_out_back((b - 74) / 0.8)
    if kb > 0.02:
        bw, bh = 380 * kb, 110 * kb
        cy = 1690
        press = 0.94 if 76 <= b < 76.4 else 1.0
        d.rounded_rectangle([W / 2 - bw / 2 * press, cy - bh / 2 * press, W / 2 + bw / 2 * press, cy + bh / 2 * press],
                            int(55 * kb), fill=(230, 30, 40) if b < 76 else (120, 120, 130))
        d.text((W / 2, cy), "SUBSCRIBE" if b < 76 else "SUBSCRIBED!", font=font(max(8, int(50 * kb))),
               fill=(255, 255, 255), anchor="mm")
        # tapping finger
        if 75 <= b < 77:
            fx, fy = W / 2 + 120, cy + 70 - 30 * abs(math.sin((b - 75) * math.pi))
            d.ellipse([fx - 34, fy - 34, fx + 34, fy + 34], fill=(255, 220, 190, 240), outline=(120, 70, 50, 255), width=4)
    draw_sparkles(d, t, 50)
    return bg


def frame(t):
    b = t / BEAT
    if b >= 72:
        out = end_card(t, b)
        since = (b - 72) * BEAT
        if since < FADE:
            out = Image.blend(shot_frame(shot_index(71.99), 71.99), out, ease(since / FADE))
        return out
    k = shot_index(b)
    out = shot_frame(k, b)
    since = (b - SHOTS[k][0]) * BEAT
    if k > 0 and since < FADE:      # soft crossfade from the previous shot
        prev = shot_frame(k - 1, b)
        out = Image.blend(prev, out, ease(since / FADE))
    d = ImageDraw.Draw(out, "RGBA")
    draw_sparkles(d, t, b)
    draw_butterflies(d, t)
    if b < 7.5:  # title
        kk = ease_out_back((t - 0.2) / 0.6) * (1 - ease((b - 6.8) / 0.7))
        for i, (text, y, size, col) in enumerate([("Yum Yum", 210, 130, (255, 255, 255)),
                                                  ("Veggies!", 350, 150, (255, 160, 40))]):
            s = int(size * kk)
            if s > 8:
                d.text((W / 2, y + 8 * math.sin(t * 2 + i)), text, font=font(s), fill=col, anchor="mm",
                       stroke_width=max(2, s // 10), stroke_fill=(60, 140, 40))
    draw_caption(out, t)
    return out


if __name__ == "__main__":
    pv = [float(x) for x in sys.argv[1:]]
    os.makedirs("out/pv", exist_ok=True)
    if pv:
        for x in pv:
            frame(x).save(f"out/pv/veg_t{x:05.1f}.png")
    else:
        render_parallel(frame, DUR, "out/veggies-karaoke.wav", "out/yum-yum-veggies.mp4", workers=4, fps=60)
        print("done")
