// 精品區（hkhd.html）：地政總署原始 3D model（唔減面、原圖 2048 貼圖）+ 附近遊戲圖幅做背景。
// 改呢個檔，再行 python3 tools/make_hkhd.py
const TOUCH = matchMedia('(pointer:coarse)').matches;
// 手機／細記憶體：貼圖解成 1024（≈85 MB 而唔係 ≈341 MB），一張張解，費事爆記憶體
const LITE = TOUCH || (navigator.deviceMemory || 8) <= 4;
const TEXPX = LITE ? 1024 : 2048;
const E0 = 835469, N0 = 818879;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fc4e8); scene.fog = new THREE.Fog(0x9fc4e8, 600, 1600);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 3000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 0.55); sun.position.set(300, 520, 180); scene.add(sun);
{ const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 40, 40), new THREE.MeshLambertMaterial({ color: 0x77787a })); g.rotation.x = -Math.PI / 2; g.position.y = -0.2; scene.add(g); }
const stat = document.getElementById('stat'), t0 = performance.now();
const ST = { tiles: 0, tris: 0, tex: 0, texMB: 0, ms: 0, err: [] };
window.HD = { ST, models: [] };

// 原始 glTF（FME 輸出：一個 node，Z-up 矩陣 + HK1980 平移，貼圖 jpg）
async function loadOrig(id, dir) {
  const base = `${dir}${id}/`;
  const g = await (await fetch(`${base}${id}.gltf`)).json();
  const bin = await (await fetch(`${base}${g.buffers[0].uri}`)).arrayBuffer();
  const node = g.nodes[0], m = node.matrix, T = [m[12], m[13], m[14]];
  const root = new THREE.Group();
  // glTF 世界 = (x, z, -y) + T；遊戲：X = E - E0，Z = N0 - N，Y = 地面 0
  const acc = (i) => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    return { arr: new C(bin, (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n), n, a }; };
  let zmin = Infinity;
  for (const me of g.meshes) for (const p of me.primitives) zmin = Math.min(zmin, g.accessors[p.attributes.POSITION].min[2]);
  const texs = g.textures.map((t) => {
    const url = base + g.images[t.source].uri;
    const tex = new THREE.Texture(); tex.flipY = false; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.hd = { url }; return tex;
  });
  const mats = g.materials.map((mt) => new THREE.MeshLambertMaterial({ map: texs[mt.pbrMetallicRoughness.baseColorTexture.index], side: THREE.DoubleSide }));
  for (const me of g.meshes) for (const p of me.primitives) {
    const geo = new THREE.BufferGeometry(), P = acc(p.attributes.POSITION), N = acc(p.attributes.NORMAL), U = acc(p.attributes.TEXCOORD_0), I = acc(p.indices);
    geo.setAttribute('position', new THREE.BufferAttribute(P.arr, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N.arr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U.arr, 2)); geo.setIndex(new THREE.BufferAttribute(I.arr, 1));
    root.add(new THREE.Mesh(geo, mats[p.material])); ST.tris += I.a.count / 3;
  }
  root.matrixAutoUpdate = false;
  root.matrix.set(1, 0, 0, T[0] - E0, 0, 0, 1, -zmin, 0, -1, 0, T[2] + N0, 0, 0, 0, 1);
  scene.add(root);
  const dec = (t) => fetch(t.hd.url).then((r) => r.blob()).then((b) => createImageBitmap(b, LITE
    ? { imageOrientation: 'none', resizeWidth: TEXPX, resizeHeight: TEXPX, resizeQuality: 'high' } : { imageOrientation: 'none' }));
  const put = (im, t) => { t.hd.full = im; t.image = im; t.needsUpdate = true; ST.tex++; ST.texMB += im.width * im.height * 4 * 4 / 3 / 1048576; };
  if (LITE) { for (const t of texs) put(await dec(t), t); }
  else (await Promise.all(texs.map(dec))).forEach((im, k) => put(im, texs[k]));
  const rec = { id, root, texs, mats, c: new THREE.Vector3(T[0] - E0, 0, T[2] + N0) };
  HD.models.push(rec); return rec;
}

