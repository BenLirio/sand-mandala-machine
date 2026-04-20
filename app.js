// Sand Mandala Machine — procedural mandala renderer
// Seeded PRNG: same slider config → same mandala, always.

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashSliders(chaos, warmth, symmetry, grain) {
  const s = `${chaos}|${warmth}|${symmetry}|${grain}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Archetype table ──────────────────────────────────────────────────────────
const ARCHETYPES = [
  {
    name: "The Crumbling Order",
    desc: (c, w, s, g) => `High chaos (${c}) fractures your ${s}-fold symmetry into something that shouldn't hold together — yet does, barely.`,
  },
  {
    name: "The Fever Dream Compass",
    desc: (c, w, s, g) => `Warmth at ${w} bleeds the colors past the lines. Your ${g}-density grain smears like memory.`,
  },
  {
    name: "The Still Observatory",
    desc: (c, w, s, g) => `${s} axes of perfect silence. ${g} grains of restraint. Whatever you were afraid of, it isn't here.`,
  },
  {
    name: "The Burning Wheel",
    desc: (c, w, s, g) => `Color temperature ${w} ignites the outer rings. Chaos (${c}) fans the flame but cannot extinguish the center.`,
  },
  {
    name: "The Slow Collapse",
    desc: (c, w, s, g) => `Grain density ${g} is just enough weight to make the whole thing sag inward, deliberately.`,
  },
  {
    name: "The Frozen Argument",
    desc: (c, w, s, g) => `${s} symmetry axes, none of them agreeing. Chaos ${c} is the referee. Nobody wins.`,
  },
  {
    name: "The Unmarked Threshold",
    desc: (c, w, s, g) => `You built something with ${s}-fold precision and then chaos (${c}) walked through it. The door is still open.`,
  },
  {
    name: "The Ember Council",
    desc: (c, w, s, g) => `Warmth ${w} assembles ${s} ancient presences around a core of grain-${g} sediment. They have been waiting.`,
  },
  {
    name: "The Patient Geometry",
    desc: (c, w, s, g) => `${s} axes. Grain ${g}. Chaos held at exactly ${c}. This mandala has been practicing for a long time.`,
  },
  {
    name: "The Spilled Ceremony",
    desc: (c, w, s, g) => `Chaos ${c} arrived too early. ${g}-density sand is everywhere except where it was supposed to go. It's better this way.`,
  },
  {
    name: "The Glass Monastery",
    desc: (c, w, s, g) => `Low warmth (${w}) renders everything brittle and precise. ${s} perfect corridors. Don't breathe too hard.`,
  },
  {
    name: "The Wound That Healed Ornate",
    desc: (c, w, s, g) => `Chaos ${c} made a mark. Grain ${g} filled it in. ${s}-fold symmetry made it sacred.`,
  },
];

// ── Color palette generation ─────────────────────────────────────────────────
function buildPalette(warmth, rng) {
  // warmth 0=icy blue/violet, 100=deep ember/ochre
  const t = warmth / 100;
  // Base hue range: cold=180-270, warm=0-50
  const hueBase = (1 - t) * 220 + t * 15;
  const hueRange = 60;
  const satBase = 55 + t * 30;
  const lightBase = 38 + (1 - t) * 18;

  const colors = [];
  for (let i = 0; i < 6; i++) {
    const hShift = (rng() - 0.5) * hueRange;
    const sShift = (rng() - 0.5) * 20;
    const lShift = (rng() - 0.5) * 20;
    colors.push({
      h: ((hueBase + hShift) % 360 + 360) % 360,
      s: Math.min(100, Math.max(20, satBase + sShift)),
      l: Math.min(75, Math.max(18, lightBase + lShift)),
    });
  }
  // Always add a near-black and near-white variant
  colors.push({ h: hueBase, s: 20, l: 10 });
  colors.push({ h: (hueBase + 30) % 360, s: 15, l: 88 });
  return colors;
}

