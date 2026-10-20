"""Builds the Frostdragon Tyrant guide's timeline, an original synthesized
score timed to it, and the narration track. Writes timeline.json, music.wav
and vo.wav. The instruments are the landing video's (../compose.py).

    python compose.py <vid dir> <tts dir>
"""
import json
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

VID, TTS = sys.argv[1], sys.argv[2]
SR = 44100

# Clips in order, with the transition into the next one. Scene lengths are
# set in anim.mjs calls and record.mjs (LEN) to fit each narration line.
ORDER = [
    ("title", "fade", 0.6),
    ("alliance", "smoothleft", 0.5),
    ("map", "smoothleft", 0.5),
    ("tyrant", "fadeblack", 0.7),
    ("create", "smoothleft", 0.5),
    ("vote", "smoothleft", 0.5),
    ("lineup", "smoothleft", 0.5),
    ("assign", "smoothleft", 0.5),
    ("notes", "smoothleft", 0.5),
    ("publish", "smoothleft", 0.5),
    ("member", "fade", 0.6),
    ("end", None, 0),
]


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout)


clips = []
t = 0.0
for i, (name, trans, tdur) in enumerate(ORDER):
    d = duration(f"{VID}/clip-{name}.mp4")
    trans_in = ORDER[i - 1][2] if i else 0
    clips.append({"name": name, "start": t, "dur": d, "trans": trans, "tdur": tdur, "trans_in": trans_in})
    t += d - tdur
TOTAL = t
at = {c["name"]: c for c in clips}

N = int(TOTAL * SR) + SR
tt = np.arange(N) / SR


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bandpass(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)


rng = np.random.default_rng(3)
pad = np.zeros(N)
bass = np.zeros(N)
drums = np.zeros(N)
fx = np.zeros(N)


