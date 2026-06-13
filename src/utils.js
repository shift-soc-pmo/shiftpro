import { S } from './state.js';

// Set by main.js after render is defined — avoids circular imports
let _render = () => {};
export function setRenderFn(fn) { _render = fn; }

// ══════════════════════════════════════════════════════
// DOM HELPERS
// ══════════════════════════════════════════════════════
export const $ = id => document.getElementById(id);

export function e(tag, props={}, children=[]) {
  const el = document.createElement(tag);
  if (Array.isArray(props)) { children = props; props = {}; }
  if (typeof props === "string") { children = [props]; props = {}; }
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
    if (c == null || c === false || c === undefined) continue;
    if (typeof c === "string" || typeof c === "number") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

export function div(cls, children=[], extra={}) { return e("div", {class: cls, ...extra}, children); }
export function btn(cls, txt, onclick, extra={}) { return e("button", {class: cls, ...extra, onclick}, txt); }

// ══════════════════════════════════════════════════════
// UI FEEDBACK
// ══════════════════════════════════════════════════════
export function toast(msg, type="ok") {
  S.toast = { msg, type };
  _render();
  setTimeout(() => { S.toast = null; _render(); }, 3000);
}

// ══════════════════════════════════════════════════════
// DATE UTILITIES
// ══════════════════════════════════════════════════════
export function today() {
  return new Date().toISOString().split("T")[0];
}

export function getWeekDates(offset=0) {
  const d = new Date();
  const dow = d.getDay();
  d.setDate(d.getDate() - dow + offset * 7);
  return Array.from({length: 7}, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + dd;
  });
}

export function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("he-IL");
}

// ══════════════════════════════════════════════════════
// EMPLOYEE LOOKUPS
// ══════════════════════════════════════════════════════
export function getEmp(id) { return S.employees.find(e => e.id === id); }
export function empIdx(id) { return S.employees.findIndex(e => e.id === id); }

// ══════════════════════════════════════════════════════
// MISC
// ══════════════════════════════════════════════════════
export function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: "בוקר טוב", emoji: "☀️" };
  if (hour >= 12 && hour < 17) return { text: "צהריים טובים", emoji: "🌤️" };
  if (hour >= 17 && hour < 21) return { text: "ערב טוב", emoji: "🌆" };
  return { text: "לילה טוב", emoji: "🌙" };
}

export function generateSecureToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
