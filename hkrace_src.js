'use strict';
// ============ 香港賽車（獨立版）：彌敦道 → 梳士巴利道 → 廣東道 → 佐敦道 ============
// 由 hkcity 嘅 KOWLOON DRIFT 抽出嚟：唔再載成個城市，只串流賽道兩邊嘅地政總署大廈圖幅 + 4 架香港車
const TOUCH = matchMedia('(pointer:coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.25 : 1.5));
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = 0xa9c9e8; scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 220, TOUCH ? 850 : 1300);
const camera = new THREE.PerspectiveCamera(66, 1, 0.5, TOUCH ? 950 : 1450);
function layout() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', layout); layout();
scene.add(new THREE.HemisphereLight(0xe4eeff, 0x5a5650, 0.85));
const sunL = new THREE.DirectionalLight(0xffffff, 0.85); sunL.position.set(300, 520, 180); scene.add(sunL);
const cam = { mode: 'race', wx: 0, wz: 0, wyaw: 0 };
{ const g = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 60, 60), new THREE.MeshLambertMaterial({ color: 0x6b6c6e, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.15; scene.add(g); }   /* 一塊 9000 m 大三角形喺遠處同瀝青 z-fight，賽道會變灰：切細 + 降低 + polygonOffset */

// 地政總署圖幅：只揀賽道 150 米內嘅（RACE_TILES），按鏡頭距離載入 / 卸走，一次載一份
const TILES = (() => {
  const list = (window.RACE_TILES || []).map((t) => ({ ...t, state: 0, mesh: null, mat: null, hdr: null, lo: null, hi: null, hiState: 0, hiLvl: -1 }));
  const MAXN = TOUCH ? 24 : 90, R = TOUCH ? 450 : 900; let busy = false, t0 = 0;
  // 高清貼圖：最近幾份由 1024 換 2048（手機）／4096（電腦最近 3 份），載完先換，遠咗就放返 1024
  const MAXHI = TOUCH ? 3 : 8, RH = TOUCH ? 200 : 320, N0 = TOUCH ? 0 : 2, RH0 = 110;
  const setMap = (t, tex) => { t.mat.map = tex; if (t.mat.emissiveMap) t.mat.emissiveMap = tex; t.mat.needsUpdate = true; };
  const dist = (t, x, z) => { const [x0, z0, x1, z1] = t.bb; return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)); };
  async function load(t) {
    t.state = 1; busy = true;
    try { const r = await loadTile('tiles/', t.s, 2); t.mesh = r.mesh; t.mat = r.mat; t.hdr = r.hdr; t.lo = r.mat.map; scene.add(r.mesh); t.state = 2; }
    catch (e) { t.state = -1; console.warn('tile', t.s, e.message); }
    busy = false;
  }
  async function upgrade(t, lvl) {
    t.hiState = 1; busy = true;
    try { const tex = await loadTileTex('tiles/', t.hdr, lvl); if (t.state === 2 && t.hiState === 1) { if (t.hi) t.hi.dispose(); t.hi = tex; t.hiLvl = lvl; setMap(t, tex); t.hiState = 2; } else tex.dispose(); }
    catch (e) { t.hiState = -1; console.warn('tile hi', t.s, e.message); }
    busy = false;
  }
  function downgrade(t) { if (t.hi) { setMap(t, t.lo); t.hi.dispose(); t.hi = null; } t.hiState = 0; t.hiLvl = -1; }
  function unload(t) { downgrade(t); scene.remove(t.mesh); t.mesh.geometry.dispose(); if (t.lo) t.lo.dispose(); t.mat.dispose(); t.mesh = t.mat = t.lo = null; t.state = 0; }
  function step(dt, x, z) {
    TEXQ.pump();
    if (location.protocol === 'file:' || (t0 -= dt) > 0) return; t0 = 0.4;
    const ranked = list.filter((t) => t.state >= 0).map((t) => [dist(t, x, z), t]).sort((a, b) => a[0] - b[0]);
    api.hi = list.filter((t) => t.hiState >= 1).length;
    ranked.forEach(([d, t], k) => {
      if (t.state !== 2) return;
      if (d > R + 200 || k >= MAXN + 4) unload(t);
      else if (t.hiState === 2 && (d > RH + 80 || k >= MAXHI + 2 || (t.hiLvl === 0 && (k >= N0 + 2 || d > RH0 + 60)))) downgrade(t);
    });
    api.near = ranked.filter(([d]) => d <= R).length; api.loaded = list.filter((t) => t.state === 2).length;
    if (busy) return;
    const ld = ranked.slice(0, MAXN).find(([d, t]) => d <= R && t.state === 0);
    const want = (k, d) => (k < N0 && d <= RH0 ? 0 : 1);
    const up = ranked.slice(0, MAXHI).find(([d, t], k) => d <= RH && t.state === 2 && ((t.hiState === 0 && api.hi < MAXHI) || (t.hiState === 2 && want(k, d) < t.hiLvl)));
    /* 大廈幾何優先：250 m 內仲有未載嘅份，就唔換高清 */
    if (ld && (!up || ld[0] <= 250 || ld[0] <= up[0] + 60)) load(ld[1]); else if (up) upgrade(up[1], want(ranked.indexOf(up), up[0]));
  }
  const api = { step, list, near: 0, loaded: 0, hi: 0 };
  return api;
})();
const CL = buildCars(window.HKR_CARS);
if (TOUCH) document.body.classList.add('touch');
// ============ KOWLOON DRIFT：喺真實香港街道賽車（彌敦道 → 梳士巴利道 → 廣東道 → 佐敦道）============
// 車、漂移、氮氣、道具、AI、聲音由 games/racer 搬過嚟；賽道 = hk-city/race_route.py（真路網 + 路政署車路闊度）。
// 全部包喺 IIFE 入面，唔會同地圖嘅 GAME / keys / P 等名撞。用地圖嘅 scene、camera、cam、TRAFFIC、setMode。
window.RACE = (() => {
  const TX = { title: '香港賽車', sub: '彌敦道 → 梳士巴利道 → 廣東道 → 佐敦道・兩圈・揀架車',  hintKey: '自動油門・←→ 轉彎・轉彎時按住空白鍵漂移', hintTouch: '自動油門・轉彎時按住「漂移」儲氮氣',
    start: '開始', again: '再玩一次', back: '返回地圖', rot: '請將手機打橫玩 ↻', drift: '漂移', nitro: '氮氣', item: '道具', nlbl: '集氣',
    items: { BOOST: '加速', BANANA: '香蕉皮', MISSILE: '飛彈' }, go: '衝！', finalLap: '最後一圈', win: '冠軍！',
    finish: (p) => `第 ${p} 名完成`, mini: '小噴射', lap: '圈數', bestLap: (t) => `最佳單圈 ${t}`,
    fire: (n) => `飛彈 → ${n}`, fired: (n) => `${n} 向你射飛彈！`, ord: ['第1名', '第2名', '第3名', '第4名'], me: '我',
    time: (t) => `完成時間 ${t}`, best: (t) => `最佳冠軍時間 ${t}`, noBest: '贏一場就會記錄最佳時間',
    help: [['←', '→', '轉彎（油門自動）'], ['↓', '剎車'], ['空白鍵', '＋方向 = 漂移 → 儲氮氣'], ['Shift', '放氮氣'], ['X', '用道具'], ['M', '音樂開／關'], ['H', '隱藏說明'], ['Esc', '返回地圖']],
    howto: [['◀ ▶', '轉彎（油門自動）'], ['漂移', '轉彎時按住 → 儲氮氣'], ['氮氣', '集滿一格就撳'], ['道具', '食咗道具箱就撳']],
    tipDrift: (t) => t ? '入彎！按住漂移 + 方向' : '入彎！按住空白鍵 + ←/→ 漂移', tipNitro: (t) => t ? '氮氣滿咗 → 撳氮氣' : '氮氣滿咗 → 按 Shift',
    tipItem: (t) => t ? '有道具 → 撳道具' : '有道具 → 按 X' };
  const LAPS = 2;
  const $ = (id) => document.getElementById(id);

  // ---------- 介面（racer 嘅 HUD，id 改名避開地圖：rtime / rhelp）----------
  document.head.insertAdjacentHTML('beforeend', `<style>
.panel{position:fixed;background:rgba(14,18,48,.72);border:1px solid rgba(140,160,255,.35);border-radius:12px;pointer-events:none;text-shadow:0 1px 4px #000}
#board{top:10px;left:10px;padding:6px 0;min-width:150px;font-size:14px;font-weight:700}
#board div{display:flex;align-items:center;gap:8px;padding:3px 12px}
#board div.me{background:linear-gradient(90deg,rgba(255,170,60,.75),rgba(255,170,60,0))}
#board i{font-style:italic;color:#ffd23f;width:14px}
#board b{width:10px;height:10px;border-radius:50%;display:inline-block}
#lapbox{top:10px;left:50%;transform:translateX(calc(-100% - 6px));padding:4px 14px;text-align:center}
#timebox{top:10px;left:50%;transform:translateX(6px);padding:4px 16px;text-align:center}
.big{font-size:28px;font-weight:900;font-style:italic;line-height:1.1}
#lapbox .big{color:#ffd23f}
.lbl{font-size:12px;opacity:.75}
#minibox{top:10px;right:10px;padding:6px}
#mini{width:130px;height:130px;display:block}
#dial{position:fixed;right:14px;bottom:10px;width:190px;height:190px;pointer-events:none}
#nitrobox{bottom:14px;left:50%;transform:translateX(-50%);width:min(46vw,420px);padding:8px 12px;display:flex;align-items:center;gap:10px}
#nitrobox .lbl{opacity:1;font-weight:700;white-space:nowrap}
#nfill{flex:1;height:12px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}
#nfill b{display:block;height:100%;width:0;background:linear-gradient(90deg,#28d7ff,#ff3fd1)}
.n2o{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;font-style:italic;opacity:.5}
.n2o.on{opacity:1;border-color:#28d7ff;background:radial-gradient(#28d7ff,#1450ff);box-shadow:0 0 14px #28d7ff}
#place{position:fixed;left:18px;bottom:10px;font-size:84px;font-weight:900;font-style:italic;color:#ffd23f;text-shadow:0 0 16px rgba(0,0,0,.7);pointer-events:none;line-height:1}
#place small{font-size:32px;color:#fff}
#spdtxt{display:none}
#item{bottom:74px;left:50%;transform:translateX(-50%);padding:5px 16px;font-weight:900;font-size:16px;border-color:#ffd23f}
#rhelp{left:14px;bottom:110px;padding:10px 14px;font-size:13px;line-height:2;max-width:330px}
#rhelp kbd{display:inline-block;min-width:18px;padding:0 6px;margin:0 2px;border-radius:5px;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);font:700 12px/20px inherit;font-family:inherit;text-align:center}
#speed{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .25s;
  background:repeating-conic-gradient(from 0deg at 50% 45%,rgba(255,255,255,.16) 0 .6deg,transparent .6deg 5deg);
  -webkit-mask:radial-gradient(circle at 50% 45%,transparent 32%,#000 75%);mask:radial-gradient(circle at 50% 45%,transparent 32%,#000 75%)}
#banner{position:fixed;left:0;right:0;top:26%;text-align:center;font-size:clamp(40px,12vw,96px);font-weight:900;font-style:italic;pointer-events:none;opacity:0;text-shadow:0 0 18px currentColor}
#banner.show{animation:pop 1.1s ease-out}
#small{position:fixed;left:0;right:0;top:17%;text-align:center;font-size:clamp(18px,5vw,26px);font-weight:900;pointer-events:none;opacity:0;text-shadow:0 0 10px #000}
#small.show{animation:pop 1.1s ease-out}
#tip{position:fixed;left:50%;top:30%;transform:translateX(-50%);padding:10px 18px;border-radius:14px;background:rgba(255,63,209,.85);font-weight:900;font-size:clamp(15px,4vw,20px);pointer-events:none;box-shadow:0 0 24px rgba(255,63,209,.6);white-space:nowrap}
@keyframes pop{0%{opacity:0;transform:scale(2.2)}15%{opacity:1;transform:scale(1)}70%{opacity:1}100%{opacity:0;transform:translateY(-20px)}}
.screen{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:rgba(20,5,40,.45);padding:0 16px}
.screen h1{font-size:clamp(40px,11vw,84px);margin:0;font-style:italic;background:linear-gradient(90deg,#28d7ff,#ff3fd1,#ffd23f);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 10px rgba(0,0,0,.6))}
.screen p{opacity:.9;font-size:14px;margin:8px 0;text-shadow:0 1px 4px #000}
.screen button{margin-top:16px;font:bold 22px inherit;font-family:inherit;color:#fff;background:linear-gradient(90deg,#2a7fff,#ff3fd1);border:0;border-radius:40px;padding:14px 44px;cursor:pointer}
.screen button.back{font-size:15px;padding:9px 26px;background:rgba(20,30,50,.75);border:1px solid rgba(160,210,255,.5);margin-top:12px}
#mus,#rx{position:fixed;top:10px;left:50%;transform:translateX(calc(100% + 150px));width:34px;height:34px;border-radius:50%;background:rgba(14,18,48,.72);border:1px solid rgba(140,160,255,.35);color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer}
#rx{transform:translateX(calc(100% + 192px))}
#ctl{display:none}
.b{position:fixed;bottom:14px;width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#fff}
.b.on{background:rgba(255,63,209,.5)}
body.tips .b{animation:pulse 1s ease-in-out infinite}
body.tips #banner{top:55%}
@keyframes pulse{50%{box-shadow:0 0 18px 4px rgba(255,63,209,.8)}}
#howto{left:50%;top:22%;transform:translateX(-50%);padding:10px 18px;font-size:14px;line-height:1.9;white-space:nowrap}
#howto b{display:inline-block;min-width:44px;margin-right:8px;padding:0 6px;border-radius:10px;background:rgba(255,255,255,.18);text-align:center}
#bl{left:14px;font-size:30px}#br{left:94px;font-size:30px}
#bd{right:14px;width:76px;height:76px;border-color:#28d7ff}#bn{right:102px;border-color:#ff3fd1}#bi{right:14px;bottom:102px;border-color:#ffd23f}
#rot{position:fixed;inset:0;background:#14082a;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;text-align:center;padding:20px}
body.race #modes,body.race #time,body.race #help{display:none}
body.race #hud{left:50%;top:64px;transform:translateX(-50%);text-align:center}
body.race #street{font-size:18px}
body.touch #ctl{display:block}
body.touch #dial,body.touch #rhelp,body.touch #place{display:none}
body.touch #board{font-size:11px;min-width:0;padding:3px 0}
body.touch #board div{padding:1px 8px;gap:5px}
body.touch #lapbox,body.touch #timebox{padding:2px 10px}
body.touch .big{font-size:20px}
body.touch .lbl{font-size:10px}
body.touch #mini{width:84px;height:84px}
body.touch #minibox{padding:4px}
body.touch #nitrobox{bottom:10px;width:min(38vw,300px);padding:4px 8px;gap:6px}
body.touch .n2o{width:24px;height:24px;font-size:8px}
body.touch #spdtxt{display:block;position:fixed;bottom:48px;left:50%;transform:translateX(-50%);font-size:22px;font-weight:900;font-style:italic;text-shadow:0 0 8px #000;pointer-events:none}
body.touch #item{left:auto;transform:none;right:98px;bottom:108px;font-size:13px}
body.touch #mus{transform:translateX(calc(100% + 110px));width:28px;height:28px}
body.touch #rx{transform:translateX(calc(100% + 144px));width:28px;height:28px}
body.touch.race #hud{top:48px}
body.touch.race #street{font-size:14px}
#pick{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:10px 0 2px}
#pick .car{pointer-events:auto;cursor:pointer;width:150px;padding:8px 10px;border-radius:12px;background:rgba(14,18,48,.78);border:2px solid rgba(255,255,255,.25);text-align:left;font-size:12px}
#pick .car.on{border-color:#ffd23f;box-shadow:0 0 16px rgba(255,210,63,.6)}
#pick .car h3{margin:0 0 4px;font-size:18px;font-style:italic}
#pick .car i{display:inline-block;width:34px;opacity:.8;font-style:normal}
#pick .car s{display:inline-block;width:9px;height:7px;margin-right:2px;border-radius:2px;background:rgba(255,255,255,.18);text-decoration:none}
#pick .car s.f{background:#ffd23f}
#pick .car p{margin:4px 0 0;font-size:11px;opacity:.85}
#credit{position:fixed;left:6px;bottom:4px;font-size:10px;opacity:.6;max-width:70vw;pointer-events:none}
body.touch #pick .car{width:120px;padding:5px 7px}
body.touch #pick .car h3{font-size:15px}
body.touch .screen h1{font-size:34px}
body.touch #pick .car p{display:none}
</style>`);
  document.body.insertAdjacentHTML('beforeend', `<div id="rui" hidden>
<div id="speed"></div>
<div class="panel" id="board" hidden></div>
<div class="panel" id="lapbox" hidden><div class="big" id="lap"></div><div class="lbl" id="laplbl"></div></div>
<div class="panel" id="timebox" hidden><div class="big" id="rtime"></div><div class="lbl" id="bestlap"></div></div>
<div class="panel" id="minibox" hidden><canvas id="mini" width="260" height="260"></canvas></div>
<canvas id="dial" width="380" height="380" hidden></canvas>
<div id="place" hidden></div>
<div id="spdtxt" hidden></div>
<div class="panel" id="nitrobox" hidden><span class="lbl" id="nlbl"></span><div id="nfill"><b></b></div><div class="n2o">N₂O</div><div class="n2o">N₂O</div></div>
<div class="panel" id="item" hidden></div>
<div class="panel" id="rhelp" hidden></div>
<div class="panel" id="howto" hidden></div>
<div id="tip" hidden></div>
<div id="banner"></div><div id="small"></div>
<div id="mus" hidden>♪</div><div id="rx" hidden>✕</div>
<div id="ctl" hidden><div class="b" id="bl" data-k="left">◀</div><div class="b" id="br" data-k="right">▶</div>
<div class="b" id="bd" data-k="drift"></div><div class="b" id="bn" data-k="nitro"></div><div class="b" id="bi" data-k="item"></div></div>
<div class="screen" id="rtitle"><h1></h1><p id="rsub"></p><div id="pick"></div><p id="hint"></p><button id="start"></button><button class="back" id="back1"></button></div>
<div class="screen" id="over" hidden><h1 id="result"></h1><p id="final"></p><p id="best"></p><p id="meme"></p><button id="again"></button><button class="back" id="back2"></button></div>
<div id="rot" hidden></div></div>`);

  // ---------- 賽道：真路網 ----------
  const R = window.RACE_ROUTE, dec = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
  const N = R.n, PQ = dec(R.p, Int16Array), WL = Array.from(dec(R.wl, Uint8Array), (v) => v / 10), WR = Array.from(dec(R.wr, Uint8Array), (v) => v / 10);
  const P = Array.from({ length: N }, (_, i) => new THREE.Vector3(PQ[i * 2] / 4, 0, PQ[i * 2 + 1] / 4));
  const T = P.map((p, i) => P[(i + 1) % N].clone().sub(P[(i + N - 1) % N]).normalize());
  const S = T.map((t) => new THREE.Vector3(t.z, 0, -t.x));               // 路面左手邊
  const A = T.map((t, i) => t.angleTo(T[(i + 20) % N]));               // 前面 20 格有幾彎
  const SEG = R.len / N;
  // 每點嘅過彎極速（AI 用）：前後 5 格轉幾多 → 半徑 → 最高速；再向後推煞車距離
  const VC = T.map((t, i) => { const a = T[(i + N - 5) % N].angleTo(T[(i + 5) % N]) || 1e-4, r = 10 * SEG / a; return Math.min(64.5, 2.0 * r); });
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) { const nx = VC[(i + 1) % N]; VC[i] = Math.min(VC[i], Math.sqrt(nx * nx + 2 * 26 * SEG)); }
  const lateral = (i, f) => f >= 0 ? f * (WL[i] - 1.6) : f * (WR[i] - 1.6);   // f ∈ [−1, 1] → 橫向位置

  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const rng = ((s) => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(20260927);
  const pick = (a, r = rng) => a[Math.floor(r() * a.length)];
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t; }
  const RGLOW = canvasTex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
  function glowSprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: RGLOW, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
    s.scale.set(size, size, 1); return s;
  }
  // 沿賽道嘅帶：o0(i)→o1(i) 係橫向位置，y0→y1 係高度
  function ribbon(o0, o1, y0, y1, uLen, flip) {
    const pos = [], uv = [], idx = []; let u = 0;
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = P[k], s = S[k], a = o0(k), b = o1(k);
      if (i) u += SEG / uLen;
      pos.push(p.x + s.x * a, y0, p.z + s.z * a, p.x + s.x * b, y1, p.z + s.z * b); uv.push(flip ? -u : u, 0, flip ? -u : u, 1);
      if (i < N) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const rep = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  // 防撞欄（澳門格蘭披治街道賽咁）：紅白混凝土欄 + 上面一排廣告板
  const ADS = [['STONKS', '#1f5fd6', '#fff'], ['GG EZ', '#e0283a', '#fff'], ['SKILL ISSUE', '#f4f4f4', '#1f5fd6'], ['TOUCH GRASS', '#f4f4f4', '#e0283a'], ['NO CAP', '#ffb400', '#111'], ['HODL', '#1b1b2e', '#28d7ff']];
  const adTex = rep(canvasTex(1536, 128, (x, w, h) => {
    ADS.forEach(([t, bg, fg], k) => {
      const x0 = k * 256; x.fillStyle = bg; x.fillRect(x0, 0, 256, h); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(x0, h - 14, 256, 14);
      x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
      let fs = 64; x.font = `italic 900 ${fs}px sans-serif`; while (x.measureText(t).width > 230) { fs -= 4; x.font = `italic 900 ${fs}px sans-serif`; }
      x.fillText(t, x0 + 128, h / 2 + 4);
    });
  }));
  const kerbTex = rep(canvasTex(64, 8, (x) => { x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, 64, 8); x.fillStyle = '#d8283a'; x.fillRect(0, 0, 32, 8); }));
  const adMat = new THREE.MeshLambertMaterial({ map: adTex, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: 0.25 });
  const kerbMat = new THREE.MeshLambertMaterial({ map: kerbTex, side: THREE.DoubleSide });
  for (const side of [1, -1]) {
    const edge = (i) => side > 0 ? WL[i] + 0.4 : -(WR[i] + 0.4);
    root.add(new THREE.Mesh(ribbon(edge, edge, 0, 0.8, 4, side < 0), kerbMat));
    root.add(new THREE.Mesh(ribbon(edge, edge, 0.8, 1.9, 14, side < 0), adMat));
  }
  // 路面（瀝青）+ 兩邊行人路：獨立版冇城市地面，自己鋪
  {
    const asph = rep(canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#3a3c40'; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 900; k++) { const v = 40 + Math.random() * 40; x.fillStyle = `rgb(${v},${v},${v + 4})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      x.fillStyle = '#e8e8e0'; x.fillRect(0, 2, w, 2); x.fillRect(0, h - 4, w, 2); }));
    const road = new THREE.Mesh(ribbon((i) => -WR[i] - 0.4, (i) => WL[i] + 0.4, 0.02, 0.02, 10), new THREE.MeshLambertMaterial({ map: asph, side: THREE.DoubleSide }));
    const pav = new THREE.MeshLambertMaterial({ color: 0x9a978f, side: THREE.DoubleSide });
    root.add(road, new THREE.Mesh(ribbon((i) => WL[i] + 0.4, (i) => WL[i] + 7, 0.05, 0.05, 10), pav), new THREE.Mesh(ribbon((i) => -WR[i] - 7, (i) => -WR[i] - 0.4, 0.05, 0.05, 10), pav));
  }
  // 起點線 + 門架
  const checker = canvasTex(64, 16, (x) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); } });
  const W0 = WL[0] + WR[0];
  const line0 = new THREE.Mesh(new THREE.PlaneGeometry(W0, 3), new THREE.MeshBasicMaterial({ map: checker }));
  line0.rotation.x = -Math.PI / 2; line0.rotation.z = Math.atan2(T[0].x, T[0].z);
  line0.position.set(P[0].x + S[0].x * (WL[0] - WR[0]) / 2, 0.09, P[0].z + S[0].z * (WL[0] - WR[0]) / 2); root.add(line0);
  {
    const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x2a3050 });
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), m); post.position.set(sx * (W0 / 2 + 1.5), 6, 0); g.add(post); }
    const face = new THREE.MeshBasicMaterial({ map: canvasTex(512, 72, (x, w, h) => {
      x.fillStyle = '#10051f'; x.fillRect(0, 0, w, h); x.strokeStyle = '#ff3fd1'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
      x.fillStyle = '#ffd23f'; x.font = 'italic 900 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('START / FINISH', w / 2, h / 2 + 2);
    }) });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(W0 + 4, 3.2, 0.6), [m, m, m, m, face, face]);
    sign.position.y = 11; sign.rotation.y = Math.PI; g.add(sign);
    g.position.copy(line0.position); g.position.y = 0; g.rotation.y = Math.atan2(T[0].x, T[0].z); root.add(g);
  }
  // 彎位箭咀牌：外側防撞欄上面
  {
    const chev = canvasTex(128, 64, (x, w, h) => { x.fillStyle = '#10051f'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd23f'; for (let k = 0; k < 3; k++) { const o = 14 + k * 38; x.beginPath(); x.moveTo(o, 8); x.lineTo(o + 26, 32); x.lineTo(o, 56); x.lineTo(o + 12, 56); x.lineTo(o + 38, 32); x.lineTo(o + 12, 8); x.fill(); } });
    const cm = new THREE.MeshBasicMaterial({ map: chev, side: THREE.DoubleSide });
    for (let i = 0; i < N; i += 6) {
      const turn = T[i].x * T[(i + 12) % N].z - T[i].z * T[(i + 12) % N].x;   // 正 = 向右轉
      if (A[i] < 0.5) continue;
      const out = turn > 0 ? WL[i] + 0.6 : -(WR[i] + 0.6), b = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), cm);
      b.position.set(P[i].x + S[i].x * out, 2.8, P[i].z + S[i].z * out); b.rotation.y = Math.atan2(T[i].x, T[i].z) + Math.PI + (turn > 0 ? 0 : Math.PI);
      if (turn <= 0) b.scale.x = -1;
      root.add(b);
    }
  }
  // 封路：賽道範圍內嘅街車收起（10 米格）
  const CLOSED = new Set();
  for (let i = 0; i < N; i++) for (let o = -WR[i] - 3; o <= WL[i] + 3; o += 4) CLOSED.add(Math.floor((P[i].x + S[i].x * o) / 10) * 100000 + Math.floor((P[i].z + S[i].z * o) / 10));
  const closed = (x, z) => CLOSED.has(Math.floor(x / 10) * 100000 + Math.floor(z / 10));

  // ---------- 火花 / 胎痕 ----------
  const PMAX = 400, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: RGLOW, size: 0.9, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; root.add(pts);
  let pNext = 0;
  function spark(x, y, z, col, spread = 6, up = 3) {
    const k = pNext; pNext = (pNext + 1) % PMAX;
    pPos.set([x, y, z], k * 3); pVel.set([(Math.random() - 0.5) * spread, Math.random() * up, (Math.random() - 0.5) * spread], k * 3); pCol.set([col.r, col.g, col.b], k * 3); pLife[k] = 0.5 + Math.random() * 0.3;
  }
  function boom(x, z, n = 40) { const c = new THREE.Color(0xffa040); for (let k = 0; k < n; k++) spark(x, 1, z, c, 18, 10); }
  function stepParticles(dt) {
    for (let k = 0; k < PMAX; k++) {
      if (pLife[k] <= 0) continue;
      pLife[k] -= dt; pVel[k * 3 + 1] -= 9 * dt;
      for (let a = 0; a < 3; a++) pPos[k * 3 + a] += pVel[k * 3 + a] * dt;
      if (pLife[k] <= 0) pPos[k * 3 + 1] = -100;
    }
    pGeo.attributes.position.needsUpdate = true;
  }
  const SK = 900, skPos = new Float32Array(SK * 12), skGeo = new THREE.BufferGeometry();
  skGeo.setAttribute('position', new THREE.BufferAttribute(skPos, 3)); { const ix = []; for (let k = 0; k < SK; k++) ix.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 1, k * 4 + 3, k * 4 + 2); skGeo.setIndex(ix); }
  const skMesh = new THREE.Mesh(skGeo, new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  skMesh.frustumCulled = false; root.add(skMesh);
  let skNext = 0;
  function skid(ax, az, bx, bz, nx, nz) {
    const w = 0.13, y = 0.11, k = skNext; skNext = (skNext + 1) % SK;
    skPos.set([ax - nx * w, y, az - nz * w, ax + nx * w, y, az + nz * w, bx - nx * w, y, bz - nz * w, bx + nx * w, y, bz + nz * w], k * 12);
    skGeo.attributes.position.needsUpdate = true;
  }
  function clearSkids() { skPos.fill(0); skGeo.attributes.position.needsUpdate = true; }

  // ---------- 車（低多邊形跑車）----------
  const shadowTex = canvasTex(64, 128, (x) => { const g = x.createRadialGradient(32, 64, 4, 32, 64, 60); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 128); });
  function extrudeSide(pts2, width, bevel) {
    const s = new THREE.Shape(); pts2.forEach(([z, y], k) => k ? s.lineTo(z, y) : s.moveTo(z, y));
    const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
    g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2); return g;
  }
  function makeHKCar(model) {
    const g = new THREE.Group(), geo = CL.geo(model, 'white'); geo.computeBoundingBox();
    const bb = geo.boundingBox, zf = bb.max.z, zr = bb.min.z, w = bb.max.x - bb.min.x;
    g.add(new THREE.Mesh(geo, CL.matFor(model)));
    const tg = glowSprite(0xff2040, 2.2, 0.55); tg.position.set(0, 0.9, zr - 0.1); g.add(tg);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.2, zf - zr + 1.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06; g.add(sh);
    const flame = [-0.45, 0.45].map((x) => { const f = glowSprite(0x4fd8ff, 1.8, 0.95); f.position.set(x, 0.5, zr - 0.3); f.visible = false; g.add(f); return f; });
    g.userData = { flame, wheels: [] };
    root.add(g); return g;
  }
  function makeCar(color) {
    const g = new THREE.Group();
    const paint = new THREE.MeshPhongMaterial({ color, shininess: 120, specular: 0x999999 });
    const glass = new THREE.MeshPhongMaterial({ color: 0x141a2e, shininess: 150, specular: 0xaabbff });
    const black = new THREE.MeshLambertMaterial({ color: 0x151518 }), rim = new THREE.MeshPhongMaterial({ color: 0xcfd3dc, shininess: 80 });
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    add(extrudeSide([[-2.25, 0.32], [2.3, 0.32], [2.38, 0.55], [2.05, 0.8], [1.15, 0.98], [-1.85, 1.0], [-2.3, 0.85]], 1.95, 0.08), paint);
    add(extrudeSide([[-1.05, 0.97], [1.1, 0.97], [0.35, 1.48], [-0.55, 1.46]], 1.6, 0.06), glass);
    add(new THREE.BoxGeometry(2.4, 0.09, 0.6), paint, 0, 1.42, -2.0);
    for (const x of [-0.7, 0.7]) add(new THREE.BoxGeometry(0.1, 0.42, 0.25), black, x, 1.2, -1.95);
    add(new THREE.BoxGeometry(2.1, 0.22, 0.4), black, 0, 0.35, 2.25);
    const tire = new THREE.CylinderGeometry(0.47, 0.47, 0.42, 14); tire.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(0.3, 0.3, 0.44, 8); hub.rotateZ(Math.PI / 2);
    const wheels = [];
    for (const x of [-1.05, 1.05]) for (const z of [-1.45, 1.45]) {
      const w = new THREE.Group(); w.position.set(x, 0.47, z); w.add(new THREE.Mesh(tire, black)); w.add(new THREE.Mesh(hub, rim)); g.add(w); wheels.push(w);
    }
    const tail = new THREE.MeshBasicMaterial({ color: 0xff1a3c }), head = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
    add(new THREE.BoxGeometry(1.7, 0.14, 0.05), tail, 0, 0.8, -2.36);
    for (const x of [-0.7, 0.7]) add(new THREE.BoxGeometry(0.5, 0.12, 0.05), head, x, 0.62, 2.4);
    const tg = glowSprite(0xff2040, 2.6, 0.7); tg.position.set(0, 0.8, -2.45); g.add(tg);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.13; g.add(sh);
    const under = glowSprite(color, 5.5, 0.35); under.position.y = 0.2; g.add(under);
    const flame = [-0.55, 0.55].map((x) => { const f = glowSprite(0x4fd8ff, 1.8, 0.95); f.position.set(x, 0.5, -2.6); f.visible = false; g.add(f); return f; });
    g.userData = { flame, wheels };
    root.add(g); return g;
  }
  // 香港車（hkcity 嘅 3D 車模型）：揀一架，其餘三架做 AI 對手；每架手感唔同
  const CARDEF = [
    { id: 'hktaxi', name: '的士', css: '#e0283a', st: { v: 1.0, a: 1.0, s: 1.12, slip: 0.42, wall: 2.5, spin: 1.2 }, bars: [4, 4, 5, 3], note: '快、轉得靈' },
    { id: 'police_car', name: '警車', css: '#2f6bff', st: { v: 1.0, a: 1.35, s: 1.0, slip: 0.42, wall: 2.5, spin: 1.2 }, bars: [4, 5, 4, 3], note: '加速最快' },
    { id: 'minibus', name: '綠 van', css: '#2fbf5a', st: { v: 0.96, a: 0.95, s: 0.96, slip: 0.3, wall: 1.3, spin: 0.7 }, bars: [3, 3, 3, 5], note: '穩陣：撞欄、中招都唔多蝕' },
    { id: 'minibus_red', name: '紅 van', css: '#ff8a2a', st: { v: 1.08, a: 0.9, s: 0.88, slip: 0.62, wall: 2.5, spin: 1.2 }, bars: [5, 3, 2, 2], note: '極速最高，轉彎易甩尾' },
  ];
  const cars = CARDEF.map((d) => ({ mesh: makeHKCar(d.id), css: d.css, name: d.name, label: d.name, model: d.id, st: d.st, def: d }));
  let player = cars[0];
  function choose(k) {
    player = cars[k]; let s = 0;
    cars.forEach((c) => { c.player = c === player; c.label = c.player ? TX.me : c.name; c.skill = c.player ? 1 : [0.98, 0.95, 0.92][s++]; });
    document.querySelectorAll('#pick .car').forEach((e, i) => e.classList.toggle('on', i === k));
    try { localStorage.setItem('hkrace-car', k); } catch (e) {}
    placeCars();
  }
  const itemTypes = ['BOOST', 'BANANA', 'MISSILE'];
  const boxes = [], bananas = [], missiles = [];
  const qTex = canvasTex(64, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#28d7ff'); g.addColorStop(0.5, '#ff3fd1'); g.addColorStop(1, '#ffd23f'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '900 46px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', w / 2, h / 2 + 3); });
  for (const f of [0.14, 0.4, 0.62, 0.86]) {   // 道具箱：直路中段，每排 4 個
    let i = Math.floor(f * N); for (let k = 0; k < 80 && A[i] > 0.12; k++) i = (i + 3) % N;
    for (const q of [-0.7, -0.25, 0.25, 0.7]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), new THREE.MeshBasicMaterial({ map: qTex, transparent: true, opacity: 0.92 }));
      const lat = lateral(i, q), x = P[i].x + S[i].x * lat, z = P[i].z + S[i].z * lat; m.position.set(x, 1.5, z);
      const gl = glowSprite(0xff9ae8, 5, 0.55); gl.position.set(x, 1.5, z);
      root.add(m, gl); boxes.push({ m, gl, x, z, cd: 0 });
    }
  }
  const bananaGeo = new THREE.TorusGeometry(0.6, 0.22, 6, 10, Math.PI * 1.2), bananaMat = new THREE.MeshLambertMaterial({ color: 0xffe14a, emissive: 0x554400 });

  // ---------- 輸入 ----------
  const keys = {}, touch = {};
  let music = true, helpOn = true;
  addEventListener('keydown', (e) => {
    if (!active) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true; if (e.key === ' ') e.preventDefault();
    if (e.repeat) return;
    if (k === 'h' && GAME.state === 'play') helpOn = !helpOn;
    if (k === 'm') toggleMusic();
    if (k === 'Escape') exit();
  });
  addEventListener('keyup', (e) => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
  const isTouch = () => document.body.classList.contains('touch');
  function markTouch() { document.body.classList.add('touch'); $('hint').textContent = TX.hintTouch; }
  if (matchMedia('(pointer:coarse)').matches) markTouch();
  addEventListener('touchstart', markTouch, { once: true, passive: true });
  document.querySelectorAll('#ctl .b').forEach((b) => {
    const k = b.dataset.k, on = (v) => (e) => { e.preventDefault(); touch[k] = v; b.classList.toggle('on', v); };
    b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false));
    b.addEventListener('pointercancel', on(false)); b.addEventListener('pointerleave', on(false));
  });
  const input = () => ({
    steer: (keys.ArrowLeft || keys.a || touch.left ? 1 : 0) - (keys.ArrowRight || keys.d || touch.right ? 1 : 0),
    brake: !!(keys.ArrowDown || keys.s),
    drift: !!(keys[' '] || touch.drift),
    nitro: !!(keys.Shift || keys.n || touch.nitro),
    item: !!(keys.x || keys.e || touch.item),
  });

  // ---------- 聲音：WebAudio 即時合成（同 racer 一樣）----------
  const SND = {
    ctx: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(c.destination);
      this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = music ? 0.32 : 0; this.mus.connect(this.master);
      const nb = this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.eng = c.createGain(); this.eng.gain.value = 0; this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.Q.value = 3;
      this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'sawtooth'; this.o2.detune.value = -1190;
      this.o3 = c.createOscillator(); this.o3.type = 'square'; const g3 = c.createGain(); g3.gain.value = 0.25;
      this.o1.connect(this.engF); this.o2.connect(this.engF); this.o3.connect(g3); g3.connect(this.engF); this.engF.connect(this.eng); this.eng.connect(this.sfx);
      [this.o1, this.o2, this.o3].forEach((o) => o.start());
      const sk = c.createBufferSource(); sk.buffer = nb; sk.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 6;
      this.skid = c.createGain(); this.skid.gain.value = 0; sk.connect(bp); bp.connect(this.skid); this.skid.connect(this.sfx); sk.start();
      const wn = c.createBufferSource(); wn.buffer = nb; wn.loop = true; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      this.wind = c.createGain(); this.wind.gain.value = 0; wn.connect(lp); lp.connect(this.wind); this.wind.connect(this.sfx); wn.start();
      this.nextNote = c.currentTime + 0.1; this.step16 = 0;
    },
    engine(v, boost, on, drifting) {
      if (!this.ctx) return;
      const gears = [0, 16, 30, 44, 58, 74, 200]; let g = 0; while (v > gears[g + 1]) g++;
      const t = Math.min(1, (v - gears[g]) / (gears[g + 1] - gears[g])), rpm = 0.3 + 0.7 * t;
      const f = 38 + rpm * 70 + g * 5 + (boost ? 18 : 0), now = this.ctx.currentTime;
      this.o1.frequency.setTargetAtTime(f, now, 0.05); this.o2.frequency.setTargetAtTime(f, now, 0.05); this.o3.frequency.setTargetAtTime(f * 0.5, now, 0.05);
      this.engF.frequency.setTargetAtTime(300 + rpm * 1500 + (boost ? 800 : 0), now, 0.05);
      this.eng.gain.setTargetAtTime(on ? 0.11 : 0, now, 0.1);
      this.skid.gain.setTargetAtTime(on && drifting ? 0.05 + Math.min(v, 60) / 60 * 0.09 : 0, now, 0.05);
      this.wind.gain.setTargetAtTime(on ? Math.min(v, 90) / 90 * 0.12 : 0, now, 0.2);
    },
    tone(freq, dur, type = 'square', vol = 0.12, slide = 1, when = 0, dest) {
      if (!this.ctx) return;
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
      o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, f0, f1, type = 'lowpass', when = 0, dest) {
      if (!this.ctx) return;
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + when;
      s.buffer = this.noiseBuf; f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.02);
    },
    pickup() { [0, 4, 7, 12].forEach((n, k) => this.tone(660 * 2 ** (n / 12), 0.12, 'square', 0.07, 1, k * 0.05)); },
    boost() { this.noise(0.9, 0.35, 300, 4000, 'lowpass'); this.tone(110, 0.9, 'sawtooth', 0.12, 3); },
    mini() { this.noise(0.4, 0.2, 500, 3000); this.tone(220, 0.35, 'sawtooth', 0.08, 2); },
    hit() { this.noise(0.6, 0.5, 2000, 80); this.tone(90, 0.5, 'sine', 0.35, 0.4); },
    launch() { this.tone(900, 0.5, 'sawtooth', 0.07, 0.35); this.noise(0.5, 0.15, 3000, 600, 'bandpass'); },
    scrape() { this.noise(0.25, 0.18, 3000, 1200, 'bandpass'); },
    beep(hi) { this.tone(hi ? 1320 : 660, hi ? 0.5 : 0.18, 'square', 0.1); },
    fanfare(win) { (win ? [0, 4, 7, 12, 16] : [0, 3, 7]).forEach((n, k) => this.tone(523 * 2 ** (n / 12), 0.25, 'triangle', 0.14, 1, k * 0.12)); },
    tick() {
      if (!this.ctx || !music || GAME.state !== 'play') return;
      const c = this.ctx, spb = 60 / 128 / 4, prog = [0, -4, -2, -7], arp = [0, 7, 12, 15, 12, 7, 3, 7];
      if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.05;
      while (this.nextNote < c.currentTime + 0.15) {
        const s = this.step16 % 16, bar = Math.floor(this.step16 / 16) % 4, root2 = 45 + prog[bar], t = this.nextNote - c.currentTime;
        if (s % 4 === 0) this.tone(150, 0.18, 'sine', 0.5, 0.3, t, this.mus);
        if (s === 4 || s === 12) this.noise(0.16, 0.25, 4000, 1500, 'highpass', t, this.mus);
        if (s % 2 === 1) this.noise(0.04, 0.08, 9000, 7000, 'highpass', t, this.mus);
        if (s % 2 === 0) this.tone(440 * 2 ** ((root2 - 69 + (s % 4 === 2 ? 12 : 0)) / 12), 0.2, 'sawtooth', 0.12, 1, t, this.mus);
        if (bar !== 3 || s < 8) this.tone(440 * 2 ** ((root2 + 24 + arp[s % 8] - 69) / 12), 0.12, 'square', 0.035, 1, t, this.mus);
        this.nextNote += spb; this.step16++;
      }
    },
  };
  function toggleMusic() { music = !music; $('mus').style.opacity = music ? 1 : 0.4; if (SND.mus) SND.mus.gain.value = music ? 0.32 : 0; }
  $('mus').onclick = toggleMusic;

  // ---------- 遊戲邏輯 ----------
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = THREE.MathUtils.clamp;
  function nearest(x, z, idx) {
    let best = idx, bd = 1e12;
    for (let k = -25; k <= 45; k++) { const j = (idx + k + N) % N, d = (P[j].x - x) ** 2 + (P[j].z - z) ** 2; if (d < bd) { bd = d; best = j; } }
    return best;
  }
  const ORD = TX.ord;
  function banner(text, color) { const b = $('banner'); b.textContent = text; b.style.color = color; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  function small(text, color = '#fff') { const b = $('small'); b.textContent = text; b.style.color = color; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  let tipT = 0;
  function tip(text) { $('tip').textContent = text; $('tip').hidden = false; tipT = 3; }
  const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  function spin(c, by) {
    if (c.spin > 0) return;
    c.spin = c.st.spin; c.v *= c.st.spin < 1 ? 0.5 : 0.3; c.drift = false; c.driftT = 0;
    boom(c.x, c.z, 30); if (c === player || by === player) SND.hit();
    if (c === player) small('THIS IS FINE', '#ff5a3c');
    else if (by === player) small('L + RATIO', '#ffd23f');
  }
  function useItem(c) {
    const it = c.item; c.item = null; if (!it) return;
    const f = { x: Math.sin(c.h), z: Math.cos(c.h) };
    if (it === 'BOOST') { c.boost = Math.max(c.boost, 1.8); if (c === player) SND.boost(); }
    else if (it === 'BANANA') {
      const m = new THREE.Mesh(bananaGeo, bananaMat); m.position.set(c.x - f.x * 4, 0.35, c.z - f.z * 4); m.rotation.x = -Math.PI / 2; root.add(m);
      bananas.push({ m, x: m.position.x, z: m.position.z, t: 30, owner: c, grace: 0.6 });
    } else {
      const rank = GAME.ranking.indexOf(c), target = GAME.ranking[rank > 0 ? rank - 1 : 1];
      const m = new THREE.Group(); m.add(glowSprite(0xff5a3c, 3)); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); cone.rotation.x = Math.PI / 2; m.add(cone);
      m.position.set(c.x + f.x * 3, 1.2, c.z + f.z * 3); root.add(m);
      missiles.push({ m, x: m.position.x, z: m.position.z, h: c.h, target, owner: c, t: 5 });
      if (c === player || target === player) SND.launch();
      if (c === player) small(TX.fire(target.label), '#ff5a3c');
      else if (target === player) small(TX.fired(c.label), '#ff5a3c');
    }
  }
  function placeCars() {
    const grid = [[N - 6, 0.45], [N - 6, -0.45], [N - 16, 0.45], [N - 16, -0.45]];
    const order = cars.filter((c) => c !== player).concat([player]);   // 玩家由第 4 位開始
    order.forEach((c, g) => {
      const [i, q] = grid[g], lat = lateral(i, q);
      Object.assign(c, { x: P[i].x + S[i].x * lat, z: P[i].z + S[i].z * lat, h: Math.atan2(T[i].x, T[i].z), v: 0, idx: i, prog: i - N,
        spin: 0, boost: 0, drift: false, driftT: 0, driftDir: 0, slip: 0, nitro: 0, item: null, itemT: 0, lane: q, laneT: 2, steerVis: 0,
        finished: false, finishT: 0, place: 0, wallCd: 0, usedNitro: false, usedItem: false, drifted: false, rx: null, rz: null });
      c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h;
    });
  }
  function stepCar(c, dt, inp) {
    const i = c.idx;
    if (c.finished && c === player) inp = null;                             // 過咗終點：交畀自動駕駛
    let steerVis = 0;
    if (c.spin > 0) {
      c.spin -= dt; c.v *= Math.exp(-1.2 * dt); c.slip += 12 * dt;
    } else if (inp) {
      const st = c.st, maxV = 60 * st.v * (c.boost > 0 ? 1.45 : 1), acc = c.boost > 0 ? 70 : 24 * st.a;
      if (inp.brake) c.v -= 45 * dt; else c.v += (c.v < maxV ? acc : -25) * dt;
      let rate = inp.steer * (2.3 - 0.013 * c.v) * clamp(c.v / 14, 0, 1) * st.s;
      const wantDrift = inp.drift && Math.abs(inp.steer) > 0.2 && c.v > 22;
      if (wantDrift && !c.drift) { c.drift = true; c.driftDir = Math.sign(inp.steer); c.driftT = 0; c.drifted = true; }
      if (c.drift && (!inp.drift || c.v < 15)) {
        if (c.driftT > 0.9) { c.boost = Math.max(c.boost, 0.8); if (c === player) { small(TX.mini, '#28d7ff'); SND.mini(); } }
        c.drift = false;
      }
      if (c.drift) {
        rate = (inp.steer || c.driftDir * 0.3) * (2.3 - 0.013 * c.v) * 1.55 * st.s;
        c.driftT += dt; c.v -= 5 * dt; c.nitro = Math.min(2, c.nitro + dt * 0.3);
        const col = new THREE.Color(c.driftT > 0.9 ? 0xff8a2a : 0x4fd8ff);
        const bx = c.x - Math.sin(c.h) * 2 + Math.cos(c.h) * c.driftDir * 1.1, bz = c.z - Math.cos(c.h) * 2 - Math.sin(c.h) * c.driftDir * 1.1;
        if (Math.random() < 0.7) spark(bx, 0.3, bz, col);
      }
      steerVis = inp.steer;
      c.h += rate * dt;
      c.slip += ((c.drift ? c.driftDir * st.slip : 0) - c.slip) * Math.min(1, 8 * dt);
      if (inp.nitro && c.nitro >= 1 && c.boost <= 0.2) { c.nitro -= 1; c.boost = 2.2; c.usedNitro = true; if (c === player) { small('SUCH SPEED. WOW.', '#ffd23f'); SND.boost(); } }
      if (inp.item && c.item) { c.usedItem = true; useItem(c); }
    } else {
      // AI：追住前面嘅點；街道有 90° 路口，所以用每點嘅過彎極速 VC（已經計埋煞車距離）
      const look = (i + 5 + Math.floor(c.v * 0.18)) % N, lat = lateral(look, c.lane);
      const tx = P[look].x + S[look].x * lat, tz = P[look].z + S[look].z * lat;
      const dh = wrapA(Math.atan2(tx - c.x, tz - c.z) - c.h);
      c.h += clamp(dh * 3.2, -2.3, 2.3) * dt; steerVis = clamp(dh * 3, -1, 1);
      const skill = c.skill || 1;
      let target = Math.min(64.5 * skill, VC[(i + 4) % N] * (0.93 + 0.07 * skill));
      target *= 1 + clamp((player.prog - c.prog) / (N * 0.25), -0.06, 0.1);
      target *= c.st.v; if (c.boost > 0) target *= 1.45;
      c.v += clamp(target - c.v, -30 * dt, (c.boost > 0 ? 70 : 20) * dt);
      if ((c.laneT -= dt) <= 0) { c.lane = A[(i + 30) % N] > 0.4 ? c.lane * 0.3 : (Math.random() - 0.5) * 1.1; c.laneT = 2 + Math.random() * 3; }
      c.slip *= Math.exp(-6 * dt);
      if (c.item && (c.itemT += dt) > 1.5 + Math.random() * 3) {
        const rank = GAME.ranking.indexOf(c);
        if (c.item !== 'MISSILE' || rank > 0 || Math.random() < 0.3) { useItem(c); c.itemT = 0; }
      }
    }
    if (c.boost > 0) c.boost -= dt;
    c.v = Math.max(0, c.v);
    c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt;
    // 防撞欄：左右闊度逐點唔同（真實馬路闊度）
    const ni = nearest(c.x, c.z, c.idx);
    let d = ni - c.idx; if (d < -N / 2) d += N; if (d > N / 2) d -= N;
    c.prog += d; c.idx = ni;
    const p = P[ni], s = S[ni], lat = (c.x - p.x) * s.x + (c.z - p.z) * s.z, lo = -(WR[ni] - 0.9), hi = WL[ni] - 0.9;
    c.wallCd -= dt;
    if (lat > hi || lat < lo) {
      const lim = lat > hi ? hi : lo, back = lat - lim; c.x -= s.x * back; c.z -= s.z * back;
      c.v *= Math.exp(-c.st.wall * dt);
      c.h += wrapA(Math.atan2(T[ni].x, T[ni].z) - c.h) * Math.min(1, 3 * dt);
      if (Math.random() < 0.5) spark(c.x + s.x * Math.sign(lat) * 1.1, 0.5, c.z + s.z * Math.sign(lat) * 1.1, new THREE.Color(0xffffff), 4, 2);
      if (c === player && c.v > 35 && c.wallCd <= 0) { small('BRUH', '#b27dff'); SND.scrape(); c.wallCd = 4; }
    }
    const m = c.mesh; m.position.set(c.x, 0, c.z); m.rotation.y = c.h + c.slip;
    c.steerVis += (steerVis - c.steerVis) * Math.min(1, 10 * dt);
    m.userData.wheels.forEach((w, k) => { w.rotation.x += c.v * dt / 0.47; if (k % 2) w.rotation.y = c.steerVis * 0.35; });
    m.userData.flame.forEach((f) => { f.visible = c.boost > 0; f.scale.setScalar(1.4 + Math.random()); });
    if (c === player) {
      const hh = c.h + c.slip, rx = c.x - Math.sin(hh) * 1.45, rz = c.z - Math.cos(hh) * 1.45, nx = Math.cos(hh), nz = -Math.sin(hh);
      if (c.drift || c.spin > 0) {
        if (c.rx !== null) for (const sd of [-1.05, 1.05]) skid(c.rx + nx * sd, c.rz + nz * sd, rx + nx * sd, rz + nz * sd, nx, nz);
        c.rx = rx; c.rz = rz;
      } else c.rx = null;
    }
  }

  // ---------- 模式：入 / 出 ----------
  let active = false, camBack = 10, camUp = 4.2;
  const UI_PLAY = ['board', 'lapbox', 'timebox', 'minibox', 'dial', 'place', 'spdtxt', 'nitrobox', 'ctl', 'mus', 'rx'];
  function layoutR() { const a = innerWidth / innerHeight; camBack = a < 1 ? 14 : 10; camUp = a < 1 ? 5.5 : 4.2; }
  addEventListener('resize', layoutR); layoutR();
  function enter() {
    active = true; cam.mode = 'race'; document.body.classList.add('race'); root.visible = true; $('rui').hidden = false;
    GAME.state = 'title'; GAME.attract = 0; $('rtitle').hidden = false; $('over').hidden = true;
    for (const id of UI_PLAY.concat(['item', 'rhelp', 'howto', 'tip', 'rot'])) $(id).hidden = true;
    placeCars();
  }
  function exit() { location.href = 'hkcity.html'; }   // 返回 hkcity 地圖

  const GAME = {
    state: 'title', t: 0, score: 0, count: 0, ranking: cars.slice(), finishers: 0, endT: 0, lastLap: 1, lastPlace: 4, attract: 0,
    lapStart: 0, bestLap: 0, tips: {}, boardT: 0,
    start() {
      SND.init();
      bananas.forEach((b) => root.remove(b.m)); missiles.forEach((m) => root.remove(m.m)); bananas.length = missiles.length = 0;
      boxes.forEach((b) => { b.cd = 0; b.m.visible = b.gl.visible = true; });
      placeCars(); clearSkids();
      Object.assign(this, { state: 'play', t: 0, score: 0, count: 3.5, finishers: 0, endT: 0, lastLap: 1, lastPlace: 4, lapStart: 3.5, bestLap: 0, tips: {}, boardT: 0 });
      this.ranking = cars.slice().sort((a, b) => b.prog - a.prog);
      $('rtitle').hidden = $('over').hidden = true;
      for (const id of UI_PLAY) $(id).hidden = false;
      document.body.classList.add('tips'); helpOn = true;
    },
    over() {
      this.state = 'over';
      const place = player.place, time = player.finishT;
      this.score = [10, 6, 3, 1][place - 1];
      let best = time;
      try { const b = +localStorage.getItem('best-hkrace'); if (b && place === 1) best = Math.min(b, time); else if (b) best = b; if (place === 1) localStorage.setItem('best-hkrace', best); } catch (e) {}
      $('result').textContent = ORD[place - 1];
      $('final').textContent = TX.time(fmt(time));
      $('best').textContent = place === 1 || best !== time ? TX.best(fmt(best)) : TX.noBest;
      $('meme').textContent = ['GG EZ', 'SO CLOSE. NO CAP.', 'TOUCH GRASS, THEN RETRY', 'SKILL ISSUE'][place - 1];
      for (const id of UI_PLAY.concat(['item', 'rhelp', 'howto', 'tip', 'rot'])) $(id).hidden = true;
      $('speed').style.opacity = 0;
      $('over').hidden = false;
      SND.engine(0, false, false, false);
    },
    step(dt) {
      const play = this.state === 'play';
      if (!play) {                                                          // 標題：鏡頭沿賽道飛
        this.attract += dt;
        const a = player.h + 0.6 + this.attract * 0.35, rr = player.model.startsWith('minibus') ? 11 : 8.5;   // 標題：鏡頭圍住揀咗嗰架車轉
        camera.position.set(player.x + Math.sin(a) * rr, 3.4, player.z + Math.cos(a) * rr); camera.lookAt(player.x, 1.1, player.z);
        $('start').textContent = TILES.loaded < Math.min(TILES.near, 6) ? `${TX.start}（載入街景 ${TILES.loaded}/${Math.min(TILES.near, 6)}）` : TX.start;
        stepParticles(dt); return;
      }
      this.t += dt;
      const inp = input();
      if (this.count > 0) {
        const before = Math.ceil(this.count); this.count -= dt; const after = Math.ceil(this.count);
        if (after !== before || this.t === dt) { if (after > 0) { banner(String(after), '#fff'); SND.beep(false); } else { banner(TX.go, '#7dff6a'); SND.beep(true); } }
      } else {
        for (const c of cars) stepCar(c, dt, c.player ? inp : null);
        for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
          const A1 = cars[a], B1 = cars[b], dx = B1.x - A1.x, dz = B1.z - A1.z, d2 = dx * dx + dz * dz;
          if (d2 < 3.3 * 3.3 && d2 > 1e-6) {
            const d = Math.sqrt(d2), push = (3.3 - d) / 2, nx = dx / d, nz = dz / d;
            A1.x -= nx * push; A1.z -= nz * push; B1.x += nx * push; B1.z += nz * push;
            const avg = (A1.v + B1.v) / 2; A1.v += (avg - A1.v) * 0.3; B1.v += (avg - B1.v) * 0.3;
            if ((A1 === player || B1 === player) && Math.random() < 0.1) SND.scrape();
          }
        }
        for (const b of boxes) {
          if (b.cd > 0) { if ((b.cd -= dt) <= 0) b.m.visible = b.gl.visible = true; continue; }
          b.m.rotation.y += dt * 2; b.m.rotation.x += dt; b.m.position.y = 1.5 + Math.sin(this.t * 3 + b.x) * 0.25;
          for (const c of cars) if (!c.item && (c.x - b.x) ** 2 + (c.z - b.z) ** 2 < 3.8 * 3.8) {
            const rank = this.ranking.indexOf(c);
            c.item = rank === 0 ? pick(['BOOST', 'BANANA', 'BANANA'], Math.random) : pick(rank === 3 ? ['BOOST', 'MISSILE', 'MISSILE'] : itemTypes, Math.random);
            c.itemT = 0; b.cd = 3; b.m.visible = b.gl.visible = false;
            if (c === player) { small(TX.items[c.item], '#ff3fd1'); SND.pickup(); }
            break;
          }
        }
        for (const b of bananas) {
          b.t -= dt; b.grace -= dt;
          for (const c of cars) if ((c !== b.owner || b.grace <= 0) && (c.x - b.x) ** 2 + (c.z - b.z) ** 2 < 2.4 * 2.4) { spin(c, b.owner); b.t = 0; break; }
          if (b.t <= 0) root.remove(b.m);
        }
        for (let k = bananas.length - 1; k >= 0; k--) if (bananas[k].t <= 0) bananas.splice(k, 1);
        for (const m of missiles) {
          m.t -= dt; const tg = m.target;
          m.h += clamp(wrapA(Math.atan2(tg.x - m.x, tg.z - m.z) - m.h) * 6, -5, 5) * dt;
          m.x += Math.sin(m.h) * 105 * dt; m.z += Math.cos(m.h) * 105 * dt;
          m.m.position.set(m.x, 1.2, m.z); m.m.rotation.y = m.h;
          if (Math.random() < 0.8) spark(m.x, 1.2, m.z, new THREE.Color(0xff8a2a), 2, 1);
          if ((tg.x - m.x) ** 2 + (tg.z - m.z) ** 2 < 2.6 * 2.6) { spin(tg, m.owner); m.t = 0; }
          if (m.t <= 0) root.remove(m.m);
        }
        for (let k = missiles.length - 1; k >= 0; k--) if (missiles[k].t <= 0) missiles.splice(k, 1);
        for (const c of cars) if (!c.finished && c.prog >= LAPS * N) {
          c.finished = true; c.finishT = this.t - 3.5; c.place = ++this.finishers;
          if (c === player) { banner(c.place === 1 ? TX.win : TX.finish(c.place), c.place === 1 ? '#ffd23f' : '#fff'); this.endT = 2.5; SND.fanfare(c.place === 1); }
        }
        this.ranking = cars.slice().sort((a, b) => (b.finished - a.finished) || (a.finished ? a.place - b.place : b.prog - a.prog));
        const lap = clamp(Math.floor(player.prog / N) + 1, 1, LAPS + 1);
        if (lap > this.lastLap) {
          const lt = this.t - this.lapStart; this.bestLap = this.bestLap ? Math.min(this.bestLap, lt) : lt; this.lapStart = this.t;
          this.lastLap = lap;
          if (lap === LAPS) banner(TX.finalLap, '#ff3fd1');
          if (lap === 2) helpOn = false;
        }
        const place = this.ranking.indexOf(player) + 1;
        if (place === 1 && this.lastPlace > 1 && this.t > 8 && !player.finished) small('STONKS ↑', '#7dff6a');
        this.lastPlace = place;
        const tp = this.tips, tch = isTouch();
        if (this.t > 9) document.body.classList.remove('tips');
        if (!tp.drift && !player.drifted && A[(player.idx + 22) % N] > 0.55 && player.v > 30) { tp.drift = 1; tip(TX.tipDrift(tch)); }
        if (!tp.nitro && player.nitro >= 1 && !player.usedNitro) { tp.nitro = 1; tip(TX.tipNitro(tch)); }
        if (!tp.item && player.item && !player.usedItem && this.t > 6) { tp.item = 1; tip(TX.tipItem(tch)); }
        if (this.endT > 0 && (this.endT -= dt) <= 0) { this.over(); return; }
      }
      if (tipT > 0 && (tipT -= dt) <= 0) $('tip').hidden = true;
      stepParticles(dt);
      SND.engine(player.v, player.boost > 0, true, player.drift);
      SND.tick();
      const c = player, fx = Math.sin(c.h), fz = Math.cos(c.h);
      const want = new THREE.Vector3(c.x - fx * camBack, camUp, c.z - fz * camBack);
      if (window.clearFrac) { const f = Math.max(0.3, clearFrac(c.x, 1.5, c.z, want.x, want.y, want.z)); want.set(c.x + (want.x - c.x) * f, 1.5 + (want.y - 1.5) * f, c.z + (want.z - c.z) * f); }   // 彎位唔穿樓
      if (this.t < 0.05) camera.position.copy(want); else camera.position.lerp(want, 1 - Math.exp(-12 * dt));
      if (c.boost > 0) camera.position.y += (Math.random() - 0.5) * 0.12;
      camera.lookAt(c.x + fx * 8, 1.7, c.z + fz * 8);
      const fov = 66 + (c.boost > 0 ? 14 : 0) + Math.min(c.v, 60) / 60 * 4;
      if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, 5 * dt); camera.updateProjectionMatrix(); }
      $('speed').style.opacity = c.boost > 0 ? 1 : 0;
      cam.wx = c.x; cam.wz = c.z; cam.wyaw = c.h + Math.PI;                   // 俾地圖 HUD 顯示路名 / 地標
      this.hud(dt);
    },
    hud(dt) {
      const place = this.ranking.indexOf(player) + 1, c = player;
      if ((this.boardT -= dt) <= 0) {
        this.boardT = 0.25;
        $('board').innerHTML = this.ranking.map((r, k) => `<div class="${r === player ? 'me' : ''}"><i>${k + 1}</i><b style="background:${r.css}"></b>${r.label}</div>`).join('');
      }
      $('lap').textContent = `${clamp(Math.floor(c.prog / N) + 1, 1, LAPS)}/${LAPS}`;
      $('laplbl').textContent = TX.lap;
      $('rtime').textContent = fmt(Math.max(0, this.t - 3.5));
      $('bestlap').textContent = TX.bestLap(this.bestLap ? fmt(this.bestLap) : '--:--.--');
      $('place').innerHTML = `${place}<small>/4</small>`;
      const kmh = Math.round(c.v * 3.6);
      $('spdtxt').textContent = `${kmh} km/h`;
      $('nfill').firstChild.style.width = (c.nitro >= 2 ? 100 : (c.nitro % 1) * 100) + '%';
      document.querySelectorAll('.n2o').forEach((e, k) => e.classList.toggle('on', c.nitro >= k + 1));
      $('item').hidden = !c.item; if (c.item) $('item').textContent = isTouch() ? TX.items[c.item] : `${TX.items[c.item]} · X`;
      $('rot').hidden = !(isTouch() && innerHeight > innerWidth);
      $('rhelp').hidden = !helpOn || isTouch();
      $('howto').hidden = !(isTouch() && document.body.classList.contains('tips'));
      if (!isTouch() && kmh !== this.lastKmh) { this.lastKmh = kmh; drawDial(kmh); }
      drawMini();
    },
  };
  const dctx = $('dial').getContext('2d');
  function drawDial(kmh) {
    const x = dctx, cx = 190, cy = 200, r = 150, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, mx = 300, a = a0 + (a1 - a0) * Math.min(kmh, mx) / mx;
    x.clearRect(0, 0, 380, 380);
    x.lineCap = 'round'; x.lineWidth = 18; x.strokeStyle = 'rgba(14,18,48,.75)'; x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
    const g = x.createLinearGradient(40, 300, 340, 60); g.addColorStop(0, '#5fe0c0'); g.addColorStop(0.6, '#ffd23f'); g.addColorStop(1, '#ff5a3c');
    x.strokeStyle = g; x.beginPath(); x.arc(cx, cy, r, a0, Math.max(a0 + 0.01, a)); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.85)'; x.font = 'italic 700 20px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let v = 0; v <= mx; v += 60) { const aa = a0 + (a1 - a0) * v / mx; x.fillText(v, cx + Math.cos(aa) * (r - 38), cy + Math.sin(aa) * (r - 38)); }
    x.shadowColor = '#000'; x.shadowBlur = 10; x.fillStyle = '#fff'; x.font = 'italic 900 78px sans-serif'; x.fillText(kmh, cx, cy + 2);
    x.shadowBlur = 0; x.font = '700 20px sans-serif'; x.fillStyle = 'rgba(255,255,255,.7)'; x.fillText('KM/H', cx, cy + 58);
  }
  // 小地圖：賽道畫一次，每格只畫車點（保持真實比例：北向上）
  const mctx = $('mini').getContext('2d');
  const mb = P.reduce((b, p) => [Math.min(b[0], p.x), Math.max(b[1], p.x), Math.min(b[2], p.z), Math.max(b[3], p.z)], [1e9, -1e9, 1e9, -1e9]);
  const msc = 220 / Math.max(mb[1] - mb[0], mb[3] - mb[2]), mox = (260 - (mb[1] - mb[0]) * msc) / 2, moz = (260 - (mb[3] - mb[2]) * msc) / 2;
  const mx = (x) => mox + (x - mb[0]) * msc, mz = (z) => moz + (z - mb[2]) * msc;
  const mapImg = document.createElement('canvas'); mapImg.width = mapImg.height = 260;
  { const x = mapImg.getContext('2d'); x.lineJoin = 'round'; x.strokeStyle = '#fff'; x.lineWidth = 9; x.beginPath(); P.forEach((p, i) => i ? x.lineTo(mx(p.x), mz(p.z)) : x.moveTo(mx(p.x), mz(p.z))); x.closePath(); x.stroke(); }
  function drawMini() {
    mctx.clearRect(0, 0, 260, 260); mctx.drawImage(mapImg, 0, 0);
    for (const c of cars.slice().reverse()) { mctx.fillStyle = c.css; mctx.strokeStyle = '#000'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(mx(c.x), mz(c.z), c === player ? 11 : 8, 0, 7); mctx.fill(); mctx.stroke(); }
  }
  for (const [id, k] of [['start', 'start'], ['again', 'again'], ['rot', 'rot'], ['nlbl', 'nlbl'], ['back1', 'back'], ['back2', 'back'], ['rsub', 'sub']]) $(id).textContent = TX[k];
  for (const [id, k] of [['bd', 'drift'], ['bn', 'nitro'], ['bi', 'item']]) $(id).textContent = TX[k];
  $('howto').innerHTML = TX.howto.map(([k, t]) => `<b>${k}</b>${t}`).join('<br>');
  document.querySelector('#rtitle h1').textContent = TX.title;
  $('rhelp').innerHTML = TX.help.map((row) => row.slice(0, -1).map((k) => `<kbd>${k}</kbd>`).join('') + ' ' + row[row.length - 1]).join('<br>');
  if (!isTouch()) $('hint').textContent = TX.hintKey;
  $('start').onclick = () => GAME.start(); $('again').onclick = () => GAME.start();
  $('back1').onclick = exit; $('back2').onclick = exit; $('rx').onclick = exit;
  $('pick').innerHTML = CARDEF.map((d) => `<div class="car"><h3 style="color:${d.css}">${d.name}</h3>${['極速', '加速', '轉彎', '穩陣'].map((n, k) => `<i>${n}</i>${[1, 2, 3, 4, 5].map((v) => `<s class="${v <= d.bars[k] ? 'f' : ''}"></s>`).join('')}`).join('<br>')}<p>${d.note}</p></div>`).join('');
  document.querySelectorAll('#pick .car').forEach((e, k) => { e.onclick = () => choose(k); });
  let k0 = 0; try { k0 = +localStorage.getItem('hkrace-car') || 0; } catch (e) {}
  choose(k0 >= 0 && k0 < cars.length ? k0 : 0);
  return { enter, exit, choose, step: (dt) => GAME.step(dt), GAME, get player() { return player; }, P, S, T, A, N, WL, WR, VC, cars, get active() { return active; } };
})();

// ---------- 主迴圈：只有賽車 + 圖幅串流 ----------
{
  let last = performance.now();
  const fr = { n: 0, t: 0 }; window.RACE_PERF = fr;
  // 精品：半島酒店（圖幅入面挖咗窿）用地政總署原始 model，行近先載；手機 1024、電腦 2048
  const HDMOD = window.HDM ? HDM.create(scene, { px: TOUCH || (navigator.deviceMemory || 8) <= 4 ? 1024 : 2048, R: 350, R2: 500 }) : null;
  window.HDMOD = HDMOD;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    RACE.step(dt);
    TILES.step(dt, camera.position.x, camera.position.z);
    if (HDMOD) HDMOD.step(camera.position.x, camera.position.z);
    renderer.render(scene, camera);
    fr.n++; fr.t += dt;
  }
  RACE.enter();
  requestAnimationFrame(frame);
}
