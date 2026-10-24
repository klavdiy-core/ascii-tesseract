'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tesseract.js');

const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('16 vertices, all corners of [-1,1]^4', () => {
  const v = T.vertices();
  assert.equal(v.length, 16);
  assert.equal(new Set(v.map(String)).size, 16);
  for (const p of v) assert.ok(p.every((c) => c === 1 || c === -1));
});

test('32 edges of length 2, each vertex has 4', () => {
  const v = T.vertices();
  const e = T.edges();
  assert.equal(e.length, 32);
  const deg = new Array(16).fill(0);
  for (const [a, b] of e) {
    assert.ok(close(dist(v[a], v[b]), 2));
    deg[a]++; deg[b]++;
  }
  assert.ok(deg.every((d) => d === 4));
});

test('24 square faces', () => {
  assert.equal(T.faces().length, 24);
});

test('rotation keeps lengths; zero angles change nothing', () => {
  const p = [1, -1, 1, -1];
  assert.deepEqual(T.rotate(p, { xw: 0, yz: 0, xy: 0 }), p);
  const q = T.rotate(p, { xw: 0.7, yz: 1.3, xy: 0.2 });
  assert.ok(close(Math.hypot(...q), 2));
  // a quarter turn in XW sends x to w
  const r = T.rotate([1, 0, 0, 0], { xw: Math.PI / 2, yz: 0, xy: 0 });
  assert.ok(close(r[0], 0) && close(Math.abs(r[3]), 1));
});

test('perspective 4D -> 3D by hand: the 4D eye sits at w=d', () => {
  const d = 3;
  const near = T.project4([1, 1, 1, -1], d);
  const far = T.project4([1, 1, 1, 1], d);
  // k = 1 / (d - w): the w=1 cube is nearer the eye and drawn bigger, w=-1 is the small inner cube
  assert.ok(close(far[0], 1 / (d - 1)));
  assert.ok(close(near[0], 1 / (d + 1)));
});

test('slice at w=0 with no rotation is a cube: 12 segments of length 2', () => {
  const segs = T.slice(0, { xw: 0, yz: 0, xy: 0 });
  assert.equal(segs.length, 12);
  for (const [a, b] of segs) assert.ok(close(dist(a, b), 2));
  const pts = new Set(segs.flat().map((p) => p.map((c) => c.toFixed(6)).join()));
  assert.equal(pts.size, 8);
});

test('slice outside the tesseract is empty', () => {
  assert.equal(T.slice(1.5, { xw: 0, yz: 0, xy: 0 }).length, 0);
});

test('slice of a tilted tesseract is a closed polyhedron (every point meets >= 3 segments)', () => {
  const segs = T.slice(0.3, { xw: 0.6, yz: 0.4, xy: 0.1 });
  assert.ok(segs.length >= 6);
  const deg = new Map();
  for (const s of segs) for (const p of s) {
    const k = p.map((c) => c.toFixed(6)).join();
    deg.set(k, (deg.get(k) || 0) + 1);
  }
  for (const d of deg.values()) assert.ok(d >= 3, `degree ${d}`);
});

test('frames are deterministic, sized, and use the depth ramp', () => {
  const a = T.frame(1.234, { width: 60, height: 24 });
  const b = T.frame(1.234, { width: 60, height: 24 });
  assert.equal(a, b);
  const lines = a.split('\n');
  assert.equal(lines.length, 24);
  assert.ok(lines.every((l) => l.length === 60));
  const used = new Set(a.replace(/[\s\n]/g, ''));
  assert.ok(used.size >= 4, [...used].join(''));
  for (const ch of used) assert.ok(T.RAMP.includes(ch) || ch === '@', ch);
  assert.notEqual(T.frame(0, { width: 60, height: 24 }), T.frame(0.5, { width: 60, height: 24 }));
});

test('slice frame shows "now" and differs from the full one', () => {
  const s = T.frame(2, { width: 60, height: 24, slice: true });
  assert.match(s, /now w=/);
  assert.notEqual(s, T.frame(2, { width: 60, height: 24 }));
});
