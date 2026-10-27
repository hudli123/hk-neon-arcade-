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
  @media (max-height:500px){#dhud{width:min(700px,calc(100vw - 230px));top:6px}#dhud .bar{height:14px}}`;
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'dhud'; hud.hidden = true;
  hud.innerHTML = `<div class="p1"><div class="nm"><span id="dn1">趙雲</span><span id="dh1"></span></div><div class="bar"><i id="db1"></i></div><div class="ms" id="dm1"><i></i></div></div>
    <div><div class="clk" id="dclk">60</div><div class="dots" id="ddots"></div></div>
    <div class="p2"><div class="nm"><span id="dn2">張郃</span><span id="dh2"></span></div><div class="bar"><i id="db2"></i></div><div class="ms" id="dm2" hidden><i></i></div><div class="hint" id="dk2" hidden>P2：方向鍵 移動 · 1 攻擊 · 2 突進 · 3 閃避 · 0 絕招</div></div>`;
  document.body.appendChild(hud);
  const rb = document.createElement('div'); rb.id = 'dround'; document.body.appendChild(rb);
  const $ = (id) => document.getElementById(id);
  const say = (t, ms = 1100) => { rb.textContent = t; rb.style.opacity = 1; clearTimeout(say.h); say.h = setTimeout(() => { rb.style.opacity = 0; }, ms); };


  // ===== 四個名人（私人版）。換 Meshy 模型時只需改 rig；絕招邏輯喺下面 cast() =====
  const FIGHTERS = {
    rocket: { name: '火箭商人', short: '火箭', rig: 'zy', col: '#ff5a3c', hp: 400, scale: 1, spec: 'rocket', specName: '火箭來襲', specHint: '遠距掉火箭' },
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
  const shoot = (o) => { o.m.position.set(o.x, o.y, o.z); o.m.visible = !(o.delay > 0); scene.add(o.m); PR.push(o); };
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

  // ---- 放絕招 ----
  D.FIGHTERS = FIGHTERS; D.state = () => ({ pr: PR.length, wall: W && W.who, wallBy: W && W.by, wallT: W && +W.t.toFixed(1), ram: RAM && RAM.who });
  const busy = (who) => (RAM && RAM.who === who) || (W && W.by === who) || PR.some((o) => o.who === who);
  const cast = (who) => {
    const F = who === 'p1' ? F1() : F2(); if (!F) return;
    const [x, z] = posOf(who), [tx, tz] = posOf(other(who)), a = Math.atan2(tx - x, tz - z);
    banner(`${F.name}：${F.specName}`, F.col, who === 'p2'); if (who === 'p1') flash(.35);
    switch (F.spec) {
      case 'rocket': shoot({ kind: 'rocket', who, m: mkRocket(), x: x + Math.sin(a) * 1.4, y: 1.7, z: z + Math.cos(a) * 1.4, a, sp: 19, turn: 1.4, life: 3.2, dmg: who === 'p1' ? 72 : 58, r: 1.6, big: true }); SND.musou(); break;
      case 'chips': for (let k = 0; k < 3; k++) { const b = a + (k - 1) * .9; shoot({ kind: 'chip', who, m: mkChip(), x: x + Math.sin(b) * 1.6, y: 1.3, z: z + Math.cos(b) * 1.6, a: b, sp: 16, turn: 3.4, life: 3, dmg: who === 'p1' ? 28 : 22, r: 1.3, big: false, delay: .15 + k * .25 }); } break;
      case 'wall': castWall(who); break;
      case 'ram': castRam(who); break;
    }
  };
  D.cast = cast;

  // ===== 同機 2P（#2p=1 或標題剔「雙人同機」）：P2 用方向鍵 + 1/2/3/0（或 , . / Enter）操控對手 =====
  D.two = Q.get('2p') === '1'; D.m2 = 0;
  const P2K = { atk: ['1', ','], dash: ['2', '.'], dodge: ['3', '/'], spec: ['0', 'enter'] };
  const P2IN = { atk: 0, dash: 0, dodge: 0, spec: 0 };
  addEventListener('keydown', (e) => { if (!D.two || e.repeat) return; const k = e.key.toLowerCase(); for (const n in P2K) if (P2K[n].includes(k)) { P2IN[n] = 1; if (GAME.state === 'play') e.preventDefault(); } });
  const ARROWS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
  const rm0 = readMove;
  readMove = function () {   // 2P 時方向鍵唔再郁 P1
    if (!D.two) return rm0();
    const sv = ARROWS.map((k) => keys[k]); for (const k of ARROWS) keys[k] = false; rm0(); ARROWS.forEach((k, i) => { keys[k] = sv[i]; });
  };
  const p2move = () => { const mx = (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0), my = (keys.arrowup ? 1 : 0) - (keys.arrowdown ? 1 : 0); if (!mx && !my) return null; const [cf, cz] = fwd(camYaw); const wx = cf * my - cz * mx, wz = cz * my + cf * mx, L = Math.hypot(wx, wz); return [wx / L, wz / L]; };
  const LIGHT = 22, DODGE = 23; let b2inv = 0;
  const sb1 = stepBoss;
  stepBoss = function (dt) {
    if (!D.two || !boss.alive) return sb1(dt);
    const b = boss, hal = bossG.userData.hal;
    b2inv = Math.max(0, b2inv - dt);
    if (GAME.state !== 'play') { P2IN.atk = P2IN.dash = P2IN.dodge = P2IN.spec = 0; return; }
    const dx = player.x - b.x, dz = player.z - b.z, d = Math.hypot(dx, dz) || 0.001, face = Math.atan2(dx, dz);
    if (b.st === 0 || b.st === LIGHT || b.st === DODGE) {
      b.flash -= dt; b.t += dt; b.cd -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.vx *= Math.max(0, 1 - 4 * dt); b.vz *= Math.max(0, 1 - 4 * dt);
      if (b.y > 0 || b.vy > 0) { b.vy -= 22 * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.vy = 0; } }
      if (b.st === 0) {
        const mv = p2move();
        if (mv) { b.x += mv[0] * 6 * dt; b.z += mv[1] * 6 * dt; b.yaw += angDiff(Math.atan2(mv[0], mv[1]), b.yaw) * Math.min(1, dt * 10); b.walkT = (b.walkT || 0) + dt * 9; }
        else b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 5);
        hal.rotation.set(-0.3, 0, 0);
        if (b.cd <= 0) {
          if (P2IN.atk) { b.st = LIGHT; b.t = 0; b.hitDone = 0; if (Math.abs(angDiff(face, b.yaw)) < 1.6) b.yaw = face; SND.swing(false); }
          else if (P2IN.dash) { b.st = 3; b.t = 0; b.dashHit = 0; }
          else if (P2IN.dodge) { b.st = DODGE; b.t = 0; const a = mv ? Math.atan2(mv[0], mv[1]) : face + Math.PI; b.vx = Math.sin(a) * 17; b.vz = Math.cos(a) * 17; b2inv = .45; SND.swing(false); }
          else if (P2IN.spec && D.m2 >= 100 && !busy('p2')) { D.m2 = 0; cast('p2'); }
        }
      } else if (b.st === LIGHT) {   // 輕斬 0.42 秒
        hal.rotation.set(0, lerp(1.3, -1.7, Math.min(1, b.t / 0.26)), 0);
        if (!b.hitDone && b.t > 0.16) { b.hitDone = 1; if (d < 4.6 && Math.abs(angDiff(face, b.yaw)) < 1.5) hurtPlayer(14, b.x, b.z, false);
          for (let k = 0; k < 8; k++) { const a = b.yaw - 1 + k / 8 * 2; emit(b.x + Math.sin(a) * 3.4, 1.5, b.z + Math.cos(a) * 3.4, 0, 0, 0, .22, 1.2, 0xff5a8a); } }
        if (b.t > 0.42) { b.st = 0; b.cd = 0.12; }
      } else {   // 閃避 0.4 秒
        if (Math.random() < dt * 30) emit(b.x, 0.3, b.z, rand(-1, 1), rand(1, 2), rand(-1, 1), .4, 1.1, 0xc0b0a0);
        if (b.t > 0.4) { b.st = 0; b.cd = 0.15; }
      }
      b.x = clamp(b.x, -ARENA + 2, ARENA - 2); b.z = clamp(b.z, -ARENA + 2, ARENA - 2);
      if (d < 1.8) { player.x += dx / d * (1.8 - d); player.z += dz / d * (1.8 - d); }
    } else {   // 原有招（突進 3→6、受擊 4／5、牆／衝撞）：暫時將 max 設 0 令 boss_ext 唔會自動放朱雀
      const mx0 = b.max; b.max = 0; sb1(dt); b.max = mx0;   // max=0 → hp<max*0.7 永遠 false
    }
    P2IN.atk = P2IN.dash = P2IN.dodge = P2IN.spec = 0;
  };
  const hb1 = hitBoss;
  hitBoss = function (...a) { if (D.two && b2inv > 0) return; return hb1.apply(this, a); };
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
    clearPR(); clearWall(); clearRam(); D.aiCd = rand(3.5, 5); D.specBuf = 0; D.m2 = 0; camP = camN = null; window.__camOverride = null;
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
    D.round = 1; D.p1 = D.p2 = 0;
    $('dn1').textContent = F1().name; $('dn2').textContent = F2().name; $('face').textContent = F1().short;
    hud.hidden = false; $('ko').hidden = true; $('dm2').hidden = $('dk2').hidden = !D.two;
    resetRound();
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
  const finish = (win) => {
    over0(win); clearPR(); clearWall(); clearRam(); window.__camOverride = null;
    const L = win ? F2() : F1(), Wn = win ? F1() : F2();
    $('otitle').textContent = win ? `${Wn.name} 勝出` : `${Wn.name} 勝出`;
    $('ostats').innerHTML = `<div style="font-size:.9em;line-height:1.5;margin:6px 0 10px">${HEADLINE[win ? D.f2 : D.f1](Wn.name)}</div><div>${D.p1} : ${D.p2}</div>`;
  };
  const step0 = GAME.step.bind(GAME);
  GAME.step = function (rdt) {
    const live = GAME.state === 'play' && D.on;
    if (live) {
      if (!boss.alive) endRound('p1');
      else { D.t -= rdt; if (D.t <= 0) { D.t = 0; endRound('time'); } }
      GAME.winT = 0;
    }
    // 玩家絕招：龍怒鍵改做放絕招（唔再出龍）
    if (IN.musou) { IN.musou = 0; if (live && player.musou >= 100) D.specBuf = .5; }
    if (live && D.specBuf > 0) { D.specBuf -= rdt; if ((player.st === 'idle' || player.st === 'run') && !busy('p1')) { D.specBuf = 0; player.musou = 0; cast('p1'); } }
    if (GAME.state === 'play') { stepWall(rdt, true); stepRam(rdt, true); if (D.two) cam2p(rdt); }
    step0(rdt);
    if (GAME.state === 'play') {
      stepPR(rdt);
      // 1v1 冇雜兵，絕招氣要快啲：打到對手即加，再加少少時間
      const dealt = D.lastBossHp - boss.hp; D.lastBossHp = boss.hp;
      if (live) player.musou = Math.min(100, player.musou + Math.max(0, dealt) * .8 + rdt * 3);
      const dealt2 = D.lastPHp - player.hp; D.lastPHp = player.hp;
      if (live && D.two) D.m2 = Math.min(100, D.m2 + Math.max(0, dealt2) * .8 + rdt * 3);
      // AI 絕招
      if (live && !D.two && boss.alive && boss.st === 0 && !busy('p2')) {
        D.aiCd -= rdt;
        if (D.aiCd <= 0) { const d = Math.hypot(player.x - boss.x, player.z - boss.z), sp = F2().spec;
          if ((sp === 'rocket' && d > 6) || sp === 'chips' || (sp === 'wall' && d < 11) || (sp === 'ram' && d > 5)) { cast('p2'); D.aiCd = rand(7, 10); } }
      }
    }
    if (!hud.hidden) {
      $('db1').style.width = Math.max(0, player.hp / player.max * 100) + '%'; $('dh1').textContent = Math.max(0, Math.ceil(player.hp));
      $('db2').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; $('dh2').textContent = Math.max(0, Math.ceil(boss.hp));
      $('dclk').textContent = Math.ceil(D.t);
      $('dm1').firstElementChild.style.width = player.musou + '%'; $('dm1').classList.toggle('full', player.musou >= 100);
      if (D.two) { $('dm2').firstElementChild.style.width = D.m2 + '%'; $('dm2').classList.toggle('full', D.m2 >= 100); }
      $('ddots').textContent = '●'.repeat(D.p1) + '○'.repeat(WINS - D.p1) + '  ' + '○'.repeat(WINS - D.p2) + '●'.repeat(D.p2);
    }
  };
  // 玩家死：hurtPlayer 叫 GAME.over(false) → 上面 endRound；但 player.hp 停 0 要補血先繼續（resetRound 做）
  // 標題文字
  const t = document.getElementById('title');
  if (t) { const h = t.querySelector('h1'); if (h) h.textContent = '名人亂鬥'; const p = t.querySelector('p'); if (p) p.textContent = '揀你嘅鬥士，一對一，三局兩勝，每局 60 秒。氣滿撳「絕招」。'; }
  try { TX.goal = '目標：三局兩勝，每局 60 秒。打到對手氣就滿，撳 I／C 放絕招！'; TX.bossDown = 'K.O.!'; TX.keys = TX.keys.map(([k, v]) => [k, v.replace('龍怒', '絕招').replace('DRAGON RAGE', 'SPECIAL')]); TX.keys.push(['↑ ↓ ← →', 'P2 移動（雙人同機）'], ['1 / 2 / 3 / 0', 'P2 攻擊／突進／閃避／絕招']); } catch (e) {}
  const bm = $('bM'); if (bm) bm.textContent = '絕招';
  const lbls = document.querySelectorAll('#me .lbl'); if (lbls[1]) lbls[1].textContent = '絕招';
  // 揀角：用 4 個名人掣取代趙雲／關羽掣（模型暫用趙雲／關羽頂住，等 Meshy 角色到）
  const pick = $('pick'), s0 = $('start'), sg = $('startGY');
  if (pick && s0 && sg) {
    s0.hidden = sg.hidden = true;
    const sel = document.createElement('div'); sel.style.cssText = 'flex-basis:100%;font-size:14px;opacity:.85;margin-bottom:4px';
    sel.innerHTML = `對手：<select id="dp2" style="font:inherit;padding:4px 8px;border-radius:6px"><option value="">隨機</option>${Object.entries(FIGHTERS).map(([k, f]) => `<option value="${k}">${f.name}</option>`).join('')}</select>
      &nbsp; <label style="cursor:pointer"><input type="checkbox" id="d2p"${D.two ? ' checked' : ''}> 雙人同機（P2 方向鍵 + 1/2/3/0）</label>`;
    pick.prepend(sel); const dp2 = sel.querySelector('select'); if (D.f2) dp2.value = D.f2;
    const d2p = sel.querySelector('#d2p');
    for (const [k, f] of Object.entries(FIGHTERS)) {
      const b = document.createElement('button'); b.className = 'fbtn'; b.dataset.f = k; b.innerHTML = `${f.name}<small>${f.specHint}</small>`; b.style.borderColor = f.col;
      b.onclick = () => { D.f1 = k; D.two = d2p.checked; const v = dp2.value; D.f2 = (v && v !== k) ? v : null; GAME.start(f.rig); };
      pick.appendChild(b);
    }
    const sync = () => { for (const b of pick.querySelectorAll('.fbtn')) { b.disabled = FIGHTERS[b.dataset.f].rig === 'gy' && sg.disabled; b.title = b.disabled ? '載入中…' : ''; } if (sg.disabled) setTimeout(sync, 200); };
    sync();
  }
  document.documentElement.classList.remove('qwait');
})();
