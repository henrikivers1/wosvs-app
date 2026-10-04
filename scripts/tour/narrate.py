import json, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("kokoro-v1.0.int8.onnx", "voices-v1.0.bin")
out = {}
for name, text in json.load(open("narration.json")):
    samples, sr = k.create(text, voice="af_heart", speed=1.05, lang="en-us")
    sf.write(f"vo-{name}.wav", samples, sr)
    out[name] = round(len(samples) / sr, 2)
json.dump(out, open("durations.json", "w"))
print(out, "total", round(sum(out.values()), 1))
