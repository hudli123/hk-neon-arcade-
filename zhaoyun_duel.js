// 單挑模式（zhaoyun.html#duel=1）：冇雜兵，一開波對手即出現；三局兩勝，每局 60 秒；時間到以剩血百分比定勝負。
// 第一版對手 = 張郃（AI 用返 stepBoss）。之後換 Meshy 角色只需換 bossG 嘅模型。
(() => {
  'use strict';
  const ROUND_T = 60, WINS = 2, OPP_HP = 620;
  const FRZ = 20, RAMST = 21;   // boss 自定狀態（7–9 已被 boss_ext 朱雀／三連斬／劈地用咗）
  const D = { round: 0, p1: 0, p2: 0, t: ROUND_T, on: false, ending: 0 };
  window.DUEL = D;
  const css = document.createElement('style');
  css.textContent = `#dhud{position:fixed;left:50%;top:10px;transform:translateX(-50%);width:min(900px,calc(100vw - 300px));display:grid;grid-template-columns:1fr 92px 1fr;gap:10px;align-items:center;z-index:20;pointer-events:none;font-weight:900;color:#fff3dc;text-shadow:0 1px 3px #000}
  #dhud .bar{height:22px;border:2px solid #e0b050;border-radius:6px;background:#1a0a04;overflow:hidden;position:relative}
  #dhud .bar i{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,#ffe08a,#4cd964);transition:width .12s}
  #dhud .p1 i{right:0}#dhud .p2 i{left:0}
  #dhud .nm{font-size:clamp(14px,1.6vw,20px);display:flex;justify-content:space-between;margin-bottom:3px}
  #dhud .p2 .nm{flex-direction:row-reverse}
  #dhud .ms{height:7px;margin-top:3px;border:1px solid #e0b050;border-radius:3px;background:#1a0a04;overflow:hidden;position:relative}
  #dhud .ms i{position:absolute;top:0;bottom:0;background:#ffe08a;transition:width .12s}#dhud .ms.full i{background:#fff;box-shadow:0 0 8px #ffe08a}
  #dhud .p1 .ms i{right:0}#dhud .p2 .ms i{left:0}#dhud .hint{font-size:11px;opacity:.75;margin-top:2px;text-align:right}#dhud .p1 .hint{text-align:left}
  #dhud .clk{font-size:clamp(28px,3.6vw,46px);text-align:center;line-height:1;color:#ffe08a}
  #dhud .dots{text-align:center;font-size:14px;letter-spacing:3px;color:#ffd27a}
  #dround{position:fixed;left:0;right:0;top:36%;text-align:center;font-size:clamp(40px,9vw,96px);font-weight:900;color:#ffe08a;text-shadow:0 0 24px #ff9a2a,0 2px 4px #000;pointer-events:none;opacity:0;transition:opacity .25s;z-index:30}
  @media (max-height:500px){#dhud{width:min(700px,calc(100vw - 420px));top:6px;gap:6px;grid-template-columns:1fr 70px 1fr}#dhud .bar{height:14px}#dhud .clk{font-size:30px}}
  body.touch #me .bars{display:none}body.touch #d2pl{display:none}
  #pick .fbtn.pickme{animation:dnetpulse 1s infinite}
  @keyframes dnetpulse{0%,100%{box-shadow:0 0 0 2px #ffe08a}50%{box-shadow:0 0 16px 5px #ffe08a}}`;
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'dhud'; hud.hidden = true;
  hud.innerHTML = `<div class="p1"><div class="nm"><span id="dn1">趙雲</span><span id="dh1"></span></div><div class="bar"><i id="db1"></i></div><div class="ms" id="dm1"><i></i></div></div>
    <div><div class="clk" id="dclk">60</div><div class="dots" id="ddots"></div></div>
    <div class="p2"><div class="nm"><span id="dn2">張郃</span><span id="dh2"></span></div><div class="bar"><i id="db2"></i></div><div class="ms" id="dm2" hidden><i></i></div><div class="hint" id="dk2" hidden>P2：方向鍵 移動 · 1 攻擊 · 2 突進 · 3 閃避 · 0 絕招</div></div>`;
  document.body.appendChild(hud);
  const rb = document.createElement('div'); rb.id = 'dround'; document.body.appendChild(rb);
  const $ = (id) => document.getElementById(id);
  const say = (t, ms = 1100) => { rb.textContent = t; rb.style.opacity = 1; clearTimeout(say.h); say.h = setTimeout(() => { rb.style.opacity = 0; }, ms); if (D.net === 'host') netSend({ t: 'say', x: t, ms }); };


  // ===== 四個名人（私人版）。換 Meshy 模型時只需改 rig；絕招邏輯喺下面 cast() =====
  const FIGHTERS = {
    rocket: { name: '火箭商人', short: '火箭', rig: 'zy', col: '#ff5a3c', hp: 400, scale: 1, spec: 'rocket', specName: '火鳳凰降臨', specHint: '飛上天再炸落嚟' },
    tariff: { name: '關稅大帝', short: '關稅', rig: 'gy', col: '#ffd24a', hp: 440, scale: 1, spec: 'wall', specName: '關稅牆！', specHint: '封住對手 5 秒' },
    chip:   { name: '晶片教主', short: '晶片', rig: 'zy', col: '#39ff14', hp: 400, scale: 1, spec: 'chips', specName: '晶片生成', specHint: '三塊晶片追蹤' },
    cart:   { name: '車力巨人', short: '巨人', rig: 'gy', col: '#b89a80', hp: 520, scale: 1.18, spec: 'ram', specName: '高速衝撞', specHint: '直線衝鋸對手' },
  };
  const HEADLINE = {
    rocket: (w) => `【突發】火箭商人嘅火箭落返自己頭上；${w}：「唔關我事」`,
    tariff: (w) => `【突發】關稅大帝敗陣，宣布對${w}加徵 300% 關稅，市場冇反應`,
    chip:   (w) => `【突發】晶片教主敗陣，宣布下季推新卡——即日售罄；${w}冇買到`,
    cart:   (w) => `【突發】車力巨人衝得太快煞唔切，直出場外；${w}獲判勝`,
  };
  // ===== 火箭商人 Meshy 模型：只喺單挑模式額外下載（正常趙雲模式唔會入呢個檔）=====
  const muskReady = (async () => {
    try {
      const [jb, tb, cb] = await Promise.all([
        fetch('zy_rig_musk.js').then((r) => { if (!r.ok) throw new Error('rig ' + r.status); return r.arrayBuffer(); }),
        fetch('zy_tex_musk.webp').then((r) => { if (!r.ok) throw new Error('tex ' + r.status); return r.arrayBuffer(); }),
        fetch('zy_clips_fist.js').then((r) => { if (!r.ok) throw new Error('clips ' + r.status); return r.arrayBuffer(); })]);
      const s = document.createElement('script'); s.text = new TextDecoder().decode(jb) + '\n//# sourceURL=zy_rig_musk.js'; document.head.appendChild(s);
      const s2 = document.createElement('script'); s2.text = new TextDecoder().decode(cb) + '\n//# sourceURL=zy_clips_fist.js'; document.head.appendChild(s2);
      if (window.MRIG && window.MRIG.musk) window.MRIG.musk.tex = URL.createObjectURL(new Blob([tb], { type: 'image/webp' }));
    } catch (e) { console.warn('musk load failed', e); }
  })();
  // ---- 主角模型切換：CHARS.zy 可以掛多個 rig，按 f1 揀邊個現形/動畫；趙雲 mesh + 槍照舊 ----
  const MUSK_SCALE = 1.12;   // musk bbox 高 1.80m（同 zy 1.80 / zhanghe 1.85 同級），用返趙雲嘅 1.12
  const heroRigs = {};   // 'zy' | 'musk' -> { mrig, rigUpdate }（rigUpdate 係 attach() 入面同一部狀態機，唔使複製）
  function setHeroMesh(id) {   // id: 'zy' | 'musk'
    const C = CHARS && CHARS.zy; if (!C || !C.mrig) return false;
    if (!heroRigs.zy) heroRigs.zy = { mrig: C.mrig, rigUpdate: C.rigUpdate };
    if (id !== 'zy' && !heroRigs[id]) {
      if (!window.MRIG || !window.MRIG[id] || !window.MRIG_ATTACH) return false;
      window.MRIG_ATTACH(C, id, MUSK_SCALE);   // attach 會暫時將 C.mrig/rigUpdate 指向新 rig
      if (id === 'musk' && window.MCLIPS_FIST && window.addClipBank) window.addClipBank(C.mrig, window.MCLIPS_FIST, window.MRIG.musk);
      heroRigs[id] = { mrig: C.mrig, rigUpdate: C.rigUpdate };
      C.mrig = heroRigs.zy.mrig; C.rigUpdate = heroRigs.zy.rigUpdate;
    }
    const use = heroRigs[id] ? id : 'zy';
    C.mrig = heroRigs[use].mrig; C.rigUpdate = heroRigs[use].rigUpdate;
    for (const k in heroRigs) heroRigs[k].mrig.group.visible = k === use;
    C.w.visible = use === 'zy';   // 火箭商人冇槍
    window.HERO_MOVES = use === 'musk' ? 'fist' : null;   // musk：N/CH 轉拳腳表
    return true;
  }
  function applyRigs() {
    setHeroMesh(D.f1 === 'rocket' && window.MRIG && window.MRIG.musk ? 'musk' : 'zy');
    if (window.setBossRig) window.setBossRig(D.f2 === 'rocket' && window.MRIG && window.MRIG.musk ? 'musk' : 'zhanghe');
  }
  muskReady.then(() => { applyRigs(); const s = document.getElementById('pick'); if (s) s.dispatchEvent(new Event('muskloaded')); });

  const Q = new URLSearchParams(location.search.slice(1) + '&' + location.hash.slice(1));
  const pickId = (v, not) => (v in FIGHTERS && v !== not) ? v : null;
  D.f1 = pickId(Q.get('p1')) || 'rocket';
  D.f2 = pickId(Q.get('p2'), D.f1) || null;      // null = 隨機
  const F1 = () => FIGHTERS[D.f1], F2 = () => FIGHTERS[D.f2];
  const other = (who) => who === 'p1' ? 'p2' : 'p1';
  const posOf = (who) => who === 'p1' ? [player.x, player.z, player.yaw] : [boss.x, boss.z, boss.yaw];
  const aliveOf = (who) => who === 'p1' ? GAME.state === 'play' : boss.alive;
  const dmgTo = (who, dmg, fx, fz, big) => {
    if (who === 'p2') { const dx = boss.x - fx, dz = boss.z - fz, d = Math.hypot(dx, dz) || 1; if (big) boss.poise = 0; boss.hitId = -1; hitBoss(dmg, big ? 12 : 5, big ? 9 : 0, dx / d, dz / d); }
    else { const inv = player.inv; player.inv = 0; hurtPlayer(dmg, fx, fz, big); if (player.inv < inv) player.inv = inv; }
  };
  const boom = (x, y, z, col, n = 40) => { for (let k = 0; k < n; k++) { const a = Math.random() * TAU, s = rand(3, 12); emit(x, y, z, Math.cos(a) * s, rand(1, 9), Math.sin(a) * s, rand(.3, .8), rand(.8, 1.8), Math.random() < .5 ? col : 0xffffff, 10, 1.5); } ring(x, z, 5, col, 0.5); };

  // ---- 投射物（火箭、晶片） ----
  const PR = [];
  const mkRocket = () => { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 1.3, 10), new THREE.MeshLambertMaterial({ color: 0xf4f4f4 })); body.rotation.x = Math.PI / 2; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 10), new THREE.MeshLambertMaterial({ color: 0xff3b30 })); nose.rotation.x = Math.PI / 2; nose.position.z = .9; g.add(nose);
    for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(.05, .45, .4), new THREE.MeshLambertMaterial({ color: 0xff3b30 })); f.position.z = -.5; f.rotation.z = k / 3 * TAU; f.position.x = Math.sin(k / 3 * TAU) * .3; f.position.y = Math.cos(k / 3 * TAU) * .3; g.add(f); } return g; };
  const mkChip = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(.8, .08, .8), new THREE.MeshBasicMaterial({ color: 0x39ff14 }))); const die = new THREE.Mesh(new THREE.BoxGeometry(.45, .14, .45), new THREE.MeshLambertMaterial({ color: 0x111111 })); die.position.y = .1; g.add(die); return g; };
  const shoot = (o) => { o.netId = ++netFxId; o.m.position.set(o.x, o.y, o.z); o.m.visible = !(o.delay > 0); scene.add(o.m); PR.push(o); };
  const stepPR = (dt) => {
    for (const o of PR) {
      if (o.delay > 0) { o.delay -= dt; if (o.delay <= 0) { o.m.visible = true; SND.swing(false); } continue; }
      const tgt = other(o.who), [tx, tz] = posOf(tgt), want = Math.atan2(tx - o.x, tz - o.z);
      o.a += clamp(angDiff(want, o.a), -o.turn * dt, o.turn * dt);
      o.x += Math.sin(o.a) * o.sp * dt; o.z += Math.cos(o.a) * o.sp * dt; o.life -= dt;
      o.m.position.set(o.x, o.y, o.z); o.m.rotation.y = o.a; if (o.kind === 'chip') { o.m.rotation.x += dt * 9; o.y = 1.2 + Math.sin(o.life * 6) * .2; }
      if (o.kind === 'rocket') emit(o.x - Math.sin(o.a) * .8, o.y, o.z - Math.cos(o.a) * .8, rand(-2, 2), rand(0, 2), rand(-2, 2), .25, rand(.8, 1.4), Math.random() < .5 ? 0xffa030 : 0xffe080, 0, 2);
      else if (Math.random() < dt * 20) emit(o.x, o.y, o.z, 0, .5, 0, .3, .7, 0x39ff14);
      const d = Math.hypot(tx - o.x, tz - o.z), hitR = o.r + (tgt === 'p2' ? .9 : 0);
      if (d < hitR && aliveOf(tgt)) { o.dead = 1; boom(o.x, o.y, o.z, o.kind === 'rocket' ? 0xff6a30 : 0x39ff14, o.kind === 'rocket' ? 60 : 20); dmgTo(tgt, o.dmg, o.x, o.z, o.big); camShake = Math.max(camShake, o.big ? .8 : .3); if (o.big) { flash(.4); SND.bigboom(); } else SND.hit(1, false); }
      else if (o.life <= 0 || Math.abs(o.x) > ARENA || Math.abs(o.z) > ARENA) { o.dead = 1; if (o.kind === 'rocket') { boom(o.x, o.y, o.z, 0xff6a30, 30); SND.land(); } }
    }
    for (let i = PR.length - 1; i >= 0; i--) if (PR[i].dead) { scene.remove(PR[i].m); PR.splice(i, 1); }
  };
  const clearPR = () => { for (const o of PR) scene.remove(o.m); PR.length = 0; };

  // ---- 關稅牆 ----
  let W = null;
  const wallTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#111' : '#ffd400'; g.fillRect(i * 48 - 24, 0, 48, 256); }
    g.fillStyle = '#c40000'; g.fillRect(0, 70, 512, 116); g.fillStyle = '#fff'; g.font = 'bold 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('關稅 TARIFF', 256, 128); return new THREE.CanvasTexture(c); })();
  const mkWall = () => { const g = new THREE.Group(); const mat = new THREE.MeshLambertMaterial({ map: wallTex }); for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.4, .3), mat); const a = k * Math.PI / 2; m.position.set(Math.sin(a) * 2.8, 1.7, Math.cos(a) * 2.8); m.rotation.y = a; g.add(m); } return g; };
  const castWall = (who) => { const tgt = other(who), [tx, tz] = posOf(tgt); if (W) scene.remove(W.m);
    W = { who: tgt, by: who, x: tx, z: tz, t: 5, m: mkWall() }; W.m.position.set(tx, 0, tz); W.m.scale.y = 0.01; scene.add(W.m); camShake = Math.max(camShake, .5); SND.land(); ring(tx, tz, 4, 0xffd400, .5);
    if (tgt === 'p2') { boss.st = FRZ; boss.vx = boss.vz = 0; } else { player.st = 'frozen'; player.move = null; player.queued = null; } };
  const stepWall = (dt, pre) => {
    if (!W) return;
    if (pre) {
      W.t -= dt; W.m.scale.y = Math.min(1, W.m.scale.y + dt * 4);
      const F = W.who === 'p1' ? player : boss;
      if (W.who === 'p1') { if (player.st !== 'hurt') player.st = 'frozen'; IN.mx = IN.my = IN.atk = IN.chg = IN.jump = IN.dodge = 0; IN.atkHeld = false; }
      else if (boss.st === 7) { W.t = 0; }
      else if (boss.st !== 5) { boss.st = FRZ; boss.vx = boss.vz = 0; }
      const dx = F.x - W.x, dz = F.z - W.z, d = Math.hypot(dx, dz); if (d > 1.9) { F.x = W.x + dx / d * 1.9; F.z = W.z + dz / d * 1.9; }
      if (W.t <= 0) { scene.remove(W.m); boom(W.x, 1.5, W.z, 0xffd400, 50); SND.bigboom();
        if (W.who === 'p1') { if (player.st === 'frozen') player.st = 'idle'; } else if (boss.st === FRZ) { boss.st = 0; boss.cd = .6; }
        W = null; }
    }
  };
  const clearWall = () => { if (W) { scene.remove(W.m); if (W.who === 'p1' && player.st === 'frozen') player.st = 'idle'; if (W.who === 'p2' && boss.st === FRZ) boss.st = 0; W = null; } };

  // ---- 車力巨人衝撞 ----
  let RAM = null;
  const castRam = (who) => { const [x, z] = posOf(who), [tx, tz] = posOf(other(who)); RAM = { who, t: 0, dur: .9, a: Math.atan2(tx - x, tz - z), hit: 0 }; camShake = Math.max(camShake, .4); SND.charge();
    if (who === 'p1') { player.st = 'ram'; player.move = null; player.yaw = RAM.a; } else { boss.st = RAMST; boss.yaw = RAM.a; } };
  const stepRam = (dt, pre) => {
    if (!RAM) return;
    const me = RAM.who === 'p1' ? player : boss;
    if (pre) {
      RAM.t += dt;
      if (RAM.who === 'p1') { player.st = 'ram'; player.inv = .25; player.yaw = RAM.a; IN.mx = IN.my = 0; } else if (boss.st === 7) { RAM = null; return; } else if (boss.st !== 5) { boss.st = RAMST; boss.yaw = RAM.a; }
      const sp = RAM.t < .15 ? 6 : 27; me.x = clamp(me.x + Math.sin(RAM.a) * sp * dt, -ARENA + 2, ARENA - 2); me.z = clamp(me.z + Math.cos(RAM.a) * sp * dt, -ARENA + 2, ARENA - 2);
      for (let k = 0; k < 2; k++) emit(me.x + rand(-1, 1), .3, me.z + rand(-1, 1), rand(-3, 3), rand(2, 5), rand(-3, 3), .5, rand(1, 1.8), 0x8a7a68, 8, 1);
      if (Math.random() < dt * 8) camShake = Math.max(camShake, .25);
      const tgt = other(RAM.who), [tx, tz] = posOf(tgt);
      if (!RAM.hit && aliveOf(tgt) && Math.hypot(tx - me.x, tz - me.z) < 2.8) { RAM.hit = 1; dmgTo(tgt, RAM.who === 'p1' ? 62 : 55, me.x - Math.sin(RAM.a) * 2, me.z - Math.cos(RAM.a) * 2, true); boom(tx, 1.5, tz, 0xb89a80, 50); flash(.5); hitstop = Math.max(hitstop, .15); camShake = 1.1; SND.bigboom(); }
      if (RAM.t >= RAM.dur || RAM.hit && RAM.t > RAM.dur * .6) { if (RAM.who === 'p1') { if (player.st === 'ram') player.st = 'idle'; } else if (boss.st === RAMST) { boss.st = 0; boss.cd = 1.2; } RAM = null; }
    }
  };
  const clearRam = () => { if (RAM) { if (RAM.who === 'p1' && player.st === 'ram') player.st = 'idle'; if (RAM.who === 'p2' && boss.st === RAMST) boss.st = 0; RAM = null; } };

  // ===== 火鳳凰降臨（火箭商人絕招）：0–0.55s 飛上天 → 0.55–1s 紅圈跟目標 → 1–1.3s 俯衝 → 7.5m 大爆炸 =====
  const PHXST = 24, PHX_R = 7.5;
  let PHX = null;
  const phxMat = (c, o = .95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mkWarnRing = () => new THREE.Mesh(new THREE.RingGeometry(PHX_R - .55, PHX_R, 44).rotateX(-Math.PI / 2), phxMat(0xff2818, .7));
  const phxFx = [];   // 爆炸後續效果（火球、焦痕），host/guest 共用
  const stepPhxFx = (dt) => {
    for (let i = phxFx.length - 1; i >= 0; i--) {
      const f = phxFx[i]; f.t += dt; const k = Math.min(1, f.t / f.dur);
      if (f.kind === 'ball') { f.m.scale.setScalar(lerp(.5, 7, k)); f.m.material.opacity = .9 * (1 - k); }
      else if (f.kind === 'scorch') f.m.material.opacity = .55 * (1 - k);
      if (f.t >= f.dur) { scene.remove(f.m); phxFx.splice(i, 1); }
    }
  };
  const phxBoom = (x, z) => {   // 大爆炸視效（host 同 guest 都咁樣砌）
    boom(x, 1.5, z, 0xff7020, 200);
    ring(x, z, PHX_R, 0xff9040, .7); setTimeout(() => ring(x, z, PHX_R, 0xffd090, .7), 130); setTimeout(() => ring(x, z, PHX_R, 0xfff0c0, .7), 260);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), phxMat(0xffa030, .95)); ball.position.set(x, 1, z); scene.add(ball); phxFx.push({ m: ball, t: 0, dur: .5, kind: 'ball' });
    const sc = new THREE.Mesh(new THREE.CircleGeometry(PHX_R * .8, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x140b06, transparent: true, opacity: .55, depthWrite: false, fog: false })); sc.position.set(x, .06, z); scene.add(sc); phxFx.push({ m: sc, t: 0, dur: 2, kind: 'scorch' });
  };
  const castPhx = (who) => {
    const [x, z] = posOf(who);
    PHX = { who, t: 0, x0: x, z0: z, tx: x, tz: z, ring: null, boom: 0 };
    camShake = Math.max(camShake, .8); SND.musou();
    if (who === 'p1') { player.st = 'phoenix'; player.t = 0; player.move = null; player.inv = Math.max(player.inv, 1.8); }
    else { boss.st = PHXST; boss.t = 0; }
    if (D.net === 'host') netSend({ t: 'fx', k: 'phx', who, ph: 0 });
  };
  const stepPhx = (rdt) => {
    stepPhxFx(rdt);
    if (!PHX) return;
    PHX.t += rdt;
    const me = PHX.who === 'p1' ? player : boss;
    me.vy = 0;   // 唔俾地心吸力扯落嚟：step0 嘅重力對 phoenix 狀態都照計
    if (PHX.t < .55) {   // 上天：火箭噴煙
      const k = PHX.t / .55; me.y = 12 * k * k; me.x = PHX.x0; me.z = PHX.z0;
      for (let i = 0; i < 4; i++) emit(me.x + rand(-.5, .5), me.y * .9 + rand(0, .6), me.z + rand(-.5, .5), rand(-1, 1), -rand(2, 5), rand(-1, 1), rand(.3, .6), rand(.8, 1.5), Math.random() < .5 ? 0xff8030 : 0x606060, 6, 0);
    } else if (PHX.t < 1) {   // 空中瞄準：紅圈追目標，1 秒鎖死
      me.y = 12;
      const [tx, tz] = posOf(other(PHX.who)); PHX.tx = tx; PHX.tz = tz;
      if (!PHX.ring) { PHX.ring = mkWarnRing(); scene.add(PHX.ring); }
      PHX.ring.position.set(tx, .12, tz); PHX.ring.material.opacity = .5 + .3 * Math.sin(PHX.t * 30);
    } else if (PHX.t < 1.3) {   // 俯衝：火尾
      const k = (PHX.t - 1) / .3;
      me.x = lerp(PHX.x0, PHX.tx, k); me.z = lerp(PHX.z0, PHX.tz, k); me.y = 12 * (1 - k);
      for (let i = 0; i < 6; i++) { const a = Math.random() * TAU; emit(me.x + rand(-.6, .6), me.y + rand(0, 1.5), me.z + rand(-.6, .6), Math.cos(a) * rand(1, 4), rand(1, 4), Math.sin(a) * rand(1, 4), rand(.3, .6), rand(1, 1.8), Math.random() < .6 ? 0xffa030 : 0xff5018, -2, 0); }
    } else {   // 落地爆
      me.y = 0; me.x = PHX.tx; me.z = PHX.tz;
      if (PHX.ring) { scene.remove(PHX.ring); PHX.ring = null; }
      if (!PHX.boom) {
        PHX.boom = 1; phxBoom(me.x, me.z);
        const [tx, tz] = posOf(other(PHX.who));
        if (Math.hypot(tx - me.x, tz - me.z) < PHX_R && aliveOf(other(PHX.who))) dmgTo(other(PHX.who), PHX.who === 'p1' ? 150 : 130, me.x, me.z, true);
        flash(.7); camShake = 1.6; hitstop = Math.max(hitstop, .2); SND.bigboom();
        if (D.net === 'host') netSend({ t: 'fx', k: 'phx', who: PHX.who, ph: 1, x: +me.x.toFixed(2), z: +me.z.toFixed(2) });
      }
      if (PHX.t > 1.55) {   // 埋尾：還原狀態
        if (PHX.who === 'p1') { if (player.st === 'phoenix') player.st = 'idle'; }
        else if (boss.st === PHXST) { boss.st = 0; boss.cd = 1.4; }
        PHX = null;
      }
    }
  };
  const clearPhx = () => { if (!PHX) return; if (PHX.ring) scene.remove(PHX.ring); if (PHX.who === 'p1' && player.st === 'phoenix') { player.st = 'idle'; player.y = 0; } if (PHX.who === 'p2' && boss.st === PHXST) { boss.st = 0; boss.y = 0; } PHX = null; };

  // ---- 放絕招 ----
  D.FIGHTERS = FIGHTERS; D.state = () => ({ pr: PR.length, wall: W && W.who, wallBy: W && W.by, wallT: W && +W.t.toFixed(1), ram: RAM && RAM.who });
  const busy = (who) => (RAM && RAM.who === who) || (W && W.by === who) || (PHX && PHX.who === who) || PR.some((o) => o.who === who);
  const cast = (who) => {
    const F = who === 'p1' ? F1() : F2(); if (!F) return;
    const [x, z] = posOf(who), [tx, tz] = posOf(other(who)), a = Math.atan2(tx - x, tz - z);
    banner(`${F.name}：${F.specName}`, F.col, who === 'p2'); if (who === 'p1') flash(.35);
    if (D.net === 'host') netSend({ t: 'fx', k: 'cast', who });
    switch (F.spec) {
      case 'rocket': castPhx(who); break;
      case 'chips': for (let k = 0; k < 3; k++) { const b = a + (k - 1) * .9; shoot({ kind: 'chip', who, m: mkChip(), x: x + Math.sin(b) * 1.6, y: 1.3, z: z + Math.cos(b) * 1.6, a: b, sp: 16, turn: 3.4, life: 3, dmg: who === 'p1' ? 28 : 22, r: 1.3, big: false, delay: .15 + k * .25 }); } break;
      case 'wall': castWall(who); break;
      case 'ram': castRam(who); break;
    }
  };
  D.cast = cast;

  // ===== 同機 2P（#2p=1 或標題剔「雙人同機」）：P2 用方向鍵 + 1/2/3/0（或 , . / Enter）操控對手 =====
  D.two = Q.get('2p') === '1'; D.m2 = 0; D.net = null;   // net: 'host' | 'guest'（網上對戰）
  const P2K = { atk: ['1', ','], dash: ['2', '.'], dodge: ['3', '/'], spec: ['0', 'enter'] };
  const P2IN = { atk: 0, dash: 0, dodge: 0, spec: 0 };
  const NKEY = { atk: 'a', dash: 'd', dodge: 'o', spec: 's' };   // guest 數字鍵 → input counters
  addEventListener('keydown', (e) => {
    if (e.repeat) return; const k = e.key.toLowerCase();
    if (D.net === 'guest') { for (const n in P2K) if (P2K[n].includes(k) && GAME.state === 'play') { NET.c[NKEY[n]]++; sendIn(); } return; }
    if (!D.two || D.net === 'host') return;   // host 嘅 1/2/3/0 唔應該郁到遠端 P2
    for (const n in P2K) if (P2K[n].includes(k)) { P2IN[n] = 1; if (GAME.state === 'play') e.preventDefault(); }
  });
  const ARROWS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
  const rm0 = readMove;
  readMove = function () {   // 同機 2P 時方向鍵唔再郁 P1；網上對戰 P1 照常用晒成個鍵盤
    if (!D.two || D.net) return rm0();
    const sv = ARROWS.map((k) => keys[k]); for (const k of ARROWS) keys[k] = false; rm0(); ARROWS.forEach((k, i) => { keys[k] = sv[i]; });
  };
  const p2move = () => {
    if (D.net === 'host') return Date.now() - NET.mvAt < 350 ? NET.mv : null;
    const mx = (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0), my = (keys.arrowup ? 1 : 0) - (keys.arrowdown ? 1 : 0); if (!mx && !my) return null; const [cf, cz] = fwd(camYaw); const wx = cf * my - cz * mx, wz = cz * my + cf * mx, L = Math.hypot(wx, wz); return [wx / L, wz / L];
  };

  // ===== 網上對戰 network state / UI / snapshot renderer =====
  const NET = { role: null, ws: null, peer: false, code: '', hostF: null, guestF: null, c: { a: 0, d: 0, o: 0, s: 0 }, seen: { a: 0, d: 0, o: 0, s: 0 }, queue: { atk: 0, dash: 0, dodge: 0, spec: 0 }, mv: null, mvAt: 0, snap: null, lastSnap: 0, lastIn: '', lastInAt: 0, fxMeshes: new Map(), ping: 0, lastPing: 0, can: false, retrying: false, lost: null };
  D.NET = NET;
  // 網上對戰唔可以俾 blur/visibilitychange/P/Esc 暫停 —— 主機一停對家都會卡住
  const onlineLive = () => !!NET.role && (NET.peer || GAME.state === 'play');
  const sp0 = setPause;
  setPause = function (v) { if (v && onlineLive()) return; return sp0(v); };
  const netSend = (obj) => { if (NET.ws && NET.ws.readyState === WebSocket.OPEN) { try { NET.ws.send(JSON.stringify(obj)); } catch (e) {} } };
  const worldMove = () => { const mx = IN.mx || 0, my = IN.my || 0; if (!mx && !my) return null; const [cf, cz] = fwd(camYaw), wx = cf * my - cz * mx, wz = cz * my + cf * mx, n = Math.hypot(wx, wz) || 1; return [wx / n, wz / n]; };
  function sendIn(force = false) {
    if (NET.role !== 'guest' || GAME.state !== 'play') return;
    const mv = worldMove(), key = JSON.stringify([mv && mv.map(v => +v.toFixed(2)), NET.c]);
    if (force || key !== NET.lastIn || Date.now() - NET.lastInAt >= 100) { netSend({ t: 'in', mv, ...NET.c }); NET.lastIn = key; NET.lastInAt = Date.now(); }
  }
  const snapshot = () => ({
    t: 'snap', p: { x: player.x, y: player.y, z: player.z, yaw: player.yaw, st: player.st, tm: player.t, anim: player.move && player.move.anim, dur: player.move && player.move.dur, runT: player.runT, vy: player.vy, inv: player.inv, hp: player.hp, max: player.max, mus: player.musou, flash: player.flash, kx: player.kx, kz: player.kz, dodgeX: player.dodgeX, dodgeZ: player.dodgeZ },
    b: { x: boss.x, y: boss.y, z: boss.z, yaw: boss.yaw, st: boss.st, tm: boss.t, walkT: boss.walkT || 0, vx: boss.vx, vz: boss.vz, vy: boss.vy, hp: boss.hp, max: boss.max, flash: boss.flash, alive: boss.alive, spawned: boss.spawned, cd: boss.cd, poise: boss.poise },
    d: { round: D.round, p1: D.p1, p2: D.p2, t: D.t, on: D.on, ending: D.ending, m2: D.m2, m1: player.musou, camShake, hurtFlash, gt: GAME.t },
    fx: { pr: PR.map(o => ({ id: o.netId, kind: o.kind, x: o.x, y: o.y, z: o.z, a: o.a, delay: o.delay || 0 })), wall: W && { x: W.x, z: W.z, t: W.t }, ram: RAM && { who: RAM.who, t: RAM.t, x: posOf(RAM.who)[0], z: posOf(RAM.who)[1] } }
  });
  let netFxId = 0;
  // PR mesh snapshots use stable IDs across packets.
  const netSocket = (role, code) => {
    const old = NET.ws;   // 一個 client 一條線：舊線即刻斷開兼拆晒啲 handler，免得舊房訊息搞亂新局
    if (old) { old.onopen = old.onmessage = old.onerror = old.onclose = null; try { old.close(); } catch (e) {} }
    const base = Q.get('ws') || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    const u = new URL(base, location.href); u.searchParams.set('r', code); u.searchParams.set('role', role);
    const ws = new WebSocket(u.href); NET.ws = ws; NET.role = role; NET.code = code; NET.peer = false; NET.retrying = false;
    ws.onopen = () => { if (NET.ws !== ws) return; NET.can = true; if (role === 'host') { NET.hostF = null; NET.guestF = null; } renderNetUI(); };
    ws.onmessage = e => { if (NET.ws !== ws) return; let m; try { m = JSON.parse(e.data); } catch (err) { return; } onNetMessage(m); };
    ws.onerror = () => { if (NET.ws !== ws) return; if (!NET.retrying && !NET.peer && NET.role) showNetError('連線失敗，請檢查網絡後再試。'); };
    ws.onclose = () => { if (NET.ws !== ws) return; NET.can = false; if (NET.retrying) return; if (NET.role && NET.peer && GAME.state === 'play') showDisconnect(); else if (NET.role && !NET.peer) netDisconnect(); };
    return ws;
  };
  const netDisconnect = () => { NET.role = null; NET.peer = false; NET.hostF = NET.guestF = null; NET.code = ''; D.net = null; D.two = false; if (NET.ws) { const w = NET.ws; NET.ws = null; w.onopen = w.onmessage = w.onerror = w.onclose = null; w.close(); } bgStop(); renderNetUI(); };
  const netHostPick = k => { NET.hostF = k; renderNetUI(); if (NET.guestF) startNetMatch(); };
  const netGuestPick = k => { NET.guestF = k; netSend({ t: 'hello', f: k }); renderNetUI(); };
  // 背景 tick：window 俾人遮住/最小化嗰陣 rAF 會停，用 Worker timer 代打 GAME.step
  let bgw = null, lastRafStep = 0, lastBgStep = 0, bgStepping = false;
  function bgStart() {
    if (bgw) return;
    try {
      bgw = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'], { type: 'text/javascript' })));
      bgw.onmessage = () => {
        if (!NET.role || GAME.state !== 'play') return;
        const now = performance.now();
        if (now - lastRafStep <= 120) return;
        const dt = Math.min(0.05, lastBgStep ? (now - lastBgStep) / 1000 : 0.033);
        lastBgStep = now; bgStepping = true;
        try { GAME.step(dt); } finally { bgStepping = false; }
        sendSnapshot();
      };
    } catch (e) { bgw = null; }
  }
  function bgStop() { if (bgw) { bgw.terminate(); bgw = null; } lastBgStep = 0; }
  function startNetMatch() {
    if (!NET.hostF || !NET.guestF || NET.role !== 'host' || !NET.peer || GAME.state === 'play') return;
    D.f1 = NET.hostF; D.f2 = NET.guestF; D.two = true; GAME.start(F1().rig); bgStart();
  }
  function onNetMessage(m) {
    if (m.t === 'err') {
      const texts = { taken: '呢個房間碼已有人用，重新開一個…', noroom: '搵唔到呢個房間，請檢查房間碼。', full: '呢個房間已滿。', busy: '而家房間太多，請遲啲再試。', bad: '房間資料無效。' };
      if (m.e === 'taken' && NET.role === 'host') { const code = String(1000 + Math.floor(Math.random() * 9000)); NET.code = code; NET.retrying = true; setNetStatus(texts.taken + ` 新碼 ${code}`); if (NET.ws) NET.ws.close(); setTimeout(() => netSocket('host', code), 150); }
      else { showNetError(texts[m.e] || '連線失敗，請再試。'); netDisconnect(); }
    } else if (m.t === 'peer') {
      NET.peer = !!m.on; renderNetUI();
      if (!m.on && NET.role) { if (GAME.state === 'play') showDisconnect(); else setNetStatus('對手離開咗房間。'); }
    } else if (m.t === 'hello' && NET.role === 'host') {
      if (m.f in FIGHTERS) { NET.guestF = m.f; renderNetUI(); startNetMatch(); }
    } else if (m.t === 'start' && NET.role === 'guest') {
      if (!(m.f1 in FIGHTERS) || !(m.f2 in FIGHTERS)) return;
      D.net = 'guest'; D.two = true; D.f1 = m.f1; D.f2 = m.f2; NET.hostF = m.f1; NET.guestF = m.f2;
      $('again').disabled = false; $('again').textContent = '再戰';
      GAME.start(m.rig || FIGHTERS[m.f1].rig); setNetStatus('網上對戰'); bgStart();
    } else if (m.t === 'in' && NET.role === 'host') {
      const names = { a: 'atk', d: 'dash', o: 'dodge', s: 'spec' };
      for (const k of ['a', 'd', 'o', 's']) { const v = Number(m[k]); if (Number.isInteger(v) && v >= 0) { const diff = Math.min(8, Math.max(0, v - NET.c[k])); NET.queue[names[k]] = Math.min(10, NET.queue[names[k]] + diff); NET.c[k] = Math.max(NET.c[k], v); } }
      if (Array.isArray(m.mv) && m.mv.length === 2 && m.mv.every(v => Number.isFinite(v) && Math.abs(v) <= 1.01)) { NET.mv = Math.hypot(m.mv[0], m.mv[1]) > .05 ? m.mv : null; NET.mvAt = Date.now(); }
    } else if (m.t === 'snap' && NET.role === 'guest') { NET.snap = m; NET.lastSnap = Date.now(); }
    else if (m.t === 'ping' && NET.role === 'host') { netSend({ t: 'pong', ts: m.ts }); const r = Number(m.rtt); if (Number.isFinite(r) && r > 0) { NET.ping = r; updatePing(); } }
    else if (m.t === 'pong' && NET.role === 'guest') { NET.ping = Math.max(0, Date.now() - Number(m.ts)); updatePing(); }
    else if (m.t === 'say' && NET.role === 'guest') { rb.textContent = String(m.x || ''); rb.style.opacity = 1; clearTimeout(say.h); say.h = setTimeout(() => { rb.style.opacity = 0; }, Math.min(5000, Number(m.ms) || 1100)); }
    else if (m.t === 'over' && NET.role === 'guest') {
      D.on = false; D.ending = 0; D.p1 = Number(m.p1) || 0; D.p2 = Number(m.p2) || 0;
      const win = !!m.win; over0(win); setOverText(win);
    } else if (m.t === 'fx' && NET.role === 'guest' && m.k === 'cast') {
      const F = m.who === 'p1' ? F1() : F2(); if (F) { banner(`${F.name}：${F.specName}`, F.col, m.who === 'p2'); if (m.who === 'p1') flash(.35); }
    } else if (m.t === 'fx' && NET.role === 'guest' && m.k === 'phx') {
      if (m.ph === 0) { if (NET.phxRing) scene.remove(NET.phxRing); NET.phxRing = mkWarnRing(); NET.phxWho = m.who; scene.add(NET.phxRing); }
      else if (m.ph === 1) { if (NET.phxRing) { scene.remove(NET.phxRing); NET.phxRing = null; } phxBoom(m.x, m.z); }
    } else if (m.t === 'rematch' && NET.role === 'host' && GAME.state === 'over') { GAME.start(); }
  }
  let netUI, netStatus, netCode, netInput, netErr, pingEl;
  function setNetStatus(s) { if (netStatus) netStatus.textContent = s; }
  function showNetError(s) { if (netErr) { netErr.textContent = s; netErr.hidden = false; } }
  function renderNetUI() {
    if (!netUI) return;
    const active = !!NET.role; netUI.hidden = false;
    if (netCode) netCode.textContent = !NET.code ? '' : (NET.role === 'guest' ? `已入房間 ${NET.code}` : `房間碼：${NET.code}`);
    if (netStatus && NET.role) {
      let s = '';
      if (NET.role === 'host') {
        if (!NET.peer) s = `叫朋友喺佢部機撳「入房」，輸入 ${NET.code}。等緊朋友入房…`;
        else if (!NET.hostF && !NET.guestF) s = '朋友已入房 ✓ 兩邊各自揀一個角色，揀齊就自動開打。';
        else if (!NET.hostF) s = `朋友揀咗 ${FIGHTERS[NET.guestF].name} ✓ 輪到你揀角色！`;
        else if (!NET.guestF) s = `你揀咗 ${FIGHTERS[NET.hostF].name} ✓ 等朋友揀角色…`;
        else s = '開打！';
      } else if (NET.role === 'guest') {
        if (!NET.peer) s = '等緊房主…';
        else if (!NET.guestF) s = '已入房 ✓ 揀你嘅角色（揀齊就自動開打）';
        else if (!NET.hostF) s = `你揀咗 ${FIGHTERS[NET.guestF].name} ✓ 等房主揀角色…`;
        else s = '開打！';
      }
      if (s) netStatus.textContent = s;
    }
    if (netUI.querySelector('[data-net-action="cancel"]')) netUI.querySelector('[data-net-action="cancel"]').hidden = !active;
    const bp = $('bPause'); if (bp) bp.hidden = onlineLive();
    const myTurn = active && NET.peer && ((NET.role === 'host' && !NET.hostF) || (NET.role === 'guest' && !NET.guestF));
    for (const b of $('pick').querySelectorAll('.fbtn')) { b.disabled = (!!NET.role && (!NET.peer || NET.role === 'guest' && !!NET.guestF)) || (b.dataset.f === 'rocket' && !(window.MRIG && window.MRIG.musk)); b.classList.toggle('pickme', !!myTurn && !b.disabled); }
  }
  function initNetUI(sel, d2p, dp2) {
    const host = location.hostname;
    const allowed = Q.get('net') === '1' || !(host.endsWith('github.io') || host === 'raw.githack.com');
    if (!allowed) return;
    const row = document.createElement('div'); row.id = 'dnet'; row.style.cssText = 'flex-basis:100%;display:flex;flex-wrap:wrap;gap:7px;align-items:center;justify-content:center;margin:5px 0';
    const open = document.createElement('button'); open.dataset.netAction = 'host'; open.textContent = '開房（網上對戰）';
    const join = document.createElement('button'); join.dataset.netAction = 'join'; join.textContent = '入房';
    const code = document.createElement('input'); code.placeholder = '4 位房間碼'; code.inputMode = 'numeric'; code.maxLength = 4; code.style.cssText = 'width:90px;padding:7px;border-radius:7px;border:1px solid #c9953b;text-align:center';
    const st = document.createElement('span'); st.id = 'dnetstatus'; st.style.cssText = 'flex-basis:100%;font-size:13px';
    const codeText = document.createElement('div'); codeText.id = 'dnetcode'; codeText.style.cssText = 'flex-basis:100%;font-weight:900;color:#ffe08a';
    const err = document.createElement('div'); err.id = 'dneterr'; err.hidden = true; err.style.cssText = 'flex-basis:100%;color:#ff8a7a;font-size:13px';
    const cancel = document.createElement('button'); cancel.dataset.netAction = 'cancel'; cancel.textContent = '取消'; cancel.hidden = true;
    row.append(open, join, code, cancel, codeText, st, err); sel.after(row); netUI = row; netStatus = st; netCode = codeText; netInput = code; netErr = err;
    open.onclick = () => { if (netErr) netErr.hidden = true; D.net = 'host'; D.two = false; d2p.checked = false; const c = String(1000 + Math.floor(Math.random() * 9000)); netSocket('host', c); setNetStatus('連線中…'); renderNetUI(); };
    join.onclick = () => { const c = code.value.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/\s+/g, '').trim(); code.value = c; if (!/^\d{4}$/.test(c)) { showNetError('請輸入 4 位數房間碼。'); return; } if (netErr) netErr.hidden = true; D.net = 'guest'; D.two = true; netSocket('guest', c); setNetStatus('連線中…'); renderNetUI(); };
    cancel.onclick = () => { netDisconnect(); D.two = d2p.checked; setNetStatus('已取消。'); };
    if (Q.get('net') === '1') { row.hidden = false; }
    const again = $('again'); again.onclick = () => { if (NET.role === 'guest') { netSend({ t: 'rematch' }); again.disabled = true; again.textContent = '等房主重新開始…'; } else GAME.start(); };
    pingEl = document.createElement('div'); pingEl.id = 'dnetping'; pingEl.hidden = true; pingEl.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:25;color:#fff3dc;background:#180b08aa;border-radius:8px;padding:3px 9px;font:12px monospace;pointer-events:none'; document.body.appendChild(pingEl);
  }
  function updatePing() { if (pingEl) { pingEl.hidden = !NET.role || GAME.state !== 'play'; pingEl.textContent = `ping ${Math.round(NET.ping)}ms`; } }
  function showDisconnect() {
    if (NET.lost) return;
    NET.lost = document.createElement('div'); NET.lost.id = 'dnetlost'; NET.lost.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#080402eF;color:#fff3dc;font-size:24px;font-weight:900;text-align:center';
    const msg = document.createElement('div'); msg.textContent = '對手斷咗線'; const btn = document.createElement('button'); btn.textContent = '返回標題'; btn.onclick = () => { netDisconnect(); location.reload(); }; NET.lost.append(msg, btn); document.body.appendChild(NET.lost);
  }
  let prevPR = null;
  function applySnapshot(dt) {
    const m = NET.snap; if (!m) return;
    const p = m.p, b = m.b, d = m.d;
    const a = Math.min(1, dt * 14);
    player.x = lerp(player.x, p.x, a); player.y = lerp(player.y, p.y, a); player.z = lerp(player.z, p.z, a); player.yaw += angDiff(p.yaw, player.yaw) * a;
    Object.assign(player, { st: p.st, t: p.tm, runT: p.runT, vy: p.vy, inv: p.inv, hp: p.hp, max: p.max, musou: p.mus, flash: p.flash, kx: p.kx, kz: p.kz, dodgeX: p.dodgeX, dodgeZ: p.dodgeZ, move: p.anim ? { anim: p.anim, dur: p.dur || 0.3 } : null });
    boss.x = lerp(boss.x, b.x, a); boss.y = lerp(boss.y, b.y, a); boss.z = lerp(boss.z, b.z, a); boss.yaw += angDiff(b.yaw, boss.yaw) * a;
    Object.assign(boss, { st: b.st, t: b.tm, walkT: b.walkT, vx: b.vx, vz: b.vz, vy: b.vy, hp: b.hp, max: b.max, flash: b.flash, alive: b.alive, spawned: b.spawned, cd: b.cd, poise: b.poise });
    Object.assign(D, { round: d.round, p1: d.p1, p2: d.p2, t: d.t, on: d.on, ending: d.ending, m2: d.m2 });
    player.musou = d.m1; camShake = d.camShake || 0; hurtFlash = d.hurtFlash || 0; GAME.t = d.gt || GAME.t;
    NET.effects = m.fx || {};
  }
  function syncNetEffects() {
    const fx = NET.effects || {}, wanted = new Set();
    for (const o of fx.pr || []) {
      if (o.id == null) continue; wanted.add(o.id); let m = NET.fxMeshes.get(o.id);
      if (!m) { m = o.kind === 'rocket' ? mkRocket() : mkChip(); NET.fxMeshes.set(o.id, m); scene.add(m); }
      m.position.set(o.x, o.y, o.z); m.rotation.y = o.a; m.visible = !(o.delay > 0);
    }
    for (const [id, m] of NET.fxMeshes) if (!wanted.has(id)) { scene.remove(m); NET.fxMeshes.delete(id); }
    if (fx.wall) { if (!NET.wallMesh) { NET.wallMesh = mkWall(); scene.add(NET.wallMesh); } NET.wallMesh.position.set(fx.wall.x, 0, fx.wall.z); NET.wallMesh.scale.y = Math.max(.01, 1 - fx.wall.t / 5); }
    else if (NET.wallMesh) { scene.remove(NET.wallMesh); NET.wallMesh = null; }
    if (NET.phxRing) { const t = NET.phxWho === 'p1' ? boss : player; NET.phxRing.position.set(t.x, .12, t.z); NET.phxRing.material.opacity = .5 + .3 * Math.sin(Date.now() / 33); }   // 火鳳凰警告圈喺 guest 機跟目標
    if (fx.ram && Math.random() < .45) for (let i = 0; i < 3; i++) emit(fx.ram.x + rand(-1, 1), .3, fx.ram.z + rand(-1, 1), rand(-2, 2), rand(1, 3), rand(-2, 2), .35, .7, 0x8a7a68);
  }
  function guestTick(rdt) {
    readMove();
    if (IN.atk) NET.c.a++; if (IN.chg) NET.c.d++; if (IN.dodge) NET.c.o++; if (IN.musou) NET.c.s++; if (IN.jump) NET.c.d++;
    const mv = worldMove(); NET.localMv = mv; sendIn();
    if (Date.now() - NET.lastPing > 1000 && NET.ws && NET.ws.readyState === WebSocket.OPEN) { NET.lastPing = Date.now(); netSend({ t: 'ping', ts: Date.now(), rtt: NET.ping }); }
    applySnapshot(rdt); syncNetEffects(); stepPhx(rdt);   // PHX==null on guest，淨係走 stepPhxFx 爆炸效果
    if (D.two) cam2p(rdt);
    stepParticles(rdt); stepChunks(rdt); stepRings(rdt); stepFires(rdt);
    syncVisuals(rdt, rdt); stepCamera(rdt); writeParticles();
    if (GAME.state === 'play' && !hud.hidden) {
      const hp = $('help'); if (hp) hp.style.opacity = 0;
      $('db1').style.width = Math.max(0, player.hp / player.max * 100) + '%'; $('dh1').textContent = Math.max(0, Math.ceil(player.hp));
      $('db2').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; $('dh2').textContent = Math.max(0, Math.ceil(boss.hp));
      $('dclk').textContent = Math.ceil(D.t);
      $('dm1').firstElementChild.style.width = player.musou + '%'; $('dm1').classList.toggle('full', player.musou >= 100);
      $('dm2').firstElementChild.style.width = D.m2 + '%'; $('dm2').classList.toggle('full', D.m2 >= 100);
      $('ddots').textContent = '●'.repeat(D.p1) + '○'.repeat(WINS - D.p1) + '  ' + '○'.repeat(WINS - D.p2) + '●'.repeat(D.p2);
    }
    if (NET.lastSnap && Date.now() - NET.lastSnap > 1500) showNetError('連線訊號中斷，等候重連…');
    IN.atk = IN.chg = IN.jump = IN.dodge = IN.musou = 0;
    updatePing();
  }
  function sendSnapshot() { if (D.net === 'host' && NET.peer && GAME.state === 'play' && Date.now() - NET.lastSnap >= 50) { NET.lastSnap = Date.now(); netSend(snapshot()); } }
  setInterval(sendSnapshot, 50);

  const LIGHT = 22, DODGE = 23; let b2inv = 0;
  const sb1 = stepBoss;
  stepBoss = function (dt) {
    if (!D.two || !boss.alive) return sb1(dt);
    const b = boss, hal = bossG.userData.hal;
    b2inv = Math.max(0, b2inv - dt);
    if (GAME.state !== 'play') { P2IN.atk = P2IN.dash = P2IN.dodge = P2IN.spec = 0; return; }
    const dx = player.x - b.x, dz = player.z - b.z, d = Math.hypot(dx, dz) || 0.001, face = Math.atan2(dx, dz);
    if (D.net === 'host') {
      if (!D.on) { P2IN.atk = P2IN.dash = P2IN.dodge = P2IN.spec = 0; return; }
      for (const n in P2IN) P2IN[n] = NET.queue[n] > 0;
    }
    if (b.st === 0 || b.st === LIGHT || b.st === DODGE || b.st === PHXST) {   // PHXST 期間 stepPhx 揸 fit
      b.flash -= dt; b.t += dt; b.cd -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.vx *= Math.max(0, 1 - 4 * dt); b.vz *= Math.max(0, 1 - 4 * dt);
      if (b.y > 0 || b.vy > 0) { b.vy -= 22 * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.vy = 0; } }
      if (b.st === 0) {
        const mv = p2move();
        if (mv) { b.x += mv[0] * 6 * dt; b.z += mv[1] * 6 * dt; b.yaw += angDiff(Math.atan2(mv[0], mv[1]), b.yaw) * Math.min(1, dt * 10); b.walkT = (b.walkT || 0) + dt * 9; }
        else b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 5);
        hal.rotation.set(-0.3, 0, 0);
        if (b.cd <= 0) {
          if (P2IN.atk) { if (D.net === 'host') NET.queue.atk = Math.max(0, NET.queue.atk - 1); b.st = LIGHT; b.t = 0; b.hitDone = 0; if (Math.abs(angDiff(face, b.yaw)) < 1.6) b.yaw = face; SND.swing(false); }
          else if (P2IN.dash) { if (D.net === 'host') NET.queue.dash = Math.max(0, NET.queue.dash - 1); b.st = 3; b.t = 0; b.dashHit = 0; }
          else if (P2IN.dodge) { if (D.net === 'host') NET.queue.dodge = Math.max(0, NET.queue.dodge - 1); b.st = DODGE; b.t = 0; const a = mv ? Math.atan2(mv[0], mv[1]) : face + Math.PI; b.vx = Math.sin(a) * 17; b.vz = Math.cos(a) * 17; b2inv = .45; SND.swing(false); }
          else if (P2IN.spec && D.m2 >= 100 && !busy('p2')) { if (D.net === 'host') NET.queue.spec = Math.max(0, NET.queue.spec - 1); D.m2 = 0; cast('p2'); }
        }
      } else if (b.st === LIGHT) {   // 輕斬 0.42 秒
        hal.rotation.set(0, lerp(1.3, -1.7, Math.min(1, b.t / 0.26)), 0);
        if (!b.hitDone && b.t > 0.16) { b.hitDone = 1; const fist = F2().spec === 'rocket'; if (d < (fist ? 2.6 : 4.6) && Math.abs(angDiff(face, b.yaw)) < 1.5) hurtPlayer(14, b.x, b.z, false);
          for (let k = 0; k < 8; k++) { const a = b.yaw - 1 + k / 8 * 2, rr = fist ? 2 : 3.4; emit(b.x + Math.sin(a) * rr, 1.5, b.z + Math.cos(a) * rr, 0, 0, 0, .22, 1.2, 0xff5a8a); } }
        if (b.t > 0.42) { b.st = 0; b.cd = 0.12; }
      } else if (b.st === DODGE) {   // 閃避 0.4 秒
        if (Math.random() < dt * 30) emit(b.x, 0.3, b.z, rand(-1, 1), rand(1, 2), rand(-1, 1), .4, 1.1, 0xc0b0a0);
        if (b.t > 0.4) { b.st = 0; b.cd = 0.15; }
      }   // PHXST 唔郁：stepPhx 揸 fit
      b.x = clamp(b.x, -ARENA + 2, ARENA - 2); b.z = clamp(b.z, -ARENA + 2, ARENA - 2);
      if (d < 1.8) { player.x += dx / d * (1.8 - d); player.z += dz / d * (1.8 - d); }
    } else {   // 原有招（突進 3→6、受擊 4／5、牆／衝撞）：暫時將 max 設 0 令 boss_ext 唔會自動放朱雀
      const mx0 = b.max; b.max = 0; sb1(dt); b.max = mx0;   // max=0 → hp<max*0.7 永遠 false
    }
    P2IN.atk = P2IN.dash = P2IN.dodge = P2IN.spec = 0;
  };
  const hb1 = hitBoss;
  hitBoss = function (...a) { if ((D.two && b2inv > 0) || boss.st === PHXST) return; return hb1.apply(this, a); };   // 火鳳凰期間無敵
  // 2P 鏡頭：側面望住兩個人，距離跟兩人相隔
  let camN = null, camP = null;
  const cam2p = (rdt) => {
    const ax = boss.x - player.x, az = boss.z - player.z, sep = Math.hypot(ax, az) || 1;
    let nx = -az / sep, nz = ax / sep; if (camN && nx * camN[0] + nz * camN[1] < 0) { nx = -nx; nz = -nz; } camN = [nx, nz];
    const mx = (player.x + boss.x) / 2, mz = (player.z + boss.z) / 2, dist = clamp(sep * .55 + 5.5, 8, 20), h = 3.2 + sep * .14;
    const tg = [mx + nx * dist, h, mz + nz * dist, mx, 1.6 + (player.y + boss.y) * .25, mz];
    if (!camP) camP = tg.slice(); else for (let i = 0; i < 6; i++) camP[i] = lerp(camP[i], tg[i], Math.min(1, rdt * (i < 3 ? 5 : 7)));
    camYaw = Math.atan2(-nx, -nz);
    const sh = camShake * camShake * 0.8; window.__camOverride = [camP[0] + rand(-sh, sh), camP[1] + rand(-sh, sh), camP[2], camP[3], camP[4], camP[5]];
  };
  D.p2in = P2IN;

  // 冇雜兵：唔再生兵，開波時清場
  stepSpawns = function () {};
  const clearCrowd = () => { for (let i = 0; i < NMAX; i++) S.alive[i] = 0; };

  const resetRound = () => {
    clearCrowd();
    clearPR(); clearWall(); clearRam(); clearPhx(); D.aiCd = rand(3.5, 5); D.specBuf = 0; D.m2 = 0; camP = camN = null; window.__camOverride = null;
    if (D.net === 'host') { for (const k in NET.queue) NET.queue[k] = 0; NET.mv = null; NET.mvAt = 0; }
    Object.assign(player, { x: 0, z: 7, y: 0, vy: 0, yaw: Math.PI, hp: player.max, musou: 0, st: 'idle', t: 0, move: null, inv: 1 });
    Object.assign(boss, { alive: true, spawned: true, hp: OPP_HP, max: OPP_HP, st: 0, t: 0, cd: 1.2, x: 0, z: -7, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0, poise: 60, dashHit: 0 });
    bossG.visible = true; $('boss').hidden = true; D.lastBossHp = boss.hp; D.lastPHp = player.hp;
    D.t = ROUND_T; D.ending = 0; D.on = true;
    say(`第 ${D.round} 回合`);
  };

  const start0 = GAME.start.bind(GAME);
  GAME.start = function (c) {
    if (!D.f2) { const rest = Object.keys(FIGHTERS).filter((k) => k !== D.f1); D.f2 = rest[Math.floor(Math.random() * rest.length)]; }
    start0(c || F1().rig);
    player.max = F1().hp; player.hp = player.max;
    hero.scale.setScalar(1.12 * F1().scale); bossG.scale.setScalar(1.3 * F2().scale);
    applyRigs();
    D.round = 1; D.p1 = D.p2 = 0;
    $('dn1').textContent = F1().name; $('dn2').textContent = F2().name; $('face').textContent = F1().short;
    hud.hidden = false; $('ko').hidden = true; $('dm2').hidden = $('dk2').hidden = !(D.two || D.net);
    resetRound();
    if (D.net === 'host') netSend({ t: 'start', f1: D.f1, f2: D.f2, rig: F1().rig });
  };

  // 一局完：by = 'p1' | 'p2' | 'time'
  const endRound = (by) => {
    if (D.ending) return; D.ending = 1; D.on = false;
    let w = by;
    if (by === 'time') w = player.hp / player.max >= boss.hp / boss.max ? 'p1' : 'p2';
    D[w]++;
    const done = D[w] >= WINS;
    say(by === 'time' ? '時間到' : (w === 'p1' ? 'K.O.' : '敗北'), done ? 1600 : 1300);
    if (done) { setTimeout(() => { GAME.winT = 0; finish(w === 'p1'); }, 1400); return; }
    D.round++;
    setTimeout(resetRound, 1500);
  };

  // 對手死：hitBoss 會 set GAME.winT；我哋改成一局完
  const over0 = GAME.over.bind(GAME);
  GAME.over = function (win) {
    if (!D.on && !D.ending) return over0(win);
    if (win) return;                     // boss 死由 step 處理
    endRound('p2');                      // 玩家血盡
  };
  const setOverText = (win) => {
    const Wn = win ? F1() : F2();
    $('otitle').textContent = `${Wn.name} 勝出`;
    $('ostats').innerHTML = `<div style="font-size:.9em;line-height:1.5;margin:6px 0 10px">${HEADLINE[win ? D.f2 : D.f1](Wn.name)}</div><div>${D.p1} : ${D.p2}</div>`;
  };
  const finish = (win) => {
    over0(win); clearPR(); clearWall(); clearRam(); clearPhx(); window.__camOverride = null;
    setOverText(win);
    if (D.net === 'host') netSend({ t: 'over', win: win ? 1 : 0, p1: D.p1, p2: D.p2 });
  };
  const step0 = GAME.step.bind(GAME);
  GAME.step = function (rdt) {
    if (!bgStepping) lastRafStep = performance.now();
    if (D.net === 'guest' && GAME.state !== 'title') { guestTick(rdt); return; }
    const live = GAME.state === 'play' && D.on;
    const guest = false;
    if (live) {
      if (!boss.alive) endRound('p1');
      else { D.t -= rdt; if (D.t <= 0) { D.t = 0; endRound('time'); } }
      GAME.winT = 0;
    }
    // 玩家絕招：龍怒鍵改做放絕招（唔再出龍）；guest 嘅掣只係送畀 host
    if (guest && GAME.state === 'play') {   // 入邊採樣 IN 掣 → counter（step0 會清 IN）
      if (IN.atk) NET.c.a++; if (IN.chg) NET.c.d++; if (IN.dodge) NET.c.o++; if (IN.musou) NET.c.s++; if (IN.jump) NET.c.d++;
      if (IN.atk || IN.chg || IN.dodge || IN.musou || IN.jump) sendIn();
    }
    if (IN.musou && !guest) { IN.musou = 0; if (live && player.musou >= 100) D.specBuf = .5; }
    if (live && !guest && D.specBuf > 0) { D.specBuf -= rdt; if ((player.st === 'idle' || player.st === 'run') && !busy('p1')) { D.specBuf = 0; player.musou = 0; cast('p1'); } }
    if (GAME.state === 'play') { stepWall(rdt, true); stepRam(rdt, true); stepPhx(rdt); if (D.two || D.net) cam2p(rdt); }
    step0(rdt);
    if (GAME.state === 'play') {
      stepPR(rdt);
      // 1v1 冇雜兵，絕招氣要快啲：打到對手即加，再加少少時間
      const dealt = D.lastBossHp - boss.hp; D.lastBossHp = boss.hp;
      if (live && !guest) player.musou = Math.min(100, player.musou + Math.max(0, dealt) * .8 + rdt * 3);
      const dealt2 = D.lastPHp - player.hp; D.lastPHp = player.hp;
      if (live && !guest && D.two) D.m2 = Math.min(100, D.m2 + Math.max(0, dealt2) * .8 + rdt * 3);
      // AI 絕招
      if (live && !guest && !D.two && boss.alive && boss.st === 0 && !busy('p2')) {
        D.aiCd -= rdt;
        if (D.aiCd <= 0) { const d = Math.hypot(player.x - boss.x, player.z - boss.z), sp = F2().spec;
          if ((sp === 'rocket' && d < 16) || sp === 'chips' || (sp === 'wall' && d < 11) || (sp === 'ram' && d > 5)) { cast('p2'); D.aiCd = rand(7, 10); } }
      }
    }
    if (!hud.hidden) {
      $('db1').style.width = Math.max(0, player.hp / player.max * 100) + '%'; $('dh1').textContent = Math.max(0, Math.ceil(player.hp));
      $('db2').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; $('dh2').textContent = Math.max(0, Math.ceil(boss.hp));
      $('dclk').textContent = Math.ceil(D.t);
      $('dm1').firstElementChild.style.width = player.musou + '%'; $('dm1').classList.toggle('full', player.musou >= 100);
      if (D.two || D.net) { $('dm2').firstElementChild.style.width = D.m2 + '%'; $('dm2').classList.toggle('full', D.m2 >= 100); }
      $('ddots').textContent = '●'.repeat(D.p1) + '○'.repeat(WINS - D.p1) + '  ' + '○'.repeat(WINS - D.p2) + '●'.repeat(D.p2);
    }
  };
  // 玩家死：hurtPlayer 叫 GAME.over(false) → 上面 endRound；但 player.hp 停 0 要補血先繼續（resetRound 做）
  // 標題文字
  const t = document.getElementById('title');
  if (t) { const h = t.querySelector('h1'); if (h) h.textContent = '名人亂鬥'; const p = t.querySelector('p'); if (p) p.textContent = '揀你嘅鬥士，一對一，三局兩勝，每局 60 秒。氣滿撳「絕招」。'; }
  try { TX.goal = '目標：三局兩勝，每局 60 秒。打到對手氣就滿，撳 I／C 放絕招！'; TX.bossDown = 'K.O.!'; TX.keys = TX.keys.map(([k, v]) => [k, v.replace('龍怒', '絕招').replace('DRAGON RAGE', 'SPECIAL')]); TX.keys.push(['↑ ↓ ← →', 'P2 移動（雙人同機）'], ['1 / 2 / 3 / 0', 'P2 攻擊／突進／閃避／絕招']); if (TX.keysTouch) TX.keysTouch = TX.keysTouch.map(([k, v]) => [k.replace('龍怒', '絕招').replace('DRAGON RAGE', 'SPECIAL'), v]); if (isTouch()) TX.goal = '目標：三局兩勝，每局 60 秒。打到對手氣就滿，撳「絕招」掣！'; } catch (e) {}
  const bm = $('bM'); if (bm) bm.textContent = '絕招';
  const lbls = document.querySelectorAll('#me .lbl'); if (lbls[1]) lbls[1].textContent = '絕招';
  // 揀角：用 4 個名人掣取代趙雲／關羽掣（模型暫用趙雲／關羽頂住，等 Meshy 角色到）
  const pick = $('pick'), s0 = $('start'), sg = $('startGY');
  if (pick && s0 && sg) {
    s0.hidden = sg.hidden = true;
    const sel = document.createElement('div'); sel.style.cssText = 'flex-basis:100%;font-size:14px;opacity:.85;margin-bottom:4px';
    sel.innerHTML = `對手：<select id="dp2" style="font:inherit;padding:4px 8px;border-radius:6px"><option value="">隨機</option>${Object.entries(FIGHTERS).map(([k, f]) => `<option value="${k}">${f.name}</option>`).join('')}</select>
      &nbsp; <label id="d2pl" style="cursor:pointer"><input type="checkbox" id="d2p"${D.two ? ' checked' : ''}> 雙人同機（P2 方向鍵 + 1/2/3/0）</label>`;
    pick.prepend(sel); const dp2 = sel.querySelector('select'); if (D.f2) dp2.value = D.f2;
    const d2p = sel.querySelector('#d2p');
    for (const [k, f] of Object.entries(FIGHTERS)) {
      const b = document.createElement('button'); b.className = 'fbtn'; b.dataset.f = k; b.innerHTML = `${f.name}<small>${f.specHint}</small>`; b.style.borderColor = f.col;
      b.onclick = () => {
        if (NET.role === 'host' && NET.peer) { netHostPick(k); return; }
        if (NET.role === 'guest' && NET.peer) { netGuestPick(k); return; }
        D.f1 = k; D.two = d2p.checked; const v = dp2.value; D.f2 = (v && v !== k) ? v : null; GAME.start(f.rig);
      };
      pick.appendChild(b);
    }
    const sync = () => { for (const b of pick.querySelectorAll('.fbtn')) { b.disabled = FIGHTERS[b.dataset.f].rig === 'gy' && sg.disabled || (b.dataset.f === 'rocket' && !(window.MRIG && window.MRIG.musk)) || (NET.role && !NET.peer); b.title = b.disabled ? '載入中…' : ''; } if (sg.disabled || (NET.role && !NET.peer)) setTimeout(sync, 200); };
    pick.addEventListener('muskloaded', sync);
    sync();
    // ===== 網上對戰 UI（只喺非 GitHub Pages host 或 #net=1 先顯示） =====
    initNetUI(sel, d2p, dp2);
  }
  document.documentElement.classList.remove('qwait');
})();
