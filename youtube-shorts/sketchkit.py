"""Wordless slapstick sketch toolkit: keyframes, sprites, camera, cartoon SFX and gibberish voices."""
import math, os, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw
from engine import W, H, FPS, SR, font, lerp, clamp, ease, ease_out_back, lerp_col, gradient, midi_hz, add, \
    tone, kick, shaker, outlined

INK = (50, 30, 50)


# ---------------------------------------------------------------- timing
def seg(t, a, b):
    return clamp((t - a) / (b - a))


def linear(p):
    return clamp(p)


def kf(t, keys, fn=ease):
    """Piecewise interpolation over [(time, value), ...]; values may be numbers or tuples."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t < t1:
            p = fn((t - t0) / (t1 - t0)) if t1 > t0 else 1.0
            if isinstance(v0, tuple):
                return tuple(lerp(a, b, p) for a, b in zip(v0, v1))
            return lerp(v0, v1, p)
    return keys[-1][1]


def wobble(since, amt=0.3, freq=16, decay=6):
    """Squash & stretch after an impact: returns (sx, sy)."""
    if since < 0:
        return 1.0, 1.0
    s = amt * math.exp(-since * decay) * math.cos(freq * since)
    return 1 + s, 1 - s


def arc(t, t0, t1, x0, y0, x1, y1, height):
    """Ballistic hop from (x0,y0) to (x1,y1) peaking `height` px above the higher end."""
    p = clamp((t - t0) / (t1 - t0))
    return lerp(x0, x1, p), lerp(y0, y1, p) - 4 * height * p * (1 - p)


# ---------------------------------------------------------------- sprites & camera
def canvas(size=(900, 900)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def place(base, spr, x, y, pivot, sx=1.0, sy=1.0, rot=0.0):
    """Scale sprite by (sx,sy), rotate `rot` degrees (clockwise) about `pivot` and put the pivot at (x,y).
    `base` is an RGB frame (draw on it with ImageDraw mode "RGBA" so translucent fills blend)."""
    w, h = spr.size
    if sx != 1 or sy != 1:
        nw, nh = max(1, int(w * sx)), max(1, int(h * sy))
        spr = spr.resize((nw, nh), Image.BICUBIC)
        pivot = (pivot[0] * sx, pivot[1] * sy)
    if rot:
        spr = spr.rotate(-rot, Image.BICUBIC, center=pivot)
    base.paste(spr, (int(x - pivot[0]), int(y - pivot[1])), spr)


def camera(img, t, shakes=(), zoom=1.0, focus=(W / 2, H / 2)):
    """shakes: [(time, strength_px)]; returns RGB frame with shake, impact punch-in and a zoom about `focus`."""
    dx = dy = 0.0
    z = zoom
    for (ts, amp) in shakes:
        s = t - ts
        if 0 <= s < 0.8:
            k = amp * math.exp(-s * 8)
            dx += k * math.sin(s * 71)
            dy += k * math.cos(s * 53)
            z += 0.05 * math.exp(-s * 6)
    if z == 1.0 and not dx and not dy:
        return img.convert("RGB")
    cw, ch = W / z, H / z
    x0 = clamp(focus[0] - cw / 2, 0, W - cw) + dx
    y0 = clamp(focus[1] - ch / 2, 0, H - ch) + dy
    return img.convert("RGB").transform((W, H), Image.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.BICUBIC)


# ---------------------------------------------------------------- drawing helpers
def star_pts(cx, cy, R, r, rot=0.0):
    return [(cx + (R if i % 2 == 0 else r) * math.sin(i * math.pi / 5 + rot),
             cy - (R if i % 2 == 0 else r) * math.cos(i * math.pi / 5 + rot)) for i in range(10)]


def dizzy_stars(d, cx, cy, t, rx=110, ry=30, n=4):
    for i in range(n):
        a = t * 6 + i * 2 * math.pi / n
        x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
        d.polygon(star_pts(x, y, 24, 10, a), fill=(255, 220, 40), outline=(200, 120, 0))


def bubble(d, x, y, sym, p, size=110, fill=(255, 255, 255), col=(255, 64, 129), tail=-1):
    """Pop-in speech bubble with a symbol ('?', '!', '♥', '♪', 'zzz', 'bulb'). p: 0..1 appear progress."""
    if p <= 0:
        return
    s = ease_out_back(p) * size
    if s < 4:
        return
    tx = x + tail * s * 0.4
    d.polygon([(tx - s * 0.18, y + s * 0.5), (tx + s * 0.18, y + s * 0.5), (tx + tail * s * 0.5, y + s * 1.05)],
              fill=fill, outline=INK)
    d.rounded_rectangle([x - s, y - s * 0.75, x + s, y + s * 0.75], int(s * 0.5), fill=fill, outline=INK, width=6)
    d.polygon([(tx - s * 0.18 + 3, y + s * 0.5 - 8), (tx + s * 0.18 - 3, y + s * 0.5 - 8),
               (tx + tail * s * 0.45, y + s * 0.98)], fill=fill)
    if sym == "bulb":
        r = s * 0.38
        d.ellipse([x - r, y - r * 1.4, x + r, y + r * 0.6], fill=(255, 230, 60), outline=INK, width=5)
        d.rectangle([x - r * 0.45, y + r * 0.5, x + r * 0.45, y + r * 0.95], fill=(170, 170, 190), outline=INK, width=4)
        for i in range(5):
            a = -math.pi / 2 + (i - 2) * 0.55
            d.line([(x + r * 1.25 * math.cos(a), y - r * 0.4 + r * 1.25 * math.sin(a)),
                    (x + r * 1.7 * math.cos(a), y - r * 0.4 + r * 1.7 * math.sin(a))], fill=(255, 180, 0), width=6)
        return
    fs = int(s * (0.6 if len(sym) > 2 else 1.0))
    d.text((x, y + s * 0.04), sym, font=font(max(8, fs)), fill=col, anchor="mm")


def music_notes(d, x, y, t, t0, t1, col=(255, 255, 255)):
    for i in range(4):
        st = t0 + i * 0.55
        if not (st <= t < min(t1, st + 1.6)):
            continue
        p = (t - st) / 1.6
        nx = x + 40 * math.sin(p * 6 + i) + i * 25
        ny = y - p * 220
        a = int(255 * (1 - p))
        d.text((nx, ny), "♪" if i % 2 else "♫", font=font(64), fill=col + (a,), anchor="mm",
               stroke_width=4, stroke_fill=INK + (a,))


def confetti(d, t, t0, n=70, seed=5):
    if t < t0:
        return
    rng = np.random.default_rng(seed)
    cols = [(255, 64, 129), (255, 214, 0), (80, 200, 255), (120, 220, 100), (180, 120, 255)]
    for i in range(n):
        x0 = rng.uniform(0, W)
        vy = rng.uniform(260, 520)
        vx = rng.uniform(-80, 80)
        s = t - t0 - rng.uniform(0, 0.4)
        if s < 0:
            continue
        x = x0 + vx * s + 30 * math.sin(s * 4 + i)
        y = -40 + vy * s
        if y > H:
            continue
        a = s * 6 + i
        w, h = 14, 26 * abs(math.cos(a))
        d.rectangle([x - w / 2, y - h / 2, x + w / 2, y + h / 2], fill=cols[i % len(cols)])


def title(d, text, t, color=(255, 214, 0), stroke=(120, 40, 140), sub=None, y=200):
    p = ease_out_back(t / 0.6)
    size = int(lerp(20, 86, p)) if t < 0.6 else 86
    wob = math.sin(t * 3) * 6
    outlined(d, (W / 2, y + wob), text, size, color, stroke, sw=10)
    if sub:
        outlined(d, (W / 2, y + 88 + wob), sub, 42, (255, 255, 255), stroke, sw=6)


# ---------------------------------------------------------------- audio: SFX
_rng = np.random.default_rng(11)


def _t(d):
    return np.arange(int(d * SR)) / SR


def _noise(n):
    return _rng.standard_normal(n)


def lowpass(x, k):
    k = max(1, int(k))
    return np.convolve(x, np.ones(k) / k, mode="same")


def highpass(x, k):
    return x - lowpass(x, k)


def _osc(freq):
    return 2 * np.pi * np.cumsum(freq) / SR


def boing(f=150, d=0.6, vol=0.4):
    t = _t(d)
    fr = f * (1 + 0.9 * t / d) * (1 + 0.3 * np.exp(-t * 4) * np.sin(2 * np.pi * 15 * t))
    ph = _osc(fr)
    s = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
    return s * np.minimum(1, t / 0.004) * np.exp(-t * 3.5) * vol


def slide(f0, f1, d, vol=0.25, vib=True):
    t = _t(d)
    fr = f0 * (f1 / f0) ** (t / d)
    if vib:
        fr = fr * (1 + 0.012 * np.sin(2 * np.pi * 6 * t))
    ph = _osc(fr)
    s = np.sin(ph) + 0.08 * np.sin(2 * ph)
    env = np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.06)
    s = s * env + 0.04 * highpass(_noise(len(t)), 3) * env
    return s * vol


def wobble_whistle(f, d, rate=7, depth=0.18, vol=0.22):
    t = _t(d)
    fr = f * (1 + depth * np.sin(2 * np.pi * rate * t))
    env = np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.06)
    return np.sin(_osc(fr)) * env * vol


def pop(vol=0.45):
    t = _t(0.09)
    fr = 250 + 1500 * np.exp(-t * 45)
    return np.sin(_osc(fr)) * np.exp(-t * 30) * vol


def plink(f=1800, vol=0.2):
    t = _t(0.2)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2.7 * f * t)) * np.exp(-t * 18) * vol


def whoosh(d=0.5, vol=0.3, bright=6):
    n = int(d * SR)
    t = _t(d)
    s = lowpass(highpass(_noise(n), 30), bright)
    return s * np.sin(np.pi * t / d) ** 2 * vol


def thud(vol=0.7):
    t = _t(0.35)
    s = np.sin(_osc(45 + 110 * np.exp(-t * 18))) * np.exp(-t * 10)
    s += 0.5 * lowpass(_noise(len(t)), 40) * np.exp(-t * 25)
    return s * vol


def crash(vol=0.25, d=1.2):
    t = _t(d)
    return highpass(_noise(len(t)), 3) * np.exp(-t * 3.2) * vol


def snare(vol=0.3):
    t = _t(0.12)
    return (0.8 * highpass(_noise(len(t)), 4) + 0.4 * np.sin(2 * np.pi * 190 * t)) * np.exp(-t * 28) * vol


def drumroll(d, vol=0.25):
    out = np.zeros(int((d + 0.15) * SR))
    k = 0.0
    while k < d:
        a = vol * (0.35 + 0.65 * k / d)
        add(out, k, snare(a))
        k += 0.045
    return out


def splash(vol=0.45, d=0.9):
    t = _t(d)
    s = highpass(_noise(len(t)), 6) * np.exp(-t * 5)
    s += 0.6 * lowpass(_noise(len(t)), 25) * np.exp(-t * 8)
    for i in range(10):
        bt = _rng.uniform(0.05, d * 0.7)
        bf = _rng.uniform(500, 1100)
        bb = _t(0.05)
        add(s, bt, 0.4 * np.sin(_osc(bf * (1 + 2.5 * bb / 0.05))) * np.exp(-bb * 40))
    return s / np.max(np.abs(s)) * vol


def chirp(vol=0.2, base=3200):
    out = np.zeros(int(0.35 * SR))
    for k, st in enumerate((0.0, 0.12)):
        t = _t(0.09)
        fr = base * (1 + 0.45 * np.sin(np.pi * t / 0.09)) * (1 + 0.1 * k)
        add(out, st, np.sin(_osc(fr)) * np.sin(np.pi * t / 0.09) * vol)
    return out


def flap(vol=0.12):
    t = _t(0.08)
    return lowpass(_noise(len(t)), 10) * np.sin(np.pi * t / 0.08) * vol


def tiptoe(i, vol=0.18, base=72):
    return tone(midi_hz(base + [0, 2, 4, 5, 7, 9, 11, 12][i % 8] + 12 * (i // 8)), 0.08, "mallet", vol)


def tada(key=72, vol=0.16):
    out = np.zeros(int(2.4 * SR))
    for i, m in enumerate([key, key + 4, key + 7, key + 12]):
        add(out, i * 0.08, tone(midi_hz(m), 1.5, "bell", vol))
    add(out, 0.32, tone(midi_hz(key + 16), 1.6, "bell", vol * 1.2))
    add(out, 0.0, crash(0.12, 1.4))
    return out


def creak(d=0.6, vol=0.15):
    t = _t(d)
    fr = 90 + 40 * np.sin(np.pi * t / d)
    s = np.sign(np.sin(_osc(fr))) * (0.5 + 0.5 * np.sin(2 * np.pi * 23 * t))
    return lowpass(s, 8) * np.sin(np.pi * t / d) * vol


# ---------------------------------------------------------------- audio: gibberish voices
VOWELS = {"a": (800, 1200, 2500), "e": (520, 1850, 2550), "i": (330, 2300, 3000), "o": (520, 880, 2500),
          "u": (350, 750, 2350), "m": (260, 1100, 2300), "l": (360, 1300, 2700), "w": (330, 700, 2300),
          "y": (300, 2200, 2900), "r": (400, 1200, 1700)}


def voiced(f0, F, amp, breath=0.04):
    """f0: per-sample Hz, F: (n,3) formant tracks, amp: per-sample envelope."""
    n = len(f0)
    ph = _osc(f0)
    out = np.zeros(n)
    K = int(min(48, 5200 / max(60, f0.min())))
    widths = (150, 220, 300)
    gains = (1.0, 0.55, 0.22)
    for k in range(1, K + 1):
        hk = k * f0
        a = 0.12 / k
        for j in range(3):
            a = a + gains[j] * np.exp(-((hk - F[:, j]) / widths[j]) ** 2)
        out += a * np.sin(k * ph)
    out *= amp
    out += breath * lowpass(highpass(_noise(n), 6), 3) * amp
    return out


def _syllables(text):
    out = []
    for word in text.split():
        punct = ""
        while word and word[-1] in "!?.~,":
            punct = word[-1] + punct
            word = word[:-1]
        parts = [p for p in word.lower().split("-") if p]
        for i, p in enumerate(parts):
            out.append((p, punct if i == len(parts) - 1 else "", i == len(parts) - 1))
    return out


def voice(text, f0=240, rate=1.0, vol=0.35, seed=1):
    """Cartoon gibberish: 'hi-ya!', 'wo-wo-woah!', 'heh-heh', 'wheee!'. Stretch vowels to hold them."""
    rng = np.random.default_rng(seed)
    syls = _syllables(text)
    f0s, Fs, amps, noise_parts = [], [], [], []
    cursor = 0
    total_lst = []
    nsyl = len(syls)
    for si, (s, punct, last_in_word) in enumerate(syls):
        cons = ""
        i = 0
        while i < len(s) and s[i] not in "aeiouy":
            cons += s[i]
            i += 1
        vow = s[i:] or "u"
        vchars = [c for c in vow if c in "aeiouy"]
        tailc = vow[len(vchars):] if len(vchars) < len(vow) else ""
        if vow.startswith("ee"):
            vowel = "i"
        elif vow.startswith("oo"):
            vowel = "u"
        else:
            vowel = {"y": "i"}.get(vchars[0], vchars[0]) if vchars else "u"
        if vowel not in VOWELS:
            vowel = "a"
        hold = max(0, len(vchars) - 1)
        vd = (0.12 + 0.07 * hold) / rate
        # pitch shape
        base = f0 * (1 + rng.uniform(-0.06, 0.06)) * (1 - 0.08 * si / max(1, nsyl))
        if "!" in punct:
            base *= 1.15
        cd = 0.0
        segs = []  # (dur, kind, formant, f0start, f0end)
        for c in cons:
            if c in "ptk":
                segs.append((0.02 / rate, "sil", vowel, base, base))
                segs.append((0.02 / rate, "burst", vowel, base, base))
            elif c in "bdg":
                segs.append((0.03 / rate, "voice_low", "m", base * 0.95, base))
            elif c in "sfcz":
                segs.append((0.06 / rate, "hiss", vowel, base, base))
            elif c == "h":
                segs.append((0.05 / rate, "breath", vowel, base, base))
            elif c in "mnlwr":
                segs.append((0.05 / rate, "voice", c if c in VOWELS else "m", base * 0.97, base))
        end = base
        if "?" in punct and last_in_word:
            end = base * 1.45
        elif "!" in punct and last_in_word:
            end = base * 0.8
        elif "." in punct and last_in_word:
            end = base * 0.85
        segs.append((vd, "vowel", vowel, base, end))
        if tailc and tailc[-1] in "mnlh":
            segs.append((0.05 / rate, "voice", "m", end, end * 0.97))
        segs.append(((0.05 if last_in_word else 0.015) / rate, "sil", vowel, end, end))
        for (dur, kind, form, fa, fb) in segs:
            n = max(1, int(dur * SR))
            f0s.append(np.linspace(fa, fb, n) * (1 + ("~" in punct) * 0.08 * np.sin(np.arange(n) / SR * 2 * np.pi * 9)))
            Fs.append(np.tile(np.array(VOWELS[form], float), (n, 1)))
            if kind in ("vowel", "voice", "voice_low"):
                a = np.ones(n) * (0.5 if kind == "voice_low" else 0.8 if kind == "voice" else 1.0)
            else:
                a = np.zeros(n)
            amps.append(a)
            if kind in ("burst", "hiss", "breath"):
                nz = _noise(n)
                nz = highpass(nz, 2) if kind != "breath" else lowpass(highpass(nz, 8), 3)
                g = {"burst": 0.5, "hiss": 0.25, "breath": 0.3}[kind]
                noise_parts.append((cursor, nz * g * np.sin(np.pi * np.arange(n) / n)))
            cursor += n
    f0 = np.concatenate(f0s)
    F = np.concatenate(Fs)
    amp = np.concatenate(amps)
    sm = int(0.018 * SR)
    for j in range(3):
        F[:, j] = lowpass(np.pad(F[:, j], sm, mode="edge"), sm)[sm:-sm]
    f0 = lowpass(np.pad(f0, sm, mode="edge"), sm)[sm:-sm]
    amp = lowpass(amp, int(0.012 * SR))
    out = voiced(f0, F, amp)
    for (c, nz) in noise_parts:
        out[c:c + len(nz)] += nz
    out /= max(1e-6, np.max(np.abs(out)))
    return out * vol


def moo(d=1.2, f0=120, vol=0.4, rise=1.15, fall=0.8):
    n = int(d * SR)
    t = np.arange(n) / SR
    p = t / d
    f0c = f0 * np.interp(p, [0, 0.25, 1], [1, rise, fall]) * (1 + 0.02 * np.sin(2 * np.pi * 5 * t))
    mF = np.array(VOWELS["m"], float)
    oF = np.array(VOWELS["o"], float)
    uF = np.array(VOWELS["u"], float)
    w1 = np.interp(p, [0, 0.12, 0.5, 1], [0, 1, 1, 0.3])[:, None]
    w2 = np.interp(p, [0, 0.5, 1], [0, 0, 0.7])[:, None]
    F = mF * (1 - w1) + oF * w1
    F = F * (1 - w2) + uF * w2
    amp = np.minimum(1, t / 0.06) * np.minimum(1, (d - t) / 0.2) * np.interp(p, [0, 0.12, 1], [0.5, 1, 0.9])
    out = voiced(f0c, F, amp, breath=0.08)
    out /= max(1e-6, np.max(np.abs(out)))
    return out * vol


def sad_trombone(f=233, vol=0.3):
    out = np.zeros(int(3.0 * SR))
    notes = [(0, 0.45), (-1, 0.45), (-2, 0.45), (-3, 1.4)]
    st = 0.0
    for i, (semi, d) in enumerate(notes):
        n = int(d * SR)
        t = np.arange(n) / SR
        fr = f * 2 ** (semi / 12) * (1 + (i == 3) * 0.03 * np.sin(2 * np.pi * 6 * t))
        wa = np.interp(t / d, [0, 0.3, 1], [0, 1, 0.7])[:, None]
        F = np.array(VOWELS["u"], float) * (1 - wa) + np.array(VOWELS["a"], float) * wa
        amp = np.minimum(1, t / 0.04) * np.minimum(1, (d - t) / 0.08)
        s = voiced(fr, F, amp, 0.02)
        add(out, st, s / max(1e-6, np.max(np.abs(s))) * vol)
        st += d
    return out


def whistle_tune(notes, unit=0.18, vol=0.16, base=84):
    """notes: list of (semitone, units) relative to `base` midi; a cheerful lip whistle."""
    total = sum(u for _, u in notes) * unit
    out = np.zeros(int((total + 0.2) * SR))
    st = 0.0
    for semi, u in notes:
        d = u * unit
        if semi is not None:
            t = _t(d)
            fr = midi_hz(base + semi) * (1 + 0.01 * np.sin(2 * np.pi * 6 * t))
            env = np.minimum(1, t / 0.02) * np.minimum(1, (d - t) / 0.04)
            add(out, st, (np.sin(_osc(fr)) + 0.03 * highpass(_noise(len(t)), 3)) * env * vol)
        st += d
    return out


# ---------------------------------------------------------------- audio: music bed
PROG = [(0, 4, 7), (5, 9, 12), (7, 11, 14), (0, 4, 7)]


def music(buf, t0, t1, bpm=128, key=60, vol=1.0, sneaky=False):
    beat = 60 / bpm
    t = t0
    i = 0
    while t < t1 - 1e-6:
        ch = PROG[(i // 4) % len(PROG)]
        b = i % 4
        if sneaky:
            if b in (0, 2):
                add(buf, t, tone(midi_hz(key - 12 + ch[b // 2 * 2 % 3] - 12), beat * 0.4, "bass", 0.28 * vol))
            add(buf, t + beat / 2, tone(midi_hz(key + ch[(i // 2) % 3]), 0.08, "mallet", 0.08 * vol))
        else:
            if b in (0, 2):
                add(buf, t, tone(midi_hz(key - 24 + ch[0] + (7 if b == 2 else 0)), beat * 0.8, "bass", 0.3 * vol))
                add(buf, t, kick(0.25 * vol))
            else:
                for pc in ch:
                    add(buf, t, tone(midi_hz(key + pc), beat * 0.25, "mallet", 0.06 * vol))
            add(buf, t, shaker(0.05 * vol))
            add(buf, t + beat / 2, shaker(0.035 * vol))
            if b == 3 and (i // 4) % 2 == 1:
                add(buf, t + beat / 2, tone(midi_hz(key + 12 + ch[2]), 0.3, "bell", 0.05 * vol))
        t += beat
        i += 1


def write_audio(buf, path):
    buf = np.tanh(buf * 1.3) / np.tanh(1.3)
    buf /= max(1e-6, np.max(np.abs(buf))) / 0.89
    fade = int(0.25 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- render
def render(duration, frame_fn, audio_fn, out_path, preview_times=None):
    if preview_times:
        for pt in preview_times:
            frame_fn(pt).save(out_path.replace(".mp4", f"_t{pt:05.1f}.png"))
        return
    buf = np.zeros(int((duration + 0.5) * SR))
    audio_fn(buf)
    buf = buf[: int(duration * SR)]
    wav = out_path.replace(".mp4", ".wav")
    write_audio(buf, wav)
    n = int(duration * FPS)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "19",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n):
        proc.stdin.write(frame_fn(i / FPS).convert("RGB").tobytes())
    proc.stdin.close()
    proc.wait()
    os.remove(wav)
