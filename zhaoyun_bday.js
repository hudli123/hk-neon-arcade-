// 生日模式：zhaoyun.html#bday=<payload> → 解碼 + 驗證 → window.QUIZ_DATA（壽星做主角）
// payload = base64url（冇 padding）嘅 UTF-8 JSON：
//   {"v":1,"n":名,"a":歲數|null,"f":送禮人,"m":祝福語,"q":[[題目,[選項x4],答案0-3],...]}
// 解碼或驗證失敗：唔設 QUIZ_DATA，標題下加提示，遊戲照舊玩得。
(() => {
  'use strict';
  const params = new URLSearchParams(location.search.slice(1) + '&' + location.hash.slice(1));
  const raw = params.get('bday');
  if (raw === null) return;

  const fail = () => {
    const p = document.createElement('p');
    p.textContent = '呢條生日 link 唔完整，請叫送禮嘅人再複製一次。';
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
    if (!d || d.v !== 1 || typeof d.n !== 'string' || typeof d.f !== 'string' || typeof d.m !== 'string' || !Object.prototype.hasOwnProperty.call(d, 'a')) throw 0;

    const name = cut(d.n, 8);
    const from = cut(d.f, 12);
    const msg = cut(d.m, 80);
    if (!name) throw 0;

    let age = null;
    if (d.a !== null && d.a !== undefined) {
      if (!Number.isInteger(d.a) || d.a < 1 || d.a > 120) throw 0;
      age = d.a;
    }

    if (!Array.isArray(d.q) || d.q.length < 3 || d.q.length > 6) throw 0;
    const questions = d.q.map(item => {
      if (!Array.isArray(item) || item.length !== 3 || typeof item[0] !== 'string' || !Array.isArray(item[1]) || item[1].length !== 4 || item[1].some(o => typeof o !== 'string')) throw 0;
      const q = cut(item[0], 50);
      const opts = item[1].map(o => cut(o, 12));
      const ans = item[2];
      if (!q || opts.some(o => !o) || !Number.isInteger(ans) || ans < 0 || ans > 3) throw 0;
      return { cat: '壽星問答', q, opts, ans, why: '' };
    });

    window.QUIZ_DATA = {
      title: name + '破陣',
      topic: '生日快樂',
      bday: { name, age, from, msg },
      questions,
    };
  } catch (e) {
    fail();
  }
})();
