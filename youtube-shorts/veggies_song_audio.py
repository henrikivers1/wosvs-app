"""'Yum Yum Veggies' - an original toddler song. Builds the stereo mix, lip-sync envelope and caption timings."""
import os, sys
import numpy as np
import parselmouth
from parselmouth.praat import call
from studio import *
from sing import Singer, sing_lines, parse_syllables

BPM = 112
BEAT = 60 / BPM
TOTAL_BEATS = 80
DUR = TOTAL_BEATS * BEAT + 1.2

D4, E4, Fs4, G4, A4, B4, Cs5, D5 = 62, 64, 66, 67, 69, 71, 73, 74

LEAD = [
    dict(start=8, text="Crunch-y car-rot, or-ange and bright,",
         notes=[(A4, 1), (A4, .5), (B4, 1), (A4, 1.5), (G4, .5), (G4, .5), (Fs4, 1), (E4, 2)]),
    dict(start=16, text="Munch, munch, munch, take a big bite!",
         notes=[(D5, 1), (D5, 1), (D5, 1), (B4, 1), (A4, .5), (Fs4, .5), (D4, 3)]),
    dict(start=24, text="Lit-tle green trees, broc-co-li!",
         notes=[(B4, .5), (B4, .5), (A4, 1), (Fs4, 2), (G4, 1), (A4, 1), (B4, 2)]),
    dict(start=32, text="Yum-my, yum-my, in my tum-my!",
         notes=[(A4, 1), (Fs4, 1), (A4, 1), (Fs4, 1), (G4, .5), (Fs4, .5), (E4, 1), (D4, 2)]),
    dict(start=40, text="Yum yum veg-gies, one, two, three,",
         notes=[(D5, .5), (A4, 1.5), (B4, 1), (A4, 1), (Fs4, 1), (G4, 1), (A4, 2)]),
    dict(start=48, text="Make me strong as strong can be!",
         notes=[(A4, .5), (A4, .5), (B4, 1), (A4, 1), (G4, 1), (Fs4, 1), (E4, 3)]),
    dict(start=56, text="Yum yum veg-gies, ev-ery day,",
         notes=[(D5, .5), (A4, 1.5), (B4, 1), (A4, 1), (B4, 1), (Cs5, 1), (D5, 2)]),
    dict(start=64, text="Now I'm read-y, let's go play!",
         notes=[(A4, .5), (A4, .5), (B4, 1), (A4, 1), (Fs4, 1), (E4, 1), (D4, 3)]),
]
for _l in LEAD:
    assert sum(b for _, b in _l["notes"]) == 8, _l["text"]
CHORUS_FROM = 40   # backing choir joins on the chorus
CHORDS = [(0, "D"), (4, "A"), (8, "D"), (12, "Em"), (16, "G"), (20, "D"), (24, "Bm"), (28, "G"), (32, "D"),
          (36, "A"), (37, "D"), (40, "D"), (48, "A"), (52, "D"), (53, "A"), (56, "D"), (60, "A"), (62, "D"),
          (64, "D"), (68, "A"), (69, "D"), (72, "G"), (74, "A"), (76, "D")]
SPOKEN = [(1.0, "Yummy time!"), (72.6, "All gone! Yay!")]
QUACKS = []
SPLASHES = []
POPS = [44, 45, 46]
CRUNCHES = [16, 17, 18, 21]
D_SCALE = [62, 64, 66, 67, 69, 71, 73]


def crunch(vol=0.35):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(int(vol * 1000))
    s = np.zeros(n)
    for k in range(7):
        st = int(rng.uniform(0, 0.12) * SR)
        m = int(0.025 * SR)
        burst = rng.standard_normal(m) * np.exp(-np.arange(m) / SR * 120)
        s[st:st + m] += burst[: n - st]
    s = s - np.convolve(s, np.ones(4) / 4, mode="same")
    return s / np.max(np.abs(s)) * vol * np.exp(-t * 6)


def chord_at(beat):
    c = CHORDS[0][1]
    for b, name in CHORDS:
        if b <= beat:
            c = name
    return c