function hslStr(c, alpha) {
  if (alpha !== undefined) return `hsla(${c.h},${c.s}%,${c.l}%,${alpha})`;
  return `hsl(${c.h},${c.s}%,${c.l}%)`;
}

// ── p5 sketch (instance mode) ─────────────────────────────────────────────────
let p5Instance = null;
let renderComplete = false;
let currentParams = null;

function launchSketch(params) {
  const { chaos, warmth, symmetry, grain } = params;
  const seed = hashSliders(chaos, warmth, symmetry, grain);
  const rng = mulberry32(seed);
  const palette = buildPalette(warmth, rng);

  const SIZE = Math.min(window.innerWidth - 32, 480);
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = SIZE * 0.44;

  // Grain / particle count: map 0-100 → 800-4000
  const PARTICLES = Math.round(800 + (grain / 100) * 3200);
  // Chaos: affects layer wobble amplitude
  const WOBBLE = (chaos / 100) * 0.55 + 0.02;
  // Symmetry: how many-fold
  const FOLDS = symmetry;
  // Render speed: grains per frame
  const GRAINS_PER_FRAME = 120;

  let deposited = 0;
  let done = false;

  // Pre-compute rings
  const RINGS = [];
  const ringCount = 4 + Math.floor(rng() * 4); // 4-7 rings
  for (let r = 0; r < ringCount; r++) {
    const frac = (r + 1) / (ringCount + 1);
    RINGS.push({
      radius: R * frac,
      colorIdx: Math.floor(rng() * palette.length),
      density: 0.6 + rng() * 0.4,
      wobblePhase: rng() * Math.PI * 2,
      wobbleMag: WOBBLE * (0.5 + rng() * 0.5),
      dotSize: 1.5 + rng() * 3,
    });
  }

  // Petal layer definitions
  const PETALS = [];
  const petalCount = 2 + Math.floor(rng() * 3); // 2-4 petal layers
  for (let p = 0; p < petalCount; p++) {
    PETALS.push({
      innerR: R * (0.08 + rng() * 0.15),
      outerR: R * (0.25 + rng() * 0.45),
      colorIdx: Math.floor(rng() * palette.length),
      angOffset: rng() * (Math.PI / FOLDS),
      width: 0.12 + rng() * 0.28,
      alpha: 0.15 + rng() * 0.35,
    });
  }

  const sketch = (p) => {
    let offscreenG;

    p.setup = function () {
      const cnv = p.createCanvas(SIZE, SIZE);
      cnv.parent('canvas-wrapper');
      p.colorMode(p.HSL, 360, 100, 100, 1);
      p.background(20, 10, 6);

      // Draw static petal shapes first
      p.noStroke();
      for (let fold = 0; fold < FOLDS; fold++) {
        const angle = (fold / FOLDS) * Math.PI * 2;
        for (const pet of PETALS) {
          const c = palette[pet.colorIdx];
          p.fill(c.h, c.s, c.l, pet.alpha);
          // Draw a petal arc between inner and outer radius
          p.beginShape();
          const steps = 30;
          const halfW = pet.width * Math.PI / FOLDS;
          for (let i = 0; i <= steps; i++) {
            const a = angle + pet.angOffset - halfW + (i / steps) * halfW * 2;
            p.vertex(CX + Math.cos(a) * pet.outerR, CY + Math.sin(a) * pet.outerR);
          }
          for (let i = steps; i >= 0; i--) {
            const a = angle + pet.angOffset - halfW + (i / steps) * halfW * 2;
            p.vertex(CX + Math.cos(a) * pet.innerR, CY + Math.sin(a) * pet.innerR);
          }
          p.endShape(p.CLOSE);
        }
      }

      // Center dot
      const cc = palette[Math.floor(rng() * palette.length)];
      p.fill(cc.h, cc.s, Math.min(cc.l + 20, 90), 0.9);
      p.ellipse(CX, CY, R * 0.06, R * 0.06);
    };

    p.draw = function () {
      if (done) {
        p.noLoop();
        showResult(params, seed);
        return;
      }

      // Deposit GRAINS_PER_FRAME sand grains this frame
      p.noStroke();
      for (let i = 0; i < GRAINS_PER_FRAME && deposited < PARTICLES; i++, deposited++) {
        // Pick a ring
        const ring = RINGS[Math.floor(rng() * RINGS.length)];
        // Random angle, then wobble
        const baseAngle = rng() * Math.PI * 2;
        // Snap to nearest fold symmetry
        const foldAngle = Math.round(baseAngle / (Math.PI * 2 / FOLDS)) * (Math.PI * 2 / FOLDS);
        const localAngle = baseAngle - foldAngle;
        const snappedAngle = foldAngle + localAngle * (0.3 + (1 - chaos / 100) * 0.7);

        const wobbleR = ring.radius + (rng() - 0.5) * ring.radius * ring.wobbleMag * 0.8;
        const jitter = (rng() - 0.5) * R * 0.04 * (1 + chaos / 100);

        const gx = CX + Math.cos(snappedAngle) * wobbleR + jitter;
        const gy = CY + Math.sin(snappedAngle) * wobbleR + jitter;

        const c = palette[ring.colorIdx];
        const alphaVal = 0.35 + rng() * 0.45;
        p.fill(c.h, c.s, c.l, alphaVal);
        const ds = ring.dotSize * (0.5 + rng() * 1.0);
        p.ellipse(gx, gy, ds, ds);

        // Mirror across all folds
        for (let f = 1; f < FOLDS; f++) {
          const mirrorAngle = snappedAngle + (f / FOLDS) * Math.PI * 2;
          const mx = CX + Math.cos(mirrorAngle) * wobbleR + jitter * Math.cos(mirrorAngle - snappedAngle);
          const my = CY + Math.sin(mirrorAngle) * wobbleR + jitter * Math.sin(mirrorAngle - snappedAngle);
          p.fill(c.h, c.s, c.l, alphaVal);
          p.ellipse(mx, my, ds, ds);
        }
      }

      if (deposited >= PARTICLES) {
        done = true;
      }
    };
  };

  if (p5Instance) {
    p5Instance.remove();
  }
  p5Instance = new p5(sketch);
}