def add(buf, start, sig):
    i = int(start * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    buf[i : i + len(sig)] += sig


def saw(freq, length, detune=0.0025):
    x = np.arange(int(length * SR)) / SR
    out = np.zeros_like(x)
    for d in (1 - detune, 1 + detune):
        for h in range(1, 9):
            out += np.sin(2 * np.pi * freq * d * h * x + h) / h
    return out / 6


def pad_chord(start, length, notes, level=0.11, cutoff=1400):
    sig = sum(saw(note(m), length + 0.6) for m in notes)
    n = len(sig)
    env = np.ones(n)
    a, r = int(0.35 * SR), int(0.6 * SR)
    env[:a] = np.linspace(0, 1, a)
    env[-r:] = np.linspace(1, 0, r)
    add(pad, start, lowpass(sig, cutoff) * env * level)


def bass_note(start, midi, length=0.28, level=0.3):
    x = np.arange(int(length * SR)) / SR
    f = note(midi)
    sig = np.sin(2 * np.pi * f * x) + 0.35 * np.sin(2 * np.pi * 2 * f * x)
    env = np.exp(-x / 0.12) * np.minimum(1, x / 0.004)
    add(bass, start, np.tanh(1.6 * sig) * env * level)


def kick(start, level=0.75, low=46, length=0.45):
    x = np.arange(int(length * SR)) / SR
    freq = low + (150 - low) * np.exp(-x / 0.035)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    add(drums, start, np.sin(phase) * np.exp(-x / (length / 3.2)) * level)


def noise_hit(start, length, lo, hi, level, decay):
    n = int(length * SR)
    x = np.arange(n) / SR
    sig = bandpass(rng.standard_normal(n), lo, hi) * np.exp(-x / decay)
    add(drums, start, sig * level)


def hat(start, level=0.05):
    noise_hit(start, 0.08, 7000, 16000, level, 0.018)


def clap(start, level=0.16):
    noise_hit(start, 0.25, 900, 3500, level, 0.06)


def bell(start, midi, level=0.12, decay=1.4):
    x = np.arange(int(decay * 3 * SR)) / SR
    f = note(midi)
    sig = np.sin(2 * np.pi * f * x) + 0.4 * np.sin(2 * np.pi * 2.76 * f * x) * np.exp(-x / 0.25)
    add(fx, start, sig * np.exp(-x / decay) * np.minimum(1, x / 0.003) * level)


def tick(start, level=0.08):
    x = np.arange(int(0.05 * SR)) / SR
    add(fx, start, np.sin(2 * np.pi * 2300 * x) * np.exp(-x / 0.008) * level)


BEAT = 0.6  # 100 BPM
CHORDS = {
    "Am": [57, 60, 64], "F": [53, 57, 60], "C": [55, 60, 64], "G": [55, 59, 62],
    "Dm": [57, 62, 65], "E": [56, 59, 64], "Am9": [57, 60, 64, 71],
}
ROOT = {"Am": 33, "F": 29, "C": 36, "G": 31, "Dm": 38, "E": 28, "Am9": 33}


def section(start, end, chords, *, bassline=True, kicks=(0, 2), claps=(1, 3), hats=2, level=0.11, cutoff=1400, kick_level=0.7):
    bar = BEAT * 4
    i = 0
    s = start
    while s < end - 0.05:
        chord = chords[i % len(chords)]
        length = min(bar, end - s)
        pad_chord(s, length, CHORDS[chord], level, cutoff)
        for b in range(4):
            beat = s + b * BEAT
            if beat >= end - 0.02:
                break
            if b in kicks:
                kick(beat, kick_level)
            if b in claps:
                clap(beat)
            for h in range(hats):
                hat(beat + h * BEAT / hats, 0.05 if h % 2 == 0 else 0.03)
            if bassline:
                for e in range(2):
                    if beat + e * BEAT / 2 < end - 0.05:
                        bass_note(beat + e * BEAT / 2, ROOT[chord] + (12 if e else 0))
        s += bar
        i += 1



t_alliance = at["alliance"]["start"]
t_create = at["create"]["start"]
t_publish = at["publish"]["start"]
t_member = at["member"]["start"]
t_end = at["end"]["start"]

# Title: a cold pad and a shimmer.
pad_chord(0, t_alliance, CHORDS["Am9"], 0.09, 900)
for k, m in enumerate([76, 79, 83, 88]):
    bell(0.5 + k * 0.35, m, 0.05, 1.8)
# The event explained: a quiet, low groove under the narration.
section(t_alliance, t_create, ["Am", "Dm", "F", "E"], kicks=(0,), claps=(), hats=1, level=0.09, cutoff=900, kick_level=0.45)
for c in ("map", "tyrant"):
    bell(at[c]["start"] + 0.2, 81, 0.05, 1.6)
# Planning: the steady groove.
section(t_create, t_publish, ["Am", "F", "C", "G"], level=0.1, kick_level=0.6)
# Publish: a lift.
for k, m in enumerate([69, 73, 76, 81]):
    bell(t_publish + 0.5 + k * 0.08, m, 0.08, 1.4)
section(t_publish, t_end, ["F", "G", "C", "G"], kicks=(0, 2), claps=(1, 3), hats=2, level=0.1, kick_level=0.6)
for k, m in enumerate([72, 76, 79, 84]):
    bell(t_member + 0.3 + k * 0.15, m, 0.07, 1.4)
# End: resolve and fade.
pad_chord(t_end, TOTAL - t_end + 0.5, [48, 55, 60, 64, 71], 0.1, 1000)
bell(t_end + 0.4, 84, 0.06, 2.4)

ir_t = np.arange(int(2.4 * SR)) / SR
ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.55)
ir /= np.abs(ir).sum() ** 0.5 * 40
wet_src = pad + fx * 1.2 + drums * 0.15
wet = fftconvolve(wet_src, ir)[:N]
mix = pad + bass + drums + fx + wet * 0.9
mix = lowpass(mix, 15000)
fade = np.ones(N)
fend = int(TOTAL * SR)
fade[fend - int(2.5 * SR) : fend] = np.linspace(1, 0, int(2.5 * SR))
fade[fend:] = 0
fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
mix = np.tanh(mix * 1.2) * fade
mix = mix / np.max(np.abs(mix)) * 0.89
stereo = np.stack([mix, np.concatenate([np.zeros(90), mix[:-90]])], axis=1)  # a touch of width
sf.write(f"{VID}/music.wav", stereo[: int(TOTAL * SR)], SR)

# Narration: each line a moment after its clip appears.
vo = np.zeros(int(TOTAL * SR) + SR)
for c in clips:
    data, sr = sf.read(f"{TTS}/vo-{c['name']}.wav")
    assert sr == 24000
    data = np.interp(np.arange(int(len(data) * SR / sr)) / SR, np.arange(len(data)) / sr, data)
    begin = c["start"] + c["trans_in"] * 0.5 + 0.25
    c["vo"] = [round(begin, 2), round(begin + len(data) / SR, 2)]
    i = int(begin * SR)
    vo[i : i + len(data)] += data
vo = vo[: int(TOTAL * SR)]
vo = vo / np.max(np.abs(vo)) * 0.95
sf.write(f"{VID}/vo.wav", vo, SR)
json.dump({"clips": clips, "total": TOTAL}, open(f"{VID}/timeline.json", "w"), indent=1)
for c in clips:
    print(f"{c['name']:9s} start {c['start']:6.2f} dur {c['dur']:5.2f} vo {c['vo']} next-trans {c['start'] + c['dur'] - c['tdur']:6.2f}")
print("total", round(TOTAL, 2))