def third_above(m):
    pcs = [(n - 62) % 12 for n in D_SCALE]
    pc = (m - 62) % 12
    if pc not in pcs:
        return m + 4
    i = pcs.index(pc)
    j = i + 2
    return m + (D_SCALE[j % 7] + 12 * (j // 7) - D_SCALE[i])


def childlike(x, formant=1.1):
    s = parselmouth.Sound(x, SR)
    out = call(s, "Change gender", 75, 700, formant, 0, 1, 1)
    y = out.values[0]
    return np.pad(y, (0, max(0, len(x) - len(y))))[: len(x)]


def band():
    """Ukulele, bass, drums, glockenspiel and sound effects, all on the beat grid."""
    T = Track(DUR)
    # ---------------- ukulele strums
    pattern = [(0, 1.0, 1), (1, 0.8, 1), (1.5, 0.55, -1), (2.5, 0.6, -1), (3, 0.85, 1), (3.5, 0.55, -1)]
    for bar in range(TOTAL_BEATS // 4):
        for off, vel, direction in pattern:
            b = bar * 4 + off
            if b >= 76.01:
                continue
            notes = chord_notes(chord_at(b), 4)
            notes = sorted(set([n if n >= 60 else n + 12 for n in notes] + [notes[0] + 12]))
            seq = notes if direction > 0 else notes[::-1]
            for k, m in enumerate(seq):
                T.add(b * BEAT + k * 0.011, pluck(hz(m), 1.1, 0.65, 0.994), pan=-0.35 + 0.1 * k, gain=0.085 * vel)
    for k, m in enumerate(sorted(chord_notes("D", 4) + [74, 78])):  # final ringing strum
        T.add(76 * BEAT + k * 0.03, pluck(hz(m), 3.0, 0.7, 0.998), pan=-0.3 + 0.15 * k, gain=0.14)
    # ---------------- bass + drums from the verse
    for bar in range(2, 19):
        for off, length, deg in [(0, 1.4, 0), (1.5, 0.5, 0), (2, 1.0, 7), (3.5, 0.5, 12)]:
            b = bar * 4 + off
            root = chord_notes(chord_at(b), 2)[0]
            T.add(b * BEAT, bass(hz(root + deg), length * BEAT, 0.42))
        chorus = bar >= 10
        for beat in range(4):
            b = bar * 4 + beat
            if beat in (0, 2):
                T.add(b * BEAT, kick(0.75))
            if chorus and beat == 2:
                T.add((b + 0.5) * BEAT, kick(0.45))
            if beat in (1, 3) and bar >= 6:
                T.add(b * BEAT, clap(0.32), pan=0.05)
            T.add(b * BEAT, shaker(0.07), pan=0.4)
            T.add((b + 0.5) * BEAT, shaker(0.05), pan=0.4)
            if chorus:
                T.add((b + 0.5) * BEAT, hat(0.07), pan=-0.3)
    T.add(76 * BEAT, kick(0.8))
    # ---------------- glockenspiel: intro hook + doubling the chorus
    hook = [(0, D5), (0.5, A4), (2, D5), (2.5, A4), (4, B4), (4.5, A4), (5, G4), (6, Fs4)]
    for b, m in hook:
        T.add(b * BEAT, glock(hz(m + 12), 0.2), pan=0.3)
    for l in LEAD:
        if l["start"] >= 40:
            b = l["start"]
            for m, d in l["notes"]:
                if m:
                    T.add(b * BEAT, glock(hz(m + 12), 0.07), pan=0.35)
                b += d
    T.add(72 * BEAT, sparkle(0.14), pan=0.2)
    # ---------------- sound effects
    for b in QUACKS:
        T.add(b * BEAT, squeak(0.22, 1900 + (b - 36) * 150), pan=-0.4)
    for b in CRUNCHES:
        T.add(b * BEAT, crunch(0.35), pan=0.15)
    T.add(40 * BEAT, sparkle(0.12), pan=-0.2)
    for b in SPLASHES:
        T.add(b * BEAT, splash(0.22), pan=0.1)
    for b in POPS:
        T.add(b * BEAT, bubble_pop(0.25), pan=0.3)
    return T.buf


def build(out_wav, env_path):
    lead_singer = Singer("af_heart", speed=0.8)
    lead, events = sing_lines(lead_singer, LEAD, DUR, BEAT)
    lead = childlike(lead, 1.08)
    # spoken lines (toddler)
    talk = np.zeros_like(lead)
    for b, text in SPOKEN:
        a, sr = lead_singer.k.create(text, voice="af_heart", speed=1.0, lang="en-us")
        snd = parselmouth.Sound(np.asarray(a, float), sr)
        snd = call(snd, "Change gender", 75, 600, 1.16, 330, 1.4, 1.0).resample(SR)
        y = snd.values[0]
        y = y / (np.sqrt(np.mean(y ** 2)) + 1e-9) * 0.12
        i = int(b * BEAT * SR)
        talk[i:i + len(y)] += y[: len(talk) - i]
    # backing choir: two other voices on the chorus, one doubling, one a third above
    choir_lines = [l for l in LEAD if l["start"] >= CHORUS_FROM]
    dbl, _ = sing_lines(Singer("af_bella", speed=0.8, vibrato=0.01), choir_lines, DUR, BEAT)
    harm_lines = [dict(l, notes=[(third_above(m) if m else m, b) for m, b in l["notes"]]) for l in choir_lines]
    harm, _ = sing_lines(Singer("af_nicole", speed=0.8, vibrato=0.01), harm_lines, DUR, BEAT)
    dbl, harm = childlike(dbl, 1.15), childlike(harm, 1.15)

    music = band()
    # ---------------- vocals: compression, reverb, mix
    V = Track(DUR)
    V.add(0, lead, 0.0, 1.0)
    V.add(0, talk, 0.0, 1.0)
    V.add(0.012, dbl, -0.55, 0.45)
    V.add(0.02, harm, 0.55, 0.38)
    vox = compress(V.buf, 0.18, 3.0)
    ir = reverb_ir(1.6)
    wet = convolve_stereo(vox, ir)
    delay = np.zeros_like(vox)
    dl = int(BEAT * 0.75 * SR)
    delay[dl:] = vox[:-dl] * 0.12
    if os.environ.get("STEMS"):
        def lvl(x):
            return 20 * np.log10(np.sqrt(np.mean(x[int(4.3 * SR):int(41 * SR)] ** 2)) + 1e-12)
        print("vocals %.1f dB  music %.1f dB  uke-band share check" % (lvl(vox * 1.9), lvl(music * 0.5)))
    mix = vox * 1.9 + wet * 0.18 + delay + music * 0.5 + convolve_stereo(music, ir) * 0.03
    mix = master(mix[: int(DUR * SR)])
    write_wav(out_wav, mix)
    # lip-sync envelopes per video frame (toddler = lead + spoken; duck = quacks)
    fps = 30
    hop = SR // fps
    toddler = np.abs(lead[: int(DUR * SR)] + talk[: int(DUR * SR)])
    n = len(toddler) // hop
    env = toddler[: n * hop].reshape(n, hop).mean(axis=1)
    env = np.clip(env / (np.percentile(env[env > 1e-4], 95) + 1e-9), 0, 1)
    np.save(env_path, env)
    import json
    with open(env_path.replace("-mouth.npy", "-words.json"), "w") as f:
        json.dump([dict(t=e["t"], d=e["d"], word=e["word"]) for e in events], f)
    return events


def melody_note(f, dur):
    """Toy piano attack + soft flute sustain: carries the tune in the instrumental sing-along."""
    n = int((dur + 0.4) * SR)
    t = np.arange(n) / SR
    piano = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (3 + 2.5 * k)) for k, a in
                [(1, 1.0), (2, 0.45), (3, 0.2), (4, 0.1)])
    piano *= np.minimum(1, t / 0.003)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.35)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    flute = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    hold = dur * 0.92
    env = np.minimum(1, t / 0.04) * np.clip((hold + 0.12 - t) / 0.12, 0, 1)
    return piano * 0.5 + flute * env * 0.42


