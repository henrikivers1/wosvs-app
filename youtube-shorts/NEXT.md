# Next video: "Yum Yum Veggies" (AI-image style, like Hoshi Land TV reels)

Status
- Song is done: `python3 veggies_song_audio.py` -> `out/veggies-song.wav` (44 s, 112 BPM),
  `out/veggies-song-words.json` (word timings for karaoke captions).
- Images: made for free by the user in **Google Gemini** (gemini.google.com, free account).
  Gemini keeps the same baby across pictures when you attach picture 1 and ask for "the same baby".
- To do once images are uploaded: build `veggies_video.py` - one image per lyric line (cuts on the bar lines),
  slow Ken Burns zoom/pan, sparkles + butterflies overlay, karaoke captions from the words json,
  "Like & Subscribe" end card, then upload with `yt_upload.py` (category 27, made for kids).

## Free steps for the user
1. Open https://gemini.google.com and sign in with a Google account (free).
2. Paste prompt 1. If it doesn't come out vertical, say "make it vertical 9:16".
3. Download it. For prompts 2-9: attach picture 1 (+ button), then paste the prompt - it starts with
   "The same baby..." so the character stays the same.
4. Upload all 9 pictures to the Claude chat, numbered 1-9 in the file names or the message.

## Prompts (9 pictures)
Style line used in every prompt:
`Pixar-style 3D animation still, soft warm sunlight, vibrant colors, shallow depth of field, vertical 9:16, no text`

1. (intro "Yummy time!") A cute chubby baby girl, about 1 year old, big sparkling brown eyes, rosy cheeks, short wavy
   light-brown hair with a tiny curl on top, wearing yellow dungarees with a sunflower patch, sitting in a wooden high
   chair at a sunny kitchen table. On her plate: a carrot, a broccoli floret and peas, each with a cute smiling cartoon
   face. A teddy bear sits next to her, butterflies at the window. + style line
2. ("Crunchy carrot, orange and bright") The same baby holding up a big orange carrot that has a cute smiling face,
   both of them grinning at each other, close-up. + style line
3. ("Munch, munch, munch, take a big bite") The same baby taking a big happy crunchy bite of the carrot, eyes squeezed
   shut with joy, tiny crumbs flying, close-up. + style line
4. ("Little green trees, broccoli") The same baby holding a broccoli floret like a little tree; the broccoli has a
   smiling face and waves its tiny arm. + style line
5. ("Yummy, yummy, in my tummy") The same baby patting her tummy and giggling, eyes closed, a spoon in her other hand,
   veggies smiling on the plate. + style line
6. ("Yum yum veggies, one, two, three") The same baby clapping while a smiling carrot, broccoli and pea pod dance in a
   row on the table, sparkles in the air. + style line
7. ("Make me strong as strong can be") The same baby flexing her tiny arms like a superhero with a little red cape, the
   smiling veggies cheering. + style line
8. ("Yum yum veggies, every day") The same baby and the smiling veggies dancing together on the kitchen table,
   colorful confetti, teddy bear clapping. + style line
9. ("Now I'm ready, let's go play" + end card) The same baby with an empty plate, waving goodbye happily, teddy bear
   and veggie friends waving too, sunny garden visible through the open door. + style line
