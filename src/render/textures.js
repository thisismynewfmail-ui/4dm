// ---------------------------------------------------------------------------
// The 4D-MC texture set. Every tile is drawn from code at boot.
// Palette philosophy: earthy, low-saturation, 3-5 shades per material for the
// Beta feel — with a cyan/violet "hyper" family reserved for 4D materials so
// that anything belonging to the fourth dimension reads instantly.
// ---------------------------------------------------------------------------

import {
  TS, Tile, hex, ramp, ramp2, grain, speckle, blob, outline, vshade, mixc, mulc, makeNoise,
} from './texgen.js';

const T = {}; // name -> draw(tile)

// ===========================================================================
// Shared drawing helpers
// ===========================================================================

function dline(t, x0, y0, x1, y1, w, pick) {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const cx = x0 + (x1 - x0) * u, cy = y0 + (y1 - y0) * u;
    const h = (w - 1) / 2;
    for (let j = -Math.ceil(h); j <= Math.ceil(h); j++) {
      for (let i = -Math.ceil(h); i <= Math.ceil(h); i++) {
        if (Math.abs(i) + Math.abs(j) > w - 1) continue;
        const x = Math.round(cx + i), y = Math.round(cy + j);
        t.px(x, y, pick(t.rng(), x, y));
      }
    }
  }
}

/** Stone-like base reused by every ore. */
function stoneBase(t) {
  grain(t, ramp('#7d7d7d', 5, 0.66, 1.18), { cells: 6, fine: 0.5, contrast: 1.05 });
  speckle(t, [hex('#616161'), hex('#8d8d8d')], 24);
}

function oreOf(baseHex, glowHex, count = 5, radius = 1.9) {
  return (t) => {
    stoneBase(t);
    const sh = ramp2(baseHex, glowHex, 4);
    for (let i = 0; i < count; i++) {
      blob(t, 2 + t.rng() * 12, 2 + t.rng() * 12, radius * (0.7 + t.rng() * 0.6), sh, { wobble: 0.5 });
    }
    speckle(t, [sh[3]], 5, { size: 1 });
  };
}

function plankTex(darkHex, lightHex, rows = 4) {
  return (t) => {
    const sh = ramp2(darkHex, lightHex, 5);
    grain(t, sh, { cells: 16, fine: 0.85, contrast: 0.75 });
    const seam = mulc(hex(darkHex), 0.6);
    const band = TS / rows;
    for (let r = 0; r < rows; r++) {
      const y = Math.round(r * band);
      t.hline(0, 15, y, seam);
      t.hline(0, 15, y + 1, mixc(hex(lightHex), seam, 0.45));
      // one vertical butt-joint per board, offset per row
      const jx = Math.floor(t.rng() * 14) + 1;
      for (let k = 2; k < band; k++) t.px(jx, y + k, seam);
    }
    // long grain streaks
    for (let s = 0; s < 10; s++) {
      const y = Math.floor(t.rng() * TS);
      const x0 = Math.floor(t.rng() * 10);
      const c = t.rng() < 0.5 ? mulc(hex(darkHex), 0.85) : mulc(hex(lightHex), 1.05);
      for (let x = x0; x < x0 + 3 + t.rng() * 6; x++) t.px(x, y, c);
    }
  };
}

function logSide(barkDark, barkLight) {
  return (t) => {
    const sh = ramp2(barkDark, barkLight, 5);
    grain(t, sh, { cells: 4, fine: 0.7, contrast: 1.1 });
    for (let x = 0; x < TS; x++) {
      const drift = Math.sin(x * 0.9) * 0.5;
      for (let y = 0; y < TS; y++) {
        if (((x + Math.round(drift + y * 0.1)) % 4) === 0 && t.rng() < 0.75) t.px(x, y, sh[0]);
        if (((x + Math.round(drift)) % 7) === 3 && t.rng() < 0.4) t.px(x, y, sh[4]);
      }
    }
  };
}

function logTop(barkDark, barkLight, coreDark, coreLight) {
  return (t) => {
    const bark = ramp2(barkDark, barkLight, 4);
    const core = ramp2(coreDark, coreLight, 4);
    grain(t, core, { cells: 8, fine: 0.6, contrast: 0.8 });
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 7.1) { t.px(x, y, bark[Math.floor(t.rng() * 2)]); continue; }
      if (d > 6.2) { t.px(x, y, bark[1 + Math.floor(t.rng() * 3)]); continue; }
      const ring = Math.sin(d * 2.6) * 0.5 + 0.5;
      const i = Math.min(3, Math.floor(ring * 3 + t.rng() * 0.8));
      t.px(x, y, core[i]);
    }
  };
}

function leafTex(darkHex, lightHex, holes = 26, alphaGlow = 0) {
  return (t) => {
    const sh = ramp2(darkHex, lightHex, 5);
    grain(t, sh, { cells: 5, fine: 0.65, contrast: 1.35 });
    speckle(t, [sh[0], sh[4]], 30);
    // punch irregular holes so canopies read as foliage, not green cubes
    const n = makeNoise(t.rng, 6);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      if (n(x, y) + t.rng() * 0.5 < 0.34) t.px(x, y, [0, 0, 0], 0);
    }
    for (let k = 0; k < holes; k++) {
      t.px(Math.floor(t.rng() * TS), Math.floor(t.rng() * TS), [0, 0, 0], 0);
    }
    if (alphaGlow) speckle(t, [hex('#b6ffe9'), hex('#7ef2ff')], alphaGlow);
  };
}

function woolTex(baseHex) {
  return (t) => {
    grain(t, ramp(baseHex, 4, 0.84, 1.12), { cells: 16, fine: 0.9, contrast: 0.6 });
    speckle(t, [mulc(hex(baseHex), 0.78), mulc(hex(baseHex), 1.14)], 40);
    // faint woven cross-hatch
    for (let y = 1; y < TS; y += 4) t.hline(0, 15, y, mulc(hex(baseHex), 0.9));
    for (let x = 3; x < TS; x += 4) t.vline(x, 0, 15, mulc(hex(baseHex), 1.06));
  };
}

function crystalTex(darkHex, lightHex) {
  return (t) => {
    t.clear();
    const sh = ramp2(darkHex, lightHex, 5);
    grain(t, [sh[1], sh[2], sh[3], sh[4]], { cells: 4, fine: 0.35, contrast: 1.15, alpha: 225 });
    // facet lines radiating from centre, plus a bright core
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2 + 0.3;
      dline(t, 8, 8, 8 + Math.cos(ang) * 9, 8 + Math.sin(ang) * 9, 1, () => sh[4]);
    }
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const p = t.get(x, y);
      const f = 1 + Math.max(0, 1 - d / 6) * 0.5;
      t.px(x, y, [p[0] * f, p[1] * f, p[2] * f], 215 + Math.floor(t.rng() * 40));
    }
    speckle(t, [hex('#ffffff')], 9, { alpha: 255 });
  };
}

function crossPlant(colorsDark, colorsLight, opts = {}) {
  const { stems = 5, height = 13, base = 15, curve = 2.2, top = 3, seedTip = null } = opts;
  return (t) => {
    t.clear();
    const sh = ramp2(colorsDark, colorsLight, 4);
    for (let s = 0; s < stems; s++) {
      const x0 = 2 + Math.floor(t.rng() * 12);
      const h = height - Math.floor(t.rng() * 4);
      const bend = (t.rng() - 0.5) * curve;
      for (let k = 0; k <= h; k++) {
        const y = base - k;
        if (y < top) break;
        const x = Math.round(x0 + bend * (k / h) * (k / h) * 2);
        const c = sh[Math.min(3, Math.floor((k / h) * 3 + t.rng() * 1.2))];
        t.px(x, y, c);
        if (t.rng() < 0.34) t.px(x + (t.rng() < 0.5 ? -1 : 1), y, sh[Math.floor(t.rng() * 2)]);
      }
      if (seedTip) {
        const y = Math.max(top, base - h);
        t.px(x0, y - 1, seedTip); t.px(x0 + 1, y - 1, seedTip);
        t.px(x0, y - 2, seedTip);
      }
    }
  };
}

