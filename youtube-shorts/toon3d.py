"""Soft '3D-look' cartoon rendering with Pillow + numpy: shaded spheres/capsules, bubbles, soft shadows,
supersampled world canvas with a virtual camera, and parallel rendering to video."""
import math, os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, FPS = 1080, 1920, 30
S = 1.5                                  # world supersampling factor
WW, WH = int(W * S), int(H * S)
LIGHT = np.array([-0.45, -0.7, 0.6])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
HALF = LIGHT + np.array([0, 0, 1.0])
HALF = HALF / np.linalg.norm(HALF)


def _shade(nx, ny, nz, color, amb, diff, spec, shin, rim, warm):
    lam = np.clip(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
    sp = np.clip(nx * HALF[0] + ny * HALF[1] + nz * HALF[2], 0, 1) ** shin
    edge = (1 - np.clip(nz, 0, 1)) ** 2.5
    col = np.array(color, float)[None, None, :]
    shade = amb + diff * lam[..., None]
    out = col * shade
    if warm is not None:   # subsurface-ish warm edge tint (skin)
        out = out * (1 - 0.25 * edge[..., None]) + np.array(warm, float) * 0.25 * edge[..., None]
    out += 255 * spec * sp[..., None]
    out += 255 * rim * edge[..., None] * np.clip(-ny + 0.3, 0, 1)[..., None]
    return np.clip(out, 0, 255)


_cache = {}


def sphere(rx, ry, color, amb=0.62, diff=0.5, spec=0.32, shin=28, rim=0.12, warm=None, alpha=1.0):
    """Shaded ellipsoid sprite (world pixels). Cached."""
    rx, ry = max(2, int(rx)), max(2, int(ry))
    key = ("s", rx, ry, tuple(color), amb, diff, spec, shin, rim, warm, alpha)
    if key in _cache:
        return _cache[key]
    ys, xs = np.mgrid[-ry - 1:ry + 2, -rx - 1:rx + 2].astype(float)
    nx, ny = (xs + 0.5) / rx, (ys + 0.5) / ry
    r = np.sqrt(nx ** 2 + ny ** 2)
    nz = np.sqrt(np.clip(1 - r ** 2, 0, 1))
    rgb = _shade(nx, ny, nz, color, amb, diff, spec, shin, rim, warm)
    a = np.clip((1 - r) * min(rx, ry) + 0.5, 0, 1) * alpha
    img = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA")
    if len(_cache) > 4000:
        _cache.clear()
    _cache[key] = img
    return img


def capsule(p0, p1, r, color, amb=0.62, diff=0.5, spec=0.25, shin=20, rim=0.1, warm=None):
    """Shaded tube between two world points. Returns (sprite, (x, y) top-left)."""
    x0, y0 = min(p0[0], p1[0]) - r - 2, min(p0[1], p1[1]) - r - 2
    x1, y1 = max(p0[0], p1[0]) + r + 2, max(p0[1], p1[1]) + r + 2
    ys, xs = np.mgrid[int(y0):int(y1), int(x0):int(x1)].astype(float)
    ax, ay = p0
    bx, by = p1
    vx, vy = bx - ax, by - ay
    L2 = vx * vx + vy * vy + 1e-9
    t = np.clip(((xs - ax) * vx + (ys - ay) * vy) / L2, 0, 1)
    cx, cy = ax + t * vx, ay + t * vy
    dx, dy = (xs - cx) / r, (ys - cy) / r
    d = np.sqrt(dx ** 2 + dy ** 2)
    nz = np.sqrt(np.clip(1 - d ** 2, 0, 1))
    rgb = _shade(dx, dy, nz, color, amb, diff, spec, shin, rim, warm)
    a = np.clip((1 - d) * r + 0.5, 0, 1)
    return Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA"), (int(x0), int(y0))


def bubble_sprite(r):
    r = max(3, int(r))
    key = ("b", r)
    if key in _cache:
        return _cache[key]
    ys, xs = np.mgrid[-r - 1:r + 2, -r - 1:r + 2].astype(float)
    nx, ny = (xs + 0.5) / r, (ys + 0.5) / r
    d = np.sqrt(nx ** 2 + ny ** 2)
    inside = np.clip((1 - d) * r + 0.5, 0, 1)
    edge = np.clip(d, 0, 1) ** 6
    ang = np.arctan2(ny, nx)
    hue = np.stack([0.5 + 0.5 * np.sin(ang * 2 + k) for k in (0, 2.1, 4.2)], -1)
    rgb = 210 + 45 * hue
    a = (0.08 + 0.75 * edge) * inside
    # specular highlights
    for (hx, hy, hr, hs) in [(-0.38, -0.42, 0.22, 1.0), (0.42, 0.45, 0.1, 0.6)]:
        hd = np.sqrt((nx - hx) ** 2 + (ny - hy) ** 2) / hr
        h = np.clip(1 - hd, 0, 1) ** 1.5 * hs
        rgb = rgb * (1 - h[..., None]) + 255 * h[..., None]
        a = np.maximum(a, h * inside)
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), "RGBA")
    _cache[key] = img
    return img


