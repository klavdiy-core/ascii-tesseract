/*
 * shader.js: run a tweet-sized GLSL shader (twigl "geekest" style, #つぶやきGLSL) and hand back its pixels.
 * Node: require('./shader.js') for the pure parts (source building). Browser: window.Shader.
 *
 * Conventions (as on twigl.app): FC = gl_FragCoord, r = resolution, t = time in seconds,
 * m = mouse (0..1), o = output colour (starts black, alpha 1), plus hsv(), rotate2D(), rotate3D().
 */
(function (root) {
  'use strict';

  const HEADER = `#version 300 es
precision highp float;
uniform vec2 r;
uniform float t;
uniform vec2 m;
out vec4 o;
#define FC gl_FragCoord
vec3 hsv(float h,float s,float v){vec4 k=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(vec3(h)+k.xyz)*6.-vec3(k.w));return v*mix(vec3(k.x),clamp(p-vec3(k.x),0.,1.),s);}
mat2 rotate2D(float a){return mat2(cos(a),sin(a),-sin(a),cos(a));}
mat3 rotate3D(float a,vec3 x){x=normalize(x);float s=sin(a),c=cos(a),k=1.-c;return mat3(x.x*x.x*k+c,x.y*x.x*k+x.z*s,x.z*x.x*k-x.y*s,x.x*x.y*k-x.z*s,x.y*x.y*k+c,x.z*x.y*k+x.x*s,x.x*x.z*k+x.y*s,x.y*x.z*k-x.x*s,x.z*x.z*k+c);}
`;

  const DIRECTIVE = /^(define|undef|if|ifdef|ifndef|else|elif|endif|pragma|extension|line|error)\b/;

  // drop #hashtags (but keep preprocessor lines), the way a tweet is pasted
  function stripTags(code) {
    return code.replace(/#([^\s#]+)/g, (all, word) => (DIRECTIVE.test(word) ? all : '')).trim();
  }

  function source(code) {
    const body = stripTags(code);
    if (/void\s+main\s*\(/.test(body)) return HEADER + body + '\n';
    // preprocessor lines must stay on their own lines, outside main
    const lines = body.split('\n');
    const pre = lines.filter((l) => /^\s*#/.test(l));
    const rest = lines.filter((l) => !/^\s*#/.test(l)).join('\n');
    return HEADER + pre.join('\n') + (pre.length ? '\n' : '') + `void main(){o=vec4(0.,0.,0.,1.);\n${rest}\n}\n`;
  }

  // the same hsv in JS, to test the GLSL helper against
  function hsvJs(h, s, v) {
    const fract = (x) => x - Math.floor(x);
    const p = [1, 2 / 3, 1 / 3].map((k) => Math.abs(fract(h + k) * 6 - 3));
    return p.map((c) => v * (1 + (Math.min(1, Math.max(0, c - 1)) - 1) * s));
  }

  // GL reads rows bottom-up; images are top-down
  function flipRows(px, w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return { width: w, height: h, data };
  }

  // ---------- browser ----------
  // create(code, w, h) -> { frame(tSeconds) -> image, error } ; error is the compile log, or ''
  function create(code, w, h) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) return { error: 'WebGL2 is not available in this browser' };
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, source(code)));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      return { error: String(e.message || e) };
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n) => gl.getUniformLocation(prog, n);
    const px = new Uint8Array(w * h * 4);
    return {
      error: '',
      frame(t, mouse = [0.5, 0.5]) {
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u('r'), w, h);
        gl.uniform1f(u('t'), t);
        gl.uniform2f(u('m'), mouse[0], mouse[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return flipRows(px, w, h);
      },
    };
  }

  const api = { source, stripTags, hsvJs, flipRows, create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Shader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
