// 單挑模式（zhaoyun.html#duel=1）：冇雜兵，一開波對手即出現；三局兩勝，每局 60 秒；時間到以剩血百分比定勝負。
// 第一版對手 = 張郃（AI 用返 stepBoss）。之後換 Meshy 角色只需換 bossG 嘅模型。
(() => {
  'use strict';
  const EN = typeof LANG !== 'undefined' && LANG === 'en', T = (zh, en) => EN ? en : zh;   // 英文版：#lang=en
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
  #dhud .nm span{white-space:nowrap}body.en #title h1{font-size:clamp(30px,7.5vw,96px)}body.en #bM{font-size:10px!important;letter-spacing:0}body.en #bD{font-size:11px!important;letter-spacing:0}
  #dlang{position:absolute;right:14px;top:14px;margin:0;font:inherit;font-size:13px;padding:5px 14px;border-radius:16px;letter-spacing:0;background:rgba(20,20,30,.6);border:1px solid rgba(255,255,255,.5);color:#fff;cursor:pointer}@media (max-height:420px){#dlang{top:30px}}
  #pick .fbtn.pickme{animation:dnetpulse 1s infinite}
  @keyframes dnetpulse{0%,100%{box-shadow:0 0 0 2px #ffe08a}50%{box-shadow:0 0 16px 5px #ffe08a}}`;
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'dhud'; hud.hidden = true;
  hud.innerHTML = `<div class="p1"><div class="nm"><span id="dn1">趙雲</span><span id="dh1"></span></div><div class="bar"><i id="db1"></i></div><div class="ms" id="dm1"><i></i></div></div>
    <div><div class="clk" id="dclk">60</div><div class="dots" id="ddots"></div></div>
    <div class="p2"><div class="nm"><span id="dn2">張郃</span><span id="dh2"></span></div><div class="bar"><i id="db2"></i></div><div class="ms" id="dm2" hidden><i></i></div><div class="hint" id="dk2" hidden>${T('P2：方向鍵 移動 · 1 攻擊 · 2 突進 · 3 閃避 · 0 絕招', 'P2: arrows move · 1 attack · 2 dash · 3 dodge · 0 special')}</div></div>`;
  document.body.appendChild(hud);
  const rb = document.createElement('div'); rb.id = 'dround'; document.body.appendChild(rb);
  const $ = (id) => document.getElementById(id);
  const say = (t, ms = 1100) => { rb.textContent = t; rb.style.opacity = 1; clearTimeout(say.h); say.h = setTimeout(() => { rb.style.opacity = 0; }, ms); if (D.net === 'host') netSend({ t: 'say', x: t, ms }); };


  // ===== 四個名人（私人版）。換 Meshy 模型時只需改 rig；絕招邏輯喺下面 cast() =====
  const FIGHTERS = {
    rocket: { name: T('火箭商人', 'Rocket Tycoon'), short: T('火箭', 'Rocket'), rig: 'zy', col: '#ff5a3c', hp: 400, scale: 1, spec: 'rocket', specName: T('火鳳凰降臨', 'Phoenix Rocket'), specHint: T('射火箭上天再炸落嚟', 'Rocket strike from the sky'), mGain: .5 },
    tariff: { name: T('關稅大帝', 'Tariff Emperor'), short: T('關稅', 'Tariff'), rig: 'zy', col: '#ffd24a', hp: 440, scale: 1, spec: 'wall', specName: T('關稅牆！', 'Tariff Wall!'), specHint: T('火牆封住對手 5 秒', 'Fire wall trap, 5 seconds') },
    chip:   { name: T('晶片教主', 'Chip Guru'), short: T('晶片', 'Chip'), rig: 'zy', col: '#39ff14', hp: 400, scale: 1, spec: 'chips', specName: T('晶片生成', 'Chip Storm'), specHint: T('28 塊晶片追蹤', '28 homing chips') },
    tsar:   { name: T('冰原沙皇', 'Tundra Tsar'), short: T('沙皇', 'Tsar'), rig: 'zy', col: '#9fd8ff', hp: 420, scale: 1, spec: 'bear', specName: T('熊出沒！', 'Bear Attack!'), specHint: T('隻熊追咬對手 5 秒', 'A bear chases and bites, 5 seconds') },
    drone:  { name: T('澤連司機', 'Drone Driver'), short: T('司機', 'Driver'), rig: 'zy', col: '#8fc43a', hp: 380, scale: 1, spec: 'drones', specName: T('無人機群', 'Drone Swarm'), specHint: T('6 架無人機逐架俯衝', '6 drones dive one by one'), mGain: .5 },
  };
  const HEADLINE = {
    rocket: (w) => T(`【突發】火箭商人嘅火箭落返自己頭上；${w}：「唔關我事」`, `BREAKING: Rocket Tycoon's rocket lands on his own head. ${w}: "Not my problem."`),
    tariff: (w) => T(`【突發】關稅大帝敗陣，宣布對${w}加徵 300% 關稅，市場冇反應`, `BREAKING: Tariff Emperor loses and announces a 300% tariff on ${w}. Markets do not react.`),
    chip:   (w) => T(`【突發】晶片教主敗陣，宣布下季推新卡——即日售罄；${w}冇買到`, `BREAKING: Chip Guru loses and announces a new card for next quarter. Sold out the same day. ${w} did not get one.`),
    tsar:   (w) => T(`【突發】冰原沙皇敗陣，發言人：「一切按計劃進行」；隻熊已經返咗屋企`, `BREAKING: Tundra Tsar loses. Spokesman: "Everything is going to plan." The bear has gone home.`),
    drone:  (w) => T(`【突發】澤連司機敗陣，無人機冇電；${w}拒絕借充電線`, `BREAKING: Drone Driver loses after his drones run out of battery. ${w} refuses to lend a charging cable.`),
  };
  // ===== 火箭商人 Meshy 模型：只喺單挑模式額外下載（正常趙雲模式唔會入呢個檔）=====
  const MESH = { rocket: 'musk', tariff: 'trump', chip: 'jensen', tsar: 'putin', drone: 'zelen' };   // 鬥士 → Meshy 模型（冇載到就用返趙雲／張郃）
  // ===== 音效：名人亂鬥冇刀劍。出拳 = 風聲（合成），打中 = 拳聲（Kenney impactPunch，本身已經係），每個角色加一個細聲 =====
  const addSfx = (o) => {
    if (!o) return; window.SFX = Object.assign(window.SFX || {}, o);
    const c = SND.ctx; if (!c) return;   // SND.init() 已經行咗：補解碼
    for (const [name, list] of Object.entries(o)) for (const b64 of list) {
      const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      c.decodeAudioData(u8.buffer, (b) => (SND.buf[name] = SND.buf[name] || []).push(b), () => {});
    }
  };
  SND.swing = function (big) { if (!this.ok('sw', 0.05)) return; window.__sndLog && window.__sndLog.push('whoosh'); this.noise(big ? 0.24 : 0.15, big ? 0.3 : 0.2, big ? 260 : 340, big ? 1100 : 1500, 'bandpass', 0, null, 0.9); };
  SND.musou = function () { if (!this.ctx) return; this.sample('fire', 0.8, 0.6); this.tone(60, 1.2, 'sawtooth', 0.2, 2.2); this.noise(1.4, 0.3, 300, 2600, 'lowpass'); };   // 火箭升空（唔再用鑼同龍吼）
  SND.sting = function () { if (!this.ctx) return; window.__sndLog && window.__sndLog.push('sting'); this.sample('sting', 0.7); this.tone(196, 0.5, 'triangle', 0.14, 2); this.tone(294, 0.5, 'triangle', 0.1, 2, 0.06); this.noise(0.45, 0.16, 500, 5000, 'bandpass'); };
  const CSND = { elec: ['zap', .3], fire: ['fire', .4], smoke: ['puff', .5], frost: ['ice', .4], spark: ['buzz', .35] };   // 拳效 → 角色聲
  const charSnd = (fx) => { const c = CSND[fx]; if (c && SND.ok('c_' + fx, 0.22)) { window.__sndLog && window.__sndLog.push(c[0]); SND.sample(c[0], c[1], rand(.92, 1.1)); } };
  const muskReady = (async () => {
    const get = (f) => fetch(f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.arrayBuffer(); });
    const run = (b, f) => { const s = document.createElement('script'); s.text = new TextDecoder().decode(b) + '\n//# sourceURL=' + f; document.head.appendChild(s); };
    try { run(await get('zy_clips_fist.js'), 'zy_clips_fist.js'); } catch (e) { console.warn('fist clips load failed', e); return; }
    const extra = [['zy_clips_cine.js', null], ['zy_sfx_duel.js', () => addSfx(window.SFX_DUEL)]].map(async ([f, then]) => {   // 絕招特寫動作 + 角色音效；載唔到照玩
      try { run(await get(f), f); if (then) then(); } catch (e) { console.warn(f + ' load failed', e); } });
    await Promise.all(Object.values(MESH).map(async (id) => {
      try {
        const [jb, tb] = await Promise.all([get('zy_rig_' + id + '.js'), get('zy_tex_' + id + '.webp'), ...extra]);
        run(jb, 'zy_rig_' + id + '.js');
        if (window.MRIG && window.MRIG[id]) window.MRIG[id].tex = URL.createObjectURL(new Blob([tb], { type: 'image/webp' }));
      } catch (e) { console.warn(id + ' load failed', e); }
    }));
  })();
  // ---- 主角模型切換：CHARS.zy 可以掛多個 rig，按 f1 揀邊個現形/動畫；趙雲 mesh + 槍照舊 ----
  const MUSK_SCALE = 1.12;   // musk bbox 高 1.80m（同 zy 1.80 / zhanghe 1.85 同級），用返趙雲嘅 1.12
  const heroRigs = {};   // 'zy' | 'musk' | 'trump' | 'jensen' -> { mrig, rigUpdate }（rigUpdate 係 attach() 入面同一部狀態機，唔使複製）
  function setHeroMesh(id) {   // id: 'zy' | MESH 入面嘅模型
    const C = CHARS && CHARS.zy; if (!C || !C.mrig) return false;
    if (!heroRigs.zy) heroRigs.zy = { mrig: C.mrig, rigUpdate: C.rigUpdate };
    if (id !== 'zy' && !heroRigs[id]) {
      if (!window.MRIG || !window.MRIG[id] || !window.MRIG_ATTACH) return false;
      window.MRIG_ATTACH(C, id, MUSK_SCALE);   // attach 會暫時將 C.mrig/rigUpdate 指向新 rig
      if (window.MCLIPS_FIST && window.addClipBank) window.addClipBank(C.mrig, window.MCLIPS_FIST, window.MRIG[id]);
      if (window.MCLIPS_CINE && window.addClipBank) window.addClipBank(C.mrig, window.MCLIPS_CINE, window.MRIG[id]);
      heroRigs[id] = { mrig: C.mrig, rigUpdate: C.rigUpdate };
      C.mrig = heroRigs.zy.mrig; C.rigUpdate = heroRigs.zy.rigUpdate;
    }
    const use = heroRigs[id] ? id : 'zy';
    C.mrig = heroRigs[use].mrig; C.rigUpdate = heroRigs[use].rigUpdate;
    for (const k in heroRigs) heroRigs[k].mrig.group.visible = k === use;
    C.w.visible = use === 'zy';   // Meshy 角色冇槍
    window.HERO_MOVES = use !== 'zy' ? 'fist' : null;   // Meshy 角色：N/CH 轉拳腳表
    window.MUSOU_GAIN = use !== 'zy' && F1() ? F1().mGain || 1 : 1;   // musk 氣慢啲（mGain）
    return true;
  }
  // ===== 舞台：跟對手換場景（火箭發射台／金色大堂／伺服器房），全部程式砌，冇額外檔案 =====
  ARENA = 15;   // 單挑：30 米擂台（原本城池 124 米）
  const SC = window.ZY_SCENERY, STG = {}; let stageNow = null;
  if (SC) { for (const o of SC.objs) if (!o.isLight || o.isPointLight) o.visible = false; SC.fires.length = 0; window.NO_EMBERS = true; }
  const hemi = SC && SC.objs.find((o) => o.isHemisphereLight);
  const ctex = (w, h, draw, rx = 1, ry = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(rx, ry); tx.anisotropy = 4; return tx; };
  const lam = (o) => new THREE.MeshLambertMaterial(o), bas = (o) => new THREE.MeshBasicMaterial(o);
  const put = (g, geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  const flat = (g, geo, mat, y, up = true) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.position.y = y; g.add(m); return m; };
  const walls4 = (g, mat, R, H) => { for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; put(g, new THREE.PlaneGeometry(R * 2, H), mat, Math.sin(a) * R, H / 2, Math.cos(a) * R, a + Math.PI); } };
  const glow = (g, x, y, z, s, col) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .75 })); sp.scale.setScalar(s); sp.position.set(x, y, z); g.add(sp); };
  STG.rocket = () => {   // 夜晚火箭發射台
    const g = new THREE.Group(), R = 19;
    flat(g, new THREE.PlaneGeometry(260, 260), lam({ map: ctex(512, 512, (x, w, h) => { x.fillStyle = '#5b6068'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '20,22,26' : '150,155,165'},${Math.random() * .12})`; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      x.strokeStyle = 'rgba(20,22,26,.5)'; x.lineWidth = 3; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, h); x.moveTo(0, i * 128); x.lineTo(w, i * 128); x.stroke(); } }, 30, 30) }), 0);
    flat(g, new THREE.RingGeometry(13.2, 13.8, 64), bas({ color: 0xffd21a }), .02);
    const hz = lam({ map: ctex(128, 32, (x, w, h) => { x.fillStyle = '#ffd21a'; x.fillRect(0, 0, w, h); x.fillStyle = '#16181c'; for (let i = -1; i < 5; i++) { x.beginPath(); x.moveTo(i * 32, h); x.lineTo(i * 32 + 16, h); x.lineTo(i * 32 + 32, 0); x.lineTo(i * 32 + 16, 0); x.fill(); } }, 12, 1) });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; put(g, new THREE.BoxGeometry(R * 2, 1.1, .5), hz, Math.sin(a) * R, .55, Math.cos(a) * R, a); }
    const white = lam({ color: 0xe8ecf2 }), dark = lam({ color: 0x23262c }), red = lam({ color: 0xb8322a }), steel = lam({ color: 0x7c848e });
    for (const [rx, rz] of [[0, -36], [0, 36]]) {   // 兩邊各一支火箭 + 發射塔（鏡頭轉去邊都見到）
      put(g, new THREE.CylinderGeometry(2.6, 2.6, 34, 20), white, rx, 19, rz); put(g, new THREE.ConeGeometry(2.6, 7, 20), white, rx, 39.5, rz); put(g, new THREE.CylinderGeometry(2.65, 2.65, 2, 20), dark, rx, 26, rz);
      for (const s of [-1, 1]) put(g, new THREE.BoxGeometry(.3, 6, 3), dark, rx + s * 3.2, 5, rz);
      put(g, new THREE.BoxGeometry(12, 2, 12), steel, rx, 1, rz);
      for (let y = 2; y < 40; y += 4) put(g, new THREE.BoxGeometry(5, .3, 5), red, rx - 8, y, rz);
      for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) put(g, new THREE.BoxGeometry(.4, 40, .4), red, rx - 8 + dx, 20, rz + dz);
      put(g, new THREE.BoxGeometry(5, .5, 1.2), steel, rx - 4.5, 30, rz); glow(g, rx, 2.5, rz + (rz < 0 ? 7 : -7), 14, 0xffb060);
    }
    const win = bas({ map: ctex(256, 64, (x, w, h) => { x.fillStyle = '#1a1f28'; x.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) { x.fillStyle = Math.random() < .7 ? '#ffe6a0' : '#2a3140'; x.fillRect(6 + i * 16, 8 + j * 18, 10, 11); } }, 2, 1) });
    for (const s of [-1, 1]) {   // 東西：控制樓 + 燃料缸
      put(g, new THREE.BoxGeometry(8, 9, 30), win, s * 40, 4.5, 0, 0);
      for (const z of [-24, 24]) { put(g, new THREE.CylinderGeometry(4, 4, 12, 18), white, s * 34, 6, z); put(g, new THREE.CylinderGeometry(4.05, 4.05, 1.2, 18), red, s * 34, 9, z); }
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { put(g, new THREE.BoxGeometry(.5, 16, .5), steel, sx * 23, 8, sz * 23); put(g, new THREE.BoxGeometry(2.4, 1.2, 1), bas({ color: 0xf4f8ff }), sx * 23, 16, sz * 23, Math.atan2(sx, sz)); glow(g, sx * 23, 16, sz * 23, 10, 0xdfe8ff); }
    const sg = new THREE.BufferGeometry(), sp = new Float32Array(900); for (let i = 0; i < 300; i++) { const a = Math.random() * 6.283, e = .08 + Math.random() * 1.4, r = 400; sp[i * 3] = Math.cos(a) * Math.cos(e) * r; sp[i * 3 + 1] = Math.sin(e) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); const st = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })); st.frustumCulled = false; g.add(st);
    return { g, fog: [0x0b1226, 70, 330], hemi: [0x7f96d8, 0x30343c, .85], sun: [0xdfe8ff, 1.0], rim: [0xff9a50, .5] };
  };
  STG.tariff = () => {   // 金色大堂
    const g = new THREE.Group(), R = 24, H = 16;
    flat(g, new THREE.PlaneGeometry(R * 2, R * 2), lam({ map: ctex(256, 256, (x, w, h) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#b9b2a2' : '#2a2622'; x.fillRect(i * 64, j * 64, 64, 64); }
      for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(130,120,105,${Math.random() * .25})`; x.lineWidth = 1; x.beginPath(); const px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py); x.lineTo(px + rand(-30, 30), py + rand(-30, 30)); x.stroke(); }
      x.strokeStyle = '#c9a23c'; x.lineWidth = 3; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, h); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke(); } }, 6, 6) }), 0);
    flat(g, new THREE.PlaneGeometry(6, R * 2), lam({ color: 0x7a1018 }), .02);
    const wallT = ctex(256, 256, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#8a6a1e'); gr.addColorStop(.5, '#e8c860'); gr.addColorStop(1, '#8a6a1e'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#5a4210'; x.lineWidth = 6; x.strokeRect(14, 14, w - 28, h - 28); x.strokeStyle = '#fff0b0'; x.lineWidth = 2; x.strokeRect(24, 24, w - 48, h - 48); }, 8, 3);
    walls4(g, lam({ map: wallT, color: 0xb8b8b8 }), R, H);
    const gold = lam({ color: 0xb8922e }), cur = lam({ color: 0x8a1020 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2;
      for (const u of [-16, -8, 8, 16]) { const x0 = Math.sin(a) * (R - 1.4) + Math.cos(a) * u, z0 = Math.cos(a) * (R - 1.4) - Math.sin(a) * u; put(g, new THREE.CylinderGeometry(.8, .9, H, 14), gold, x0, H / 2, z0); put(g, new THREE.BoxGeometry(2.4, .8, 2.4), gold, x0, .4, z0); }
      put(g, new THREE.BoxGeometry(6, H - 3, .4), cur, Math.sin(a) * (R - .4), (H - 3) / 2, Math.cos(a) * (R - .4), a); }
    flat(g, new THREE.PlaneGeometry(R * 2, R * 2), lam({ color: 0x4a3814, emissive: 0x1a1204 }), H, false);
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; put(g, new THREE.SphereGeometry(.28, 8, 6), bas({ color: 0xfff2c0 }), Math.cos(a) * 3, H - 3, Math.sin(a) * 3); }
    put(g, new THREE.CylinderGeometry(3.2, 2, .5, 20), gold, 0, H - 2.4, 0); put(g, new THREE.CylinderGeometry(.12, .12, 2.4, 6), gold, 0, H - 1.2, 0); glow(g, 0, H - 3, 0, 16, 0xffd98a);
    return { g, fog: [0x2a1e0c, 60, 220], hemi: [0xfff0c8, 0x6a4a20, .5], sun: [0xffe2a0, .55], rim: [0xffc060, .3] };
  };
  STG.chip = () => {   // 伺服器房
    const g = new THREE.Group(), R = 24, H = 11;
    flat(g, new THREE.PlaneGeometry(R * 2, R * 2), lam({ map: ctex(256, 256, (x, w, h) => { x.fillStyle = '#18221e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#1c5a34'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2); x.fillStyle = '#24362d'; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) x.fillRect(20 + i * 38, 20 + j * 38, 5, 5); }, 16, 16) }), 0);
    const rackT = () => ctex(256, 512, (x, w, h) => { x.fillStyle = '#0a0d10'; x.fillRect(0, 0, w, h);
      for (let c = 0; c < 2; c++) { x.fillStyle = '#161c22'; x.fillRect(8 + c * 124, 8, 116, h - 16);
        for (let r = 0; r < 24; r++) { const y = 16 + r * 20; x.fillStyle = '#222b33'; x.fillRect(14 + c * 124, y, 104, 15);
          for (let k = 0; k < 9; k++) { const v = Math.random(); x.fillStyle = v < .55 ? '#39ff14' : v < .75 ? '#19c8ff' : v < .82 ? '#ffb020' : '#0c1a10'; x.fillRect(20 + c * 124 + k * 10, y + 5, 5, 4); } } } }, 10, 1);
    walls4(g, bas({ map: rackT() }), R, H); const g2 = new THREE.Group(); walls4(g2, bas({ map: rackT() }), R - .02, H); g.add(g2);
    g.userData.tick = (tm) => { g2.visible = Math.floor(tm * 2.5) % 2 === 0; };   // LED 閃
    flat(g, new THREE.RingGeometry(14.4, 14.7, 64), bas({ color: 0x39ff14 }), .02);
    flat(g, new THREE.PlaneGeometry(R * 2, R * 2), bas({ map: ctex(128, 128, (x, w, h) => { x.fillStyle = '#0a100d'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8ffe6'; x.fillRect(20, 56, 88, 16); }, 6, 6) }), H, false);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) glow(g, sx * 18, 5, sz * 18, 14, 0x39ff14);
    return { g, fog: [0x06180f, 50, 170], hemi: [0xb8ffd4, 0x143024, .9], sun: [0xd8ffe8, .9], rim: [0x39ff14, .5] };
  };
  STG.tsar = () => {   // 雪地宮殿廣場（夜晚）
    const g = new THREE.Group(), R = 24, H = 11;
    flat(g, new THREE.PlaneGeometry(R * 2, R * 2), lam({ map: ctex(256, 256, (x, w, h) => { x.fillStyle = '#b4c3d6'; x.fillRect(0, 0, w, h); x.strokeStyle = '#94a6bd'; x.lineWidth = 3; x.strokeRect(0, 0, w, h); x.fillStyle = '#d2deeb'; for (let k = 0; k < 40; k++) x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }, 12, 12) }), 0);
    walls4(g, bas({ map: ctex(512, 256, (x, w, h) => { x.fillStyle = '#7a1f1c'; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 4; k++) { const c = 64 + k * 128; x.fillStyle = '#c9c2b4'; x.fillRect(c - 34, 96, 68, 160); x.beginPath(); x.arc(c, 96, 34, Math.PI, 0); x.fill(); x.fillStyle = '#1a2436'; x.fillRect(c - 24, 104, 48, 152); x.beginPath(); x.arc(c, 104, 24, Math.PI, 0); x.fill(); x.fillStyle = '#d9b060'; x.fillRect(c - 16, 130, 32, 50); }
      x.fillStyle = '#cfdbe8'; x.fillRect(0, 0, w, 26); for (let k = 0; k < 16; k++) { x.beginPath(); x.arc(16 + k * 32, 26, 16, 0, Math.PI); x.fill(); } }, 5, 1) }), R, H);
    flat(g, new THREE.RingGeometry(14.4, 14.7, 64), bas({ color: 0x6fb8ff }), .02);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { put(g, new THREE.CylinderGeometry(.12, .16, 6, 8), lam({ color: 0x20242c }), sx * 17, 3, sz * 17, 0); glow(g, sx * 17, 6.2, sz * 17, 9, 0xdff0ff); }
    return { g, fog: [0x0c1626, 50, 170], hemi: [0xcfe0f5, 0x44546e, .7], sun: [0xeaf4ff, .6], rim: [0x9fd8ff, .45] };
  };
  STG.drone = () => {   // 向日葵田 + 泥路 + 無線電塔（日頭）
    const g = new THREE.Group(), R = 24, H = 11;
    flat(g, new THREE.PlaneGeometry(R * 2, R * 2), lam({ map: ctex(256, 256, (x, w, h) => { x.fillStyle = '#6f8f3a'; x.fillRect(0, 0, w, h); x.fillStyle = '#84a548'; for (let k = 0; k < 70; k++) x.fillRect(Math.random() * w, Math.random() * h, 4, 9); }, 6, 6) }), 0);
    flat(g, new THREE.PlaneGeometry(5, R * 2), lam({ map: ctex(64, 64, (x, w, h) => { x.fillStyle = '#8a6a44'; x.fillRect(0, 0, w, h); x.fillStyle = '#75583a'; x.fillRect(12, 0, 7, h); x.fillRect(45, 0, 7, h); }, 1, 8) }), .01).rotation.z = .5;
    walls4(g, bas({ map: ctex(512, 256, (x, w, h) => { const sky = x.createLinearGradient(0, 0, 0, 150); sky.addColorStop(0, '#4f93d4'); sky.addColorStop(1, '#b4d2ea'); x.fillStyle = sky; x.fillRect(0, 0, w, h);
      x.fillStyle = '#c6daee'; for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(90 + k * 170, 40 + (k % 2) * 26, 60, 11, 0, 0, 7); x.fill(); }
      x.fillStyle = '#3f6a26'; x.fillRect(0, 150, w, 106);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 22; k++) { const cx = 12 + k * 24 + (r % 2) * 12, cy = 150 + r * 26, q = 7 + r * 2; x.strokeStyle = '#2f5a1c'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy + 30); x.stroke(); x.fillStyle = '#ffd21f'; x.beginPath(); x.arc(cx, cy, q, 0, 7); x.fill(); x.fillStyle = '#6b3d14'; x.beginPath(); x.arc(cx, cy, q * .45, 0, 7); x.fill(); } }, 4, 1) }), R, H);
    flat(g, new THREE.RingGeometry(14.4, 14.7, 64), bas({ color: 0xffe14a }), .02);
    put(g, new THREE.CylinderGeometry(.1, .28, 10.5, 6), lam({ color: 0x5c6168 }), 19, 5.25, -19, 0); for (const y of [4, 7, 9.6]) put(g, new THREE.BoxGeometry(1.6, .08, .08), lam({ color: 0x5c6168 }), 19, y, -19, 0); glow(g, 19, 10.6, -19, 3, 0xff3b30);
    return { g, fog: [0xa9c8e2, 60, 190], hemi: [0xdfeaf5, 0x6a7a40, .62], sun: [0xfff2d0, .6], rim: [0xffe08a, .25] };
  };
  const setStage = (id) => {
    if (!SC || !STG[id] || stageNow === id) return; stageNow = id;
    const S = STG[id].built || (STG[id].built = STG[id]()); if (!S.g.parent) scene.add(S.g);
    for (const k in STG) if (STG[k].built) STG[k].built.g.visible = k === id;
    SC.FOG.setHex(S.fog[0]); scene.fog.color.setHex(S.fog[0]); scene.fog.near = S.fog[1]; scene.fog.far = S.fog[2];
    if (hemi) { hemi.color.setHex(S.hemi[0]); hemi.groundColor.setHex(S.hemi[1]); hemi.intensity = S.hemi[2]; }
    SC.sun.color.setHex(S.sun[0]); SC.sun.intensity = S.sun[1]; SC.rim.color.setHex(S.rim[0]); SC.rim.intensity = S.rim[1];
  };
  const stageTick = () => { const S = stageNow && STG[stageNow].built; if (S && S.g.userData.tick) S.g.userData.tick(performance.now() / 1000); };
  D.setStage = setStage; setStage('rocket');
  function applyRigs() {
    const have = (f) => MESH[f] && window.MRIG && window.MRIG[MESH[f]] ? MESH[f] : null;
    window.NO_SUZAKU = !!D.f2;   // 對手係名人鬥士：唔放張郃嘅朱雀，只用自己嘅絕招
    setHeroMesh(have(D.f1) || 'zy');
    if (window.setBossRig) window.setBossRig(have(D.f2) || 'zhanghe');
    setStage(D.f2 in STG ? D.f2 : 'rocket');
  }
  muskReady.then(() => { applyRigs(); const s = document.getElementById('pick'); if (s) s.dispatchEvent(new Event('muskloaded')); });

