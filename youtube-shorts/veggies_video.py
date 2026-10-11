"""'Yum Yum Veggies' video: AI-generated stills (assets/veggies/1-9.png) cut to the song with Ken Burns motion,
beat pulses, sparkles, butterflies, karaoke captions and a subscribe end card.

    python3 veggies_song_audio.py   # song -> out/veggies-song.wav + word timings
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


# (start beat, image, zoom from, zoom to, focus from, focus to)  focus = fraction of the picture
# Each sung line gets two 4-beat shots; images 6-9 fall back to close-ups of 1-5 until they exist.
def shots():
    have = lambda i: IMG[i] is not None
    s = [(0, 1, 1.0, 1.1, (.5, .5), (.45, .42)),
         (8, 2, 1.04, 1.12, (.5, .5), (.45, .45)), (12, 2, 1.3, 1.38, (.72, .45), (.7, .44)),
         (16, 3, 1.16, 1.06, (.5, .45), (.5, .45)), (20, 3, 1.35, 1.42, (.45, .5), (.48, .48)),
         (24, 4, 1.0, 1.1, (.5, .5), (.55, .45)), (28, 4, 1.35, 1.42, (.75, .45), (.75, .43)),
         (32, 5, 1.04, 1.12, (.5, .45), (.5, .38)), (36, 5, 1.35, 1.3, (.5, .8), (.5, .78))]
    if have(6):
        s += [(40, 6, 1.0, 1.08, (.5, .5), (.5, .45)), (44, 6, 1.25, 1.32, (.5, .7), (.5, .68))]
    else:
        s += [(40, 1, 1.35, 1.42, (.5, .73), (.5, .72)), (44, 5, 1.3, 1.38, (.5, .8), (.5, .79))]
    if have(7):
        s += [(48, 7, 1.04, 1.12, (.5, .5), (.5, .42)), (52, 7, 1.3, 1.36, (.5, .45), (.5, .44))]
    else:
        s += [(48, 2, 1.45, 1.5, (.78, .45), (.78, .44)), (52, 1, 1.15, 1.25, (.45, .4), (.42, .38))]
    if have(8):
        s += [(56, 8, 1.0, 1.1, (.5, .5), (.5, .45)), (60, 8, 1.28, 1.34, (.5, .55), (.5, .5))]
    else:
        s += [(56, 4, 1.45, 1.5, (.78, .48), (.78, .47)), (60, 3, 1.05, 1.15, (.5, .45), (.5, .42))]
    if have(9):
        s += [(64, 9, 1.0, 1.1, (.5, .5), (.5, .45)), (68, 9, 1.25, 1.32, (.5, .42), (.5, .4))]
    else:
        s += [(64, 5, 1.0, 1.1, (.5, .5), (.5, .42)), (68, 1, 1.0, 1.08, (.5, .5), (.48, .45))]
    s += [(72, 9 if have(9) else 1, 1.0, 1.05, (.5, .5), (.5, .5)), (999, 1, 1, 1, (.5, .5), (.5, .5))]
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
EVENTS = json.load(open("out/veggies-song-words.json"))
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


def frame_image(b):
    for (a, i, z0, z1, f0, f1), nxt in zip(SHOTS, SHOTS[1:]):
        if a <= b < nxt[0]:
            p = ease((b - a) / (nxt[0] - a))
            return img(i), lerp(z0, z1, p), (lerp(f0[0], f1[0], p), lerp(f0[1], f1[1], p)), b - a
    return img(1), 1.0, (.5, .5), 0


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
        return end_card(t, b)
    src, zoom, focus, since = frame_image(b)
    pulse = 1 + 0.012 * math.exp(-((b % 1) * BEAT) * 10)   # gentle beat bump
    punch = 1 + 0.05 * math.exp(-since * BEAT * 9)          # zoom punch on each cut
    out = kenburns(src, zoom, focus, pulse * punch)
    # brief white flash on line changes
    if since * BEAT < 0.08 and b > 1:
        out = Image.blend(out, Image.new("RGB", (W, H), (255, 255, 255)), 0.35 * (1 - since * BEAT / 0.08))
    d = ImageDraw.Draw(out, "RGBA")
    draw_sparkles(d, t, b)
    draw_butterflies(d, t)
    if b < 7.5:  # title
        k = ease_out_back((t - 0.2) / 0.6) * (1 - ease((b - 6.8) / 0.7))
        for i, (text, y, size, col) in enumerate([("Yum Yum", 210, 130, (255, 255, 255)),
                                                  ("Veggies!", 350, 150, (255, 160, 40))]):
            s = int(size * k)
            if s > 8:
                d.text((W / 2, y + 8 * math.sin(t * 4 + i)), text, font=font(s), fill=col, anchor="mm",
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
        render_parallel(frame, DUR, "out/veggies-song.wav", "out/yum-yum-veggies.mp4", workers=4)
        print("done")