function flowerTex(petalHex, coreHex) {
  return (t) => {
    t.clear();
    const stem = ramp2('#3c6a2c', '#6da349', 3);
    for (let y = 15; y >= 8; y--) t.px(8 + (y > 12 ? 0 : (y % 2 ? 0 : -1)), y, stem[1 + (y % 2)]);
    t.px(6, 12, stem[2]); t.px(5, 11, stem[1]);
    t.px(10, 13, stem[2]); t.px(11, 12, stem[1]);
    const p = ramp(petalHex, 3, 0.75, 1.18);
    const petals = [[8, 4], [6, 5], [10, 5], [5, 7], [11, 7], [6, 9], [10, 9], [8, 10], [7, 6], [9, 6], [7, 8], [9, 8]];
    for (const [x, y] of petals) t.px(x, y, p[Math.floor(t.rng() * 3)]);
    t.px(8, 6, hex(coreHex)); t.px(8, 7, hex(coreHex)); t.px(7, 7, mulc(hex(coreHex), 0.8)); t.px(9, 7, mulc(hex(coreHex), 1.1));
  };
}

function mushroomTex(capHex, spotHex, stemHex) {
  return (t) => {
    t.clear();
    const cap = ramp(capHex, 4, 0.7, 1.15);
    const stem = ramp(stemHex, 3, 0.8, 1.12);
    for (let y = 4; y <= 9; y++) {
      const w = y < 6 ? 4 : (y < 8 ? 6 : 7);
      for (let x = 8 - w; x <= 7 + w; x++) t.px(x, y, cap[Math.floor(t.rng() * 3) + (y < 6 ? 1 : 0)]);
    }
    const sp = hex(spotHex);
    for (const [x, y] of [[5, 6], [10, 7], [7, 5], [12, 8], [3, 8]]) { t.px(x, y, sp); t.px(x + 1, y, sp); }
    for (let y = 10; y <= 14; y++) for (let x = 6; x <= 9; x++) t.px(x, y, stem[Math.floor(t.rng() * 3)]);
    t.rect(5, 14, 6, 1, stem[0]);
  };
}

function saplingTex(leafDark, leafLight, glow) {
  return (t) => {
    t.clear();
    const wood = ramp2('#4a3521', '#6d5133', 3);
    for (let y = 15; y >= 8; y--) t.px(8, y, wood[y % 3]);
    const sh = ramp2(leafDark, leafLight, 4);
    for (let k = 0; k < 34; k++) {
      const a = t.rng() * Math.PI * 2, r = t.rng() * 4.4;
      t.px(Math.round(8 + Math.cos(a) * r), Math.round(6 + Math.sin(a) * r * 0.85), sh[Math.floor(t.rng() * 4)]);
    }
    if (glow) speckle(t, [hex('#b9ffe8')], 4);
  };
}

// ===========================================================================
// Terrain & stone
// ===========================================================================

T.air = (t) => t.clear();

T.boundary = (t) => {
  grain(t, ramp('#3a3f4d', 5, 0.55, 1.3), { cells: 4, fine: 0.6, contrast: 1.5 });
  speckle(t, [hex('#20232c'), hex('#6a7488')], 30);
  for (let k = 0; k < 5; k++) blob(t, t.rng() * 16, t.rng() * 16, 2.4, ramp('#2b2f3a', 3, 0.7, 1.1), { wobble: 0.6 });
};

T.stone = (t) => stoneBase(t);

T.cobblestone = (t) => {
  grain(t, ramp('#4f4f4f', 3, 0.6, 0.95), { cells: 16, fine: 1, contrast: 0.6 });
  const sh = ramp('#828282', 5, 0.62, 1.18);
  const pts = [[3, 3, 3.1], [11, 3, 2.9], [3, 10, 2.8], [10, 10, 3.2], [7, 7, 2.2], [14, 7, 2.1], [0, 7, 2.0], [7, 0, 2.0], [7, 14, 2.1]];
  for (const [x, y, r] of pts) blob(t, x, y, r, sh, { wobble: 0.42 });
  speckle(t, [hex('#5a5a5a'), hex('#9a9a9a')], 18);
};

T.mossy_cobblestone = (t) => {
  T.cobblestone(t);
  const moss = ramp2('#38542b', '#6a8f45', 4);
  const n = makeNoise(t.rng, 5);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (n(x, y) > 0.56 && t.rng() < 0.85) t.px(x, y, moss[Math.floor(t.rng() * 4)]);
  }
};

T.stone_bricks = (t) => {
  grain(t, ramp('#7a7a7a', 4, 0.72, 1.1), { cells: 16, fine: 1, contrast: 0.5 });
  const mortar = hex('#565656');
  for (let r = 0; r < 4; r++) {
    const y = r * 4;
    t.hline(0, 15, y, mortar);
    const off = (r % 2) ? 0 : 8;
    for (let k = 0; k < 2; k++) t.vline((off + k * 8) % 16, y + 1, y + 3, mortar);
  }
  speckle(t, [hex('#8f8f8f'), hex('#666666')], 26);
  vshade(t, 1.06, 0.95);
};

T.cracked_bricks = (t) => {
  T.stone_bricks(t);
  const dk = hex('#3f3f3f');
  for (let k = 0; k < 4; k++) {
    let x = Math.floor(t.rng() * 16), y = Math.floor(t.rng() * 16);
    for (let s = 0; s < 7; s++) {
      t.px(x, y, dk);
      x += t.rng() < 0.5 ? 1 : (t.rng() < 0.5 ? -1 : 0);
      y += t.rng() < 0.6 ? 1 : 0;
    }
  }
};

T.slate = (t) => {
  grain(t, ramp2('#33373f', '#5a6069', 5), { cells: 3, fine: 0.35, contrast: 1.2 });
  for (let y = 0; y < TS; y += 3) t.hline(0, 15, y + (t.rng() * 2 | 0), mulc(hex('#22252b'), 1));
  speckle(t, [hex('#6f7681')], 14);
};

T.marble = (t) => {
  grain(t, ramp2('#c9c6bd', '#efeee7', 4), { cells: 5, fine: 0.4, contrast: 0.8 });
  const vein = hex('#9a978d');
  for (let k = 0; k < 3; k++) {
    let x = t.rng() * 16, y = t.rng() * 16;
    const a = t.rng() * 6.28;
    for (let s = 0; s < 20; s++) {
      t.px(Math.round(x), Math.round(y), vein);
      x += Math.cos(a + Math.sin(s * 0.4)) * 1.1;
      y += Math.sin(a + Math.sin(s * 0.4)) * 1.1;
    }
  }
};

T.basalt = (t) => {
  grain(t, ramp2('#2f3136', '#54585f', 5), { cells: 3, fine: 0.55, contrast: 1.3 });
  for (let x = 0; x < TS; x += 5) t.vline(x + (t.rng() * 2 | 0), 0, 15, hex('#212328'));
  speckle(t, [hex('#63686f')], 16);
};

T.ashstone = (t) => {
  grain(t, ramp2('#4a423d', '#7d726a', 5), { cells: 6, fine: 0.6, contrast: 1.15 });
  speckle(t, [hex('#332e2a'), hex('#93877e')], 34);
  for (let k = 0; k < 6; k++) blob(t, t.rng() * 16, t.rng() * 16, 1.8, ramp('#3b342f', 3), { wobble: 0.7 });
};

T.obsidian = (t) => {
  grain(t, ramp2('#100c1c', '#2c2340', 5), { cells: 4, fine: 0.5, contrast: 1.4 });
  speckle(t, [hex('#4a3a68'), hex('#6b53a0')], 16);
  for (let k = 0; k < 3; k++) {
    const x = Math.floor(t.rng() * 14) + 1, y = Math.floor(t.rng() * 12) + 2;
    t.px(x, y, hex('#8e73c9')); t.px(x + 1, y + 1, hex('#7660ad'));
  }
};

T.terracotta = (t) => {
  grain(t, ramp2('#8a5136', '#b8785a', 5), { cells: 5, fine: 0.55, contrast: 0.95 });
  speckle(t, [hex('#71402b'), hex('#cd9375')], 28);
};

T.bricks = (t) => {
  grain(t, ramp2('#8b4a3c', '#b26a55', 4), { cells: 16, fine: 1, contrast: 0.55 });
  const mortar = hex('#8f857a');
  for (let r = 0; r < 4; r++) {
    const y = r * 4 + 3;
    t.hline(0, 15, y, mortar);
    const off = (r % 2) ? 4 : 12;
    t.vline(off, y - 3, y - 1, mortar);
    t.vline((off + 8) % 16, y - 3, y - 1, mortar);
  }
  speckle(t, [hex('#7a4033'), hex('#c07f68')], 22, { mask: (x, y) => (y % 4) !== 3 });
};

// --- soil ---
T.dirt = (t) => {
  grain(t, ramp2('#5f452c', '#8a6742', 5), { cells: 6, fine: 0.6, contrast: 1.1 });
  speckle(t, [hex('#4a3521'), hex('#9c7a52')], 40);
};

const GRASS_DARK = '#4c7a34', GRASS_LIGHT = '#7fae55';

