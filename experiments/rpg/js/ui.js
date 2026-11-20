// DOM UI: inventory, skills, credits, floating text, level-up banner.
import { ITEMS } from '../data/items.js';
import { SKILLS, levelForXp, xpForLevel, MAX_LEVEL } from '../data/skills.js';
import { INV_SIZE } from './inventory.js';

export function itemIconHTML(def, qty = 1) {
  let html = def.kind === 'tool'
    ? `<div class="icon tool" style="--c:${def.color}">${def.icon}</div>`
    : `<div class="icon res res-${def.skill}" style="--c:${def.color}"></div>`;
  if (qty > 1) html += `<span class="qty">${qty}</span>`;
  return html;
}

export function createUI({ onSlotUse, onSlotDrop }) {
  const grid = document.getElementById('inv-grid');
  const slots = [];
  for (let i = 0; i < INV_SIZE; i++) {
    const el = document.createElement('div');
    el.className = 'inv-slot';
    el.addEventListener('click', (e) => onSlotUse(i, e.shiftKey));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); onSlotDrop(i); });
    grid.appendChild(el);
    slots.push(el);
  }
  const invCount = document.getElementById('inv-count');
  const skillsEl = document.getElementById('skills-list');
  const creditsEl = document.getElementById('credits');
  const layer = document.getElementById('labels');
  const bannerEl = document.getElementById('levelup');
  const floats = [];
  let bannerTimer = 0;

  function renderInventory(inv) {
    let used = 0;
    inv.forEach((s, i) => {
      const el = slots[i];
      if (!s) { el.innerHTML = ''; el.title = ''; el.classList.remove('filled'); return; }
      used++;
      const def = ITEMS[s.id];
      el.classList.add('filled');
      el.title = def.kind === 'tool'
        ? `${def.name} (needs ${def.skill[0].toUpperCase() + def.skill.slice(1)} ${def.levelReq})\nShift-click or right-click to drop`
        : `${def.name}\nShift-click or right-click to drop`;
      el.innerHTML = itemIconHTML(def, s.qty);
    });
    invCount.textContent = `${used}/${INV_SIZE}`;
  }

  function renderSkills(xp) {
    skillsEl.innerHTML = Object.entries(SKILLS)
      .filter(([, s]) => s.milestone === 1)
      .map(([id, s]) => {
        const x = xp[id] || 0;
        const lvl = levelForXp(x);
        const cur = xpForLevel(lvl), next = lvl >= MAX_LEVEL ? cur : xpForLevel(lvl + 1);
        const pct = lvl >= MAX_LEVEL ? 100 : Math.round(((x - cur) / Math.max(1, next - cur)) * 100);
        const tip = lvl >= MAX_LEVEL ? `${Math.floor(x)} XP (max)` : `${Math.floor(x)} XP · ${Math.ceil(next - x)} to level ${lvl + 1}`;
        return `<div class="skill" title="${tip}"><span class="sk-icon">${s.icon}</span><span class="sk-name">${s.name}</span><span class="sk-lvl">${lvl}</span><div class="sk-bar"><div style="width:${pct}%"></div></div></div>`;
      })
      .join('');
  }

  function renderCredits(n, rep = 0) {
    creditsEl.textContent = `${n} cr · ${rep} rep`;
  }

  function floatText(text, color, pos) {
    const el = document.createElement('div');
    el.className = 'float-txt';
    el.style.color = color;
    el.textContent = text;
    layer.appendChild(el);
    floats.push({ el, x: pos.x, y: pos.y, z: pos.z, life: 1.4 });
  }

  function banner(title, sub) {
    bannerEl.innerHTML = `<div class="lu-title">${title}</div><div class="lu-sub">${sub}</div>`;
    bannerEl.classList.add('show');
    bannerTimer = 3.2;
  }
  function levelUp(skillName, level) { banner('Level up!', `${skillName} is now level ${level}`); }

  function update(dt, project) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      f.y += dt * 1.1;
      const p = project(f.x, f.y, f.z);
      f.el.style.left = p.x + 'px';
      f.el.style.top = p.y + 'px';
      f.el.style.opacity = String(Math.min(1, f.life * 1.5));
      if (f.life <= 0) { f.el.remove(); floats.splice(i, 1); }
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) bannerEl.classList.remove('show');
    }
  }

  return { renderInventory, renderSkills, renderCredits, floatText, levelUp, banner, update };
}
