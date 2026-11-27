#!/usr/bin/env python3
# Pack HK 3D shop GLBs into hkcity_shop_<id>.js data files for hkcity.html.
# Models: Ho's HK-3D-City shop packs (Shop-Pack, Lo-Yau-Store, Six-Shops).
# Ming Kee shell: "Housing Facade Shop Front" by tevy, CC0 1.0 (tevy.dev/models/housing-facade-shop).
# Pineapple bun crown: "Pineapple bun 01.jpg" by Waydwaid, Wikimedia Commons, CC0 1.0.
# Roast duck glaze: Shek Tong Tsui siu mei window photo by MONLKDWOEA oilsa, Wikimedia Commons, CC0 1.0.
# numpy + Pillow only. Usage: python3 tools/pack_shops.py
import json, struct, base64, os, io
import numpy as np

SRC = os.path.expanduser('~/qtest/shops')
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TYPES = [  # (id, near_glb, street_glb or None, facade_jpg or None, SHOPS.name)
    ('bakery',   'HK-3D-City-Shop-Pack/Mak-Heung-Near.glb',   'HK-3D-City-Shop-Pack/Mak-Heung-Street.glb',   'HK-3D-City-Shop-Pack/Mak-Heung-Facade.jpg',   '麥香餅店'),
    ('siumei',   'HK-3D-City-Shop-Pack/Ming-Kee-Map.glb',     None, None, '明記燒臘'),
    ('store',    'HK-3D-City-Lo-Yau-Store/Lo-Yau-Store.glb',  'HK-3D-City-Lo-Yau-Store/Lo-Yau-Street.glb',  'HK-3D-City-Lo-Yau-Store/Lo-Yau-Facade.jpg',  '老友士多'),
    ('news',     'six/Shops/Corner-Newsstand/Corner-Newsstand.glb', 'six/Shops/Corner-Newsstand/Corner-Newsstand-Street.glb', 'six/Shops/Corner-Newsstand/Corner-Newsstand-Facade.jpg', '街角報攤'),
    ('pawn',     'six/Shops/Tai-Fat-Pawn/Tai-Fat-Pawn.glb',   'six/Shops/Tai-Fat-Pawn/Tai-Fat-Pawn-Street.glb',   'six/Shops/Tai-Fat-Pawn/Tai-Fat-Pawn-Facade.jpg',   '大發押'),
    ('cafe',     'six/Shops/Wong-Kee-Cafe/Wong-Kee-Cafe.glb', 'six/Shops/Wong-Kee-Cafe/Wong-Kee-Cafe-Street.glb', 'six/Shops/Wong-Kee-Cafe/Wong-Kee-Cafe-Facade.jpg', '旺記茶餐廳'),
    ('hardware', 'six/Shops/Tai-Hing-Hardware/Tai-Hing-Hardware.glb', 'six/Shops/Tai-Hing-Hardware/Tai-Hing-Hardware-Street.glb', 'six/Shops/Tai-Hing-Hardware/Tai-Hing-Hardware-Facade.jpg', '大興五金'),
    ('sea',      'six/Shops/Hoi-Mei-Hong/Hoi-Mei-Hong.glb',   'six/Shops/Hoi-Mei-Hong/Hoi-Mei-Hong-Street.glb',   'six/Shops/Hoi-Mei-Hong/Hoi-Mei-Hong-Facade.jpg',   '海味行'),
    ('toy',      'six/Shops/Tung-Lok-Toys/Tung-Lok-Toys.glb', 'six/Shops/Tung-Lok-Toys/Tung-Lok-Toys-Street.glb', 'six/Shops/Tung-Lok-Toys/Tung-Lok-Toys-Facade.jpg', '童樂玩具'),
]

CT = {5120:('b',1,-128,127), 5121:('B',1,0,255), 5122:('h',2,-32768,32767),
      5123:('H',2,0,65535), 5125:('I',4,0,4294967295), 5126:('f',4,None,None)}
NC = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def load_glb(path):
    d = open(path,'rb').read()
    jlen = struct.unpack('<I',d[12:16])[0]
    j = json.loads(d[20:20+jlen])
    off = 20+jlen
    assert d[off+4:off+8]==b'BIN\x00'
    blen = struct.unpack('<I',d[off:off+4])[0]
    return j, d[off+8:off+8+blen]