T.grass_top = (t) => {
  grain(t, ramp2(GRASS_DARK, GRASS_LIGHT, 5), { cells: 5, fine: 0.62, contrast: 1.15 });
  speckle(t, [hex('#3f6b2a'), hex('#93c165')], 44);
};

T.grass_side = (t) => {
  T.dirt(t);
  const g = ramp2(GRASS_DARK, GRASS_LIGHT, 5);
  const n = makeNoise(t.rng, 8);
  for (let x = 0; x < TS; x++) {
    const h = 3 + Math.round(n(x, 0) * 3.2);
    for (let y = 0; y < h; y++) t.px(x, y, g[Math.floor(t.rng() * 4) + 1]);
    if (t.rng() < 0.5) t.px(x, h, g[Math.floor(t.rng() * 2)]);
  }
};

T.podzol_top = (t) => {
  grain(t, ramp2('#4a3a22', '#7a6132', 5), { cells: 5, fine: 0.7, contrast: 1.2 });
  speckle(t, [hex('#8f7b3f'), hex('#33280f'), hex('#5d6b34')], 46);
};
T.podzol_side = (t) => {
  T.dirt(t);
  const g = ramp2('#4a3a22', '#836a37', 4);
  const n = makeNoise(t.rng, 8);
  for (let x = 0; x < TS; x++) {
    const h = 2 + Math.round(n(x, 0) * 3);
    for (let y = 0; y < h; y++) t.px(x, y, g[Math.floor(t.rng() * 4)]);
  }
};

T.mycelium_top = (t) => {
  grain(t, ramp2('#584a5e', '#8c7a92', 5), { cells: 4, fine: 0.7, contrast: 1.25 });
  speckle(t, [hex('#9d86b8'), hex('#40374a')], 44);
};
T.mycelium_side = (t) => {
  T.dirt(t);
  const g = ramp2('#584a5e', '#8c7a92', 4);
  const n = makeNoise(t.rng, 8);
  for (let x = 0; x < TS; x++) {
    const h = 2 + Math.round(n(x, 0) * 3);
    for (let y = 0; y < h; y++) t.px(x, y, g[Math.floor(t.rng() * 4)]);
  }
};

T.sand = (t) => {
  grain(t, ramp2('#c8b78a', '#e8dcb4', 4), { cells: 7, fine: 0.75, contrast: 0.8 });
  speckle(t, [hex('#b4a074'), hex('#f2ebcc')], 42);
};
T.red_sand = (t) => {
  grain(t, ramp2('#a45f34', '#d18c56', 4), { cells: 7, fine: 0.75, contrast: 0.8 });
  speckle(t, [hex('#8d4c28'), hex('#e2a473')], 42);
};
T.sandstone = (t) => {
  grain(t, ramp2('#c2b184', '#ded0a6', 4), { cells: 16, fine: 1, contrast: 0.45 });
  for (let y = 0; y < TS; y += 4) t.hline(0, 15, y, hex('#a89876'));
  for (let y = 1; y < TS; y += 4) t.hline(0, 15, y, hex('#e6dcb8'));
  speckle(t, [hex('#b0a077')], 18);
};
T.sandstone_top = (t) => {
  grain(t, ramp2('#c8b78a', '#e5d8b0', 4), { cells: 8, fine: 0.6, contrast: 0.7 });
  for (let k = 0; k < 4; k++) blob(t, t.rng() * 16, t.rng() * 16, 3, ramp('#d3c396', 3), { wobble: 0.3 });
};

T.gravel = (t) => {
  grain(t, ramp2('#5b5651', '#8d857c', 5), { cells: 16, fine: 1, contrast: 0.7 });
  for (let k = 0; k < 12; k++) {
    const pal = t.rng() < 0.5 ? ramp('#7d766d', 3) : ramp('#5a5450', 3);
    blob(t, t.rng() * 16, t.rng() * 16, 1.3 + t.rng() * 1.2, pal, { wobble: 0.6 });
  }
  speckle(t, [hex('#a49a8e'), hex('#3f3b37')], 30);
};

T.clay = (t) => {
  grain(t, ramp2('#8b909c', '#b6bbc6', 4), { cells: 6, fine: 0.5, contrast: 0.7 });
  speckle(t, [hex('#7b8090'), hex('#c8ccd6')], 26);
};

T.snow = (t) => {
  grain(t, ramp2('#dfe6ee', '#ffffff', 4), { cells: 6, fine: 0.7, contrast: 0.5 });
  speckle(t, [hex('#ffffff'), hex('#cdd6e2')], 34);
};

T.ice = (t) => {
  t.clear();
  grain(t, ramp2('#7fb6e0', '#d6ecfb', 5), { cells: 4, fine: 0.4, contrast: 1.0, alpha: 198 });
  for (let k = 0; k < 7; k++) {
    let x = t.rng() * 16, y = t.rng() * 16; const a = t.rng() * 6.28;
    for (let s = 0; s < 10 + t.rng() * 6; s++) {
      t.px(Math.round(x), Math.round(y), hex('#f0fbff'), 235);
      x += Math.cos(a + Math.sin(s * 0.5) * 0.4) * 1.15;
      y += Math.sin(a + Math.sin(s * 0.5) * 0.4) * 1.15;
    }
  }
  speckle(t, [hex('#ffffff')], 10, { alpha: 240 });
  for (let x = 0; x < TS; x++) { t.px(x, 0, hex('#bfe0f5'), 215); t.px(0, x, hex('#bfe0f5'), 215); }
};

T.crimson_soil = (t) => {
  grain(t, ramp2('#5c2d28', '#8a4a3c', 5), { cells: 6, fine: 0.65, contrast: 1.1 });
  speckle(t, [hex('#42201d'), hex('#a35f4a')], 38);
};

// --- ores ---
T.coal_ore      = oreOf('#1a1a1a', '#3c3c3c', 5, 2.0);
T.copper_ore    = oreOf('#8a5a32', '#d08b4e', 5, 1.9);
T.iron_ore      = oreOf('#9a7f6a', '#d8bfa6', 5, 1.9);
T.gold_ore      = oreOf('#a8811f', '#f2d46b', 4, 1.8);
T.lumen_ore     = oreOf('#a08b2c', '#fff2a0', 5, 2.0);
T.aetherite_ore = oreOf('#1f7a8c', '#7bf0ff', 4, 1.9);
T.phaseite_ore  = oreOf('#7326a3', '#e58bff', 4, 2.0);
T.voidstone_ore = (t) => {
  stoneBase(t);
  for (let i = 0; i < 4; i++) blob(t, 2 + t.rng() * 12, 2 + t.rng() * 12, 2.1, [[8, 6, 14], [18, 12, 30], [30, 20, 48], [6, 4, 10]], { wobble: 0.5 });
  speckle(t, [hex('#000000')], 8);
};

// --- wood ---
T.oak_log      = logSide('#4d3a22', '#7d6038');
T.oak_log_top  = logTop('#4d3a22', '#7d6038', '#8a6b3f', '#c19a63');
T.oak_planks   = plankTex('#7a5c33', '#b08b52', 4);
T.oak_leaves   = leafTex('#2d5423', '#5f8f3c', 22, 0);

T.pine_log     = logSide('#3b2c1e', '#63492f');
T.pine_log_top = logTop('#3b2c1e', '#63492f', '#7a5a36', '#a8814f');
T.pine_planks  = plankTex('#5e4527', '#8d6c42', 4);
T.pine_leaves  = leafTex('#1e4030', '#3f7350', 26, 0);

T.rift_log     = (t) => { logSide('#2b2440', '#4c4270')(t); speckle(t, [hex('#8ef0ff'), hex('#c98bff')], 10); };
T.rift_log_top = (t) => { logTop('#2b2440', '#4c4270', '#6a5aa0', '#a898e0')(t); speckle(t, [hex('#9df3ff')], 8); };
T.rift_planks  = (t) => { plankTex('#3a3158', '#6b5f97', 4)(t); speckle(t, [hex('#8ef0ff')], 7); };
T.rift_leaves  = leafTex('#243a55', '#3f7fa0', 20, 12);

T.bookshelf = (t) => {
  T.oak_planks(t);
  t.rect(0, 3, 16, 10, hex('#3a2a17'));
  const cols = ['#8a3b32', '#3a5f8a', '#7a6b2a', '#4a7a45', '#7a4a7a', '#a06a30'];
  let x = 0;
  while (x < 16) {
    const w = 1 + (t.rng() * 2 | 0);
    const c = hex(cols[(t.rng() * cols.length) | 0]);
    const y0 = t.rng() < 0.5 ? 3 : 8, h = t.rng() < 0.5 ? 4 : 5;
    for (let j = y0; j < Math.min(13, y0 + h); j++) for (let i = 0; i < w && x + i < 16; i++) {
      t.px(x + i, j, i === 0 ? mulc(c, 0.75) : c);
    }
    x += w + (t.rng() < 0.3 ? 1 : 0);
  }
  t.hline(0, 15, 8, hex('#5a4227'));
  t.hline(0, 15, 13, hex('#5a4227'));
};

