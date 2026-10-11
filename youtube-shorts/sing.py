"""Turn TTS speech into singing: synthesize each word with Kokoro, stretch its vowels onto the notes and
retune it to the melody with PSOLA (Praat via parselmouth).

Model files (not in git):  voices/kokoro-v1.0.onnx, voices/voices-v1.0.bin  from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
"""
import os
import numpy as np
import parselmouth
from parselmouth.praat import call

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Singer:
    def __init__(self, voice="af_heart", speed=0.8, vibrato=0.014, lang="en-us"):
        from kokoro_onnx import Kokoro
        self.k = Kokoro(os.path.join(HERE, "voices/kokoro-v1.0.onnx"), os.path.join(HERE, "voices/voices-v1.0.bin"))
        self.voice, self.speed, self.vibrato, self.lang = voice, speed, vibrato, lang
        self._cache = {}

    # ------------------------------------------------------------ speech
    def speak(self, word):
        key = word.lower()
        if key not in self._cache:
            a, sr = self.k.create(word, voice=self.voice, speed=self.speed, lang=self.lang)
            a = np.asarray(a, dtype=np.float64)
            env = np.convolve(np.abs(a), np.ones(int(sr * 0.01)) / int(sr * 0.01), mode="same")
            on = np.where(env > env.max() * 0.04)[0]
            a = a[max(0, on[0] - int(sr * 0.01)): on[-1] + int(sr * 0.02)]
            self._cache[key] = parselmouth.Sound(a, sampling_frequency=sr)
        return self._cache[key]

    # ------------------------------------------------------------ singing
    def sing_word(self, word, notes, scoop=True):
        """notes: [(midi, seconds)] one per syllable. Returns (audio@SR, lead_in_seconds)."""
        snd = self.speak(word)
        x0, x1 = snd.xmin, snd.xmax
        n = len(notes)
        pitch = snd.to_pitch(time_step=0.005, pitch_floor=75, pitch_ceiling=600)
        ts = pitch.xs()
        f0 = pitch.selected_array["frequency"]
        voiced_t = ts[f0 > 0]
        # syllable boundaries: equal split refined to intensity dips
        bounds = [x0]
        if n > 1:
            inten = snd.to_intensity(minimum_pitch=100, time_step=0.005)
            it, iv = inten.xs(), inten.values[0]
            vs, ve = (voiced_t[0], voiced_t[-1]) if len(voiced_t) else (x0, x1)
            for i in range(1, n):
                guess = vs + (ve - vs) * i / n
                w = (ve - vs) / n * 0.35
                m = (it > guess - w) & (it < guess + w)
                bounds.append(float(it[m][np.argmin(iv[m])]) if m.any() else guess)
        bounds.append(x1)
        dpts, ppts = [], []
        lead_in = 0.0
        prev_hz = None
        for i, (midi, D) in enumerate(notes):
            s, e = bounds[i], bounds[i + 1]
            hz = midi_hz(midi)
            vt = voiced_t[(voiced_t >= s) & (voiced_t <= e)]
            L = e - s
            if len(vt) >= 3:
                vs, ve = vt[0], vt[-1]
                pre, post, V = vs - s, e - ve, max(1e-3, ve - vs)
                pre_out = min(pre, 0.12)
                post_out = min(post, 0.1)
                f = (D - pre_out - post_out) / V
                if f < 0.5:
                    pre_out, post_out, f = pre * D / L, post * D / L, D / L
                fp = pre_out / pre if pre > 1e-3 else 1.0
                fq = post_out / post if post > 1e-3 else 1.0
                eps = 1e-4
                dpts += [(s, fp), (vs - eps, fp), (vs, f), (ve, f), (ve + eps, fq), (e - eps, fq)]
                if i == 0:
                    lead_in = pre_out
                # pitch: scoop/glide into the note, then vibrato on the sustained part
                g = 0.05 / f
                start_hz = prev_hz if prev_hz else (hz * 0.94 if scoop else hz)
                ppts.append((vs, start_hz))
                ppts.append((min(ve, vs + g), hz))
                k = 1
                while True:
                    tout = k * 0.02
                    to = vs + g + tout / f
                    if to >= ve:
                        break
                    ramp = min(1.0, max(0.0, (tout - 0.18) / 0.25))
                    ppts.append((to, hz * (1 + self.vibrato * ramp * np.sin(2 * np.pi * 5.6 * tout))))
                    k += 1
                ppts.append((ve, hz * (0.985 if i == n - 1 else 1.0)))
            else:
                f = D / max(L, 1e-3)
                dpts += [(s, f), (e - 1e-4, f)]
            prev_hz = hz
        manip = call(snd, "To Manipulation", 0.005, 75, 600)
        pt = call("Create PitchTier", "p", x0, x1)
        for t, hz in sorted(ppts):
            call(pt, "Add point", float(t), float(hz))
        dt = call("Create DurationTier", "d", x0, x1)
        for t, fct in sorted(dpts):
            call(dt, "Add point", float(min(max(t, x0), x1)), float(fct))
        call([pt, manip], "Replace pitch tier")
        call([dt, manip], "Replace duration tier")
        out = call(manip, "Get resynthesis (overlap-add)")
        out = out.resample(SR)
        a = out.values[0].copy()
        fade = int(0.012 * SR)
        a[:fade] *= np.linspace(0, 1, fade)
        a[-fade * 2:] *= np.linspace(1, 0, fade * 2)
        rms = np.sqrt(np.mean(a ** 2)) + 1e-9
        return a * (0.12 / rms), lead_in


def parse_syllables(text):
    """'Bub-bles on my nose' -> [('Bubbles', 2), ('on', 1), ...]"""
    out = []
    for w in text.split():
        parts = w.split("-")
        out.append(("".join(parts), len(parts)))
    return out


def sing_lines(singer, lines, total_seconds, beat):
    """lines: [dict(text, notes=[(midi or None, beats)], start=beats)] -> (vocal track, syllable events)."""
    buf = np.zeros(int(total_seconds * SR) + SR)
    events = []
    for ln in lines:
        t = ln["start"] * beat
        words = parse_syllables(ln["text"])
        notes = ln["notes"]
        ni = 0
        for word, nsyl in words:
            # skip rests
            while notes[ni][0] is None:
                t += notes[ni][1] * beat
                ni += 1
            wn = notes[ni:ni + nsyl]
            ni += nsyl
            durs = [(m, b * beat) for m, b in wn]
            clean = "".join(c for c in word if c.isalpha() or c in "'")
            a, lead = singer.sing_word(clean, [(m, d * 0.97) for m, d in durs])
            i0 = int(max(0, t - lead) * SR)
            buf[i0:i0 + len(a)] += a[: len(buf) - i0]
            tt = t
            for m, d in durs:
                events.append(dict(t=tt, d=d, midi=m, word=word))
                tt += d
            t = tt
    return buf, events
