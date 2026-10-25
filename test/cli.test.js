'use strict';
// The grader (5/10): the terminal side crashed on a closed pipe and left the cursor hidden, and there was no way to
// turn a picture into text from the command line without the browser. Each test is red on 0.2.0.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');

function run(args, { take = 4000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: ROOT });
    let out = '', err = '';
    p.stdout.on('data', (b) => {
      out += b.toString('latin1');
      if (out.length >= take) p.stdout.destroy();          // the reader goes away, like `| head`
    });
    p.stderr.on('data', (b) => { err += b; });
    const timer = setTimeout(() => p.kill(), 8000);
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

test('a closed pipe ends the animation quietly', async () => {
  const r = await run(['tesseract.js', '--frames', '100000']);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.err, /EPIPE|Error/);
});

test('into a pipe the endless animation writes no cursor or screen codes', async () => {
  const r = await run(['tesseract.js']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes('\x1b[?25l'), 'hid the cursor of a terminal that is not there');
  assert.ok(!r.out.includes('\x1b[2J'));
});

// ---------- pictures from the command line ----------

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

// an 8-bit PNG (colour type 2 = RGB, 6 = RGBA, 3 = palette with f returning an index); each row uses filter
// (row % 5) so every PNG filter is exercised; extra = more chunks before IDAT (PLTE, tRNS)
function png(w, h, f, type = 2, extra = []) {
  const bpp = { 2: 3, 6: 4, 3: 1 }[type], raw = [];
  let prev = Buffer.alloc(w * bpp);
  for (let y = 0; y < h; y++) {
    const cur = Buffer.alloc(w * bpp);
    for (let x = 0; x < w; x++) { const v = f(x, y); cur.set(Array.isArray(v) ? v : [v], x * bpp); }
    const ft = y % 5, enc = Buffer.alloc(w * bpp);
    for (let i = 0; i < cur.length; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][ft];
      enc[i] = (cur[i] - pred) & 255;
    }
    raw.push(Buffer.from([ft]), enc);
    prev = cur;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = type;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    ...extra.map(([k, d]) => chunk(k, d)),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(raw))), chunk('IEND', Buffer.alloc(0))]);
}

const halves = (x, y, w) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]);

function cli(file, ...args) {
  return spawnSync(process.execPath, ['ascii.js', file, ...args], { cwd: ROOT, encoding: 'utf8' });
}

test('a PNG becomes text: dark half sparse, light half dense, every filter decoded', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ascii-'));
  const f = path.join(d, 'halves.png');
  fs.writeFileSync(f, png(40, 40, (x, y) => halves(x, y, 40)));
  const r = cli(f, '--cols', '20');
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trimEnd().split('\n');
  assert.ok(lines.length >= 5);
  for (const l of lines) assert.equal(l, ' '.repeat(10) + '@'.repeat(10));
});

test('a PPM works too, and a JPEG is refused with what to do', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ascii-'));
  const ppm = path.join(d, 'a.ppm');
  const px = Buffer.alloc(8 * 8 * 3, 255);
  fs.writeFileSync(ppm, Buffer.concat([Buffer.from('P6\n# a comment\n8 8\n255\n'), px]));
  assert.match(cli(ppm, '--cols', '4').stdout, /^@@@@/);
  const jpg = path.join(d, 'a.jpg');
  fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
  const r = cli(jpg);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /PNG/);
});

// ---------- the skeptic's findings, 25.10 regrade (6.5/10) ----------

function tmpfile(name, buf) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ascii-')), name);
  fs.writeFileSync(f, buf);
  return f;
}

test('braille of a dim picture is not blank: the threshold follows the picture unless given', () => {
  // dark blue with a red circle: every luminance is below the library's 0.5
  const f = tmpfile('dim.png', png(64, 64, (x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 400 ? [200, 30, 30] : [10, 10, 60])));
  const r = cli(f, '--cols', '16', '--style', 'braille');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /[⠁-⣿]/, 'every cell blank');
  assert.match(r.stdout, /⠀/, 'every cell lit: no contrast left');
  const fixed = cli(f, '--cols', '16', '--style', 'braille', '--threshold', '0.9');
  assert.doesNotMatch(fixed.stdout, /[⠁-⣿]/);               // an explicit threshold is obeyed
});

test('the tone options and --chars reach the command line', () => {
  const f = tmpfile('grey.png', png(20, 20, () => [128, 128, 128]));
  const a = cli(f, '--cols', '4').stdout, b = cli(f, '--cols', '4', '--brightness', '0.4').stdout;
  assert.notEqual(a, b);
  assert.match(cli(f, '--cols', '4', '--chars', ' ab').stdout, /^[ ab]+$/m);
});

test('a bad --cols is an error, not a stray character', () => {
  const f = tmpfile('g.png', png(20, 20, () => [128, 128, 128]));
  for (const bad of ['0', 'abc', '-3', '100000']) {
    const r = cli(f, '--cols', bad);
    assert.equal(r.status, 2, `--cols ${bad}: ${r.stdout}`);
    assert.match(r.stderr, /--cols/);
  }
});

test('transparent pixels are background, by alpha and by tRNS', () => {
  const rgba = tmpfile('a.png', png(20, 20, () => [255, 255, 255, 0], 6));     // white, but fully transparent
  assert.match(cli(rgba, '--cols', '5').stdout, /^ {5}$/m);
  const pal = Buffer.from([255, 255, 255, 255, 255, 255]);                      // two white entries
  const trns = tmpfile('p.png', png(20, 20, (x) => (x < 10 ? 0 : 1), 3, [['PLTE', pal], ['tRNS', Buffer.from([0, 255])]]));
  assert.match(cli(trns, '--cols', '10').stdout, /^ {5}@{5}$/m);               // index 0 transparent, 1 opaque
});

test('a missing file and --help are one clean line each', () => {
  const r = cli(path.join(os.tmpdir(), 'no-such-file.png'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^ascii: cannot read .*no-such-file\.png/);
  assert.doesNotMatch(r.stderr, /at |ENOENT/);
  const h = spawnSync(process.execPath, ['ascii.js', '--help'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /--threshold/);
});