// --- glass & 4D ---
T.glass = (t) => {
  t.clear();
  const f = hex('#cfe4ee');
  for (let x = 0; x < TS; x++) { t.px(x, 0, f, 210); t.px(x, 15, f, 210); t.px(0, x, f, 210); t.px(15, x, f, 210); }
  t.px(1, 1, f, 150); t.px(14, 14, f, 150);
  for (let k = 0; k < 5; k++) t.px(3 + k, 3 + k, hex('#ffffff'), 110);
  for (let k = 0; k < 3; k++) t.px(4 + k, 2 + k, hex('#ffffff'), 70);
};

T.phase_glass = (t) => {
  t.clear();
  const f = hex('#8ee9ff'), g = hex('#c8a6ff');
  for (let x = 0; x < TS; x++) { t.px(x, 0, f, 220); t.px(x, 15, f, 220); t.px(0, x, f, 220); t.px(15, x, f, 220); }
  // hypercube projection: outer square + inner square + connecting struts
  for (let x = 4; x <= 11; x++) { t.px(x, 4, g, 190); t.px(x, 11, g, 190); }
  for (let y = 4; y <= 11; y++) { t.px(4, y, g, 190); t.px(11, y, g, 190); }
  for (let k = 0; k < 4; k++) { t.px(1 + k, 1 + k, f, 150); t.px(14 - k, 1 + k, f, 150); t.px(1 + k, 14 - k, f, 150); t.px(14 - k, 14 - k, f, 150); }
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (t.alphaAt(x, y) === 0 && t.rng() < 0.1) t.px(x, y, f, 40);
};

T.anchor_top = (t) => {
  grain(t, ramp2('#3b3f4a', '#666d7c', 4), { cells: 6, fine: 0.5, contrast: 0.9 });
  const c = hex('#ffcf7a');
  for (let a = 0; a < 40; a++) {
    const ang = a / 40 * 6.283;
    t.px(Math.round(8 + Math.cos(ang) * 5), Math.round(8 + Math.sin(ang) * 5), c);
  }
  t.rect(7, 7, 2, 2, hex('#fff0c8'));
  speckle(t, [hex('#8a919e')], 14);
};
T.anchor_side = (t) => {
  grain(t, ramp2('#343843', '#5c6272', 4), { cells: 6, fine: 0.5, contrast: 0.95 });
  t.rect(0, 6, 16, 4, hex('#282c35'));
  for (let x = 1; x < 16; x += 3) { t.px(x, 7, hex('#ffcf7a')); t.px(x, 8, hex('#c99a48')); }
  t.hline(0, 15, 5, hex('#727a8a')); t.hline(0, 15, 10, hex('#20232b'));
  speckle(t, [hex('#7d8494')], 12, { mask: (x, y) => y < 6 || y > 9 });
};

T.rift_block = (t) => {
  t.clear();
  const sh = ramp2('#2a0f4a', '#c07bff', 5);
  const n1 = makeNoise(t.rng, 4), n2 = makeNoise(t.rng, 8);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const a = Math.atan2(dy, dx), d = Math.sqrt(dx * dx + dy * dy);
    const swirl = Math.sin(a * 3 + d * 1.4) * 0.5 + 0.5;
    let v = swirl * 0.55 + n1(x, y) * 0.25 + n2(x, y) * 0.2;
    const i = Math.min(4, Math.max(0, Math.floor(v * 5)));
    t.px(x, y, sh[i], 180 + i * 18);
  }
  speckle(t, [hex('#ffffff'), hex('#8ef0ff')], 10);
};

T.tesseract_core = (t) => {
  grain(t, ramp2('#111a2e', '#22304f', 3), { cells: 4, fine: 0.4, contrast: 0.8 });
  const outer = hex('#7ef2ff'), inner = hex('#ffd47a'), strut = hex('#b98bff');
  for (let x = 1; x <= 14; x++) { t.px(x, 1, outer); t.px(x, 14, outer); }
  for (let y = 1; y <= 14; y++) { t.px(1, y, outer); t.px(14, y, outer); }
  for (let x = 5; x <= 10; x++) { t.px(x, 5, inner); t.px(x, 10, inner); }
  for (let y = 5; y <= 10; y++) { t.px(5, y, inner); t.px(10, y, inner); }
  for (let k = 0; k < 4; k++) {
    t.px(1 + k, 1 + k, strut); t.px(14 - k, 1 + k, strut);
    t.px(1 + k, 14 - k, strut); t.px(14 - k, 14 - k, strut);
  }
  t.rect(7, 7, 2, 2, hex('#ffffff'));
};

T.hyper_lattice = (t) => {
  t.clear();
  const c = ramp2('#3d7fa0', '#9df3ff', 4);
  for (let x = 0; x < TS; x++) { t.px(x, 0, c[2]); t.px(x, 8, c[2]); t.px(x, 15, c[1]); }
  for (let y = 0; y < TS; y++) { t.px(0, y, c[2]); t.px(8, y, c[2]); t.px(15, y, c[1]); }
  for (let k = 0; k < 8; k++) { t.px(k, k, c[3]); t.px(15 - k, k, c[3]); }
  speckle(t, [hex('#ffffff')], 5);
};

T.slice_lantern = (t) => {
  grain(t, ramp2('#3a3f4a', '#606878', 3), { cells: 8, fine: 0.4, contrast: 0.7 });
  t.rect(3, 3, 10, 10, hex('#0d2430'));
  const glow = ramp2('#2ea0c8', '#e6fbff', 5);
  for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    t.px(x, y, glow[Math.min(4, Math.max(0, 4 - Math.floor(d)))]);
  }
  for (let x = 2; x <= 13; x++) { t.px(x, 2, hex('#8a93a4')); t.px(x, 13, hex('#8a93a4')); }
  for (let y = 2; y <= 13; y++) { t.px(2, y, hex('#8a93a4')); t.px(13, y, hex('#8a93a4')); }
  t.rect(6, 0, 4, 2, hex('#6d7686'));
};

// --- utility blocks ---
T.craft_top = (t) => {
  T.oak_planks(t);
  t.rect(1, 1, 14, 14, hex('#5d4526'));
  t.rect(2, 2, 12, 12, hex('#8a6a3d'));
  for (let k = 0; k <= 3; k++) { t.hline(2, 13, 2 + k * 4, hex('#5d4526')); t.vline(2 + k * 4, 2, 13, hex('#5d4526')); }
  t.hline(2, 13, 13, hex('#5d4526')); t.vline(13, 2, 13, hex('#5d4526'));
  speckle(t, [hex('#a3835a'), hex('#6d5330')], 20, { mask: (x, y) => x > 2 && y > 2 && x < 13 && y < 13 });
};
T.craft_side = (t) => {
  T.oak_planks(t);
  t.rect(0, 0, 16, 4, hex('#6a4f2c'));
  t.hline(0, 15, 3, hex('#4a3620'));
  for (let x = 1; x < 16; x += 3) { t.px(x, 1, hex('#c2a06a')); t.px(x + 1, 2, hex('#8a6a3d')); }
  t.rect(2, 6, 5, 4, hex('#5d4526')); t.rect(9, 8, 5, 4, hex('#5d4526'));
  t.rect(3, 7, 3, 2, hex('#a3835a')); t.rect(10, 9, 3, 2, hex('#a3835a'));
};

T.smelter_top = (t) => {
  grain(t, ramp('#6e6e6e', 4, 0.7, 1.1), { cells: 6, fine: 0.5 });
  t.rect(4, 4, 8, 8, hex('#3a3a3a'));
  t.rect(5, 5, 6, 6, hex('#2a2a2a'));
  speckle(t, [hex('#8a8a8a')], 16, { mask: (x, y) => x < 4 || x > 11 || y < 4 || y > 11 });
};
T.smelter_side = (t) => {
  grain(t, ramp('#6e6e6e', 4, 0.7, 1.1), { cells: 6, fine: 0.5 });
  t.hline(0, 15, 3, hex('#4d4d4d')); t.hline(0, 15, 12, hex('#4d4d4d'));
  speckle(t, [hex('#8a8a8a'), hex('#5a5a5a')], 22);
};
T.smelter_front = (t) => {
  T.smelter_side(t);
  t.rect(3, 5, 10, 8, hex('#39332e'));
  t.rect(4, 6, 8, 6, hex('#22201d'));
  const fire = ramp2('#a33a12', '#ffdc6a', 4);
  for (let x = 4; x <= 11; x++) {
    const h = 1 + Math.floor(t.rng() * 3);
    for (let k = 0; k < h; k++) t.px(x, 11 - k, fire[Math.min(3, k + Math.floor(t.rng() * 2))]);
  }
  t.rect(3, 4, 10, 1, hex('#8a8a8a'));
};

