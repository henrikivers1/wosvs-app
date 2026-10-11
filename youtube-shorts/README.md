# YouTube Shorts toolkit

Sing-along nursery-rhyme Shorts (1080×1920) rendered with Python (Pillow + numpy) and ffmpeg.

## Render
```
cd youtube-shorts && mkdir -p out
python3 twinkle.py   # out/twinkle-twinkle-short.mp4
python3 spider.py    # out/itsy-bitsy-spider-short.mp4
python3 brush.py     # out/brush-your-teeth-short.mp4
python3 twinkle.py 4 17   # preview PNG frames at 4s and 17s instead of rendering
```

## Funny sketches (wordless slapstick)
`sketchkit.py` adds sprites with squash & stretch, keyframes, camera shake, cartoon SFX and gibberish voices.
```
python3 humpty.py         # out/humpty-dumpty-sketch.mp4
python3 cow.py            # out/hey-diddle-diddle-sketch.mp4
python3 spider_slide.py   # out/itsy-bitsy-waterslide-sketch.mp4
python3 cow.py 4 11       # preview PNG frames instead of rendering
```

## Original songs with sung vocals ("Bath Time Bubbles")
Soft 3D-look toddler video with an AI-sung original song.
Setup (once): `pip install kokoro-onnx praat-parselmouth soundfile` and download `kokoro-v1.0.onnx` + `voices-v1.0.bin`
from https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 into `voices/`.
```
python3 bath_song_audio.py   # song: Kokoro TTS words retuned onto the melody (sing.py) + band (studio.py)
python3 bath_song.py         # video: soft-3D renderer (toon3d.py), 4 parallel workers
python3 bath_song.py 9.5     # preview a frame into out/pv/
```
`fonts/Fredoka.ttf` is under the SIL Open Font License (`fonts/OFL.txt`).

## Upload
Needs `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` in the environment.
```
python3 yt_upload.py --check
python3 yt_upload.py out/twinkle-twinkle-short.mp4 --title "Twinkle Twinkle Little Star ⭐ Sing-Along #shorts" \
    --tags "nursery rhymes,kids songs,sing along" --privacy private
```
Uploads default to **private** and **Made for Kids**. `--publish-at 2026-10-20T15:00:00Z` schedules one.
