"""Stereo music production helpers: plucked strings (Karplus-Strong), drums, glockenspiel, reverb, mixing."""
import wave
import numpy as np

SR = 44100
_rng = np.random.default_rng(21)

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
        "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def chord_notes(name, octave=4):
    """'D', 'Bm', 'Em', 'A7' -> midi notes of a triad (+7th) rooted in the given octave."""
    root = name[:2] if len(name) > 1 and name[1] in "#b" else name[:1]
    q = name[len(root):]
    r = 12 * (octave + 1) + NOTE[root]
    third = 3 if q.startswith("m") else 4
    ns = [r, r + third, r + 7]
    if q.endswith("7"):
        ns.append(r + 10)
    return ns


class Track:
    """Stereo buffer with add(t, mono, pan)."""

    def __init__(self, seconds):
        self.buf = np.zeros((int(seconds * SR) + SR, 2))

    def add(self, t, sig, pan=0.0, gain=1.0):
        i = int(t * SR)
        if i < 0:
            sig, i = sig[-i:], 0
        j = min(len(self.buf), i + len(sig))
        if j <= i:
            return
        l = np.cos((pan + 1) * np.pi / 4) * gain
        r = np.sin((pan + 1) * np.pi / 4) * gain
        if sig.ndim == 1:
            self.buf[i:j, 0] += sig[: j - i] * l
            self.buf[i:j, 1] += sig[: j - i] * r
        else:
            self.buf[i:j] += sig[: j - i] * [l * 1.414, r * 1.414]


# ---------------------------------------------------------------- instruments
_ks_cache = {}


def pluck(freq, dur=1.2, bright=0.6, decay=0.995):
    key = (round(freq, 2), dur, bright, decay)
    if key in _ks_cache:
        return _ks_cache[key]
    N = max(2, int(round(SR / freq)))
    n = int(dur * SR)
    y = np.zeros(n + N + 1)
    exc = _rng.uniform(-1, 1, N)
    k = max(1, int(2 + (1 - bright) * 6))
    exc = np.convolve(exc, np.ones(k) / k, mode="same")
    y[:N] = exc - exc.mean()
    p = N
    while p < n:
        q = min(n, p + N)
        prev = y[p - N:q - N]
        prev2 = y[p - N - 1:q - N - 1] if p - N - 1 >= 0 else np.concatenate([[0], y[p - N:q - N - 1]])
        y[p:q] = decay * 0.5 * (prev + prev2)
        p = q
    out = y[:n]
    out *= np.minimum(1, (n - np.arange(n)) / (0.03 * SR))
    _ks_cache[key] = out
    return out


def bass(freq, dur, vol=0.5):
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t) + 0.1 * np.sin(6 * np.pi * freq * t)
    env = np.minimum(1, t / 0.008) * np.exp(-t * 2.2)
    env *= np.clip((dur + 0.08 - t) / 0.08, 0, 1)
    return s * env * vol


def glock(freq, vol=0.25, dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 6) \
        + 0.2 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t * 12)
    return s * np.minimum(1, t / 0.002) * np.exp(-t * 3.0) * vol


def kick(vol=0.8):
    t = np.arange(int(0.3 * SR)) / SR
    f = 48 + 100 * np.exp(-t * 35)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)
    s[: int(0.004 * SR)] += _rng.uniform(-0.3, 0.3, int(0.004 * SR))
    return s * vol


def _hp(x, k=3):
    return x - np.convolve(x, np.ones(k) / k, mode="same")


def clap(vol=0.4):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    nz = _hp(_rng.standard_normal(n), 4)
    env = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        env += np.where(t >= d, np.exp(-(t - d) * 160), 0)
    env += np.where(t >= 0.03, np.exp(-(t - 0.03) * 18) * 0.6, 0)
    s = nz * env
    return s / np.max(np.abs(s)) * vol