T.tess_top = (t) => {
  T.rift_planks(t);
  t.rect(1, 1, 14, 14, hex('#1c1730'));
  const c = ramp2('#3b6f9a', '#a6f4ff', 4);
  for (let x = 2; x <= 13; x++) { t.px(x, 2, c[2]); t.px(x, 13, c[2]); }
  for (let y = 2; y <= 13; y++) { t.px(2, y, c[2]); t.px(13, y, c[2]); }
  for (let x = 5; x <= 10; x++) { t.px(x, 5, c[3]); t.px(x, 10, c[3]); }
  for (let y = 5; y <= 10; y++) { t.px(5, y, c[3]); t.px(10, y, c[3]); }
  for (let k = 0; k < 3; k++) { t.px(2 + k, 2 + k, hex('#c98bff')); t.px(13 - k, 2 + k, hex('#c98bff')); t.px(2 + k, 13 - k, hex('#c98bff')); t.px(13 - k, 13 - k, hex('#c98bff')); }
  t.rect(7, 7, 2, 2, hex('#ffffff'));
};
T.tess_side = (t) => {
  T.rift_planks(t);
  t.rect(0, 5, 16, 6, hex('#241d3d'));
  const c = ramp2('#3b6f9a', '#a6f4ff', 4);
  for (let x = 0; x < 16; x += 4) { t.px(x, 7, c[3]); t.px(x + 1, 8, c[2]); t.px(x + 2, 7, c[1]); }
  t.hline(0, 15, 4, hex('#6b5f97')); t.hline(0, 15, 11, hex('#191430'));
};

T.chest_top = (t) => {
  grain(t, ramp2('#6b4a26', '#9a6f3d', 4), { cells: 16, fine: 1, contrast: 0.5 });
  t.rect(0, 0, 16, 1, hex('#4a3218')); t.rect(0, 15, 16, 1, hex('#4a3218'));
  t.rect(0, 0, 1, 16, hex('#4a3218')); t.rect(15, 0, 1, 16, hex('#4a3218'));
  for (let y = 3; y < 13; y += 4) t.hline(1, 14, y, hex('#5c3f21'));
  t.rect(6, 6, 4, 4, hex('#3a3a40')); t.rect(7, 7, 2, 2, hex('#c2a45a'));
};
T.chest_side = (t) => {
  grain(t, ramp2('#6b4a26', '#9a6f3d', 4), { cells: 16, fine: 1, contrast: 0.5 });
  t.rect(0, 0, 16, 5, hex('#7a552b'));
  t.hline(0, 15, 4, hex('#3e2a13')); t.hline(0, 15, 5, hex('#8a6135'));
  t.rect(0, 0, 1, 16, hex('#4a3218')); t.rect(15, 0, 1, 16, hex('#4a3218'));
  t.rect(0, 15, 16, 1, hex('#4a3218'));
  for (let x = 2; x < 15; x += 5) t.vline(x, 6, 14, hex('#5c3f21'));
};
T.chest_front = (t) => {
  T.chest_side(t);
  t.rect(6, 3, 4, 5, hex('#3a3a40'));
  t.rect(7, 4, 2, 3, hex('#c2a45a'));
  t.px(7, 6, hex('#5a4a20')); t.px(8, 6, hex('#5a4a20'));
  t.rect(6, 8, 4, 1, hex('#2a2a30'));
};

T.ladder = (t) => {
  t.clear();
  const w = ramp2('#6a4c28', '#a5793f', 3);
  t.vline(2, 0, 15, w[1]); t.vline(3, 0, 15, w[2]);
  t.vline(12, 0, 15, w[1]); t.vline(13, 0, 15, w[2]);
  for (let y = 2; y < 16; y += 5) { t.hline(3, 12, y, w[2]); t.hline(3, 12, y + 1, w[0]); }
};

T.torch = (t) => {
  t.clear();
  const w = ramp2('#5a3f21', '#8a6435', 3);
  for (let y = 15; y >= 7; y--) { t.px(7, y, w[1]); t.px(8, y, w[2]); }
  const f = ramp2('#a8500f', '#fff0a8', 4);
  t.px(7, 6, f[1]); t.px(8, 6, f[2]);
  t.px(7, 5, f[2]); t.px(8, 5, f[3]);
  t.px(6, 5, f[0]); t.px(9, 5, f[0]);
  t.px(7, 4, f[3]); t.px(8, 4, f[3]);
  t.px(7, 3, f[2]); t.px(8, 3, f[1]);
};

T.lantern = (t) => {
  grain(t, ramp2('#3a3f4a', '#606878', 3), { cells: 8, fine: 0.4, contrast: 0.7 });
  t.rect(3, 4, 10, 9, hex('#2a2018'));
  const glow = ramp2('#a8630f', '#fff3c0', 5);
  for (let y = 5; y <= 11; y++) for (let x = 4; x <= 11; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 8));
    t.px(x, y, glow[Math.min(4, Math.max(0, 4 - Math.floor(d * 0.9)))]);
  }
  for (let x = 3; x <= 12; x++) { t.px(x, 3, hex('#8a93a4')); t.px(x, 12, hex('#8a93a4')); }
  for (let y = 3; y <= 12; y++) { t.px(3, y, hex('#8a93a4')); t.px(12, y, hex('#8a93a4')); }
  t.rect(7, 0, 2, 3, hex('#6d7686'));
};

T.lumen_stone = (t) => {
  grain(t, ramp2('#8a6a1c', '#ffeaa0', 5), { cells: 5, fine: 0.6, contrast: 1.2 });
  speckle(t, [hex('#fff6d0'), hex('#6d5312')], 40);
  for (let k = 0; k < 5; k++) blob(t, t.rng() * 16, t.rng() * 16, 1.6, ramp2('#c9a03a', '#fffbe0', 3), { wobble: 0.5 });
};

// --- metal blocks ---
function metalBlock(darkHex, lightHex, studs = true) {
  return (t) => {
    grain(t, ramp2(darkHex, lightHex, 4), { cells: 16, fine: 1, contrast: 0.45 });
    t.rect(0, 0, 16, 1, mulc(hex(lightHex), 1.06));
    t.rect(0, 15, 16, 1, mulc(hex(darkHex), 0.85));
    t.rect(0, 0, 1, 16, mulc(hex(lightHex), 1.02));
    t.rect(15, 0, 1, 16, mulc(hex(darkHex), 0.85));
    if (studs) for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) {
      t.px(x, y, mulc(hex(lightHex), 1.15)); t.px(x + 1, y + 1, mulc(hex(darkHex), 0.8));
    }
    t.rect(5, 5, 6, 6, mixc(hex(darkHex), hex(lightHex), 0.7));
    t.rect(6, 6, 4, 4, mixc(hex(darkHex), hex(lightHex), 0.9));
  };
}
T.coal_block      = (t) => { grain(t, ramp2('#141414', '#3a3a3a', 4), { cells: 6, fine: 0.6, contrast: 1.2 }); speckle(t, [hex('#4a4a4a'), hex('#0a0a0a')], 40); };
T.copper_block    = metalBlock('#8a5326', '#d5924e');
T.iron_block      = metalBlock('#9d968c', '#e2ded6');
T.gold_block      = metalBlock('#b58a1e', '#ffe37a');
T.aetherite_block = (t) => { metalBlock('#1a6b7d', '#8df4ff')(t); speckle(t, [hex('#ffffff')], 8); };
T.phaseite_block  = (t) => { metalBlock('#5f1d8a', '#e08cff')(t); speckle(t, [hex('#ffffff'), hex('#8ef0ff')], 10); };

// --- crystals ---
T.crystal_cyan   = crystalTex('#124e63', '#8ef4ff');
T.crystal_amber  = crystalTex('#6b4310', '#ffd489');
T.crystal_rose   = crystalTex('#6b1836', '#ff9cc4');
T.crystal_violet = crystalTex('#3d1a6b', '#c79cff');

// --- wool ---
T.wool_white  = woolTex('#d9d6cd');
T.wool_black  = woolTex('#2b2b30');
T.wool_red    = woolTex('#9c3a30');
T.wool_green  = woolTex('#4d7a3c');
T.wool_blue   = woolTex('#38548c');
T.wool_yellow = woolTex('#c2a63a');
T.wool_purple = woolTex('#6b3f8c');
T.wool_orange = woolTex('#c2743a');

