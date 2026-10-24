'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../shader.js');

test('a tweet one-liner is wrapped in the twigl geekest template', () => {
  const src = S.source('o=vec4(FC.xy/r,sin(t),1);');
  assert.match(src, /^#version 300 es/);
  assert.match(src, /uniform vec2 r;/);
  assert.match(src, /uniform float t;/);
  assert.match(src, /out vec4 o;/);
  assert.match(src, /#define FC gl_FragCoord/);
  assert.match(src, /vec3 hsv\(float h,\s*float s,\s*float v\)/);
  assert.match(src, /void main\(\)\{o=vec4\(0\.,0\.,0\.,1\.\);\s*o=vec4\(FC\.xy\/r,sin\(t\),1\);\s*\}/);
});

test('hashtags are dropped, preprocessor lines are kept', () => {
  const src = S.source('#define A 1.\no=vec4(A);#つぶやきGLSL #shader');
  assert.ok(!src.includes('つぶやき'));
  assert.ok(!src.includes('#shader'));
  assert.ok(src.includes('#define A 1.'));
});

test('code with its own main is not wrapped again', () => {
  const src = S.source('void main(){o=vec4(1);}');
  assert.equal((src.match(/void main\(/g) || []).length, 1);
  assert.match(src, /out vec4 o;/);
});

test('the hsv helper matches twigl numerically', () => {
  // h=0 is red, h=1/3 green, s=0 grey, v scales
  const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  assert.ok(close(S.hsvJs(0, 1, 1), [1, 0, 0]));
  assert.ok(close(S.hsvJs(1 / 3, 1, 1), [0, 1, 0]));
  assert.ok(close(S.hsvJs(0.7, 0, 0.5), [0.5, 0.5, 0.5]));
});

test('pixels from GL rows (bottom-up) become an image top-down', () => {
  // 1x2 image: bottom row red, top row blue
  const gl = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
  const im = S.flipRows(gl, 1, 2);
  assert.deepEqual([...im.data.slice(0, 4)], [0, 0, 255, 255]);
  assert.deepEqual([...im.data.slice(4, 8)], [255, 0, 0, 255]);
  assert.equal(im.width, 1);
  assert.equal(im.height, 2);
});