// Photo Finish. The round owner advances the contest. Guests draw the replicated state.
const photoShow = (() => {
  const HAT = .5, HOLD = .65, RADIUS = 2.15, HEAL = 35, ENERGY = 35;
  const WINDOWS = [4, 23, 42];
  const ink = '#191621', cream = '#fff5d6';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const portraits = {"rocket": "data:image/webp;base64,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", "tariff": "data:image/webp;base64,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", "chip": "data:image/webp;base64,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", "tsar": "data:image/webp;base64,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", "drone": "data:image/webp;base64,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"};
  const names = {
    duck: T('太空鴨總裁', 'Chief Quack Officer'),
    toast: T('烘焙總監', 'Head of Toast'),
    crown: T('單據大帝', 'Lord of the Receipts')
  };
  const props = Object.keys(names);
  const captions = {
    duck: T('董事會全票通過：嘎！','The board voted unanimously. Quack.'),
    toast: T('今日出爐嘅，係我。','Promoted to upper crust.'),
    crown: T('張單唔使要，我戴住走。','Keep the receipt? Already wearing it.')
  };
  const stage = new THREE.Group();
  stage.visible = false;
  scene.add(stage);
  const groundMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  function floorRing(inner, outer, color, opacity, lift) {
    const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), groundMat(color, opacity));
    m.rotation.x = -Math.PI / 2;
    m.position.y = lift;
    stage.add(m);
    return m;
  }
  floorRing(.01, RADIUS, 0xffbd3e, .22, .08);
  floorRing(RADIUS - .18, RADIUS, 0xffe86d, .95, .10);
  const markers = new THREE.Group();
  stage.add(markers);
  const dashGeo = new THREE.BoxGeometry(.42, .025, .095);
  const dashMat = groundMat(0xfff9de);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    const m = new THREE.Mesh(dashGeo, dashMat);
    m.position.set(Math.sin(a) * (RADIUS + .16), .13, Math.cos(a) * (RADIUS + .16));
    m.rotation.y = a;
    markers.add(m);
  }
  const cameraTex = ctex(128, 128, ctx => {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(64, 64, 56, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffde65'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#ffdf65'; ctx.fillRect(27, 47, 74, 47); ctx.fillRect(40, 38, 24, 12);
    ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(65, 70, 14, 0, TAU); ctx.stroke();
    ctx.fillStyle = ink; ctx.fillRect(82, 53, 12, 6);
  });
  const cameraSign = new THREE.Sprite(new THREE.SpriteMaterial({map: cameraTex, depthWrite: false, fog: false}));
  cameraSign.scale.setScalar(1.28);
  cameraSign.position.y = 1.25;
  stage.add(cameraSign);

  // Each souvenir is created once and follows its winner for the photo.
  const hats = new THREE.Group(); scene.add(hats); hats.visible = false;
  const mat = color => new THREE.MeshLambertMaterial({color: new THREE.Color(color).multiplyScalar(.62)});
  const yellow = mat(0xffd233), orange = mat(0xfe7035), black = mat(0x241b2b);
  function shape(g, geom, material, x, y, z, sx=1, sy=1, sz=1) {
    const m = new THREE.Mesh(geom, material); m.position.set(x,y,z); m.scale.set(sx,sy,sz); g.add(m); return m;
  }
  const ball = new THREE.SphereGeometry(1,16,10);
  const duck = new THREE.Group();
  shape(duck,ball,yellow,0,.20,0,.45,.26,.34);
  shape(duck,ball,yellow,0,.47,.21,.27,.27,.26);
  shape(duck,ball,orange,0,.42,.47,.18,.055,.14);
  for (const x of [-.115,.115]) shape(duck,ball,black,x,.52,.436,.033,.044,.028);
  for (const x of [-.36,.36]) shape(duck,ball,orange,x,.23,-.015,.10,.11,.22);
  const toast = new THREE.Group(), crust=mat(0xb36330), bread=mat(0xffdf93), butter=mat(0xffcf13);
  shape(toast,new THREE.BoxGeometry(.70,.66,.16),crust,0,.35,0);
  shape(toast,ball,crust,0,.65,0,.425,.20,.10);
  shape(toast,new THREE.BoxGeometry(.575,.52,.035),bread,0,.35,.085);
  shape(toast,ball,bread,0,.60,.085,.345,.159,.027);
  shape(toast,new THREE.BoxGeometry(.20,.15,.06),butter,.07,.45,.13).rotation.z=-.19;
  const crown=new THREE.Group(), paper=mat(0xffedb0), red=mat(0xdc4551);
  shape(crown,new THREE.CylinderGeometry(.43,.33,.26,12,1,true),paper,0,.2,0);
  for(let i=0;i<7;i++){
    const a=i*TAU/7;
    const tip=shape(crown,new THREE.ConeGeometry(.16,.32,3),paper,Math.sin(a)*.36,.42,Math.cos(a)*.36);
    tip.rotation.y=a;
    shape(crown,ball,red,Math.sin(a)*.405,.24,Math.cos(a)*.405,.046,.05,.046);
  }
  const souvenirs={duck, toast, crown};
  for(const g of Object.values(souvenirs)) hats.add(g);
  hats.scale.setScalar(HAT);
  // Where the top of the head is, in Head-bone space, read once per rig from the bind pose.
  const crowns=new WeakMap();
  function crownOf(rig){
    if(crowns.has(rig))return crowns.get(rig);
    let out=null, m=null;
    rig.mesh.traverse(o=>{if(o.isSkinnedMesh&&!m)m=o;});
    const head=rig.bones.Head, hips=rig.bones.Hips;
    if(m&&head&&hips){
      const sk=m.skeleton, hi=sk.bones.indexOf(head), pi=sk.bones.indexOf(hips);
      const g=m.geometry.attributes, pos=g.position, si=g.skinIndex, sw=g.skinWeight;
      if(hi>=0&&pi>=0&&si&&sw){
        const inHead=sk.bones.map(b=>{for(let q=b;q;q=q.parent)if(q===head)return true;return false;});
        const at=i=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[i]).invert());
        const up=at(hi).sub(at(pi)).normalize(), v=new THREE.Vector3(), pts=[];
        let top=-Infinity;
        for(let i=0;i<pos.count;i++){
          let w=0;for(let k=0;k<4;k++)if(inHead[si.array[i*4+k]])w+=sw.array[i*4+k];
          if(w<.8)continue;
          v.fromBufferAttribute(pos,i).applyMatrix4(m.bindMatrix);
          const h=v.dot(up);pts.push([v.x,v.y,v.z,h]);if(h>top)top=h;
        }
        const sum=new THREE.Vector3();let n=0;
        for(const q of pts)if(q[3]>top-.03){sum.x+=q[0];sum.y+=q[1];sum.z+=q[2];n++;}
        if(n)out=sum.multiplyScalar(1/n).applyMatrix4(sk.boneInverses[hi]);
      }
    }
    crowns.set(rig,out);return out;
  }

  const badge=document.createElement('div'); badge.id='photoObjective'; badge.hidden=true;
  badge.innerHTML='<i class="pf-camera" aria-hidden="true"></i><div><b></b><small></small><i class="hold-track"><i></i></i></div><strong></strong>';
  document.body.append(badge);
  const title=badge.querySelector('b'), hint=badge.querySelector('small'), fill=badge.querySelector('.hold-track i'), countdown=badge.querySelector('strong');
  const card=document.createElement('aside');card.id='photoPrint';card.hidden=true;card.setAttribute('aria-live','polite');
  card.innerHTML='<div class="pf-printimage"><img alt=""><canvas width="128" height="100"></canvas></div><div class="pf-printcopy"><small></small><b></b><span></span></div>';
  document.body.append(card);
  const cardImg=card.querySelector('img'), cardIcon=card.querySelector('canvas');
  const cardTop=card.querySelector('small'),cardTitle=card.querySelector('b'),cardLine=card.querySelector('.pf-printcopy span');
  const layer=document.createElement('canvas');layer.id='comicFX';layer.setAttribute('aria-hidden','true');document.body.append(layer);
  const ctx=layer.getContext('2d'); let screenW,screenH, scale;
  function sizeCanvas(){
    screenW=innerWidth;screenH=innerHeight;scale=Math.min(devicePixelRatio||1,1.5);
    layer.width=Math.round(screenW*scale);layer.height=Math.round(screenH*scale);
  }
  sizeCanvas();addEventListener('resize',sizeCanvas);
  const popups=[], confetti=[];
  let state, nextWindow=0, order=[], roundKey=0, lastPhoto=0, elapsed=0, printLife=0;
  let lastHp=[0,0], lastHitAt=[-10,-10], lastPopAt=[-10,-10], streak=[0,0], dirty=false;
  const vec=new THREE.Vector3();
  const inside=(f,zone)=>Math.hypot(f.x-zone.x,f.z-zone.z)<=RADIUS && f.y<1.8;
  function resetMatch(){
    state={zone:null, wins:[0,0], best:[0,0], shot:null, serial:0};shots.length=0;
    lastPhoto=0;elapsed=0;clearPresentation();
  }
  function clearPresentation(){
    popups.length=0;confetti.length=0;printLife=0;dirty=false;card.hidden=true;hats.visible=false;
    badge.hidden=true;stage.visible=false;ctx.clearRect(0,0,layer.width,layer.height);
  }
  function resetRound(){
    state.zone=null;state.shot=null;nextWindow=0;roundKey=D.round;clearPresentation();
    order=props.slice();
    for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    lastHp=[player.hp,boss.hp];lastHitAt=[-10,-10];lastPopAt=[-10,-10];streak=[0,0];
  }
  function spawnZone(index){
    const dx=boss.x-player.x,dz=boss.z-player.z,len=Math.hypot(dx,dz);
    const nx=len>.1?-dz/len:1,nz=len>.1?dx/len:0,side=index%2===0?1:-1;
    const limit=ARENA-RADIUS-1;
    state.zone={x:clamp((player.x+boss.x)*.5+nx*3.2*side,-limit,limit),
      z:clamp((player.z+boss.z)*.5+nz*3.2*side,-limit,limit), left:8,hold:[0,0],prop:order[index]};
    SND.tone(660,.075,'sine',.09,1.15);SND.tone(880,.10,'sine',.07,1,.10);
  }
  function snap(who){
    const f=who===0?player:boss, before=f.hp, prop=state.zone.prop;
    f.hp=Math.min(f.max,f.hp+HEAL);
    state.wins[who]++;
    const gain=Math.ceil(f.hp-before), meter=Math.round(ENERGY*(1-gain/HEAL));
    if(meter>0){
      if(who===0)player.musou=Math.min(100,player.musou+meter);
      else if(D.two)D.m2=Math.min(100,D.m2+meter);
      else D.aiCd*=1-meter/100;   // CPU specials run on a timer
    }
    state.shot={id:++state.serial,who,prop,gain,meter};
    state.zone=null;
  }
  function advance(dt){
    if(!D.on || D.ending || !boss.alive || player.hp<=0 || GAME.state!=='play'){state.zone=null;return;}
    if(!state.zone && nextWindow<WINDOWS.length && ROUND_T-D.t>=WINDOWS[nextWindow]) spawnZone(nextWindow++);
    const z=state.zone;if(!z)return;
    z.left-=dt;if(z.left<=0){state.zone=null;return;}
    const a=inside(player,z),b=boss.alive&&inside(boss,z);
    // Owning the mark requires a short, uninterrupted solo pose.
    z.hold[0]=a&&!b?z.hold[0]+dt:0;
    z.hold[1]=b&&!a?z.hold[1]+dt:0;
    if(z.hold[0]>=HOLD)snap(0);else if(z.hold[1]>=HOLD)snap(1);
  }
  function steerAI(dt){
    const z=state.zone;
    if(!z || !D.on || D.two || boss.st!==0 || !boss.alive || boss.y>.05 ||
       boss.hp>=boss.max*.86 || Math.hypot(player.x-boss.x,player.z-boss.z)<3.2)return false;
    const dx=z.x-boss.x,dz=z.z-boss.z,len=Math.hypot(dx,dz);
    if(len>1.0){
      const step=Math.min(len,5*dt);
      boss.x+=dx/len*step;boss.z+=dz/len*step;boss.walkT=(boss.walkT||0)+dt*9;
      boss.yaw+=angDiff(Math.atan2(dx,dz),boss.yaw)*Math.min(1,dt*9);
    }
    boss.flash=Math.max(0,boss.flash-dt);boss.cd=Math.max(0,boss.cd-dt);return true;
  }
  function receive(packet){
    if(!packet)return;
    if(roundKey!==D.round){resetRound();}
    state.zone=packet.zone||null;state.wins=packet.wins||[0,0];state.best=packet.best||[0,0];
    state.shot=packet.shot||null;state.serial=packet.serial||0;
  }
  function drawSticker(kind){
    const c=cardIcon.getContext('2d');c.clearRect(0,0,128,100);
    c.lineJoin='round';c.lineCap='round';c.lineWidth=5;c.strokeStyle=ink;
    function ell(x,y,rx,ry,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();c.stroke();}
    function polygon(points,col){c.fillStyle=col;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();c.stroke();}
    if(kind==='duck'){
      ell(65,65,42,21,'#ffd742');ell(81,41,23,21,'#ffe05a');
      polygon([[94,41],[116,47],[96,54]],'#ff813b');ell(85,36,2,2,ink);
      c.beginPath();c.moveTo(40,60);c.quadraticCurveTo(53,76,75,63);c.stroke();
    }else if(kind==='toast'){
      c.fillStyle='#ffcc82';c.beginPath();c.moveTo(35,80);c.lineTo(36,45);c.bezierCurveTo(10,22,46,5,65,19);c.bezierCurveTo(95,1,120,24,99,45);c.lineTo(94,82);c.closePath();c.fill();c.stroke();
      polygon([[51,40],[74,32],[83,51],[59,59]],'#fff56b');ell(80,65,2,2,'#925333');
    }else{
      polygon([[16,20],[42,44],[60,10],[80,40],[111,18],[96,79],[37,80]],'#ffe6a1');
      c.beginPath();c.moveTo(35,65);c.lineTo(98,62);c.stroke();ell(64,48,5,6,'#ff626d');
    }
  }
  function project(x,y,z){
    vec.set(x,y,z).project(camera);
    return {x:(vec.x+1)*screenW*.5,y:(1-vec.y)*screenH*.5,visible:vec.z>-1 && vec.z<1};
  }
  function party(who){
    if(reduced.matches)return;
    const f=who===0?player:boss,p=project(f.x,f.y+1.9,f.z);
    const px=p.visible?clamp(p.x,screenW*.1,screenW*.9):screenW/2;
    const py=p.visible?clamp(p.y,screenH*.23,screenH*.7):screenH*.44;
    const colors=['#ffcf4c','#ff6486','#77e8de','#fff4ca','#b9ed69'];
    for(let i=0;i<43;i++)confetti.push({x:px,y:py,vx:rand(-235,235),vy:rand(-310,-55),spin:rand(-8,8),a:rand(0,6),s:rand(3,6),life:rand(.70,1.3),col:colors[i%5]});
  }
  // The print is a real picture: one extra render from in front of the winner, taken before the normal frame so it never reaches the screen.
  const film=document.createElement('canvas');film.width=640;film.height=480;
  const shots=[];let shootIn=0;
  function shoot(){
    const s=state.shot;if(!s||!hats.visible||!window.__render)return;
    const f=s.who===0?player:boss, el=renderer.domElement, pos=camera.position.clone(), quat=camera.quaternion.clone();
    const a=f.yaw+.5, hx=hats.position.x, hy=hats.position.y, hz=hats.position.z;
    camera.position.set(hx+Math.sin(a)*2.6,hy-.2,hz+Math.cos(a)*2.6);camera.lookAt(hx,hy-.55,hz);camera.updateMatrixWorld();
    try{
      window.__render();
      const h=el.height, w=Math.min(el.width,h*4/3), c=film.getContext('2d');
      c.filter='brightness(1.2)';c.drawImage(el,(el.width-w)/2,0,w,h,0,0,640,480);
      const url=film.toDataURL('image/jpeg',.86);
      shots.push({who:s.who,prop:s.prop,fighter:s.who===0?D.f1:D.f2,url});cardImg.src=url;card.classList.add('pf-real');
    }catch(_){}
    camera.position.copy(pos);camera.quaternion.copy(quat);camera.updateMatrixWorld();
  }
  window.PRE_RENDER=()=>{if(shootIn>0&&GAME.state==='play'&&performance.now()>=shootIn){shootIn=0;shoot();}};
  // Result screen: the match winner's latest photo, else the latest one.
  function bestShot(winner){
    for(let i=shots.length-1;i>=0;i--)if(shots[i].who===winner)return shots[i];
    return shots[shots.length-1]||null;
  }
  function savePhoto(shot){
    const c=document.createElement('canvas');c.width=700;c.height=640;const x=c.getContext('2d'),img=new Image();
    img.onload=()=>{
      x.fillStyle=cream;x.fillRect(0,0,700,640);x.drawImage(img,30,30,640,480);
      x.fillStyle=ink;x.textBaseline='middle';x.font='italic 900 40px BrawlDisplay, Impact, "Microsoft JhengHei", sans-serif';x.fillText(names[shot.prop],30,556);
      x.font='700 20px Arial, "Microsoft JhengHei", sans-serif';x.fillText(FIGHTERS[shot.fighter].name+'  ·  '+T('名人亂鬥','Celebrity Brawl'),30,604);
      const a=document.createElement('a');a.download='celebrity-brawl-photo.png';a.href=c.toDataURL('image/png');document.body.append(a);a.click();a.remove();
    };
    img.src=shot.url;
  }
  function showPhoto(s){
    lastPhoto=s.id; printLife=3.8;card.hidden=false;card.dataset.side=s.who;card.classList.remove('pf-real');shootIn=performance.now()+350;
    const id=s.who===0?D.f1:D.f2, fighter=FIGHTERS[id];
    cardImg.src=portraits[id];cardTitle.textContent=names[s.prop];cardLine.textContent=captions[s.prop];
    cardTop.textContent=fighter.short+'   /   '+[s.gain?'+'+s.gain+' HP':'',s.meter?'+'+s.meter+T(' 絕招',' SPECIAL'):''].filter(Boolean).join('  ');
    drawSticker(s.prop); for(const k in souvenirs)souvenirs[k].visible=k===s.prop;
    if(card.getAnimations)card.getAnimations().forEach(a=>a.cancel());
    if(!reduced.matches&&card.animate)card.animate([{transform:'rotate(-9deg) scale(.76)',opacity:0},{transform:'rotate(2deg) scale(1.04)',opacity:1,offset:.65},{transform:'rotate(-2deg) scale(1)'}],{duration:290,easing:'ease-out'});
    party(s.who);
    SND.noise(.075,.13,2900,700,'highpass');SND.tone(790,.08,'triangle',.09,.8,.08);SND.tone(1160,.12,'sine',.06,1,.19);
  }
  const hitWords={
    rocket:[T('咻！','ZIP!'),T('升空！','LIFTOFF!'),T('有冇保養？','WARRANTY?!')],
    tariff:[T('蓋印！','STAMP!'),T('加價！','MARKUP!'),T('埋單！','PAY UP!')],
    chip:[T('叮！','PING!'),T('超頻！','OVERCLOCK!'),T('窒機！','BUFFERING!')],
    tsar:[T('凍！','FREEZE!'),T('咬！','CHOMP!'),T('冇表情！','NO COMMENT!')],
    drone:[T('嗡！','BZZT!'),T('鎖定！','LOCKED!'),T('落！','INCOMING!')]
  };
  const small=[0,0];
  function hit(target,delta){
    // Chips and the wall burn are 3-damage ticks, not punches.
    delta-=small[target];small[target]=0;
    if(delta<=(D.net==='guest'?4:0))return;
    const f=target===0?player:boss,id=target===0?D.f2:D.f1;
    streak[target]=elapsed-lastHitAt[target]<1.5?streak[target]+1:1;lastHitAt[target]=elapsed;
    if(D.net!=='guest')state.best[1-target]=Math.max(state.best[1-target],streak[target]);
    if(elapsed-lastPopAt[target]<.45)return;lastPopAt[target]=elapsed;
    const count=streak[target], big=count>=3 || delta>=32, words=hitWords[id];
    if(!words)return;
    if(popups.length>=2)popups.shift();
    popups.push({x:f.x,y:f.y+1.85,z:f.z,t:0,life:big?.80:.58,side:target?1:-1,
      label:words[delta>=32?2:(count-1)%2],
      col:big?'#ffdf61':target?'#bcf5f3':'#ff96ac',big});
  }
  function paintFX(dt){
    if(!dirty&&!popups.length&&!confetti.length)return;
    dirty=popups.length>0||confetti.length>0;
    ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,screenW,screenH);
    const unit=clamp(Math.min(screenW/920,screenH/610),.64,1.15);
    for(let i=popups.length-1;i>=0;i--){
      const h=popups[i];h.t+=dt;if(h.t>=h.life){popups.splice(i,1);continue;}
      const p=project(h.x,h.y,h.z);if(!p.visible || p.x<0 || p.x>screenW)continue;
      const n=h.t/h.life;
      const half=Math.min(100*unit,screenW*.24);
      const x=clamp(p.x+h.side*(43+n*17)*unit,half,screenW-half);
      const y=clamp(p.y-(26+(reduced.matches?0:n*43))*unit,screenH*.20,screenH*.78);
      ctx.save();ctx.translate(x,y);ctx.rotate(h.side*-.08);const zoom=reduced.matches?1:1+.20*Math.sin(Math.min(1,n*5)*Math.PI);
      ctx.scale(unit*zoom,unit*zoom);ctx.globalAlpha=Math.min(1,(1-n)*4);
      ctx.font='italic 900 '+(h.big?34:26)+'px BrawlDisplay, Impact, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      const width=Math.max(42,ctx.measureText(h.label).width*.52+12);
      if(!reduced.matches){ctx.beginPath();const teeth=12;
        for(let k=0;k<teeth*2;k++){const a=k*Math.PI/teeth,rad=k%2?.72:1;const sx=Math.cos(a)*(width+12)*rad,sy=Math.sin(a)*(h.big?39:31)*rad;k?ctx.lineTo(sx,sy):ctx.moveTo(sx,sy);}
        ctx.closePath();ctx.fillStyle=h.col;ctx.strokeStyle=ink;ctx.lineWidth=2.8;ctx.stroke();ctx.fill();}
      ctx.lineJoin='round';ctx.strokeStyle=ink;ctx.lineWidth=5.7;ctx.strokeText(h.label,0,0);ctx.fillStyle=cream;ctx.fillText(h.label,0,0);ctx.restore();
    }
    for(let i=confetti.length-1;i>=0;i--){
      const c=confetti[i];c.life-=dt;if(c.life<=0){confetti.splice(i,1);continue;}
      c.x+=c.vx*dt*unit;c.y+=c.vy*dt*unit;c.vy+=365*dt;c.a+=c.spin*dt;
      ctx.save();ctx.globalAlpha=Math.min(1,c.life*3);ctx.translate(c.x,c.y);ctx.rotate(c.a);ctx.fillStyle=c.col;ctx.fillRect(-c.s*.5,-c.s,c.s,2*c.s);ctx.restore();
    }
  }
  function showZone(dt){
    const z=state.zone;stage.visible=!!z&&D.on;badge.hidden=!stage.visible;if(!stage.visible)return;
    stage.position.set(z.x,0,z.z);markers.rotation.y=reduced.matches?0:elapsed*.65;
    cameraSign.position.y=1.3+(reduced.matches?0:Math.sin(elapsed*3)*.12);
    if(!title.textContent)title.textContent=T('快閃影相位','PHOTO OP');
    const seconds=Math.ceil(z.left)+'s';if(countdown.textContent!==seconds)countdown.textContent=seconds;
    const p=z.hold,contested=inside(player,z)&&inside(boss,z),capturing=p[0]>0||p[1]>0;
    const pct=Math.round(clamp(Math.max(p[0],p[1])/HOLD,0,1)*100);
    const message=contested?T('逼爆鏡頭！要自己一個先影到。','Crowded shot! Get the ring to yourself.'):
      capturing?T('望鏡頭！','Hold that pose!'):T('獨佔金圈：+35 HP，滿血加絕招','Alone in the gold ring: +35 HP, or special energy');
    if(hint.textContent!==message)hint.textContent=message;
    const width=pct+'%';if(fill.style.width!==width)fill.style.width=width;
    // The original minimap uses the same arena-to-pixel conversion for both fighters.
    const sc=220/(ARENA*2+10),q=$('mini').getContext('2d');q.save();q.strokeStyle='#ffe064';q.lineWidth=3;
    q.beginPath();q.arc((z.x+ARENA+5)*sc,(z.z+ARENA+5)*sc,RADIUS*sc,0,TAU);q.stroke();q.restore();
  }
  function present(dt){
    if(GAME.state!=='play'){if(!badge.hidden||!card.hidden||popups.length||confetti.length)clearPresentation();return;}
    elapsed+=dt;camera.updateMatrixWorld();
    if(state.shot && state.shot.id>lastPhoto)showPhoto(state.shot);
    if(D.on){hit(0,lastHp[0]-player.hp);hit(1,lastHp[1]-boss.hp);}
    lastHp[0]=player.hp;lastHp[1]=boss.hp;
    printLife=Math.max(0,printLife-dt);hats.visible=printLife>0&&!!state.shot;card.hidden=!hats.visible;
    if(hats.visible){
      const f=state.shot.who===0?player:boss;
      const rig=state.shot.who===0?ACT.mrig:window.__bossRig&&window.__bossRig.R;
      const crown=rig&&rig.bones.Head&&crownOf(rig);
      if(crown){hats.position.copy(crown);rig.bones.Head.localToWorld(hats.position);hats.position.y-=.05;}
      else if(rig&&rig.bones.Head){rig.bones.Head.getWorldPosition(hats.position);hats.position.y+=.3;}
      else hats.position.set(f.x,f.y+(state.shot.who===0?2.08:2.42),f.z);
      hats.rotation.y=f.yaw;
      hats.rotation.z=reduced.matches?0:.10*Math.sin(elapsed*4.5);
    }
    showZone(dt);paintFX(dt);
  }
  function endSummary(){
    return state.wins.map((n,i)=>FIGHTERS[i?D.f2:D.f1].short+' '+n).join('  /  ');
  }
  return {portraits,resetMatch,resetRound,advance,steerAI,receive,present,clearPresentation,endSummary,
    packet:()=>state, get best(){return state.best;}, cap:HEAL, small:(i,d)=>{small[i]+=d;}, bestShot, savePhoto};
})();

