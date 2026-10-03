# Landing video

`public/video/overwatch-tour.*`: about 57 seconds, made from the real demo.
Everything here is local: no recording service, no stock media.

| Step | Command | Output |
|---|---|---|
| Build and serve the app | `npm run build && npx next start -p 3125` (any Supabase URL/key will do; the demo is offline) | |
| App scenes | `CHROMIUM_PATH=... node scripts/tour/record.mjs <work>` | `<work>/vid/seg-*.txt` frame lists → encode each to `<work>/vid/clip-<scene>.mp4` (ffmpeg concat, 30 fps) |
| Title, castle, end card | `node scripts/tour/anim.mjs <work> <title\|castle\|end> <seconds>` | frames → `clip-<scene>.mp4` |
| Narration | `python narrate.py` in a folder with the Kokoro model files | `vo-<scene>.wav` |
| Music, timeline | `python scripts/tour/compose.py <work>/vid <narration dir>` | `music.wav`, `vo.wav`, `timeline.json` |
| Final video | `python scripts/tour/assemble.py <work>/vid public/video` | mp4 (H.264/AAC) and webm (VP9/Opus) |

- **Voice:** [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0),
  voice `af_heart`, model files `kokoro-v1.0.int8.onnx` and `voices-v1.0.bin`
  from the kokoro-onnx GitHub release. Lines are in `narration.json`.
- **Music:** synthesized by `compose.py` (original, no samples), timed to the
  scenes: the riser and hit land on SEND NOW, the bells on the garrison landing.
- **Castle scene:** `anim.html` is our own illustration of the recorded battle
  (Ember and Inferno 6.1 s apart, the garrison landing between them), not game art.
- **Fonts:** Archivo and IBM Plex Mono (SIL Open Font License).
- Scene lengths and transitions are set in `record.mjs` (`seg(name, seconds)`)
  and `compose.py` (`ORDER`). `SEND_NOW_IN_GARRISON` is when SEND NOW turns
  green in the garrison clip.
