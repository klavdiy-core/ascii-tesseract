#!/usr/bin/env node
/*
 * ascii-tesseract: a 4D cube turning in ASCII. Pure JavaScript, no dependencies.
 * Runs in a terminal (`node tesseract.js`) and in a browser (index.html).
 *
 * Full mode: the 16 corners and 32 edges, rotated in the XW, YZ and XY planes,
 * projected 4D -> 3D -> 2D, brighter characters nearer the eye.
 * Slice mode: we live in 3D, so we only ever see a slice. "Now" slides along
 * the fourth axis; the bright shape is the exact 3D cross-section at that w,
 * the dots are the whole tesseract it is cut from.
 */
(function (root) {
  'use strict';

  const RAMP = ' .:-=+*#%@';
  const D4 = 3;   // distance of the 4D eye along w
  const D3 = 4;   // distance of the 3D eye along z

  function vertices() {
    const v = [];
    for (let i = 0; i < 16; i++) v.push([0, 1, 2, 3].map((b) => (i >> b) & 1 ? 1 : -1));
    return v;
  }

  function edges() {
    const e = [];
    for (let i = 0; i < 16; i++) {
      for (let b = 0; b < 4; b++) {
        const j = i ^ (1 << b);
        if (i < j) e.push([i, j]);
      }
    }
    return e;
  }

  // 24 squares: pick two free axes, fix the other two; corners in cyclic order
  function faces() {
    const f = [];
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        const fixed = [0, 1, 2, 3].filter((x) => x !== a && x !== b);
        for (let m = 0; m < 4; m++) {
          const base = ((m & 1) << fixed[0]) | (((m >> 1) & 1) << fixed[1]);
          f.push([base, base | (1 << a), base | (1 << a) | (1 << b), base | (1 << b)]);
        }
      }
    }
    return f;
  }

  function turn(p, i, j, t) {
    const c = Math.cos(t), s = Math.sin(t);
    const q = p.slice();
    q[i] = p[i] * c - p[j] * s;
    q[j] = p[i] * s + p[j] * c;
    return q;
  }

  function rotate(p, ang) {
    let q = p.slice();
    if (ang.xw) q = turn(q, 0, 3, ang.xw);
    if (ang.yz) q = turn(q, 1, 2, ang.yz);
    if (ang.xy) q = turn(q, 0, 1, ang.xy);
    return q;
  }

  // 4D -> 3D: the eye sits at w = d, looking down w
  function project4(p, d = D4) {
    const k = 1 / (d - p[3]);
    return [p[0] * k, p[1] * k, p[2] * k];
  }

  function key(p) { return p.map((c) => c.toFixed(9)).join(','); }

  // The 3D cross-section at w = c of the rotated tesseract, as segments in rotated x,y,z.
  // Each square face that the hyperplane cuts gives one segment.
  function slice(c, ang, withW) {
    const R = vertices().map((p) => rotate(p, ang));
    const segs = [];
    for (const f of faces()) {
      const pts = new Map();
      for (let k = 0; k < 4; k++) {
        const a = R[f[k]], b = R[f[(k + 1) % 4]];
        const wa = a[3] - c, wb = b[3] - c;
        if (Math.abs(wa) < 1e-12 && Math.abs(wb) < 1e-12) continue;    // edge lies in the slice
        if (Math.abs(wa) < 1e-12) { pts.set(key(a), a); continue; }
        if (wa * wb < 0) {
          const t = wa / (wa - wb);
          const p = a.map((v, i) => v + (b[i] - v) * t);
          pts.set(key(p), p);
        }
      }
      if (pts.size === 2) {
        const [p, q] = [...pts.values()];
        segs.push(withW ? [p, q] : [p.slice(0, 3), q.slice(0, 3)]);
      }
    }
    return segs;
  }

  function angles(t) {
    return { xw: t * 0.7, yz: t * 0.43, xy: t * 0.17 };
  }

  function frame(t, opts = {}) {
    const W = opts.width || 72, H = opts.height || 30;
    const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
    const zbuf = Array.from({ length: H }, () => new Array(W).fill(-Infinity));
    // projected corners never leave |x|,|y| < 0.92 (measured over the whole rotation); fill the screen with that
    // characters are about twice as tall as wide
    const sy = Math.min((H / 2 - 1) / 0.95, (W / 2 - 1) / 0.95 / 2), sx = sy * 2.0;
    const ang = angles(t);

    const toScreen = (p4) => {
      const [x, y, z] = project4(p4);
      const k = D3 / (D3 - z);
      return [W / 2 + x * k * sx, H / 2 - y * k * sy, z];
    };
    const put = (x, y, z, ch) => {
      const cx = Math.round(x), cy = Math.round(y);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
      if (z >= zbuf[cy][cx]) { zbuf[cy][cx] = z; grid[cy][cx] = ch; }
    };
    const shade = (z, lo, hi) => {
      const u = Math.max(0, Math.min(1, (z + 1) / 2));
      return RAMP[lo + Math.round(u * (hi - lo))];
    };
    const line = (a4, b4, chFor) => {
      const a = toScreen(a4), b = toScreen(b4);
      const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 1.5) + 1;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const p = a4.map((v, k) => v + (b4[k] - v) * u);
        const s = toScreen(p);
        put(s[0], s[1], s[2], chFor(s[2]));
      }
    };

    const R = vertices().map((p) => rotate(p, ang));
    if (!opts.slice) {
      for (const [i, j] of edges()) line(R[i], R[j], (z) => shade(z, 2, 8));
      for (const p of R) { const s = toScreen(p); put(s[0], s[1], s[2] + 0.01, '@'); }
    } else {
      for (const [i, j] of edges()) line(R[i], R[j], () => '.');
      const now = 1.6 * Math.sin(t * 0.45);
      for (const [p, q] of slice(now, ang, true)) line(p, q, (z) => shade(z, 5, 9));
      const label = ` now w=${now >= 0 ? '+' : ''}${now.toFixed(2)} `;
      for (let i = 0; i < label.length && i < W; i++) grid[0][i] = label[i];
    }
    return grid.map((r) => r.join('')).join('\n');
  }

  const api = { RAMP, vertices, edges, faces, rotate, project4, slice, frame, angles };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tesseract = api;

  // ---------- terminal ----------
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const args = process.argv.slice(2);
    const val = (name, def) => {
      const i = args.indexOf(name);
      return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : def;
    };
    if (args.includes('-h') || args.includes('--help')) {
      console.log('usage: node tesseract.js [--slice] [--fps 30] [--speed 1] [--width N] [--height N] [--frames N]\n' +
        '  s = toggle slice, q = quit (in a terminal)');
      process.exit(0);
    }
    let sliceMode = args.includes('--slice');
    const fps = val('--fps', 30), speed = val('--speed', 1);
    const out = process.stdout;
    const size = () => ({
      width: val('--width', Math.min((out.columns || 80) - 1, 120)),
      height: val('--height', Math.min((out.rows || 32) - 1, 50)),
    });
    const frames = val('--frames', 0);
    if (frames) {                       // print N frames and stop (for recording, or a pipe)
      for (let i = 0; i < frames; i++) out.write(frame(i / fps * speed, { ...size(), slice: sliceMode }) + '\n\f\n');
      process.exit(0);
    }
    out.write('\x1b[?25l\x1b[2J');
    const quit = () => { out.write('\x1b[?25h\x1b[0m\n'); process.exit(0); };
    process.on('SIGINT', quit);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (b) => {
        const k = b.toString();
        if (k === 'q' || k === '\u0003') quit();
        if (k === 's') { sliceMode = !sliceMode; out.write('\x1b[2J'); }
      });
    }
    const t0 = Date.now();
    setInterval(() => {
      out.write('\x1b[H' + frame((Date.now() - t0) / 1000 * speed, { ...size(), slice: sliceMode }));
    }, 1000 / fps);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
