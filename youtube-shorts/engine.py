"""Tiny sing-along Shorts engine: synthesized music + karaoke lyrics + animated scene."""
import math, subprocess, wave, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SR = 1080, 1920, 30, 44100
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
_fonts = {}


def font(size):
    size = int(size)
    if size not in _fonts:
        _fonts[size] = ImageFont.truetype(FONT_PATH, size)
    return _fonts[size]


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ease_out_back(t):
    t = clamp(t)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def lerp_col(a, b, t):
    return tuple(int(lerp(x, y, clamp(t))) for x, y in zip(a, b))


def gradient(top, bottom):
    ys = np.linspace(0, 1, H)[:, None]
    col = np.array(top)[None, :] * (1 - ys) + np.array(bottom)[None, :] * ys
    arr = np.repeat(col[:, None, :], W, axis=1).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- song model
class Song:
    """lines: list of dicts {text, notes:[(midi, units)], unit (sec), offset (units), rest_before (sec)}"""

    def __init__(self, title, lines, key=60, window=2, intro=2.0, outro=2.6, sub=""):
        self.title, self.sub, self.lines, self.key, self.window = title, sub, lines, key, window
        self.intro, self.outro = intro, outro
        self.events, self.line_spans, self.windows = [], [], []
        t = intro
        for li, ln in enumerate(lines):
            t += ln.get("rest_before", 0.0)
            syls = parse_syllables(ln["text"])
            assert len(syls) == len(ln["notes"]), (ln["text"], len(syls), len(ln["notes"]))
            start = t
            for si, (syl, (m, u)) in enumerate(zip(syls, ln["notes"])):
                d = u * ln["unit"]
                self.events.append(dict(t=t, d=d, midi=m, syl=syl, line=li, idx=si))
                t += d
            self.line_spans.append((start, t))
            # chord windows
            off = ln.get("offset", 0) * ln["unit"]
            if off > 0:
                self.windows.append((start, start + off))
            w0 = start + off
            while w0 < t - 1e-6:
                w1 = min(t, w0 + window * ln["unit"])
                self.windows.append((w0, w1))
                w0 = w1
        self.sing_end = t
        self.duration = t + outro
        self.line_syls = [parse_syllables(l["text"]) for l in lines]

    def chord_for(self, w0, w1, last=False):
        k = self.key
        chords = [(0, 4, 7), (5, 9, 0), (7, 11, 2)]  # I IV V
        if last:
            return chords[0]
        score = [0.0, 0.0, 0.0]
        for e in self.events:
            ov = min(w1, e["t"] + e["d"]) - max(w0, e["t"])
            if ov > 0:
                pc = (e["midi"] - k) % 12
                for i, c in enumerate(chords):
                    if pc in c:
                        score[i] += ov
        best = max(range(3), key=lambda i: (score[i], -i))
        return chords[best]

    # state helpers for scenes
    def state(self, t):
        cur = None
        for e in self.events:
            if e["t"] <= t:
                cur = e
            else:
                break
        line = 0
        for i, (a, b) in enumerate(self.line_spans):
            if t >= a - 0.25:
                line = i
        a, b = self.line_spans[line]
        lp = clamp((t - a) / (b - a))
        since = t - cur["t"] if cur else 99.0
        phase = "intro" if t < self.intro else ("outro" if t >= self.sing_end else "sing")
        return dict(t=t, cur=cur, line=line, lp=lp, since=since, phase=phase,
                    pulse=math.exp(-since * 7) if cur and phase == "sing" else 0.0)


def parse_syllables(text):
    out = []
    words = text.split(" ")
    for wi, w in enumerate(words):
        parts = w.split("-")
        for pi, p in enumerate(parts):
            s = p + (" " if pi == len(parts) - 1 and wi < len(words) - 1 else "")
            out.append(s)
    return out


# ---------------------------------------------------------------- audio
def _env(n, a, rel_from, decay):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-t * decay)
    if rel_from is not None and rel_from < n:
        r = np.arange(n - rel_from) / SR
        e[rel_from:] *= np.exp(-r * 18)
    return e


def add(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def tone(f, dur, kind="mallet", vol=0.3):
    tail = 0.35
    n = int((dur + tail) * SR)
    t = np.arange(n) / SR
    if kind == "mallet":
        s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 6) \
            + 0.15 * np.sin(2 * np.pi * 4.01 * f * t) * np.exp(-t * 12)
        s *= _env(n, 0.004, int(dur * SR), 2.2)
    elif kind == "flute":
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.3)
        ph = 2 * np.pi * f * np.cumsum(vib) / SR
        s = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
        s *= _env(n, 0.03, int(dur * SR), 0.4)
    elif kind == "pad":
        s = sum(np.sin(2 * np.pi * f * d * t) for d in (0.997, 1.0, 1.003)) / 3
        s *= np.minimum(1, t / 0.12) * np.exp(-t * 0.8)
        s[int(dur * SR):] *= np.exp(-np.arange(n - int(dur * SR)) / SR * 10)
    elif kind == "bass":
        s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
        s *= _env(n, 0.006, int(dur * SR), 2.5)
    elif kind == "bell":
        s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 4) \
            + 0.25 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t * 8)
        s *= _env(n, 0.002, None, 2.5)
    return s * vol


