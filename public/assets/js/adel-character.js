/* ============================================================================
 * Captain Adel — animated character (vanilla ES2022, no framework, no GIFs).
 *
 * A layered inline SVG of the Captain (drawn to match the avatar art: white
 * shirt, epaulettes, black tie, wings, blue roundel) driven entirely by a
 * data-state attribute — CSS (adel-character.css) does the actual animation.
 *
 *   window.AdelCharacter.mount(el)      — inject the SVG into a container
 *   window.AdelCharacter.setState(s)    — idle | listening | thinking |
 *                                         talking | grounded | salute | error
 *
 * The chat client never calls this module directly: it dispatches
 *   document.dispatchEvent(new CustomEvent('adel:state', { detail:{ state } }))
 * and the controller below reacts — so chat works unchanged when this file is
 * absent. `talking` is poked per streamed token and decays back to idle on
 * its own; `grounded` (a nod) and `error` decay too. Honors
 * prefers-reduced-motion via CSS (animations collapse to the static pose).
 *
 * This file ships in two byte-identical copies — captadel/public/assets/js/
 * (canonical) and Fly GACA's assets/js/ — kept in lockstep by the parity test
 * tests/unit/adel-ui-parity.test.js, the same discipline as guards/ratelimit.
 * ==========================================================================*/
