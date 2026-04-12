import { highlightLine } from './highlighter.js';

const DEMOS = [
  { input: '2 cups in ml', result: '473 ml' },
  { input: '$150 + 20%', result: '$180' },
  { input: '1000 JPY in AUD', result: '8.95 AUD' },
  { input: '$100 at 5% pa', result: '$105.12' },
];

const TYPE_MS      = 65;
const BACKSPACE_MS = 30;
const RESULT_DELAY = 400;
const PAUSE_MS     = 3000;
const NEXT_DELAY   = 400;
const FADE_OUT_MS  = 200;

const FRAMES = DEMOS.map(({ input }) => {
  const frames = [''];
  for (let c = 1; c <= input.length; c++) {
    frames.push(highlightLine(input.substring(0, c), null).replace(/\n$/, ''));
  }
  return frames;
});

export function initTypingDemo(container) {
  const inputEl  = container.querySelector('.typing-demo-input');
  const resultEl = container.querySelector('.typing-demo-result');
  let cancelled = false;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function run() {
    let i = 0;
    while (!cancelled) {
      const { result } = DEMOS[i % DEMOS.length];
      const frames = FRAMES[i % FRAMES.length];

      for (let c = 1; c < frames.length; c++) {
        if (cancelled) return;
        inputEl.innerHTML = frames[c];
        await sleep(TYPE_MS);
      }

      await sleep(RESULT_DELAY);
      if (cancelled) return;
      resultEl.textContent = result;
      resultEl.classList.add('visible');

      await sleep(PAUSE_MS);
      if (cancelled) return;

      resultEl.classList.remove('visible');
      await sleep(FADE_OUT_MS);

      for (let c = frames.length - 2; c >= 0; c--) {
        if (cancelled) return;
        inputEl.innerHTML = frames[c];
        await sleep(BACKSPACE_MS);
      }

      await sleep(NEXT_DELAY);
      i++;
    }
  }

  run();
  return () => { cancelled = true; };
}
