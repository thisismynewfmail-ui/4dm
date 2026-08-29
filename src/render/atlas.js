// ---------------------------------------------------------------------------
// Turns the procedural tiles into (a) a WebGL2 texture array for the voxel
// shader and (b) a 2D icon sheet for the interface, including hand-rolled
// isometric cube icons for every placeable block.
// ---------------------------------------------------------------------------

import * as THREE from '../../vendor/three.module.js';
import { generateTextures, TEXTURE_NAMES } from './textures.js';
import { blocks, blockByName } from '../world/blocks.js';
import { items } from '../world/items.js';

export const TS = 16;
export const ICON = 32;      // icon cell size in the UI sheet
const ICON_COLS = 16;

export let texIndex = new Map();
export let arrayTexture = null;
export let iconURL = '';
export let iconIndex = new Map();
export let iconRows = 0;

/** blockFaceLayer[id * 6 + face] — face order +X -X +Y -Y +Z -Z */
export let blockFaceLayer = null;
/** Mean opaque colour of each block's side texture, for particles. */
export let blockAvgColor = null;
/** Blocks whose orientation matters (they declare a `north` face). */
export const ORIENTED = new Set();

function tileToImageData(ctx, bytes) {
  const img = ctx.createImageData(TS, TS);
  img.data.set(bytes);
  return img;
}

export function buildAtlas() {
  const gen = generateTextures();
  texIndex = gen.index;

  // --- GPU texture array ---------------------------------------------------
  const layers = gen.tiles.length;
  const data = new Uint8Array(TS * TS * 4 * layers);
  for (let i = 0; i < layers; i++) data.set(gen.tiles[i], i * TS * TS * 4);
  arrayTexture = new THREE.DataArrayTexture(data, TS, TS, layers);
  arrayTexture.format = THREE.RGBAFormat;
  arrayTexture.type = THREE.UnsignedByteType;
  arrayTexture.magFilter = THREE.NearestFilter;
  arrayTexture.minFilter = THREE.NearestFilter;
  arrayTexture.wrapS = THREE.RepeatWrapping;
  arrayTexture.wrapT = THREE.RepeatWrapping;
  arrayTexture.generateMipmaps = false;
  arrayTexture.needsUpdate = true;

  // --- per-block face layer table -----------------------------------------
  const lay = (name) => {
    const i = texIndex.get(name);
    if (i === undefined) { console.warn('missing texture', name); return 0; }
    return i;
  };
  blockFaceLayer = new Uint16Array(blocks.length * 6);
  for (const b of blocks) {
    const t = b.tex || {};
    const all = t.all;
    const side = t.side || all;
    const top = t.top || all || side;
    const bottom = t.bottom || all || side;
    const front = t.north;
    if (front) ORIENTED.add(b.id);
    const faces = [side, side, top, bottom, side, side];
    for (let f = 0; f < 6; f++) blockFaceLayer[b.id * 6 + f] = lay(faces[f] || 'air');
    if (front) b.frontLayer = lay(front);
  }

  // mean colour per block, for break particles
  blockAvgColor = new Float32Array(blocks.length * 3);
  for (const b of blocks) {
    const t = b.tex || {};
    const name = t.side || t.all || t.top || 'stone';
    const bytes = gen.tiles[gen.index.get(name) || 0];
    let r = 0, g = 0, bl = 0, n = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      if (bytes[i + 3] < 128) continue;
      r += bytes[i]; g += bytes[i + 1]; bl += bytes[i + 2]; n++;
    }
    if (!n) n = 1;
    blockAvgColor[b.id * 3] = r / n / 255;
    blockAvgColor[b.id * 3 + 1] = g / n / 255;
    blockAvgColor[b.id * 3 + 2] = bl / n / 255;
  }

  buildIconSheet(gen);
  return { arrayTexture, texIndex };
}

// ---------------------------------------------------------------------------
// UI icon sheet
// ---------------------------------------------------------------------------

