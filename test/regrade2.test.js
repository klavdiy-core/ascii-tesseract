'use strict';
// The second skeptic re-grade (6.5/10, 25.10): each test red on 0.3.1.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const run = (args) => spawnSync(process.execPath, args, { cwd: ROOT, timeout: 8000, encoding: 'utf8' });
const tmp = (name, bytes) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'at-')), name); fs.writeFileSync(p, bytes); return p; };
const gray = (w, h, v = 128) => Buffer.concat([Buffer.from(`P5 ${w} ${h} 255\n`, 'latin1'), Buffer.alloc(w * h, v)]);

test('a PNM comment with no newline after it ends with an error, not a hang', () => {
  const r = run(['ascii.js', tmp('c.pgm', Buffer.from('P5\n# comment', 'latin1')), '--cols', '8']);
  assert.notEqual(r.signal, 'SIGTERM', 'it hung');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /end of file/);
});

test('a truncated PGM is an error, not a black picture', () => {
  const r = run(['ascii.js', tmp('t.pgm', Buffer.from('P5 4 4 255\n\x00\x80', 'latin1')), '--cols', '8']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unexpected end of file/);
});

test('tesseract.js checks its flags: one line and exit 2, never a stack trace', () => {
  for (const args of [['--fps', '0'], ['--width', '-5'], ['--width', 'abc'], ['--frames', '-1'], ['--frames', 'abc'],
    ['--speed', 'abc'], ['--bogus'], ['--width']]) {
    const r = run(['tesseract.js', '--frames', '1', ...args]);
    assert.equal(r.status, 2, `${args.join(' ')} -> ${r.status} ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /at .*tesseract\.js:\d+/, 'a stack trace');
  }
  assert.equal(run(['tesseract.js', '--frames', '1', '--width', '40', '--height', '12']).status, 0);
});

test('an emoji ramp is used by code point', () => {
  const r = run(['ascii.js', tmp('g.pgm', gray(16, 8)), '--chars', '🙂😀', '--cols', '4']);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /�/);
  assert.match(r.stdout, /[🙂😀]/u);
});

test('unknown flags, a flag without its value and an empty ramp are said, and a bad style does not blame the file', () => {
  const pic = tmp('g.pgm', gray(16, 8));
  for (const args of [['--colz', '5'], ['--cols'], ['--chars', ''], ['--style', 'custom']]) {
    const r = run(['ascii.js', pic, ...args]);
    assert.equal(r.status, 2, `${args.join(' ')} -> ${r.status}`);
  }
  const r = run(['ascii.js', pic, '--style', 'nope']);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr, /g\.pgm/);
  assert.match(r.stderr, /unknown style "nope"/);
});
