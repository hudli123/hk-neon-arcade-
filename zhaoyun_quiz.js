// 趙雲無雙・問答模式：每題派 4 個敵將出場，每人揹住一個選項（A–D）。
// 打倒寫住正確答案嗰個 → 回血 + 無雙 + 顯示解釋；打錯 → 扣血，題目繼續。答晒 → 張郃登場。
(() => {
  'use strict';
  const D = window.QUIZ_DATA;
  if (!D || !D.questions || !D.questions.length) return;
  const QS = D.questions, QN = QS.length, LET = 'ABCD';
  const COL = ['#ff5a5a', '#3fa9ff', '#3dff7a', '#ffd24a'];
  const ANS_HP = 60, ANS_R = 9, MAX_CROWD = 150, WRONG_DMG = 40;

  const Q = { on: false, idx: 0, tries: 0, ids: [], nextT: 0, firstTry: 0, missed: [], done: false, card: null, cardT: 0 };
  window.QZ = Q;
  S.ans = new Int8Array(NMAX).fill(-1);
  const BDAY = D.bday || null;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- UI ----------
  const css = document.createElement('style');
  css.textContent = `
#ko{display:none!important}
#qp{position:fixed;left:50%;top:10px;transform:translateX(-50%);width:min(620px,52vw);background:rgba(20,8,0,.78);border:2px solid #c9953b;border-radius:12px;padding:8px 14px 10px;color:#fff3dc;z-index:20;pointer-events:none;font-size:16px;line-height:1.45;box-shadow:0 4px 20px rgba(0,0,0,.5)}
#qp .hd{font-size:13px;color:#ffd27a;letter-spacing:1px;margin-bottom:2px}
#qp .qt{font-weight:700}
#qp .op{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin-top:6px}
#qp .op span{white-space:nowrap}
#qp .op b{display:inline-block;width:1.5em;height:1.5em;line-height:1.5em;text-align:center;border-radius:50%;color:#111;margin-right:6px;font-size:13px}
#qp .op .x{opacity:.35;text-decoration:line-through}
.qlab{position:fixed;left:0;top:0;transform:translate(-50%,-100%);padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.72);border:2px solid;color:#fff;font-weight:700;font-size:17px;white-space:nowrap;pointer-events:none;z-index:19;text-shadow:0 1px 2px #000}
.qlab.edge{opacity:.85;font-size:14px}
#qcard{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:50}
#qcard>div{max-width:min(560px,90vw);background:linear-gradient(#3a1a06,#1d0c02);border:3px solid #e0b050;border-radius:16px;padding:18px 22px;color:#fff3dc;text-align:center;font-size:18px;line-height:1.6;box-shadow:0 8px 40px #000}
#qcard h2{margin:0 0 6px;font-size:30px}
#qcard .ans{font-size:24px;font-weight:700;color:#ffe08a;margin:6px 0}
#qcard .why{background:rgba(255,255,255,.08);border-radius:10px;padding:8px 12px;margin:8px 0 12px}
#qcard button{font-size:20px;padding:8px 26px;border-radius:10px;border:0;background:#e0b050;color:#2a1000;font-weight:700;cursor:pointer}
#qreview{max-height:38vh;overflow:auto;text-align:left;max-width:min(620px,92vw);margin:6px auto 12px;font-size:15px;line-height:1.5;background:rgba(0,0,0,.35);border-radius:10px;padding:8px 12px}
#qreview p{margin:4px 0 8px}
#bdayover{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,4,0,.82);z-index:80;overflow:hidden}
#bdayover>div{position:relative;max-width:min(560px,92vw);background:linear-gradient(#3a1a06,#1d0c02);border:3px solid #e0b050;border-radius:18px;padding:26px 30px;color:#fff3dc;text-align:center;box-shadow:0 10px 50px #000;z-index:2}
#bdayover h1{margin:0 0 10px;font-size:34px;color:#ffe08a}
#bdayover .msg{font-size:19px;line-height:1.6;margin:8px 0}
#bdayover .from{font-size:16px;color:#ffd27a;margin-top:10px}
#bdayover button{font-size:20px;padding:9px 28px;border-radius:10px;border:0;background:#e0b050;color:#2a1000;font-weight:700;cursor:pointer;margin-top:14px}
.bconf{position:absolute;top:-8%;font-size:22px;animation:bdfall linear infinite;pointer-events:none;z-index:1}
@keyframes bdfall{to{transform:translateY(115vh) rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.bconf{display:none}}
@media (max-height:500px){#qp{font-size:12px;line-height:1.35;padding:4px 9px;left:51%;width:38vw}#qp .op{margin-top:3px}#qp .hd{font-size:11px}.qlab{font-size:14px}#qcard>div{font-size:15px;padding:10px 16px}#qcard h2{font-size:22px}#qcard .ans{font-size:19px}}
`;
  document.head.appendChild(css);
  const qp = document.createElement('div'); qp.id = 'qp'; qp.hidden = true; document.body.appendChild(qp);
  const labs = [0, 1, 2, 3].map(() => { const e = document.createElement('div'); e.className = 'qlab'; e.hidden = true; document.body.appendChild(e); return e; });

  const t = $('title');
  if (BDAY) {
    const h1 = t.querySelector('h1'); if (h1) h1.textContent = `${BDAY.name}無雙`;
    t.querySelector('p').textContent = `${BDAY.name}${BDAY.age ? BDAY.age + '歲' : ''}生日快樂！`;
    document.title = `${BDAY.name}無雙・生日快樂！`;
    t.querySelector('p').insertAdjacentHTML('afterend', `<p style="max-width:560px;font-size:15px;opacity:.9">每題有 4 個敵將揹住答案，打倒正確嗰個！答晒 ${QN} 題，張郃就會出現。</p>`);
  } else {
    t.querySelector('p').textContent = `${D.title}・${D.topic || ''}`;
    t.querySelector('p').insertAdjacentHTML('afterend', `<p style="max-width:560px;font-size:15px;opacity:.9">每題有 4 個敵將，各自揹住答案 A–D。打倒<b>正確答案</b>嗰個！打錯會扣血。答晒 ${QN} 題，敵將張郃就會出現。</p>`);
  }
  TX.goal = `目標：打倒寫住正確答案嘅敵將（A–D）。答晒 ${QN} 題 → 張郃登場！`;

  // 光柱：遠處都見到邊個係答案將
  const beams = COL.map(c => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 16, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); return m;
  });

  function drawPanel() {
    const q = QS[Q.idx]; if (!q) { qp.hidden = true; return; }
    qp.innerHTML = `<div class="hd">第 ${Q.idx + 1} / ${QN} 題・${esc(q.cat || '')}</div><div class="qt">${esc(q.q)}</div>` +
      `<div class="op">${q.opts.map((o, k) => `<span class="${Q.crossed && Q.crossed[k] ? 'x' : ''}"><b style="background:${COL[k]}">${LET[k]}</b>${esc(o)}</span>`).join('')}</div>`;
    qp.hidden = false;
  }

  // ---------- 出題 ----------
  function freeSlot() {
    let far = -1, fd = -1;
    for (let i = 0; i < NMAX; i++) {
      if (!S.alive[i]) return;
      if (S.ans[i] >= 0) continue;
      const d = Math.hypot(S.x[i] - player.x, S.z[i] - player.z); if (d > fd) { fd = d; far = i; }
    }
    if (far >= 0) S.alive[far] = 0;
  }
  function spawnAnswers() {
    const q = QS[Q.idx];
    Q.tries = 0; Q.ids = []; Q.crossed = [0, 0, 0, 0];
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5), a0 = Math.random() * TAU, L = ARENA - 4;
    for (let k = 0; k < 4; k++) {
      const a = a0 + k * TAU / 4;
      const x = clamp(player.x + Math.cos(a) * ANS_R, -L, L), z = clamp(player.z + Math.sin(a) * ANS_R, -L, L);
      for (let i = 0; i < NMAX; i++) if (S.alive[i] && S.ans[i] < 0 && Math.hypot(S.x[i] - x, S.z[i] - z) < 3) S.alive[i] = 0;   // 清走擋住嘅雜兵
      freeSlot();
      const i = spawnSoldier(x, z, 0); if (i < 0) continue;
      S.ans[i] = order[k]; S.kind[i] = 1; S.hp[i] = ANS_HP; S.yaw[i] = Math.atan2(player.x - x, player.z - z);
      Q.ids.push(i);
      ring(x, z, 3, COL[order[k]], 0.8);
    }
    drawPanel(); SND.gong();
    banner(`第 ${Q.idx + 1} 題！`, '#ffe3a8', true);
  }

  function answer(a) {
    const q = QS[Q.idx];
    if (a === q.ans) {
      if (Q.tries === 0) Q.firstTry++;
      for (const id of Q.ids) if (S.alive[id] && S.ans[id] >= 0) { S.ans[id] = -1; ks0(id, 0, 0, 4); }
      Q.ids = [];
      player.hp = Math.min(player.max, player.hp + player.max * 0.15); gainMusou(25);
      flash(0.4); SND.tone(660, 0.15, 'triangle', 0.15, 1.5); SND.tone(990, 0.3, 'triangle', 0.12, 1.2);
      showCard(q);
    } else {
      Q.tries++; if (Q.tries === 1) Q.missed.push(Q.idx);
      Q.crossed[a] = 1; drawPanel();
      player.hp = Math.max(1, player.hp - WRONG_DMG); hurtFlash = 1; camShake = Math.max(camShake, 0.5); SND.hurt();
      banner(`✗ ${LET[a]}．${q.opts[a]} 唔係答案！`, '#ff6a6a', true);
    }
  }

  function showCard(q) {
    const last = Q.idx + 1 >= QN;
    const el = document.createElement('div'); el.id = 'qcard';
    el.innerHTML = `<div><h2>${Q.tries === 0 ? '✓ 答對！' : `✓ 答對！（錯咗 ${Q.tries} 次）`}</h2>` +
      `<div style="font-size:15px;opacity:.85">${esc(q.q)}</div>` +
      `<div class="ans">${LET[q.ans]}．${esc(q.opts[q.ans])}</div>` +
      (q.why ? `<div class="why">${esc(q.why)}</div>` : '') +
      `<button>${last ? '最後一關：張郃 ▶' : '下一題 ▶'}</button></div>`;
    document.body.appendChild(el);
    Q.card = el; Q.cardT = performance.now();
    labs.forEach(l => l.hidden = true); beams.forEach(b => b.visible = false);
    el.querySelector('button').onclick = closeCard;
  }
  function closeCard() {
    if (!Q.card || performance.now() - Q.cardT < 700) return;
    Q.card.remove(); Q.card = null;
    Q.idx++;
    if (Q.idx >= QN) { Q.done = true; qp.hidden = true; }
    else { Q.nextT = 1.2; qp.hidden = true; }
  }
  addEventListener('keydown', (e) => {
    if (!Q.card) return;
    if (['Enter', ' ', 'j', 'J'].includes(e.key)) closeCard();
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  // ---------- 改寫遊戲函數（只喺問答模式） ----------
  const sp0 = spawnSoldier;
  spawnSoldier = function (...a) { const i = sp0.apply(this, a); if (i >= 0) S.ans[i] = -1; return i; };

  const hs0 = hitSoldier;
  hitSoldier = function (i, dmg, kb, launch, dx, dz, opts) {
    if (S.ans[i] >= 0) {
      if (opts && opts.musou) { S.flash[i] = 0.08; return; }   // 無雙唔會誤殺答案將
      hs0.call(this, i, dmg, kb * 0.3, 0, dx, dz, opts);
      if (S.alive[i]) S.eng[i] = 0;
      return;
    }
    return hs0.call(this, i, dmg, kb, launch, dx, dz, opts);
  };

  const ks0 = killSoldier;
  killSoldier = function (i, dx, dz, power) {
    const a = S.ans[i]; S.ans[i] = -1;
    ks0.call(this, i, dx, dz, power);
    if (a >= 0 && Q.on) answer(a);
  };

  const hp0 = hurtPlayer;
  hurtPlayer = function (dmg, ...r) { return hp0.call(this, dmg * 0.6, ...r); };

  stepSpawns = function (dt) {
    aliveCount = 0; for (let i = 0; i < NMAX; i++) aliveCount += S.alive[i];
    reinfT -= dt;
    if (reinfT <= 0 && aliveCount < MAX_CROWD) {
      reinfT = 0.6;
      let g = GATES[0], bd = -1; for (const q of GATES) { const d = Math.hypot(q[0] - player.x, q[1] - player.z); if (d > bd) { bd = d; g = q; } }
      for (let k = 0; k < 3; k++) spawnSoldier(g[0] * 0.95 + rand(-4, 4), g[1] * 0.95 + rand(-4, 4), aliveCount < 90 ? 1 : 0);
    }
    if (!boss.spawned && Q.done) {
      boss.spawned = boss.alive = true; boss.hp = boss.max; bossG.visible = true; $('boss').hidden = false;
      let g = GATES[0], bd = -1; for (const q of GATES) { const d = Math.hypot(q[0] - player.x, q[1] - player.z); if (d > bd) { bd = d; g = q; } }
      boss.x = clamp(player.x + (g[0] - player.x) * 0.35, -ARENA + 6, ARENA - 6); boss.z = clamp(player.z + (g[1] - player.z) * 0.35, -ARENA + 6, ARENA - 6);
      banner(TX.bossIn, '#ff8a6a'); SND.gong();
    }
  };
  boss.max = 800;

  const start0 = GAME.start;
  GAME.start = function (...a) {
    const r = start0.apply(this, a);
    for (let i = MAX_CROWD; i < NMAX; i++) S.alive[i] = 0;   // 開局人少啲，留時間睇題目
    S.ans.fill(-1);
    if (Q.card) { Q.card.remove(); Q.card = null; }
    Object.assign(Q, { on: true, idx: 0, tries: 0, ids: [], nextT: 2.5, firstTry: 0, missed: [], done: false, crossed: [0, 0, 0, 0] });
    qp.hidden = true;
    return r;
  };

  function bdayOverlay() {
    const el = document.createElement('div'); el.id = 'bdayover';
    const bits = ['🎉', '🎊', '🎈', '⭐', '🧧', '🎂'];
    for (let i = 0; i < 36; i++) {
      const s = document.createElement('span'); s.className = 'bconf';
      s.textContent = bits[i % bits.length];
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.animationDuration = (2.5 + Math.random() * 3.5) + 's';
      s.style.animationDelay = (-Math.random() * 4) + 's';
      s.style.fontSize = (14 + Math.random() * 18) + 'px';
      el.appendChild(s);
    }
    const box = document.createElement('div');
    const h1 = document.createElement('h1'); h1.textContent = `🎂 生日快樂，${BDAY.name}！`;
    box.appendChild(h1);
    if (BDAY.msg) { const m = document.createElement('p'); m.className = 'msg'; m.textContent = BDAY.msg; box.appendChild(m); }
    if (BDAY.from) { const f = document.createElement('p'); f.className = 'from'; f.textContent = `— ${BDAY.from}`; box.appendChild(f); }
    const btn = document.createElement('button'); btn.textContent = '再睇成績';
    btn.onclick = () => el.remove();
    box.appendChild(btn);
    el.appendChild(box);
    document.body.appendChild(el);
  }

  const over0 = GAME.over;
  GAME.over = function (win) {
    if (this.state !== 'play') return;
    over0.call(this, win);
    Q.on = false; qp.hidden = true; labs.forEach(l => l.hidden = true); beams.forEach(b => b.visible = false);
    const answered = Math.min(Q.idx, QN);
    let h = `<p style="font-size:20px"><b>一次答啱：${Q.firstTry} / ${QN}</b>${answered < QN ? `（完成 ${answered} 題）` : ''}</p>`;
    if (Q.missed.length) {
      h += `<div id="qreview"><b>要再溫習：</b>` + Q.missed.map(n => { const q = QS[n]; return `<p>${n + 1}. ${esc(q.q)}<br>✓ <b>${LET[q.ans]}．${esc(q.opts[q.ans])}</b>${q.why ? ` — ${esc(q.why)}` : ''}</p>`; }).join('') + `</div>`;
    } else if (answered >= QN) h += `<p>全部一次答啱，好犀利！</p>`;
    $('ostats').insertAdjacentHTML('beforeend', h);
    if (win && BDAY) bdayOverlay();
  };

  const step0 = GAME.step;
  const _v = new THREE.Vector3();
  GAME.step = function (rdt) {
    if (Q.card) return;   // 解釋卡顯示中：遊戲暫停
    step0.call(this, rdt);
    if (!Q.on || this.state !== 'play') return;
    if (!paused && Q.nextT > 0) { Q.nextT -= rdt; if (Q.nextT <= 0 && !Q.done) spawnAnswers(); }
    let n = 0;
    const W = innerWidth, H = innerHeight;
    for (const i of Q.ids) {
      if (!S.alive[i] || S.ans[i] < 0) continue;
      S.eng[i] = 0;   // 答案將唔主動攻擊
      const a = S.ans[i], lab = labs[n], bm = beams[n]; n++;
      bm.material.color.set(COL[a]); bm.position.set(S.x[i], 8, S.z[i]); bm.visible = true;
      _v.set(S.x[i], S.y[i] + 3.1, S.z[i]).project(camera);
      let x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H, edge = false;
      if (_v.z > 1) { x = W - x; y = H - 80; edge = true; }
      const cx = clamp(x, 70, W - 70), cy = clamp(y, 150, H - 90);
      if (cx !== x || cy !== y) edge = true;
      lab.style.left = cx + 'px'; lab.style.top = cy + 'px'; lab.style.borderColor = COL[a];
      lab.className = 'qlab' + (edge ? ' edge' : '');
      lab.innerHTML = `<span style="color:${COL[a]}">${LET[a]}</span> ${esc(QS[Q.idx].opts[a])}`;
      lab.hidden = false;
    }
    for (; n < 4; n++) { labs[n].hidden = true; beams[n].visible = false; }
    if (boss.alive) qp.hidden = true;
  };

  const hud0 = hud;
  hud = function (rdt) {
    hud0(rdt);
    if (!Q.on) return;
    const sc = 220 / (ARENA * 2 + 10);
    for (const i of Q.ids) {
      if (!S.alive[i] || S.ans[i] < 0) continue;
      mini.fillStyle = COL[S.ans[i]]; mini.beginPath(); mini.arc((S.x[i] + ARENA + 5) * sc, (S.z[i] + ARENA + 5) * sc, 6, 0, TAU); mini.fill();
    }
  };
})();
