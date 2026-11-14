// Phase 1: Full 3D 4v4 MOBA Match Engine
// Lanes, Towers, Barracks (Super Minions), Ancient Cores, Marching Minion Waves,
// Jungle Camps + Central Boss (+10% All Stats), Dota-style Tree/Wall LOS Fog of War + Wards (F),
// Proximity Gold/XP, Lv 1-12 + Lv 3/6/10 Binary Talents, Fountain Recall (B) + 4-Slot Shop (P),
// 7 Rigged 3D Mixamo Bot Heroes (3 Allies + 4 Enemies), Interactive Minimap & Tactical Pings.

window.MOBA_PHASE1_ENGINE = (function () {
  const DATA = window.MOBA_PHASE1;
  const MAP = window.MOBA_MAP;

  function createEngine(ctx) {
    const {
      THREE,
      SkeletonUtils,
      scene,
      camera,
      labelLayer,
      hero,
      getActiveHeroId,
      getTemplates,
      prepareClipForModel,
      spawnFloat,
      spawnShockRing,
      SFX
    } = ctx;

    // Match State
    let matchMode = true; // true = Full 4v4 MOBA Match, false = Close Arena Sandbox
    let matchTime = 0;
    let waveTimer = 2.5; // First minion wave spawns 2.5s into match!
    let waveCount = 0;
    let teamKills = [0, 0];
    let bossBuffTimer = [0, 0]; // Team 0 / Team 1 +10% All-Stats Boss Buff remaining seconds
    let botDifficulty = 'normal'; // 'easy' | 'normal' | 'hard'
    let duelMode = null;          // balance tool (?duel, js/duel.js): { cx, cz } = arena center; no waves, no retreating
    let gameOver = null; // null | { winnerTeam: 0 | 1, title: string }

    // Player Progression, Economy, Talents, Shop, Recall & Wards
    const playerProg = {
      level: 1,
      xp: 0,
      gold: 600, // Starting gold for boots or dirk!
      kills: 0,
      deaths: 0,
      assists: 0,
      respawnTimer: 0,
      recallTimer: 0,
      wardCharges: 2,
      wardRechargeTimer: 0,
      items: [], // max 4 item objects from DATA.SHOP_ITEMS
      talents: { 3: null, 6: null, 10: null }, // 'L' | 'R'
      punchCounter: 0 // For Brawler 6R Haymaker Cleave (every 3rd punch)
    };

    // World Containers
    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    const structures = [];
    const minions = [];
    const camps = [];
    const bots = [];
    // Player-owned destructibles (e.g. the Imp's planted turret): { x, z, r, hp, maxHp, armor, team: 0, onDestroyed() }.
    // Enemy bots, minions and towers target them; damage goes through applyBotDamageToTarget like any unit.
    const deployables = [];
    // Phase 2: heroes whose bots run the real kit (brain picks ability + aim; kit casts). Others keep the old bot code.
    const KIT_BOTS = { coyote: true, brawler: true, sorceress: true, bodyguard: true, panther: true, fairy: true, scientist: true, imp: true };
    // A converted kit must actually expose the actor API (guards against a stale cached kit file freezing the game)
    function kitBotReady(type) {
      const k = KIT_BOTS[type] && window.MOBA_HEROES && window.MOBA_HEROES[type];
      return !!(k && typeof k.castFor === 'function' && typeof k.basicAttackFor === 'function' && typeof k.tickActor === 'function');
    }
    const wards = [];
    const projectiles = []; // Tower, minion, camp, and bot projectiles
    const pings = [];       // Active tactical pings on map & minimap
    let mapObstacles = [];  // LOS & collision obstacles (trees + stone pillars)

    // Reusable Materials & Geometries
    const orderMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.45, metalness: 0.35, emissive: 0x0369a1, emissiveIntensity: 0.25 });
    const chaosMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.45, metalness: 0.35, emissive: 0x881337, emissiveIntensity: 0.25 });
    const stoneBaseMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.12 });
    const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.35, metalness: 0.65 });
    const superMat = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.3, metalness: 0.7, emissive: 0xb45309, emissiveIntensity: 0.35 });

    // Helper: Create overhead HTML nameplate (compact for minions, prominent high-z-index for Heroes/Bots/Structures)
    function createPlate(cls = 'enemy', tagText = '', isMinion = false) {
      const root = document.createElement('div');
      root.className = 'plate-3d';
      root.style.zIndex = isMinion ? '2' : '15';
      if (isMinion) {
        root.style.opacity = '0.88';
        root.innerHTML =
          (tagText ? '<div class="plate-tag" style="font-size:9px;min-height:10px;">' + tagText + '</div>' : '') +
          '<div class="plate-bar" style="width:42px;height:5px;"><div class="plate-hp ' + cls + '"></div><div class="plate-sh"></div></div>';
      } else {
        const tagStyle = cls === 'enemy'
          ? 'background:rgba(15,23,42,0.88);border:1px solid rgba(244,63,94,0.65);padding:1px 5px;border-radius:3px;color:#fda4af;'
          : 'background:rgba(15,23,42,0.82);border:1px solid rgba(56,189,248,0.5);padding:1px 5px;border-radius:3px;color:#bae6fd;';
        root.innerHTML =
          '<div class="plate-tag" style="' + tagStyle + '">' + tagText + '</div>' +
          '<div class="plate-bar"><div class="plate-hp ' + cls + '"></div><div class="plate-sh"></div></div>';
      }
      labelLayer.appendChild(root);
      return root;
    }

    let minionSeq = 0;

    function projectToScreen(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        visible: v.z >= -1 && v.z <= 1 && Math.abs(v.x) <= 1.15 && Math.abs(v.y) <= 1.15
      };
    }

    // =========================================================
    // DOTA-STYLE LINE-OF-SIGHT (LOS) TREE & PILLAR OCCLUSION
    // =========================================================
    function segmentBlockedByObstacle(ax, az, bx, bz) {
      const dx = bx - ax;
      const dz = bz - az;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 0.01) return false;
      for (let i = 0; i < mapObstacles.length; i++) {
        const o = mapObstacles[i];
        if (o.noLos) continue;
        const t = THREE.MathUtils.clamp(((o.x - ax) * dx + (o.z - az) * dz) / lenSq, 0.05, 0.95);
        const cx = ax + t * dx;
        const cz = az + t * dz;
        const distSq = (cx - o.x) * (cx - o.x) + (cz - o.z) * (cz - o.z);
        const blockR = o.r * 0.92;
        if (distSq < blockR * blockR) return true;
      }
      return false;
    }

    // Check if world point (tx, tz) is visible to Team 0 (Order)
    // =========================================================
    // FOG OF WAR: darken the ground everywhere Order can't currently see.
    // Same sources and ranges as isPointVisibleToOrder(); LOS sources cast rays that stop at trees/pillars/walls.
    // Drawn into a small canvas (FOG_PX per meter) and laid over the ground as a transparent plane.
    // =========================================================
    const FOG_PX = 3, FOG_RAYS = 72, FOG_EVERY = 1 / 30; // ~30 updates/s
    const fog = (function () {
      const W = MAP.W, H = MAP.H;
      const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * FOG_PX); c.height = Math.round(H * FOG_PX); return c; };
      const out = mk(), vis = mk();
      const tex = new THREE.CanvasTexture(out);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.09;
      mesh.renderOrder = 5;
      scene.add(mesh);
      return { out, vis, octx: out.getContext('2d'), vctx: vis.getContext('2d'), tex, mesh, t: 0, W, H };
    })();
    const fogX = (x) => (x + fog.W / 2) * FOG_PX;
    const fogZ = (z) => (z + fog.H / 2) * FOG_PX;

    // distance along (dx,dz) from (sx,sz) to the first LOS blocker, capped at range
    function fogRay(sx, sz, dx, dz, range, near) {
      let best = range;
      for (let i = 0; i < near.length; i++) {
        const o = near[i];
        const ox = o.x - sx, oz = o.z - sz;
        const tc = ox * dx + oz * dz;           // closest approach along the ray
        if (tc <= 0 || tc - o.r > best) continue;
        const d2 = ox * ox + oz * oz - tc * tc;
        const rr = o.r * 0.92;
        if (d2 > rr * rr) continue;
        const tHit = tc - Math.sqrt(rr * rr - d2) + o.r * 0.6; // let the light reach a bit into the blocker
        if (tHit > 0 && tHit < best) best = tHit;
      }
      return best;
    }
    function fogSource(ctx2, sx, sz, range, los, rays = FOG_RAYS) {
      if (!los) {
        ctx2.beginPath();
        ctx2.arc(fogX(sx), fogZ(sz), range * FOG_PX, 0, Math.PI * 2);
        ctx2.fill();
        return;
      }
      const near = [];
      for (let i = 0; i < mapObstacles.length; i++) {
        const o = mapObstacles[i];
        if (o.noLos) continue;
        if (Math.abs(o.x - sx) < range + o.r && Math.abs(o.z - sz) < range + o.r) near.push(o);
      }
      ctx2.beginPath();
      for (let k = 0; k < rays; k++) {
        const a = (k / rays) * Math.PI * 2;
        const dx = Math.sin(a), dz = Math.cos(a);
        const d = fogRay(sx, sz, dx, dz, range, near);
        const px = fogX(sx + dx * d), pz = fogZ(sz + dz * d);
        if (k === 0) ctx2.moveTo(px, pz); else ctx2.lineTo(px, pz);
      }
      ctx2.closePath();
      ctx2.fill();
      ctx2.beginPath();
      ctx2.arc(fogX(sx), fogZ(sz), 3.2 * FOG_PX, 0, Math.PI * 2); // always see right around a unit
      ctx2.fill();
    }
    function updateFog(dt) {
      fog.mesh.visible = matchMode;
      if (!matchMode) return;
      fog.t -= dt;
      if (fog.t > 0) return;
      fog.t = FOG_EVERY;
      const v = fog.vctx;
      v.clearRect(0, 0, fog.vis.width, fog.vis.height);
      v.fillStyle = '#fff';
      fogSource(v, MAP.BASE.fountain.x, MAP.BASE.fountain.z, 24, false);
      if (playerProg.respawnTimer <= 0) fogSource(v, hero.x, hero.z, 17.5, true);
      bots.forEach((b) => { if (b.team === 0 && b.respawnTimer <= 0) fogSource(v, b.x, b.z, 16.0, true); });
      structures.forEach((st) => { if (st.team === 0 && st.hp > 0) fogSource(v, st.x, st.z, 14.5, false); });
      minions.forEach((m) => { if (m.team === 0 && m.hp > 0) fogSource(v, m.x, m.z, 10.5, true, 40); });
      wards.forEach((w) => fogSource(v, w.x, w.z, 16.0, true));
      if (spyglass.revealT > 0) {
        const Ho = MAP.HOLLOW;
        v.beginPath();
        v.moveTo(fogX(-Ho.halfTop), fogZ(Ho.top));
        v.lineTo(fogX(Ho.halfTop), fogZ(Ho.top));
        v.lineTo(fogX(0), fogZ(Ho.tipZ));
        v.closePath();
        v.fill();
      }
      const o = fog.octx;
      o.globalCompositeOperation = 'source-over';
      o.clearRect(0, 0, fog.out.width, fog.out.height);
      o.fillStyle = 'rgba(3, 6, 12, 0.76)';
      o.fillRect(0, 0, fog.out.width, fog.out.height);
      o.globalCompositeOperation = 'destination-out';
      o.filter = 'blur(' + (FOG_PX * 0.9).toFixed(1) + 'px)';
      o.drawImage(fog.vis, 0, 0);
      o.filter = 'none';
      o.globalCompositeOperation = 'source-over';
      fog.tex.needsUpdate = true;
    }

    function updateSpyglass(dt) {
      const sg = spyglass;
      sg.cd = Math.max(0, sg.cd - dt);
      sg.revealT = Math.max(0, sg.revealT - dt);
      const near = playerProg.respawnTimer <= 0 && Math.hypot(hero.x - sg.x, hero.z - sg.z) <= SPY_RANGE;
      if (near && sg.cd <= 0 && !ctx.isPlayerMoving()) {
        if (sg.channel === 0) spawnFloat(sg.x, 2.4, sg.z, 'SPYING...', '#fde68a');
        sg.channel += dt;
        if (sg.channel >= SPY_CHANNEL) {
          sg.channel = 0;
          sg.revealT = SPY_REVEAL;
          sg.cd = SPY_CD;
          SFX.play('chime');
          spawnFloat(MAP.HOLLOW.boss.x, 3.2, MAP.HOLLOW.boss.z, 'BOSS PIT REVEALED!', '#fde68a');
          spawnShockRing(MAP.HOLLOW.boss.x, MAP.HOLLOW.boss.z, 0xfde68a, 1.0, 9.0, 0.6);
        }
      } else if (sg.channel > 0) {
        sg.channel = 0;
      }
      // visuals: lens glows when ready, ring fills while channeling, the pit glows faintly while revealed
      const ready = sg.cd <= 0;
      sg.lens.material.color.setHex(ready ? 0x7dd3fc : 0x334155);
      sg.brass.emissive.setHex(ready && near ? 0x3b2a08 : 0x000000);
      sg.ring.visible = sg.channel > 0;
      if (sg.ring.visible) {
        const u = sg.channel / SPY_CHANNEL;
        sg.ring.scale.setScalar(0.4 + u * 0.6);
        sg.ring.material.opacity = 0.4 + u * 0.5;
      }
      sg.head.rotation.y = Math.sin(performance.now() * 0.0004) * 0.25; // idle sweep
      sg.tint.material.opacity = sg.revealT > 0 ? 0.12 * Math.min(1, sg.revealT / 0.8) : 0;
    }

    const DEV_REVEAL = /[?&]reveal/.test(location.search); // dev: no fog of war (screenshots)
    function isPointVisibleToOrder(tx, tz) {
      if (!matchMode || DEV_REVEAL) return true;
      // 1. Order Fountain / Base vision
      if (Math.hypot(tx - MAP.BASE.fountain.x, tz - MAP.BASE.fountain.z) <= 24) return true;

      // 2. Player Hero vision (17.5m unobstructed by trees/pillars)
      if (playerProg.respawnTimer <= 0) {
        const dPlayer = Math.hypot(tx - hero.x, tz - hero.z);
        if (dPlayer <= 3.2) return true;
        if (dPlayer <= 17.5 && !segmentBlockedByObstacle(hero.x, hero.z, tx, tz)) return true;
      }

      // 3. Allied Bots vision (16.0m unobstructed)
      for (let i = 0; i < bots.length; i++) {
        const b = bots[i];
        if (b.team !== 0 || b.respawnTimer > 0) continue;
        const d = Math.hypot(tx - b.x, tz - b.z);
        if (d <= 16.0 && !segmentBlockedByObstacle(b.x, b.z, tx, tz)) return true;
      }

      // 4. Allied Structures vision (14.5m)
      for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (s.team !== 0 || s.hp <= 0) continue;
        if (Math.hypot(tx - s.x, tz - s.z) <= 14.5) return true;
      }

      // 5. Allied Minions vision (10.5m unobstructed)
      for (let i = 0; i < minions.length; i++) {
        const m = minions[i];
        if (m.team !== 0 || m.hp <= 0) continue;
        const d = Math.hypot(tx - m.x, tz - m.z);
        if (d <= 10.5 && !segmentBlockedByObstacle(m.x, m.z, tx, tz)) return true;
      }

      // 6. Lookout Spyglass: the boss pit while revealed
      if (spyglass.revealT > 0 && MAP.inHollow(tx, tz)) return true;

      // 7. Allied Observer Wards vision (16.0m unobstructed!)
      for (let i = 0; i < wards.length; i++) {
        const w = wards[i];
        if (Math.hypot(tx - w.x, tz - w.z) <= 16.0 && !segmentBlockedByObstacle(w.x, w.z, tx, tz)) return true;
      }

      return false;
    }

    // Check if the Player is currently spotted by any Enemy (Team 1 Chaos) unit or structure (for Panther's P: Shadow Stalker!)
    function isPlayerSeenByChaos() {
      if ((hero.stealthTimer || 0) > 0) return false;
      if (!matchMode) return false;
      if (Math.hypot(hero.x + MAP.BASE.fountain.x, hero.z - MAP.BASE.fountain.z) <= 22) return true;
      for (let i = 0; i < bots.length; i++) {
        const b = bots[i];
        if (b.team !== 1 || b.respawnTimer > 0) continue;
        const d = Math.hypot(hero.x - b.x, hero.z - b.z);
        if (d <= 15.0 && !segmentBlockedByObstacle(b.x, b.z, hero.x, hero.z)) return true;
      }
      for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (s.team !== 1 || s.hp <= 0) continue;
        if (Math.hypot(hero.x - s.x, hero.z - s.z) <= 13.5) return true;
      }
      for (let i = 0; i < minions.length; i++) {
        const m = minions[i];
        if (m.team !== 1 || m.hp <= 0) continue;
        const d = Math.hypot(hero.x - m.x, hero.z - m.z);
        if (d <= 9.5 && !segmentBlockedByObstacle(m.x, m.z, hero.x, hero.z)) return true;
      }
      return false;
    }

    // =========================================================
    // BUILD 3D MOBA MAP, LANES, FOUNTAINS, TREES & STRUCTURES
    // =========================================================
    const recallRingMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 3.2, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    recallRingMesh.visible = false;
    scene.add(recallRingMesh);

    // Lookout Spyglass on the bridge deck: stand still at it for SPY_CHANNEL s to reveal the boss pit for SPY_REVEAL s.
    // Code-built stand-in (brass tube on a tripod); swap for a real prop later.
    const SPY_CHANNEL = 1.5, SPY_REVEAL = 6.0, SPY_CD = 30.0, SPY_RANGE = 1.7;
    const spyglass = (function () {
      const D = MAP.DECK;
      const x = 0, z = D.backZ + 1.4;
      const g = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x5b3d24, roughness: 0.85 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xc8a14a, metalness: 0.75, roughness: 0.35, emissive: 0x000000 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.35, 6), wood);
        leg.position.set(Math.sin(a) * 0.28, 0.62, Math.cos(a) * 0.28);
        leg.rotation.set(Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38);
        leg.castShadow = true;
        g.add(leg);
      }
      const head = new THREE.Group();
      head.position.y = 1.32;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.1, 14), brass);
      tube.rotation.x = Math.PI / 2;
      tube.castShadow = true;
      head.add(tube);
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10), brass);
      eye.rotation.x = Math.PI / 2;
      eye.position.z = -0.62;
      head.add(eye);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
      lens.position.z = 0.56;
      head.add(lens);
      head.rotation.x = 0.12; // aimed south, out over the valley, tipped down a touch
      g.add(head);
      g.position.set(x, 0, z);
      scene.add(g);
      // channel ring (fills up while spying)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xfde68a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.06, z);
      ring.visible = false;
      scene.add(ring);
      // reveal marker over the hollow
      const H = MAP.HOLLOW;
      const sh = new THREE.Shape();
      sh.moveTo(-H.halfTop, -H.top);
      sh.lineTo(H.halfTop, -H.top);
      sh.lineTo(0, -H.tipZ);
      sh.closePath();
      const tint = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      tint.rotation.x = -Math.PI / 2; // shape y -> world -z, so the shape was built with z negated
      tint.position.y = 0.07;
      scene.add(tint);
      return { x, z, g, head, brass, lens, ring, tint, channel: 0, revealT: 0, cd: 0 };
    })();

    const bossAuraPlayer = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.08, 36),
      new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
    );
    bossAuraPlayer.rotation.x = -Math.PI / 2;
    bossAuraPlayer.position.y = 0.05;
    bossAuraPlayer.visible = false;
    scene.add(bossAuraPlayer);

    function buildLaneRibbon(waypoints, colorHex, width = 5.2) {
      const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.94, metalness: 0.04 });
      for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(width, len + 1.8), mat);
        seg.rotation.x = -Math.PI / 2;
        seg.rotation.z = -Math.atan2(dx, dz);
        seg.position.set((a.x + b.x) * 0.5, 0.015, (a.z + b.z) * 0.5);
        seg.receiveShadow = true;
        mapGroup.add(seg);
      }
    }

    // Map structure models (assets/map/map_bundle.js, parsed in boot.js into window.MOBA_MAP_TEMPLATES).
    // Uniformly scales a template so its footprint is `diameter` wide, centered, base on the ground.
    const MAP_MODEL_FIT = {
      tower: { pad: 0.5 },   // footprint = 2r + pad (r = collision radius)
      ancient: { pad: 0.6 }
    };
    function fitMapModel(tmpl, diameter) {
      const obj = tmpl.clone(true);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const k = diameter / Math.max(size.x, size.z);
      obj.scale.setScalar(k);
      const c = box.getCenter(new THREE.Vector3());
      obj.position.set(-c.x * k, -box.min.y * k, -c.z * k);
      obj.traverse((ch) => { if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; } });
      const holder = new THREE.Group();
      holder.add(obj);
      holder.userData.height = size.y * k;
      return holder;
    }

    // ---- Jungle models (assets/map/jungle_bundle.js -> window.MOBA_JUNGLE_TEMPLATES, parsed in boot.js) ----
    // Hunyuan exports differ in which axis is up and which way they face: rotX stands a model up, yaw turns it to face
    // local +z (the direction the engine points units). height = world height of the fitted model.
    const JUNGLE_FIT = {
      tree:  { height: 4.8, rotX: 0, yaw: 0 },
      golem: { height: 2.5, rotX: 0, yaw: 0 },
      boar:  { height: 1.35, rotX: 0, yaw: 0 },
      wolf:  { height: 1.3, rotX: 0, yaw: -Math.PI / 2 },   // modeled facing +x
      wisp:  { height: 1.15, rotX: 0, yaw: 0, hover: 0.75 }
    };
    const CAMP_MODEL = { north: 'boar', mid: 'golem', south: 'wolf', wisp: 'wisp' }; // camp key -> model (boss: later)
    const treeHolders = [];  // { o (obstacle), grp } so trees can swap to the real model when it finishes loading

    function fitJungleModel(id, scale) {
      const tmpl = window.MOBA_JUNGLE_TEMPLATES && window.MOBA_JUNGLE_TEMPLATES[id];
      const fit = JUNGLE_FIT[id];
      if (!tmpl || !fit) return null;
      const inner = tmpl.clone(true);
      const turn = new THREE.Group();
      inner.rotation.set(fit.rotX || 0, 0, fit.rotZ || 0);
      turn.add(inner);
      turn.rotation.y = fit.yaw;
      const holder = new THREE.Group();
      holder.add(turn);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      const k = (fit.height * (scale || 1)) / Math.max(0.001, size.y);
      const c = box.getCenter(new THREE.Vector3());
      turn.position.set(-c.x, -box.min.y, -c.z);
      const outer = new THREE.Group();
      outer.add(holder);
      holder.scale.setScalar(k);
      holder.position.y = fit.hover || 0;
      inner.traverse((ch) => { if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; } });
      outer.userData.fit = fit;
      outer.userData.body = holder; // animated part (bob, lunge)
      return outer;
    }

    // Swap trees and camp monsters to their models (called at map build and again when the bundle finishes loading)
    function applyJungleModels() {
      if (!window.MOBA_JUNGLE_TEMPLATES) return;
      treeHolders.forEach((t) => {
        if (t.grp.userData.modeled) return;
        const m = fitJungleModel('tree', t.o.scale || 1);
        if (!m) return;
        while (t.grp.children.length) t.grp.remove(t.grp.children[0]);
        m.rotation.y = ((t.o.x * 12.9898 + t.o.z * 78.233) % 6.283); // stable per-tree turn so the forest isn't uniform
        t.grp.add(m);
        t.grp.userData.modeled = true;
      });
      camps.forEach((c) => {
        const id = CAMP_MODEL[c.key];
        if (!id || !c.mobGrp || c.rig) return;
        // the golem gets its Mixamo rig once golem_bundle.js is parsed (replacing the static model if that came first)
        const rig = id === 'golem' ? createGolemRig() : null;
        if (!rig && c.model) return;
        const m = rig ? rig.holder : fitJungleModel(id, 1);
        if (!m) return;
        [c.body, c.head, c.model].forEach((p) => { if (p) c.mobGrp.remove(p); });
        c.mobGrp.add(m);
        c.model = m;
        if (rig) c.rig = rig;
      });
    }

    // Moss golem rig (window.MOBA_GOLEM_TEMPLATE from boot.js): skinned clone + its own mixer; clips prepared once.
    let golemClips = null;
    function createGolemRig() {
      const T = window.MOBA_GOLEM_TEMPLATE;
      if (!T || !T.fbx) return null;
      const model = SkeletonUtils.clone(T.fbx);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const sz = box.getSize(new THREE.Vector3());
      model.scale.multiplyScalar(JUNGLE_FIT.golem.height / Math.max(0.01, sz.y));
      model.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(model);
      const ctr = box2.getCenter(new THREE.Vector3());
      model.position.set(-ctr.x, -box2.min.y, -ctr.z);
      const mat = new THREE.MeshStandardMaterial({ map: T.tex, roughness: 0.85, metalness: 0.05 });
      model.traverse((ch) => { if (ch.isMesh) { ch.material = mat; ch.castShadow = true; ch.receiveShadow = true; ch.frustumCulled = false; } });
      if (!golemClips) {
        golemClips = {};
        [['idle', 'idle'], ['walk', 'run'], ['punch', 'punch'], ['swipe', 'punch'], ['roar', 'punch'], ['death', 'punch']].forEach(([name, as]) => {
          if (!T.clips[name]) return;
          const prep = prepareClipForModel(T.clips[name], model, as, {});
          if (prep.tracks.length) golemClips[name] = prep;
        });
      }
      const mixer = new THREE.AnimationMixer(model);
      const acts = {};
      Object.keys(golemClips).forEach((n) => { acts[n] = mixer.clipAction(golemClips[n]); });
      ['punch', 'swipe', 'roar', 'death'].forEach((n) => { if (acts[n]) { acts[n].setLoop(THREE.LoopOnce); acts[n].clampWhenFinished = true; } });
      if (acts.idle) acts.idle.play();
      const holder = new THREE.Group();
      holder.add(model);
      holder.userData.fit = JUNGLE_FIT.golem;
      holder.userData.body = holder;
      return { holder, model, mixer, acts, active: acts.idle || null, swingN: 0 };
    }
    function playGolemAct(rig, name, fade, speed) {
      const next = rig.acts[name];
      if (!next) return;
      if (rig.active === next && next.loop === THREE.LoopRepeat) return;
      next.reset();
      next.setEffectiveTimeScale(speed || 1);
      next.play();
      if (rig.active && rig.active !== next) rig.active.crossFadeTo(next, fade, false);
      rig.active = next;
    }

    // Code-driven motion for the unrigged camp monsters: breathing at rest, a trot bob while moving, a lunge on attack
    function animateCampModel(c, dt, moved) {
      const m = c.model;
      if (!m) return;
      if (c.rig) {
        // rigged camp monster: walk while moving, a swing right after each attack (alternating punch / swipe), idle otherwise
        const rig = c.rig;
        const swung = c.atkCd > (c._prevAtkCd || 0) + 0.5; // the attack timer just reset = it swung this frame
        c._prevAtkCd = c.atkCd;
        if (swung) {
          rig.swingN++;
          // fit the whole swing inside the attack rhythm, and stay planted for all of it (no sliding mid-swing)
          const name = rig.swingN % 2 ? 'punch' : 'swipe';
          const act = rig.acts[name];
          const dur = act ? act.getClip().duration : 0.9;
          const speed = Math.max(1, dur / 0.95);
          playGolemAct(rig, name, 0.1, speed);
          c.swingLock = dur / speed;
        } else if (!(rig.active && rig.active.loop === THREE.LoopOnce && rig.active.isRunning())) {
          playGolemAct(rig, moved ? 'walk' : 'idle', 0.2, moved ? 1.3 : 1);
        }
        rig.mixer.update(dt);
        return;
      }
      const body = m.userData.body, fit = m.userData.fit;
      c.animT = (c.animT || 0) + dt;
      const t = c.animT;
      const lungeU = c.atkCd > 0.9 ? (1.15 - c.atkCd) / 0.25 : 1; // 0..1 over the first 0.25s after a swing
      const lunge = lungeU < 1 ? Math.sin(lungeU * Math.PI) : 0;
      if (fit.hover) {
        // wisps float and slowly turn about their own axis
        body.position.y = fit.hover + Math.sin(t * 2.2) * 0.14;
        body.rotation.y = Math.sin(t * 0.7) * 0.35;
        body.position.z = lunge * 0.5;
        return;
      }
      const trot = moved ? Math.abs(Math.sin(t * 11)) : 0;
      body.position.y = trot * 0.09;
      body.position.z = lunge * 0.45;
      body.rotation.x = lunge * 0.18 + (moved ? 0.05 : 0);
      body.rotation.z = moved ? Math.sin(t * 11) * 0.04 : 0;
      body.scale.y = body.scale.x * (1 + (moved ? 0 : Math.sin(t * 2.4) * 0.015));
    }

    function buildStructureMesh(s) {
      const grp = new THREE.Group();
      const tMat = s.team === 0 ? orderMat : chaosMat;
      const teamHex = s.team === 0 ? 0x38bdf8 : 0xf43f5e;
      const mapTmpl = window.MOBA_MAP_TEMPLATES || {};
      if (s.kind === 'tower' && mapTmpl.tower) {
        const model = fitMapModel(mapTmpl.tower, s.r * 2 + MAP_MODEL_FIT.tower.pad);
        grp.add(model);
        // Team marker floating over the empty top platform (stand-in until the ballista prop exists)
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: s.team === 0 ? 0x38bdf8 : 0xfb7185 }));
        crystal.position.y = model.userData.height + 0.75;
        grp.add(crystal);
        s.crystal = crystal;

        const rRing = new THREE.Mesh(
          new THREE.RingGeometry(s.range - 0.08, s.range, 48),
          new THREE.MeshBasicMaterial({ color: teamHex, side: THREE.DoubleSide, transparent: true, opacity: 0.16 })
        );
        rRing.rotation.x = -Math.PI / 2;
        rRing.position.y = 0.03;
        grp.add(rRing);
      } else if (s.kind === 'ancient' && mapTmpl.hearth) {
        const model = fitMapModel(mapTmpl.hearth, s.r * 2 + MAP_MODEL_FIT.ancient.pad);
        grp.add(model);
        // Eternal flame in the team color, sitting in the hearth bowl
        const flame = new THREE.Group();
        const flameTop = model.userData.height * 0.86;
        [[1.15, 2.2, 0.85], [0.8, 2.9, 0.6], [0.45, 3.4, 0.9]].forEach(([rad, h, op], i) => {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(rad, h, 12, 1, true),
            new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffffff : teamHex, transparent: true, opacity: op * 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
          );
          cone.position.y = h * 0.5;
          flame.add(cone);
        });
        flame.position.y = flameTop;
        grp.add(flame);
        const light = new THREE.PointLight(teamHex, 18, 14, 2);
        light.position.y = flameTop + 1.2;
        grp.add(light);
        s.flame = flame;
        s.flameLight = light;
      } else if (s.kind === 'tower') {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 2.2, 8), stoneBaseMat);
        base.position.y = 1.1;
        base.castShadow = true;
        base.receiveShadow = true;
        grp.add(base);

        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 2.4, 8), tMat);
        pillar.position.y = 3.1;
        pillar.castShadow = true;
        grp.add(pillar);

        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: s.team === 0 ? 0x38bdf8 : 0xfb7185 }));
        crystal.position.y = 5.0;
        grp.add(crystal);
        s.crystal = crystal;

        // Tower range ring on ground
        const rRing = new THREE.Mesh(
          new THREE.RingGeometry(s.range - 0.08, s.range, 48),
          new THREE.MeshBasicMaterial({ color: s.team === 0 ? 0x38bdf8 : 0xf43f5e, side: THREE.DoubleSide, transparent: true, opacity: 0.16 })
        );
        rRing.rotation.x = -Math.PI / 2;
        rRing.position.y = 0.03;
        grp.add(rRing);
      } else if (s.kind === 'barracks') {
        // Gatehouse: the targetable flank tower of a castle gate
        const body = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r * 1.08, 5.0, 14), stoneBaseMat);
        body.position.y = 2.5;
        body.castShadow = true;
        body.receiveShadow = true;
        grp.add(body);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(s.r * 1.35, s.r * 1.7, 14), tMat);
        roof.position.y = 5.0 + s.r * 0.85;
        roof.castShadow = true;
        grp.add(roof);
      } else if (s.kind === 'ancient') {
        const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.2, 12), stoneBaseMat);
        dais.position.y = 0.6;
        dais.castShadow = true;
        grp.add(dais);

        const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 1), tMat);
        core.position.y = 3.1;
        core.castShadow = true;
        grp.add(core);
        s.crystal = core;

        const halo = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.1, 10, 32), goldTrimMat);
        halo.position.y = 3.1;
        halo.rotation.x = Math.PI / 2;
        grp.add(halo);
        s.halo = halo;
      }
      // Golden Invulnerability Force-Shield Ring (shown while outer structures in the lane are still standing!)
      const invulnRing = new THREE.Mesh(
        new THREE.RingGeometry(s.r + 0.35, s.r + 0.62, 40),
        new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
      );
      invulnRing.rotation.x = -Math.PI / 2;
      invulnRing.position.y = 0.08;
      invulnRing.visible = s.tier > 1;
      grp.add(invulnRing);
      s.invulnRing = invulnRing;

      grp.position.set(s.x, 0, s.z);
      mapGroup.add(grp);
      s.mesh = grp;
      s.shootCd = 0;
      s.plate = createPlate(s.team === 0 ? '' : 'enemy', s.name);
    }

    // Sequential MOBA Lane Structure Vulnerability Rule:
    // T1 is always vulnerable; T2 requires lane T1 dead; Barracks requires lane T2 dead; Ancient requires >=1 Barracks dead!
    // Where a lane unit (bot or minion) walks when it has nothing to fight: the next lane waypoint, and once it's through
    // the last one (just inside the enemy gate) on to the enemy Hearth, so pushes don't stall in a huddle inside the gate.
    // first waypoint a bot heads for out of its base (the one just past its own gate)
    function laneStartIdx(team, lane) {
      const wps = DATA.LANE_WAYPOINTS[lane];
      if (!wps) return 1;
      return team === 0 ? 1 : wps.length - 2;
    }
    function laneGoal(u) {
      const wps = DATA.LANE_WAYPOINTS[u.lane];
      if (!u.laneDone) {
        const wp = wps[u.wpIdx] || wps[3];
        if (Math.hypot(wp.x - u.x, wp.z - u.z) > 3.2) return { x: wp.x, z: wp.z, done: false };
        const last = u.team === 0 ? wps.length - 1 : 0;
        if (u.wpIdx === last) u.laneDone = true;
        else {
          u.wpIdx += u.team === 0 ? 1 : -1;
          return { x: wps[u.wpIdx].x, z: wps[u.wpIdx].z, done: false };
        }
      }
      const core = MAP.BASE.core;
      return { x: u.team === 0 ? -core.x : core.x, z: core.z, done: true };
    }

    function isStructureVulnerable(s) {
      if (!s || s.hp <= 0) return false;
      if (s.tier === 1) return true;
      if (s.tier === 2) {
        const t1 = structures.find((o) => o.team === s.team && o.lane === s.lane && o.tier === 1);
        return !t1 || t1.hp <= 0;
      }
      if (s.tier === 3) {
        const t2 = structures.find((o) => o.team === s.team && o.lane === s.lane && o.tier === 2);
        return !t2 || t2.hp <= 0;
      }
      if (s.tier === 4) {
        const anyRaxDown = structures.some((o) => o.team === s.team && o.kind === 'barracks' && o.hp <= 0);
        return anyRaxDown;
      }
      return true;
    }

    function buildCampMesh(c) {
      const grp = new THREE.Group();
      c.homeX = c.x;
      c.homeZ = c.z;
      c.leashR = c.isBoss ? 10.5 : 9.2;

      // Pit Floor Circle (stays anchored at homeX, homeZ)
      const pit = new THREE.Mesh(
        new THREE.CircleGeometry(c.isBoss ? 4.2 : 2.3, 28),
        new THREE.MeshStandardMaterial({ color: c.isBoss ? 0x292116 : 0x243022, roughness: 0.95 })
      );
      pit.rotation.x = -Math.PI / 2;
      pit.position.y = 0.02;
      grp.add(pit);

      // Leash Territory Ring (glows when camp is aggroed so player sees the exact leash boundary!)
      const leashRing = new THREE.Mesh(
        new THREE.RingGeometry(c.leashR - 0.10, c.leashR, 48),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.28 })
      );
      leashRing.rotation.x = -Math.PI / 2;
      leashRing.position.y = 0.03;
      leashRing.visible = false;
      grp.add(leashRing);
      c.leashRing = leashRing;

      const mobGrp = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: c.isBoss ? 0xd97706 : 0x7c2d12,
        roughness: 0.55,
        metalness: c.isBoss ? 0.35 : 0.1
      });
      const sc = c.isBoss ? 1.85 : 1.0;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * sc, 0.68 * sc, 1.45 * sc, 9), bodyMat);
      body.position.y = 0.75 * sc;
      body.castShadow = true;
      mobGrp.add(body);

      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 * sc, 0), goldTrimMat);
      head.position.y = 1.68 * sc;
      head.castShadow = true;
      mobGrp.add(head);

      if (c.isBoss) {
        const crown = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.09, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
        crown.position.y = 3.6;
        crown.rotation.x = Math.PI / 2;
        mobGrp.add(crown);
      }

      grp.add(mobGrp);
      grp.position.set(c.homeX, 0, c.homeZ);
      mapGroup.add(grp);

      c.mesh = grp;
      c.mobGrp = mobGrp;
      c.body = body;
      c.head = head;
      c.origMat = bodyMat;
      c.hp = c.maxHp;
      c.respawnTimer = 0;
      c.atkCd = 0;
      c.hitFlash = 0;
      c.r = c.isBoss ? 1.35 : 0.75;
      c.spd = c.isBoss ? 4.85 : 5.35;
      c.atkRange = c.isBoss ? 2.55 : 1.85;
      c.state = 'idle'; // 'idle' | 'aggro' | 'leashing'
      c.aggroTarget = null;
      c.patience = 5.0;
      c.plate = createPlate('enemy', c.name);
    }

    // Castle walls & gates, bridge railings and the behemoth hollow's cliffs (code-built; see MAP_DESIGN.md)
    function buildCastleWorks() {
      const sandMat = new THREE.MeshStandardMaterial({ color: 0xb79d74, roughness: 0.9 });
      const greyMat = new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 0.92 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x9a4a32, roughness: 0.85 });
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x5b3b22, roughness: 0.9 });
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c5448, roughness: 0.97, flatShading: true });
      const mossMat = new THREE.MeshStandardMaterial({ color: 0x3e5a2c, roughness: 0.95, flatShading: true });
      const WALL_H = 3.4, WALL_D = 1.5;

      const addBox = (mat, w, h, d, x, y, z, rotY = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.rotation.y = rotY;
        m.castShadow = true;
        m.receiveShadow = true;
        mapGroup.add(m);
        return m;
      };
      const addTower = (x, z, r, h, team, withBanner) => {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 14), sandMat);
        body.position.set(x, h / 2, z);
        body.castShadow = true;
        body.receiveShadow = true;
        mapGroup.add(body);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.5, 14), greyMat);
        band.position.set(x, h - 0.25, z);
        mapGroup.add(band);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.3, r * 1.6, 14), roofMat);
        roof.position.set(x, h + r * 0.8, z);
        roof.castShadow = true;
        mapGroup.add(roof);
        if (withBanner) {
          const banner = new THREE.Mesh(
            new THREE.PlaneGeometry(1.1, 2.2),
            new THREE.MeshStandardMaterial({ color: team === 0 ? 0x2b7fd6 : 0xc8324a, roughness: 0.8, side: THREE.DoubleSide })
          );
          banner.position.set(x, h - 1.6, z);
          banner.lookAt(0, h - 1.6, z); // face the map center
          banner.position.x += Math.sign(-x) * (r + 0.05);
          mapGroup.add(banner);
        }
      };

      // Merlons along castle wall tops (one instanced mesh)
      const merlonGeo = new THREE.BoxGeometry(0.9, 0.7, WALL_D * 1.05);
      const merlonSpots = [];
      MAP.WALLS.forEach((w) => {
        const dx = w.x1 - w.x0, dz = w.z1 - w.z0;
        const len = Math.hypot(dx, dz);
        const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
        const rotY = Math.atan2(dx, dz) + Math.PI / 2;
        if (w.kind === 'castle') {
          addBox(sandMat, len + WALL_D, WALL_H, WALL_D, cx, WALL_H / 2, cz, rotY);
          addBox(greyMat, len + WALL_D + 0.1, 0.6, WALL_D + 0.12, cx, 0.3, cz, rotY);
          const n = Math.floor(len / 1.8);
          for (let i = 0; i <= n; i++) {
            const t = n === 0 ? 0.5 : i / n;
            merlonSpots.push({ x: w.x0 + dx * t, z: w.z0 + dz * t, rotY });
          }
        } else if (w.kind === 'rail') {
          addBox(greyMat, len, 1.0, 0.6, cx, 0.5, cz, rotY);
          // posts every ~6 m
          const n = Math.floor(len / 6);
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            addBox(sandMat, 0.9, 1.4, 0.9, w.x0 + dx * t, 0.7, w.z0 + dz * t);
          }
        } else if (w.kind === 'lanewall') {
          // Low stone wall along the top lane's south side; ends next to a jungle break crumble into rubble
          const LW_H = 1.9, LW_D = 0.9, CR = 3.2; // height, depth, crumble length
          const ux = dx / len, uz = dz / len;
          const s0 = w.crumble0 ? CR : 0, s1 = w.crumble1 ? CR : 0;
          const solid = len - s0 - s1;
          if (solid > 0.1) {
            const mx = w.x0 + ux * (s0 + solid / 2), mz = w.z0 + uz * (s0 + solid / 2);
            addBox(sandMat, solid, LW_H, LW_D, mx, LW_H / 2, mz, rotY);
            addBox(greyMat, solid + 0.1, 0.25, LW_D + 0.15, mx, LW_H + 0.1, mz, rotY);
            addBox(greyMat, solid + 0.1, 0.5, LW_D + 0.12, mx, 0.25, mz, rotY);
          }
          // crumbled end: stepped, jagged blocks getting lower toward the gap, then loose rubble on the ground
          const crumble = (fromEnd) => {
            const steps = 5;
            for (let k = 0; k < steps; k++) {
              const u = (k + 0.5) / steps;                // 0 at the solid wall -> 1 at the gap
              const along = fromEnd ? len - s1 + u * CR : s0 - u * CR;
              const h = LW_H * (1 - u * 0.85) * (0.8 + ((k * 7) % 3) * 0.12);
              const px = w.x0 + ux * along, pz = w.z0 + uz * along;
              addBox(k % 2 ? greyMat : sandMat, CR / steps + 0.05, h, LW_D * (1 - u * 0.25), px, h / 2, pz, rotY + (k % 2 ? 0.06 : -0.05));
            }
            for (let k = 0; k < 6; k++) {
              const along = fromEnd ? len + 0.2 + k * 0.45 : -0.2 - k * 0.45;
              const side = ((k * 5) % 3 - 1) * 0.6;
              const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + ((k * 3) % 4) * 0.07, 0), k % 2 ? rockMat : greyMat);
              rb.position.set(w.x0 + ux * along - uz * side, 0.15, w.z0 + uz * along + ux * side);
              rb.rotation.set(k * 0.9, k * 1.7, k * 0.3);
              rb.castShadow = true;
              mapGroup.add(rb);
            }
          };
          if (w.crumble0) crumble(false);
          if (w.crumble1) crumble(true);
        } else if (w.kind === 'cliff') {
          addBox(rockMat, len + 1.2, 2.6, 1.8, cx, 1.3, cz, rotY);
          // irregular boulders along the cliff so it reads as rock, not a wall
          const n = Math.floor(len / 2.2);
          for (let i = 0; i <= n; i++) {
            const t = i / Math.max(1, n);
            const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0 + ((i * 37) % 7) * 0.12, 0), i % 3 === 0 ? mossMat : rockMat);
            b.position.set(w.x0 + dx * t + Math.sin(i * 2.3) * 0.5, 1.6 + ((i * 13) % 5) * 0.25, w.z0 + dz * t + Math.cos(i * 1.7) * 0.5);
            b.rotation.set(i * 0.7, i * 1.3, i * 0.4);
            b.castShadow = true;
            mapGroup.add(b);
          }
        }
      });
      const merlons = new THREE.InstancedMesh(merlonGeo, sandMat, merlonSpots.length);
      const mtx = new THREE.Matrix4();
      merlonSpots.forEach((p, i) => {
        mtx.makeRotationY(p.rotY);
        mtx.setPosition(p.x, WALL_H + 0.35, p.z);
        merlons.setMatrixAt(i, mtx);
      });
      merlons.castShadow = true;
      mapGroup.add(merlons);

      // Corner towers and gate towers (gatehouse structures add their own targetable tower on one flank)
      [0, 1].forEach((team) => {
        const s = team === 0 ? -1 : 1;
        const C = MAP.CASTLE;
        [[C.x0, C.z0], [C.x1, C.z0], [C.x0, C.z1], [C.x1, C.z1]].forEach(([ax, z]) => addTower(s * ax, z, 2.3, 5.4, team, false));
        // Upper gate: flank on the south side (north flank is the gatehouse structure), plus an arch
        const gz = MAP.UPPER_GATE_Z, gh = MAP.GATE_HALF;
        addTower(s * C.x0, gz + gh + 1.2, 1.7, 4.8, team, true);
        addBox(sandMat, WALL_D + 0.4, 1.1, gh * 2 + 1.4, s * C.x0, 4.2, gz);
        // Side gate: flank on the east/west (inner) side, plus an arch
        const gx = MAP.SIDE_GATE_X;
        addTower(s * (gx - gh - 1.2), C.z1, 1.7, 4.8, team, true);
        addBox(sandMat, gh * 2 + 1.4, 1.1, WALL_D + 0.4, s * gx, 4.2, C.z1);
      });
    }

    function build3DMap() {
      // Clear any previous map children
      while (mapGroup.children.length > 0) {
        mapGroup.remove(mapGroup.children[0]);
      }
      structures.forEach((s) => s.plate && s.plate.remove());
      structures.length = 0;
      camps.forEach((c) => c.plate && c.plate.remove());
      camps.length = 0;
      minions.forEach((m) => { mapGroup.remove(m.mesh); m.plate && m.plate.remove(); if (m.rig) releaseMinionRig(m.rig); });
      minions.length = 0;
      dyingMinions.forEach((dm) => { mapGroup.remove(dm.mesh); releaseMinionRig(dm.rig); });
      dyingMinions.length = 0;

      // 1. Lanes, jungle paths, castle courtyards and the hollow are painted into the ground texture (arena/core.js).
      //    Here: fountains, castle walls & gates, bridge railings, hollow cliffs.
      [[0, 0x38bdf8], [1, 0xf43f5e]].forEach(([team, col]) => {
        const f = MAP.teamPoint(team, MAP.BASE.fountain);
        const pad = new THREE.Mesh(
          new THREE.CylinderGeometry(5.2, 5.6, 0.28, 32),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.3 })
        );
        pad.position.set(f.x, 0.14, f.z);
        pad.receiveShadow = true;
        mapGroup.add(pad);

        const glow = new THREE.Mesh(
          new THREE.RingGeometry(4.4, 5.1, 40),
          new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(f.x, 0.30, f.z);
        mapGroup.add(glow);
      });
      buildCastleWorks();

      // 2. LOS-Blocking Jungle Trees & Stone Pillars
      mapObstacles = DATA.buildMapObstacles();
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.9 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e4628, roughness: 0.8 });
      mapObstacles.forEach((o) => {
        if (o.kind === 'wall') return; // drawn by buildCastleWorks
        if (o.kind === 'pillar') {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.85, o.r, 3.4, 9), stoneBaseMat);
          m.position.set(o.x, 1.7, o.z);
          m.castShadow = true;
          m.receiveShadow = true;
          mapGroup.add(m);
        } else {
          const s = o.scale || 1.0;
          const tGrp = new THREE.Group();
          const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * s, 0.38 * s, 1.8 * s, 7), trunkMat);
          tr.position.y = 0.9 * s;
          tr.castShadow = true;
          tGrp.add(tr);
          const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.35 * s, 2.5 * s, 8), leafMat);
          c1.position.y = 2.4 * s;
          c1.castShadow = true;
          tGrp.add(c1);
          const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 2.0 * s, 8), leafMat);
          c2.position.y = 3.6 * s;
          c2.castShadow = true;
          tGrp.add(c2);
          tGrp.position.set(o.x, 0, o.z);
          mapGroup.add(tGrp);
          treeHolders.push({ o, grp: tGrp });
        }
      });

      // 3. Structures (Towers, Barracks, Ancient Cores)
      DATA.buildInitialStructures().forEach((s) => {
        structures.push(s);
        buildStructureMesh(s);
      });

      // 4. Neutral Jungle Camps & Central Boss Pit
      DATA.buildJungleCamps().forEach((c) => {
        camps.push(c);
        buildCampMesh(c);
      });
      applyJungleModels(); // (if the jungle bundle already loaded; otherwise notifyJungleModelsReady does it)
    }

    // =========================================================
    // SPAWN 7 RIGGED 3D BOT HEROES (3 ALLIES + 4 ENEMIES = 4v4)
    // Always 1 Coyote, 1 Sorceress, 1 Brawler, and 1 Bodyguard per team!
    // =========================================================
    const HERO_LABELS = {
      coyote: 'Coyote',
      sorceress: 'Sorceress',
      brawler: 'Brawler',
      bodyguard: 'Bodyguard',
      panther: 'Panther',
      fairy: 'Fairy',
      scientist: 'Scientist',
      imp: 'Imp'
    };

    function buildBotRoster(playerHeroId) {
      const allFive = ['brawler', 'panther', 'coyote', 'sorceress', 'bodyguard'];
      const allyTypes = allFive.filter((h) => h !== playerHeroId);

      // Assign role-authentic Allied Bots (Solo -> Jungle -> Support/Carry Duo)
      const soloType = allyTypes.find((h) => h === 'brawler' || h === 'bodyguard') || allyTypes[0];
      const rem1 = allyTypes.filter((h) => h !== soloType);
      const jgType = rem1.find((h) => h === 'panther' || h === 'brawler' || h === 'coyote') || rem1[0];
      const rem2 = rem1.filter((h) => h !== jgType);
      const duoType = rem2.find((h) => h === 'bodyguard' || h === 'sorceress' || h === 'coyote') || rem2[0];
      // Dev: ?chaoscarry=coyote swaps the enemy carry (to test bots on the real kits)
      const cc = /[?&]chaoscarry=([a-z]+)/.exec(location.search);
      const chaosCarry = cc && HERO_LABELS[cc[1]] ? cc[1] : 'sorceress';

      // Dev overrides: ?allysolo= / allyjg= / allysupp= / chaossolo= / chaosjg= / chaoscarry= / chaossupp= <heroId>
      const ov = (key, def) => {
        const m = new RegExp('[?&]' + key + '=([a-z]+)').exec(location.search);
        return m && HERO_LABELS[m[1]] ? m[1] : def;
      };
      const oSolo = ov('allysolo', soloType), oJg = ov('allyjg', jgType), oSupp = ov('allysupp', duoType);
      const cSolo = ov('chaossolo', 'brawler'), cJg = ov('chaosjg', 'panther'), cSupp = ov('chaossupp', 'bodyguard');
      return [
        // Team 0 (Order — 3 Allied Bots + Player = 4v4!)
        { id: 'bot_o_solo', team: 0, name: 'Ally ' + HERO_LABELS[oSolo] + ' (Solo)', heroType: oSolo, lane: 'top', role: 'Solo', homeX: MAP.BASE.botHomes[0].x, homeZ: MAP.BASE.botHomes[0].z },
        { id: 'bot_o_jg',   team: 0, name: 'Ally ' + HERO_LABELS[oJg] + ' (Jungle)', heroType: oJg, lane: 'jungle', role: 'Jungle', homeX: MAP.BASE.botHomes[1].x, homeZ: MAP.BASE.botHomes[1].z },
        { id: 'bot_o_supp', team: 0, name: 'Ally ' + HERO_LABELS[oSupp] + ' (Duo)', heroType: oSupp, lane: 'bot', role: 'Support', homeX: MAP.BASE.botHomes[2].x, homeZ: MAP.BASE.botHomes[2].z },

        // Team 1 (Chaos — 4 Enemy Bots)
        { id: 'bot_c_solo',  team: 1, name: 'Chaos ' + HERO_LABELS[cSolo] + ' (Solo)', heroType: cSolo, lane: 'top', role: 'Solo', homeX: -MAP.BASE.botHomes[0].x, homeZ: MAP.BASE.botHomes[0].z },
        { id: 'bot_c_jg',    team: 1, name: 'Chaos ' + HERO_LABELS[cJg] + ' (Jungle)', heroType: cJg, lane: 'jungle', role: 'Jungle', homeX: -MAP.BASE.botHomes[1].x, homeZ: MAP.BASE.botHomes[1].z },
        { id: 'bot_c_carry', team: 1, name: 'Chaos ' + HERO_LABELS[chaosCarry] + ' (Carry)', heroType: chaosCarry, lane: 'bot', role: 'Carry', homeX: -MAP.BASE.botHomes[2].x, homeZ: MAP.BASE.botHomes[2].z },
        { id: 'bot_c_supp',  team: 1, name: 'Chaos ' + HERO_LABELS[cSupp] + ' (Supp)', heroType: cSupp, lane: 'bot', role: 'Support', homeX: -MAP.BASE.botHomes[3].x, homeZ: MAP.BASE.botHomes[3].z }
      ];
    }

    function createWandMeshGroup() {
      const grp = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.032, 0.78, 8),
        new THREE.MeshStandardMaterial({ color: 0x3b0764, roughness: 0.35, metalness: 0.65 })
      );
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = 0.28;
      grp.add(shaft);

      const ferrule = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.038, 0.12, 8),
        goldTrimMat
      );
      ferrule.rotation.x = Math.PI / 2;
      ferrule.position.z = 0.58;
      grp.add(ferrule);

      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.13, 0),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      star.position.z = 0.72;
      grp.add(star);

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.14, 0.19, 20),
        new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide })
      );
      halo.position.z = 0.72;
      grp.add(halo);
      return grp;
    }

    function attachRigToBot(bot) {
      const templates = getTemplates();
      const tmpl = templates[bot.heroType] || (bot.heroType === 'coyote' || bot.heroType === 'sorceress' ? templates.coyote : templates.brawler);
      if (!tmpl || !tmpl.fbx) return;

      if (bot.rigLoaded) {
        if (bot.heroType === 'coyote' && !bot.bowPivot && templates.crossbowScene) {
          const bowClone = templates.crossbowScene.clone(true);
          const bowPivot = new THREE.Group();
          bowClone.rotation.y = -Math.PI / 2;
          bowClone.position.set(0, -0.14, 0.24);
          bowPivot.scale.setScalar(0.86);
          bowPivot.add(bowClone);
          scene.add(bowPivot);
          bot.bowPivot = bowPivot;
        }
        return;
      }

      const cloned = SkeletonUtils.clone(tmpl.fbx);
      const spec = DATA.HERO_SPECS && DATA.HERO_SPECS[bot.heroType];
      const targetH = spec ? spec.height : (bot.heroType === 'coyote' ? 1.96 : 2.22);
      cloned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cloned);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      const sc = targetH / Math.max(0.01, sz.y);
      cloned.scale.multiplyScalar(sc);
      if (bot.heroType === 'bodyguard') {
        cloned.scale.x *= 1.15;
        cloned.scale.z *= 1.15;
      }
      cloned.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(cloned);
      const ctr = new THREE.Vector3();
      box2.getCenter(ctr);
      cloned.position.set(-ctr.x, -box2.min.y, -ctr.z);

      let rh = null, lh = null;
      const meshes = [];
      const bones = {}; // canonical Mixamo name -> bone (kits use it for procedural motion on bots)
      cloned.traverse((ch) => {
        if (ch.name) {
          const cn = canonicalMixamoBone(ch.name);
          if (cn && (ch.isBone || !bones[cn])) bones[cn] = ch;
          const c = ch.name.replace(/^.*?(mixamorig\d*:?|:)/i, '');
          if (c === 'RightHand' && (ch.isBone || !rh)) rh = ch;
          if (c === 'LeftHand' && (ch.isBone || !lh)) lh = ch;
        }
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
          ch.frustumCulled = false;
          ch.material = new THREE.MeshStandardMaterial({
            map: tmpl.tex,
            color: bot.team === 0 ? 0xffffff : 0xffdada,
            roughness: 0.78,
            metalness: 0.12
          });
          if (tmpl.normalTex) {
            ch.material.normalMap = tmpl.normalTex;
            ch.material.normalScale.set(0.8, 0.8);
          }
          meshes.push(ch);
        }
      });

      bot.placeholder.visible = false;
      bot.pivot.add(cloned);
      bot.model = cloned;
      bot.meshes = meshes;
      bot.baseModelPos = cloned.position.clone();
      bot.rightHand = rh;
      bot.leftHand = lh;
      bot.bones = bones;
      bot.mixer = new THREE.AnimationMixer(cloned);
      bot.actions = {};
      // the bot's own kit tweaks (pose overlays, hip clamps), not whatever hero the player is on
      const botKitTw = (window.MOBA_HEROES && window.MOBA_HEROES[bot.heroType] && window.MOBA_HEROES[bot.heroType].clipTweaks) || {};
      ['idle', 'run', 'punch', 'kick', 'jump', 'slide', 'crawl', 'idleFree', 'runFree'].forEach((slot) => {
        if (tmpl.clips[slot]) {
          const prep = prepareClipForModel(tmpl.clips[slot], cloned, slot, botKitTw, tmpl.clips);
          if (prep.tracks.length > 0) {
            bot.actions[slot] = bot.mixer.clipAction(prep);
          }
        }
      });
      if (bot.actions.idle) {
        bot.actions.idle.play();
        bot.activeAction = bot.actions.idle;
      }

      // Attach 3D Crossbow prop to Coyote bots, or 3D Magician's Wand to Sorceress bots!
      if (bot.heroType === 'coyote' && templates.crossbowScene) {
        const bowClone = templates.crossbowScene.clone(true);
        const bowPivot = new THREE.Group();
        bowClone.rotation.y = -Math.PI / 2;
        bowClone.position.set(0, -0.14, 0.24);
        bowPivot.scale.setScalar(0.86);
        bowPivot.add(bowClone);
        scene.add(bowPivot);
        bot.bowPivot = bowPivot;
      } else if (bot.heroType === 'sorceress' && !window.SORCERESS_MIXAMO) {
        const wandPivot = createWandMeshGroup();
        scene.add(wandPivot);
        bot.bowPivot = wandPivot;
      }

      bot.rigLoaded = true;
    }

    function applyBotSpecStats(bot, heroType) {
      const isRanged = heroType === 'coyote' || heroType === 'sorceress' || heroType === 'fairy' || heroType === 'imp'; // (Imp: while carrying; his kit swaps range by form)
      bot.heroType = heroType;
      // same stat calculation as the player (spec + level + the bot's items, if any)
      const st = computeUnitStats(heroType, bot.level || 1, bot.items);
      bot.unitStats = st;
      bot.maxHp = st.maxHp;
      bot.hp = Math.min(bot.hp || bot.maxHp, bot.maxHp);
      bot.resist = st.resist;
      bot.armor = st.resist;   // (legacy alias)
      bot.fResist = st.resist; // (legacy alias)
      bot.hpRegen = st.hpRegen;
      bot.physAtk = st.atk;
      bot.fant = st.fant;
      bot.atk = heroType === 'sorceress' ? Math.round(bot.physAtk * 0.40 + bot.fant * 0.55) : bot.physAtk;
      bot.dmgType = heroType === 'sorceress' ? 'fantasy' : 'physical';
      bot.range = isRanged ? 8.2 : (heroType === 'panther' ? 2.15 : 1.95);
      bot.spd = DATA.HERO_SPECS[heroType].baseSpd * 0.97 * (1 + st.spdPct);
    }

    function spawnBots() {
      bots.forEach((b) => {
        const ck = window.MOBA_HEROES && window.MOBA_HEROES[b.heroType];
        if (ck && ck.botCleanup) ck.botCleanup(b); // kit leftovers (an Imp's turret / scrap)
        mapGroup.remove(b.pivot);
        if (b.bowPivot) scene.remove(b.bowPivot);
        if (b.plate) b.plate.remove();
      });
      bots.length = 0;

      const roster = buildBotRoster(getActiveHeroId());
      roster.forEach((cfg) => {
        const pivot = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.62, 0.75, 32),
          new THREE.MeshBasicMaterial({ color: cfg.team === 0 ? 0x38bdf8 : 0xf43f5e, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        pivot.add(ring);

        // Fallback capsule until FBX template finishes parsing
        const ph = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.45, 1.8, 12),
          cfg.team === 0 ? orderMat : chaosMat
        );
        ph.position.y = 0.9;
        pivot.add(ph);

        pivot.position.set(cfg.homeX, 0, cfg.homeZ);
        mapGroup.add(pivot);

        const bot = {
          ...cfg,
          x: cfg.homeX,
          z: cfg.homeZ,
          r: cfg.heroType === 'bodyguard' ? 0.62 : 0.52,
          facing: cfg.team === 0 ? Math.PI / 2 : -Math.PI / 2,
          level: 1,
          xp: 0,
          gold: 500,
          hp: 1500,
          maxHp: 1500,
          resist: 22,
          bonusResAura: 0,
          atk: 55,
          dmgType: 'physical',
          range: 2.0,
          spd: 5.9,
          atkCd: 0,
          skillCd: 3.0,
          cdQ: 1.5,
          cdE: 2.5,
          cdR: 5.0,
          qTempoStacks: 0,
          qTempoTimer: 0,
          siphonBonus: 0,
          siphonTimer: 0,
          stealthTimer: 0,
          arenaTimer: 0,
          monoTimer: 0,
          monoTick: 0,
          basicCombo: 0,
          atkAnimTimer: 0,
          animSlot: 'punch',
          animTimeScale: 1.0,
          animStartTime: 0,
          animForceRestart: false,
          leapTimer: 0,
          leapDur: 0.42,
          leapSx: cfg.homeX,
          leapSz: cfg.homeZ,
          leapTx: cfg.homeX,
          leapTz: cfg.homeZ,
          leapOnLand: null,
          dashTimer: 0,
          dashVx: 0,
          dashVz: 0,
          respawnTimer: 0,
          bleedStacks: 0,
          bleedTimer: 0,
          slowTimer: 0,
          stunTimer: 0,
          tauntTimer: 0,
          knockbackVx: 0,
          knockbackVz: 0,
          knockbackTimer: 0,
          knockbackWallStun: false,
          lastDamagedByPlayerAt: -99,
          wpIdx: laneStartIdx(cfg.team, cfg.lane),
          campIdx: 0,
          pivot,
          groundRing: ring,
          placeholder: ph,
          rigLoaded: false,
          mixer: null,
          actions: {},
          activeAction: null,
          plate: createPlate(cfg.team === 0 ? '' : 'enemy', cfg.name)
        };
        applyBotSpecStats(bot, cfg.heroType);
        bot.hp = bot.maxHp;
        bots.push(bot);
        attachRigToBot(bot);
      });
    }

    // Keep Order Team with 4 distinct heroes when the player switches heroes (1/2/3/4/5)
    function syncAlliedBotsToPlayerHero() {
      const playerHero = getActiveHeroId();
      const allFive = ['brawler', 'panther', 'coyote', 'sorceress', 'bodyguard'];
      const usedByOrder = new Set([playerHero]);
      const allyBots = bots.filter((b) => b.team === 0);
      allyBots.forEach((b) => {
        if (!usedByOrder.has(b.heroType)) {
          usedByOrder.add(b.heroType);
        }
      });
      allyBots.forEach((b) => {
        if (b.heroType === playerHero) {
          const replacement = allFive.find((h) => !usedByOrder.has(h)) || 'brawler';
          usedByOrder.add(replacement);
          if (b.model) b.pivot.remove(b.model);
          if (b.bowPivot) { scene.remove(b.bowPivot); b.bowPivot = null; }
          b.rigLoaded = false;
          b.name = 'Ally ' + HERO_LABELS[replacement] + ' (' + b.role + ')';
          applyBotSpecStats(b, replacement);
          attachRigToBot(b);
        }
      });
    }

    // =========================================================
    // SPAWN MARCHING 3D MINION WAVES (MELEE, RANGED & SUPER!)
    // =========================================================
    // ---- Armor minion rigs (assets/map/minion_bundle.js -> window.MOBA_MINION_TEMPLATES) ----
    // Team glow: texels painted pure magenta in the concept become the team color and glow (emissive).
    const minionMats = {};
    function minionMaterial(type, team, tex) {
      const key = type + team;
      if (minionMats[key]) return minionMats[key];
      const col = new THREE.Color(team === 0 ? 0x38bdf8 : 0xf43f5e);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.35 });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.teamGlow = { value: col };
        shader.fragmentShader = 'uniform vec3 teamGlow;\n' + shader.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            float glowMask = smoothstep(0.18, 0.42, min(diffuseColor.r, diffuseColor.b) - diffuseColor.g);
            diffuseColor.rgb = mix(diffuseColor.rgb, teamGlow, glowMask);`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance += teamGlow * glowMask * 1.6;`);
      };
      minionMats[key] = mat;
      return mat;
    }
    // Clips are prepared once per minion kind and shared by every mixer (clones keep the template's bone names).
    const minionClipCache = {};
    const minionRigPool = {};     // key kind+team -> [rig]
    const minionPoolHolder = new THREE.Group();
    minionPoolHolder.position.y = -60; // parked out of sight (still compiled by renderer.compile)
    scene.add(minionPoolHolder);
    function minionClipsFor(kind, model, tmpl) {
      if (minionClipCache[kind]) return minionClipCache[kind];
      const attackSlot = kind === 'ranged' ? 'ranged' : 'melee';
      const out = {};
      [['idle', 'idle', 'idle'], ['walk', 'run', 'walk'], [attackSlot, 'punch', 'attack'], ['death', 'punch', 'death']].forEach(([slot, as, name]) => {
        const src = tmpl.clips[slot];
        if (!src) return;
        const prep = prepareClipForModel(src, model, as, {});
        if (prep.tracks.length) out[name] = prep;
      });
      minionClipCache[kind] = out;
      return out;
    }
    function createMinionRig(kind, team) {
      const T = window.MOBA_MINION_TEMPLATES;
      const type = kind === 'super' ? 'super' : 'minion';
      const tmpl = T && T[type];
      if (!tmpl || !tmpl.fbx) return null;
      const model = SkeletonUtils.clone(tmpl.fbx);
      const targetH = kind === 'super' ? 2.25 : (kind === 'ranged' ? 1.3 : 1.45);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const sz = box.getSize(new THREE.Vector3());
      model.scale.multiplyScalar(targetH / Math.max(0.01, sz.y));
      model.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(model);
      const c = box2.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box2.min.y, -c.z);
      const mat = minionMaterial(type, team, tmpl.tex);
      model.traverse((ch) => {
        if (ch.isMesh) {
          ch.material = mat;
          ch.castShadow = true;
          ch.frustumCulled = false;
        }
      });
      const mixer = new THREE.AnimationMixer(model);
      const clips = minionClipsFor(kind, model, tmpl);
      const acts = {};
      Object.keys(clips).forEach((name) => { acts[name] = mixer.clipAction(clips[name]); });
      if (acts.attack) { acts.attack.setLoop(THREE.LoopOnce); acts.attack.clampWhenFinished = true; }
      if (acts.death) { acts.death.setLoop(THREE.LoopOnce); acts.death.clampWhenFinished = true; }
      return { model, mixer, acts, active: null, poolKey: kind + team, basePos: model.position.clone() };
    }
    function buildMinionRig(kind, team) {
      const pool = minionRigPool[kind + team];
      const rig = (pool && pool.length) ? pool.pop() : createMinionRig(kind, team);
      if (!rig) return null;
      rig.mixer.stopAllAction();
      rig.model.position.copy(rig.basePos);
      rig.active = rig.acts.walk || rig.acts.idle || null;
      if (rig.active) rig.active.reset().play();
      return rig;
    }
    function releaseMinionRig(rig) {
      if (!rig) return;
      rig.mixer.stopAllAction();
      rig.model.position.copy(rig.basePos);
      minionPoolHolder.add(rig.model);
      (minionRigPool[rig.poolKey] = minionRigPool[rig.poolKey] || []).push(rig);
    }
    // Build a starting pool behind the loading screen (also lets renderer.compile warm the glow shader)
    function prewarmMinionRigs() {
      if (!window.MOBA_MINION_TEMPLATES) return;
      [[0, 'melee', 14], [1, 'melee', 14], [0, 'ranged', 10], [1, 'ranged', 10], [0, 'super', 3], [1, 'super', 3]].forEach(([team, kind, n]) => {
        for (let i = 0; i < n; i++) {
          const rig = createMinionRig(kind, team);
          if (rig) releaseMinionRig(rig);
        }
      });
    }

    function playMinionAct(m, name, fade = 0.15) {
      const rig = m.rig;
      const next = rig && rig.acts[name];
      if (!next || rig.active === next) return;
      next.reset().play();
      if (rig.active) rig.active.crossFadeTo(next, fade, false);
      rig.active = next;
    }
    const dyingMinions = [];
    // Corpses (minions, rigged camp monsters): stay down CORPSE_TIME seconds, fading out over the last CORPSE_FADE
    const CORPSE_TIME = 5.0, CORPSE_FADE = 1.2;
    // Fade a rig's meshes. sharedMat: the material is shared (minions), so the fading body gets its own copy and the
    // shared one is put back at full opacity.
    function setRigOpacity(model, a, sharedMat) {
      model.traverse((ch) => {
        if (!ch.isMesh) return;
        if (a >= 1) {
          if (ch.userData.fadeMat) { ch.material = ch.userData.baseMat; }
          else if (ch.material.transparent) { ch.material.transparent = false; ch.material.opacity = 1; ch.material.depthWrite = true; ch.material.needsUpdate = true; }
          return;
        }
        if (sharedMat) {
          if (!ch.userData.fadeMat) {
            const base = ch.material;
            const f = base.clone();
            f.onBeforeCompile = base.onBeforeCompile; // keep the team-glow shader patch
            f.customProgramCacheKey = base.customProgramCacheKey;
            f.transparent = true;
            ch.userData.baseMat = base;
            ch.userData.fadeMat = f;
          }
          ch.material = ch.userData.fadeMat;
        } else if (!ch.material.transparent) {
          ch.material.transparent = true;
          ch.material.needsUpdate = true;
        }
        ch.material.opacity = Math.max(0, a);
        ch.material.depthWrite = a > 0.6;
      });
    }

    function spawnMinionWave() {
      waveCount++;
      ['top', 'bot'].forEach((lane) => {
        [0, 1].forEach((team) => {
          const enemyTeam = 1 - team;
          const enemyRax = structures.find((s) => s.team === enemyTeam && s.lane === lane && s.kind === 'barracks');
          const spawnSuper = enemyRax && enemyRax.hp <= 0;

          const wps = DATA.LANE_WAYPOINTS[lane];
          // Spawn right on the lane-facing front of the Barracks (wpIdx 1 is just ahead) so minions never get wedged behind the Barracks!
          const startWp = team === 0 ? wps[0] : wps[wps.length - 1];
          const dir = team === 0 ? 1 : -1;

          // 2-Rank Phalanx Formation: 3 Melee in Front Rank (-1.65m, 0m, +1.65m), 2 Ranged in Back Rank (-0.95m, +0.95m), +1 Super Vanguard
          const slots = [
            { kind: 'melee',  rankBack: 0.0,  formZ: -1.65 },
            { kind: 'melee',  rankBack: 0.0,  formZ:  0.00 },
            { kind: 'melee',  rankBack: 0.0,  formZ:  1.65 },
            { kind: 'ranged', rankBack: 2.1,  formZ: -0.95 },
            { kind: 'ranged', rankBack: 2.1,  formZ:  0.95 }
          ];
          if (spawnSuper) slots.push({ kind: 'super', rankBack: -1.2, formZ: 0.0 });

          slots.forEach((slot) => {
            const kind = slot.kind;
            const grp = new THREE.Group();
            const isSuper = kind === 'super';
            const isRanged = kind === 'ranged';
            const sc = isSuper ? 1.48 : (isRanged ? 0.78 : 0.92);
            const mat = isSuper ? superMat : (team === 0 ? orderMat : chaosMat);

            // Team-colored ground ring so Order vs Chaos minions and their spacing are immediately readable
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(0.36 * sc, 0.46 * sc, 18),
              new THREE.MeshBasicMaterial({
                color: isSuper ? 0xfde047 : (team === 0 ? 0x38bdf8 : 0xf43f5e),
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.55
              })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.025;
            grp.add(ring);

            const rig = buildMinionRig(kind, team);
            if (rig) {
              grp.add(rig.model);
            } else {
              const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * sc, 0.38 * sc, 1.05 * sc, 8), mat);
              body.position.y = 0.55 * sc;
              body.castShadow = true;
              grp.add(body);

              const head = new THREE.Mesh(
                isRanged ? new THREE.OctahedronGeometry(0.26 * sc, 0) : new THREE.SphereGeometry(0.24 * sc, 8, 8),
                goldTrimMat
              );
              head.position.y = 1.22 * sc;
              grp.add(head);
            }

            const ox = startWp.x - dir * slot.rankBack;
            const oz = startWp.z + slot.formZ;
            grp.position.set(ox, 0, oz);
            mapGroup.add(grp);

            const maxHp = isSuper ? 1250 : (isRanged ? 380 : 560);
            minions.push({
              id: 'min_' + (++minionSeq),
              team,
              lane,
              kind,
              x: ox,
              z: oz,
              formZ: slot.formZ,
              r: 0.42 * sc,
              hp: maxHp,
              maxHp,
              resist: isSuper ? 26 : (isRanged ? 6 : 11),
              atk: isSuper ? 48 : (isRanged ? 24 : 18),
              range: isRanged ? 6.2 : 1.75,
              spd: 4.5,
              atkCd: Math.random() * 0.4,
              bleedStacks: 0,
              bleedTimer: 0,
              tauntTimer: 0,
              knockbackVx: 0,
              knockbackVz: 0,
              knockbackTimer: 0,
              knockbackWallStun: false,
              lastDamagedByPlayerAt: -99,
              wpIdx: team === 0 ? 1 : wps.length - 2,
              mesh: grp,
              rig,
              plate: createPlate(team === 0 ? '' : 'enemy', isSuper ? 'SUPER MINION' : '', true)
            });
          });
        });
      });
    }

    // =========================================================
    // PURE PROXIMITY GOLD & XP (WITH 2V2 SUPPORT TRIBUTE!)
    // =========================================================
    function grantProximityReward(deadTeam, x, z, baseGold, baseXp) {
      const rewardTeam = 1 - deadTeam;
      if (rewardTeam === 0) {
        // Player receives full proximity Gold & XP within 16m (or global assist share if on map!)
        const dPlayer = Math.hypot(hero.x - x, hero.z - z);
        if (playerProg.respawnTimer <= 0 && dPlayer <= 16.5) {
          // Support Tribute: Even if Allied Duo Partner Bot is right next to you in 2v2 Bot Lane, you get 100% unstarved Gold & XP!
          addPlayerGoldAndXp(baseGold, baseXp, x, z);
        }
        bots.forEach((b) => {
          if (b.team === 0 && b.respawnTimer <= 0 && Math.hypot(b.x - x, b.z - z) <= 16.5) {
            b.gold += baseGold;
            b.xp += baseXp;
            checkBotLevelUp(b);
          }
        });
      } else {
        bots.forEach((b) => {
          if (b.team === 1 && b.respawnTimer <= 0 && Math.hypot(b.x - x, b.z - z) <= 16.5) {
            b.gold += baseGold;
            b.xp += baseXp;
            checkBotLevelUp(b);
          }
        });
      }
    }

    function addPlayerGoldAndXp(goldAmt, xpAmt, fx, fz) {
      playerProg.gold += Math.round(goldAmt);
      playerProg.xp += Math.round(xpAmt);
      if (goldAmt >= 25) {
        spawnFloat(fx, 2.1, fz, '+' + Math.round(goldAmt) + 'g', '#fde047');
      }
      while (playerProg.level < 12 && playerProg.xp >= DATA.LEVEL_XP[playerProg.level + 1]) {
        playerProg.level++;
        const st = getPlayerStats();
        hero.maxHp = st.maxHp;
        hero.maxMp = st.maxMp;
        hero.hp = Math.min(hero.maxHp, hero.hp + 180);
        hero.mp = Math.min(hero.maxMp, (hero.mp || 0) + 95);
        SFX.play('chime');
        spawnShockRing(hero.x, hero.z, 0xfde047, 0.3, 2.2, 0.4);
        spawnFloat(hero.x, 2.9, hero.z, 'LEVEL UP! LV ' + playerProg.level, '#fde047');
        if (playerProg.level === 4) {
          spawnFloat(hero.x, 3.3, hero.z, 'ULTIMATE (R) UNLOCKED!', '#f59e0b');
        } else if (playerProg.level === 6 || playerProg.level === 9) {
          spawnFloat(hero.x, 3.3, hero.z, 'Q & E UPGRADED (RANK ' + (playerProg.level >= 9 ? 3 : 2) + ')!', '#38bdf8');
        } else if (playerProg.level === 8 || playerProg.level === 12) {
          spawnFloat(hero.x, 3.3, hero.z, 'ULTIMATE UPGRADED (RANK ' + (playerProg.level >= 12 ? 3 : 2) + ')!', '#f59e0b');
        }
        refreshTalentModalUI();
      }
      refreshShopAndHudUI();
    }

    function checkBotLevelUp(b) {
      while (b.level < 12 && b.xp >= DATA.LEVEL_XP[b.level + 1]) {
        const prevMax = b.maxHp;
        b.level++;
        applyBotSpecStats(b, b.heroType);
        b.hp = Math.min(b.maxHp, b.hp + (b.maxHp - prevMax) + 90);
      }
    }

    // Compute Shirtless Bodyguard Passive ("Stand Behind Me!"): +14 Resist per Ally-Enemy threat line screened
    function computeBodyguardStacks() {
      const heroId = getActiveHeroId();
      bots.forEach((b) => { b.bonusResAura = 0; });
      if (heroId !== 'bodyguard' || playerProg.respawnTimer > 0) {
        hero.guardStacks = 0;
        return 0;
      }
      if (hero.peakPhysiqueTimer > 0) {
        hero.guardStacks = 6;
        return 6;
      }
      let stacks = 0;
      const allies = bots.filter((b) => b.team === 0 && b.respawnTimer <= 0);
      const enemies = bots.filter((b) => b.team === 1 && b.respawnTimer <= 0);
      allies.forEach((al) => {
        let protectedAlly = false;
        enemies.forEach((en) => {
          if (Math.hypot(en.x - al.x, en.z - al.z) > 19.0) return;
          const sx = en.x - al.x;
          const sz = en.z - al.z;
          const lenSq = sx * sx + sz * sz;
          if (lenSq < 0.1) return;
          const t = ((hero.x - al.x) * sx + (hero.z - al.z) * sz) / lenSq;
          if (t > 0.08 && t < 0.94) {
            const px = al.x + t * sx;
            const pz = al.z + t * sz;
            if (Math.hypot(hero.x - px, hero.z - pz) <= 2.9) {
              stacks++;
              protectedAlly = true;
            }
          }
        });
        if (protectedAlly && playerProg.talents[3] === 'R') {
          al.bonusResAura = Math.min(6, stacks) * 7;
        }
      });
      hero.guardStacks = Math.min(6, stacks);
      return hero.guardStacks;
    }

    // Compute Player Total Stats (Base + Level + 4-Slot Items + Boss +10% All-Stats Buff + Talents + Passives!)
    // One stat calculation for every hero unit (player, bots, the test tools): spec + level + items.
    // Live-match effects (passives, talents, boss buff) are layered on top by getPlayerStats for the player.
    // Stat model (DESIGN_RULES.md §2): Attack, Ability, one Resist, Haste (cooldown = base x 100/(100+Haste)),
    // Lifesteal (from Attack damage) + Spell Vamp (from Ability damage), base HP/Mana regen.
    // Legacy names stay as aliases until every kit is converted: atk = attack, fant = ability,
    // armor = fResist = resist, cdr = the cooldown reduction Haste works out to.
    function computeUnitStats(heroId, level, items) {
      const spec = (DATA.HERO_SPECS && DATA.HERO_SPECS[heroId]) || DATA.HERO_SPECS.coyote;
      const lvBonus = (level || 1) - 1;
      // old specs list armor + fantasy resist separately: one Resist = their average until the hero is converted
      const baseRes = spec.baseResist !== undefined ? spec.baseResist : ((spec.baseArmor || 0) + (spec.baseFResist || 0)) / 2;
      const resGrow = spec.resistGrow !== undefined ? spec.resistGrow : ((spec.armorGrow || 0) + (spec.fResistGrow || 0)) / 2;
      const o = {
        attack: Math.round((spec.baseAttack !== undefined ? spec.baseAttack : spec.baseAtk) + lvBonus * (spec.attackGrow !== undefined ? spec.attackGrow : spec.atkGrow)),
        ability: Math.round((spec.baseAbility !== undefined ? spec.baseAbility : (spec.baseFant || 0)) + lvBonus * (spec.abilityGrow !== undefined ? spec.abilityGrow : (spec.fantGrow || 0))),
        maxHp: Math.round(spec.baseHp + lvBonus * spec.hpGrow),
        maxMp: Math.round(spec.baseMp + lvBonus * spec.mpGrow),
        mpRegen: spec.mpRegen + lvBonus * 0.45,
        hpRegen: (spec.hpRegen !== undefined ? spec.hpRegen : 6.1) + lvBonus * 0.6,
        resist: Math.round(baseRes + lvBonus * resGrow),
        asPct: lvBonus * (spec.asGrow !== undefined ? spec.asGrow : (heroId === 'coyote' ? 0.038 : 0.03)),
        haste: 0, spdPct: 0, lifesteal: 0, spellVamp: 0, slowOnHit: 0, cleaveProc: 0, executeAmp: 0, spellAmp: 0, allyAuraRes: 0
      };
      (items || []).forEach((it) => {
        const st = it.stats || {};
        ['attack', 'ability', 'resist', 'haste', 'maxHp', 'maxMp', 'mpRegen', 'hpRegen', 'asPct', 'spdPct', 'lifesteal', 'spellVamp', 'cleaveProc', 'spellAmp', 'allyAuraRes']
          .forEach((k) => { if (st[k]) o[k] += st[k]; });
        if (st.slowOnHit) o.slowOnHit = Math.max(o.slowOnHit, st.slowOnHit);
        if (st.executeAmp) o.executeAmp = Math.max(o.executeAmp, st.executeAmp);
      });
      return withStatAliases(o);
    }
    // legacy names for kits/UI that still read the old stats (removed once every kit is converted)
    function withStatAliases(o) {
      o.atk = o.attack;
      o.fant = o.ability;
      o.armor = o.resist;
      o.fResist = o.resist;
      o.cdr = 1 - 100 / (100 + Math.max(0, o.haste));
      return o;
    }
    // damage after Resist (one Resist reduces both Attack and Ability damage)
    function unitResist(u) {
      if (!u) return 0;
      if (u.resist !== undefined) return u.resist;
      return u.armor || 0;
    }

    function getPlayerStats() {
      const heroId = getActiveHeroId();
      const base = computeUnitStats(heroId, playerProg.level, playerProg.items);
      let { attack, ability, maxHp, maxMp, mpRegen, hpRegen, resist, haste, asPct, spdPct, lifesteal, spellVamp, slowOnHit, cleaveProc, executeAmp, spellAmp, allyAuraRes } = base;

      // Bodyguard Passive ("Stand Behind Me!"): +14 Resist per stack
      const guardStacks = computeBodyguardStacks();
      if (heroId === 'bodyguard' && guardStacks > 0) {
        resist += guardStacks * 14;
      }

      // Coyote 3L Talent: Bloodhound Stride (+4% MS per active Bleed stack on nearby enemies)
      if (heroId === 'coyote' && playerProg.talents[3] === 'L') {
        let nearBleeds = 0;
        bots.forEach((b) => { if (b.team === 1 && b.bleedStacks > 0 && Math.hypot(b.x - hero.x, b.z - hero.z) <= 14) nearBleeds += b.bleedStacks; });
        camps.forEach((c) => { if (c.bleedStacks > 0 && Math.hypot(c.x - hero.x, c.z - hero.z) <= 14) nearBleeds += c.bleedStacks; });
        spdPct += Math.min(0.20, nearBleeds * 0.04);
      }

      // Panther Passive ("Shadow Stalker"): +28% Move Speed (+38% with 3L Duskwalker) while Unseen by enemies (or lingering for 2.2s/3.5s after being spotted!)
      let pantherUnseen = false;
      if (heroId === 'panther' && playerProg.respawnTimer <= 0) {
        if (!isPlayerSeenByChaos()) {
          hero.unseenLingerTimer = playerProg.talents[3] === 'L' ? 3.5 : 2.2;
        }
        if ((hero.stealthTimer || 0) > 0 || (hero.unseenLingerTimer || 0) > 0) {
          pantherUnseen = true;
          spdPct += (playerProg.talents[3] === 'L' ? 0.38 : 0.28);
        }
      }

      // Central Boss +10% All-Stats Buff!
      if (bossBuffTimer[0] > 0) {
        attack = Math.round(attack * 1.10);
        ability = Math.round(ability * 1.10);
        maxHp = Math.round(maxHp * 1.10);
        maxMp = Math.round(maxMp * 1.10);
        resist = Math.round(resist * 1.10);
        spdPct += 0.10;
      }

      const maxBleed = (heroId === 'coyote' && playerProg.talents[7] === 'R') ? 5 : 4;
      const qeRank = playerProg.level >= 9 ? 3 : (playerProg.level >= 6 ? 2 : 1);
      const ultRank = playerProg.level >= 12 ? 3 : (playerProg.level >= 8 ? 2 : (playerProg.level >= 4 ? 1 : 0));
      return withStatAliases({
        attack, ability, maxHp, maxMp, mpRegen, hpRegen, resist, haste,
        asPct, spdPct, lifesteal, spellVamp, slowOnHit, cleaveProc,
        executeAmp, spellAmp, allyAuraRes, maxBleed, guardStacks, pantherUnseen, qeRank, ultRank
      });
    }

    // =========================================================
    // UNIFIED TARGET QUERY & DAMAGE ROUTING FOR PLAYER KIT
    // =========================================================
    function getHostileTargets() {
      const list = [];
      if (!matchMode) return list;
      bots.forEach((b) => {
        if (b.team === 1 && b.respawnTimer <= 0) list.push({ kind: 'bot', ref: b, x: b.x, z: b.z, r: b.r });
      });
      minions.forEach((m) => {
        if (m.team === 1 && m.hp > 0) list.push({ kind: 'minion', ref: m, x: m.x, z: m.z, r: m.r });
      });
      camps.forEach((c) => {
        if (c.respawnTimer <= 0 && c.hp > 0) list.push({ kind: 'camp', ref: c, x: c.x, z: c.z, r: c.r });
      });
      structures.forEach((s) => {
        if (s.team === 1 && s.hp > 0) list.push({ kind: 'structure', ref: s, x: s.x, z: s.z, r: s.r });
      });
      // Chaos deployables (an enemy Imp's turret)
      deployables.forEach((d) => { if (d.hp > 0 && d.team === 1) list.push({ kind: 'deployable', ref: d, x: d.x, z: d.z, r: d.r || 0.8 }); });
      return list;
    }

    // ---- Phase 2: bot actors (see KitFx actor notes in js/heroes/kit_helpers.js) ----
    // Enemies of a team as kit targets. Chaos (1) sees the player too; Order bots see camps like the player does.
    function hostilesForTeam(team) {
      if (team === 0) return getHostileTargets();
      const list = [];
      if (!matchMode) return list;
      if (playerProg.respawnTimer <= 0 && (hero.stealthTimer || 0) <= 0) list.push({ kind: 'player', ref: hero, x: hero.x, z: hero.z, r: hero.r || 0.52 });
      bots.forEach((b) => { if (b.team === 0 && b.respawnTimer <= 0) list.push({ kind: 'bot', ref: b, x: b.x, z: b.z, r: b.r }); });
      minions.forEach((m) => { if (m.team === 0 && m.hp > 0) list.push({ kind: 'minion', ref: m, x: m.x, z: m.z, r: m.r }); });
      camps.forEach((c) => { if (c.respawnTimer <= 0 && c.hp > 0) list.push({ kind: 'camp', ref: c, x: c.x, z: c.z, r: c.r }); });
      structures.forEach((st) => { if (st.team === 0 && st.hp > 0) list.push({ kind: 'structure', ref: st, x: st.x, z: st.z, r: st.r }); });
      deployables.forEach((d) => { if (d.hp > 0 && (d.team || 0) === 0) list.push({ kind: 'deployable', ref: d, x: d.x, z: d.z, r: d.r || 0.8 }); });
      return list;
    }
    // CC/bleed from a bot-cast kit ability (mirrors applyBotCcAndEffects inside updateBots)
    function applyActorEffects(targetObj, opts) {
      const u = targetObj.ref;
      if (!u || targetObj.kind === 'structure' || targetObj.kind === 'deployable') return;
      if (opts.stunDur > 0) u.stunTimer = Math.max(u.stunTimer || 0, opts.stunDur);
      if (opts.slowDur > 0) u.slowTimer = Math.max(u.slowTimer || 0, opts.slowDur);
      if (opts.bleedAdd > 0 && u !== hero) {
        u.bleedStacks = Math.min(5, (u.bleedStacks || 0) + opts.bleedAdd);
        u.bleedTimer = 5.5;
      }
      if (opts.tauntDur > 0) {
        // bots get the real taunt; the player can't be force-walked yet, so a taunt on the player is a half-length stun
        if (u === hero) u.stunTimer = Math.max(u.stunTimer || 0, opts.tauntDur * 0.5);
        else u.tauntTimer = Math.max(u.tauntTimer || 0, opts.tauntDur);
      }
      if (opts.knockbackDist > 0) {
        const kl = Math.hypot(opts.knockbackDirX || 0, opts.knockbackDirZ || 0) || 1;
        u.knockbackVx = ((opts.knockbackDirX || 0) / kl) * (opts.knockbackDist / 0.25);
        u.knockbackVz = ((opts.knockbackDirZ || 0) / kl) * (opts.knockbackDist / 0.25);
        u.knockbackTimer = 0.25;
        u.knockbackWallStun = !!opts.wallStun;
        u.knockbackBotLvl = opts.casterLevel || 4;
      }
    }
    function botActor(b) {
      if (b._actor) return b._actor;
      b._actor = {
        unit: b,
        get team() { return b.team; },
        isPlayer: false,
        level: () => b.level || 1,
        talents: () => ({}),
        stats: () => b.unitStats || withStatAliases({ attack: b.physAtk || b.atk || 52, ability: b.fant || 0, resist: b.resist || 0, haste: 0, asPct: ((b.level || 1) - 1) * 0.035 }),
        aim: () => {
          const t = b.aimTarget && b.aimTarget.ref;
          if (t && (t.hp === undefined || t.hp > 0)) return { x: t.x, z: t.z };
          return { x: b.aimX !== undefined ? b.aimX : b.x + Math.sin(b.facing), z: b.aimZ !== undefined ? b.aimZ : b.z + Math.cos(b.facing) };
        },
        wtf: false,
        spend: () => true,
        play: (slot, fade, oneShot, speed, start, lock) => {
          b.atkAnimTimer = lock || 0.35;
          b.animSlot = slot;
          b.animTimeScale = speed || 1;
          b.animStartTime = start || 0;
          b.animForceRestart = true;
        },
        hostiles: () => hostilesForTeam(b.team),
        // friendly units other than this bot (the player counts for Order bots)
        allies: () => {
          const list = [];
          if (b.team === 0 && playerProg.respawnTimer <= 0) list.push({ kind: 'player', ref: hero, x: hero.x, z: hero.z, r: hero.r || 0.52 });
          bots.forEach((o) => { if (o !== b && o.team === b.team && o.respawnTimer <= 0) list.push({ kind: 'bot', ref: o, x: o.x, z: o.z, r: o.r }); });
          return list;
        },
        // Sorceress R for bots: the engine's bot Cataclysm Monolith (pulses every 0.5s; collapse only when collapseDmg > 0)
        monolith: (x, z, pulseDmg, collapseDmg) => {
          const scale = (b.team === 1 ? botDiffMult() : 1.0) * (bossBuffTimer[b.team] > 0 ? 1.10 : 1.0);
          spawnShockRing(x, z, 0xe879f9, 2.0, 0.4, 0.50);
          spawnBotCataclysmMonolith(b, x, z, Math.round(pulseDmg * scale), Math.round(collapseDmg * scale));
        },
        // Brawler R for bots: the engine's bot Pit Arena (walls, damage amp, projectile blocking already handled here)
        pitArena: (dur) => {
          b.arenaTimer = dur;
          b.atkAnimTimer = 0.38;
          b.animSlot = 'kick'; b.animTimeScale = 1.45; b.animStartTime = 0; b.animForceRestart = true;
          spawnBotPitArena(b, b.x, b.z, dur);
        },
        damage: (t, dmg, opts) => {
          opts = opts || {};
          const scale = (b.team === 1 ? botDiffMult() : 1.0) * (bossBuffTimer[b.team] > 0 ? 1.10 : 1.0);
          applyBotDamageToTarget(t, Math.round(dmg * scale), b, opts.dmgType || 'physical');
          applyActorEffects(t, opts);
          return true;
        }
      };
      return b._actor;
    }
    // A shield soaks damage before HP; returns what's left over for HP
    function absorbShield(u, dmg) {
      if (!u.shield || u.shield <= 0) return dmg;
      if (u.shield >= dmg) { u.shield -= dmg; return 0; }
      const rem = dmg - u.shield;
      u.shield = 0;
      return rem;
    }
    // Coyote Bleed damage per stack per tick (her kit's Attack-scaled formula; Lv7 Deep Serration +25%)
    function coyoteBleedTick() {
      const k = window.MOBA_HEROES && window.MOBA_HEROES.coyote;
      const base = k && k.dmg ? k.dmg.bleedTick(getPlayerStats()) : (10 + playerProg.level * 2.0);
      return base * (playerProg.talents[7] === 'R' ? 1.25 : 1.0);
    }
    function botDiffMult() { return botDifficulty === 'easy' ? 0.78 : (botDifficulty === 'hard' ? 1.22 : 1.0); }

    function getAlliedTargets() {
      const list = [];
      if (!matchMode) return list;
      bots.forEach((b) => {
        if (b.team === 0 && b.respawnTimer <= 0) list.push({ kind: 'bot', ref: b, x: b.x, z: b.z, r: b.r });
      });
      return list;
    }

    function dealPlayerDamageToUnit(targetObj, rawDmg, opts = {}) {
      const st = getPlayerStats();
      const u = targetObj.ref;
      if (!u || (u.hp !== undefined && u.hp <= 0)) return false;

      // 0. Deployables (an enemy Imp's turret): plain armor-mitigated damage, destroyed at 0
      if (targetObj.kind === 'deployable') {
        const dd = Math.max(1, Math.round(rawDmg * (100 / (100 + unitResist(u)))));
        u.hp -= dd;
        spawnFloat(u.x, 2.2, u.z, String(dd), opts.color || '#fb7185');
        if (u.hp <= 0) {
          u.hp = 0;
          const i = deployables.indexOf(u);
          if (i >= 0) deployables.splice(i, 1);
          if (u.onDestroyed) u.onDestroyed();
        }
        return true;
      }
      // 1. Structure Invulnerability & Backdoor Protection Check!
      if (targetObj.kind === 'structure') {
        if (!isStructureVulnerable(u)) {
          if (!opts.isDoT) {
            SFX.play('block');
            spawnShockRing(u.x, u.z, 0xfde047, 0.4, u.r + 0.6, 0.22);
            spawnFloat(u.x, 3.2, u.z, 'INVULNERABLE! (DESTROY OUTER TOWER FIRST)', '#fde047');
          }
          return false;
        }
      }

      // 2. Jungle Camp Leash Territory & Evade Check!
      if (targetObj.kind === 'camp') {
        if (u.state === 'leashing') {
          if (!opts.isDoT) {
            SFX.play('block');
            spawnFloat(u.x, 2.5, u.z, 'LEASHING (INVULNERABLE)', '#fde047');
          }
          return false;
        }
        const playerDistFromHome = Math.hypot(hero.x - u.homeX, hero.z - u.homeZ);
        if (!opts.isDoT && playerDistFromHome > u.leashR + 0.8) {
          SFX.play('block');
          if (u.leashRing) u.leashRing.visible = true;
          spawnFloat(u.x, 2.6, u.z, 'EVADED! (FIGHT INSIDE CAMP TERRITORY)', '#fde047');
          return false;
        }
        // Aggro Camp onto Player!
        u.state = 'aggro';
        u.aggroTarget = hero;
        u.patience = 5.0;
        if (u.leashRing) u.leashRing.visible = true;
      }

      const dmgType = opts.dmgType || 'physical'; // (legacy tag: now only picks the number color)
      // Damage source (DESIGN_RULES §2): basic attacks and "counts as a basic attack" abilities deal Attack damage,
      // everything else is Ability damage. Kits can say so explicitly with opts.src = 'attack' | 'ability'.
      const isAttackDmg = opts.src ? opts.src === 'attack' : !!opts.isBasic;
      let dmg = rawDmg;

      // Spell Amp item proc (Crown of the Astral Archon: +18% Ability damage)
      if (!isAttackDmg && st.spellAmp > 0) {
        dmg *= (1 + st.spellAmp);
      }

      // One Resist reduces both sources
      dmg *= 100 / (100 + Math.max(0, unitResist(u)));

      // Backdoor Protection on Enemy Structures (65% damage reduction if no Order minions within 11.5m!)
      if (targetObj.kind === 'structure') {
        const hasAlliedWave = minions.some((m) => m.team === 0 && m.hp > 0 && Math.hypot(m.x - u.x, m.z - u.z) <= 11.5);
        if (!hasAlliedWave) {
          dmg *= 0.35;
        }
      }

      // Execute Amp Item Proc (+25% dmg vs targets <45% HP)
      if (st.executeAmp > 0 && u.hp / u.maxHp < 0.45 && targetObj.kind !== 'structure') {
        dmg *= (1 + st.executeAmp);
      }

      dmg = Math.max(1, Math.round(dmg));
      u.hp -= targetObj.kind === 'bot' ? absorbShield(u, dmg) : dmg; // enemy bot shields soak player damage first
      u.lastDamagedByPlayerAt = matchTime;

      // Lifesteal (Attack damage) / Spell Vamp (Ability damage; area hits heal at 1/3)
      const vamp = isAttackDmg ? st.lifesteal : st.spellVamp * (opts.aoe ? 1 / 3 : 1);
      if (vamp > 0 && hero.hp < hero.maxHp) {
        hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(dmg * vamp));
      }

      // Bleed Stacks (Coyote Passive)
      if (opts.bleedAdd && targetObj.kind !== 'structure') {
        u.bleedStacks = Math.min(st.maxBleed, (u.bleedStacks || 0) + opts.bleedAdd);
        u.bleedTimer = 5.5;
      }

      // Slow-on-Hit Item Proc or Ability Slow
      if ((st.slowOnHit > 0 || opts.slowDur) && targetObj.kind !== 'structure') {
        u.slowTimer = Math.max(u.slowTimer || 0, opts.slowDur || 1.5);
      }

      // Stun (Brawler Q Kick / Wall Stun)
      if (opts.stunDur && targetObj.kind !== 'structure') {
        u.stunTimer = Math.max(u.stunTimer || 0, opts.stunDur);
        spawnFloat(u.x, 2.6, u.z, 'STUNNED!', '#fde047');
      }

      // Taunt (Bodyguard R Eyes On Me!)
      if (opts.tauntDur && targetObj.kind !== 'structure') {
        u.tauntTimer = Math.max(u.tauntTimer || 0, opts.tauntDur);
        spawnFloat(u.x, 2.65, u.z, 'TAUNTED!', '#fde047');
      }

      // Knockback Displacement (Bodyguard Q Bouncer Haymaker / Sorceress 10L Gravity Collapse)
      if (opts.knockbackDist && targetObj.kind !== 'structure') {
        let dirX = opts.knockbackDirX;
        let dirZ = opts.knockbackDirZ;
        if (dirX === undefined || dirZ === undefined) {
          const ox = opts.kbOriginX !== undefined ? opts.kbOriginX : hero.x;
          const oz = opts.kbOriginZ !== undefined ? opts.kbOriginZ : hero.z;
          dirX = u.x - ox;
          dirZ = u.z - oz;
          if (Math.hypot(dirX, dirZ) < 0.01) {
            dirX = Math.sin(hero.facing || 0);
            dirZ = Math.cos(hero.facing || 0);
          }
        }
        const kLen = Math.hypot(dirX, dirZ) || 1;
        const kDur = opts.knockbackDur || 0.26;
        u.knockbackVx = (dirX / kLen) * (opts.knockbackDist / kDur);
        u.knockbackVz = (dirZ / kLen) * (opts.knockbackDist / kDur);
        u.knockbackTimer = kDur;
        u.knockbackWallStun = !!opts.wallStun;
        if (opts.knockbackDist > 0) {
          spawnFloat(u.x, 2.55, u.z, 'KNOCKBACK!', '#38bdf8');
        }
      }

      // Cleave Item Proc (Pit Champion's Cestus) — properly routes lethal cleave through handleUnitDeath!
      if (opts.isBasic && st.cleaveProc > 0) {
        spawnShockRing(u.x, u.z, 0xfbbf24, 0.2, 2.3, 0.2);
        getHostileTargets().forEach((other) => {
          if (other.ref !== u && other.kind !== 'structure' && other.ref.hp > 0 && Math.hypot(other.x - u.x, other.z - u.z) <= 2.4) {
            const cleaveDmg = Math.max(1, Math.round(st.cleaveProc * (100 / (100 + unitResist(other.ref)))));
            other.ref.hp -= cleaveDmg;
            other.ref.lastDamagedByPlayerAt = matchTime;
            if (other.ref.plate) {
              const hpEl = other.ref.plate.querySelector('.plate-hp');
              if (hpEl) hpEl.style.width = Math.max(0, (other.ref.hp / other.ref.maxHp) * 100) + '%';
            }
            spawnFloat(other.x, 2.0, other.z, String(cleaveDmg), '#fbbf24');
            if (other.ref.hp <= 0) {
              handleUnitDeath(other);
            }
          }
        });
      }

      if (u.plate) {
        const hpEl = u.plate.querySelector('.plate-hp');
        if (hpEl) hpEl.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + '%';
      }
      const defaultCol = dmgType === 'fantasy' ? '#38bdf8' : '#fb7185';
      spawnFloat(u.x, 2.2, u.z, String(dmg), opts.color || defaultCol);

      // Check Unit Death & Rewards!
      if (u.hp <= 0) {
        handleUnitDeath(targetObj);
      }
      return true;
    }

    // Sorceress Passive ("Soul Siphon"): Enemies dying within 2.5s of taking damage from you restore 36 (+6/Lv) Mana (3x on Heroes!)
    function checkSorceressSoulSiphon(u, isHeroVictim) {
      if (getActiveHeroId() !== 'sorceress') return;
      if (!u || matchTime - (u.lastDamagedByPlayerAt || -99) > 2.5) return;
      const baseMana = 36 + playerProg.level * 6;
      const gain = isHeroVictim ? baseMana * 3 : baseMana;
      hero.mp = Math.min(hero.maxMp || 440, (hero.mp || 0) + gain);
      spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.25, 1.45, 0.25);
      spawnFloat(hero.x, 2.75, hero.z, 'SOUL SIPHON +' + gain + ' MP!', '#38bdf8');
    }

    function handleUnitDeath(targetObj) {
      const u = targetObj.ref;
      if (!u) return;
      if (targetObj.kind === 'minion') {
        u.hp = 0;
        if (u.rig && u.rig.acts.death && u.mesh.visible && !u._dead) {
          playMinionAct(u, 'death', 0.1);
          dyingMinions.push({ mesh: u.mesh, rig: u.rig, t: CORPSE_TIME });
        } else {
          mapGroup.remove(u.mesh);
          releaseMinionRig(u.rig);
        }
        if (u.plate) u.plate.remove();
        const idx = minions.indexOf(u);
        if (idx >= 0) minions.splice(idx, 1);
        if (!u._dead) {
          u._dead = true;
          if (u.team === 1) checkSorceressSoulSiphon(u, false);
          grantProximityReward(u.team, u.x, u.z, u.kind === 'super' ? 68 : 34, u.kind === 'super' ? 85 : 46);
        }
      } else if (targetObj.kind === 'camp') {
        u.hp = 0;
        u.respawnTimer = u.respawnDur;
        u.state = 'idle';
        u.aggroTarget = null;
        u.bleedStacks = 0;
        u.x = u.homeX;
        u.z = u.homeZ;
        if (u.rig && u.rig.acts.death) {
          // rigged monsters play their death clip first; the respawn countdown hides them when it's done
          playGolemAct(u.rig, 'death', 0.1, 1.3);
          u.dyingT = CORPSE_TIME;
          if (u.plate) u.plate.style.display = 'none';
        } else {
          u.mobGrp.position.set(0, 0, 0);
          u.mobGrp.visible = false;
        }
        if (u.leashRing) u.leashRing.visible = false;
        u.plate.style.display = 'none';
        checkSorceressSoulSiphon(u, u.isBoss);
        addPlayerGoldAndXp(u.gold, u.xp, u.x, u.z);
        if (u.isBoss) {
          bossBuffTimer[0] = 90.0; // +10% All-Stats Buff for 90s!
          SFX.play('arena');
          spawnShockRing(u.x, u.z, 0xfde047, 0.5, 5.5, 0.5);
          spawnFloat(u.x, 3.4, u.z, 'BOSS SLAIN! +10% ALL STATS (90s)', '#fde047');
        }
      } else if (targetObj.kind === 'bot') {
        u.hp = 0;
        u.respawnTimer = 8 + u.level * 1.5;
        u.bleedStacks = 0;
        u.tauntTimer = 0;
        u.knockbackTimer = 0;
        u.pivot.visible = false;
        if (u.bowPivot) u.bowPivot.visible = false;
        u.plate.style.display = 'none';
        if (u.team === 1) {
          teamKills[0]++;
          playerProg.kills++;
          checkSorceressSoulSiphon(u, true);
          // Panther 10L Talent ("Apex Reset"): Hero takedowns within 4s of exiting R Stealth refresh E and grant 2.5s Stealth!
          if (getActiveHeroId() === 'panther' && playerProg.talents[10] === 'L' && ((hero.stealthTimer || 0) > 0 || (hero.stealthExitTimer || 0) > 0)) {
            hero.cdE = 0;
            hero.stealthTimer = Math.max(hero.stealthTimer || 0, 2.5);
            spawnShockRing(hero.x, hero.z, 0x2dd4bf, 0.3, 2.2, 0.32);
            spawnFloat(hero.x, 3.0, hero.z, 'APEX RESET! E REFRESHED + 2.5s STEALTH!', '#2dd4bf');
          }
          addPlayerGoldAndXp(240 + u.level * 20, 260 + u.level * 25, u.x, u.z);
          spawnFloat(u.x, 2.9, u.z, 'ENEMY HERO SLAIN! +260g', '#fde047');
        } else {
          teamKills[1]++;
        }
      } else if (targetObj.kind === 'structure') {
        u.hp = 0;
        u.mesh.visible = false;
        u.plate.style.display = 'none';
        SFX.play('arena');
        spawnShockRing(u.x, u.z, 0xfde047, 0.6, 4.2, 0.45);
        if (u.team === 1) {
          addPlayerGoldAndXp(280, 300, u.x, u.z);
          if (u.kind === 'barracks') {
            spawnFloat(u.x, 3.2, u.z, 'BARRACKS DESTROYED! SUPER MINIONS SPAWNING!', '#fde047');
          } else {
            spawnFloat(u.x, 3.0, u.z, u.name.toUpperCase() + ' DESTROYED!', '#fde047');
          }
        }
        if (u.kind === 'ancient') {
          const win = u.team === 1;
          gameOver = {
            winnerTeam: win ? 0 : 1,
            title: win ? 'VICTORY — CHAOS ANCIENT DESTROYED!' : 'DEFEAT — ORDER ANCIENT FELL'
          };
          showVictoryModal();
        }
      }
    }

    // =========================================================
    // TACTICAL PINGS & OBSERVER WARDS (F) & RECALL (B)
    // =========================================================
    function placeWard() {
      if (playerProg.wardCharges <= 0) {
        spawnFloat(hero.x, 2.5, hero.z, 'WARD RECHARGING!', '#fb7185');
        return;
      }
      playerProg.wardCharges--;
      if (playerProg.wardRechargeTimer <= 0) playerProg.wardRechargeTimer = 45.0;

      const dx = ctx.aimWorld.x - hero.x;
      const dz = ctx.aimWorld.z - hero.z;
      const dist = Math.min(7.5, Math.hypot(dx, dz) || 0.01);
      const ang = Math.atan2(dx, dz);
      const wx = hero.x + Math.sin(ang) * dist;
      const wz = hero.z + Math.cos(ang) * dist;

      const wGrp = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.1, 8), goldTrimMat);
      post.position.y = 0.55;
      wGrp.add(post);
      const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      eye.position.y = 1.25;
      wGrp.add(eye);
      const vRing = new THREE.Mesh(
        new THREE.RingGeometry(15.8, 16.0, 48),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.22 })
      );
      vRing.rotation.x = -Math.PI / 2;
      vRing.position.y = 0.04;
      wGrp.add(vRing);

      wGrp.position.set(wx, 0, wz);
      mapGroup.add(wGrp);
      wards.push({ x: wx, z: wz, life: 75.0, mesh: wGrp, eye });
      SFX.play('chime');
      spawnFloat(wx, 2.2, wz, 'OBSERVER WARD (75s)', '#38bdf8');
      refreshShopAndHudUI();
    }

    function startRecall() {
      if (playerProg.respawnTimer > 0) return;
      playerProg.recallTimer = 3.0;
      SFX.play('chime');
      spawnFloat(hero.x, 2.6, hero.z, 'RECALLING TO FOUNTAIN (3.0s)...', '#38bdf8');
    }

    function triggerPing(kind, wx, wz) {
      const colors = { attack: '#f43f5e', retreat: '#fde047', group: '#38bdf8', boss: '#f59e0b' };
      const labels = { attack: 'ATTACK / GANK!', retreat: 'FALL BACK!', group: 'GROUP PUSH!', boss: 'TARGET BOSS!' };
      const hex = colors[kind] || '#38bdf8';
      SFX.play('chime');
      spawnShockRing(wx, wz, parseInt(hex.slice(1), 16), 0.4, 3.5, 0.45);
      spawnFloat(wx, 3.1, wz, 'PING: ' + labels[kind], hex);
      pings.push({ kind, x: wx, z: wz, life: 8.0, color: hex });
    }

    // =========================================================
    // UI: SCOREBOARD, MINIMAP, SHOP DRAWER & TALENT MODAL
    // =========================================================
    let minimapCtx = null;

    function buildPhase1UI() {
      const uiRoot = document.createElement('div');
      uiRoot.id = 'phase1-ui-layer';
      uiRoot.innerHTML = `
        <!-- Top Scoreboard Pill -->
        <div id="p1-scoreboard" style="position:absolute;top:58px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:14px;padding:6px 16px;background:rgba(10,16,24,0.92);border:1px solid rgba(251,191,36,0.45);border-radius:8px;z-index:22;font-size:12px;font-weight:700;color:#f8fafc;box-shadow:0 6px 20px rgba(0,0,0,0.5);">
          <span style="color:#38bdf8;">ORDER <b id="p1-score-o" style="font-size:15px;">0</b></span>
          <span id="p1-clock" style="padding:2px 8px;background:rgba(255,255,255,0.08);border-radius:4px;font-family:monospace;font-size:13px;color:#fde047;">00:00</span>
          <span style="color:#fb7185;"><b id="p1-score-c" style="font-size:15px;">0</b> CHAOS</span>
          <span style="color:rgba(255,255,255,0.2);">|</span>
          <span id="p1-kda" style="color:#cbd5e1;font-size:11px;">LV 1 • 0/0/0</span>
          <span id="p1-gold" style="color:#fde047;font-size:12.5px;">🪙 600g</span>
          <button type="button" id="p1-btn-shop" class="sb-btn" style="padding:3px 9px;font-size:11px;border-color:rgba(250,204,21,0.6);color:#fde047;">🛒 Shop (P)</button>
          <button type="button" id="p1-btn-lvlup" class="sb-btn" style="padding:3px 8px;font-size:11px;border-color:rgba(56,189,248,0.6);color:#38bdf8;" title="Sandbox: Grant +1 Hero Level (tests Lv 3/7/10 Talents & Lv 6/8/9/12 Ability Ranks)">⬆️ +1 LV</button>
          <button type="button" id="p1-btn-gold" class="sb-btn" style="padding:3px 8px;font-size:11px;border-color:rgba(74,222,128,0.6);color:#86efac;" title="Sandbox: Grant +500 Gold">+500g</button>
          <button type="button" id="p1-btn-ward" class="sb-btn" style="padding:3px 8px;font-size:11px;" title="Place Observer Ward (F)">👁️ Ward (F): 2</button>
          <button type="button" id="p1-btn-recall" class="sb-btn" style="padding:3px 8px;font-size:11px;" title="Channel 3s Free Recall to Fountain (B)">🌀 Recall (B)</button>
          <select id="p1-bot-diff" style="background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:2px 6px;font-size:11px;">
            <option value="easy">Bots: Easy (AA Only)</option>
            <option value="normal" selected>Bots: Medium (Spells)</option>
            <option value="hard">Bots: Hard (Tactical)</option>
          </select>
        </div>

        <!-- Lv 3 / 6 / 10 Binary Talent Choice Banner -->
        <div id="p1-talent-modal" style="display:none;position:absolute;bottom:142px;left:50%;transform:translateX(-50%);background:rgba(12,19,28,0.96);border:2px solid #fbbf24;border-radius:10px;padding:10px 16px;z-index:30;min-width:520px;box-shadow:0 10px 30px rgba(0,0,0,0.75);">
          <div style="text-align:center;font-size:11.5px;font-weight:800;color:#fde047;letter-spacing:0.08em;margin-bottom:8px;" id="p1-talent-title">LEVEL 3 TALENT UNLOCKED — CHOOSE ONE</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button type="button" id="p1-tal-left" style="text-align:left;padding:8px 12px;background:rgba(30,41,59,0.9);border:1px solid rgba(56,189,248,0.55);border-radius:6px;color:#f8fafc;cursor:pointer;">
              <div style="font-size:12px;font-weight:800;color:#38bdf8;" id="p1-tal-l-name">[L] Left Talent</div>
              <div style="font-size:10.5px;color:#cbd5e1;margin-top:2px;" id="p1-tal-l-desc"></div>
            </button>
            <button type="button" id="p1-tal-right" style="text-align:left;padding:8px 12px;background:rgba(30,41,59,0.9);border:1px solid rgba(251,191,36,0.55);border-radius:6px;color:#f8fafc;cursor:pointer;">
              <div style="font-size:12px;font-weight:800;color:#fde047;" id="p1-tal-r-name">[R] Right Talent</div>
              <div style="font-size:10.5px;color:#cbd5e1;margin-top:2px;" id="p1-tal-r-desc"></div>
            </button>
          </div>
        </div>

        <!-- 4-Slot Base Item Shop Drawer -->
        <div id="p1-shop-modal" style="display:none;position:absolute;top:105px;left:50%;transform:translateX(-50%);width:620px;background:rgba(11,17,26,0.97);border:1px solid rgba(251,191,36,0.55);border-radius:10px;padding:14px;z-index:35;color:#f8fafc;box-shadow:0 16px 40px rgba(0,0,0,0.8);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div>
              <span style="font-size:14px;font-weight:800;color:#fde047;">FOUNTAIN ARMORY (4-SLOT PASSIVE &amp; PROC ITEMS)</span>
              <div style="font-size:11px;color:#94a3b8;" id="p1-shop-status">Stand on Allied Fountain (or enable 0 CD Mode) to purchase items.</div>
            </div>
            <button type="button" id="p1-shop-close" class="sb-btn" style="padding:3px 9px;">✕ Close (P)</button>
          </div>
          <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;">
            <span style="font-size:11px;font-weight:700;color:#cbd5e1;">YOUR 4 SLOTS:</span>
            <div id="p1-inv-row" style="display:flex;gap:6px;flex:1;"></div>
          </div>
          <div id="p1-shop-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:280px;overflow-y:auto;"></div>
        </div>

        <!-- Bottom-Right Interactive 2D Minimap & Tactical Bot Pings -->
        <div id="p1-minimap-box" style="position:absolute;right:14px;bottom:14px;background:rgba(9,14,22,0.94);border:1px solid rgba(251,191,36,0.45);border-radius:8px;padding:8px;z-index:24;box-shadow:0 8px 24px rgba(0,0,0,0.65);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:4px;">
            <span style="font-size:10px;font-weight:800;color:#fde047;letter-spacing:0.05em;">4V4 TACTICAL MAP</span>
            <div style="display:flex;gap:3px;">
              <button type="button" class="sb-btn" id="ping-btn-atk" style="padding:1px 5px;font-size:9.5px;color:#fb7185;" title="Ping Attack/Gank (Z)">⚔️ Z</button>
              <button type="button" class="sb-btn" id="ping-btn-ret" style="padding:1px 5px;font-size:9.5px;color:#fde047;" title="Ping Retreat (X)">🛡️ X</button>
              <button type="button" class="sb-btn" id="ping-btn-grp" style="padding:1px 5px;font-size:9.5px;color:#38bdf8;" title="Ping Group Push (C)">🚩 C</button>
              <button type="button" class="sb-btn" id="ping-btn-boss" style="padding:1px 5px;font-size:9.5px;color:#f59e0b;" title="Ping Take Boss (V)">👑 V</button>
            </div>
          </div>
          <canvas id="p1-minimap" width="222" height="150" style="display:block;border-radius:4px;border:1px solid rgba(255,255,255,0.14);cursor:crosshair;"></canvas>
        </div>

        <!-- Victory / Defeat Modal -->
        <div id="p1-gameover-modal" style="display:none;position:absolute;inset:0;background:rgba(5,9,15,0.82);z-index:50;align-items:center;justify-content:center;flex-direction:column;gap:14px;">
          <div id="p1-gameover-title" style="font-family:'Cinzel',serif;font-size:32px;font-weight:800;color:#fde047;text-shadow:0 4px 18px #000;">VICTORY</div>
          <button type="button" id="p1-btn-restart" class="sb-btn toggled" style="padding:10px 22px;font-size:14px;font-weight:800;">Play Another 4v4 Match</button>
        </div>
      `;
      document.getElementById('game-root').appendChild(uiRoot);

      const mmCanvas = document.getElementById('p1-minimap');
      minimapCtx = mmCanvas.getContext('2d');

      // Click on Minimap -> Tactical Ping at clicked map coordinate!
      mmCanvas.addEventListener('mousedown', (e) => {
        const rect = mmCanvas.getBoundingClientRect();
        const u = (e.clientX - rect.left) / rect.width;
        const v = (e.clientY - rect.top) / rect.height;
        const wx = (u - 0.5) * DATA.MAP_W;
        const wz = (v - 0.5) * DATA.MAP_H;
        triggerPing(e.altKey ? 'attack' : 'group', wx, wz);
      });

      document.getElementById('ping-btn-atk').addEventListener('click', () => triggerPing('attack', ctx.aimWorld.x, ctx.aimWorld.z));
      document.getElementById('ping-btn-ret').addEventListener('click', () => triggerPing('retreat', hero.x, hero.z));
      document.getElementById('ping-btn-grp').addEventListener('click', () => triggerPing('group', hero.x, hero.z));
      document.getElementById('ping-btn-boss').addEventListener('click', () => triggerPing('boss', 0, 0));

      document.getElementById('p1-btn-ward').addEventListener('click', placeWard);
      document.getElementById('p1-btn-recall').addEventListener('click', startRecall);
      document.getElementById('p1-btn-shop').addEventListener('click', toggleShopModal);
      document.getElementById('p1-btn-lvlup').addEventListener('click', () => {
        if (playerProg.level < 12) {
          const nextXp = DATA.LEVEL_XP[playerProg.level + 1];
          addPlayerGoldAndXp(0, Math.max(1, nextXp - playerProg.xp), hero.x, hero.z);
        } else {
          spawnFloat(hero.x, 2.8, hero.z, 'MAX LEVEL (LV 12) REACHED!', '#fde047');
        }
      });
      document.getElementById('p1-btn-gold').addEventListener('click', () => {
        addPlayerGoldAndXp(500, 0, hero.x, hero.z);
      });
      document.getElementById('p1-shop-close').addEventListener('click', toggleShopModal);
      document.getElementById('p1-bot-diff').addEventListener('change', (e) => { botDifficulty = e.target.value; });
      document.getElementById('p1-btn-restart').addEventListener('click', resetMatch);

      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.code === 'KeyF') placeWard();
        if (e.code === 'KeyB') startRecall();
        if (e.code === 'KeyP') toggleShopModal();
        if (e.code === 'KeyZ') triggerPing('attack', ctx.aimWorld.x, ctx.aimWorld.z);
        if (e.code === 'KeyX') triggerPing('retreat', hero.x, hero.z);
        if (e.code === 'KeyC') triggerPing('group', hero.x, hero.z);
        if (e.code === 'KeyV') triggerPing('boss', 0, 0);
      });

      refreshShopAndHudUI();
      refreshTalentModalUI();
    }

    function toggleShopModal() {
      const el = document.getElementById('p1-shop-modal');
      if (!el) return;
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
      refreshShopAndHudUI();
    }

    function isNearOrderFountain() {
      return Math.hypot(hero.x - MAP.BASE.fountain.x, hero.z - MAP.BASE.fountain.z) <= 9.5 || ctx.isWtfMode();
    }

    function buyShopItem(itemId) {
      const item = DATA.SHOP_ITEMS.find((it) => it.id === itemId);
      if (!item) return;
      if (!isNearOrderFountain()) {
        spawnFloat(hero.x, 2.6, hero.z, 'RECALL TO FOUNTAIN (B) TO BUY!', '#fb7185');
        return;
      }
      if (playerProg.items.length >= 4) {
        spawnFloat(hero.x, 2.6, hero.z, '4 ITEM SLOTS FULL!', '#fb7185');
        return;
      }
      if (playerProg.gold < item.cost) {
        spawnFloat(hero.x, 2.6, hero.z, 'NEED ' + item.cost + ' GOLD!', '#fb7185');
        return;
      }
      playerProg.gold -= item.cost;
      playerProg.items.push(item);
      const st = getPlayerStats();
      hero.maxHp = st.maxHp;
      hero.hp = Math.min(hero.maxHp, hero.hp + (item.stats.maxHp || 0));
      SFX.play('chime');
      spawnFloat(hero.x, 2.7, hero.z, 'EQUIPPED: ' + item.name, '#fde047');
      refreshShopAndHudUI();
    }

    function refreshShopAndHudUI() {
      const gEl = document.getElementById('p1-gold');
      if (!gEl) return;
      gEl.textContent = '🪙 ' + playerProg.gold + 'g';
      document.getElementById('p1-kda').textContent =
        'LV ' + playerProg.level + ' • ' + playerProg.kills + '/' + playerProg.deaths + '/' + playerProg.assists +
        (bossBuffTimer[0] > 0 ? ' • 👑 BOSS +10%' : '');
      document.getElementById('p1-score-o').textContent = String(teamKills[0]);
      document.getElementById('p1-score-c').textContent = String(teamKills[1]);
      document.getElementById('p1-btn-ward').textContent = '👁️ Ward (F): ' + playerProg.wardCharges;

      const invRow = document.getElementById('p1-inv-row');
      if (invRow) {
        invRow.innerHTML = [0, 1, 2, 3].map((idx) => {
          const it = playerProg.items[idx];
          return `<div style="flex:1;padding:5px 8px;background:rgba(30,41,59,0.85);border:1px solid ${it ? '#fbbf24' : 'rgba(255,255,255,0.15)'};border-radius:5px;font-size:10.5px;color:${it ? '#fde047' : '#64748b'};font-weight:700;">
            ${it ? it.name : 'Empty Slot #' + (idx + 1)}
          </div>`;
        }).join('');
      }

      const grid = document.getElementById('p1-shop-grid');
      if (grid) {
        const canBuyHere = isNearOrderFountain();
        grid.innerHTML = DATA.SHOP_ITEMS.map((it) => {
          const afford = playerProg.gold >= it.cost && playerProg.items.length < 4 && canBuyHere;
          return `<div style="padding:8px 10px;background:rgba(20,29,42,0.92);border:1px solid ${afford ? 'rgba(250,204,21,0.5)' : 'rgba(255,255,255,0.1)'};border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <div style="font-size:12px;font-weight:800;color:#f8fafc;">${it.name} <span style="color:#fde047;">(${it.cost}g)</span></div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${it.desc}</div>
            </div>
            <button type="button" data-buy="${it.id}" class="sb-btn" style="padding:4px 9px;font-size:11px;opacity:${afford ? '1' : '0.45'};">Buy</button>
          </div>`;
        }).join('');
        grid.querySelectorAll('[data-buy]').forEach((btn) => {
          btn.addEventListener('click', () => buyShopItem(btn.getAttribute('data-buy')));
        });
      }
    }

    function refreshTalentModalUI() {
      const modal = document.getElementById('p1-talent-modal');
      if (!modal) return;
      const tier = [3, 7, 10].find((t) => playerProg.level >= t && !playerProg.talents[t]);
      if (!tier) {
        modal.style.display = 'none';
        return;
      }
      const tree = DATA.HERO_TALENTS[getActiveHeroId()][tier];
      modal.style.display = 'block';
      document.getElementById('p1-talent-title').textContent = 'LEVEL ' + tier + ' HERO TALENT UNLOCKED — CHOOSE ONE';
      document.getElementById('p1-tal-l-name').textContent = '[L] ' + tree.L.name;
      document.getElementById('p1-tal-l-desc').textContent = tree.L.desc;
      document.getElementById('p1-tal-r-name').textContent = '[R] ' + tree.R.name;
      document.getElementById('p1-tal-r-desc').textContent = tree.R.desc;

      document.getElementById('p1-tal-left').onclick = () => {
        playerProg.talents[tier] = 'L';
        SFX.play('chime');
        spawnFloat(hero.x, 2.8, hero.z, 'TALENT: ' + tree.L.name, '#38bdf8');
        refreshTalentModalUI();
      };
      document.getElementById('p1-tal-right').onclick = () => {
        playerProg.talents[tier] = 'R';
        SFX.play('chime');
        spawnFloat(hero.x, 2.8, hero.z, 'TALENT: ' + tree.R.name, '#fde047');
        refreshTalentModalUI();
      };
    }

    function showVictoryModal() {
      const m = document.getElementById('p1-gameover-modal');
      if (!m || !gameOver) return;
      m.style.display = 'flex';
      const t = document.getElementById('p1-gameover-title');
      t.textContent = gameOver.title;
      t.style.color = gameOver.winnerTeam === 0 ? '#4ade80' : '#fb7185';
    }

    function resetMatch() {
      gameOver = null;
      const m = document.getElementById('p1-gameover-modal');
      if (m) m.style.display = 'none';
      matchTime = 0;
      waveTimer = 2.0;
      waveCount = 0;
      teamKills = [0, 0];
      bossBuffTimer = [0, 0];
      playerProg.level = 1;
      playerProg.xp = 0;
      playerProg.gold = 600;
      playerProg.kills = 0;
      playerProg.deaths = 0;
      playerProg.assists = 0;
      playerProg.respawnTimer = 0;
      playerProg.recallTimer = 0;
      playerProg.wardCharges = 2;
      playerProg.items = [];
      playerProg.talents = { 3: null, 7: null, 10: null };

      hero.x = MAP.BASE.heroSpawn.x;
      hero.z = MAP.BASE.heroSpawn.z;
      const st = getPlayerStats();
      hero.maxHp = st.maxHp;
      hero.hp = hero.maxHp;
      hero.maxMp = st.maxMp;
      hero.mp = hero.maxMp;

      botMonoliths.forEach((m) => scene.remove(m.grp));
      botMonoliths.length = 0;
      botArenas.forEach((a) => scene.remove(a.group));
      botArenas.length = 0;

      build3DMap();
      spawnBots();
      refreshShopAndHudUI();
      refreshTalentModalUI();
    }

    // =========================================================
    // BOT AI, TOWER AI, MINION AI & CAMP AI UPDATE LOOP
    // =========================================================
    const rhTmp = new THREE.Vector3();
    const lhTmp = new THREE.Vector3();
    const bowDirTmp = new THREE.Vector3();

    // 3D Physical Slow Indicator Ring + Orbiting Frost Crystals at a slowed unit's feet!
    const slowRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const slowDiscMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    const slowShardGeo = new THREE.OctahedronGeometry(0.12, 0);
    const slowShardMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });

    function updateUnitSlowVisual(u, parentGrp, radius, dt) {
      if (!u || !parentGrp) return;
      const active = (u.slowTimer || 0) > 0;
      if (!active) {
        if (u.slowFxGrp) u.slowFxGrp.visible = false;
        return;
      }
      if (!u.slowFxGrp) {
        const grp = new THREE.Group();
        const r = radius || 0.72;
        const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r * 1.02, 28), slowRingMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.06;
        grp.add(ring);

        const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 24), slowDiscMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.05;
        grp.add(disc);

        for (let k = 0; k < 4; k++) {
          const shard = new THREE.Mesh(slowShardGeo, slowShardMat);
          const a = (k / 4) * Math.PI * 2;
          shard.position.set(Math.cos(a) * (r * 0.90), 0.22, Math.sin(a) * (r * 0.90));
          grp.add(shard);
        }
        parentGrp.add(grp);
        u.slowFxGrp = grp;
      }
      u.slowFxGrp.visible = true;
      u.slowFxGrp.rotation.y -= dt * 3.2;
    }

    function spawnUnitProjectile(sx, sz, targetUnit, dmg, colorHex, spd = 15.5, dmgType = 'physical', attackerObj = null, customMesh = null, extraOpts = null) {
      const orb = customMesh || new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 10, 8),
        new THREE.MeshBasicMaterial({ color: colorHex })
      );
      orb.position.set(sx, 1.35, sz);
      scene.add(orb);
      projectiles.push({ mesh: orb, target: targetUnit, dmg, spd, life: 2.2, dmgType, attackerObj, extraOpts });
    }




    const botMonoliths = [];
    function spawnBotCataclysmMonolith(b, tx, tz, pulseDmg, collapseDmg) {
      const grp = new THREE.Group();
      const obelisk = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.68, 0),
        new THREE.MeshStandardMaterial({ color: 0x3b0764, emissive: 0xd946ef, emissiveIntensity: 0.75, roughness: 0.25, metalness: 0.8 })
      );
      obelisk.scale.set(0.85, 2.4, 0.85);
      obelisk.position.y = 1.85;
      grp.add(obelisk);

      const zoneRing = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1.0, 48),
        new THREE.MeshBasicMaterial({ color: 0xe879f9, side: THREE.DoubleSide, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending })
      );
      zoneRing.rotation.x = -Math.PI / 2;
      zoneRing.position.y = 0.05;
      zoneRing.scale.setScalar(2.0);
      grp.add(zoneRing);

      const zoneDisc = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 48),
        new THREE.MeshBasicMaterial({ color: 0x7e22ce, side: THREE.DoubleSide, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      zoneDisc.rotation.x = -Math.PI / 2;
      zoneDisc.position.y = 0.03;
      zoneDisc.scale.setScalar(2.0);
      grp.add(zoneDisc);

      grp.position.set(tx, 0, tz);
      scene.add(grp);
      spawnShockRing(tx, tz, 0xe879f9, 0.5, 2.4, 0.35);
      spawnFloat(tx, 2.9, tz, 'CATACLYSM MONOLITH!', '#e879f9');

      botMonoliths.push({
        grp, obelisk, zoneRing, zoneDisc,
        x: tx, z: tz,
        startR: 2.0, maxR: 4.5, curR: 2.0,
        t: 0, dur: 5.0,
        tickTimer: 0.1,
        pulseDmg,
        collapseDmg,
        casterBot: b
      });
    }

    const botArenas = [];
    function spawnBotPitArena(b, x, z, dur = 5.5) {
      const group = new THREE.Group();
      const radius = 4.6;
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 2.2, 48, 1, true),
        new THREE.MeshBasicMaterial({
          color: b.team === 0 ? 0x38bdf8 : 0xf43f5e,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      wall.position.y = 1.1;
      group.add(wall);

      const rim = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.14, radius + 0.08, 56),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide })
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.04;
      group.add(rim);

      const postGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.35, 7);
      const orbGeo = new THREE.OctahedronGeometry(0.24, 0);
      const orbMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const px = Math.cos(a) * radius;
        const pz = Math.sin(a) * radius;
        const post = new THREE.Mesh(postGeo, stoneBaseMat);
        post.position.set(px, 1.17, pz);
        post.castShadow = true;
        group.add(post);
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.set(px, 2.5, pz);
        group.add(orb);
      }
      group.position.set(x, 0, z);
      scene.add(group);

      const insideMap = new WeakMap();
      if (playerProg.respawnTimer <= 0) {
        insideMap.set(hero, Math.hypot(hero.x - x, hero.z - z) <= radius);
      }
      bots.forEach((ob) => {
        if (ob.respawnTimer <= 0) insideMap.set(ob, Math.hypot(ob.x - x, ob.z - z) <= radius);
      });
      minions.forEach((m) => {
        if (m.hp > 0) insideMap.set(m, Math.hypot(m.x - x, m.z - z) <= radius);
      });

      spawnShockRing(x, z, b.team === 0 ? 0x38bdf8 : 0xf43f5e, 0.8, radius, 0.35);
      spawnFloat(x, 2.8, z, b.name + ': WELCOME TO THE PIT!', '#fb7185');
      botArenas.push({ x, z, r: radius, life: dur, group, wall, team: b.team, casterBot: b, insideMap });
    }


    // Advance Knockback on a unit (including Player Hero!) and check for Bodyguard 3L "Into the Stonework" Wall-Stun!
    function stepUnitKnockback(u, dt, kind) {
      if (!u || !u.knockbackTimer || u.knockbackTimer <= 0) return false;
      const stepDt = Math.min(dt, u.knockbackTimer);
      u.x = THREE.MathUtils.clamp(u.x + (u.knockbackVx || 0) * stepDt, -69, 69);
      u.z = THREE.MathUtils.clamp(u.z + (u.knockbackVz || 0) * stepDt, -46, 46);
      u.knockbackTimer -= dt;

      let hitWall = false;
      for (let k = 0; k < mapObstacles.length; k++) {
        const o = mapObstacles[k];
        const dx = u.x - o.x;
        const dz = u.z - o.z;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d < (u.r || 0.45) + o.r) {
          u.x = o.x + (dx / d) * ((u.r || 0.45) + o.r);
          u.z = o.z + (dz / d) * ((u.r || 0.45) + o.r);
          hitWall = true;
        }
      }
      for (let k = 0; k < structures.length; k++) {
        const s = structures[k];
        if (!s || s.hp <= 0) continue;
        const dx = u.x - s.x;
        const dz = u.z - s.z;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d < (u.r || 0.45) + s.r + 0.15) {
          u.x = s.x + (dx / d) * ((u.r || 0.45) + s.r + 0.15);
          u.z = s.z + (dz / d) * ((u.r || 0.45) + s.r + 0.15);
          hitWall = true;
        }
      }
      const ar = ctx.getArena ? ctx.getArena() : null;
      if (ar && Math.abs(Math.hypot(u.x - ar.x, u.z - ar.z) - ar.r) <= (u.r || 0.45) + 0.25) {
        clampUnitToArena(u, ar);
        hitWall = true;
      }

      if (hitWall && u.knockbackWallStun) {
        u.knockbackWallStun = false;
        u.knockbackTimer = 0;
        u.stunTimer = Math.max(u.stunTimer || 0, 1.0);
        SFX.play('arena');
        spawnShockRing(u.x, u.z, 0xfde047, 0.25, 1.7, 0.28);
        spawnFloat(u.x, 2.85, u.z, 'WALL STUN! (1.0s)', '#fde047');
        if (u === hero) {
          damageOrderHeroOrBot(hero, 65 + (u.knockbackBotLvl || 4) * 12, 'physical');
        } else {
          dealPlayerDamageToUnit({ kind, ref: u }, 65 + playerProg.level * 12, { dmgType: 'physical', color: '#fde047', isDoT: true });
        }
      }
      return true;
    }

    function damageOrderHeroOrBot(unit, rawDmg, dmgType = 'physical', attackerObj = null) {
      const st = getPlayerStats();
      if (unit === hero) {
        if (playerProg.respawnTimer > 0) return;
        const mitigated = Math.round(rawDmg * (100 / (100 + Math.max(0, st.resist))));
        playerProg.recallTimer = 0; // Interrupt recall on taking damage!
        if (spyglass.channel > 0) { spyglass.channel = 0; spawnFloat(hero.x, 2.5, hero.z, 'SPYGLASS INTERRUPTED', '#fb7185'); }

        // Bodyguard 10L Talent ("Thorns of Brass"): Reflect 25% of incoming damage while R Shield holds!
        if (getActiveHeroId() === 'bodyguard' && hero.rShieldTimer > 0 && hero.shield > 0 && playerProg.talents[10] === 'L' && attackerObj && attackerObj.ref) {
          dealPlayerDamageToUnit(attackerObj, rawDmg * 0.25, { dmgType: 'physical', color: '#fde047', isDoT: true });
        }

        if (hero.shield >= mitigated) {
          hero.shield -= mitigated;
        } else {
          const rem = mitigated - hero.shield;
          hero.shield = 0;
          hero.rShieldTimer = 0;
          hero.hp -= rem;
        }
        if (hero.hp <= 0) {
          hero.hp = 0;
          playerProg.deaths++;
          teamKills[1]++;
          playerProg.respawnTimer = 6.0 + playerProg.level * 1.2;
          spawnFloat(hero.x, 2.8, hero.z, 'SLAIN! RESPAWNING IN ' + Math.round(playerProg.respawnTimer) + 's', '#fb7185');
          hero.x = MAP.BASE.heroSpawn.x;
          hero.z = MAP.BASE.heroSpawn.z;
          refreshShopAndHudUI();
        }
      } else {
        const allyAura = (st.allyAuraRes > 0 && Math.hypot(unit.x - hero.x, unit.z - hero.z) <= 7.5) ? st.allyAuraRes : 0;
        const baseRes = unit.resist !== undefined ? unit.resist : (unit.armor || 20);
        const totalRes = baseRes + (unit.bonusResAura || 0) + allyAura;
        const mitigated = Math.max(1, Math.round(rawDmg * (100 / (100 + totalRes))));
        if (unit.shield && unit.shield > 0) {
          if (unit.shield >= mitigated) {
            unit.shield -= mitigated;
            return;
          } else {
            const rem = mitigated - unit.shield;
            unit.shield = 0;
            unit.hp -= rem;
          }
        } else {
          unit.hp -= mitigated;
        }
        if (unit.hp <= 0) {
          handleUnitDeath({ kind: 'bot', ref: unit });
        }
      }
    }

    function updateBots(dt) {
      const isEasy = botDifficulty === 'easy';
      const isHard = botDifficulty === 'hard';
      const activePing = pings.length > 0 ? pings[pings.length - 1] : null;
      const bleedTickRate = coyoteBleedTick(); // Coyote's Attack-scaled Bleed (see coyote.js dmg)

      // Helper to apply CC / Bleed / Marks from a Bot ability onto a target (Player, Bot, Minion, or Camp)
      function applyBotCcAndEffects(targetObj, opts = {}) {
        if (!targetObj || !targetObj.ref) return;
        const u = targetObj.ref;
        if (targetObj.kind === 'structure') return;
        if (opts.stunDur && opts.stunDur > 0) {
          u.stunTimer = Math.max(u.stunTimer || 0, opts.stunDur);
        }
        if (opts.slowDur && opts.slowDur > 0) {
          u.slowTimer = Math.max(u.slowTimer || 0, opts.slowDur);
        }
        if (opts.tauntDur && opts.tauntDur > 0 && u !== hero) {
          u.tauntTimer = Math.max(u.tauntTimer || 0, opts.tauntDur);
        }
        if (opts.bleedAdd && opts.bleedAdd > 0 && u !== hero) {
          u.bleedStacks = Math.min(5, (u.bleedStacks || 0) + opts.bleedAdd);
          u.bleedTimer = 5.5;
        }
        if (opts.marks && opts.marks > 0) {
          u.predatorMarks = opts.marks;
          u.predatorMarkTimer = 5.0;
        }
        if (opts.kbDist && opts.kbDist > 0 && opts.fromBot) {
          let kx = u.x - opts.fromBot.x;
          let kz = u.z - opts.fromBot.z;
          const kl = Math.hypot(kx, kz) || 0.01;
          u.knockbackVx = (kx / kl) * (opts.kbDist / 0.25);
          u.knockbackVz = (kz / kl) * (opts.kbDist / 0.25);
          u.knockbackTimer = 0.25;
          u.knockbackWallStun = !!opts.wallStun;
          u.knockbackBotLvl = opts.fromBot.level || 4;
        }
      }


      // Advance Player Hero Knockback (e.g. from Enemy Bodyguard's Q Haymaker!)
      if (playerProg.respawnTimer <= 0) {
        stepUnitKnockback(hero, dt, 'player');
      }


      // Update Bot Cataclysm Monoliths (3D rotating obelisk + expanding 2.0m -> 4.5m ring + 0.5s pulses + 5.0s gravity collapse!)
      for (let i = botMonoliths.length - 1; i >= 0; i--) {
        const m = botMonoliths[i];
        m.t += dt;
        const frac = Math.min(1, m.t / m.dur);
        m.curR = m.startR + (m.maxR - m.startR) * frac;
        m.obelisk.rotation.y += dt * (2.2 + frac * 4.5);
        m.obelisk.position.y = 1.85 + Math.sin(m.t * 5.0) * 0.18;
        m.zoneRing.scale.setScalar(m.curR);
        m.zoneDisc.scale.setScalar(m.curR);
        m.tickTimer -= dt;
        const cb = m.casterBot;
        if (m.tickTimer <= 0 && cb) {
          m.tickTimer = 0.50;
          spawnShockRing(m.x, m.z, 0xd946ef, m.curR * 0.35, m.curR, 0.24);
          if (cb.team === 1 && playerProg.respawnTimer <= 0 && Math.hypot(hero.x - m.x, hero.z - m.z) <= m.curR + (hero.r || 0.52)) {
            applyBotDamageToTarget({ kind: 'player', ref: hero }, m.pulseDmg, cb, 'fantasy');
            applyBotCcAndEffects({ kind: 'player', ref: hero }, { slowDur: 0.65 });
          }
          bots.forEach((ob) => {
            if (ob.team !== cb.team && ob.respawnTimer <= 0 && Math.hypot(ob.x - m.x, ob.z - m.z) <= m.curR + ob.r) {
              applyBotDamageToTarget({ kind: 'bot', ref: ob }, m.pulseDmg, cb, 'fantasy');
              applyBotCcAndEffects({ kind: 'bot', ref: ob }, { slowDur: 0.65 });
            }
          });
          minions.forEach((em) => {
            if (em.team !== cb.team && em.hp > 0 && Math.hypot(em.x - m.x, em.z - m.z) <= m.curR + em.r) {
              applyBotDamageToTarget({ kind: 'minion', ref: em }, m.pulseDmg, cb, 'fantasy');
            }
          });
        }
        if (m.t >= m.dur) {
          if (m.collapseDmg > 0) spawnShockRing(m.x, m.z, 0xfde047, m.curR, 0.25, 0.38);
          if (cb && m.collapseDmg > 0) {
            const collapseUnit = (targetObj, rad) => {
              const u = targetObj.ref;
              const d = Math.hypot(u.x - m.x, u.z - m.z);
              if (d <= m.curR + rad) {
                const pullDist = Math.min(d * 0.72, 2.8);
                if (d > 0.05) {
                  u.x -= ((u.x - m.x) / d) * pullDist;
                  u.z -= ((u.z - m.z) / d) * pullDist;
                }
                applyBotDamageToTarget(targetObj, m.collapseDmg, cb, 'fantasy');
                applyBotCcAndEffects(targetObj, { slowDur: 1.5 });
              }
            };
            if (cb.team === 1 && playerProg.respawnTimer <= 0) collapseUnit({ kind: 'player', ref: hero }, hero.r || 0.52);
            bots.forEach((ob) => {
              if (ob.team !== cb.team && ob.respawnTimer <= 0) collapseUnit({ kind: 'bot', ref: ob }, ob.r);
            });
            minions.forEach((em) => {
              if (em.team !== cb.team && em.hp > 0) collapseUnit({ kind: 'minion', ref: em }, em.r);
            });
          }
          if (m.collapseDmg > 0) spawnFloat(m.x, 3.0, m.z, 'GRAVITY COLLAPSE!', '#fde047');
          scene.remove(m.grp);
          botMonoliths.splice(i, 1);
        }
      }

      // Update Bot Pit Arenas (3D Coliseum Wall + caster tethered expiry)
      for (let i = botArenas.length - 1; i >= 0; i--) {
        const ar = botArenas[i];
        ar.life -= dt;
        ar.wall.material.opacity = 0.16 + Math.sin(ar.life * 8) * 0.06;
        const cb = ar.casterBot;
        const casterLeft = !cb || cb.respawnTimer > 0 || Math.hypot(cb.x - ar.x, cb.z - ar.z) > ar.r + 0.35;
        if (ar.life <= 0 || casterLeft) {
          if (cb) cb.arenaTimer = 0;
          scene.remove(ar.group);
          botArenas.splice(i, 1);
        }
      }

      bots.forEach((b) => {
        if (!b.rigLoaded) attachRigToBot(b);
        if (b.respawnTimer > 0) {
          const hideKit = window.MOBA_HEROES && window.MOBA_HEROES[b.heroType];
          if (hideKit && hideKit.botHide) hideKit.botHide(b);
          if (hideKit && hideKit.botDead) hideKit.botDead(b); // per-frame while dead (the Imp drops his scrap)
          b.rChargeTimer = 0;
          b.gnashAnim = 0;
          b.stealthBlend = 0;
          if (b.rLaserMesh) b.rLaserMesh.visible = false;
          b.respawnTimer -= dt;
          if (b.respawnTimer <= 0) {
            b.x = b.homeX;
            b.z = b.homeZ;
            b.hp = b.maxHp;
            b.shield = 0;
            b.stealthTimer = 0;
            b.arenaTimer = 0;
            b.monoTimer = 0;
            b.leapTimer = 0;
            b.leapOnLand = null;
            b.dashTimer = 0;
            b.dashOnEnd = null;
            b.wpIdx = laneStartIdx(b.team, b.lane); // walk the lane again from the start
            b.laneDone = false;
            b.pivot.visible = true;
            if (b.bowPivot) b.bowPivot.visible = true;
          }
          return;
        }

        b.atkCd = Math.max(0, b.atkCd - dt);
        b.skillCd = Math.max(0, b.skillCd - dt);
        b.cdQ = Math.max(0, (b.cdQ || 0) - dt);
        b.cdE = Math.max(0, (b.cdE || 0) - dt);
        b.cdR = Math.max(0, (b.cdR || 0) - dt);
        b.atkAnimTimer = Math.max(0, b.atkAnimTimer - dt);
        b.slowTimer = Math.max(0, b.slowTimer - dt);
        b.stunTimer = Math.max(0, b.stunTimer - dt);
        b.tauntTimer = Math.max(0, (b.tauntTimer || 0) - dt);
        b.stealthTimer = Math.max(0, (b.stealthTimer || 0) - dt);
        b.arenaTimer = Math.max(0, (b.arenaTimer || 0) - dt);
        if ((b.qTempoTimer || 0) > 0) {
          b.qTempoTimer -= dt;
          if (b.qTempoTimer <= 0) b.qTempoStacks = 0;
        }
        if ((b.siphonTimer || 0) > 0) {
          b.siphonTimer -= dt;
          if (b.siphonTimer <= 0) b.siphonBonus = 0;
        }
        if ((b.predatorMarkTimer || 0) > 0) {
          b.predatorMarkTimer -= dt;
          if (b.predatorMarkTimer <= 0) b.predatorMarks = 0;
        }
        if (b.shieldTimer && b.shieldTimer > 0) {
          b.shieldTimer -= dt;
          if (b.shieldTimer <= 0) b.shield = 0;
        }

        // Phase 2: bots on real kits tick their kit timers (windups, charges) every frame
        const botKit = window.MOBA_HEROES && window.MOBA_HEROES[b.heroType];
        if (kitBotReady(b.heroType)) botKit.tickActor(botActor(b), dt, performance.now());

        // Coyote R laser sight while charging (the kit counts the charge down and fires; stuns cancel it here)
        if ((b.rChargeTimer || 0) > 0) {
          if (b.stunTimer > 0) {
            b.rChargeTimer = 0;
            if (b.rLaserMesh) b.rLaserMesh.visible = false;
          } else {
            if (!b.rLaserMesh) {
              const lGrp = new THREE.Group();
              const beam = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.035, 11.5, 8),
                new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
              );
              beam.rotation.x = Math.PI / 2;
              beam.position.set(0, 1.35, 5.75);
              lGrp.add(beam);
              const muzzle = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 10, 8),
                new THREE.MeshBasicMaterial({ color: 0xfde047 })
              );
              muzzle.position.set(0, 1.35, 0.72);
              lGrp.add(muzzle);
              b.pivot.add(lGrp);
              b.rLaserMesh = lGrp;
            }
            b.rLaserMesh.visible = true;
          }
        } else if (b.rLaserMesh) {
          b.rLaserMesh.visible = false;
        }

        if (b.bleedTimer > 0 && b.bleedStacks > 0) {
          b.bleedTimer -= dt;
          b.bleedTickAccum = (b.bleedTickAccum || 0) + dt;
          if (b.bleedTickAccum >= 0.65) {
            b.bleedTickAccum -= 0.65;
            dealPlayerDamageToUnit({ kind: 'bot', ref: b }, Math.round(b.bleedStacks * bleedTickRate), { color: '#f43f5e', isDoT: true });
            if (b.respawnTimer > 0) return;
          }
          if (b.bleedTimer <= 0) {
            b.bleedStacks = 0;
            b.bleedTickAccum = 0;
          }
        }

        // Fountain Healing for low-HP bots
        const homeDist = Math.hypot(b.x - b.homeX, b.z - b.homeZ);
        if (homeDist <= 7.5 && b.hp < b.maxHp) {
          b.hp = Math.min(b.maxHp, b.hp + 220 * dt);
        }
        if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + (b.hpRegen || 0) * dt); // base HP regen (same as the player's)

        let isMoving = false;
        let airborneY = 0;
        if (b.leapTimer > 0) {
          b.leapTimer = Math.max(0, b.leapTimer - dt);
          const u = 1 - (b.leapTimer / (b.leapDur || 0.42));
          b.x = b.leapSx + (b.leapTx - b.leapSx) * u;
          b.z = b.leapSz + (b.leapTz - b.leapSz) * u;
          airborneY = Math.sin(u * Math.PI) * (b.leapHeight || 1.65);
          if (b.leapTimer <= 0 && b.leapOnLand) {
            const landFn = b.leapOnLand;
            b.leapOnLand = null;
            landFn();
          }
        } else if (b.dashTimer > 0) {
          const stepDt = Math.min(dt, b.dashTimer);
          b.x = THREE.MathUtils.clamp(b.x + (b.dashVx || 0) * stepDt, MAP.BOUNDS.minX, MAP.BOUNDS.maxX);
          b.z = THREE.MathUtils.clamp(b.z + (b.dashVz || 0) * stepDt, MAP.BOUNDS.minZ, MAP.BOUNDS.maxZ);
          b.dashTimer = Math.max(0, b.dashTimer - dt);
          if (b.dashTimer <= 0 && b.dashOnEnd) {
            const endFn = b.dashOnEnd;
            b.dashOnEnd = null;
            endFn();
          }
        } else if (stepUnitKnockback(b, dt, 'bot')) {
          if (b.respawnTimer > 0) return;
        } else if (b.stunTimer <= 0 && (b.rChargeTimer || 0) <= 0) {
          // =========================================================
          // TARGET ACQUISITION (Easy/Medium = Closest; Hard = Tactical Priority & Peel!)
          // =========================================================
          let bestTarget = null;
          let bestDist = 11.5;
          let bestScore = 9999;

          const considerCandidate = (cand, dist) => {
            if (dist > 11.5) return;
            if (!isHard) {
              // In Medium mode, give Enemy Heroes a slight priority edge over minions when within spell/attack range so bots cast spells on heroes!
              const heroBias = (!isEasy && (cand.kind === 'player' || cand.kind === 'bot') && dist <= 9.6) ? -3.2 : 0;
              const score = dist + heroBias;
              if (score < bestScore) {
                bestScore = score;
                bestDist = dist;
                bestTarget = cand;
              }
              return;
            }
            // Hard Mode Tactical Scoring (lower score = higher priority!)
            let score = dist;
            const u = cand.ref;
            const hpPct = u && u.maxHp ? (u.hp / u.maxHp) : 1.0;
            if (cand.kind === 'player' || cand.kind === 'bot') {
              score -= 4.5; // Prioritize Enemy Heroes over minions/structures
              if (hpPct < 0.38) score -= 5.0; // Execute low-HP heroes!
              const isSquishy = cand.kind === 'player'
                ? (getActiveHeroId() === 'coyote' || getActiveHeroId() === 'sorceress' || getActiveHeroId() === 'panther')
                : (u.heroType === 'coyote' || u.heroType === 'sorceress' || u.heroType === 'panther');
              if (isSquishy && (b.heroType === 'panther' || b.heroType === 'brawler' || b.heroType === 'coyote')) {
                score -= 2.8;
              }
            } else if (cand.kind === 'minion' && u.hp <= b.atk * 1.15) {
              score -= 2.2; // Last-hit low-HP minions when no hero threat
            }
            if (score < bestScore) {
              bestScore = score;
              bestDist = dist;
              bestTarget = cand;
            }
          };

          if (b.team === 1 && b.tauntTimer > 0 && playerProg.respawnTimer <= 0 && (hero.stealthTimer || 0) <= 0) {
            bestDist = Math.hypot(hero.x - b.x, hero.z - b.z);
            bestTarget = { kind: 'player', ref: hero };
          } else if (b.team === 0) {
            bots.forEach((eb) => {
              if (eb.team === 1 && eb.respawnTimer <= 0 && (eb.stealthTimer || 0) <= 0) {
                considerCandidate({ kind: 'bot', ref: eb }, Math.hypot(eb.x - b.x, eb.z - b.z));
              }
            });
            minions.forEach((em) => {
              if (em.team === 1 && em.hp > 0) {
                considerCandidate({ kind: 'minion', ref: em }, Math.hypot(em.x - b.x, em.z - b.z));
              }
            });
            structures.forEach((es) => {
              if (es.team === 1 && es.hp > 0 && isStructureVulnerable(es)) {
                considerCandidate({ kind: 'structure', ref: es }, Math.hypot(es.x - b.x, es.z - b.z));
              }
            });
            deployables.forEach((dp) => {
              if (dp.hp > 0 && dp.team === 1) considerCandidate({ kind: 'deployable', ref: dp }, Math.hypot(dp.x - b.x, dp.z - b.z));
            });
            if (b.lane === 'jungle' || (activePing && activePing.kind === 'boss')) {
              camps.forEach((c) => {
                if (c.respawnTimer <= 0 && c.hp > 0 && c.state !== 'leashing') {
                  considerCandidate({ kind: 'camp', ref: c }, Math.hypot(c.x - b.x, c.z - b.z));
                }
              });
            }
          } else {
            if (playerProg.respawnTimer <= 0 && (hero.stealthTimer || 0) <= 0) {
              considerCandidate({ kind: 'player', ref: hero }, Math.hypot(hero.x - b.x, hero.z - b.z));
            }
            bots.forEach((ab) => {
              if (ab.team === 0 && ab.respawnTimer <= 0 && (ab.stealthTimer || 0) <= 0) {
                considerCandidate({ kind: 'bot', ref: ab }, Math.hypot(ab.x - b.x, ab.z - b.z));
              }
            });
            minions.forEach((am) => {
              if (am.team === 0 && am.hp > 0) {
                considerCandidate({ kind: 'minion', ref: am }, Math.hypot(am.x - b.x, am.z - b.z));
              }
            });
            structures.forEach((as) => {
              if (as.team === 0 && as.hp > 0 && isStructureVulnerable(as)) {
                considerCandidate({ kind: 'structure', ref: as }, Math.hypot(as.x - b.x, as.z - b.z));
              }
            });
            deployables.forEach((dp) => {
              if (dp.hp > 0 && (dp.team || 0) === 0) considerCandidate({ kind: 'deployable', ref: dp }, Math.hypot(dp.x - b.x, dp.z - b.z));
            });
            if (b.lane === 'jungle') {
              camps.forEach((c) => {
                if (c.respawnTimer <= 0 && c.hp > 0 && c.state !== 'leashing') {
                  considerCandidate({ kind: 'camp', ref: c }, Math.hypot(c.x - b.x, c.z - b.z));
                }
              });
            }
          }

          // Hard Mode Bodyguard Peel: If an enemy melee diver is within 3.5m of an allied Carry (or Player!), target that diver to peel!
          let allyToPeel = null;
          if (isHard && b.heroType === 'bodyguard') {
            const allies = bots.filter((al) => al.team === b.team && al !== b && al.respawnTimer <= 0);
            if (b.team === 0 && playerProg.respawnTimer <= 0) {
              allies.unshift(hero);
            }
            for (let aIdx = 0; aIdx < allies.length; aIdx++) {
              const al = allies[aIdx];
              if (Math.hypot(al.x - b.x, al.z - b.z) > 10.5) continue;
              // Find closest enemy hero attacking this ally
              if (b.team === 1 && playerProg.respawnTimer <= 0 && (hero.stealthTimer || 0) <= 0 && Math.hypot(hero.x - al.x, hero.z - al.z) <= 3.6) {
                allyToPeel = al;
                bestTarget = { kind: 'player', ref: hero };
                bestDist = Math.hypot(hero.x - b.x, hero.z - b.z);
                break;
              }
              const diver = bots.find((eb) => eb.team !== b.team && eb.respawnTimer <= 0 && Math.hypot(eb.x - al.x, eb.z - al.z) <= 3.6);
              if (diver) {
                allyToPeel = al;
                bestTarget = { kind: 'bot', ref: diver };
                bestDist = Math.hypot(diver.x - b.x, diver.z - b.z);
                break;
              }
            }
          }

          const isHeroTarget = bestTarget && (bestTarget.kind === 'player' || bestTarget.kind === 'bot');

          // =========================================================
          // SPELL CASTING: MEDIUM (Simple Spells) & HARD (Tactical Combos)
          // Easy Mode strictly uses Basic Attacks (AAs) ONLY!
          // =========================================================
          if (!isEasy && bestTarget && bestTarget.kind !== 'structure' && b.atkAnimTimer <= 0) {
            const tx = bestTarget.ref.x;
            const tz = bestTarget.ref.z;
            b.facing = Math.atan2(tx - b.x, tz - b.z);

            // 1. PANTHER ROGUE BOT (R: Nightprowl Stealth Shimmer -> E: Predator's Leap -> Q: 2-Hit Slash & Gnash Sequence)
            if (b.heroType === 'panther' && kitBotReady('panther')) {
              // (Phase 2: the brain picks ability + aim; the real Panther kit casts)
              const kit = window.MOBA_HEROES.panther;
              const actor = botActor(b);
              b.aimTarget = bestTarget;
              if (b.level >= 4 && b.cdR <= 0 && isHeroTarget && bestDist <= 10.5 && bestDist > 3.2 && (b.stealthTimer || 0) <= 0) {
                kit.castFor(actor, 'R'); // slip into stealth, then pounce from it
              } else {
                const leapMax = (b.stealthTimer || 0) > 0 ? 7.8 * 1.65 : 7.8;
                if (b.cdE <= 0 && bestDist <= leapMax && (bestDist >= 2.2 || isHeroTarget)) {
                  kit.castFor(actor, 'E');
                } else if (b.cdQ <= 0 && bestDist <= 2.5) {
                  kit.castFor(actor, 'Q');
                }
              }
            }

            // 2. PIT BRAWLER BOT (she/her: E: 1st Vault Dash -> 2nd Rebound Slide Dash + Shield, R: 3D Pit Arena Wall, Q: 0.23s Windup MMA Stun Kick)
            else if (b.heroType === 'brawler' && kitBotReady('brawler')) {
              // (Phase 2: the brain picks; the real Brawler kit casts)
              const kit = window.MOBA_HEROES.brawler;
              const actor = botActor(b);
              b.aimTarget = bestTarget;
              if ((b.eRecast || 0) > 0 && bestDist <= 5.5) {
                kit.castFor(actor, 'E'); // rebound slide through them
              } else if (b.cdE <= 0 && bestDist <= 5.8 && (bestDist >= 2.2 || b.hp / b.maxHp < 0.65)) {
                kit.castFor(actor, 'E');
              } else if (b.level >= 4 && b.cdR <= 0 && isHeroTarget && bestDist <= 3.6) {
                kit.castFor(actor, 'R');
              } else if (b.cdQ <= 0 && bestDist <= 2.5) {
                kit.castFor(actor, 'Q');
              }
            }

            // 3. COLISEUM BODYGUARD BOT (E: Crowd Dive + Rescue Shield -> R: AoE Taunt -> Q: 0.24s Windup Haymaker Knockback)
            else if (b.heroType === 'bodyguard' && kitBotReady('bodyguard')) {
              // (Phase 2: the brain picks ability + aim; the real Bodyguard kit casts)
              const kit = window.MOBA_HEROES.bodyguard;
              const actor = botActor(b);
              b.aimTarget = bestTarget;
              if (b.cdE <= 0 && bestDist <= 7.8 && (bestDist >= 2.5 || allyToPeel)) {
                kit.castFor(actor, 'E');
              } else if (b.level >= 4 && b.cdR <= 0 && isHeroTarget && bestDist <= 4.6) {
                kit.castFor(actor, 'R');
              } else if (b.cdQ <= 0 && bestDist <= 2.4) {
                kit.castFor(actor, 'Q');
              }
            }

            // 4. ASTRAL SORCERESS BOT (E: Defensive/Offensive Rift Stride -> R: 0.50s Windup + 3D Cataclysm Monolith -> Q: 0.38s Telegraph Starfall Pillar)
            else if (b.heroType === 'sorceress' && kitBotReady('sorceress')) {
              // (Phase 2: the brain picks ability + aim; the real Sorceress kit casts)
              const kit = window.MOBA_HEROES.sorceress;
              const actor = botActor(b);
              b.aimTarget = bestTarget;
              const threatened = bestDist <= 4.2;
              if (b.cdE <= 0 && (threatened || (bestDist <= 7.5 && isHeroTarget))) {
                // Rift Stride toward a point: straight away from a close threat, otherwise a sidestep; homing bolts fly at the end
                const away = Math.atan2(b.x - tx, b.z - tz);
                const ang = threatened ? away : away + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
                b.aimTarget = null;
                b.aimX = b.x + Math.sin(ang) * 4;
                b.aimZ = b.z + Math.cos(ang) * 4;
                kit.castFor(actor, 'E');
                b.aimTarget = bestTarget;
              } else if (b.level >= 4 && b.cdR <= 0 && isHeroTarget && bestDist <= 8.8) {
                kit.castFor(actor, 'R');
              } else if (b.cdQ <= 0 && bestDist <= 9.4) {
                kit.castFor(actor, 'Q');
              }
            }

            // 5. COYOTE CROSSBOWMAN BOT (E: 0.22s Windup + 0.48s Arcing Shrapnel Grenade, Q: 3-Bolt Spread Fan Volley, R: 1.10s Laser Sight Charge -> Giant Heartseeker Bolt)
            // (Phase 2: the brain only picks the ability and the aim; the real Coyote kit does the rest)
            else if (b.heroType === 'coyote' && kitBotReady('coyote')) {
              const kit = window.MOBA_HEROES.coyote;
              const actor = botActor(b);
              b.aimTarget = bestTarget;
              if (b.level >= 4 && b.cdR <= 0 && isHeroTarget && bestDist <= 11.0 && ((bestTarget.ref.bleedStacks || 0) >= 3 || bestTarget.ref.hp / bestTarget.ref.maxHp < 0.35)) {
                kit.castFor(actor, 'R');
                spawnFloat(b.x, 2.75, b.z, b.name + ': LOCKING HEARTSEEKER...', '#f43f5e');
              } else if (b.cdE <= 0 && bestDist <= 9.8 && isHeroTarget) {
                kit.castFor(actor, 'E');
              } else if (b.cdQ <= 0 && bestDist <= 8.4) {
                kit.castFor(actor, 'Q');
              }
            }

            // 7. SAW SCIENTIST BOT (jungle diver): rev the saw up close and shut it off when nobody's in reach,
            //    drink the injection when hurt in a fight, hurl the boomerang blade at a hero out of reach (it pulls them back)
            else if (b.heroType === 'scientist' && kitBotReady('scientist')) {
              const kit = window.MOBA_HEROES.scientist;
              const actor = botActor(b);
              b.aimTarget = bestTarget;
              const edge = bestDist - ((bestTarget.ref && bestTarget.ref.r) || 0.5); // gap to their edge (camps are big)
              if (b.sawOn && (edge > 3.4 || (b.sawT || 0) > 5.0)) {
                kit.castFor(actor, 'Q'); // saw off
              } else if (b.level >= 4 && b.cdR <= 0 && !b.scBlade && isHeroTarget && bestDist >= 4.0 && bestDist <= 10.0) {
                kit.castFor(actor, 'R');
              } else if (b.cdE <= 0 && b.hp / b.maxHp < 0.6 && bestDist <= 5.0) {
                kit.castFor(actor, 'E');
              } else if (!b.sawOn && b.cdQ <= 0 && edge <= 2.6 && (isHeroTarget || bestTarget.kind === 'camp')) {
                kit.castFor(actor, 'Q'); // saw on
              }
            }

            // 6. LITTLE FAIRY BOT (support): Lullaby on a crowd, Pixie Hop away when hurt (or onto a weak hero),
            //    Pop! bubble onto her target (its dust heals allies standing in it)
            else if (b.heroType === 'fairy' && kitBotReady('fairy')) {
              const kit = window.MOBA_HEROES.fairy;
              const actor = botActor(b);
              b.aimTarget = bestTarget;
              const foes = actor.hostiles().filter((t) => t.kind !== 'structure' && Math.hypot(t.x - b.x, t.z - b.z) <= 4.2);
              const foeHeroes = foes.filter((t) => t.kind === 'bot' || t.kind === 'player').length;
              const charges = b.hopCharges === undefined ? 2 : b.hopCharges;
              const hurt = b.hp / b.maxHp < 0.4;
              if (b.level >= 4 && b.cdR <= 0 && (foeHeroes >= 2 || (foeHeroes >= 1 && foes.length >= 3))) {
                kit.castFor(actor, 'R');
              } else if (charges > 0 && hurt && bestDist <= 4.5) {
                // escape: hop to the friendly unit farthest from the threat (within hop range)
                let pick = null, far = -1;
                actor.allies().forEach((a) => {
                  const dSelf = Math.hypot(a.x - b.x, a.z - b.z);
                  const dFoe = Math.hypot(a.x - tx, a.z - tz);
                  if (dSelf <= 7.0 && dFoe > far) { far = dFoe; pick = a; }
                });
                if (pick && far > bestDist + 2) {
                  b.aimTarget = null; b.aimX = pick.x; b.aimZ = pick.z;
                  kit.castFor(actor, 'E');
                  b.aimTarget = bestTarget;
                }
              } else if (charges > 1 && isHeroTarget && bestDist <= 7.0 && bestTarget.ref.hp / bestTarget.ref.maxHp < 0.5 && !hurt) {
                kit.castFor(actor, 'E'); // pounce on a weak hero: HUSH stun + dust under them
              } else if (b.cdQ <= 0 && bestDist <= 9.0) {
                kit.castFor(actor, 'Q');
              }
            }

            // 8. CANNON IMP BOT (solo): plant the turret when a fight starts (hero in range or a wave to push), rocket jump /
            //    hop home when hurt, hop onto a weak hero when unburdened, Superball when it lines up 2+ heroes or a weak one.
            //    (Picking the cannon back up / salvaging scrap happens in the kit's tickActor once the fight is over.)
            else if (b.heroType === 'imp' && kitBotReady('imp')) {
              const kit = window.MOBA_HEROES.imp;
              const actor = botActor(b);
              b.aimTarget = bestTarget;
              const carryingNow = !b.impTurret && !b.impScrap && !b.impPendingQ;
              const hurt = b.hp / b.maxHp < 0.35;
              const waveNear = bestTarget.kind === 'minion' &&
                actor.hostiles().filter((t) => t.kind === 'minion' && Math.hypot(t.x - b.x, t.z - b.z) <= 8.5).length >= 3;
              if (b.cdE <= 0 && hurt && isHeroTarget && bestDist <= 5.5) {
                const ang = Math.atan2(b.homeX - b.x, b.homeZ - b.z);
                b.aimTarget = null;
                b.aimX = b.x + Math.sin(ang) * 9;
                b.aimZ = b.z + Math.cos(ang) * 9;
                kit.castFor(actor, 'E');
                b.aimTarget = bestTarget;
              } else if (b.level >= 4 && b.cdR <= 0 && !b.impScrap && isHeroTarget && kit.botWantsSuperball(b, actor, bestTarget)) {
                kit.castFor(actor, 'R');
              } else if (carryingNow && b.cdQ <= 0 && !hurt && ((isHeroTarget && bestDist <= 9.0) || waveNear)) {
                kit.castFor(actor, 'Q');
              } else if (!carryingNow && b.impTurret && b.cdE <= 0 && !hurt && isHeroTarget && bestDist >= 2.5 && bestDist <= 4.5 &&
                         bestTarget.ref.hp / bestTarget.ref.maxHp < 0.5) {
                kit.castFor(actor, 'E'); // short hop onto a weak hero
              }
            }
          }

          // =========================================================
          // MOVEMENT, HARD-MODE ORB-WALK KITING, JUNGLE GANKS & BASIC ATTACKS
          // =========================================================
          let gx = b.x, gz = b.z;
          const lowHpRetreat = !duelMode && (b.tauntTimer <= 0) && ((b.hp / b.maxHp < (isHard ? 0.28 : 0.22)) || (b.team === 0 && activePing && activePing.kind === 'retreat'));

          // Hard Mode Tower Dive Safety: Don't walk under an active enemy Tower without allied minions unless executing < 22% HP target
          let unsafeTowerDive = false;
          if (isHard && bestTarget && bestTarget.kind !== 'structure') {
            const enemyTower = structures.find((s) => s.team !== b.team && s.hp > 0 && s.kind === 'tower' && Math.hypot(bestTarget.ref.x - s.x, bestTarget.ref.z - s.z) <= 8.5);
            if (enemyTower) {
              const allyMinionUnderTower = minions.some((m) => m.team === b.team && m.hp > 0 && Math.hypot(m.x - enemyTower.x, m.z - enemyTower.z) <= 8.5);
              const canExecute = bestTarget.ref.hp / (bestTarget.ref.maxHp || 1500) < 0.22 && b.hp / b.maxHp > 0.55;
              if (!allyMinionUnderTower && !canExecute) {
                unsafeTowerDive = true;
              }
            }
          }

          const targetRad = (bestTarget && bestTarget.ref && bestTarget.ref.r) ? bestTarget.ref.r : 0;
          if (lowHpRetreat || unsafeTowerDive) {
            gx = b.homeX;
            gz = b.homeZ;
          } else if (b.team === 0 && activePing && (activePing.kind === 'attack' || activePing.kind === 'group' || activePing.kind === 'boss')) {
            gx = activePing.x;
            gz = activePing.z;
          } else if (bestTarget && bestDist <= b.range + targetRad + 0.38 && b.leapTimer <= 0 && b.dashTimer <= 0 && b.atkAnimTimer <= 0) {
            b.facing = Math.atan2(bestTarget.ref.x - b.x, bestTarget.ref.z - b.z);
            if (b.atkCd <= 0) {
              const spec = (DATA.HERO_SPECS && DATA.HERO_SPECS[b.heroType]) || null;
              const baseInterval = spec ? spec.atkCd : 1.12;
              b.atkCd = baseInterval / (1 + (b.level - 1) * 0.035);
              const lockedTarget = bestTarget;

              // every hero's bot basic attack comes from its kit (the brain only picks the target)
              if (kitBotReady(b.heroType)) {
                b.aimTarget = lockedTarget;
                const actor = botActor(b);
                window.MOBA_HEROES[b.heroType].basicAttackFor(actor, actor.stats(), false);
              }
            } else if (isHard && b.range > 4.0 && b.atkAnimTimer <= 0 && bestDist < 5.4 && bestTarget.kind !== 'structure') {
              // Hard Mode Ranged Orb-Walk Kiting: step backward toward allied fountain between basic attacks!
              const awayAng = Math.atan2(b.x - bestTarget.ref.x, b.z - bestTarget.ref.z);
              gx = THREE.MathUtils.clamp(b.x + Math.sin(awayAng) * 3.0 + (b.homeX - b.x) * 0.08, MAP.BOUNDS.minX, MAP.BOUNDS.maxX);
              gz = THREE.MathUtils.clamp(b.z + Math.cos(awayAng) * 3.0, MAP.BOUNDS.minZ, MAP.BOUNDS.maxZ);
            }
          } else if (bestTarget) {
            gx = bestTarget.ref.x;
            gz = bestTarget.ref.z;
          } else if (kitBotReady(b.heroType) && window.MOBA_HEROES[b.heroType].botGoal && window.MOBA_HEROES[b.heroType].botGoal(b)) {
            // nothing to fight: the kit can send the bot somewhere (the Imp walks back to his turret / scrap)
            const kg = window.MOBA_HEROES[b.heroType].botGoal(b);
            gx = kg.x;
            gz = kg.z;
          } else if (duelMode) {
            gx = duelMode.cx; // duel: nobody in sight (stealth, knocked away): head back to the middle
            gz = duelMode.cz;
          } else if (b.lane === 'jungle') {
            // Hard Mode Panther Jungle Ganks: If a lane enemy Hero is < 75% HP or overextended, roam to gank them!
            let gankTarget = null;
            if (isHard && b.level >= 2) {
              if (b.team === 1 && playerProg.respawnTimer <= 0 && (hero.hp / hero.maxHp < 0.78 || hero.x > -8)) {
                gankTarget = hero;
              } else {
                gankTarget = bots.find((eb) => eb.team !== b.team && eb.respawnTimer <= 0 && (eb.hp / eb.maxHp < 0.78 || (b.team === 0 ? eb.x < 8 : eb.x > -8)));
              }
            }
            const liveCamp = camps.find((c) => c.respawnTimer <= 0 && !c.isBoss && (b.team === 0 ? c.homeX < 0 : c.homeX > 0));
            if (gankTarget && (!liveCamp || b.level >= 3)) {
              gx = gankTarget.x;
              gz = gankTarget.z;
            } else if (liveCamp) {
              gx = liveCamp.homeX;
              gz = liveCamp.homeZ;
            } else {
              gx = 0;
              gz = -18;
            }
          } else {
            const lg = laneGoal(b);
            gx = lg.x;
            gz = lg.z;
          }

          const navPt = MAP.navNextPoint(b.x, b.z, gx, gz);
          const dx = navPt.x - b.x;
          const dz = navPt.z - b.z;
          const distGoal = Math.hypot(dx, dz);
          const isKitingStep = isHard && b.range > 4.0 && bestTarget && bestDist < 5.4;
          if (distGoal > 0.6 && b.atkAnimTimer <= 0 && b.leapTimer <= 0 && b.dashTimer <= 0 && (!bestTarget || bestDist > b.range + targetRad + 0.25 || lowHpRetreat || unsafeTowerDive || isKitingStep)) {
            isMoving = true;
            const bonusSpd = (b.siphonBonus || 0) + (b.stealthTimer > 0 ? 0.32 : 0);
            const spdKit = window.MOBA_HEROES && window.MOBA_HEROES[b.heroType];
            const kitSpdMult = (spdKit && spdKit.botSpeedMult && kitBotReady(b.heroType)) ? spdKit.botSpeedMult(b) : 1;
            const spd = b.spd * (1 + bonusSpd) * (b.slowTimer > 0 ? 0.68 : 1.0) * kitSpdMult;
            const steered = steerUnitAroundStructures(b, dx / distGoal, dz / distGoal, bestTarget ? bestTarget.ref : null);
            b.x += steered.vx * spd * dt;
            b.z += steered.vz * spd * dt;
            b.facing = Math.atan2(steered.vx, steered.vz);
          }
        }

        // Update 3D Transform & Mixamo Animation State (Always runs even when stunned so HP bar & animations stay live!)
        b.airborneY = airborneY;
        b.pivot.position.set(b.x, airborneY, b.z);
        if (b.groundRing) b.groundRing.position.y = 0.03 - airborneY;
        b.pivot.rotation.y = b.facing;
        updateUnitSlowVisual(b, b.pivot, 0.85, dt);

        // Shield bubble (same look as the player's)
        if ((b.shield || 0) > 0 && !b.shieldBubble) {
          b.shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.22, depthWrite: false }));
          b.shieldBubble.position.y = 1.15;
          b.pivot.add(b.shieldBubble);
        }
        if (b.shieldBubble) b.shieldBubble.visible = (b.shield || 0) > 0;

        // Panther Rogue Bot R: Nightprowl Translucent Twilight-Teal Stealth Shimmer + Gnash Bite Lunge!
        if (b.heroType === 'panther' && b.meshes && b.meshes.length > 0) {
          const wantStealth = (b.stealthTimer || 0) > 0 ? 1.0 : 0.0;
          const curBlend = b.stealthBlend || 0;
          if (Math.abs(wantStealth - curBlend) > 0.005) {
            const rate = wantStealth > curBlend ? (dt / 0.55) : (dt / 0.40);
            b.stealthBlend = wantStealth > curBlend ? Math.min(1, curBlend + rate) : Math.max(0, curBlend - rate);
            const sb = b.stealthBlend;
            b.meshes.forEach((m) => {
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              mats.forEach((mat) => {
                if (!mat) return;
                mat.transparent = sb > 0.01;
                mat.opacity = 1.0 - sb * 0.58;
                if (mat.color) mat.color.setRGB(1.0 - sb * 0.55, 1.0 - sb * 0.12, 1.0 - sb * 0.15);
              });
            });
          }
        }
        if (b.model && b.baseModelPos) {
          if ((b.gnashAnim || 0) > 0) {
            b.gnashAnim = Math.max(0, b.gnashAnim - dt);
            const u = 1.0 - (b.gnashAnim / 0.22);
            const lunge = Math.sin(u * Math.PI);
            b.model.position.set(b.baseModelPos.x, b.baseModelPos.y + lunge * 0.16, b.baseModelPos.z + lunge * 0.55);
          } else {
            b.model.position.copy(b.baseModelPos);
          }
        }

        const vis = b.team === 0 || isPointVisibleToOrder(b.x, b.z);
        b.pivot.visible = vis;
        if (!vis) { const hk = window.MOBA_HEROES && window.MOBA_HEROES[b.heroType]; if (hk && hk.botHide) hk.botHide(b); }
        if (b.bowPivot) b.bowPivot.visible = vis;

        if (b.mixer && vis) {
          const isProwlCrawl = b.heroType === 'panther' && (b.stealthTimer || 0) > 0 && !!b.actions.crawl;
          // kit locomotion sets (the Imp runs/idles differently with and without his cannon)
          const locoKit = kitBotReady(b.heroType) && window.MOBA_HEROES[b.heroType].botLocomotion ? window.MOBA_HEROES[b.heroType].botLocomotion(b) : null;
          const idleAct = (locoKit && b.actions[locoKit.idle]) || b.actions.idle;
          const runAct = (locoKit && b.actions[locoKit.move]) || b.actions.run;
          const moveAct = isProwlCrawl ? b.actions.crawl : (runAct || idleAct);
          const wantAct = (b.stunTimer <= 0 && b.atkAnimTimer > 0)
            ? (b.actions[b.animSlot || 'punch'] || b.actions.punch || idleAct)
            : (isMoving || isProwlCrawl ? moveAct : idleAct);
          if (wantAct && (wantAct !== b.activeAction || b.animForceRestart)) {
            b.animForceRestart = false;
            if (b.activeAction && b.activeAction !== wantAct) b.activeAction.fadeOut(0.08);
            wantAct.reset();
            if (b.stunTimer <= 0 && b.atkAnimTimer > 0) {
              wantAct.time = b.animStartTime || 0;
              wantAct.setEffectiveTimeScale(b.animTimeScale || 1.0);
            } else {
              wantAct.setEffectiveTimeScale(1.0);
            }
            wantAct.fadeIn(0.08).play();
            b.activeAction = wantAct;
          }
          if (b.activeAction && b.activeAction === runAct) {
            b.activeAction.setEffectiveTimeScale(b.slowTimer > 0 ? 0.62 : 1.0);
          } else if (b.activeAction && b.activeAction === b.actions.crawl) {
            b.activeAction.setEffectiveTimeScale(isMoving ? 1.38 : 0.18);
          }
          b.mixer.update(dt);
          // kit procedural motion on the bot's own skeleton (after the mixer, like the player's postMixer)
          const visKit = window.MOBA_HEROES && window.MOBA_HEROES[b.heroType];
          if (visKit && visKit.botVisual) visKit.botVisual(b, dt, { moving: isMoving });

          if (b.bowPivot && b.rightHand && b.leftHand) {
            b.model.updateMatrixWorld(true);
            b.rightHand.getWorldPosition(rhTmp);
            b.leftHand.getWorldPosition(lhTmp);
            b.bowPivot.position.copy(rhTmp);
            const fx = Math.sin(b.facing);
            const fz = Math.cos(b.facing);
            bowDirTmp.set(rhTmp.x + fx, rhTmp.y, rhTmp.z + fz);
            b.bowPivot.up.set(0, 1, 0);
            b.bowPivot.lookAt(bowDirTmp);
          }
        }

        // Update Nameplate (always updates HP bar & Stun/Taunt/Slow/Bleed tags immediately!)
        if (vis) {
          const sp = projectToScreen(b.x, 2.45, b.z);
          b.plate.style.display = sp.visible ? 'flex' : 'none';
          b.plate.style.left = sp.x + 'px';
          b.plate.style.top = sp.y + 'px';
          b.plate.querySelector('.plate-hp').style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
          const shEl = b.plate.querySelector('.plate-sh');
          if (shEl) shEl.style.width = Math.max(0, ((b.shield || 0) / b.maxHp) * 100) + '%';
          b.plate.querySelector('.plate-tag').textContent =
            'Lv' + b.level + ' ' + b.name +
            (b.stunTimer > 0 ? ' [⚡ STUNNED]' : '') +
            (b.tauntTimer > 0 ? ' [💢 TAUNTED]' : '') +
            (b.slowTimer > 0 ? ' [❄️ SLOWED]' : '') +
            ((b.predatorMarks || 0) > 0 && (b.predatorMarkTimer || 0) > 0 ? ' [🐾x' + b.predatorMarks + ']' : '') +
            (b.bleedStacks > 0 ? ' [🩸x' + b.bleedStacks + ']' : '');
        } else {
          b.plate.style.display = 'none';
        }
      });
    }

    function applyBotDamageToTarget(targetObj, dmg, attackerBot = null, dmgType = 'physical', attackerObj = null) {
      if (!targetObj || !targetObj.ref) return;
      const u = targetObj.ref;
      if (targetObj.kind === 'structure' && !isStructureVulnerable(u)) return;
      if (targetObj.kind === 'camp') {
        if (u.state === 'leashing') return;
        if (attackerBot) {
          u.state = 'aggro';
          u.aggroTarget = attackerBot;
          u.patience = 5.0;
        }
      }
      if (targetObj.kind === 'deployable') {
        if (u.hp <= 0) return;
        const mitigated = Math.max(1, Math.round(dmg * (100 / (100 + unitResist(u)))));
        u.hp -= mitigated;
        if (u.onDamaged) u.onDamaged(mitigated);
        if (u.hp <= 0) {
          u.hp = 0;
          const i = deployables.indexOf(u);
          if (i >= 0) deployables.splice(i, 1);
          if (u.onDestroyed) u.onDestroyed();
        }
        return;
      }
      const atkRef = attackerObj || (attackerBot ? { kind: 'bot', ref: attackerBot } : null);
      if (targetObj.kind === 'player' || (targetObj.kind === 'bot' && u.team === 0)) {
        damageOrderHeroOrBot(u, dmg, dmgType, atkRef);
      } else {
        const res = unitResist(u);
        const mitigated = Math.max(1, Math.round(dmg * (100 / (100 + res))));
        u.hp -= targetObj.kind === 'bot' ? absorbShield(u, mitigated) : mitigated;
        if (u.hp <= 0) {
          handleUnitDeath(targetObj);
        }
      }
    }

    // Snapshot inside/outside state when Pit Brawler casts R (Pit Arena)
    function onArenaSpawned(ar) {
      if (!ar) return;
      bots.forEach((b) => {
        if (b.respawnTimer <= 0) b.wasInsideArena = Math.hypot(b.x - ar.x, b.z - ar.z) <= ar.r;
      });
      minions.forEach((m) => {
        if (m.hp > 0) m.wasInsideArena = Math.hypot(m.x - ar.x, m.z - ar.z) <= ar.r;
      });
      camps.forEach((c) => {
        if (c.respawnTimer <= 0) c.wasInsideArena = Math.hypot(c.x - ar.x, c.z - ar.z) <= ar.r;
      });
    }

    // Enforce Pit Arena Coliseum Wall on ENEMY units only (Teammates can freely enter & leave an allied Pit Arena!)
    function clampUnitToArena(u, ar, uTeam = 1) {
      if (!ar || !u) return;
      const arTeam = ar.team !== undefined ? ar.team : 0;
      if (uTeam === arTeam) return;
      let wasIn;
      if (ar.insideMap) {
        if (!ar.insideMap.has(u)) {
          ar.insideMap.set(u, Math.hypot(u.x - ar.x, u.z - ar.z) <= ar.r);
        }
        wasIn = ar.insideMap.get(u);
      } else {
        if (u.wasInsideArena === undefined) {
          u.wasInsideArena = Math.hypot(u.x - ar.x, u.z - ar.z) <= ar.r;
        }
        wasIn = u.wasInsideArena;
      }
      const dx = u.x - ar.x;
      const dz = u.z - ar.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const ur = u.r || 0.45;
      if (wasIn) {
        if (d > ar.r - ur) {
          u.x = ar.x + (dx / d) * (ar.r - ur);
          u.z = ar.z + (dz / d) * (ar.r - ur);
        }
      } else if (d < ar.r + ur) {
        u.x = ar.x + (dx / d) * (ar.r + ur);
        u.z = ar.z + (dz / d) * (ar.r + ur);
      }
    }

    // Pure radial circle separation for living Towers/Barracks/Ancients (zero sideways teleport so units never rubber-band!)
    function pushUnitOutOfStructure(u, s) {
      if (!s || s.hp <= 0) return;
      const dx = u.x - s.x;
      const dz = u.z - s.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const minR = (u.r || 0.42) + s.r + 0.24;
      if (d < minR) {
        u.x = s.x + (dx / d) * minR;
        u.z = s.z + (dz / d) * minR;
      }
    }

    // Smooth forward tangential velocity steering around Structures & Map Obstacles so Bots and Minions glide around Towers/Barracks at normal speed
    function steerUnitAroundStructures(u, dirX, dirZ, targetRef = null) {
      let vx = dirX;
      let vz = dirZ;
      const ur = u.r || 0.45;
      for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (!s || s.hp <= 0 || s === targetRef) continue;
        const toSx = s.x - u.x;
        const toSz = s.z - u.z;
        const d = Math.hypot(toSx, toSz) || 0.01;
        const avoidR = ur + s.r + 1.55;
        if (d < avoidR) {
          const nx = toSx / d;
          const nz = toSz / d;
          const dot = vx * nx + vz * nz;
          if (dot > -0.05) {
            // Two tangents around the structure; pick the one aligned with current travel direction (or away from map border on dead-center approach)
            const t1x = -nz, t1z = nx;
            const t2x = nz, t2z = -nx;
            const d1 = vx * t1x + vz * t1z;
            const d2 = vx * t2x + vz * t2z;
            let tx, tz;
            if (Math.abs(d1 - d2) > 0.08) {
              tx = d1 >= d2 ? t1x : t2x;
              tz = d1 >= d2 ? t1z : t2z;
            } else {
              // Tie-breaker: steer toward inner lane (z closer to 0)
              const z1 = Math.abs(s.z + t1z * 2.0);
              const z2 = Math.abs(s.z + t2z * 2.0);
              tx = z1 <= z2 ? t1x : t2x;
              tz = z1 <= z2 ? t1z : t2z;
            }
            const blend = THREE.MathUtils.clamp((avoidR - d) / 1.35, 0.25, 1.0);
            vx = vx * (1 - blend) + (tx - nx * 0.18) * blend;
            vz = vz * (1 - blend) + (tz - nz * 0.18) * blend;
            const len = Math.hypot(vx, vz) || 1.0;
            vx /= len;
            vz /= len;
          }
        }
      }
      return { vx, vz };
    }

    // Pairwise Circle Separation so Minions & Bots never stack on top of each other or hide Heroes!
    function resolveUnitSeparation() {
      const ar = ctx.getArena ? ctx.getArena() : null;
      const playerDashing = hero.dashTimer > 0;

      for (let pass = 0; pass < 2; pass++) {
        // 1. Minion <-> Minion Separation
        for (let i = 0; i < minions.length; i++) {
          const a = minions[i];
          if (a.hp <= 0) continue;
          for (let j = i + 1; j < minions.length; j++) {
            const b = minions[j];
            if (b.hp <= 0) continue;
            let dx = b.x - a.x;
            let dz = b.z - a.z;
            let d = Math.hypot(dx, dz);
            const minSep = a.r + b.r + 0.82;
            if (d < minSep) {
              if (d < 0.02) {
                const ang = ((i * 7 + j * 13) % 12) * (Math.PI / 6);
                dx = Math.cos(ang);
                dz = Math.sin(ang);
                d = 1.0;
              }
              const push = (minSep - d) * 0.5;
              const nx = dx / d;
              const nz = dz / d;
              a.x -= nx * push;
              a.z -= nz * push;
              b.x += nx * push;
              b.z += nz * push;
            }
          }
        }

        // 2. Minion <-> Player Hero & Minion <-> Bots Separation (Never push enemies away while Player is dashing!)
        for (let i = 0; i < minions.length; i++) {
          const m = minions[i];
          if (m.hp <= 0) continue;

          if (playerProg.respawnTimer <= 0 && !playerDashing) {
            let dx = m.x - hero.x;
            let dz = m.z - hero.z;
            let d = Math.hypot(dx, dz);
            const minSep = m.r + (hero.r || 0.52);
            if (d < minSep) {
              if (d < 0.02) { dx = 1; dz = 0; d = 1; }
              const push = minSep - d;
              m.x += (dx / d) * push;
              m.z += (dz / d) * push;
            }
          }

          for (let j = 0; j < bots.length; j++) {
            const b = bots[j];
            if (b.respawnTimer > 0) continue;
            let dx = m.x - b.x;
            let dz = m.z - b.z;
            let d = Math.hypot(dx, dz);
            const minSep = m.r + b.r + 0.55;
            if (d < minSep) {
              if (d < 0.02) {
                const ang = ((i * 5 + j * 11) % 12) * (Math.PI / 6);
                dx = Math.cos(ang);
                dz = Math.sin(ang);
                d = 1.0;
              }
              const push = minSep - d;
              m.x += (dx / d) * push * 0.85;
              m.z += (dz / d) * push * 0.85;
              b.x -= (dx / d) * push * 0.15;
              b.z -= (dz / d) * push * 0.15;
            }
          }

          // Clamp Minions outside Trees/Pillars, Towers/Barracks/Ancients & Pit Arena Wall
          for (let k = 0; k < mapObstacles.length; k++) {
            const o = mapObstacles[k];
            const dx = m.x - o.x;
            const dz = m.z - o.z;
            const d = Math.hypot(dx, dz) || 0.01;
            if (d < m.r + o.r) {
              m.x = o.x + (dx / d) * (m.r + o.r);
              m.z = o.z + (dz / d) * (m.r + o.r);
            }
          }
          for (let k = 0; k < structures.length; k++) {
            pushUnitOutOfStructure(m, structures[k], i);
          }
          if (ar) clampUnitToArena(m, ar, m.team);
          for (let k = 0; k < botArenas.length; k++) {
            clampUnitToArena(m, botArenas[k], m.team);
          }
        }

        // 3. Bot <-> Bot & Bot <-> Player Hero + Map Obstacles, Structures & Pit Arena Wall Separation
        if (playerProg.respawnTimer <= 0) {
          for (let k = 0; k < botArenas.length; k++) {
            clampUnitToArena(hero, botArenas[k], 0);
          }
        }
        for (let i = 0; i < bots.length; i++) {
          const a = bots[i];
          if (a.respawnTimer > 0) continue;
          if (playerProg.respawnTimer <= 0 && !playerDashing) {
            let dx = a.x - hero.x;
            let dz = a.z - hero.z;
            let d = Math.hypot(dx, dz);
            const minSep = a.r + (hero.r || 0.52);
            if (d < minSep) {
              if (d < 0.02) { dx = 1; dz = 0; d = 1; }
              const push = minSep - d;
              a.x += (dx / d) * push;
              a.z += (dz / d) * push;
            }
          }
          for (let j = i + 1; j < bots.length; j++) {
            const b = bots[j];
            if (b.respawnTimer > 0) continue;
            let dx = b.x - a.x;
            let dz = b.z - a.z;
            let d = Math.hypot(dx, dz);
            const minSep = a.r + b.r + 0.65;
            if (d < minSep) {
              if (d < 0.02) {
                const ang = ((i * 3 + j * 7) % 12) * (Math.PI / 6);
                dx = Math.cos(ang);
                dz = Math.sin(ang);
                d = 1.0;
              }
              const push = (minSep - d) * 0.5;
              a.x -= (dx / d) * push;
              a.z -= (dz / d) * push;
              b.x += (dx / d) * push;
              b.z += (dz / d) * push;
            }
          }
          for (let k = 0; k < mapObstacles.length; k++) {
            const o = mapObstacles[k];
            const dx = a.x - o.x;
            const dz = a.z - o.z;
            const d = Math.hypot(dx, dz) || 0.01;
            if (d < a.r + o.r) {
              a.x = o.x + (dx / d) * (a.r + o.r);
              a.z = o.z + (dz / d) * (a.r + o.r);
            }
          }
          for (let k = 0; k < structures.length; k++) {
            pushUnitOutOfStructure(a, structures[k], i);
          }
          if (ar) clampUnitToArena(a, ar, a.team);
          for (let k = 0; k < botArenas.length; k++) {
            clampUnitToArena(a, botArenas[k], a.team);
          }
        }
      }

      if (!ar) {
        bots.forEach((b) => { b.wasInsideArena = undefined; });
        minions.forEach((m) => { m.wasInsideArena = undefined; });
        camps.forEach((c) => { c.wasInsideArena = undefined; });
      }

      // Sync Bot 3D pivots & nameplates after separation
      bots.forEach((b) => {
        if (b.respawnTimer > 0) return;
        const ay = b.airborneY || 0;
        b.pivot.position.set(b.x, ay, b.z);
        if (b.groundRing) b.groundRing.position.y = 0.03 - ay;
        if (b.pivot.visible) {
          const sp = projectToScreen(b.x, 2.45 + ay, b.z);
          b.plate.style.left = sp.x + 'px';
          b.plate.style.top = sp.y + 'px';
        }
      });
    }

    function updateMinionsAndStructures(dt) {
      // 1. Minion Waves Spawn Timer
      waveTimer -= dt;
      if (waveTimer <= 0 && !duelMode) {
        waveTimer = 24.0;
        spawnMinionWave();
      }

      // 2. Update Minion AI, Bleed DoT & Movement
      const bleedTickMinion = coyoteBleedTick(); // Coyote's Attack-scaled Bleed (see coyote.js dmg)
      for (let i = minions.length - 1; i >= 0; i--) {
        const m = minions[i];
        if (!m) continue;
        if (m.hp <= 0) {
          handleUnitDeath({ kind: 'minion', ref: m });
          continue;
        }
        m.atkCd = Math.max(0, m.atkCd - dt);
        m.slowTimer = Math.max(0, (m.slowTimer || 0) - dt);
        m.stunTimer = Math.max(0, (m.stunTimer || 0) - dt);
        m.tauntTimer = Math.max(0, (m.tauntTimer || 0) - dt);

        if (m.bleedTimer > 0 && m.bleedStacks > 0) {
          m.bleedTimer -= dt;
          m.bleedTickAccum = (m.bleedTickAccum || 0) + dt;
          if (m.bleedTickAccum >= 0.65) {
            m.bleedTickAccum -= 0.65;
            dealPlayerDamageToUnit({ kind: 'minion', ref: m }, Math.round(m.bleedStacks * bleedTickMinion), { color: '#f43f5e', isDoT: true });
            if (m.hp <= 0) continue;
          }
          if (m.bleedTimer <= 0) {
            m.bleedStacks = 0;
            m.bleedTickAccum = 0;
          }
        }

        if (stepUnitKnockback(m, dt, 'minion')) continue;
        if (m.stunTimer > 0) continue;

        // Find nearest enemy minion (preferring lateral slot match so wave spreads cleanly!), structure, or hero within 8.5m
        let bestT = null;
        let bestScore = 8.5;
        let bestActualD = 8.5;
        const enemyTeam = 1 - m.team;

        if (m.team === 1 && m.tauntTimer > 0 && playerProg.respawnTimer <= 0) {
          bestActualD = Math.hypot(hero.x - m.x, hero.z - m.z);
          bestT = { kind: 'player', ref: hero };
        } else {
          minions.forEach((em) => {
            if (em.team === enemyTeam && em.hp > 0) {
              const d = Math.hypot(em.x - m.x, em.z - m.z);
              const slotBias = Math.abs((em.formZ || 0) - (m.formZ || 0)) * 0.35;
              if (d < 8.5 && d + slotBias < bestScore) {
                bestScore = d + slotBias;
                bestActualD = d;
                bestT = { kind: 'minion', ref: em };
              }
            }
          });
          structures.forEach((es) => {
            if (es.team === enemyTeam && es.hp > 0 && isStructureVulnerable(es)) {
              const d = Math.hypot(es.x - m.x, es.z - m.z);
              if (d < bestScore) { bestScore = d; bestActualD = d; bestT = { kind: 'structure', ref: es }; }
            }
          });
          bots.forEach((eb) => {
            if (eb.team === enemyTeam && eb.respawnTimer <= 0) {
              const d = Math.hypot(eb.x - m.x, eb.z - m.z);
              if (d < bestScore) { bestScore = d; bestActualD = d; bestT = { kind: 'bot', ref: eb }; }
            }
          });
          if (enemyTeam === 0 && playerProg.respawnTimer <= 0) {
            const dp = Math.hypot(hero.x - m.x, hero.z - m.z);
            if (dp < bestScore) { bestScore = dp; bestActualD = dp; bestT = { kind: 'player', ref: hero }; }
          }
          deployables.forEach((dq) => {
            if (dq.hp <= 0 || (dq.team || 0) !== enemyTeam) return;
            const d = Math.hypot(dq.x - m.x, dq.z - m.z);
            if (d < bestScore) { bestScore = d; bestActualD = d; bestT = { kind: 'deployable', ref: dq }; }
          });
        }

        if (bestT && bestActualD <= m.range + bestT.ref.r) {
          m.mesh.rotation.y = Math.atan2(bestT.ref.x - m.x, bestT.ref.z - m.z);
          m.moving = false;
          if (m.atkCd <= 0) {
            m.atkCd = 1.35;
            if (m.rig && m.rig.acts.attack) { playMinionAct(m, 'attack', 0.08); m.rig.acts.attack.reset().play(); m.attackAnimT = 0.9; }
            if (m.kind === 'ranged') {
              spawnUnitProjectile(m.x, m.z, bestT, m.atk, m.team === 0 ? 0x38bdf8 : 0xf43f5e, 14.0, 'physical', { kind: 'minion', ref: m });
            } else {
              applyBotDamageToTarget(bestT, m.atk, null, 'physical', { kind: 'minion', ref: m });
            }
          }
        } else {
          let gx = bestT ? bestT.ref.x : m.x;
          let gz = bestT ? (bestT.ref.z + (m.formZ || 0) * 0.32) : m.z;
          if (!bestT) {
            const lg = laneGoal(m);
            gx = lg.x;
            gz = lg.z + (lg.done ? 0 : (m.formZ || 0));
          }
          const navPt = MAP.navNextPoint(m.x, m.z, gx, gz);
          const dx = navPt.x - m.x;
          const dz = navPt.z - m.z;
          const d = Math.hypot(dx, dz) || 0.01;
          const spd = m.spd * (m.slowTimer > 0 ? 0.72 : 1.0);
          const steered = steerUnitAroundStructures(m, dx / d, dz / d, bestT ? bestT.ref : null);
          m.x += steered.vx * spd * dt;
          m.z += steered.vz * spd * dt;
          m.mesh.rotation.y = Math.atan2(steered.vx, steered.vz);
          m.moving = true;
        }
      }

      // Run pairwise unit separation so minions and bots never stack on top of each other!
      resolveUnitSeparation();

      // Finish death animations, then remove the bodies
      for (let i = dyingMinions.length - 1; i >= 0; i--) {
        const dm = dyingMinions[i];
        dm.t -= dt;
        dm.rig.mixer.update(dt);
        if (dm.t < CORPSE_FADE) setRigOpacity(dm.rig.model, dm.t / CORPSE_FADE, true); // body lies there, then fades
        if (dm.t <= 0) {
          setRigOpacity(dm.rig.model, 1, true);
          mapGroup.remove(dm.mesh);
          releaseMinionRig(dm.rig);
          dyingMinions.splice(i, 1);
        }
      }

      // Sync Minion 3D meshes & compact HP bars after separation
      for (let i = minions.length - 1; i >= 0; i--) {
        const m = minions[i];
        if (!m) continue;
        if (m.hp <= 0) {
          handleUnitDeath({ kind: 'minion', ref: m });
          continue;
        }
        m.mesh.position.set(m.x, 0, m.z);
        if (m.rig) {
          m.attackAnimT = Math.max(0, (m.attackAnimT || 0) - dt);
          if (m.attackAnimT <= 0) playMinionAct(m, m.moving ? 'walk' : 'idle');
          m.rig.mixer.update(dt * (m.slowTimer > 0 ? 0.72 : 1));
        }
        updateUnitSlowVisual(m, m.mesh, 0.58, dt);
        const vis = m.team === 0 || isPointVisibleToOrder(m.x, m.z);
        m.mesh.visible = vis;
        if (vis) {
          const sp = projectToScreen(m.x, 1.55, m.z);
          m.plate.style.display = sp.visible ? 'flex' : 'none';
          m.plate.style.left = sp.x + 'px';
          m.plate.style.top = sp.y + 'px';
          m.plate.querySelector('.plate-hp').style.width = Math.max(0, (m.hp / m.maxHp) * 100) + '%';
        } else {
          m.plate.style.display = 'none';
        }
      }

      // 3. Update Structures (Towers & Ancients fire at enemies in range; Minions prioritized first!)
      structures.forEach((s) => {
        if (s.hp <= 0) return;
        if (s.crystal) s.crystal.rotation.y += dt * 1.8;
        if (s.halo) s.halo.rotation.z += dt * 1.2;
        if (s.flame) {
          const t = performance.now() * 0.001;
          s.flame.rotation.y += dt * 0.9;
          s.flame.scale.set(1 + Math.sin(t * 7.3) * 0.06, 1 + Math.sin(t * 5.1) * 0.12 + Math.sin(t * 11.7) * 0.05, 1 + Math.cos(t * 6.4) * 0.06);
          if (s.flameLight) s.flameLight.intensity = 16 + Math.sin(t * 9.0) * 3 + Math.sin(t * 13.0) * 2;
        }

        const vuln = isStructureVulnerable(s);
        if (s.invulnRing) s.invulnRing.visible = !vuln;

        if (s.atk > 0) {
          s.shootCd = Math.max(0, s.shootCd - dt);
          if (s.shootCd <= 0) {
            const enemyTeam = 1 - s.team;
            let target = null;
            let minD = s.range;
            // Priority 1: Enemy Minions in range
            minions.forEach((em) => {
              if (em.team === enemyTeam && em.hp > 0) {
                const d = Math.hypot(em.x - s.x, em.z - s.z);
                if (d <= minD) { minD = d; target = { kind: 'minion', ref: em }; }
              }
            });
            // Priority 1.5: an enemy Imp's turret (deployables)
            if (!target) {
              deployables.forEach((dq) => {
                if (dq.hp <= 0 || (dq.team || 0) !== enemyTeam) return;
                const d = Math.hypot(dq.x - s.x, dq.z - s.z);
                if (d <= minD) { minD = d; target = { kind: 'deployable', ref: dq }; }
              });
            }
            // Priority 2: Enemy Heroes/Bots in range
            if (!target) {
              bots.forEach((eb) => {
                if (eb.team === enemyTeam && eb.respawnTimer <= 0) {
                  const d = Math.hypot(eb.x - s.x, eb.z - s.z);
                  if (d <= minD) { minD = d; target = { kind: 'bot', ref: eb }; }
                }
              });
              if (enemyTeam === 0 && playerProg.respawnTimer <= 0) {
                const dp = Math.hypot(hero.x - s.x, hero.z - s.z);
                if (dp <= minD) { target = { kind: 'player', ref: hero }; }
              }
            }
            if (target) {
              s.shootCd = 1.35;
              spawnUnitProjectile(s.x, s.z, target, s.atk, s.team === 0 ? 0x38bdf8 : 0xf43f5e, 18.5);
            }
          }
        }

        const sp = projectToScreen(s.x, s.kind === 'tower' ? 5.6 : 4.2, s.z);
        s.plate.style.display = sp.visible ? 'flex' : 'none';
        s.plate.style.left = sp.x + 'px';
        s.plate.style.top = sp.y + 'px';
        s.plate.querySelector('.plate-hp').style.width = Math.max(0, (s.hp / s.maxHp) * 100) + '%';
        s.plate.querySelector('.plate-tag').textContent = s.name + (vuln ? '' : ' [🔒 INVULNERABLE]');
      });

      // 4. Update Neutral Jungle Camps & Central Boss (Active Chase, Melee Attack & Leash Reset!)
      const bleedTickCamp = coyoteBleedTick(); // Coyote's Attack-scaled Bleed (see coyote.js dmg)
      camps.forEach((c) => {
        if (c.respawnTimer > 0) {
          if ((c.dyingT || 0) > 0) {
            c.dyingT -= dt;
            c.rig.mixer.update(dt);
            setRigOpacity(c.rig.model, Math.min(1, c.dyingT / CORPSE_FADE)); // body lies there, then fades
            if (c.dyingT <= 0) {
              c.mobGrp.visible = false;
              c.mobGrp.position.set(0, 0, 0);
              setRigOpacity(c.rig.model, 1);
              playGolemAct(c.rig, 'idle', 0.01, 1);
            }
          }
          c.respawnTimer -= dt;
          if (c.respawnTimer <= 0) {
            c.hp = c.maxHp;
            c.bleedStacks = 0;
            c.state = 'idle';
            c.aggroTarget = null;
            c.x = c.homeX;
            c.z = c.homeZ;
            c.mobGrp.position.set(0, 0, 0);
            c.mobGrp.visible = true;
            if (c.leashRing) c.leashRing.visible = false;
          }
          return;
        }
        c.atkCd = Math.max(0, c.atkCd - dt);
        c.swingLock = Math.max(0, (c.swingLock || 0) - dt);
        c.stunTimer = Math.max(0, (c.stunTimer || 0) - dt);
        c.slowTimer = Math.max(0, (c.slowTimer || 0) - dt);
        c.tauntTimer = Math.max(0, (c.tauntTimer || 0) - dt);

        if (c.bleedTimer > 0 && c.bleedStacks > 0 && c.state !== 'leashing') {
          c.bleedTimer -= dt;
          c.bleedTickAccum = (c.bleedTickAccum || 0) + dt;
          if (c.bleedTickAccum >= 0.65) {
            c.bleedTickAccum -= 0.65;
            dealPlayerDamageToUnit({ kind: 'camp', ref: c }, Math.round(c.bleedStacks * bleedTickCamp), { color: '#f43f5e', isDoT: true });
            if (c.respawnTimer > 0) return;
          }
          if (c.bleedTimer <= 0) {
            c.bleedStacks = 0;
            c.bleedTickAccum = 0;
          }
        }

        if (stepUnitKnockback(c, dt, 'camp')) {
          c.mobGrp.position.set(c.x - c.homeX, 0, c.z - c.homeZ);
        } else if (c.state === 'aggro') {
          if (c.leashRing) c.leashRing.visible = true;
          const t = c.aggroTarget;
          const targetDead = !t || (t === hero ? playerProg.respawnTimer > 0 : t.respawnTimer > 0);
          const campDistHome = Math.hypot(c.x - c.homeX, c.z - c.homeZ);
          const targetDistHome = t ? Math.hypot(t.x - c.homeX, t.z - c.homeZ) : 999;

          if (targetDistHome > c.leashR + 0.5) {
            c.patience -= dt * 2.2;
          } else {
            c.patience = Math.min(5.0, c.patience + dt);
          }

          // Trigger Leash Reset if pulled past leashR or attacker left camp territory!
          if (targetDead || campDistHome > c.leashR || c.patience <= 0) {
            c.state = 'leashing';
            c.aggroTarget = null;
            c.bleedStacks = 0;
            c.bleedTimer = 0;
            spawnFloat(c.x, 2.6, c.z, 'LEASHED! RESETTING', '#fde047');
          } else if (c.stunTimer <= 0) {
            const dx = t.x - c.x;
            const dz = t.z - c.z;
            const distT = Math.hypot(dx, dz) || 0.01;
            c.mobGrp.rotation.y = Math.atan2(dx, dz);
            if (distT <= c.atkRange + (t.r || 0.5)) {
              if (c.atkCd <= 0) {
                c.atkCd = 1.15;
                c.swingLock = 0.6; // stay planted while the swing plays (no sliding mid-attack)
                damageOrderHeroOrBot(t, c.atk, 'physical', { kind: 'camp', ref: c });
              }
            } else if ((c.swingLock || 0) > 0) {
              // finishing a swing: hold position
            } else {
              const spd = c.spd * (c.slowTimer > 0 ? 0.72 : 1.0);
              const navPt = MAP.navNextPoint(c.x, c.z, t.x, t.z);
              const ndx = navPt.x - c.x, ndz = navPt.z - c.z;
              const nd = Math.hypot(ndx, ndz) || 0.01;
              c.x += (ndx / nd) * spd * dt;
              c.z += (ndz / nd) * spd * dt;
              const ar = ctx.getArena ? ctx.getArena() : null;
              if (ar) clampUnitToArena(c, ar);
              c.mobGrp.position.set(c.x - c.homeX, 0, c.z - c.homeZ);
            }
          }
        } else if (c.state === 'leashing') {
          if (c.leashRing) c.leashRing.visible = true;
          c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.32 * dt);
          const dx = c.homeX - c.x;
          const dz = c.homeZ - c.z;
          const dHome = Math.hypot(dx, dz);
          if (dHome <= 0.35) {
            c.x = c.homeX;
            c.z = c.homeZ;
            c.mobGrp.position.set(0, 0, 0);
            c.hp = c.maxHp;
            c.state = 'idle';
            if (c.leashRing) c.leashRing.visible = false;
          } else {
            const homeNav = MAP.navNextPoint(c.x, c.z, c.homeX, c.homeZ);
            const hdx = homeNav.x - c.x, hdz = homeNav.z - c.z;
            const hd = Math.hypot(hdx, hdz) || 0.01;
            c.x += (hdx / hd) * 7.8 * dt;
            c.z += (hdz / hd) * 7.8 * dt;
            c.mobGrp.position.set(c.x - c.homeX, 0, c.z - c.homeZ);
            c.mobGrp.rotation.y = Math.atan2(hdx, hdz);
          }
        } else {
          // Idle at home pit: slowly regenerate if chipped
          if (c.leashRing) c.leashRing.visible = false;
          if (c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.15 * dt);
        }

        const movedNow = Math.hypot(c.x - (c._px === undefined ? c.x : c._px), c.z - (c._pz === undefined ? c.z : c._pz)) > 0.001;
        c._px = c.x; c._pz = c.z;
        animateCampModel(c, dt, movedNow);
        const vis = isPointVisibleToOrder(c.x, c.z);
        c.mobGrp.visible = vis;
        updateUnitSlowVisual(c, c.mobGrp, c.isBoss ? 1.35 : 0.82, dt);
        if (vis) {
          const sp = projectToScreen(c.x, c.isBoss ? 4.2 : 2.3, c.z);
          c.plate.style.display = sp.visible ? 'flex' : 'none';
          c.plate.style.left = sp.x + 'px';
          c.plate.style.top = sp.y + 'px';
          c.plate.querySelector('.plate-hp').style.width = Math.max(0, (c.hp / c.maxHp) * 100) + '%';
          c.plate.querySelector('.plate-tag').textContent =
            c.name +
            (c.stunTimer > 0 ? ' [⚡ STUNNED]' : '') +
            (c.slowTimer > 0 ? ' [❄️ SLOWED]' : '') +
            (c.state === 'leashing' ? ' [LEASHING]' : '') +
            (c.bleedStacks > 0 ? ' [🩸x' + c.bleedStacks + ']' : '');
        } else {
          c.plate.style.display = 'none';
        }
      });

      // 5. Update Homing Unit Projectiles (with 2-Way Pit Arena Wall Blocking!)
      const activeArena = ctx.getArena ? ctx.getArena() : null;
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt;
        const u = p.target && p.target.ref;
        if (!u || (u.hp !== undefined && u.hp <= 0) || p.life <= 0) {
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
          continue;
        }
        const prevX = p.mesh.position.x;
        const prevZ = p.mesh.position.z;
        const dx = u.x - prevX;
        const dz = u.z - prevZ;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d <= 0.55) {
          applyBotDamageToTarget(p.target, p.dmg, null, p.dmgType || 'physical', p.attackerObj || null);
          if (p.extraOpts && p.extraOpts.bleedAdd && u !== hero && p.target.kind !== 'structure') {
            u.bleedStacks = Math.min(5, (u.bleedStacks || 0) + p.extraOpts.bleedAdd);
            u.bleedTimer = 5.5;
          }
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
        } else {
          p.mesh.position.x += (dx / d) * p.spd * dt;
          p.mesh.position.z += (dz / d) * p.spd * dt;
          if (p.extraOpts) {
            if (p.extraOpts.orientAlongDir) {
              p.mesh.rotation.y = Math.atan2(dx, dz);
            } else if (p.extraOpts.spinAstral) {
              p.mesh.rotation.y += dt * 7.5;
              p.mesh.rotation.z += dt * 5.0;
            }
          }
          let blockedByWall = false;
          if (activeArena) {
            const wasIn = Math.hypot(prevX - activeArena.x, prevZ - activeArena.z) <= activeArena.r;
            const nowIn = Math.hypot(p.mesh.position.x - activeArena.x, p.mesh.position.z - activeArena.z) <= activeArena.r;
            if (wasIn !== nowIn) blockedByWall = true;
          }
          for (let k = 0; k < botArenas.length && !blockedByWall; k++) {
            const bar = botArenas[k];
            const wasIn = Math.hypot(prevX - bar.x, prevZ - bar.z) <= bar.r;
            const nowIn = Math.hypot(p.mesh.position.x - bar.x, p.mesh.position.z - bar.z) <= bar.r;
            if (wasIn !== nowIn) blockedByWall = true;
          }
          if (blockedByWall) {
            SFX.play('block');
            spawnShockRing(p.mesh.position.x, p.mesh.position.z, 0xfde047, 0.2, 0.9, 0.2);
            spawnFloat(p.mesh.position.x, 1.5, p.mesh.position.z, 'BLOCKED!', '#fde047');
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
          }
        }
      }
    }

    // =========================================================
    // RENDER 2D TACTICAL MINIMAP
    // =========================================================
    function drawMinimap() {
      if (!minimapCtx) return;
      const c = minimapCtx;
      const w = 222, h = 150;
      c.fillStyle = '#0b141a';
      c.fillRect(0, 0, w, h);

      const toX = (wx) => ((wx / DATA.MAP_W) + 0.5) * w;
      const toY = (wz) => ((wz / DATA.MAP_H) + 0.5) * h;

      // Draw Top & Bot Lane Paths
      c.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      c.lineWidth = 5;
      ['top', 'bot'].forEach((ln) => {
        const wps = DATA.LANE_WAYPOINTS[ln];
        c.beginPath();
        wps.forEach((p, idx) => {
          if (idx === 0) c.moveTo(toX(p.x), toY(p.z));
          else c.lineTo(toX(p.x), toY(p.z));
        });
        c.stroke();
      });
      // Jungle Y path, castles and the behemoth hollow
      c.lineWidth = 2.5;
      MAP.JUNGLE_PATHS.forEach((pts) => {
        c.beginPath();
        pts.forEach((p, idx) => (idx ? c.lineTo(toX(p.x), toY(p.z)) : c.moveTo(toX(p.x), toY(p.z))));
        c.stroke();
      });
      c.strokeStyle = 'rgba(214, 196, 160, 0.45)';
      c.lineWidth = 1.5;
      [-1, 1].forEach((s) => {
        const x0 = toX(s * MAP.CASTLE.x0), x1 = toX(s * MAP.CASTLE.x1);
        c.strokeRect(Math.min(x0, x1), toY(MAP.CASTLE.z0), Math.abs(x1 - x0), toY(MAP.CASTLE.z1) - toY(MAP.CASTLE.z0));
      });
      MAP.WALLS.forEach((wl) => {
        if (wl.kind !== 'lanewall') return;
        c.beginPath();
        c.moveTo(toX(wl.x0), toY(wl.z0));
        c.lineTo(toX(wl.x1), toY(wl.z1));
        c.stroke();
      });
      c.fillStyle = 'rgba(60, 48, 34, 0.7)';
      c.beginPath();
      c.moveTo(toX(-MAP.HOLLOW.halfTop), toY(MAP.HOLLOW.top));
      c.lineTo(toX(MAP.HOLLOW.halfTop), toY(MAP.HOLLOW.top));
      c.lineTo(toX(0), toY(MAP.HOLLOW.tipZ));
      c.closePath();
      c.fill();
      camps.forEach((cp) => {
        if (cp.respawnTimer > 0) return;
        c.fillStyle = cp.isBoss ? '#fde047' : '#d97706';
        c.beginPath();
        c.arc(toX(cp.x), toY(cp.z), cp.isBoss ? 4.5 : 2.5, 0, Math.PI * 2);
        c.fill();
      });

      // Draw Structures
      structures.forEach((s) => {
        if (s.hp <= 0) return;
        c.fillStyle = s.team === 0 ? '#38bdf8' : '#fb7185';
        const sz = s.kind === 'ancient' ? 7 : 5;
        c.fillRect(toX(s.x) - sz * 0.5, toY(s.z) - sz * 0.5, sz, sz);
      });

      // Draw Minions
      minions.forEach((m) => {
        if (m.hp <= 0) return;
        if (m.team === 1 && !isPointVisibleToOrder(m.x, m.z)) return;
        c.fillStyle = m.team === 0 ? '#7dd3fc' : '#fda4af';
        c.fillRect(toX(m.x) - 1.5, toY(m.z) - 1.5, 3, 3);
      });

      // Draw Wards
      wards.forEach((wd) => {
        c.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(toX(wd.x), toY(wd.z), 18, 0, Math.PI * 2);
        c.stroke();
      });

      // Draw Bots
      bots.forEach((b) => {
        if (b.respawnTimer > 0) return;
        if (b.team === 1 && !isPointVisibleToOrder(b.x, b.z)) return;
        c.fillStyle = b.team === 0 ? '#22d3ee' : '#f43f5e';
        c.beginPath();
        c.arc(toX(b.x), toY(b.z), 4.0, 0, Math.PI * 2);
        c.fill();
      });

      // Draw Player Hero
      if (playerProg.respawnTimer <= 0) {
        c.fillStyle = '#4ade80';
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(toX(hero.x), toY(hero.z), 4.8, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }

      // Draw Active Tactical Pings
      pings.forEach((pg) => {
        c.strokeStyle = pg.color;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(toX(pg.x), toY(pg.z), 6 + Math.sin(pg.life * 8) * 3, 0, Math.PI * 2);
        c.stroke();
      });
    }

    // =========================================================
    // MAIN PER-FRAME UPDATE CALLED FROM ARENA3D.HTML
    // =========================================================
    function update(dt) {
      if (!matchMode || gameOver) return;

      matchTime += dt;
      const mins = String(Math.floor(matchTime / 60)).padStart(2, '0');
      const secs = String(Math.floor(matchTime % 60)).padStart(2, '0');
      const clk = document.getElementById('p1-clock');
      if (clk) clk.textContent = mins + ':' + secs;

      // Passive Gold Trickle (3g/sec)
      if (Math.floor(matchTime) !== Math.floor(matchTime - dt)) {
        playerProg.gold += 3;
        refreshShopAndHudUI();
      }

      // Boss Buff Timers
      [0, 1].forEach((tm) => {
        if (bossBuffTimer[tm] > 0) bossBuffTimer[tm] = Math.max(0, bossBuffTimer[tm] - dt);
      });
      bossAuraPlayer.visible = bossBuffTimer[0] > 0 && playerProg.respawnTimer <= 0;
      bossAuraPlayer.position.set(hero.x, 0.05, hero.z);

      // Ward Recharge & Lifetime
      if (playerProg.wardCharges < 2) {
        playerProg.wardRechargeTimer -= dt;
        if (playerProg.wardRechargeTimer <= 0) {
          playerProg.wardCharges++;
          playerProg.wardRechargeTimer = playerProg.wardCharges < 2 ? 45.0 : 0;
          refreshShopAndHudUI();
        }
      }
      for (let i = wards.length - 1; i >= 0; i--) {
        const w = wards[i];
        w.life -= dt;
        w.eye.rotation.y += dt * 2.5;
        if (w.life <= 0) {
          mapGroup.remove(w.mesh);
          wards.splice(i, 1);
        }
      }

      // Active Tactical Pings Lifetime
      for (let i = pings.length - 1; i >= 0; i--) {
        pings[i].life -= dt;
        if (pings[i].life <= 0) pings.splice(i, 1);
      }

      // Player Respawn, Passive & Fountain HP/Mana Regen, & Channeled Free Recall (B)
      const st = getPlayerStats();
      hero.maxHp = st.maxHp;
      hero.maxMp = st.maxMp;
      if (hero.mp === undefined) hero.mp = st.maxMp;

      if (playerProg.respawnTimer > 0) {
        playerProg.respawnTimer -= dt;
        if (playerProg.respawnTimer <= 0) {
          hero.x = MAP.BASE.heroSpawn.x;
          hero.z = MAP.BASE.heroSpawn.z;
          hero.hp = hero.maxHp;
          hero.mp = hero.maxMp;
          spawnFloat(hero.x, 2.7, hero.z, 'RESPAWNED AT ORDER FOUNTAIN!', '#4ade80');
        }
      } else {
        // Passive Mana & HP Regen (or instant full Mana in 0 CD Mode!)
        if (ctx.isWtfMode()) {
          hero.mp = hero.maxMp;
        } else {
          hero.hp = Math.min(hero.maxHp, hero.hp + st.hpRegen * dt);
          hero.mp = Math.min(hero.maxMp, hero.mp + st.mpRegen * dt);
        }

        // Order Fountain Healing & Mana Restore (+240 HP/sec, +180 MP/sec)
        if (Math.hypot(hero.x - MAP.BASE.fountain.x, hero.z - MAP.BASE.fountain.z) <= 6.5) {
          hero.hp = Math.min(hero.maxHp, hero.hp + 240 * dt);
          hero.mp = Math.min(hero.maxMp, hero.mp + 180 * dt);
        }
        // Channeled Recall (B)
        if (playerProg.recallTimer > 0) {
          if (ctx.isPlayerMoving()) {
            playerProg.recallTimer = 0;
            recallRingMesh.visible = false;
            spawnFloat(hero.x, 2.5, hero.z, 'RECALL INTERRUPTED', '#fb7185');
          } else {
            playerProg.recallTimer -= dt;
            recallRingMesh.visible = true;
            recallRingMesh.position.set(hero.x, 1.6, hero.z);
            recallRingMesh.rotation.y += dt * 4.5;
            if (playerProg.recallTimer <= 0) {
              recallRingMesh.visible = false;
              hero.x = MAP.BASE.heroSpawn.x;
              hero.z = MAP.BASE.heroSpawn.z;
              hero.hp = hero.maxHp;
              hero.mp = hero.maxMp;
              SFX.play('chime');
              spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.4, 2.6, 0.35);
              spawnFloat(hero.x, 2.8, hero.z, 'ARRIVED AT FOUNTAIN!', '#38bdf8');
              refreshShopAndHudUI();
            }
          }
        } else {
          recallRingMesh.visible = false;
        }
      }

      updateSpyglass(dt);
      // the player gets the same slowed visual as bots/minions
      if (typeof heroPivot !== 'undefined') updateUnitSlowVisual(hero, heroPivot, 0.85, dt);
      updateFog(dt);

      // Pooled minion rigs are only visible during the loading-screen shader warm-up; never draw them in play
      if (minionPoolHolder.visible) minionPoolHolder.visible = false;
      updateBots(dt);
      updateMinionsAndStructures(dt);
      drawMinimap();
    }

    // Initialize Map, Bots & UI
    build3DMap();
    buildPhase1UI();
    spawnBots();
    hero.x = MAP.BASE.heroSpawn.x;
    hero.z = MAP.BASE.heroSpawn.z;

    return {
      update,
      getPlayerStats,
      computeUnitStats,
      getHostileTargets,
      getAlliedTargets,
      dealPlayerDamageToUnit,
      onArenaSpawned,
      getPlayerProg: () => playerProg,
      devBots: () => bots,
      devMatchTime: () => matchTime,
      addDeployable: (d) => { if (deployables.indexOf(d) < 0) deployables.push(d); },
      removeDeployable: (d) => { const i = deployables.indexOf(d); if (i >= 0) deployables.splice(i, 1); },
      isVisibleToOrder: (x, z) => isPointVisibleToOrder(x, z),
      // ---- Balance tool hooks (js/duel.js) ----
      // Enter duel mode: no waves (current minions removed), the player and every bot parked; js/duel.js brings bots in.
      devDuelStart: (cx, cz) => {
        duelMode = { cx, cz };
        botDifficulty = 'normal';
        minions.forEach((m) => { m.hp = 0; mapGroup.remove(m.mesh); releaseMinionRig(m.rig); if (m.plate) m.plate.remove(); });
        minions.length = 0;
        playerProg.respawnTimer = 1e9;
        bots.forEach((b) => { b.respawnTimer = 1e9; b.pivot.visible = false; if (b.plate) b.plate.style.display = 'none'; });
      },
      // Turn a bot into heroType at a level with an item list (rebuilds its rig when the hero changes)
      devDuelSetBot: (b, heroType, level, items) => {
        const ck = window.MOBA_HEROES && window.MOBA_HEROES[b.heroType];
        if (ck && ck.botCleanup) ck.botCleanup(b);
        if (b.heroType !== heroType) {
          if (b.model) b.pivot.remove(b.model);
          if (b.bowPivot) { scene.remove(b.bowPivot); b.bowPivot = null; }
          b.rigLoaded = false;
          b.model = null;
          b.name = (b.team === 0 ? 'Blue ' : 'Red ') + (HERO_LABELS[heroType] || heroType);
        }
        b.level = level;
        b.xp = DATA.LEVEL_XP[level] || 0;
        b.items = items || [];
        applyBotSpecStats(b, heroType);
        attachRigToBot(b);
      },
      // Put a bot back in the fight at (x, z): full HP, abilities ready, no leftover status or kit state
      devDuelResetBot: (b, x, z, facing) => {
        const ck = window.MOBA_HEROES && window.MOBA_HEROES[b.heroType];
        if (ck && ck.botCleanup) ck.botCleanup(b);
        if (ck && ck.botHide) ck.botHide(b);
        applyBotSpecStats(b, b.heroType);
        Object.assign(b, {
          x, z, facing, respawnTimer: 0, hp: b.maxHp, shield: 0, shieldTimer: 0,
          atkCd: 0, cdQ: 0, cdE: 0, cdR: 0, skillCd: 0, atkAnimTimer: 0,
          stunTimer: 0, slowTimer: 0, tauntTimer: 0, stealthTimer: 0, knockbackTimer: 0, knockbackVx: 0, knockbackVz: 0,
          bleedStacks: 0, bleedTimer: 0, leapTimer: 0, leapOnLand: null, leapHeight: undefined, dashTimer: 0, dashOnEnd: null,
          rChargeTimer: 0, arenaTimer: 0, monoTimer: 0, eRecast: 0, aimTarget: null,
          sawOn: false, sawT: 0, pendingInject: null, injectTimer: 0, hopCharges: undefined,
          impPendingQ: null, impStrike: null, impRocket: false, laneDone: false
        });
        b.pivot.visible = true;
        b.pivot.position.set(x, 0, z);
      },
      devDuelEnd: () => { duelMode = null; },
      // Dev toggle: park every bot hero (hidden, untargetable, not updated) or bring them all back at their spawns
      setBotsEnabled: (on) => {
        bots.forEach((b) => {
          if (on) {
            if (b.respawnTimer > 1e8) b.respawnTimer = 0.001; // respawns at home next frame
          } else {
            b.respawnTimer = 1e9;
            b.pivot.visible = false;
            if (b.bowPivot) b.bowPivot.visible = false;
            if (b.plate) b.plate.style.display = 'none';
          }
        });
      },
      getMapObstacles: () => mapObstacles.concat(structures.filter((s) => s.hp > 0)),
      notifyTemplatesReady: () => bots.forEach((b) => attachRigToBot(b)),
      notifyMinionTemplatesReady: () => prewarmMinionRigs(),
      // Map models finished loading (boot.js): rebuild structure visuals with them, keeping game state
      notifyJungleModelsReady: () => applyJungleModels(),
      notifyMapModelsReady: () => {
        structures.forEach((s) => {
          if (s.mesh) mapGroup.remove(s.mesh);
          if (s.plate) s.plate.remove();
          s.crystal = s.halo = s.flame = s.flameLight = null;
          const cd = s.shootCd || 0;
          buildStructureMesh(s);
          s.shootCd = cd;
          if (s.hp <= 0) {
            s.mesh.visible = false;
            s.plate.style.display = 'none';
          }
        });
      },
      notifyHeroSwitched: () => {
        const st = getPlayerStats();
        hero.maxHp = st.maxHp;
        hero.hp = hero.maxHp;
        hero.maxMp = st.maxMp;
        hero.mp = hero.maxMp;
        syncAlliedBotsToPlayerHero();
        refreshTalentModalUI();
        refreshShopAndHudUI();
      }
    };
  }

  return { createEngine };
})();