def soft_blob(rx, ry, color, alpha=0.35, blur=0.35):
    rx, ry = max(2, int(rx)), max(2, int(ry))
    key = ("sh", rx, ry, tuple(color), alpha, blur)
    if key in _cache:
        return _cache[key]
    pad = int(max(rx, ry) * blur) + 4
    img = Image.new("RGBA", (2 * rx + 2 * pad, 2 * ry + 2 * pad), tuple(color) + (0,))
    ImageDraw.Draw(img).ellipse([pad, pad, pad + 2 * rx, pad + 2 * ry], fill=tuple(color) + (int(255 * alpha),))
    img = img.filter(ImageFilter.GaussianBlur(max(1, pad / 2)))
    _cache[key] = img
    return img


class Painter:
    """Draws on the world canvas using DESIGN coordinates (1080x1920 space)."""

    def __init__(self, img):
        self.img = img
        self.d = ImageDraw.Draw(img, "RGBA")

    def paste(self, spr, cx, cy, rot=0.0):
        if rot:
            spr = spr.rotate(-rot, Image.BICUBIC, expand=True)
        self.img.paste(spr, (int(cx * S - spr.size[0] / 2), int(cy * S - spr.size[1] / 2)), spr)

    def ball(self, x, y, rx, ry, color, rot=0.0, **kw):
        self.paste(sphere(rx * S, ry * S, color, **kw), x, y, rot)

    def tube(self, p0, p1, r, color, **kw):
        spr, (x, y) = capsule((p0[0] * S, p0[1] * S), (p1[0] * S, p1[1] * S), r * S, color, **kw)
        self.img.paste(spr, (x, y), spr)

    def bubble(self, x, y, r):
        if r > 1:
            self.paste(bubble_sprite(r * S), x, y)

    def shadow(self, x, y, rx, ry, alpha=0.3, color=(40, 60, 90)):
        self.paste(soft_blob(rx * S, ry * S, color, alpha), x, y)

    # flat helpers in design coords
    def ellipse(self, box, **kw):
        self.d.ellipse([v * S for v in box], **_scale_kw(kw))

    def chord(self, box, a, b, **kw):
        self.d.chord([v * S for v in box], a, b, **_scale_kw(kw))

    def arc(self, box, a, b, **kw):
        self.d.arc([v * S for v in box], a, b, **_scale_kw(kw))

    def line(self, pts, **kw):
        self.d.line([(x * S, y * S) for x, y in pts], **_scale_kw(kw))

    def polygon(self, pts, **kw):
        self.d.polygon([(x * S, y * S) for x, y in pts], **_scale_kw(kw))

    def rrect(self, box, r, **kw):
        self.d.rounded_rectangle([v * S for v in box], int(r * S), **_scale_kw(kw))


def _scale_kw(kw):
    kw = dict(kw)
    if "width" in kw:
        kw["width"] = max(1, int(kw["width"] * S))
    return kw


def shoot(world, zoom, focus):
    """Virtual camera: crop the world around `focus` (design coords) at `zoom` and output W x H."""
    cw, ch = WW / zoom, WH / zoom
    x0 = min(max(focus[0] * S - cw / 2, 0), WW - cw)
    y0 = min(max(focus[1] * S - ch / 2, 0), WH - ch)
    return world.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))


def render_parallel(frame_fn, duration, audio_wav, out_path, workers=4, fps=FPS):
    """Render frames in `workers` processes (fork) into segments, then concat and mux with audio."""
    n = int(duration * fps)
    chunks = [(i * n // workers, (i + 1) * n // workers) for i in range(workers)]
    segs = []
    pids = []
    for k, (a, b) in enumerate(chunks):
        seg = out_path.replace(".mp4", f".part{k}.mp4")
        segs.append(seg)
        pid = os.fork()
        if pid == 0:
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                   "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
                   "-pix_fmt", "yuv420p", seg]
            p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            for i in range(a, b):
                p.stdin.write(frame_fn(i / fps).convert("RGB").tobytes())
            p.stdin.close()
            p.wait()
            os._exit(0)
        pids.append(pid)
    for pid in pids:
        os.waitpid(pid, 0)
    lst = out_path.replace(".mp4", ".txt")
    with open(lst, "w") as f:
        for s in segs:
            f.write(f"file '{os.path.abspath(s)}'\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", audio_wav,
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", out_path],
                   check=True)
    for s in segs + [lst]:
        os.remove(s)
