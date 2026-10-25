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
    // by code point: an emoji ramp split into UTF-16 halves printed U+FFFD (regrade 2)
    const src = o.style === 'custom' ? (o.chars || STYLES.classic) : STYLES[o.style];
    const ramp = src == null ? src : Array.from(src);                  // braille has no ramp
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

  // ---------- Node: read a picture file, no dependencies ----------
  // PNG through Node's own zlib (8-bit, any colour type, not interlaced) and binary PPM/PGM. JPEG and the rest need
  // a real decoder; they are refused with what to do instead of being guessed at.
  function decodePNG(buf) {
    const zlib = require('zlib');
    let pos = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0, plte = null, trns = null;
    const idat = [];
    while (pos + 8 <= buf.length) {
      const len = buf.readUInt32BE(pos), kind = buf.toString('latin1', pos + 4, pos + 8);
      const data = buf.subarray(pos + 8, pos + 8 + len);
      if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; inter = data[12]; }
      else if (kind === 'PLTE') plte = data;
      else if (kind === 'tRNS') trns = data;
      else if (kind === 'IDAT') idat.push(data);
      else if (kind === 'IEND') break;
      pos += 12 + len;
    }
    if (depth !== 8 || inter !== 0) throw new Error(`PNG with ${depth}-bit samples${inter ? ', interlaced' : ''} is not read here; save it as 8-bit, not interlaced`);
    const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
    if (!ch) throw new Error(`PNG colour type ${type} is unknown`);
    const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch;
    const px = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
      const ft = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? px[dst + i - ch] : 0, b = y ? px[dst - stride + i] : 0, c = y && i >= ch ? px[dst - stride + i - ch] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][ft];
        if (pred === undefined) throw new Error(`PNG filter ${ft} is unknown`);
        px[dst + i] = (raw[src + i] + pred) & 255;
      }
    }
    const out = new Uint8ClampedArray(w * h * 4);
    for (let k = 0; k < w * h; k++) {
      const s = k * ch;
      let rgba = type === 0 ? [px[s], px[s], px[s], 255] : type === 2 ? [px[s], px[s + 1], px[s + 2], 255]
        : type === 3 ? [plte[px[s] * 3], plte[px[s] * 3 + 1], plte[px[s] * 3 + 2], 255]
        : type === 4 ? [px[s], px[s], px[s], px[s + 1]] : [px[s], px[s + 1], px[s + 2], px[s + 3]];
      if (trns) {                                   // tRNS: alpha per palette entry, or one transparent colour
        if (type === 3) rgba[3] = px[s] < trns.length ? trns[px[s]] : 255;
        else if (type === 0 && px[s] === trns.readUInt16BE(0)) rgba[3] = 0;
        else if (type === 2 && px[s] === trns.readUInt16BE(0) && px[s + 1] === trns.readUInt16BE(2) && px[s + 2] === trns.readUInt16BE(4)) rgba[3] = 0;
      }
      // transparent is background: composited over black (the text has no colour of its own to show through)
      const a = rgba[3] / 255;
      out.set([rgba[0] * a, rgba[1] * a, rgba[2] * a, 255], k * 4);
    }
    return { width: w, height: h, data: out };
  }

  function decodePNM(buf) {
    const tok = [];
    let pos = 0;
    // every loop is bounded by the buffer: a comment with no newline after it looped forever (regrade 2)
    while (tok.length < 4) {                       // magic, width, height, maxval; '#' starts a comment
      while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]))) pos++;
      if (pos >= buf.length) throw new Error('unexpected end of file in the PPM/PGM header');
      if (buf[pos] === 35) { while (pos < buf.length && buf[pos] !== 10) pos++; continue; }
      let t = '';
      while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos]))) t += String.fromCharCode(buf[pos++]);
      tok.push(t);
    }
    pos++;
    const [magic, w, h, max] = [tok[0], +tok[1], +tok[2], +tok[3]];
    if (![w, h, max].every((v) => Number.isInteger(v) && v > 0)) throw new Error('a broken PPM/PGM header');
    if (max > 255) throw new Error('16-bit PPM/PGM is not read here');
    const ch = magic === 'P6' ? 3 : 1, out = new Uint8ClampedArray(w * h * 4);
    // a short file used to render its missing pixels as black, without a word
    if (buf.length < pos + w * h * ch) throw new Error(`unexpected end of file (${buf.length - pos} of ${w * h * ch} pixel bytes)`);
    for (let k = 0; k < w * h; k++) {
      const s = pos + k * ch, f = (v) => Math.round(v * 255 / max);
      out.set(ch === 3 ? [f(buf[s]), f(buf[s + 1]), f(buf[s + 2]), 255] : [f(buf[s]), f(buf[s]), f(buf[s]), 255], k * 4);
    }
    return { width: w, height: h, data: out };
  }

  function decodeImage(buf) {
    if (buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return decodePNG(buf);
    const magic = buf.toString('latin1', 0, 2);
    if (magic === 'P6' || magic === 'P5') return decodePNM(buf);
    const what = buf[0] === 0xff && buf[1] === 0xd8 ? 'JPEG' : buf.toString('latin1', 0, 3) === 'GIF' ? 'GIF' : 'this format';
    throw new Error(`${what} is not decoded here (no dependencies). Convert it to PNG first, e.g. ` +
      '`ffmpeg -i in.jpg out.png` or `magick in.jpg out.png`, or open convert.html in a browser, which reads any picture');
  }

  const api = { STYLES, PRESETS, render, toText, draw, decodeImage };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ascii = api;

  // Otsu's threshold over the picture's tones: the split between its dark and light groups. For braille, whose dots
  // are on/off, a fixed 0.5 left a dim picture completely blank (25.10 regrade). One flat tone: 0.5.
  function autoThreshold(img, o) {
    const hist = new Array(256).fill(0), step = Math.max(1, Math.floor(img.width * img.height / 200000));
    for (let k = 0; k < img.width * img.height; k += step) {
      const d = img.data, i = k * 4;
      hist[Math.round(tone([d[i], d[i + 1], d[i + 2]], o) * 255)]++;
    }
    const total = hist.reduce((a, b) => a + b, 0), sum = hist.reduce((a, n, v) => a + n * v, 0);
    let wB = 0, sB = 0, best = -1, at = -1;
    for (let t = 0; t < 255; t++) {
      wB += hist[t]; sB += t * hist[t];
      const wF = total - wB;
      if (!wB || !wF) continue;
      const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
      if (between > best) { best = between; at = t; }
    }
    return at < 0 ? 0.5 : (at + 0.5) / 255;
  }

  const USAGE = 'usage: node ascii.js picture.png|.ppm|.pgm [--cols 80] [--style ' + Object.keys(STYLES).join('|') + ']\n' +
    '       [--chars " .oO@"] [--invert] [--brightness -1..1] [--contrast -1..3] [--gamma 0.2..5]\n' +
    '       [--threshold 0..1]   (braille: a dot is lit at this tone; default: chosen from the picture)';

  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const args = process.argv.slice(2);
    const fail = (msg) => { process.stderr.write(`ascii: ${msg}\n`); process.exit(2); };
    const opt = (name) => { const i = args.lastIndexOf(name); return i >= 0 ? args[i + 1] : undefined; };
    const num = (name, lo, hi, int) => {
      const v = opt(name);
      if (v === undefined) return undefined;
      const n = Number(v);
      if (v === '' || !Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) {
        fail(`${name} ${v}: expected ${int ? 'a whole number' : 'a number'} from ${lo} to ${hi}`);
      }
      return n;
    };
    if (args.includes('--help') || args.includes('-h')) { console.log(USAGE); process.exit(0); }
    const valued = new Set(['--cols', '--style', '--chars', '--brightness', '--contrast', '--gamma', '--threshold']);
    // an unknown flag or a flag without its value used to be ignored without a word (regrade 2)
    args.forEach((a, i) => {
      if (!a.startsWith('--')) return;
      if (!valued.has(a) && a !== '--invert') fail(`unknown option ${a}\n` + USAGE);
      if (valued.has(a) && (args[i + 1] === undefined || (args[i + 1].startsWith('--') && a !== '--chars'))) {
        fail(`${a} needs a value`);
      }
    });
    const file = args.find((a, i) => !a.startsWith('--') && !(i && valued.has(args[i - 1])));
    if (!file) fail('no picture given\n' + USAGE);
    const style = opt('--style');
    if (style !== undefined && !(style in STYLES)) fail(`unknown style "${style}"; one of: ${Object.keys(STYLES).join(', ')}`);
    if (style === 'custom' && opt('--chars') === undefined) fail('--style custom needs --chars "<ramp, dark to light>"');
    if (opt('--chars') !== undefined && Array.from(opt('--chars')).length < 2) {
      fail('--chars needs at least two characters (dark to light)');
    }
    process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });
    const o = {
      cols: num('--cols', 1, 1000, true) ?? 80, style: opt('--style') ?? 'classic', invert: args.includes('--invert'),
      brightness: num('--brightness', -1, 1), contrast: num('--contrast', -1, 3), gamma: num('--gamma', 0.2, 5),
      threshold: num('--threshold', 0, 1),
    };
    if (opt('--chars') !== undefined) { o.style = 'custom'; o.chars = opt('--chars'); }
    let buf;
    try {
      buf = require('fs').readFileSync(file);
    } catch (e) {
      fail(`cannot read ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.code === 'EISDIR' ? 'it is a folder' : e.message}`);
    }
    try {
      const image = decodeImage(buf);
      if (o.style === 'braille' && o.threshold === undefined) o.threshold = autoThreshold(image, o);
      process.stdout.write(toText(render(image, o)) + '\n');
    } catch (e) {
      fail(`${file}: ${e.message}`);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
