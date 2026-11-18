// hkcity.html / hkrace.html language.
// ?lang=en|zh|ja is saved. A saved zh/ja/en choice is kept.
// A first visit with no saved choice is English (CrazyGames: default language is English).
// Chinese is the source text. English and Japanese are dictionaries applied to the DOM and canvas labels.
// Street names, shop names and chat the player typed are left as-is (ja/en skip lists).
(() => {
  const q = /[?&]lang=(en|ja|zh)(?=&|$)/i.exec(location.search);
  let lang = q && q[1].toLowerCase();
  try {
    if (lang) localStorage.setItem('hkcity-lang', lang);
    else lang = localStorage.getItem('hkcity-lang');
  } catch (e) {}
  if (lang !== 'en' && lang !== 'ja' && lang !== 'zh') lang = 'en';
  window.HKC_LANG = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang;

  const NEXT = { en: 'zh', zh: 'ja', ja: 'en' };
  const LABEL = { en: 'English', zh: '中文', ja: '日本語' };
  const paintLangBtn = () => {
    const b = document.getElementById('tLang');
    if (!b) return;
    b.textContent = LABEL[NEXT[lang]] || '中文';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintLangBtn);
  else paintLangBtn();
  window.HKC_SETLANG = (to) => {
    if (to !== 'en' && to !== 'zh' && to !== 'ja') to = NEXT[lang] || 'en';
    try { localStorage.setItem('hkcity-lang', to); } catch (e) {}
    const u = new URL(location.href);
    u.searchParams.set('lang', to);
    location.replace(u.href);
  };

  if (lang === 'zh') return;

  const st = document.createElement('style');
  st.textContent = lang === 'ja'
    ? 'body{font-family:"Hiragino Sans","Yu Gothic UI","Meiryo","Noto Sans JP","PingFang HK","PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif}@media (max-width:480px){#modes button{padding:7px 6px;font-size:12px}}'
    : 'body{font-family:system-ui,"Segoe UI",Roboto,"PingFang HK","PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif}';
  document.head.append(st);

  window.HKC_APPLY = () => {
    const D = window.HKC_L10N;
    if (!D || D.lang !== lang) return;
    if (D.skip) { if (!/(^|,)\s*#tLang\s*(,|$)/.test(D.skip)) D.skip += ', #tLang'; }
    else D.skip = '#tLang';
    const CJK = /[\u3400-\u9fff]/, KANA = /[\u3041-\u3096\u30a1-\u30fa\u30fc]/, MISS = window.HKC_MISS = new Set(), ATTR = ['placeholder', 'title', 'aria-label'];
    const tr = window.HKC_T = (s) => {
      if (!D || typeof s !== 'string' || !CJK.test(s) || KANA.test(s)) return s;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), k = m[2];
      let o = D.text[k];
      if (o === undefined) for (const [re, rp] of D.rules) if (re.test(k)) { o = k.replace(re, rp); break; }
      if (o === undefined) { if (MISS.size < 2000) MISS.add(k); return s; }
      return m[1] + o + m[3];
    };
    const walk = (n) => {
      const e = n.nodeType === 3 ? n.parentNode : n;
      if (!e || e.nodeType !== 1 || e.nodeName === 'SCRIPT' || e.nodeName === 'STYLE' || (D.skip && e.closest(D.skip))) return;
      if (n.nodeType === 3) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
      for (const a of ATTR) { const v = n.getAttribute(a); if (v) { const w = tr(v); if (w !== v) n.setAttribute(a, w); } }
      for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
    };
    walk(document.documentElement);
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'childList') m.addedNodes.forEach(walk); else walk(m.target); } })
      .observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
    const C = CanvasRenderingContext2D.prototype;
    for (const f of ['fillText', 'strokeText']) {
      if (C[f].__hkc) continue;
      const o = C[f];
      const wrapped = function (t, ...a) { return o.call(this, typeof t === 'string' && CJK.test(t) && D.canvas[t] || t, ...a); };
      wrapped.__hkc = 1; C[f] = wrapped;
    }
    for (const f of ['prompt', 'alert', 'confirm']) {
      if (window[f] && window[f].__hkc) continue;
      const o = window[f];
      const wrapped = (t, ...a) => o.call(window, tr(t), ...a);
      wrapped.__hkc = 1; window[f] = wrapped;
    }
    paintLangBtn();
  };
  document.write('<script src="' + (lang === 'ja' ? 'hkcity_ja.js' : 'hkcity_en.js') + '"><\/script>');
})();
