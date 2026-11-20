// RS-style chatbox: live 3D portrait, typewriter text with blip voices, reply options.
import * as THREE from 'three';
import { SFX } from './sfx.js';

const CPS = 48; // characters per second

export function createDialogue({ onClose }) {
  const box = document.getElementById('chat');
  const nameEl = document.getElementById('chat-name');
  const textEl = document.getElementById('chat-text');
  const optsEl = document.getElementById('chat-options');
  const hintEl = document.getElementById('chat-hint');
  const canvas = document.getElementById('chat-portrait');

  // Portrait renderer (separate tiny WebGL context)
  const pr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  pr.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  pr.setSize(canvas.clientWidth || 104, canvas.clientHeight || 104, false);
  const pScene = new THREE.Scene();
  pScene.add(new THREE.HemisphereLight('#ffffff', '#3a3428', 1.1));
  const key = new THREE.DirectionalLight('#fff4e0', 1.6);
  key.position.set(1.2, 2, 2);
  pScene.add(key);
  const pCam = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  let portraitModel = null;
  let portraitSpeaker = null;

  let run = null;

  box.addEventListener('click', (e) => {
    if (e.target.closest('.chat-opt')) return;
    advance();
  });

  function setPortrait(speaker) {
    if (portraitSpeaker === speaker) return;
    portraitSpeaker = speaker;
    if (portraitModel) { pScene.remove(portraitModel); portraitModel = null; }
    if (!speaker || !speaker.model) { canvas.style.visibility = 'hidden'; return; }
    canvas.style.visibility = 'visible';
    portraitModel = speaker.model.clone(true);
    portraitModel.position.set(0, 0, 0);
    portraitModel.rotation.set(0, 0.35, 0);
    pScene.add(portraitModel);
    const hy = speaker.model.userData.headY || 1.5;
    const span = Math.max(0.55, hy * 0.55);
    pCam.position.set(0.15 * span, hy + 0.05 * span, 2.3 * span);
    pCam.lookAt(0, hy - 0.08 * span, 0);
  }

  function start(dialog) {
    // dialog: { nodes, startNode, speaker(id) -> {name, voice, model}, fill(str) -> str, onAction(action) -> nodeId|void }
    run = { ...dialog, nodeId: null, lineIdx: 0, full: '', shown: 0, lastBlip: 0, options: null };
    box.classList.add('show');
    enterNode(dialog.startNode);
  }

  function enterNode(id) {
    const node = run && run.nodes[id];
    if (!node) return close();
    run.nodeId = id;
    run.lineIdx = 0;
    run.options = null;
    // actions run on entry; an action may redirect to another node
    for (const a of node.actions || []) {
      const redirect = run.onAction(a);
      if (redirect) return enterNode(redirect);
    }
    let lines = node.lines || [];
    if (node.randomLine && lines.length) lines = [lines[Math.floor(Math.random() * lines.length)]];
    run.lines = lines.map((l) => run.fill(l));
    if (node.speaker === 'player' || !run.lines.length) return showOptions(node);
    showLine();
  }

  function showLine() {
    const node = run.nodes[run.nodeId];
    const spk = node.speaker === 'narrator' ? null : run.speaker(node.speaker);
    setPortrait(spk);
    nameEl.textContent = spk ? spk.name : '';
    box.classList.toggle('narrator', node.speaker === 'narrator');
    run.full = run.lines[run.lineIdx];
    run.shown = 0;
    run.lastBlip = 0;
    run.voice = spk ? spk.voice : null;
    textEl.textContent = '';
    optsEl.innerHTML = '';
    hintEl.textContent = 'Click or Space to continue';
  }

  function showOptions(node) {
    // Player choice node: options [{ text, next, actions }]
    const opts = node.options || [];
    if (!opts.length) {
      if (node.next) return enterNode(node.next);
      return close();
    }
    run.options = opts;
    setPortrait(null);
    nameEl.textContent = 'You';
    box.classList.remove('narrator');
    textEl.textContent = '';
    hintEl.textContent = 'Choose a reply (1-4)';
    optsEl.innerHTML = opts.map((o, i) => `<button type="button" class="chat-opt" data-i="${i}"><b>${i + 1}.</b> ${run.fill(o.text)}</button>`).join('');
    optsEl.querySelectorAll('.chat-opt').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.i))));
  }

  function choose(i) {
    if (!run || !run.options || !run.options[i]) return;
    const o = run.options[i];
    run.options = null;
    for (const a of o.actions || []) {
      const redirect = run.onAction(a);
      if (redirect) return enterNode(redirect);
    }
    if (o.next) enterNode(o.next);
    else close();
  }

  function advance() {
    if (!run || run.options) return;
    if (run.shown < run.full.length) { run.shown = run.full.length; textEl.textContent = run.full; return; }
    run.lineIdx++;
    if (run.lineIdx < run.lines.length) return showLine();
    const node = run.nodes[run.nodeId];
    if (node.options) return showOptions(node);
    if (node.next) {
      const next = run.nodes[node.next];
      if (next && next.speaker === 'player') return showOptions(next);
      return enterNode(node.next);
    }
    close();
  }

  function close() {
    if (!run) return;
    run = null;
    box.classList.remove('show');
    setPortrait(null);
    if (onClose) onClose();
  }

  function update(dt) {
    if (!run) return;
    if (run.shown < run.full.length) {
      const before = Math.floor(run.shown);
      run.shown = Math.min(run.full.length, run.shown + CPS * dt);
      const now = Math.floor(run.shown);
      textEl.textContent = run.full.slice(0, now);
      if (run.voice && now - run.lastBlip >= 2) {
        const ch = run.full[now - 1] || ' ';
        if (ch.trim()) SFX.blip(run.voice, ch);
        run.lastBlip = now;
      }
      if (before === now && now === 0) textEl.textContent = '';
    }
    if (portraitModel) {
      portraitModel.rotation.y = 0.35 + Math.sin(performance.now() * 0.0015) * 0.08;
      pr.render(pScene, pCam);
    }
  }

  function keydown(code) {
    if (!run) return false;
    if (code === 'Space' || code === 'Enter') { advance(); return true; }
    const m = /^Digit([1-4])$/.exec(code);
    if (m && run.options) { choose(Number(m[1]) - 1); return true; }
    if (code === 'Escape') { close(); return true; }
    return false;
  }

  return { start, close, update, keydown, isOpen: () => !!run };
}
