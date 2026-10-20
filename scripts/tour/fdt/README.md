# Frostdragon Tyrant guide video

About 1:38 for YouTube, made like the landing video (`../README.md`): the
explainer scenes are drawn on a canvas, the planner scenes are recorded from
the real demo, the voice is Kokoro and the music is synthesized. Nothing here
uses game art or stock media.

| Step | Command | Output |
|---|---|---|
| Build and serve the app | `npm run build && npx next start -p 3125` (any Supabase URL/key will do; the demo is offline) | |
| App scenes | `CHROMIUM_PATH=... node record.mjs <work>` | `<work>/vid/seg-*.txt` → encode each to `<work>/vid/clip-<scene>.mp4` (ffmpeg concat, 30 fps, 1920×1080) |
| Explainer scenes | `node anim.mjs <work> <title\|alliance\|map\|tyrant\|end> <seconds>` (5.1, 9.7, 12.9, 8.3, 5.6) | frames → `clip-<scene>.mp4` |
| Thumbnail | `node anim.mjs <work> thumb 0 0` | `still-thumb-0.jpg` (scale to 1280×720) |
| Narration | `python ../narrate.py` with `narration.json` and the Kokoro model files | `vo-<scene>.wav` |
| Music, timeline | `python compose.py <work>/vid <narration dir>` | `music.wav`, `vo.wav`, `timeline.json` |
| Final video | `python assemble.py <work>/vid <out>` | `frostdragon-tyrant-guide.mp4` |

- Scene lengths follow the narration: 0.25 s + half the incoming transition
  + the line + about a second + the outgoing transition. The app scenes'
  lengths are `LEN` in `record.mjs`; the order and transitions are `ORDER` in
  `compose.py`.
- `record.mjs` adds the other members' votes and most targets straight into
  the demo's browser storage off camera, so the lineup looks like a real state.
- The FDT rules shown (Capital and four Spires with their buffs, 30-minute
  open/protected cycles, up to 60 players per alliance, the rally captain's
  Capital hold time decides the Tyrant) come from community guides; buff
  sizes and battle length vary between sources, so the video leaves them out.
