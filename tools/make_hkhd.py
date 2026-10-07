#!/usr/bin/env python3
"""Build hkhd.html (精品區: original LandsD models at full quality) from hkcity.html + hkhd_src.js.

Takes three.js, the tile loader and the tile list from hkcity.html; models are in hd/<ID>/
(untouched LandsD glTF + 2048 jpg). Run from the repo root: python3 tools/make_hkhd.py
"""
import json, re

s = open('hkcity.html', encoding='utf-8').read()


def script_with(prefix):
    for m in re.finditer(r'<script>', s):
        a = m.end()
        if s.startswith(prefix, a) or s[a:a + 400].lstrip().startswith(prefix):
            return s[a:s.find('</script>', a)]
    raise SystemExit('missing script: ' + prefix)


three = script_with('/**\n * @license\n * Copyright 2010-2021 Three.js Authors')
tiles_js = script_with('// 1B 全城真模型')
i = s.find('{"tiles":[') + 9; d = 0
for j in range(i, len(s)):
    if s[j] == '[': d += 1
    elif s[j] == ']':
        d -= 1
        if d == 0: break
tiles = json.loads(s[i:j + 1].replace('\\\\', '\\'))
X, Z = 273.8, 1516.3
near = [t for t in tiles if max(t['bb'][0] - X, X - t['bb'][2], t['bb'][1] - Z, Z - t['bb'][3]) < 400]
src = open('hkhd_src.js', encoding='utf-8').read()
html = f'''<!doctype html>
<html lang="zh-HK"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>香港精品區 · 半島酒店（地政總署原始 3D model）</title>
<!-- 自動產生（tools/make_hkhd.py）。改請改 hkhd_src.js，再行一次 tools/make_hkhd.py -->
<style>html,body{{margin:0;height:100%;overflow:hidden;background:#000;font-family:system-ui,"PingFang HK","Microsoft JhengHei",sans-serif;touch-action:none}}
#ui{{position:fixed;left:10px;top:10px;right:10px;color:#fff;text-shadow:0 1px 3px #000;font-size:13px;pointer-events:none}}
#ui h1{{font-size:18px;margin:0 0 4px}}#mode{{pointer-events:auto;margin-top:6px;padding:8px 12px;border:0;border-radius:8px;background:#ffd34d;font-weight:700;font-size:14px}}
#credit{{position:fixed;left:10px;bottom:8px;color:#fff;font-size:11px;text-shadow:0 1px 2px #000}}</style>
</head><body>
<div id="ui"><h1>半島酒店 · 地政總署原始 3D model</h1><div id="stat">載入中…</div><button id="mode">而家：原圖 2048 px</button></div>
<div id="credit">3D 模型 © 香港特區政府地政總署「3D 視覺化地圖」（CSDI 空間數據共享平台）</div>
<script>{three}</script>
<script>{tiles_js}</script>
<script>window.HD_TILES = {json.dumps(near, separators=(',', ':'))};</script>
<script>{src}</script>
</body></html>
'''
open('hkhd.html', 'w', encoding='utf-8').write(html)
print('tiles', len(near), '| hkhd.html', len(html.encode()) // 1024, 'KB')
