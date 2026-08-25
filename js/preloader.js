// ---------------------------------------------------------------------------
// preloader.js — boot sequence. Counter to 100 against a real progress signal
// (fonts + first paint), then the two panels split and the page is behind them.
// Shown once per session so it never becomes an obstacle.
// ---------------------------------------------------------------------------

import { $, pad, reduced } from './utils.js';

const STEPS = [
  'link established',
  'profile.json parsed',
  'sensor field compiled',
  'detector armed',
  'ready',
];

export function initPreloader(onDone) {
  const boot = $('.boot');
  if (!boot) { onDone?.(); return; }

  let seen = false;
  try { seen = sessionStorage.getItem('sc-booted') === '1'; } catch { /* ignore */ }

  if (seen || reduced()) {
    boot.remove();
    document.body.classList.remove('is-locked');
    onDone?.();
    return;
  }

  const num  = $('.boot__n', boot);
  const log  = $('.boot__log', boot);
  const fill = $('.boot__rule i', boot);

  document.body.classList.add('is-locked');

  let value = 0;
  let target = 12;
  let step = 0;

  // real signals move the target forward; the counter eases toward it
  document.fonts?.ready.then(() => { target = Math.max(target, 72); });
  window.addEventListener('load', () => { target = 100; });
  setTimeout(() => { target = Math.max(target, 88); }, 700);
  setTimeout(() => { target = 100; }, 2400);   // hard ceiling — never trap anyone

  const timer = setInterval(() => {
    value += Math.max(0.6, (target - value) * 0.09);
    if (value > 100) value = 100;

    num.textContent = pad(Math.floor(value), 3);
    fill.style.width = `${value}%`;

    const wanted = Math.min(STEPS.length - 1, Math.floor(value / 21));
    if (wanted !== step) {
      step = wanted;
      log.innerHTML = `<b>${pad(step + 1)}</b> / ${pad(STEPS.length)} &nbsp; ${STEPS[step]}`;
    }

    if (value >= 99.5) {
      clearInterval(timer);
      num.textContent = '100';
      setTimeout(() => {
        boot.classList.add('is-done');
        document.body.classList.remove('is-locked');
        try { sessionStorage.setItem('sc-booted', '1'); } catch { /* ignore */ }
        onDone?.();
        setTimeout(() => boot.remove(), 1600);
      }, 260);
    }
  }, 32);
}
