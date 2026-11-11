// Dev tool: arena3d.html?clipscan=<heroId> logs key moments of each of that hero's clips (CLIPSCAN lines):
//  - handPeaks: times of the fastest hand motion (a jab/throw/swing making contact)
//  - handHeadMin: when a hand is closest to the head (kiss, drink)
//  - spin: the window where the hips rotate fastest (a twirl), plus total yaw turned
// Loaded by boot.js only when the URL asks for it.
(function () {
'use strict';
const m = /[?&]clipscan=([a-z]+)/.exec(location.search);
if (!m) return;
const heroId = m[1];

function run() {
  ensureHeroTemplateReady(heroId);
  const tmpl = heroTemplates[heroId];
  if (!tmpl || !tmpl.fbx) { console.log('CLIPSCAN none ' + heroId); return; }
  const model = SkeletonUtils.clone(tmpl.fbx);
  const box = new THREE.Box3().setFromObject(model);
  const h = box.getSize(new THREE.Vector3()).y || 1;
  model.scale.multiplyScalar(1.8 / h);
  scene.add(model);
  const bones = {};
  model.traverse((o) => { if (o.name) { const c = canonicalMixamoBone(o.name); if (o.isBone || !bones[c]) bones[c] = o; } });
  const mixer = new THREE.AnimationMixer(model);
  const v = (o) => { const p = new THREE.Vector3(); o.getWorldPosition(p); return p; };
  Object.keys(tmpl.clips).forEach((slot) => {
    const src = tmpl.clips[slot];
    const clip = prepareClipForModel(src, model, slot, {});
    mixer.stopAllAction();
    const act = mixer.clipAction(clip);
    act.reset().play();
    const N = Math.max(10, Math.round(clip.duration * 60));
    const rows = [];
    let prevR = null, prevL = null, prevYaw = null;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * clip.duration;
      mixer.setTime(t);
      model.updateMatrixWorld(true);
      const r = bones.RightHand ? v(bones.RightHand) : null;
      const l = bones.LeftHand ? v(bones.LeftHand) : null;
      const hd = bones.Head ? v(bones.Head) : null;
      const q = bones.Hips ? bones.Hips.getWorldQuaternion(new THREE.Quaternion()) : null;
      const yaw = q ? new THREE.Euler().setFromQuaternion(q, 'YXZ').y : 0;
      const dt = clip.duration / N;
      const speedR = r && prevR ? r.distanceTo(prevR) / dt : 0;
      const speedL = l && prevL ? l.distanceTo(prevL) / dt : 0;
      let dyaw = prevYaw === null ? 0 : yaw - prevYaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const hy = bones.Hips ? v(bones.Hips).y : 0;
      const handY = Math.max(r ? r.y : 0, l ? l.y : 0);
      rows.push({ t, speedR, speedL, dR: r && hd ? r.distanceTo(hd) : 9, dL: l && hd ? l.distanceTo(hd) : 9, dyaw, hy, handY });
      prevR = r; prevL = l; prevYaw = yaw;
    }
    const peaks = rows.slice(1).map((x) => ({ t: +x.t.toFixed(2), s: +Math.max(x.speedR, x.speedL).toFixed(2), hand: x.speedR >= x.speedL ? 'R' : 'L' }))
      .sort((a, b) => b.s - a.s);
    const topPeaks = [];
    peaks.forEach((p) => { if (topPeaks.length < 3 && topPeaks.every((q) => Math.abs(q.t - p.t) > 0.15)) topPeaks.push(p); });
    let hm = rows[0];
    rows.forEach((x) => { if (Math.min(x.dR, x.dL) < Math.min(hm.dR, hm.dL)) hm = x; });
    // spin: best 0.6s window of accumulated |yaw| change
    const win = Math.max(1, Math.round(0.6 / (clip.duration / N)));
    let best = { a: 0, sum: 0 };
    for (let i = 1; i + win < rows.length; i++) {
      let sum = 0;
      for (let k = i; k < i + win; k++) sum += rows[k].dyaw;
      if (Math.abs(sum) > Math.abs(best.sum)) best = { a: i, sum };
    }
    let totalYaw = 0;
    rows.forEach((x) => { totalYaw += x.dyaw; });
    console.log('CLIPSCAN ' + JSON.stringify({
      hero: heroId, slot, duration: +clip.duration.toFixed(2),
      handPeaks: topPeaks,
      handHeadMin: { t: +hm.t.toFixed(2), d: +Math.min(hm.dR, hm.dL).toFixed(2), hand: hm.dR <= hm.dL ? 'R' : 'L' },
      spin: { from: +rows[best.a].t.toFixed(2), to: +(rows[best.a].t + 0.6).toFixed(2), yawDeg: Math.round(best.sum * 57.3) },
      totalYawDeg: Math.round(totalYaw * 57.3),
      hipsY: rows.filter((x, i) => i % Math.max(1, Math.round(N / clip.duration / 4)) === 0).map((x) => +x.hy.toFixed(2)),
      handsY: rows.filter((x, i) => i % Math.max(1, Math.round(N / clip.duration / 4)) === 0).map((x) => +x.handY.toFixed(2))
    }));
  });
  scene.remove(model);
  console.log('CLIPSCAN done');
}
window.__runClipScan = run;
})();
