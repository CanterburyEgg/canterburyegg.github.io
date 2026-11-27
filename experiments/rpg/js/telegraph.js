// =====================================================================
// TELEGRAPHS: flat shapes draped on the terrain. Used for the player's ability aim preview, the
// flash when an ability fires, and (Phase C) creatures' warnings before big attacks.
// Shapes come from abilities.js resolveShape(): line / cone / circle.
// =====================================================================
import * as THREE from 'three';

const LIFT = 0.06; // above the ground so it doesn't z-fight

function shapeOutline(s) {
  // ground-plane polygon (x, z) for the shape, enough points to drape over hills
  const pts = [];
  if (s.type === 'circle') {
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push([s.cx + Math.sin(a) * s.radius, s.cz + Math.cos(a) * s.radius]); }
    return { pts, center: [s.cx, s.cz] };
  }
  if (s.type === 'cone') {
    const n = 18;
    for (let i = 0; i <= n; i++) { const a = s.angle - s.half + (i / n) * s.half * 2; pts.push([s.ox + Math.sin(a) * s.radius, s.oz + Math.cos(a) * s.radius]); }
    return { pts, center: [s.ox, s.oz], fan: true };
  }
  // line: a rectangle, subdivided along its length
  const px = s.uz, pz = -s.ux, hw = s.width / 2, n = Math.max(2, Math.ceil(s.length / 1.5));
  const left = [], right = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * s.length;
    left.push([s.ox + s.ux * t + px * hw, s.oz + s.uz * t + pz * hw]);
    right.push([s.ox + s.ux * t - px * hw, s.oz + s.uz * t - pz * hw]);
  }
  return { strip: [left, right] };
}

function buildGeometry(s, heightAt) {
  const o = shapeOutline(s);
  const pos = [], idx = [];
  const v = (x, z) => { pos.push(x, heightAt(x, z) + LIFT, z); return pos.length / 3 - 1; };
  if (o.strip) {
    const [L, R] = o.strip;
    const li = L.map(([x, z]) => v(x, z)), ri = R.map(([x, z]) => v(x, z));
    for (let i = 0; i < li.length - 1; i++) idx.push(li[i], ri[i], li[i + 1], li[i + 1], ri[i], ri[i + 1]);
  } else {
    const c = v(o.center[0], o.center[1]);
    const ring = o.pts.map(([x, z]) => v(x, z));
    const n = ring.length;
    for (let i = 0; i < (o.fan ? n - 1 : n); i++) idx.push(c, ring[i], ring[(i + 1) % n]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// A telegraph mesh you can re-shape every frame. color/opacity set the look; set .visible yourself.
export function createTelegraph(scene, color = '#ffe680', opacity = 0.32) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return {
    mesh,
    set(shape, heightAt) {
      mesh.geometry.dispose();
      mesh.geometry = buildGeometry(shape, heightAt);
      mesh.visible = true;
    },
    color(c, a) { mat.color.set(c); if (a !== undefined) mat.opacity = a; },
    hide() { mesh.visible = false; },
    dispose() { scene.remove(mesh); mesh.geometry.dispose(); mat.dispose(); },
  };
}

// A short-lived flash of a shape (ability fired / landed). Fades out over `life` seconds.
export function flashShape(scene, shape, heightAt, color = '#ffffff', life = 0.35) {
  const t = createTelegraph(scene, color, 0.5);
  t.set(shape, heightAt);
  return { t, life, max: life };
}

// A tracer line for gunshots (from muzzle to impact), fades fast.
export function tracer(scene, a, b, color = '#ffe9a8') {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  line.frustumCulled = false;
  scene.add(line);
  return { line, life: 0.12, max: 0.12 };
}