// 對比：將原圖縮到 128 px（hkcity_lm.js 而家半島酒店用嘅貼圖大小；只係貼圖，唔包遊戲版減面）
const small = new Map();
function lowTex(t) {
  if (!small.has(t)) { const c = document.createElement('canvas'); c.width = c.height = 128; c.getContext('2d').drawImage(t.hd.full, 0, 0, 128, 128);
    const s = new THREE.CanvasTexture(c); s.flipY = false; s.encoding = THREE.sRGBEncoding; small.set(t, s); }
  return small.get(t);
}
let lo = false;
function setLo(v) { lo = v; for (const m of HD.models) m.mats.forEach((mt, k) => { mt.map = v ? lowTex(m.texs[k]) : m.texs[k]; mt.needsUpdate = true; });
  document.getElementById('mode').textContent = v ? '而家：128 px（遊戲版貼圖大小）' : `而家：${LITE ? '手機版 1024 px（原圖 2048，慳記憶體）' : '原圖 2048 px'}`; }
document.getElementById('mode').onclick = () => setLo(!lo);
setLo(false);

// 背景：附近圖幅（遊戲版，電腦 2048、手機 1024）
async function loadBg(cx, cz, R) {
  const near = (window.HD_TILES || []).filter((t) => { const [x0, z0, x1, z1] = t.bb; return Math.hypot(Math.max(x0 - cx, 0, cx - x1), Math.max(z0 - cz, 0, cz - z1)) < R; });
  for (const t of near) { try { const r = await loadTile('tiles/', t.s, LITE ? 2 : 1); scene.add(r.mesh); ST.tiles++; ST.tris += r.hdr.ni / 3; } catch (e) { ST.err.push(String(e)); } }
}

// 鏡頭：拖 = 轉，滾輪 / 兩指 = 遠近
const orb = { yaw: 0.4, pitch: 0.3, d: 160, t: new THREE.Vector3() };
const ptr = new Map(); let pinch = 0;   // 一隻手指 = 轉，兩隻 = 遠近（唔轉）
addEventListener('pointerdown', (e) => { if (e.target.tagName !== 'CANVAS') return; ptr.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
const up = (e) => { ptr.delete(e.pointerId); pinch = 0; };
addEventListener('pointerup', up); addEventListener('pointercancel', up);
addEventListener('pointermove', (e) => {
  const q = ptr.get(e.pointerId); if (!q) return;
  if (ptr.size === 1) { orb.yaw -= (e.clientX - q[0]) * 0.006; orb.pitch = Math.max(-0.05, Math.min(1.4, orb.pitch + (e.clientY - q[1]) * 0.005)); }
  ptr.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptr.size === 2) { const [A, B] = [...ptr.values()], d = Math.hypot(A[0] - B[0], A[1] - B[1]); if (pinch) orb.d = Math.max(8, Math.min(900, orb.d * pinch / d)); pinch = d; }
});
addEventListener('wheel', (e) => { orb.d = Math.max(8, Math.min(900, orb.d * Math.exp(e.deltaY * 0.001))); }, { passive: true });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
HD.orb = orb;

let fr = 0, ft = performance.now(), fps = 0;
function frame() {
  requestAnimationFrame(frame); if (window.TEXQ) TEXQ.pump();
  const o = orb, cp = Math.cos(o.pitch);
  camera.position.set(o.t.x + Math.sin(o.yaw) * cp * o.d, o.t.y + Math.sin(o.pitch) * o.d + 2, o.t.z + Math.cos(o.yaw) * cp * o.d); camera.lookAt(o.t);
  renderer.render(scene, camera);
  if (++fr % 20 === 0) { const n = performance.now(); fps = 20000 / (n - ft); ft = n;
    stat.textContent = `原始 model ${HD.models.length} 棟 · 貼圖 ${ST.tex} 張（≈${ST.texMB.toFixed(0)} MB 顯示記憶體）· 三角形 ${(renderer.info.render.triangles / 1000).toFixed(0)}k · 背景圖幅 ${ST.tiles} · 載入 ${(ST.ms / 1000).toFixed(1)} s · ${fps.toFixed(0)} fps`; }
}
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ST.err.push('webglcontextlost');
  stat.textContent = '顯示記憶體唔夠，畫面停咗。請關咗其他分頁再重新載入。'; });
frame();
(async () => {
  try {
    const m = await loadOrig('B357421737102063A0', 'hd/');
    orb.t.set(m.c.x, 22, m.c.z); ST.ms = performance.now() - t0; HD.ready = true;
    loadBg(m.c.x, m.c.z, TOUCH ? 200 : 350).then(() => HD.bgReady = true);
  } catch (e) { ST.err.push(String(e)); stat.textContent = '載入失敗：' + e; }
})();
