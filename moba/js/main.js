window.MOBA = window.MOBA || {};

(function (M) {
  'use strict';

  const canvas = document.getElementById('arena-canvas');
  const ctx = canvas.getContext('2d');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimapCtx = minimapCanvas.getContext('2d');

  const state = M.Combat.createSandboxState();

  const cam = {
    x: 0,
    y: 0,
    viewW: window.innerWidth,
    viewH: window.innerHeight,
    minimapPeek: false,
    peekX: 0,
    peekY: 0
  };

  const keys = {};
  const input = {
    moveX: 0,
    moveY: 0,
    screenX: window.innerWidth * 0.5,
    screenY: window.innerHeight * 0.5,
    worldX: 900,
    worldY: 830,
    mouseDown: false
  };

  function resize() {
    cam.viewW = window.innerWidth;
    cam.viewH = window.innerHeight;
    canvas.width = cam.viewW;
    canvas.height = cam.viewH;
  }
  window.addEventListener('resize', resize);
  resize();

  // =========================================================
  // BUILD ROSTER BAR & TALENT TREE UI
  // =========================================================
  const rosterStrip = document.getElementById('hero-roster-strip');
  function buildRosterUI() {
    const existing = rosterStrip.querySelectorAll('.hero-chip');
    existing.forEach(function (el) { el.remove(); });

    M.HERO_ORDER.forEach(function (id, idx) {
      const def = M.HEROES[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'hero-chip-' + id;
      btn.className = 'hero-chip' + (state.hero && state.hero.heroId === id ? ' active' : '');
      btn.innerHTML =
        '<span class="key-hint">' + (idx + 1) + '</span>' +
        '<span class="role-dot" style="background:' + M.ROLE_COLORS[def.role] + '"></span>' +
        '<span>' + def.name + '</span>';
      btn.addEventListener('click', function () {
        M.Audio.unlock();
        switchHero(id);
      });
      rosterStrip.appendChild(btn);
    });
  }

  function buildTalentUI() {
    const container = document.getElementById('talent-tiers-container');
    container.innerHTML = '';
    const h = state.hero;
    if (!h) return;

    [3, 6, 10].forEach(function (tier) {
      const unlocked = h.level >= tier;
      const row = document.createElement('div');
      row.className = 'talent-tier ' + (unlocked ? 'unlocked' : 'locked');

      const badge = document.createElement('div');
      badge.className = 'tier-lvl';
      badge.textContent = 'L' + tier;
      row.appendChild(badge);

      ['L', 'R'].forEach(function (side) {
        const tData = h.def.talents[tier][side];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'talent-' + tier + '-' + side;
        const isSel = unlocked && state.talents[tier] === side;
        btn.className = 'talent-choice' + (isSel ? ' selected' : '');
        btn.innerHTML = '<strong>' + tData.title + '</strong>' + tData.desc;
        btn.addEventListener('click', function () {
          M.Audio.unlock();
          state.talents[tier] = side;
          if (state.hero.level < tier) {
            setSandboxLevel(tier);
          } else {
            M.Audio.play('chime');
            buildTalentUI();
          }
        });
        row.appendChild(btn);
      });

      container.appendChild(row);
    });
  }

  function switchHero(heroId) {
    M.Combat.selectHero(state, heroId, false);
    M.Audio.play('levelup');
    buildRosterUI();
    buildTalentUI();
    syncStaticHeroHUD();
  }

  function setSandboxLevel(lv) {
    const clamped = Math.max(1, Math.min(12, lv));
    state.selectedLevel = clamped;
    if (state.hero) {
      state.hero.level = clamped;
      M.Combat.recalcHeroStats(state, state.hero, true);
    }
    document.getElementById('lbl-sandbox-lvl').textContent = 'Lv ' + clamped;
    M.Audio.play('levelup');
    buildTalentUI();
  }

  function syncStaticHeroHUD() {
    const h = state.hero;
    if (!h) return;
    const def = h.def;
    document.getElementById('hud-portrait-glyph').textContent = def.glyph;
    document.getElementById('hud-portrait-glyph').style.color = def.color;
    document.getElementById('hud-hero-name').textContent = def.name;
    document.getElementById('hud-hero-role').textContent = def.subtitle;

    document.getElementById('lbl-LMB').textContent = def.abilities.LMB.short;
    document.getElementById('lbl-Q').textContent = def.abilities.Q.short;
    document.getElementById('lbl-E').textContent = def.abilities.E.short;
    document.getElementById('lbl-R').textContent = def.abilities.R.short;

    document.getElementById('mp-Q').textContent = def.abilities.Q.mp;
    document.getElementById('mp-E').textContent = def.abilities.E.mp;
    document.getElementById('mp-R').textContent = def.abilities.R.mp;
  }

  function updateLiveHUD() {
    const h = state.hero;
    if (!h) return;

    document.getElementById('hud-lvl-badge').textContent = h.level;
    document.getElementById('hud-stat-phys').textContent = 'ATK ' + Math.round(h.phys);
    document.getElementById('hud-stat-fant').textContent = 'FNT ' + Math.round(h.fant);
    document.getElementById('hud-stat-spd').textContent = 'SPD ' + M.Combat.getEffectiveMoveSpeed(state, h);

    // HP, Shield & MP Bars
    const hpPct = Math.max(0, Math.min(100, (h.hp / h.maxHp) * 100));
    const shPct = Math.max(0, Math.min(100, (h.shield / h.maxHp) * 100));
    const mpPct = Math.max(0, Math.min(100, (h.mp / h.maxMp) * 100));

    document.getElementById('hp-fill').style.width = hpPct + '%';
    document.getElementById('shield-fill').style.width = shPct + '%';
    document.getElementById('hp-text').textContent =
      Math.round(h.hp) + (h.shield > 0 ? ' (+' + Math.round(h.shield) + ')' : '') + ' / ' + h.maxHp;

    document.getElementById('mp-fill').style.width = mpPct + '%';
    document.getElementById('mp-text').textContent = Math.round(h.mp) + ' / ' + h.maxMp;

    // Cooldowns & Empowered Highlights
    updateSlotCD('slot-lmb', 'cd-LMB', h.atkTimer);
    updateSlotCD('slot-q', 'cd-Q', h.cdQ);
    updateSlotCD('slot-e', 'cd-E', (h.fairyERecastTimer > 0 || h.brawlerERecastTimer > 0) ? 0 : h.cdE);
    updateSlotCD('slot-r', 'cd-R', h.cdR);
    updateSlotCD('slot-ward', 'cd-F', h.cdWard);

    const slotR = document.getElementById('slot-r');
    slotR.classList.toggle('locked-ult', h.level < 4);

    // Special stack pips & active states
    const pipP = document.getElementById('pip-P');
    const pipQ = document.getElementById('pip-Q');
    const pipE = document.getElementById('pip-E');
    const slotQ = document.getElementById('slot-q');
    const slotE = document.getElementById('slot-e');

    pipP.style.display = 'none';
    pipQ.style.display = 'none';
    pipE.style.display = 'none';
    slotQ.classList.remove('empowered');
    slotE.classList.remove('recast-ready');

    if (h.heroId === 'sorceress' && h.qTempoStacks > 0) {
      pipQ.style.display = 'block';
      pipQ.textContent = 'x' + h.qTempoStacks;
      slotQ.classList.add('empowered');
    }
    if (h.heroId === 'coyote' && h.coyoteQArmed) {
      slotQ.classList.add('empowered');
    }
    if (h.heroId === 'brawler' && h.brawlerQArmed) {
      slotQ.classList.add('empowered');
    }
    if (h.heroId === 'fairy' && h.fairyERecastTimer > 0) {
      slotE.classList.add('recast-ready');
      pipE.style.display = 'block';
      pipE.textContent = h.fairyERecastTimer.toFixed(1) + 's';
    }
    if (h.heroId === 'brawler' && h.brawlerERecastTimer > 0) {
      slotE.classList.add('recast-ready');
      pipE.style.display = 'block';
      pipE.textContent = '2ND';
    }
    if (h.heroId === 'bodyguard' && h.guardStacks > 0) {
      pipP.style.display = 'block';
      pipP.textContent = 'x' + h.guardStacks;
    }
    if (h.heroId === 'panther' && h.unseenLinger > 0) {
      pipP.style.display = 'block';
      pipP.textContent = 'SPD';
    }
  }

  function updateSlotCD(slotId, cdId, val) {
    const slot = document.getElementById(slotId);
    const cdEl = document.getElementById(cdId);
    if (val > 0.05) {
      slot.classList.add('on-cd');
      cdEl.textContent = val >= 1 ? Math.ceil(val) : val.toFixed(1);
    } else {
      slot.classList.remove('on-cd');
      cdEl.textContent = '';
    }
  }

  // =========================================================
  // TOOLTIPS
  // =========================================================
  const tooltip = document.getElementById('ability-tooltip');
  document.querySelectorAll('.ability-slot').forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      const slot = el.getAttribute('data-slot');
      const h = state.hero;
      if (!h) return;
      let title = '';
      let meta = '';
      let body = '';

      if (slot === 'F') {
        title = 'Observer Ward (F)';
        meta = 'CD 18s • 75s Duration';
        body = 'Places an allied Ward near your cursor that grants vision respecting tree & wall Line-of-Sight.';
      } else if (slot === 'B') {
        title = 'Recall to Fountain (B)';
        meta = '4.0s Channel';
        body = 'Channel for 4s (interrupted by moving or damage) to teleport to the Fountain Sanctuary for rapid healing.';
      } else {
        const ab = h.def.abilities[slot];
        if (!ab) return;
        title = ab.name + ' (' + slot + ')';
        meta = ab.meta ? ab.meta : ('CD ' + ab.cd + 's • ' + ab.mp + ' MP');
        body = ab.desc;
      }

      document.getElementById('tt-title').textContent = title;
      document.getElementById('tt-meta').textContent = meta;
      document.getElementById('tt-body').textContent = body;
      tooltip.classList.add('visible');

      const rect = el.getBoundingClientRect();
      tooltip.style.left = Math.max(12, Math.min(window.innerWidth - 295, rect.left - 110)) + 'px';
      tooltip.style.top = (rect.top - tooltip.offsetHeight - 12) + 'px';
    });

    el.addEventListener('mouseleave', function () {
      tooltip.classList.remove('visible');
    });

    el.addEventListener('click', function () {
      M.Audio.unlock();
      const slot = el.getAttribute('data-slot');
      if (slot === 'Q' || slot === 'E' || slot === 'R') {
        M.Combat.castAbility(state, slot, input.worldX, input.worldY, input.moveX, input.moveY);
      } else if (slot === 'F') {
        M.Combat.placePlayerWard(state, input.worldX, input.worldY);
      } else if (slot === 'B') {
        M.Combat.startRecall(state);
      }
    });
  });

  // =========================================================
  // SANDBOX TOOLBAR BUTTONS
  // =========================================================
  document.getElementById('btn-lvl-down').addEventListener('click', function () {
    M.Audio.unlock();
    setSandboxLevel(state.selectedLevel - 1);
  });
  document.getElementById('btn-lvl-up').addEventListener('click', function () {
    M.Audio.unlock();
    setSandboxLevel(state.selectedLevel + 1);
  });
  document.getElementById('btn-lvl-max').addEventListener('click', function () {
    M.Audio.unlock();
    setSandboxLevel(12);
  });

  const btnWtf = document.getElementById('btn-wtf-mode');
  btnWtf.addEventListener('click', function () {
    M.Audio.unlock();
    state.wtfMode = !state.wtfMode;
    btnWtf.classList.toggle('toggled', state.wtfMode);
    if (state.wtfMode && state.hero) {
      state.hero.cdQ = 0; state.hero.cdE = 0; state.hero.cdR = 0; state.hero.cdWard = 0;
      state.hero.mp = state.hero.maxMp;
    }
  });

  const btnShooter = document.getElementById('btn-turret-dummy');
  btnShooter.addEventListener('click', function () {
    M.Audio.unlock();
    state.shooterEnabled = !state.shooterEnabled;
    btnShooter.classList.toggle('toggled', state.shooterEnabled);
  });

  const btnEnemyWard = document.getElementById('btn-enemy-ward');
  btnEnemyWard.addEventListener('click', function () {
    M.Audio.unlock();
    state.enemyWardEnabled = !state.enemyWardEnabled;
    btnEnemyWard.classList.toggle('toggled', state.enemyWardEnabled);
  });

  document.getElementById('btn-spawn-creeps').addEventListener('click', function () {
    M.Audio.unlock();
    M.Combat.spawnCreepPack(state);
  });

  document.getElementById('btn-dmg-cannon').addEventListener('click', function () {
    M.Audio.unlock();
    if (state.turretUnit && !state.turretUnit.dead) {
      M.Combat.dealDamage(state, null, state.turretUnit, 99999, 'physical');
    } else if (state.hero) {
      state.texts.push({
        x: state.hero.x, y: state.hero.y - 30, vy: -35, life: 1.0, maxLife: 1.0,
        text: 'ANCHOR CANNON (Q) FIRST!', color: '#fbbf24', size: 12
      });
    }
  });

  document.getElementById('btn-reset-arena').addEventListener('click', function () {
    M.Audio.unlock();
    const curId = state.hero ? state.hero.heroId : 'sorceress';
    state.projectiles = [];
    state.zones = [];
    state.wards = [];
    state.arenaRing = null;
    state.boomerangSaw = null;
    M.Combat.spawnDefaultDummies(state);
    M.Combat.selectHero(state, curId, true);
    buildRosterUI();
    buildTalentUI();
    syncStaticHeroHUD();
  });

  const btnSfx = document.getElementById('btn-sfx-toggle');
  btnSfx.addEventListener('click', function () {
    const next = !M.Audio.isEnabled();
    M.Audio.setEnabled(next);
    btnSfx.classList.toggle('toggled', next);
    if (next) M.Audio.unlock();
  });

  // =========================================================
  // INPUT LISTENERS (WASD + MOUSE + HOTKEYS)
  // =========================================================
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    M.Audio.unlock();
    const code = e.code;
    keys[code] = true;
    refreshMoveDir();

    if (code === 'KeyQ') {
      M.Combat.castAbility(state, 'Q', input.worldX, input.worldY, input.moveX, input.moveY);
    } else if (code === 'KeyE') {
      M.Combat.castAbility(state, 'E', input.worldX, input.worldY, input.moveX, input.moveY);
    } else if (code === 'KeyR') {
      M.Combat.castAbility(state, 'R', input.worldX, input.worldY, input.moveX, input.moveY);
    } else if (code === 'KeyF') {
      M.Combat.placePlayerWard(state, input.worldX, input.worldY);
    } else if (code === 'KeyB') {
      M.Combat.startRecall(state);
    } else if (code >= 'Digit1' && code <= 'Digit8') {
      const idx = parseInt(code.replace('Digit', ''), 10) - 1;
      if (M.HERO_ORDER[idx]) switchHero(M.HERO_ORDER[idx]);
    }
  });

  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
    refreshMoveDir();
  });

  window.addEventListener('blur', function () {
    Object.keys(keys).forEach(function (k) { keys[k] = false; });
    input.mouseDown = false;
    refreshMoveDir();
  });

  function refreshMoveDir() {
    let mx = 0;
    let my = 0;
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    input.moveX = mx;
    input.moveY = my;
  }

  canvas.addEventListener('mousemove', function (e) {
    input.screenX = e.clientX;
    input.screenY = e.clientY;
  });

  canvas.addEventListener('mousedown', function (e) {
    M.Audio.unlock();
    if (e.button === 0) {
      input.mouseDown = true;
    }
  });

  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) input.mouseDown = false;
    cam.minimapPeek = false;
  });

  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // Minimap Click-and-Hold Camera Peek
  function setMinimapPeekFromEvent(e) {
    const rect = minimapCanvas.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    cam.peekX = rx * M.WORLD.width - cam.viewW * 0.5;
    cam.peekY = ry * M.WORLD.height - cam.viewH * 0.5;
  }

  minimapCanvas.addEventListener('mousedown', function (e) {
    cam.minimapPeek = true;
    setMinimapPeekFromEvent(e);
  });
  minimapCanvas.addEventListener('mousemove', function (e) {
    if (cam.minimapPeek) setMinimapPeekFromEvent(e);
  });

  // =========================================================
  // MAIN 60FPS GAME LOOP
  // =========================================================
  function updateCamera(dt) {
    const h = state.hero;
    if (!h) return;

    let targetX, targetY;
    if (cam.minimapPeek) {
      targetX = cam.peekX;
      targetY = cam.peekY;
    } else {
      // Subtle Battlerite/Supervive cursor-lead offset (12%)
      const leadX = (input.screenX - cam.viewW * 0.5) * 0.14;
      const leadY = (input.screenY - cam.viewH * 0.5) * 0.14;
      targetX = h.x + leadX - cam.viewW * 0.5;
      targetY = h.y + leadY - cam.viewH * 0.5;
    }

    targetX = Math.max(0, Math.min(M.WORLD.width - cam.viewW, targetX));
    targetY = Math.max(0, Math.min(M.WORLD.height - cam.viewH, targetY));

    const smooth = Math.min(1, dt * 11);
    cam.x += (targetX - cam.x) * smooth;
    cam.y += (targetY - cam.y) * smooth;

    input.worldX = cam.x + input.screenX;
    input.worldY = cam.y + input.screenY;
  }

  buildRosterUI();
  buildTalentUI();
  syncStaticHeroHUD();
  if (state.hero) {
    cam.x = Math.max(0, state.hero.x - cam.viewW * 0.5);
    cam.y = Math.max(0, state.hero.y - cam.viewH * 0.5);
  }

  let lastTs = performance.now();
  function frame(ts) {
    const rawDt = (ts - lastTs) / 1000;
    lastTs = ts;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    updateCamera(dt);
    M.Combat.update(state, dt, input);
    M.Renderer.render(ctx, minimapCtx, state, cam);
    updateLiveHUD();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})(window.MOBA);
