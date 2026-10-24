"""Record media/styles.gif: the same turning tesseract through four ascii.js presets.

Characters and colours come from ascii.js (scripts/dump_cells.js); this only paints them.
    pip install pillow ; python scripts/make_styles_gif.py
"""
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRESETS = ["old_monitor", "braille", "true_colour", "halftone"]
FRAMES, COLS, FS = 40, 52, 9
CW, CH = 6, 11      # character cell in pixels: about twice as tall as wide


def font(names, size):
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            pass
    return ImageFont.load_default()


MONO = font(["consola.ttf", "DejaVuSansMono.ttf"], FS + 1)
SYMB = font(["seguisym.ttf", "DejaVuSans.ttf"], FS + 2)
LABEL = font(["consolab.ttf", "DejaVuSansMono-Bold.ttf"], 13)


def panel(cells, p):
    rows, cols = len(cells), len(cells[0])
    img = Image.new("RGB", (cols * CW, rows * CH + 22), tuple(p.get("bg", (0, 0, 0))))
    d = ImageDraw.Draw(img)
    for j, row in enumerate(cells):
        for i, (ch, rgb) in enumerate(row):
            if ch in (" ", "⠀"):
                continue
            f = SYMB if 0x2800 <= ord(ch) <= 0x28FF else MONO
            d.text((i * CW, j * CH), ch, font=f, fill=tuple(rgb))
    if p.get("bloom"):
        glow = img.filter(ImageFilter.GaussianBlur(3))
        img = Image.blend(img, Image.composite(glow, img, glow.convert("L")), p["bloom"] * 0.6)
        img = Image.eval(img, lambda v: min(255, int(v * 1.15)))
        d = ImageDraw.Draw(img)
    if p.get("scanlines"):
        for y in range(0, img.height, 3):
            d.line((0, y, img.width, y), fill=(0, 0, 0))
    d.rectangle((0, img.height - 22, img.width, img.height), fill=(22, 22, 28))
    d.text((8, img.height - 18), p["name"].replace("_", " "), font=LABEL, fill=(220, 220, 220))
    return img


def main():
    raw = subprocess.run(["node", os.path.join(ROOT, "scripts", "dump_cells.js"), str(FRAMES), str(COLS), ",".join(PRESETS)],
                         capture_output=True, text=True, encoding="utf-8", check=True).stdout
    data = json.loads(raw)
    frames = []
    for fr in data["frames"]:
        ps = [panel(c, p) for c, p in zip(fr, data["presets"])]
        w, h = ps[0].size
        sheet = Image.new("RGB", (w * 2 + 6, h * 2 + 6), (40, 40, 48))
        for k, im in enumerate(ps):
            sheet.paste(im, ((k % 2) * (w + 6), (k // 2) * (h + 6)))
        frames.append(sheet.convert("P", palette=Image.ADAPTIVE, colors=128))
    out = os.path.join(ROOT, "media", "styles.gif")
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=80, loop=0, optimize=True)
    print(out, len(frames), "frames", os.path.getsize(out) // 1024, "KB", frames[0].size)


if __name__ == "__main__":
    main()
