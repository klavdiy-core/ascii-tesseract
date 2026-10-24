'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../ascii.js');

// an RGBA image of w x h filled by f(x, y) -> [r, g, b]
function img(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = f(x, y);
    data.set([r, g, b, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}
const flat = (v) => img(40, 40, () => [v, v, v]);

test('black is the first character of the ramp, white the last', () => {
  for (const style of ['classic', 'detailed', 'blocks', 'dots', 'binary']) {
    const ramp = A.STYLES[style];
    assert.equal(A.render(flat(0), { cols: 10, style }).cells[0][0].ch, ramp[0], style);
    assert.equal(A.render(flat(255), { cols: 10, style }).cells[0][0].ch, ramp[ramp.length - 1], style);
  }
});

test('brighter input never picks a sparser character', () => {
  const ramp = A.STYLES.classic;
  let last = -1;
  for (let v = 0; v <= 255; v += 5) {
    const i = ramp.indexOf(A.render(flat(v), { cols: 4, style: 'classic' }).cells[0][0].ch);
    assert.ok(i >= last, `v=${v}`);
    last = i;
  }
});

test('invert swaps the ends', () => {
  const ramp = A.STYLES.classic;
  assert.equal(A.render(flat(0), { cols: 4, invert: true }).cells[0][0].ch, ramp[ramp.length - 1]);
});

test('custom characters are used as the ramp, sparse to dense', () => {
  assert.equal(A.render(flat(0), { cols: 4, style: 'custom', chars: 'ab' }).cells[0][0].ch, 'a');
  assert.equal(A.render(flat(255), { cols: 4, style: 'custom', chars: 'ab' }).cells[0][0].ch, 'b');
});

test('size: cols as asked, rows follow the aspect with tall character cells', () => {
  const r = A.render(img(200, 100, () => [9, 9, 9]), { cols: 50 });
  assert.equal(r.cols, 50);
  assert.equal(r.rows, 13);   // 100/200*50 = 25 square cells -> /2 for cells twice as tall, rounded
  assert.equal(r.cells.length, r.rows);
  assert.ok(r.cells.every((row) => row.length === 50));
});

test('braille packs 2x4 dots per character', () => {
  const on = A.render(flat(255), { cols: 5, style: 'braille' }).cells[1][1].ch;
  const off = A.render(flat(0), { cols: 5, style: 'braille' }).cells[1][1].ch;
  assert.equal(on, '⣿');
  assert.equal(off, '⠀');
  // left half lit, right half dark: dots 1,2,3,7 = 0x01|0x02|0x04|0x40
  const half = img(80, 80, (x) => (x % 2 === 0 ? [255, 255, 255] : [0, 0, 0]));
  assert.equal(A.render(half, { cols: 40, style: 'braille' }).cells[2][2].ch, String.fromCharCode(0x2800 + 0x47));
});

test('colour: original keeps the source colour, mono uses the ink, palette maps by brightness', () => {
  const red = img(20, 20, () => [200, 30, 30]);
  assert.deepEqual(A.render(red, { cols: 4, colour: 'original' }).cells[0][0].rgb, [200, 30, 30]);
  assert.deepEqual(A.render(red, { cols: 4, colour: 'mono', ink: [0, 255, 0] }).cells[0][0].rgb, [0, 255, 0]);
  assert.deepEqual(A.render(red, { cols: 4, colour: 'original', boost: 0.5 }).cells[0][0].rgb, [255, 45, 45]);
  const pal = [[0, 0, 0], [255, 255, 255]];
  assert.deepEqual(A.render(flat(250), { cols: 4, colour: 'palette', palette: pal }).cells[0][0].rgb, [255, 255, 255]);
  assert.deepEqual(A.render(flat(5), { cols: 4, colour: 'palette', palette: pal }).cells[0][0].rgb, [0, 0, 0]);
});

test('contrast and gamma move the middle, not the ends', () => {
  const mid = A.render(flat(128), { cols: 4 }).cells[0][0].lum;
  assert.ok(A.render(flat(128), { cols: 4, gamma: 2 }).cells[0][0].lum > mid);
  assert.ok(A.render(flat(100), { cols: 4, contrast: 1 }).cells[0][0].lum < A.render(flat(100), { cols: 4 }).cells[0][0].lum);
  assert.equal(A.render(flat(255), { cols: 4, contrast: 1, gamma: 2 }).cells[0][0].lum, 1);
  assert.equal(A.render(flat(0), { cols: 4, contrast: 1, gamma: 2 }).cells[0][0].lum, 0);
});

test('toText: one line per row, same output for the same input', () => {
  const src = img(64, 32, (x, y) => [x * 4, y * 8, 128]);
  const a = A.toText(A.render(src, { cols: 32 }));
  assert.equal(a, A.toText(A.render(src, { cols: 32 })));
  assert.equal(a.split('\n').length, 8);
});

test('presets are valid option sets', () => {
  for (const [name, p] of Object.entries(A.PRESETS)) {
    const r = A.render(flat(128), { cols: 8, ...p });
    assert.ok(r.cells[0][0].ch.length === 1, name);
  }
});

test('the tesseract as pixels: sized, dark corners, 16 white corners, coloured edges, deterministic', () => {
  const T = require('../tesseract.js');
  const im = T.image(0, { width: 200, height: 160 });
  assert.equal(im.data.length, 200 * 160 * 4);
  assert.deepEqual([...im.data.slice(0, 4)], [0, 0, 0, 255]);
  const R = T.vertices().map((p) => T.rotate(p, T.angles(0)));
  let white = 0, coloured = 0;
  for (let k = 0; k < im.data.length; k += 4) {
    const [r, g, b] = im.data.slice(k, k + 3);
    if (r === 255 && g === 255 && b === 255) white++;
    else if (Math.max(r, g, b) - Math.min(r, g, b) > 60) coloured++;
  }
  assert.ok(white >= 16 && coloured > 500, `white ${white} coloured ${coloured}`);
  assert.equal(R.length, 16);
  assert.deepEqual(T.image(1.3, { width: 60, height: 60 }).data, T.image(1.3, { width: 60, height: 60 }).data);
  // and it goes through the converter
  const res = A.render(im, { cols: 40, style: 'braille', colour: 'original' });
  assert.ok(A.toText(res).replace(/[⠀\n]/g, '').length > 20);
});

test('unknown style is an error, not a silent default', () => {
  assert.throws(() => A.render(flat(1), { cols: 4, style: 'nope' }), /style/);
});
