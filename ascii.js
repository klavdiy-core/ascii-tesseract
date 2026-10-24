/*
 * ascii.js: turn any picture into characters. Pure JavaScript, no dependencies.
 * Node: require('./ascii.js'). Browser: <script src="ascii.js"> gives window.Ascii.
 *
 * render(image, opts) -> { cols, rows, cells: [[{ ch, rgb, lum }]] }
 *   image: { width, height, data } with RGBA bytes (canvas ImageData works as is)
 *   opts:  cols, style, chars (for style 'custom'), invert, brightness, contrast, gamma,
 *          colour ('mono' | 'original' | 'palette'), ink, palette, boost (original colour x (1 + boost)),
 *          threshold (braille: a dot is lit at this brightness, default 0.5)
 * draw(ctx, result, opts) paints a result onto a 2D canvas, with optional effects.
 */
(function (root) {
  'use strict';

  const STYLES = {
    classic: ' .:-=+*#%@',
    detailed: ' .\'`^",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
    blocks: ' ░▒▓█',
    dots: ' ·•●',
    binary: ' 10',
    braille: null,   // 2x4 dots per character, see brailleChar
    custom: null,    // opts.chars
  };

  const PRESETS = {
    old_monitor: { style: 'classic', colour: 'mono', ink: [51, 255, 102], bg: [4, 14, 6], scanlines: 0.35, bloom: 0.5 },
    amber_glow: { style: 'detailed', colour: 'mono', ink: [255, 176, 0], bg: [16, 8, 0], scanlines: 0.25, bloom: 0.6 },
    digital_rain: { style: 'binary', colour: 'mono', ink: [0, 255, 70], bg: [0, 0, 0], bloom: 0.4 },
    printed_page: { style: 'detailed', colour: 'mono', ink: [25, 22, 20], bg: [242, 237, 226], invert: true, grain: 0.15 },
    braille: { style: 'braille', colour: 'original', boost: 0.8, threshold: 0.25, bg: [8, 8, 12] },
    true_colour: { style: 'blocks', colour: 'original', boost: 0.8, gamma: 1.3, bg: [0, 0, 0] },
    halftone: { style: 'dots', colour: 'original', boost: 0.8, gamma: 1.3, bg: [10, 10, 14] },
  };

  const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];   // [row][col]

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // mean colour of the box [x0, x1) x [y0, y1), at least one pixel
  function boxMean(img, x0, y0, x1, y1) {
    const w = img.width, d = img.data;
    const xa = Math.min(w - 1, Math.floor(x0)), ya = Math.min(img.height - 1, Math.floor(y0));
    const xb = Math.max(xa + 1, Math.min(w, Math.ceil(x1))), yb = Math.max(ya + 1, Math.min(img.height, Math.ceil(y1)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  }

  function tone(rgb, o) {
    let l = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    l = clamp01(l + (o.brightness || 0));
    l = clamp01((l - 0.5) * (1 + (o.contrast || 0)) + 0.5);
    if (o.gamma && o.gamma !== 1) l = Math.pow(l, 1 / o.gamma);
    return o.invert ? 1 - l : l;
  }

  const pick = (list, l) => list[Math.min(list.length - 1, Math.floor(l * list.length))];

  function brailleChar(img, x0, y0, cw, ch, o) {
    let bits = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        const sx = x0 + c * cw / 2, sy = y0 + r * ch / 4;
        if (tone(boxMean(img, sx, sy, sx + cw / 2, sy + ch / 4), o) >= (o.threshold ?? 0.5)) bits |= BRAILLE_BITS[r][c];
      }
    }
    return String.fromCharCode(0x2800 + bits);
  }

  function render(img, opts) {
    const o = { cols: 80, style: 'classic', colour: 'mono', ink: [230, 230, 230], aspect: 2, ...opts };
    if (!(o.style in STYLES)) throw new Error(`unknown style "${o.style}"; one of: ${Object.keys(STYLES).join(', ')}`);
    const ramp = o.style === 'custom' ? (o.chars || STYLES.classic) : STYLES[o.style];
    const cols = Math.max(1, Math.round(o.cols));
    const cw = img.width / cols, ch = cw * o.aspect;
    const rows = Math.max(1, Math.round(img.height / ch));
    const cells = [];
    for (let j = 0; j < rows; j++) {
      const row = [];
      for (let i = 0; i < cols; i++) {
        const x0 = i * cw, y0 = j * ch;
        const rgb = boxMean(img, x0, y0, x0 + cw, y0 + ch);
        const lum = tone(rgb, o);
        const c = o.style === 'braille' ? brailleChar(img, x0, y0, cw, ch, o) : pick(ramp, lum);
        const col = o.colour === 'original' ? rgb.map((v) => Math.round(Math.min(255, v * (1 + (o.boost || 0)))))
          : o.colour === 'palette' ? pick(o.palette || [o.ink], lum) : o.ink;
        row.push({ ch: c, rgb: col, lum });
      }
      cells.push(row);
    }
    return { cols, rows, cells };
  }

  const toText = (res) => res.cells.map((row) => row.map((c) => c.ch).join('')).join('\n');

  // ---------- browser: paint a result, with effects ----------
  function draw(ctx, res, opts) {
    const o = { fontSize: 12, bg: [0, 0, 0], ...opts };
    const fw = o.fontSize * 0.6, fh = o.fontSize * 1.2;
    const W = Math.ceil(res.cols * fw), H = Math.ceil(res.rows * fh);
    if (ctx.canvas.width !== W || ctx.canvas.height !== H) { ctx.canvas.width = W; ctx.canvas.height = H; }
    const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    ctx.fillStyle = css(o.bg);
    ctx.fillRect(0, 0, W, H);
    ctx.font = `${o.fontSize}px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace`;
    ctx.textBaseline = 'top';
    const paint = () => {
      for (let j = 0; j < res.rows; j++) {
        for (let i = 0; i < res.cols; i++) {
          const c = res.cells[j][i];
          if (c.ch === ' ' || c.ch === '⠀') continue;
          const jitter = o.flicker ? (Math.random() - 0.5) * o.flicker : 0;
          ctx.fillStyle = css(c.rgb, clamp01(1 + jitter));
          ctx.fillText(c.ch, i * fw, j * fh);
        }
      }
    };
    paint();
    if (o.bloom) {                       // glow: the same glyphs again, blurred and added
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = o.bloom;
      ctx.filter = `blur(${Math.max(2, o.fontSize / 3)}px)`;
      paint();
      ctx.restore();
    }
    if (o.scanlines) {
      ctx.fillStyle = `rgba(0,0,0,${o.scanlines})`;
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }
    if (o.grain) {
      const g = ctx.getImageData(0, 0, W, H), d = g.data;
      for (let k = 0; k < d.length; k += 4) {
        const n = (Math.random() - 0.5) * 255 * o.grain;
        d[k] += n; d[k + 1] += n; d[k + 2] += n;
      }
      ctx.putImageData(g, 0, 0);
    }
    if (o.vignette) {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(0,0,0,${o.vignette})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  }

  const api = { STYLES, PRESETS, render, toText, draw };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ascii = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