// ── Show archetype after render completes ────────────────────────────────────
function showResult(params, seed) {
  const { chaos, warmth, symmetry, grain } = params;
  const idx = seed % ARCHETYPES.length;
  const archetype = ARCHETYPES[idx];

  document.getElementById('archetype-name').textContent = archetype.name;
  document.getElementById('archetype-desc').textContent = archetype.desc(chaos, warmth, symmetry, grain);

  // Build URL with params so the same mandala can be shared
  const url = new URL(location.href);
  url.searchParams.set('c', chaos);
  url.searchParams.set('w', warmth);
  url.searchParams.set('s', symmetry);
  url.searchParams.set('g', grain);
  window.history.replaceState({}, '', url.toString());

  document.getElementById('result-panel').style.display = 'flex';
}

// ── Download card ─────────────────────────────────────────────────────────────
function downloadCard() {
  const canvas = document.querySelector('#canvas-wrapper canvas');
  if (!canvas) return;

  // Create composite card
  const cardW = canvas.width;
  const cardH = canvas.height + 120;
  const offscreen = document.createElement('canvas');
  offscreen.width = cardW;
  offscreen.height = cardH;
  const ctx = offscreen.getContext('2d');

  // Background
  ctx.fillStyle = '#14070014';
  ctx.fillRect(0, 0, cardW, cardH);

  // Draw mandala
  ctx.drawImage(canvas, 0, 0);

  // Footer
  ctx.fillStyle = 'rgba(20,7,0,0.92)';
  ctx.fillRect(0, canvas.height, cardW, 120);

  const name = document.getElementById('archetype-name').textContent;
  ctx.fillStyle = '#d4a017';
  ctx.font = 'bold 18px serif';
  ctx.textAlign = 'center';
  ctx.fillText(name, cardW / 2, canvas.height + 40);

  const { chaos, warmth, symmetry, grain } = currentParams;
  ctx.fillStyle = '#7a6a52';
  ctx.font = '12px monospace';
  ctx.fillText(`chaos:${chaos}  temp:${warmth}  axis:${symmetry}  grain:${grain}`, cardW / 2, canvas.height + 64);

  ctx.fillStyle = '#c0392b';
  ctx.font = '11px serif';
  ctx.fillText('Sand Mandala Machine', cardW / 2, canvas.height + 96);

  const link = document.createElement('a');
  link.download = `mandala-${name.toLowerCase().replace(/\s+/g, '-')}.png`;
  link.href = offscreen.toDataURL('image/png');
  link.click();
}

