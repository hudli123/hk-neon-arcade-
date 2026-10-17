// 出版社題庫模式：zhaoyun.html#pack=<payload> → 解碼 + 驗證 → window.QUIZ_DATA
// payload = base64url（冇 padding）嘅 UTF-8 JSON：
//   {"v":1,"t":遊戲標題,"s":主題,"q":[[類別,題目,[選項x4],答案0-3,解釋],...]}
// 解碼或驗證失敗：唔設 QUIZ_DATA，標題下加提示，遊戲照舊玩得。
(() => {
  'use strict';
  const params = new URLSearchParams(location.search.slice(1) + '&' + location.hash.slice(1));
  const raw = params.get('pack');
  if (raw === null) return;

  const fail = () => {
    const p = document.createElement('p');
    p.textContent = '呢條題目 link 唔完整，請叫出題嘅人再複製一次。';
    p.style.cssText = 'color:#ff9a8a;font-size:15px;max-width:560px';
    const t = document.getElementById('title');
    const anchor = (t && (t.querySelector('#loading') || t.querySelector('p'))) || t;
    if (anchor) anchor.insertAdjacentElement('afterend', p);
  };

  const cut = (s, n) => [...String(s || '').trim()].slice(0, n).join('');

  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const d = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!d || d.v !== 1 || typeof d.t !== 'string') throw 0;
    if (d.s !== undefined && d.s !== null && typeof d.s !== 'string') throw 0;

    const title = cut(d.t, 16);
    const topic = cut(d.s || '', 20);
    if (!title) throw 0;

    if (!Array.isArray(d.q) || d.q.length < 3 || d.q.length > 20) throw 0;
    const questions = d.q.map(item => {
      if (!Array.isArray(item) || item.length < 3 || item.length > 5) throw 0;
      if (item[0] !== undefined && item[0] !== null && typeof item[0] !== 'string') throw 0;
      if (typeof item[1] !== 'string' || !Array.isArray(item[2]) || item[2].length !== 4) throw 0;
      if (item[2].some(o => typeof o !== 'string')) throw 0;
      if (item[4] !== undefined && item[4] !== null && typeof item[4] !== 'string') throw 0;
      const cat = cut(item[0], 6);
      const q = cut(item[1], 80);
      const opts = item[2].map(o => cut(o, 12));
      const ans = item[3];
      const why = cut(item[4], 60);
      if (!q || opts.some(o => !o) || !Number.isInteger(ans) || ans < 0 || ans > 3) throw 0;
      if (new Set(opts).size !== 4) throw 0;   // 選項唔可以重複
      return { cat: cat || '題目', q, opts, ans, why };
    });

    window.QUIZ_DATA = { title, topic, questions };
  } catch (e) {
    fail();
  }
})();
