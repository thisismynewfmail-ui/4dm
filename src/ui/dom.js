export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
export function on(node, ev, fn, opts) { node.addEventListener(ev, fn, opts); return () => node.removeEventListener(ev, fn, opts); }
export function show(node) { node.classList.remove('hidden'); }
export function hide(node) { node.classList.add('hidden'); }
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
