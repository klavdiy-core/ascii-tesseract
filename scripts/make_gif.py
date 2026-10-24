"""Record the terminal animation into a GIF for the README.

    python scripts/make_gif.py out.gif [--slice] [--frames 150] [--fps 15] [--font path/to/mono.ttf]

Needs Node and Pillow. Frames come from `node tesseract.js --frames N`.
"""
import argparse
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

FONTS = ["C:/Windows/Fonts/consola.ttf", "/System/Library/Fonts/Menlo.ttc",
         "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]
BG, FG = (11, 11, 13), (232, 176, 74)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--slice", action="store_true")
    ap.add_argument("--frames", type=int, default=150)
    ap.add_argument("--fps", type=int, default=15)
    ap.add_argument("--width", type=int, default=64)
    ap.add_argument("--height", type=int, default=28)
    ap.add_argument("--font")
    a = ap.parse_args()

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cmd = ["node", os.path.join(here, "tesseract.js"), "--frames", str(a.frames), "--fps", str(a.fps),
           "--width", str(a.width), "--height", str(a.height)] + (["--slice"] if a.slice else [])
    text = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    frames = [f.strip("\n") for f in text.split("\f") if f.strip()]

    font_path = a.font or next(p for p in FONTS if os.path.exists(p))
    font = ImageFont.truetype(font_path, 14)
    cw = font.getbbox("M")[2]
    ch = 15
    w, h = cw * a.width + 24, ch * a.height + 24
    images = []
    for f in frames:
        im = Image.new("P", (w, h))
        im.putpalette(list(BG) + list(FG) + [0] * 762)
        d = ImageDraw.Draw(im)
        for i, line in enumerate(f.split("\n")):
            d.text((12, 12 + i * ch), line, fill=1, font=font)
        images.append(im)
    images[0].save(a.out, save_all=True, append_images=images[1:], duration=int(1000 / a.fps), loop=0,
                   optimize=True)
    print(f"{a.out}: {len(images)} frames, {os.path.getsize(a.out) // 1024} KB")


if __name__ == "__main__":
    main()
