// hkcity.html / hkrace.html 嘅語言切換：?lang=ja|zh → 記住；冇揀過就跟瀏覽器。
// 日文版唔改遊戲 code：hkcity_ja.js 係「中文原文 → 日文」對照表，喺呢度將畫面上嘅字（DOM 文字、placeholder/title、
// 指定嘅 canvas 字）換走；表入面冇嘅字照出中文（街名、舖名、途人對白）。window.HKC_MISS = 未譯到嘅字（測試用）
(() => {
  const q = /[?&]lang=(ja|zh)(&|$)/.exec(location.search);
  let lang = q && q[1];
  try { if (lang) localStorage.setItem('hkcity-lang', lang); else lang = localStorage.getItem('hkcity-lang'); } catch (e) {}
  if (lang !== 'ja' && lang !== 'zh') lang = /^ja\b/i.test(navigator.language || '') ? 'ja' : 'zh';
  window.HKC_LANG = lang;
  window.HKC_SETLANG = () => {
    try { localStorage.setItem('hkcity-lang', lang === 'ja' ? 'zh' : 'ja'); } catch (e) {}
    location.replace(location.pathname + location.search.replace(/([?&])lang=\w+&?/, '$1').replace(/[?&]$/, '') + location.hash);
  };
  if (lang !== 'ja') return;
  document.documentElement.lang = 'ja';
  const CJK = /[\u3400-\u9fff]/, KANA = /[\u3041-\u3096\u30a1-\u30fa\u30fc]/, MISS = window.HKC_MISS = new Set(), ATTR = ['placeholder', 'title', 'aria-label'];
  let D = null;
  const tr = window.HKC_T = (s) => {
    if (!D || typeof s !== 'string' || !CJK.test(s) || KANA.test(s)) return s;   // 有假名 = 已經譯咗
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), k = m[2];
    let o = D.text[k];
    if (o === undefined) for (const [re, rp] of D.rules) if (re.test(k)) { o = k.replace(re, rp); break; }
    if (o === undefined) { if (MISS.size < 2000) MISS.add(k); return s; }
    return m[1] + o + m[3];
  };
  const walk = (n) => {
    if (n.nodeType === 3) { const p = n.parentNode && n.parentNode.nodeName; if (p !== 'SCRIPT' && p !== 'STYLE') { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } return; }
    if (n.nodeType !== 1 || n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE') return;
    for (const a of ATTR) { const v = n.getAttribute(a); if (v) { const w = tr(v); if (w !== v) n.setAttribute(a, w); } }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
  };
  const s = document.createElement('script'); s.src = 'hkcity_ja.js';
  s.onload = () => {
    D = window.HKC_L10N;
    walk(document.documentElement);
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'childList') m.addedNodes.forEach(walk); else walk(m.target); } })
      .observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
    const C = CanvasRenderingContext2D.prototype;
    for (const f of ['fillText', 'strokeText']) { const o = C[f]; C[f] = function (t, ...a) { return o.call(this, typeof t === 'string' && CJK.test(t) && D.canvas[t] || t, ...a); }; }
    for (const f of ['prompt', 'alert', 'confirm']) { const o = window[f]; window[f] = (t, ...a) => o.call(window, tr(t), ...a); }
  };
  document.head.append(s);
  const st = document.createElement('style');
  st.textContent = 'body{font-family:"Hiragino Sans","Yu Gothic UI","Meiryo","Noto Sans JP","PingFang HK","PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif}@media (max-width:480px){#modes button{padding:7px 6px;font-size:12px}}';   // 日文掣名長啲，手機直向要縮細先擺得落
  document.head.append(st);
})();
