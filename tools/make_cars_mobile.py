"""Build hkcity_cars_m.js (phone 3D cars) from hkcity_cars.js.
Phones: far-LOD mesh becomes the only mesh, 512px colour textures, no metal/rough maps."""
import base64, io, json, re, sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else 'hkcity_cars.js'
out = sys.argv[2] if len(sys.argv) > 2 else 'hkcity_cars_m.js'
s = open(src, encoding='utf-8').read()
D = json.loads(''.join(re.findall(r'__J\.push\(`(.*?)`\);', s, re.S)).replace('\\\\', '\\'))

def shrink(u, size=512, q=78):
    head, b = u.split(',', 1)
    im = Image.open(io.BytesIO(base64.b64decode(b)))
    if im.width <= size and head.startswith('data:image/jpeg'):
        return u
    im = im.convert('RGB').resize((size, size), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

for M in D['models'].values():
    M.pop('mr', None)
    lo = M.pop('lo', None)
    if lo:
        for k in ('p', 'uv', 'i', 'n', 'big', 'Q'):
            M.pop(k, None)
        M.update(lo)
    if 'tex' in M:
        M['tex'] = shrink(M['tex'])

js = json.dumps(D, separators=(',', ':')).replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
CH = 500000
with open(out, 'w', encoding='utf-8') as f:
    f.write('// HK_CARS 手機版：由 tools/make_cars_mobile.py 由 hkcity_cars.js 生成（簡化車身、512 貼圖、冇金屬度貼圖）\nwindow.__J = [];\n')
    for i in range(0, len(js), CH):
        f.write('__J.push(`' + js[i:i + CH] + '`);\n')
    f.write('window.HK_CARS = JSON.parse(__J.join("")); window.__J = null;\n')
