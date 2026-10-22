"""
The app's drawn assets, from one place: the app icon, the menu bar icon and
the chime. Standard library only, so it runs anywhere python3 does.

    python3 scripts/make-assets.py
    npx tauri icon src-tauri/icons/app-icon.png

The mark is the timer itself: a ring with three quarters filled.
Shapes are drawn as distance fields, so the edges are anti-aliased without
supersampling.
"""

import math
import struct
import wave
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "src-tauri" / "icons"
SOUNDS = ROOT / "src-tauri" / "sounds"

CREAM = (0xFB, 0xF8, 0xF4)
LAVENDER_SOFT = (0xEC, 0xE3, 0xF3)
TRACK = (0xE2, 0xD6, 0xEE)
ACCENT = (0x8C, 0x7A, 0xA9)


def write_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    """pixels: RGBA, row-major."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * stride : (y + 1) * stride])

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def coverage(distance: float) -> float:
    """Signed distance (negative inside) to pixel coverage."""
    return max(0.0, min(1.0, 0.5 - distance))


def rounded_rect(x: float, y: float, cx: float, cy: float, half: float, radius: float) -> float:
    qx = abs(x - cx) - (half - radius)
    qy = abs(y - cy) - (half - radius)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - radius


def ring(x: float, y: float, cx: float, cy: float, r: float, width: float) -> float:
    return abs(math.hypot(x - cx, y - cy) - r) - width / 2


def arc(x: float, y: float, cx: float, cy: float, r: float, width: float, sweep: float) -> float:
    """An arc from twelve o'clock clockwise through `sweep` radians, round caps."""
    dx, dy = x - cx, y - cy
    angle = math.atan2(dx, -dy) % (2 * math.pi)  # 0 at the top, clockwise
    if angle <= sweep:
        return abs(math.hypot(dx, dy) - r) - width / 2
    ends = [(cx, cy - r), (cx + r * math.sin(sweep), cy - r * math.cos(sweep))]
    return min(math.hypot(x - ex, y - ey) for ex, ey in ends) - width / 2


def over(dst: list, color: tuple, alpha: float) -> None:
    """Source-over onto a premultiplied-free RGBA float pixel."""
    if alpha <= 0:
        return
    out_a = alpha + dst[3] * (1 - alpha)
    for i in range(3):
        dst[i] = (color[i] * alpha + dst[i] * dst[3] * (1 - alpha)) / out_a if out_a else 0
    dst[3] = out_a


def app_icon(size: int = 1024) -> None:
    # The macOS icon grid: an 824-point squircle-ish tile inside 1024.
    half = size * 412 / 1024
    radius = size * 185 / 1024
    c = size / 2
    ring_r = size * 238 / 1024
    ring_w = size * 70 / 1024
    sweep = 1.5 * math.pi

    pixels = bytearray(size * size * 4)
    for y in range(size):
        t = y / size
        tile_color = tuple(round(CREAM[i] * (1 - t) + LAVENDER_SOFT[i] * t) for i in range(3))
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            p = [0.0, 0.0, 0.0, 0.0]

            # A soft shadow under the tile, then the tile.
            shadow = rounded_rect(px, py - size * 10 / 1024, c, c, half, radius)
            over(p, (0x5E, 0x54, 0x70), 0.22 * max(0.0, min(1.0, 1 - (shadow + 18) / 36)) if shadow < 18 else 0)
            over(p, tile_color, coverage(rounded_rect(px, py, c, c, half, radius)))

            if p[3] > 0:
                over(p, TRACK, coverage(ring(px, py, c, c, ring_r, ring_w)) * p[3])
                over(p, ACCENT, coverage(arc(px, py, c, c, ring_r, ring_w, sweep)) * p[3])

            o = (y * size + x) * 4
            pixels[o : o + 4] = bytes((round(p[0]), round(p[1]), round(p[2]), round(p[3] * 255)))

    write_png(ICONS / "app-icon.png", size, size, pixels)


def tray_icon(size: int = 44) -> None:
    """A template image: black on nothing, recoloured by macOS. The track is
    faint and the filled arc solid, so it reads as a timer at menu bar size."""
    c = size / 2
    r = size * 0.33
    w = size * 0.11
    pixels = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            a = max(
                0.35 * coverage(ring(px, py, c, c, r, w)),
                coverage(arc(px, py, c, c, r, w, 1.5 * math.pi)),
            )
            o = (y * size + x) * 4
            pixels[o : o + 4] = bytes((0, 0, 0, round(a * 255)))
    write_png(ICONS / "tray.png", size, size, pixels)


def chime(rate: int = 44100) -> None:
    """The same two soft notes as the browser chime (src/lib/sound.ts)."""
    length = 2.0
    notes = [(659.25, 0.0), (987.77, 0.22)]  # E5, then B5
    frames = bytearray()
    for n in range(int(rate * length)):
        t = n / rate
        sample = 0.0
        for freq, start in notes:
            u = t - start
            if u < 0:
                continue
            attack = min(1.0, u / 0.02)
            decay = math.exp(-u * 4.2)
            sample += 0.32 * attack * decay * math.sin(2 * math.pi * freq * u)
        frames += struct.pack("<h", max(-32767, min(32767, int(sample * 32767))))
    with wave.open(str(SOUNDS / "chime.wav"), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(bytes(frames))


if __name__ == "__main__":
    ICONS.mkdir(parents=True, exist_ok=True)
    SOUNDS.mkdir(parents=True, exist_ok=True)
    app_icon()
    tray_icon()
    chime()
    print("wrote", ICONS / "app-icon.png", ICONS / "tray.png", SOUNDS / "chime.wav")