// Lobby and ringside graphics reuse the playable fighters and the existing bindings.
function dressStudio(){
  const host=$('title'), pick=$('pick'), heading=host.querySelector('h1'), intro=host.querySelector('p');
  const panel=document.createElement('div');panel.className='pf-lobby';host.prepend(panel);
  const mast=document.createElement('div');mast.className='pf-mast';
  mast.innerHTML='<div class="pf-brand"><i class="pf-signal" aria-hidden="true"></i> RINGSIDE<span>TV</span></div>';
  mast.append($('dlang'));panel.append(mast);
  const head=document.createElement('div');head.className='pf-head';
  heading.replaceChildren(document.createTextNode(T('名人','Celebrity ')));
  const strong=document.createElement('em');strong.textContent=T('亂鬥','Brawl');heading.append(strong);
  const edition=document.createElement('div');edition.className='pf-edition';
  const edA=document.createElement('small');edA.textContent=T('特別版','Special edition');
  const edB=document.createElement('b');edB.textContent=T('搶鏡大賽','Photo Finish');
  edition.append(edA,edB);head.append(heading,edition);panel.append(head);
  const deck=document.createElement('div');deck.className='pf-deck';
  const rule=document.createElement('div');rule.className='pf-format';rule.textContent=T('三局兩勝　/　每局 60 秒','BEST OF THREE   /   60 SEC ROUNDS');
  intro.textContent=T('揀一位鬥士開波','Pick a fighter to play');deck.append(intro,rule);panel.append(deck);
  const roster=document.createElement('div');roster.className='pf-roster';
  const subtitles={rocket:T('火鳳凰火箭','Phoenix Rocket'),tariff:T('關稅火牆','Tariff Wall'),chip:T('追蹤晶片風暴','Chip Storm'),tsar:T('熊出沒','Bear Attack'),drone:T('無人機群','Drone Swarm')};
  for(const button of Array.from(pick.querySelectorAll('.fbtn'))){
    const k=button.dataset.f, f=FIGHTERS[k];
    const art=document.createElement('span');art.className='pf-art';
    const figure=document.createElement('img');figure.src=photoShow.portraits[k];figure.alt='';figure.draggable=false;
    const special=document.createElement('span');special.className='pf-move';special.textContent=subtitles[k];
    art.append(figure,special);
    const copy=document.createElement('span');copy.className='pf-fightername';
    const who=document.createElement('b');who.textContent=f.name;
    const arrow=document.createElement('i');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');copy.append(who,arrow);
    button.replaceChildren(art,copy);
    button.setAttribute('aria-label',T('用'+f.name+'開波','Play as '+f.name));
    roster.append(button);
  }
  // Keep the actual fighter buttons inside #pick for the original room logic.
  pick.append(roster);panel.append($('loading'),pick);
  const config=$('dp2').parentElement;config.className='pf-config';
  config.firstChild.textContent=T('對手 ','Opponent ');
  $('dp2').setAttribute('aria-label',T('對手','Opponent'));
  const label=$('d2pl');label.lastChild.textContent=T(' 同機雙人',' Two players, one keyboard');
  const net=$('dnet');
  if(net){
    const rooms=document.createElement('details');rooms.className='pf-rooms';const summary=document.createElement('summary');summary.textContent=T('網上對戰','Online rooms');
    rooms.append(summary,net);pick.append(rooms);rooms.open=Q.get('net')==='1';
  }
  const tip=document.createElement('div');tip.className='pf-lobbytip';
  const icon=document.createElement('i');icon.className='pf-camera';icon.setAttribute('aria-hidden','true');
  const body=document.createElement('span');const lead=document.createElement('b');lead.textContent=T('搶鏡位','Photo Op');
  body.append(lead,document.createTextNode(T('　企定喺金圈入面獨佔鏡頭：回 35 HP，滿血就加絕招。','  Stand alone in the gold ring for a photo: +35 HP, or special energy at full HP.')));
  tip.append(icon,body);panel.append(tip);
  const credit=host.querySelector('.bgm-credit');if(credit)panel.append(credit);
  const bar=document.createElement('div');bar.id='pfControls';
  const commands=isTouch()?[[T('拖左邊','Drag left'),T('移動','Move')],[T('攻','ATK'),T('連按出連招','Tap for combos')]]:
    [['WASD',T('移動','Move')],['J',T('攻擊','Hit')],['K',T('蓄力','Heavy')],['L',T('閃','Dodge')],['I',T('絕招','Special')],['P',T('操作','Controls')]];
  for(const [k,v] of commands){const wrap=document.createElement('span');const key=document.createElement('kbd');key.textContent=k;wrap.append(key,document.createTextNode(' '+v));bar.append(wrap);}
  document.body.append(bar);
  $('pkeys').setAttribute('aria-label',T('操作','Controls'));
  const scores=document.createElement('div');scores.id='pfRound';
  hud.querySelector('.clk').parentElement.prepend(scores);
  for(const [sel,playerNum] of [['.p1','P1'],['.p2','P2']]){
    const col=hud.querySelector(sel);const pic=document.createElement('img');pic.className='pf-headshot';pic.alt='';col.prepend(pic);
    const label=document.createElement('small');label.className='pf-slot';label.textContent=playerNum;col.prepend(label);
  }
  $('mini').setAttribute('aria-label',T('擂台地圖','Arena map'));
  host.classList.add('pf-ready');
}
function setStudioFighters(){
  const a=hud.querySelector('.p1'),b=hud.querySelector('.p2');
  a.querySelector('.pf-headshot').src=photoShow.portraits[D.f1];
  b.querySelector('.pf-headshot').src=photoShow.portraits[D.f2];
  a.dataset.f=D.f1;b.dataset.f=D.f2;
  a.querySelector('.pf-slot').textContent=D.net==='guest'?'P1':D.two?'P1':T('你','YOU');
  b.querySelector('.pf-slot').textContent=D.net==='guest'?T('你','YOU'):D.two?'P2':'CPU';
}
function roundLabel(){
  const round=$('pfRound'), label=T('回合 ','ROUND ')+D.round;
  if(round.textContent!==label)round.textContent=label;
  $('dclk').classList.toggle('pf-lowtime',D.t<=10);
}
function makeResults(win){
  const name=win?D.f1:D.f2;const stats=$('ostats');stats.replaceChildren();
  const strip=document.createElement('div');strip.className='pf-resultstrip';
  const shot=photoShow.bestShot(win?0:1);
  const img=document.createElement('img');img.src=shot?shot.url:photoShow.portraits[name];img.alt='';strip.dataset.f=name;strip.classList.toggle('pf-real',!!shot);
  const body=document.createElement('div');
  const score=document.createElement('strong');score.textContent=D.p1+' — '+D.p2;
  const report=document.createElement('p');
  report.textContent=HEADLINE[win?D.f2:D.f1](FIGHTERS[name].name);
  body.append(score,report);strip.append(img,body);stats.append(strip);
  const tally=document.createElement('div');tally.className='pf-tally';
  tally.textContent=T('搶鏡次數　','Photo Ops   ')+photoShow.endSummary();
  const combo=document.createElement('div');combo.className='pf-tally';
  combo.textContent=T('最長連擊　','Best combo   ')+Math.max(...photoShow.best);
  stats.append(tally,combo);
  const old=$('pfSave');if(old)old.remove();
  if(shot){
    const save=document.createElement('button');save.id='pfSave';save.textContent=T('儲存相片','Save photo');
    save.onclick=()=>photoShow.savePhoto(shot);$('dhome2').before(save);
  }
}

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
  const chipDmg = (who, dmg, fx, fz) => {   // 細傷害：唔硬直、唔擊退；會打死先行正常 dmgTo
    const F = who === 'p2' ? boss : player;
    if (F.hp - dmg <= 0) return dmgTo(who, dmg, fx, fz, false);
    F.hp -= dmg; photoShow.small(who === 'p2' ? 1 : 0, dmg); if (who === 'p2') boss.flash = Math.max(boss.flash || 0, .06);
  };
  const boom = (x, y, z, col, n = 40) => { for (let k = 0; k < n; k++) { const a = Math.random() * TAU, s = rand(3, 12); emit(x, y, z, Math.cos(a) * s, rand(1, 9), Math.sin(a) * s, rand(.3, .8), rand(.8, 1.8), Math.random() < .5 ? col : 0xffffff, 10, 1.5); } ring(x, z, 5, col, 0.5); };

  // ---- 投射物（火箭、晶片） ----
  const PR = [];
  const mkRocket = () => { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 1.3, 10), new THREE.MeshLambertMaterial({ color: 0xf4f4f4 })); body.rotation.x = Math.PI / 2; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 10), new THREE.MeshLambertMaterial({ color: 0xff3b30 })); nose.rotation.x = Math.PI / 2; nose.position.z = .9; g.add(nose);
    for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(.05, .45, .4), new THREE.MeshLambertMaterial({ color: 0xff3b30 })); f.position.z = -.5; f.rotation.z = k / 3 * TAU; f.position.x = Math.sin(k / 3 * TAU) * .3; f.position.y = Math.cos(k / 3 * TAU) * .3; g.add(f); } return g; };
  const mkSpaceRocket = () => {   // SpaceX Falcon 款：白長身 + 黑鼻 + 印 SPACEX + X swoosh
    const g = new THREE.Group();
    const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 1024; const x = cvs.getContext('2d');
    x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, 256, 1024);
    for (const cx of [64, 192]) {   // 兩邊身都印，邊面對鏡頭都睇到
      x.save(); x.translate(cx, 512); x.rotate(-Math.PI / 2);
      x.fillStyle = '#111'; x.font = '900 150px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('SPACEX', 0, 0);
      x.strokeStyle = '#111'; x.lineWidth = 14; x.lineCap = 'round'; x.beginPath(); x.moveTo(140, -75); x.quadraticCurveTo(300, -25, 440, 55); x.stroke();
      x.restore();
    }
    const tex = new THREE.CanvasTexture(cvs); tex.anisotropy = 4;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 2.2, 18), new THREE.MeshLambertMaterial({ map: tex }));
    body.rotation.x = Math.PI / 2; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.3, .7, 18), new THREE.MeshLambertMaterial({ color: 0x16181d })); nose.rotation.x = Math.PI / 2; nose.position.z = 1.45; g.add(nose);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.305, .305, .2, 18), new THREE.MeshLambertMaterial({ color: 0x16181d })); band.rotation.x = Math.PI / 2; band.position.z = 1.02; g.add(band);
    const finGeo = new THREE.CylinderGeometry(.16, .28, .3, 4, 1), finMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(finGeo, finMat); f.scale.set(.22, 1, 1.2); f.position.set(Math.sin(k / 4 * TAU) * .34, Math.cos(k / 4 * TAU) * .34, -1); g.add(f); }
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(.04, .16, .16), finMat); f.position.set(Math.sin(k / 4 * TAU) * .32, Math.cos(k / 4 * TAU) * .32, .85); g.add(f); }
    g.userData.phx = 1; return g;
  };
  const chipTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#c9ccd2'; for (let k = 0; k < 8; k++) { const o = 14 + k * 13.4; g.fillRect(o, 0, 7, 128); g.fillRect(0, o, 128, 7); }   // 四邊針腳
    g.fillStyle = '#17191d'; g.fillRect(12, 12, 104, 104); g.strokeStyle = '#3a3f47'; g.lineWidth = 2; g.strokeRect(13, 13, 102, 102);   // 封裝
    g.fillStyle = '#2c9a3c'; g.fillRect(34, 34, 60, 60); g.strokeStyle = '#7dff8a'; g.lineWidth = 1;   // 晶粒 + 線路
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(34 + k * 10, 34); g.lineTo(34 + k * 10, 94); g.moveTo(34, 34 + k * 10); g.lineTo(94, 34 + k * 10); g.stroke(); }
    g.fillStyle = '#e8eaee'; g.beginPath(); g.arc(24, 24, 4, 0, 7); g.fill();   // pin 1 點
    return new THREE.CanvasTexture(c); })();
  const chipGeo = new THREE.BoxGeometry(.62, .07, .62), chipSide = new THREE.MeshBasicMaterial({ color: 0x8a8f98 }), chipTop = new THREE.MeshBasicMaterial({ map: chipTex });
  const chipMats = [chipSide, chipSide, chipTop, chipTop, chipSide, chipSide];
  const mkChip = () => { const g = new THREE.Group(); const m = new THREE.Mesh(chipGeo, chipMats); m.rotation.x = Math.PI / 2; g.add(m); return g; };   // 面向飛行方向，轉起上嚟見到晶片面
  const droneMat = new THREE.MeshLambertMaterial({ color: 0x23262b }), rotorMat = new THREE.MeshBasicMaterial({ color: 0xe8eef5, transparent: true, opacity: .3, depthWrite: false });
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: .5, depthWrite: false });
  const mkDrone = () => {   // 四軸機 + 落點紅圈（子物件，跟住機身垂直投落地面）
    const g = new THREE.Group(), rot = [];
    const body = new THREE.Mesh(new THREE.BoxGeometry(.42, .16, .6), droneMat); g.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); eye.position.set(0, -.04, .32); g.add(eye);
    for (const [ax, az] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.06, .05, .5), droneMat); arm.position.set(ax * .3, 0, az * .3); arm.rotation.y = ax * az * Math.PI / 4; g.add(arm);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .015, 12), rotorMat); r.position.set(ax * .48, .08, az * .48); g.add(r); rot.push(r);
    }
    const sh = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.7, 28), warnMat); sh.rotation.x = -Math.PI / 2; sh.visible = false; g.add(sh); g.userData.sh = sh;
    g.userData.anim = (t) => { for (const r of rot) r.rotation.y = t * 40; };
    g.scale.setScalar(1.3); return g;
  };
  const mkBear = () => {   // 啡熊（方塊砌）：面向 +Z，四腳跑動
    const g = new THREE.Group(), fur = new THREE.MeshLambertMaterial({ color: 0x4a2e18 }), pale = new THREE.MeshLambertMaterial({ color: 0x8a6a44 }), dark = new THREE.MeshLambertMaterial({ color: 0x1c1410 });
    const add = (geo, mat, x, y, z, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); par.add(m); return m; };
    const torso = new THREE.Group(); g.add(torso);
    add(new THREE.BoxGeometry(1.05, .95, 1.7), fur, 0, 1.05, 0, torso); add(new THREE.BoxGeometry(.9, .5, .8), fur, 0, 1.55, .35, torso);
    add(new THREE.BoxGeometry(.72, .66, .66), fur, 0, 1.3, 1.1, torso); add(new THREE.BoxGeometry(.36, .28, .34), pale, 0, 1.18, 1.52, torso); add(new THREE.BoxGeometry(.14, .1, .08), dark, 0, 1.27, 1.7, torso);
    for (const x of [-.27, .27]) { add(new THREE.BoxGeometry(.2, .2, .1), fur, x, 1.7, 1.02, torso); add(new THREE.BoxGeometry(.08, .08, .04), dark, x * .75, 1.42, 1.44, torso); }
    const legs = [];
    for (const [x, z] of [[-.36, .58], [.36, .58], [-.36, -.58], [.36, -.58]]) { const l = new THREE.Group(); l.position.set(x, .72, z); add(new THREE.BoxGeometry(.32, .78, .36), fur, 0, -.36, 0, l); g.add(l); legs.push(l); }
    g.userData.anim = (t) => { legs.forEach((l, k) => { l.rotation.x = Math.sin(t * 16 + (k === 0 || k === 3 ? 0 : Math.PI)) * .75; }); torso.position.y = Math.abs(Math.sin(t * 16)) * .12; torso.rotation.x = Math.sin(t * 16) * .06; };
    g.scale.setScalar(1.05); return g;
  };
  const MKFX = { rocket: mkRocket, chip: mkChip, drone: mkDrone, bear: mkBear };
  const stepDrone = (o, dt) => {
    const tgt = other(o.who), [tx, tz] = posOf(tgt); o.t += dt;
    if (o.t < o.dive) { const g = o.ph + o.t * 1.6, k = Math.min(1, dt * 5);   // 盤旋跟住對手
      o.x += (tx + Math.sin(g) * 1.8 - o.x) * k; o.z += (tz + Math.cos(g) * 1.8 - o.z) * k; o.y += (4.6 - o.y) * Math.min(1, dt * 4); o.a = Math.atan2(tx - o.x, tz - o.z); o.warn = 0; }
    else if (o.t < o.dive + .3) { const k = Math.min(1, dt * 12); o.x += (tx - o.x) * k; o.z += (tz - o.z) * k; o.warn = 1; }   // 紅圈跟 0.3 秒
    else if (o.t < o.dive + .65) o.warn = 1;                                                                                  // 鎖定 0.35 秒：呢陣走得切
    else { o.y -= 26 * dt;
      if (o.y <= .35) { o.dead = 1; boom(o.x, .4, o.z, 0xff8a30, 22); SND.land(); camShake = Math.max(camShake, .35);
        if (aliveOf(tgt) && Math.hypot(tx - o.x, tz - o.z) < 1.7 + (tgt === 'p2' ? .5 : 0)) dmgTo(tgt, o.dmg, o.x, o.z, false); } }
  };
  const stepBear = (o, dt) => {
    const tgt = other(o.who), [tx, tz] = posOf(tgt), d = Math.hypot(tx - o.x, tz - o.z); o.life -= dt; o.cd -= dt;
    o.a += clamp(angDiff(Math.atan2(tx - o.x, tz - o.z), o.a), -5 * dt, 5 * dt);
    if (d > 2) { o.x = clamp(o.x + Math.sin(o.a) * o.sp * dt, -ARENA, ARENA); o.z = clamp(o.z + Math.cos(o.a) * o.sp * dt, -ARENA, ARENA); }
    if (d < 2.5 + (tgt === 'p2' ? .5 : 0) && o.cd <= 0 && aliveOf(tgt)) { o.cd = .9; dmgTo(tgt, o.dmg, o.x, o.z, false); camShake = Math.max(camShake, .3); for (let k = 0; k < 8; k++) emit(tx, rand(.8, 1.6), tz, rand(-4, 4), rand(1, 5), rand(-4, 4), rand(.2, .4), rand(.5, 1), 0xcfeeff, 8, 1.5); }
    if (o.life <= 0 || !aliveOf(tgt)) { o.dead = 1; for (let k = 0; k < 10; k++) puff(o.x + rand(-.6, .6), rand(.4, 1.6), o.z + rand(-.6, .6), rand(-1.5, 1.5), rand(.3, 1.5), rand(-1.5, 1.5), rand(.6, 1), rand(1, 1.8)); }
  };
  const fxPose = (m, o) => { m.position.set(o.x, o.y, o.z); m.rotation.y = o.a; if (m.userData.anim) m.userData.anim(performance.now() / 1000); const sh = m.userData.sh; if (sh) { sh.visible = !!(o.warn || o.w); sh.position.y = (.05 - o.y) / m.scale.y; } };
  const shoot = (o) => { o.netId = ++netFxId; o.m.position.set(o.x, o.y, o.z); o.m.visible = !(o.delay > 0); scene.add(o.m); PR.push(o); };
  const stepPR = (dt) => {
    for (const o of PR) {
      if (o.kind === 'drone' || o.kind === 'bear') { (o.kind === 'drone' ? stepDrone : stepBear)(o, dt); fxPose(o.m, o); continue; }
      if (o.delay > 0) { o.delay -= dt; if (o.delay <= 0) { o.m.visible = true; SND.swing(false); } continue; }
      const tgt = other(o.who), [tx, tz] = posOf(tgt), want = Math.atan2(tx - o.x, tz - o.z);
      o.a += clamp(angDiff(want, o.a), -o.turn * dt, o.turn * dt);
      o.x += Math.sin(o.a) * o.sp * dt; o.z += Math.cos(o.a) * o.sp * dt; o.life -= dt;
      o.m.position.set(o.x, o.y, o.z); o.m.rotation.y = o.a; if (o.kind === 'chip') { o.m.rotation.z += dt * 7; o.y = o.y0 + Math.sin(o.life * 6 + o.y0 * 9) * .2; }
      if (o.kind === 'rocket') emit(o.x - Math.sin(o.a) * .8, o.y, o.z - Math.cos(o.a) * .8, rand(-2, 2), rand(0, 2), rand(-2, 2), .25, rand(.8, 1.4), Math.random() < .5 ? 0xffa030 : 0xffe080, 0, 2);
      else if (Math.random() < dt * 8) emit(o.x, o.y, o.z, 0, .5, 0, .3, .6, 0x39ff14);
      const d = Math.hypot(tx - o.x, tz - o.z), hitR = o.r + (tgt === 'p2' ? .9 : 0);
      if (d < hitR && aliveOf(tgt)) { o.dead = 1; boom(o.x, o.y, o.z, o.kind === 'rocket' ? 0xff6a30 : 0x39ff14, o.kind === 'rocket' ? 60 : 6); if (o.kind === 'chip') chipDmg(tgt, o.dmg, o.x, o.z); else dmgTo(tgt, o.dmg, o.x, o.z, o.big); camShake = Math.max(camShake, o.big ? .8 : .3); if (o.big) { flash(.4); SND.bigboom(); } else SND.hit(1, false); }
      else if (o.life <= 0 || Math.abs(o.x) > ARENA || Math.abs(o.z) > ARENA) { o.dead = 1; if (o.kind === 'rocket') { boom(o.x, o.y, o.z, 0xff6a30, 30); SND.land(); } }
    }
    for (let i = PR.length - 1; i >= 0; i--) if (PR[i].dead) { scene.remove(PR[i].m); PR.splice(i, 1); }
  };
  const clearPR = () => { for (const o of PR) scene.remove(o.m); PR.length = 0; };

  // ---- 關稅牆 ----
  let W = null;
  const wallTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');   // 紅磚牆
    g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, 512, 256);
    for (let r = 0; r < 8; r++) for (let q = -1; q < 8; q++) { const x = q * 64 + (r % 2 ? 32 : 0), y = r * 32, v = Math.random();
      g.fillStyle = `rgb(${150 + v * 50 | 0},${58 + v * 26 | 0},${40 + v * 18 | 0})`; g.fillRect(x + 2, y + 2, 60, 28);
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 2, y + 2, 60, 4); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 2, y + 26, 60, 4); }
    return new THREE.CanvasTexture(c); })();
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, emissive: 0xff5a14, emissiveMap: wallTex, emissiveIntensity: .24 });
  const wallGeo = new THREE.BoxGeometry(5.6, 3.4, .45);
  const mkWall = () => { const g = new THREE.Group(); for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(wallGeo, wallMat); const a = k * Math.PI / 2; m.position.set(Math.sin(a) * 2.8, 1.7, Math.cos(a) * 2.8); m.rotation.y = a; g.add(m); } return g; };
  const FIRE = [0xff5a14, 0xffa030, 0xffe070];
  const wallFire = (x, z, h, n) => {   // 四幅牆邊同牆頂出火
    for (let i = Math.floor(n + Math.random()); i > 0; i--) { const k = Math.floor(Math.random() * 4), a = k * Math.PI / 2, s = rand(-2.8, 2.8), top = Math.random() < .5;
      emit(x + Math.sin(a) * 2.8 + Math.cos(a) * s, top ? h : rand(.1, h), z + Math.cos(a) * 2.8 - Math.sin(a) * s, rand(-.6, .6), rand(2, 5.5), rand(-.6, .6), rand(.3, .6), rand(1.1, 2.2), FIRE[Math.floor(Math.random() * 3)], -2, 1); }
  };
  const castWall = (who) => { const tgt = other(who), [tx, tz] = posOf(tgt); if (W) scene.remove(W.m);
    W = { who: tgt, by: who, x: tx, z: tz, t: 5, burn: 0, m: mkWall() }; W.m.position.set(tx, 0, tz); W.m.scale.y = 0.01; scene.add(W.m); camShake = Math.max(camShake, .7); SND.land(); SND.bigboom(); flash(.3);
    ring(tx, tz, 4, 0xff6a1a, .6); ring(tx, tz, 6.5, 0xffd060, .8); wallFire(tx, tz, .6, 60);
    if (tgt === 'p2') { boss.st = FRZ; boss.vx = boss.vz = 0; } else { player.st = 'frozen'; player.move = null; player.queued = null; } };
  const stepWall = (dt, pre) => {
    if (!W) return;
    if (pre) {
      W.t -= dt; W.m.scale.y = Math.min(1, W.m.scale.y + dt * 4);
      const burning = W.t > 2;   // 頭 3 秒：火燒，每 0.2 秒 3 傷害（共 45）
      wallMat.emissiveIntensity = burning ? .24 + .14 * Math.sin(W.t * 18) : .08;
      wallFire(W.x, W.z, 3.4 * W.m.scale.y, dt * (burning ? 260 : 50));
      if (burning && aliveOf(W.who)) { W.burn += dt; while (W && W.burn >= .2) { W.burn -= .2; const F0 = W.who === 'p1' ? player : boss; chipDmg(W.who, 3, W.x, W.z); emit(F0.x + rand(-.4, .4), rand(.6, 1.8), F0.z + rand(-.4, .4), 0, rand(2, 4), 0, .35, 1.4, FIRE[1], -2, 1); } }
      if (!W) return;
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
  const PHXST = 24, PHX_R = 10;
  let PHX = null;
  const phxMat = (c, o = .95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mkWarnRing = () => new THREE.Mesh(new THREE.RingGeometry(PHX_R - .55, PHX_R, 44).rotateX(-Math.PI / 2), phxMat(0xff2818, .7));
  const phxFx = [];   // 爆炸後續效果（火球、焦痕），host/guest 共用
  const stepPhxFx = (dt) => {
    for (let i = phxFx.length - 1; i >= 0; i--) {
      const f = phxFx[i]; f.t += dt; const k = Math.min(1, f.t / f.dur);
      if (f.kind === 'ball') { f.m.scale.setScalar(lerp(.5, PHX_R, k)); f.m.material.opacity = .9 * (1 - k); }
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
    const [x, z] = posOf(who), [tx0, tz0] = posOf(other(who)), a = Math.atan2(tx0 - x, tz0 - z);
    const m = mkSpaceRocket(); m.scale.setScalar(2.2); m.position.set(x + Math.sin(a), 1, z + Math.cos(a)); m.rotation.set(-Math.PI / 2, 0, 0); scene.add(m);
    PHX = { who, t: 0, x0: x + Math.sin(a), z0: z + Math.cos(a), tx: tx0, tz: tz0, ring: null, boom: 0, m, rel: 0 };
    camShake = Math.max(camShake, .8); SND.musou();
    if (who === 'p1') { player.st = 'phoenix'; player.t = 0; player.move = null; player.inv = Math.max(player.inv, .5); }
    else { boss.st = PHXST; boss.t = 0; }
    if (D.net === 'host') netSend({ t: 'fx', k: 'phx', who, ph: 0 });
  };
  const stepPhx = (rdt) => {
    stepPhxFx(rdt);
    if (!PHX) return;
    PHX.t += rdt;
    if (!PHX.rel && PHX.t >= .5) {   // 放箭 0.5 秒就放返個施法者；火箭自己飛埋，中咗招都照炸
      PHX.rel = 1;
      if (PHX.who === 'p1') { if (player.st === 'phoenix') player.st = 'idle'; }
      else if (boss.st === PHXST) { boss.st = 0; boss.cd = 1.4; }
    }
    const rm = PHX.m;
    if (PHX.t < 1.4) {   // 上天：慢慢升（1→18m ease-in-out），尾部噴煙
      const k = PHX.t / 1.4, e = k * k * (3 - 2 * k); rm.position.set(PHX.x0, 1 + 17 * e, PHX.z0); rm.rotation.set(-Math.PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) emit(rm.position.x + rand(-.5, .5), rm.position.y - 1.6 + rand(0, .8), rm.position.z + rand(-.5, .5), rand(-1, 1), -rand(2, 5), rand(-1, 1), rand(.3, .6), rand(.8, 1.5), Math.random() < .5 ? 0xff8030 : 0x606060, 6, 0);
    } else if (PHX.t < 2.2) {   // 空中瞄準：轉頭向下，紅圈跟目標，2.2 秒鎖死
      rm.position.set(PHX.x0, 18, PHX.z0);
      const [tx, tz] = posOf(other(PHX.who)); PHX.tx = tx; PHX.tz = tz;
      rm.lookAt(tx, 0, tz);
      if (!PHX.ring) { PHX.ring = mkWarnRing(); scene.add(PHX.ring); }
      PHX.ring.position.set(tx, .12, tz); PHX.ring.material.opacity = .5 + .3 * Math.sin(PHX.t * 30);
    } else if (PHX.t < 2.6) {   // 俯衝：火尾
      const k = (PHX.t - 2.2) / .4;
      rm.position.set(lerp(PHX.x0, PHX.tx, k), 18 * (1 - k), lerp(PHX.z0, PHX.tz, k)); rm.lookAt(PHX.tx, 0, PHX.tz);
      for (let i = 0; i < 6; i++) { const a = Math.random() * TAU; emit(rm.position.x + rand(-.6, .6), rm.position.y + rand(0, 1.5), rm.position.z + rand(-.6, .6), Math.cos(a) * rand(1, 4), rand(1, 4), Math.sin(a) * rand(1, 4), rand(.3, .6), rand(1, 1.8), Math.random() < .6 ? 0xffa030 : 0xff5018, -2, 0); }
    } else {   // 落地爆
      if (rm) { scene.remove(rm); PHX.m = null; }
      if (PHX.ring) { scene.remove(PHX.ring); PHX.ring = null; }
      if (!PHX.boom) {
        PHX.boom = 1; phxBoom(PHX.tx, PHX.tz);
        const [tx, tz] = posOf(other(PHX.who));
        if (Math.hypot(tx - PHX.tx, tz - PHX.tz) < PHX_R && aliveOf(other(PHX.who))) dmgTo(other(PHX.who), PHX.who === 'p1' ? 150 : 130, PHX.tx, PHX.tz, true);
        flash(.7); camShake = 1.6; hitstop = Math.max(hitstop, .2); SND.bigboom();
        if (D.net === 'host') netSend({ t: 'fx', k: 'phx', who: PHX.who, ph: 1, x: +PHX.tx.toFixed(2), z: +PHX.tz.toFixed(2) });
      }
      if (PHX.t > 2.85) PHX = null;   // 埋尾（施法者一早放返咗）
    }
  };
  const clearPhx = () => { if (!PHX) return; if (PHX.ring) scene.remove(PHX.ring); if (PHX.m) scene.remove(PHX.m); if (PHX.who === 'p1' && player.st === 'phoenix') player.st = 'idle'; if (PHX.who === 'p2' && boss.st === PHXST) boss.st = 0; PHX = null; };

  // ---- 放絕招 ----
  D.FIGHTERS = FIGHTERS; D.state = () => ({ pr: PR.length, wall: W && W.who, wallBy: W && W.by, wallT: W && +W.t.toFixed(1), ram: RAM && RAM.who });
  const busy = (who) => !!CN || (RAM && RAM.who === who) || (W && W.by === who) || (PHX && PHX.who === who) || PR.some((o) => o.who === who);
  function specialCard(F, who) {
    const bar=$('banner');
    banner(F.specName, '#fff6dc', true);
    bar.classList.add('pf-special');bar.dataset.f=who==='p1'?D.f1:D.f2;
    const credit=document.createElement('small');credit.textContent=F.name+'   /   '+T('絕招','SPECIAL');bar.prepend(credit);
    if(who==='p1')flash(.16);
  }
  // ===== 絕招特寫：定格 → 鏡頭飛去鬥士面前 → 舉手（Meshy「Chest_Pound_Taunt」）→ 先至出招 =====
  const CINE_CLIP = 'Chest_Pound_Taunt', CINE_SEG = [3.45, 4.15];   // 動作入面由垂手到舉起右手嗰段（秒）
  const cineEl = document.createElement('div'); cineEl.id = 'cine'; document.body.appendChild(cineEl);
  let CN = null, cineCardAt = -1e9;
  const _ch = new THREE.Vector3(), _cq = new THREE.Vector3();
  const rigOf = (who) => who === 'p1' ? (heroRigs[MESH[D.f1]] && heroRigs[MESH[D.f1]].mrig) : (window.__bossRig && window.__bossRig.R);
  const headOf = (who) => { const R = rigOf(who), f = who === 'p1' ? player : boss; if (R && R.bones && R.bones.Head && R.group.visible) R.bones.Head.getWorldPosition(_ch); else _ch.set(f.x, (f.y || 0) + 1.75, f.z); return _ch; };
  const startCine = (who, dur, fire) => {
    const F = who === 'p1' ? F1() : F2(), f = who === 'p1' ? player : boss, [fx, fz] = fwd(f.yaw);
    const h = headOf(who), d0 = camera.position.distanceTo(h); camera.getWorldDirection(_cq);
    const sx = -fz, sz = fx;   // 鏡頭企喺鬥士右手邊：個動作舉右手、上身轉右
    boss.flash = 0;   // 定格嗰陣唔好停喺受擊白閃
    CN = { who, t: 0, dur, fire, sx, sz, hid: null, from: [camera.position.x, camera.position.y, camera.position.z, camera.position.x + _cq.x * d0, camera.position.y + _cq.y * d0, camera.position.z + _cq.z * d0] };
    window.CINE = { who, clip: CINE_CLIP, at: CINE_SEG[0] };
    cineEl.classList.add('on'); document.body.classList.add('cine-on'); SND.sting(); if (F) { specialCard(F, who); cineCardAt = performance.now(); }
    if (D.net === 'host') netSend({ t: 'fx', k: 'cine', who, dur });
  };
  const cineCam = () => {   // 喺 stepCamera 之前叫
    const c = CN, f = c.who === 'p1' ? player : boss, o = c.who === 'p1' ? boss : player, [fx, fz] = fwd(f.yaw), h = headOf(c.who);
    const k = 1 - Math.pow(1 - Math.min(1, c.t / .22), 3), dist = lerp(2.05, 1.75, Math.min(1, c.t / c.dur));
    const dx = fx * .85 + c.sx * .53, dz = fz * .85 + c.sz * .53;
    const to = [h.x + dx * dist, h.y - .25, h.z + dz * dist, h.x, h.y - .16, h.z];
    window.__camOverride = to.map((v, i) => lerp(c.from[i], v, k));
    if (!c.hid && Math.hypot(o.x - to[0], o.z - to[2]) < 2.6) { const R = rigOf(other(c.who)); if (R && R.group.visible) { R.group.visible = false; c.hid = R.group; } }   // 對手太近鏡頭會遮住塊面
    const u = Math.min(1, c.t / (c.dur * .6)); window.CINE.at = lerp(CINE_SEG[0], CINE_SEG[1], u * (2 - u));   // 六成時間舉到最高，之後定住
  };
  const endCine = (fire) => {
    const c = CN; if (!c) return; CN = null; window.CINE = null; cineEl.classList.remove('on'); document.body.classList.remove('cine-on');
    if (c.hid) c.hid.visible = true; window.__camOverride = null;
    if (fire && c.fire) c.fire();
  };
  const cineStep = (rdt) => {   // host／本機：成個遊戲定格，只畫畫面。true = 仲播緊
    const c = CN; c.t += rdt;
    const skip = c.t > .3 && (IN.musou || P2IN.spec);   // 再撳絕招掣 = 跳過
    IN.atk = IN.chg = IN.jump = IN.dodge = IN.musou = 0; P2IN.atk = P2IN.dash = P2IN.dodge = P2IN.spec = 0;
    if (c.t >= c.dur || skip) { endCine(true); return false; }
    cineCam(); stepParticles(rdt * .1); syncVisuals(0, rdt); stepCamera(rdt); writeParticles(); SND.tick(); photoShow.present(rdt);
    return true;
  };
  const cast = (who) => {
    const F = who === 'p1' ? F1() : F2(); if (!F || CN) return;
    startCine(who, who === 'p2' && !D.two && !D.net ? .7 : 1.2, () => castNow(who));   // 電腦出招短啲
  };
  const castNow = (who) => {
    const F = who === 'p1' ? F1() : F2(); if (!F) return;
    const [x, z] = posOf(who), [tx, tz] = posOf(other(who)), a = Math.atan2(tx - x, tz - z);
    if (D.net === 'host') netSend({ t: 'fx', k: 'cast', who });
    switch (F.spec) {
      case 'rocket': castPhx(who); break;
      case 'chips': for (let k = 0; k < 28; k++) {   // 28 塊晶片連環射出，每塊 3 傷害
        const b = a + rand(-1.5, 1.5), y0 = rand(.7, 2.1);
        shoot({ kind: 'chip', who, m: mkChip(), x: x + Math.sin(b) * 1.4, y: y0, y0, z: z + Math.cos(b) * 1.4, a: b, sp: rand(14, 18), turn: 3.8, life: 3, dmg: 3, r: 1.2, big: false, delay: .1 + k * .07 }); } break;
      case 'wall': castWall(who); break;
      case 'drones': for (let k = 0; k < 6; k++) shoot({ kind: 'drone', who, m: mkDrone(), x: x + rand(-.5, .5), y: 1.6, z: z + rand(-.5, .5), a, t: 0, dive: 1 + k * .7, ph: k / 6 * TAU, dmg: 14, warn: 0 }); SND.swing(false); break;
      case 'bear': shoot({ kind: 'bear', who, m: mkBear(), x: x + Math.sin(a) * 2, y: 0, z: z + Math.cos(a) * 2, a, sp: 6.5, life: 5, cd: .25, dmg: 12 }); boom(x + Math.sin(a) * 2, .6, z + Math.cos(a) * 2, 0xcfeeff, 24); SND.land(); break;
      case 'ram': castRam(who); break;
    }
  };
  D.cast = cast; D.cine = () => CN;

  // ===== 同機 2P（#2p=1 或標題剔「雙人同機」）：P2 用方向鍵 + 1/2/3/0（或 , . / Enter）操控對手 =====
  D.two = Q.get('2p') === '1'; D.m2 = 0; D.net = null;   // net: 'host' | 'guest'（網上對戰）
  const P2K = { atk: ['1', ','], dash: ['2', '.'], dodge: ['3', '/'], spec: ['0', 'enter'] };
  const P2IN = { atk: 0, dash: 0, dodge: 0, spec: 0 };

  // ===== 鏡頭縮放（單挑先開）：wheel / = - 鍵 / 右上 ＋－ 掣 =====
  window.CAM_ZOOM = 1; window.CAM_ZOOM_ON = true; window.CAM_LOW = .6;
  let camZoomT = 1;
  const zoomTo = (f) => { camZoomT = clamp(camZoomT * f, .55, 1.8); };
  addEventListener('wheel', (e) => { if (window.CAM_ZOOM_ON && GAME.state === 'play') zoomTo(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (!window.CAM_ZOOM_ON || GAME.state !== 'play') return;
    const k = e.key; if (k === '=' || k === '+') { zoomTo(1 / 1.12); e.preventDefault(); }
    else if (k === '-' || k === '_') { zoomTo(1.12); e.preventDefault(); }
  });
  const dz = document.createElement('div'); dz.id = 'dzoom';
  dz.style.cssText = 'position:fixed;right:14px;top:168px;display:flex;flex-direction:column;gap:6px;z-index:6';
  for (const [t, f, id] of [['＋', 1 / 1.25, 'dzin'], ['－', 1.25, 'dzout']]) {
    const b = document.createElement('button'); b.id = id; b.textContent = t;
    b.style.cssText = 'width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(20,20,30,.55);color:#fff;font-size:18px;font-weight:900;cursor:pointer;touch-action:manipulation';
    b.onclick = () => zoomTo(f); dz.appendChild(b);
  }
  document.body.appendChild(dz);
  // ---- 返回主頁（角色選擇畫面）：對戰中喺縮放掣隔籬；完場畫面喺「再戰」隔籬 ----
  const goHome = (ask) => { if (ask && !confirm(T('返回主頁？', 'Back to the main page?'))) return; try { netDisconnect(); } catch (e) {} location.reload(); };
  { const st = document.createElement('style'); st.textContent = '#dhome{display:none;position:fixed;right:56px;top:168px;z-index:6;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(20,20,30,.55);color:#fff;font-size:17px;cursor:pointer;padding:0;touch-action:manipulation}body.playing #dhome{display:block}'; document.head.appendChild(st);
    const b = document.createElement('button'); b.id = 'dhome'; b.textContent = '🏠'; b.title = T('返回主頁', 'Main page'); b.setAttribute('aria-label', b.title); b.onclick = () => goHome(true); document.body.appendChild(b);
    const o = document.createElement('button'); o.id = 'dhome2'; o.textContent = T('返回主頁', 'MAIN PAGE'); o.onclick = () => goHome(false); $('over').appendChild(o); }
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
    d: { photo: photoShow.packet(), round: D.round, p1: D.p1, p2: D.p2, t: D.t, on: D.on, ending: D.ending, m2: D.m2, m1: player.musou, camShake, hurtFlash, gt: GAME.t, phx: PHX && PHX.m ? { x: +PHX.m.position.x.toFixed(2), y: +PHX.m.position.y.toFixed(2), z: +PHX.m.position.z.toFixed(2), rx: +PHX.m.rotation.x.toFixed(2), ry: +PHX.m.rotation.y.toFixed(2) } : null },
    fx: { pr: PR.map(o => ({ id: o.netId, kind: o.kind, x: o.x, y: o.y, z: o.z, a: o.a, delay: o.delay || 0, w: o.warn ? 1 : 0 })), wall: W && { x: W.x, z: W.z, t: W.t }, ram: RAM && { who: RAM.who, t: RAM.t, x: posOf(RAM.who)[0], z: posOf(RAM.who)[1] } }
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
    ws.onerror = () => { if (NET.ws !== ws) return; if (!NET.retrying && !NET.peer && NET.role) showNetError(T('連線失敗，請檢查網絡後再試。', 'Connection failed. Check your network and try again.')); };
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
      const texts = { taken: T('呢個房間碼已有人用，重新開一個…', 'That room code is taken. Opening a new one…'), noroom: T('搵唔到呢個房間，請檢查房間碼。', 'Room not found. Check the room code.'), full: T('呢個房間已滿。', 'That room is full.'), busy: T('而家房間太多，請遲啲再試。', 'Too many rooms right now. Try again later.'), bad: T('房間資料無效。', 'Invalid room data.') };
      if (m.e === 'taken' && NET.role === 'host') { const code = String(1000 + Math.floor(Math.random() * 9000)); NET.code = code; NET.retrying = true; setNetStatus(texts.taken + T(` 新碼 ${code}`, ` New code ${code}`)); if (NET.ws) NET.ws.close(); setTimeout(() => netSocket('host', code), 150); }
      else { showNetError(texts[m.e] || T('連線失敗，請再試。', 'Connection failed. Try again.')); netDisconnect(); }
    } else if (m.t === 'peer') {
      NET.peer = !!m.on; renderNetUI();
      if (!m.on && NET.role) { if (GAME.state === 'play') showDisconnect(); else setNetStatus(T('對手離開咗房間。', 'Your opponent left the room.')); }
    } else if (m.t === 'hello' && NET.role === 'host') {
      if (m.f in FIGHTERS) { NET.guestF = m.f; renderNetUI(); startNetMatch(); }
    } else if (m.t === 'start' && NET.role === 'guest') {
      if (!(m.f1 in FIGHTERS) || !(m.f2 in FIGHTERS)) return;
      D.net = 'guest'; D.two = true; D.f1 = m.f1; D.f2 = m.f2; NET.hostF = m.f1; NET.guestF = m.f2;
      $('again').disabled = false; $('again').textContent = TX.again;
      GAME.start(m.rig || FIGHTERS[m.f1].rig); setNetStatus(T('網上對戰', 'Online match')); bgStart();
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
      photoShow.receive(m.photo);
      const win = !!m.win; over0(win); setOverText(win);
    } else if (m.t === 'fx' && NET.role === 'guest' && m.k === 'cast') {
      const F = m.who === 'p1' ? F1() : F2(); endCine(false); if (F && performance.now() - cineCardAt > 2500) { specialCard(F,m.who); }
    } else if (m.t === 'fx' && NET.role === 'guest' && m.k === 'cine') {
      endCine(false); if (m.who === 'p1' || m.who === 'p2') startCine(m.who, clamp(Number(m.dur) || 1.2, .3, 2), null);
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
    if (netCode) netCode.textContent = !NET.code ? '' : (NET.role === 'guest' ? T(`已入房間 ${NET.code}`, `In room ${NET.code}`) : T(`房間碼：${NET.code}`, `Room code: ${NET.code}`));
    if (netStatus && NET.role) {
      let s = '';
      if (NET.role === 'host') {
        if (!NET.peer) s = T(`叫朋友喺佢部機撳「入房」，輸入 ${NET.code}。等緊朋友入房…`, `Ask your friend to press "Join room" and enter ${NET.code}. Waiting for your friend…`);
        else if (!NET.hostF && !NET.guestF) s = T('朋友已入房 ✓ 兩邊各自揀一個角色，揀齊就自動開打。', 'Friend joined ✓ Each side picks a fighter. The match starts when both have picked.');
        else if (!NET.hostF) s = T(`朋友揀咗 ${FIGHTERS[NET.guestF].name} ✓ 輪到你揀角色！`, `Friend picked ${FIGHTERS[NET.guestF].name} ✓ Your turn to pick!`);
        else if (!NET.guestF) s = T(`你揀咗 ${FIGHTERS[NET.hostF].name} ✓ 等朋友揀角色…`, `You picked ${FIGHTERS[NET.hostF].name} ✓ Waiting for your friend…`);
        else s = T('開打！', 'Fight!');
      } else if (NET.role === 'guest') {
        if (!NET.peer) s = T('等緊房主…', 'Waiting for the host…');
        else if (!NET.guestF) s = T('已入房 ✓ 揀你嘅角色（揀齊就自動開打）', 'Joined ✓ Pick your fighter (the match starts when both have picked)');
        else if (!NET.hostF) s = T(`你揀咗 ${FIGHTERS[NET.guestF].name} ✓ 等房主揀角色…`, `You picked ${FIGHTERS[NET.guestF].name} ✓ Waiting for the host…`);
        else s = T('開打！', 'Fight!');
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
    const open = document.createElement('button'); open.dataset.netAction = 'host'; open.textContent = T('開房（網上對戰）', 'Open room (online)');
    const join = document.createElement('button'); join.dataset.netAction = 'join'; join.textContent = T('入房', 'Join room');
    const code = document.createElement('input'); code.placeholder = T('4 位房間碼', '4-digit code'); code.setAttribute('aria-label', code.placeholder); code.inputMode = 'numeric'; code.maxLength = 4; code.style.cssText = 'width:90px;padding:7px;border-radius:7px;border:1px solid #c9953b;text-align:center';
    const st = document.createElement('span'); st.id = 'dnetstatus'; st.style.cssText = 'flex-basis:100%;font-size:13px';
    const codeText = document.createElement('div'); codeText.id = 'dnetcode'; codeText.style.cssText = 'flex-basis:100%;font-weight:900;color:#ffe08a';
    const err = document.createElement('div'); err.id = 'dneterr'; err.hidden = true; err.style.cssText = 'flex-basis:100%;color:#ff8a7a;font-size:13px';
    const cancel = document.createElement('button'); cancel.dataset.netAction = 'cancel'; cancel.textContent = T('取消', 'Cancel'); cancel.hidden = true;
    row.append(open, join, code, cancel, codeText, st, err); sel.after(row); netUI = row; netStatus = st; netCode = codeText; netInput = code; netErr = err;
    open.onclick = () => { if (netErr) netErr.hidden = true; D.net = 'host'; D.two = false; d2p.checked = false; const c = String(1000 + Math.floor(Math.random() * 9000)); netSocket('host', c); setNetStatus(T('連線中…', 'Connecting…')); renderNetUI(); };
    join.onclick = () => { const c = code.value.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/\s+/g, '').trim(); code.value = c; if (!/^\d{4}$/.test(c)) { showNetError(T('請輸入 4 位數房間碼。', 'Enter the 4-digit room code.')); return; } if (netErr) netErr.hidden = true; D.net = 'guest'; D.two = true; netSocket('guest', c); setNetStatus(T('連線中…', 'Connecting…')); renderNetUI(); };
    cancel.onclick = () => { netDisconnect(); D.two = d2p.checked; setNetStatus(T('已取消。', 'Cancelled.')); };
    if (Q.get('net') === '1') { row.hidden = false; }
    const again = $('again'); again.onclick = () => { if (NET.role === 'guest') { netSend({ t: 'rematch' }); again.disabled = true; again.textContent = T('等房主重新開始…', 'Waiting for the host to restart…'); } else GAME.start(); };
    pingEl = document.createElement('div'); pingEl.id = 'dnetping'; pingEl.hidden = true; pingEl.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:25;color:#fff3dc;background:#180b08aa;border-radius:8px;padding:3px 9px;font:12px monospace;pointer-events:none'; document.body.appendChild(pingEl);
  }
  function updatePing() { if (pingEl) { pingEl.hidden = !NET.role || GAME.state !== 'play'; pingEl.textContent = `ping ${Math.round(NET.ping)}ms`; } }
  function showDisconnect() {
    if (NET.lost) return;
    NET.lost = document.createElement('div'); NET.lost.id = 'dnetlost'; NET.lost.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#080402eF;color:#fff3dc;font-size:24px;font-weight:900;text-align:center';
    const msg = document.createElement('div'); msg.textContent = T('對手斷咗線', 'Your opponent disconnected'); const btn = document.createElement('button'); btn.textContent = T('返回標題', 'Back to title'); btn.onclick = () => { netDisconnect(); location.reload(); }; NET.lost.append(msg, btn); document.body.appendChild(NET.lost);
  }
  let prevPR = null;
  function applySnapshot(dt) {
    const m = NET.snap; if (!m) return;
    const p = m.p, b = m.b, d = m.d;
    const a = Math.min(1, dt * 14);
    player.x = lerp(player.x, p.x, a); player.y = lerp(player.y, p.y, a); player.z = lerp(player.z, p.z, a); player.yaw += angDiff(p.yaw, player.yaw) * a;
    Object.assign(player, { st: p.st, t: p.tm, runT: p.runT, vy: p.vy, inv: p.inv, hp: p.hp, max: p.max, musou: p.mus, flash: p.flash, kx: p.kx, kz: p.kz, dodgeX: p.dodgeX, dodgeZ: p.dodgeZ, move: p.anim ? { anim: p.anim, dur: p.dur || 0.3, hits: [[(p.dur || 0.3) * 0.5, 0]] } : null });
    boss.x = lerp(boss.x, b.x, a); boss.y = lerp(boss.y, b.y, a); boss.z = lerp(boss.z, b.z, a); boss.yaw += angDiff(b.yaw, boss.yaw) * a;
    Object.assign(boss, { st: b.st, t: b.tm, walkT: b.walkT, vx: b.vx, vz: b.vz, vy: b.vy, hp: b.hp, max: b.max, flash: b.flash, alive: b.alive, spawned: b.spawned, cd: b.cd, poise: b.poise });
    Object.assign(D, { round: d.round, p1: d.p1, p2: d.p2, t: d.t, on: d.on, ending: d.ending, m2: d.m2 }); NET.phxSnap = d.phx || null;
    player.musou = d.m1; camShake = d.camShake || 0; hurtFlash = d.hurtFlash || 0; GAME.t = d.gt || GAME.t;
    photoShow.receive(d.photo);
    NET.effects = m.fx || {};
  }
  function syncNetEffects() {
    const fx = NET.effects || {}, wanted = new Set();
    for (const o of fx.pr || []) {
      if (o.id == null) continue; wanted.add(o.id); let m = NET.fxMeshes.get(o.id);
      if (!m) { m = (MKFX[o.kind] || mkChip)(); NET.fxMeshes.set(o.id, m); scene.add(m); }
      fxPose(m, o); m.visible = !(o.delay > 0);
    }
    for (const [id, m] of NET.fxMeshes) if (!wanted.has(id)) { scene.remove(m); NET.fxMeshes.delete(id); }
    if (fx.wall) { if (!NET.wallMesh) { NET.wallMesh = mkWall(); scene.add(NET.wallMesh); } NET.wallMesh.position.set(fx.wall.x, 0, fx.wall.z); NET.wallMesh.scale.y = Math.min(1, Math.max(.01, (5 - fx.wall.t) * 4)); wallMat.emissiveIntensity = fx.wall.t > 2 ? .24 + .14 * Math.sin(fx.wall.t * 18) : .08; wallFire(fx.wall.x, fx.wall.z, 3.4 * NET.wallMesh.scale.y, fx.wall.t > 2 ? 4 : 1); }
    else if (NET.wallMesh) { scene.remove(NET.wallMesh); NET.wallMesh = null; }
    if (NET.phxSnap) { if (!NET.phxRocket) { NET.phxRocket = mkSpaceRocket(); NET.phxRocket.scale.setScalar(2.2); scene.add(NET.phxRocket); }
      NET.phxRocket.position.set(NET.phxSnap.x, NET.phxSnap.y, NET.phxSnap.z); NET.phxRocket.rotation.set(NET.phxSnap.rx, NET.phxSnap.ry, 0);
      if (NET.phxSnap.y > .5 && Math.random() < .8) emit(NET.phxSnap.x + rand(-.4, .4), NET.phxSnap.y + rand(0, .8), NET.phxSnap.z + rand(-.4, .4), rand(-1, 1), -rand(1, 4), rand(-1, 1), rand(.3, .6), rand(.8, 1.5), Math.random() < .6 ? 0xffa030 : 0xff5018, -2, 0); }
    else if (NET.phxRocket) { scene.remove(NET.phxRocket); NET.phxRocket = null; }
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
    if (CN) { CN.t += rdt; if (CN.t >= CN.dur + .5) endCine(false); else cineCam(); }   // host 出招（'cast'）就完；斷線就自己收
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
    if (NET.lastSnap && Date.now() - NET.lastSnap > 1500) showNetError(T('連線訊號中斷，等候重連…', 'Connection interrupted. Waiting to reconnect…'));
    IN.atk = IN.chg = IN.jump = IN.dodge = IN.musou = 0;
    updatePing();
  }
  function sendSnapshot() { if (D.net === 'host' && NET.peer && GAME.state === 'play' && Date.now() - NET.lastSnap >= 50) { NET.lastSnap = Date.now(); netSend(snapshot()); } }
  setInterval(sendSnapshot, 50);

  const LIGHT = 22, DODGE = 23; let b2inv = 0;
  const sb1 = stepBoss;
  stepBoss = function (dt) {
    if (photoShow.steerAI(dt)) return;
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
        if (!b.hitDone && b.t > 0.16) { b.hitDone = 1; const fist = !!(window.__bossRig && window.__bossRig.fist); if (d < (fist ? 2.6 : 4.6) && Math.abs(angDiff(face, b.yaw)) < 1.5) hurtPlayer(14, b.x, b.z, false);
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
    const mx = (player.x + boss.x) / 2, mz = (player.z + boss.z) / 2, dist = clamp(sep * .55 + 5.5, 8, 20) * (window.CAM_ZOOM || 1), h = (3.2 + sep * .14) * (window.CAM_ZOOM || 1);
    const tg = [mx + nx * dist, h, mz + nz * dist, mx, 1.6 + (player.y + boss.y) * .25, mz];
    if (!camP) camP = tg.slice(); else for (let i = 0; i < 6; i++) camP[i] = lerp(camP[i], tg[i], Math.min(1, rdt * (i < 3 ? 5 : 7)));
    camYaw = Math.atan2(-nx, -nz);
    const sh = camShake * camShake * 0.8; window.__camOverride = [camP[0] + rand(-sh, sh), camP[1] + rand(-sh, sh), camP[2], camP[3], camP[4], camP[5]];
  };
  // ===== Tesla 電擊效：musk 出拳手到電（host/guest 都行 syncVisuals → 都會出） =====
  const BOLTS = [], BOLT_MAX = 16;
  const boltMat = new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const _bv = new THREE.Vector3();
  const fireBolt = (x0, y0, z0, x1, y1, z1, life = .09) => {
    let b = BOLTS.find((o) => !o.visible);
    if (!b && BOLTS.length < BOLT_MAX) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3)); b = new THREE.Line(g, boltMat); b.frustumCulled = false; b.visible = false; BOLTS.push(b); scene.add(b); }
    if (!b || b.visible) return;
    const p = b.geometry.attributes.position.array;
    for (let i = 0; i <= 7; i++) { const k = i / 7, j = i === 0 || i === 7 ? 0 : 1; p[i * 3] = x0 + (x1 - x0) * k + rand(-.28, .28) * j; p[i * 3 + 1] = y0 + (y1 - y0) * k + rand(-.28, .28) * j; p[i * 3 + 2] = z0 + (z1 - z0) * k + rand(-.28, .28) * j; }
    b.geometry.attributes.position.needsUpdate = true; b.visible = true; b.t = 0; b.life = life;
  };
  const elec = { pB: 0, pP: 0 };
  const elecBurst = (x, y, z) => {   // 命中爆出電枝 + 電光環 + 藍閃
    for (let i = 0; i < 4; i++) fireBolt(x, y + 1.1, z, x + rand(-1.8, 1.8), y + rand(-.2, 1.8), z + rand(-1.8, 1.8), rand(.1, .16));
    ring(x, z, 2.4, 0x9fe8ff, .45);
    for (let k = 0; k < 10; k++) emit(x, y + 1, z, rand(-5, 5), rand(0, 7), rand(-5, 5), rand(.15, .3), rand(.6, 1.1), 0x9fe8ff, 8, 2);
  };
  // ---- 煙（晶片教主）：粒子系統係加色發光，煙要用普通混色嘅 sprite ----
  const SMOKE = [], SMOKE_MAX = 48;
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(235,238,242,.9)'); gr.addColorStop(.55, 'rgba(170,176,184,.45)'); gr.addColorStop(1, 'rgba(120,126,134,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puff = (x, y, z, vx, vy, vz, life, size) => {
    let s = SMOKE.find((o) => !o.visible);
    if (!s && SMOKE.length < SMOKE_MAX) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, fog: false })); s.visible = false; SMOKE.push(s); scene.add(s); }
    if (!s || s.visible) return;
    s.position.set(x, y, z); s.v = [vx, vy, vz]; s.t = 0; s.life = life; s.s0 = size; s.scale.setScalar(size); s.material.opacity = .8; s.material.rotation = rand(0, 6.28); s.visible = true;
  };
  const smokeBurst = (x, y, z) => { for (let k = 0; k < 9; k++) puff(x + rand(-.3, .3), y + rand(.7, 1.5), z + rand(-.3, .3), rand(-2.2, 2.2), rand(.3, 1.8), rand(-2.2, 2.2), rand(.6, 1), rand(.9, 1.5)); ring(x, z, 2.2, 0xc8ccd2, .4); };
  const fireBurst = (x, y, z) => {
    for (let k = 0; k < 16; k++) emit(x + rand(-.3, .3), y + rand(.7, 1.5), z + rand(-.3, .3), rand(-4, 4), rand(1, 7), rand(-4, 4), rand(.25, .5), rand(1, 1.9), FIRE[Math.floor(Math.random() * 3)], -1, 2);
    ring(x, z, 2.4, 0xff6a1a, .45);
  };
  const frostBurst = (x, y, z) => { for (let k = 0; k < 14; k++) emit(x + rand(-.3, .3), y + rand(.7, 1.5), z + rand(-.3, .3), rand(-4, 4), rand(1, 6), rand(-4, 4), rand(.3, .6), rand(.6, 1.3), Math.random() < .5 ? 0xcfeeff : 0xffffff, 9, 1.5); ring(x, z, 2.3, 0x9fd8ff, .45); };
  const sparkBurst = (x, y, z) => { for (let k = 0; k < 14; k++) emit(x + rand(-.2, .2), y + rand(.8, 1.5), z + rand(-.2, .2), rand(-7, 7), rand(0, 6), rand(-7, 7), rand(.12, .28), rand(.4, .8), Math.random() < .6 ? 0x58a8ff : 0xdff0ff, 8, 2); ring(x, z, 2, 0x58a8ff, .35); };
  const PUNCH = { rocket: 'elec', tariff: 'fire', chip: 'smoke', tsar: 'frost', drone: 'spark' }, BURST = { elec: elecBurst, fire: fireBurst, smoke: smokeBurst, frost: frostBurst, spark: sparkBurst };
  const handFx = (R, fx, rdt) => {
    if (!R || !R.bones || !R.bones.RightHand) return;
    for (const h of [R.bones.RightHand, R.bones.LeftHand]) {
      h.getWorldPosition(_bv);
      if (fx === 'elec') {
        if (Math.random() < rdt * 28) fireBolt(_bv.x, _bv.y, _bv.z, _bv.x + rand(-1, 1), _bv.y + rand(-.4, 1), _bv.z + rand(-1, 1), rand(.06, .12));
        if (Math.random() < rdt * 18) emit(_bv.x, _bv.y, _bv.z, rand(-3, 3), rand(0, 4), rand(-3, 3), rand(.15, .3), rand(.4, .8), 0x9fe8ff, 6, 2);
      } else if (fx === 'fire') {
        if (Math.random() < rdt * 70) emit(_bv.x + rand(-.1, .1), _bv.y + rand(-.1, .1), _bv.z + rand(-.1, .1), rand(-1, 1), rand(1, 3.5), rand(-1, 1), rand(.2, .4), rand(.8, 1.5), FIRE[Math.floor(Math.random() * 3)], -1, 1.5);
      } else if (fx === 'frost') {
        if (Math.random() < rdt * 45) emit(_bv.x + rand(-.12, .12), _bv.y + rand(-.1, .1), _bv.z + rand(-.12, .12), rand(-.8, .8), rand(-.5, 1), rand(-.8, .8), rand(.3, .55), rand(.4, .9), Math.random() < .5 ? 0xcfeeff : 0xffffff, 3, 1.5);
      } else if (fx === 'spark') {
        if (Math.random() < rdt * 40) emit(_bv.x, _bv.y, _bv.z, rand(-5, 5), rand(-1, 4), rand(-5, 5), rand(.1, .2), rand(.3, .6), Math.random() < .6 ? 0x58a8ff : 0xdff0ff, 6, 2);
      } else if (Math.random() < rdt * 26) puff(_bv.x, _bv.y, _bv.z, rand(-.6, .6), rand(.3, 1.1), rand(-.6, .6), rand(.5, .9), rand(.5, .9));
    }
  };
  window.__elec = { cnt: () => BOLTS.filter((b) => b.visible).length, burst: elecBurst, smoke: () => SMOKE.filter((s) => s.visible).length };
  const stepElec = (rdt) => {
    for (const b of BOLTS) { if (b.visible) { b.t += rdt; if (b.t >= b.life) b.visible = false; } }
    for (const s of SMOKE) { if (s.visible) { s.t += rdt; const k = s.t / s.life; if (k >= 1) { s.visible = false; continue; }
      s.position.x += s.v[0] * rdt; s.position.y += s.v[1] * rdt; s.position.z += s.v[2] * rdt; s.v[0] *= 1 - 1.5 * rdt; s.v[2] *= 1 - 1.5 * rdt; s.scale.setScalar(s.s0 * (1 + 1.6 * k)); s.material.opacity = .8 * (1 - k); } }
    if (GAME.state !== 'play' || !window.MCLIPS_FIST) { elec.pB = boss.hp; elec.pP = player.hp; return; }
    const fx1 = window.HERO_MOVES === 'fist' && PUNCH[D.f1], fx2 = window.__bossRig && window.__bossRig.fist && PUNCH[D.f2];
    const a1 = fx1 && (player.st === 'attack' || player.st === 'charge');
    const a2 = fx2 && boss.alive && [1, 2, 3, 6, 8, 9, 22].includes(boss.st);
    if (a1) handFx(heroRigs[MESH[D.f1]] && heroRigs[MESH[D.f1]].mrig, fx1, rdt);
    if (a2) handFx(window.__bossRig.R, fx2, rdt);
    if (a1 && boss.hp < elec.pB) { BURST[fx1](boss.x, boss.y, boss.z); charSnd(fx1); }
    if (a2 && player.hp < elec.pP) { BURST[fx2](player.x, player.y, player.z); charSnd(fx2); }
    elec.pB = boss.hp; elec.pP = player.hp;
  };
  const svE = syncVisuals;
  syncVisuals = function (dt, rdt) { svE(dt, rdt); stepElec(rdt); stageTick(); };
  D.p2in = P2IN;

  // 冇雜兵：唔再生兵，開波時清場
  stepSpawns = function () {};
  const clearCrowd = () => { for (let i = 0; i < NMAX; i++) S.alive[i] = 0; };

  const resetRound = () => {
    clearCrowd();
    endCine(false); clearPR(); clearWall(); clearRam(); clearPhx(); D.aiCd = F2() && F2().spec === 'rocket' ? rand(12, 15) : rand(3.5, 5); D.specBuf = 0; D.m2 = 0; camP = camN = null; window.__camOverride = null;
    if (D.net === 'host') { for (const k in NET.queue) NET.queue[k] = 0; NET.mv = null; NET.mvAt = 0; }
    Object.assign(player, { x: 0, z: 7, y: 0, vy: 0, yaw: Math.PI, hp: player.max, musou: 0, st: 'idle', t: 0, move: null, inv: 1 });
    const rivalHP = D.two ? F2().hp : OPP_HP;
    Object.assign(boss, { alive: true, spawned: true, hp: rivalHP, max: rivalHP, st: 0, t: 0, cd: 1.2, x: 0, z: -7, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0, poise: 60, dashHit: 0 });
    bossG.visible = true; $('boss').hidden = true; D.lastBossHp = boss.hp; D.lastPHp = player.hp;
    D.t = ROUND_T; D.ending = 0; D.on = true;
    b2inv = 0; photoShow.resetRound(); roundLabel();
    say(T(`第 ${D.round} 回合`, `ROUND ${D.round}`));
  };

  const start0 = GAME.start.bind(GAME);
  GAME.start = function (c) {
    photoShow.resetMatch();
    if (D.net === 'guest') { NET.snap = null; NET.effects = {}; NET.lastSnap = 0; }
    if (!D.f2) { const rest = Object.keys(FIGHTERS).filter((k) => k !== D.f1); D.f2 = rest[Math.floor(Math.random() * rest.length)]; }
    start0(c || F1().rig);
    player.max = F1().hp; player.hp = player.max;
    hero.scale.setScalar(1.12 * F1().scale); bossG.scale.setScalar(1.3 * F2().scale);
    applyRigs();
    D.round = 1; D.p1 = D.p2 = 0;
    const nm = (F) => EN && isTouch() ? F.short : F.name; $('dn1').textContent = nm(F1()); $('dn2').textContent = nm(F2()); $('face').textContent = F1().short;
    setStudioFighters();
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
    say(by === 'time' ? T('時間到', 'TIME UP') : (D.two || w === 'p1' ? 'K.O.' : T('敗北', 'YOU LOSE')), done ? 1600 : 1300);
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
    photoShow.clearPresentation();
    const Wn = win ? F1() : F2();
    $('otitle').textContent = T(`${Wn.name} 勝出`, `${Wn.name} WINS`);
    makeResults(win);
  };
  const finish = (win) => {
    endCine(false); over0(win); clearPR(); clearWall(); clearRam(); clearPhx(); window.__camOverride = null;
    setOverText(win);
    if (D.net === 'host') netSend({ t: 'over', win: win ? 1 : 0, p1: D.p1, p2: D.p2, photo: photoShow.packet() });
  };
  const step0 = GAME.step.bind(GAME);
  GAME.step = function (rdt) {
    if (!bgStepping) lastRafStep = performance.now();
    if (D.net === 'guest' && GAME.state !== 'title') {
      if (GAME.state === 'play') { guestTick(rdt); roundLabel(); photoShow.present(rdt); }
      return;
    }
    if (CN) { if (GAME.state !== 'play') endCine(false); else if (cineStep(rdt)) return; }
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
    CAM_ZOOM += (camZoomT - CAM_ZOOM) * Math.min(1, rdt * 6);
    if (GAME.state === 'play') { stepWall(rdt, true); stepRam(rdt, true); stepPhx(rdt); if (D.two || D.net) cam2p(rdt); }
    step0(rdt);
    if (GAME.state === 'play') {
      stepPR(rdt);
      // 1v1 冇雜兵，絕招氣要快啲：打到對手即加，再加少少時間
      const dealt = D.lastBossHp - boss.hp; D.lastBossHp = boss.hp;
      if (live && !guest) player.musou = Math.min(100, player.musou + (Math.max(0, dealt) * .8 + rdt * 3) * ((F1() && F1().mGain) || 1));
      const dealt2 = D.lastPHp - player.hp; D.lastPHp = player.hp;
      if (live && !guest && D.two) D.m2 = Math.min(100, D.m2 + (Math.max(0, dealt2) * .8 + rdt * 3) * ((F2() && F2().mGain) || 1));
      // AI 絕招
      if (live && !guest && !D.two && boss.alive && boss.st === 0 && !busy('p2')) {
        D.aiCd -= rdt;
        if (D.aiCd <= 0) { const d = Math.hypot(player.x - boss.x, player.z - boss.z), sp = F2().spec;
          if ((sp === 'rocket' && d < 16) || sp === 'chips' || (sp === 'wall' && d < 11) || (sp === 'ram' && d > 5) || sp === 'drones' || sp === 'bear') { cast('p2'); D.aiCd = sp === 'rocket' ? rand(16, 22) : rand(7, 10); } }
      }
    }
    if (GAME.state === 'play') { photoShow.advance(rdt); roundLabel(); }
    photoShow.present(rdt);
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
  if (t) { const h = t.querySelector('h1'); if (h) h.textContent = T('名人亂鬥', 'CELEBRITY BRAWL'); document.title = T('名人亂鬥', 'Celebrity Brawl'); const p = t.querySelector('p'); if (p) p.textContent = T('揀你嘅鬥士，一對一，三局兩勝，每局 60 秒。氣滿撳「絕招」。', 'Pick your fighter. One on one, best of 3 rounds, 60 seconds each. Press SPECIAL when the bar is full.'); }
  try { TX.goal = T('目標：三局兩勝，每局 60 秒。打到對手氣就滿，撳 I／C 放絕招！', 'GOAL: win 2 of 3 rounds, 60 seconds each. Hitting fills your bar. Press I or C for your SPECIAL!'); TX.bossDown = 'K.O.!'; TX.keys = TX.keys.map(([k, v]) => [k, v.replace('龍怒', '絕招').replace(/dragon rage/i, 'Special')]); TX.keys.push(['↑ ↓ ← →', T('P2 移動（雙人同機）', 'P2 move (two players, one keyboard)')], ['1 / 2 / 3 / 0', T('P2 攻擊／突進／閃避／絕招', 'P2 attack / dash / dodge / special')]); if (TX.keysTouch) TX.keysTouch = TX.keysTouch.map(([k, v]) => [k.replace('龍怒', '絕招').replace('RAGE', 'SPECIAL'), v]); if (isTouch()) TX.goal = T('目標：三局兩勝，每局 60 秒。打到對手氣就滿，撳「絕招」掣！', 'GOAL: win 2 of 3 rounds, 60 seconds each. Hitting fills your bar. Tap SPECIAL when it is full!'); } catch (e) {}
  const bm = $('bM'); if (bm) bm.textContent = T('絕招', 'SPECIAL');
  const lbls = document.querySelectorAll('#me .lbl'); if (lbls[1]) lbls[1].textContent = T('絕招', 'SPECIAL');
  // 揀角：用 4 個名人掣取代趙雲／關羽掣（模型暫用趙雲／關羽頂住，等 Meshy 角色到）
  const pick = $('pick'), s0 = $('start'), sg = $('startGY');
  if (pick && s0 && sg) {
    s0.hidden = sg.hidden = true;
    const sel = document.createElement('div'); sel.style.cssText = 'flex-basis:100%;font-size:14px;opacity:.85;margin-bottom:4px';
    sel.innerHTML = `${T('對手：', 'Opponent: ')}<select id="dp2" style="font:inherit;padding:4px 8px;border-radius:6px"><option value="">${T('隨機', 'Random')}</option>${Object.entries(FIGHTERS).map(([k, f]) => `<option value="${k}">${f.name}</option>`).join('')}</select>
      &nbsp; <label id="d2pl" style="cursor:pointer"><input type="checkbox" id="d2p"${D.two ? ' checked' : ''}> ${T('雙人同機（P2 方向鍵 + 1/2/3/0）', '2 players, one keyboard (P2: arrows + 1/2/3/0)')}</label>`;
    const lb = document.createElement('button'); lb.id = 'dlang'; lb.type = 'button'; lb.textContent = T('English', '中文'); $('title').appendChild(lb);
    lb.onclick = () => { const u = new URL(location.href), h = new URLSearchParams(u.hash.slice(1)); u.searchParams.delete('lang'); h.set('lang', EN ? 'zh' : 'en'); u.hash = h.toString(); history.replaceState(null, '', u.href); location.reload(); };
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
    const sync = () => { for (const b of pick.querySelectorAll('.fbtn')) { b.disabled = FIGHTERS[b.dataset.f].rig === 'gy' && sg.disabled || (b.dataset.f === 'rocket' && !(window.MRIG && window.MRIG.musk)) || (NET.role && !NET.peer); b.title = b.disabled ? T('載入中…', 'Loading…') : ''; } if (sg.disabled || (NET.role && !NET.peer)) setTimeout(sync, 200); };
    pick.addEventListener('muskloaded', sync);
    sync();
    // ===== 網上對戰 UI（只喺非 GitHub Pages host 或 #net=1 先顯示） =====
    initNetUI(sel, d2p, dp2);
    dressStudio();
  }
  document.documentElement.classList.remove('qwait');
})();
