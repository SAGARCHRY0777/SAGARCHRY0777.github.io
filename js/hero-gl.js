// ---------------------------------------------------------------------------
// hero-gl.js — the sensor field.
//
// A full-screen fragment shader drawing domain-warped FBM as CONTOUR BANDS:
// the topographic plot every vibration and thermal survey gets rendered as.
// Scroll pushes the field through its contour levels; the pointer warps it.
//
// Raw WebGL2, no library. Fails silently to the CSS gradient behind it.
// ---------------------------------------------------------------------------

import { cssColorToVec3, cssVar, clamp, lerp, onTick, reduced } from './utils.js';
import { scrollState } from './scroll.js';
import { onThemeChange } from './theme.js';

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;
uniform float u_scroll;
uniform vec3  u_bg;
uniform vec3  u_acc;
uniform vec3  u_trace;
uniform float u_light;   // 1.0 when the page is in its light theme

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 p  = uv * 1.55;
  float t = u_time * 0.045;

  // pointer warps the field locally — a probe pressed against the surface
  float md = length(uv - u_mouse);
  vec2 push = (uv - u_mouse) * exp(-md * 3.4) * 0.42;

  // two rounds of domain warping: gives the field geological structure
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.8));
  vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.35),
                fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.28));
  float field = fbm(p + 2.1 * r + push);

  // ---- contour bands ------------------------------------------------------
  float levels = field * 15.0 + u_scroll * 4.0 + t * 0.6;
  float g  = abs(fract(levels) - 0.5);
  float w  = fwidth(levels);
  float major = 1.0 - smoothstep(0.0, w * 1.6 + 0.008, g);

  // a sparser second set, offset — the "index contour" of a survey plot
  float lv2 = field * 5.0 + u_scroll * 1.35;
  float g2  = abs(fract(lv2) - 0.5);
  float w2  = fwidth(lv2);
  float minor = 1.0 - smoothstep(0.0, w2 * 2.2 + 0.006, g2);

  // ---- sweep: one slow scan line, like a scope refresh ---------------------
  float sweepY = fract(u_time * 0.055) * 2.2 - 1.1;
  float sweep = exp(-abs(uv.y - sweepY) * 46.0) * 0.55;

  // ---- compose ------------------------------------------------------------
  vec3 col = u_bg;
  col = mix(col, u_trace, minor * (u_light > 0.5 ? 0.16 : 0.13));
  col = mix(col, u_acc,   major * (u_light > 0.5 ? 0.30 : 0.42));
  col += u_acc * sweep * (u_light > 0.5 ? 0.08 : 0.20);

  // heat where the field peaks — reads as a hotspot on a thermal map
  float heat = smoothstep(0.62, 0.86, field);
  col = mix(col, u_acc, heat * (u_light > 0.5 ? 0.10 : 0.16));

  // ---- vignette + faint scanlines ----------------------------------------
  float vig = 1.0 - smoothstep(0.45, 1.28, length(uv * vec2(0.86, 1.0)));
  col = mix(u_bg, col, 0.24 + 0.76 * vig);
  col -= (u_light > 0.5 ? 0.012 : 0.02) * step(0.5, fract(gl_FragCoord.y * 0.25));

  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('[hero-gl]', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

export function initHeroGL(canvas) {
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, powerPreference: 'low-power',
  });
  if (!gl) { canvas.style.display = 'none'; return; }   // CSS fallback stays

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.style.display = 'none'; return; }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[hero-gl]', gl.getProgramInfoLog(prog));
    canvas.style.display = 'none';
    return;
  }
  gl.useProgram(prog);

  // full-screen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {
    res:    gl.getUniformLocation(prog, 'u_res'),
    time:   gl.getUniformLocation(prog, 'u_time'),
    mouse:  gl.getUniformLocation(prog, 'u_mouse'),
    scroll: gl.getUniformLocation(prog, 'u_scroll'),
    bg:     gl.getUniformLocation(prog, 'u_bg'),
    acc:    gl.getUniformLocation(prog, 'u_acc'),
    trace:  gl.getUniformLocation(prog, 'u_trace'),
    light:  gl.getUniformLocation(prog, 'u_light'),
  };

  // colours come from the design tokens, so the field follows the theme
  function pushPalette() {
    gl.uniform3fv(U.bg,    cssColorToVec3(cssVar('--void')));
    gl.uniform3fv(U.acc,   cssColorToVec3(cssVar('--sodium')));
    gl.uniform3fv(U.trace, cssColorToVec3(cssVar('--trace')));
    gl.uniform1f(U.light, cssVar('--scheme') === 'light' ? 1 : 0);
  }
  pushPalette();
  onThemeChange(pushPalette);

  // sizing — DPR capped at 1.5; this shader is fill-rate bound
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.res, w, h);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  let mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener('pointermove', (e) => {
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = -((e.clientY / window.innerHeight) * 2 - 1) * (window.innerHeight / window.innerWidth);
  }, { passive: true });

  const soft = reduced();
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; })
    .observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) visible = false;
  });

  const start = performance.now();
  let last = 0;

  onTick((now) => {
    if (!visible && !document.hidden) return;
    if (document.hidden) return;
    if (now - last < 1000 / 40) return;      // 40fps is plenty for a field this soft
    last = now;

    resize();
    mx = lerp(mx, tx, 0.06);
    my = lerp(my, ty, 0.06);

    const time = soft ? 0 : (now - start) / 1000;
    gl.uniform1f(U.time, time);
    gl.uniform2f(U.mouse, mx, my);
    gl.uniform1f(U.scroll, clamp(scrollState.smooth / (window.innerHeight * 1.6), 0, 3));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });
}
