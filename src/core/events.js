/** Minimal synchronous event bus. */
export class EventBus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { const s = this.map.get(name); if (s) s.delete(fn); }
  emit(name, payload) {
    const s = this.map.get(name);
    if (!s) return;
    for (const fn of Array.from(s)) {
      try { fn(payload); } catch (err) { console.error(`[bus:${name}]`, err); }
    }
  }
}
export const bus = new EventBus();
