// Shared crowd control (DESIGN_RULES.md §4): one place that says what each CC does, for every kind of unit
// (player hero, bots, minions, camps, training dummies). Loaded before the hero kits and the engine.
//
// Timers on a unit: stunTimer, slowTimer, tauntTimer (+ tauntBy) are the older ones (ticked where they always were);
// this file adds rootTimer, silenceTimer, fearTimer (+ fearFromX/Z), knockupTimer and sleepTimer, ticked by CC.tick().
//   Stun      can't move, attack or cast
//   Knock-up  airborne and helpless (also sets stunTimer, so every "stunned" check covers it)
//   Sleep     helpless until it ends or a DIRECT hit lands (damage over time doesn't wake; CC.wake on direct hits)
//   Root      can't move; can attack and cast
//   Silence   can move and attack; can't cast
//   Fear      forced to run away from the source at CC.FEAR_SPEED of their speed; can't attack or cast
//   Taunt     forced to walk at and attack the taunter; can't cast
//   Slow      reduced move speed (CC.slow / slowMult: opts.slowPct sets the strength, default 32%)
// Apply with CC.apply(unit, opts, src): opts.stunDur / slowDur / rootDur / silenceDur / fearDur / knockupDur /
// sleepDur / tauntDur (+ slowPct); src = { x, z, unit } is the caster (fear runs from it, taunt walks at it).
(function () {
  'use strict';
  const max = (a, b) => Math.max(a || 0, b || 0);
  const CC = {
    apply(u, opts, src) {
      if (!u || !opts) return;
      if (opts.stunDur > 0) u.stunTimer = max(u.stunTimer, opts.stunDur);
      if (opts.slowDur > 0) CC.slow(u, opts.slowDur, opts.slowPct);
      if (opts.rootDur > 0) u.rootTimer = max(u.rootTimer, opts.rootDur);
      if (opts.silenceDur > 0) u.silenceTimer = max(u.silenceTimer, opts.silenceDur);
      if (opts.knockupDur > 0) {
        u.knockupTimer = max(u.knockupTimer, opts.knockupDur);
        u.knockupDur = Math.max(u.knockupTimer, u.knockupDur || 0);
        u.stunTimer = max(u.stunTimer, opts.knockupDur);
      }
      if (opts.sleepDur > 0) { u.sleepTimer = max(u.sleepTimer, opts.sleepDur); u.sleepGrace = 0.1; }
      if (opts.fearDur > 0 && src) {
        u.fearTimer = max(u.fearTimer, opts.fearDur);
        u.fearFromX = src.x; u.fearFromZ = src.z;
      }
      if (opts.tauntDur > 0 && src) {
        u.tauntTimer = max(u.tauntTimer, opts.tauntDur);
        u.tauntBy = src.unit || null;
      }
    },
    // Slow with a strength (slowPct 0.25 = 25% slower). Without one it's the old standard slow (32%; minions and camps
    // read it as their own 28%). While a slow is running the stronger strength wins; the timer is shared.
    slow(u, dur, pct) {
      if (!u || !(dur > 0)) return;
      const p = pct > 0 ? pct : 0;
      const eff = (x) => (x > 0 ? x : 0.32); // 0 = the standard slow
      u.slowPct = (u.slowTimer > 0 && eff(u.slowPct) > eff(p)) ? u.slowPct : p;
      u.slowTimer = max(u.slowTimer, dur);
    },
    // feared units stumble away slower than they walk
    FEAR_SPEED: 0.6,
    // move-speed multiplier from slows (defPct = this unit type's standard slow when none was given)
    slowMult(u, defPct = 0.32) {
      if (!u || !(u.slowTimer > 0)) return 1;
      return 1 - (u.slowPct > 0 ? u.slowPct : defPct);
    },
    // the timers this file owns (stun / slow / taunt keep ticking where they always did)
    tick(u, dt) {
      if (!u) return;
      if (u.rootTimer > 0) u.rootTimer = Math.max(0, u.rootTimer - dt);
      if (u.silenceTimer > 0) u.silenceTimer = Math.max(0, u.silenceTimer - dt);
      if (u.fearTimer > 0) u.fearTimer = Math.max(0, u.fearTimer - dt);
      if (u.knockupTimer > 0) { u.knockupTimer = Math.max(0, u.knockupTimer - dt); if (u.knockupTimer <= 0) u.knockupDur = 0; }
      if (u.sleepTimer > 0) u.sleepTimer = Math.max(0, u.sleepTimer - dt);
      if (u.sleepGrace > 0) u.sleepGrace = Math.max(0, u.sleepGrace - dt);
      if (!(u.tauntTimer > 0)) u.tauntBy = null;
    },
    // a direct hit wakes a sleeping unit (call from damage paths unless the hit is damage over time)
    wake(u, isDoT) {
      if (!u || isDoT || !(u.sleepTimer > 0) || u.sleepGrace > 0) return;
      u.sleepTimer = 0;
    },
    clear(u) {
      if (!u) return;
      u.rootTimer = u.silenceTimer = u.fearTimer = u.knockupTimer = u.knockupDur = u.sleepTimer = 0;
      u.tauntBy = null;
    },
    helpless(u) { return !!u && ((u.stunTimer || 0) > 0 || (u.sleepTimer || 0) > 0 || (u.knockupTimer || 0) > 0); },
    canMove(u) { return !CC.helpless(u) && !((u.rootTimer || 0) > 0); },
    canAttack(u) { return !CC.helpless(u) && !((u.fearTimer || 0) > 0); },
    canCast(u) { return !CC.helpless(u) && !((u.silenceTimer || 0) > 0) && !((u.fearTimer || 0) > 0) && !((u.tauntTimer || 0) > 0); },
    // forced movement direction {x, z} (unit vector) while feared or taunted (null = free to choose)
    forcedMove(u) {
      if (!u || CC.helpless(u) || (u.rootTimer || 0) > 0) return null;
      if ((u.fearTimer || 0) > 0) {
        const dx = u.x - u.fearFromX, dz = u.z - u.fearFromZ, l = Math.hypot(dx, dz) || 1;
        return { x: dx / l, z: dz / l, kind: 'fear' };
      }
      if ((u.tauntTimer || 0) > 0 && u.tauntBy) {
        const t = u.tauntBy, dx = t.x - u.x, dz = t.z - u.z, l = Math.hypot(dx, dz) || 1;
        return { x: dx / l, z: dz / l, kind: 'taunt', dist: l };
      }
      return null;
    },
    // knock-up visual: how high the unit floats right now
    lift(u) {
      if (!u || !(u.knockupTimer > 0) || !(u.knockupDur > 0)) return 0;
      const p = 1 - u.knockupTimer / u.knockupDur;
      return Math.sin(Math.PI * p) * Math.min(1.4, 0.6 + u.knockupDur * 0.8);
    },
    // which CC to show over the unit's head (highest priority first)
    kind(u) {
      if (!u) return null;
      if ((u.knockupTimer || 0) > 0) return 'knockup';
      if ((u.sleepTimer || 0) > 0) return 'sleep';
      if ((u.stunTimer || 0) > 0) return 'stun';
      if ((u.fearTimer || 0) > 0) return 'fear';
      if ((u.tauntTimer || 0) > 0) return 'taunt';
      if ((u.rootTimer || 0) > 0) return 'root';
      if ((u.silenceTimer || 0) > 0) return 'silence';
      return null;
    },
    // plate tag text for the current CCs
    tags(u) {
      if (!u) return '';
      return ((u.knockupTimer || 0) > 0 ? ' [KNOCKED UP]' : '') +
        ((u.sleepTimer || 0) > 0 ? ' [ASLEEP]' : '') +
        ((u.stunTimer || 0) > 0 && !((u.knockupTimer || 0) > 0) ? ' [STUNNED]' : '') +
        ((u.fearTimer || 0) > 0 ? ' [FEARED]' : '') +
        ((u.tauntTimer || 0) > 0 ? ' [TAUNTED]' : '') +
        ((u.rootTimer || 0) > 0 ? ' [ROOTED]' : '') +
        ((u.silenceTimer || 0) > 0 ? ' [SILENCED]' : '');
    }
  };

  // ---- Overhead CC icons (spinning stars for stun / knock-up, Zzz for sleep, symbols for the rest) ----
  const ICON_TEXT = { sleep: 'Zz', fear: '!!', taunt: '!', root: '#', silence: '...' };
  const ICON_COLOR = { sleep: '#c4b5fd', fear: '#a78bfa', taunt: '#f87171', root: '#86efac', silence: '#93c5fd' };
  const texCache = {};
  function textTexture(key) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = 'bold 72px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(15,23,42,0.85)';
    g.strokeText(ICON_TEXT[key], 64, 68);
    g.fillStyle = ICON_COLOR[key];
    g.fillText(ICON_TEXT[key], 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return (texCache[key] = t);
  }
  function starTexture() {
    if (texCache.star) return texCache.star;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + i * Math.PI / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#fde047'; g.fill();
    g.lineWidth = 4; g.strokeStyle = '#a16207'; g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return (texCache.star = t);
  }
  // Show/update the icon above a unit. parent = the unit's scene object (moves with it); height = head height.
  CC.updateIcon = function (u, parent, height, dt) {
    if (!u || !parent || typeof THREE === 'undefined') return;
    const kind = CC.kind(u);
    let ic = u._ccIcon;
    if (!kind) { if (ic) ic.grp.visible = false; return; }
    if (!ic) {
      const grp = new THREE.Group();
      const stars = [0, 1, 2].map(() => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), depthTest: false, transparent: true }));
        s.scale.setScalar(0.32);
        s.renderOrder = 999;
        grp.add(s);
        return s;
      });
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      label.scale.setScalar(0.7);
      label.renderOrder = 999;
      grp.add(label);
      ic = u._ccIcon = { grp, stars, label, t: 0, kind: null };
    }
    if (ic.grp.parent !== parent) parent.add(ic.grp);
    ic.grp.visible = true;
    ic.t += dt || 0.016;
    // parent may be scaled (e.g. a model root): keep the icon a fixed world size
    const ws = new THREE.Vector3();
    parent.getWorldScale(ws);
    const inv = 1 / Math.max(0.001, ws.y);
    ic.grp.scale.setScalar(inv);
    ic.grp.position.set(0, (height + 0.35) * inv, 0);
    const starry = kind === 'stun' || kind === 'knockup';
    ic.stars.forEach((s, i) => {
      s.visible = starry;
      const a = ic.t * 4 + (i * Math.PI * 2) / 3;
      s.position.set(Math.cos(a) * 0.38, Math.sin(ic.t * 6 + i) * 0.05, Math.sin(a) * 0.38);
    });
    ic.label.visible = !starry;
    if (!starry && ic.kind !== kind) ic.label.material.map = textTexture(kind), ic.label.material.needsUpdate = true;
    if (!starry) ic.label.position.y = Math.sin(ic.t * 3) * 0.06;
    ic.kind = kind;
  };

  window.CC = CC;
})();
