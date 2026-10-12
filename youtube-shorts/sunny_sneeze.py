"""Baby Sunny ep. 1 - "Sunny's Super Sneeze Blasts Teddy Away" (catch it in your elbow).

    python3 sunny_sneeze.py audio    # out/sunny-sneeze.wav (+ timing check)
    python3 sunny_sneeze.py 3 11     # preview frames into out/pv/
    python3 sunny_sneeze.py          # audio + 60 fps video -> out/sunny-sneeze.mp4
"""
import sys
from story_short import Episode

D4, E4, Fs4, G4, A4, B4, Cs5, D5 = 62, 64, 66, 67, 69, 71, 73, 74

SPEC = dict(
    name="sunny-sneeze", bpm=112, total_beats=60, end_beat=52, assets="assets/sunny-sneeze", end_image=5,
    title=("Sunny's Super", "SNEEZE!"),
    lines=[
        dict(start=4, text="Tick-le, tick-le, in my nose,",
             notes=[(A4, .5), (Fs4, .5), (A4, .5), (Fs4, .5), (B4, 1), (A4, 1), (Fs4, 3), (None, 1)]),
        dict(start=12, text="Ah... ah... here it goes!",
             notes=[(A4, 1.5), (B4, 1.5), (Cs5, 1), (Cs5, 1), (D5, 2), (None, 1)]),
        dict(start=20, text="A-choo! Oh no, Ted-dy flew!",
             notes=[(A4, .5), (D5, 1.5), (B4, 1), (G4, 1), (A4, .5), (A4, .5), (Fs4, 3)]),
        dict(start=28, text="Catch your sneeze in your el-bow, too!",
             notes=[(Fs4, .5), (G4, .5), (A4, 1), (G4, .5), (Fs4, .5), (E4, 1), (Fs4, 1), (D4, 3)]),
        dict(start=36, text="Wash your hands with soap and bub-bles,",
             notes=[(A4, .5), (B4, .5), (Cs5, 1), (B4, .5), (A4, .5), (G4, 1), (A4, 1), (E4, 3)]),
        dict(start=44, text="Now we're clean, hoo-ray for you!",
             notes=[(D5, .5), (Cs5, .5), (B4, 1), (A4, 1), (G4, .5), (Fs4, .5), (D4, 4)]),
    ],
    chords=[(0, "D"), (4, "D"), (8, "A"), (12, "G"), (16, "A"), (20, "D"), (22, "G"), (24, "D"), (28, "D"),
            (32, "A"), (33, "D"), (36, "A"), (38, "D"), (40, "A"), (44, "D"), (46, "G"), (48, "D"), (52, "G"),
            (54, "A"), (56, "D")],
    # (start beat, image, zoom from, zoom to, focus from, focus to) - one smooth move per line
    shots=[(0, 1, 1.0, 1.06, (.5, .5), (.5, .45)), (4, 1, 1.06, 1.16, (.5, .45), (.52, .36)),
           (12, 2, 1.0, 1.1, (.5, .45), (.48, .42)), (20, 3, 1.12, 1.0, (.6, .45), (.55, .48)),
           (28, 4, 1.0, 1.1, (.45, .5), (.42, .42)), (36, 5, 1.0, 1.1, (.5, .5), (.45, .45)),
           (44, 5, 1.12, 1.02, (.55, .55), (.5, .5))],
    sfx=[(5, "trill"), (12, "slide_up"), (13.5, "slide_up"), (20, "whoosh"), (20.5, "boing"), (36, "pop"),
         (37, "pop"), (38.5, "pop"), (44, "sparkle")],
)

for ln in SPEC["lines"]:
    assert sum(b for _, b in ln["notes"]) == 8, ln["text"]

if __name__ == "__main__":
    ep = Episode(SPEC)
    args = sys.argv[1:]
    if args and args[0] != "audio":
        import os
        os.makedirs("out/pv", exist_ok=True)
        for x in map(float, args):
            ep.frame(x).save(f"out/pv/sneeze_t{x:05.1f}.png")
        sys.exit()
    ep.build_audio()
    n, med, mx = ep.check_timing()
    print(f"timing: {n} notes, median {med:.1f} ms, max {mx:.1f} ms off the grid")
    if not args:
        print(ep.render())
