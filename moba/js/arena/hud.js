// MOBA 3D arena: Toolbar buttons, ability tooltips and click-to-cast, screen projection.
// Classic script (not a module) so the game still works from file://. Loaded in order by arena3d.html;
// top-level let/const/function names are shared across all js/arena/*.js files.
'use strict';

// Roster: hero buttons, loading-screen pills and number-key hotkeys come from each kit's `roster` entry
function rosterKits() {
  return Object.values(window.MOBA_HEROES || {}).filter((k) => k.roster).sort((a, b) => a.roster.order - b.roster.order);
}
(function buildRosterUI() {
  const btnHost = document.getElementById('roster-buttons');
  const pillHost = document.getElementById('ld-roster-grid');
  rosterKits().forEach((k, i) => {
    if (btnHost) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-btn' + (k.id === 'coyote' ? ' toggled' : '');
      b.id = 'btn-hero-' + k.id;
      b.style.fontWeight = '700';
      b.textContent = k.roster.emoji + ' ' + (i + 1) + ': ' + k.roster.short;
      b.addEventListener('click', () => switchHero(k.id));
      btnHost.appendChild(b);
    }
    if (pillHost) {
      const p = document.createElement('div');
      p.className = 'loader-hero-pill' + (i === 0 ? ' active' : '');
      p.id = 'ld-pill-' + k.id;
      p.textContent = k.roster.emoji + ' ' + k.roster.short;
      pillHost.appendChild(p);
    }
  });
})();

// Hover Tooltips & Click-to-Cast for HUD Ability Bar (Passive, LMB, Q, E, R)
const ttEl = document.getElementById('ability-tooltip-3d');
const ttTitle = document.getElementById('tt3d-title');
const ttMeta = document.getElementById('tt3d-meta');
const ttBody = document.getElementById('tt3d-body');
const ttTalent = document.getElementById('tt3d-talent');

function showAbilityTooltip(slotKey) {
  const meta = HERO_UI_META[activeHeroId] || HERO_UI_META.coyote;
  const info = meta.tooltips && meta.tooltips[slotKey];
  if (!info || !ttEl) return;
  const pProg = phase1Engine ? phase1Engine.getPlayerProg() : { level: 1, talents: {} };
  const lvl = pProg.level || 1;
  let rankBadge = '';
  if (slotKey === 'Q' || slotKey === 'E') {
    const rQE = lvl >= 9 ? 3 : (lvl >= 6 ? 2 : 1);
    const nextStr = rQE === 1 ? ' (Next: Lv 6)' : (rQE === 2 ? ' (Next: Lv 9)' : ' (MAX)');
    rankBadge = ' • [RANK ' + rQE + '/3' + nextStr + ']';
  } else if (slotKey === 'R') {
    const rUlt = lvl >= 12 ? 3 : (lvl >= 8 ? 2 : (lvl >= 4 ? 1 : 0));
    const nextStr = rUlt === 0 ? ' (Unlocks Lv 4)' : (rUlt === 1 ? ' (Next: Lv 8)' : (rUlt === 2 ? ' (Next: Lv 12)' : ' (MAX)'));
    rankBadge = ' • [RANK ' + rUlt + '/3' + nextStr + ']';
  }
  ttTitle.textContent = info.title + rankBadge;
  ttTitle.style.color = meta.color || '#fde047';
  ttMeta.textContent = info.meta;
  ttBody.innerHTML = info.body;

  // Show any unlocked or available Talent upgrades affecting this ability
  const heroTalents = window.MOBA_PHASE1 && window.MOBA_PHASE1.HERO_TALENTS && window.MOBA_PHASE1.HERO_TALENTS[activeHeroId];
  const chosen = (pProg && pProg.talents) || {};
  const lines = [];
  if (heroTalents && info.talentLevels) {
    info.talentLevels.forEach((lvl) => {
      const tier = heroTalents[lvl];
      if (!tier) return;
      if (chosen[lvl] && tier[chosen[lvl]]) {
        const t = tier[chosen[lvl]];
        lines.push('<span style="color:#4ade80;font-weight:700;">✓ Lv' + lvl + ' ' + t.name + ':</span> ' + t.desc);
      } else {
        lines.push('<span style="color:#94a3b8;">Lv' + lvl + ' Talents:</span> <b>' + tier.L.name + '</b> / <b>' + tier.R.name + '</b>');
      }
    });
  }
  if (lines.length > 0) {
    ttTalent.innerHTML = lines.join('<br/>');
    ttTalent.style.display = 'block';
  } else {
    ttTalent.style.display = 'none';
  }
  ttEl.classList.add('visible');
}

function hideAbilityTooltip() {
  if (ttEl) ttEl.classList.remove('visible');
}

document.querySelectorAll('.ability-row .ability-slot').forEach((slotEl) => {
  const slotKey = slotEl.getAttribute('data-slot');
  slotEl.addEventListener('mouseenter', () => showAbilityTooltip(slotKey));
  slotEl.addEventListener('mouseleave', hideAbilityTooltip);
  slotEl.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (slotKey === 'Q' || slotKey === 'E' || slotKey === 'R') castKey(slotKey);
    else if (slotKey === 'LMB') tryAttack();
  });
});

document.getElementById('btn-cam-moba').addEventListener('click', () => {
  camDist = 20.5;
  document.getElementById('btn-cam-moba').classList.add('toggled');
  document.getElementById('btn-cam-close').classList.remove('toggled');
});
document.getElementById('btn-cam-close').addEventListener('click', () => {
  camDist = 6.5;
  document.getElementById('btn-cam-close').classList.add('toggled');
  document.getElementById('btn-cam-moba').classList.remove('toggled');
});
const btnLit = document.getElementById('btn-unlit-toggle');
btnLit.addEventListener('click', () => {
  unlitHandPaintedMode = !unlitHandPaintedMode;
  btnLit.textContent = unlitHandPaintedMode ? 'Unlit Diffuse (LoL)' : 'Hand-Painted Lit';
  btnLit.classList.toggle('toggled', unlitHandPaintedMode);
  applyMaterialStyle();
});
const btnSh = document.getElementById('btn-shooter-3d');
btnSh.addEventListener('click', () => {
  shooterEnabled = !shooterEnabled;
  btnSh.classList.toggle('toggled', shooterEnabled);
});
const btnWtf = document.getElementById('btn-wtf-3d');
btnWtf.addEventListener('click', () => {
  wtfMode = !wtfMode;
  btnWtf.classList.toggle('toggled', wtfMode);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function projectToScreen(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    visible: v.z < 1
  };
}

const rhWorld = new THREE.Vector3();
const lhWorld = new THREE.Vector3();
const bowAimTarget = new THREE.Vector3();
