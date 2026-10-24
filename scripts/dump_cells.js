// node scripts/dump_cells.js <frames> <cols> <preset,preset,...>  -> JSON on stdout
// Each frame: the tesseract as pixels (tesseract.js image), through ascii.js with each preset.
'use strict';
const T = require('../tesseract.js');
const A = require('../ascii.js');

const [frames, cols, presets] = [Number(process.argv[2] || 1), Number(process.argv[3] || 60), (process.argv[4] || 'braille').split(',')];
const out = [];
for (let f = 0; f < frames; f++) {
  const im = T.image(f * 0.08, { width: 480, height: 480, thickness: 2.5 });
  out.push(presets.map((p) => {
    const r = A.render(im, { cols, ...A.PRESETS[p] });
    return r.cells.map((row) => row.map((c) => [c.ch, c.rgb]));
  }));
}
process.stdout.write(JSON.stringify({ presets: presets.map((p) => ({ name: p, ...A.PRESETS[p] })), frames: out }));