def syllable_times():
    """Exact syllable start times (seconds) straight from the note grid."""
    out = []
    for ln in LEAD:
        b = ln["start"]
        k = 0
        for word, nsyl in parse_syllables(ln["text"]):
            for _ in range(nsyl):
                while ln["notes"][k][0] is None:
                    b += ln["notes"][k][1]
                    k += 1
                m, d = ln["notes"][k]
                out.append(dict(t=b * BEAT, d=d * BEAT, word=word, midi=m))
                b += d
                k += 1
    return out


def build_instrumental(out_wav, words_json):
    import json
    music = band()
    M = Track(DUR)
    for e in syllable_times():
        M.add(e["t"], melody_note(hz(e["midi"]), e["d"]), pan=0.0, gain=0.3)
        if LEAD and e["t"] >= CHORUS_FROM * BEAT:   # chorus: octave glock sparkle on the tune
            M.add(e["t"], glock(hz(e["midi"] + 12), 0.05), pan=0.3)
    mel = M.buf
    ir = reverb_ir(1.4)
    mix = mel * 1.0 + convolve_stereo(mel, ir) * 0.12 + music * 0.55 + convolve_stereo(music, ir) * 0.03
    write_wav(out_wav, master(mix[: int(DUR * SR)]))
    with open(words_json, "w") as f:
        json.dump(syllable_times(), f)


if __name__ == "__main__":
    os.makedirs("out", exist_ok=True)
    if "--sung" in sys.argv:
        build("out/veggies-song.wav", "out/veggies-song-mouth.npy")
    else:
        build_instrumental("out/veggies-karaoke.wav", "out/veggies-karaoke-words.json")
    print("done", DUR)
