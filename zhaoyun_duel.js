// 單挑模式（zhaoyun.html#duel=1）：冇雜兵，一開波對手即出現；三局兩勝，每局 60 秒；時間到以剩血百分比定勝負。
// 第一版對手 = 張郃（AI 用返 stepBoss）。之後換 Meshy 角色只需換 bossG 嘅模型。
(() => {
  'use strict';
  const ROUND_T = 60, WINS = 2, OPP_HP = 620;
  const D = { round: 0, p1: 0, p2: 0, t: ROUND_T, on: false, ending: 0 };
  window.DUEL = D;
  const css = document.createElement('style');
  css.textContent = `#dhud{position:fixed;left:50%;top:10px;transform:translateX(-50%);width:min(900px,calc(100vw - 300px));display:grid;grid-template-columns:1fr 92px 1fr;gap:10px;align-items:center;z-index:20;pointer-events:none;font-weight:900;color:#fff3dc;text-shadow:0 1px 3px #000}
  #dhud .bar{height:22px;border:2px solid #e0b050;border-radius:6px;background:#1a0a04;overflow:hidden;position:relative}
  #dhud .bar i{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,#ffe08a,#4cd964);transition:width .12s}
  #dhud .p1 i{right:0}#dhud .p2 i{left:0}
  #dhud .nm{font-size:clamp(14px,1.6vw,20px);display:flex;justify-content:space-between;margin-bottom:3px}
  #dhud .p2 .nm{flex-direction:row-reverse}
  #dhud .clk{font-size:clamp(28px,3.6vw,46px);text-align:center;line-height:1;color:#ffe08a}
  #dhud .dots{text-align:center;font-size:14px;letter-spacing:3px;color:#ffd27a}
  #dround{position:fixed;left:0;right:0;top:36%;text-align:center;font-size:clamp(40px,9vw,96px);font-weight:900;color:#ffe08a;text-shadow:0 0 24px #ff9a2a,0 2px 4px #000;pointer-events:none;opacity:0;transition:opacity .25s;z-index:30}
  @media (max-height:500px){#dhud{width:min(700px,calc(100vw - 230px));top:6px}#dhud .bar{height:14px}}`;
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'dhud'; hud.hidden = true;
  hud.innerHTML = `<div class="p1"><div class="nm"><span id="dn1">趙雲</span><span id="dh1"></span></div><div class="bar"><i id="db1"></i></div></div>
    <div><div class="clk" id="dclk">60</div><div class="dots" id="ddots"></div></div>
    <div class="p2"><div class="nm"><span id="dn2">張郃</span><span id="dh2"></span></div><div class="bar"><i id="db2"></i></div></div>`;
  document.body.appendChild(hud);
  const rb = document.createElement('div'); rb.id = 'dround'; document.body.appendChild(rb);
  const $ = (id) => document.getElementById(id);
  const say = (t, ms = 1100) => { rb.textContent = t; rb.style.opacity = 1; clearTimeout(say.h); say.h = setTimeout(() => { rb.style.opacity = 0; }, ms); };

  // 冇雜兵：唔再生兵，開波時清場
  stepSpawns = function () {};
  const clearCrowd = () => { for (let i = 0; i < NMAX; i++) S.alive[i] = 0; };

  const resetRound = () => {
    clearCrowd();
    Object.assign(player, { x: 0, z: 7, y: 0, vy: 0, yaw: Math.PI, hp: player.max, musou: 0, st: 'idle', t: 0, move: null, inv: 1 });
    Object.assign(boss, { alive: true, spawned: true, hp: OPP_HP, max: OPP_HP, st: 0, t: 0, cd: 1.2, x: 0, z: -7, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0, poise: 60 });
    bossG.visible = true; $('boss').hidden = true;
    D.t = ROUND_T; D.ending = 0; D.on = true;
    say(`第 ${D.round} 回合`);
  };

  const start0 = GAME.start.bind(GAME);
  GAME.start = function (c) {
    start0(c);
    D.round = 1; D.p1 = D.p2 = 0;
    $('dn1').textContent = CHAR === 'gy' ? '關羽' : '趙雲';
    hud.hidden = false; $('ko').hidden = true;
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
    if (done) { setTimeout(() => { GAME.winT = 0; over0(w === 'p1'); }, 1400); return; }
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
  const step0 = GAME.step.bind(GAME);
  GAME.step = function (rdt) {
    if (GAME.state === 'play' && D.on) {
      if (!boss.alive) endRound('p1');
      else { D.t -= rdt; if (D.t <= 0) { D.t = 0; endRound('time'); } }
      GAME.winT = 0;
    }
    step0(rdt);
    if (!hud.hidden) {
      $('db1').style.width = Math.max(0, player.hp / player.max * 100) + '%'; $('dh1').textContent = Math.max(0, Math.ceil(player.hp));
      $('db2').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; $('dh2').textContent = Math.max(0, Math.ceil(boss.hp));
      $('dclk').textContent = Math.ceil(D.t);
      $('ddots').textContent = '●'.repeat(D.p1) + '○'.repeat(WINS - D.p1) + '  ' + '○'.repeat(WINS - D.p2) + '●'.repeat(D.p2);
    }
  };
  // 玩家死：hurtPlayer 叫 GAME.over(false) → 上面 endRound；但 player.hp 停 0 要補血先繼續（resetRound 做）
  // 標題文字
  const t = document.getElementById('title');
  if (t) { const h = t.querySelector('h1'); if (h) h.textContent = '單挑・張郃'; const p = t.querySelector('p'); if (p) p.textContent = '一對一，三局兩勝，每局 60 秒。打低張郃！'; }
  document.documentElement.classList.remove('qwait');
})();
