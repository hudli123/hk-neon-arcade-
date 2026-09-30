// ============ v43 時空裂縫（BG 2026-09-30：趙雲無雙搬入城市 → 時空旅人）：BRAWL engine 入面行嘅部分 ============
// 用到先載（同 hkcity.html 放埋一齊）。timerift.js 載入後叫 BRAWL.api.inject(window.RIFT_EXT)（make_storm.py 嘅 inject = 喺
// BRAWL.create() 入面 eval）→ 呢個 function 直接睇到 / 改到 engine 嘅 player、boss、CHARS、S、stepBoss、hurtPlayer …（唔使改 make_storm.py）。
// 內容：① 趙雲 / 關羽：Meshy 骨架 + 程式龍膽槍 / 青龍刀，招式 = engine 原本 Dragon Spear 招式（N / CH，關羽 N_GY / CH_GY），無雙 = 龍
//       ② 魏兵 / 魏軍隊長：每個姿勢 CPU skin 一次 → InstancedMesh（同 zhaoyun mcrowd.js）；隊長 45 % 用旋風斬
//       ③ 張郃：橫掃、突進、三連斬、飛身劈地、朱雀（火圈 + 俯衝），血跌穿 70 % / 35 % 一定放朱雀（zhaoyun boss_ext.js）
//       ④ 呂布：方天畫戟橫掃（跳得過）、衝鋒、三連、天下無雙震波（半血）、擒拿：紅光 + 地上紅圈 1 秒（閃避 / 走出圈 / 跳就避到）→
//          中咗：串起、舉高、20 連斬（鏡頭拉近、1→20 計數、最後一斬大 hit-stop）；狂撳攻擊 / 閃避（手機撳掣或者㩒螢幕）掙脫，
//          20 斬之前唔會打死你（最後一斬先可以），掙脫越早傷越少
// 淨係 RX.on（時空裂縫任務）先改 engine 行為；紳士風暴、隨街打交照舊（趙雲 / 關羽做主角時一樣用得）。
window.RIFT_EXT = function () {
  'use strict';
  const RX = { on: false, grabs: [], log: [], dmg: {} };
  const RF = window.RIFT, AX0 = new THREE.Vector3(-0.645, 0.713, 0.277).normalize(), ZV = new THREE.Vector3(0, 0, 1);
  const lin = (t, t0, t1, a, c) => a + (c - a) * clamp((t - t0) / (t1 - t0), 0, 1);
  const noH = { pose() {}, each() {}, setFace() {} };
  const _hq = new THREE.Quaternion(), _gq = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qc = new THREE.Quaternion(),
    _p = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
  function driver(R, hipY) {   // Meshy 動作切換（0.12 秒淡入淡出），同 zhaoyun mrig_ctl.js
    let cur = null, prev = null, prevW = 0;
    const D = { R, loopT: 0,
      use(name) { const a = R.actions[name]; if (cur !== a) { if (prev) prev.stop(); prev = cur; prevW = prev ? 1 : 0; cur = a; cur.reset(); cur.play(); D.loopT = 0; } return a; },
      at(a, t) { a.time = clamp(t, 0, a.getClip().duration); },
      loop(name, rdt, k = 1) { const a = D.use(name); D.loopT += rdt * k; D.at(a, D.loopT % a.getClip().duration); return a; },
      end(rdt, lockY) {
        prevW = Math.max(0, prevW - rdt / 0.12);
        if (prev) { prev.setEffectiveWeight(prevW); if (prevW <= 0) { prev.stop(); prev = null; } }
        cur.setEffectiveWeight(1 - (prev ? prevW : 0)); R.mixer.update(0); if (lockY) R.bones.Hips.position.y = hipY;
      } };
    return D;
  }
  function palm(R, k, space, out, dirOut) {   // 右手掌心（space 座標）+ 手骨軸方向
    const hand = R.bones.RightHand; hand.getWorldQuaternion(_hq); hand.getWorldPosition(out);
    _f.set(0, 1, 0).applyQuaternion(_hq); out.addScaledVector(_f, 0.07 * k); space.worldToLocal(out);
    space.getWorldQuaternion(_gq); _gq.invert(); dirOut.copy(R.axis).applyQuaternion(_hq).applyQuaternion(_gq);
  }
  const _wq = new THREE.Quaternion(), _wp = new THREE.Vector3(), _ax = new THREE.Vector3(), _vv = new THREE.Vector3(), _rq = new THREE.Quaternion();
  function faceCam(o, nx) {   // 扁刀身（青龍刀 / 方天畫戟月牙）：沿柄轉，令刀面向鏡頭（唔係側睇得返條線）；nx = 刀面法線係本地 x（否則 y）
    o.updateMatrixWorld(true); o.getWorldQuaternion(_wq); o.getWorldPosition(_wp);
    _d.set(0, 0, 1).applyQuaternion(_wq); _ax.set(nx ? 1 : 0, nx ? 0 : 1, 0).applyQuaternion(_wq);
    _vv.subVectors(_wp, camera.position); _vv.addScaledVector(_d, -_vv.dot(_d)); if (_vv.lengthSq() < 1e-6) return; _vv.normalize();
    let a = Math.atan2(_f.crossVectors(_ax, _vv).dot(_d), _ax.dot(_vv)); if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;   // 刀面兩邊都得：轉最少
    o.quaternion.multiply(_rq.setFromAxisAngle(ZV, a)); o.updateMatrixWorld(true);
  }
  const glowS = (col, s, z, parent, op = 0.8) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); sp.scale.set(s, s, 1); sp.position.z = z; parent.add(sp); return sp; };
  function warm(obj) {   // 第一次出場唔好卡：而家 compile shader + 1 像素畫一次（上載 buffer / 貼圖），同 hero_pick.js warm()
    const tmp = new THREE.Scene(), par = obj.parent, vis = obj.visible; tmp.fog = scene.fog;
    scene.traverseVisible((o) => { if (o.isLight) tmp.add(o.clone()); }); tmp.add(heroLight.clone());
    tmp.add(obj); obj.visible = true;
    try { renderer.compile(tmp, camera); const sc = new THREE.Vector4(), st = renderer.getScissorTest(); renderer.getScissor(sc);
      renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.render(tmp, camera); renderer.setScissor(sc); renderer.setScissorTest(st); } catch (e) { console.warn('rift warm', e.message); }
    if (par) par.add(obj); obj.visible = vis;
  }

  // ================= ① 趙雲 / 關羽（主角）=================
  const H3 = {
    zyun: { rig: 'zy', h: 2.0, col: 0x8fd0ff, speed: 8.5, hp: 400, face: '趙雲', mus: '龍膽・無雙', reach: 0.6, wpn: 'spear', glow: 0x9fd4ff },
    gy: { rig: 'guanyu', h: 2.1, col: 0x7dffb0, speed: 8.0, hp: 440, face: '關羽', mus: '青龍・無雙', reach: 0.8, wpn: 'glaive', glow: 0xe8f4ff },
  };
  const HCLIPS = ['Combat_Stance', 'Run_02', 'Basic_Jump', 'Dead', 'victory', 'Sword_Shout', 'Roll_Dodge', 'Hit_Reaction', 'Thrust_Slash', 'Left_Slash', 'Right_Hand_Sword_Slash',
    'Triple_Combo_Attack', 'Reaping_Swing', 'Double_Blade_Spin', 'Charged_Upward_Slash', 'Charged_Slash', '360_Power_Spin_Jump', 'Charged_Ground_Slam', 'Heavy_Hammer_Swing'];
  const SEG = { thrust: ['Thrust_Slash', 0.4, 0.73, 1.05], swingL: ['Left_Slash', 0.45, 0.77, 1.05], swingR: ['Right_Hand_Sword_Slash', 0.25, 0.53, 0.85],
    thrust2: ['Triple_Combo_Attack', 0.45, 0.73, 1.5, 1.75], swingWide: ['Reaping_Swing', 2.95, 3.3, 3.75], spin: ['Double_Blade_Spin', 0.4, 0.83, 1.23, 1.53, 1.95],
    upswing: ['Charged_Upward_Slash', 0.5, 1.03, 1.45], upthrust: ['Charged_Slash', 0.6, 1.17, 1.5], rise: ['360_Power_Spin_Jump', 0.4, 0.93, 1.2, 1.57, 1.95],
    slam: ['Charged_Ground_Slam', 0.6, 1.63, 2.1], chop: ['Heavy_Hammer_Swing', 0.8, 1.53, 1.8] };
  const LOOP = { flurry: ['Triple_Combo_Attack', 0.55, 0.95, 3], tornado: ['Double_Blade_Spin', 0.6, 1.6, 1.4] };
  const LOCKY = { Basic_Jump: 1, '360_Power_Spin_Jump': 1, Charged_Ground_Slam: 1 };
  const CARRY = { idle: new THREE.Vector3(-0.15, 0.45, 0.88).normalize(), run: new THREE.Vector3(0.2, -0.28, -0.94).normalize() };   // 企 = 槍尖向前向上；跑 = 拖槍
  const HELP0 = $('help').textContent, TX0 = { face: TX.face, faceG: TX.faceG, musou: TX.musou, musouG: TX.musouG, win: TX.win, lose: TX.lose };
  function segTime(seg, m, k) {
    const pts = seg.slice(1), hits = m.hits.map((h) => h[0]), n = pts.length - 2;
    const mk = hits.length === n ? [0, ...hits, m.dur] : [0, hits[0], m.dur], ck = hits.length === n ? pts : [pts[0], pts[1], pts[pts.length - 1]];
    for (let i = 0; i < mk.length - 1; i++) if (k <= mk[i + 1] || i === mk.length - 2) return ck[i] + (ck[i + 1] - ck[i]) * clamp((k - mk[i]) / Math.max(1e-4, mk[i + 1] - mk[i]), 0, 1);
  }
  function make3K(c, tex) {
    const D = H3[c], M = window.MRIG; if (!M || !M[D.rig] || !window.MCLIPS || !RF) return false;
    let C = CHARS[c];
    if (c === 'gy') { GUAN.each((m) => { m.visible = false; }); glaiveInner.children.forEach((o) => { o.visible = false; }); C.H = noH; }   // 程式關羽 / 舊刀收埋
    else { const g = new THREE.Group(), w = new THREE.Group(), wi = new THREE.Group(); g.visible = false; heroBody.add(g); g.add(w); w.add(wi); C = CHARS[c] = { H: noH, g, w, wi }; }
    const wg = RF.weapon(D.wpn); C.wi.add(wg); glowS(D.glow, 1.1, wg.userData.tip - 0.1, C.wi, 0.7);
    Object.assign(C, { tip: wg.userData.tip, col: D.col, speed: D.speed, hp: D.hp, k3: 1 });
    const R = buildMeshyRig(M[D.rig], window.MCLIPS, HCLIPS), hipY = M[D.rig].bones[0].t[1];
    R.group.scale.setScalar(D.h / (M[D.rig].bones[0].hl[1] * M[D.rig].rs / 0.52) / hero.scale.x); C.g.add(R.group);
    R.axis = R.handAxis(AX0); R.mesh.material.color.setHex(0xb4b4b4);   // 同女特工：跟身 heroLight 會令淺色爆白
    if (tex) { const t0 = R.mesh.material.map; R.mesh.material.map = tex; R.mesh.material.needsUpdate = true; t0.dispose(); }
    const dr = driver(R, hipY), carryDir = CARRY.idle.clone(); let carryW = 1;
    C.rigUpdate = (rdt) => {
      const p = player, m = p.move, over = GAME.state === 'over';
      heroBody.rotation.x = 0; heroBody.position.y = 0;
      let a, mode = 'hand';
      if (over && p.hp <= 0) { a = dr.use('Dead'); dr.loopT += rdt; dr.at(a, Math.min(dr.loopT, 2.9)); }
      else if (over) a = dr.loop('victory', rdt);
      else if ((p.st === 'attack' || p.st === 'charge') && m && LOOP[m.anim]) { const [nm, t0, t1, hz] = LOOP[m.anim]; a = dr.use(nm); dr.loopT += rdt * hz; dr.at(a, t0 + (t1 - t0) * (dr.loopT % 1)); }
      else if ((p.st === 'attack' || p.st === 'charge') && m) { const sg = SEG[m.anim] || SEG.thrust; a = dr.use(sg[0]); dr.at(a, segTime(sg, m, p.t)); }
      else if (p.st === 'musou') { if (p.t < 0.5) { a = dr.use('Sword_Shout'); dr.at(a, 0.8 + p.t * 0.9); } else { a = dr.use('Double_Blade_Spin'); dr.loopT += rdt * 1.5; dr.at(a, 0.6 + (dr.loopT % 1)); } }
      else if (p.st === 'dive') { a = dr.use('Heavy_Hammer_Swing'); dr.at(a, 1.25 + Math.min(1, p.t / 0.3) * 0.28); }
      else if (p.st === 'dodge') { a = dr.use('Roll_Dodge'); dr.at(a, 0.1 + Math.min(1, p.t / 0.42) * 1.2); }
      else if (p.st === 'hurt') { a = dr.use('Hit_Reaction'); dr.at(a, Math.min(1, p.t / 0.45) * 0.8); }
      else if (p.y > 0.25) { a = dr.use('Basic_Jump'); dr.at(a, 1.75 + clamp(0.5 - p.vy / 24, 0, 1) * 0.7); }
      else if (p.st === 'run') { a = dr.loop('Run_02', rdt, ACT.speed / 8.5); mode = 'run'; }
      else { a = dr.loop('Combat_Stance', rdt); mode = 'idle'; }
      dr.end(rdt, LOCKY[a.getClip().name]);
      heroBody.updateMatrixWorld(true);
      palm(R, R.group.scale.x * hero.scale.x, C.g, _p, _d); _qa.setFromUnitVectors(ZV, _d);
      carryW += ((mode === 'hand' ? 0 : 1) - carryW) * Math.min(1, rdt * 10);
      if (mode !== 'hand') carryDir.lerp(CARRY[mode], Math.min(1, rdt * 8)).normalize();
      _qc.setFromUnitVectors(ZV, carryDir);
      C.w.position.copy(_p); C.w.quaternion.copy(_qa).slerp(_qc, carryW); C.wi.position.set(0, 0, 0); C.w.updateMatrixWorld(true);
      if (D.wpn === 'glaive') faceCam(C.w, true);
      if (p.st === 'musou' && p.t < 3.4) { dragonGroup.visible = true; updateDragon(musouT * 0.95); }   // 無雙：龍（關羽 = 青龍，setChar 轉色）
    };
    C.mrig = R; if (!RX.dragonWarm) { RX.dragonWarm = 1; warm(dragonGroup); }   // 第一次無雙（龍）唔好卡
    return true;
  }
  RX.setHero = (c, tex) => {   // 取代 api.setHero：趙雲 / 關羽自己整；其他交返 HEROF（紳士 / 女特工）
    if (!H3[c]) { if (CHARS.zyun) CHARS.zyun.g.visible = false; Object.assign(TX, TX0); $('help').textContent = HELP0; return HEROF.setHero(c, tex); }
    if (!(CHARS[c] && CHARS[c].k3) && !make3K(c, tex)) return false;
    setChar(c);
    for (const k of ['maid', 'student']) if (CHARS[k]) CHARS[k].g.visible = false;
    if (CHARS.zy.rig) CHARS.zy.rig.group.visible = false;
    if (CHARS.zyun) CHARS.zyun.g.visible = c === 'zyun';
    Object.assign(TX, TX0); TX.face = H3.zyun.face; TX.musou = H3.zyun.mus; TX.faceG = H3.gy.face; TX.musouG = H3.gy.mus;
    $('face').textContent = H3[c].face; $('help').textContent = HELP0.replace('特工無雙', '無雙');
    return true;
  };
  { const dh0 = doHit; doHit = function (range, ...a) { return dh0(range + (ACT.k3 && H3[CHAR] ? H3[CHAR].reach : 0), ...a); }; }   // 長兵器：打中範圍 +0.6 / +0.8 米（傷害同特工一樣）

  // ================= ② 魏兵 / 魏軍隊長（bake 姿勢）=================
  const WP = [];   // [動作, 秒, 武器跟手（否則持槍）, 鎖 Hips 高度]
  for (let k = 0; k < 8; k++) WP.push(['Run_02', k / 8 * 0.733, 0, 0]);
  WP.push(['Combat_Stance', 0, 0, 0], ['Combat_Stance', 0.83, 0, 0], ['Thrust_Slash', 0.45, 1, 0], ['Thrust_Slash', 0.73, 1, 0], ['Thrust_Slash', 1.05, 0, 0],
    ['Hit_Reaction', 0.25, 1, 0], ['BeHit_FlyUp', 0.2, 1, 1], ['Knock_Down', 2.3, 1, 0], ['Reaping_Swing', 3.3, 1, 0]);
  const RUN0 = 0, IDLE0 = 8, WIND = 10, THRUST = 11, REC = 12, HIT = 13, AIR = 14, DOWN = 15, SPINP = 16;
  const WCLIPS = [...new Set(WP.map((q) => q[0]))], WCARRY = new THREE.Vector3(0, 0.4, 1).normalize();
  const WSC = [1.18, 1.24];   // 魏兵 / 隊長高度（Meshy 盤骨 0.74 米 → 約 1.75 / 1.85 米，主角 1.9–2.1 米）
  const WEI = { L: null, busy: false, shown: false, sp: null };
  function bakeWei(id) {
    const R = buildMeshyRig(window.MRIG[id], window.MCLIPS, WCLIPS), g = R.mesh.geometry, sk = R.mesh.skeleton;
    const P = g.attributes.position.array, N = g.attributes.normal.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, n = P.length / 3;
    const hipY = window.MRIG[id].bones[0].t[1], axis = R.handAxis(AX0), mat = new THREE.MeshLambertMaterial({ map: R.mesh.material.map });
    const q = new THREE.Quaternion(), pp = new THREE.Vector3(), ff = new THREE.Vector3();
    return WP.map(([clip, t, hand, lock]) => {
      const a = R.actions[clip]; a.reset(); a.play(); a.time = t; R.mixer.update(0);
      if (lock) R.bones.Hips.position.y = hipY;
      R.group.updateMatrixWorld(true); sk.update();
      const hb = R.bones.RightHand; hb.getWorldQuaternion(q); hb.getWorldPosition(pp);   // a.stop() 之前讀（stop 會還原綁定姿勢）
      ff.set(0, 1, 0).applyQuaternion(q); pp.addScaledVector(ff, 0.07);
      const grip = pp.clone(), dir = hand ? axis.clone().applyQuaternion(q).normalize() : WCARRY.clone();
      a.stop();
      const Mx = sk.boneMatrices, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
        let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
        for (let k = 0; k < 4; k++) {
          const w = SW[v * 4 + k]; if (!w) continue; const o = SI[v * 4 + k] * 16;
          px += w * (Mx[o] * x + Mx[o + 4] * y + Mx[o + 8] * z + Mx[o + 12]); py += w * (Mx[o + 1] * x + Mx[o + 5] * y + Mx[o + 9] * z + Mx[o + 13]); pz += w * (Mx[o + 2] * x + Mx[o + 6] * y + Mx[o + 10] * z + Mx[o + 14]);
          qx += w * (Mx[o] * nx + Mx[o + 4] * ny + Mx[o + 8] * nz); qy += w * (Mx[o + 1] * nx + Mx[o + 5] * ny + Mx[o + 9] * nz); qz += w * (Mx[o + 2] * nx + Mx[o + 6] * ny + Mx[o + 10] * nz);
        }
        const l = Math.hypot(qx, qy, qz) || 1;
        pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz; nrm[v * 3] = qx / l; nrm[v * 3 + 1] = qy / l; nrm[v * 3 + 2] = qz / l;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('uv', g.attributes.uv); geo.setIndex(g.index);
      const mesh = new THREE.InstancedMesh(geo, mat, NMAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
      mesh.setColorAt(0, _col.setRGB(1, 1, 1)); mesh.count = 0; mesh.visible = false; ROOT.add(mesh);   // setColorAt 要喺 count = 0 之前
      return { mesh, n: 0, grip, dir };
    });
  }
  function weiSpears() {   // 魏兵長槍：木槍身 + 鐵槍頭（instanced）
    const mk = (geo, col) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: col }), NMAX); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.visible = false; ROOT.add(m); return { mesh: m, n: 0 }; };
    return { shaft: mk(SEG_GEO, 0x7a5a38), tip: mk(new THREE.ConeGeometry(0.5, 1, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5), 0xcfd6e0) };
  }
  RX.bake = (sync) => new Promise((ok) => {   // 分幾格做（每格一個 rig），唔好一格卡死；sync = 即刻做晒（測試）
    if (WEI.L) return ok(true);
    const M = window.MRIG; if (!M || !M.weisoldier || !window.MCLIPS || !MCLIPS.clips.Knock_Down) return ok(false);
    const cap = M.weicaptain ? 'weicaptain' : 'weisoldier', ids = ['weisoldier', M.weisoldier_lo ? 'weisoldier_lo' : 'weisoldier', cap, M[cap + '_lo'] ? cap + '_lo' : cap], out = {};
    let i = 0;
    const next = () => {
      if (i < ids.length) { const id = ids[i++]; out[id] = out[id] || bakeWei(id); return sync ? next() : requestAnimationFrame(next); }
      WEI.L = [[out[ids[0]], out[ids[1]]], [out[ids[2]], out[ids[3]]]]; WEI.sp = weiSpears();
      const t = new THREE.Group(); for (const L of WEI.L) for (const D of L) for (const b of D) { b.mesh.count = 1; b.mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0)); }
      for (const L of WEI.L) for (const D of L) for (const b of D) { const par = b.mesh.parent; t.add(b.mesh); b.par = par; }
      warm(t); for (const L of WEI.L) for (const D of L) for (const b of D) { b.par.add(b.mesh); b.mesh.count = 0; b.mesh.visible = false; }
      ok(true);
    };
    if (sync) next(); else requestAnimationFrame(next);
  });
  const WPAL = [[0x2c4fa8, 0x1a2a55, 0x9a6e4c, 0x3b2a22, 0x7a5a38], [0x6a1e1e, 0x2c4fa8, 0xd0a030, 0x3b2a22, 0x9a6e4c]];   // 碎片顏色：藍甲魏兵 / 紅披風隊長
  const SPIN = new Uint8Array(NMAX), SPS = new Uint8Array(NMAX), SPH = new Uint8Array(NMAX), hid = [];
  const WHITE = new THREE.Color(1, 1, 1), FLASH = new THREE.Color(2.2, 2.2, 2.2), TINT = new THREE.Color(1.5, 0.75, 0.7);
  const _g = new THREE.Vector3(), _sd = new THREE.Vector3(), _mm = new THREE.Matrix4();
  function flushWei(on) {
    for (const L of WEI.L) for (const D of L) for (const b of D) { if (!on) b.n = 0; b.mesh.count = b.n; b.mesh.visible = b.n > 0; b.mesh.instanceMatrix.needsUpdate = true; if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true; }
    for (const k in WEI.sp) { const e = WEI.sp[k]; if (!on) e.n = 0; e.mesh.count = e.n; e.mesh.visible = e.n > 0; e.mesh.instanceMatrix.needsUpdate = true; }
    WEI.shown = on;
  }
  const ws1 = writeSoldiers;
  writeSoldiers = function (dt) {
    if (!RX.on || !WEI.L) { if (WEI.shown) flushWei(false); return ws1(dt); }
    hid.length = 0; for (let i = 0; i < NMAX; i++) if (S.alive[i]) { S.alive[i] = 0; hid.push(i); }
    ws1(dt);   // 清走程式人形；主角 / boss 嘅影照畫
    for (const i of hid) S.alive[i] = 1;
    for (const L of WEI.L) for (const D of L) for (const b of D) b.n = 0; WEI.sp.shaft.n = WEI.sp.tip.n = 0;
    let k = shadowMesh.count; const cx = camera.position.x, cz = camera.position.z;
    for (const i of hid) {
      const st = S.st[i], kd = S.kind[i] ? 1 : 0, sc = WSC[kd];
      if (dt > 1e-4) { const sp = Math.hypot(S.x[i] - S.lx[i], S.z[i] - S.lz[i]) / dt; S.walkAmt[i] += (clamp(sp / 3.2, 0, 1) - S.walkAmt[i]) * 0.25; }
      S.lx[i] = S.x[i]; S.lz[i] = S.z[i];
      _q.setFromEuler(_e.set(st === 6 ? 0 : S.tilt[i], S.yaw[i], 0, 'YXZ'));
      _base.compose(_v.set(S.x[i], S.y[i], S.z[i]), _q, _s.set(sc, sc, sc));
      let pose;
      if (st === 0) pose = S.walkAmt[i] > 0.05 ? RUN0 + ((Math.floor(S.walk[i] / TAU * 8) % 8) + 8) % 8 : IDLE0 + ((GAME.t * 1.2 + i * 0.37) % 2 | 0);
      else pose = st === 1 ? WIND : st === 2 ? (SPIN[i] ? SPINP : THRUST) : st === 3 ? REC : st === 4 ? HIT : st === 5 ? AIR : DOWN;
      const B = WEI.L[kd][(S.x[i] - cx) ** 2 + (S.z[i] - cz) ** 2 > 22 * 22 ? 1 : 0][pose];
      B.mesh.setMatrixAt(B.n, _base); B.mesh.setColorAt(B.n, S.flash[i] > 0 ? FLASH : st === 1 ? TINT : WHITE); B.n++;
      _g.copy(B.grip); _sd.copy(B.dir);
      R.a.copy(_g).addScaledVector(_sd, -0.9); R.b.copy(_g).addScaledVector(_sd, 1.5);
      const e1 = WEI.sp.shaft, e2 = WEI.sp.tip;
      e1.mesh.setMatrixAt(e1.n++, _mm.multiplyMatrices(_base, segM(R.m, R.a, R.b, 0.05, 0.05)));
      R.a.copy(R.b); R.b.addScaledVector(_sd, 0.32); e2.mesh.setMatrixAt(e2.n++, _mm.multiplyMatrices(_base, segM(R.m, R.a, R.b, 0.12, 0.05)));
      _m.makeTranslation(S.x[i], 0.03, S.z[i]); shadowMesh.setMatrixAt(k++, _m);
    }
    flushWei(true); shadowMesh.count = k; shadowMesh.instanceMatrix.needsUpdate = true;
  };
  { const KA1 = KIND_AI[1];   // 隊長旋風斬（zhaoyun 09-29）：蓄勢時 45 % 揀旋風斬，360°、半徑 3.1 米、14 傷害
    KIND_AI[1] = (i, dt, dx, dz, d, face) => {
      if (!RX.on) return KA1(i, dt, dx, dz, d, face);
      const st = S.st[i];
      if (st === 0) { SPS[i] = 0; return false; }
      if (st === 1 && !SPS[i]) { SPS[i] = 1; SPIN[i] = Math.random() < 0.45 ? 1 : 0; SPH[i] = 0; }
      if (st === 2 && SPIN[i]) {
        S.yaw[i] += dt * 16;
        if (!SPH[i]) { SPH[i] = 1; ring(S.x[i], S.z[i], 3.1, 0xff6040, 0.3); if (d < 3.1 && player.y < 1.2) hurtPlayer(14, S.x[i], S.z[i], false); }
        if (S.t[i] > 0.45) { S.st[i] = 3; S.t[i] = 0; SPIN[i] = 0; }
        return true;
      }
      return false;
    }; }

  // ================= ③ 張郃 =================
  BOSSES.zhanghe = { name: '張郃', sub: '魏國名將・朱雀焚天', hp: 1700, poise: 80 };
  BOSSES.lubu = { name: '呂布', sub: '人中呂布・天下無雙', hp: 2800, poise: 150 };
  const ZH = { g: new THREE.Group(), R: null, dr: null, blade: new THREE.Group(), phxCd: 0, u70: false, u35: false, hitRing: false, hits: 0, tx: 0, tz: 0, cx: 0, cz: 0 };
  ZH.g.visible = false; ROOT.add(ZH.g); BV.zhanghe = ZH;
  { const steel = new THREE.MeshLambertMaterial({ color: 0xc8ced8, emissive: 0x181c22 }), gold = new THREE.MeshLambertMaterial({ color: 0xc89a3a, emissive: 0x2a1c04 }), wrap = new THREE.MeshLambertMaterial({ color: 0x3a1a4a });
    const sh = new THREE.Shape(); sh.moveTo(-0.05, 0); sh.lineTo(0.06, 0); sh.quadraticCurveTo(0.1, 0.9, 0.02, 1.45); sh.lineTo(-0.07, 1.25); sh.quadraticCurveTo(-0.06, 0.6, -0.05, 0);   // 單手大刀（zhaoyun：BG 張郃用刀）
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false }); bg.translate(0, 0, -0.0125); bg.rotateX(Math.PI / 2);
    const blade = new THREE.Mesh(bg, steel); blade.position.z = 0.16; ZH.blade.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.05), gold); guard.position.z = 0.14; ZH.blade.add(guard);
    ZH.blade.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8).rotateX(Math.PI / 2), wrap));
    const pom = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), gold); pom.position.z = -0.17; ZH.blade.add(pom);
    ZH.blade.scale.setScalar(1.35); ZH.g.add(ZH.blade); }
  // 朱雀（zhaoyun boss_ext.js）
  const bird = new THREE.Group(); bird.visible = false; ROOT.add(bird);
  const fireMat = (c, o = 0.95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const feather = (L, w) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(w, L * 0.45, 0, L); s.quadraticCurveTo(-w * 0.35, L * 0.45, 0, 0); return new THREE.ShapeGeometry(s, 6); };
  { const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), fireMat(0xff4a16)); body.scale.set(0.8, 0.75, 2.1); bird.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), fireMat(0xff7a22)); head.position.set(0, 0.45, 1.75); bird.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6).rotateX(Math.PI / 2), fireMat(0xffd04a)); beak.position.set(0, 0.4, 2.45); bird.add(beak);
    for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(feather(1.3 - k * 0.2, 0.28).rotateX(-2.2 + k * 0.25), fireMat(0xffb030)); c.position.set((k - 1) * 0.12, 0.8, 1.6); bird.add(c); }
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff6a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, fog: false })); gl.scale.set(9, 9, 1); bird.add(gl); }
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Group(); w.position.set(side * 0.45, 0.3, 0.3); w.scale.x = side; bird.add(w);
    for (let k = 0; k < 7; k++) { const col = new THREE.Color(0xffd04a).lerp(new THREE.Color(0xe8200c), k / 6);
      const f = new THREE.Mesh(feather(2.0 + k * 0.45, 0.6).rotateZ(-Math.PI / 2), fireMat(col.getHex(), 0.85)); f.rotation.y = 0.15 + k * 0.2; f.position.z = -k * 0.12; w.add(f); }
    return w;
  });
  const tails = [...Array(5)].map((_, k) => { const t = new THREE.Mesh(feather(4.2 + (k === 2 ? 1.6 : Math.abs(k - 2) * 0.4), 0.55).rotateX(-Math.PI / 2), fireMat(k === 2 ? 0xffc040 : 0xff5a1a, 0.8)); t.position.set((k - 2) * 0.22, 0.1, -1.3); bird.add(t); return t; });
  let flap = 0;
  function poseBird(x, y, z, yaw, roll, s, dt) {
    bird.position.set(x, y, z); bird.rotation.set(0, yaw, roll); bird.scale.setScalar(s); flap += dt * 9;
    wings.forEach((w) => { w.rotation.z = Math.sin(flap) * 0.65; }); tails.forEach((t, k) => { t.rotation.y = Math.sin(flap * 0.6 + k) * 0.18; });
    if (Math.random() < 0.9) for (let k = 0; k < 3; k++) { _w.set(rand(-4, 4) * s, rand(-0.2, 0.6), rand(-4, 1) * s); bird.localToWorld(_w); emit(_w.x, _w.y, _w.z, rand(-1, 1), rand(0.5, 2.5), rand(-1, 1), rand(0.3, 0.6), rand(0.6, 1.3), Math.random() < 0.5 ? 0xff7a22 : 0xffd04a, -2, 2); }
  }
  const PX = '朱雀・焚天！';
  function zhPhys(b, dt) {
    b.flash -= dt; b.t += dt; b.cd -= dt;
    b.x += b.vx * dt; b.z += b.vz * dt; b.vx *= Math.max(0, 1 - 4 * dt); b.vz *= Math.max(0, 1 - 4 * dt);
    if (b.st !== 9 && (b.y > 0 || b.vy > 0)) { b.vy -= 22 * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.vy = 0; if (b.st === 5) { b.st = 4; b.t = 0; } } }
  }
  BOSS_AI.zhanghe = (dt) => {   // 0 追 1 橫掃蓄 2 橫掃 3 突進蓄 6 突進 4 硬直 5 飛起 7 朱雀 8 三連斬 9 飛身劈地
    const b = boss, Z = ZH; zhPhys(b, dt); Z.phxCd -= dt;
    const dx = player.x - b.x, dz = player.z - b.z, d = Math.hypot(dx, dz) || 0.001, face = Math.atan2(dx, dz);
    if (b.st !== 7 && b.y <= 0 && GAME.state === 'play' && ((!Z.u70 && b.hp < b.max * 0.7) || (!Z.u35 && b.hp < b.max * 0.35))) {   // 血跌穿 70 % / 35 %：爆氣放朱雀
      if (b.hp < b.max * 0.7) Z.u70 = true; if (b.hp < b.max * 0.35) Z.u35 = true; Z.phxCd = 18;
      b.st = 7; b.t = 0; b.vx = b.vz = 0; Z.hitRing = false; banner(PX, '#ff6a2a'); SND.charge(); SND.roar(); ring(b.x, b.z, 6, 0xff6a2a, 0.4);
      if (d < 5) { player.kx = dx / d * 14; player.kz = dz / d * 14; }
    }
    if (b.st === 0 && b.cd <= 0 && b.y <= 0 && GAME.state === 'play') {
      const r = Math.random(); let n = -1;
      if (Z.phxCd <= 0 && b.hp < b.max * 0.9 && r < 0.35) { n = 7; Z.phxCd = 18; } else if (d < 5.5 && r < 0.45) n = 8; else if (d > 7 && d < 18 && r < 0.4) n = 9;
      if (n >= 0) { b.st = n; b.t = 0; Z.hitRing = false; Z.hits = 0; Z.cx = b.x; Z.cz = b.z; Z.tx = player.x; Z.tz = player.z; if (n === 7) { banner(PX, '#ff6a2a'); SND.charge(); SND.roar(); } else SND.swing(true); }
    }
    const t = b.t;
    switch (b.st) {
      case 0: b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 4); if (d > 3.8) { b.x += dx / d * 5.2 * dt; b.z += dz / d * 5.2 * dt; }
        if (b.cd <= 0 && d < 5) { b.st = 1; b.t = 0; } else if (b.cd <= 0 && d > 9 && d < 22) { b.st = 3; b.t = 0; } break;
      case 1: if (t > 0.85) { b.st = 2; b.t = 0; SND.swing(true); if (d < 5.5 && Math.abs(angDiff(face, b.yaw)) < 1.8) hurtPlayer(30, b.x, b.z, true);
        for (let k = 0; k < 16; k++) { const a = b.yaw - 1.6 + k / 16 * 3.2; emit(b.x + Math.sin(a) * 4, 1.6, b.z + Math.cos(a) * 4, 0, 0, 0, .3, 1.6, 0xff5a8a); } } break;
      case 2: if (t > 0.6) { b.st = 0; b.cd = rand(1.2, 2.2); } break;
      case 3: b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 6); if (Math.random() < dt * 30) emit(b.x, 0.3, b.z, rand(-1, 1), rand(1, 2), rand(-1, 1), .4, 1.2, 0xff5a8a); if (t > 0.6) { b.st = 6; b.t = 0; SND.swing(true); } break;
      case 6: { const [fx, fz] = fwd(b.yaw); b.x += fx * 20 * dt; b.z += fz * 20 * dt; if (d < 2.6 && !b.dashHit) { b.dashHit = 1; hurtPlayer(28, b.x, b.z, true); }
        for (let i = 0; i < NMAX; i++) if (S.alive[i] && Math.hypot(S.x[i] - b.x, S.z[i] - b.z) < 1.6) { S.vx[i] = -fz * 8; S.vz[i] = fx * 8; }
        if (t > 0.5) { b.st = 0; b.cd = rand(1.5, 2.5); b.dashHit = 0; } break; }
      case 4: if (t > 0.55) { b.st = 0; b.cd = 0.6; } break;
      case 7: {   // 朱雀：1 秒蓄力 → 火圈擴散（跳 / 閃）→ 俯衝紅圈
        b.vx = b.vz = 0;
        if (t < 1.0) {
          if (((t / 0.25) | 0) !== (((t - dt) / 0.25) | 0)) ring(b.x, b.z, 3.5, 0xff5020, 0.5);
          for (let k = 0; k < 3; k++) { const a = Math.random() * TAU, rr = rand(0.5, 2.5); emit(b.x + Math.cos(a) * rr, 0.2, b.z + Math.sin(a) * rr, 0, rand(3, 7), 0, rand(0.3, 0.6), rand(0.5, 1.1), 0xff6a20, -3, 1); }
          if (t > 0.55) { bird.visible = true; poseBird(b.x, 2 + (t - 0.55) * 3, b.z, b.yaw, 0, (t - 0.55) / 0.45, dt); }
        } else if (t < 2.6) {
          if (!Z.hitRing && t - dt < 1.0) { ring(b.x, b.z, 10.4, 0xff4010, 1.6); SND.gong(); camShake = Math.max(camShake, 0.4); }
          const Rr = (t - 1.0) * 6.5, a = (t - 1.0) / 1.6 * TAU + 1.2, br = lin(t, 1.0, 2.6, 3, 10);
          poseBird(b.x + Math.sin(a) * br, 3.2, b.z + Math.cos(a) * br, a + Math.PI / 2, -0.45, 1, dt);
          for (let k = 0; k < 14; k++) { const q = Math.random() * TAU; emit(b.x + Math.cos(q) * Rr, 0.3, b.z + Math.sin(q) * Rr, Math.cos(q) * 2, rand(2, 5), Math.sin(q) * 2, rand(0.25, 0.5), rand(0.8, 1.6), Math.random() < 0.5 ? 0xff5a1a : 0xffc040, -2, 1); }
          if (!Z.hitRing && Math.abs(d - Rr) < 0.9 && player.y < 1.2) { Z.hitRing = true; hurtPlayer(26, b.x, b.z, true); }
          if (t + dt >= 2.6) { Z.tx = player.x; Z.tz = player.z; ring(Z.tx, Z.tz, 3.6, 0xff2010, 0.9); }
        } else if (t < 3.45) {
          if (((t / 0.3) | 0) !== (((t - dt) / 0.3) | 0)) ring(Z.tx, Z.tz, 3.6, 0xff2010, 0.35);
          poseBird(lin(t, 2.6, 3.45, bird.position.x, Z.tx), lin(t, 2.6, 3.45, 3.2, 12), lin(t, 2.6, 3.45, bird.position.z, Z.tz), Math.atan2(Z.tx - bird.position.x, Z.tz - bird.position.z), 0, 1, dt);
        } else if (t < 3.75) {
          const k = (t - 3.45) / 0.3; poseBird(Z.tx, 12 - k * 11.5, Z.tz, bird.rotation.y, 0, 1 + k * 0.3, dt); bird.rotation.x = 1.2;
          if (t + dt >= 3.75) {
            bird.visible = false; bird.rotation.x = 0; SND.bigboom(); camShake = Math.max(camShake, 1.0); flash(0.35); ring(Z.tx, Z.tz, 7, 0xffa040, 0.6);
            for (let q = 0; q < 60; q++) { const a2 = Math.random() * TAU, sp = rand(4, 14); emit(Z.tx, 0.6, Z.tz, Math.cos(a2) * sp, rand(3, 10), Math.sin(a2) * sp, rand(0.4, 0.9), rand(0.8, 1.8), q % 3 ? 0xff5a1a : 0xffd04a, 14, 2); }
            if (Math.hypot(player.x - Z.tx, player.z - Z.tz) < 3.6) hurtPlayer(32, Z.tx, Z.tz, true);
          }
        } else if (t > 4.1) { b.st = 0; b.t = 0; b.cd = 1.8; }
        break; }
      case 8: {   // 三連斬：逐刀向前踏
        b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 6); const HT = [0.25, 0.6, 0.95];
        if (Z.hits < 3 && t >= HT[Z.hits]) { const [fx, fz] = fwd(b.yaw); b.vx += fx * 7; b.vz += fz * 7; SND.swing(true);
          if (d < 5 && Math.abs(angDiff(face, b.yaw)) < 1.3) hurtPlayer(15, b.x, b.z, Z.hits === 2);
          for (let k = 0; k < 10; k++) { const a = b.yaw - 1 + k / 10 * 2; emit(b.x + Math.sin(a) * 3.5, 1.5, b.z + Math.cos(a) * 3.5, 0, 0, 0, .25, 1.3, 0xff5a8a); }
          Z.hits++; }
        if (t > 1.3) { b.st = 0; b.t = 0; b.cd = rand(1.0, 1.8); } break; }
      case 9:   // 飛身劈地：跳去你最後企嘅位，落地震波（跳起避到）
        if (t < 0.35) { b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 8); Z.tx = player.x; Z.tz = player.z; Z.cx = b.x; Z.cz = b.z; }
        else if (t < 0.95) { const k = (t - 0.35) / 0.6; b.x = Z.cx + (Z.tx - Z.cx) * k; b.z = Z.cz + (Z.tz - Z.cz) * k; b.y = Math.sin(k * Math.PI) * 5; }
        else if (!Z.hitRing) { Z.hitRing = true; b.y = 0; ring(b.x, b.z, 6, 0xff8a40, 0.5); SND.bigboom(); camShake = Math.max(camShake, 0.8);
          for (let q = 0; q < 30; q++) { const a2 = Math.random() * TAU; emit(b.x + Math.cos(a2) * 2, 0.3, b.z + Math.sin(a2) * 2, Math.cos(a2) * rand(4, 9), rand(2, 6), Math.sin(a2) * rand(4, 9), rand(.3, .6), rand(.8, 1.4), 0x9a8060, 14, 2); }
          if (d < 6 && player.y < 1.0) hurtPlayer(28, b.x, b.z, true); }
        if (t > 1.5) { b.st = 0; b.t = 0; b.cd = rand(1.2, 2.0); } break;
    }
    { const q = keepIn(b.x, b.z, b.lx, b.lz, 2); b.x = b.lx = q[0]; b.z = b.lz = q[1]; }
    if (d < 1.8 && b.y < 1) { player.x += dx / d * (1.8 - d); player.z += dz / d * (1.8 - d); }
  };
  BOSS_VIS.zhanghe = (dt, rdt) => {
    const Z = ZH, b = boss; if (!Z.R) return;
    Z.g.position.set(b.x, b.y, b.z); Z.g.rotation.set(0, b.yaw, 0);
    const st = b.st, dr = Z.dr, mv = Math.hypot(b.x - (Z.px || b.x), b.z - (Z.pz || b.z)) / Math.max(1e-4, dt) > 1; Z.px = b.x; Z.pz = b.z;
    let a;
    if (st === 1) { a = dr.use('Charged_Slash'); dr.at(a, lin(b.t, 0, 0.85, 0.3, 1.0)); }
    else if (st === 2) { a = dr.use('Charged_Slash'); dr.at(a, b.t < 0.18 ? lin(b.t, 0, 0.18, 1.0, 1.17) : lin(b.t, 0.18, 0.6, 1.17, 1.6)); }
    else if (st === 3) { a = dr.use('Thrust_Slash'); dr.at(a, lin(b.t, 0, 0.6, 0.3, 0.55)); }
    else if (st === 6) { a = dr.use('Thrust_Slash'); dr.at(a, lin(b.t, 0, 0.12, 0.55, 0.73)); }
    else if (st === 4) { a = dr.use('Hit_Reaction'); dr.at(a, lin(b.t, 0, 0.55, 0, 0.9)); }
    else if (st === 5) { a = dr.use('BeHit_FlyUp'); dr.at(a, 0.2); }
    else if (st === 7) { a = dr.use('Sword_Shout'); dr.at(a, b.t < 1 ? lin(b.t, 0, 1, 0.8, 1.3) : 1.3); }
    else if (st === 8) { a = dr.use('Triple_Combo_Attack'); dr.at(a, b.t < 0.25 ? lin(b.t, 0, 0.25, 0.45, 0.73) : b.t < 0.6 ? lin(b.t, 0.25, 0.6, 0.73, 1.5) : b.t < 0.95 ? lin(b.t, 0.6, 0.95, 1.5, 2.23) : lin(b.t, 0.95, 1.3, 2.23, 2.5)); }
    else if (st === 9) { a = dr.use('Charged_Ground_Slam'); dr.at(a, b.t < 0.35 ? lin(b.t, 0, 0.35, 0.3, 0.9) : b.t < 0.95 ? lin(b.t, 0.35, 0.95, 0.9, 1.63) : lin(b.t, 0.95, 1.5, 1.63, 2.2)); }
    else if (mv) a = dr.loop('Run_02', rdt); else a = dr.loop('Combat_Stance', rdt);
    dr.end(rdt, st === 5 || st === 9);
    Z.g.updateMatrixWorld(true);
    Z.R.mesh.material.emissive.setHex(b.flash > 0 ? 0xffffff : st === 7 ? 0x6a2400 : st === 1 || st === 3 || (st === 8 && b.t < 0.25) || (st === 9 && b.t < 0.35) ? 0x551022 : 0);
    palm(Z.R, Z.R.group.scale.x, Z.g, _p, _d); Z.blade.position.copy(_p); Z.blade.quaternion.setFromUnitVectors(ZV, _d);
  };

  // ================= ④ 呂布 =================
  const LB = { g: new THREE.Group(), R: null, dr: null, hal: null, tipW: new THREE.Vector3(), grabCd: 0, p2: false, fin: 0, hits: 0, tx: 0, tz: 0, cx: 0, cz: 0,
    G: { on: false, t: 0, n: 0, mash: 0, need: 10, taps: 0, dmg: 0, next: 0, hp0: 0, cam: 0 } };
  LB.g.visible = false; ROOT.add(LB.g); BV.lubu = LB;
  // 擒拿預警：地上紅圈（外圈 + 慢慢填滿）
  const warnRing = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  const warnFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.28, depthWrite: false, fog: false }));
  warnRing.visible = warnFill.visible = false; ROOT.add(warnRing, warnFill);
  const GRAB_R = 2.7;
  // 20 連斬 HUD
  const gd = document.createElement('div'); gd.id = 'rift-grab'; gd.hidden = true;
  gd.innerHTML = '<b>0</b><span>連斬</span><i>狂撳 攻擊 / 閃避 掙脫！</i><u><em></em></u>';
  const gcss = document.createElement('style');
  gcss.textContent = '#rift-grab{position:fixed;left:50%;top:9%;transform:translateX(-50%);z-index:7;text-align:center;pointer-events:none;color:#fff;font-family:"PingFang HK","Noto Sans TC",sans-serif;text-shadow:0 0 12px #f00,0 3px 0 #000}'
    + '#rift-grab b{font-size:84px;font-weight:900;color:#ff3a3a;line-height:1}#rift-grab span{font-size:34px;font-weight:900;margin-left:6px}'
    + '#rift-grab i{display:block;font-style:normal;font-size:20px;font-weight:900;color:#ffe08a;margin-top:6px;animation:ag-pulse .35s infinite alternate}'
    + '#rift-grab u{display:block;width:220px;height:12px;margin:8px auto 0;border:2px solid #ffe08a;border-radius:8px;overflow:hidden;text-decoration:none}#rift-grab em{display:block;height:100%;width:0;background:#ffe08a}'
    + '#rift-grab.fin b{font-size:110px;color:#fff}body.touch #rift-grab{top:150px}'   // 手機：喺 boss 血條（top 84 px）、左上體力、右上小地圖下面
    + '@media (max-height:420px){#rift-grab{top:15%}body.touch #rift-grab{top:126px}#rift-grab b{font-size:56px}#rift-grab.fin b{font-size:72px}#rift-grab span{font-size:24px}#rift-grab i{font-size:15px}}';
  document.head.appendChild(gcss); document.body.appendChild(gd);
  addEventListener('pointerdown', (e) => { if (LB.G.on && isTouch() && !(e.target.closest && e.target.closest('.ag-b'))) LB.G.taps++; });   // 手機：㩒螢幕任何位都算掙扎（攻 / 閃掣本身已經計）
  function grabHud(n, fin) {
    gd.hidden = false; gd.className = fin ? 'fin' : ''; gd.firstElementChild.textContent = n;
    gd.querySelector('i').textContent = fin ? '' : isTouch() ? '狂撳「攻」「閃」或者㩒螢幕掙脫！' : '狂撳 J / L（攻擊 / 閃避）掙脫！';
    gd.querySelector('u').style.visibility = fin ? 'hidden' : 'visible'; gd.querySelector('em').style.width = Math.min(100, LB.G.mash / LB.G.need * 100) + '%';
  }
  function lbPhys(b, dt) {
    b.flash -= dt; b.t += dt; b.cd -= dt; LB.grabCd -= dt;
    if (b.st !== 13 && b.st !== 11 && b.st !== 7) { b.x += b.vx * dt; b.z += b.vz * dt; }
    b.vx *= Math.max(0, 1 - 4 * dt); b.vz *= Math.max(0, 1 - 4 * dt);
    if (b.y > 0 || b.vy > 0) { b.vy -= 22 * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.vy = 0; if (b.st === 5) { b.st = 4; b.t = 0; } } }
  }
  function grabStart(b) {
    const G = LB.G; Object.assign(G, { on: true, t: 0, n: 0, mash: 0, taps: 0, dmg: 0, next: 0.45, hp0: player.hp, need: isTouch() ? 8 : 10 });
    b.st = 13; b.t = 0; player.st = 'hurt'; player.t = 0; player.move = null; player.inv = 0; player.vy = 0;
    warnRing.visible = warnFill.visible = false; SND.hurt(); SND.swing(true); camShake = Math.max(camShake, 0.5); hitstop = Math.max(hitstop, 0.12);
    banner('被呂布串住！狂撳掙脫！', '#ff4040', true); grabHud(0);
  }
  function grabEnd(res) {
    const G = LB.G, b = boss; G.on = false; if (res !== 'full') gd.hidden = true; hero.rotation.x = 0;   // 20 連斬：「20」留 0.9 秒（grabHit 收）
    RX.grabs.push({ res, hits: G.n, dmg: Math.round(G.dmg), mash: G.mash, t: +GAME.t.toFixed(1), hp0: Math.round(G.hp0), hp1: Math.round(player.hp) });
    const [fx, fz] = fwd(b.yaw);
    if (res === 'mash') {   // 掙脫：跌返落地，呂布硬直
      player.st = 'hurt'; player.t = 0.25; player.vy = 4; player.kx = fx * 7; player.kz = fz * 7; player.inv = 1.0;
      b.st = 4; b.t = -0.5; b.poise = BOSSES.lubu.poise; ring(player.x, player.z, 3, 0x9fff9a, 0.4); banner('掙脫！', '#9fff9a'); SND.tone(660, 0.12, 'triangle', 0.15, 1.5);
    } else {   // 20 連斬：飛出去
      player.st = 'hurt'; player.t = 0; player.vy = 7; player.kx = fx * 14; player.kz = fz * 14; player.inv = 1.4;
      b.st = 12; b.t = 0; LB.G.cam = 0.6; LB.fin = 1;
    }
    LB.grabCd = rand(8, 11);
  }
  function grabHit(dmg, fin) {
    const G = LB.G, d = dmg * DMG_MUL;
    if (fin) { player.hp -= d; if (player.hp <= 0) player.hp = 0; } else player.hp = Math.max(1, player.hp - d);   // 20 斬之前唔會死
    G.dmg += Math.min(d, G.hp0); RX.dmg['lubu:grab'] = Math.round((RX.dmg['lubu:grab'] || 0) + d); hurtFlash = 1; gainMusou(dmg * 0.5); player.st = 'hurt'; player.t = 0;
    for (let k = 0; k < (fin ? 40 : 8); k++) emit(player.x, player.y + 1.3, player.z, rand(-6, 6), rand(-2, 7), rand(-6, 6), rand(.15, .4), rand(.6, 1.3), k % 3 ? 0xff3030 : 0xffffff, 10, 3);
    SND.hit(1, fin); if (fin) { SND.bigboom(); hitstop = 0.55; flash(0.6); camShake = 1.3; banner('二十連斬！', '#ff3040'); } else { camShake = Math.max(camShake, 0.22); hitstop = Math.max(hitstop, 0.03); }
    grabHud(G.n, fin);
    if (fin) setTimeout(() => { if (!LB.G.on) gd.hidden = true; }, 900);
    if (fin && player.hp <= 0) GAME.over(false);
  }
  BOSS_AI.lubu = (dt) => {   // 0 追 1 橫掃蓄 2 橫掃 6 衝蓄 7 衝 8 三連 9 天下無雙（半血震波）10 擒拿預警 11 撲 12 收招（破綻）13 擒住 4 硬直 5 飛起
    const b = boss; lbPhys(b, dt);
    const dx = player.x - b.x, dz = player.z - b.z, d = Math.hypot(dx, dz) || 0.001, face = Math.atan2(dx, dz), t = b.t;
    if (!LB.p2 && b.hp < b.max * 0.5 && b.y <= 0 && GAME.state === 'play' && b.st !== 13 && b.st !== 10 && b.st !== 11) {
      LB.p2 = true; b.st = 9; b.t = 0; b.vx = b.vz = 0; warnRing.visible = warnFill.visible = false; banner('呂布：天下無雙！', '#ff3040'); SND.roar(); SND.charge(); }
    switch (b.st) {
      case 0: {
        b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 4);
        const sp = LB.p2 ? 6.2 : 5.0; if (d > 3.6) { b.x += dx / d * sp * dt; b.z += dz / d * sp * dt; }
        if (b.cd <= 0 && GAME.state === 'play') {
          const r = Math.random();
          if (LB.grabCd <= 0 && d < 9 && r < 0.5) { b.st = 10; b.t = 0; LB.tx = player.x; LB.tz = player.z; warnRing.visible = warnFill.visible = true; SND.charge(); SND.tone(220, 0.6, 'sawtooth', 0.1, 0.5); }
          else if (d < 5.8) { b.st = r < 0.75 ? 1 : 8; b.t = 0; LB.hits = 0; if (b.st === 1) ring(b.x, b.z, 6.2, 0xff3030, 0.8, 0.1); }
          else if (d > 8 && d < 26 && r < 0.6) { b.st = 6; b.t = 0; }
        }
        break; }
      case 1: b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 3); if (t > 0.8) { b.st = 2; b.t = 0; SND.swing(true); SND.swing(true);   // 360° 橫掃：跳起避到
        if (d < 6.2 && player.y < 0.8) hurtPlayer(26, b.x, b.z, true);
        for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; emit(b.x + Math.sin(a) * 5, 1.3, b.z + Math.cos(a) * 5, Math.sin(a) * 6, 0.5, Math.cos(a) * 6, .3, 1.5, 0xff3050); }
        ring(b.x, b.z, 6.4, 0xff4060, 0.35); camShake = Math.max(camShake, 0.45); } break;
      case 2: if (t > 0.7) { b.st = 0; b.cd = rand(1.0, 1.8); } break;
      case 6: b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 6); if (Math.random() < dt * 30) emit(b.x, 0.3, b.z, rand(-1, 1), rand(1, 2), rand(-1, 1), .4, 1.4, 0xff3050);
        if (t > 0.55) { b.st = 7; b.t = 0; b.hitP = 0; SND.swing(true); } break;
      case 7: { const [fx, fz] = fwd(b.yaw); b.x += fx * 21 * dt; b.z += fz * 21 * dt;
        if (d < 2.9 && !b.hitP) { b.hitP = 1; hurtPlayer(26, b.x, b.z, true); }
        for (let i = 0; i < NMAX; i++) if (S.alive[i] && Math.hypot(S.x[i] - b.x, S.z[i] - b.z) < 2) { S.vx[i] = -fz * 9; S.vz[i] = fx * 9; }
        if (Math.random() < 0.8) emit(b.x, 0.4, b.z, rand(-2, 2), rand(1, 3), rand(-2, 2), .4, 1.6, 0x9a8060, 0, 2);
        if (t > 0.6) { b.st = 0; b.cd = rand(1.3, 2.0); } break; }
      case 8: { b.yaw += angDiff(face, b.yaw) * Math.min(1, dt * 6); const HT = [0.3, 0.65, 1.0];
        if (LB.hits < 3 && t >= HT[LB.hits]) { const [fx, fz] = fwd(b.yaw); b.vx += fx * 7; b.vz += fz * 7; SND.swing(true);
          if (d < 5.2 && Math.abs(angDiff(face, b.yaw)) < 1.3) hurtPlayer(LB.hits === 2 ? 22 : 15, b.x, b.z, LB.hits === 2);
          for (let k = 0; k < 10; k++) { const a = b.yaw - 1 + k / 10 * 2; emit(b.x + Math.sin(a) * 3.8, 1.6, b.z + Math.cos(a) * 3.8, 0, 0, 0, .25, 1.4, 0xff3050); }
          LB.hits++; }
        if (t > 1.4) { b.st = 0; b.cd = rand(0.9, 1.6); } break; }
      case 9:   // 天下無雙：兩圈震波（跳起避到）
        if (t < 0.6) { if (Math.random() < dt * 40) emit(b.x + rand(-1, 1), 0.3, b.z + rand(-1, 1), 0, rand(3, 7), 0, 0.5, 1.2, 0xff3040, -3, 1); }
        if (t - dt < 0.6 && t >= 0.6) { addWave(b.x, b.z, 18, 12, 20); camShake = Math.max(camShake, 0.7); SND.bigboom(); }
        if (t - dt < 1.3 && t >= 1.3) { addWave(b.x, b.z, 18, 12, 20); camShake = Math.max(camShake, 0.7); SND.bigboom(); }
        if (t > 2.0) { b.st = 0; b.cd = 0.8; LB.grabCd = Math.min(LB.grabCd, 2); } break;
      case 10: {   // 擒拿預警：紅光 + 地上紅圈（頭 0.45 秒跟住你，之後定位）
        if (t < 0.45) { LB.tx = player.x; LB.tz = player.z; }
        b.yaw += angDiff(Math.atan2(LB.tx - b.x, LB.tz - b.z), b.yaw) * Math.min(1, dt * 8);
        const f = Math.min(1, t / 1.0); warnRing.position.set(LB.tx, 0.09, LB.tz); warnRing.scale.set(GRAB_R, 1, GRAB_R); warnRing.material.opacity = 0.55 + 0.4 * Math.sin(t * 22);
        warnFill.position.set(LB.tx, 0.07, LB.tz); warnFill.scale.set(GRAB_R * f, 1, GRAB_R * f);
        if (Math.random() < dt * 25) emit(b.x + rand(-0.8, 0.8), rand(0.5, 2.6), b.z + rand(-0.8, 0.8), 0, rand(1, 3), 0, 0.4, 1.3, 0xff2020, -2, 1);
        if (t > 1.0) { b.st = 11; b.t = 0; LB.cx = b.x; LB.cz = b.z; SND.swing(true); } break; }
      case 11: {   // 撲前：衝到紅圈前面，戟尖入圈中心
        const ex = LB.tx - LB.cx, ez = LB.tz - LB.cz, el = Math.hypot(ex, ez) || 1, k = Math.min(1, t / 0.16), stop = Math.max(0, el - 2.3);
        b.x = LB.cx + ex / el * stop * k; b.z = LB.cz + ez / el * stop * k;
        if (t >= 0.16) {
          const inRing = Math.hypot(player.x - LB.tx, player.z - LB.tz) < GRAB_R, ok = inRing && player.y < 1.2 && player.inv <= 0 && player.st !== 'dodge' && player.st !== 'musou' && GAME.state === 'play';
          warnRing.visible = warnFill.visible = false;
          if (ok) grabStart(b);
          else { b.st = 12; b.t = 0; RX.grabs.push({ res: player.st === 'dodge' ? 'dodged' : player.y >= 1.2 ? 'jumped' : !inRing ? 'out' : 'iframes', t: +GAME.t.toFixed(1), hp: Math.round(player.hp) }); LB.grabCd = rand(6, 9); }
        }
        break; }
      case 12: if (t > 1.0) { b.st = 0; b.cd = rand(0.6, 1.2); LB.fin = 0; } break;   // 撲空 / 連斬完：破綻 1 秒
      case 13: {   // 擒住：串起 → 20 連斬
        const G = LB.G; G.t = t; const [fx, fz] = fwd(b.yaw);
        if (t < 0.45) {   // 串起舉高：跟住戟尖（戟尖喺胸口高度）
          const k = t / 0.45, tx = LB.tipW.x || b.x + fx * 2.6, tz = LB.tipW.z || b.z + fz * 2.6;
          player.x = lerp(player.x, tx, Math.min(1, dt * 14)); player.z = lerp(player.z, tz, Math.min(1, dt * 14)); player.y = Math.max(lerp(0.2, 2.1, k * k * (3 - 2 * k)), LB.tipW.y - 1.25, 0);
        } else {
          const j = G.n && t - G.last < 0.06 ? 0.18 : 0;   // 中刀震一震
          player.x = b.x + fx * (2.5 + j); player.z = b.z + fz * (2.5 + j); player.y = 2.1 + Math.sin(t * 9) * 0.12 + j * 0.5;
          while (G.n < 19 && t >= G.next) { G.n++; G.last = t; G.next += 0.11; grabHit(5, false); }
          if (G.n >= 19 && t >= G.next + 0.16) { G.n = 20; grabHit(30, true); grabEnd('full'); break; }
        }
        player.yaw = b.yaw + Math.PI;
        if (G.mash >= G.need) { grabEnd('mash'); break; }
        grabHud(G.n, false);
        break; }
      case 4: if (t > 0.6) { b.st = 0; b.cd = 0.5; } break;
      case 5: break;
    }
    { const q = keepIn(b.x, b.z, b.lx, b.lz, 2); b.x = b.lx = q[0]; b.z = b.lz = q[1]; }
    if (b.st !== 13 && b.y < 1 && player.y < 2) { const px = player.x - b.x, pz = player.z - b.z, pd = Math.hypot(px, pz) || 0.001; if (pd < 2.0) { player.x += px / pd * (2.0 - pd); player.z += pz / pd * (2.0 - pd); } }
  };
  BOSS_VIS.lubu = (dt, rdt) => {
    const L = LB, b = boss; if (!L.R) return;
    L.g.position.set(b.x, b.y, b.z); L.g.rotation.set(0, b.yaw, 0);
    const st = b.st, dr = L.dr, t = b.t, mv = Math.hypot(b.x - (L.px || b.x), b.z - (L.pz || b.z)) / Math.max(1e-4, dt) > 1; L.px = b.x; L.pz = b.z;
    let a, lock = false;
    if (st === 1) { a = dr.use('Axe_Spin_Attack'); dr.at(a, lin(t, 0, 0.8, 0.1, 0.62)); }
    else if (st === 2) { a = dr.use('Axe_Spin_Attack'); dr.at(a, t < 0.3 ? lin(t, 0, 0.3, 0.62, 1.1) : lin(t, 0.3, 0.7, 1.1, 1.6)); }
    else if (st === 6) { a = dr.use('Thrust_Slash'); dr.at(a, lin(t, 0, 0.55, 0.15, 0.5)); }
    else if (st === 7) a = dr.loop('RunFast', rdt, 1.4);
    else if (st === 8) { a = dr.use('Triple_Combo_Attack'); dr.at(a, t < 0.3 ? lin(t, 0, 0.3, 0.45, 0.73) : t < 0.65 ? lin(t, 0.3, 0.65, 0.73, 1.5) : t < 1.0 ? lin(t, 0.65, 1.0, 1.5, 2.23) : lin(t, 1.0, 1.4, 2.23, 2.5)); }
    else if (st === 9) { a = dr.use('Sword_Shout'); dr.at(a, lin(t, 0, 0.8, 0.8, 1.35)); }
    else if (st === 10) { a = dr.use('Thrust_Slash'); dr.at(a, lin(t, 0, 1.0, 0.0, 0.5)); }
    else if (st === 11) { a = dr.use('Thrust_Slash'); dr.at(a, lin(t, 0, 0.16, 0.5, 0.75)); }
    else if (st === 12) { a = dr.use(L.fin ? 'Sword_Judgment' : 'Thrust_Slash'); dr.at(a, L.fin ? lin(t, 0, 1.0, 1.0, 1.9) : lin(t, 0, 1.0, 0.75, 1.5)); }
    else if (st === 13) {
      if (t < 0.45) { a = dr.use('Charged_Upward_Slash'); dr.at(a, lin(t, 0, 0.45, 0.6, 1.1)); }
      else if (L.G.n >= 19) { a = dr.use('Sword_Judgment'); dr.at(a, lin(t - L.G.next, -0.05, 0.16, 0.6, 1.0)); }
      else { a = dr.use('Double_Combo_Attack'); dr.loopT += rdt * 4.5; dr.at(a, 0.4 + (dr.loopT % 1) * 0.9); }
    }
    else if (st === 4) { a = dr.use('Hit_Reaction'); dr.at(a, lin(t, -0.5, 0.6, 0, 0.9)); }
    else if (st === 5) { a = dr.use('BeHit_FlyUp'); dr.at(a, 0.2); lock = true; }
    else if (mv) a = dr.loop('Run_02', rdt, LB.p2 ? 1.15 : 1); else a = dr.loop('Combat_Stance', rdt);
    dr.end(rdt, lock);
    L.g.updateMatrixWorld(true);
    const warn = st === 10 || st === 11 || st === 13;
    L.R.mesh.material.emissive.setHex(b.flash > 0 ? 0xffffff : st === 13 ? 0x3a0606 : warn ? (Math.sin(GAME.t * 30) > 0 ? 0x991010 : 0x550808) : st === 1 || st === 6 || (st === 8 && t < 0.3) || st === 9 ? 0x551022 : 0);
    palm(L.R, L.R.group.scale.x, L.g, _p, _d); L.hal.position.copy(_p); L.hal.quaternion.setFromUnitVectors(ZV, _d); faceCam(L.hal, false);
    L.tipGlow.material.color.setHex(warn ? 0xff2020 : 0xffb070); L.tipGlow.scale.setScalar(warn ? 2.4 + Math.sin(GAME.t * 25) * 0.5 : 1.1);
    L.tipW.set(0, 0, L.hal.userData.tip); L.hal.localToWorld(L.tipW);
    if (L.G.cam > 0) L.G.cam -= rdt;
    hero.rotation.order = 'YXZ'; hero.rotation.x = L.G.on ? (b.t < 0.45 ? -0.9 * b.t / 0.45 : -0.9 + (L.G.n && b.t - L.G.last < 0.06 ? 0.25 : 0)) : 0;   // 俾戟串住：成個人向後仰
  };
  // 霸體：張郃朱雀、呂布橫掃 / 預警 / 撲 / 擒住 / 震波：打中照扣血，唔會硬直 / 飛起
  const ARMOR = { zhanghe: { 7: 1 }, lubu: { 1: 1, 2: 1, 9: 1, 10: 1, 11: 1, 13: 1 } };
  { const hb0 = hitBoss; hitBoss = function (...a) {
    const b = boss, st = b.st, t = b.t, x = b.x, z = b.z, y = b.y, ar = RX.on && ARMOR[b.type] && ARMOR[b.type][st];
    hb0.apply(this, a);
    if (ar && b.alive) { b.st = st; b.t = t; b.vx = b.vz = b.vy = 0; b.y = y; b.x = x; b.z = z; if (b.poise < 40) b.poise = 90; }
    if (!b.alive) { bird.visible = false; warnRing.visible = warnFill.visible = false; if (LB.G.on) grabEnd('mash'); }
  }; }

  // ---------- engine 包一層（淨係擒住嗰陣）----------
  { const sp0 = stepPlayer; stepPlayer = function (dt) {
    const G = LB.G;
    if (!G.on && RX.on && boss.alive && boss.type === 'lubu' && (boss.st === 10 || boss.st === 1 || boss.st === 6) && IN.dodge && (player.st === 'attack' || player.st === 'charge')) { player.st = 'idle'; player.move = null; }   // 呂布預警（擒拿紅光、橫掃紅圈、衝鋒）：閃避可以取消攻擊（唔係連招中途閃唔到）
    if (!G.on) return sp0(dt);
    G.mash += (IN.atk ? 1 : 0) + (IN.dodge ? 1 : 0) + (IN.chg ? 1 : 0) + (IN.jump ? 1 : 0) + G.taps; G.taps = 0;   // 每一下新撳（長撳唔計）
    player.inv = 0;
  }; }
  { const hp0 = hurtPlayer; hurtPlayer = function (...a) {   // 擒住期間淨係計呂布嘅斬；RX.dmg：受傷來源統計（平衡用）
    if (LB.G.on) return; const h = player.hp; const r = hp0.apply(this, a);
    if (RX.on && player.hp < h) { const b = boss, k = b.alive && Math.hypot(a[1] - b.x, a[2] - b.z) < 0.6 ? b.type + ':' + b.st : CAMP.waves.some((w) => w.x === a[1] && w.z === a[2]) ? 'wave' : (boss.alive ? boss.type + '_phase:' : 'waves:') + 'soldier'; RX.dmg[k] = Math.round((RX.dmg[k] || 0) + h - player.hp); }
    return r; }; }
  { const sc0 = stepCamera; stepCamera = function (rdt) {   // 擒住：鏡頭拉近側面
    sc0(rdt);
    const G = LB.G, want = G.on || G.cam > 0 ? 1 : 0; G.cw = (G.cw || 0) + (want - (G.cw || 0)) * Math.min(1, rdt * (want ? 5 : 2.5));
    if (G.cw < 0.01 || boss.type !== 'lubu') return;
    const b = boss, mx = (b.x + player.x) / 2, mz = (b.z + player.z) / 2, [fx, fz] = fwd(b.yaw);   // 側面：呂布同主角都入鏡（主角嗰邊行前少少，睇到呂布個面）
    let sx = -fz, sz = fx; if (G.side === undefined || !G.on) G.side = (camera.position.x - mx) * sx + (camera.position.z - mz) * sz < 0 ? -1 : 1; sx *= G.side; sz *= G.side;
    const port = innerWidth < innerHeight, D = port ? 12.5 : 7.5, sh = port ? 0.6 : 2.2, ty = innerHeight <= 420 ? 2.9 : 2.3;   // 手機打橫：望高啲，人喺畫面下半（上面係血條 + 連斬數）
    let cx = mx + sx * D + fx * sh, cz = mz + sz * D + fz * sh;
    const f = (window.clearFracS || clearFrac)(mx, ty, mz, cx, ty + 0.8, cz); if (f < 1) { cx = mx + (cx - mx) * Math.max(0.35, f); cz = mz + (cz - mz) * Math.max(0.35, f); }
    const w = G.cw; camera.position.set(lerp(camera.position.x, cx, w), lerp(camera.position.y, ty + 0.8, w), lerp(camera.position.z, cz, w));
    camera.lookAt(mx + fx * 0.3, ty, mz + fz * 0.3);
  }; }

  // ---------- 任務流程 ----------
  const KP0 = [KIND_PAL[0], KIND_PAL[1]];
  RX.prep = (type) => {   // boss 骨架（載好 rift_zhanghe.js / rift_lubu.js 先叫）
    const M = window.MRIG, V = type === 'zhanghe' ? ZH : LB, id = type; if (V.R) return true; if (!M || !M[id] || !window.MCLIPS || !MCLIPS.clips.RunFast) return false;
    const want = type === 'zhanghe' ? ['Charged_Slash', 'Thrust_Slash', 'Hit_Reaction', 'BeHit_FlyUp', 'Sword_Shout', 'Triple_Combo_Attack', 'Charged_Ground_Slam', 'Run_02', 'Combat_Stance']
      : ['Axe_Spin_Attack', 'Thrust_Slash', 'RunFast', 'Triple_Combo_Attack', 'Sword_Shout', 'Sword_Judgment', 'Charged_Upward_Slash', 'Double_Combo_Attack', 'Hit_Reaction', 'BeHit_FlyUp', 'Run_02', 'Combat_Stance'];
    const R = buildMeshyRig(M[id], window.MCLIPS, want), H = type === 'zhanghe' ? 2.35 : 2.75;
    R.group.scale.setScalar(H / (M[id].bones[0].hl[1] * M[id].rs / 0.52)); R.axis = R.handAxis(AX0); R.mesh.material.color.setHex(0xc8c8c8);
    V.g.add(R.group); V.R = R; V.dr = driver(R, M[id].bones[0].t[1]);
    if (type === 'lubu') { V.hal = RF.weapon('halberd'); V.g.add(V.hal); V.tipGlow = glowS(0xffb070, 1.1, V.hal.userData.tip - 0.15, V.hal, 0.85); }
    V.dr.loop('Combat_Stance', 0); V.dr.end(0); warm(V.g);
    return true;
  };
  RX.ready = (type) => !!(type === 'zhanghe' ? ZH.R : LB.R);
  { const sb0 = spawnBoss; spawnBoss = function (type) {   // boss 未載好：等（兵照出），載好先出場
    if (RX.on && (type === 'zhanghe' || type === 'lubu') && !RX.ready(type) && !RX.prep(type)) {
      BOSSQ.unshift(type); if (boss.spawned) nextBossT = 0.5;
      if (!RX.waitMsg) { RX.waitMsg = 1; banner(`${BOSSES[type].name} 趕緊嚟…`, '#ffb070', true); }
      return;
    }
    RX.waitMsg = 0; sb0(type);
    if (RX.on) { boss.lx = boss.x; boss.lz = boss.z;
      if (type === 'lubu') { player.hp = Math.min(player.max, player.hp + player.max * 0.35); banner('趁空檔回氣：體力 +35%', '#9fff9a', true); MAX_ALIVE = Math.min(RX.alive, 12); LB.grabCd = 5; LB.p2 = false; flash(0.5); RX.log.push(['lubu', +GAME.t.toFixed(1)]); }
      if (type === 'zhanghe') { MAX_ALIVE = Math.min(RX.alive, 36); ZH.phxCd = 10; ZH.u70 = ZH.u35 = false; RX.log.push(['zhanghe', +GAME.t.toFixed(1)]); } }
  }; }
  { const ct0 = campTick; campTick = function (dt, rdt) {
    ct0(dt, rdt);
    if (!RX.on || GAME.state !== 'play') return;
    if (RX.wave === 1 && kos >= KO_TARGET / 2) { RX.wave = 2; KW = { 0: 0.5, 1: 0.5 }; banner('第二波：魏軍隊長殺到！', '#ffb070'); RX.log.push(['wave2', +GAME.t.toFixed(1)]); }
    if (RX.wave === 2 && boss.alive) { RX.wave = 3; KW = { 0: 0.7, 1: 0.3 }; }
  }; }
  function reset() {
    Object.assign(LB.G, { on: false, cam: 0, cw: 0 }); gd.hidden = true; warnRing.visible = warnFill.visible = false; bird.visible = false;
    LB.p2 = false; LB.fin = 0; LB.grabCd = 5; ZH.u70 = ZH.u35 = false; SPIN.fill(0); SPS.fill(0); RX.wave = 1; RX.waitMsg = 0;
  }
  { const gs0 = GAME.start; GAME.start = function (c) { reset(); if (RX.on) { MAX_ALIVE = RX.alive; RX.grabs.length = 0; RX.log.length = 0; RX.dmg = {}; } return gs0.call(this, c); }; }   // 再戰：重設
  RX.start = (alive) => {   // BRAWL.start 之前叫
    RX.on = true; RX.alive = alive; KIND_PAL[0] = WPAL[0]; KIND_PAL[1] = WPAL[1]; TX.win = '時空裂縫封印！'; TX.lose = '敗走…'; reset();
  };
  RX.stop = () => { RX.on = false; KIND_PAL[0] = KP0[0]; KIND_PAL[1] = KP0[1]; TX.win = TX0.win; TX.lose = TX0.lose; reset(); if (WEI.L && WEI.shown) flushWei(false); };
  RX.dbg = { get boss() { return boss; }, get player() { return player; }, S, LB, ZH, get kos() { return kos; }, get target() { return KO_TARGET; }, get state() { return GAME.state; }, get CHAR() { return CHAR; } };
  return RX;
};