// --- plants ---
T.tall_grass  = crossPlant('#3f6b2a', '#7cae52', { stems: 7, height: 12, curve: 3 });
T.fern        = crossPlant('#2c5433', '#5c9256', { stems: 5, height: 10, curve: 4.5 });
T.dead_bush   = crossPlant('#4a3a1e', '#7d6435', { stems: 6, height: 11, curve: 5 });
T.wheat_tuft  = crossPlant('#7a6a24', '#d6c063', { stems: 6, height: 12, curve: 1.2, seedTip: hex('#e8d67a') });
T.chrono_bush = (t) => {
  crossPlant('#2c4a3a', '#4f7f63', { stems: 6, height: 11, curve: 3 })(t);
  for (let k = 0; k < 7; k++) {
    const x = 2 + (t.rng() * 12 | 0), y = 5 + (t.rng() * 8 | 0);
    t.px(x, y, hex('#8ef0ff')); t.px(x + 1, y, hex('#4fb6d6'));
    t.px(x, y + 1, hex('#4fb6d6'));
  }
};
T.flower_ember = flowerTex('#b83a2c', '#ffd166');
T.flower_sun   = flowerTex('#d9b53a', '#8a5f1a');
T.flower_dusk  = flowerTex('#8a5fc4', '#ffe2a8');
T.mushroom_red   = mushroomTex('#a53127', '#e8e0d0', '#c8bda8');
T.mushroom_brown = mushroomTex('#8a6a45', '#a58a63', '#c8bda8');
T.glow_shroom    = (t) => {
  mushroomTex('#2a6b7d', '#c8f8ff', '#9ad6e0')(t);
  speckle(t, [hex('#e6ffff')], 8, { mask: (x, y) => y < 10 });
};
T.sapling_oak  = saplingTex('#2d5423', '#6f9f45', false);
T.sapling_pine = saplingTex('#1e4030', '#487f57', false);
T.sapling_rift = saplingTex('#243a55', '#4f97b8', true);

T.cactus = (t) => {
  grain(t, ramp2('#2f5c2c', '#5f8f45', 4), { cells: 8, fine: 0.55, contrast: 0.8 });
  t.vline(0, 0, 15, hex('#24471f')); t.vline(15, 0, 15, hex('#24471f'));
  for (let x = 3; x < 15; x += 4) for (let y = 1; y < 16; y += 4) {
    t.px(x, y, hex('#d6d0a8')); t.px(x, y + 1, hex('#8a8560'));
  }
};
T.cactus_top = (t) => {
  grain(t, ramp2('#376b33', '#6da34e', 4), { cells: 8, fine: 0.5, contrast: 0.7 });
  for (let a = 0; a < 24; a++) {
    const ang = a / 24 * 6.283;
    t.px(Math.round(8 + Math.cos(ang) * 5.5), Math.round(8 + Math.sin(ang) * 5.5), hex('#24471f'));
  }
  t.rect(6, 6, 4, 4, hex('#7fb35c'));
};

// --- liquids ---
T.water = (t) => {
  t.clear();
  const sh = ramp2('#1c4f8c', '#3f8fd1', 5);
  grain(t, sh, { cells: 5, fine: 0.5, contrast: 0.8, alpha: 168 });
  for (let k = 0; k < 4; k++) {
    const y = 2 + (t.rng() * 12 | 0);
    for (let x = 0; x < 16; x++) {
      const yy = y + Math.round(Math.sin(x * 0.6 + k) * 1.2);
      t.px(x, yy, hex('#7ec4f0'), 190);
    }
  }
};
T.lava = (t) => {
  const sh = ramp2('#7a1c08', '#ffcf50', 6);
  grain(t, sh, { cells: 4, fine: 0.45, contrast: 1.3 });
  for (let k = 0; k < 6; k++) blob(t, t.rng() * 16, t.rng() * 16, 1.6 + t.rng(), ramp2('#e05b12', '#fff0a8', 3), { wobble: 0.6 });
  speckle(t, [hex('#5a1405')], 16);
};

// ===========================================================================
// Item sprites
// ===========================================================================

function ingot(colDark, colLight) {
  return (t) => {
    t.clear();
    const sh = ramp2(colDark, colLight, 4);
    for (let y = 5; y <= 11; y++) {
      const inset = y <= 6 ? 4 : (y >= 10 ? 3 : 2);
      for (let x = inset; x < 16 - inset; x++) {
        const f = (y - 5) / 6;
        t.px(x, y, sh[Math.min(3, Math.max(0, Math.round(3 - f * 2.4)))]);
      }
    }
    t.hline(5, 10, 5, sh[3]); t.hline(4, 12, 11, sh[0]);
    for (let k = 0; k < 4; k++) t.px(6 + k, 6, sh[3]);
    outline(t, [0, 0, 0], 190);
  };
}

function gem(colDark, colLight, sparkle = true) {
  return (t) => {
    t.clear();
    const sh = ramp2(colDark, colLight, 5);
    const rows = [[7, 2, 2], [6, 3, 4], [5, 4, 6], [4, 5, 8], [3, 6, 10], [3, 7, 10], [3, 8, 10], [4, 9, 8], [5, 10, 6], [6, 11, 4], [7, 12, 2]];
    for (const [x0, y, w] of rows) {
      for (let x = x0; x < x0 + w; x++) {
        const f = 1 - Math.abs(x - 7.5) / 6 - Math.abs(y - 7) / 12;
        t.px(x, y, sh[Math.min(4, Math.max(0, Math.round(f * 4.4)))]);
      }
    }
    if (sparkle) { t.px(6, 5, [255, 255, 255]); t.px(7, 5, [255, 255, 255]); t.px(6, 6, [255, 255, 255]); }
    outline(t, [0, 0, 0], 200);
  };
}

function nugget(colDark, colLight, chunks = 3) {
  return (t) => {
    t.clear();
    const sh = ramp2(colDark, colLight, 4);
    blob(t, 7.5, 8, 4.4, sh, { wobble: 0.5 });
    for (let k = 0; k < chunks; k++) blob(t, 4 + t.rng() * 8, 5 + t.rng() * 6, 1.6, sh, { wobble: 0.6 });
    outline(t, [0, 0, 0], 190);
  };
}

function dust(colDark, colLight) {
  return (t) => {
    t.clear();
    const sh = ramp2(colDark, colLight, 4);
    for (let k = 0; k < 46; k++) {
      const a = t.rng() * 6.283, r = Math.pow(t.rng(), 0.6) * 5.4;
      t.px(Math.round(8 + Math.cos(a) * r), Math.round(9 + Math.sin(a) * r * 0.72), sh[t.rng() * 4 | 0]);
    }
  };
}