// ── Share ─────────────────────────────────────────────────────────────────────
function share() {
  const url = location.href;
  if (navigator.share) {
    navigator.share({
      title: `My mandala: ${document.getElementById('archetype-name').textContent}`,
      url,
    });
  } else {
    navigator.clipboard.writeText(url).then(() => alert('Link copied! Same sliders = same mandala.'));
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetApp() {
  if (p5Instance) { p5Instance.remove(); p5Instance = null; }
  document.getElementById('render-panel').style.display = 'none';
  document.getElementById('result-panel').style.display = 'none';
  document.getElementById('controls-panel').style.display = 'flex';
  document.getElementById('canvas-wrapper').innerHTML = '';
  // Clean URL
  window.history.replaceState({}, '', location.pathname);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Wire up slider displays
  const sliders = [
    { id: 'chaos', displayId: 'chaos-val' },
    { id: 'warmth', displayId: 'warmth-val' },
    { id: 'symmetry', displayId: 'symmetry-val' },
    { id: 'grain', displayId: 'grain-val' },
  ];

  for (const { id, displayId } of sliders) {
    const el = document.getElementById(id);
    const disp = document.getElementById(displayId);
    el.addEventListener('input', () => { disp.textContent = el.value; });
  }

  // Check for URL params (shared link)
  const params = new URLSearchParams(location.search);
  if (params.has('c') && params.has('w') && params.has('s') && params.has('g')) {
    const c = parseInt(params.get('c'), 10);
    const w = parseInt(params.get('w'), 10);
    const s = parseInt(params.get('s'), 10);
    const g = parseInt(params.get('g'), 10);

    document.getElementById('chaos').value = c;
    document.getElementById('chaos-val').textContent = c;
    document.getElementById('warmth').value = w;
    document.getElementById('warmth-val').textContent = w;
    document.getElementById('symmetry').value = s;
    document.getElementById('symmetry-val').textContent = s;
    document.getElementById('grain').value = g;
    document.getElementById('grain-val').textContent = g;

    // Auto-render
    setTimeout(() => startRender(), 300);
  }

  document.getElementById('render-btn').addEventListener('click', startRender);
});

function startRender() {
  const chaos = parseInt(document.getElementById('chaos').value, 10);
  const warmth = parseInt(document.getElementById('warmth').value, 10);
  const symmetry = parseInt(document.getElementById('symmetry').value, 10);
  const grain = parseInt(document.getElementById('grain').value, 10);

  currentParams = { chaos, warmth, symmetry, grain };

  // Hide controls, show loading
  document.getElementById('controls-panel').style.display = 'none';
  document.getElementById('render-panel').style.display = 'block';
  document.getElementById('loading-msg').style.display = 'block';
  document.getElementById('result-panel').style.display = 'none';
  document.getElementById('canvas-wrapper').innerHTML = '';

  // Show loading for at least 800ms
  const minLoadEnd = Date.now() + 800;

  setTimeout(() => {
    document.getElementById('loading-msg').style.display = 'none';
    launchSketch(currentParams);
  }, 800);
}
