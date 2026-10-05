#!/usr/bin/env python3
"""Build hkrace.html (standalone HK street race) from hkcity.html + hkrace_src.js.

Takes from hkcity.html: three.js, the LandsD tile loader, buildCars, RACE_ROUTE and
the tiles within 260 m of the route. Writes hkrace_cars.js / hkrace_cars_m.js with
only the 4 selectable cars (taxi, police car, green + red minibus).
Run from the repo root: python3 tools/make_hkrace.py
"""
import base64, json, math, re, struct

ROOT = '.'
CARS = ['hktaxi', 'police_car', 'minibus', 'minibus_red']
NEAR = 260  # m: tiles kept around the route

s = open(f'{ROOT}/hkcity.html', encoding='utf-8').read()


def script_with(prefix):
    for m in re.finditer(r'<script>', s):
        a = m.end()
        if s.startswith(prefix, a) or s[a:a + 400].lstrip().startswith(prefix):
            return s[a:s.find('</script>', a)]
    raise SystemExit('missing script: ' + prefix)


three = script_with('/**\n * @license\n * Copyright 2010-2021 Three.js Authors')
tiles_js = script_with('// 1B 全城真模型')
cars_js = script_with('// window.HK_CARS')
route_js = script_with('window.RACE_ROUTE = ')

# tile list (CITY.tiles) -> only tiles near the route
i = s.find('{"tiles":[') + 9; d = 0
for j in range(i, len(s)):
    if s[j] == '[': d += 1
    elif s[j] == ']':
        d -= 1
        if d == 0: break
tiles = json.loads(s[i:j + 1].replace('\\\\', '\\'))
R = json.loads(route_js.split('=', 1)[1].strip().rstrip(';'))
q = struct.unpack('<%dh' % (R['n'] * 2), base64.b64decode(R['p']))
P = [(q[2 * k] / 4, q[2 * k + 1] / 4) for k in range(R['n'])][::5]


def dist(t, x, z):
    x0, z0, x1, z1 = t['bb']
    return math.hypot(max(x0 - x, 0, x - x1), max(z0 - z, 0, z - z1))


near = [t for t in tiles if min(dist(t, x, z) for x, z in P) < NEAR]


def tl(x):  # JS template-literal unescape
    return re.sub(r'\\([\\`$])', r'\1', x)


for src, dst in [('hkcity_cars.js', 'hkrace_cars.js'), ('hkcity_cars_m.js', 'hkrace_cars_m.js')]:
    c = open(f'{ROOT}/{src}', encoding='utf-8').read()
    parts, k = [], 0
    while (a := c.find('__J.push(`', k)) >= 0:
        a += 10; b = c.find('`);', a); parts.append(c[a:b]); k = b
    D = json.loads(tl(''.join(parts)))
    names = list(D['models'])
    M = {}
    for n in CARS:
        m = dict(D['models'][n]); m.pop('lo', None)
        if isinstance(m.get('ref'), int): m['ref'] = names[m['ref']]
        M[n] = m
    for n, m in M.items():  # pull in referenced shapes
        if 'ref' in m and m['ref'] not in M: raise SystemExit('ref outside subset: ' + m['ref'])
    out = {'models': M, 'tex': D['tex'], 'colours': D['colours'], 'credit': D.get('credit', '')}
    open(f'{ROOT}/{dst}', 'w', encoding='utf-8').write(
        f'// 自動產生（tools/make_hkrace.py，由 {src} 抽 4 架車）。唔好手改。\nwindow.HKR_CARS = '
        + json.dumps(out, separators=(',', ':'), ensure_ascii=False) + ';\n')

game = open(f'{ROOT}/hkrace_src.js', encoding='utf-8').read()
html = f'''<!doctype html>
<html lang="zh-HK"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>香港賽車 · HK Street Race</title>
<!-- 自動產生（tools/make_hkrace.py）。改遊戲請改 hkrace_src.js，再行一次 tools/make_hkrace.py -->
<style>[hidden]{{display:none!important}}html,body{{margin:0;height:100%;overflow:hidden;background:#000;color:#fff;font-family:system-ui,"PingFang HK","Microsoft JhengHei",sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}}canvas{{display:block}}#street{{position:fixed;left:50%;top:8px;transform:translateX(-50%);font-weight:800;text-shadow:0 1px 4px #000}}#credit{{position:fixed;left:6px;bottom:4px;font-size:10px;opacity:.6;pointer-events:none}}</style>
</head><body class="race">
<div id="hud"><div id="street"></div></div><div id="credit">建築：地政總署 3D 模型（LandsD）</div>
<script>{three}</script>
<script>{tiles_js}</script>
<script>{cars_js}</script>
<script>{route_js}</script>
<script>window.RACE_TILES = {json.dumps(near, separators=(',', ':'))};</script>
<script>document.write('<script src="' + (matchMedia('(pointer:coarse)').matches ? 'hkrace_cars_m.js' : 'hkrace_cars.js') + '"><\\/script>');</script>
<script>{game}</script>
</body></html>
'''
open(f'{ROOT}/hkrace.html', 'w', encoding='utf-8').write(html)
print('tiles', len(near), 'of', len(tiles), '| hkrace.html', len(html.encode()) // 1024, 'KB')