def acc(j, buf, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    fmt, sz, mn, mx = CT[a['componentType']]; nc = NC[a['type']]
    base = bv.get('byteOffset',0) + a.get('byteOffset',0)
    n = a['count']; stride = bv.get('byteStride') or sz*nc
    if stride == sz*nc:
        arr = np.frombuffer(buf, dtype='<'+fmt, count=n*nc, offset=base).reshape(n,nc)
    else:
        arr = np.zeros((n,nc), dtype='<'+fmt)
        for k in range(n):
            arr[k] = np.frombuffer(buf, dtype='<'+fmt, count=nc, offset=base+k*stride)
    return arr.astype(np.float64), a.get('normalized'), mn, mx

def denorm(arr, mn, mx):
    if mn is None: return arr
    if mn == 0: return arr/mx
    return np.maximum(arr/mx, -1.0)

def trs(node):
    m = np.eye(4)
    if 'matrix' in node:
        return np.array(node['matrix']).reshape(4,4).T
    s = node.get('scale',[1,1,1]); t = node.get('translation',[0,0,0]); q = node.get('rotation',[0,0,0,1])
    x,y,z,w = q
    R = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                  [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                  [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    m[:3,:3] = R @ np.diag(s); m[:3,3] = t
    return m

def world_mats(j):
    W = {}; kids = {}
    for i,n in enumerate(j['nodes']):
        for c in n.get('children',[]): kids[c] = i
    def w(i):
        if i in W: return W[i]
        m = trs(j['nodes'][i])
        if i in kids: m = w(kids[i]) @ m
        W[i] = m; return m
    return w

def pack_level(j, buf):
    """Return list of material groups: {pos,nrm,uv,col,idx,mat} + bounds."""
    groups = {}  # matIndex -> dict of arrays
    w = world_mats(j)
    anycol = False
    for ni,n in enumerate(j['nodes']):
        if 'mesh' not in n: continue
        M = w(ni)
        Mn = M[:3,:3]
        for p in j['meshes'][n['mesh']]['primitives']:
            mi = p.get('material',0)
            g = groups.setdefault(mi, {'pos':[],'nrm':[],'uv':[],'col':[],'idx':[]})
            A = p['attributes']
            pos_raw, nz_, mn_, mx_ = acc(j,buf,A['POSITION'])
            pos = denorm(pos_raw, mn_, mx_)
            pos = (np.c_[pos, np.ones(len(pos))] @ M.T)[:,:3]
            nrm_raw, _, mn2, mx2 = acc(j,buf,A['NORMAL'])
            nrm = denorm(nrm_raw, mn2, mx2) @ Mn
            nrm /= np.maximum(np.linalg.norm(nrm,axis=1,keepdims=True),1e-9)
            uv_raw, _, mn3, mx3 = acc(j,buf,A['TEXCOORD_0'])
            uv = denorm(uv_raw, mn3, mx3)
            idx_raw, _, _, _ = acc(j,buf,p['indices'])
            g['pos'].append(pos); g['nrm'].append(nrm); g['uv'].append(uv)
            if 'COLOR_0' in A:
                col_raw, _, mn4, mx4 = acc(j,buf,A['COLOR_0'])
                col = denorm(col_raw, mn4, mx4)
            else:
                col = np.ones((len(pos),3))
            g['col'].append(col[:,:3])
            g['idx'].append(idx_raw[:,0].astype(np.int64))
            anycol = anycol or ('COLOR_0' in A)
    out = []
    vmin=np.array([1e9]*3); vmax=np.array([-1e9]*3)
    for mi,g in groups.items():
        pos=np.concatenate(g['pos']); nrm=np.concatenate(g['nrm']); uv=np.concatenate(g['uv']); col=np.concatenate(g['col'])
        idx=np.concatenate([x for x in g['idx']])
        # rebuild indices per prim chunk
        idx=np.concatenate([x + off for x,off in zip(g['idx'], np.cumsum([0]+[len(p) for p in g['pos'][:-1]]))])
        vmin=np.minimum(vmin,pos.min(0)); vmax=np.maximum(vmax,pos.max(0))
        mat = j['materials'][mi] if j.get('materials') else {}
        out.append({'pos':pos,'nrm':nrm,'uv':uv,'col':col,'idx':idx,'mi':mi,'mat':mat})
    return out, anycol, [vmin.tolist(),vmax.tolist()]

def img_bytes(j, buf, ti):
    im = j['images'][j['textures'][ti]['source']]
    bv = j['bufferViews'][im['bufferView']]
    return buf[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']], im.get('mimeType','')

def b64(a):
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()

def emit_group(g, anycol):
    mat = g['mat']
    pbr = mat.get('pbrMetallicRoughness',{})
    m = {}
    if 'baseColorTexture' in pbr: m['map'] = '@map'
    if 'emissiveTexture' in mat: m['emis'] = '@emis'
    if 'baseColorFactor' in pbr and 'baseColorTexture' not in pbr:
        m['color'] = pbr['baseColorFactor'][:3]
        if pbr['baseColorFactor'][3] < 1: m['opacity'] = pbr['baseColorFactor'][3]
    if mat.get('alphaMode') == 'BLEND': m['blend'] = True
    if mat.get('doubleSided'): m['double'] = True
    o = {'pos': '@pos', 'nrm': '@nrm', 'uv': '@uv', 'idx': '@idx', 'mat': m}
    if anycol: o['col'] = '@col'
    return o, m

def build_level(j, buf):
    groups, anycol, bounds = pack_level(j, buf)
    textures = {}  # '@map'/'@emis' per group -> data uri
    parts = []
    gv_max = np.abs(np.array(bounds)).max()
    Q = gv_max/32767.0
    for g in groups:
        o, m = emit_group(g, anycol)
        # textures embedded at group level to keep mat JSON small
        if 'map' in m:
            raw, mime = img_bytes(j, buf, g['mat']['pbrMetallicRoughness']['baseColorTexture']['index'])
            if mime == 'image/jpeg': m['map'] = 'data:image/jpeg;base64,'+base64.b64encode(raw).decode()
            else: del m['map']  # drop non-JPEG baseColor (unexpected)
        if 'emis' in m:
            raw, mime = img_bytes(j, buf, g['mat']['emissiveTexture']['index'])
            if mime == 'image/jpeg': m['emis'] = 'data:image/jpeg;base64,'+base64.b64encode(raw).decode()
            else: del m['emis']
        o['pos'] = 'p16:'+b64(np.round(g['pos']/Q).astype('<i2'))
        o['nrm'] = 'n8:'+b64(np.round(g['nrm']*127).astype('<i1'))
        o['uv'] = 'u16:'+b64(np.round(g['uv']*65535).astype('<u2'))
        if 'col' in o: o['col'] = 'c8:'+b64(np.round(g['col']*255).astype('<u1'))
        it = '<u2' if len(g['pos']) < 65536 else '<u4'
        o['idx'] = ('i16:' if len(g['pos'])<65536 else 'i32:')+b64(g['idx'].astype(it))
        parts.append(o)
    return {'groups': parts, 'bounds': [round(v,4) for v in bounds[0]]+[round(v,4) for v in bounds[1]], 'q': round(Q,8)}

HDR = "// 自動產生（tools/pack_shops.py），唔好手改\n// Shop models: Ho's HK-3D-City shop packs (Shop-Pack, Lo-Yau-Store, Six-Shops). Ming Kee shell: \"Housing Facade Shop Front\" by tevy, CC0 1.0 (tevy.dev/models/housing-facade-shop). Pineapple bun crown: \"Pineapple bun 01.jpg\" by Waydwaid, Wikimedia Commons, CC0 1.0. Roast duck glaze: Shek Tong Tsui siu mei window photo by MONLKDWOEA oilsa, Wikimedia Commons, CC0 1.0.\n"
def jdump(o):
    return json.dumps(o, separators=(',',':'), ensure_ascii=False)

def main():
    far = {}
    stats = []
    for tid, near, street, facade, name in TYPES:
        rec = {}
        j, buf = load_glb(os.path.join(SRC, near))
        rec['near'] = build_level(j, buf)
        if street:
            j2, b2 = load_glb(os.path.join(SRC, street))
            rec['street'] = build_level(j2, b2)
        else:
            rec['street'] = None
        fn = f'hkcity_shop_{tid}.js'
        txt = HDR + f'window.HK_SHOP3D = window.HK_SHOP3D || {{}}; HK_SHOP3D["{tid}"] = {jdump(rec)};\n'
        open(os.path.join(OUT, fn),'w',encoding='utf-8').write(txt)
        nidx = lambda g: len(base64.b64decode(g['idx'].split(':',1)[1])) // (2 if g['idx'].startswith('i16:') else 4)
        tris = sum(nidx(g)//3 for g in rec['near']['groups'])
        tris_s = sum(nidx(g)//3 for g in rec['street']['groups']) if rec['street'] else 0
        stats.append((tid, fn, os.path.getsize(os.path.join(OUT,fn)), tris, tris_s))
        if facade:
            far[name] = 'data:image/jpeg;base64,'+base64.b64encode(open(os.path.join(SRC,facade),'rb').read()).decode()
    ft = HDR + 'window.HK_SHOPFAR = '+jdump(far)+';\n'
    open(os.path.join(OUT,'hkcity_shop_far.js'),'w',encoding='utf-8').write(ft)
    stats.append(('(far)','hkcity_shop_far.js',os.path.getsize(os.path.join(OUT,'hkcity_shop_far.js')),0,0))
    print(f"{'id':<10} {'file':<28} {'bytes':>9} {'near tris':>9} {'street':>7}")
    for s in stats: print(f"{s[0]:<10} {s[1]:<28} {s[2]:>9} {s[3]:>9} {s[4]:>7}")

if __name__ == '__main__':
    main()