(() => {
  'use strict';

  const STATES = new Set(['idle', 'listening', 'thinking', 'talking', 'grounded', 'salute', 'error']);

  // States that hold until replaced vs. states that decay back to idle.
  const DECAY_MS = { talking: 800, grounded: 1600, error: 2600 };

  /* The Captain, layered for animation. ViewBox 0 0 256 256, mirroring the
   * avatar art's composition. aria-hidden: the surrounding page keeps a text
   * alternative; this figure is decoration with motion. */
  const SVG = `
<svg class="adel-figure" viewBox="0 0 256 256" role="img" aria-hidden="true" focusable="false" data-state="idle">
  <!-- roundel -->
  <circle cx="128" cy="120" r="86" fill="#4d9fec"/>
  <g class="adel-body">
    <!-- shoulders / shirt -->
    <path d="M40 256 q4 -74 50 -84 l38 -8 38 8 q46 10 50 84 z" fill="#f7f9fb" stroke="#10212f" stroke-width="5"/>
    <!-- collar -->
    <path d="M108 166 l20 16 20 -16 -8 22 -12 8 -12 -8 z" fill="#ffffff" stroke="#10212f" stroke-width="4"/>
    <!-- tie -->
    <g class="adel-tie">
      <path d="M128 184 l-9 14 9 44 9 -44 z" fill="#1c2733" stroke="#10212f" stroke-width="3"/>
    </g>
    <!-- epaulettes -->
    <g class="adel-epaulettes">
      <rect x="48" y="186" width="34" height="13" rx="3" transform="rotate(18 65 192)" fill="#10212f"/>
      <rect x="50" y="189" width="30" height="2.6" transform="rotate(18 65 192)" fill="#e8b73a"/>
      <rect x="52" y="194" width="26" height="2.6" transform="rotate(18 65 192)" fill="#e8b73a"/>
      <rect x="174" y="186" width="34" height="13" rx="3" transform="rotate(-18 191 192)" fill="#10212f"/>
      <rect x="176" y="189" width="30" height="2.6" transform="rotate(-18 191 192)" fill="#e8b73a"/>
      <rect x="178" y="194" width="26" height="2.6" transform="rotate(-18 191 192)" fill="#e8b73a"/>
    </g>
    <!-- wings badge -->
    <g class="adel-wings" fill="#e8b73a" stroke="#b98a1d" stroke-width="1">
      <ellipse cx="103" cy="216" rx="4.5" ry="3"/>
      <path d="M98 216 q-12 -6 -20 -2 q8 6 20 5 z"/>
      <path d="M108 216 q12 -6 20 -2 q-8 6 -20 5 z"/>
    </g>
  </g>
  <g class="adel-head">
    <!-- neck -->
    <path d="M116 150 h24 v22 q-12 8 -24 0 z" fill="#c08552"/>
    <!-- face -->
    <path d="M88 92 q0 -44 40 -44 q40 0 40 44 v18 q0 36 -40 44 q-40 -8 -40 -44 z" fill="#cd9663"/>
    <!-- ears -->
    <path d="M86 104 q-8 -2 -6 8 q2 10 10 8 z" fill="#cd9663"/>
    <path d="M170 104 q8 -2 6 8 q-2 10 -10 8 z" fill="#cd9663"/>
    <!-- hair -->
    <path d="M86 96 q-4 -40 42 -46 q46 6 42 46 q-2 -10 -10 -14 q2 -12 -10 -18 q-4 8 -22 8 q-18 0 -22 -8 q-12 6 -10 18 q-8 4 -10 14 z" fill="#16202b"/>
    <!-- beard -->
    <path class="adel-beard" d="M92 116 q2 30 36 36 q34 -6 36 -36 q-4 26 -16 30 q-8 8 -20 8 q-12 0 -20 -8 q-12 -4 -16 -30 z" fill="#16202b"/>
    <!-- brows -->
    <g class="adel-brows" fill="#16202b">
      <rect class="adel-brow-l" x="98"  y="92" width="24" height="6" rx="3"/>
      <rect class="adel-brow-r" x="134" y="92" width="24" height="6" rx="3"/>
    </g>
    <!-- eyes -->
    <g class="adel-eyes">
      <g class="adel-eye adel-eye-l">
        <ellipse cx="110" cy="106" rx="7" ry="6" fill="#ffffff"/>
        <circle class="adel-pupil" cx="110" cy="106" r="3.2" fill="#16202b"/>
        <rect class="adel-lid" x="101" y="98" width="18" height="16" rx="8" fill="#cd9663"/>
      </g>
      <g class="adel-eye adel-eye-r">
        <ellipse cx="146" cy="106" rx="7" ry="6" fill="#ffffff"/>
        <circle class="adel-pupil" cx="146" cy="106" r="3.2" fill="#16202b"/>
        <rect class="adel-lid" x="137" y="98" width="18" height="16" rx="8" fill="#cd9663"/>
      </g>
    </g>
    <!-- nose -->
    <path d="M126 110 q2 8 0 12 q3 3 6 0" fill="none" stroke="#a9744a" stroke-width="3" stroke-linecap="round"/>
    <!-- mouth -->
    <g class="adel-mouth-g">
      <path class="adel-mouth" d="M116 136 q12 8 24 0" fill="none" stroke="#5b3a25" stroke-width="4" stroke-linecap="round"/>
      <ellipse class="adel-mouth-open" cx="128" cy="138" rx="9" ry="5" fill="#5b3a25"/>
    </g>
  </g>
  <!-- salute arm (hidden unless saluting) -->
  <g class="adel-arm">
    <path d="M196 232 q26 -28 12 -98 l-14 -16 -14 10 q16 56 -2 96 z" fill="#f7f9fb" stroke="#10212f" stroke-width="5"/>
    <path d="M180 122 l16 -14 q12 6 8 20 l-12 12 z" fill="#cd9663" stroke="#a9744a" stroke-width="2"/>
  </g>
</svg>`;

  /* A page can mount the Captain more than once (the big welcome figure is
     removed with the welcome card on the first question; the small header
     figure persists), so state fans out to every still-attached mount. */
  const mounts = [];
  let decayTimer = null;

  function liveMounts() {
    for (let i = mounts.length - 1; i >= 0; i--) {
      if (!mounts[i].isConnected) mounts.splice(i, 1);
    }
    return mounts;
  }

  function setState(state) {
    if (!STATES.has(state)) return;
    const figures = liveMounts();
    if (!figures.length) return;
    for (const svg of figures) svg.dataset.state = state;
    if (decayTimer) { clearTimeout(decayTimer); decayTimer = null; }
    const ms = DECAY_MS[state];
    if (ms) {
      decayTimer = setTimeout(() => {
        // Only fall back if nothing replaced the state meanwhile.
        for (const svg of liveMounts()) {
          if (svg.dataset.state === state) svg.dataset.state = 'idle';
        }
      }, ms);
    }
  }

  function mount(el) {
    if (!el) return null;
    el.innerHTML = SVG;
    const svg = el.querySelector('svg.adel-figure');
    if (svg) mounts.push(svg);
    return svg;
  }

  document.addEventListener('adel:state', (e) => {
    const s = e && e.detail && e.detail.state;
    if (s) setState(s);
  });

  // Auto-mount: a page opts in per element with data-adel-mount (any static
  // <img> inside becomes the no-JS fallback and is replaced here).
  function autoMount() {
    document.querySelectorAll('[data-adel-mount]').forEach((host) => mount(host));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }

  window.AdelCharacter = { mount, setState, STATES };
})();