function tileCanvas(bytes, brightness = 1) {
  const c = document.createElement('canvas');
  c.width = TS; c.height = TS;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TS, TS);
  if (brightness === 1) img.data.set(bytes);
  else {
    for (let i = 0; i < bytes.length; i += 4) {
      img.data[i] = Math.min(255, bytes[i] * brightness);
      img.data[i + 1] = Math.min(255, bytes[i + 1] * brightness);
      img.data[i + 2] = Math.min(255, bytes[i + 2] * brightness);
      img.data[i + 3] = bytes[i + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Map the unit square onto a parallelogram and blit a tile into it. */
function blitFace(ctx, canvas, p0, p1, p3) {
  ctx.save();
  ctx.beginPath();
  const p2 = [p1[0] + p3[0] - p0[0], p1[1] + p3[1] - p0[1]];
  ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(
    (p1[0] - p0[0]) / TS, (p1[1] - p0[1]) / TS,
    (p3[0] - p0[0]) / TS, (p3[1] - p0[1]) / TS,
    p0[0], p0[1],
  );
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

function drawIsoCube(ctx, ox, oy, topBytes, sideBytes) {
  // 32x32 cell; a 2:1 isometric cube inset by 1px.
  const T = [ox + 16, oy + 2], R = [ox + 30, oy + 10], B = [ox + 16, oy + 18], L = [ox + 2, oy + 10];
  const L2 = [ox + 2, oy + 24], B2 = [ox + 16, oy + 32], R2 = [ox + 30, oy + 24];
  blitFace(ctx, tileCanvas(topBytes, 1.0), L, T, B);        // top
  blitFace(ctx, tileCanvas(sideBytes, 0.74), L, B, L2);     // left
  blitFace(ctx, tileCanvas(sideBytes, 0.55), B, R, B2);     // right
  // crisp silhouette
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(T[0], T[1] + 0.5); ctx.lineTo(R[0] - 0.5, R[1]); ctx.lineTo(R2[0] - 0.5, R2[1]);
  ctx.lineTo(B2[0], B2[1] - 0.5); ctx.lineTo(L2[0] + 0.5, L2[1]); ctx.lineTo(L[0] + 0.5, L[1]);
  ctx.closePath(); ctx.stroke();
}

function drawSprite(ctx, ox, oy, bytes) {
  const c = tileCanvas(bytes, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, TS, TS, ox, oy, ICON, ICON);
}

function buildIconSheet(gen) {
  const list = items;
  iconRows = Math.ceil(list.length / ICON_COLS);
  const cv = document.createElement('canvas');
  cv.width = ICON_COLS * ICON;
  cv.height = iconRows * ICON;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  list.forEach((it, i) => {
    const ox = (i % ICON_COLS) * ICON, oy = Math.floor(i / ICON_COLS) * ICON;
    iconIndex.set(it.name, i);
    if (it.kind === 'block') {
      const b = blockByName.get(it.blockName);
      const t = b.tex || {};
      const side = gen.tiles[gen.index.get(t.side || t.all || 'stone')];
      const top = gen.tiles[gen.index.get(t.top || t.all || t.side || 'stone')];
      if (b.render === 'cube') drawIsoCube(ctx, ox, oy, top, side);
      else drawSprite(ctx, ox, oy, gen.tiles[gen.index.get(t.all || t.side || 'stone')]);
    } else {
      const idx = gen.index.get(it.tex);
      if (idx === undefined) { console.warn('missing item texture', it.name, it.tex); return; }
      drawSprite(ctx, ox, oy, gen.tiles[idx]);
    }
  });

  iconURL = cv.toDataURL('image/png');
  const style = document.createElement('style');
  style.textContent = `:root{--icon-sheet:url('${iconURL}');--icon-cols:${ICON_COLS};--icon-rows:${iconRows};}`;
  document.head.appendChild(style);
}

/** Style an element as the icon for `itemName`, drawn at `size` px. */
export function applyIcon(el, itemName, size = ICON) {
  const i = iconIndex.get(itemName);
  if (i === undefined) { el.style.backgroundImage = 'none'; return; }
  const col = i % ICON_COLS, row = Math.floor(i / ICON_COLS);
  const s = size / ICON;
  el.style.backgroundImage = `var(--icon-sheet)`;
  el.style.backgroundSize = `${ICON_COLS * ICON * s}px ${iconRows * ICON * s}px`;
  el.style.backgroundPosition = `${-col * ICON * s}px ${-row * ICON * s}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.imageRendering = 'pixelated';
}

/** Standalone data URL for one icon (used by toasts / tooltips). */
const iconCache = new Map();
export function iconStyleString(itemName, size = ICON) {
  const key = itemName + ':' + size;
  if (iconCache.has(key)) return iconCache.get(key);
  const i = iconIndex.get(itemName);
  if (i === undefined) return '';
  const col = i % ICON_COLS, row = Math.floor(i / ICON_COLS);
  const s = size / ICON;
  const str = `background-image:var(--icon-sheet);` +
    `background-size:${ICON_COLS * ICON * s}px ${iconRows * ICON * s}px;` +
    `background-position:${-col * ICON * s}px ${-row * ICON * s}px;` +
    `width:${size}px;height:${size}px;image-rendering:pixelated;`;
  iconCache.set(key, str);
  return str;
}
