// Stacks, slots and the container model shared by the player, chests,
// smelters and the crafting grids.

import { getItem, maxStack } from './items.js';

export function stack(item, count = 1, dur) {
  const it = getItem(item);
  const s = { item, count };
  if (dur !== undefined) s.dur = dur;
  else if (it && it.durability) s.dur = it.durability;
  return s;
}

export function canMerge(a, b) {
  if (!a || !b) return false;
  if (a.item !== b.item) return false;
  const it = getItem(a.item);
  if (it && it.durability) return false;   // tools never stack
  return true;
}

export function cloneStack(s) { return s ? Object.assign({}, s) : null; }

export class Container {
  constructor(size, name = '') {
    this.slots = new Array(size).fill(null);
    this.name = name;
  }
  get size() { return this.slots.length; }
  get(i) { return this.slots[i] || null; }
  set(i, s) { this.slots[i] = s || null; }

  /** Insert as much as possible. Returns the number that did not fit. */
  add(item, count = 1, range = null) {
    const [lo, hi] = range || [0, this.slots.length];
    const cap = maxStack(item);
    const it = getItem(item);
    let left = count;
    if (!it || !it.durability) {
      for (let i = lo; i < hi && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.item === item && s.count < cap) {
          const take = Math.min(cap - s.count, left);
          s.count += take; left -= take;
        }
      }
    }
    for (let i = lo; i < hi && left > 0; i++) {
      if (this.slots[i]) continue;
      const take = it && it.durability ? 1 : Math.min(cap, left);
      this.slots[i] = stack(item, take);
      left -= take;
    }
    return left;
  }

  addStack(st, range = null) {
    if (!st) return 0;
    const it = getItem(st.item);
    if (it && it.durability) {
      const [lo, hi] = range || [0, this.slots.length];
      for (let i = lo; i < hi; i++) if (!this.slots[i]) { this.slots[i] = st; return 0; }
      return st.count;
    }
    return this.add(st.item, st.count, range);
  }

  count(item) {
    let n = 0;
    for (const s of this.slots) if (s && s.item === item) n += s.count;
    return n;
  }

  /** Remove `count` of `item`. Returns how many were actually removed. */
  remove(item, count = 1) {
    let left = count;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.item !== item) continue;
      const take = Math.min(s.count, left);
      s.count -= take; left -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    return count - left;
  }

  removeAt(i, count = 1) {
    const s = this.slots[i];
    if (!s) return null;
    const take = Math.min(count, s.count);
    const out = stack(s.item, take, s.dur);
    s.count -= take;
    if (s.count <= 0) this.slots[i] = null;
    return out;
  }

  hasRoomFor(item, count = 1) {
    const cap = maxStack(item);
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += cap;
      else if (s.item === item && !getItem(item).durability) room += cap - s.count;
      if (room >= count) return true;
    }
    return room >= count;
  }

  isEmpty() { return this.slots.every((s) => !s); }

  serialize() {
    return this.slots.map((s) => (s ? (s.dur !== undefined ? `${s.item}:${s.count}:${s.dur}` : `${s.item}:${s.count}`) : ''));
  }
  static deserialize(arr, size) {
    const c = new Container(size || arr.length);
    arr.forEach((v, i) => {
      if (!v || i >= c.slots.length) return;
      const p = v.split(':');
      c.slots[i] = { item: p[0], count: Number(p[1]) || 1 };
      if (p[2] !== undefined) c.slots[i].dur = Number(p[2]);
    });
    return c;
  }
}

export const HOTBAR = 9;
export const MAIN = 27;
export const INV_SIZE = HOTBAR + MAIN;     // 36
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];

export class PlayerInventory extends Container {
  constructor() {
    super(INV_SIZE, 'Manifest');
    this.armor = new Container(4, 'Armour');
    this.selected = 0;
  }
  get held() { return this.slots[this.selected]; }
  setHeld(s) { this.slots[this.selected] = s; }

  /** Prefer the hotbar when picking things up, exactly like a real pocket. */
  addSmart(item, count = 1) {
    const left = this.add(item, count, [0, HOTBAR]);
    if (left <= 0) return 0;
    return this.add(item, left, [HOTBAR, INV_SIZE]);
  }

  totalDefense() {
    let d = 0;
    for (const s of this.armor.slots) {
      if (!s) continue;
      const it = getItem(s.item);
      if (it) d += it.defense;
    }
    return d;
  }
}