T.i_stick = (t) => {
  t.clear();
  const sh = ramp2('#5a3f21', '#a5793f', 4);
  dline(t, 4, 12, 11, 4, 2, (r) => sh[Math.min(3, 1 + (r * 3 | 0))]);
  t.px(11, 3, sh[3]); t.px(4, 13, sh[0]);
  outline(t, [0, 0, 0], 170);
};
T.i_coal      = nugget('#101010', '#3e3e3e', 4);
T.i_charcoal  = nugget('#1c1712', '#4a3f33', 4);
T.i_raw_copper = nugget('#7a4a24', '#cf8a4a');
T.i_raw_iron   = nugget('#7d6c5c', '#c9b6a2');
T.i_raw_gold   = nugget('#997414', '#f0cf5f');
T.i_copper_ingot = ingot('#7a4a24', '#e59c58');
T.i_iron_ingot   = ingot('#8d8378', '#e8e2d8');
T.i_gold_ingot   = ingot('#a8811f', '#ffe488');
T.i_aetherite    = gem('#12586b', '#a8f8ff');
T.i_phaseite     = (t) => { gem('#4c1470', '#eaa8ff')(t); t.px(9, 9, hex('#8ef0ff')); t.px(8, 10, hex('#8ef0ff')); };
T.i_void_shard   = (t) => {
  t.clear();
  const sh = [[10, 6, 18], [24, 14, 40], [46, 28, 74], [8, 4, 12]];
  blob(t, 8, 8, 4.6, sh, { wobble: 0.55 });
  for (let k = 0; k < 10; k++) t.px(4 + (t.rng() * 8 | 0), 4 + (t.rng() * 8 | 0), [0, 0, 0]);
  outline(t, hex('#8a6ac2'), 220);
};
T.i_phase_shard = (t) => {
  t.clear();
  const sh = ramp2('#1c6b8a', '#b6f6ff', 4);
  const pts = [[8, 2], [9, 3], [10, 4], [10, 5], [9, 6], [8, 7], [7, 8], [6, 9], [6, 10], [7, 11], [8, 12], [8, 13]];
  for (const [x, y] of pts) { t.px(x, y, sh[3]); t.px(x - 1, y, sh[2]); t.px(x + 1, y, sh[1]); }
  outline(t, [0, 0, 0], 180);
};
T.i_lumen_dust    = dust('#a8871c', '#fff2a8');
T.i_crystal_shard = (t) => { gem('#2a6b8a', '#c8f4ff', true)(t); };
T.i_clay_ball     = nugget('#7b8090', '#c4c9d4', 2);
T.i_brick         = (t) => {
  t.clear();
  const sh = ramp2('#8b4a3c', '#c2795f', 4);
  t.rect(3, 5, 10, 6, sh[2]);
  for (let y = 5; y < 11; y++) for (let x = 3; x < 13; x++) if (t.rng() < 0.4) t.px(x, y, sh[t.rng() * 4 | 0]);
  t.hline(3, 12, 5, sh[3]); t.hline(3, 12, 10, sh[0]);
  outline(t, [0, 0, 0], 190);
};
T.i_flint = (t) => {
  t.clear();
  const sh = ramp2('#2b2b30', '#6a6a72', 4);
  const pts = [[4, 9], [5, 7], [7, 5], [10, 5], [12, 7], [12, 10], [9, 12], [6, 12]];
  for (let y = 4; y < 13; y++) for (let x = 3; x < 14; x++) {
    let inside = false;
    // crude polygon fill via distance to hull points
    let d = 99;
    for (const [px, py] of pts) d = Math.min(d, Math.hypot(px - x, py - y));
    if (d < 2.6) inside = true;
    if (inside) t.px(x, y, sh[Math.min(3, (t.rng() * 3 | 0) + (y < 8 ? 1 : 0))]);
  }
  outline(t, [0, 0, 0], 190);
};
T.i_fiber = (t) => {
  t.clear();
  const sh = ramp2('#6e7a3a', '#b6c46a', 4);
  for (let k = 0; k < 4; k++) {
    const x0 = 3 + k * 3;
    for (let y = 3; y < 14; y++) t.px(x0 + Math.round(Math.sin(y * 0.7 + k) * 1.2), y, sh[t.rng() * 4 | 0]);
  }
};
T.i_hide = (t) => {
  t.clear();
  const sh = ramp2('#6a4a2c', '#a8794c', 4);
  t.rect(3, 4, 10, 9, sh[2]);
  for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) if (t.rng() < 0.35) t.px(x, y, sh[t.rng() * 4 | 0]);
  t.px(2, 5, sh[1]); t.px(13, 5, sh[1]); t.px(2, 11, sh[1]); t.px(13, 11, sh[1]);
  outline(t, [0, 0, 0], 180);
};
T.i_leather = (t) => { T.i_hide(t); t.shadeRect(0, 0, 16, 16, 1.12); for (let x = 4; x < 12; x++) t.px(x, 8, hex('#5a3a1e')); };
T.i_bone = (t) => {
  t.clear();
  const sh = ramp2('#b8b2a2', '#f2eee2', 3);
  dline(t, 5, 11, 10, 5, 2, () => sh[1]);
  for (const [x, y] of [[4, 10], [4, 12], [6, 12], [11, 4], [11, 6], [9, 4]]) { t.px(x, y, sh[2]); t.px(x, y + 1, sh[1]); }
  outline(t, [0, 0, 0], 190);
};
T.i_ectoplasm = (t) => {
  t.clear();
  const sh = ramp2('#2a7f9a', '#c8f8ff', 4);
  blob(t, 8, 8, 4.8, sh, { wobble: 0.7, alpha: 205 });
  for (let k = 0; k < 8; k++) t.px(3 + (t.rng() * 10 | 0), 3 + (t.rng() * 10 | 0), hex('#ffffff'), 235);
  outline(t, hex('#1c5a70'), 200);
};
T.i_feather = (t) => {
  t.clear();
  const sh = ramp2('#a8b0bc', '#f4f7fa', 4);
  dline(t, 5, 13, 10, 3, 1, () => sh[1]);
  for (let k = 0; k < 9; k++) {
    const y = 4 + k, x = 10 - Math.round(k * 0.55);
    t.px(x - 1, y, sh[3]); t.px(x - 2, y, sh[2]);
    if (k % 2 === 0) t.px(x - 3, y, sh[2]);
  }
  outline(t, [0, 0, 0], 150);
};
T.i_wheat = (t) => {
  t.clear();
  const sh = ramp2('#8a7524', '#e8d67a', 4);
  for (let k = 0; k < 3; k++) {
    const x0 = 4 + k * 4;
    for (let y = 4; y < 14; y++) t.px(x0, y, sh[1]);
    for (let y = 4; y < 10; y += 2) { t.px(x0 - 1, y, sh[3]); t.px(x0 + 1, y + 1, sh[2]); }
  }
};
T.i_bowl = (t) => {
  t.clear();
  const sh = ramp2('#5a3f21', '#a5793f', 4);
  for (let y = 7; y <= 11; y++) {
    const inset = y >= 10 ? 4 : 2 + (y - 7);
    for (let x = 2 + (y >= 10 ? 2 : 0); x < 14 - (y >= 10 ? 2 : 0); x++) t.px(x, y, sh[y >= 10 ? 1 : 2]);
  }
  t.hline(2, 13, 7, sh[3]);
  outline(t, [0, 0, 0], 190);
};

// food
T.i_berry = (t) => {
  t.clear();
  const sh = ramp2('#1a5f78', '#9ef0ff', 4);
  for (const [cx, cy, r] of [[6, 8, 2.6], [10, 6, 2.2], [9, 11, 2.2]]) blob(t, cx, cy, r, sh, { wobble: 0.25 });
  t.px(5, 7, hex('#ffffff')); t.px(9, 5, hex('#ffffff'));
  const g = ramp2('#3c6a2c', '#6da349', 3);
  t.px(8, 3, g[1]); t.px(9, 3, g[2]); t.px(8, 4, g[2]);
  outline(t, [0, 0, 0], 190);
};
T.i_bread = (t) => {
  t.clear();
  const sh = ramp2('#8a6128', '#dfae60', 4);
  for (let y = 5; y <= 11; y++) {
    const inset = (y === 5 || y === 11) ? 3 : 2;
    for (let x = inset; x < 16 - inset; x++) t.px(x, y, sh[Math.min(3, 1 + (t.rng() * 2 | 0))]);
  }
  for (const [x, y] of [[5, 7], [8, 6], [11, 8], [7, 9]]) t.px(x, y, sh[0]);
  outline(t, [0, 0, 0], 190);
};
T.i_raw_meat = (t) => {
  t.clear();
  const sh = ramp2('#9c4a4a', '#d88a8a', 4);
  blob(t, 8, 8, 4.8, sh, { wobble: 0.4 });
  const f = ramp2('#d8c0b0', '#f4e8dc', 2);
  for (let k = 0; k < 6; k++) t.px(5 + (t.rng() * 7 | 0), 5 + (t.rng() * 7 | 0), f[t.rng() * 2 | 0]);
  outline(t, [0, 0, 0], 190);
};
T.i_cooked_meat = (t) => {
  t.clear();
  const sh = ramp2('#6b3a1c', '#b0703c', 4);
  blob(t, 8, 8, 4.8, sh, { wobble: 0.4 });
  for (let k = 0; k < 5; k++) t.px(5 + (t.rng() * 7 | 0), 5 + (t.rng() * 7 | 0), hex('#3a1f0e'));
  outline(t, [0, 0, 0], 190);
};
T.i_stew = (t) => {
  T.i_bowl(t);
  const sh = ramp2('#7a5a2c', '#b89a58', 3);
  for (let x = 4; x < 12; x++) t.px(x, 8, sh[2]);
  for (let x = 3; x < 13; x++) t.px(x, 9, sh[1]);
  t.px(6, 8, hex('#a53127')); t.px(10, 9, hex('#8a6a45'));
};
T.i_glow_fruit = (t) => {
  t.clear();
  const sh = ramp2('#2a7a3a', '#c8ff9e', 4);
  blob(t, 8, 9, 4.6, sh, { wobble: 0.2 });
  for (let k = 0; k < 8; k++) t.px(5 + (t.rng() * 7 | 0), 6 + (t.rng() * 7 | 0), hex('#f2ffd0'));
  t.px(8, 3, hex('#5a3f21')); t.px(8, 4, hex('#5a3f21'));
  outline(t, [0, 0, 0], 180);
};