def hat(vol=0.12, open_=False):
    n = int((0.25 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    s = _hp(_hp(_rng.standard_normal(n), 2), 2)
    return s * np.exp(-t * (14 if open_ else 90)) * vol


def shaker(vol=0.08):
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    s = _hp(_rng.standard_normal(n), 2)
    return s * np.sin(np.pi * t / 0.07) ** 2 * vol


def squeak(vol=0.3, f=1900, d=0.22):
    t = np.arange(int(d * SR)) / SR
    fr = f * (1 + 0.25 * np.sin(np.pi * t / d)) * (1 + 0.03 * np.sin(2 * np.pi * 38 * t))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    s = np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    return s * np.sin(np.pi * t / d) ** 0.5 * vol


def bubble_pop(vol=0.3):
    t = np.arange(int(0.06 * SR)) / SR
    f = 600 + 2200 * t / 0.06
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 60) * vol


def splash(vol=0.4, d=0.7):
    n = int(d * SR)
    t = np.arange(n) / SR
    s = _hp(_rng.standard_normal(n), 5) * np.exp(-t * 6)
    s += 0.5 * np.convolve(_rng.standard_normal(n), np.ones(30) / 30, mode="same") * np.exp(-t * 9)
    for _ in range(8):
        bt = int(_rng.uniform(0.05, d * 0.6) * SR)
        bb = np.arange(int(0.04 * SR)) / SR
        f = _rng.uniform(500, 1000) * (1 + 3 * bb / 0.04)
        seg = 0.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-bb * 50)
        s[bt:bt + len(seg)] += seg[: n - bt]
    return s / np.max(np.abs(s)) * vol


def sparkle(vol=0.12):
    out = np.zeros(int(1.2 * SR))
    for i, m in enumerate([86, 90, 93, 98, 102]):
        g = glock(hz(m), vol, 0.9)
        k = int(i * 0.05 * SR)
        out[k:k + len(g)] += g[: len(out) - k]
    return out


# ---------------------------------------------------------------- effects
def reverb_ir(seconds=1.8, predelay=0.02, damp=0.9, seed=3):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n + int(predelay * SR), 2))
    for c in range(2):
        nz = rng.standard_normal(n) * np.exp(-t * 6.9 / seconds)
        k = 3
        nz = np.convolve(nz, np.ones(k) / k, mode="same") * damp + nz * (1 - damp)
        ir[int(predelay * SR):, c] = nz
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve_stereo(x, ir):
    n = len(x) + len(ir) - 1
    nf = 1 << (n - 1).bit_length()
    out = np.zeros((len(x), 2))
    mono = x.mean(axis=1) if x.ndim == 2 else x
    X = np.fft.rfft(mono, nf)
    for c in range(2):
        out[:, c] = np.fft.irfft(X * np.fft.rfft(ir[:, c], nf), nf)[: len(x)]
    return out


def compress(x, thresh=0.25, ratio=3.0, att=0.005, rel=0.12):
    env = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    a_att, a_rel = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))
    # block-wise envelope follower (fast enough in numpy)
    blk = 64
    e = env[: len(env) // blk * blk].reshape(-1, blk).max(axis=1)
    sm = np.zeros_like(e)
    cur = 0.0
    for i, v in enumerate(e):
        cur = v if v > cur else cur * (a_rel ** blk) + v * (1 - a_rel ** blk)
        sm[i] = cur
    sm = np.repeat(sm, blk)
    sm = np.concatenate([sm, np.full(len(env) - len(sm), sm[-1] if len(sm) else 0)])
    gain = np.where(sm > thresh, (thresh + (sm - thresh) / ratio) / np.maximum(sm, 1e-9), 1.0)
    gain = np.convolve(gain, np.ones(256) / 256, mode="same")
    return x * (gain[:, None] if x.ndim == 2 else gain)


def master(x, ceiling=0.93):
    x = x / max(1e-9, np.max(np.abs(x))) * 1.2
    x = np.tanh(x * 1.1) / np.tanh(1.1)
    return x / np.max(np.abs(x)) * ceiling


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
