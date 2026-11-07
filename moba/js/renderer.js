window.MOBA = window.MOBA || {};

(function (M) {
  'use strict';

  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rad = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
    };
  }

  let terrainCanvas = null;
  let fogCanvas = null;
  let fogCtx = null;

  function buildTerrainBuffer() {
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = M.WORLD.width;
    terrainCanvas.height = M.WORLD.height;
    const g = terrainCanvas.getContext('2d');

    // Lush Warcraft / Summoner's Rift mossy forest ground
    const bgGrad = g.createRadialGradient(1150, 830, 180, 1200, 830, 1450);
    bgGrad.addColorStop(0, '#2c4c2e');
    bgGrad.addColorStop(0.6, '#223d25');
    bgGrad.addColorStop(1, '#162919');
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, M.WORLD.width, M.WORLD.height);

    // Subtle organic grass patches (seeded deterministic feel)
    for (let i = 0; i < 240; i++) {
      const px = ((i * 397) % (M.WORLD.width - 120)) + 60;
      const py = ((i * 613) % (M.WORLD.height - 120)) + 60;
      const rad = 28 + (i % 5) * 14;
      g.fillStyle = i % 2 === 0 ? 'rgba(62, 108, 56, 0.16)' : 'rgba(20, 40, 22, 0.18)';
      g.beginPath();
      g.arc(px, py, rad, 0, Math.PI * 2);
      g.fill();
    }

    // Sparkling Eastern River Creek
    g.save();
    g.beginPath();
    g.moveTo(2080, 0);
    g.bezierCurveTo(1990, 520, 2140, 1100, 2020, M.WORLD.height);
    g.lineTo(M.WORLD.width, M.WORLD.height);
    g.lineTo(M.WORLD.width, 0);
    g.closePath();
    const riverGrad = g.createLinearGradient(1980, 0, M.WORLD.width, 0);
    riverGrad.addColorStop(0, '#3a5940');
    riverGrad.addColorStop(0.12, '#1f647d');
    riverGrad.addColorStop(0.6, '#164b61');
    riverGrad.addColorStop(1, '#103748');
    g.fillStyle = riverGrad;
    g.fill();
    g.restore();

    // Central Cobblestone Combat Courtyard
    g.save();
    g.fillStyle = 'rgba(92, 82, 68, 0.52)';
    g.strokeStyle = 'rgba(182, 154, 104, 0.32)';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(620, 420, 1140, 820, 64);
    g.fill();
    g.stroke();

    // Ornate Combat Ring Inlay
    g.strokeStyle = 'rgba(214, 180, 112, 0.2)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(1120, 790, 250, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    // Order Base Fountain Sanctuary (Left)
    const f = M.WORLD.fountain;
    const fGrad = g.createRadialGradient(f.x, f.y, 18, f.x, f.y, f.radius);
    fGrad.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
    fGrad.addColorStop(0.55, 'rgba(45, 112, 158, 0.28)');
    fGrad.addColorStop(1, 'rgba(84, 76, 62, 0.65)');
    g.fillStyle = fGrad;
    g.beginPath();
    g.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = 'rgba(234, 196, 116, 0.65)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    g.stroke();

    g.strokeStyle = 'rgba(125, 211, 252, 0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(f.x, f.y, f.radius * 0.62, 0, Math.PI * 2);
    g.stroke();

    // Engraved Ground Station Callouts
    g.font = '700 13px Cinzel, serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(238, 224, 190, 0.34)';
    g.fillText('FOUNTAIN SANCTUARY', f.x, f.y + f.radius + 24);
    g.fillText('WHISPERING GROVE (LOS & UNSEEN TEST)', 1075, 255);
    g.fillText('4-PACK COMBO STATION', 1560, 475);
    g.fillText('SHOOTER BOT STATION', 1410, 1215);
  }

  function ensureBuffers(viewW, viewH) {
    if (!terrainCanvas) buildTerrainBuffer();
    if (!fogCanvas || fogCanvas.width !== viewW || fogCanvas.height !== viewH) {
      fogCanvas = document.createElement('canvas');
      fogCanvas.width = viewW;
      fogCanvas.height = viewH;
      fogCtx = fogCanvas.getContext('2d');
    }
  }

  function drawHeroSprite(ctx, state, u) {
    ctx.save();
    ctx.translate(u.x, u.y);

    // Airborne elevation scale & shadow
    if (u.airborneTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(0, 16, u.radius * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, -16);
      ctx.scale(1.14, 1.14);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(0, 5, u.radius * 0.95, u.radius * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (u.stealthTimer > 0) {
      ctx.globalAlpha = 0.42;
    }

    // Bodyguard Screening Passive Foot Aura
    if (u.heroId === 'bodyguard' && u.guardStacks > 0) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, u.radius + 10 + Math.sin(state.time * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Panther Unseen Speed Ring
    if (u.heroId === 'panther' && u.unseenLinger > 0) {
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, u.radius + 8, state.time * 3, state.time * 3 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Scientist Q Whirling Saw Ring
    if (u.heroId === 'scientist' && u.sawSpinTimer > 0) {
      ctx.save();
      ctx.rotate(state.time * 16);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 138, 0, Math.PI * 2);
      ctx.stroke();
      for (let t = 0; t < 12; t++) {
        const a = (t / 12) * Math.PI * 2;
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 136, Math.sin(a) * 136);
        ctx.lineTo(Math.cos(a + 0.12) * 150, Math.sin(a + 0.12) * 150);
        ctx.lineTo(Math.cos(a + 0.24) * 136, Math.sin(a + 0.24) * 136);
        ctx.fill();
      }
      ctx.restore();
    }

    // Melee Swing Arc Slash VFX
    if (u.meleeSwingTimer > 0) {
      ctx.save();
      ctx.rotate(u.meleeSwingAngle);
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.72)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, u.radius + 32, -0.75, 0.75);
      ctx.stroke();
      ctx.restore();
    }

    // Coyote R Supercharge Laser Sight
    if (u.heroId === 'coyote' && u.coyoteChargeTimer > 0) {
      ctx.save();
      ctx.rotate(u.facing);
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.75)';
      ctx.lineWidth = 3 + (2.0 - u.coyoteChargeTimer) * 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(u.radius, 0);
      ctx.lineTo(630, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Bodyguard Q Windup Cone Telegraph
    if (u.heroId === 'bodyguard' && u.qWindupTimer > 0) {
      ctx.save();
      ctx.rotate(u.qWindupAngle);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.28)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 150, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.rotate(u.facing || 0);

    // Character-specific Top-Down Fantasy Silhouette
    if (u.kind === 'playerHero') {
      const col = u.def.color;
      const acc = u.def.accent;

      switch (u.heroId) {
        case 'sorceress': {
          // Flowing astral robe + shoulders + crystal staff
          ctx.fillStyle = '#1e3a5f';
          ctx.beginPath();
          ctx.arc(-4, 0, u.radius + 2, 0.6, Math.PI * 2 - 0.6);
          ctx.fill();

          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(0, 0, u.radius - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = acc;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Staff & glowing crystal
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(-6, 15);
          ctx.lineTo(u.radius + 14, 13);
          ctx.stroke();
          ctx.fillStyle = '#7dd3fc';
          ctx.beginPath();
          ctx.arc(u.radius + 16, 13, 6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'coyote': {
          // Woodland cloak + russet coyote head + pointed ears + crossbow
          ctx.fillStyle = '#451a14';
          ctx.beginPath();
          ctx.arc(-5, 0, u.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#b4532a';
          ctx.beginPath();
          ctx.arc(2, 0, u.radius - 3, 0, Math.PI * 2);
          ctx.fill();

          // Pointed coyote ears
          ctx.fillStyle = '#7c2d12';
          ctx.beginPath();
          ctx.moveTo(-4, -14); ctx.lineTo(-14, -22); ctx.lineTo(4, -17);
          ctx.moveTo(-4, 14); ctx.lineTo(-14, 22); ctx.lineTo(4, 17);
          ctx.fill();

          // Crossbow stock & bowprod
          ctx.strokeStyle = u.coyoteQArmed ? '#fde047' : '#d6d3d1';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(u.radius + 14, 0);
          ctx.moveTo(u.radius + 6, -15);
          ctx.quadraticCurveTo(u.radius + 15, 0, u.radius + 6, 15);
          ctx.stroke();
          break;
        }

        case 'fairy': {
          // Shimmering dragonfly wings + petite sprite body
          const flap = Math.sin(state.time * 22) * 0.22;
          ctx.save();
          ctx.fillStyle = 'rgba(125, 211, 252, 0.55)';
          ctx.rotate(flap);
          ctx.beginPath();
          ctx.ellipse(-6, -15, 14, 7, -0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.rotate(-flap * 2);
          ctx.beginPath();
          ctx.ellipse(-6, 15, 14, 7, 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        }

        case 'bodyguard': {
          // Broad muscular shirtless bronze torso + heavy brass knuckle-gauntlets
          ctx.fillStyle = '#c27849';
          ctx.beginPath();
          ctx.ellipse(0, 0, u.radius - 2, u.radius + 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 3;
          ctx.stroke();

          // Heavy fists forward
          ctx.fillStyle = '#eab308';
          ctx.beginPath();
          ctx.arc(u.radius - 2, -16, 9, 0, Math.PI * 2);
          ctx.arc(u.radius - 2, 16, 9, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'cannon': {
          // Little imp body + big brass cannon (when carried) or wrench (when anchored)
          ctx.fillStyle = '#ea580c';
          ctx.beginPath();
          ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.stroke();

          if (u.hasCannon) {
            ctx.fillStyle = '#292524';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-4, 6, u.radius + 22, 15, 5);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(6, 10);
            ctx.lineTo(u.radius + 10, 14);
            ctx.stroke();
          }
          break;
        }

        case 'brawler': {
          // Crimson sash + fighter silhouette + glowing gauntlets
          ctx.fillStyle = '#be123c';
          ctx.beginPath();
          ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = u.brawlerQArmed ? '#fde047' : '#f43f5e';
          ctx.beginPath();
          ctx.arc(u.radius - 1, -12, 8, 0, Math.PI * 2);
          ctx.arc(u.radius - 1, 12, 8, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'scientist': {
          // Stained lab coat + emerald goggles + handheld buzzsaw
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
          ctx.stroke();

          if (!state.boomerangSaw) {
            ctx.fillStyle = '#94a3b8';
            ctx.beginPath();
            ctx.arc(u.radius + 7, 10, 11, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }

        case 'panther': {
          // Sleek dark obsidian feline + teal predator claws
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.ellipse(0, 0, u.radius + 3, u.radius - 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          //Twin claws
          ctx.strokeStyle = '#5eead4';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(u.radius, -9); ctx.lineTo(u.radius + 10, -7);
          ctx.moveTo(u.radius, 9); ctx.lineTo(u.radius + 10, 7);
          ctx.stroke();
          break;
        }
      }
    } else if (u.kind === 'turretPet') {
      // Anchored Cannon Turret on Tripod
      ctx.fillStyle = '#44403c';
      ctx.beginPath();
      ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = u.overchargeTimer > 0 ? '#fde047' : '#fb923c';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.roundRect(-4, -9, u.radius + 16, 18, 5);
      ctx.fill();
      ctx.stroke();
    } else {
      // Dummies & Creeps
      const isAlly = u.team === 1;
      ctx.fillStyle = isAlly ? '#1d4ed8' : (u.kind === 'shooter' ? '#881337' : '#572427');
      ctx.beginPath();
      ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isAlly ? '#60a5fa' : '#fb7185';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Facing notch
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(u.radius - 5, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawUnitPlate(ctx, state, u) {
    const barW = u.isHero ? 68 : 48;
    const barH = u.isHero ? 8 : 6;
    const bx = u.x - barW / 2;
    const by = u.y - u.radius - 22;

    // Background plate
    ctx.fillStyle = 'rgba(10, 15, 20, 0.86)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

    // HP Fill
    const hpRatio = Math.max(0, Math.min(1, u.hp / u.maxHp));
    ctx.fillStyle = u.kind === 'playerHero' ? '#22c55e' : (u.team === 1 ? '#3b82f6' : '#ef4444');
    ctx.fillRect(bx, by, barW * hpRatio, barH);

    // Shield Fill overlay
    if (u.shield > 0) {
      const shRatio = Math.min(1, u.shield / u.maxHp);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(bx + barW * (1 - shRatio), by, barW * shRatio, barH);
    }

    // 250-HP Segment Ticks
    if (u.isHero) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const segs = Math.min(12, Math.floor(u.maxHp / 250));
      for (let s = 1; s <= segs; s++) {
        const sx = bx + ((s * 250) / u.maxHp) * barW;
        ctx.fillRect(sx, by, 1, barH);
      }
    }

    // Player Mana underbar
    if (u.kind === 'playerHero') {
      ctx.fillStyle = 'rgba(10, 15, 20, 0.85)';
      ctx.fillRect(bx - 1, by + barH + 1, barW + 2, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(bx, by + barH + 1, barW * (u.mp / u.maxMp), 4);
    }

    // Recall Channel Bar
    if (u.recallTimer > 0) {
      const rPct = 1 - u.recallTimer / 4.0;
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(bx, by - 8, barW * rPct, 4);
    }

    // Bleed Stack Pips (Coyote)
    if (u.bleedStacks > 0) {
      for (let b = 0; b < u.bleedStacks; b++) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(bx + 6 + b * 11, by - 7, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Predator Mark Diamonds (Panther)
    if (u.predatorMarks > 0) {
      for (let m = 0; m < u.predatorMarks; m++) {
        ctx.fillStyle = '#2dd4bf';
        ctx.fillRect(bx + barW - 8 - m * 10, by - 10, 6, 6);
      }
    }

    // Vivisect Counter Pips (Scientist)
    if (u.vivisectHits > 0) {
      for (let v = 0; v < u.vivisectHits; v++) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(bx + 4 + v * 9, by + barH + 4, 6, 3);
      }
    }

    // Overhead Status Callout Label
    let statusLabel = '';
    let statusCol = '#fde047';
    if (u.sleepTimer > 0) { statusLabel = 'SLEEP Zzz'; statusCol = '#7dd3fc'; }
    else if (u.stunTimer > 0) { statusLabel = 'STUNNED'; statusCol = '#fde047'; }
    else if (u.tauntTimer > 0) { statusLabel = 'TAUNTED!'; statusCol = '#fb923c'; }
    else if (u.silenceTimer > 0) { statusLabel = 'SILENCED'; statusCol = '#38bdf8'; }
    else if (u.heroId === 'panther' && u.unseenLinger > 0) {
      statusLabel = u.isCurrentlyUnseen ? 'UNSEEN +SPD' : 'SPOTTED!';
      statusCol = u.isCurrentlyUnseen ? '#2dd4bf' : '#fbbf24';
    } else if (u.heroId === 'bodyguard' && u.guardStacks > 0) {
      statusLabel = 'GUARD x' + u.guardStacks;
      statusCol = '#fde047';
    }

    if (statusLabel) {
      ctx.font = '800 10.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = statusCol;
      ctx.fillText(statusLabel, u.x, by - 14);
    } else if (u.kind !== 'playerHero' && u.kind !== 'creep') {
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(242, 234, 216, 0.72)';
      ctx.fillText(u.name, u.x, by - 5);
    }
  }

  function render(ctx, minimapCtx, state, cam) {
    const viewW = cam.viewW;
    const viewH = cam.viewH;
    ensureBuffers(viewW, viewH);

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // 1. Pre-baked High-Fantasy Terrain
    ctx.drawImage(terrainCanvas, 0, 0);

    // 2. Ground Zones & Telegraphs
    for (let i = 0; i < state.zones.length; i++) {
      const z = state.zones[i];
      if (z.kind === 'fairyDust') {
        const dream = z.owner && z.owner.fairyUltTimer > 0;
        ctx.fillStyle = dream ? 'rgba(56, 189, 248, 0.24)' : 'rgba(52, 211, 153, 0.22)';
        ctx.strokeStyle = dream ? 'rgba(125, 211, 252, 0.75)' : 'rgba(110, 231, 183, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (z.kind === 'sorcPillar') {
        if (z.delay > 0) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const alpha = Math.max(0, z.life / 0.56);
          ctx.fillStyle = 'rgba(125, 211, 252, ' + (0.62 * alpha) + ')';
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (z.kind === 'sorcMonolith') {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (z.kind === 'coyoteGrenade') {
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.stroke();
        // Bullseye inner ring
        ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.bullseyeRadius, 0, Math.PI * 2);
        ctx.fill();
      } else if (z.kind === 'fairyBubble') {
        ctx.fillStyle = 'rgba(110, 231, 183, 0.22)';
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Broken Cannon Scrap on Ground
    if (state.cannonScrap) {
      const sc = state.cannonScrap;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#44403c';
      ctx.beginPath();
      ctx.roundRect(sc.x - 16, sc.y - 9, 32, 18, 4);
      ctx.fill();
      ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText('BROKEN CANNON', sc.x, sc.y - 16);
    }

    // Brawler Pit Arena Cage Ring
    if (state.arenaRing) {
      const ar = state.arenaRing;
      ctx.fillStyle = 'rgba(244, 63, 94, 0.10)';
      ctx.beginPath();
      ctx.arc(ar.x, ar.y, ar.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(ar.x, ar.y, ar.radius, 0, Math.PI * 2);
      ctx.stroke();

      for (let p = 0; p < 12; p++) {
        const a = (p / 12) * Math.PI * 2;
        const px = ar.x + Math.cos(a) * ar.radius;
        const py = ar.y + Math.sin(a) * ar.radius;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Wards
    for (let i = 0; i < state.wards.length; i++) {
      const w = state.wards[i];
      ctx.fillStyle = w.team === 1 ? '#fde047' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(w.x, w.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = w.team === 1 ? 'rgba(253, 224, 71, 0.25)' : 'rgba(244, 63, 94, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Units (Respecting Allied Team LOS for Enemy Visibility!)
    const observers = state.units.filter(function (u) { return !u.dead && u.team === 1; });
    const alliedWards = state.wards.filter(function (w) { return w.team === 1; });

    function isPointVisibleToAllies(px, py) {
      for (let i = 0; i < observers.length; i++) {
        const ob = observers[i];
        const r = ob.kind === 'turretPet' ? 500 : M.WORLD.visionRangeHero;
        if (Math.hypot(px - ob.x, py - ob.y) <= r && M.Vision.hasLineOfSight(ob.x, ob.y, px, py)) {
          return true;
        }
      }
      for (let i = 0; i < alliedWards.length; i++) {
        const wd = alliedWards[i];
        if (Math.hypot(px - wd.x, py - wd.y) <= wd.radius && M.Vision.hasLineOfSight(wd.x, wd.y, px, py)) {
          return true;
        }
      }
      return false;
    }

    for (let i = 0; i < state.units.length; i++) {
      const u = state.units[i];
      if (u.dead) continue;
      if (u.kind === 'shooter' && !state.shooterEnabled) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        drawHeroSprite(ctx, state, u);
        ctx.restore();
        continue;
      }
      if (u.team !== 1 && !isPointVisibleToAllies(u.x, u.y)) continue;
      drawHeroSprite(ctx, state, u);
    }

    // Scientist Boomerang Sawblade
    if (state.boomerangSaw) {
      const saw = state.boomerangSaw;
      ctx.save();
      ctx.translate(saw.x, saw.y);
      ctx.rotate(state.time * 24);
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, saw.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Projectiles
    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i];
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Walls & Multi-Tier Pine Trees
    for (let i = 0; i < M.WALLS.length; i++) {
      const w = M.WALLS[i];
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(w.x + 3, w.y + 3, w.w - 6, 8);
    }

    for (let i = 0; i < M.TREES.length; i++) {
      const t = M.TREES[i];
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.arc(t.x + 6, t.y + 8, t.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#14331b';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1e4b27';
      ctx.beginPath();
      ctx.arc(t.x - 4, t.y - 4, t.r * 0.72, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2d6a39';
      ctx.beginPath();
      ctx.arc(t.x - 7, t.y - 7, t.r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles
    for (let i = 0; i < state.particles.length; i++) {
      const pt = state.particles[i];
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // 5. Real-Time Dota-Style 2D LOS Fog of War Overlay
    fogCtx.clearRect(0, 0, viewW, viewH);
    fogCtx.fillStyle = 'rgba(7, 13, 18, 0.56)';
    fogCtx.fillRect(0, 0, viewW, viewH);

    fogCtx.globalCompositeOperation = 'destination-out';
    const sightSources = [];
    for (let i = 0; i < observers.length; i++) {
      const ob = observers[i];
      sightSources.push({
        x: ob.x,
        y: ob.y,
        r: ob.kind === 'turretPet' ? 500 : M.WORLD.visionRangeHero
      });
    }
    for (let i = 0; i < alliedWards.length; i++) {
      sightSources.push({ x: alliedWards[i].x, y: alliedWards[i].y, r: alliedWards[i].radius });
    }

    for (let s = 0; s < sightSources.length; s++) {
      const src = sightSources[s];
      const poly = M.Vision.computeVisibilityPolygon(src.x, src.y, src.r);
      if (poly.length > 2) {
        fogCtx.beginPath();
        fogCtx.moveTo(poly[0].x - cam.x, poly[0].y - cam.y);
        for (let p = 1; p < poly.length; p++) {
          fogCtx.lineTo(poly[p].x - cam.x, poly[p].y - cam.y);
        }
        fogCtx.closePath();
        fogCtx.fillStyle = 'rgba(0,0,0,1)';
        fogCtx.fill();
      }
    }
    fogCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fogCanvas, 0, 0);

    // 6. Overhead Unit Plates & Floating Combat Numbers (drawn crisp above fog for visible units)
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // Sandbox helper: show Enemy Test Ward beacon through fog when toggled ON
    for (let i = 0; i < state.wards.length; i++) {
      const ew = state.wards[i];
      if (ew.team === 2) {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(ew.x, ew.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '800 10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fda4af';
        ctx.fillText('ENEMY WARD', ew.x, ew.y - 14);
      }
    }

    for (let i = 0; i < state.units.length; i++) {
      const u = state.units[i];
      if (u.dead) continue;
      if (u.kind === 'shooter' && !state.shooterEnabled) continue;
      if (u.team !== 1 && !isPointVisibleToAllies(u.x, u.y)) continue;
      drawUnitPlate(ctx, state, u);
    }

    for (let i = 0; i < state.texts.length; i++) {
      const t = state.texts[i];
      ctx.globalAlpha = Math.min(1, (t.life / t.maxLife) * 1.4);
      ctx.font = '800 ' + t.size + 'px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 7. Minimap
    renderMinimap(minimapCtx, state, cam, isPointVisibleToAllies);
  }

  function renderMinimap(mctx, state, cam, isPointVisibleToAllies) {
    if (!mctx) return;
    const mw = mctx.canvas.width;
    const mh = mctx.canvas.height;
    const sx = mw / M.WORLD.width;
    const sy = mh / M.WORLD.height;

    mctx.fillStyle = '#152619';
    mctx.fillRect(0, 0, mw, mh);

    // Courtyard & Fountain
    mctx.fillStyle = 'rgba(120, 108, 88, 0.45)';
    mctx.fillRect(620 * sx, 420 * sy, 1140 * sx, 820 * sy);

    mctx.fillStyle = '#38bdf8';
    mctx.beginPath();
    mctx.arc(M.WORLD.fountain.x * sx, M.WORLD.fountain.y * sy, 7, 0, Math.PI * 2);
    mctx.fill();

    // Trees & Walls
    mctx.fillStyle = '#234d2b';
    for (let i = 0; i < M.TREES.length; i++) {
      mctx.beginPath();
      mctx.arc(M.TREES[i].x * sx, M.TREES[i].y * sy, 3.2, 0, Math.PI * 2);
      mctx.fill();
    }
    mctx.fillStyle = '#64748b';
    for (let i = 0; i < M.WALLS.length; i++) {
      const w = M.WALLS[i];
      mctx.fillRect(w.x * sx, w.y * sy, Math.max(2, w.w * sx), Math.max(2, w.h * sy));
    }

    // Units
    for (let i = 0; i < state.units.length; i++) {
      const u = state.units[i];
      if (u.dead || (u.kind === 'shooter' && !state.shooterEnabled)) continue;
      if (u.team !== 1 && !isPointVisibleToAllies(u.x, u.y)) continue;
      mctx.fillStyle = u.kind === 'playerHero' ? '#fde047' : (u.team === 1 ? '#60a5fa' : '#fb7185');
      mctx.beginPath();
      mctx.arc(u.x * sx, u.y * sy, u.kind === 'playerHero' ? 4.2 : 3, 0, Math.PI * 2);
      mctx.fill();
    }

    // Viewport rectangle
    mctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    mctx.lineWidth = 1.2;
    mctx.strokeRect(cam.x * sx, cam.y * sy, cam.viewW * sx, cam.viewH * sy);
  }

  M.Renderer = {
    render: render
  };
})(window.MOBA);