def kick(vol=0.5):
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22) * vol


def shaker(vol=0.07, rng=np.random.default_rng(1)):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = np.diff(noise, prepend=0)  # crude high-pass
    return noise * np.exp(-t * 70) * vol


def render_audio(song, path, extra=None):
    buf = np.zeros(int((song.duration + 0.5) * SR))
    k = song.key
    # intro: arpeggio of I chord + shaker
    arp = [k + 12, k + 16, k + 19, k + 24]
    step = song.intro / (len(arp) + 1)
    for i, m in enumerate(arp):
        add(buf, 0.15 + i * step, tone(midi_hz(m), step, "bell", 0.18))
    # melody
    for e in song.events:
        f = midi_hz(e["midi"])
        add(buf, e["t"], tone(f, e["d"] * 0.95, "mallet", 0.22))
        add(buf, e["t"], tone(f, e["d"] * 0.95, "flute", 0.16))
    # harmony per window
    for wi, (w0, w1) in enumerate(song.windows):
        ch = song.chord_for(w0, w1, last=(wi == len(song.windows) - 1))
        root = ch[0]
        add(buf, w0, tone(midi_hz(k - 24 + root), (w1 - w0) * 0.9, "bass", 0.32))
        for pc in ch:
            m = k + pc if pc >= 5 else k + 12 + pc
            add(buf, w0, tone(midi_hz(m - 12), w1 - w0, "pad", 0.05))
        add(buf, w0, kick(0.45 if wi % 2 == 0 else 0.3))
    # shaker on a steady grid through sung part
    for ln, (a, b) in zip(song.lines, song.line_spans):
        u = ln["unit"] * (0.5 if ln["unit"] > 0.4 else 1.0)
        t = a
        i = 0
        while t < b - 1e-6:
            add(buf, t, shaker(0.08 if i % 2 == 0 else 0.05))
            t += u
            i += 1
    # outro ta-da
    o = song.sing_end + 0.1
    for i, m in enumerate([k + 12, k + 16, k + 19, k + 24, k + 28]):
        add(buf, o + i * 0.07, tone(midi_hz(m), 1.6, "bell", 0.14))
    for i in range(10):
        add(buf, o + 0.5 + i * 0.05, tone(midi_hz(k + 24 + [0, 2, 4, 7, 9][i % 5] + 12 * (i // 5)), 0.3, "bell", 0.05))
    add(buf, o, kick(0.5))
    if extra:
        extra(buf, add, tone, midi_hz)
    # gentle limiter + fade
    buf = np.tanh(buf * 1.4) / np.tanh(1.4)
    buf /= max(1e-6, np.max(np.abs(buf))) / 0.89
    fade = int(0.4 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- text / karaoke
def outlined(draw, xy, text, size, fill, stroke=(40, 20, 60), sw=None, anchor="mm"):
    draw.text(xy, text, font=font(size), fill=fill, stroke_width=sw or max(3, size // 12),
              stroke_fill=stroke, anchor=anchor)


def layout_line(draw, syls, size, maxw):
    f = font(size)
    widths = [draw.textlength(s, font=f) for s in syls]
    # words
    words, cur = [], []
    for i, s in enumerate(syls):
        cur.append(i)
        if s.endswith(" ") or i == len(syls) - 1:
            words.append(cur)
            cur = []
    total = sum(widths)
    rows = [list(range(len(syls)))]
    if total > maxw:
        best = None
        for k in range(1, len(words)):
            r1 = [i for w in words[:k] for i in w]
            r2 = [i for w in words[k:] for i in w]
            m = max(sum(widths[i] for i in r1), sum(widths[i] for i in r2))
            if best is None or m < best[0]:
                best = (m, [r1, r2])
        rows = best[1]
    return widths, rows


def draw_karaoke(img, draw, song, st, cy=1330, maxw=860):
    t = st["t"]
    li = st["line"]
    syls = song.line_syls[li]
    evs = [e for e in song.events if e["line"] == li]
    size = 84
    widths, rows = layout_line(draw, syls, size, maxw)
    while max(sum(widths[i] for i in r) for r in rows) > maxw and size > 56:
        size -= 4
        widths, rows = layout_line(draw, syls, size, maxw)
    rowh = size * 1.35
    nrows = len(rows)
    panel_h = nrows * rowh + 70
    # panel
    x0, x1 = W / 2 - maxw / 2 - 40, W / 2 + maxw / 2 + 40
    y0, y1 = cy - panel_h / 2, cy + panel_h / 2
    draw.rounded_rectangle([x0 + 6, y0 + 10, x1 + 6, y1 + 10], 48, fill=(0, 0, 0, 70))
    draw.rounded_rectangle([x0, y0, x1, y1], 48, fill=(255, 255, 255, 235), outline=(255, 255, 255), width=4)
    # positions
    pos = {}
    for r, row in enumerate(rows):
        rw = sum(widths[i] for i in row)
        x = W / 2 - rw / 2
        y = y0 + 35 + rowh * r + rowh / 2
        for i in row:
            pos[i] = (x, y, widths[i])
            x += widths[i]
    f = font(size)
    for i, s in enumerate(syls):
        x, y, w = pos[i]
        sung = t >= evs[i]["t"] - 0.02
        active = sung and t < evs[i]["t"] + evs[i]["d"]
        col = (255, 112, 67) if sung else (90, 80, 120)
        if active:
            p = clamp((t - evs[i]["t"]) / 0.12)
            dy = -10 * math.sin(p * math.pi)
            draw.text((x, y + dy), s, font=f, fill=(255, 64, 129), anchor="lm",
                      stroke_width=2, stroke_fill=(255, 64, 129))
        else:
            draw.text((x, y), s, font=f, fill=col, anchor="lm")
    # bouncing ball
    def ctr(i):
        x, y, w = pos[i]
        return x + draw.textlength(syls[i].rstrip(), font=f) / 2, y - size * 0.72

    if t < evs[0]["t"]:
        bx, by = ctr(0)
        by -= 60 * abs(math.sin((t - evs[0]["t"]) * 5))
    else:
        i = max(k for k, e in enumerate(evs) if e["t"] <= t)
        e = evs[i]
        p = clamp((t - e["t"]) / e["d"])
        ax, ay = ctr(i)
        if i + 1 < len(evs):
            bx2, by2 = ctr(i + 1)
        else:
            bx2, by2 = ax, ay
        bx = lerp(ax, bx2, p)
        by = lerp(ay, by2, p) - 4 * p * (1 - p) * min(90, 40 + e["d"] * 60)
    r = 17
    draw.ellipse([bx - r + 3, by - r + 5, bx + r + 3, by + r + 5], fill=(0, 0, 0, 50))
    draw.ellipse([bx - r, by - r, bx + r, by + r], fill=(255, 202, 40), outline=(230, 120, 0), width=4)
    draw.ellipse([bx - 7, by - 9, bx - 1, by - 3], fill=(255, 255, 220))
    # next line preview
    if li + 1 < len(song.lines) and st["phase"] == "sing":
        nxt = song.lines[li + 1]["text"].replace("-", "")
        ns = 44
        while draw.textlength(nxt, font=font(ns)) > 880 and ns > 26:
            ns -= 2
        draw.text((W / 2, y1 + 50), nxt, font=font(ns), fill=(255, 255, 255, 230), anchor="mm",
                  stroke_width=4, stroke_fill=(0, 0, 0, 90))


def draw_title(draw, song, t, color=(255, 214, 0), stroke=(120, 40, 140)):
    p = ease_out_back(t / 0.6)
    size = int(lerp(20, 92, p)) if t < 0.6 else 92
    wob = math.sin(t * 3) * 6
    outlined(draw, (W / 2, 205 + wob), song.title, size, color, stroke, sw=10)
    if song.sub:
        outlined(draw, (W / 2, 300 + wob), song.sub, 46, (255, 255, 255), stroke, sw=6)


def draw_outro(draw, song, st):
    if st["phase"] != "outro":
        return
    p = ease_out_back((st["t"] - song.sing_end) / 0.5)
    s = int(lerp(10, 78, p))
    cy = 1330
    w = 400 * p
    draw.rounded_rectangle([W / 2 - w, cy - 85 * p, W / 2 + w, cy + 85 * p], 60, fill=(255, 64, 129),
                           outline=(255, 255, 255), width=8)
    draw.text((W / 2, cy), "Sing it again!", font=font(s), fill=(255, 255, 255), anchor="mm")


# ---------------------------------------------------------------- render
def render(song, scene, out_path, audio_extra=None, preview_times=None):
    wav = out_path.replace(".mp4", ".wav")
    render_audio(song, wav, audio_extra)
    if preview_times:
        for pt in preview_times:
            img = frame(song, scene, pt)
            img.save(out_path.replace(".mp4", f"_t{pt:05.1f}.png"))
        return
    n = int(song.duration * FPS)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "19",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
           out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n):
        proc.stdin.write(frame(song, scene, i / FPS).tobytes())
    proc.stdin.close()
    proc.wait()
    os.remove(wav)


def frame(song, scene, t):
    st = song.state(t)
    img = scene(t, st)
    draw = ImageDraw.Draw(img, "RGBA")
    if st["phase"] == "outro":
        draw_outro(draw, song, st)
    else:
        draw_karaoke(img, draw, song, st)
    return img
