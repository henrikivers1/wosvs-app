"""Reusable 'Baby Sunny' story Short: AI stills + instrumental sing-along on a strict beat grid.

An episode is a small spec (see sunny_sneeze.py): tempo, lyric lines with melody, chords, one shot per line,
sound effects. Everything (melody, band, captions, cuts) is placed on the same beat grid, so it is on beat by
construction; `check_timing()` measures it in the rendered audio anyway.
"""
import json, math, os, statistics
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from studio import *
from toon3d import W, H, render_parallel
from sing import parse_syllables

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


class Episode:
    """spec keys: name, bpm, total_beats, lines[{start,text,notes}], chords[(beat,name)], shots[(beat,img,z0,z1,f0,f1)],
    sfx[(beat, kind)], title (two strings), end_image, end_beat, assets dir."""

    def __init__(self, spec):
        self.s = spec
        self.beat = 60 / spec["bpm"]
        self.dur = spec["total_beats"] * self.beat + 0.6
        self.imgs = {}
        self.out = f"out/{spec['name']}"

    # ------------------------------------------------------------ music
    def chord_at(self, b):
        c = self.s["chords"][0][1]
        for cb, name in self.s["chords"]:
            if cb <= b:
                c = name
        return c

    def syllables(self):
        out = []
        for ln in self.s["lines"]:
            b, k = ln["start"], 0
            for word, nsyl in parse_syllables(ln["text"]):
                for _ in range(nsyl):
                    while ln["notes"][k][0] is None:
                        b += ln["notes"][k][1]
                        k += 1
                    m, d = ln["notes"][k]
                    out.append(dict(t=b * self.beat, d=d * self.beat, word=word, midi=m))
                    b += d
                    k += 1
        return out

    def build_audio(self):
        B, s = self.beat, self.s
        T = Track(self.dur)
        end = s["end_beat"]
        bars = s["total_beats"] // 4
        pattern = [(0, 1.0, 1), (1, 0.8, 1), (1.5, 0.55, -1), (2.5, 0.6, -1), (3, 0.85, 1), (3.5, 0.55, -1)]
        for bar in range(bars):
            for off, vel, direction in pattern:
                b = bar * 4 + off
                if b >= end - 0.01:
                    continue
                notes = chord_notes(self.chord_at(b), 4)
                notes = sorted(set([n if n >= 60 else n + 12 for n in notes] + [notes[0] + 12]))
                for k, m in enumerate(notes if direction > 0 else notes[::-1]):
                    T.add(b * B + k * 0.011, pluck(hz(m), 1.1, 0.65, 0.994), pan=-0.35 + 0.1 * k, gain=0.085 * vel)
        for k, m in enumerate(sorted(chord_notes("D", 4) + [74, 78])):
            T.add(end * B + k * 0.03, pluck(hz(m), 3.0, 0.7, 0.998), pan=-0.3 + 0.15 * k, gain=0.14)
        for bar in range(1, end // 4):
            for off, length, deg in [(0, 1.4, 0), (1.5, 0.5, 0), (2, 1.0, 7), (3.5, 0.5, 12)]:
                b = bar * 4 + off
                T.add(b * B, bass(hz(chord_notes(self.chord_at(b), 2)[0] + deg), length * B, 0.42))
            for beat in range(4):
                b = bar * 4 + beat
                if beat in (0, 2):
                    T.add(b * B, kick(0.75))
                if beat in (1, 3) and bar >= 2:
                    T.add(b * B, clap(0.3), pan=0.05)
                T.add(b * B, shaker(0.07), pan=0.4)
                T.add((b + 0.5) * B, shaker(0.05), pan=0.4)
        T.add(end * B, kick(0.8))
        T.add(end * B, sparkle(0.14), pan=0.2)
        for b, kind in s.get("sfx", []):
            T.add(b * B, SFX[kind](), pan=0.1)
        M = Track(self.dur)
        for e in self.syllables():
            M.add(e["t"], melody_note(hz(e["midi"]), e["d"]), gain=0.3)
            M.add(e["t"], glock(hz(e["midi"] + 12), 0.04), pan=0.3)
        ir = reverb_ir(1.4)
        mix = M.buf + convolve_stereo(M.buf, ir) * 0.12 + T.buf * 0.55 + convolve_stereo(T.buf, ir) * 0.03
        os.makedirs("out", exist_ok=True)
        write_wav(self.out + ".wav", master(mix[: int(self.dur * SR)]))
        return self.out + ".wav"

    def check_timing(self):
        """Onset of every melody note in the rendered mix vs the grid (ms)."""
        import soundfile as sf
        x, sr = sf.read(self.out + ".wav")
        x = x.mean(axis=1)
        hop, win = 220, 1024
        fr = np.lib.stride_tricks.sliding_window_view(x, win)[::hop] * np.hanning(win)
        S = np.abs(np.fft.rfft(fr, axis=1))
        f = np.fft.rfftfreq(win, 1 / sr)
        flux = np.maximum(0, np.diff(np.log1p(S[:, (f > 250) & (f < 1200)]), axis=0)).sum(axis=1)
        ft = (np.arange(len(flux)) + 1) * hop / sr + win / 2 / sr
        errs = []
        for e in self.syllables():
            m = (ft > e["t"] - 0.06) & (ft < e["t"] + 0.06)
            errs.append(ft[m][np.argmax(flux[m])] - e["t"])
        errs = np.abs(np.array(errs)) * 1000
        return len(errs), float(np.median(errs)), float(errs.max())

    # ------------------------------------------------------------ video
    def img(self, i):
        if i not in self.imgs:
            self.imgs[i] = Image.open(f"{self.s['assets']}/{i}.png").convert("RGB")
        return self.imgs[i]

    @staticmethod
    def kenburns(src, zoom, focus):
        sw, sh = src.size
        ch = min(sh, sw * H / W) / zoom
        cw = ch * W / H
        x0 = clamp(focus[0] * sw - cw / 2, 0, sw - cw)
        y0 = clamp(focus[1] * sh - ch / 2, 0, sh - ch)
        return src.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))

    def shot_index(self, b):
        sh = self.s["shots"]
        for k in range(len(sh) - 1):
            if sh[k][0] <= b < sh[k + 1][0]:
                return k
        return len(sh) - 1

    def shot_frame(self, k, b):
        sh = self.s["shots"]
        a, i, z0, z1, f0, f1 = sh[k]
        nxt = sh[k + 1][0] if k + 1 < len(sh) else self.s["end_beat"]
        p = ease((b - a) / (nxt - a))
        return self.kenburns(self.img(i), lerp(z0, z1, p), (lerp(f0[0], f1[0], p), lerp(f0[1], f1[1], p)))

    def caption(self, img, t):
        lines = []
        syl = self.syllables()
        k = 0
        for ln in self.s["lines"]:
            words = []
            for word, nsyl in parse_syllables(ln["text"]):
                ev = syl[k:k + nsyl]
                k += nsyl
                words.append(dict(text=word, t0=ev[0]["t"], t1=ev[-1]["t"] + ev[-1]["d"]))
            lines.append(dict(t0=ln["start"] * self.beat, t1=(ln["start"] + 8) * self.beat, words=words))
        line = next((l for l in lines if l["t0"] - 0.25 <= t < l["t1"] - 0.05), None)
        if not line:
            return
        d = ImageDraw.Draw(img, "RGBA")
        f = font(66)
        space = d.textlength(" ", font=f)
        widths = [d.textlength(w["text"], font=f) for w in line["words"]]
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
                    kk = ease_out_back((t - w["t0"] + 0.03) / 0.15)
                    d.rounded_rectangle([x - 14, y - 44 - 6 * kk, x + widths[i] + 14, y + 44 + 6 * kk], 22,
                                        fill=(255, 64, 129, 235))
                col = (255, 255, 255) if (active or not sung) else (255, 236, 120)
                dy = -8 * math.sin(clamp((t - w["t0"]) / 0.2) * math.pi) if active else 0
                d.text((x, y + dy + (1 - pop) * 40), w["text"], font=f, fill=col, anchor="lm",
                       stroke_width=6, stroke_fill=(70, 30, 90))
                x += widths[i] + space
            y += 96

    def sparkles(self, d, t, n=16):
        rng = np.random.default_rng(12)
        for i in range(n):
            x, y, ph, s = rng.uniform(40, W - 40), rng.uniform(150, 1250), rng.uniform(0, 6), rng.uniform(10, 24)
            k = math.sin(t * 2.6 + ph)
            if k > 0.2:
                s *= k
                yy = y - (t * 20 + ph * 50) % 120
                pts = [(x + (s if j % 2 == 0 else s * 0.3) * math.cos(j * math.pi / 4),
                        yy + (s if j % 2 == 0 else s * 0.3) * math.sin(j * math.pi / 4)) for j in range(8)]
                d.polygon(pts, fill=(255, 250, 210, int(230 * k)))

    def end_card(self, t, b):
        src = self.img(self.s["end_image"])
        bg = self.kenburns(src, 1.05, (.5, .5)).filter(ImageFilter.GaussianBlur(18))
        bg = Image.blend(bg, Image.new("RGB", (W, H), (255, 240, 250)), 0.25)
        d = ImageDraw.Draw(bg, "RGBA")
        e = self.s["end_beat"]
        k = 0.6 + 0.4 * ease_out_back((b - e) / 1.2)
        pic = self.kenburns(src, 1.1, (.5, .45)).resize((int(620 * k), int(1102 * k)), Image.LANCZOS)
        mask = Image.new("L", pic.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, pic.size[0], pic.size[1]], 50, fill=255)
        px, py = W // 2 - pic.size[0] // 2, 470
        d.rounded_rectangle([px - 14, py - 14, px + pic.size[0] + 14, py + pic.size[1] + 14], 60, fill=(255, 255, 255))
        bg.paste(pic, (px, py), mask)
        for i, (text, y, size, col) in enumerate([("Like & Subscribe!", 210, 104, (255, 255, 255)),
                                                  ("for more Sunny!", 330, 58, (255, 236, 120))]):
            kk = ease_out_back((b - e - 0.4 - i * 0.6) / 0.8)
            if kk > 0.02:
                d.text((W / 2, y + 6 * math.sin(t * 3 + i)), text, font=font(max(8, int(size * kk))), fill=col,
                       anchor="mm", stroke_width=max(2, int(size * kk) // 10), stroke_fill=(220, 40, 110))
        kb = ease_out_back((b - e - 2) / 0.8)
        if kb > 0.02:
            done = b >= e + 4
            bw, bh = 380 * kb, 110 * kb
            d.rounded_rectangle([W / 2 - bw / 2, 1690 - bh / 2, W / 2 + bw / 2, 1690 + bh / 2], int(55 * kb),
                                fill=(120, 120, 130) if done else (230, 30, 40))
            d.text((W / 2, 1690), "SUBSCRIBED!" if done else "SUBSCRIBE", font=font(max(8, int(50 * kb))),
                   fill=(255, 255, 255), anchor="mm")
        self.sparkles(d, t)
        return bg

    def frame(self, t):
        b = t / self.beat
        e = self.s["end_beat"]
        FADE = 0.3
        if b >= e:
            out = self.end_card(t, b)
            since = (b - e) * self.beat
            if since < FADE:
                last = len(self.s["shots"]) - 1
                out = Image.blend(self.shot_frame(last, e - 0.001), out, ease(since / FADE))
            return out
        k = self.shot_index(b)
        out = self.shot_frame(k, b)
        since = (b - self.s["shots"][k][0]) * self.beat
        if k > 0 and since < FADE:
            out = Image.blend(self.shot_frame(k - 1, b), out, ease(since / FADE))
        d = ImageDraw.Draw(out, "RGBA")
        self.sparkles(d, t)
        t1, t2 = self.s["title"]
        intro = self.s["lines"][0]["start"]
        if b < intro + 0.5:
            kk = ease_out_back((t - 0.15) / 0.6) * (1 - ease((b - intro + 0.5) / 0.5))
            for i, (text, y, size, col) in enumerate([(t1, 220, 120, (255, 255, 255)), (t2, 350, 140, (255, 200, 60))]):
                s = int(size * kk)
                if s > 8:
                    d.text((W / 2, y + 8 * math.sin(t * 2 + i)), text, font=font(s), fill=col, anchor="mm",
                           stroke_width=max(2, s // 10), stroke_fill=(220, 40, 110))
        self.caption(out, t)
        return out

    def render(self, fps=60):
        render_parallel(self.frame, self.dur, self.out + ".wav", self.out + ".mp4", workers=4, fps=fps)
        return self.out + ".mp4"


def melody_note(f, dur):
    n = int((dur + 0.4) * SR)
    t = np.arange(n) / SR
    piano = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (3 + 2.5 * k)) for k, a in
                [(1, 1.0), (2, 0.45), (3, 0.2), (4, 0.1)]) * np.minimum(1, t / 0.003)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.35)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    flute = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    env = np.minimum(1, t / 0.04) * np.clip((dur * 0.92 + 0.12 - t) / 0.12, 0, 1)
    return piano * 0.5 + flute * env * 0.42


def _whoosh():
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    nz = np.random.default_rng(3).standard_normal(n)
    nz = nz - np.convolve(nz, np.ones(30) / 30, mode="same")
    return nz * np.sin(np.pi * t / 0.6) ** 2 * 0.25


def _slide_up():
    t = np.arange(int(0.5 * SR)) / SR
    f = 500 * (4 ** (t / 0.5))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.02) * np.minimum(1, (0.5 - t) / 0.05) * 0.18


def _trill():
    out = np.zeros(int(0.8 * SR))
    for i in range(8):
        g = glock(hz(86 + (i % 2) * 2), 0.06, 0.4)
        k = int(i * 0.06 * SR)
        out[k:k + len(g)] += g[: len(out) - k]
    return out


SFX = {"whoosh": _whoosh, "slide_up": _slide_up, "trill": _trill, "pop": lambda: bubble_pop(0.25),
       "splash": lambda: splash(0.2), "boing": lambda: squeak(0.15, 900, 0.3), "sparkle": lambda: sparkle(0.12)}
