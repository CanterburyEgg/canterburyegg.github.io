// Quest engine (pure): slot filling, text substitution, entry selection, journal text.
import { QUESTS } from '../data/quests/index.js';
import { QUIRKS } from '../data/quirks.js';
import { ITEMS } from '../data/items.js';
import { countItem } from './inventory.js';

// ---- Placement -------------------------------------------------------
// M1: only 'starter' placement exists. Later: tier + soft preference scoring.
export function questPlanetIndex(q, system) {
  if (q.placement.planet === 'starter') return 0;
  const idx = system.planets.findIndex((p) => p.tier === (q.tier === 'novice' ? 1 : 2));
  return idx >= 0 ? idx : 0;
}

export function questsForPlanet(system, index) {
  return QUESTS.filter((q) => questPlanetIndex(q, system) === index);
}

// ---- Slots -------------------------------------------------------------
// Each slot resolves to { text, id?, num? }.
export function resolveSlots(q, P) {
  const out = {};
  for (const [key, spec] of Object.entries(q.slots || {})) {
    if ('value' in spec) {
      out[key] = { text: String(spec.value), num: Number(spec.value) };
      continue;
    }
    const v = resolvePath(spec.from, P);
    if (v && v.id) out[key] = v;
    else if (v && v.text) out[key] = v;
    else {
      const fb = spec.fallback;
      const fbItem = Object.values(ITEMS).find((it) => it.name === fb);
      out[key] = fbItem ? { text: fbItem.name, id: fbItem.id } : { text: fb };
    }
  }
  return out;
}

function resolvePath(path, P) {
  if (!path || !P) return null;
  if (path === 'outpost.name') return { text: P.outpost.name };
  if (path === 'outpost.shop.name') return { text: P.outpost.shopName };
  if (path === 'planet.name') return { text: P.meta.name };
  let m = /^planet\.resources\.(\w+)\.tier(\d)$/.exec(path);
  if (m) {
    const ids = P.resources[m[1]] && P.resources[m[1]][Number(m[2])];
    if (ids && ids.length && ITEMS[ids[0]]) return { text: ITEMS[ids[0]].name, id: ids[0] };
    return null;
  }
  m = /^planet\.quirks\[(\d+)\]\.nounPhrase$/.exec(path);
  if (m) {
    const qid = P.meta.quirks[Number(m[1])];
    return qid ? { text: QUIRKS[qid].nounPhrase } : null;
  }
  return null;
}

export function fillText(str, slots) {
  return String(str).replace(/\{(\w+)\}/g, (all, k) => (slots[k] ? slots[k].text : all));
}

// '{ore}' -> item id;  '{oreQty}' or 4 -> number
export function slotRef(ref, slots, kind) {
  if (typeof ref === 'number') return ref;
  const m = /^\{(\w+)\}$/.exec(String(ref));
  if (!m || !slots[m[1]]) return kind === 'num' ? Number(ref) : ref;
  const s = slots[m[1]];
  return kind === 'num' ? s.num : s.id || s.text;
}

export function quirkLine(q, P, slots) {
  const lines = q.quirkLines || {};
  const hit = (P.meta.quirks || []).find((k) => lines[k]);
  return fillText(hit ? lines[hit] : lines.default || '', slots);
}

// ---- Conditions ----------------------------------------------------------
// ctx: { step, flags:Set|obj, inventory, slots }
export function conditionMet(when, ctx) {
  if (!when) return true;
  if ('step' in when && ctx.step !== when.step) return false;
  if (when.flag && !(ctx.flags && ctx.flags[when.flag])) return false;
  if (when.notFlag && ctx.flags && ctx.flags[when.notFlag]) return false;
  if (when.hasItems) {
    for (const spec of when.hasItems) {
      const m = /^\{(\w+)\}x\{(\w+)\}$/.exec(spec);
      if (!m) continue;
      const id = slotRef(`{${m[1]}}`, ctx.slots, 'id');
      const n = slotRef(`{${m[2]}}`, ctx.slots, 'num');
      if (countItem(ctx.inventory, id) < n) return false;
    }
  }
  return true;
}

export function pickEntry(entries, ctx) {
  for (const e of entries || []) if (conditionMet(e.when, ctx)) return e.node;
  return null;
}

// ---- Journal -------------------------------------------------------------
export function questStatus(state, id) {
  const qs = state.quests[id];
  if (!qs) return 'not_started';
  return qs.done ? 'done' : 'started';
}

export function journalEntry(q, state) {
  const qs = state.quests[q.id] || { step: 0 };
  const slots = qs.slots || {};
  const step = q.steps.find((s) => s.id === qs.step) || q.steps[0];
  const text = fillText(step.journal, slots);
  const objectives = (step.objectives || []).map((o) => {
    if (o.kind !== 'haveItem') return null;
    const id = slotRef(o.item, slots, 'id');
    const need = slotRef(o.qty, slots, 'num');
    const have = Math.min(need, countItem(state.inventory, id));
    return { text: `${ITEMS[id] ? ITEMS[id].name : id}: ${have}/${need}`, done: have >= need };
  }).filter(Boolean);
  return { title: q.title, tier: q.tier, status: questStatus(state, q.id), text, objectives };
}
