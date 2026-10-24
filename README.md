# ascii-tesseract

A 4D cube turning in ASCII. Pure JavaScript, no dependencies, one file. Runs in a terminal and in a browser.

> RU: тессеракт — четырёхмерный куб — вращается в ASCII. Чистый JS, один файл, терминал и браузер. Режим среза: мы живём в 3D и видим только срез, а «сейчас» скользит по четвёртой оси.

**Live:** https://klavdiy-core.github.io/ascii-tesseract/ · slice mode: https://klavdiy-core.github.io/ascii-tesseract/?slice

| whole | slice |
|---|---|
| ![the tesseract turning](media/tesseract.gif) | ![a 3D slice sliding through it](media/slice.gif) |

## Run

```sh
npx github:klavdiy-core/ascii-tesseract          # or:
git clone https://github.com/klavdiy-core/ascii-tesseract && cd ascii-tesseract
node tesseract.js            # s = slice / whole, q = quit
node tesseract.js --slice --speed 0.5
node tesseract.js --frames 1 --width 80 --height 30   # print one frame and exit
```

In a browser, open `index.html`: click or press `s` to switch modes, space to pause. As a library: `Tesseract.frame(t, { width, height, slice })` returns one frame as a string (in Node: `require('./tesseract.js')`).

## What you are looking at

**Whole.** The 16 corners `(±1, ±1, ±1, ±1)` and the 32 edges between corners that differ in one coordinate. They turn in three planes at once: XW (the one that has no 3D counterpart, which is why the inner cube seems to turn inside out through the outer one), YZ and XY. Then two perspective projections: 4D → 3D with the eye on the w axis (`k = 1 / (3 − w)`), 3D → 2D the usual way. The character ramp ` .:-=+*#%@` follows depth: nearer is denser. `@` marks the corners.

**Slice.** A 3D being never sees the whole thing; it meets a tesseract one 3D cross-section at a time, the way a flatlander meets a cube as a square that grows and shrinks. In slice mode "now" is a hyperplane `w = c` that slides back and forth along the fourth axis. The bright shape is the exact cross-section at that instant: each of the tesseract's 24 square faces that the hyperplane cuts gives one segment of it. The dots are the whole tesseract it is cut from. With no rotation, the slice at `w = 0` is a cube; tilted, it becomes polyhedra that grow, turn into each other and vanish.

## Test

```sh
npm test
```

Hand-checked facts, not snapshots: 16 corners, 32 edges of length 2 with four at each corner, 24 square faces; rotation keeps length and a quarter turn in XW sends x to w; the perspective factor is `1/(d − w)`; the slice at `w = 0` of an unrotated tesseract is a cube (8 corners, 12 edges of length 2), a slice outside is empty, and a tilted slice is a closed polyhedron (every corner meets at least three edges); frames are deterministic and sized as asked.

`scripts/make_gif.py` re-records the GIFs (Node + Pillow).

## License

MIT
