import json, subprocess, sys
V = sys.argv[1]; OUT = sys.argv[2]
tl = json.load(open(f"{V}/timeline.json"))
clips = tl["clips"]
inputs, filters = [], []
for i, c in enumerate(clips):
    inputs += ["-i", f"{V}/clip-{c['name']}.mp4"]
    filters.append(f"[{i}:v]fps=30,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v{i}]")
prev = "v0"; length = clips[0]["dur"]
for i in range(1, len(clips)):
    t = clips[i - 1]
    offset = length - t["tdur"]
    out = f"x{i}"
    filters.append(f"[{prev}][v{i}]xfade=transition={t['trans']}:duration={t['tdur']}:offset={offset:.3f}[{out}]")
    prev = out; length = offset + clips[i]["dur"]
n = len(clips)
inputs += ["-i", f"{V}/music.wav", "-i", f"{V}/vo.wav"]
filters.append(f"[{n+1}:a]highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=1.0,asplit=2[vo][sc]")
filters.append(f"[{n}:a]volume=0.55[mus]")
filters.append("[mus][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350:makeup=1[duck]")
filters.append("[duck][vo]amix=inputs=2:normalize=0:weights=1 1,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo[a]")
cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filters), "-map", f"[{prev}]", "-map", "[a]",
       "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
       "-c:a", "aac", "-b:a", "160k", "-t", f"{tl['total']:.3f}", f"{OUT}/overwatch-tour.mp4"]
subprocess.run(cmd, check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"{OUT}/overwatch-tour.mp4", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1",
                "-c:a", "libopus", "-b:a", "128k", f"{OUT}/overwatch-tour.webm"], check=True)
print("done", tl["total"])
