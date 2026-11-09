window.MOBA = window.MOBA || {};

(function (M) {
  'use strict';

  function rayCircleDistance(ox, oy, dx, dy, cx, cy, r) {
    const fx = ox - cx;
    const fy = oy - cy;
    // If origin is inside circle slightly, push outside rather than blocking self
    const distSq = fx * fx + fy * fy;
    if (distSq <= r * r) return Infinity;

    const proj = -(fx * dx + fy * dy);
    if (proj <= 0) return Infinity;

    const perpSq = distSq - proj * proj;
    const rSq = r * r;
    if (perpSq >= rSq) return Infinity;

    const thc = Math.sqrt(rSq - perpSq);
    const t0 = proj - thc;
    return t0 > 0 ? t0 : Infinity;
  }

  function rayRectDistance(ox, oy, dx, dy, rx, ry, rw, rh) {
    const invX = dx !== 0 ? 1 / dx : 1e9;
    const invY = dy !== 0 ? 1 / dy : 1e9;

    let t1 = (rx - ox) * invX;
    let t2 = (rx + rw - ox) * invX;
    let tmin = Math.min(t1, t2);
    let tmax = Math.max(t1, t2);

    let ty1 = (ry - oy) * invY;
    let ty2 = (ry + rh - oy) * invY;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));

    if (tmax < 0 || tmin > tmax) return Infinity;
    return tmin > 0 ? tmin : Infinity;
  }

  function segmentIntersectsCircle(ax, ay, bx, by, cx, cy, r) {
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 0.001) return false;
    let t = ((cx - ax) * abx + (cy - ay) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * abx;
    const py = ay + t * aby;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy < r * r;
  }

  function segmentIntersectsRect(ax, ay, bx, by, rx, ry, rw, rh) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return false;
    const hit = rayRectDistance(ax, ay, dx / len, dy / len, rx, ry, rw, rh);
    return hit < len;
  }

  function hasLineOfSight(ax, ay, bx, by) {
    const trees = M.TREES;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (segmentIntersectsCircle(ax, ay, bx, by, t.x, t.y, t.r * 0.84)) {
        return false;
      }
    }
    const walls = M.WALLS;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (segmentIntersectsRect(ax, ay, bx, by, w.x, w.y, w.w, w.h)) {
        return false;
      }
    }
    return true;
  }

  // Fast radial + corner-tangent visibility polygon for smooth 60fps canvas fog
  function computeVisibilityPolygon(ox, oy, maxRange) {
    const angles = [];
    const baseSteps = 144;
    for (let i = 0; i < baseSteps; i++) {
      angles.push((i / baseSteps) * Math.PI * 2 - Math.PI);
    }

    const rPlus = maxRange + 80;
    const trees = M.TREES;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = t.x - ox;
      const dy = t.y - oy;
      const d = Math.hypot(dx, dy);
      const tr = t.r * 0.84;
      if (d < rPlus && d > tr + 1) {
        const base = Math.atan2(dy, dx);
        const spread = Math.asin(Math.min(0.999, tr / d));
        angles.push(base - spread - 0.003, base - spread + 0.003);
        angles.push(base + spread - 0.003, base + spread + 0.003);
      }
    }

    const walls = M.WALLS;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (Math.abs(w.x - ox) > rPlus && Math.abs(w.x + w.w - ox) > rPlus) continue;
      const corners = [
        [w.x, w.y],
        [w.x + w.w, w.y],
        [w.x + w.w, w.y + w.h],
        [w.x, w.y + w.h]
      ];
      for (let c = 0; c < 4; c++) {
        const ang = Math.atan2(corners[c][1] - oy, corners[c][0] - ox);
        angles.push(ang - 0.0025, ang + 0.0025);
      }
    }

    angles.sort(function (a, b) { return a - b; });

    const pts = [];
    for (let i = 0; i < angles.length; i++) {
      const ang = angles[i];
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      let best = maxRange;

      for (let j = 0; j < trees.length; j++) {
        const t = trees[j];
        const hit = rayCircleDistance(ox, oy, dx, dy, t.x, t.y, t.r * 0.84);
        if (hit < best) best = hit;
      }
      for (let j = 0; j < walls.length; j++) {
        const w = walls[j];
        const hit = rayRectDistance(ox, oy, dx, dy, w.x, w.y, w.w, w.h);
        if (hit < best) best = hit;
      }

      pts.push({ x: ox + dx * best, y: oy + dy * best });
    }
    return pts;
  }

  function isSeenByEnemyTeam(unit, state) {
    if (unit.stealthTimer > 0) return false;

    const enemies = state.units;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || e.team === unit.team) continue;
      if (e.kind === 'shooter' && !state.shooterEnabled) continue;
      const range = M.WORLD.visionRangeDummy;
      const d = Math.hypot(unit.x - e.x, unit.y - e.y);
      if (d <= range && hasLineOfSight(e.x, e.y, unit.x, unit.y)) {
        return true;
      }
    }

    for (let i = 0; i < state.wards.length; i++) {
      const w = state.wards[i];
      if (w.team === unit.team) continue;
      const d = Math.hypot(unit.x - w.x, unit.y - w.y);
      if (d <= w.radius && hasLineOfSight(w.x, w.y, unit.x, unit.y)) {
        return true;
      }
    }

    return false;
  }

  M.Vision = {
    hasLineOfSight: hasLineOfSight,
    computeVisibilityPolygon: computeVisibilityPolygon,
    isSeenByEnemyTeam: isSeenByEnemyTeam
  };
})(window.MOBA);
