// 開放玩數：GoatCounter，免費、唔儲個人資料（goatcounter.com）。
// 數據去 hkneon.goatcounter.com —— 用同名開帳戶先睇到。載入失敗就靜靜哋略過。
(() => {
  'use strict';
  const s = document.createElement('script');
  s.async = true;
  s.dataset.goatcounter = 'https://hkneon.goatcounter.com/count';
  s.dataset.goatcounterSettings = JSON.stringify({ no_onload: true, allow_local: true });   // 唔好 load 就自動數；allow_local 方便喺自己電腦測試
  s.src = '//gc.zgo.at/count.js';
  s.onload = () => {   // 載入成功先數一個 page view；之後就俾遊戲自己數事件。只記路徑，唔記標題（題目名都唔送出去）
    try {
      const m = /[#&?]pack=/.test(location.hash) ? '?m=pack' : /[#&?]bday=/.test(location.hash) ? '?m=bday' : /[#&?]quiz=/.test(location.search + location.hash) ? '?m=quiz' : '';
      window.goatcounter && window.goatcounter.count({ path: location.pathname + m, title: '' });
    } catch (e) {}
  };
  document.head.appendChild(s);

  // 遊戲事件 → GoatCounter event path。localStorage 去重：8 小時內同一路徑只數一次。
  const seen = () => { try { return JSON.parse(localStorage.getItem('gseen') || '{}'); } catch (e) { return {}; } };
  window.count = function (path) {
    const gc = window.goatcounter;
    if (gc && gc.count) { try { gc.count({ path, title: '', event: true }); } catch (e) {} }
  };
  window.countOnce = function (path) {
    const k = 'g:' + path, m = seen(), n = Date.now();
    if (m[k] && n - m[k] < 8 * 3600e3) return;
    m[k] = n; try { localStorage.setItem('gseen', JSON.stringify(m)); } catch (e) {}
    window.count(path);
  };
})();