// special
T.i_compass = (t) => {
  t.clear();
  const rim = ramp2('#5a6270', '#b6c0cf', 4);
  for (let a = 0; a < 60; a++) {
    const ang = a / 60 * 6.283;
    t.px(Math.round(8 + Math.cos(ang) * 6), Math.round(8 + Math.sin(ang) * 6), rim[2]);
    t.px(Math.round(8 + Math.cos(ang) * 5), Math.round(8 + Math.sin(ang) * 5), rim[1]);
  }
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    if (Math.hypot(x - 7.5, y - 7.5) < 4.4) t.px(x, y, hex('#101a2a'));
  }
  dline(t, 8, 11, 8, 5, 1, () => hex('#8ef0ff'));
  t.px(8, 4, hex('#ff9cc4')); t.px(7, 5, hex('#ff9cc4')); t.px(9, 5, hex('#ff9cc4'));
  outline(t, [0, 0, 0], 200);
};
T.i_lens = (t) => {
  t.clear();
  const rim = ramp2('#4a5260', '#a6b0bf', 4);
  for (let a = 0; a < 70; a++) {
    const ang = a / 70 * 6.283;
    t.px(Math.round(7 + Math.cos(ang) * 5.6), Math.round(7 + Math.sin(ang) * 5.6), rim[2]);
  }
  for (let y = 2; y < 13; y++) for (let x = 2; x < 13; x++) {
    const d = Math.hypot(x - 7, y - 7);
    if (d < 4.6) t.px(x, y, mixc(hex('#1c4f6b'), hex('#a8f0ff'), Math.max(0, 1 - d / 4.6)), 220);
  }
  dline(t, 11, 11, 14, 14, 2, () => rim[1]);
  outline(t, [0, 0, 0], 190);
};
T.i_anchor_pin = (t) => {
  t.clear();
  const m = ramp2('#5a6270', '#c6d0df', 4);
  dline(t, 8, 3, 8, 13, 2, () => m[2]);
  t.hline(4, 11, 5, m[3]);
  for (const [x, y] of [[5, 11], [4, 10], [11, 11], [12, 10]]) t.px(x, y, m[1]);
  t.px(8, 2, hex('#ffcf7a')); t.px(7, 3, hex('#ffcf7a')); t.px(9, 3, hex('#ffcf7a'));
  outline(t, [0, 0, 0], 200);
};

// --- tools (procedural per material) ---
const TOOL_PALETTE = {
  wood:      ['#5c421f', '#8f6c3c', '#b58d54'],
  stone:     ['#4f4f4f', '#7d7d7d', '#a3a3a3'],
  iron:      ['#84796d', '#b8ada0', '#e6e0d6'],
  aetherite: ['#12586b', '#3fa3bb', '#a8f8ff'],
  phase:     ['#4c1470', '#9b4fd1', '#eaa8ff'],
};
const HANDLE = ['#4a3520', '#6d5133', '#8f6c3c'];

function toolTex(kind, mat) {
  return (t) => {
    t.clear();
    const p = TOOL_PALETTE[mat].map(hex);
    const h = HANDLE.map(hex);
    const pickM = (r) => p[Math.min(2, (r * 2.6) | 0)];
    const pickH = (r) => h[Math.min(2, (r * 2.6) | 0)];

    if (kind === 'sword') {
      dline(t, 5, 13, 6, 12, 2, pickH);
      t.px(4, 14, h[0]); t.px(5, 14, h[1]);
      // crossguard
      dline(t, 4, 10, 8, 10, 1, pickM);
      dline(t, 6, 12, 6, 8, 1, pickM);
      // blade
      dline(t, 6, 10, 12, 4, 3, pickM);
      t.px(13, 3, p[2]); t.px(12, 3, p[2]); t.px(13, 4, p[1]);
      // highlight edge
      for (let k = 0; k < 6; k++) t.px(7 + k, 9 - k, p[2]);
    } else {
      dline(t, 4, 13, 10, 6, 2, pickH);
      t.px(3, 14, h[0]);
      if (kind === 'pickaxe') {
        for (let k = 0; k < 10; k++) {
          const x = 3 + k, y = 5 - Math.round(Math.sin(k / 9 * Math.PI) * 2.6);
          t.px(x, y, p[1]); t.px(x, y + 1, p[0]);
          if (k > 1 && k < 8) t.px(x, y - 1, p[2]);
        }
        t.px(2, 6, p[0]); t.px(13, 6, p[0]);
      } else if (kind === 'axe') {
        for (let y = 2; y <= 9; y++) {
          const w = y <= 3 ? 3 : (y <= 6 ? 5 : 4);
          for (let x = 8; x < 8 + w; x++) t.px(x, y, p[x === 8 ? 0 : (x > 10 ? 2 : 1)]);
        }
        t.px(7, 4, p[1]); t.px(7, 5, p[1]); t.px(7, 6, p[0]);
        for (let y = 3; y <= 8; y++) t.px(8 + (y <= 6 ? 4 : 3), y, p[2]);
      } else { // shovel
        for (let y = 2; y <= 7; y++) {
          const inset = (y === 2 || y === 7) ? 1 : 0;
          for (let x = 8 + inset; x <= 12 - inset; x++) t.px(x, y, p[(x + y) % 3 === 0 ? 2 : 1]);
        }
        t.rect(9, 3, 3, 3, p[2]);
        t.px(8, 8, p[0]); t.px(9, 8, p[0]);
      }
    }
    outline(t, [0, 0, 0], 195);
  };
}
for (const kind of ['pickaxe', 'axe', 'shovel', 'sword']) {
  for (const mat of Object.keys(TOOL_PALETTE)) T[`tool_${kind}_${mat}`] = toolTex(kind, mat);
}

// --- armour ---
const ARMOR_PALETTE = {
  hide:      ['#5a3f21', '#8a6335', '#b58a55'],
  iron:      ['#84796d', '#b8ada0', '#e6e0d6'],
  aetherite: ['#12586b', '#3fa3bb', '#a8f8ff'],
};
function armorTex(piece, mat) {
  return (t) => {
    t.clear();
    const p = ARMOR_PALETTE[mat].map(hex);
    const put = (x, y, i) => t.px(x, y, p[i]);
    if (piece === 'helm') {
      for (let y = 3; y <= 9; y++) for (let x = 3; x <= 12; x++) {
        if (y >= 7 && x >= 6 && x <= 9) continue;
        put(x, y, (y === 3 || x === 3) ? 2 : (y >= 8 ? 0 : 1));
      }
      for (let x = 4; x <= 11; x++) put(x, 10, 0);
      t.rect(5, 5, 6, 2, p[0]);
    } else if (piece === 'chest') {
      for (let y = 3; y <= 12; y++) for (let x = 4; x <= 11; x++) put(x, y, (y === 3 || x === 4) ? 2 : (y > 10 ? 0 : 1));
      for (let y = 4; y <= 7; y++) { put(2, y, 1); put(3, y, 2); put(12, y, 1); put(13, y, 0); }
      t.rect(7, 5, 2, 5, p[0]);
    } else if (piece === 'legs') {
      for (let y = 3; y <= 5; y++) for (let x = 4; x <= 11; x++) put(x, y, y === 3 ? 2 : 1);
      for (let y = 6; y <= 13; y++) { for (let x = 4; x <= 6; x++) put(x, y, x === 4 ? 2 : 1); for (let x = 9; x <= 11; x++) put(x, y, x === 11 ? 0 : 1); }
    } else {
      for (let y = 8; y <= 12; y++) { for (let x = 3; x <= 6; x++) put(x, y, y === 8 ? 2 : (y === 12 ? 0 : 1)); for (let x = 9; x <= 12; x++) put(x, y, y === 8 ? 2 : (y === 12 ? 0 : 1)); }
      t.rect(2, 11, 5, 2, p[0]); t.rect(9, 11, 5, 2, p[0]);
    }
    outline(t, [0, 0, 0], 195);
  };
}
for (const piece of ['helm', 'chest', 'legs', 'boots']) {
  for (const mat of Object.keys(ARMOR_PALETTE)) T[`armor_${piece}_${mat}`] = armorTex(piece, mat);
}

// ===========================================================================
export const TEXTURE_NAMES = Object.keys(T);

/** Render every tile once. Returns { names, index: Map, tiles: [Uint8ClampedArray] } */
export function generateTextures() {
  const names = TEXTURE_NAMES;
  const index = new Map();
  const tiles = [];
  names.forEach((name, i) => {
    const t = new Tile('4dmc:' + name);
    T[name](t);
    tiles.push(t.data);
    index.set(name, i);
  });
  return { names, index, tiles };
}
