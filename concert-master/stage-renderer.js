/**
 * CADENZA — "Concert Hall in Space" 3D Rollercoaster Stage Renderer
 *
 * Pure hardware-accelerated 2D Canvas with true 3D perspective highway projection:
 *   - Steady note approach speed (z strictly proportional to time-to-hit) so timing never warps
 *   - Audiosurf-style 3D hills, crests, dives, and gentle lateral sway driven by macro dynamics
 *   - Floating philharmonic proscenium arches, starlight streaks, keybed depression & shockwaves
 */

export class StageRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 1280;
    this.height = 720;
    this.dpr = 1;

    // Visual state
    this.worldTravel = 0;
    this.smoothedIntensity = 0.2;
    this.smoothedSlope = 0;
    this.cameraShake = 0;

    // Starfield & floating concert-hall acoustic arches
    this.stars = this._initStars(190);
    this.arches = this._initArches(9);
    this.particles = [];
    this.shockwaves = [];
    this.laneBeams = new Float32Array(8);
    this.ghostAlpha = [0, 0]; // fade level of the ghost S / L lanes

    this.resize();
  }

  _initStars(count) {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: (Math.random() - 0.5) * 3200,
        y: (Math.random() - 0.55) * 2000,
        z: Math.random() * 1600 + 60,
        size: Math.random() * 1.9 + 0.5,
        warmth: Math.random(),
      });
    }
    return arr;
  }

  _initArches(count) {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        zNorm: i / count,
      });
    }
    return arr;
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  triggerHitEffect({ lane, totalLanes, judgment }) {
    const mult = judgment === 'perfect' ? 1.0 : judgment === 'great' ? 0.7 : 0.4;
    if (lane >= 0 && lane < totalLanes + 2) {
      this.laneBeams[lane] = Math.min(1, 0.95 * mult);
      const isLeft = this._isLeftLane(lane, totalLanes);
      const uCenter = this._laneCenterU(lane, totalLanes);
      const col =
        judgment === 'perfect'
          ? 'hsla(43, 92%, 78%, '
          : isLeft
          ? 'hsla(198, 70%, 76%, '
          : 'hsla(38, 85%, 68%, ';
      const count = judgment === 'perfect' ? 12 : 7;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          u: uCenter,
          vx: (Math.random() - 0.5) * 170,
          vy: -Math.random() * 210 - 50,
          xOff: 0,
          yOff: 0,
          life: 1,
          decay: 2.3 + Math.random() * 1.3,
          size: 2 + Math.random() * 2.6,
          color: col,
        });
      }
    }
  }

  /**
   * Normalized horizontal highway coordinate u in [-1, +1] with a clean center hand gap!
   */
  _laneBoundsU(lane, totalLanes) {
    const centerGap = 0.065; // Subtle visual split between Left Hand and Right Hand
    const usable = 2.0 - centerGap;
    const laneW = usable / totalLanes;
    if (lane >= totalLanes) {
      // Ghost lanes: slimmer lanes hovering just outside the deck (S far left, L far right)
      const gw = laneW * 0.62;
      const gap = 0.035;
      const left = lane === totalLanes ? -1.0 - gap - gw : 1.0 + gap;
      return { left, right: left + gw, center: left + gw * 0.5, width: gw };
    }
    const half = totalLanes >> 1;
    let left = -1.0 + lane * laneW;
    if (lane >= half) left += centerGap;
    return { left, right: left + laneW, center: left + laneW * 0.5, width: laneW };
  }

  /** Left-hand lane? (ghost S counts as left hand, ghost L as right hand) */
  _isLeftLane(lane, totalLanes) {
    if (lane === totalLanes) return true;
    if (lane === totalLanes + 1) return false;
    return lane < totalLanes / 2;
  }

  _laneCenterU(lane, totalLanes) {
    return this._laneBoundsU(lane, totalLanes).center;
  }

  /**
   * Projects highway normalized coordinates:
   *   u: [-1..+1] across deck width
   *   zNorm: [0..1] from strike line (0) to horizon (1)
   */
  _project(u, zNorm, curveState) {
    const w = this.width;
    const h = this.height;

    const zDepth = zNorm * 1350;
    const camDist = 235;
    const scale = camDist / (camDist + zDepth);

    // Rollercoaster vertical elevation & gentle lateral sway
    // Anchored cleanly at 0 when zNorm = 0 so the strike line stays rock-solid!
    const zCurve = zNorm * zNorm;
    const hillWave = Math.sin(zNorm * 3.1 - this.worldTravel * 0.45) * 36 * curveState.intensity;
    const elevOffset = curveState.elevationBias * zCurve * 290 + hillWave * zNorm;
    const swayOffset = Math.sin(this.worldTravel * 0.24 + zNorm * 2.1) * (45 + 65 * curveState.intensity) * zCurve;

    // (modes with ghost keys keep a little room outside the deck for the ghost lanes)
    const deckHalfWidthPx = curveState.ghostMode
      ? Math.min(w * 0.37, 430)
      : Math.min(w * 0.44, 390 + curveState.totalLanes * 22);
    const strikeY = h * 0.815;
    const horizonBaseY = h * 0.30;

    const baseScreenY = horizonBaseY + (strikeY - horizonBaseY) * scale;
    const sx = w * 0.5 + (u * deckHalfWidthPx + swayOffset) * scale + curveState.shakeX;
    const sy = baseScreenY - elevOffset * scale + curveState.shakeY;

    return { x: sx, y: sy, scale };
  }

  render(dt, state) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const {
      isPlaying = false,
      songTime = 0,
      approachTime = 1.4,
      mode,
      notes = [],
      pressedLanes = [],
      features = null,
    } = state;

    const totalLanes = mode ? mode.lanes : 6;

    // Sample current & upcoming macro intensity for Audiosurf coaster feel
    let curIntensity = 0.22;
    let futureIntensity = 0.22;
    if (features && isPlaying && songTime >= 0) {
      const fNow = Math.min(features.numFrames - 1, Math.max(0, Math.floor(songTime / features.frameDt)));
      const fAhead = Math.min(
        features.numFrames - 1,
        Math.max(0, Math.floor((songTime + 1.8) / features.frameDt))
      );
      curIntensity = features.macroIntensity[fNow] || 0;
      futureIntensity = features.macroIntensity[fAhead] || 0;
    } else if (!isPlaying) {
      // Gentle ambient breathing in lobby
      curIntensity = 0.24 + 0.1 * Math.sin(performance.now() * 0.0008);
      futureIntensity = 0.24 + 0.1 * Math.cos(performance.now() * 0.0008);
    }

    this.smoothedIntensity += (curIntensity - this.smoothedIntensity) * Math.min(1, dt * 4.2);
    // Quiet / crescendo climbs upward (+); loud fff climax plunges downward (-)
    const targetSlope = (0.44 - this.smoothedIntensity) * 0.85 + (futureIntensity - curIntensity) * 0.65;
    this.smoothedSlope += (targetSlope - this.smoothedSlope) * Math.min(1, dt * 2.4);

    // Environment rush speed accelerates dramatically on fff drops without altering note approachTime!
    const envSpeed = (isPlaying ? 1.0 : 0.35) * (0.65 + this.smoothedIntensity * 2.65);
    this.worldTravel += dt * envSpeed;

    // Decay transient effects
    this.cameraShake = Math.max(0, this.cameraShake - dt * 38);
    for (let i = 0; i < 8; i++) {
      this.laneBeams[i] = Math.max(0, this.laneBeams[i] - dt * 5.2);
    }

    const shakeX = this.cameraShake > 0.1 ? (Math.random() - 0.5) * this.cameraShake : 0;
    const shakeY = this.cameraShake > 0.1 ? (Math.random() - 0.5) * this.cameraShake : 0;

    // Ghost lanes fade in shortly before a ghost note arrives and fade out once it has passed
    const ghostMode = !!(mode && mode.ghostCodes && state.ghostEnabled);
    const ghostTarget = [0, 0];
    if (ghostMode) {
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.time > songTime + approachTime + 0.6) break;
        if (!n.ghost || n.time < songTime - 0.35) continue;
        ghostTarget[n.ghost === 'S' ? 0 : 1] = 1;
      }
      for (let g = 0; g < 2; g++) if (pressedLanes[totalLanes + g]) ghostTarget[g] = Math.max(ghostTarget[g], 0.6);
    }
    for (let g = 0; g < 2; g++) {
      this.ghostAlpha[g] += (ghostTarget[g] - this.ghostAlpha[g]) * Math.min(1, dt * 7);
    }

    const curveState = {
      intensity: this.smoothedIntensity,
      elevationBias: this.smoothedSlope,
      totalLanes,
      ghostMode,
      shakeX,
      shakeY,
    };

    // 1. Celestial Concert-Hall Backdrop
    this._drawBackdrop(ctx, w, h, dt, envSpeed, curveState);

    // 2. Floating Philharmonic Acoustic Proscenium Arches
    this._drawConcertArches(ctx, dt, envSpeed, curveState);

    // 3. 3D Curved Highway Deck & Center Hand Split
    this._drawHighwayDeck(ctx, totalLanes, pressedLanes, curveState);

    // 4. Notes (Hold Ribbons, Space Shockwave Bars, Cross-Hand Connectors & Tap Gems)
    if (notes.length > 0) {
      this._drawNotes(ctx, notes, songTime, approachTime, totalLanes, curveState);
    }

    // 5. Strike Line Keybed Pads & Shockwaves
    this._drawStrikeKeybed(ctx, mode, pressedLanes, curveState);
    this._drawParticlesAndShockwaves(ctx, dt, curveState);
  }

  _drawBackdrop(ctx, w, h, dt, envSpeed, curveState) {
    const inten = curveState.intensity;
    const horizonP = this._project(0, 1.0, curveState);

    // Deep obsidian sky warming into burnished amber-gold spotlight at the horizon during tuttis
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, 'hsl(224, 34%, 4%)');
    skyGrad.addColorStop(0.45, `hsl(${220 - inten * 18}, ${28 + inten * 14}%, ${6 + inten * 5}%)`);
    skyGrad.addColorStop(1, 'hsl(222, 30%, 4%)');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Warm stage glow blooming at vanishing point
    const glowRadius = Math.max(w, h) * (0.34 + inten * 0.28);
    const glow = ctx.createRadialGradient(
      horizonP.x,
      horizonP.y,
      8,
      horizonP.x,
      horizonP.y,
      glowRadius
    );
    glow.addColorStop(0, `hsla(${38 + inten * 6}, 88%, ${58 + inten * 14}%, ${0.14 + inten * 0.24})`);
    glow.addColorStop(0.45, `hsla(198, 55%, 52%, ${0.06 + (1 - inten) * 0.05})`);
    glow.addColorStop(1, 'hsla(222, 30%, 4%, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Starlight & high-intensity warp streaks
    const starSpeed = 240 * envSpeed;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.z -= dt * starSpeed;
      if (s.z <= 25) {
        s.z = 1620;
        s.x = (Math.random() - 0.5) * 3200;
        s.y = (Math.random() - 0.55) * 2000;
      }

      const k = 280 / s.z;
      const sx = horizonP.x + s.x * k;
      const sy = horizonP.y + s.y * k;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;

      const alpha = Math.min(0.85, (1 - s.z / 1650) * 0.9);
      const radius = Math.max(0.6, s.size * k * 0.85);
      const hue = s.warmth > 0.55 ? 42 : 198;
      const sat = s.warmth > 0.55 ? '75%' : '52%';

      if (inten > 0.45) {
        // Draw motion streak on high-energy sections
        const prevK = 280 / (s.z + starSpeed * 0.032 * inten);
        const px = horizonP.x + s.x * prevK;
        const py = horizonP.y + s.y * prevK;
        ctx.strokeStyle = `hsla(${hue}, ${sat}, 82%, ${alpha * 0.55})`;
        ctx.lineWidth = Math.max(0.8, radius * 0.8);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }

      ctx.fillStyle = `hsla(${hue}, ${sat}, 86%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawConcertArches(ctx, dt, envSpeed, curveState) {
    // Sweeping golden acoustic canopy ribs framing the highway in space
    const inten = curveState.intensity;
    for (let i = 0; i < this.arches.length; i++) {
      const arch = this.arches[i];
      arch.zNorm -= dt * envSpeed * 0.22;
      if (arch.zNorm <= 0.02) arch.zNorm += 0.98;

      const z = arch.zNorm;
      const leftFoot = this._project(-1.35, z, curveState);
      const rightFoot = this._project(1.35, z, curveState);
      const span = rightFoot.x - leftFoot.x;
      const archHeight = span * 0.44;
      const midX = (leftFoot.x + rightFoot.x) * 0.5;
      const fade = Math.sin(z * Math.PI) * (0.12 + inten * 0.16);

      ctx.strokeStyle = `hsla(41, 72%, 66%, ${fade})`;
      ctx.lineWidth = Math.max(0.75, 2.2 * leftFoot.scale);
      ctx.beginPath();
      ctx.moveTo(leftFoot.x, leftFoot.y);
      ctx.quadraticCurveTo(midX, leftFoot.y - archHeight, rightFoot.x, rightFoot.y);
      ctx.stroke();
    }
  }

  _drawHighwayDeck(ctx, totalLanes, pressedLanes, curveState) {
    const SEGMENTS = 34;
    const inten = curveState.intensity;

    // Draw segmented 3D highway surface from horizon (z=1) to strike line (z=0)
    for (let s = SEGMENTS - 1; s >= 0; s--) {
      const z0 = s / SEGMENTS;
      const z1 = (s + 1) / SEGMENTS;

      const p0L = this._project(-1.02, z0, curveState);
      const p0R = this._project(1.02, z0, curveState);
      const p1L = this._project(-1.02, z1, curveState);
      const p1R = this._project(1.02, z1, curveState);

      const depthAlpha = (1 - z0 * 0.72) * 0.88;
      // Subtle alternating acoustic stageplank shimmer moving with worldTravel
      const stripe = Math.sin((z0 * 14 - this.worldTravel * 2.2) * Math.PI) > 0 ? 1.5 : 0;
      ctx.fillStyle = `hsla(222, 26%, ${6.5 + stripe + inten * 2.5}%, ${depthAlpha})`;

      ctx.beginPath();
      ctx.moveTo(p1L.x, p1L.y);
      ctx.lineTo(p1R.x, p1R.y);
      ctx.lineTo(p0R.x, p0R.y);
      ctx.lineTo(p0L.x, p0L.y);
      ctx.closePath();
      ctx.fill();
    }

    // Ghost lanes: faint dashed strips just outside the deck while a ghost note is near
    if (curveState.ghostMode) {
      for (let g = 0; g < 2; g++) {
        const ga = this.ghostAlpha[g];
        if (ga <= 0.02) continue;
        const b = this._laneBoundsU(totalLanes + g, totalLanes);
        const hue = g === 0 ? 198 : 41;
        ctx.fillStyle = `hsla(${hue}, 60%, 70%, ${0.09 * ga})`;
        ctx.beginPath();
        const STEPS = 18;
        for (let i = 0; i <= STEPS; i++) {
          const p = this._project(b.left, i / STEPS, curveState);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        for (let i = STEPS; i >= 0; i--) {
          const p = this._project(b.right, i / STEPS, curveState);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.setLineDash([6, 7]);
        ctx.strokeStyle = `hsla(${hue}, 70%, 80%, ${0.38 * ga})`;
        ctx.lineWidth = 1.2;
        for (const u of [b.left, b.right]) {
          ctx.beginPath();
          for (let i = 0; i <= STEPS; i++) {
            const p = this._project(u, i / STEPS, curveState);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Active / pressed lane light wash + hit beams
    for (let lane = 0; lane < totalLanes + (curveState.ghostMode ? 2 : 0); lane++) {
      const isDown = pressedLanes[lane];
      const beam = this.laneBeams[lane] || 0;
      if (!isDown && beam <= 0.01) continue;

      const b = this._laneBoundsU(lane, totalLanes);
      const isLeft = this._isLeftLane(lane, totalLanes);
      const hue = isLeft ? 198 : 41;
      const alpha = Math.min(0.42, (isDown ? 0.16 : 0) + beam * 0.28);

      ctx.fillStyle = `hsla(${hue}, 75%, 66%, ${alpha})`;
      ctx.beginPath();
      const STEPS = 18;
      for (let i = 0; i <= STEPS; i++) {
        const p = this._project(b.left, (i / STEPS) * 0.85, curveState);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      for (let i = STEPS; i >= 0; i--) {
        const p = this._project(b.right, (i / STEPS) * 0.85, curveState);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Lane dividers & golden outer rails
    const railSteps = 26;
    for (let lane = 0; lane < totalLanes; lane++) {
      const b = this._laneBoundsU(lane, totalLanes);
      // Draw left edge of each lane, plus right edge of the last lane of each hand
      this._strokeHighwayLine(ctx, b.left, railSteps, curveState, lane === 0 || lane === totalLanes >> 1);
      if (lane === (totalLanes >> 1) - 1 || lane === totalLanes - 1) {
        this._strokeHighwayLine(ctx, b.right, railSteps, curveState, true);
      }
    }

  }

  _strokeHighwayLine(ctx, u, steps, curveState, isStrong) {
    ctx.strokeStyle = isStrong
      ? `hsla(41, 70%, 66%, ${0.32 + curveState.intensity * 0.25})`
      : 'hsla(40, 35%, 75%, 0.13)';
    ctx.lineWidth = isStrong ? 1.6 : 1.0;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = this._project(u, i / steps, curveState);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  _drawNotes(ctx, notes, songTime, approachTime, totalLanes, curveState) {
    const maxVisibleTime = songTime + approachTime;
    const minVisibleTime = songTime - 0.16;

    // Collect visible notes (back-to-front painter's order so near notes sit cleanly over far ones)
    const visible = [];
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.completed) continue;
      if (n.type === 'tap') {
        if (n.hit) continue;
        if (n.time > maxVisibleTime) break; // sorted by start time!
        if (n.time < minVisibleTime) continue;
      } else {
        // Hold ribbon: keep visible until endTime passes
        if (n.time > maxVisibleTime) break;
        if (n.endTime < minVisibleTime) continue;
      }
      visible.push(n);
    }

    // 1. Draw Hold Ribbon Tails first (subdivided along the 3D rollercoaster curve!)
    for (let i = visible.length - 1; i >= 0; i--) {
      const n = visible[i];
      if (n.type !== 'hold') continue;

      const headTime = n.holding ? Math.max(songTime, n.time) : n.time;
      const tailTime = Math.min(maxVisibleTime, n.endTime);
      const zHead = Math.max(-0.08, (headTime - songTime) / approachTime);
      const zTail = Math.min(1.0, (tailTime - songTime) / approachTime);
      if (zTail <= zHead + 0.004) continue;

      const b = this._laneBoundsU(n.lane, totalLanes);
      const pad = b.width * 0.17;
      const uL = b.left + pad;
      const uR = b.right - pad;
      const isLeft = this._isLeftLane(n.lane, totalLanes);
      const hue = isLeft ? 198 : 41;
      const alpha = n.missed ? 0.22 : n.holding ? 0.72 : 0.48;

      const segs = Math.max(4, Math.ceil((zTail - zHead) * 20));
      ctx.fillStyle = `hsla(${hue}, 78%, ${n.holding ? 72 : 60}%, ${alpha})`;
      ctx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const z = zHead + ((zTail - zHead) * s) / segs;
        const p = this._project(uL, z, curveState);
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      for (let s = segs; s >= 0; s--) {
        const z = zHead + ((zTail - zHead) * s) / segs;
        const p = this._project(uR, z, curveState);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();

      // Inner bright filament along hold ribbon
      ctx.strokeStyle = `hsla(${hue}, 90%, 86%, ${alpha * 0.9})`;
      ctx.lineWidth = n.holding ? 2.4 : 1.4;
      ctx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const z = zHead + ((zTail - zHead) * s) / segs;
        const p = this._project(b.center, z, curveState);
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // 2. Draw Cross-Hand Chord Tie Lines, Space Shockwave Bars & Note Heads (far to near)
    for (let i = visible.length - 1; i >= 0; i--) {
      const n = visible[i];
      if (n.hit) continue; // Hold already caught at strike line doesn't redraw head gem

      const z = (n.time - songTime) / approachTime;
      if (z < -0.1 || z > 1.0) continue;

      // Check if adjacent visible note has identical timestamp -> draw subtle harmonic chord tie!
      if (i > 0) {
        const sibling = visible[i - 1];
        if (
          !sibling.hit &&
          Math.abs(sibling.time - n.time) < 0.008
        ) {
          const c1 = this._project(this._laneCenterU(n.lane, totalLanes), z, curveState);
          const c2 = this._project(this._laneCenterU(sibling.lane, totalLanes), z, curveState);
          ctx.strokeStyle = `hsla(43, 88%, 78%, ${Math.min(0.75, (1.02 - z) * 2.5)})`;
          ctx.lineWidth = Math.max(1.2, 3.2 * c1.scale);
          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y);
          ctx.lineTo(c2.x, c2.y);
          ctx.stroke();
        }
      }

      // Finger Gem (cool celestial silver-blue on Left Hand, warm champagne brass on Right Hand)
      const b = this._laneBoundsU(n.lane, totalLanes);
      const pad = b.width * 0.08;
      const pL = this._project(b.left + pad, z, curveState);
      const pR = this._project(b.right - pad, z, curveState);
      const gemW = Math.max(6, pR.x - pL.x);
      const gemH = Math.max(4, 18 * pL.scale);
      const fade = Math.min(1, (1.03 - z) * 3.2);
      const isLeft = this._isLeftLane(n.lane, totalLanes);

      if (n.ghost) {
        // Ghost gem: translucent body with a bright glowing outline, so it reads as the "extra" fifth key
        ctx.fillStyle = isLeft ? `hsla(198, 70%, 78%, ${0.42 * fade})` : `hsla(41, 80%, 74%, ${0.42 * fade})`;
        this._roundRect(ctx, pL.x, pL.y - gemH * 0.5, gemW, gemH, Math.min(6, gemH * 0.4));
        ctx.fill();
        ctx.strokeStyle = `hsla(45, 100%, 95%, ${0.95 * fade})`;
        ctx.lineWidth = Math.max(1.2, 2.4 * pL.scale);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = isLeft
        ? `hsla(198, 76%, 72%, ${0.95 * fade})`
        : `hsla(41, 88%, 67%, ${0.95 * fade})`;
      this._roundRect(ctx, pL.x, pL.y - gemH * 0.5, gemW, gemH, Math.min(6, gemH * 0.4));
      ctx.fill();

      // Crisp specular highlight bar across gem top
      ctx.fillStyle = `hsla(45, 100%, 96%, ${0.72 * fade})`;
      this._roundRect(
        ctx,
        pL.x + gemW * 0.12,
        pL.y - gemH * 0.3,
        gemW * 0.76,
        Math.max(1.5, gemH * 0.24),
        2
      );
      ctx.fill();
    }
  }

  _drawStrikeKeybed(ctx, mode, pressedLanes, curveState) {
    const totalLanes = mode ? mode.lanes : 6;
    const labels = mode ? mode.labels : ['S', 'D', 'F', 'J', 'K', 'L'];

    // Strike horizon line
    const sL = this._project(-1.03, 0, curveState);
    const sR = this._project(1.03, 0, curveState);
    ctx.strokeStyle = 'hsla(42, 82%, 75%, 0.72)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(sL.x, sL.y);
    ctx.lineTo(sR.x, sR.y);
    ctx.stroke();

    // Individual Finger Keybed Pads (ghost S / L pads fade in with their lanes)
    const ghostOn = curveState.ghostMode;
    for (let lane = 0; lane < totalLanes + (ghostOn ? 2 : 0); lane++) {
      const ghostIdx = lane - totalLanes;
      const ga = ghostIdx >= 0 ? this.ghostAlpha[ghostIdx] : 1;
      if (ga <= 0.02) continue;
      ctx.save();
      ctx.globalAlpha = ga;
      const b = this._laneBoundsU(lane, totalLanes);
      const pL = this._project(b.left + b.width * 0.06, 0, curveState);
      const pR = this._project(b.right - b.width * 0.06, 0, curveState);
      const w = pR.x - pL.x;
      const h = 30;
      const isDown = !!pressedLanes[lane];
      const pressY = isDown ? 4 : 0;
      const isLeft = this._isLeftLane(lane, totalLanes);

      ctx.fillStyle = isDown
        ? isLeft
          ? 'hsla(198, 72%, 62%, 0.92)'
          : 'hsla(41, 86%, 62%, 0.92)'
        : 'hsla(222, 24%, 11%, 0.88)';
      ctx.strokeStyle = isDown
        ? 'hsla(45, 100%, 92%, 0.95)'
        : isLeft
        ? 'hsla(198, 52%, 68%, 0.42)'
        : 'hsla(41, 68%, 64%, 0.42)';
      ctx.lineWidth = 1.4;

      this._roundRect(ctx, pL.x, pL.y + 8 + pressY, w, h, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isDown ? 'hsl(222, 32%, 8%)' : 'hsla(40, 30%, 90%, 0.88)';
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = ghostIdx >= 0 ? (mode.ghostLabels || ['S', 'L'])[ghostIdx] : labels[lane];
      ctx.fillText(label || '', pL.x + w * 0.5, pL.y + 8 + pressY + h * 0.52);
      ctx.restore();
    }
  }

  _drawParticlesAndShockwaves(ctx, dt, curveState) {
    // Shockwave rings
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.progress += dt * 2.4;
      sw.alpha -= dt * 2.1;
      if (sw.alpha <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const center = this._project(0, sw.progress * 0.25, curveState);
      const rx = (280 + sw.progress * 420) * center.scale;
      const ry = (38 + sw.progress * 90) * center.scale;
      ctx.strokeStyle = `hsla(43, 95%, 76%, ${sw.alpha})`;
      ctx.lineWidth = 2.4 * (1 - sw.progress * 0.4);
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hit sparks
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.xOff += p.vx * dt;
      p.yOff += p.vy * dt;
      p.vy += 420 * dt; // subtle gravity arc

      const anchor = this._project(p.u, 0, curveState);
      ctx.fillStyle = `${p.color}${p.life.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(anchor.x + p.xOff, anchor.y + p.yOff, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }
}
