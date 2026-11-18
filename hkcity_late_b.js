// Deferred game systems. The flyable city does not wait for this file.

window.IND = (() => {
  const D = window.INDOOR, OPEN = window.OPEN;
  if (!D || !OPEN) return null;
  const $ = (id) => document.getElementById(id), CS = 0.4, FARE = 5;
  const FONT = '"PingFang HK","PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
  const S = { inside: false, busy: false, menu: false, state: null, data: null, groups: null, floor: null, root: null,
    phase: null, t: 0, target: null, paid: false, goal: null, forceFood: false, notice: 0, resourceTimer: 0,
    savedBackground: null, hasSavedBackground: false, lastPickLoads: 0, peoplePool: null };
  const records = D.venues.map((v) => ({ v, data: null, promise: null, groups: null, entries: null, markers: null }));
  const byId = new Map(records.map((r) => [r.v.id, r]));
  const byEn = new Map(records.map((r) => [r.v.en, r]));
  const textureLedger = { created: 0, disposed: 0, live: new Map() };
  let textureSerial = 0;
  function tagTexture(tex, role, scope) {
    const id = ++textureSerial;
    tex.userData = tex.userData || {};
    tex.name = `IND:${role}:${id}`; tex.userData.indoorRole = role; tex.userData.indoorScope = scope;
    textureLedger.created++; textureLedger.live.set(id, { id, role, scope });
    tex.addEventListener('dispose', () => {
      if (textureLedger.live.delete(id)) textureLedger.disposed++;
    });
    return tex;
  }
  function disposeTexture(tex) {
    if (!tex) return;
    if (!tex.userData.indoorRole) { tex.dispose(); return; }
    if (tex.userData.indoorDisposed) return;
    tex.userData.indoorDisposed = true; tex.dispose();
  }
  function textureStats() {
    const live = [...textureLedger.live.values()];
    return { created: textureLedger.created, disposed: textureLedger.disposed, live,
      byScope: live.reduce((out, q) => (out[q.scope] = (out[q.scope] || 0) + 1, out), {}) };
  }
  let markerAssets = null;
  const ST = OPEN.stations || [];
  const stationVenue = new Map();
  ST.forEach((st, k) => {
    const r = records.find((q) => q.v.en === st[1] + ' Station' || q.v.tc === st[0] + '站');
    if (r) stationVenue.set(k, r);
    else console.warn('IND: no indoor venue for MTR station', st[1]);
  });
  const isStation = (r) => !!r && / Station$/.test(r.v.en);
  const clamp = THREE.MathUtils.clamp;
  const point = (r) => { const a = []; for (let i = 0; i + 1 < r.length; i += 2) a.push([r[i], r[i + 1]]); if (a.length > 2 && Math.hypot(a[0][0] - a[a.length - 1][0], a[0][1] - a[a.length - 1][1]) < 0.001) a.pop(); return a; };
  const ringsOf = (r) => !r || !r.length ? [] : typeof r[0] === 'number' ? [r] : r;
  function insideRing(r, x, z) {
    let yes = false; const p = point(r);
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, zi] = p[i], [xj, zj] = p[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi) yes = !yes;
    }
    return yes;
  }
  function insideShape(rings, x, z) {
    const a = ringsOf(rings); return !!a.length && insideRing(a[0], x, z) && !a.slice(1).some((h) => insideRing(h, x, z));
  }
  const edgeDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const px = a[0] + t * dx, pz = a[1] + t * dz; return { d: Math.hypot(x - px, z - pz), x: px, z: pz, dx, dz };
  };
  function nearestEdge(x, z, allRings, interior) {
    let best = null;
    for (const ring of allRings) {
      const p = point(ring); for (let i = 0; i < p.length; i++) {
        const q = edgeDist(x, z, p[i], p[(i + 1) % p.length]);
        if (!best || q.d < best.d) {
          const len = Math.hypot(q.dx, q.dz) || 1, nx = -q.dz / len, nz = q.dx / len;
          const aIn = interior(q.x + nx * 0.12, q.z + nz * 0.12), bIn = interior(q.x - nx * 0.12, q.z - nz * 0.12);
          if (aIn && !bIn) { q.nx = -nx; q.nz = -nz; }
          else if (!aIn && bIn) { q.nx = nx; q.nz = nz; }
          else { q.nx = nx; q.nz = nz; }
          best = q;
        }
      }
    }
    return best;
  }
  function midpoint(line) {
    const p = point(line); if (!p.length) return null; let total = 0;
    for (let i = 1; i < p.length; i++) total += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    let t = total / 2;
    for (let i = 1; i < p.length; i++) {
      const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (t <= l || i === p.length - 1) { const f = l ? t / l : 0; return { x: p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, z: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f }; }
      t -= l;
    }
    return { x: p[0][0], z: p[0][1] };
  }
  function makeGroups(data) {
    const m = new Map();
    data.levels.forEach((l, i) => {
      let g = m.get(l.o); if (!g) { g = { o: l.o, levels: [], names: new Map(), polys: [], z: Infinity }; m.set(l.o, g); }
      g.levels.push({ i, l }); g.names.set(l.n, (g.names.get(l.n) || 0) + 1); g.z = Math.min(g.z, l.z);
      for (const p of l.p || []) g.polys.push(ringsOf(p));
    });
    const a = [...m.values()].sort((x, y) => x.o - y.o);
    a.forEach((g, i) => {
      g.name = [...g.names].sort((x, y) => y[1] - x[1])[0][0];
      const next = a.find((q) => q.o > g.o); g.H = next ? clamp(next.z - g.z - 0.3, 2.6, 6) : 3.5;
      g.units = data.units.filter((u) => data.levels[u[0]] && data.levels[u[0]].o === g.o);
      g.doors = data.doors.filter((d) => data.levels[d[0]] && data.levels[d[0]].o === g.o);
      g.pois = data.pois.filter((p) => data.levels[p[0]] && data.levels[p[0]].o === g.o);
    });
    return a;
  }
  const bboxDist = (bb, x, z) => Math.hypot(Math.max(bb[0] - x, 0, x - bb[2]), Math.max(bb[1] - z, 0, z - bb[3]));
  function getEntries(r) {
    if (r.entries) return r.entries;
    const d = r.data, levelZero = d.levels.map((l, i) => l.o === 0 ? { l, i } : null).filter(Boolean);
    const sources = d.foot || [], output = [];
    for (const door of d.doors || []) {
      const [li, code, line] = door, lev = d.levels[li]; if (!lev || lev.o !== 0 || code > 1) continue;
      const mid = midpoint(line); if (!mid) continue;
      const levelRings = levelZero.flatMap((q) => (q.l.p || []).flatMap((p) => ringsOf(p)));
      const footRings = ringsOf(sources), rings = footRings.concat(levelRings);
      const dist = nearestEdge(mid.x, mid.z, rings, (x, z) => {
        return footRings.some((p) => insideShape(p, x, z)) || levelZero.some((q) => (q.l.p || []).some((p) => insideShape(ringsOf(p), x, z)));
      });
      if (!dist || dist.d > 1.5) continue;
      let out = null;
      for (let step = 1.5; step <= 6.01; step += 0.5) {
        const x = mid.x + dist.nx * step, z = mid.z + dist.nz * step;
        if (!OPEN.solid(x, z) && !OPEN.onRoad(x, z)) { out = { x, z }; break; }
      }
      if (!out) continue;
      output.push({ mid, out, nx: dist.nx, nz: dist.nz, code, li, line });
    }
    output.sort((a, b) => b.code - a.code || Math.hypot(a.out.x - OPEN.hero.x, a.out.z - OPEN.hero.z) - Math.hypot(b.out.x - OPEN.hero.x, b.out.z - OPEN.hero.z));
    r.entries = output.slice(0, 6);
    return r.entries;
  }
  const owned = (o, layer) => o.traverse((q) => q.layers.set(layer));
  function sharedMarkerAssets() {
    if (!markerAssets) {
      const cols = 4, cw = 128, ch = 128, rows = Math.ceil(D.venues.length / cols), canvas = document.createElement('canvas');
      canvas.width = cols * cw; canvas.height = rows * ch;
      const ctx = canvas.getContext('2d');
      D.venues.forEach((v, i) => {
        const x = i % cols * cw, y = Math.floor(i / cols) * ch;
        ctx.fillStyle = 'rgba(25,18,8,.92)'; ctx.fillRect(x + 3, y + 4, cw - 6, ch - 8);
        ctx.strokeStyle = '#ffd65c'; ctx.lineWidth = 4; ctx.strokeRect(x + 4, y + 5, cw - 8, ch - 10);
        ctx.fillStyle = '#fff5d2'; ctx.font = `900 28px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.tc, x + cw / 2, y + ch / 2, cw - 16);
      });
      const texture = tagTexture(new THREE.CanvasTexture(canvas), 'street-marker-atlas', 'marker');
      texture.anisotropy = 2;
      markerAssets = {
        torus: new THREE.TorusGeometry(0.82, 0.12, 8, 28),
        ring: new THREE.RingGeometry(1.05, 1.55, 28),
        torusMat: new THREE.MeshBasicMaterial({ color: 0xffc52d, transparent: true, opacity: 0.92 }),
        ringMat: new THREE.MeshBasicMaterial({ color: 0xffcf38, transparent: true, opacity: 0.19, side: THREE.DoubleSide, depthWrite: false }),
        markerTexture: texture, markerMaterial: new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false }),
        markerRows: rows, markerCols: cols
      };
    }
    return markerAssets;
  }
  function disposeMarkerAssetsIfUnused() {
    if (!markerAssets || records.some((r) => r.markers && r.markers.length)) return;
    markerAssets.torus.dispose(); markerAssets.ring.dispose(); markerAssets.torusMat.dispose(); markerAssets.ringMat.dispose();
    markerAssets.markerMaterial.dispose(); disposeTexture(markerAssets.markerTexture);
    markerAssets = null;
  }
  function disposeMarkers(r) {
    if (r.markers) for (const q of r.markers) if (q.g.parent) q.g.parent.remove(q.g);
    for (const geo of r.markerGeometries || []) geo.dispose();
    r.markers = null; r.markerGeometries = null; r.markerMaterial = null; r.markerTexture = null;
    disposeMarkerAssetsIfUnused();
  }
  function addMarkers(r) {
    if (r.markers !== null || isStation(r) || bboxDist(r.v.bb, OPEN.hero.x, OPEN.hero.z) > 250) return;
    const entries = getEntries(r); if (!entries.length) { r.markers = []; return; }
    const shared = sharedMarkerAssets();
    const index = D.venues.findIndex((v) => v.id === r.v.id), col = index % shared.markerCols, row = Math.floor(index / shared.markerCols);
    r.markerTexture = shared.markerTexture; r.markerMaterial = shared.markerMaterial; r.markerGeometries = [];
    r.markers = entries.map((e) => {
      const g = new THREE.Group(), ring = new THREE.Mesh(shared.torus, shared.torusMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.16; g.add(ring);
      const glow = new THREE.Mesh(shared.ring, shared.ringMat);
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.08; g.add(glow);
      const label = new THREE.Sprite(shared.markerMaterial), geometry = label.geometry.clone(), uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, col / shared.markerCols + uv.getX(i) / shared.markerCols,
        1 - (row + 1) / shared.markerRows + uv.getY(i) / shared.markerRows);
      uv.needsUpdate = true; label.geometry = geometry; r.markerGeometries.push(geometry);
      label.scale.set(3.6, 0.9, 1); label.position.y = 2.7; label.renderOrder = 10; g.add(label);
      g.position.set(e.out.x, 0, e.out.z); owned(g, 0); scene.add(g); return { g, ring, entry: e };
    });
  }
  function releasePayload(r) {
    disposeMarkers(r);
    if (window.INDOOR_V) delete window.INDOOR_V[r.v.id];
    r.data = null; r.groups = null; r.entries = null;
  }
  function syncResources() {
    const x = OPEN.hero.x, z = OPEN.hero.z, target = OPEN.mission && OPEN.mission.indoor && OPEN.mission.indoor.venue;
    for (const r of records) {
      const d = bboxDist(r.v.bb, x, z);
      if (r.data && !isStation(r) && d <= 250) addMarkers(r);
      if (r.markers && d > 300) disposeMarkers(r);
      if (r.data && !r.promise && !r.picking && d > 400 && r !== S.state && r.v.id !== target) releasePayload(r);
    }
  }
  function load(r) {
    if (r.data) return Promise.resolve(r.data);
    if (r.promise) return r.promise;
    r.promise = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = r.v.file; s.async = true;
      s.onload = () => {
        s.remove(); r.data = window.INDOOR_V && window.INDOOR_V[r.v.id]; r.promise = null;
        if (!r.data) { reject(new Error('IND: venue payload missing ' + r.v.id)); return; }
        r.groups = makeGroups(r.data); resolve(r.data);
      };
      s.onerror = () => { s.remove(); r.promise = null; console.warn('IND: failed to load', r.v.file); reject(new Error('IND: failed to load ' + r.v.file)); };
      document.head.appendChild(s);
    });
    return r.promise;
  }
  if (!window.__indoorCredit) {
    const cr = $('credit'); if (cr) cr.textContent += '；室內地圖 © 香港特區政府地政總署「三維室內地圖」（CSDI 空間數據共享平台）';
    window.__indoorCredit = true;
  }
  const style = document.createElement('style');
  style.textContent = `
#indLift,#indStair{position:fixed;left:50%;transform:translateX(-50%);z-index:8;width:min(340px,90vw);max-height:72vh;overflow:auto;padding:10px 12px;border-radius:14px;background:rgba(24,26,32,.96);border:1px solid #aeb8c2;color:#fff;pointer-events:auto;font-size:15px}
#indLift{top:50%;transform:translate(-50%,-50%)}#indStair{bottom:calc(82px + env(safe-area-inset-bottom));display:flex;gap:8px;align-items:center;justify-content:center}
#indLift .mh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:900}#indLift .mh span{cursor:pointer;padding:4px 8px}
#indLift .lb{display:grid;grid-template-columns:1fr 1fr;gap:7px}
#indLift button,#indStair button{min-height:42px;border-radius:22px;border:2px solid #9aa1a8;background:#3a3f46;color:#fff;font:900 16px ${FONT};padding:6px 12px}
#indLift button small{display:block;font-size:11px;font-weight:600;opacity:.8}
#indStair b{font-size:13px}
`;
  document.head.appendChild(style);
  $('oui').insertAdjacentHTML('beforeend', '<div id="indLift" hidden><div class="mh"><b>升降機</b><span id="indLiftX">✕</span></div><div class="lb" id="indLiftL"></div></div><div id="indStair" hidden><b id="indStairT">樓梯</b><button id="indDown">↓ 落一層</button><button id="indUp">↑ 上一層</button></div>');
  $('indLift').addEventListener('pointerdown', (e) => e.stopPropagation());
  $('indStair').addEventListener('pointerdown', (e) => e.stopPropagation());
  $('indLiftX').onclick = () => { S.menu = false; S.busy = false; $('indLift').hidden = true; };
  const C3 = new THREE.Color();
  const color = (hex, k = 1) => { C3.set(hex); return [C3.r * k, C3.g * k, C3.b * k]; };
  let M = null, sharedAssets = null, showcaseAssets = null, showcaseLightingActive = false;
  function tileTexture(draw) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    draw(cv.getContext('2d'), cv.width, cv.height);
    const tex = tagTexture(new THREE.CanvasTexture(cv), 'shared-fitout', 'session'); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 2;
    return tex;
  }
  function makeSharedAssets() {
    if (sharedAssets) return sharedAssets;
    const gridTile = (base, line, flecks = false) => tileTexture((ctx, w, h) => {
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
      if (flecks) for (let i = 0; i < 34; i++) {
        const x = (i * 47 + 19) % w, y = (i * 83 + 31) % h;
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.22)' : 'rgba(55,58,60,.14)'; ctx.fillRect(x, y, i % 3 ? 2 : 3, 2);
      }
    });
    const terrazzo = gridTile('#d9dad7', '#bfc2c0', true);
    const beigeTile = gridTile('#d7c8ad', '#b9a98d');
    const granite = gridTile('#9ba0a1', '#72797b', true);
    const wood = tileTexture((ctx, w, h) => {
      ctx.fillStyle = '#bb9667'; ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) {
        ctx.fillStyle = x % 128 ? '#c7a779' : '#b88f5e'; ctx.fillRect(x + 2, 2, 60, h - 4);
        ctx.strokeStyle = 'rgba(93,61,34,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 1, 0); ctx.lineTo(x + 1, h); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,232,190,.25)'; ctx.lineWidth = 1;
        for (let y = 20; y < h; y += 31) { ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.bezierCurveTo(x + 25, y - 3, x + 40, y + 4, x + 56, y); ctx.stroke(); }
      }
      ctx.strokeStyle = 'rgba(83,55,32,.25)'; ctx.beginPath(); ctx.moveTo(0, h - 2); ctx.lineTo(w, h - 2); ctx.stroke();
    });
    const plaster = tileTexture((ctx, w, h) => {
      ctx.fillStyle = '#eeeae1'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(178,170,156,.17)'; ctx.lineWidth = 1;
      for (let y = 23; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.fillStyle = '#9b9285'; ctx.fillRect(0, h - 4, w, 4);
    });
    const enamel = tileTexture((ctx, w, h) => {
      ctx.fillStyle = '#eee9dc'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e5dfd2'; ctx.fillRect(2, 2, w - 4, h - 4);
      ctx.strokeStyle = '#c4bcae'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.moveTo(8, 6); ctx.lineTo(w - 8, 6); ctx.stroke();
    });
    const ceiling = gridTile('#f1f1ed', '#c9ccca');
    const standard = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.76, fog: false, ...extra });
    const solid = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, vertexColors: true, side: THREE.DoubleSide, roughness: 0.72, fog: false, ...extra });
    const materials = {
      mallFloor: standard(terrazzo, { roughness: 0.32 }),
      woodFloor: standard(wood, { roughness: 0.55 }),
      beigeFloor: standard(beigeTile, { roughness: 0.7 }),
      stationFloor: standard(granite, { roughness: 0.66 }),
      plasterWall: standard(plaster),
      stationWall: standard(enamel),
      ceiling: standard(ceiling),
      shopGlass: solid(0xaac8d2, { transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.1, metalness: 0.15 }),
      fascia: solid(0xd2bc91, { roughness: 0.6 }),
      metal: solid(0x323941, { roughness: 0.36, metalness: 0.72 }),
      brushedSteel: solid(0xc0c5c7, { roughness: 0.48, metalness: 0.16 }),
      furniture: solid(0xffffff, { roughness: 0.78 }),
      gate: solid(0x969da2, { roughness: 0.48, metalness: 0.42 }),
      tactile: solid(0xe7bd36, { roughness: 0.68 }),
      lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8dc, emissiveIntensity: 1.25, roughness: 0.4, fog: false }),
      lightGeo: new THREE.BoxGeometry(1.2, 0.045, 0.6)
    };
    sharedAssets = { textures: [terrazzo, wood, beigeTile, granite, plaster, enamel, ceiling], materials };
    return sharedAssets;
  }
  function ensureShowcaseAssets() {
    if (showcaseAssets) return showcaseAssets;
    const anisotropy = typeof renderer !== 'undefined' && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 4;
    const canvasTexture = (canvas, role) => {
      const texture = tagTexture(new THREE.CanvasTexture(canvas), role, 'session');
      texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
      texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = anisotropy; texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    const mosaicCanvas = document.createElement('canvas'); mosaicCanvas.width = 128; mosaicCanvas.height = 128;
    const mosaic = mosaicCanvas.getContext('2d'), tile = 32;
    mosaic.fillStyle = '#b9b9b9'; mosaic.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const shade = 224 + ((x * 19 + y * 13 + (x * y * 7)) % 24);
      mosaic.fillStyle = `rgb(${shade},${shade},${shade})`; mosaic.fillRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4);
      mosaic.fillStyle = 'rgba(255,255,255,.32)'; mosaic.fillRect(x * tile + 3, y * tile + 3, tile - 6, 2);
    }
    const nameCanvas = document.createElement('canvas'); nameCanvas.width = 512; nameCanvas.height = 112;
    const name = nameCanvas.getContext('2d');
    name.fillStyle = '#fff'; name.fillRect(0, 0, 512, 112); name.strokeStyle = '#d4d5d6'; name.lineWidth = 5; name.strokeRect(3, 3, 506, 106);
    name.fillStyle = '#16191c'; name.textAlign = 'center'; name.textBaseline = 'middle'; name.font = `800 46px ${FONT}`;
    name.fillText('旺角 Mong Kok', 256, 56);
    const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 256;
    const sign = signCanvas.getContext('2d');
    const signCell = (index, bg, border, lines, arrow = '') => {
      const x = (index % 2) * 256, y = Math.floor(index / 2) * 128;
      sign.fillStyle = bg; sign.fillRect(x, y, 256, 128); sign.strokeStyle = border; sign.lineWidth = 8; sign.strokeRect(x + 5, y + 5, 246, 118);
      sign.fillStyle = '#fff'; sign.textAlign = 'center'; sign.textBaseline = 'middle';
      if (arrow) {
        sign.font = `900 43px ${FONT}`; sign.fillText(lines[0], x + 126, y + 43);
        sign.font = '900 58px sans-serif'; sign.fillText(arrow, x + 218, y + 65);
      } else {
        sign.font = `900 ${lines[0].length > 14 ? 24 : 30}px ${FONT}`; sign.fillText(lines[0], x + 128, y + 43, 232);
        sign.font = `800 ${lines[1].length > 15 ? 18 : 22}px ${FONT}`; sign.fillText(lines[1], x + 128, y + 86, 232);
      }
    };
    signCell(0, '#f4cf45', '#332a17', ['出口 Exit'], '↑');
    signCell(1, '#b2222a', '#f5d6a0', ['售票', 'Tickets']);
    signCell(2, '#176a69', '#d3e2d4', ['增值', 'Add Value']);
    signCell(3, '#f8f7f2', '#b9bfc2', ['客務中心', 'Customer Service']);
    const textures = [
      canvasTexture(mosaicCanvas, 'mk-c-mosaic'),
      canvasTexture(nameCanvas, 'mk-c-name-strip'),
      canvasTexture(signCanvas, 'mk-c-sign-atlas')
    ];
    const materials = M.assets.materials;
    materials.mkMosaicWall = new THREE.MeshStandardMaterial({ map: textures[0], color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.82, fog: false });
    materials.mkShowcaseFloor = new THREE.MeshStandardMaterial({ map: M.assets.textures[3], color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.42, metalness: 0.04, fog: false });
    materials.mkShowcaseSolid = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.64, metalness: 0.08, fog: false });
    materials.mkShowcaseGlass = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.33, depthWrite: false, roughness: 0.12, metalness: 0.12, fog: false });
    materials.mkShowcaseEmissive = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, toneMapped: false, fog: false });
    materials.mkShowcaseSigns = new THREE.MeshBasicMaterial({ map: textures[2], color: 0xffffff, side: THREE.DoubleSide, toneMapped: false, fog: false });
    materials.mkShowcaseName = new THREE.MeshBasicMaterial({ map: textures[1], color: 0xffffff, side: THREE.DoubleSide, toneMapped: false, fog: false });
    materials.mkGatePanels = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, toneMapped: false, fog: false });
    sharedAssets.textures.push(...textures);
    showcaseAssets = { textures, createdTextures: textures.length, lightGeo: new THREE.BoxGeometry(2.4, 0.045, 0.1) };
    return showcaseAssets;
  }
  function setShowcaseLighting(config) {
    if (!M) return;
    if (config) {
      M.hemi.intensity = 1 + (config.lightBoost || 0.32);
      M.sun.intensity = 0.35 + (config.lightBoost || 0.32) * 0.18;
    } else if (showcaseLightingActive) {
      M.hemi.intensity = 1;
      M.sun.intensity = 0.35;
    }
    showcaseLightingActive = !!config;
  }
  function init() {
    const assets = makeSharedAssets();
    M = { assets, hemi: new THREE.HemisphereLight(0xe4e9ee, 0x77746e, 0.9), sun: new THREE.DirectionalLight(0xfff0dc, 0.32),
      line2: new THREE.LineBasicMaterial({ color: 0x45bfff, transparent: true, opacity: 0.9 }),
      line3: new THREE.LineDashedMaterial({ color: 0xffa52c, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.95 }) };
    OPEN.hero.root.traverse((o) => o.layers.enable(1));
    S.root = new THREE.Group(); S.root.visible = false;
    M.sun.position.set(8, 12, 5);
    S.root.add(M.hemi, M.sun, M.sun.target);
    owned(S.root, 1);
    scene.add(S.root);
  }
  function vbNew() {
    const P = [], N = [], C = [], U = [], a = new THREE.Vector3(), b = new THREE.Vector3();
    const tri = (A, B, Cc, ca, cb, cc, ua = [A[0], A[2]], ub = [B[0], B[2]], uc = [Cc[0], Cc[2]]) => {
      a.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]); b.set(Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]); a.cross(b).normalize();
      for (const [p, c, uv] of [[A, ca, ua], [B, cb, ub], [Cc, cc, uc]]) { P.push(...p); N.push(a.x, a.y, a.z); C.push(...c); U.push(...uv); }
    };
    return { tri, quad: (a, b, c, d, ca, cb = ca, cc = cb, cd = ca, uv = null) => {
      const q = uv || [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]], [d[0], d[2]]];
      tri(a, b, c, ca, cb, cc, q[0], q[1], q[2]); tri(a, c, d, ca, cc, cd, q[0], q[2], q[3]);
    },
      flat(rings, y, c, up = true, scale = 0.6) {
        const rr = ringsOf(rings); if (!rr.length) return;
        const outer = point(rr[0]).map(([x, z]) => new THREE.Vector2(x, z)), holes = rr.slice(1).map((r) => point(r).map(([x, z]) => new THREE.Vector2(x, z)));
        const all = outer.concat(...holes);
        for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(outer, holes)) {
          const A = all[i], B = all[j], Cc = all[k], cr = (B.x - A.x) * (Cc.y - A.y) - (B.y - A.y) * (Cc.x - A.x);
          const p = [[A.x, y, A.y], [B.x, y, B.y], [Cc.x, y, Cc.y]];
          const uv = [[A.x / scale, A.y / scale], [B.x / scale, B.y / scale], [Cc.x / scale, Cc.y / scale]];
          if ((cr < 0) === up) tri(p[0], p[1], p[2], c, c, c, uv[0], uv[1], uv[2]); else tri(p[0], p[2], p[1], c, c, c, uv[0], uv[2], uv[1]);
        }
      },
      geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); return g; },
      get triangles() { return P.length / 9; } };
  }
  const NO_WALL = new Set(['walkway', 'lobby', 'unenclosedarea', 'parking', 'road', 'platform', 'opentobelow', 'unspecified', 'vegetation']);
  const NO_WALK = new Set(['opentobelow', 'elevator', 'vegetation']);
  const SHOP_CATEGORIES = new Set(['room', 'foodservice', 'classroom', 'office']);
  const PUBLIC_CATEGORIES = new Set(['walkway', 'lobby', 'unenclosedarea']);
  const SHOP_TYPE_KEYWORDS = {
    apparel: ['服', '裝', '鞋', 'wear', 'fashion', 'shoe', 'sport', 'locker', 'jeans', '衣'],
    eyewear: ['眼鏡', 'optical', '珠寶', 'jewel', '錶', 'watch', 'gold', '金'],
    convenience: ['7-eleven', 'circle k', 'ok便利', '便利', '超市', 'mart', 'wellcome', '百佳'],
    pharmacy: ['藥', 'pharm', '莎莎', 'sasa', 'beauty', '化妝', 'watsons', '屈臣氏', 'mannings', '萬寧'],
    electronics: ['電', 'phone', 'mobile', 'digital', 'camera', '數碼'],
    foodservice: ['餐', '茶', 'cafe', 'coffee', '咖啡', 'restaurant', '麵', '粥', '飯', 'kitchen']
  };
  const INDOOR_SHOWCASES = Object.freeze({
    'f0b802fd-28b0-40e3-abff-62090becf0d4': Object.freeze({
      C: Object.freeze({
        kind: 'mong-kok-c', lightBoost: 0.32, ceilingStep: 3,
        poiKeywords: Object.freeze({
          bank: ['銀行', 'bank', '恒生', '中國銀行'],
          healthcare: ['醫療', '健康', '同仁堂', '澳至尊'],
          foodservice: ['西餅', '泡芙']
        })
      })
    })
  });
  const showcaseForFloor = (r, g) => INDOOR_SHOWCASES[r?.v?.id]?.[g?.name] || null;
  const PROP_INSTANCE_CAP = 3000, PROP_TRIANGLE_CAP = 25000;
  let indoorPropAssets = null;
  const GENERIC_SHOP_NAMES = new Set(['商店', '餐廳', 'shop', 'kitchen', '熟食檔', '電影院', '店舖']);
  const NONSHOP_NAMES = new Set(['中空', '走廊', '行車通道', '有蓋走廊', '有蓋行人通道', '大堂', '停車位( 一般)', '升降機',
    '升降機大堂', '樓梯', '扶手電梯', '防煙間', '垃圾房', '洗手間(男性)', '洗手間(女性)', '洗手間(女性及男性)',
    '洗手間(殘疾人士)', '上落客貨處', '上落客貨平台', '院子', '花園', '鐵路路軌', '月台', '平台', 'Platform']);
  const NONSHOP_NAME_RE = /月台|平台|platform|路軌|track|走廊|中空|升降機|lift|樓梯|扶手電梯|洗手間|防煙間|垃圾房|貯存室|保安|控制室|非開放區域|限制區域|診所|健康院|藥房|客務中心|辦公室|工場|停車|大堂/i;
  const UNIT_COLOR = { walkway: '#989ca3', lobby: '#b3a78f', room: '#887e72', platform: '#438865', elevator: '#858a95',
    escalator: '#a58e63', stairs: '#a9956c', opentobelow: '#272b34', vegetation: '#47634a', parking: '#555860',
    road: '#44474d', foodservice: '#c78957', 'restroom.female': '#b57496', 'restroom.male': '#6289b0',
    'restroom.unisex': '#8a78ae', 'restroom.wheelchair': '#538fa0' };
  const unitRings = (u) => ringsOf(u[4]);
  const unitName = (u) => String(u[2] || '').trim();
  function isShopLike(cat, name) {
    const nonshop = NONSHOP_NAMES.has(name) || NONSHOP_NAME_RE.test(name);
    return !nonshop && (SHOP_CATEGORIES.has(cat) || (cat === 'unspecified' && !!name));
  }
  function signableName(name) { const text = String(name || '').trim(); return !!text && !/^[\d０-９]+$/.test(text) && !GENERIC_SHOP_NAMES.has(text.toLowerCase()); }
  function floorMaterialClass(cat, station, name) {
    if (station || cat === 'platform') return 'stationFloor';
    if (cat === 'room' || cat === 'office') return 'woodFloor';
    if (cat === 'foodservice' || cat === 'classroom' || (cat === 'unspecified' && isShopLike(cat, name))) return 'beigeFloor';
    return 'mallFloor';
  }
  const centroid = (rings) => { const p = point(ringsOf(rings)[0] || []); if (!p.length) return { x: 0, z: 0 }; return { x: p.reduce((s, q) => s + q[0], 0) / p.length, z: p.reduce((s, q) => s + q[1], 0) / p.length }; };
  function orientedBounds(rings) {
    const p = point(ringsOf(rings)[0] || []); if (p.length < 3) return null;
    let edge = null, best = 0;
    for (let i = 0; i < p.length; i++) {
      const A = p[i], B = p[(i + 1) % p.length], dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz);
      if (len > best) { best = len; edge = { ux: dx / len, uz: dz / len }; }
    }
    if (!edge) return null;
    const ux = edge.ux, uz = edge.uz, nx = -uz, nz = ux;
    let minS = Infinity, maxS = -Infinity, minT = Infinity, maxT = -Infinity;
    for (const q of p) { const s = q[0] * ux + q[1] * uz, t = q[0] * nx + q[1] * nz; minS = Math.min(minS, s); maxS = Math.max(maxS, s); minT = Math.min(minT, t); maxT = Math.max(maxT, t); }
    return { ux, uz, nx, nz, minS, maxS, minT, maxT, length: maxS - minS, width: maxT - minT };
  }
  function localPoint(box, s, t) { return { x: box.ux * s + box.nx * t, z: box.uz * s + box.nz * t }; }
  function polygonArea(rings) {
    const rr = ringsOf(rings); let area = 0;
    for (let ri = 0; ri < rr.length; ri++) {
      const p = point(rr[ri]); let a = 0;
      for (let i = 0; i < p.length; i++) a += p[i][0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * p[i][1];
      area += (ri ? -1 : 1) * Math.abs(a) * 0.5;
    }
    return Math.max(0, area);
  }
  function facingEdge(unit, grid) {
    let best = null;
    for (const ring of unit.rings) {
      const p = point(ring);
      for (let i = 0; i < p.length; i++) {
        const A = p[i], B = p[(i + 1) % p.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (len < 0.45) continue;
        const mid = [(A[0] + B[0]) * 0.5, (A[1] + B[1]) * 0.5], dx = B[0] - A[0], dz = B[1] - A[1];
        let nx = -dz / len, nz = dx / len;
        if (insideShape(unit.rings, mid[0] + nx * 0.12, mid[1] + nz * 0.12)) { nx = -nx; nz = -nz; }
        let score = 0;
        for (let s = 0.25; s < len - 0.2; s += 0.55) {
          const t = s / len, x = A[0] + dx * t, z = A[1] + dz * t;
          for (const off of [0.32, 0.62, 0.95]) {
            const ix = grid ? grid.idxAt(x + nx * off, z + nz * off) : -1;
            if (ix >= 0 && grid.walkable[ix]) score += 1 / off;
          }
        }
        if (!best || score > best.score) best = { A, B, nx, nz, score, length: len };
      }
    }
    return best && best.score > 0 ? best : null;
  }
  function doorFacingEdge(unit, grid, doors) {
    let best = null;
    for (const door of doors || []) for (const [A, B] of linesOf(door[2])) {
      const dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz);
      if (len < 0.38 || len > 3.2) continue;
      const mid = [(A[0] + B[0]) * 0.5, (A[1] + B[1]) * 0.5];
      let boundary = Infinity;
      for (const ring of unit.rings) {
        const p = point(ring);
        for (let i = 0; i < p.length; i++) boundary = Math.min(boundary, distToSeg(mid[0], mid[1], p[i], p[(i + 1) % p.length]));
      }
      if (boundary > 0.8 && !insideShape(unit.rings, mid[0], mid[1])) continue;
      let nx = -dz / len, nz = dx / len;
      if (insideShape(unit.rings, mid[0] + nx * 0.12, mid[1] + nz * 0.12)) { nx = -nx; nz = -nz; }
      let score = 0;
      for (let t = 0.18; t < 0.9; t += 0.24) for (const off of [0.3, 0.55, 0.85]) {
        const x = A[0] + dx * t + nx * off, z = A[1] + dz * t + nz * off, ix = grid ? grid.idxAt(x, z) : -1;
        if (ix >= 0 && grid.walkable[ix]) score += 1 / off;
      }
      if (score > 0 && (!best || score > best.score || (score === best.score && boundary < best.boundary))) {
        best = { A, B, nx, nz, score, length: len, boundary, source: 'door' };
      }
    }
    return best;
  }
  function linesOf(flat) { const p = point(flat), out = []; for (let i = 1; i < p.length; i++) out.push([p[i - 1], p[i]]); return out; }
  const distToSeg = (x, z, a, b) => edgeDist(x, z, a, b).d;
  function makeDoorIndex(doors) {
    const cell = 4, segments = [], buckets = new Map();
    for (const door of doors) for (const [a, b] of door) {
      const seg = { a, b, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }, id = segments.push(seg) - 1;
      for (let x = Math.floor(seg.x0 / cell); x <= Math.floor(seg.x1 / cell); x++) for (let z = Math.floor(seg.z0 / cell); z <= Math.floor(seg.z1 / cell); z++) {
        const key = `${x},${z}`; let bucket = buckets.get(key); if (!bucket) buckets.set(key, bucket = []); bucket.push(id);
      }
    }
    return { cell, segments, buckets, seen: new Uint32Array(segments.length), stamp: 0 };
  }
  function doorCandidates(index, a, b, pad = 0.6) {
    if (!index.segments.length) return [];
    const ax = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]), az = Math.min(a[1], b[1]), maxZ = Math.max(a[1], b[1]);
    const x0 = Math.floor((ax - pad) / index.cell), x1 = Math.floor((maxX + pad) / index.cell), z0 = Math.floor((az - pad) / index.cell), z1 = Math.floor((maxZ + pad) / index.cell);
    let stamp = (index.stamp + 1) >>> 0;
    if (!stamp) { index.seen.fill(0); stamp = 1; }
    index.stamp = stamp;
    const found = [];
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      for (const id of index.buckets.get(`${cx},${cz}`) || []) {
        if (index.seen[id] === stamp) continue;
        index.seen[id] = stamp;
        const s = index.segments[id];
        if (s.x1 < ax - pad || s.x0 > maxX + pad || s.z1 < az - pad || s.z0 > maxZ + pad) continue;
        found.push(s);
      }
    }
    return found;
  }
  function nearDoor(segments, x, z) {
    const pad = 0.6;
    for (const s of segments) {
      if (s.x1 < x - pad || s.x0 > x + pad || s.z1 < z - pad || s.z0 > z + pad) continue;
      if (distToSeg(x, z, s.a, s.b) < pad) return true;
    }
    return false;
  }
  function unitBounds(rings) {
    const p = point(ringsOf(rings)[0] || []), b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const q of p) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }
    return b;
  }
  function publicUnitShapes(g, data, includePlatforms = false) {
    const out = { cell: 4, length: 0, buckets: new Map(), large: [], shapes: [] };
    for (const u of g.units) {
      const cat = data.cats[u[1]] || '';
      if (!PUBLIC_CATEGORIES.has(cat) && !(includePlatforms && cat === 'platform')) continue;
      const rings = unitRings(u), bounds = unitBounds(rings); if (!Number.isFinite(bounds[0])) continue;
      const shape = { rings, bounds }, x0 = Math.floor(bounds[0] / out.cell), x1 = Math.floor(bounds[2] / out.cell), z0 = Math.floor(bounds[1] / out.cell), z1 = Math.floor(bounds[3] / out.cell);
      out.length++; out.shapes.push(shape);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 2000) { out.large.push(shape); continue; }
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`; let bucket = out.buckets.get(key); if (!bucket) out.buckets.set(key, bucket = []); bucket.push(shape);
      }
    }
    return out;
  }
  function publicAt(units, x, z) {
    if (!units || !units.length) return false;
    const bucket = units.buckets.get(`${Math.floor(x / units.cell)},${Math.floor(z / units.cell)}`) || [];
    for (const u of bucket) {
      const b = u.bounds; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      if (insideShape(u.rings, x, z)) return true;
    }
    for (const u of units.large) {
      const b = u.bounds; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      if (insideShape(u.rings, x, z)) return true;
    }
    return false;
  }
  function publicSide(ring, A, B, publicUnits) {
    if (!publicUnits || !publicUnits.length) return null;
    const dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz) || 1, mx = (A[0] + B[0]) * 0.5, mz = (A[1] + B[1]) * 0.5;
    let nx = -dz / len, nz = dx / len;
    if (insideShape(ring, mx + nx * 0.12, mz + nz * 0.12)) { nx = -nx; nz = -nz; }
    if ([0.25, 0.55, 0.95].some((d) => publicAt(publicUnits, mx + nx * d, mz + nz * d))) return { nx, nz };
    return null;
  }
  function addBox(builder, center, size, axis, tint) {
    const ux = axis ? axis[0] : 1, uz = axis ? axis[1] : 0, nx = -uz, nz = ux;
    const [sx, sy, sz] = size, [cx, cy, cz] = center, v = (x, y, z) => [cx + ux * x + nx * z, cy + y, cz + uz * x + nz * z];
    const x0 = -sx * 0.5, x1 = sx * 0.5, y0 = -sy * 0.5, y1 = sy * 0.5, z0 = -sz * 0.5, z1 = sz * 0.5, c = tint;
    const faces = [
      [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)],
      [v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0)],
      [v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0)],
      [v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)],
      [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)],
      [v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)]
    ];
    for (const q of faces) builder.quad(q[0], q[1], q[2], q[3], c);
  }
  function addTexturedPanel(builder, center, normal, width, height, atlasIndex) {
    const right = [normal[1], -normal[0]], [x, y, z] = center, depth = 0.012, hw = width * 0.5, hh = height * 0.5;
    const at = (u, v) => [x + right[0] * u + normal[0] * depth, y + v, z + right[1] * u + normal[1] * depth];
    const col = atlasIndex % 2, row = Math.floor(atlasIndex / 2), u0 = col / 2, u1 = (col + 1) / 2;
    const v0 = 1 - (row + 1) / 2, v1 = 1 - row / 2, white = color('#ffffff');
    builder.quad(at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh), white, white, white, white,
      [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  function addShowcaseNameStrips(root, g) {
    const signBuilder = vbNew(), baseY = 2.2, height = 0.36, width = 2.3;
    let count = 0; const points = [];
    for (const rings of g.polys) for (const ring of ringsOf(rings)) {
      const p = point(ring);
      for (let i = 0; i < p.length; i++) {
        const A = p[i], B = p[(i + 1) % p.length], dx = B[0] - A[0], dz = B[1] - A[1], length = Math.hypot(dx, dz);
        if (length < 8) continue;
        const nx0 = -dz / length, nz0 = dx / length, mx = (A[0] + B[0]) * 0.5, mz = (A[1] + B[1]) * 0.5;
        const insideSign = insideShape(rings, mx + nx0 * 0.12, mz + nz0 * 0.12) ? 1 : -1;
        const normal = [nx0 * insideSign, nz0 * insideSign], right = [normal[1], -normal[0]];
        const lo = Math.min(A[0] * right[0] + A[1] * right[1], B[0] * right[0] + B[1] * right[1]);
        const hi = Math.max(A[0] * right[0] + A[1] * right[1], B[0] * right[0] + B[1] * right[1]);
        const total = hi - lo, first = Math.ceil((lo + width * 0.5 + 5) / 12) * 12;
        for (let s = first; s < hi - width * 0.5 - 4; s += 12) {
          const offset = s - (A[0] * right[0] + A[1] * right[1]), x = A[0] + right[0] * offset;
          const z = A[1] + right[1] * offset;
          if (Math.hypot(x - mx, z - mz) > total * 0.55) continue;
          const hw = width * 0.5, hh = height * 0.5;
          const at = (u, v) => [x + right[0] * u + normal[0] * 0.035, baseY + v, z + right[1] * u + normal[1] * 0.035];
          const white = color('#ffffff');
          signBuilder.quad(at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh), white, white, white, white,
            [[0, 0], [1, 0], [1, 1], [0, 1]]);
          points.push({ x, z, normal }); count++;
        }
      }
    }
    if (count) {
      const mesh = new THREE.Mesh(signBuilder.geo(), M.assets.materials.mkShowcaseName); mesh.name = 'mk-c-name-strips'; mesh.frustumCulled = false; root.add(mesh);
    }
    root.userData.showcaseNameStrips = count; root.userData.showcaseNameStripPoints = points;
    return count;
  }
  function addShowcaseWallEdges(builder, g, H) {
    const seen = new Set(), material = builder('mkShowcaseSolid'); let count = 0;
    for (const rings of g.polys) for (const ring of ringsOf(rings)) {
      const p = point(ring);
      for (let i = 0; i < p.length; i++) {
        const prev = p[(i + p.length - 1) % p.length], cur = p[i], next = p[(i + 1) % p.length];
        const key = `${Math.round(cur[0] * 5)}:${Math.round(cur[1] * 5)}`; if (seen.has(key)) continue; seen.add(key);
        const normals = [];
        for (const [A, B] of [[prev, cur], [cur, next]]) {
          const dx = B[0] - A[0], dz = B[1] - A[1], length = Math.hypot(dx, dz) || 1;
          let nx = -dz / length, nz = dx / length;
          if (!insideShape(rings, (A[0] + B[0]) * 0.5 + nx * 0.12, (A[1] + B[1]) * 0.5 + nz * 0.12)) { nx = -nx; nz = -nz; }
          normals.push([nx, nz]);
        }
        let nx = normals[0][0] + normals[1][0], nz = normals[0][1] + normals[1][1], length = Math.hypot(nx, nz) || 1;
        nx /= length; nz /= length;
        addBox(material, [cur[0] + nx * 0.035, H * 0.5, cur[1] + nz * 0.035], [0.075, Math.min(H, 3), 0.075], [1, 0], color('#7a7d80'));
        count++;
      }
    }
    return count;
  }
  function addWallBand(builder, A, B, y0, y1, tint, alongScale = 1.2, heightScale = 6) {
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / len, uz = (B[1] - A[1]) / len;
    const s0 = (A[0] * ux + A[1] * uz) / alongScale, s1 = (B[0] * ux + B[1] * uz) / alongScale;
    const uv = [[s0, y0 / heightScale], [s1, y0 / heightScale], [s1, y1 / heightScale], [s0, y1 / heightScale]];
    builder.quad([A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]], tint, tint, tint, tint, uv);
  }
  function wallBuild(getBuilder, ring, H, c, doorIndex, walls, options = {}) {
    const p = point(ring);
    const addRun = (A, B, front) => {
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 0.02) return;
      walls.push([A[0], A[1], B[0], B[1]]);
      if (!getBuilder) return;
      if (!front) {
        if (options.showcase) {
          const dadoTop = Math.min(1.2, H);
          addWallBand(getBuilder('mkMosaicWall'), A, B, 0, dadoTop, color('#7a7d80'), 0.2, 0.2);
          if (H > dadoTop) addWallBand(getBuilder('mkMosaicWall'), A, B, dadoTop, H, color('#c41e2a'), 0.2, 0.2);
          return;
        }
        const key = options.wallClass || 'plasterWall';
        addWallBand(getBuilder(key), A, B, 0, H, options.wallTint || c, key === 'stationWall' ? 1.5 : 1.2, key === 'stationWall' ? 2 : 6);
        return;
      }
      const baseTop = Math.min(0.1, H), glassTop = Math.min(2.6, H), fasciaTint = options.fasciaTint || color('#6f777a');
      addWallBand(getBuilder('fascia'), A, B, 0, baseTop, color('#a6a296'), 1, 1);
      if (glassTop > baseTop + 0.05) addWallBand(getBuilder('shopGlass'), A, B, baseTop, glassTop, color('#ffffff'), 1.5, 2.5);
      if (H > 2.6) addWallBand(getBuilder('fascia'), A, B, 2.6, H, fasciaTint, 1.5, 1);
      const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, nx = front.nx, nz = front.nz;
      for (let d = 0; d < L; d += 1.5) {
        const t = d / L, x = A[0] + (B[0] - A[0]) * t + nx * 0.035, z = A[1] + (B[1] - A[1]) * t + nz * 0.035;
        addBox(getBuilder('metal'), [x, (baseTop + glassTop) * 0.5, z], [0.045, Math.max(0.02, glassTop - baseTop), 0.055], [ux, uz], color('#424b50'));
      }
      if (options.frontRuns) options.frontRuns.push({ unitIndex: options.unitIndex, category: options.category, name: options.name,
        A, B, nx, nz, length: L, ux, uz });
    };
    for (let i = 0; i < p.length; i++) {
      const A = p[i], B = p[(i + 1) % p.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 0.02) continue;
      const doors = doorCandidates(doorIndex, A, B), side = options.shopLike ? publicSide(ring, A, B, options.publicUnits) : null;
      if (!doors.length) {
        addRun(A, B, side);
        continue;
      }
      const n = Math.max(1, Math.ceil(L / 0.25));
      let runStart = -1, runEnd = -1;
      const flush = () => {
        if (runStart < 0) return;
        const x0 = A[0] + (B[0] - A[0]) * runStart, z0 = A[1] + (B[1] - A[1]) * runStart;
        const x1 = A[0] + (B[0] - A[0]) * runEnd, z1 = A[1] + (B[1] - A[1]) * runEnd;
        addRun([x0, z0], [x1, z1], side); runStart = -1;
      };
      for (let j = 0; j < n; j++) {
        const t0 = j / n, t1 = (j + 1) / n, mx = A[0] + (B[0] - A[0]) * (t0 + t1) / 2, mz = A[1] + (B[1] - A[1]) * (t0 + t1) / 2;
        if (nearDoor(doors, mx, mz)) { flush(); continue; }
        if (runStart < 0) runStart = t0;
        runEnd = t1;
      }
      flush();
    }
  }
  function routeFloor(data, y) {
    let best = null, bd = Infinity;
    for (const l of data.levels) { const d = Math.abs(l.z - y); if (d < bd) { bd = d; best = l.o; } }
    return best;
  }
  function fillShape(grid, shape, x0, z0) {
    const { nx, nz, walkable } = grid, p = shape[0]; if (!p || p.length < 3) return;
    const minz = Math.min(...p.map((q) => q[1])), maxz = Math.max(...p.map((q) => q[1]));
    const j0 = Math.max(0, Math.floor((minz - z0) / CS)), j1 = Math.min(nz - 1, Math.ceil((maxz - z0) / CS));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * CS, xs = [];
      for (const ring of shape) for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const a = ring[k], b = ring[i];
        if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - x0) / CS - 0.5)), i1 = Math.min(nx - 1, Math.ceil((xs[k + 1] - x0) / CS - 0.5) - 1);
        for (let i = i0; i <= i1; i++) walkable[j * nx + i] = 1;
      }
    }
  }
  function makeGrid(r, g, wallSegments) {
    const shapes = g.polys.map((rings) => ringsOf(rings).map(point)).filter((rings) => rings.length && rings[0].length > 2), outer = shapes.map((s) => s[0]).filter((p) => p.length);
    if (!outer.length) return null;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const p of outer) for (const q of p) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); minz = Math.min(minz, q[1]); maxz = Math.max(maxz, q[1]); }
    const x0 = Math.floor(minx / CS) * CS - CS, x1 = Math.ceil(maxx / CS) * CS + CS;
    const z0 = Math.floor(minz / CS) * CS - CS, z1 = Math.ceil(maxz / CS) * CS + CS;
    const nx = Math.ceil((x1 - x0) / CS), nz = Math.ceil((z1 - z0) / CS), n = nx * nz;
    const walkable = new Uint8Array(n), paid = new Uint8Array(n), routed = new Uint8Array(n), routedCells = new Int32Array(n);
    let routedCellCount = 0;
    const idxAt = (x, z) => { const i = Math.floor((x - x0) / CS), j = Math.floor((z - z0) / CS); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
    for (const shape of shapes) fillShape({ nx, nz, walkable }, shape, x0, z0);
    for (const u of g.units) {
      const cat = r.data.cats[u[1]] || '';
      if (!NO_WALK.has(cat)) continue;
      const B = unitRings(u), p = point(B[0] || []); if (!p.length) continue;
      const ax = Math.min(...p.map((q) => q[0])), bx = Math.max(...p.map((q) => q[0])), az = Math.min(...p.map((q) => q[1])), bz = Math.max(...p.map((q) => q[1]));
      for (let j = Math.max(0, Math.floor((az - z0) / CS)); j <= Math.min(nz - 1, Math.ceil((bz - z0) / CS)); j++)
        for (let i = Math.max(0, Math.floor((ax - x0) / CS)); i <= Math.min(nx - 1, Math.ceil((bx - x0) / CS)); i++) {
          const k = j * nx + i; if (walkable[k] && insideShape(B, x0 + (i + 0.5) * CS, z0 + (j + 0.5) * CS)) walkable[k] = 0;
        }
    }
    for (const [ax, az, bx, bz] of wallSegments) {
      const minx = Math.max(0, Math.floor((Math.min(ax, bx) - 0.25 - x0) / CS)), maxx = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + 0.25 - x0) / CS));
      const minz = Math.max(0, Math.floor((Math.min(az, bz) - 0.25 - z0) / CS)), maxz = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + 0.25 - z0) / CS));
      for (let j = minz; j <= maxz; j++) for (let i = minx; i <= maxx; i++) {
        const k = j * nx + i; if (walkable[k] && distToSeg(x0 + (i + 0.5) * CS, z0 + (j + 0.5) * CS, [ax, az], [bx, bz]) <= 0.22) walkable[k] = 0;
      }
    }
    const net = r.data.net;
    if (net) {
      const best = new Float32Array(n); best.fill(2.5);
      for (const route of net.r) {
        const loc = route[1]; if (loc !== 2 && loc !== 3) continue;
        const a = route[4];
        for (let k = 0; k + 5 < a.length; k += 3) {
          const ay = (a[k + 1] + a[k + 4]) / 2; if (routeFloor(r.data, ay) !== g.o) continue;
          const A = [a[k], a[k + 2]], B = [a[k + 3], a[k + 5]];
          const minx = Math.max(0, Math.floor((Math.min(A[0], B[0]) - 2.5 - x0) / CS)), maxx = Math.min(nx - 1, Math.ceil((Math.max(A[0], B[0]) + 2.5 - x0) / CS));
          const minz = Math.max(0, Math.floor((Math.min(A[1], B[1]) - 2.5 - z0) / CS)), maxz = Math.min(nz - 1, Math.ceil((Math.max(A[1], B[1]) + 2.5 - z0) / CS));
          for (let j = minz; j <= maxz; j++) for (let i = minx; i <= maxx; i++) {
            const k0 = j * nx + i, d = distToSeg(x0 + (i + 0.5) * CS, z0 + (j + 0.5) * CS, A, B);
            if (d <= 2.5) {
              if (!routed[k0]) { routed[k0] = 1; routedCells[routedCellCount++] = k0; }
              if (d < best[k0]) { best[k0] = d; paid[k0] = loc === 3 ? 1 : 0; }
            }
          }
        }
      }
    }
    const orderedRoutedCells = routedCells.subarray(0, routedCellCount).sort();
    return { x0, z0, nx, nz, walkable, paid, routed, routedCells: orderedRoutedCells, idxAt };
  }
  function groupWalkable(r, g) {
    if (typeof g.walkable === 'boolean') return g.walkable;
    const doorIndex = makeDoorIndex(g.doors.map((d) => linesOf(d[2]))), walls = [];
    for (const u of g.units) {
      const cat = r.data.cats[u[1]] || '', name = unitName(u);
      if (!NO_WALL.has(cat) || isShopLike(cat, name)) for (const ring of unitRings(u)) wallBuild(null, ring, Math.min(g.H, 3), color(UNIT_COLOR[cat] || '#9a9286'), doorIndex, walls);
    }
    for (const rings of g.polys) for (const ring of rings) wallBuild(null, ring, g.H, color('#aaa79f'), doorIndex, walls);
    const grid = makeGrid(r, g, walls); g.walkable = !!(grid && grid.walkable.some((v) => v));
    return g.walkable;
  }
  function nearestCell(grid, x, z) {
    if (!grid) return null;
    const k = grid.idxAt(x, z), n = grid.nx * grid.nz;
    if (k >= 0 && grid.walkable[k]) return { x: grid.x0 + ((k % grid.nx) + 0.5) * CS, z: grid.z0 + (Math.floor(k / grid.nx) + 0.5) * CS, index: k };
    const i0 = clamp(Math.floor((x - grid.x0) / CS), 0, grid.nx - 1), j0 = clamp(Math.floor((z - grid.z0) / CS), 0, grid.nz - 1), start = j0 * grid.nx + i0;
    const seen = new Uint8Array(n), queue = new Int32Array(n); let head = 0, tail = 0; queue[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const k0 = queue[head++], i = k0 % grid.nx, j = Math.floor(k0 / grid.nx);
      if (grid.walkable[k0]) return { x: grid.x0 + (i + 0.5) * CS, z: grid.z0 + (j + 0.5) * CS, index: k0 };
      for (const q of [i ? k0 - 1 : -1, i + 1 < grid.nx ? k0 + 1 : -1, j ? k0 - grid.nx : -1, j + 1 < grid.nz ? k0 + grid.nx : -1]) if (q >= 0 && !seen[q]) { seen[q] = 1; queue[tail++] = q; }
    }
    return null;
  }
  function unitKind(u) { return S.data.cats[u[1]] || ''; }
  function unitNodes(g, kind) { return g.units.filter((u) => unitKind(u) === kind).map((u) => ({ u, pos: centroid(unitRings(u)), cat: unitKind(u) })); }
  function categoryLabel(cat) {
    if (cat === 'elevator') return '升降機';
    if (cat === 'escalator') return '扶手電梯';
    if (cat === 'stairs') return '樓梯';
    if (cat.startsWith('restroom.')) return `洗手間 ${cat === 'restroom.male' ? '男' : cat === 'restroom.female' ? '女' : cat === 'restroom.wheelchair' ? '♿' : '男女'}`;
    return '';
  }
  const SIGN_COLOR = { room: '#344b52', foodservice: '#70432c', classroom: '#334b6a', office: '#3e5748', unspecified: '#41444e' };
  function signFrame(frame, builder, texIndex, cols, rows, width, y0, y1) {
    if (!frame || !builder || y1 <= y0 + 0.08) return null;
    let { A, B, nx, nz } = frame, dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    if ((-uz) * nx + ux * nz < 0) { [A, B] = [B, A]; dx = -dx; dz = -dz; ux = -ux; uz = -uz; }
    width = Math.min(width, len * 0.84);
    if (width < 0.48) return null;
    const cx = (A[0] + B[0]) * 0.5 + nx * 0.05, cz = (A[1] + B[1]) * 0.5 + nz * 0.05, hx = width * 0.5;
    const a = [cx - ux * hx, y0, cz - uz * hx], b = [cx + ux * hx, y0, cz + uz * hx];
    const c = [cx + ux * hx, y1, cz + uz * hx], d = [cx - ux * hx, y1, cz - uz * hx];
    const col = texIndex % cols, row = Math.floor(texIndex / cols), u0 = col / cols, u1 = (col + 1) / cols, v0 = 1 - (row + 1) / rows, v1 = 1 - row / rows;
    builder.quad(a, b, c, d, color('#ffffff'), color('#ffffff'), color('#ffffff'), color('#ffffff'), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    return { x: cx, y: (y0 + y1) * 0.5, z: cz, nx, nz, width, y0, y1, frameA: A, frameB: B, source: frame.source || 'frontage' };
  }
  function addLabels(root, g, data, frontRuns, unitPoints, grid) {
    const signRuns = new Map();
    for (const q of frontRuns) if (signableName(q.name) && q.length >= 0.86 && g.H >= 2.82) {
      const old = signRuns.get(q.unitIndex); if (!old || q.length > old.length) signRuns.set(q.unitIndex, q);
    }
    const signedUnits = new Set(signRuns.keys()), signedNames = new Set([...signRuns.values()].map((q) => q.name.trim().toLowerCase()));
    const atlas = [], sprites = [], doorSigns = [], fasciaSigns = [], acceptedCategoryLabels = [];
    let dedupedCategoryLabels = 0;
    for (const [unitIndex, run] of signRuns) atlas.push({ kind: 'fascia', text: run.name, unitIndex, run });
    for (const p of g.pois.slice(0, 80)) if (p[2] && !signedNames.has(p[2].trim().toLowerCase()) && ![...signedUnits].some((i) => insideShape(unitPoints[i].rings, p[3], p[4]))) {
      const it = { kind: 'label', text: p[2], x: p[3], z: p[4] }; atlas.push(it); sprites.push(it);
    }
    for (let i = 0; i < unitPoints.length; i++) {
      const u = unitPoints[i], text = categoryLabel(u.cat);
      if (text) {
        if (acceptedCategoryLabels.some((q) => q.text === text && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 6)) dedupedCategoryLabels++;
        else { const it = { kind: 'label', text, x: u.pos.x, z: u.pos.z }; atlas.push(it); sprites.push(it); acceptedCategoryLabels.push(it); }
      }
      if (u.cat === 'elevator' || u.cat.startsWith('restroom.')) {
        const frame = u.cat.startsWith('restroom.') ? doorFacingEdge(u, grid, g.doors) || facingEdge(u, grid) : facingEdge(u, grid);
        const signText = u.cat === 'elevator' ? '升降機 / Lift' : `洗手間\n${u.cat === 'restroom.male' ? '男' : u.cat === 'restroom.female' ? '女' : u.cat === 'restroom.wheelchair' ? '♿' : '男女'}`;
        const diagnostic = { kind: 'doorSign', category: u.cat, text: signText, unitIndex: i,
          source: frame && frame.source || (frame ? 'unit-edge' : null), frame: frame && { A: frame.A, B: frame.B, nx: frame.nx, nz: frame.nz, score: frame.score, boundary: frame.boundary || 0 } };
        doorSigns.push(diagnostic);
        if (frame) {
          const it = { kind: 'doorSign', text: signText, frame, x: u.pos.x, z: u.pos.z, diagnostic }; atlas.push(it);
        }
      }
    }
    root.userData.signDebug = { signedUnits: [...signedUnits], fasciaNames: [...signedNames], doorSigns,
      poiSprites: sprites.map((q) => q.text), dedupedCategoryLabels };
    if (!atlas.length) return null;
    const cols = 8, cw = 192, ch = 48, rows = Math.max(1, Math.ceil(atlas.length / cols));
    const cv = document.createElement('canvas'); cv.width = cw * cols; cv.height = ch * rows;
    const ctx = cv.getContext('2d');
    atlas.forEach((it, i) => {
      const x = i % cols * cw, y = Math.floor(i / cols) * ch;
      ctx.fillStyle = it.kind === 'fascia' ? (SIGN_COLOR[unitPoints[it.unitIndex].cat] || '#343b43') : it.kind === 'doorSign' ? '#343b43' : 'rgba(12,18,30,.82)';
      ctx.fillRect(x + 3, y + 3, cw - 6, ch - 6); ctx.strokeStyle = it.kind === 'fascia' ? '#d5c799' : '#b8c1c8'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
      ctx.fillStyle = '#fff4d1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${it.text.length > 12 ? 14 : 17}px ${FONT}`;
      const lines = it.text.split('\n'), lineH = 18, top = y + ch / 2 - (lines.length - 1) * lineH / 2;
      lines.forEach((line, j) => ctx.fillText(line, x + cw / 2, top + j * lineH, cw - 16));
    });
    const tex = tagTexture(new THREE.CanvasTexture(cv), 'floor-sign-atlas', 'floor'); tex.anisotropy = 2;
    root.userData.ownedTextures = (root.userData.ownedTextures || []).concat(tex);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: false, depthWrite: false, depthTest: false, fog: false });
    const listGroup = new THREE.Group(); listGroup.userData.labels = [];
    const ownedGeometries = root.userData.ownedGeometries || (root.userData.ownedGeometries = []);
    root.userData.ownedMaterials = (root.userData.ownedMaterials || []).concat(spriteMat);
    sprites.slice(0, 180).forEach((it) => {
      const i = atlas.indexOf(it), col = i % cols, row = Math.floor(i / cols), sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(it.text.length > 10 ? 2.8 : 2.2, 0.55, 1);
      const geo = sprite.geometry.clone(), uv = geo.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, col / cols + uv.getX(j) / cols, 1 - (row + 1) / rows + uv.getY(j) / rows);
      uv.needsUpdate = true; sprite.geometry = geo; sprite.position.set(it.x, 2.6, it.z); sprite.renderOrder = 5;
      listGroup.add(sprite); listGroup.userData.labels.push(sprite); ownedGeometries.push(geo);
    });
    if (listGroup.userData.labels.length) { owned(listGroup, 1); root.add(listGroup); }
    const signBuilder = vbNew();
    atlas.forEach((it, i) => {
      if (it.kind === 'fascia') {
        const frame = signFrame({ ...it.run }, signBuilder, i, cols, rows, it.text.length > 10 ? 2.8 : 2.2, 2.62, Math.min(3.22, g.H - 0.06));
        if (frame) fasciaSigns.push({ text: it.text, unitIndex: it.unitIndex, ...frame });
      } else if (it.kind === 'doorSign') {
        const frame = signFrame(it.frame, signBuilder, i, cols, rows, 0.95, 2.02, 2.38);
        if (frame) { it.diagnostic.placed = frame; it.diagnostic.textIndex = i; }
      }
    });
    root.userData.signDebug.fasciaSigns = fasciaSigns;
    if (signBuilder.triangles) {
      const signMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: false, toneMapped: false });
      root.userData.ownedMaterials.push(signMat);
      const mesh = new THREE.Mesh(signBuilder.geo(), signMat); mesh.renderOrder = 6; root.add(mesh);
    }
    return listGroup.userData.labels.length ? listGroup : null;
  }
  function addCeilingLights(root, g, grid, publicUnits, showcase = null) {
    if (!grid) return 0;
    const step = showcase?.ceilingStep || 6, cap = showcase ? 900 : 300;
    const points = [], x1 = grid.x0 + grid.nx * CS, z1 = grid.z0 + grid.nz * CS;
    for (let x = Math.ceil(grid.x0 / step) * step; x < x1 && points.length < cap; x += step) {
      for (let z = Math.ceil(grid.z0 / step) * step; z < z1 && points.length < cap; z += step) {
        const i = grid.idxAt(x, z);
        if (i >= 0 && grid.walkable[i] && publicAt(publicUnits, x, z)) points.push([x, g.H - 0.075, z]);
      }
    }
    if (!points.length) return 0;
    const mesh = new THREE.InstancedMesh(showcase ? ensureShowcaseAssets().lightGeo : M.assets.materials.lightGeo, M.assets.materials.lightPanel, points.length), object = new THREE.Object3D();
    points.forEach(([x, y, z], i) => { object.position.set(x, y, z); object.updateMatrix(); mesh.setMatrixAt(i, object.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; root.add(mesh);
    root.userData.ownedInstances = (root.userData.ownedInstances || []).concat(mesh);
    return points.length;
  }
  function shapeDistance(x, z, rings) {
    if (insideShape(rings, x, z)) return 0;
    let best = Infinity;
    for (const ring of ringsOf(rings)) {
      const p = point(ring);
      for (let i = 0; i < p.length; i++) best = Math.min(best, distToSeg(x, z, p[i], p[(i + 1) % p.length]));
    }
    return best;
  }
  function addPlatformStrips(getBuilder, g, data) {
    const platforms = g.units.filter((u) => (data.cats[u[1]] || '') === 'platform' || /月台|platform/i.test(unitName(u)));
    const tracks = g.units.filter((u) => /鐵路路軌|路軌|track/i.test(unitName(u) + ' ' + (data.cats[u[1]] || '')));
    if (!platforms.length || !tracks.length) return 0;
    const vb = getBuilder('tactile'), yellow = color('#f0c73b'); let strips = 0;
    for (const u of platforms) for (const ring of unitRings(u)) {
      const p = point(ring);
      for (let i = 0; i < p.length; i++) {
        const A = p[i], B = p[(i + 1) % p.length], dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz);
        if (len < 1.5) continue;
        let nx = -dz / len, nz = dx / len;
        if (!insideShape(unitRings(u), (A[0] + B[0]) * 0.5 + nx * 0.12, (A[1] + B[1]) * 0.5 + nz * 0.12)) { nx = -nx; nz = -nz; }
        let near = 0, total = 0;
        for (let s = 0.25; s < len - 0.15; s += 0.5) {
          const t = s / len, x = A[0] + dx * t, z = A[1] + dz * t;
          let d = Infinity; for (const track of tracks) d = Math.min(d, shapeDistance(x, z, unitRings(track)));
          total++; if (d <= 1.25) near++;
        }
        if (!total || near / total < 0.7) continue;
        const ax = A[0] + nx * 0.02, az = A[1] + nz * 0.02, bx = B[0] + nx * 0.02, bz = B[1] + nz * 0.02;
        const c = [bx + nx * 0.6, 0.035, bz + nz * 0.6], d = [ax + nx * 0.6, 0.035, az + nz * 0.6];
        vb.quad([ax, 0.035, az], [bx, 0.035, bz], c, d, yellow); strips++;
      }
    }
    return strips;
  }
  function gateTransitions(grid, data, ordinal) {
    if (!grid || !grid.routed) return { before: 0, candidates: 0, gates: [] };
    const oldRows = [], clusters = []; let candidates = 0, routeCandidates = 0;
    const consider = (k, n) => {
      if (!grid.walkable[n] || !grid.routed[n] || grid.paid[k] === grid.paid[n]) return;
      const ax = grid.x0 + ((k % grid.nx) + 0.5) * CS, az = grid.z0 + (Math.floor(k / grid.nx) + 0.5) * CS;
      const bx = grid.x0 + ((n % grid.nx) + 0.5) * CS, bz = grid.z0 + (Math.floor(n / grid.nx) + 0.5) * CS;
      const x = (ax + bx) * 0.5, z = (az + bz) * 0.5, dx = grid.paid[k] ? bx - ax : ax - bx, dz = grid.paid[k] ? bz - az : az - bz;
      candidates++;
      if (oldRows.length < 40 && !oldRows.some((q) => Math.hypot(q.x - x, q.z - z) < 2)) oldRows.push({ x, z, dx, dz });
    };
    for (const k of grid.routedCells || []) {
      const i = k % grid.nx, j = Math.floor(k / grid.nx); if (!grid.walkable[k]) continue;
      if (i + 1 < grid.nx) consider(k, k + 1);
      if (j + 1 < grid.nz) consider(k, k + grid.nx);
    }
    const endpoints = { 2: [], 3: [] }, routes = data && data.net && data.net.r || [];
    for (const route of routes) {
      const loc = route[1]; if (loc !== 2 && loc !== 3) continue;
      const points = route[4];
      for (let k = 0; k + 2 < points.length; k += 3) {
        const x = points[k], y = points[k + 1], z = points[k + 2];
        if (routeFloor(data, y) !== ordinal) continue;
        const neighbors = [];
        if (k >= 3 && routeFloor(data, (points[k - 2] + y) * 0.5) === ordinal) neighbors.push([points[k - 3], points[k - 1]]);
        if (k + 5 < points.length && routeFloor(data, (y + points[k + 4]) * 0.5) === ordinal) neighbors.push([points[k + 3], points[k + 5]]);
        endpoints[loc].push({ x, z, neighbors });
      }
    }
    const cellSize = 0.5, buckets = new Map();
    for (const q of endpoints[3]) {
      const key = `${Math.floor(q.x / cellSize)}:${Math.floor(q.z / cellSize)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(q);
    }
    const heading = (q) => {
      let dx = 0, dz = 0, bx = 0, bz = 0;
      for (const p of q.neighbors) {
        const L = Math.hypot(p[0] - q.x, p[1] - q.z) || 1, x = (p[0] - q.x) / L, z = (p[1] - q.z) / L;
        const sign = bx * x + bz * z < 0 ? -1 : 1;
        dx += x * sign; dz += z * sign;
        if (!bx && !bz) { bx = x; bz = z; }
      }
      const L = Math.hypot(dx, dz) || 1; return { dx: dx / L, dz: dz / L };
    };
    for (const unpaid of endpoints[2]) {
      const ix = Math.floor(unpaid.x / cellSize), iz = Math.floor(unpaid.z / cellSize);
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        for (const paid of buckets.get(`${ix + ox}:${iz + oz}`) || []) {
          const d = Math.hypot(unpaid.x - paid.x, unpaid.z - paid.z); if (d > 0.5) continue;
          const x = (unpaid.x + paid.x) * 0.5, z = (unpaid.z + paid.z) * 0.5, i = grid.idxAt(x, z);
          if (i < 0 || !grid.walkable[i]) continue;
          const a = heading(unpaid), b = heading(paid), sign = a.dx * b.dx + a.dz * b.dz < 0 ? -1 : 1;
          const dx = a.dx + b.dx * sign, dz = a.dz + b.dz * sign;
          routeCandidates++;
          let cluster = null, nearest = 3;
          for (const q of clusters) {
            const dist = Math.hypot(q.x - x, q.z - z);
            if (dist <= nearest) { nearest = dist; cluster = q; }
          }
          if (!cluster) {
            if (clusters.length < 40) clusters.push({ x, z, dx, dz, count: 1 });
            continue;
          }
          const L = Math.hypot(dx, dz) || 1, Q = Math.hypot(cluster.dx, cluster.dz) || 1;
          const dot = dx / L * cluster.dx / Q + dz / L * cluster.dz / Q, dirSign = dot < 0 ? -1 : 1;
          cluster.x = (cluster.x * cluster.count + x) / (cluster.count + 1);
          cluster.z = (cluster.z * cluster.count + z) / (cluster.count + 1);
          cluster.dx += dx * dirSign; cluster.dz += dz * dirSign; cluster.count++;
        }
      }
    }
    return { before: oldRows.length, candidates, routeCandidates,
      gates: clusters.map((q) => ({ x: q.x, z: q.z, dx: q.dx, dz: q.dz, transitions: q.count })) };
  }
  function addFareGates(getBuilder, grid, data, ordinal, stats = null, showcase = null) {
    const vb = getBuilder('gate'), grey = color('#9aa2a5');
    stats = stats || gateTransitions(grid, data, ordinal);
    const panels = showcase ? getBuilder('mkGatePanels') : null;
    const panelColor = (hex) => color(hex);
    const flatQuad = (cx, cz, tangent, normal, depth, u0, v0, u1, v1, tint) => {
      const at = (u, v) => [cx + tangent[0] * u + normal[0] * depth, 1.2 + v, cz + tangent[1] * u + normal[1] * depth];
      panels.quad(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), tint);
    };
    const line2d = (cx, cz, tangent, normal, points, tint, thickness = 0.022) => {
      for (let i = 1; i < points.length; i++) {
        const [u0, v0] = points[i - 1], [u1, v1] = points[i], dx = u1 - u0, dy = v1 - v0, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len * thickness * 0.5, ny = dx / len * thickness * 0.5;
        flatQuad(cx, cz, tangent, normal, 0.525, u0 + nx, v0 + ny, u1 + nx, v1 + ny, tint);
        flatQuad(cx, cz, tangent, normal, 0.525, u1 - nx, v1 - ny, u0 - nx, v0 - ny, tint);
      }
    };
    let indicatorCount = 0;
    for (const gate of stats.gates) {
      const L = Math.hypot(gate.dx, gate.dz) || 1, sx = -gate.dz / L, sz = gate.dx / L;
      for (let i = -1; i <= 1; i++) {
        const x = gate.x + sx * i * 0.9, z = gate.z + sz * i * 0.9;
        addBox(vb, [x, 0.8, z], [0.3, 1.6, 1.0], [sx, sz], grey);
        addBox(vb, [x, 1.625, z], [0.13, 0.05, 0.14], [sx, sz], color(i === 0 ? '#f2cb4e' : '#54c986'));
      if (panels) {
          const normal = [gate.dx / L, gate.dz / L], tangent = [normal[1], -normal[0]], cx = x + normal[0] * 0.505, cz = z + normal[1] * 0.505;
          flatQuad(cx, cz, tangent, normal, 0.52, -0.13, -0.105, 0.13, 0.105, panelColor('#101619'));
          line2d(cx, cz, tangent, normal, [[-0.075, -0.04], [-0.035, 0.04]], panelColor('#ff4b4b'), 0.022);
          line2d(cx, cz, tangent, normal, [[-0.075, 0.04], [-0.035, -0.04]], panelColor('#ff4b4b'), 0.022);
          line2d(cx, cz, tangent, normal, [[0.045, -0.055], [0.045, 0.015]], panelColor('#56ff84'), 0.022);
          line2d(cx, cz, tangent, normal, [[0.015, -0.005], [0.045, 0.04], [0.075, -0.005]], panelColor('#56ff84'), 0.022);
          indicatorCount++;
        }
      }
    }
    return { beforeRows: stats.before, afterRows: stats.gates.length, candidates: stats.candidates,
      beforeCabinets: stats.before * 3, afterCabinets: stats.gates.length * 3, indicators: indicatorCount };
  }
  function addMongKokCShowcase(root, r, g, unitPoints, grid, props, config, getBuilder, startPosition) {
    const stageMs = {}, perf = { canBlockCalls: 0, reachBfsCalls: 0, reachBfsMs: 0, npcCellCalls: 0, npcCellsScanned: 0, unitDoorsCacheHits: 0 };
    let stageStart = performance.now();
    const markStage = (key) => { const now = performance.now(); stageMs[key] = Math.round((now - stageStart) * 10) / 10; stageStart = now; };
    const solid = getBuilder('mkShowcaseSolid'), glass = getBuilder('mkShowcaseGlass'), glow = getBuilder('mkShowcaseEmissive');
    const signBuilder = getBuilder('mkShowcaseSigns'), data = r.data;
    const stat = { kind: config.kind, textures: ensureShowcaseAssets().createdTextures, boxes: 0, triangles: 0, collisions: 0, visualOnlyFixtures: 0,
      nameStrips: 0, exitSigns: 0, machines: { tickets: 0, addValue: 0, vending: 0 }, customerService: 0, shopTypes: {},
      serviceDiagnostics: [],
      shopFixtures: 0, gateIndicators: 0, lights: 0, npcPlan: [],
      machineWallCandidates: 0, wallSpawnCandidates: 0, serviceUnitsFound: 0, publicCellsBlocked: 0,
      stageMs, perf,
      landmarks: { csc: [], machines: [], shops: [], walls: [], gates: [] } };
    const facilityUnits = unitPoints.filter((u) => ['elevator', 'stairs', 'escalator'].includes(u.cat));
    const doorSegments = g.doors.flatMap((d) => linesOf(d[2]));
    const gateInfo = props.gateInfo || { gates: [] }, publicMask = props.publicMask;
    const start = props.publicStart, baselineReachable = new Set(props.publicCells);
    const blockedPublic = new Set();
    const startPoint = nearestCell(grid, startPosition.x, startPosition.z) || startPosition;
    const randFor = (key) => {
      let seed = 2166136261; for (const ch of String(key)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
      return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    };
    const part = (b, center, size, axis, tint, triangles = 12) => {
      if (props.propStats.total + stat.boxes >= PROP_INSTANCE_CAP) return false;
      addBox(b, center, size, axis, color(tint)); stat.boxes++; stat.triangles += triangles; return true;
    };
    const hasFacilityClearance = (x, z, radius = 1.2) => facilityUnits.every((u) => shapeDistance(x, z, u.rings) >= radius);
    const hasGateClearance = (x, z, radius = 1.7) => gateInfo.gates.every((q) => Math.hypot(x - q.x, z - q.z) >= radius);
    const inBuilding = (x, z) => g.polys.some((rings) => insideShape(rings, x, z));
    const getPublicReachCells = () => {
      const started = performance.now();
      perf.reachBfsCalls++;
      const cells = publicReachCells(grid, publicMask, start);
      perf.reachBfsMs += performance.now() - started;
      return cells;
    };
    const canBlock = (unit, x, z, sx, sz, axis, clearance = 0.25) => {
      perf.canBlockCalls++;
      if (!grid) return false;
      const ix = grid.idxAt(x, z); if (ix < 0 || !grid.walkable[ix]) return false;
      const [ux, uz] = axis || [1, 0], nx = -uz, nz = ux, hx = sx * 0.5 + 0.12, hz = sz * 0.5 + 0.12;
      const rx = Math.abs(ux) * hx + Math.abs(nx) * hz, rz = Math.abs(uz) * hx + Math.abs(nz) * hz;
      if (unit && !insideShape(unit.rings, x, z)) return false;
      if (!unit && (!inBuilding(x, z) || !hasFacilityClearance(x, z, Math.hypot(sx, sz) * 0.5 + 0.5) ||
          !hasGateClearance(x, z, Math.max(1.7, Math.hypot(sx, sz) * 0.45)))) return false;
      if (doorSegments.some(([a, b]) => distToSeg(x, z, a, b) < Math.max(sx, sz) * 0.5 + clearance)) return false;
      if (unit) {
        for (const [dx, dz] of [[-rx, -rz], [rx, -rz], [rx, rz], [-rx, rz]]) if (!insideShape(unit.rings, x + dx, z + dz)) return false;
      }
      const x0 = Math.max(0, Math.floor((x - rx - grid.x0) / CS)), x1 = Math.min(grid.nx - 1, Math.ceil((x + rx - grid.x0) / CS));
      const z0 = Math.max(0, Math.floor((z - rz - grid.z0) / CS)), z1 = Math.min(grid.nz - 1, Math.ceil((z + rz - grid.z0) / CS));
      const changed = [];
      for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
        const k = j * grid.nx + i; if (!grid.walkable[k]) continue;
        const dx = grid.x0 + (i + 0.5) * CS - x, dz = grid.z0 + (j + 0.5) * CS - z;
        if (Math.abs(dx * ux + dz * uz) <= hx && Math.abs(dx * nx + dz * nz) <= hz && (!unit || insideShape(unit.rings, x + dx, z + dz))) {
          grid.walkable[k] = 0; changed.push(k);
        }
      }
      if (changed.some((k) => baselineReachable.has(k))) {
        let nextBlockedCount = blockedPublic.size;
        for (const k of changed) if (baselineReachable.has(k) && !blockedPublic.has(k)) nextBlockedCount++;
        const reachable = getPublicReachCells();
        const expectedReachable = baselineReachable.size - nextBlockedCount;
        if (!grid.walkable[start] || reachable.length !== expectedReachable) {
          for (const k of changed) grid.walkable[k] = 1;
          return false;
        }
        for (const k of changed) if (baselineReachable.has(k)) blockedPublic.add(k);
      }
      stat.collisions += changed.length;
      stat.publicCellsBlocked = blockedPublic.size;
      return true;
    };
    const canRenderUnitFixture = (unit, x, z, sx, sz, axis) => {
      if (!unit || !insideShape(unit.rings, x, z)) return false;
      const [ux, uz] = axis || [1, 0], nx = -uz, nz = ux, hx = sx * 0.5 + 0.12, hz = sz * 0.5 + 0.12;
      if (doorSegments.some(([a, b]) => distToSeg(x, z, a, b) < Math.max(sx, sz) * 0.5 + 0.25)) return false;
      const rx = Math.abs(ux) * hx + Math.abs(nx) * hz, rz = Math.abs(uz) * hx + Math.abs(nz) * hz;
      return [[-rx, -rz], [rx, -rz], [rx, rz], [-rx, rz]].every(([dx, dz]) => insideShape(unit.rings, x + dx, z + dz));
    };
    const addSolid = (center, size, axis, tint, unit = null, blocking = false, b = solid) => {
      if (blocking && !canBlock(unit, center[0], center[2], size[0], size[2], axis)) {
        if (!canRenderUnitFixture(unit, center[0], center[2], size[0], size[2], axis)) return false;
        stat.visualOnlyFixtures++;
      }
      return part(b, center, size, axis, tint);
    };
    const addSign = (center, normal, width, height, index) => {
      addTexturedPanel(signBuilder, center, normal, width, height, index);
      stat.boxes++; stat.triangles += 2;
    };
    const unitDoorCache = new Map();
    const unitDoors = (unit) => {
      if (unitDoorCache.has(unit)) {
        perf.unitDoorsCacheHits++;
        return unitDoorCache.get(unit);
      }
      const doors = g.doors.filter((door) => linesOf(door[2]).some(([a, b]) => {
        const x = (a[0] + b[0]) * 0.5, z = (a[1] + b[1]) * 0.5;
        return shapeDistance(x, z, unit.rings) < 0.45;
      }));
      unitDoorCache.set(unit, doors);
      return doors;
    };
    const freeFrontage = (unit, frame) => {
      const ux = (frame.B[0] - frame.A[0]) / frame.length, uz = (frame.B[1] - frame.A[1]) / frame.length, blocked = [];
      for (const d of unitDoors(unit)) {
        const p = point(d[2]); if (p.length < 2) continue;
        const vals = p.map((q) => (q[0] - frame.A[0]) * ux + (q[1] - frame.A[1]) * uz);
        const lo = Math.max(0, Math.min(...vals) - 0.3), hi = Math.min(frame.length, Math.max(...vals) + 0.3);
        if (hi > lo) blocked.push([lo, hi]);
      }
      blocked.sort((a, b) => a[0] - b[0]);
      let cursor = 0, best = [0, frame.length];
      for (const [lo, hi] of blocked) {
        if (lo - cursor > best[1] - best[0]) best = [cursor, lo];
        cursor = Math.max(cursor, hi);
      }
      if (frame.length - cursor > best[1] - best[0]) best = [cursor, frame.length];
      return { ...frame, ux, uz, span: best, spanLength: Math.max(0, best[1] - best[0]) };
    };
    const pointOnFrame = (frame, s, normalOffset = 0) => ({
      x: frame.A[0] + frame.ux * s + frame.nx * normalOffset,
      z: frame.A[1] + frame.uz * s + frame.nz * normalOffset
    });
    const addShelf = (unit, center, axis, length, key) => {
      const sx = Math.max(1.2, Math.min(length, 2.6)), depth = 0.42;
      if (!addSolid([center.x, 0.88, center.z], [sx, 1.76, depth], axis, '#6b5746', unit, true)) return false;
      addSolid([center.x, 0.24, center.z], [sx, 0.07, depth + 0.04], axis, '#a68b69');
      const rng = randFor(key), palette = ['#d94841', '#e0ad32', '#48a0ad', '#739b57', '#9675b4', '#df8140'];
      for (const y of [0.43, 0.91, 1.39]) {
        addSolid([center.x, y, center.z], [sx, 0.045, depth + 0.04], axis, '#d4c5ad');
        const count = Math.max(4, Math.min(10, Math.floor(sx / 0.25)));
        for (let i = 0; i < count; i++) {
          const along = -sx * 0.5 + 0.14 + i * (sx - 0.28) / Math.max(1, count - 1);
          const p = [center.x + axis[0] * along, y + 0.11 + rng() * 0.04, center.z + axis[1] * along];
          addSolid(p, [0.16 + rng() * 0.07, 0.17 + rng() * 0.09, 0.16], axis, palette[Math.floor(rng() * palette.length)]);
        }
      }
      return true;
    };
    const machine = (center, axis, type, labelIndex, unit = null, blocking = true) => {
      const bodySize = type === 'vending' ? [0.9, 1.95, 0.55] : [0.62, 1.82, 0.48];
      if (!addSolid([center.x, bodySize[1] * 0.5, center.z], bodySize, axis, type === 'vending' ? '#7e8b88' : '#7a8388', unit, blocking)) return null;
      const normal = [-axis[1], axis[0]], face = [center.x + normal[0] * (bodySize[2] * 0.5 + 0.014), center.z + normal[1] * (bodySize[2] * 0.5 + 0.014)];
      addSolid([face[0], 1.36, face[1]], [bodySize[0] * 0.62, 0.42, 0.025], axis, type === 'vending' ? '#287f8c' : '#142b35', null, false, glow);
      addSolid([face[0], 0.87, face[1]], [bodySize[0] * 0.43, 0.055, 0.028], axis, '#292d31', null, false, glow);
      if (labelIndex !== null) {
        addSolid([center.x, 1.86, center.z], [bodySize[0] * 0.82, 0.08, 0.12], axis, '#656f73', unit, false);
        addSign([center.x, 2.08, center.z], normal, Math.min(0.8, bodySize[0] * 1.15), 0.3, labelIndex);
      }
      if (type === 'vending') for (let i = 0; i < 3; i++) addSolid([center.x - axis[0] * 0.18 + axis[0] * i * 0.18, 1.32, center.z - axis[1] * 0.18 + axis[1] * i * 0.18],
        [0.12, 0.23, 0.07], axis, ['#df6d4e', '#d9bd45', '#5297bc'][i], null, false, glow);
      return { x: center.x, z: center.z, normal, axis, type };
    };
    const drawNameStrips = () => {
      stat.nameStrips = addShowcaseNameStrips(root, g);
      stat.boxes += stat.nameStrips; stat.triangles += stat.nameStrips * 2;
      stat.landmarks.walls = root.userData.showcaseNameStripPoints || [];
    };
    const drawExitSigns = () => {
      const upward = [];
      for (const route of data.net?.r || []) {
        if (![8, 12].includes(route[0])) continue;
        const points = route[4], floors = [];
        for (let k = 0; k + 2 < points.length; k += 3) floors.push({ o: routeFloor(data, points[k + 1]), x: points[k], z: points[k + 2] });
        const here = floors.find((p) => p.o === g.o), above = floors.some((p) => p.o > g.o);
        if (!here || !above) continue;
        const category = route[0] === 8 ? 'escalator' : 'stairs';
        let best = null, distance = Infinity;
        for (const u of facilityUnits) if (u.cat === category) {
          const d = shapeDistance(here.x, here.z, u.rings);
          if (d < distance) { distance = d; best = u; }
        }
        if (best && distance <= 2.2 && !upward.includes(best)) upward.push(best);
      }
      for (const unit of upward) {
        const frame = facingEdge(unit, grid); if (!frame) continue;
        const tangent = [frame.nz, -frame.nx], center = [(frame.A[0] + frame.B[0]) * 0.5 + frame.nx * 0.72,
          2.63, (frame.A[1] + frame.B[1]) * 0.5 + frame.nz * 0.72];
        addSolid([center[0] - tangent[0] * 0.48, 3.08, center[2] - tangent[1] * 0.48], [0.045, 0.84, 0.045], tangent, '#60686c');
        addSolid([center[0] + tangent[0] * 0.48, 3.08, center[2] + tangent[1] * 0.48], [0.045, 0.84, 0.045], tangent, '#60686c');
        addSign(center, [frame.nx, frame.nz], 1.2, 0.4, 0); stat.exitSigns++;
      }
    };
    let publicPointCache = null, publicRank = null;
    const publicPoints = () => {
      if (!publicPointCache) publicPointCache = props.publicCells.map((k) => ({ index: k, x: grid.x0 + ((k % grid.nx) + 0.5) * CS,
        z: grid.z0 + (Math.floor(k / grid.nx) + 0.5) * CS }));
      return publicPointCache;
    };
    const unitFrame = (unit, minimumSpan = 0.9, requireSpan = false) => {
      const frame = facingEdge(unit, grid);
      const validFrame = (candidate) => candidate && [candidate.A[0], candidate.A[1], candidate.B[0], candidate.B[1],
        candidate.nx, candidate.nz, candidate.length].every(Number.isFinite);
      if (validFrame(frame) && freeFrontage(unit, frame).spanLength >= minimumSpan) return frame;
      let best = null, bestScore = -Infinity;
      for (const ring of unit.rings) {
        const points = point(ring);
        for (let i = 0; i < points.length; i++) {
          const A = points[i], B = points[(i + 1) % points.length], dx = B[0] - A[0], dz = B[1] - A[1], length = Math.hypot(dx, dz);
          if (length < 0.45) continue;
          let nx = -dz / length, nz = dx / length;
          if (insideShape(unit.rings, (A[0] + B[0]) * 0.5 + nx * 0.12, (A[1] + B[1]) * 0.5 + nz * 0.12)) { nx = -nx; nz = -nz; }
          let score = 0;
          for (let s = 0.25; s < length - 0.2; s += 0.55) {
            const x = A[0] + dx * s / length, z = A[1] + dz * s / length;
            for (const offset of [0.32, 0.62, 0.95]) {
              const index = grid.idxAt(x + nx * offset, z + nz * offset);
              if (index >= 0 && grid.walkable[index]) score += 1 / offset;
            }
          }
          const candidate = { A, B, nx, nz, ux: dx / length, uz: dz / length, length, score };
          const spanLength = freeFrontage(unit, candidate).spanLength;
          if (score > 0 && spanLength >= minimumSpan) {
            const rank = score + Math.min(4, spanLength) * 0.2;
            if (rank > bestScore) { best = candidate; bestScore = rank; }
          }
        }
      }
      if (best) return best;
      if (requireSpan) return null;
      if (validFrame(frame)) return frame;
      const box = orientedBounds(unit.rings); if (!box) return null;
      const nearest = publicPoints().reduce((best, p) => {
        const distance = Math.hypot(p.x - unit.pos.x, p.z - unit.pos.z);
        return distance < best.distance ? { ...p, distance } : best;
      }, { distance: Infinity });
      if (!Number.isFinite(nearest.distance)) return null;
      const alongS = box.length >= box.width, axis = alongS ? [box.ux, box.uz] : [box.nx, box.nz];
      let nx = -axis[1], nz = axis[0];
      const toPublic = [nearest.x - unit.pos.x, nearest.z - unit.pos.z];
      if (nx * toPublic[0] + nz * toPublic[1] < 0) { nx = -nx; nz = -nz; }
      const side = alongS ? (nx * box.nx + nz * box.nz >= 0 ? box.maxT : box.minT) :
        (nx * box.ux + nz * box.uz >= 0 ? box.maxS : box.minS);
      const a = alongS ? localPoint(box, box.minS, side) : localPoint(box, side, box.minT);
      const b = alongS ? localPoint(box, box.maxS, side) : localPoint(box, side, box.maxT);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.45) return null;
      const fallback = { A: [a.x, a.z], B: [b.x, b.z], nx, nz, ux: (b.x - a.x) / length, uz: (b.z - a.z) / length, length, score: 0 };
      return !requireSpan || freeFrontage(unit, fallback).spanLength >= minimumSpan ? fallback : null;
    };
    const poiKinds = { apparel: 0, eyewear: 0, convenience: 0, pharmacy: 0, electronics: 0, foodservice: 0, bank: 0, healthcare: 0, retail: 0 };
    const classifyPoi = (poi) => {
      const text = String(poi[2] || '').toLowerCase();
      for (const [kind, words] of Object.entries({ ...SHOP_TYPE_KEYWORDS, ...config.poiKeywords })) if (words.some((word) => text.includes(word.toLowerCase()))) return kind;
      if (poi[1] === 'conveniencestore') return 'convenience';
      if (poi[1] === 'bank') return 'bank';
      if (poi[1] === 'healthcare') return 'healthcare';
      if (poi[1] === 'restaurant') return 'foodservice';
      return 'retail';
    };
    markStage('setup');
    for (const poi of g.pois) {
      const type = classifyPoi(poi); if (!poiKinds[type] && poiKinds[type] !== 0) continue;
      poiKinds[type]++;
      const unit = unitPoints.find((q) => q.shop && insideShape(q.rings, poi[3], poi[4]));
      if (!unit) continue;
      const frame = unitFrame(unit); if (!frame) continue;
      const frontage = freeFrontage(unit, frame), spanLength = Number.isFinite(frontage.spanLength) ? frontage.spanLength : frame.length;
      const spanStart = Number.isFinite(frontage.span[0]) ? frontage.span[0] : 0;
      const spanWidth = Math.min(spanLength - 0.18, 2.55);
      const baseAlong = spanStart + spanLength * 0.5, inward = [-frame.nx, -frame.nz], axis = [frontage.ux, frontage.uz];
      const projectedFront = pointOnFrame(frontage, baseAlong, -0.28);
      const front = Number.isFinite(projectedFront.x) && Number.isFinite(projectedFront.z) ? projectedFront :
        pointOnFrame(frontage, frame.length * 0.5, -0.28);
      const insideCenter = { x: poi[3] + inward[0] * 0.45, z: poi[4] + inward[1] * 0.45 };
      if (![front.x, front.z, insideCenter.x, insideCenter.z].every(Number.isFinite)) continue;
      stat.landmarks.shops.push({ type, name: poi[2], x: front.x, z: front.z, target: insideCenter, normal: [frame.nx, frame.nz] });
      const noDoorRoom = spanWidth > 0.7;
      if (type === 'convenience' || type === 'pharmacy' || type === 'healthcare' || type === 'retail') {
        const box = orientedBounds(unit.rings), shelfLength = Math.min(2.2, Math.max(1.1, (box && Math.min(box.length, box.width) * 0.74) || 1.5));
        const shelfAxis = box && box.length >= box.width ? [box.ux, box.uz] : box ? [box.nx, box.nz] : axis;
        const shelfNormal = [-shelfAxis[1], shelfAxis[0]];
        const center = { x: insideCenter.x + inward[0] * 0.35, z: insideCenter.z + inward[1] * 0.35 };
        const built = addShelf(unit, center, shelfAxis, shelfLength, `${poi[2]}:main`);
        if (built && (type === 'convenience' || type === 'healthcare' || type === 'pharmacy')) {
          addShelf(unit, { x: center.x + shelfNormal[0] * 0.62, z: center.z + shelfNormal[1] * 0.62 }, shelfAxis, shelfLength * 0.9, `${poi[2]}:side`);
        }
        if (type === 'convenience' && noDoorRoom) {
          const faceAxis = -axis[1] * frame.nx + axis[0] * frame.nz >= 0 ? axis : [-axis[0], -axis[1]];
          const fridge = machine({ x: front.x + frontage.ux * (spanWidth * 0.38) + inward[0] * 1.3, z: front.z + frontage.uz * (spanWidth * 0.38) + inward[1] * 1.3 },
            faceAxis, 'vending', null, unit, true);
          if (fridge) stat.shopFixtures++;
        }
        stat.shopFixtures += built ? 1 : 0;
      } else if (type === 'foodservice' && noDoorRoom) {
        const center = { x: front.x + inward[0] * 1.3, z: front.z + inward[1] * 1.3 }, width = Math.max(1.0, Math.min(2.25, spanWidth));
        if (addSolid([center.x, 0.46, center.z], [width, 0.88, 0.68], axis, '#765a45', unit, true)) {
          addSolid([center.x, 0.94, center.z], [width + 0.05, 0.09, 0.72], axis, '#e6e1d8', unit, false);
          addSolid([center.x, 1.32, center.z], [width * 0.88, 0.62, 0.035], axis, '#9ad6dd', unit, false, glass);
          for (let k = 0; k < 5; k++) {
            const dx = (k - 2) * Math.min(0.34, width / 6), cake = [center.x + axis[0] * dx, 1.04, center.z + axis[1] * dx];
            addSolid(cake, [0.18, 0.13, 0.18], axis, ['#f4c76e', '#db8e91', '#cba2dc', '#f2e7c2', '#e99558'][k], unit, false, glow);
          }
          addSolid([center.x, 1.96, center.z], [Math.min(1.75, width), 0.3, 0.045], axis, '#a8865c', unit, false, glow);
          stat.shopFixtures++;
        }
      } else if (type === 'bank' && noDoorRoom) {
        const count = spanWidth > 3.4 ? 3 : 2, bodyWidth = 0.55, gap = 0.18;
        for (let i = 0; i < count; i++) {
          const along = baseAlong + (i - (count - 1) * 0.5) * (bodyWidth + gap), p = pointOnFrame(frontage, along, -1.35);
          if (!addSolid([p.x, 0.93, p.z], [bodyWidth, 1.86, 0.48], axis, '#777f84', unit, true)) continue;
          addSolid([p.x, 1.34, p.z], [0.34, 0.28, 0.025], axis, '#15859a', unit, false, glow);
          addSolid([p.x, 0.72, p.z], [0.19, 0.04, 0.025], axis, '#41484b', unit, false, glow);
          stat.shopFixtures++;
        }
      }
    }
    markStage('pois');
    const serviceUnits = unitPoints.filter((u) => /customer service centre/i.test(`${u.name} ${u.originalName}`));
    stat.serviceUnitsFound = serviceUnits.length;
    const serviceSpots = [];
    for (const unit of serviceUnits.slice(0, 2)) {
      const diagnostic = { unitIndex: unit.unitIndex, name: unit.name };
      let frame = unitFrame(unit, 2.4, true), preferredWidth = !!frame;
      if (!frame) frame = unitFrame(unit, 1.6, true);
      if (!frame) { diagnostic.reason = 'no-frontage-at-least-1.6m'; stat.serviceDiagnostics.push(diagnostic); continue; }
      const frontage = freeFrontage(unit, frame), spanLength = Number.isFinite(frontage.spanLength) ? frontage.spanLength : frame.length;
      const spanStart = Number.isFinite(frontage.span[0]) ? frontage.span[0] : 0;
      let width = preferredWidth ? Math.min(1.85, spanLength - 0.16) : Math.min(1.6, spanLength);
      diagnostic.frameLength = frame.length; diagnostic.freeSpan = spanLength; diagnostic.width = width;
      diagnostic.frontageTier = preferredWidth ? '2.4m' : '1.6m-fallback';
      if (width < 1.6) { diagnostic.reason = 'frontage-too-short'; stat.serviceDiagnostics.push(diagnostic); continue; }
      const along = spanStart + spanLength * 0.5, edge = pointOnFrame(frontage, along, -0.22), inward = [-frame.nx, -frame.nz], axis = [frontage.ux, frontage.uz];
      const center = { x: edge.x + inward[0] * 0.65, z: edge.z + inward[1] * 0.65 };
      if (!addSolid([center.x, 0.48, center.z], [width, 0.96, 0.62], axis, '#6a6660', unit, true)) {
        if (!preferredWidth) { diagnostic.reason = 'counter-does-not-fit'; stat.serviceDiagnostics.push(diagnostic); continue; }
        width = Math.min(1.6, spanLength);
        diagnostic.width = width; diagnostic.frontageTier = '1.6m-fallback';
        if (!addSolid([center.x, 0.48, center.z], [width, 0.96, 0.62], axis, '#6a6660', unit, true)) {
          diagnostic.reason = 'counter-does-not-fit'; stat.serviceDiagnostics.push(diagnostic); continue;
        }
      }
      addSolid([center.x, 1.0, center.z], [width, 0.08, 0.68], axis, '#d9d5c9', unit, false);
      addSolid([center.x, 1.42, center.z], [width * 0.94, 0.72, 0.026], axis, '#b8e3e7', unit, false, glass);
      addSign([center.x, 2.1, center.z], [frame.nx, frame.nz], Math.min(2.15, width + 0.28), 0.38, 3);
      const customer = { x: center.x + frame.nx * 1.45, z: center.z + frame.nz * 1.45, normal: [frame.nx, frame.nz] };
      const staff = { x: center.x + inward[0] * 0.78, z: center.z + inward[1] * 0.78, unit };
      serviceSpots.push({ customer, staff, unit, frame, counter: center });
      stat.landmarks.csc.push({ x: center.x, z: center.z, normal: [frame.nx, frame.nz], customer, staff });
      stat.customerService++;
      diagnostic.reason = 'built'; stat.serviceDiagnostics.push(diagnostic);
    }
    markStage('service');
    const gateApproach = (gate) => {
      const length = Math.hypot(gate.dx, gate.dz) || 1, x = gate.x + gate.dx / length * 4.0, z = gate.z + gate.dz / length * 4.0;
      return { x, z };
    };
    const chosenGates = [];
    for (const gate of gateInfo.gates) {
      if (chosenGates.length >= 3) break;
      if (!chosenGates.length || Math.min(...chosenGates.map((q) => Math.hypot(q.x - gate.x, q.z - gate.z))) >= 9) chosenGates.push(gate);
    }
    const firstGate = chosenGates[0] ? gateApproach(chosenGates[0]) : { x: 0, z: 0 };
    const cscTarget = serviceSpots[0]?.customer || firstGate;
    const otherCscTarget = serviceSpots[1]?.customer || firstGate;
    const machineGroupTargets = [firstGate, otherCscTarget, cscTarget];
    const insideShapes = g.polys.flatMap((q) => ringsOf(q));
    const wallCandidates = [], wallSpawnCandidates = [], wallCandidateCells = new Set();
    for (const shape of insideShapes) {
      const ring = point(shape);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        if (length < 1.2) continue;
        const ux = dx / length, uz = dz / length, midX = (a[0] + b[0]) * 0.5, midZ = (a[1] + b[1]) * 0.5;
        let nx = -uz, nz = ux;
        if (!inBuilding(midX + nx * 0.12, midZ + nz * 0.12)) { nx = -nx; nz = -nz; }
        for (let along = 0.55; along <= length - 0.55; along += 0.7) {
          const x = a[0] + ux * along + nx * 0.52, z = a[1] + uz * along + nz * 0.52, index = grid.idxAt(x, z);
          if (index < 0 || !grid.walkable[index] || !props.publicMask[index] || grid.paid[index] || wallCandidateCells.has(index)) continue;
          if (gateInfo.gates.some((q) => Math.hypot(x - q.x, z - q.z) < 2.7)) continue;
          if (doorSegments.some(([p, q]) => distToSeg(x, z, p, q) < 1.45)) continue;
          if (facilityUnits.some((u) => shapeDistance(x, z, u.rings) < 2.6)) continue;
          wallCandidateCells.add(index);
          const candidate = { x, z, normal: [nx, nz], axis: [ux, uz], length, along };
          wallSpawnCandidates.push(candidate);
          if (machineGroupTargets.some((target) => Math.hypot(x - target.x, z - target.z) <= 22)) wallCandidates.push(candidate);
        }
      }
    }
    markStage('wallCandidates');
    stat.machineWallCandidates = wallCandidates.length;
    stat.wallSpawnCandidates = wallSpawnCandidates.length;
    const placedMachines = [], machineTargets = [];
    const placeMachineGroup = (type, count, labelIndex, target) => {
      let best = null, bestScore = Infinity;
      for (const candidate of wallCandidates) {
        const endClearance = (count - 1) * 0.5 + 0.55;
        if (candidate.length < count * 0.9 + 1.2 || candidate.along < endClearance || candidate.length - candidate.along < endClearance) continue;
        const base = { x: candidate.x, z: candidate.z }, normal = candidate.normal, axis = candidate.axis;
        const targetDistance = Math.hypot(base.x - target.x, base.z - target.z);
        if (targetDistance > 22) continue;
        if (placedMachines.some((q) => Math.hypot(q.x - base.x, q.z - base.z) < count * 0.9 + 1.0)) continue;
        const score = targetDistance;
        if (score < bestScore) { bestScore = score; best = { base, normal, axis, near: { d: 0.52 } }; }
      }
      if (!best) return [];
      const rows = [];
      const faceAxis = -best.axis[1] * best.normal[0] + best.axis[0] * best.normal[1] >= 0 ?
        best.axis : [-best.axis[0], -best.axis[1]];
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) * 0.5) * 1.0;
        const center = { x: best.base.x + best.axis[0] * offset, z: best.base.z + best.axis[1] * offset };
        const placed = machine(center, faceAxis, type, labelIndex, null, true);
        if (placed) {
          rows.push(placed); placedMachines.push(placed);
          stat.landmarks.machines.push({ x: placed.x, z: placed.z, normal: placed.normal, type, labelIndex });
        }
      }
      stat.machines[type === 'ticket' ? 'tickets' : type === 'add-value' ? 'addValue' : 'vending'] += rows.length;
      if (rows.length) machineTargets.push(...rows.slice(0, 2).map((q) => ({ x: q.x + q.normal[0] * 1.02, z: q.z + q.normal[1] * 1.02 })));
      return rows;
    };
    placeMachineGroup('ticket', 4, 1, firstGate);
    placeMachineGroup('add-value', 2, 2, otherCscTarget);
      placeMachineGroup('vending', 1, null, cscTarget);
      placeMachineGroup('vending', 1, null, otherCscTarget);
    markStage('machines');
    drawNameStrips();
    drawExitSigns();
    markStage('signs');
    stat.shopTypes = poiKinds;
    stat.gateIndicators = gateInfo.gates.length * 3;
    stat.landmarks.gates = gateInfo.gates.map(({ x, z, dx, dz }) => ({ x, z, dx, dz }));
    stat.npcPlan = [];
    const facilities = facilityUnits;
    const taken = [];
    const nearestNpcCell = (x, z, options = {}) => {
      perf.npcCellCalls++;
      const publicOnly = options.publicOnly !== false;
      let best = null, distance = options.radius || 2;
      if (publicOnly) {
        const candidates = publicPoints();
        if (!publicRank) {
          publicRank = new Int32Array(grid.nx * grid.nz);
          publicRank.fill(-1);
          candidates.forEach((p, rank) => { publicRank[p.index] = rank; });
        }
        const i0 = Math.max(0, Math.floor((x - distance - grid.x0) / CS) - 1);
        const i1 = Math.min(grid.nx - 1, Math.ceil((x + distance - grid.x0) / CS) + 1);
        const j0 = Math.max(0, Math.floor((z - distance - grid.z0) / CS) - 1);
        const j1 = Math.min(grid.nz - 1, Math.ceil((z + distance - grid.z0) / CS) + 1);
        let bestDistance = Infinity, bestRank = Infinity;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const index = j * grid.nx + i, rank = publicRank[index];
          perf.npcCellsScanned++;
          if (rank < 0 || !grid.walkable[index] || !publicMask[index]) continue;
          const p = candidates[rank], d = Math.hypot(p.x - x, p.z - z);
          if (d > distance) continue;
          if (options.unpaid && grid.paid[p.index]) continue;
          if (options.unit && !insideShape(options.unit.rings, p.x, p.z)) continue;
          if (facilities.some((u) => insideShape(u.rings, p.x, p.z))) continue;
          if (!hasGateClearance(p.x, p.z, 1.15)) continue;
          if (taken.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.5)) continue;
          if (Math.hypot(startPoint.x - p.x, startPoint.z - p.z) < 3) continue;
          if (d < bestDistance || (d === bestDistance && rank < bestRank)) {
            best = p; bestDistance = d; bestRank = rank;
          }
        }
        return best;
      }
      const cells = (() => {
        const out = []; let i0 = 0, i1 = grid.nx - 1, j0 = 0, j1 = grid.nz - 1;
        if (options.unit) {
          const bounds = unitBounds(options.unit.rings);
          i0 = Math.max(0, Math.floor((bounds[0] - grid.x0) / CS)); i1 = Math.min(grid.nx - 1, Math.floor((bounds[2] - grid.x0) / CS));
          j0 = Math.max(0, Math.floor((bounds[1] - grid.z0) / CS)); j1 = Math.min(grid.nz - 1, Math.floor((bounds[3] - grid.z0) / CS));
        }
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * grid.nx + i; if (!grid.walkable[k]) continue;
          out.push({ index: k, x: grid.x0 + (i + 0.5) * CS, z: grid.z0 + (j + 0.5) * CS });
        }
        return out;
      })();
      for (const p of cells) {
        perf.npcCellsScanned++;
        if (!grid.walkable[p.index]) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d > distance) continue;
        if (options.unpaid && grid.paid[p.index]) continue;
        if (options.unit && !insideShape(options.unit.rings, p.x, p.z)) continue;
        if (facilities.some((u) => insideShape(u.rings, p.x, p.z))) continue;
        if (taken.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.5)) continue;
        if (Math.hypot(startPoint.x - p.x, startPoint.z - p.z) < 3) continue;
        if (d < (best ? Math.hypot(best.x - x, best.z - z) : Infinity)) best = p;
      }
      return best;
    };
    const addNpcRole = (role, target, options = {}) => {
      const pos = nearestNpcCell(target.x, target.z, options);
      if (!pos) return false;
      taken.push(pos); stat.npcPlan.push({ role, x: pos.x, z: pos.z, yaw: options.yaw || 0, unit: options.unit ? options.unit.unitIndex : null });
      return true;
    };
    for (const gate of chosenGates) {
      const direction = Math.hypot(gate.dx, gate.dz) || 1;
      const ux = gate.dx / direction, uz = gate.dz / direction;
      for (const distance of [2.0, 3.65]) addNpcRole('queue', { x: gate.x + ux * distance, z: gate.z + uz * distance }, { unpaid: true, radius: 2.0, yaw: Math.atan2(-ux, -uz) });
    }
    for (const target of machineTargets.slice(0, 2)) addNpcRole('machine', target, { unpaid: true, radius: 1.5 });
    for (const item of serviceSpots) {
      addNpcRole('customer', item.customer, { unpaid: true, radius: 1.7, yaw: Math.atan2(item.frame.nx, item.frame.nz) });
      addNpcRole('staff', item.staff, { publicOnly: false, unit: item.unit, radius: 1.4, role: 'staff', yaw: Math.atan2(-item.frame.nx, -item.frame.nz) });
    }
    const edgeCandidates = wallSpawnCandidates.map(({ x, z }) => ({ x, z }))
      .sort((a, b) => Math.hypot(a.x - cscTarget.x, a.z - cscTarget.z) - Math.hypot(b.x - cscTarget.x, b.z - cscTarget.z));
    for (const p of edgeCandidates) {
      if (stat.npcPlan.filter((q) => q.role === 'wall').length >= 2) break;
      addNpcRole('wall', p, { unpaid: true, radius: 0.5 });
    }
    stat.npcPlan = stat.npcPlan.slice(0, TOUCH ? 12 : 24);
    markStage('npc');
    props.publicCells = [...getPublicReachCells()];
    const edgeCount = addShowcaseWallEdges(getBuilder, g, g.H);
    stat.boxes += edgeCount; stat.triangles += edgeCount * 12;
    props.reachability.after = props.publicCells.length;
    props.reachability.unchanged = props.reachability.after === props.reachability.before;
    props.reachability.publicCellsBlocked = blockedPublic.size;
    props.reachability.expectedReachableAfterProps = baselineReachable.size - blockedPublic.size;
    props.reachability.connectivityPreserved = props.reachability.after === props.reachability.expectedReachableAfterProps &&
      props.publicCells.every((k) => baselineReachable.has(k) && !blockedPublic.has(k));
    props.propStats.total += stat.boxes;
    props.propStats.triangles += stat.triangles;
    stat.reachability = { ...props.reachability };
    stat.publicCells = props.publicCells.length;
    markStage('finalize');
    perf.reachBfsMs = Math.round(perf.reachBfsMs * 10) / 10;
    return stat;
  }
  function addBeam(builder, A, B, width, height, tint) {
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], len = Math.hypot(dx, dy, dz);
    if (len < 0.02) return;
    const dir = [dx / len, dy / len, dz / len], horizontal = Math.hypot(dx, dz) || 1, right = [-dz / horizontal, 0, dx / horizontal];
    const up = [right[1] * dir[2] - right[2] * dir[1], right[2] * dir[0] - right[0] * dir[2], right[0] * dir[1] - right[1] * dir[0]];
    const C = [(A[0] + B[0]) * 0.5, (A[1] + B[1]) * 0.5, (A[2] + B[2]) * 0.5], hL = len * 0.5, hW = width * 0.5, hH = height * 0.5;
    const p = (a, b, c) => [C[0] + dir[0] * a + right[0] * b + up[0] * c, C[1] + dir[1] * a + right[1] * b + up[1] * c, C[2] + dir[2] * a + right[2] * b + up[2] * c];
    const x0 = -hL, x1 = hL, y0 = -hW, y1 = hW, z0 = -hH, z1 = hH;
    for (const q of [
      [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)],
      [p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0)],
      [p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0)],
      [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)],
      [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)],
      [p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1)]
    ]) builder.quad(q[0], q[1], q[2], q[3], tint);
  }
  function local3(box, s, t, y) { const p = localPoint(box, s, t); return [p.x, y, p.z]; }
  function addGlassRail(builder, box, s0, s1, t, y0, y1, height) {
    const A = local3(box, s0, t, y0), B = local3(box, s1, t, y1), C = local3(box, s1, t, y1 + height), D = local3(box, s0, t, y0 + height);
    builder.quad(A, B, C, D, color('#ffffff'));
  }
  function addFacilityProps(getBuilder, unitPoints, grid) {
    const metal = getBuilder('metal'), glass = getBuilder('shopGlass'), steel = getBuilder('brushedSteel');
    for (const unit of unitPoints) {
      if (unit.cat === 'elevator') {
        const frame = facingEdge(unit, grid); if (!frame) continue;
        let ux = (frame.B[0] - frame.A[0]) / frame.length, uz = (frame.B[1] - frame.A[1]) / frame.length;
        if ((-uz) * frame.nx + ux * frame.nz < 0) { ux = -ux; uz = -uz; }
        const width = Math.min(1.65, frame.length * 0.68), cx = (frame.A[0] + frame.B[0]) * 0.5 + frame.nx * 0.07, cz = (frame.A[1] + frame.B[1]) * 0.5 + frame.nz * 0.07;
        const panelW = (width - 0.06) * 0.5;
        for (const side of [-1, 1]) addBox(steel, [cx + ux * side * (panelW * 0.5 + 0.015), 1.02, cz + uz * side * (panelW * 0.5 + 0.015)], [panelW, 2.04, 0.07], [ux, uz], color('#d4d7d9'));
        addBox(metal, [cx, 1.02, cz], [0.025, 2.04, 0.075], [ux, uz], color('#555d62'));
        const px = cx + ux * (width * 0.5 + 0.17), pz = cz + uz * (width * 0.5 + 0.17);
        addBox(steel, [px, 1.31, pz], [0.22, 0.46, 0.07], [ux, uz], color('#9ca4a8'));
        addBox(metal, [px, 1.41, pz], [0.08, 0.055, 0.04], [ux, uz], color('#68ce91'));
        addBox(metal, [px, 1.22, pz], [0.08, 0.055, 0.04], [ux, uz], color('#e3c34e'));
        continue;
      }
      if (unit.cat !== 'stairs' && unit.cat !== 'escalator') continue;
      const obb = orientedBounds(unit.rings); if (!obb || obb.length < 1.2 || obb.width < 0.8) continue;
      const count = unit.cat === 'escalator' ? 12 : 8, rise = unit.cat === 'escalator' ? 1.8 : 1.6, start = obb.minS + 0.1, end = obb.maxS - 0.1, run = (end - start) / count;
      const width = Math.min(unit.cat === 'escalator' ? 1.55 : 1.3, obb.width * 0.72), midT = (obb.minT + obb.maxT) * 0.5;
      if (run < 0.12 || width < 0.5) continue;
      for (let i = 0; i < count; i++) {
        const h = rise * (i + 1) / count, s = start + (i + 0.5) * run, p = localPoint(obb, s, midT);
        addBox(steel, [p.x, h, p.z], [run * 0.9, 0.11, width], [obb.ux, obb.uz], color(unit.cat === 'escalator' ? '#a0a7a9' : '#b0aaa1'));
      }
      if (unit.cat === 'escalator') {
        for (const side of [-1, 1]) {
          const t = midT + side * (width * 0.5 + 0.08);
          addGlassRail(glass, obb, start, end, t, 0.12, rise + 0.12, 0.66);
          addBeam(metal, local3(obb, start, t, 0.88), local3(obb, end, t, Math.min(rise + 0.55, 2.42)), 0.065, 0.08, color('#3f484c'));
        }
      } else {
        for (const side of [-1, 1]) {
          const t = midT + side * Math.min(obb.width * 0.43, 0.78);
          addBeam(metal, local3(obb, start, t, 0.82), local3(obb, end, t, 2.38), 0.055, 0.065, color('#4d5151'));
        }
      }
    }
  }
  function addShopFurniture(getBuilder, unitPoints, frontRuns) {
    const vb = getBuilder('furniture'), fronts = new Map(); let count = 0;
    for (const run of frontRuns) { const old = fronts.get(run.unitIndex); if (!old || run.length > old.length) fronts.set(run.unitIndex, run); }
    for (let i = 0; i < unitPoints.length && count < 150; i++) {
      const unit = unitPoints[i]; if (!unit.shop || polygonArea(unit.rings) < 12) continue;
      const box = orientedBounds(unit.rings); if (!box || box.length < 1.1 || box.width < 0.7) continue;
      const front = fronts.get(i); let fs = (box.minS + box.maxS) * 0.5, ft = (box.minT + box.maxT) * 0.5, bs = fs, bt = ft;
      if (front) {
        const mx = (front.A[0] + front.B[0]) * 0.5, mz = (front.A[1] + front.B[1]) * 0.5;
        const ds = mx * box.ux + mz * box.uz - fs, dt = mx * box.nx + mz * box.nz - ft;
        if (Math.abs(ds) > Math.abs(dt)) {
          fs = ds < 0 ? box.minS + 0.6 : box.maxS - 0.6; bs = ds < 0 ? box.maxS - 0.3 : box.minS + 0.3;
        } else {
          ft = dt < 0 ? box.minT + 0.55 : box.maxT - 0.55; bt = dt < 0 ? box.maxT - 0.3 : box.minT + 0.3;
        }
      } else { fs = box.minS + 0.6; bs = box.maxS - 0.3; }
      const counter = localPoint(box, fs, ft), shelf = localPoint(box, bs, bt), length = Math.min(1.5, box.length * 0.55), depth = Math.min(0.5, box.width * 0.5);
      if (length < 0.6 || depth < 0.25) continue;
      const tone = color(unit.cat === 'foodservice' ? '#9a704d' : unit.cat === 'office' ? '#687663' : unit.cat === 'classroom' ? '#7d765f' : '#896b4f');
      addBox(vb, [counter.x, 0.48, counter.z], [length, 0.96, depth], [box.ux, box.uz], tone);
      addBox(vb, [shelf.x, 0.82, shelf.z], [Math.min(1.6, box.length * 0.65), 1.64, Math.min(0.34, box.width * 0.35)], [box.ux, box.uz], color('#66594b'));
      count++;
    }
    return count;
  }
  function propAssets() {
    if (!indoorPropAssets) {
      indoorPropAssets = {
        geometry: { box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8) },
        material: {
          box: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.04, emissive: 0x171717, emissiveIntensity: 0.35 }),
          cylinder: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.08, emissive: 0x111111, emissiveIntensity: 0.25 })
        }
      };
    }
    return indoorPropAssets;
  }
  function shopTypeFor(unit) {
    if (unit.cat === 'foodservice') return 'foodservice';
    const name = String(unit.name || unit.originalName || '').toLowerCase();
    for (const type of ['apparel', 'eyewear', 'convenience', 'pharmacy', 'electronics', 'foodservice']) {
      if (SHOP_TYPE_KEYWORDS[type].some((word) => name.includes(word.toLowerCase()))) return type;
    }
    return unit.shop ? 'retail' : null;
  }
  function publicCellData(grid, units, x, z) {
    if (!grid) return { mask: new Uint8Array(0), cells: [], start: -1, reachable: 0 };
    const mask = new Uint8Array(grid.nx * grid.nz), cells = [];
    for (const shape of units.shapes) {
      const bounds = shape.bounds;
      const i0 = Math.max(0, Math.floor((bounds[0] - grid.x0) / CS)), i1 = Math.min(grid.nx - 1, Math.floor((bounds[2] - grid.x0) / CS));
      const j0 = Math.max(0, Math.floor((bounds[1] - grid.z0) / CS)), j1 = Math.min(grid.nz - 1, Math.floor((bounds[3] - grid.z0) / CS));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * grid.nx + i; if (!grid.walkable[k] || mask[k]) continue;
        const px = grid.x0 + (i + 0.5) * CS, pz = grid.z0 + (j + 0.5) * CS;
        if (px >= bounds[0] && px <= bounds[2] && pz >= bounds[1] && pz <= bounds[3] && insideShape(shape.rings, px, pz)) {
          mask[k] = 1; cells.push(k);
        }
      }
    }
    let start = -1, best = Infinity;
    for (const k of cells) {
      const px = grid.x0 + ((k % grid.nx) + 0.5) * CS, pz = grid.z0 + (Math.floor(k / grid.nx) + 0.5) * CS, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < best || (d === best && (start < 0 || k < start))) { best = d; start = k; }
    }
    const reachableCells = publicReachCells(grid, mask, start);
    return { mask, cells, reachableCells, start, reachable: reachableCells.length };
  }
  const reachabilityScratch = new WeakMap();
  function publicReachCells(grid, mask, start) {
    if (!grid || start < 0 || !mask[start] || !grid.walkable[start]) return [];
    let scratch = reachabilityScratch.get(grid);
    if (!scratch || scratch.seen.length !== mask.length) {
      scratch = { seen: new Uint32Array(mask.length), queue: new Int32Array(mask.length), stamp: 0 };
      reachabilityScratch.set(grid, scratch);
    }
    let stamp = (scratch.stamp + 1) >>> 0;
    if (!stamp) { scratch.seen.fill(0); stamp = 1; }
    scratch.stamp = stamp;
    const { seen, queue } = scratch; let head = 0, tail = 0;
    queue[tail++] = start; seen[start] = stamp;
    while (head < tail) {
      const k = queue[head++], i = k % grid.nx, j = Math.floor(k / grid.nx);
      let n;
      if (i) { n = k - 1; if (seen[n] !== stamp && mask[n] && grid.walkable[n]) { seen[n] = stamp; queue[tail++] = n; } }
      if (i + 1 < grid.nx) { n = k + 1; if (seen[n] !== stamp && mask[n] && grid.walkable[n]) { seen[n] = stamp; queue[tail++] = n; } }
      if (j) { n = k - grid.nx; if (seen[n] !== stamp && mask[n] && grid.walkable[n]) { seen[n] = stamp; queue[tail++] = n; } }
      if (j + 1 < grid.nz) { n = k + grid.nx; if (seen[n] !== stamp && mask[n] && grid.walkable[n]) { seen[n] = stamp; queue[tail++] = n; } }
    }
    return queue.subarray(0, tail);
  }
  function addMerchandise(root, r, g, unitPoints, frontRuns, grid, publicUnits, movementUnits, station, start, skipShopFixtures = false) {
    const assets = propAssets(), batches = { box: [], cylinder: [] }, collisions = [], shopAnchors = [], foodAnchors = [];
    const shopStats = { apparel: 0, eyewear: 0, convenience: 0, pharmacy: 0, electronics: 0, foodservice: 0, retail: 0 };
    const frontByUnit = new Map();
    for (const run of frontRuns) { const old = frontByUnit.get(run.unitIndex); if (!old || run.length > old.length) frontByUnit.set(run.unitIndex, run); }
    const publicBefore = publicCellData(grid, movementUnits, start.x, start.z), doorSegments = g.doors.flatMap((d) => linesOf(d[2]));
    const circulation = unitPoints.filter((u) => ['elevator', 'stairs', 'escalator'].includes(u.cat));
    const trackUnits = unitPoints.filter((u) => /鐵路路軌|路軌|track/i.test(`${u.name} ${u.cat}`));
    const gateInfo = station ? gateTransitions(grid, r.data, g.o) : { gates: [] };
    let instanceCount = 0, triangleEstimate = 0, shopUnitCount = 0, fallbackUnitCount = 0;
    const fallbackDiagnostics = [];
    const colorList = [0xd95e58, 0xe6af3d, 0x54a7b4, 0x80a85a, 0xa277bd, 0xe27f42, 0x5f83c4, 0xe3d36d, 0xdd7ca8, 0x83c3a1];
    if (skipShopFixtures) for (const unit of unitPoints) {
      if (!unit.shop || polygonArea(unit.rings) < 12) continue;
      const type = shopTypeFor(unit); if (!type) continue; shopStats[type]++; shopUnitCount++;
    }
    const rngFor = (key) => {
      let seed = 2166136261; for (const ch of String(key)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
      return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    };
    const clearOfDoor = (x, z, gap) => doorSegments.every(([a, b]) => distToSeg(x, z, a, b) >= gap);
    const clearOfCirculation = (x, z, gap) => circulation.every((u) => shapeDistance(x, z, u.rings) >= gap);
    const clearOfGates = (x, z, gap) => gateInfo.gates.every((q) => Math.hypot(x - q.x, z - q.z) >= gap);
    const safePoint = (unit, x, z, spec, blocking) => {
      if (unit && !insideShape(unit.rings, x, z)) return false;
      if (!clearOfDoor(x, z, 0.7) || !clearOfCirculation(x, z, 1.0) || !clearOfGates(x, z, 1.4)) return false;
      if (!blocking) return true;
      if (!clearOfDoor(x, z, 1.45) || !clearOfCirculation(x, z, 2.2) || !clearOfGates(x, z, 2.25)) return false;
      if (spec && spec.frontAxis === 's' && (x * spec.box.ux + z * spec.box.uz - spec.face) * spec.frontSign < 1.25) return false;
      if (spec && spec.frontAxis === 't' && (x * spec.box.nx + z * spec.box.nz - spec.face) * spec.frontSign < 1.25) return false;
      return true;
    };
    const pointDiagnostic = (unit, x, z, box, longMin, longMax, depthMin, depthMax, alongIsS) => {
      const s = x * box.ux + z * box.uz, t = x * box.nx + z * box.nz, a = alongIsS ? s : t, d = alongIsS ? t : s;
      return {
        x, z, inside: insideShape(unit.rings, x, z), public: publicAt(publicUnits, x, z),
        bounds: a >= longMin + 0.35 && a <= longMax - 0.35 && d >= depthMin + 0.35 && d <= depthMax - 0.35,
        door: clearOfDoor(x, z, 1.45), circulation: clearOfCirculation(x, z, 2.2), gates: clearOfGates(x, z, 2.25),
        safe: safePoint(unit, x, z, { box, frontAxis: null }, true)
      };
    };
    const put = (kind, unit, box, along, depth, y, sx, sy, sz, tint, blocking = false, spec = null, axis = 's') => {
      if (instanceCount >= PROP_INSTANCE_CAP) return null;
      const p = localPoint(box, along, depth), dir = axis === 's' ? [box.ux, box.uz] : [box.nx, box.nz];
      if (!safePoint(unit, p.x, p.z, spec, blocking)) return null;
      const tri = kind === 'box' ? 12 : 32; if (triangleEstimate + tri > PROP_TRIANGLE_CAP) return null;
      const row = { x: p.x, y, z: p.z, sx, sy, sz, axis: dir, tint };
      batches[kind].push(row);
      instanceCount++; triangleEstimate += tri;
      if (blocking) collisions.push({ x: p.x, z: p.z, sx, sz, axis: dir, rings: unit && unit.rings, row, kind, tri });
      return p;
    };
    const putAlong = (kind, unit, box, along, depth, y, sx, sy, sz, tint, blocking = false, spec = null, axis = 's') =>
      axis === 's' ? put(kind, unit, box, along, depth, y, sx, sy, sz, tint, blocking, spec, axis) :
        put(kind, unit, box, depth, along, y, sx, sy, sz, tint, blocking, spec, axis);
    const shelf = (unit, box, spec, along, depth, length, depthSize, random, accent, axis = 's') => {
      if (length < 0.7 || depthSize < 0.28) return null;
      putAlong('box', unit, box, along, depth, 0.15, length, 0.3, depthSize, 0x66584b, true, spec, axis);
      const levels = [0.46, 0.92, 1.38];
      for (const y of levels) putAlong('box', unit, box, along, depth, y, length, 0.055, depthSize, accent, false, spec, axis);
      const rows = Math.max(3, Math.min(18, Math.floor(length / 0.24)));
      for (let level = 0; level < 3; level++) for (let i = 0; i < rows; i++) {
        const a = along - length * 0.43 + length * 0.86 * (i + 0.5) / rows, size = 0.12 + random() * 0.07;
        putAlong('box', unit, box, a, depth, levels[level] + 0.11 + random() * 0.035, size, 0.16 + random() * 0.1, Math.min(0.18, depthSize * 0.42), colorList[Math.floor(random() * colorList.length)], false, spec, axis);
      }
      const p = axis === 's' ? localPoint(box, along, depth) : localPoint(box, depth, along);
      const q = axis === 's' ? localPoint(box, along, depth + depthSize * 0.5 + 0.48) : localPoint(box, depth + depthSize * 0.5 + 0.48, along);
      if (insideShape(unit.rings, q.x, q.z)) shopAnchors.push({ x: q.x, z: q.z, shelf: p, axis: axis === 's' ? box.ux : box.nx, unit });
      return p;
    };
    const table = (unit, box, spec, along, depth, random, axis = 's') => {
      const p = putAlong('box', unit, box, along, depth, 0.43, 0.8, 0.08, 0.8, 0x8b684b, true, spec, axis);
      if (!p) return null;
      for (const da of [-0.28, 0.28]) for (const dd of [-0.28, 0.28]) putAlong('box', unit, box, along + da, depth + dd, 0.2, 0.07, 0.4, 0.07, 0x55483d, false, spec, axis);
      const around = [[-0.62, 0], [0.62, 0], [0, -0.62], [0, 0.62]];
      const stoolPoints = [];
      for (let k = 0; k < (random() < 0.5 ? 2 : 4); k++) {
        const [da, dd] = around[k], q = putAlong('cylinder', unit, box, along + da, depth + dd, 0.27, 0.3, 0.34, 0.3, 0x494d52, true, spec, axis);
        if (q) stoolPoints.push(q);
      }
      foodAnchors.push({ x: p.x, z: p.z, points: stoolPoints, axis, unit, box, along, depth });
      return p;
    };
    const findSafeShopPoint = (unit, box, spec, alongIsS, longMin, longMax, depthMin, depthMax, along, depth, reserved = [], front = null, preferred = []) => {
      for (const poi of preferred) for (const [dx, dz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
        const x = poi[3] + dx, z = poi[4] + dz;
        if (publicAt(publicUnits, x, z) || !safePoint(unit, x, z, spec, true)) continue;
        const s = x * box.ux + z * box.uz, t = x * box.nx + z * box.nz, a = alongIsS ? s : t, d = alongIsS ? t : s;
        if (a < longMin + 0.35 || a > longMax - 0.35 || d < depthMin + 0.35 || d > depthMax - 0.35) continue;
        if (reserved.some((q) => Math.hypot(a - q.along, d - q.depth) < 1.55)) continue;
        return { along: a, depth: d, x, z };
      }
      if (front && front.length > 1.1) {
        const cx = (front.A[0] + front.B[0]) * 0.5, cz = (front.A[1] + front.B[1]) * 0.5, half = Math.max(0.25, front.length * 0.5 - 0.45);
        for (const depthOffset of [1.6, 2.1, 2.8, 3.7, 5, 6.5, 8, 10]) for (let lateral = -half; lateral <= half; lateral += 0.8) {
          const x = cx - front.nx * depthOffset + front.ux * lateral, z = cz - front.nz * depthOffset + front.uz * lateral;
          if (publicAt(publicUnits, x, z) || !safePoint(unit, x, z, spec, true)) continue;
          const s = x * box.ux + z * box.uz, t = x * box.nx + z * box.nz, a = alongIsS ? s : t, d = alongIsS ? t : s;
          if (a < longMin + 0.35 || a > longMax - 0.35 || d < depthMin + 0.35 || d > depthMax - 0.35) continue;
          if (reserved.some((q) => Math.hypot(a - q.along, d - q.depth) < 1.55)) continue;
          return { along: a, depth: d, x, z };
        }
      }
      const step = 0.55, maxRing = 15;
      for (let ring = 0; ring <= maxRing; ring++) for (let da = -ring; da <= ring; da++) for (let dd = -ring; dd <= ring; dd++) {
        if (Math.max(Math.abs(da), Math.abs(dd)) !== ring) continue;
        const a = along + da * step, d = depth + dd * step;
        if (a < longMin + 0.35 || a > longMax - 0.35 || d < depthMin + 0.35 || d > depthMax - 0.35) continue;
        if (reserved.some((q) => Math.hypot(a - q.along, d - q.depth) < 1.55)) continue;
        const p = alongIsS ? localPoint(box, a, d) : localPoint(box, d, a);
        if (!publicAt(publicUnits, p.x, p.z) && safePoint(unit, p.x, p.z, spec, true)) return { along: a, depth: d, x: p.x, z: p.z };
      }
      return null;
    };
    for (const unit of skipShopFixtures ? [] : unitPoints) {
      if (!unit.shop || shopUnitCount >= 150 || polygonArea(unit.rings) < 12) continue;
      const type = shopTypeFor(unit); if (!type) continue; shopStats[type]++; shopUnitCount++;
      const box = orientedBounds(unit.rings); if (!box || box.length < 1.6 || box.width < 1.2) continue;
      const unitInstanceStart = instanceCount;
      const random = rngFor(`${r.v.id}:${g.o}:${unit.unitIndex}:${unit.originalName || unit.name}`), front = frontByUnit.get(unit.unitIndex);
      const midS = (box.minS + box.maxS) * 0.5, midT = (box.minT + box.maxT) * 0.5;
      let frontAxis = null, face = 0, frontSign = 1;
      if (front) {
        const fs = ((front.A[0] + front.B[0]) * 0.5) * box.ux + ((front.A[1] + front.B[1]) * 0.5) * box.uz;
        const ft = ((front.A[0] + front.B[0]) * 0.5) * box.nx + ((front.A[1] + front.B[1]) * 0.5) * box.nz;
        if (Math.abs(fs - midS) > Math.abs(ft - midT)) { frontAxis = 's'; face = fs; frontSign = Math.sign(midS - fs) || 1; }
        else { frontAxis = 't'; face = ft; frontSign = Math.sign(midT - ft) || 1; }
      }
      const spec = { box, frontAxis, face, frontSign }, alongIsS = box.length >= box.width;
      const longMin = alongIsS ? box.minS + 0.55 : box.minT + 0.55, longMax = alongIsS ? box.maxS - 0.55 : box.maxT - 0.55;
      const depthMin = alongIsS ? box.minT + 0.55 : box.minS + 0.55, depthMax = alongIsS ? box.maxT - 0.55 : box.maxS - 0.55;
      const longMid = (longMin + longMax) * 0.5, depthMid = (depthMin + depthMax) * 0.5;
      const coords = (a, d) => alongIsS ? [a, d] : [d, a], axis = alongIsS ? 's' : 't';
      const depthSpan = depthMax - depthMin, longSpan = longMax - longMin;
      const depthNear = frontAxis === (alongIsS ? 't' : 's') ? face + frontSign * 1.5 : depthMin + 0.35;
      const backDepth = frontAxis === (alongIsS ? 't' : 's') ? (frontSign > 0 ? depthMax - 0.55 : depthMin + 0.55) : depthMax - 0.45;
      const itemColors = () => colorList[Math.floor(random() * colorList.length)];
      if (type === 'apparel') {
        const racks = 2 + Math.floor(random() * 3), rackLen = Math.min(1.35, Math.max(0.7, longSpan / (racks + 1) * 0.72));
        for (let i = 0; i < racks; i++) {
          const along = longMin + longSpan * (i + 1) / (racks + 1), [s, t] = coords(along, depthMid);
          const [lps, lpt] = coords(along - rackLen * 0.43, depthMid), [rps, rpt] = coords(along + rackLen * 0.43, depthMid);
          put('box', unit, box, s, t, 0.18, rackLen, 0.12, 0.48, 0x4b5154, true, spec, axis);
          put('cylinder', unit, box, lps, lpt, 0.79, 0.07, 1.42, 0.07, 0x51575b, true, spec, axis);
          put('cylinder', unit, box, rps, rpt, 0.79, 0.07, 1.42, 0.07, 0x51575b, true, spec, axis);
          put('box', unit, box, s, t, 1.48, rackLen, 0.055, 0.055, 0x6a7073, false, spec, axis);
          const hangers = 6 + Math.floor(random() * 5);
          for (let k = 0; k < hangers; k++) {
            const [hs, ht] = coords(along - rackLen * 0.42 + rackLen * 0.84 * (k + 0.5) / hangers, depthMid);
            put('box', unit, box, hs, ht, 1.07, Math.min(0.14, rackLen / hangers * 0.8), 0.64, 0.08, itemColors(), false, spec, axis);
          }
          const [as, at] = coords(along, depthMid + (depthMax - depthMin > 1.8 ? 0.55 : -0.55)), stand = localPoint(box, as, at);
          shopAnchors.push({ x: stand.x, z: stand.z, shelf: localPoint(box, s, t), axis: box.ux, unit });
        }
        const mannequins = 1 + Math.floor(random() * 2);
        for (let i = 0; i < mannequins; i++) {
          const [s, t] = coords(longMin + longSpan * (i + 1) / (mannequins + 1), depthNear);
          put('cylinder', unit, box, s, t, 0.08, 0.24, 0.08, 0.24, 0x35383b, true, spec, axis);
          put('box', unit, box, s, t, 1.08, 0.32, 0.56, 0.18, 0xc89c7f, false, spec, axis);
          put('box', unit, box, s, t, 0.58, 0.28, 0.48, 0.16, 0x273243, false, spec, axis);
          put('cylinder', unit, box, s, t, 1.48, 0.14, 0.22, 0.14, 0xd9b79e, false, spec, axis);
          put('box', unit, box, s, t, 0.29, 0.34, 0.48, 0.18, 0x343940, false, spec, axis);
        }
        if (/shoe|鞋|locker/i.test(unit.name || unit.originalName || '')) shelf(unit, box, spec, longMid, backDepth, Math.min(longSpan, 2.0), Math.min(0.32, depthSpan * 0.3), random, 0x67584c, axis);
      } else if (type === 'eyewear') {
        const counters = Math.max(1, Math.min(3, Math.floor(longSpan / 1.7)));
        for (let i = 0; i < counters; i++) {
          const along = longMin + longSpan * (i + 1) / (counters + 1), [s, t] = coords(along, depthNear);
          put('box', unit, box, s, t, 0.48, 1.25, 0.9, 0.62, 0x5f5146, true, spec, axis);
          put('box', unit, box, s, t, 0.96, 1.25, 0.035, 0.62, 0x9fd1d6, false, spec, axis);
          for (let k = 0; k < 7; k++) {
            const [is, it] = coords(along - 0.48 + k * 0.16, depthNear);
            put('box', unit, box, is, it, 1.03, 0.09, 0.08, 0.08, itemColors(), false, spec, axis);
          }
        }
      } else if (type === 'convenience' || type === 'pharmacy') {
        const aisles = type === 'convenience' ? (depthSpan > 4.6 ? 3 : 2) : 2;
        for (let i = 0; i < aisles; i++) {
          const depth = type === 'pharmacy' ? (i === 0 ? backDepth : depthMid) : depthMin + depthSpan * (i + 1) / (aisles + 1);
          shelf(unit, box, spec, longMid, depth, Math.min(longSpan - 0.5, 3.8), type === 'convenience' ? 0.65 : 0.46, random, 0x746454, axis);
        }
        if (type === 'convenience') {
          const centerAlong = longMin + longSpan * 0.5, [s, t] = coords(centerAlong, backDepth), [gs, gt] = coords(centerAlong, backDepth - 0.29);
          put('box', unit, box, s, t, 1.05, Math.min(2.2, longSpan * 0.65), 2.1, 0.55, 0x343b40, true, spec, axis);
          put('box', unit, box, gs, gt, 1.05, Math.min(1.9, longSpan * 0.56), 1.78, 0.045, 0x57b8cb, false, spec, axis);
          for (let k = 0; k < 5; k++) {
            const [bs, bt] = coords(centerAlong - 0.72 + k * 0.36, backDepth - 0.33);
            put('box', unit, box, bs, bt, 1.05, 0.22, 0.3, 0.025, itemColors(), false, spec, axis);
          }
        }
      } else if (type === 'electronics') {
        const displays = Math.max(1, Math.min(3, Math.floor(longSpan / 1.8)));
        for (let i = 0; i < displays; i++) {
          const along = longMin + longSpan * (i + 1) / (displays + 1), [s, t] = coords(along, depthNear);
          put('box', unit, box, s, t, 0.48, 1.3, 0.88, 0.72, 0x343b43, true, spec, axis);
          for (let k = 0; k < 3; k++) {
            const [is, it] = coords(along - 0.38 + k * 0.38, depthNear);
            put('box', unit, box, is, it, 0.98, 0.31, 0.055, 0.25, 0x202936, false, spec, axis);
          }
        }
        for (let k = 0; k < 5; k++) {
          const [s, t] = coords(longMin + longSpan * (k + 1) / 6, backDepth);
          put('box', unit, box, s, t, 1.8, 0.78, 1.05, 0.12, [0x2d5f78, 0x496c8a, 0x865b7e, 0x3d7977, 0x735e40][k], false, spec, axis);
        }
      } else if (type === 'foodservice') {
        const rows = Math.max(1, Math.min(3, Math.floor(depthSpan / 1.55))), cols = Math.max(1, Math.min(4, Math.floor(longSpan / 1.55)));
        const stepA = Math.max(1.45, longSpan / (cols + 1)), stepD = Math.max(1.45, depthSpan / (rows + 1));
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
          table(unit, box, spec, longMin + stepA * (col + 1), depthMin + stepD * (row + 1), random, axis);
        }
        const [cs, ct] = coords(longMid, backDepth);
        put('box', unit, box, cs, ct, 0.52, Math.min(2.5, longSpan * 0.72), 1.04, 0.55, 0x7e563b, true, spec, axis);
        put('box', unit, box, cs, ct, 1.72, Math.min(2.2, longSpan * 0.62), 0.82, 0.1, 0x21404a, false, spec, axis);
        for (let k = 0; k < 4; k++) {
          const [ms, mt] = coords(longMid - 0.65 + k * 0.43, backDepth - 0.06);
          put('box', unit, box, ms, mt, 1.72, 0.28, 0.18, 0.025, [0xffb33b, 0x55c8d0, 0xe1656b, 0xffe174][k], false, spec, axis);
        }
      } else {
        const shelves = Math.max(1, Math.min(3, Math.floor(depthSpan / 1.15)));
        for (let i = 0; i < shelves; i++) shelf(unit, box, spec, longMid, depthMin + depthSpan * (i + 1) / (shelves + 1), Math.min(longSpan - 0.4, 3.8), 0.34, random, 0x6c5d50, axis);
        const along = longMin + longSpan * 0.62, [s, t] = coords(along, depthNear);
        put('box', unit, box, s, t, 0.46, Math.min(1.25, longSpan * 0.48), 0.9, 0.68, 0x87694e, true, spec, axis);
        for (let k = 0; k < 6; k++) {
          const [is, it] = coords(along - 0.45 + k * 0.18, depthNear);
          put('box', unit, box, is, it, 0.98, 0.12, 0.16 + random() * 0.08, 0.12, itemColors(), false, spec, axis);
        }
      }
      if (instanceCount === unitInstanceStart) {
        const fallbackSpec = { ...spec, frontAxis: null };
        const preferred = g.pois.filter((p) => signableName(p[2] || '') && String(p[2]).trim().toLowerCase() === String(unit.name || '').trim().toLowerCase() && insideShape(unit.rings, p[3], p[4]));
        const anchor = findSafeShopPoint(unit, box, fallbackSpec, alongIsS, longMin, longMax, depthMin, depthMax, longMid, depthMid, [], front, preferred);
        if (!anchor && fallbackDiagnostics.length < 12) {
          const center = localPoint(box, midS, midT);
          fallbackDiagnostics.push({ unitIndex: unit.unitIndex, name: unit.name, type, preferredPois: preferred.map((p) => pointDiagnostic(unit, p[3], p[4], box, longMin, longMax, depthMin, depthMax, alongIsS)), center: pointDiagnostic(unit, center.x, center.z, box, longMin, longMax, depthMin, depthMax, alongIsS) });
        }
        if (anchor) {
          fallbackUnitCount++;
          if (type === 'apparel') {
            const rackLength = Math.min(1.3, Math.max(0.7, longSpan * 0.45));
            putAlong('box', unit, box, anchor.along, anchor.depth, 0.18, rackLength, 0.12, 0.48, 0x4b5154, true, fallbackSpec, axis);
            putAlong('cylinder', unit, box, anchor.along - rackLength * 0.43, anchor.depth, 0.79, 0.07, 1.42, 0.07, 0x51575b, true, fallbackSpec, axis);
            putAlong('cylinder', unit, box, anchor.along + rackLength * 0.43, anchor.depth, 0.79, 0.07, 1.42, 0.07, 0x51575b, true, fallbackSpec, axis);
            putAlong('box', unit, box, anchor.along, anchor.depth, 1.48, rackLength, 0.055, 0.055, 0x6a7073, false, fallbackSpec, axis);
            for (let k = 0; k < 8; k++) {
              const along = anchor.along - rackLength * 0.42 + rackLength * 0.84 * (k + 0.5) / 8;
              putAlong('box', unit, box, along, anchor.depth, 1.07, Math.min(0.14, rackLength / 8 * 0.8), 0.64, 0.08, itemColors(), false, fallbackSpec, axis);
            }
            if (/shoe|鞋|locker/i.test(unit.name || unit.originalName || '')) {
              const shoe = findSafeShopPoint(unit, box, fallbackSpec, alongIsS, longMin, longMax, depthMin, depthMax, longMid, depthMid, [anchor], front, preferred);
              if (shoe) shelf(unit, box, fallbackSpec, shoe.along, shoe.depth, Math.min(longSpan, 2.0), Math.min(0.32, depthSpan * 0.3), random, 0x67584c, axis);
            }
            shopAnchors.push({ x: anchor.x, z: anchor.z, shelf: localPoint(box, ...(alongIsS ? [anchor.along, anchor.depth] : [anchor.depth, anchor.along])), axis: alongIsS ? box.ux : box.nx, unit });
          } else if (type === 'foodservice') {
            table(unit, box, fallbackSpec, anchor.along, anchor.depth, random, axis);
          } else {
            shelf(unit, box, fallbackSpec, anchor.along, anchor.depth, Math.min(longSpan, 2.0), Math.min(0.34, depthSpan * 0.3), random, 0x6c5d50, axis);
          }
        }
      }
      if (type !== 'foodservice' && !shopAnchors.some((q) => q.unit === unit)) {
        const [s, t] = coords(longMid, depthNear), [as, at] = coords(longMid, depthNear + (frontSign > 0 ? 0.72 : -0.72));
        const shelfPos = localPoint(box, s, t), stand = localPoint(box, as, at);
        if (insideShape(unit.rings, stand.x, stand.z)) shopAnchors.push({ x: stand.x, z: stand.z, shelf: shelfPos, axis: alongIsS ? box.ux : box.nx, unit });
      }
    }
    const putWorld = (unit, x, z, y, sx, sy, sz, tint, blocking = true, kind = 'box', axis = [1, 0]) => {
      if (!unit || !safePoint(unit, x, z, null, blocking) || instanceCount >= PROP_INSTANCE_CAP) return null;
      const tri = kind === 'box' ? 12 : 32; if (triangleEstimate + tri > PROP_TRIANGLE_CAP) return null;
      const row = { x, y, z, sx, sy, sz, axis, tint };
      batches[kind].push(row); instanceCount++; triangleEstimate += tri;
      if (blocking) collisions.push({ x, z, sx, sz, axis, rings: unit.rings, row, kind, tri });
      return { x, z };
    };
    for (const unit of unitPoints) {
      const box = orientedBounds(unit.rings); if (!box) continue;
      const alongS = box.length >= box.width, len = alongS ? box.length : box.width, wide = alongS ? box.width : box.length, axis = alongS ? [box.ux, box.uz] : [box.nx, box.nz];
      const min = alongS ? box.minS : box.minT, max = alongS ? box.maxS : box.maxT, d0 = alongS ? box.minT : box.minS, d1 = alongS ? box.maxT : box.maxS;
      const at = (a, d) => localPoint(box, alongS ? a : d, alongS ? d : a);
      const cellPointSafe = (p) => {
        const i = grid && grid.idxAt(p.x, p.z);
        return i >= 0 && !!grid.walkable[i] && publicAt(movementUnits, p.x, p.z) && safePoint(unit, p.x, p.z, null, true);
      };
      if (station && unit.cat === 'platform' && len >= 8 && wide >= 2.6) {
        const count = Math.max(1, Math.floor(len / 12));
        for (let i = 0; i < count; i++) {
          const p = at(min + len * (i + 0.5) / count, (d0 + d1) * 0.5);
          if (trackUnits.some((t) => shapeDistance(p.x, p.z, t.rings) < 1.5) || !cellPointSafe(p)) continue;
          putWorld(unit, p.x, p.z, 0.48, 1.6, 0.12, 0.42, 0x766b5d, true, 'box', axis);
        }
      }
      if (!station && PUBLIC_CATEGORIES.has(unit.cat) && len >= 16 && wide >= 4) {
        const count = Math.max(1, Math.floor(len / 15));
        for (let i = 0; i < count; i++) {
          const along = min + len * (i + 0.5) / count;
          for (const side of [-1, 1]) {
            const depth = side > 0 ? d1 - 0.82 : d0 + 0.82, p = at(along, depth);
            if (!cellPointSafe(p)) continue;
            if ((i + side) % 2 === 0) {
              putWorld(unit, p.x, p.z, 0.22, 0.82, 0.44, 0.82, 0x71614f, true, 'box', axis);
              putWorld(unit, p.x, p.z, 0.72, 0.65, 0.72, 0.65, 0x477354, false, 'box', axis);
            } else {
              putWorld(unit, p.x, p.z, 0.49, 1.2, 0.12, 0.42, 0x775d47, true, 'box', axis);
              putWorld(unit, p.x - axis[1] * 0.47, p.z + axis[0] * 0.47, 0.25, 0.09, 0.42, 0.09, 0x49433e, false, 'box', axis);
              putWorld(unit, p.x + axis[1] * 0.47, p.z - axis[0] * 0.47, 0.25, 0.09, 0.42, 0.09, 0x49433e, false, 'box', axis);
            }
          }
        }
      }
      if (station && ['walkway', 'lobby', 'unenclosedarea'].includes(unit.cat) && len >= 20) {
        const count = Math.max(1, Math.floor(len / 20));
        for (let i = 0; i < count; i++) {
          const along = min + len * (i + 0.5) / count, depth = i % 2 ? d1 - 0.38 : d0 + 0.38, p = at(along, depth);
          if (!cellPointSafe(p)) continue;
          putWorld(unit, p.x, p.z, 0.4, 0.38, 0.8, 0.38, 0x555b5e, true, 'cylinder', axis);
          const board = at(along + 2.0, depth);
          if (cellPointSafe(board)) {
            putWorld(unit, board.x, board.z, 1.55, 1.25, 1.55, 0.14, 0x23404a, false, 'box', axis);
            for (let k = 0; k < 4; k++) putWorld(unit, board.x - 0.38 + k * 0.25, board.z, 1.55, 0.16, 0.7, 0.025, [0x61a8be, 0xdd9854, 0x6e8f76, 0xcb6971][k], false, 'box', axis);
          }
        }
      }
    }
    let restoredPublicCells = 0, collisionCells = 0, afterReachable = publicBefore.reachable;
    let afterCells = publicBefore.reachableCells;
    if (grid) {
      for (const q of collisions) {
        const [ux, uz] = q.axis, nx = -uz, nz = ux, hx = q.sx * 0.5 + CS * 0.35, hz = q.sz * 0.5 + CS * 0.35;
        const rx = Math.abs(ux) * hx + Math.abs(nx) * hz, rz = Math.abs(uz) * hx + Math.abs(nz) * hz;
        const x0 = Math.max(0, Math.floor((q.x - rx - grid.x0) / CS)), x1 = Math.min(grid.nx - 1, Math.ceil((q.x + rx - grid.x0) / CS));
        const z0 = Math.max(0, Math.floor((q.z - rz - grid.z0) / CS)), z1 = Math.min(grid.nz - 1, Math.ceil((q.z + rz - grid.z0) / CS));
        const changed = [], publicChanged = [];
        for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
          const k = j * grid.nx + i; if (!grid.walkable[k]) continue;
          const x = grid.x0 + (i + 0.5) * CS - q.x, z = grid.z0 + (j + 0.5) * CS - q.z;
          if (Math.abs(x * ux + z * uz) <= hx && Math.abs(x * nx + z * nz) <= hz && (!q.rings || insideShape(q.rings, q.x + x, q.z + z))) {
            grid.walkable[k] = 0; changed.push(k); if (publicBefore.mask[k]) publicChanged.push(k);
          }
        }
        if (publicChanged.length) {
          for (const k of changed) grid.walkable[k] = 1;
          restoredPublicCells += publicChanged.length;
          const index = batches[q.kind].indexOf(q.row);
          if (index >= 0) { batches[q.kind].splice(index, 1); instanceCount--; triangleEstimate -= q.tri; }
        } else collisionCells += changed.length;
      }
      afterCells = publicBefore.reachableCells;
      afterReachable = publicBefore.reachable;
    }
    const reachability = { before: publicBefore.reachable, after: afterReachable, unchanged: afterReachable === publicBefore.reachable, collisionCells, restoredPublicCells };
    for (const kind of ['box', 'cylinder']) {
      const rows = batches[kind]; if (!rows.length) continue;
      const mesh = new THREE.InstancedMesh(assets.geometry[kind], assets.material[kind], rows.length), object = new THREE.Object3D();
      rows.forEach((q, i) => {
        object.position.set(q.x, q.y, q.z); object.scale.set(q.sx, q.sy, q.sz);
        object.rotation.y = Math.atan2(-q.axis[1], q.axis[0]); object.updateMatrix();
        mesh.setMatrixAt(i, object.matrix); mesh.setColorAt(i, new THREE.Color(q.tint));
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false; root.add(mesh);
      root.userData.ownedInstances = (root.userData.ownedInstances || []).concat(mesh);
    }
    const publicCells = grid ? [...afterCells] : [];
    return { shopStats, propStats: { total: instanceCount, triangles: triangleEstimate, shops: shopUnitCount, fallbackUnits: fallbackUnitCount, cap: PROP_INSTANCE_CAP, primitiveTypes: Object.fromEntries(Object.entries(batches).map(([k, v]) => [k, v.length])), fallbackDiagnostics },
      reachability, publicMask: publicBefore.mask, publicCells, publicStart: publicBefore.start, shopAnchors, foodAnchors, gateInfo };
  }
  function poiFasciaNames(g) {
    const names = new Map();
    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i], cat = unitKind(u), name = unitName(u), rings = unitRings(u);
      if ((!isShopLike(cat, name) && !(cat === 'unspecified' && !name)) || signableName(name)) continue;
      const center = centroid(rings), matches = g.pois.filter((p) => signableName(p[2] || '') && insideShape(rings, p[3], p[4]));
      if (matches.length) {
        matches.sort((a, b) => Math.hypot(a[3] - center.x, a[4] - center.z) - Math.hypot(b[3] - center.x, b[4] - center.z));
        names.set(i, matches[0][2].trim());
      }
    }
    return names;
  }
  function addRoutes(root, g, data) {
    if (!data.net) return;
    for (const loc of [2, 3]) {
      const P = [];
      for (const route of data.net.r) {
        if (route[1] !== loc) continue;
        const a = route[4];
        for (let k = 0; k + 5 < a.length; k += 3) {
          if (routeFloor(data, (a[k + 1] + a[k + 4]) / 2) !== g.o) continue;
          P.push(a[k], 0.055, a[k + 2], a[k + 3], 0.055, a[k + 5]);
        }
      }
      if (!P.length) continue;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      const line = new THREE.LineSegments(geo, loc === 3 ? M.line3 : M.line2); if (loc === 3) line.computeLineDistances(); line.frustumCulled = false; root.add(line);
    }
  }
  function buildFloor(r, g, start = { x: 0, z: 0 }) {
    if (!M) init();
    const showcase = showcaseForFloor(r, g);
    const stageMs = {};
    if (showcase) {
      const showcaseAssetsStart = performance.now();
      ensureShowcaseAssets();
      stageMs.showcaseAssets = Math.round((performance.now() - showcaseAssetsStart) * 10) / 10;
    }
    const t0 = performance.now(), root = new THREE.Group(), builders = new Map(), materials = M.assets.materials;
    let tp = t0;
    const mark = (k) => { const n = performance.now(); stageMs[k] = Math.round((n - tp) * 10) / 10; tp = n; };
    const builder = (key) => { let b = builders.get(key); if (!b) builders.set(key, b = vbNew()); return b; };
    const doorIndex = makeDoorIndex(g.doors.map((d) => linesOf(d[2]))), walls = [], unitPoints = [], frontRuns = [], poiNames = poiFasciaNames(g);
    const station = isStation(r), baseFloor = showcase ? 'mkShowcaseFloor' : station ? 'stationFloor' : 'mallFloor', publicUnits = publicUnitShapes(g, r.data), white = color('#ffffff');
    const movementUnits = station ? publicUnitShapes(g, r.data, true) : publicUnits;
    for (const rings of g.polys) builder(baseFloor).flat(rings, 0, white, true, 0.6);
    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i], cat = unitKind(u), originalName = unitName(u), name = signableName(originalName) ? originalName : poiNames.get(i) || originalName;
      const rings = unitRings(u), shop = isShopLike(cat, name), floorClass = floorMaterialClass(cat, station, name);
      const uvScale = floorClass === 'woodFloor' ? 1.2 : 0.6;
      builder(floorClass).flat(rings, 0.01, white, true, uvScale);
      if (!NO_WALL.has(cat) || shop) for (const ring of rings) wallBuild(builder, ring, Math.min(g.H, 3), white, doorIndex, walls, {
        wallClass: station ? 'stationWall' : 'plasterWall', showcase: !!showcase, shopLike: shop, publicUnits, frontRuns,
        unitIndex: i, category: cat, name, fasciaTint: color(UNIT_COLOR[cat] || '#6f777a')
      });
      const cp = centroid(rings); unitPoints.push({ u, unitIndex: i, cat, name, originalName, pos: cp, rings, shop, floorClass });
    }
    mark('units');
    for (const rings of g.polys) for (const ring of rings) wallBuild(builder, ring, g.H, white, doorIndex, walls,
      { wallClass: station ? 'stationWall' : 'plasterWall', showcase: !!showcase });
    for (const rings of g.polys) builder('ceiling').flat(rings, g.H, white, false, 0.6);
    mark('polyWalls');
    const grid = makeGrid(r, g, walls); g.walkable = !!(grid && grid.walkable.some((v) => v));
    mark('grid');
    addFacilityProps(builder, unitPoints, grid);
    mark('facility');
    const props = addMerchandise(root, r, g, unitPoints, frontRuns, grid, publicUnits, movementUnits, station, start, !!showcase);
    mark('merchandise');
    const showcaseStats = showcase ? addMongKokCShowcase(root, r, g, unitPoints, grid, props, showcase, builder, start) : null;
    mark('showcase');
    const gateStats = station ? addFareGates(builder, grid, r.data, g.o, props.gateInfo, showcase) : null;
    mark('gates');
    if (station) addPlatformStrips(builder, g, r.data);
    mark('platform');
    const lightCount = addCeilingLights(root, g, grid, publicUnits, showcase);
    mark('lights');
    if (showcaseStats) {
      showcaseStats.lights = lightCount;
      showcaseStats.gateIndicators = gateStats?.indicators || 0;
      showcaseStats.reachability = { ...props.reachability };
      root.userData.showcaseStats = showcaseStats;
    }
    const labels = addLabels(root, g, r.data, frontRuns, unitPoints, grid); addRoutes(root, g, r.data);
    mark('labels');
    for (const [key, b] of builders) if (b.triangles) {
      const mesh = new THREE.Mesh(b.geo(), materials[key]); mesh.frustumCulled = false; root.add(mesh);
    }
    mark('meshes');
    const routePoints = station ? routeWalkTargets(r.data, g, grid, props.publicCells, !!showcase) : [];
    mark('routePoints');
    root.traverse((o) => o.layers.set(1)); S.root.add(root);
    let tris = 0, drawCalls = 0; root.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes.position) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      if ((o.isMesh || o.isLineSegments) && !o.isSprite) drawCalls++;
    });
    mark('stats');
    return { root, grid, labels, unitPoints, H: g.H, triangles: Math.round(tris), drawCalls, buildMs: performance.now() - t0, stageMs, group: g, gateStats,
      shopStats: props.shopStats, propStats: props.propStats, reachability: props.reachability, publicMask: props.publicMask,
      publicCells: props.publicCells, shopAnchors: props.shopAnchors, foodAnchors: props.foodAnchors, routePoints, showcaseConfig: showcase, showcaseStats };
  }
  function routeWalkTargets(data, g, grid, reachableCells, useSpatialDedup = false) {
    if (!grid || !data || !data.net || !reachableCells) return [];
    const reachable = new Set(reachableCells);
    const out = [], buckets = useSpatialDedup ? new Map() : null, bucketSize = 0.7;
    for (const route of data.net.r || []) {
      if (route[1] !== 2 && route[1] !== 3) continue;
      const points = route[4] || [];
      for (let k = 0; k + 5 < points.length && out.length < 1200; k += 3) {
        const y0 = points[k + 1], y1 = points[k + 4];
        if (routeFloor(data, (y0 + y1) * 0.5) !== g.o) continue;
        const ax = points[k], az = points[k + 2], bx = points[k + 3], bz = points[k + 5], len = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d <= len; d += 2) {
          const x = ax + (bx - ax) * d / (len || 1), z = az + (bz - az) * d / (len || 1), i = grid.idxAt(x, z);
          let duplicate = false, bucketX = 0, bucketZ = 0;
          if (i >= 0 && grid.walkable[i] && reachable.has(i)) {
            if (buckets) {
              bucketX = Math.floor(x / bucketSize); bucketZ = Math.floor(z / bucketSize);
              for (let oz = -1; oz <= 1 && !duplicate; oz++) for (let ox = -1; ox <= 1 && !duplicate; ox++) {
                for (const q of buckets.get(`${bucketX + ox}:${bucketZ + oz}`) || []) {
                  if (Math.hypot(q.x - x, q.z - z) < 0.7) { duplicate = true; break; }
                }
              }
            } else duplicate = out.some((q) => Math.hypot(q.x - x, q.z - z) < 0.7);
            if (!duplicate) {
              const target = { x, z }; out.push(target);
              if (buckets) {
                const key = `${bucketX}:${bucketZ}`; let bucket = buckets.get(key);
                if (!bucket) buckets.set(key, bucket = []);
                bucket.push(target);
              }
            }
          }
          if (out.length >= 1200) break;
        }
      }
    }
    return out;
  }
  function ensureIndoorPeople() {
    if (S.peoplePool) return S.peoplePool;
    const PP = PEOPLE && PEOPLE.PP;
    if (!PP || !S.root) return null;
    const started = performance.now(), textureBefore = typeof renderer !== 'undefined' && renderer.info ? renderer.info.memory.textures : null;
    const root = new THREE.Group(), count = TOUCH ? 12 : 24, npcs = [];
    root.name = 'IND indoor crowd'; root.visible = false;
    for (let i = 0; i < count; i++) {
      const p = PP.make(i % PP.count), seed = ((i + 1) * 2654435761) >>> 0;
      p.root.visible = false; p.root.scale.setScalar(1.7 / PP.height * (0.92 + 0.14 * ((seed % 1000) / 1000)));
      p.actions.idle.reset().play();
      p.root.traverse((o) => o.layers.set(1));
      root.add(p.root);
      npcs.push({ p, id: i, seed, randomState: seed || 1, kind: 'walker', target: null, retargetTimer: 0, heroBlocked: false, shift: null, shiftTimer: 0, speed: 0.65 + (i % 5) * 0.12, anim: 'idle', anchor: null, visible: false });
    }
    S.root.add(root);
    const textureAfter = typeof renderer !== 'undefined' && renderer.info ? renderer.info.memory.textures : null;
    S.peoplePool = { root, npcs, count, createdMs: performance.now() - started, makeMsPerCharacter: (performance.now() - started) / Math.max(1, count),
      textureDelta: textureBefore === null || textureAfter === null ? null : textureAfter - textureBefore, assignments: null, spawnMetrics: null, error: null };
    return S.peoplePool;
  }
  function npcRandom(npc) {
    npc.randomState = (Math.imul(npc.randomState, 1664525) + 1013904223) >>> 0;
    return npc.randomState / 4294967296;
  }
  function setNpcAnimation(npc, name) {
    const actions = npc.p.actions, next = actions[name] || actions.walk, previous = actions[npc.anim];
    if (!next || npc.anim === name) return;
    npc.anim = name; next.reset().play(); if (previous && previous !== next) previous.crossFadeTo(next, 0.25, false);
  }
  function nearestWalkableInUnit(grid, x, z, rings, limit = 1.6) {
    if (!grid) return null;
    const radius = Math.ceil(limit / CS), i0 = Math.floor((x - grid.x0) / CS), j0 = Math.floor((z - grid.z0) / CS);
    let best = null, bd = limit * limit;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const i = i0 + dx, j = j0 + dz; if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) continue;
      const k = j * grid.nx + i; if (!grid.walkable[k]) continue;
      const px = grid.x0 + (i + 0.5) * CS, pz = grid.z0 + (j + 0.5) * CS;
      if (rings && !insideShape(rings, px, pz)) continue;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { x: px, z: pz, index: k }; }
    }
    return best;
  }
  function chooseNpcTarget(npc, floor, x, z) {
    const candidates = floor.routePoints.length ? floor.routePoints : floor.publicCells;
    if (!candidates.length) return null;
    let target = null;
    for (let attempt = 0; attempt < 36; attempt++) {
      const q = candidates[Math.floor(npcRandom(npc) * candidates.length)];
      const p = typeof q === 'number' ? { x: floor.grid.x0 + ((q % floor.grid.nx) + 0.5) * CS, z: floor.grid.z0 + (Math.floor(q / floor.grid.nx) + 0.5) * CS } : q;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d >= 8 && d <= 30) { target = p; break; }
    }
    if (!target) {
      let farthest = null, best = 0;
      for (const q of candidates) {
        const p = typeof q === 'number' ? { x: floor.grid.x0 + ((q % floor.grid.nx) + 0.5) * CS, z: floor.grid.z0 + (Math.floor(q / floor.grid.nx) + 0.5) * CS } : q;
        const d = Math.hypot(p.x - x, p.z - z); if (d > best && d >= 8 && d <= 30) { best = d; farthest = p; }
      }
      target = farthest;
    }
    return target;
  }
  function configureIndoorPeople() {
    const floor = S.floor;
    if (!S.inside || !floor || !floor.group || !floor.grid) { hideIndoorPeople(); return; }
    const pool = ensureIndoorPeople(); if (!pool) return;
    pool.root.visible = false; pool.spawnMetrics = null;
    for (const npc of pool.npcs) { npc.p.root.visible = false; npc.visible = false; npc.target = null; npc.shift = null; }
    if (!floor.publicCells.length) { pool.assignments = { walkers: 0, browsers: 0, patrons: 0 }; return; }
    const heroSpawn = { x: OPEN.hero.x, z: OPEN.hero.z };
    const facilityUnits = floor.unitPoints.filter((u) => ['elevator', 'stairs', 'escalator'].includes(u.cat));
    const inFacility = (p) => facilityUnits.some((u) => insideShape(u.rings, p.x, p.z));
    const validSpawn = (p) => p && Math.hypot(heroSpawn.x - p.x, heroSpawn.z - p.z) >= 3 && !inFacility(p);
    const showcasePlan = floor.showcaseStats?.npcPlan || null, showcaseMode = !!floor.showcaseConfig;
    const browserAnchors = floor.shopAnchors.filter((a) => signableName(a.unit.name)).map((a) => {
      const positions = [];
      for (const radius of [0.75, 1.15, 1.55, 1.95]) for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4, p = nearestWalkableInUnit(floor.grid, a.x + Math.cos(angle) * radius, a.z + Math.sin(angle) * radius, a.unit.rings, 0.55);
        if (validSpawn(p) && !positions.some((q) => q.index === p.index)) positions.push(p);
      }
      return positions.length ? { ...a, pos: positions[0], positions } : null;
    }).filter(Boolean);
    const tableAnchors = floor.foodAnchors.map((a) => {
      const rings = a.unit && a.unit.rings, positions = [];
      for (const radius of [0.85, 1.1, 1.35, 1.6]) for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4, p = nearestWalkableInUnit(floor.grid, a.x + Math.cos(angle) * radius, a.z + Math.sin(angle) * radius, rings, 0.55);
        if (validSpawn(p) && !positions.some((q) => q.index === p.index)) positions.push(p);
      }
      return positions.length ? { ...a, positions } : null;
    }).filter(Boolean);
    const publicCandidates = [], seenCells = new Set();
    for (const k of floor.publicCells) {
      if (seenCells.has(k)) continue;
      seenCells.add(k);
      const p = { x: floor.grid.x0 + ((k % floor.grid.nx) + 0.5) * CS, z: floor.grid.z0 + (Math.floor(k / floor.grid.nx) + 0.5) * CS, index: k };
      if (validSpawn(p)) publicCandidates.push(p);
    }
    const browserOptions = browserAnchors.flatMap((anchor) => anchor.positions.map((pos) => ({ anchor, pos })));
    const patronOptions = tableAnchors.flatMap((anchor) => anchor.positions.map((pos) => ({ anchor, pos })));
    const hasBrowsers = browserOptions.length > 0, hasPatrons = patronOptions.length > 0, n = pool.count;
    const plannedCount = showcaseMode ? Math.min(n, showcasePlan.length) : 0;
    const browserCount = showcaseMode ? 0 : hasBrowsers ? Math.round(n * 0.25) : 0;
    const patronCount = showcaseMode ? 0 : hasPatrons ? Math.round(n * 0.15) : 0;
    const walkerCount = showcaseMode ? n - plannedCount : n - browserCount - patronCount;
    const assignments = { walkers: 0, browsers: 0, patrons: 0, queues: 0, machines: 0, customers: 0, staff: 0, walls: 0,
      requested: { walkers: walkerCount, browsers: browserCount, patrons: patronCount, showcaseRoles: plannedCount }, unspawned: 0 };
    const spawns = [];
    const chooseSeparated = (options, npc) => {
      let bestDistance = -1, choices = [];
      for (const option of options) {
        const p = option.pos || option;
        if (!validSpawn(p)) continue;
        let distance = 1000;
        if (spawns.length) {
          distance = Infinity;
          for (const q of spawns) distance = Math.min(distance, Math.hypot(q.x - p.x, q.z - p.z));
        }
        if (distance < 1.5) continue;
        if (distance > bestDistance + 1e-6) { bestDistance = distance; choices = [option]; }
        else if (Math.abs(distance - bestDistance) <= 1e-6) choices.push(option);
      }
      return choices.length ? choices[Math.floor(npcRandom(npc) * choices.length)] : null;
    };
    for (let i = 0; i < n; i++) {
      const npc = pool.npcs[i], planned = showcaseMode && i < plannedCount ? showcasePlan[i] : null;
      const kind = showcaseMode ? 'walker' : i < walkerCount ? 'walker' : i < walkerCount + browserCount ? 'browser' : 'patron';
      let actualKind = kind, choice = null, yaw = null;
      if (planned) {
        const index = floor.grid.idxAt(planned.x, planned.z), unit = planned.unit == null ? null : floor.unitPoints.find((u) => u.unitIndex === planned.unit);
        const pos = { x: planned.x, z: planned.z, index };
        const publicRole = planned.role !== 'staff';
        const separated = spawns.every((q) => Math.hypot(q.x - pos.x, q.z - pos.z) >= 1.5);
        if (index >= 0 && floor.grid.walkable[index] && (!publicRole || floor.publicMask[index]) &&
            (!unit || insideShape(unit.rings, pos.x, pos.z)) && validSpawn(pos) && separated) {
          actualKind = planned.role; choice = { pos, role: planned.role }; yaw = planned.yaw;
        }
      }
      if (!choice) {
        actualKind = kind;
        choice = kind === 'browser' ? chooseSeparated(browserOptions, npc) : kind === 'patron' ? chooseSeparated(patronOptions, npc) : null;
      }
      if (choice && (actualKind === 'browser' || actualKind === 'patron')) npc.anchor = choice.anchor;
      else if (!choice || actualKind === 'walker') { if (actualKind !== 'walker') actualKind = 'walker'; npc.anchor = null; choice = chooseSeparated(publicCandidates, npc); }
      if (!choice) { npc.p.root.visible = false; npc.visible = false; assignments.unspawned++; continue; }
      const pos = choice.pos || choice;
      npc.kind = actualKind; npc.floor = floor; npc.heroBlocked = false; npc.shiftTimer = 2 + npcRandom(npc) * 7;
      npc.role = planned && actualKind !== 'walker' ? actualKind : null;
      npc.p.root.position.set(pos.x, 0, pos.z);
      if (yaw !== null) npc.p.root.rotation.y = yaw;
      else if (actualKind === 'browser' && npc.anchor) npc.p.root.rotation.y = Math.atan2(npc.anchor.shelf.x - pos.x, npc.anchor.shelf.z - pos.z);
      else if (actualKind === 'patron' && npc.anchor) npc.p.root.rotation.y = Math.atan2(npc.anchor.x - pos.x, npc.anchor.z - pos.z);
      else npc.p.root.rotation.y = npcRandom(npc) * Math.PI * 2;
      npc.p.root.visible = true; npc.visible = true; spawns.push(pos);
      const assignmentKey = actualKind === 'queue' ? 'queues' : actualKind === 'machine' ? 'machines' : actualKind === 'staff' ? 'staff' : `${actualKind}s`;
      assignments[assignmentKey]++;
      npc.target = actualKind === 'walker' ? chooseNpcTarget(npc, floor, pos.x, pos.z) : null; npc.retargetTimer = npc.target ? 0 : 2;
      setNpcAnimation(npc, actualKind === 'walker' && npc.target ? 'walk' : 'idle');
    }
    let minPairDistance = Infinity, minHeroDistance = Infinity;
    for (let i = 0; i < spawns.length; i++) {
      minHeroDistance = Math.min(minHeroDistance, Math.hypot(heroSpawn.x - spawns[i].x, heroSpawn.z - spawns[i].z));
      for (let j = i + 1; j < spawns.length; j++) minPairDistance = Math.min(minPairDistance, Math.hypot(spawns[i].x - spawns[j].x, spawns[i].z - spawns[j].z));
    }
    pool.assignments = assignments;
    pool.spawnMetrics = { floor: floor.group.o, visible: spawns.length, minPairDistance: Number.isFinite(minPairDistance) ? minPairDistance : null,
      minHeroDistance: Number.isFinite(minHeroDistance) ? minHeroDistance : null, facilityViolations: spawns.filter(inFacility).length };
    pool.root.visible = spawns.length > 0;
  }
  function hideIndoorPeople() {
    const pool = S.peoplePool; if (!pool) return;
    pool.root.visible = false; for (const npc of pool.npcs) { npc.p.root.visible = false; npc.visible = false; }
  }
  function updateIndoorPeople(dt) {
    const pool = S.peoplePool, floor = S.floor;
    if (!pool || !S.inside || !floor || !pool.root.visible) return;
    const hero = OPEN.hero, camPos = camera.position, frameDt = Math.min(0.08, Math.max(0, dt || 0));
    const crowdBlocked = (npc, x, z) => pool.npcs.some((other) => {
      if (!other.visible || other === npc) return false;
      const ox = other.p.root.position.x, oz = other.p.root.position.z;
      const currentDistance = Math.hypot(npc.p.root.position.x - ox, npc.p.root.position.z - oz);
      return Math.hypot(x - ox, z - oz) < 0.7 && Math.hypot(x - ox, z - oz) <= currentDistance;
    });
    for (const npc of pool.npcs) {
      if (!npc.visible) continue;
      const root = npc.p.root, x = root.position.x, z = root.position.z, cameraDistance = Math.hypot(camPos.x - x, camPos.z - z);
      root.visible = cameraDistance <= 45;
      if (!root.visible || cameraDistance > 35) continue;
      const heroDistance = Math.hypot(hero.x - x, hero.z - z);
      if (heroDistance <= 0.8) {
        setNpcAnimation(npc, 'idle'); npc.shift = null;
        if (!npc.heroBlocked && npc.kind === 'walker') { npc.target = chooseNpcTarget(npc, floor, x, z); npc.retargetTimer = npc.target ? 0 : 2; }
        npc.heroBlocked = true; npc.shiftTimer = 2 + npcRandom(npc) * 4; npc.p.mixer.update(frameDt); continue;
      }
      npc.heroBlocked = false;
      if (npc.kind === 'walker') {
        if (!npc.target) {
          npc.retargetTimer -= frameDt;
          if (npc.retargetTimer <= 0) { npc.target = chooseNpcTarget(npc, floor, x, z); npc.retargetTimer = npc.target ? 0 : 2; }
        } else if (Math.hypot(npc.target.x - x, npc.target.z - z) < 0.9) {
          npc.target = chooseNpcTarget(npc, floor, x, z); npc.retargetTimer = npc.target ? 0 : 2;
        }
        if (npc.target) {
          const dx = npc.target.x - x, dz = npc.target.z - z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, npc.speed * frameDt), nx = x + dx / d * step, nz = z + dz / d * step, idx = floor.grid.idxAt(nx, nz);
          if (Math.hypot(hero.x - nx, hero.z - nz) <= 0.8 || crowdBlocked(npc, nx, nz)) {
            npc.target = null; npc.retargetTimer = 0.35 + npcRandom(npc) * 0.45; setNpcAnimation(npc, 'idle');
          } else if (idx >= 0 && floor.grid.walkable[idx] && floor.publicMask[idx]) {
            root.position.set(nx, 0, nz); root.rotation.y = Math.atan2(dx, dz); setNpcAnimation(npc, 'walk');
          } else { npc.target = chooseNpcTarget(npc, floor, x, z); npc.retargetTimer = npc.target ? 0 : 2; setNpcAnimation(npc, npc.target ? 'walk' : 'idle'); }
        }
      } else if (npc.kind === 'browser') {
        npc.shiftTimer -= frameDt;
        if (!npc.shift && npc.shiftTimer <= 0 && npc.anchor) {
          const angle = npcRandom(npc) * Math.PI * 2, p = nearestWalkableInUnit(floor.grid, x + Math.cos(angle), z + Math.sin(angle), npc.anchor.unit.rings, 0.6);
          if (p && Math.hypot(p.x - x, p.z - z) > 0.55) npc.shift = p;
          npc.shiftTimer = 5 + npcRandom(npc) * 7;
        }
        if (npc.shift) {
          const dx = npc.shift.x - x, dz = npc.shift.z - z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, 0.45 * frameDt), nx = x + dx / d * step, nz = z + dz / d * step, idx = floor.grid.idxAt(nx, nz);
          if (d < 0.08) { npc.shift = null; setNpcAnimation(npc, 'idle'); }
          else if (idx >= 0 && floor.grid.walkable[idx] && Math.hypot(hero.x - nx, hero.z - nz) > 0.8 && !crowdBlocked(npc, nx, nz)) { root.position.set(nx, 0, nz); root.rotation.y = Math.atan2(npc.anchor.shelf.x - nx, npc.anchor.shelf.z - nz); setNpcAnimation(npc, 'walk'); }
          else { npc.shift = null; setNpcAnimation(npc, 'idle'); }
        } else setNpcAnimation(npc, 'idle');
      } else setNpcAnimation(npc, 'idle');
      npc.p.mixer.update(frameDt);
    }
  }
  function disposeFloor() {
    if (!S.floor) return;
    S.root.remove(S.floor.root);
    const geos = new Set(), mats = new Set(), textures = new Set(S.floor.root.userData.ownedTextures || []);
    S.floor.root.traverse((o) => { if (o.geometry && !o.isSprite && !o.isInstancedMesh) geos.add(o.geometry); });
    for (const g of S.floor.root.userData.ownedGeometries || []) geos.add(g);
    for (const g of geos) g.dispose();
    for (const inst of S.floor.root.userData.ownedInstances || []) if (inst.dispose) inst.dispose();
    for (const m of S.floor.root.userData.ownedMaterials || []) {
      mats.add(m);
      for (const value of Object.values(m)) if (value && value.isTexture) textures.add(value);
    }
    mats.forEach((m) => m.dispose());
    textures.forEach(disposeTexture);
    S.floor = null; S.goalObj = null;
  }
  function clearGoal() {
    if (S.goalObj) {
      const mats = new Set();
      S.goalObj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m)); else if (o.material) mats.add(o.material); });
      mats.forEach((m) => m.dispose());
      if (S.floor) S.floor.root.userData.ownedMaterials = (S.floor.root.userData.ownedMaterials || []).filter((m) => !mats.has(m));
      if (S.goalObj.parent) S.goalObj.parent.remove(S.goalObj);
    }
    S.goalObj = null; S.goal = null;
  }
  function addGoal() {
    if (!S.floor || !S.state || !S.state.v || !S.floor.group || !S.goal || S.goal.venue !== S.state.v.id || S.goal.o !== S.floor.group.o || S.goalObj) return;
    const g = new THREE.Group(), bm = new THREE.MeshBasicMaterial({ color: 0x3cff8a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }), rm = new THREE.MeshBasicMaterial({ color: 0x3cff8a });
    g.name = 'indoorDeliveryGoal';
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 4, 12, 1, true), bm);
    beam.position.y = 2; g.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 8, 24), rm);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; g.add(ring); g.position.set(S.goal.x, 0, S.goal.z); owned(g, 1); S.floor.root.add(g); S.goalObj = g;
    S.floor.root.userData.ownedMaterials = (S.floor.root.userData.ownedMaterials || []).concat(bm, rm);
  }
  function showFloor(r, g, x, z, h = Number.isFinite(OPEN.hero.h) ? OPEN.hero.h : 0) {
    hideIndoorPeople(); ensureIndoorPeople(); setShowcaseLighting(null); disposeFloor(); S.state = r; S.data = r.data; S.groups = r.groups;
    S.floor = buildFloor(r, g, { x, z }); S.root.visible = true; addGoal();
    setShowcaseLighting(S.floor.showcaseConfig);
    const p = nearestCell(S.floor.grid, x, z) || { x: x, z: z };
    place(p.x, p.z, h); S.paid = paidAt(p.x, p.z); configureIndoorPeople();
    return { ...p, walkable: !!(S.floor.grid && S.floor.grid.walkable[S.floor.grid.idxAt(p.x, p.z)]), buildMs: S.floor.buildMs,
      stageMs: S.floor.stageMs, triangles: S.floor.triangles, drawCalls: S.floor.drawCalls, gateStats: S.floor.gateStats, shopStats: S.floor.shopStats,
      propStats: S.floor.propStats, reachability: S.floor.reachability, showcase: S.floor.showcaseStats };
  }
  function place(x, z, h = OPEN.hero.h) {
    const H = OPEN.hero; H.x = x; H.z = z; H.y = 0; H.vy = 0; H.h = h;
    H.root.position.set(x, 0, z); H.root.rotation.y = h;
    cam.wx = x; cam.wz = z; cam.wyaw = h + Math.PI; cam.wpitch = 0.3;
  }
  function cameraLayers(on) { camera.layers.set(on ? 1 : 0); camera.near = on ? 0.1 : 0.5; camera.far = on ? 300 : 12000; camera.updateProjectionMatrix(); }
  function stationExit(k, x, z) {
    const list = OPEN.exits.filter((e) => e.e[0] === k); if (!list.length) return null;
    const X = x === undefined ? OPEN.hero.x : x, Z = z === undefined ? OPEN.hero.z : z;
    return list.reduce((best, e) => !best || Math.hypot(e.fx - X, e.fz - Z) < Math.hypot(best.fx - X, best.fz - Z) ? e : best, null);
  }
  function floorByOrdinal(r, o) { return r.groups.find((g) => g.o === o); }
  function floorByElevation(r, y) {
    const delta = (g) => Math.min(...g.levels.map((q) => Math.abs(q.l.z - y)));
    return r.groups.reduce((a, b) => delta(b) < delta(a) ? b : a);
  }
  function paidAt(x, z) {
    if (!S.floor || !isStation(S.state)) return false;
    const i = S.floor.grid.idxAt(x, z); return i >= 0 && !!S.floor.grid.paid[i];
  }
  function canMove(x, z) {
    if (!S.inside || !S.floor) return false;
    const i = S.floor.grid.idxAt(x, z);
    if (i < 0 || !S.floor.grid.walkable[i]) return true;
    if (isStation(S.state)) {
      const toPaid = !!S.floor.grid.paid[i];
      if (!S.paid && toPaid) {
        if (OPEN.money < FARE) {
          if (performance.now() - S.notice > 1100) { S.notice = performance.now(); OPEN.big('八達通唔夠錢（要 $5）', '#ff765e'); OPEN.beep(420, 0.16, 'square', 0.06); setTimeout(() => OPEN.beep(420, 0.16, 'square', 0.06), 220); }
          return true;
        }
        OPEN.addMoney(-FARE, 'mtr'); S.paid = true; OPEN.big('嘟！八達通 −$5', '#ffd23f'); OPEN.beep(1050, 0.12, 'sine', 0.09);
      } else if (S.paid && !toPaid) { S.paid = false; OPEN.beep(1050, 0.1, 'sine', 0.07); }
    }
    return false;
  }
  function walk(x, z) {
    if (!S.inside || !S.floor) return OPEN.solid(x, z);
    const i = S.floor.grid.idxAt(x, z); return i < 0 || !S.floor.grid.walkable[i];
  }
  function foot(x, z) { return S.inside ? walk(x, z) : OPEN.solid(x, z); }
  function gridWalkable(x, z) { const i = S.floor && S.floor.grid.idxAt(x, z); return !!(i >= 0 && S.floor.grid.walkable[i]); }
  function nearestDoorEntry(r, x, z) {
    let best = null, bd = Infinity; for (const e of getEntries(r)) { const d = Math.hypot(x - e.out.x, z - e.out.z); if (d < bd) { bd = d; best = e; } }
    return best ? { entry: best, d: bd } : null;
  }
  function nearUnit(types, limit = 1.2) {
    if (!S.floor) return null; let best = null, bd = limit;
    for (const v of S.floor.unitPoints) {
      if (!types.includes(v.cat)) continue;
      const inside = insideShape(unitRings(v.u), OPEN.hero.x, OPEN.hero.z), d = Math.hypot(v.pos.x - OPEN.hero.x, v.pos.z - OPEN.hero.z);
      if (inside || d < bd) { bd = inside ? 0 : d; best = v; }
    }
    return best;
  }
  function nearPlatform() {
    if (!S.floor || !S.paid) return false;
    return S.floor.unitPoints.some((v) => v.cat === 'platform' && (insideShape(unitRings(v.u), OPEN.hero.x, OPEN.hero.z) || Math.hypot(v.pos.x - OPEN.hero.x, v.pos.z - OPEN.hero.z) < 1.2));
  }
  function currentNear() {
    if (!S.inside) {
      let best = null, bd = 2.5;
      for (const r of records) if (!isStation(r) && r.data) {
        const q = nearestDoorEntry(r, OPEN.hero.x, OPEN.hero.z);
        if (q && q.d < bd) { best = { type: 'enter', r, entry: q.entry }; bd = q.d; }
      }
      const mission = OPEN.mission;
      if (best && mission && mission.indoor && mission.indoor.venue !== best.r.v.id) return null;
      return best;
    }
    if (!S.floor || !S.floor.group || !S.state || !S.groups) return null;
    const o = S.floor.group.o, max = Math.max(...S.groups.map((g) => g.o));
    if (isStation(S.state) && o === max && !S.paid && nearUnit(['stairs', 'escalator', 'elevator'])) return { type: 'stationExit' };
    if (nearPlatform()) return { type: 'board' };
    if (o === 0) {
      let best = null, bd = 1.5;
      for (const e of getEntries(S.state)) {
        const x = e.mid.x - e.nx * 0.8, z = e.mid.z - e.nz * 0.8, d = Math.hypot(OPEN.hero.x - x, OPEN.hero.z - z);
        if (d < bd) { best = e; bd = d; }
      }
      if (best) return { type: 'leave', entry: best };
    }
    const lift = nearUnit(['elevator']); if (lift) return { type: 'lift', unit: lift };
    const stairs = nearUnit(['stairs', 'escalator']); if (stairs) return { type: 'stairs', unit: stairs };
    return null;
  }
  function prompt() {
    if (S.busy) return null; const n = currentNear(); if (!n) return null;
    if (n.type === 'enter') return [TOUCH ? `撳「入去」：入${n.r.v.tc}` : `E 入${n.r.v.tc}`, '入去'];
    if (n.type === 'leave') return [TOUCH ? '撳「出去」' : 'E 出去', '出去'];
    if (n.type === 'lift') return [TOUCH ? '撳「升降機」揀樓層' : 'E 搭升降機', '升降機'];
    if (n.type === 'stairs') return [TOUCH ? '撳「樓梯」上落一層' : 'E 上落樓層', '樓梯'];
    if (n.type === 'board') return [TOUCH ? '撳「搭地鐵」' : 'E 搭地鐵', '搭地鐵'];
    return [TOUCH ? '撳「出站」' : 'E 出站', '出站'];
  }
  const fade = (v) => { $('ofade').style.opacity = v ? 1 : 0; };
  function begin(type, target) { S.busy = true; S.phase = type; S.target = target; S.t = 0.28; fade(1); OPEN.beep(720, 0.1); }
  function indoorBackground(on) {
    if (on) {
      if (!S.hasSavedBackground) { S.savedBackground = scene.background; S.hasSavedBackground = true; }
      scene.background = new THREE.Color(0x292c32);
      if (M && !S.savedLighting) S.savedLighting = { hemi: M.hemi.intensity, sun: M.sun.intensity };
      if (M) { M.hemi.intensity = 1; M.sun.intensity = 0.35; }
    } else if (S.hasSavedBackground) {
      scene.background = S.savedBackground; S.savedBackground = null; S.hasSavedBackground = false;
    }
    if (!on && M && S.savedLighting) {
      M.hemi.intensity = S.savedLighting.hemi; M.sun.intensity = S.savedLighting.sun; S.savedLighting = null;
    }
  }
  function doEnter(r, entry) {
    const zero = floorByOrdinal(r, 0) || r.groups[0]; if (!zero) return;
    if (!S.root) init();
    S.inside = true; S.state = r; S.data = r.data; S.groups = r.groups; indoorBackground(true); cameraLayers(true); S.root.visible = true;
    showFloor(r, zero, entry.mid.x - entry.nx * 4.2, entry.mid.z - entry.nz * 4.2, Math.atan2(-entry.nx, -entry.nz));
    S.paid = false; OPEN.big(`${r.v.tc} ${zero.name}`, '#ffd98a');
  }
  function networkSpawn(r, e) {
    let best = null, bd = Infinity;
    const ex = e.e[2] - D.origin[0], ez = D.origin[1] - e.e[3];
    for (const q of (r.data.net && r.data.net.r) || []) if (q[1] === 2) {
      const a = q[4]; for (let i = 0; i + 2 < a.length; i += 3) {
        const d = Math.hypot(a[i] - ex, a[i + 2] - ez);
        if (d < bd) {
          bd = d;
          const neighbors = [i - 3, i + 3].filter((j) => j >= 0 && j + 2 < a.length).sort((j, k) => Math.hypot(a[k] - ex, a[k + 2] - ez) - Math.hypot(a[j] - ex, a[j + 2] - ez));
          const j = neighbors[0] === undefined ? i : neighbors[0];
          best = { x: a[i], y: a[i + 1], z: a[i + 2], h: Math.atan2(a[j] - a[i], a[j + 2] - a[i + 2]) };
        }
      }
    }
    return best;
  }
  function doStationEntry(r, e) {
    const p = networkSpawn(r, e); if (!p) { OPEN.big('搵唔到站內通道', '#ff765e'); return; }
    const g = floorByElevation(r, p.y); if (!g) return;
    if (!S.root) init();
    S.inside = true; S.state = r; S.data = r.data; S.groups = r.groups; indoorBackground(true); cameraLayers(true); S.root.visible = true;
    showFloor(r, g, p.x, p.z, p.h); S.paid = false; OPEN.big(`${r.v.tc} ${g.name}`, '#ffd98a');
  }
  function doLeave(entry) {
    hideIndoorPeople(); setShowcaseLighting(null); clearGoal(); disposeFloor(); S.inside = false; S.state = null; S.data = null; S.groups = null; S.paid = false; S.root.visible = false; indoorBackground(false); cameraLayers(false); $('indLift').hidden = true; $('indStair').hidden = true; S.menu = false;
    if (entry) place(entry.out.x, entry.out.z, Math.atan2(entry.nx, entry.nz));
    else { const q = S.target && S.target.entry; if (q) place(q.out.x, q.out.z, Math.atan2(q.nx, q.nz)); }
    fade(0);
  }
  function doFloor(target) {
    if (!target || !S.state) return;
    const g = floorByOrdinal(S.state, target.o); if (!g) return;
    if (!groupWalkable(S.state, g)) { OPEN.big('呢層入唔到', '#ff765e'); return; }
    showFloor(S.state, g, target.x, target.z); OPEN.big(`${S.state.v.tc} ${g.name}`, '#ffd98a'); OPEN.beep(1180, 0.22);
  }
  function step(dt) {
    S.resourceTimer -= dt;
    if (S.resourceTimer <= 0) { S.resourceTimer = 0.4; syncResources(); }
    if (!S.inside) {
      const x = OPEN.hero.x, z = OPEN.hero.z;
      for (const r of records) if (!r.data && bboxDist(r.v.bb, x, z) <= 150) load(r).catch(() => {});
    }
    updateIndoorPeople(dt);
    if (!S.phase) { refreshPanels(); return; }
    if ((S.t -= dt) > 0) return;
    const phase = S.phase, target = S.target; S.phase = null;
    if (phase === 'enter') doEnter(target.r, target.entry);
    else if (phase === 'station') doStationEntry(target.r, target.exit);
    else if (phase === 'floor') doFloor(target);
    else if (phase === 'leave') doLeave(target.entry);
    fade(0); S.busy = false; S.target = null; refreshPanels();
  }
  function refreshPanels() {
    if (!S.inside || S.busy || !S.floor || !S.floor.group || !S.state || !S.groups) {
      $('indStair').hidden = true; $('indLift').hidden = true; return;
    }
    const q = nearUnit(['stairs', 'escalator']), lift = nearUnit(['elevator']);
    $('indStair').hidden = !q;
    if (q) {
      $('indStairT').textContent = q.cat === 'escalator' ? '扶手電梯' : '樓梯';
      const o = S.floor.group.o, down = floorByOrdinal(S.state, o - 1), up = floorByOrdinal(S.state, o + 1);
      const canDown = !!down && groupWalkable(S.state, down), canUp = !!up && groupWalkable(S.state, up);
      $('indDown').hidden = !canDown; $('indUp').hidden = !canUp;
      $('indDown').onclick = () => changeByUnit(q, o - 1); $('indUp').onclick = () => changeByUnit(q, o + 1);
    }
    if (!lift && !S.menu) $('indLift').hidden = true;
  }
  function changeByUnit(source, ordinal) {
    if (!S.inside || !S.floor || !S.floor.group || !S.state || !S.groups) return;
    const g = floorByOrdinal(S.state, ordinal); if (!g) return;
    if (!groupWalkable(S.state, g)) { OPEN.big('呢層入唔到', '#ff765e'); return; }
    const options = g.units.filter((u) => ['stairs', 'escalator'].includes(unitKind(u))).map((u) => ({ u, p: centroid(unitRings(u)) }));
    let p = options.sort((a, b) => Math.hypot(a.p.x - source.pos.x, a.p.z - source.pos.z) - Math.hypot(b.p.x - source.pos.x, b.p.z - source.pos.z))[0];
    if (!p) p = { p: { x: OPEN.hero.x, z: OPEN.hero.z } };
    $('indStair').hidden = true; begin('floor', { o: ordinal, x: p.p.x, z: p.p.z });
  }
  function openLift(unit) {
    if (!unit || !S.inside || !S.floor || !S.floor.group || !S.state || !S.groups) return;
    const floors = [];
    for (const g of S.groups) {
      const lifts = g.units.filter((u) => unitKind(u) === 'elevator').map((u) => centroid(unitRings(u)));
      if (lifts.some((p) => Math.hypot(p.x - unit.pos.x, p.z - unit.pos.z) <= 3) && groupWalkable(S.state, g)) floors.push(g);
    }
    const list = floors.length ? floors : S.groups.filter((g) => groupWalkable(S.state, g));
    $('indLiftL').innerHTML = list.slice().sort((a, b) => b.o - a.o).map((g) => `<button data-o="${g.o}" class="${g.o === S.floor.group.o ? 'here' : ''}">${g.name}<small>${g.o === 0 ? 'G/F・出入口' : `樓層 ${g.o}`}</small></button>`).join('');
    for (const b of $('indLiftL').querySelectorAll('button')) b.onclick = () => {
      if (!S.inside || !S.floor || !S.floor.group || !S.state || !S.groups) return;
      const o = +b.dataset.o; if (o === S.floor.group.o) return;
      const g = floorByOrdinal(S.state, o); if (!g || !groupWalkable(S.state, g)) { OPEN.big('呢層入唔到', '#ff765e'); return; }
      const u = g.units.filter((q) => unitKind(q) === 'elevator').map((q) => centroid(unitRings(q))).sort((a, c) => Math.hypot(a.x - unit.pos.x, a.z - unit.pos.z) - Math.hypot(c.x - unit.pos.x, c.z - unit.pos.z))[0];
      const p = u || unit.pos; $('indLift').hidden = true; S.menu = false; begin('floor', { o, x: p.x, z: p.z });
    };
    S.menu = true; S.busy = true; $('indLift').hidden = false; $('oprompt').hidden = true;
  }
  function act() {
    if (S.busy) return true;
    const n = currentNear(); if (!n) return false;
    if (n.type === 'enter') { begin('enter', { r: n.r, entry: n.entry }); return true; }
    if (n.type === 'leave') { begin('leave', { entry: n.entry }); return true; }
    if (n.type === 'lift') { openLift(n.unit); return true; }
    if (n.type === 'stairs') { refreshPanels(); return true; }
    if (n.type === 'board') {
      const k = [...stationVenue].find(([, r]) => r === S.state); const exit = k && stationExit(k[0], OPEN.hero.x, OPEN.hero.z);
      if (exit) OPEN.openMetro(exit, true, true); return true;
    }
    if (n.type === 'stationExit') {
      const k = [...stationVenue].find(([, r]) => r === S.state), exit = k && stationExit(k[0], OPEN.hero.x, OPEN.hero.z);
      if (exit) OPEN.ride(exit, true, true); return true;
    }
    return false;
  }
  function forceLeave() {
    if (!S.inside) return;
    if (!S.floor || !S.floor.group || !S.state || !S.groups) { leave(true); return; }
    if (isStation(S.state)) {
      if (S.paid) { OPEN.big('已入閘：請先行出閘再出站', '#ffca54'); return; }
      const k = [...stationVenue].find(([, r]) => r === S.state), exit = k && stationExit(k[0], OPEN.hero.x, OPEN.hero.z);
      if (exit) { OPEN.ride(exit, true, true); return; }
      OPEN.big('搵唔到車站出口', '#ff765e'); return;
    }
    const entries = getEntries(S.state), e = entries.reduce((best, q) => !best || Math.hypot(q.out.x - OPEN.hero.x, q.out.z - OPEN.hero.z) < Math.hypot(best.out.x - OPEN.hero.x, best.out.z - OPEN.hero.z) ? q : best, null);
    if (e) { $('indLift').hidden = true; $('indStair').hidden = true; begin('leave', { entry: e }); }
    else OPEN.big('暫時搵唔到可用出口', '#ff765e');
  }
  function leave(hard = false) {
    if (!S.inside && !S.phase) return;
    if (hard) {
      hideIndoorPeople(); setShowcaseLighting(null); clearGoal(); disposeFloor(); S.inside = false; S.state = null; S.data = null; S.groups = null; S.phase = null; S.busy = false; S.menu = false;
      if (S.root) S.root.visible = false; indoorBackground(false); $('indLift').hidden = true; $('indStair').hidden = true; fade(0); cameraLayers(false); return;
    }
    forceLeave();
  }
  function camera3(pitch) {
    if (!S.floor) return;
    const p = clamp(pitch, -0.1, 0.62), d = innerWidth < innerHeight ? 3.6 : 3.2, hy = 1.55, offsets = [0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9];
    let best = { t: -1, offset: 0 };
    for (const offset of offsets) {
      const yaw = cam.wyaw + offset, fx = Math.sin(yaw) * Math.cos(p), fz = Math.cos(yaw) * Math.cos(p), fy = Math.sin(p);
      let t = 0;
      for (let k = 1; k <= 24; k++) {
        const s = d * k / 24, y = hy + fy * s;
        if (y < 0.25 || y > S.floor.H - 0.22 || walk(OPEN.hero.x + fx * s, OPEN.hero.z + fz * s)) break;
        t = s;
      }
      if (t > best.t + 0.01 || (Math.abs(t - best.t) <= 0.01 && Math.abs(offset) < Math.abs(best.offset))) best = { t, offset };
      if (best.t >= d - 0.14) break;
    }
    const yaw = cam.wyaw + best.offset, fx = Math.sin(yaw) * Math.cos(p), fz = Math.cos(yaw) * Math.cos(p), fy = Math.sin(p), t = Math.max(0, best.t - 0.16);
    const x = OPEN.hero.x + fx * t, z = OPEN.hero.z + fz * t;
    let y = clamp(hy + fy * t, 0.25, S.floor.H - 0.22);
    if (best.t < 0.75) y = Math.min(S.floor.H - 0.22, Math.max(y, hy + 1.15));
    camera.position.set(x, y, z); camera.lookAt(OPEN.hero.x, hy, OPEN.hero.z);
    if (S.floor.labels) {
      const hx = OPEN.hero.x, hz = OPEN.hero.z, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (const q of S.floor.labels.userData.labels) {
        const dx = q.position.x - hx, dz = q.position.z - hz, x = q.position.x - cx, y = q.position.y - cy, z = q.position.z - cz;
        q.visible = dx * dx + dz * dz <= 625 && x * x + y * y + z * z >= 3.24;
      }
    }
  }
  function label() { return S.inside && S.floor && S.floor.group && S.state && S.state.v ? `📍 ${S.state.v.tc} ${S.floor.group.name}<small>${S.state.v.en}</small>` : ''; }
  function hint() {
    if (S.inside) {
      if (!S.floor || !S.floor.group || !S.state || !S.state.v) return '<span class="ogo ind-ogo">🚪 出返街</span>';
      return `<b>${S.state.v.tc} ${S.floor.group.name}</b><br>${S.state.v.en}<br>行去升降機／樓梯轉樓層<br><span class="ogo ind-ogo">🚪 出返街</span>`;
    }
    let best = null, bd = 1e9;
    for (const r of records) if (r.data && !isStation(r)) { const q = nearestDoorEntry(r, OPEN.hero.x, OPEN.hero.z); if (q && q.d < bd) { best = { r, q }; bd = q.d; } }
    return best ? `<br>🏢 ${best.r.v.tc}（${Math.round(bd)} 米）` : '';
  }
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest && e.target.closest('.ind-ogo'); if (!t || !OPEN.active || OPEN.inCar) return;
    e.stopPropagation(); e.preventDefault(); if (S.inside) forceLeave();
    else { const n = currentNear(); if (n && n.type === 'enter') act(); }
  }, true);
  function map(ctx, cx, cz) {
    if (!S.inside || !S.floor || !S.floor.group || !S.state || !S.data) {
      let best = null, bd = Infinity;
      for (const r of records) if (r.data && !isStation(r)) for (const m of r.markers || []) { const d = Math.hypot(m.entry.out.x - cx, m.entry.out.z - cz); if (d < bd) { bd = d; best = m.entry; } }
      if (best) { let dx = (best.out.x - cx) * (150 / 250), dz = (best.out.z - cz) * (150 / 250), l = Math.hypot(dx, dz); if (l > 136) { dx *= 136 / l; dz *= 136 / l; }
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(150 + dx, 150 + dz, 8, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); }
      return;
    }
    const K = 150 / 70, P = (x, z) => [150 + (x - cx) * K, 150 + (z - cz) * K];
    ctx.fillStyle = '#191b20'; ctx.fillRect(0, 0, 300, 300);
    const shape = (rings, fill, stroke) => {
      const rs = ringsOf(rings); if (!rs.length) return; ctx.beginPath();
      rs.forEach((rr) => { const p = point(rr); p.forEach((q, i) => { const [x, z] = P(q[0], q[1]); i ? ctx.lineTo(x, z) : ctx.moveTo(x, z); }); ctx.closePath(); });
      if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };
    for (const p of S.floor.group.polys) shape(p, '#4b515e', '#89909a');
    for (const v of S.floor.unitPoints) {
      if (v.cat === 'room' || v.cat === 'foodservice') shape(unitRings(v.u), 'rgba(28,31,39,.66)');
      if (v.cat === 'platform') shape(unitRings(v.u), 'rgba(44,150,92,.64)');
      const [x, z] = P(v.pos.x, v.pos.z);
      if (v.cat === 'elevator') { ctx.fillStyle = '#47ff98'; ctx.fillRect(x - 4, z - 4, 8, 8); }
      if (v.cat === 'stairs' || v.cat === 'escalator') { ctx.fillStyle = '#ffd43b'; ctx.fillRect(x - 3, z - 3, 6, 6); }
    }
    if (!isStation(S.state) && S.floor.group.o === 0) for (const e of getEntries(S.state)) {
      const [x, z] = P(e.out.x, e.out.z); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x, z, 4, 0, 7); ctx.fill();
    }
    if (S.data.net) {
      for (const route of S.data.net.r) {
        const p = route[4]; ctx.beginPath();
        for (let i = 0; i + 5 < p.length; i += 3) if (routeFloor(S.data, (p[i + 1] + p[i + 4]) / 2) === S.floor.group.o) {
          const a = P(p[i], p[i + 2]), b = P(p[i + 3], p[i + 5]); ctx.moveTo(...a); ctx.lineTo(...b);
        }
        ctx.strokeStyle = route[1] === 3 ? '#ff9f2e' : '#36baff'; ctx.lineWidth = 1.5; ctx.setLineDash(route[1] === 3 ? [4, 3] : []); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (S.goal && S.goal.venue === S.state.v.id && S.goal.o === S.floor.group.o) {
      const [x, z] = P(S.goal.x, S.goal.z); ctx.fillStyle = '#3cff8a'; ctx.beginPath(); ctx.arc(x, z, 5, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  }
  function setGoal(p) {
    if (!p) { clearGoal(); return; }
    clearGoal(); S.goal = p; addGoal();
  }
  function stationForIndex(k) { return stationVenue.get(k) || null; }
  function hasStation(k) { return !!stationForIndex(k); }
  async function enterStation(exit) {
    if (window.FREEFIGHT && FREEFIGHT.stars) { FREEFIGHT.noMetro(); return false; }
    const r = stationForIndex(exit.e[0]); if (!r) return false;
    try { await load(r); } catch (e) { return false; }
    OPEN.closeMetro(); begin('station', { r, exit }); return true;
  }
  function platformCenter(u) {
    const rings = unitRings(u).map(point).filter((p) => p.length);
    if (!rings.length) return null;
    let areaTotal = 0, xTotal = 0, zTotal = 0, outer = null;
    rings.forEach((p, ri) => {
      let twiceArea = 0, cx = 0, cz = 0, xMean = 0, zMean = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], cross = a[0] * b[1] - b[0] * a[1];
        twiceArea += cross; cx += (a[0] + b[0]) * cross; cz += (a[1] + b[1]) * cross; xMean += a[0]; zMean += a[1];
      }
      const area = Math.abs(twiceArea) * 0.5, center = Math.abs(twiceArea) > 1e-9
        ? { x: cx / (3 * twiceArea), z: cz / (3 * twiceArea) }
        : { x: xMean / p.length, z: zMean / p.length };
      if (!ri) outer = { ...center, area };
      const weight = ri ? -area : area;
      areaTotal += weight; xTotal += center.x * weight; zTotal += center.z * weight;
    });
    if (Math.abs(areaTotal) < 1e-9) return outer;
    return { x: xTotal / areaTotal, z: zTotal / areaTotal, area: Math.abs(areaTotal) };
  }
  async function arriveStation(k) {
    if (window.FREEFIGHT && FREEFIGHT.stars) return false;
    const r = stationForIndex(k); if (!r) return false;
    try { await load(r); } catch (e) { return false; }
    const isPlatform = (u) => (r.data.cats[u[1]] || '') === 'platform' || /月台|platform/i.test(unitName(u));
    let best = null;
    for (const g of r.groups) {
      if (!groupWalkable(r, g)) continue;
      const units = g.units.filter(isPlatform);
      if (units.length && (!best || units.length > best.units.length)) best = { g, units };
    }
    if (!best) return false;
    const platforms = best.units.map((u) => platformCenter(u)).filter(Boolean).sort((a, b) => b.area - a.area);
    if (!platforms.length) return false;
    if (!S.root) init();
    S.inside = true; S.state = r; S.data = r.data; S.groups = r.groups; indoorBackground(true); cameraLayers(true);
    S.phase = null; S.busy = false; S.menu = false; $('indLift').hidden = true; $('indStair').hidden = true;
    let tries = 1, spawn = showFloor(r, best.g, platforms[0].x, platforms[0].z), first = { x: spawn.x, z: spawn.z };
    if (!S.paid) {
      let paid = false;
      for (const p of platforms.slice(1, 5)) {
        tries++;
        spawn = showFloor(r, best.g, p.x, p.z);
        if (S.paid) { paid = true; break; }
      }
      if (!paid) showFloor(r, best.g, first.x, first.z);
    }
    S.arrival = { k, venue: r.v.en, ordinal: best.g.o, x: OPEN.hero.x, z: OPEN.hero.z, paid: S.paid, tries };
    OPEN.big(`${r.v.tc} 月台`, '#ffd98a');
    return true;
  }
  async function pickDelivery(from) {
    const choices = records.map((r) => {
      const c = r.v.outline && r.v.outline.length ? centroid(r.v.outline) : { x: (r.v.bb[0] + r.v.bb[2]) / 2, z: (r.v.bb[1] + r.v.bb[3]) / 2 };
      return { r, d: Math.hypot(c.x - from.x, c.z - from.z) };
    }).filter((q) => q.d >= 150 && q.d <= 700).sort(() => Math.random() - 0.5);
    let loads = 0;
    for (const q of choices) {
      const r = q.r;
      if (!r.data && !r.promise) { if (loads >= 3) break; loads++; }
      r.picking = true;
      try { await load(r); } catch (e) { r.picking = false; continue; }
      if (!r.data.pois.length) { r.picking = false; continue; }
      const entries = isStation(r) ? null : getEntries(r);
      const station = isStation(r) ? [...stationVenue].find(([, v]) => v === r) : null;
      const outside = isStation(r) ? station && stationExit(station[0], from.x, from.z) : entries && entries.reduce((a, b) => !a || Math.hypot(b.out.x - from.x, b.out.z - from.z) < Math.hypot(a.out.x - from.x, a.out.z - from.z) ? b : a, null);
      if (!outside) { r.picking = false; continue; }
      const named = r.data.pois.filter((p) => p[2] && !['商店', '餐廳', '電影院', '熟食檔', 'empty'].includes(p[2]));
      if (!named.length && r.v.en !== 'Pioneer Centre') { r.picking = false; continue; }
      const list = named.length ? named : r.data.pois.filter((p) => p[2] && p[2] !== 'empty');
      if (!list.length) { r.picking = false; continue; }
      const poi = list[Math.floor(Math.random() * list.length)], l = r.data.levels[poi[0]], group = floorByOrdinal(r, l.o);
      if (!group) { r.picking = false; continue; }
      const x = isStation(r) ? outside.fx : outside.out.x, z = isStation(r) ? outside.fz : outside.out.z;
      r.picking = false;
      S.lastPickLoads = loads;
      return { venue: r, poi, o: l.o, floor: group.name, x: poi[3], z: poi[4], outside: { x, z }, stationExit: isStation(r) ? outside : null, distance: q.d };
    }
    S.lastPickLoads = loads;
    return null;
  }
  function setForceFood() { S.forceFood = true; }
  function testGoto(id, o) {
    const r = byId.get(id) || records.find((q) => q.v.file.includes(id) || q.v.en === id || q.v.tc === id);
    if (!r) throw new Error('IND test venue not found: ' + id);
    return load(r).then(() => {
      const g = floorByOrdinal(r, o); if (!g) throw new Error('IND test floor not found: ' + o);
      if (!groupWalkable(r, g)) return { id: r.v.id, venue: r.v.en, ordinal: g.o, name: g.name, walkable: false, skipped: true, buildMs: 0, stageMs: null, triangles: 0, drawCalls: 0, floors: r.groups.length };
      if (!S.root) init();
      if (S.inside) { hideIndoorPeople(); disposeFloor(); S.root.visible = false; }
      S.phase = null; S.busy = false; S.menu = false; $('indLift').hidden = true; $('indStair').hidden = true; fade(0);
      S.inside = true; S.state = r; S.data = r.data; S.groups = r.groups; indoorBackground(true); cameraLayers(true);
      const target = r.v.bb, p = showFloor(r, g, (target[0] + target[2]) / 2, (target[1] + target[3]) / 2);
      S.paid = paidAt(p.x, p.z);
      return { id: r.v.id, venue: r.v.en, ordinal: g.o, name: g.name, walkable: p.walkable, buildMs: p.buildMs, stageMs: p.stageMs, triangles: p.triangles,
        drawCalls: p.drawCalls, gateStats: p.gateStats, shopStats: p.shopStats, propStats: p.propStats, reachability: p.reachability, showcase: p.showcase,
        signDebug: S.floor.root.userData.signDebug,
        floorResources: { textures: S.floor.root.userData.ownedTextures?.length || 0, materials: S.floor.root.userData.ownedMaterials?.length || 0,
          geometries: S.floor.root.userData.ownedGeometries?.length || 0 }, floors: r.groups.length };
    });
  }
  function testStats() {
    return records.filter((r) => r.data).map((r) => ({ id: r.v.id, venue: r.v.en, floors: r.groups.length, ordinals: r.groups.map((g) => g.o) }));
  }
  function resourceStats() {
    return records.map((r) => ({ venue: r.v.en, loaded: !!r.data, entries: !!r.entries, floors: r.groups && r.groups.length || 0, markers: r.markers && r.markers.length || 0 }));
  }
  function testGatePairs() {
    if (!S.floor || !isStation(S.state)) return [];
    const { grid } = S.floor, out = [];
    for (let j = 0; j < grid.nz && out.length < 16; j++) for (let i = 0; i < grid.nx && out.length < 16; i++) {
      const k = j * grid.nx + i; if (!grid.walkable[k]) continue;
      for (const n of [i + 1 < grid.nx ? k + 1 : -1, j + 1 < grid.nz ? k + grid.nx : -1]) {
        if (n < 0 || !grid.walkable[n] || grid.paid[k] === grid.paid[n]) continue;
        const xy = (q) => ({ x: grid.x0 + ((q % grid.nx) + 0.5) * CS, z: grid.z0 + (Math.floor(q / grid.nx) + 0.5) * CS });
        out.push({ unpaid: xy(grid.paid[k] ? n : k), paid: xy(grid.paid[k] ? k : n) });
      }
    }
    return out;
  }
  function nearOutside() { return currentNear(); }
  return { walk, foot, prompt, act, leave, step, camera: camera3, label, hint, map,
    get inside() { return S.inside; }, get busy() { return S.busy; }, get menu() { return S.menu; }, get fading() { return !!S.phase; },
    get venue() { return S.state && S.state.v; }, get floor() { return S.floor && S.floor.group && S.floor.group.o; }, get paid() { return S.paid; },
    canMove, setGoal, hasStation, stationVenueId: (k) => stationForIndex(k)?.v.id || null, enterStation, arriveStation, pickDelivery, setForceFood, consumeForceFood: () => { const q = S.forceFood; S.forceFood = false; return q; }, nearOutside,
    get _arrival() { return S.arrival || null; },
    _load: (id) => { const r = byId.get(id) || records.find((q) => q.v.file.includes(id) || q.v.en === id || q.v.tc === id); return r && load(r); },
    _goto: testGoto, _stats: testStats, _resources: resourceStats, _textures: textureStats, _signs: () => S.floor?.root.userData.signDebug || null,
    _gateStats: () => S.floor?.gateStats || null, _lastPickLoads: () => S.lastPickLoads, _walkable: gridWalkable,
    _shopStats: () => S.floor?.shopStats || null, _propStats: () => S.floor?.propStats || null, _reachability: () => S.floor?.reachability || null,
    _showcaseStats: () => S.floor?.showcaseStats || null,
    _anchors: () => S.floor ? {
      shops: S.floor.shopAnchors.map((a) => ({ x: a.x, z: a.z, shelf: a.shelf, rings: a.unit.rings, axis: a.axis, unitIndex: a.unit.unitIndex, name: a.unit.name, category: a.unit.cat })),
      food: S.floor.foodAnchors.map((a) => ({ x: a.x, z: a.z, points: a.points, rings: a.unit.rings, unitIndex: a.unit.unitIndex, name: a.unit.name, category: a.unit.cat }))
    } : { shops: [], food: [] },
    _npcStats: () => {
      if (!S.peoplePool) return null;
      const visibleByKind = S.peoplePool.npcs.filter((n) => n.visible).reduce((out, n) => (out[n.kind] = (out[n.kind] || 0) + 1, out), {});
      return { count: S.peoplePool.count, createdMs: S.peoplePool.createdMs, makeMsPerCharacter: S.peoplePool.makeMsPerCharacter,
        textureDelta: S.peoplePool.textureDelta, assignments: S.peoplePool.assignments, spawnMetrics: S.peoplePool.spawnMetrics,
        skeletonCount: new Set(S.peoplePool.npcs.map((n) => n.p.mesh.skeleton)).size, poolVisible: S.peoplePool.root.visible,
        visible: S.peoplePool.npcs.filter((n) => n.visible).length,
        visibleByKind, npcs: S.peoplePool.npcs.map((n) => ({ id: n.id, modelIndex: n.id % (PEOPLE?.PP?.count || 1), model: n.p.name, kind: n.kind, anim: n.anim, visible: n.p.root.visible,
          actions: Object.entries(n.p.actions).filter(([, a]) => a.isRunning()).map(([name, a]) => ({ name, weight: a.getEffectiveWeight() })),
          x: n.p.root.position.x, y: n.p.root.position.y, z: n.p.root.position.z, scale: n.p.root.scale.x, target: n.target, shift: n.shift })),
        layers: S.peoplePool.npcs.map((n) => { let ok = true; n.p.root.traverse((o) => { if (o.layers.mask !== 2) ok = false; }); return ok; }) };
    },
    _entries: async (id) => { const r = byId.get(id) || records.find((q) => q.v.file.includes(id) || q.v.en === id || q.v.tc === id); if (!r) return []; await load(r); return getEntries(r).map((e) => ({ mid: e.mid, out: e.out, nx: e.nx, nz: e.nz, code: e.code })); },
    _gatePairs: testGatePairs, _setPaid: (v) => { S.paid = !!v; },
    _triangleCount: () => S.floor ? S.floor.triangles : 0,
    _lighting: () => M && { hemi: M.hemi.intensity, sun: M.sun.intensity, saved: S.savedLighting && { ...S.savedLighting } } };
})();
;
window.BOOT && BOOT(0.993)
;
// ============ 街頭打鬥 + 惡名星（v39-C，BG：好似「臺北GTA」咁，開放世界隨街打交 + 通緝星）============
// 唔係第二套打鬥：用返紳士風暴嘅 engine（storm_engine.js 嘅 BRAWL）——同一個特工骨架、收埋嘅遮、連招、閃避、風暴大招、幫會 AI。
// 途人俾人打 = PEOPLE.knock / scare（同揸車撞人一樣：飛後、跌低、起身走），冇血，搞笑。
// 追你嘅人 = 警察（v40，BG 09-30 揀「b, 淨用警察」；之前係三大虛構幫會）：games/agent 嘅 Meshy 警察（冇字、冇章、幼身黑警棍、冇槍），
//   第一粒 ★ 先載 cops.js（同 hkcity.html 一齊放），載好之前用程式人形（巡警制服色）。嘍囉格 = 巡警、頭目格 = 警長（深色）；唔再派巨漢。
//   紳士風暴任務照舊係三大虛構幫會。警車照舊只係街景。下面「幫會」= 追你嘅警察。
// 規則（GAME.md v39-C）：
//   惡名 heat 0–5 → ★ = 向上取整。打途人 +0.3（第一拳最少 ★1），打低幫會 +0.1。
//   有 ★：幫會喺 22–32 米外（盡量鏡頭睇唔到、同你之間冇樓擋住）一次派 2 個，★1–5 = 場上最多 2 / 4 / 6 / 8 / 10 人（手機最多 8）。
//   佢哋見到你（34 米內 + 冇樓擋；6 米內一定見到；揸車 22 米）就追；見唔到就去你最後出現嘅位置搵。
//   見唔到你 3 秒後 ★ 開始散（每 5 秒一粒）；離開最後出現位置 150 米以上散快一倍，遠嘅幫會放棄；入理大圖書館 = 安全區，★ 即散。
//   有 ★ 唔入得地鐵站（open.js）。打低幫會有錢：$10 + $15 × ★（頭目 ×2、巨漢 ×3）。俾人打暈：扣醫藥費 $100 + $50 × ★，喺最近地鐵出口醒返。
// 模式：cam.mode 'open'（自由行，幫會喺背景追）↔ 'brawl'（打緊交：BRAWL 控制主角 + 鏡頭）。幫會行近 4.5 米 / 你出拳 → 'brawl'；
//   10 米內冇幫會兼 2.2 秒冇出招 → 返 'open'。開放世界嘅任務、小地圖、錢照行（OPEN.side）。
window.FREEFIGHT = (() => {
  const $ = (id) => document.getElementById(id);
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a)), rand = (a, b) => a + Math.random() * (b - a);
  document.head.insertAdjacentHTML('beforeend', `<style>
#omoney .st{font-size:20px;margin-left:10px;letter-spacing:1px;color:#ffd23f}#omoney .st i{font-style:normal;color:rgba(255,255,255,.25)}
#omoney .st.blink{animation:ffbl .7s steps(2) infinite}@keyframes ffbl{50%{opacity:.25}}
@media (orientation:portrait){#omoney{left:12px;transform:none;top:12px}#omoney .st{display:block;margin:4px 0 0;font-size:18px}}
#obA{right:96px;bottom:100px;border-color:#ff5a5a;font-size:18px}
@media (orientation:portrait){#obA{right:16px;bottom:182px}}   /* 直向：放喺「上車」上面，唔好撞底部提示 */
#ffpay{position:fixed;left:0;right:0;top:36px;text-align:center;font-weight:900;font-size:18px;color:#7dff6a;text-shadow:0 0 6px #000;opacity:0;pointer-events:none}
@media (orientation:portrait){#ffpay{left:112px;right:auto;top:40px;text-align:left}}
#ffpay.show{animation:ffpay 1.1s ease-out}@keyframes ffpay{0%{opacity:0;transform:translateY(8px)}15%{opacity:1;transform:none}70%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
body.ff #ag-mini,body.ff #ag-ko,body.ff #ag-help,body.ff #ag-boss{display:none!important}
body.ff #ag-me{bottom:auto;top:8px;left:10px}body.ff #ag-me .ag-lbl{display:none}body.ff #ag-face{width:40px;height:40px;font-size:12px}body.ff .ag-bars{width:min(26vw,200px)}
body.ff.touch #ag-chain{display:none}body.ff-fight .ob{display:none!important}body.ff-fight.touch #hud{display:none}
body.ff-fight.ff-car #obE{display:flex!important;bottom:124px}   /* v41：打緊交行到車旁邊（手機）：「上車」喺「蓄」上面（鍵盤 E 本身已經得） */
body.ff-fight.touch #omis{max-height:24px;line-height:24px;overflow:hidden}
@media (orientation:portrait){body.ff #ag-me{top:auto;bottom:262px;left:auto;right:14px}body.ff #ag-face{display:none}body.ff .ag-bars{width:150px}}
</style>`);
  $('oui').insertAdjacentHTML('beforeend', '<div class="ob" id="obA">打</div><div id="ffpay"></div>');

  const F = { heat: 0, on: false, fight: false, seen: false, unseenT: 0, lastX: 0, lastZ: 0, calmT: 0, spawnT: 0, seeT: 0, down: 0, fee: 0,
    ease: null, kos: 0, pay: 0, civ: 0, s0: 0, warmMs: -1, told: 0, gyC: new Map() };
  // 打鬥鏡頭：風暴係後 9 米（直向手機 ×1.35）高 6.4 米；隨街打喺窄街、簷篷（3.5–5 米）下面 → 後 6.3 米（直向 7.3）、高 3.3 米（v39-C GPU 測試：直向手機原本成個鏡頭入咗樓）
  const CAMH = 3.3, camK = () => (innerWidth < innerHeight ? 0.6 : 0.7), camDist = () => 9 * (innerWidth < innerHeight ? 1.35 : 1) * camK();
  const FREE_M = { alive: [0, 0], dmg: 1, slots: 3, mus: 1, bossHp: 1 };   // MAX_ALIVE 0 → engine 自己唔出兵；幫會由呢度派
  const stars = () => (F.heat <= 0 ? 0 : Math.min(5, Math.ceil(F.heat - 1e-6)));
  let A = null, heroLight = null;

  // ---------- 小工具 ----------
  function big(t, col = '#fff') { const b = $('obig'); if (!b) return; b.textContent = t; b.style.color = col; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  function payPop(v) { const e = $('ffpay'); e.textContent = `+$${v}`; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
  const solidFn = (x, z) => window.IND && IND.inside ? IND.foot(x, z) : window.LIB ? LIB.foot(x, z) : OPEN.solid(x, z);
  function gyFn(x, z) {   // 行人路面 0.16 米（BG 09-30「腳插咗落路面」）；0.5 米一格記住，唔使每格計多邊形
    const k = Math.round(x * 2) * 100000 + Math.round(z * 2); let v = F.gyC.get(k);
    if (v === undefined) { if (F.gyC.size > 4000) F.gyC.clear(); v = window.__peds && __peds.onFoot(x, z) ? 0.16 : 0; F.gyC.set(k, v); }
    return v;
  }
  const alive = () => { let n = 0; if (A) for (let i = 0; i < A.S.alive.length; i++) n += A.S.alive[i]; return n; };
  const target = () => (OPEN.inCar ? OPEN.car : F.fight ? A.player : OPEN.hero);   // 幫會追緊嘅嘢
  const libIn = () => !!((window.LIB && (LIB.inside || LIB.busy)) || (window.IND && (IND.inside || IND.busy)));
  const onScreen = (x, z) => { const v = new THREE.Vector3(x, 1.2, z).project(camera); return v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; };

  // ---------- engine：入開放世界嗰下預先整好（create + shader compile），第一拳唔卡 ----------
  function ensure() {
    if (A) return A;
    const t0 = performance.now();
    A = BRAWL.ensure(); const t1 = performance.now();
    { const om = OPEN.hero.rig && OPEN.hero.rig.mesh, bm = window.__rig && __rig.mesh;   // 同一張特工貼圖：打鬥主角用返開放世界主角嗰張（慳一次 JPEG 解碼 + 上載）
      if (om && bm && om.material.map && bm.material.map !== om.material.map) { const t = bm.material.map; bm.material.map = om.material.map; bm.material.needsUpdate = true; if (t) t.dispose(); } }
    A.hero.traverse((o) => { if (o.isPointLight) heroLight = o; });   // 風暴用嘅主角補光：自由行收埋（多一盞燈 = 全城 shader 要重新 compile + 每格多計）
    A.HOOK.objHit = hitPeds; A.HOOK.kill = onKill; A.HOOK.boss = () => window.NET && NET.defeat && NET.defeat('boss');   // 兩個都會睇 HOOK.free（風暴任務唔受影響）
    const over1 = A.GAME.over; A.GAME.over = (w) => (A.HOOK.free ? knockedOut() : over1(w));
    // 預熱（v39-C 量度：第一拳原本卡 ~170 ms）：擺三個幫會（嘍囉 / 頭目 / 巨漢）入 instanced mesh（有 instanceColor 先 compile 到啱嘅 shader），
    // 只 compile 打鬥層（臨時 scene：同城市一樣嘅燈 + 霧 → 同一個 shader key），再清走；聲音喺呢個手勢入面開（AudioContext + 解碼音效）
    if (heroLight) heroLight.visible = false;
    const cx = camera.position.x, cz = camera.position.z, P = A.player, keep = [P.x, P.z];
    P.x = P.z = 1e5; const ids = [0, 1, 4].map((k) => A.spawn(cx + k, cz + 2, 0, k));
    A.stepBg(1 / 60); A.hero.visible = true; A.ROOT.visible = true;
    const tmp = new THREE.Scene(), par = A.ROOT.parent; tmp.fog = scene.fog;
    scene.traverseVisible((o) => { if (o.isLight) tmp.add(o.clone()); });
    tmp.add(A.ROOT);
    try {
      renderer.compile(tmp, camera);
      const sc = new THREE.Vector4(), st = renderer.getScissorTest(); renderer.getScissor(sc);   // 再喺畫面角落 1 像素畫一次：mesh / instance buffer、骨骼貼圖、貼圖都上載埋
      renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.render(tmp, camera); renderer.setScissor(sc); renderer.setScissorTest(st);
    } catch (e) { console.warn('ff prewarm', e.message); }
    par.add(A.ROOT); const t2 = performance.now();
    for (const i of ids) if (i >= 0) A.S.alive[i] = 0;
    A.stepBg(0); A.ROOT.visible = false; if (heroLight) heroLight.visible = true; P.x = keep[0]; P.z = keep[1];
    A.HOOK.quiet = true; A.SND.init(); A.HOOK.quiet = false;   // quiet：唔好喺度下載 4 MB 戰鬥音樂（風暴開打先載）
    F.warmMs = Math.round(performance.now() - t0); F.warm = { create: Math.round(t1 - t0), compile: Math.round(t2 - t1), audio: Math.round(performance.now() - t2) };
    return A;
  }
  { const e0 = OPEN.enter; OPEN.enter = (...a) => { const r = e0(...a); try { ensure(); } catch (e) { console.warn('ff ensure', e.message); } return r; }; }
  { const s0 = BRAWL.start; BRAWL.start = (...a) => { end(true); s0(...a); if (heroLight) heroLight.visible = true; }; }   // 紳士風暴任務：自由行全部清走，風暴照舊

  // ---------- session：有 ★ / 打緊交先開（ROOT 先畫），冇嘢就收埋（0 成本）----------
  function begin() {
    if (F.on) return; ensure();
    const H = A.HOOK, O = OPEN.hero; H.free = H.quiet = true; H.solid = solidFn; H.gy = gyFn; H.camK = camK(); H.camH = CAMH;
    if (heroLight) heroLight.visible = false;
    A.setMission(FREE_M); A.setTarget(1e9); A.setArena(O.x, O.z, 120, [], cam.wyaw - Math.PI);
    A.GAME.start(); A.hero.visible = false; A.ROOT.visible = true;
    document.body.classList.add('ff'); F.on = true; F.down = 0; F.kos = 0;
  }
  function end(silent) {
    if (!F.on) { F.heat = 0; return; }
    if (F.fight) stanceOff(true);
    BRAWL.stop(); const H = A.HOOK; H.free = H.quiet = false; H.solid = H.gy = null; H.camK = H.camH = 0;
    if (heroLight) heroLight.visible = true;
    document.body.classList.remove('ff', 'ff-fight'); F.on = false; F.heat = 0; F.seen = false; TRAFFIC.fighters = null;
    F.peak = 0;   // v41（BG「delete the pop up words」）：★ 變化唔再彈大字，淨係睇 ★ HUD
  }
  function canFight() {   // 喺街上、行路、唔喺車 / 圖書館 / 地鐵選單 / 天橋上面
    if (!OPEN.active || cam.mode !== 'open' || OPEN.inCar || (window.STORM && STORM.active) || !$('omtr').hidden) return false;
    if (libIn()) { tell('圖書館入面唔好打交 🤫'); return false; }
    if (OPEN.hero.y > 0.35) { tell('天橋上面打唔到交，落返街先'); return false; }
    return true;
  }
  function tell(t) { if (GAME.t - F.told > 2) { F.told = GAME.t; big(t, '#ffd23f'); } }
  function stanceOn(atk) {   // 開打：主角交俾 BRAWL（同一個特工骨架，揸住收埋嘅遮）
    begin(); const P = A.player, O = OPEN.hero;
    Object.assign(P, { x: O.x, z: O.z, px: O.x, pz: O.z, y: 0, vy: 0, yaw: O.h, st: 'idle', move: null, t: 0, inv: 0.2 });
    A.camYaw = cam.wyaw - Math.PI;   // 開放世界鏡頭喺 wyaw 方向；BRAWL 鏡頭喺 camYaw + π
    for (const k of ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']) A.keys[k] = !!keys[k];   // 撳住行嘅鍵照行
    O.root.visible = false; A.hero.visible = true; cam.mode = 'brawl'; BRAWL.setInput(true); A.layout();
    document.body.classList.add('agent-on', 'ff-fight'); $('oprompt').hidden = true;
    for (let i = 0; i < A.S.alive.length; i++) if (A.S.alive[i]) A.S.eng[i] = 1;
    F.fight = true; F.calmT = 0; F.ease = null; F.camT = 0; F.camSnap = true; A.SND.init();   // camSnap：開打第一格就揀好鏡頭方向（唔好由望住外牆慢慢轉）
    if (atk === 'chg') A.IN.chg = 1; else if (atk) A.IN.atk = 1;
  }
  function stanceOff(keepMode) {   // 收手：主角交返俾 open.js，鏡頭由打鬥位置慢慢推返埋去
    const P = A.player, O = OPEN.hero;
    O.x = P.x; O.z = P.z; O.h = P.yaw; O.vy = 0; if (!keepMode) O.root.visible = !OPEN.inCar;   // keepMode：離開開放世界 / 入風暴 / 醒返，由 caller 決定
    A.hero.visible = false; BRAWL.setInput(false); A.IN.bot = null; A.IN.tx = A.IN.ty = 0;
    for (const k in A.keys) A.keys[k] = false;
    const st = document.getElementById('ag-stick'); if (st) st.style.display = 'none';
    document.body.classList.remove('agent-on', 'ff-fight'); F.fight = false; carBtn(false);
    if (keepMode) return;
    cam.mode = 'open'; cam.wyaw = A.camYaw + Math.PI; cam.wx = O.x; cam.wz = O.z;
    const hd = camDist(), vh = CAMH - 1.6;   // 由打鬥鏡頭位置（相對主角頭）開始推
    F.ease = { t: 0, wd: cam.wd || 5.2, p: cam.wpitch, wd0: Math.hypot(hd, vh), p0: Math.atan2(vh, hd) }; cam.wd = F.ease.wd0; cam.wpitch = F.ease.p0;
  }
  function carBtn(on) { on = !!on; if (on === !!F.carBtn) return; F.carBtn = on; document.body.classList.toggle('ff-car', on); if (on) $('obE').textContent = '上車'; }
  function engage(atk) { if (F.down > 0) return; if (F.fight) { if (atk === 'chg') A.IN.chg = 1; else A.IN.atk = 1; return; } if (canFight()) stanceOn(atk); }

  // ---------- 打中途人（BRAWL doHit → objHitHook）----------
  function hitPeds(cx, cz, range, arc, half, dmg, opts, id) {
    if (!A.HOOK.free || !PEOPLE.crowd) return 0;
    const P = A.player; let n = 0;
    for (const c of PEOPLE.crowd) {
      if (!c.on || c.down > 0 || c.hitId === id || !c.p.root.visible) continue;   // 已經跌低嘅唔再打
      const dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz);
      if (d > range + 0.5) continue;
      if (arc < 360 && d > 0.8 && Math.abs(wrapA(Math.atan2(dx, dz) - P.yaw)) > half) continue;
      c.hitId = id; n++; const ux = dx / (d || 1), uz = dz / (d || 1);
      PEOPLE.knock(c, ux, uz, opts.fin || opts.musou || opts.charge ? 14 : 7);
      for (let k = 0; k < 8; k++) A.emit(c.x, 1.3, c.z, ux * rand(2, 6) + rand(-3, 3), rand(1, 5), uz * rand(2, 6) + rand(-3, 3), rand(.2, .4), rand(.5, 1), k < 4 ? 0xffffff : 0xffe07a, 12, 3);
      F.civ++; crime(c.x, c.z, 0.3);
    }
    if (n) PEOPLE.scare(P.x, P.z, 14);   // 附近啲人散晒
    return n;
  }
  function crime(x, z, amt) {
    const s0 = stars(); F.heat = Math.min(5, Math.max(F.heat + amt, 1)); F.lastX = x; F.lastZ = z; F.seen = true; F.unseenT = -4;   // 犯事之後至少 7 秒先開始散
    const s = stars(); if (s > s0) announce(s, s0);
    loadCops();
  }
  let copS = 0;   // cops.js：0 未載 / 1 載緊 / 2 好咗（第一粒 ★ 先載；冇網就繼續用程式人形，下次犯事再試）
  function loadCops() {
    if (copS) return; copS = 1; const sc = document.createElement('script'); sc.src = 'cops.js';
    sc.onload = () => { copS = 2; const t0 = performance.now(); try { if (A) A.copsInit(); } catch (e) { console.warn('cops', e.message); } F.copMs = Math.round(performance.now() - t0); };
    sc.onerror = () => { copS = 0; sc.remove(); };
    document.head.appendChild(sc);
  }
  function announce(s, s0) {
    F.peak = Math.max(F.peak || 0, s);
    if (A && A.SND.ctx) { A.SND.tone(660, 0.12, 'square', 0.08); A.SND.tone(880, 0.16, 'square', 0.08, 1, 0.13); }   // v41（BG「delete the pop up words 警長出埋黎」）：唔再彈「★★★ 警長都出埋嚟」等大字，淨係響一聲 + ★ HUD
  }
  function onKill(i) {   // 打低幫會：有錢 + 惡名 +0.1
    if (window.NET && NET.defeat) NET.defeat('gang');   // v51 討伐榜（自由打同風暴任務都計）
    if (!A.HOOK.free) return;
    const k = A.S.kind[i], pay = (10 + 15 * Math.max(1, stars())) * (k === 4 ? 3 : k === 1 ? 2 : 1);
    OPEN.addMoney(pay, 'gang'); F.pay += pay; F.kos++; payPop(pay); A.SND.pickup();
    const s0 = stars(); F.heat = Math.min(5, F.heat + 0.1); if (stars() > s0) announce(stars(), s0);
  }
  function knockedOut() {   // 俾人打暈（HP 0）：倒地 2.4 秒 → 扣醫藥費 → 最近地鐵出口醒返
    if (F.down > 0) return;
    const P = A.player; P.hp = 0; P.inv = 99; F.down = 2.4; F.fee = Math.min(OPEN.money, 100 + 50 * stars());
    A.GAME.state = 'over'; BRAWL.setInput(false);   // state 'over' + hp 0 → 骨架播 dying
    big('💫 俾人打暈咗…', '#ff8a6a');
    setTimeout(() => { const f = $('ofade'); if (f) f.style.opacity = 1; }, 900);
  }
  function wakeUp() {
    const O = OPEN.hero, P = A.player; let ex = null, bd = 1e9;
    for (const e of OPEN.exits || []) { const d = Math.hypot(e.ax - O.x, e.az - O.z); if (d < bd) { bd = d; ex = e; } }
    if (F.fight) stanceOff(true);
    if (F.fee) OPEN.addMoney(-F.fee);
    if (ex) { O.x = ex.ax; O.z = ex.az; if (OPEN.solid(O.x, O.z)) { O.x = ex.fx; O.z = ex.fz; } O.h = ex.yaw; cam.wyaw = ex.yaw + Math.PI; } else { O.x = P.x; O.z = P.z; }
    O.y = 0; O.vy = 0; O.root.visible = true; cam.mode = 'open'; cam.wx = O.x; cam.wz = O.z;
    P.hp = P.max; F.heat = 0; for (let i = 0; i < A.S.alive.length; i++) A.S.alive[i] = 0;
    A.GAME.state = 'play'; end(true); F.down = 0;
    const f = $('ofade'); if (f) f.style.opacity = 0;
    big(F.fee ? `醒返喇… 醫藥費 -$${F.fee}` : '醒返喇…', '#ffd23f');
  }

  // ---------- 派幫會：盡量喺鏡頭睇唔到、同目標之間冇樓擋（直行埋嚟唔會卡牆）----------
  function spawnGang(n) {
    const tx = F.seen ? target().x : F.lastX, tz = F.seen ? target().z : F.lastZ, s = stars();
    let got = 0, fallback = null;
    for (let t = 0; t < 28 && got < n; t++) {
      const a = Math.random() * Math.PI * 2, r = s >= 3 ? rand(14, 22) : rand(22, 32), x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;   // v41：★3+ 喺近啲出現
      if (solidFn(x, z) || clearFrac(x, 1.6, z, tx, 1.6, tz) < 0.999) continue;
      if (onScreen(x, z)) { if (!fallback) fallback = [x, z]; continue; }
      put(x, z, s); got++;
    }
    if (!got && fallback) { put(fallback[0], fallback[1], s); got++; }
    return got;
  }
  function put(x, z, s) {
    const r = Math.random(), kind = s >= 3 && r < (s >= 4 ? 0.5 : 0.35) ? 1 : 0;   // 警察：巡警 / 警長（★4+ 多啲警長；冇巨漢）
    const i = A.spawn(x, z, F.seen ? 1 : 0, kind); if (i < 0) return;
    A.S.hx[i] = F.lastX + rand(-4, 4); A.S.hz[i] = F.lastZ + rand(-4, 4);   // 見唔到你：去你最後出現嘅位置搵
    A.S.lx[i] = x; A.S.lz[i] = z;
  }

  // ---------- 每格（src.html：mode 'brawl' 行 step；所有模式之後行 tick）----------
  function step(dt) {   // 打緊交：BRAWL 控制主角 + 鏡頭；開放世界嘅任務 / 小地圖 / 錢照行
    if (!A || !F.on) { cam.mode = 'open'; return; }
    const P = A.player, O = OPEN.hero;
    if (typeof stickId !== 'undefined' && stickId !== null) { A.IN.bot = [IN.mx, IN.my]; F.stick = true; } else if (F.stick) { A.IN.bot = null; F.stick = false; }   // 開打前已經撳住城市搖桿：照用佢行，放手先交返 BRAWL 搖桿
    A.setArena(P.x, P.z, 120, [], 0);
    if (F.camSnap) {   // v41：開打第一格已經要用揀好嘅方向 + 鏡頭直接擺喺目標位（之前 engine 先用舊方向畫一格、再由開放世界鏡頭位 lerp 過去 → 窄巷第一格見到側牆）
      F.camT = 0; pickCam(P, dt);
      const d = camDist(); camera.position.set(P.x - Math.sin(A.camYaw) * d, CAMH + P.y * 0.5, P.z - Math.cos(A.camYaw) * d);
    }
    A.HOOK.camK = camK(); A.GAME.step(dt);
    pickCam(P, dt);
    if (window.TREES) TREES.occlude(P.x, 1.6, P.z, camera.position.x, camera.position.y, camera.position.z);
    O.x = P.x; O.z = P.z; O.h = P.yaw; O.y = gyFn(P.x, P.z);   // 小地圖 / 任務 / 網上版位置 = 打鬥主角
    TRAFFIC.block = { x: P.x, z: P.z, y: 0 };
    OPEN.side(dt);
    if ((F.carT = (F.carT || 0) - dt) <= 0) { F.carT = 0.2; carBtn(TOUCH && F.down <= 0 && OPEN.carNear()); }
    if (F.down > 0) return;
    // 收手：10 米內冇幫會兼 2.2 秒冇出招；上咗車 / 入圖書館 / 開咗地鐵選單 → 即刻
    let near = false; for (let i = 0; i < A.S.alive.length; i++) if (A.S.alive[i] && Math.hypot(A.S.x[i] - P.x, A.S.z[i] - P.z) < 10) { near = true; break; }
    const busy = P.st === 'attack' || P.st === 'charge' || P.st === 'musou' || P.st === 'dive' || P.st === 'hurt' || P.st === 'dodge' || P.y > 0.05;
    F.calmT = near || busy ? 0 : F.calmT + dt;
    if (OPEN.inCar || libIn() || !$('omtr').hidden || F.calmT > 2.2) stanceOff();
  }
  function pickCam(P, dt) {
    if ((F.camT = (F.camT || 0) - dt) <= 0) {   // v40（BG「主角好似入咗建築物入面？咩都睇唔到」）：揀鏡頭方向 = 樓 / 鋪頭相冇擋住主角 + 主角前面（望過去嗰邊）4 米內唔好係外牆 → 牆喺側邊、望住條街
      F.camT = 0.2; const d = camDist(), clr = (y) => clearFracS(P.x, 1.6, P.z, P.x - Math.sin(y) * d, CAMH, P.z - Math.cos(y) * d);
      const ahead = (y) => { const sx = Math.sin(y), sz = Math.cos(y); for (let r = 0.5; r < 6; r += 0.5) { const x = P.x + sx * r, z = P.z + sz * r; if (blocked(x, z) || SHOPF.zone(x, z, 0)) return r; } return 6; };
      const score = (o) => { const a = ahead(A.camYaw + o); return clr(A.camYaw + o) * 2 + Math.min(4, a) / 4 - Math.max(0, 2 - a) * 0.5 + Math.cos(wrapA(A.camYaw + o - P.yaw)) * 0.25 - Math.abs(o) * 0.1; };   // 開揚最緊要，其次牆唔好喺正前面（v41：2 米內貼住面嘅牆再扣分——窄巷開打 1.5 秒後會轉去對住鋪頭），再其次喺主角背後（engine 自己轉背後喺自由行停咗）
      if (F.camSnap) {   // v41：開打第一下（窄巷）：之前用同一個分數 + 遲滯 + 轉動扣分 → 多數留喺原本方向（望住對面牆，GPU 測試 8 個窄巷位 0 個望落條巷）。
        // 第一下冇遲滯、唔扣轉動，主角背後開揚幾遠（最多 12 米，鋪頭相 / 樓截止）計多啲 → 順住條巷望
        const deep = (y) => { const sx = Math.sin(y), sz = Math.cos(y); for (let r = 0.5; r <= 12; r += 0.5) { const x = P.x + sx * r, z = P.z + sz * r; if (blocked(x, z) || SHOPF.zone(x, z, 0)) return r; } return 12; };
        let bs = -1e9, by = A.camYaw;
        for (let k = 0; k < 24; k++) { const y = A.camYaw + k * Math.PI / 12, v = clr(y) * 2 + deep(y) / 6 + Math.cos(wrapA(y - P.yaw)) * 0.25; if (v > bs) { bs = v; by = y; } }
        A.camYaw = by; F.camWant = null; F.camSnap = false; return;
      }
      let bs = score(0) + 0.15; F.camWant = null;   // +0.15：遲滯，唔好搖嚟搖去
      for (let k = 1; k < 24; k++) { const o = (k <= 12 ? k : k - 24) * Math.PI / 12, v = score(o); if (v > bs) { bs = v; F.camWant = A.camYaw + o; } }   // 每 15° 試一次（窄巷只有順住條巷先開揚）
    }
    if (F.camWant != null) A.camYaw += wrapA(F.camWant - A.camYaw) * Math.min(1, dt * 4);
  }
  function tick(dt) {
    if (F.ease) {   // 收手之後鏡頭推返原本距離
      F.ease.t += dt; const k = Math.min(1, F.ease.t / 0.8), e = k * k * (3 - 2 * k);
      const E = F.ease; cam.wd = E.wd0 + (E.wd - E.wd0) * e; cam.wpitch = E.p0 + (E.p - E.p0) * e; if (k >= 1) F.ease = null;
    }
    const showA = OPEN.active && !OPEN.inCar && !libIn(); if (showA !== F.showA) { F.showA = showA; $('obA').style.visibility = showA ? '' : 'hidden'; }   // 手機「打」：揸車 / 圖書館入面收埋
    if (OPEN.active) warmStorm(dt);
    if (!F.on) { F.heat = 0; return; }
    if (!OPEN.active || cam.mode === 'storm' || cam.mode === 'fly' || cam.mode === 'walk' || cam.mode === 'race') { end(true); return; }
    if (F.down > 0) { if ((F.down -= dt) <= 0) wakeUp(); return; }
    const P = A.player, T = target(), inCar = OPEN.inCar, lib = libIn(), s = stars(), S = A.S, N = S.alive.length;
    if (F.tx !== undefined && Math.hypot(T.x - F.tx, T.z - F.tz) > 20) F.seeT = 0;   // v41：一格郁咗 > 20 米（瞬移）→ 即刻重新睇，唔好喺未睇之前將新位置當「最後見到你」（警察會跑去一個佢哋冇見過你嘅地方）
    F.tx = T.x; F.tz = T.z;
    // 見唔見到你（每 0.25 秒）
    if ((F.seeT -= dt) <= 0) {
      F.seeT = 0.25; let seen = false;
      const R = inCar ? 22 : 34;
      if (!lib) for (let i = 0; i < N; i++) {
        if (!S.alive[i]) continue; const d = Math.hypot(S.x[i] - T.x, S.z[i] - T.z);
        if (d < 6 || (d < R && clearFrac(S.x[i], 1.6, S.z[i], T.x, 1.6, T.z) > 0.999)) { seen = true; break; }
      }
      if (seen && !F.seen) for (let i = 0; i < N; i++) if (S.alive[i]) S.eng[i] = 1;   // 見到你：全部追
      if (!seen && F.seen) for (let i = 0; i < N; i++) if (S.alive[i]) { S.eng[i] = 0; S.hx[i] = F.lastX + rand(-5, 5); S.hz[i] = F.lastZ + rand(-5, 5); }   // 跟丟：去最後位置搵
      F.seen = seen;
    }
    if (F.seen) { F.lastX = T.x; F.lastZ = T.z; F.unseenT = Math.min(F.unseenT, 0); } else F.unseenT += dt;
    // ★ 慢慢散
    const far = Math.hypot(T.x - F.lastX, T.z - F.lastZ) > 150;
    // v41：附近（60 米內）嘅警察仲喺度趕緊去你最後出現嘅位置（未到）→ ★ 唔散（最多 15 秒，免得有人卡住牆就永遠唔散）
    let closing = false; if (!F.seen && !lib && !far && F.unseenT < 15) for (let i = 0; i < N; i++) if (S.alive[i] && !S.eng[i]) { const d = Math.hypot(S.x[i] - S.hx[i], S.z[i] - S.hz[i]); if (d > 4 && d < 60) { closing = true; break; } }
    F.closing = closing;
    if (lib) F.heat -= dt * 3;
    else if (F.unseenT > 3 && !closing) F.heat -= dt * 0.2 * (far ? 2 : 1);
    if (F.heat < 0) F.heat = 0;
    const s2 = stars();   // v41：★ 減少都唔彈大字（之前「惡名降到 ★★」）
    // 派 / 收幫會
    F.giveT = s2 === 0 ? (F.giveT || 0) + dt : 0;
    let n = 0; for (let i = 0; i < N; i++) {
      if (!S.alive[i]) continue;
      const d = Math.hypot(S.x[i] - T.x, S.z[i] - T.z);
      if (lib || (far && d > 60) || (s2 === 0 && (d > 20 || F.giveT > 6 || !onScreen(S.x[i], S.z[i])))) {   // 放棄：唔喺眼前就走；眼前嘅 6 秒後「呼」一聲散
        S.alive[i] = 0; if (d < 40) for (let k = 0; k < 10; k++) A.emit(S.x[i], rand(0.3, 1.8), S.z[i], rand(-2, 2), rand(0, 2), rand(-2, 2), rand(.3, .6), rand(1, 1.6), 0x8a8f99, -1, 2);
        continue;
      }
      n++;
    }
    const want = s2 === 0 || inCar || lib ? 0 : Math.min([0, 2, 4, 6, 8, 10][s2], TOUCH ? 8 : 10);
    if ((F.spawnT -= dt) <= 0 && n < want) { F.spawnT = 1.2; spawnGang(Math.min(2, want - n)); }
    if (!F.fight) {
      // 背景：幫會目標 = 你（見到）/ 好遠（見唔到 → 佢哋喺最後位置附近搵）；背景唔會打到你（行近 4.5 米就開打）
      if (F.seen) { P.x = T.x; P.z = T.z; } else { P.x = P.z = 1e5; for (let i = 0; i < N; i++) if (S.alive[i] && S.eng[i]) { S.eng[i] = 0; S.hx[i] = F.lastX + rand(-5, 5); S.hz[i] = F.lastZ + rand(-5, 5); } }   // v40 修正：見唔到你 = 去最後位置搵（之前打交時行近咗而 engage 咗嘅，會追去 1e5 遠處）
      P.inv = 9; A.setArena(F.seen ? T.x : F.lastX, F.seen ? T.z : F.lastZ, 120, [], 0);
      if (s2 === 0 || !F.seen) P.hp = Math.min(P.max, P.hp + dt * (s2 ? 8 : 25));   // 避開咗：慢慢回血（冇 ★ 快啲）
      if (inCar && Math.abs(OPEN.car.v) > 3) for (let i = 0; i < N; i++) {   // 揸車撞開幫會（唔扣血，彈開跌低）
        if (!S.alive[i]) continue; const dx = S.x[i] - T.x, dz = S.z[i] - T.z, d = Math.hypot(dx, dz);
        if (d < 2.4 && S.st[i] < 5) { S.vx[i] = dx / (d || 1) * 9; S.vz[i] = dz / (d || 1) * 9; S.vy[i] = 4; S.y[i] = 0.01; S.st[i] = 5; S.t[i] = 0; }
      }
      A.stepBg(dt);   // 幫會 + 碎片 / 火花（收手之後仲喺半空嘅都行埋）
      if (F.seen && !inCar && canAuto()) {
        for (let i = 0; i < N; i++) if (S.alive[i] && S.eng[i] && Math.hypot(S.x[i] - T.x, S.z[i] - T.z) < 4.5) { stanceOn(false); break; }
      }
      const hp = $('ag-hpb'); if (hp) hp.firstElementChild.style.width = (P.hp / P.max * 100) + '%';
    }
    if (s2 === 0 && n === 0 && !F.fight && P.hp >= P.max) end();
    { const FL = F.fl || (F.fl = []), FO = F.flo || (F.flo = []); FL.length = 0;   // v41：畀街車知邊個警察企喺度（src.html TRAFFIC：停低 / 撞開）
      if (F.on) for (let i = 0; i < N; i++) if (S.alive[i] && S.st[i] < 5 && S.y[i] < 0.5) { const o = FO[i] || (FO[i] = { i }); o.x = S.x[i]; o.z = S.z[i]; FL.push(o); }
      TRAFFIC.fighters = FL.length ? FL : null; }
    drawMap();
  }
  TRAFFIC.hitFighter = (i, fx, fz, sp, lx, lz) => {   // 街車撞到警察：快過 3 m/s → 彈開跌低（唔扣血，同玩家揸車撞一樣）；慢慢推 → 推返出車身側
    const S = A && A.HOOK.free && A.S; if (!S || !S.alive[i] || S.st[i] >= 5) return;
    if (sp > 3) { const k = Math.min(9, 2 + sp * 0.45); S.vx[i] = fx * k + lx * 3; S.vz[i] = fz * k + lz * 3; S.vy[i] = 4; S.y[i] = 0.01; S.st[i] = 5; S.t[i] = 0; }
    else { S.x[i] += lx * 0.12; S.z[i] += lz * 0.12; }
  };
  // v41：第一次特工無雙開打頓 ~0.5 秒（GPU 機 523 ms）= 主角補光（point light）一出現，畫面入面每種材質都要重新 compile shader（28 個 program）。
  // 行近任務點（150 米內）而又唔係打緊交 / 揸車：每 0.2 秒 compile 一種（臨時 scene：城市嘅燈 + 補光 + 霧 → 同一個 program key），做完就唔再做。
  const WQ = { list: null, i: 0, t: 0, done: false, ms: 0, near: 0 };
  function proxy(o) {
    if (o.isInstancedMesh) { const p = new THREE.InstancedMesh(o.geometry, o.material, 1); p.instanceColor = o.instanceColor; return p; }
    if (o.isSkinnedMesh) { const p = new THREE.SkinnedMesh(o.geometry, o.material); p.bind(o.skeleton, o.bindMatrix); return p; }
    if (o.isSprite) return new THREE.Sprite(o.material);
    if (o.isPoints) return new THREE.Points(o.geometry, o.material);
    if (o.isLineSegments) return new THREE.LineSegments(o.geometry, o.material);
    if (o.isLine) return new THREE.Line(o.geometry, o.material);
    return new THREE.Mesh(o.geometry, o.material);
  }
  function warmStorm(dt) {
    if (WQ.done || !A || !heroLight || !window.STORM || STORM.active || F.on || cam.mode !== 'open' || OPEN.inCar || libIn()) return;
    if ((WQ.t -= dt) > 0) return; WQ.t = 0.2;
    if (!WQ.list) {   // 行近任務點先開始（每次最多查一次 / 0.2 秒）
      const H = OPEN.hero; if (!STORM.LOCS.some((L) => L.g && Math.hypot(L.x - H.x, L.z - H.z) < 150)) return;
      const seen = new Map(), add = (o) => { if (!o.material || !(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; const m = Array.isArray(o.material) ? o.material.map((q) => q.uuid).join() : o.material.uuid;
        const k = m + (o.isInstancedMesh ? (o.instanceColor ? 'IC' : 'I') : '') + (o.isSkinnedMesh ? 'S' : '') + (o.isPoints ? 'P' : o.isLine ? 'L' : o.isSprite ? 'W' : ''); if (!seen.has(k)) seen.set(k, o); };
      scene.traverseVisible((o) => { if (o !== A.ROOT) add(o); }); A.ROOT.traverse(add); for (const o of STORM.objs || []) add(o);
      WQ.list = [...seen.values()]; WQ.i = 0;
      const L = WQ.lights = new THREE.Scene(); L.fog = scene.fog; scene.traverseVisible((o) => { if (o.isLight) L.add(o.clone()); }); const hl = heroLight.clone(); hl.visible = true; L.add(hl);
    }
    const t0 = performance.now(), T = WQ.lights;
    for (let n = 0; n < 6 && WQ.i < WQ.list.length && performance.now() - t0 < 4; n++) {   // 已經 compile 過嘅（同 key）好快，一次過行幾個；新 program 一格最多一個
      const o = WQ.list[WQ.i++], np = (renderer.info.programs || []).length, p = proxy(o); T.add(p);
      try { renderer.compile(T, camera); } catch (e) { console.warn('storm warm', e.message); }
      T.remove(p); if ((renderer.info.programs || []).length !== np) break;
    }
    WQ.ms += performance.now() - t0;
    if (WQ.i >= WQ.list.length) { WQ.done = true; WQ.list = WQ.lights = null; F.stormWarm = { ms: Math.round(WQ.ms), n: WQ.i }; }
  }
  const canAuto = () => OPEN.active && cam.mode === 'open' && !OPEN.inCar && !libIn() && $('omtr').hidden && OPEN.hero.y <= 0.35 && !(window.STORM && STORM.active);
  function drawMap() {   // 小地圖（open.js 畫完）加幫會紅點
    if (!A || !alive()) return;
    const x = $('omap').getContext('2d'), Sc = 150 / 250, O = OPEN.hero;
    x.save(); x.beginPath(); x.arc(150, 150, 146, 0, 7); x.clip(); x.fillStyle = '#ff3b3b'; x.strokeStyle = '#000'; x.lineWidth = 2;
    for (let i = 0; i < A.S.alive.length; i++) if (A.S.alive[i]) { const dx = (A.S.x[i] - O.x) * Sc, dz = (A.S.z[i] - O.z) * Sc; if (dx * dx + dz * dz > 140 * 140) continue; x.beginPath(); x.arc(150 + dx, 150 + dz, 6, 0, 7); x.fill(); x.stroke(); }
    x.restore();
  }

  // ---------- 輸入：自由行時 J / Z / 滑鼠左掣（唔係拖動）/ 手機「打」→ 開打；K / X → 重擊開打 ----------
  addEventListener('keydown', (e) => {
    if (e.repeat || !OPEN.active || cam.mode !== 'open') return;   // 網上版聊天框自己 stopPropagation，打字唔會出拳
    const k = e.key.toLowerCase(); if (k === 'j' || k === 'z') engage(true); else if (k === 'k' || k === 'x') engage('chg');
  });
  let md = null;
  addEventListener('pointerdown', (e) => { md = e.pointerType === 'mouse' && e.button === 0 && e.target === renderer.domElement ? [e.clientX, e.clientY, performance.now()] : null; });
  addEventListener('pointerup', (e) => {
    if (!md || e.pointerType !== 'mouse' || !OPEN.active || cam.mode !== 'open') { md = null; return; }
    if (Math.hypot(e.clientX - md[0], e.clientY - md[1]) < 6 && performance.now() - md[2] < 350) engage(true);   // 撳一下 = 打；拖動 = 轉鏡頭（原本咁）
    md = null;
  });
  { const b = $('obA'); b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); engage(true); }); }

  return {
    step, tick, engage, get stars() { return stars(); }, get heat() { return F.heat; }, get fighting() { return F.fight; }, get on() { return F.on; },
    starHTML: () => { const s = stars(); return s ? `<span class="st${F.seen ? '' : ' blink'}">${'★'.repeat(s)}<i>${'★'.repeat(5 - s)}</i></span>` : ''; },
    noMetro: () => big(`惡名 ${'★'.repeat(stars())} 未散，閘口有人睇住，入唔到站！`, '#ff6a5a'),
    get api() { return A; }, F, alive, end,
    wanted(x, z, amt) { if (!OPEN.active) return; begin(); crime(x, z, amt); },   // v50：揸車撞 KO 途人（open.js）→ 開 session + 加 ★
  };
})();
;
window.BOOT && BOOT(0.994)
;
// ============ 維港：船 + 海旁欄杆（v42，BG 09-30「維港海岸都劃翻啲船」「沿住海邊整條細圍欄，啲人行唔到出去」）============
// 欄杆：海面多邊形（WAT，OpenStreetMap 海岸線）九龍嗰邊嘅岸線，陸地嗰邊 1 米內係樓（碼頭、海運大廈外牆）就唔擺；
//   高 1.1 米（屋宇署 APP-110 護欄最少 1.1 米，docs/hk-reference.md）；用返運輸署欄杆同一張貼圖（RAILS.mat）。
//   碰撞：open.js solid（主角 / 揸車 / 自由行打鬥）、落街行、紳士風暴 keepIn（make_storm.py）、途人 RAILS.cross 都計埋。
// 船（全部程式砌、vertex colour、冇字冇標誌，🟡 外形同尺寸係概括）：綠白雙頭過海小輪（尖沙咀天星碼頭 ↔ 中環 / 灣仔方向）、
//   紅帆船、拖船推躉船、新油麻地公眾貨物裝卸區泊住嘅躉船、遠處貨櫃船。航線（lanes）用 harbour_lanes.py（shapely）驗過：
//   船身長方形（+ 邊距）全程喺水入面、唔掂任何樓（碼頭）。夜晚：航行燈（國際避碰規則：桅燈白、左舷紅、右舷綠、船尾白）+ 船艙燈。
window.HARB = (() => {
  const T0 = performance.now();
  // ---------- 海旁欄杆 ----------
  const RS = [], RG = new Map(), rk = (x, z) => Math.floor(x / 10) * 100000 + Math.floor(z / 10);
  const ring = WAT.length ? WAT[0].rings[0] : [];
  {
    let X0 = 1e9, X1 = -1e9, Z0 = 1e9, Z1 = -1e9; for (const [x, z] of ring) { X0 = Math.min(X0, x); X1 = Math.max(X1, x); Z0 = Math.min(Z0, z); Z1 = Math.max(Z1, z); }
    const edge = (a, b) => (a[0] === b[0] && (a[0] === X0 || a[0] === X1)) || (a[1] === b[1] && (a[1] === Z0 || a[1] === Z1));   // 海面多邊形嘅裁切框，唔係海岸
    const play = (x, z) => x > EX0 - 300 && x < EX1 + 300 && z > EZ0 - 300 && z < 2000;   // 九龍嗰邊（港島岸線 z > 2200，行唔到）
    const foot = (x, z) => window.__peds && __peds.onFoot(x, z);
    let area = 0; for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const side = area > 0 ? -1 : 1;   // 海 = 外圈入面：面積正 → 海喺每段左手（-dz, dx），陸地喺右手
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length]; if (edge(a, b) || !play(a[0], a[1]) || !play(b[0], b[1])) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l < 0.05) continue;
      const lx = -dz / l * side, lz = dx / l * side, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;   // (lx, lz) 指向陸地
      const n = Math.max(1, Math.round(l)); let run = -1;
      for (let i = 0; i <= n; i++) {
        const t = (i + 0.5) / n, px = a[0] + dx * t, pz = a[1] + dz * t;
        const ok = i < n && !blocked(px + lx, pz + lz) && !blocked(px + lx * 0.3, pz + lz * 0.3);   // 陸地嗰邊係樓（碼頭 / 外牆貼海）→ 唔擺
        if (ok && run < 0) run = i;
        if (!ok && run >= 0) { const t0 = run / n, t1 = i / n; RS.push([a[0] + dx * t0, a[1] + dz * t0, a[0] + dx * t1, a[1] + dz * t1, foot(mx + lx, mz + lz) ? 0.16 : 0]); run = -1; }
      }
    }
    RS.forEach((s, k) => {   // 10 米格；每段擴闊 1 米登記（near 0.45 米、cross 一步 < 1 米都搵得到）
      for (let gx = Math.floor((Math.min(s[0], s[2]) - 1) / 10); gx <= Math.floor((Math.max(s[0], s[2]) + 1) / 10); gx++)
        for (let gz = Math.floor((Math.min(s[1], s[3]) - 1) / 10); gz <= Math.floor((Math.max(s[1], s[3]) + 1) / 10); gz++) { const q = gx * 100000 + gz; (RG.get(q) || RG.set(q, []).get(q)).push(k); }
    });
    // 樣：運輸署欄杆貼圖（上下橫欄 + 鐵枝 + 每 2.4 米一條柱）直身 1.1 米 + 頂部 6 厘米扶手面（貼圖頂欄嗰條色）
    const P = [], UV = []; let u = 0;
    for (const [x0, z0, x1, z1, y] of RS) {
      const l = Math.hypot(x1 - x0, z1 - z0), v0 = u, v1 = u + l / 2.4, H = y + 1.1; u = v1;
      P.push(x0, y, z0, x1, y, z1, x1, H, z1, x0, y, z0, x1, H, z1, x0, H, z0); UV.push(v0, 0, v1, 0, v1, 1, v0, 0, v1, 1, v0, 1);
      const nx = -(z1 - z0) / l * 0.03, nz = (x1 - x0) / l * 0.03;
      P.push(x0 - nx, H, z0 - nz, x1 - nx, H, z1 - nz, x1 + nx, H, z1 + nz, x0 - nx, H, z0 - nz, x1 + nx, H, z1 + nz, x0 + nx, H, z0 + nz); for (let q = 0; q < 6; q++) UV.push(v0, 0.97);
    }
    if (P.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, RAILS.mat || new THREE.MeshLambertMaterial({ color: 0xb8bec4, side: THREE.DoubleSide })));
    }
  }
  const T1 = performance.now();
  const seg2 = (px, pz, s) => { const ex = s[2] - s[0], ez = s[3] - s[1], l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((px - s[0]) * ex + (pz - s[1]) * ez) / l2)), qx = s[0] + ex * t - px, qz = s[1] + ez * t - pz; return qx * qx + qz * qz; };
  function near(x, z, r = 0.45) { const L = RG.get(rk(x, z)); if (L) for (const k of L) if (seg2(x, z, RS[k]) < r * r) return true; return false; }   // 企得近過 0.45 米 = 撞到欄杆
  const rX = (ax, az, bx, bz, s) => ((bx - ax) * (s[1] - az) - (bz - az) * (s[0] - ax)) * ((bx - ax) * (s[3] - az) - (bz - az) * (s[2] - ax)) < 0 && ((s[2] - s[0]) * (az - s[1]) - (s[3] - s[1]) * (ax - s[0])) * ((s[2] - s[0]) * (bz - s[1]) - (s[3] - s[1]) * (bx - s[0])) < 0;
  function cross(ax, az, bx, bz) { for (const q of rk(ax, az) === rk(bx, bz) ? [rk(ax, az)] : [rk(ax, az), rk(bx, bz)]) { const L = RG.get(q); if (L) for (const k of L) if (rX(ax, az, bx, bz, RS[k])) return true; } return false; }
  // 海 / 陸 20 米格（紳士風暴每個人每格都問：唔好次次行 647 點多邊形）：掃描線填色，岸線經過嘅格（± 1 格）= 2 → 先用 OPEN.inWater 準確計
  const WG = 20, WX0 = EX0 - 320, WZ0 = EZ0 - 320, WNX = Math.ceil((EX1 + 640 - EX0) / WG), WNZ = Math.ceil((2000 - WZ0) / WG), WET = new Uint8Array(WNX * WNZ);
  if (WAT.length) {
    const R = WAT[0].rings;
    for (let j = 0; j < WNZ; j++) { const z = WZ0 + (j + 0.5) * WG, xs = [];
      for (const r of R) for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const a = r[i], b = r[k]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
      xs.sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil((xs[q] - WX0) / WG - 0.5)); i < WNX && WX0 + (i + 0.5) * WG < xs[q + 1]; i++) WET[j * WNX + i] = 1; }
    for (const r of R) for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const a = r[i], b = r[k], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5) + 1;
      for (let q = 0; q <= n; q++) { const gx = Math.floor((a[0] + (b[0] - a[0]) * q / n - WX0) / WG), gz = Math.floor((a[1] + (b[1] - a[1]) * q / n - WZ0) / WG);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ii = gx + di, jj = gz + dj; if (ii >= 0 && jj >= 0 && ii < WNX && jj < WNZ) WET[jj * WNX + ii] = 2; } } }
  }
  function wet(x, z) { const i = Math.floor((x - WX0) / WG), j = Math.floor((z - WZ0) / WG), c = i >= 0 && j >= 0 && i < WNX && j < WNZ ? WET[j * WNX + i] : 2; return c === 1 || (c === 2 && !!(window.OPEN && OPEN.inWater(x, z))); }
  const block = (x, z) => near(x, z) || wet(x, z);   // 落街行 / 紳士風暴：欄杆 + 海
  const T2 = performance.now();
  { const rc = RAILS.cross; RAILS.cross = (ax, az, bx, bz) => rc(ax, az, bx, bz) || cross(ax, az, bx, bz); }   // 途人（PEOPLE）：唔可以穿過海旁欄杆（俾車撞飛 / 打飛都係）
  if (TOUCH) return { step() {}, near, cross, block, wet, solidB: (x, z) => blocked(x, z) || block(x, z), rails: RS, ships: [], lanes: {}, ms: { rail: Math.round(T1 - T0), wet: Math.round(T2 - T1) }, get t() { return 0; } };   // v48：手機唔放船（開機高峰約 135 MB），欄杆同海照計

  // ---------- 船：模型 ----------
  const M4 = (x, y, z, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const _c = new THREE.Color();
  function put(A, geo, col, glow = 0, m) {
    const g = geo.index ? geo.toNonIndexed() : geo; if (m) g.applyMatrix4(m); g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array; _c.set(col);
    for (let i = 0; i < p.length; i += 3) { A.P.push(p[i], p[i + 1], p[i + 2]); A.N.push(n[i], n[i + 1], n[i + 2]); A.C.push(_c.r, _c.g, _c.b); A.E.push(glow); }
  }
  const _bv = new THREE.Vector3(), _bn = new THREE.Vector3(), _bm = new THREE.Matrix4(), _bq = new THREE.Matrix3();
  const BF = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  function box(A, w, h, l, x, y, z, col, glow = 0, ry = 0, rx = 0) {   // 直接寫頂點（BoxGeometry → toNonIndexed → 法線 太慢）
    _bm.copy(M4(x, y + h / 2, z, ry, rx)); _bq.getNormalMatrix(_bm); _c.set(col);
    for (const [nx, ny, nz] of BF) { const ax = ny || nz ? [1, 0, 0] : [0, 0, 1], bx = [ny * ax[2] - nz * ax[1], nz * ax[0] - nx * ax[2], nx * ax[1] - ny * ax[0]];   // 面上兩條軸（右手）
      const c = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]; _bn.set(nx, ny, nz).applyMatrix3(_bq).normalize();
      for (const [p, q] of c) { _bv.set((nx + ax[0] * p + bx[0] * q) * w / 2, (ny + ax[1] * p + bx[1] * q) * h / 2, (nz + ax[2] * p + bx[2] * q) * l / 2).applyMatrix4(_bm);
        A.P.push(_bv.x, _bv.y, _bv.z); A.N.push(_bn.x, _bn.y, _bn.z); A.C.push(_c.r, _c.g, _c.b); A.E.push(glow); } } }
  const cyl = (A, r0, r1, h, x, y, z, col, seg = 6, rx = 0) => put(A, new THREE.CylinderGeometry(r0, r1, h, seg), col, 0, M4(x, y, z, 0, rx).multiply(new THREE.Matrix4().makeTranslation(0, h / 2, 0)));
  function plan(L, B, fb, fs, tb, ts) {   // 船身平面：中間闊 B，船頭 / 船尾（fb / fs = 半長嘅幾多收窄）收到 tb / ts 倍（橢圓弧）；+z = 船頭
    const hw = (z) => { const u = z / (L / 2); if (u > 1 - fb) { const k = (u - 1 + fb) / fb; return B / 2 * (tb + (1 - tb) * Math.sqrt(Math.max(0, 1 - k * k))); } if (u < -(1 - fs)) { const k = (-(1 - fs) - u) / fs; return B / 2 * (ts + (1 - ts) * Math.sqrt(Math.max(0, 1 - k * k))); } return B / 2; };
    const zs = []; for (let i = 0; i <= 16; i++) zs.push(-L / 2 + L * (1 - Math.cos(Math.PI * i / 16)) / 2);   // 兩頭密啲
    return zs.map((z) => [hw(z), z]).concat(zs.slice().reverse().map((z) => [-hw(z), z]));
  }
  function prism(A, pts, y0, y1, col, glow = 0) {   // 平面輪廓直立（ExtrudeGeometry：shape 嘅 y = −z，轉 −90° 變直立）
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))), g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); put(A, g, col, glow);
  }
  function band(A, pl, ys, cols, glows) { for (let i = 0; i + 1 < ys.length; i++) prism(A, pl, ys[i], ys[i + 1], cols[i], glows ? glows[i] : 0); }
  function sail(A, x, y0, z, h, w, ry, lean) {   // 紅帆：一格格橫帆（竹竿壓住，扇形），兩面都畫
    const n = 6, rows = [];
    for (let k = 0; k <= n; k++) { const t = k / n, ww = w * (0.72 + 0.28 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62)) * (t > 0.85 ? 1 - (t - 0.85) * 1.6 : 1); rows.push([y0 + h * t, -w * 0.18 - t * lean, -w * 0.18 - t * lean + ww * (t < 0.08 ? 0.92 : 1)]); }
    for (let k = 0; k < n; k++) { const [ya, a0, a1] = rows[k], [yb, b0, b1] = rows[k + 1];
      const col = k % 2 ? 0xa8241b : 0xb82c20, bat = 0x4a1a12, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, ya, a0, 0, ya, a1, 0, yb, b1, 0, ya, a0, 0, yb, b1, 0, yb, b0, 0, ya, a0, 0, yb, b1, 0, ya, a1, 0, ya, a0, 0, yb, b0, 0, yb, b1], 3));
      put(A, g, col, 0, M4(x, 0, z, ry)); box(A, 0.12, 0.1, b1 - b0 + 0.2, x, yb - 0.05, z, bat, 0, ry); }
  }
  // 綠白雙頭過海小輪（天星小輪：雙頭、兩層、綠色船身 + 白色上層，zh.wikipedia 天星小輪；長度冇可靠來源 → 36 米 🟡）
  function mkFerry() { const A = { P: [], N: [], C: [], E: [] }, G = 0x1f5a36, W = 0xf1efe6, K = 0x26303a, CR = 0xe6dfc6;
    prism(A, plan(36, 9.4, 0.22, 0.22, 0.5, 0.5), -1.4, 1.5, G);
    prism(A, plan(36.4, 9.9, 0.22, 0.22, 0.5, 0.5), 0.95, 1.25, 0x1a1a1a);   // 護舷膠邊
    band(A, plan(33.5, 8.8, 0.2, 0.2, 0.6, 0.6), [1.5, 2.0, 3.0, 3.4], [G, K, W], [0, 1, 0]);   // 下層：綠色舷牆 + 窗
    band(A, plan(30.5, 8.5, 0.18, 0.18, 0.66, 0.66), [3.4, 3.8, 4.9, 5.35], [W, K, W], [0, 1, 0]);   // 上層
    prism(A, plan(32.5, 9.2, 0.2, 0.2, 0.6, 0.6), 5.35, 5.6, CR);   // 上蓋
    box(A, 2.2, 1.0, 3.2, 0, 5.6, 0, W); cyl(A, 0.1, 0.12, 3.0, 0, 6.6, 0, 0xdddddd);
    for (let z = -12; z <= 12; z += 4) for (const s of [-1, 1]) box(A, 0.35, 0.7, 0.55, s * 4.85, 0.25, z, 0x151515);   // 吊住嘅車胎
    return A; }
  // 紅帆船（維港遊船：紅帆、三枝桅、21–28 米，en.wikipedia Duk Ling / Aqua Luna；冇名、冇字）
  function mkJunk() { const A = { P: [], N: [], C: [], E: [] }, H = 0x6a2716, D = 0xa27646;
    prism(A, plan(26, 7, 0.36, 0.1, 0.22, 0.78), -1.2, 1.4, H);
    prism(A, plan(25.2, 6.3, 0.36, 0.1, 0.2, 0.76), 1.4, 1.46, D);
    box(A, 6.4, 1.7, 5.2, 0, 1.4, -10.2, 0x5a2012); box(A, 6.5, 0.12, 5.4, 0, 3.1, -10.2, D);   // 船尾樓
    box(A, 5.6, 0.7, 1.8, 0, 2.2, -7.7, 0x2a1c14, 1);   // 船尾樓窗
    box(A, 3.6, 0.9, 3.0, 0, 1.4, 10.6, H);   // 船頭抬高
    box(A, 3.6, 1.6, 5.2, 0, 1.46, -2.2, 0x7a3a1e); box(A, 3.7, 0.55, 5.3, 0, 2.1, -2.2, 0x2a1c14, 1);   // 艙 + 窗
    for (const [z, h, r, lean] of [[8.3, 11, 0.15, 0.16], [1.2, 15, 0.19, 0.04], [-9.4, 9.5, 0.14, -0.05]]) cyl(A, r * 0.7, r, h, 0, 1.4, z, 0x4a2c1a, 6, lean);
    sail(A, 0, 3.0, 8.9, 8.2, 6.2, 0.3, 0.4); sail(A, 0, 2.8, 1.8, 11.8, 8.4, 0.28, 0.2); sail(A, 0, 3.6, -9.0, 5.8, 5.0, 0.26, 0.1);
    return A; }
  // 拖船（黑色船身 + 厚膠護舷 + 白色駕駛樓，🟡 概括）
  function mkTug() { const A = { P: [], N: [], C: [], E: [] }, W = 0xebe8e0, K = 0x26303a;
    prism(A, plan(26, 9.4, 0.46, 0.2, 0.42, 0.8), -1.2, 1.3, 0x1c1d20);
    prism(A, plan(27, 10.3, 0.46, 0.2, 0.44, 0.8), 0.35, 1.25, 0x2b2b2b);
    prism(A, plan(25.4, 8.9, 0.46, 0.2, 0.4, 0.8), 1.3, 1.65, 0x3a3d42);
    box(A, 7, 2.2, 9, 0, 1.3, 1.5, W); box(A, 7.05, 0.8, 9.05, 0, 2.3, 1.5, K, 1);
    box(A, 5.6, 2.0, 4.6, 0, 3.5, 2.6, W); box(A, 5.65, 0.95, 4.65, 0, 4.3, 2.6, K, 1); box(A, 6.4, 0.18, 5.2, 0, 5.5, 2.6, W);
    cyl(A, 0.1, 0.13, 3.8, 0, 5.68, 2.4, 0xdddddd);
    for (const s of [-1, 1]) { box(A, 0.8, 2.4, 1.2, s * 1.7, 3.5, -2.2, 0xa8342a); box(A, 0.82, 0.4, 1.22, s * 1.7, 5.9, -2.2, 0x111111); }
    box(A, 1.2, 0.8, 1.2, 0, 1.65, -9, 0x444444);
    return A; }
  // 躉船（冇引擎、有 40–60 噸吊機、靠拖船推 / 拖，en.wikipedia Mid-stream operation / Lighter (barge)；顏色 🟡）
  function mkLighter() { const A = { P: [], N: [], C: [], E: [] }, CC = [0xa33b2a, 0x2f5d8a, 0x8a8f94, 0x2e6b4a, 0xc58a2a, 0xe6e3da];
    prism(A, plan(45, 14, 0.12, 0.06, 0.78, 0.9), -1.2, 1.6, 0x34443a);
    prism(A, plan(44, 13.2, 0.12, 0.06, 0.76, 0.9), 1.6, 1.66, 0x5d615b);
    let q = 0; for (const z of [15, 8.5, 2]) for (const x of [-1.35, 1.35]) { const t = (q * 7 + 3) % 4 > 0 ? 2 : 1; for (let k = 0; k < t; k++) box(A, 2.44, 2.55, 6.05, x, 1.66 + k * 2.6, z, CC[(q * 5 + k * 3) % CC.length]); q++; }
    cyl(A, 1.0, 1.25, 5.4, 0, 1.66, -11, 0xd9a31f, 8); box(A, 3.2, 2.5, 3.6, 0, 7.0, -11.2, 0xd9a31f); box(A, 3.25, 1.0, 1.0, 0, 8.0, -9.5, 0x26303a, 1);
    box(A, 0.8, 0.8, 22, 0, 8.4, -2.0, 0xd9a31f, 0, 0, -0.62);   // 吊臂（斜向船頭）
    box(A, 0.08, 7.0, 0.08, 0, 7.8, 6.8, 0x222222); box(A, 1.2, 0.5, 1.2, 0, 7.5, 6.8, 0x333333);   // 鈎
    box(A, 5, 2.4, 3.2, 0, 1.66, -19.4, 0xe8e5dc); box(A, 5.05, 0.8, 3.25, 0, 2.6, -19.4, 0x26303a, 1);
    return A; }
  // 貨櫃船（長 180 米 🟡；貨櫃冇字冇標誌，顏色隨機）
  function mkBox() { const A = { P: [], N: [], C: [], E: [] }, CC = [0xa8382c, 0x2f5d8a, 0x3a7d44, 0xd4a017, 0x8a8f94, 0xe07b28, 0xeeeeea, 0x1f3f6b, 0x8f2a2a, 0x5a6b3a];
    prism(A, plan(180, 28, 0.2, 0.06, 0.1, 0.82), -3, 9, 0x233a57);
    prism(A, plan(178, 27, 0.2, 0.06, 0.1, 0.8), 9, 9.12, 0x6b6f73);
    let q = 0; for (let b = 0; b < 10; b++) { const z = -52 + b * 12.9; for (let r = 0; r < 10; r++) { const t = 2 + ((b * 7 + r * 3 + q) % 5) - (b > 7 ? 1 : 0), x = -11 + r * 2.45; q++;
      for (let k = 0; k < t; k++) box(A, 2.4, 2.55, 12.2, x, 9.12 + k * 2.6, z, CC[(b * 13 + r * 7 + k * 5) % CC.length]); } }
    for (let i = 0; i < 7; i++) { box(A, 22, 1.9, 12, 0, 9.12 + i * 3, -69, 0xe8e8e2); box(A, 22.1, 1.1, 12.1, 0, 11.02 + i * 3, -69, 0x26303a, i > 1 ? 1 : 0); }
    box(A, 32, 1.0, 3.2, 0, 30.1, -64.5, 0xe8e8e2); box(A, 6.5, 10, 7, 0, 30, -79, 0x2a2a2d); box(A, 6.6, 1.4, 7.1, 0, 36.5, -79, 0xb22d2d);
    cyl(A, 0.25, 0.35, 13, 0, 9.12, 82, 0xcccccc); cyl(A, 0.2, 0.28, 8, 0, 31.1, -69, 0xcccccc);
    return A; }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (s) => {   // 夜晚船艙窗發光（glow 屬性 × U.night）
    s.uniforms.night = U.night;
    s.vertexShader = 'attribute float glow;\nvarying float vGlow;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = glow;');
    s.fragmentShader = 'uniform float night;\nvarying float vGlow;\n' + s.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive + vGlow * night * vec3(1.0, 0.8, 0.52) * 1.3;');
  };
  function mesh(A, n) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(A.C, 3)); g.setAttribute('glow', new THREE.Float32BufferAttribute(A.E, 1));
    const m = new THREE.InstancedMesh(g, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); return m;
  }

  // ---------- 航線（Catmull-Rom，每 2 米一點；同 lanes3.py 一樣）----------
  function lane(ctrl, closed) {
    const Q = closed ? [ctrl[ctrl.length - 1], ...ctrl, ctrl[0], ctrl[1]] : [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]], X = [], Z = [];
    for (let i = 1; i < Q.length - 2; i++) { const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]], m = Math.max(2, Math.floor(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
      const cr = (j, t, t2, t3) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      for (let k = 0; k < m; k++) { const t = k / m, t2 = t * t, t3 = t2 * t; X.push(cr(0, t, t2, t3)); Z.push(cr(1, t, t2, t3)); } }
    if (!closed) { X.push(ctrl[ctrl.length - 1][0]); Z.push(ctrl[ctrl.length - 1][1]); } else { X.push(X[0]); Z.push(Z[0]); }
    const S = [0]; for (let i = 1; i < X.length; i++) S.push(S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]));
    const len = S[S.length - 1];
    return { len, closed, at(u) {   // → [x, z, heading]（heading：前進方向 (sin h, cos h)）
      u = closed ? ((u % len) + len) % len : Math.max(0, Math.min(len, u)); let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= u) lo = m; else hi = m; }
      const t = (u - S[lo]) / ((S[hi] - S[lo]) || 1); return [X[lo] + (X[hi] - X[lo]) * t, Z[lo] + (Z[hi] - Z[lo]) * t, Math.atan2(X[hi] - X[lo], Z[hi] - Z[lo])]; } };
  }
  const LN = {
    ferryC: lane([[-95.9, 1694.4], [-120.4, 1726.1], [-144.8, 1757.7], [-169.3, 1789.4], [-260, 1880], [-450, 2090], [-640, 2280], [-770, 2385]], false),   // 天星碼頭西突堤 → 中環方向
    ferryW: lane([[-63.8, 1729.3], [-88.2, 1761.0], [-112.7, 1792.6], [-137.1, 1824.3], [-95, 1900], [20, 1990], [170, 2200], [235, 2440], [250, 2590]], false),   // 南突堤 → 灣仔方向
    junk: lane([[250, 1840], [620, 1790], [900, 1700], [1100, 1600], [1230, 1610], [1210, 1720], [950, 1850], [550, 1950], [260, 1965], [150, 1905]], true),   // 尖沙咀 / 尖東海旁對開（喺渡輪航線東面，唔會交叉）
    tug2: lane([[1530, 1270], [1660, 1210], [1800, 1200], [1890, 1270], [1810, 1370], [1660, 1390], [1530, 1350]], true),   // 紅磡碼頭東邊
    tow: lane([[-1400, 1290], [-1000, 1230], [-700, 1300], [-580, 1500], [-620, 1700], [-850, 1800], [-1150, 1720], [-1350, 1560], [-1500, 1420]], true),   // 西九 / 海運大廈以西（唔同貨櫃船航道平行）
    box: lane([[2150, 1700], [1800, 1860], [1200, 1990], [600, 2100], [0, 2150], [-600, 2120], [-1200, 2040], [-1800, 1930], [-2250, 1780], [-2500, 1680], [-2700, 1760], [-2650, 1900], [-2300, 1960], [-1900, 2020], [-1580, 2060], [-1300, 2180], [-800, 2290], [-200, 2340], [400, 2330], [1000, 2280], [1600, 2200], [2000, 2080], [2280, 1900]], true),
  };
  const T3 = performance.now();
  const MS = { ferry: mesh(mkFerry(), 3), junk: mesh(mkJunk(), 1), tug: mesh(mkTug(), 2), lighter: mesh(mkLighter(), 4), box: mesh(mkBox(), 2) };
  // 船：pri 越大越唔讓（貨櫃船 > 小輪 > 拖船躉船 > 帆船 > 拖船）；dim [長, 闊]；lights [[x, y, z, 顏色 0 白 / 1 紅 / 2 綠]]（本地座標，+z 船頭）
  const DIM = { ferry: [36, 9.4], junk: [26, 7], tug: [26, 9.4], lighter: [45, 14], box: [180, 28] };
  const LT = { ferry: [[0, 9.5, 0, 0], [-4.4, 3.6, 2, 1], [4.4, 3.6, 2, 2], [0, 5.8, -15.5, 0]], junk: [[0, 16.8, 1.2, 0], [-3.2, 2.2, 5, 1], [3.2, 2.2, 5, 2], [0, 3.4, -12.6, 0]],
    tug: [[0, 9.4, 2.4, 0], [-3.2, 5.6, 3.5, 1], [3.2, 5.6, 3.5, 2], [0, 2.2, -12.5, 0]], lighter: [[-6.8, 2.2, 21, 1], [6.8, 2.2, 21, 2]],
    box: [[0, 22, 82, 0], [0, 39, -69, 0], [-15.5, 30.6, -64.5, 1], [15.5, 30.6, -64.5, 2], [0, 12, -89, 0]] };
  const SH = [], add = (o) => { const [L, B] = DIM[o.type]; o.pri += SH.length * 0.001; SH.push(Object.assign({ u: 0, v: 0, dir: 1, st: 'run', t: 0, L, B, x: 0, z: 0, h: 0, ht: 0, ph: SH.length * 1.7, idx: 0, wait: 0, by: null }, o)); };   // pri 冇兩隻一樣 → 讓路次序一定分到先後
  // 渡輪：中環線兩隻對開（同時由兩頭開出），灣仔線一隻；過海約 3.5–4 分鐘（🟡 天星時間表約 9 / 8 分鐘，遊戲縮短），泊碼頭 35 秒、對岸 25 秒
  add({ type: 'ferry', ln: LN.ferryC, vmax: 4.6, pri: 3, st: 'dwell', t: 20, u: 0, idx: 0 });
  add({ type: 'ferry', ln: LN.ferryC, vmax: 4.6, pri: 3, st: 'dwell', t: 20, u: LN.ferryC.len, dir: -1, idx: 1 });
  SH[0].mate = SH[1]; SH[1].mate = SH[0];
  add({ type: 'ferry', ln: LN.ferryW, vmax: 4.6, pri: 3.1, st: 'run', u: 420, idx: 2 });
  add({ type: 'junk', ln: LN.junk, vmax: 2.8, pri: 1, u: 0.05 * LN.junk.len });
  add({ type: 'tug', ln: LN.tug2, vmax: 3.6, pri: 0, u: 0, idx: 0 });
  add({ type: 'lighter', ln: LN.tow, vmax: 2.4, pri: 2, u: 0.62 * LN.tow.len, idx: 0 });
  const TOW = SH[SH.length - 1]; add({ type: 'tug', ln: LN.tow, vmax: 2.4, pri: 2, u: TOW.u - 36, idx: 1, pusher: TOW });   // 拖船喺躉船後面推
  add({ type: 'box', ln: LN.box, vmax: 6, pri: 4, u: 0.12 * LN.box.len, idx: 0 });
  add({ type: 'box', ln: LN.box, vmax: 6, pri: 4, u: 0.62 * LN.box.len, idx: 1 });
  // 新油麻地公眾貨物裝卸區（海事處行政大樓 = LandsD 樓名）岸邊泊住三隻躉船
  for (const [z, k] of [[-620, 1], [-520, 2], [-380, 3]]) add({ type: 'lighter', x: -956.7, z, h: k === 2 ? Math.PI : 0, st: 'moor', idx: k, pri: -1 });
  const _f = (h) => [Math.sin(h), Math.cos(h)];
  function place(s) { if (s.st === 'moor') { s.ht = s.h; return; } const off = s.type === 'ferry' ? 16 * s.dir * Math.min(1, Math.max(0, (Math.min(s.u, s.ln.len - s.u) - 110) / 110)) : 0;   // 渡輪對開：各自靠右（右舷）行，碼頭附近歸中
    const [x, z, h] = s.ln.at(s.u); s.x = x - Math.cos(h) * off; s.z = z + Math.sin(h) * off; s.h = h; s.ht = s.dir < 0 ? h + Math.PI : h; }
  function conflict(a, b, ahead) {   // b 嘅船身有冇擋住 a 前面 ahead 米內嘅航道？（Ra / Rl = b 船身喺 a 前後 / 左右方向嘅半長 + 6 米）
    const [fx, fz] = _f(a.ht), dx = b.x - a.x, dz = b.z - a.z, along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx), c = Math.abs(Math.cos(b.ht - a.ht)), sn = Math.abs(Math.sin(b.ht - a.ht));
    const Ra = c * b.L / 2 + sn * b.B / 2 + 6, Rl = sn * b.L / 2 + c * b.B / 2 + 6;
    return along > -a.L / 2 && along - Ra < a.L / 2 + ahead && lat - Rl < a.B / 2;
  }
  const _ax = [0, 0, 0, 0], obb = (ax, az, ah, aL, aB, bx, bz, bh, bL, bB) => {   // 兩個長方形船身重唔重疊（分離軸）
    const A = [[Math.sin(ah), Math.cos(ah)], [Math.cos(ah), -Math.sin(ah)], [Math.sin(bh), Math.cos(bh)], [Math.cos(bh), -Math.sin(bh)]], dx = bx - ax, dz = bz - az;
    for (const [x, z] of A) { const ra = aL / 2 * Math.abs(A[0][0] * x + A[0][1] * z) + aB / 2 * Math.abs(A[1][0] * x + A[1][1] * z), rb = bL / 2 * Math.abs(A[2][0] * x + A[2][1] * z) + bB / 2 * Math.abs(A[3][0] * x + A[3][1] * z);
      if (Math.abs(dx * x + dz * z) > ra + rb) return false; } return true; };
  function hit(a, va, b, T) {   // 預測：a 用 va、b 用而家速度各自直行 T 秒內，船身（各加 10 米）會唔會撞
    const [fx, fz] = _f(a.ht), [gx, gz] = _f(b.ht);
    for (let k = 0; k <= 6; k++) { const q = T * k / 6; if (obb(a.x + fx * va * q, a.z + fz * va * q, a.ht, a.L + 10, a.B + 10, b.x + gx * b.v * q, b.z + gz * b.v * q, b.ht, b.L + 10, b.B + 10)) return true; }
    return false; }
  let t = 0;
  function move(dt) {
    t += dt;
    for (const s of SH) { if (s.st === 'moor' || s.pusher) continue;
      if (s.st === 'dwell') { s.v = 0; if ((s.t -= dt) <= 0) s.st = 'run'; continue; }
      let want = s.vmax;
      if (!s.ln.closed) { const rem = s.dir > 0 ? s.ln.len - s.u : s.u, end = s.dir > 0 ? s.ln.len : 0;
        want = Math.min(want, Math.sqrt(2 * 0.22 * Math.max(0, rem)) + 0.25);   // 埋碼頭慢慢減速
        if (s.mate && Math.abs(s.mate.u - end) < 240) want = Math.min(want, Math.sqrt(2 * 0.3 * Math.max(0, rem - 260)));   // 另一隻仲喺目的地附近（泊緊 / 出緊碼頭）：260 米外等（兩隻都已經靠右，擦身而過唔會撞）
      }
      let by = null; if (s.pass > 0) s.pass -= dt;
      for (const o of SH) { if (o === s || o.pusher === s || s.pusher === o || o.st === 'moor') continue; const hi = o.pri > s.pri;
        if (conflict(s, o, 10) && (hi || !(s.pass > 0))) { want = 0; by = o; break; }   // 緊急：前面貼住有船 → 停
        if (hi && o !== s.mate && Math.abs(o.x - s.x) + Math.abs(o.z - s.z) < 600 && hit(s, s.vmax, o, 30) && !hit(s, 0, o, 30)) { want = 0; by = o; break; } }   // 同線對開嗰隻唔使預測（碼頭規則 + 各自靠右）   // 讓路：照開會撞、停低唔會 → 停（兩樣都會撞 = 自己擋住人 → 照開讓出條路）
      s.wait = by ? s.wait + dt : 0; s.by = by; if (s.wait > 8) { s.pass = 10; s.wait = 0; }   // 等咗 8 秒：之後 10 秒唔理低級嘅船（佢哋會讓），唔會死鎖
      const a = want > s.v ? 0.25 : 0.4; s.v += Math.max(-a * dt, Math.min(a * dt, want - s.v));
      s.u += s.v * s.dir * dt;
      if (!s.ln.closed && ((s.dir > 0 && s.u >= s.ln.len) || (s.dir < 0 && s.u <= 0))) { s.u = Math.max(0, Math.min(s.ln.len, s.u)); s.v = 0; s.dir = -s.dir; s.st = 'dwell'; s.t = s.u > 0 ? 25 : 35; }   // 到咗（只計行緊嘅方向）
      place(s);
    }
    for (const s of SH) if (s.pusher) { s.u = s.pusher.u - (s.pusher.L + s.L) / 2 - 0.3; s.v = s.pusher.v; place(s); }
  }

  // ---------- 浪花（船頭 V 字 + 船尾白浪），一個 InstancedMesh ----------
  const wakeTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 512; const x = c.getContext('2d'); x.filter = 'blur(1.2px)';   // 畫布頂 = 最尾、底 = 船頭
    const dot = (cx, cy, r, a) => { x.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
    for (let i = 0; i < 5000; i++) { const v = Math.random() ** 0.8, yy = 512 * (1 - v);
      if (i % 2) { const sd = i % 4 === 1 ? -1 : 1; dot(64 + sd * (4 + v * 58) + (Math.random() - 0.5) * (3 + v * 6), yy, 0.6 + Math.random() * 1.4, 0.5 * (1 - v) ** 1.5 * Math.min(1, v * 12)); }   // 船頭 V 字浪
      else if (v > 0.07) { const w = 3 + v * 22; dot(64 + (Math.random() - 0.5) * 2 * w, yy, 0.7 + Math.random() * 1.8, 0.75 * (1 - v) ** 2.2); } }   // 船尾白浪（船身底嗰段俾船遮住）
    return new THREE.CanvasTexture(c); })();
  const wg = new THREE.PlaneGeometry(1, 1); wg.rotateX(-Math.PI / 2); wg.translate(0, 0, -0.5);
  const wakeMat = new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false, opacity: 0.8 });
  const moving = SH.filter((s) => s.st !== 'moor' && !s.pusher), WAKE = new THREE.InstancedMesh(wg, wakeMat, moving.length);
  WAKE.instanceMatrix.setUsage(THREE.DynamicDrawUsage); WAKE.frustumCulled = false; WAKE.renderOrder = 1; scene.add(WAKE);

  // ---------- 航行燈（夜晚）：一個 Points，加色混合 ----------
  const NL = SH.reduce((n, s) => n + LT[s.type].length, 0), lp = new Float32Array(NL * 3), lc = new Float32Array(NL * 3);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const LCOL = [[1, 0.95, 0.85], [1, 0.12, 0.08], [0.1, 1, 0.3]];
  const lights = new THREE.Points(lg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { night: U.night, fogFar: U.fogFar, px: { value: 400 } },
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying float vA; uniform float px, fogFar; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.); float d = -mv.z; vA = 1. - smoothstep(fogFar * .6, fogFar, d) * .8; gl_PointSize = clamp(3. * px / max(d, 1.), 3., 48.); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float night; varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - .5; float r = length(q) * 2.; float a = smoothstep(1., 0., r); a = a * a + smoothstep(.35, 0., r); gl_FragColor = vec4(vC * a * night * vA, 1.); }' }));
  lights.frustumCulled = false; scene.add(lights);
  addEventListener('resize', () => { lights.material.uniforms.px.value = innerHeight * renderer.getPixelRatio() * 0.5; }); lights.material.uniforms.px.value = innerHeight * renderer.getPixelRatio() * 0.5;

  // ---------- 每格 ----------
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _l = new THREE.Vector3();
  function draw() {
    let li = 0, wi = 0;
    for (const s of SH) {
      const k = Math.sqrt(20 / s.L), bob = 0.2 * k * Math.sin(t * 1.1 + s.ph) + 0.06 * Math.sin(t * 2.3 + s.ph * 2);
      _e.set(0.012 * k * Math.sin(t * 0.9 + s.ph * 3), s.h, 0.03 * k * Math.sin(t * 0.7 + s.ph)); _q.setFromEuler(_e);
      _m.compose(_p.set(s.x, bob, s.z), _q, _s.set(1, 1, 1)); MS[s.type].setMatrixAt(s.idx, _m);
      const lf = s.dir < 0 && s.type === 'ferry' ? -1 : 1;   // 雙頭渡輪：燈跟行緊嘅方向
      for (const [x, y, z, c] of LT[s.type]) { _l.set(x * lf, y, z * lf).applyMatrix4(_m); lp.set([_l.x, _l.y, _l.z], li * 3); lc.set(s.st === 'moor' ? [0, 0, 0] : LCOL[c], li * 3); li++; }
      if (s.st !== 'moor' && !s.pusher) {   // 浪花：由船頭（行緊嘅方向）向後，速度越快越長
        const sp = Math.min(1, (s.v || 0) / 4.5), len = s.L * (0.9 + 1.2 * sp) + (s.type === 'lighter' ? 26 : 0), ht = s.ht, [fx, fz] = _f(ht);
        _q.setFromEuler(_e.set(0, ht, 0)); _m.compose(_p.set(s.x + fx * s.L * 0.5, 0.07, s.z + fz * s.L * 0.5), _q, _s.set(s.v > 0.2 ? s.B * 1.2 + len * 0.45 : 0, 1, s.v > 0.2 ? len : 0)); WAKE.setMatrixAt(wi++, _m);
      }
    }
    for (const k in MS) MS[k].instanceMatrix.needsUpdate = true; WAKE.instanceMatrix.needsUpdate = true;
    lg.attributes.position.needsUpdate = lg.attributes.color.needsUpdate = true;
    wakeMat.color.setScalar(1 - 0.8 * U.night.value);
  }
  for (const s of SH) place(s);
  move(0); draw();
  const ms = { rail: Math.round(T1 - T0), wet: Math.round(T2 - T1), lanes: Math.round(T3 - T2), rest: Math.round(performance.now() - T3) };
  return {
    step(dt) { move(dt); draw(); }, near, cross, block, wet, solidB: (x, z) => blocked(x, z) || block(x, z),
    rails: RS, ships: SH, lanes: LN, ms, get t() { return t; },
  };
})();
;
window.BOOT && BOOT(0.995)
;
// ============ 街邊打得爛嘅嘢 + 街頭小食補血（v42，BG 09-30「街邊搵啲嘢可以比人打爛到嘅，1分鐘之後會出現翻」「街邊搵啲嘢可以spawn出嚟補血」）============
// 三種：食環署橙色垃圾桶（v38 已經有，1,249 個）、鋪頭門口一疊紙皮箱（便利店 / 士多 / 超市 / 蔬果 / 藥房 / 五金 / 海味 / 玩具 / 餅店）、
//   一疊紅色膠凳（茶餐廳 / 燒臘 / 糖水 / 麵家 / 車仔麵 / 小食 / 酒家）。紙皮箱同膠凳位置 = 鋪頭相前面 0.55–0.85 米、行人路上（🟡 唔係真位置）。
// 打爛：自由行 / 紳士特工無雙任務嘅招式（BRAWL objHit hook）、揸車撞（> 2.5 m/s）→ 碎片（同 KO 一樣嘅方塊碎，自己一個 InstancedMesh，
//   揸車冇打鬥層都睇到）+ 聲 → 60 秒後原位慢慢現返（1.2 秒網點淡入；主角企喺個位就等）。
// 補血：打爛有 30 % 跌小食（10 秒最多跌一次、地上最多 6 個），行過去食：魚蛋串 +40、奶茶 +50、雞蛋仔 +60、菠蘿包 +80 體力（滿 400），
//   30 秒冇人食就消失（最後 5 秒閃）。唔用紳士風暴嗰個漢堡：佢只喺打鬥模式先執得到，行街執唔到。
// 只有附近嘅先「生」：全部喺 8 米格網，打 / 撞 / 執只查附近幾格；冇嘢發生嘅時候每格成本 ≈ 0。
window.BRK = (() => {
  const RESPAWN = 60, FADE = 1.2, DROP_P = 0.3, DROP_CD = 10, FOOD_LIFE = 30, FOOD_MAX = 6;
  const rand = (a, b) => a + Math.random() * (b - a);
  const T0 = performance.now();
  // ---------- 模型（vertex colour，底 = y 0）----------
  const acc = () => ({ P: [], N: [], C: [] }), _c = new THREE.Color();
  function put(A, g0, col, m) { const g = g0.index ? g0.toNonIndexed() : g0; if (m) g.applyMatrix4(m); g.computeVertexNormals(); const p = g.attributes.position.array, n = g.attributes.normal.array; _c.set(col);
    for (let i = 0; i < p.length; i += 3) { A.P.push(p[i], p[i + 1], p[i + 2]); A.N.push(n[i], n[i + 1], n[i + 2]); A.C.push(_c.r, _c.g, _c.b); } }
  const M4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
  const box = (A, w, h, d, x, y, z, col, ry = 0) => put(A, new THREE.BoxGeometry(w, h, d), col, M4(x, y + h / 2, z, ry));
  const geo = (A) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.C, 3)); return g; };
  const CARD = (() => { const A = acc();   // 一疊紙皮箱（三個唔同大細，封箱膠紙）
    for (const [w, h, d, x, y, z, ry, col] of [[0.62, 0.44, 0.46, 0, 0, 0, 0, 0xb08a5a], [0.52, 0.38, 0.4, 0.04, 0.44, -0.02, 0.22, 0xa47e50], [0.4, 0.3, 0.34, -0.3, 0, 0.36, -0.35, 0xc09a68]]) {
      box(A, w, h, d, x, y, z, col, ry); put(A, new THREE.PlaneGeometry(w * 0.98, 0.07).rotateX(-Math.PI / 2), 0xd8c9a0, M4(x, y + h + 0.004, z, ry)); }
    return geo(A); })();
  const STOOL = (() => { const A = acc(), R = 0xc4231d, R2 = 0x9e1a15;   // 紅色膠凳（M+ 館藏「紅 A 凳」係 polystyrene 紅凳；呢度冇字冇標誌）：一疊四張 + 旁邊一張
    const one = (x, z, ry, y0, h) => { put(A, new THREE.CylinderGeometry(0.2, 0.25, h, 4, 1, true), R2, M4(x, y0 + h / 2, z, ry + Math.PI / 4)); box(A, 0.33, 0.035, 0.33, x, y0 + h, z, R, ry); };
    one(0, 0, 0, 0, 0.45); for (let k = 1; k < 4; k++) box(A, 0.345, 0.03, 0.345, 0, 0.45 + k * 0.075, 0, k % 2 ? R2 : R); box(A, 0.33, 0.035, 0.33, 0, 0.45 + 3 * 0.075 + 0.03, 0, R);
    one(0.5, 0.12, 0.4, 0, 0.45);
    return geo(A); })();
  // ---------- 網點淡入（bfade：1 = 實、0 = 唔見）----------
  function dither(m) { const prev = m.onBeforeCompile;
    m.onBeforeCompile = (s, r) => { if (prev) prev(s, r);
      s.vertexShader = 'attribute float bfade;\nvarying float vBf;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBf = bfade;');
      s.fragmentShader = 'varying float vBf;\n' + s.fragmentShader.replace('void main() {', 'void main() {\n if (vBf < .999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) >= vBf) discard;'); };
    m.needsUpdate = true; }
  const MAT = new THREE.MeshLambertMaterial({ vertexColors: true }); dither(MAT);

  // ---------- 擺位 ----------
  const O = [];   // { k 0 垃圾桶 / 1 紙皮 / 2 膠凳, x, z, y, h, m（InstancedMesh）, i, st 0 好 / 1 爛 / 2 現緊, t, f }
  const G = new Map(), gk = (x, z) => Math.floor(x / 8) * 100000 + Math.floor(z / 8);
  const addO = (o) => { o.st = 0; o.t = 0; o.f = 1; O.push(o); const q = gk(o.x, o.z); (G.get(q) || G.set(q, []).get(q)).push(o); };
  const BIN = window.__binMesh;
  if (BIN && window.__binPts) { __binPts.forEach(([x, z, h], i) => addO({ k: 0, x, z, y: 0.16, h, m: BIN, i }));
    BIN.geometry.setAttribute('bfade', new THREE.InstancedBufferAttribute(new Float32Array(__binPts.length).fill(1), 1)); dither(BIN.material); }
  // v50（BG「撞圍欄街邊野會爛，不過會 respawn 返」）：消防栓 / 街燈 / 紅綠燈 / 欄杆（欄杆喺 ram() 用 RAILS.hits 即場搵）
  for (const [im, pts] of window.__hydSets || []) { pts.forEach(([x, z, h], i) => addO({ k: 3, x, z, y: 0.16, h, m: im, i }));
    im.geometry.setAttribute('bfade', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, pts.length)).fill(1), 1)); dither(im.material); }
  const LPTS = typeof lamps !== 'undefined' && lamps && lamps.geometry && lamps.geometry.attributes.position;
  if (typeof HYDL !== 'undefined' && HYDL) HYDL.list.forEach((l) => addO({ k: 4, x: l.x, z: l.z, y: l.y, h: 0, big: 1, cb(on) { l.broken = !on; HYDL.refresh();
    if (LPTS && l.li < LPTS.count) { LPTS.setY(l.li, on ? l.y + l.h - 0.15 : -999); LPTS.needsUpdate = true; } } }));
  const hideSet = (L, H) => { L = L.filter(([m, i]) => i < m.count); let saved = null;
    return (on) => { const G = window.__SIG && __SIG.glow; if (H) H.dead = !on; if (G && H && H.gi !== undefined && !on) { G.setY(H.gi, -999); G.needsUpdate = true; }   // 紅綠燈動畫（H.dead）會一直收埋光暈
      if (!on) saved = L.map(([m, i]) => { const a = m.instanceMatrix.array.slice(i * 16, i * 16 + 16); m.setMatrixAt(i, ZERO); m.instanceMatrix.needsUpdate = true; return a; });
      else if (saved) { L.forEach(([m, i], q) => { m.instanceMatrix.array.set(saved[q], i * 16); m.instanceMatrix.needsUpdate = true; }); saved = null; } }; };
  { const S = window.__SIG; if (S) {
    S.VH.forEach((H, i) => addO({ k: 5, x: H.x, z: H.z, y: 0, h: 0, big: 1, cb: hideSet([[S.vBody, i], ...[0, 1, 2, 3, 4, 5].map((q) => [S.lamps, i * 6 + q]), [S.vpR, i], [S.vpG, i]], H) }));
    S.PH.forEach((H, i) => addO({ k: 5, x: H.x, z: H.z, y: 0, h: 0, big: 1, cb: hideSet([[S.pBody, i], [S.pedR, i], [S.pedG, i]], H) })); } }
  const SHOP_K = new Map([[1, 2], [7, 2], [10, 2], [20, 2], [21, 2], [22, 2], [29, 2], [0, 1], [2, 1], [3, 1], [4, 1], [9, 1], [11, 1], [12, 1], [24, 1], [26, 1]]);   // shops.js 鋪名次序 → 2 膠凳 / 1 紙皮
  const PG = new Map(), pk = (x, z) => Math.floor(x / 4) * 100000 + Math.floor(z / 4);   // 路邊嘢（消防栓、垃圾桶）+ 已擺嘅，4 米格，唔好疊埋
  const mark = (x, z) => { const q = pk(x, z); (PG.get(q) || PG.set(q, []).get(q)).push(x, z); };
  const crowded = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = PG.get(pk(x, z) + i * 100000 + j); if (L) for (let q = 0; q < L.length; q += 2) if ((L[q] - x) ** 2 + (L[q + 1] - z) ** 2 < r * r) return true; } return false; };
  for (const [x, z] of window.__propPts || []) mark(x, z);
  const EXS = (window.OPEN && OPEN.exits) || [], nearExit = (x, z) => EXS.some((e) => (e.ax - x) ** 2 + (e.az - z) ** 2 < 16 || (e.x - x) ** 2 + (e.z - z) ** 2 < 25);
  const foot = (x, z) => !!(window.__peds && __peds.onFoot(x, z));
  const newP = { 1: [], 2: [] };
  for (const B of (window.SHOPF && SHOPF.list) || []) {
    const [mx, mz, wx, wz, ox, oz, hw, ci] = B, k = SHOP_K.get(ci); if (!k) continue;
    const r0 = rnd(mx * 3.17 + mz * 1.71); if (r0 > (k === 2 ? 0.3 : 0.26)) continue;
    const a = (rnd(mx * 0.93 - mz * 2.9) - 0.5) * 2 * Math.max(0, hw - 0.8), d = 0.55 + 0.3 * rnd(mz * 0.77 + mx * 0.31), x = mx + wx * a + ox * d, z = mz + wz * a + oz * d;
    if (!foot(x, z) || !foot(x + ox * 1.7, z + oz * 1.7) || blocked(x, z) || SHOPF.zone(x, z, 0.1) || crowded(x, z, 1.6) || nearExit(x, z) || (window.OPEN && OPEN.inWater(x, z))) continue;   // 行人路要留 1.7 米以上
    mark(x, z); newP[k].push([x, z, Math.atan2(ox, oz) + (rnd(mx + mz) - 0.5) * 0.7]);
  }
  const _o = new THREE.Object3D();
  function inst(g, pts, k) {
    const m = new THREE.InstancedMesh(g, MAT, Math.max(1, pts.length)); m.count = pts.length;
    g.setAttribute('bfade', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, pts.length)).fill(1), 1));
    pts.forEach(([x, z, h], i) => { _o.position.set(x, 0.16, z); _o.rotation.set(0, h, 0); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); addO({ k, x, z, y: 0.16, h, m, i }); });
    scene.add(m); return m; }
  const MCARD = inst(CARD, newP[1], 1), MSTOOL = inst(STOOL, newP[2], 2);
  const _m = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function show(o, on) { if (o.cb) return o.cb(on); if (on) { _o.position.set(o.x, o.y, o.z); _o.rotation.set(0, o.h, 0); _o.scale.set(1, 1, 1); _o.updateMatrix(); o.m.setMatrixAt(o.i, _o.matrix); } else o.m.setMatrixAt(o.i, ZERO); o.m.instanceMatrix.needsUpdate = true; }
  function fade(o, f) { if (!o.m) return; const a = o.m.geometry.attributes.bfade; a.array[o.i] = f; a.needsUpdate = true; }

  // ---------- 碎片（同 storm engine 嘅 KO 方塊碎一樣做法：instanced 方塊、彈地、慢慢縮細）----------
  const CM = 260, chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), CM);
  chunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CM * 3).fill(1), 3);   // 要喺 count = 0 之前整好（setColorAt 用 count 開 buffer → 0 長 → 全黑）
  chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); chunks.frustumCulled = false; chunks.count = 0; scene.add(chunks);
  const CH = []; let chHead = 0, chLive = 0;
  const PAL = { 0: [0xe4561e, 0xe4561e, 0xc84a18, 0xb4b6b8, 0x18181a, 0xf2f2ea, 0x9fd26a], 1: [0xb08a5a, 0xa47e50, 0xc09a68, 0xd8c9a0, 0x8a6a40], 2: [0xc4231d, 0x9e1a15, 0xd83a2a], 3: [0xc8201c, 0xa81a16, 0xe0a020, 0x555555], 4: [0x9a9b98, 0xb8b9b6, 0x6e6f6c, 0xfff2c0], 5: [0x1e2023, 0x2a2c30, 0xff3024, 0x3dff8a, 0xffc020], 6: [0xc9ced3, 0xa8adb2, 0x8a8e94], 7: [0xd8d2c4, 0xb8b0a0, 0x8a8478, 0x4a4f5a] };
  function burst(o, dx, dz, pw) {
    const pal = PAL[o.k], n = 16;
    for (let q = 0; q < n; q++) { const ci = chHead, c = CH[ci] || (CH[ci] = {}); chHead = (chHead + 1) % CM;
      Object.assign(c, { x: o.x + rand(-0.25, 0.25), y: o.y + rand(0.1, o.big ? 3 : 0.7), z: o.z + rand(-0.25, 0.25), vx: dx * pw * rand(0.4, 1.1) + rand(-1.6, 1.6), vy: rand(2, 5.5), vz: dz * pw * rand(0.4, 1.1) + rand(-1.6, 1.6),
        rx: rand(0, 6), ry: rand(0, 6), wx: rand(-12, 12), wy: rand(-12, 12), s: o.k === 1 ? rand(0.14, 0.3) : rand(0.1, 0.24), life: rand(1.4, 2.4), g: o.y, sx: o.k === 1 ? 1.6 : 1 });
      chunks.setColorAt(ci, _c.set(pal[(Math.random() * pal.length) | 0])); }
    chunks.instanceColor.needsUpdate = true; chLive = 1;
  }
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function stepChunks(dt) {
    let live = 0;
    for (let i = 0; i < CH.length; i++) { const c = CH[i]; if (!c || c.life <= 0) { chunks.setMatrixAt(i, ZERO); continue; }
      c.life -= dt; c.vy -= 18 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; const s = c.s * Math.min(1, c.life / 0.4);
      if (c.y < c.g + s / 2) { c.y = c.g + s / 2; c.vy *= -0.3; c.vx *= 0.55; c.vz *= 0.55; c.wx *= 0.5; c.wy *= 0.5; }
      c.rx += c.wx * dt; c.ry += c.wy * dt; _q.setFromEuler(_e.set(c.rx, c.ry, 0)); chunks.setMatrixAt(i, _m.compose(_v.set(c.x, c.y, c.z), _q, _s.set(s * c.sx, s * (c.sx > 1 ? 0.25 : 1), s)));   // 紙皮 = 扁片
      if (c.life > 0) live = i + 1; }
    chunks.count = live; chunks.instanceMatrix.needsUpdate = true; chLive = live;   // 全部跌完 → 唔再每格計
  }

  // ---------- 聲（用紳士特工 engine 嘅 WebAudio，打鬥 / 開放世界入口已經開咗）----------
  let sndT = 0;
  function sound(k) { const A = window.BRAWL && BRAWL.api, S = A && A.SND; if (!S || !S.ctx || GAME.t - sndT < 0.05) return; sndT = GAME.t;
    if (k === 0) { S.shatter(); S.tone(95, 0.16, 'sine', 0.3, 0.5); }                                            // 玻璃纖維桶：碎 + 悶響
    else if (k === 1) { S.noise(0.22, 0.4, 800, 150, 'lowpass'); S.noise(0.1, 0.22, 2600, 900, 'bandpass', 0.02); }   // 紙皮：噗 + 沙沙聲
    else if (k >= 3) { S.tone(140, 0.2, 'square', 0.12, 0.5); S.noise(0.18, 0.35, 1800, 400, 'bandpass', 0.02); }   // v50 鐵嘢：噹 + 金屬聲
    else { S.tone(560, 0.07, 'square', 0.07, 0.6); S.noise(0.12, 0.28, 3200, 1200, 'bandpass', 0.01, null, 2); } }   // 膠凳：啪

  // ---------- 小食 ----------
  const FOOD = [
    { n: '魚蛋串', e: '🍢', hp: 40 }, { n: '奶茶', e: '☕', hp: 50 }, { n: '雞蛋仔', e: '🧇', hp: 60 }, { n: '菠蘿包', e: '🍞', hp: 80 } ];
  { // 模型（真實尺寸 × 3，好似 GTA 嘅執嘢咁大，遠啲都見到 🟡）：魚蛋 = 竹籤 + 5 粒咖喱黃魚蛋（en.wikipedia Fish ball）；奶茶 = 白杯 + 碟、紅啡色茶（冇牌子）；
    // 雞蛋仔 = 一塊金黃色、一粒粒蛋形格（en.wikipedia Egg waffle）；菠蘿包 = 金啡色、面層一格格酥皮裂紋（en.wikipedia Pineapple bun）
    const K = 3, A0 = acc(), A1 = acc(), A2 = acc(), A3 = acc();
    put(A0, new THREE.CylinderGeometry(0.006 * K, 0.006 * K, 0.34 * K, 5), 0xd8c090, M4(0, 0.17 * K, 0));
    for (let i = 0; i < 5; i++) put(A0, new THREE.SphereGeometry(0.03 * K, 7, 5), i % 2 ? 0xd79a2a : 0xe0a832, M4(0, (0.1 + i * 0.058) * K, 0));
    put(A1, new THREE.CylinderGeometry(0.075 * K, 0.07 * K, 0.012 * K, 14), 0xf4f4f0, M4(0, 0.006 * K, 0));
    put(A1, new THREE.CylinderGeometry(0.045 * K, 0.034 * K, 0.085 * K, 12, 1, true), 0xf2f2ee, M4(0, 0.055 * K, 0)); put(A1, new THREE.CircleGeometry(0.043 * K, 12).rotateX(-Math.PI / 2), 0x8a5234, M4(0, 0.09 * K, 0));
    put(A1, new THREE.TorusGeometry(0.022 * K, 0.006 * K, 4, 8, Math.PI), 0xf2f2ee, M4(0.05 * K, 0.055 * K, 0).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)));
    put(A2, new THREE.CylinderGeometry(0.1 * K, 0.1 * K, 0.012 * K, 14), 0xd29a3c, M4(0, 0.006 * K, 0, 0, 1, 1, 0.75));
    for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) { const x = i * 0.028, z = j * 0.028; if ((x / 0.1) ** 2 + (z / 0.075) ** 2 > 1) continue; put(A2, new THREE.SphereGeometry(0.016 * K, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), (i + j) % 2 ? 0xe6b454 : 0xdaa648, M4(x * K, 0.012 * K, z * K)); }
    { const g = new THREE.SphereGeometry(0.07 * K, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.62, 1); const gi = g.toNonIndexed(), P = gi.attributes.position, C = [];
      for (let i = 0; i < P.count; i += 3) { const cx = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, cz = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3, crack = Math.abs(Math.floor(cx * 60) + Math.floor(cz * 60)) % 2;
        _c.set(crack ? 0xc88a3a : 0xdca555); for (let q = 0; q < 3; q++) C.push(_c.r, _c.g, _c.b); }
      gi.computeVertexNormals(); A3.P.push(...P.array); A3.N.push(...gi.attributes.normal.array); A3.C.push(...C); put(A3, new THREE.CylinderGeometry(0.068 * K, 0.064 * K, 0.02 * K, 12), 0xe8c07a, M4(0, -0.01 * K, 0)); }
    const fm = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2808 });
    FOOD.forEach((F, k) => { const m = new THREE.InstancedMesh(geo([A0, A1, A2, A3][k]), fm, FOOD_MAX); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); F.m = m; });
  }
  const HALO = (() => {   // 光暈：暖黃色、一閃一閃，日夜都見到
    const p = new Float32Array(FOOD_MAX * 3), a = new Float32Array(FOOD_MAX), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('alpha', new THREE.BufferAttribute(a, 1)); g.setDrawRange(0, 0);
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { px: { value: 400 } },   // 普通混合（加色混合喺日頭淺色地面睇唔到）
      vertexShader: 'attribute float alpha; varying float vA; uniform float px; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = clamp(2. * px / max(-mv.z, .5), 4., 260.); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ float r = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., .15, r); gl_FragColor = vec4(mix(vec3(1., .72, .2), vec3(1., .97, .8), smoothstep(.6, 0., r)), a * a * vA); }' }));
    m.frustumCulled = false; scene.add(m); const fit = () => { m.material.uniforms.px.value = innerHeight * renderer.getPixelRatio() * 0.5; }; addEventListener('resize', fit); fit(); return { m, p, a, g }; })();
  const FL = []; let lastDrop = -99;
  function drop(o, force) {   // force：測試用（一定跌）
    if (FL.length >= FOOD_MAX || (!force && (GAME.t - lastDrop < DROP_CD || Math.random() >= DROP_P))) return;
    lastDrop = GAME.t; FL.push({ k: (Math.random() * FOOD.length) | 0, x: o.x + rand(-0.4, 0.4), z: o.z + rand(-0.4, 0.4), y: o.y, t: 0, ph: Math.random() * 6 });
  }
  const pop = (() => { document.head.insertAdjacentHTML('beforeend', '<style>#brkpop{position:fixed;left:0;right:0;top:64px;text-align:center;font-weight:900;font-size:18px;color:#9fff9a;text-shadow:0 0 6px #000;opacity:0;pointer-events:none;z-index:7}#brkpop.show{animation:brkp 1.3s ease-out}@keyframes brkp{0%{opacity:0;transform:translateY(8px)}15%{opacity:1;transform:none}70%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}</style>');
    const e = document.createElement('div'); e.id = 'brkpop'; document.body.appendChild(e); return (t) => { e.textContent = t; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }; })();
  function me() {   // 主角而家喺邊（執小食 / 現返之前檢查）
    const A = window.BRAWL && BRAWL.api;
    if ((cam.mode === 'brawl' || cam.mode === 'storm') && A) return A.player;
    if (cam.mode === 'open' && window.OPEN && OPEN.active) return OPEN.inCar ? OPEN.car : OPEN.hero;
    return null;
  }
  function stepFood(dt) {
    if (!FL.length && !HALO.g.drawRange.count) return;
    const A = window.BRAWL && BRAWL.api, P = me(), foodCan = P && A && !(cam.mode === 'open' && OPEN.inCar), cnt = [0, 0, 0, 0];
    for (let i = FL.length - 1; i >= 0; i--) { const f = FL[i]; f.t += dt;
      if (foodCan && Math.hypot(P.x - f.x, P.z - f.z) < 1.3 && A.player.hp < A.player.max) {   // 執到：回血（滿血就留喺度）
        const F = FOOD[f.k], got = Math.min(F.hp, A.player.max - A.player.hp); A.player.hp += got; if (A.SND.ctx) A.SND.pickup(); pop(`${F.e} ${F.n} +${Math.round(got)} 體力`); FL.splice(i, 1); continue; }
      if (f.t > FOOD_LIFE) FL.splice(i, 1); }
    const halo = HALO; let n = 0;
    for (const f of FL) { const F = FOOD[f.k], blink = f.t > FOOD_LIFE - 5 && Math.floor(f.t * 6) % 2, y = f.y + 0.55 + 0.12 * Math.sin(GAME.t * 3 + f.ph);
      _o.position.set(f.x, y, f.z); _o.rotation.set(f.k === 0 ? 0.35 : 0, GAME.t * 1.6 + f.ph, 0); _o.scale.setScalar(blink ? 0.001 : 1); _o.updateMatrix(); F.m.setMatrixAt(cnt[f.k]++, _o.matrix);
      halo.p.set([f.x, y + 0.15, f.z], n * 3); halo.a[n] = blink ? 0 : 0.5 + 0.2 * Math.sin(GAME.t * 5 + f.ph); n++; }
    FOOD.forEach((F, k) => { F.m.count = cnt[k]; F.m.instanceMatrix.needsUpdate = true; });
    halo.g.setDrawRange(0, n); halo.g.attributes.position.needsUpdate = halo.g.attributes.alpha.needsUpdate = true;
  }

  // ---------- 打爛 / 現返 ----------
  const broken = [], flying = [];
  function smash(o, dx, dz, pw) {
    o.st = 1; o.t = 0; broken.push(o); sound(o.k); drop(o); stats.broken++;
    if (!o.cb && o.m && pw > 3) { flying.push({ o, x: o.x, y: o.y, z: o.z, vx: dx * pw * 0.9, vy: 2 + pw * 0.45, vz: dz * pw * 0.9, rx: 0, rz: 0, wx: rand(-8, 8), wz: rand(-8, 8), t: 0, dx, dz, pw }); return; }   // v57（BG「彈開一陣先，然後先散」）：成件飛 0.9 秒先碎
    show(o, false); burst(o, dx, dz, pw);
  }
  function stepFly(dt) {
    for (let i = flying.length - 1; i >= 0; i--) { const f = flying[i], o = f.o; f.t += dt; f.vy -= 18 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.rx += f.wx * dt; f.rz += f.wz * dt;
      if (f.y < o.y) { f.y = o.y; f.vy *= -0.35; f.vx *= 0.6; f.vz *= 0.6; f.wx *= 0.6; f.wz *= 0.6; }
      if (f.t > 0.9 || o.st !== 1) { flying.splice(i, 1); if (o.st === 1) { show(o, false); burst({ k: o.k, big: o.big, x: f.x, y: o.y, z: f.z }, f.dx, f.dz, f.pw * 0.5); } continue; }
      _o.position.set(f.x, f.y, f.z); _o.rotation.set(f.rx, o.h, f.rz); _o.scale.set(1, 1, 1); _o.updateMatrix(); o.m.setMatrixAt(o.i, _o.matrix); o.m.instanceMatrix.needsUpdate = true; }
  }
  function near(x, z, r, fn) { const i0 = Math.floor((x - r) / 8), i1 = Math.floor((x + r) / 8), j0 = Math.floor((z - r) / 8), j1 = Math.floor((z + r) / 8);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const L = G.get(i * 100000 + j); if (L) for (const o of L) fn(o); } }
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function hitArc(cx, cz, range, arc, half, dmg, opts) {   // BRAWL doHit → objHit（自由行 + 紳士特工無雙任務）：同打人一樣嘅範圍 / 扇形
    const A = BRAWL.api, P = A.player; let n = 0;
    near(cx, cz, range + 0.8, (o) => { if (o.st || o.k >= 3) return;   // 鐵嘢打唔爛，要揸車撞
      const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz); if (d > range + 0.6) return;
      if (arc < 360 && d > 0.9 && Math.abs(wrapA(Math.atan2(dx, dz) - P.yaw)) > half + 0.25) return;
      smash(o, dx / (d || 1), dz / (d || 1), opts && (opts.fin || opts.musou || opts.charge) ? 7 : 4); n++; });
    return n;
  }
  function hook() {   // freefight.js 喺 OPEN.enter 設定 HOOK.objHit（打途人）→ 接埋打爛嘢（一次）
    const A = window.BRAWL && BRAWL.api; if (!A || A.HOOK.__brk) return; const f = A.HOOK.objHit;
    A.HOOK.objHit = (...a) => (f ? f(...a) : 0) + hitArc(...a); A.HOOK.__brk = 1;
  }
  { const e0 = OPEN.enter; OPEN.enter = (...a) => { const r = e0(...a); try { hook(); } catch (e) { console.warn('brk hook', e.message); } return r; }; }
  function ram() {   // 揸車撞：車身範圍（同 open.js 碰撞探針一樣大細）+ 0.3 米
    const c = OPEN.car, v = Math.abs(c.v); if (v < 2.5) return;
    const fx = Math.sin(c.h), fz = Math.cos(c.h), hl = (c.kind === 2 ? 5.6 : c.big ? 3.7 : 2.1) + 0.3, hw = (c.kind === 2 ? 1.1 : c.big ? 1.05 : 0.8) + 0.3, sg = Math.sign(c.v);
    near(c.x, c.z, hl + 1, (o) => { if (o.st || (o.big && v < 5) || Math.abs(o.y - (c.y || 0)) > 3) return; const dx = o.x - c.x, dz = o.z - c.z, a = dx * fx + dz * fz, s = dx * fz - dz * fx; const pad = o.big ? 0.5 : 0; if (Math.abs(a) > hl + pad || Math.abs(s) > hw + pad) return;   // v54：街燈 / 紅綠燈貼牆企（車頂住牆掂唔到）→ 範圍大 0.5 米
      smash(o, fx * sg * 0.8 + (s > 0 ? fz : -fz) * 0.4, fz * sg * 0.8 - (s > 0 ? fx : -fx) * 0.4, Math.min(9, 2 + v * 0.4)); if (o.k >= 3) c.v *= o.big ? 0.6 : 0.85; });   // v50：撞鐵嘢減速
    if (window.RAILS && RAILS.hits && Math.abs(c.y || 0) < 2) {   // v50：欄杆（一段段，撞中 = 瞓低，60 秒後企返）
      const bx = c.x + fx * hl * sg, bz = c.z + fz * hl * sg, ks = new Set([...RAILS.hits(c.x, c.z, bx, bz), ...RAILS.hits(bx - fz * hw, bz + fx * hw, bx + fz * hw, bz - fx * hw)]);
      for (const k of ks) { const o = { k: 6, x: bx, z: bz, y: 0.16, h: 0, st: 0, t: 0, f: 1, cb: (on) => RAILS.set(k, on) }; smash(o, fx * sg, fz * sg, Math.min(9, 2 + v * 0.4)); c.v *= 0.9; stats.rails++; } }
  }
  function stepRespawn(dt) {
    if (!broken.length) return; const P = me();
    for (let i = broken.length - 1; i >= 0; i--) { const o = broken[i]; o.t += dt;
      if (o.st === 1 && o.t >= RESPAWN && !(P && Math.hypot(P.x - o.x, P.z - o.z) < 1.5)) { o.st = 2; o.t = 0; fade(o, 0); show(o, true); }   // 主角企喺度就等
      else if (o.st === 2) { const f = Math.min(1, o.t / FADE); fade(o, f); if (f >= 1) { o.st = 0; broken.splice(i, 1); } } }
  }
  const stats = { broken: 0, bins: BIN ? __binPts.length : 0, card: newP[1].length, stool: newP[2].length, hyd: O.filter((o) => o.k === 3).length, lamp: O.filter((o) => o.k === 4).length, sig: O.filter((o) => o.k === 5).length, rails: 0, ms: 0 };
  stats.ms = Math.round(performance.now() - T0);
  return {
    step(dt) {
      if (window.OPEN && OPEN.active && cam.mode === 'open' && OPEN.inCar) ram();
      if (flying.length) stepFly(dt); if (chLive) stepChunks(dt); stepRespawn(dt); stepFood(dt);
    },
    stats, objs: O, food: FL, FOOD, smash, near, hitArc, drop, flying, puff: (x, y, z) => burst({ k: 7, x, y, z }, 0, 0, 2),
  };
})();
{ const s0 = GAME.step; GAME.step = function (dt) { s0.call(this, dt); if (window.HARB) HARB.step(dt); BRK.step(dt); }; }   // v42：船 + 打得爛嘅嘢（主循環之後行，同 GAME.step 一齊跟 dt）
;
window.BOOT && BOOT(0.996)
;
// v44 make_vend.py：自動售賣機 = SHOPF bay（b * 2 + 右邊 ? 1 : 0，36 進制差值）。n / sum = 過期檢查
window.VEND_DATA = { n: 71332, sum: 1012554332, count: 386, ids: '1l,n,5,k,21,2m,62,12,k,13,56,3y,t,46,1d,g,4,i,h,m,64,h,17,26,34,7,1c,1c,m,17,7,e,o,4p,g,1i,19,1e,x,1l,c,u,8,4p,22,13,p,d,f2,j,52,1d,h,4l,1i,2m,a,3g,7,d,3,3h,1c,2c,4l,v,r,4w,2p,3t,p,66,3m,eb,5b,20,b2,h,7h,b6,2,3,79,f,2j,8,1h,2y,y,10,1t,d,6z,2u,1m,1g,e,57,s,1b,7t,4,6,15,k,9o,ci,2f,s,1u,f,o,10,s,5,m,1m,w,1p,5z,2k,9s,r,60,1g,1y,33,3i,6l,82,ey,1t,2z,89,v,1f,2l,31,86,64,b,n,v,75,2z,e,c4,5,4g,it,4y,5e,14,5o,3b,2,1i,4g,14,ef,35,2s,oz,v,e,7b,24,1a,u,5i,s,2s,2h,9f,9h,7t,7,5k,w,z3,fm,43,1m,1t,h,2e,5y,1m,3m,6n,5s,6h,49,1o,3y,m4,3,a,cb,1d,2z,52,19,s,n,4z,bb,1,2j,3,3z,6g,5s,2m,3u,1d,i3,6q,ga,i6,8x,e0,m,cb,6j,6p,iv,dl,16,2d,90,6v,6h,5,9i,54,3j,11,o,8y,eu,n0,2m,23,fc,2q,8q,5o,lh,5c,1uv,73,af,7e,k,bg,h,7d,zf,1i,19l,1r,f,s,ht,84,7,5k,5,bk,dc,4x,25,3k,f8,a,q,c5,51,6x,1r,1a,e5,5l,9i,1,50,5j,g,b8,is,38,w,jx,5y,it,pz,ah,5t,68,n,5y,4c,oo,16,qk,5w,1c,gy,3,1p,6b,v,6v,13p,1j,qp,5,ad,9f,co,1kk,f6,vo,tu,ng,21,1ty,h6,2x,38,p,z,38,u,r,1mn,12a,4o,5a,2d,43,2u,b8,1u,p,f4,10,1ck,m,3s,39,h,15,2p,w,18,14,1f,10,6h,2b,x,5a,a,a3,5o,f7,l,1c4,6p,4y,ku,gr,12r,4z,d,2ab,t,2,fe,9k,ne,6p,15,ep' };
;
window.BOOT && BOOT(0.996)
;
if (!TOUCH) {   // v48：手機唔載 v44 售賣機 / 差佬拉落車 / Musk（三樣加埋令手機 100% 爆，BG 實測 t1–t4）
// ============ v44 自動售賣機（BG 10-01：「類似汽水機嘅可以俾玩家用錢去買飲品保能」）============
// 街上（行人路、貼住鋪頭一邊）有自動售賣機：行埋去 → E（手機撳「🥤 買」）→ 揀飲品 → 用遊戲錢買 → 回復體力 / 無雙。
// 飲品全部冇牌子、冇標誌（紙包檸檬茶、紙包豆奶、罐裝汽水、樽裝奶茶）；機身只寫「凍飲」。位置 🟡 = 遊戲擺位（唔係真實位置）。
// 價錢 vs 收入（GAME.md v44）：打低一個警察 $25–85、外賣一單 ~$100、小巴一轉 ~$300 → 最貴嘅奶茶 $15 = 半個 KO。
// 打緊交 / 有 ★ 嘅時候：即刻回復打鬥主角（BRAWL player）嘅體力 / 無雙。冇 ★（自由行）：體力本身已經滿（開打時會重新滿血）→ 淨係無雙有用：
//   儲起（最多 100），下一次開打（隨街打交 / 特工無雙 / 時空裂縫）一開始就有。體力 / 無雙都用唔到嘅飲品唔會收錢。
window.VEND = (() => {
  const $ = (id) => document.getElementById(id);
  const DRINKS = [
    { id: 'lemon', e: '🍋', n: '檸檬茶', d: '紙包', p: 8, hp: 60, mu: 0, col: '#ffd84a' },
    { id: 'soy', e: '🥛', n: '豆奶', d: '紙包', p: 8, hp: 40, mu: 10, col: '#f3e7c4' },
    { id: 'soda', e: '🥤', n: '汽水', d: '罐裝', p: 10, hp: 0, mu: 30, col: '#5ad0ff' },
    { id: 'milktea', e: '🧋', n: '奶茶', d: '樽裝', p: 15, hp: 100, mu: 15, col: '#c8915a' },
  ];
  const NEAR = 1.6, CELL = 100, T0 = performance.now();
  const S = { near: null, open: false, cd: 0, bank: 0, bought: 0, spent: 0, last: null, nearT: 0 };
  try { S.bank = Math.min(100, Math.max(0, +localStorage.getItem('hkcity-vend-bank') || 0)); } catch (e) {}
  const saveBank = () => { try { localStorage.setItem('hkcity-vend-bank', String(S.bank)); } catch (e) {} };

  // ---------- 擺位：鋪頭相前面（SHOPF.list bay）一邊，行人路要留 2.2 米；100 米格最多一部 ----------
  const M = [], G = new Map(), gk = (x, z) => Math.floor(x / 8) * 100000 + Math.floor(z / 8), cells = new Set();
  const foot = (x, z) => !!(window.__peds && __peds.onFoot(x, z));
  const EXS = (window.OPEN && OPEN.exits) || [], nearExit = (x, z) => EXS.some((e) => (e.ax - x) ** 2 + (e.az - z) ** 2 < 36 || (e.x - x) ** 2 + (e.z - z) ** 2 < 49);
  let OG = null;   // 路邊嘢（消防栓 / 垃圾桶）+ 打得爛嘅紙皮箱 / 膠凳：唔好疊埋（淨係要重新揀位先整）
  const buildOG = () => { const others = []; for (const [x, z] of window.__propPts || []) others.push(x, z); if (window.BRK) for (const o of BRK.objs) others.push(o.x, o.z);
    OG = new Map(); for (let i = 0; i < others.length; i += 2) { const q = Math.floor(others[i] / 4) * 100000 + Math.floor(others[i + 1] / 4); (OG.get(q) || OG.set(q, []).get(q)).push(others[i], others[i + 1]); } };
  const crowded = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = OG.get((Math.floor(x / 4) + i) * 100000 + Math.floor(z / 4) + j); if (L) for (let q = 0; q < L.length; q += 2) if ((L[q] - x) ** 2 + (L[q + 1] - z) ** 2 < r * r) return true; } return false; };
  const BL = (window.SHOPF && SHOPF.list) || [];
  let sum = 0; for (const B of BL) sum = (sum * 31 + Math.round(B[0] * 10) * 7 + Math.round(B[1] * 10)) | 0;   // 過期檢查（鋪頭 bay 變咗 → 重新揀位）
  const place = (bi, side) => {   // bay bi 嘅一邊（side ±1）：售賣機中心（背貼住鋪頭相 0.06 米）
    const [mx, mz, wx, wz, ox, oz, hw] = BL[bi], a = side * (hw - 0.6), d = 0.42, x = mx + wx * a + ox * d, z = mz + wz * a + oz * d;
    const m = { x, z, ox, oz, wx, wz, yaw: Math.atan2(ox, oz), y: 0.16, i: M.length, col: (rnd(mx + mz * 3.1) * 3) | 0, b: bi, s: side };
    M.push(m); const q = gk(x, z); (G.get(q) || G.set(q, []).get(q)).push(m); };
  const VD = window.VEND_DATA, fast = !!(VD && VD.n === BL.length && VD.sum === sum && !/[?&]vendcheck=1/.test(location.search));
  if (fast) { let b = 0; for (const t of VD.ids.split(',')) { b += parseInt(t, 36); place(b >> 1, b & 1 ? 1 : -1); } }   // v44：make_vend.py 預先揀好（原本逐間鋪檢查 ~90–190 ms）
  else for (let bi = 0, _o = buildOG(); bi < BL.length; bi++) {
    const [mx, mz, wx, wz, ox, oz, hw] = BL[bi]; if (hw < 1.3) continue;
    const r0 = rnd(mx * 1.37 + mz * 2.91); if (r0 > 0.5) continue;
    const cell = Math.floor(mx / CELL) * 10000 + Math.floor(mz / CELL); if (cells.has(cell)) continue;
    const side = rnd(mz * 0.71 - mx * 1.13) < 0.5 ? -1 : 1, a = side * (hw - 0.6), d = 0.42, x = mx + wx * a + ox * d, z = mz + wz * a + oz * d;
    if (blocked(x, z) || blocked(x + wx * 0.55, z + wz * 0.55) || blocked(x - wx * 0.55, z - wz * 0.55) || crowded(x, z, 1.8)) continue;   // 平嘅檢查行先
    if (!foot(x, z) || !foot(x + ox * 2.2, z + oz * 2.2) || SHOPF.zone(x + ox * 0.4, z + oz * 0.4, 0.1) || nearExit(x, z) || (window.OPEN && OPEN.inWater(x, z))) continue;
    cells.add(cell); place(bi, side);
  }
  const T1 = performance.now();
  const near = (x, z, r, fn) => { const i0 = Math.floor((x - r) / 8), i1 = Math.floor((x + r) / 8), j0 = Math.floor((z - r) / 8), j1 = Math.floor((z + r) / 8);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const L = G.get(i * 100000 + j); if (L) for (const m of L) fn(m); } };
  // 碰撞（open.js solid：主角、車、警察都行唔入部機）：機身 1.0 × 0.72 米（+ 0.2 米）
  function hit(x, z) {
    const L = G.get(gk(x, z)); let h = false;
    if (!L && !G.get(gk(x + 1, z)) && !G.get(gk(x - 1, z)) && !G.get(gk(x, z + 1)) && !G.get(gk(x, z - 1))) return false;
    near(x, z, 1.2, (m) => { if (h) return; const dx = x - m.x, dz = z - m.z, a = dx * m.wx + dz * m.wz, o = dx * m.ox + dz * m.oz; if (Math.abs(a) < 0.7 && Math.abs(o) < 0.56) h = true; });
    return h;
  }

  // ---------- 模型：機身（實例色：紅 / 藍 / 白）+ 前面發光陳列板（一張 canvas 貼圖；冇牌子，淨係「凍飲」同價錢）----------
  const W = 1.0, H = 1.85, D = 0.72;
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
    x.fillStyle = '#10161f'; x.fillRect(0, 0, 256, 512);
    x.fillStyle = '#1d2c44'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#fff'; x.font = '900 40px "PingFang HK","Noto Sans TC","Microsoft JhengHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('凍飲', 128, 34);
    const shelf = (y, draw) => { x.fillStyle = '#dfe9f5'; x.fillRect(10, y, 236, 92); draw(y); x.fillStyle = '#8a96a8'; x.fillRect(10, y + 88, 236, 6); };
    const tag = (cx, y, t) => { x.fillStyle = '#ffe14a'; x.fillRect(cx - 22, y + 96, 44, 18); x.fillStyle = '#111'; x.font = '900 15px sans-serif'; x.fillText(t, cx, y + 106); };
    shelf(80, (y) => { for (let k = 0; k < 4; k++) { const cx = 42 + k * 57; x.fillStyle = k % 2 ? '#f5d23a' : '#f0e2b8'; x.fillRect(cx - 17, y + 22, 34, 62); x.fillStyle = k % 2 ? '#3a8a2a' : '#c07a2a'; x.fillRect(cx - 17, y + 40, 34, 10); x.fillStyle = '#fff'; x.fillRect(cx - 4, y + 14, 8, 10); tag(cx, y, k % 2 ? '$8' : '$8'); } });   // 紙包檸檬茶 / 豆奶
    shelf(200, (y) => { for (let k = 0; k < 5; k++) { const cx = 34 + k * 47; x.fillStyle = ['#e23a3a', '#3a9ae2', '#f08a1a', '#3ac27a', '#9a4ae2'][k]; x.beginPath(); x.roundRect ? x.roundRect(cx - 15, y + 26, 30, 58, 6) : x.rect(cx - 15, y + 26, 30, 58); x.fill(); x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(cx - 11, y + 34, 5, 40); if (k % 2 === 0) tag(cx, y, '$10'); } });   // 罐裝汽水
    shelf(320, (y) => { for (let k = 0; k < 4; k++) { const cx = 42 + k * 57; x.fillStyle = '#7a4a26'; x.fillRect(cx - 14, y + 34, 28, 52); x.fillRect(cx - 7, y + 16, 14, 20); x.fillStyle = '#e8e0d0'; x.fillRect(cx - 14, y + 48, 28, 16); x.fillStyle = '#c62828'; x.fillRect(cx - 8, y + 10, 16, 8); tag(cx, y, '$15'); } });   // 樽裝奶茶
    x.fillStyle = '#2a3140'; x.fillRect(0, 440, 256, 72); x.fillStyle = '#050608'; x.fillRect(24, 462, 150, 38); x.fillStyle = '#9aa6b8'; x.fillRect(196, 454, 34, 10); x.fillRect(196, 474, 34, 22);   // 出貨口 + 入錢位
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  })();
  const bodyG = new THREE.BoxGeometry(W, H, D).translate(0, H / 2, 0), faceG = new THREE.PlaneGeometry(W * 0.86, H * 0.86).translate(0, H * 0.47, D / 2 + 0.005);
  const COLS = [0xb3222c, 0x2456a8, 0xe4e6ea];
  const body = new THREE.InstancedMesh(bodyG, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, M.length));
  const face = new THREE.InstancedMesh(faceG, new THREE.MeshBasicMaterial({ map: tex, color: 0xe6e6e6 }), Math.max(1, M.length));
  { const o = new THREE.Object3D(), c = new THREE.Color();
    M.forEach((m, i) => { o.position.set(m.x, m.y, m.z); o.rotation.set(0, m.yaw, 0); o.updateMatrix(); body.setMatrixAt(i, o.matrix); face.setMatrixAt(i, o.matrix); body.setColorAt(i, c.setHex(COLS[m.col])); });
    body.count = face.count = M.length; }
  body.frustumCulled = face.frustumCulled = false; scene.add(body, face);   // 全部實例一個 draw call（r128 InstancedMesh 用原點包圍球裁剪 → 關咗）

  const T2 = performance.now();
  // ---------- UI：售賣機選單 + 手機「🥤 買」（借用 open.js 嘅 #obE 掣）+ 提示 ----------
  document.head.insertAdjacentHTML('beforeend', `<style>
#vend{position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:55;width:min(440px,94vw);padding:10px 12px 12px;border-radius:14px;background:rgba(14,18,48,.95);border:1px solid rgba(90,208,255,.6);box-shadow:0 8px 30px #000;pointer-events:auto}
#vend .vh{display:flex;justify-content:space-between;align-items:center;font-weight:900;font-size:16px;margin-bottom:8px}#vend .vh b{color:#7dff6a}#vend .vh span{cursor:pointer;font-size:20px;padding:0 6px}
#vend .vg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}@media (max-width:420px){#vend .vg{grid-template-columns:repeat(2,1fr)}}
#vend button{padding:7px 2px 6px;border-radius:10px;background:rgba(255,255,255,.08);border:2px solid var(--c);color:#fff;font-family:inherit;cursor:pointer;text-align:center;line-height:1.25}
#vend button.no{opacity:.45;border-style:dashed}#vend .e{font-size:24px}#vend .n{font-weight:900;font-size:14px}#vend .p{font-weight:900;color:#ffd23f;font-size:14px}#vend .f{font-size:11px;color:#b8c4e6}
#vend .vf{font-size:12px;color:#9aa3c7;margin-top:6px;text-align:center;min-height:1.2em}
body.touch #vend{padding:8px 10px 10px}body.touch #vend .e{font-size:20px}
@media (orientation:portrait){body.touch #vend{top:178px}}   /* 手機直向：擺喺小地圖 / ❓🎵👤 下面（同任務框一樣），唔好遮住掣 */
@media (orientation:landscape){body.touch #vend{left:12px;transform:none;width:min(440px,calc(100vw - 236px));top:44px}body.touch #vend .vf{display:none}body.touch.ff #vend{top:62px}}   /* 手機打橫：靠左，唔好遮右邊 ❓🎵👤 / 小地圖 / 打 */
#vpop{position:fixed;left:0;right:0;top:92px;text-align:center;font-weight:900;font-size:18px;color:#9fe8ff;text-shadow:0 0 6px #000;opacity:0;pointer-events:none;z-index:7}
#vpop.show{animation:vpop 1.6s ease-out}@keyframes vpop{0%{opacity:0;transform:translateY(8px)}12%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
body.touch.ff-fight.vend-near #obE{display:flex!important;bottom:124px}   /* 手機打緊交行到售賣機：「🥤 買」喺「蓄」上面（同 v41 上車一樣） */
</style>`);
  document.body.insertAdjacentHTML('beforeend', '<div id="vend" hidden><div class="vh"><span style="cursor:auto;font-size:16px;padding:0">🥤 自動售賣機・錢包 <b id="vmoney"></b></span><span id="vendx">✕</span></div><div class="vg" id="vgrid"></div><div class="vf" id="vfoot"></div></div><div id="vpop"></div>');
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'click', 'wheel', 'touchstart']) $('vend').addEventListener(ev, (e) => e.stopPropagation());
  $('vendx').onclick = () => close();
  const pop = (t, col) => { const e = $('vpop'); e.textContent = t; e.style.color = col || '#9fe8ff'; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); };

  const A = () => window.BRAWL && BRAWL.api;
  const inSession = () => !!(window.FREEFIGHT && FREEFIGHT.on && A() && A().GAME.state === 'play');   // 有 ★ / 打緊交：打鬥主角嘅體力 / 無雙係「真」嘅
  function need(dk) {   // 呢支飲品而家有冇用：[體力可以加幾多, 無雙可以加幾多]
    const a = A(); if (inSession()) { const P = a.player; return [Math.min(dk.hp, Math.max(0, P.max - P.hp)), Math.min(dk.mu, Math.max(0, 100 - P.musou))]; }
    return [0, Math.min(dk.mu, 100 - S.bank)];   // 冇 ★：體力已經滿；無雙儲起下次開打用
  }
  function draw() {
    $('vmoney').textContent = '$' + OPEN.money.toLocaleString();
    const g = $('vgrid'); g.innerHTML = '';
    DRINKS.forEach((dk, k) => {
      const [h, m] = need(dk), poor = OPEN.money < dk.p, use = h > 0 || m > 0, b = document.createElement('button');
      b.className = poor || !use || S.cd > 0 ? 'no' : ''; b.style.setProperty('--c', dk.col);
      b.innerHTML = `<div class="e">${dk.e}</div><div class="n">${dk.n}</div><div class="p">$${dk.p}</div><div class="f">${[dk.hp ? '體力 +' + dk.hp : '', dk.mu ? '無雙 +' + dk.mu : ''].filter(Boolean).join('・')}</div>`;
      b.onclick = () => buy(k); g.appendChild(b);
    });
    $('vfoot').textContent = inSession() ? `體力 ${Math.round(A().player.hp)} / ${A().player.max}・無雙 ${Math.round(A().player.musou)} / 100` + (TOUCH ? '' : '・撳 1–4 買・Esc 閂')
      : `冇 ★：體力已經滿・無雙可以儲起（${Math.round(S.bank)} / 100），下次開打用` + (TOUCH ? '' : '・撳 1–4 買・Esc 閂');
  }
  function buy(k) {
    const dk = DRINKS[k]; if (!dk || !S.open || S.cd > 0) return false;
    const [h, m] = need(dk), a = A(), snd = a && a.SND && a.SND.ctx ? a.SND : null;
    if (OPEN.money < dk.p) { S.last = { k, ok: false, why: 'money' }; pop(`💸 唔夠錢：${dk.n} 要 $${dk.p}，你得 $${OPEN.money}`, '#ff8a6a'); if (snd) snd.tone(150, 0.18, 'square', 0.06, 0.8); draw(); return false; }
    if (!h && !m) { S.last = { k, ok: false, why: 'full' }; pop(inSession() ? `${dk.e} 而家唔使飲住（${dk.hp && !dk.mu ? '體力' : dk.mu && !dk.hp ? '無雙' : '體力同無雙'}已經滿）` : `${dk.e} 冇 ★ 時體力本身已經滿${dk.mu ? '・無雙都儲滿咗' : ''}`, '#ffd23f'); if (snd) snd.tone(300, 0.1, 'triangle', 0.05); draw(); return false; }
    OPEN.addMoney(-dk.p); S.bought++; S.spent += dk.p; S.cd = 0.8;
    if (inSession()) { const P = a.player; P.hp += h; P.musou = Math.min(100, P.musou + m);
      const hb = $('ag-hpb'), mb = $('ag-msb'); if (hb) hb.firstElementChild.style.width = (P.hp / P.max * 100) + '%'; if (mb) { mb.firstElementChild.style.width = P.musou + '%'; mb.classList.toggle('full', P.musou >= 100); } }
    else { S.bank = Math.min(100, S.bank + m); saveBank(); }
    S.last = { k, ok: true, hp: h, mu: m, price: dk.p, session: inSession(), bank: S.bank };
    pop(`${dk.e} ${dk.n} −$${dk.p}　${[h ? '體力 +' + h : '', m ? '無雙 +' + m + (inSession() ? '' : '（下次開打用）') : ''].filter(Boolean).join('・')}`);
    if (snd) { snd.tone(110, 0.12, 'sine', 0.35, 0.6); snd.noise(0.12, 0.25, 900, 200, 'lowpass', 0.08); snd.tone(880, 0.08, 'triangle', 0.06, 1, 0.3); }   // 咚（跌落出貨口）+ 叮
    draw(); return true;
  }
  function open() { if (!S.near || S.open) return; S.open = true; $('vend').hidden = false; $('oprompt').hidden = true; draw(); if (A() && A().SND) A().SND.init(); }
  function close() { if (!S.open) return; S.open = false; $('vend').hidden = true; }
  // 開打（GAME.start：隨街打交 / 特工無雙 / 時空裂縫）：儲起嘅無雙加返落去
  let wrapped = false;
  function wrapStart() {
    const a = A(); if (!a || wrapped) return; wrapped = true; const s0 = a.GAME.start;
    a.GAME.start = function (...x) { const r = s0.apply(this, x); if (S.bank > 0) { a.player.musou = Math.min(100, a.player.musou + S.bank); S.used = S.bank; S.bank = 0; saveBank(); } return r; };
  }

  // ---------- 輸入：E / 1–4 / Esc（capture：行近售賣機時 E = 買嘢，唔係上車）；手機 #obE（capture）----------
  addEventListener('keydown', (e) => {
    if (!OPEN.active || e.repeat) return; const k = e.key.toLowerCase();
    if (S.open && (k === 'escape' || k === 'e')) { close(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (S.open && k >= '1' && k <= '4') { buy(+k - 1); e.stopImmediatePropagation(); return; }
    if (k === 'e' && S.near && !OPEN.inCar) { open(); e.stopImmediatePropagation(); }
  }, true);
  $('obE').addEventListener('pointerdown', (e) => { if (S.near && !OPEN.inCar && !S.open) { e.stopImmediatePropagation(); e.preventDefault(); open(); } }, true);

  // ---------- 每格（GAME.step 之後）----------
  function step(dt) {
    if (S.cd > 0 && (S.cd -= dt) <= 0 && S.open) draw();
    wrapStart();
    const mode = cam.mode, ok = window.OPEN && OPEN.active && !OPEN.inCar && (mode === 'open' || mode === 'brawl') && !(window.LIB && (LIB.inside || LIB.busy)) && !(window.IND && (IND.inside || IND.busy)) && $('omtr').hidden;
    let nb = null;
    if (ok) { const H = OPEN.hero; let bd = NEAR; near(H.x, H.z, 2, (m) => { const d = Math.hypot(H.x - (m.x + m.ox * 0.55), H.z - (m.z + m.oz * 0.55)); if (d < bd) { bd = d; nb = m; } }); }
    if (nb !== S.near) { S.near = nb; document.body.classList.toggle('vend-near', !!nb); if (!nb) close(); }
    if (nb) {
      const pr = $('oprompt'); pr.hidden = S.open; pr.textContent = TOUCH ? '撳「🥤 買」：自動售賣機（凍飲）' : 'E 買嘢飲：自動售賣機（凍飲）';   // 選單開咗就唔使提示
      if (!S.open) $('obE').textContent = '🥤 買';
      if (S.open && (S.nearT -= dt) <= 0) { S.nearT = 0.5; draw(); }   // 體力 / 錢變咗（例如打緊交）
    }
  }
  // 小地圖：200 米內嘅售賣機 = 細藍色方塊（open.js 畫完 + freefight.js 紅點之後）
  function map() {
    if (!window.OPEN || !OPEN.active || !M.length || (cam.mode !== 'open' && cam.mode !== 'brawl')) return;   // 淨係 open.js hud() 重畫咗小地圖嘅模式
    const x = $('omap').getContext('2d'), Sc = 150 / 250, O = OPEN.hero;
    x.save(); x.beginPath(); x.arc(150, 150, 146, 0, 7); x.clip(); x.fillStyle = '#5ad0ff'; x.strokeStyle = '#fff'; x.lineWidth = 1.5;
    for (const m of M) { const dx = (m.x - O.x) * Sc, dz = (m.z - O.z) * Sc; if (dx * dx + dz * dz > 140 * 140) continue; x.fillRect(146 + dx, 146 + dz, 8, 8); x.strokeRect(146 + dx, 146 + dz, 8, 8); }   // 386 部：直接掃（比 240 米內 3,600 個格仔平）
    x.restore();
  }
  const stats = { n: M.length, ms: Math.round(performance.now() - T0), place: Math.round(T1 - T0), mesh: Math.round(T2 - T1), fast, stale: !!VD && !fast };
  const dump = () => { let prev = 0; return { n: BL.length, sum, count: M.length, ids: M.map((m) => { const v = m.b * 2 + (m.s > 0 ? 1 : 0), d = v - prev; prev = v; return d.toString(36); }).join(',') }; };   // make_vend.py 用
  return { step, map, hit, buy, open, close, list: M, DRINKS, S, stats, dump, meshes: [body, face], get near() { return S.near; } };
})();
{ const s0 = GAME.step; GAME.step = function (dt) { s0.call(this, dt); VEND.step(dt); VEND.map(); }; }   // v44：售賣機（主循環之後，同 v42 船 / 打得爛嘅嘢一樣做法）
}
;
window.BOOT && BOOT(0.996)
;
if (!TOUCH) {
// ============ v44 差佬識搵人落車 + ★3 警車趕到（BG 10-01：「差佬識搵人落車」；v40 / v41 未做嘅「★3+ 警車駛埋嚟、警察落車」）============
// ① 拉落車：有 ★ 揸緊車，車停咗 / 好慢（< 1.5 m/s，包括俾人 / 車 / 牆夾住）而有警察行到司機位（香港右軚 = 車右邊）1.2 米內 →
//    提示「🚔 差佬嚟緊拉你落車！快啲開車！」0.9 秒（呢段時間開車走得甩）→ 拉你落車（open.js leaveCar = 右邊落車）、跌一跌（BRAWL 'hurt'）、即刻開打。
//    有 ★ 坐喺停咗嘅車入面：警察會喺附近派過嚟（每 2 秒兩個，最多 2 + ★ 個；freefight.js 本身揸車時唔派），喺度搵緊你嘅警察會行埋架車度。
// ② 警車：★3 或以上（而家唔喺圖書館 / 地鐵選單）→ 借一架遠處嘅街上警車 / 警車 van（TRAFFIC 紀律部隊車，v21）：由你附近嗰段車道倒數 ~70 米起步，
//    閃燈、唔等紅燈，跟住規劃好嘅車道行埋嚟，喺你前面停低，兩個警察由車門兩邊落車追你（★4+ 其中一個係警長）。
//    塞車塞住 > 3 秒（45 米內）或者 16 秒都未到 → 喺原地落車。你走咗 > 60 米 → 取消（架車照常行走），8 秒後再派。★ 散晒 / 你走遠咗 → 架車熄燈照常行。
// 警察唔開槍、冇字冇章（同 v40 一樣）；警車照舊係 TRAFFIC 入面嘅街車（冇新模型）。
window.COPCAR = (() => {
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const D = { t: 0, cop: -1, drags: 0, last: null, stillT: 0, spawnT: 0 };
  const PC = { car: null, st: '', t: 0, cool: 3, tx: 0, tz: 0, L0: null, s0: 0, n: 0, log: [], v0: 0, stuckT: 0, deployed: 0 };
  const big = (t, col) => { const b = $('obig'); if (!b) return; b.textContent = t; b.style.color = col; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); };
  const libIn = () => !!((window.LIB && (LIB.inside || LIB.busy)) || (window.IND && (IND.inside || IND.busy)));
  const onScreen = (x, z) => { const v = new THREE.Vector3(x, 1.2, z).project(camera); return v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; };
  const solidFn = (x, z) => window.IND && IND.inside ? IND.foot(x, z) : window.LIB ? LIB.foot(x, z) : OPEN.solid(x, z);

  // ---------- ① 拉落車 ----------
  function door(c, out) {   // 司機位車門外面（右軚：車右邊，前座）
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = fz, rz = -fx, hw = c.kind === 2 || c.big ? 1.3 : 0.95;
    out.x = c.x + rx * (hw + 0.45) + fx * 0.35; out.z = c.z + rz * (hw + 0.45) + fz * 0.35; return out;
  }
  const _dp = { x: 0, z: 0 };
  function dragStep(dt, A, FF) {
    const c = OPEN.car, S = A.S, N = S.alive.length;
    if (!OPEN.inCar || Math.abs(c.v) >= 1.5 || c.y > 0.35 || FF.F.down > 0 || cam.mode !== 'open') { if (D.t > 0) $('oprompt').hidden = true; D.t = 0; D.cop = -1; D.stillT = 0; return; }
    D.stillT += dt; door(c, _dp);
    // 冇警察喺附近：派（freefight.js 揸車時唔派人；停咗車 = 佢哋行埋嚟）
    let alive = 0, best = -1, bd = 3.2; for (let i = 0; i < N; i++) if (S.alive[i]) { alive++; if (S.st[i] < 4 && S.y[i] < 0.3) { const d = Math.hypot(S.x[i] - _dp.x, S.z[i] - _dp.z); if (d < bd) { bd = d; best = i; } } }
    if (D.stillT > 1.2 && (D.spawnT -= dt) <= 0 && alive < Math.min(2 + FF.stars, 6)) { D.spawnT = 2; spawnNear(A, c.x, c.z, 2, 12, 20); }
    if (D.stillT > 1.5 && (D.callT = (D.callT || 0) - dt) <= 0) {   // 有人報警：你停咗喺呢度 → 警察嚟呢度搵（唔係去你之前最後出現嘅位）
      D.callT = 1; FF.F.lastX = c.x; FF.F.lastZ = c.z;
      for (let i = 0; i < N; i++) if (S.alive[i] && !S.eng[i] && Math.hypot(S.x[i] - c.x, S.z[i] - c.z) > 5) { S.hx[i] = _dp.x + rand(-2, 2); S.hz[i] = _dp.z + rand(-2, 2); }
    }
    { let nearCop = false; for (let i = 0; i < N; i++) if (S.alive[i] && Math.hypot(S.x[i] - c.x, S.z[i] - c.z) < 10) { nearCop = true; break; }
      D.noShowT = nearCop ? 0 : (D.noShowT || 0) + dt;
      if (D.noShowT > 6) { D.noShowT = 0; for (let i = 0; i < N; i++) if (S.alive[i] && Math.hypot(S.x[i] - c.x, S.z[i] - c.z) > 25 && !onScreen(S.x[i], S.z[i])) S.alive[i] = 0; D.spawnT = 0; }   // 6 秒都冇人行到嚟（卡咗喺樓後面）：遠處睇唔到嘅收走，再派有直路嘅
    }
    if (best < 0) { if (D.t > 0) $('oprompt').hidden = true; D.t = 0; D.cop = -1; return; }
    // 有警察行到車門：佢企埋車門、望住你；0.9 秒後拉你落車（呢段時間開車走得甩）
    D.cop = best; D.t += dt; S.eng[best] = 1;
    const k = Math.min(1, dt * 6); S.x[best] += (_dp.x - S.x[best]) * k; S.z[best] += (_dp.z - S.z[best]) * k; S.yaw[best] = Math.atan2(c.x - S.x[best], c.z - S.z[best]);
    if (S.st[best] === 0) { S.st[best] = 1; S.t[best] = 0; }   // 伸手（蓄勢姿勢）
    const pr = $('oprompt'); pr.hidden = false; pr.textContent = '🚔 差佬嚟緊拉你落車！快啲開車！';
    if (D.t < 0.9) return;
    // 拉落車 → 開打
    const P = A.player; D.t = 0; D.drags++; pr.hidden = true;
    OPEN.leaveCar();
    const H = OPEN.hero, ux = H.x - c.x, uz = H.z - c.z, ul = Math.hypot(ux, uz) || 1;
    S.x[best] = H.x + ux / ul * 0.9; S.z[best] = H.z + uz / ul * 0.9; S.st[best] = 3; S.t[best] = 0;   // 警察企喺你身邊（拉完收手）
    FF.engage(false);
    if (FF.fighting) { Object.assign(P, { st: 'hurt', t: 0, vy: 4.5, y: 0.01, kx: ux / ul * 4, kz: uz / ul * 4, inv: 0.9, move: null }); P.yaw = Math.atan2(-ux, -uz); }   // 俾人扯出嚟：跌一跌（唔扣血）
    for (let i = 0; i < N; i++) if (S.alive[i]) S.eng[i] = 1;
    big('🚔 俾差佬拉咗落車！', '#ff6a5a'); if (A.SND.ctx) { A.SND.noise(0.25, 0.3, 700, 180, 'lowpass'); A.SND.tone(220, 0.15, 'square', 0.06, 0.7); }
    D.last = { t: GAME.t, v: +Math.abs(c.v).toFixed(2), hero: [+H.x.toFixed(1), +H.z.toFixed(1)], cop: best, fight: FF.fighting };
  }
  function spawnNear(A, tx, tz, n, r0, r1) {   // 同 freefight.js spawnGang：鏡頭睇唔到、同目標之間冇樓
    const F = FREEFIGHT.F, s = FREEFIGHT.stars; let got = 0, fb = null;
    for (let t = 0; t < 24 && got < n; t++) {
      const a = Math.random() * Math.PI * 2, r = rand(r0, r1), x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;
      if (solidFn(x, z) || clearFrac(x, 1.6, z, tx, 1.6, tz) < 0.999) continue;
      if (onScreen(x, z)) { if (!fb) fb = [x, z]; continue; }
      put(A, x, z, s); got++;
    }
    if (!got && fb) { put(A, fb[0], fb[1], s); got++; }
    return got;
  }
  function put(A, x, z, s, sergeant) {
    const F = FREEFIGHT.F, i = A.spawn(x, z, 1, sergeant || (s >= 4 && Math.random() < 0.5) ? 1 : 0); if (i < 0) return -1;
    A.S.hx[i] = F.lastX + rand(-3, 3); A.S.hz[i] = F.lastZ + rand(-3, 3); A.S.lx[i] = x; A.S.lz[i] = z; return i;
  }

  // ---------- ② ★3+ 警車 ----------
  let prev = null, grid = null;
  function prep() {   // 車道：倒轉接駁（邊條車道駛入呢條）+ 20 米格（每 4 米一個樣本）
    if (prev) return; const LN = TRAFFIC.lanes; prev = LN.map(() => []); grid = new Map();
    LN.forEach((L, i) => { for (const j of L.next) prev[j].push(i); });
    LN.forEach((L, i) => { if (L.hs) return; for (let s = 0; s <= L.len; s += 4) { const p = at(L, s), q = Math.floor(p[0] / 20) * 100000 + Math.floor(p[1] / 20); (grid.get(q) || grid.set(q, []).get(q)).push(i, s, p[0], p[1]); } });   // 淨係地面車道（天橋上唔派）
  }
  function at(L, s) { let k = 1; while (k < L.cum.length - 1 && L.cum[k] < s) k++; const a = L.pts[k - 1], b = L.pts[k], seg = L.cum[k] - L.cum[k - 1] || 1, t = Math.min(1, Math.max(0, (s - L.cum[k - 1]) / seg)); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function plan(tx, tz) {   // 你附近嘅車道點 → 倒數 ~70 米嘅起點 + 路線
    const LN = TRAFFIC.lanes, cand = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const L = grid.get((Math.floor(tx / 20) + i) * 100000 + Math.floor(tz / 20) + j); if (L) for (let q = 0; q < L.length; q += 4) { const d = Math.hypot(L[q + 2] - tx, L[q + 3] - tz); if (d < 30) cand.push([d, L[q], L[q + 1]]); } }
    cand.sort((a, b) => a[0] - b[0]); let best = null;
    for (const [, li, s] of cand.slice(0, 12)) {
      const L0 = LN[li], s0 = Math.max(2, s - 5);   // 停喺最近點後面 5 米（唔好撞埋你）
      for (let tr = 0; tr < 4; tr++) {
        const chain = [li]; let rem = 70 - s0, cur = li, startS = s0 - 70;
        while (rem > 0) {
          const ps = prev[cur].filter((p) => !LN[p].hs && !chain.includes(p)); if (!ps.length) { startS = 0; break; }
          const p = ps[Math.floor(Math.random() * ps.length)]; chain.unshift(p);
          if (LN[p].len >= rem) { startS = LN[p].len - rem; rem = 0; } else { rem -= LN[p].len; cur = p; startS = 0; }
        }
        const sp = at(LN[chain[0]], Math.max(0, startS)), d = Math.hypot(sp[0] - tx, sp[1] - tz), off = !onScreen(sp[0], sp[1]);
        const r = { chain, startS: Math.max(0, startS), L0, s0, sp, d, off };
        if (d >= 35 && off) return r;   // 起點夠遠（≥ 35 米）又喺鏡頭外：用
        if (!best || (off && !best.off) || (off === best.off && d > best.d)) best = r;   // 否則記住最好嗰個（鏡頭外優先、再揀最遠）
      }
    }
    return best;
  }
  function dispatch(tx, tz) {
    prep(); const r = plan(tx, tz); if (!r) { PC.log.push({ t: +GAME.t.toFixed(1), ev: 'noroute' }); return false; }
    const cx = camera.position.x, cz = camera.position.z; let car = null, bd = -1;
    for (const c of TRAFFIC.emv) { if (c.taken || c.parked || c.hold !== undefined || (c.model !== 'police_car' && c.model !== 'police_van')) continue; const d = Math.hypot(c.x - cx, c.z - cz); if (d > 150 && !onScreen(c.x, c.z) && d > bd) { bd = d; car = c; } }   // 遠處、鏡頭睇唔到嘅警車（突然消失冇人見到）
    if (!car) { PC.log.push({ t: +GAME.t.toFixed(1), ev: 'nocar' }); return false; }
    const LN = TRAFFIC.lanes, L = LN[r.chain[0]], i = car.L.cars.indexOf(car); if (i >= 0) car.L.cars.splice(i, 1);
    car.L = L; car.s = r.startS; car.cur = 10; L.cars.push(car);
    PC.v0 = car.v; car.v = 16; car.siren = true; car.route = r.chain.slice(1); car.holdL = r.L0; car.hold = r.s0;
    Object.assign(PC, { car, st: 'drive', t: 0, tx, tz, L0: r.L0, s0: r.s0, stuckT: 0, deployed: 0 }); PC.n++;
    PC.log.push({ t: +GAME.t.toFixed(1), ev: 'dispatch', model: car.model, from: [Math.round(r.sp[0]), Math.round(r.sp[1])], dist: Math.round(r.d), offscreen: r.off, lanes: r.chain.length });
    return true;
  }
  function release(why) {   // 熄燈、照常行（塞返入交通）
    const c = PC.car; if (!c) return; c.hold = c.holdL = c.route = undefined; c.siren = false; c.v = PC.v0 || 10; PC.car = null; PC.st = ''; PC.cool = why === 'far' ? 8 : 25;
    PC.log.push({ t: +GAME.t.toFixed(1), ev: 'release', why });
  }
  function deploy(A) {   // 兩個警察由車門兩邊落車
    const c = PC.car, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = fz, rz = -fx, s = FREEFIGHT.stars; let n = 0;
    for (const sd of [1, -1]) {
      let x = c.x + rx * sd * 1.45 + fx * 0.3, z = c.z + rz * sd * 1.45 + fz * 0.3; if (solidFn(x, z)) { x = c.x - fx * 3.2; z = c.z - fz * 3.2; }
      const i = put(A, x, z, s, s >= 4 && sd < 0); if (i >= 0) { A.S.yaw[i] = Math.atan2(rx * sd, rz * sd); A.S.eng[i] = 1; n++; }
    }
    PC.st = 'parked'; PC.deployed = n; PC.t = 0; c.hold = c.s; c.holdL = c.L;   // 喺而家個位停住（閃燈）
    PC.log.push({ t: +GAME.t.toFixed(1), ev: 'deploy', n, car: [Math.round(c.x), Math.round(c.z)], toPlayer: Math.round(Math.hypot(c.x - OPEN.hero.x, c.z - OPEN.hero.z)) });
  }
  function carStep(dt, A, FF) {
    const s = FF.stars, H = OPEN.inCar ? OPEN.car : OPEN.hero, ok = FF.on && OPEN.active && (cam.mode === 'open' || cam.mode === 'brawl') && !libIn() && $('omtr').hidden;
    if (!PC.car) {
      PC.cool -= dt;
      if (ok && s >= 3 && PC.cool <= 0 && FF.F.down <= 0) { PC.cool = 4; dispatch(H.x, H.z); }
      return;
    }
    const c = PC.car; PC.t += dt;
    if (!FF.on || s === 0 || !OPEN.active) return release('clear');
    const dp = Math.hypot(c.x - H.x, c.z - H.z);
    if (PC.st === 'drive') {
      if (Math.hypot(H.x - PC.tx, H.z - PC.tz) > 60) return release('far');   // 你走咗
      PC.stuckT = c.cur < 0.4 ? PC.stuckT + dt : 0;
      const arrived = c.L === PC.L0 && c.s >= PC.s0 - 0.6 && c.cur < 0.6;
      if (arrived || (c.cur < 0.4 && dp < 16 && PC.t > 1) || (PC.stuckT > 3 && dp < 45) || (PC.t > 16 && dp < 80)) deploy(A);   // 到咗 / 已經停喺你附近（街車會喺你前面 8 米停）/ 塞車
      else if (PC.t > 16) release('late');
    } else if (PC.st === 'parked' && dp > 150) release('left');   // 落完車：閃住燈停喺度，直到 ★ 散 / 你走遠
  }

  // ---------- 每格：freefight.js tick 之後 ----------
  { const t0 = FREEFIGHT.tick; FREEFIGHT.tick = (dt) => { t0(dt); const FF = FREEFIGHT, A = FF.api; if (!A) return; try { if (FF.on) dragStep(dt, A, FF); carStep(dt, A, FF); } catch (e) { console.warn('copcar', e.message); } }; }
  return { D, PC, dispatch, release, plan: (x, z) => (prep(), plan(x, z)) };
})();
}
;
window.BOOT && BOOT(0.997)
;
if (!TOUCH) {
// ============ v44 火箭富豪 Musk（BG 09-30 / 10-01：Elon Musk 做可以揀嘅角色，卡通公仔樣、揸住支火箭，大招 = 召喚火箭）============
// BG 知道用真人樣嘅風險之後明確揀咗用。守則：友善卡通化，冇侮辱、冇政治、冇任何品牌 / 標誌 / 公司名（火箭係白身黑頭嘅程式模型，冇字）。
// 骨架 + 貼圖好大（~1.2 MB）→ hero_musk.js（make_musk.py，揀咗先載；動作用 hero_clips.js，同女特工一樣）。呢個檔（入 hkcity.html）：
//   ① rocket()：程式火箭（白色機身、黑色機頭、黑色尾翼、黑框舷窗、一格紅色方塊、深灰噴嘴）
//   ② hug(R)：開放世界主角（hero_pick.js openRig）右手攬住火箭企直（好似 BG 揀嗰張概念圖）：每格動作之後用兩節 IK 擺右手，火箭跟手
//   ③ ext(api)：BRAWL engine（隨街打交 / 特工無雙任務 / 時空裂縫）加 'musk' 角色（api.inject，同 rift_code.js 一樣做法）：
//      招式同特工一樣（N / CH），企 / 跑時攬住火箭，出招時揸住火箭尾當棍揮；無雙 = 「火箭・無雙」：隻火箭射上天，
//      之後 8 支火箭由天上射落附近敵人（火 + 煙），最後一支大嘅 = engine 原本 3 秒時嘅大爆炸。
window.MUSK = (() => {
  // ---------- ① 火箭（沿 +z，z = 0 = 噴嘴底；長 1 米）----------
  let GEO = null, MAT = null;
  function build() {
    const P = [], N = [], C = [], col = new THREE.Color();
    const put = (g0, c, m) => { const g = g0.index ? g0.toNonIndexed() : g0; if (m) g.applyMatrix4(m); g.computeVertexNormals(); col.set(c);
      const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i += 3) { P.push(p[i], p[i + 1], p[i + 2]); N.push(n[i], n[i + 1], n[i + 2]); C.push(col.r, col.g, col.b); } };
    const Z = (z) => new THREE.Matrix4().makeTranslation(0, 0, z), RX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const WHITE = 0xe2e2e0, BLACK = 0x18181b;
    put(new THREE.CylinderGeometry(0.058, 0.045, 0.07, 14).applyMatrix4(RX), 0x3a3c42, Z(0.035));          // 噴嘴
    put(new THREE.CylinderGeometry(0.075, 0.07, 0.66, 18).applyMatrix4(RX), WHITE, Z(0.4));                 // 機身（下面收少少）
    put(new THREE.CylinderGeometry(0.077, 0.077, 0.035, 18).applyMatrix4(RX), BLACK, Z(0.73));              // 黑色間條
    put(new THREE.ConeGeometry(0.075, 0.27, 18).applyMatrix4(RX), BLACK, Z(0.87));                          // 機頭
    for (let k = 0; k < 4; k++) {                                                                           // 尾翼 × 4（梯形薄片）
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.1, -0.02); sh.lineTo(0.1, 0.08); sh.lineTo(0, 0.24);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: false }); g.translate(0.068, 0, -0.007);
      put(g, BLACK, new THREE.Matrix4().makeRotationZ(k * Math.PI / 2 + Math.PI / 4).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(Z(0)).premultiply(Z(0.04)));
    }
    put(new THREE.TorusGeometry(0.036, 0.009, 6, 16), BLACK, new THREE.Matrix4().makeTranslation(0, 0.072, 0.56).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));   // 舷窗框
    put(new THREE.CircleGeometry(0.03, 14), 0x6d8fb0, new THREE.Matrix4().makeTranslation(0, 0.074, 0.56).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)));         // 舷窗玻璃
    put(new THREE.BoxGeometry(0.05, 0.012, 0.05), 0xc81e1e, new THREE.Matrix4().makeTranslation(0, 0.073, 0.3));                                                              // 紅色方塊（冇字）
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeBoundingSphere();
    GEO = g; MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  function rocket() { if (!GEO) build(); const m = new THREE.Mesh(GEO, MAT); m.frustumCulled = false; return m; }

  // ---------- 兩節 IK：右手攬住火箭（開放世界 + 打鬥企 / 跑都用）----------
  const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
  const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _W = new THREE.Vector3(), _T = new THREE.Vector3(), _d = new THREE.Vector3(), _pv = new THREE.Vector3();
  const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _l = new THREE.Vector3(), _c = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gs = new THREE.Vector3(), _Ek = new THREE.Vector3(), _Tk = new THREE.Vector3();
  function aim(bone, from, to) {   // 轉 bone，令佢個 child（而家喺 from）去 to
    bone.getWorldPosition(_p); _a.subVectors(from, _p).normalize(); _b.subVectors(to, _p).normalize(); if (_a.lengthSq() < 1e-8 || _b.lengthSq() < 1e-8) return;
    _q.setFromUnitVectors(_a, _b); bone.getWorldQuaternion(_wq); _wq.premultiply(_q);
    bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(_wq)); bone.updateMatrixWorld(true);
  }
  // g = 角色 group（面向本地 +z，左手 = +x）；B = bones；k = 角色世界縮放（網格單位 → 米）。結果：手喺 _T，火箭世界位置 / 方向寫入 out
  function hugArm(g, B, k, w, out) {
    g.updateMatrixWorld(true); g.getWorldQuaternion(_gq);
    _f.set(0, 0, 1).applyQuaternion(_gq); _u.set(0, 1, 0).applyQuaternion(_gq); _l.set(1, 0, 0).applyQuaternion(_gq);
    const RA = B.RightArm, RF = B.RightForeArm, RH = B.RightHand, CH = B.Spine02 || B.Spine01 || B.Spine;
    const qa = RA.quaternion.clone(), qf = RF.quaternion.clone();
    RA.getWorldPosition(_S); RF.getWorldPosition(_E); RH.getWorldPosition(_W); CH.getWorldPosition(_c);
    const a = _E.distanceTo(_S), b = _W.distanceTo(_E);
    _T.copy(_c).addScaledVector(_f, 0.25 * k).addScaledVector(_l, -0.16 * k).addScaledVector(_u, -0.04 * k);   // 手：右邊胸口前面（概念圖：攬住火箭喺右胸前）
    _d.subVectors(_T, _S); let L = _d.length(); _d.divideScalar(L || 1); L = Math.min(Math.max(L, 0.05 * k), (a + b) * 0.999);
    const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
    _pv.copy(_u).multiplyScalar(-0.8).addScaledVector(_l, -0.55).addScaledVector(_f, -0.15); _pv.addScaledVector(_d, -_pv.dot(_d)).normalize();   // 手踭：向下、向外
    const E = _Ek.copy(_S).addScaledVector(_d, x).addScaledVector(_pv, h), T = _Tk.copy(_S).addScaledVector(_d, L);   // （唔好用 _a / _b：aim() 自己用）
    aim(RA, _E, E); RH.getWorldPosition(_W); aim(RF, _W, T);
    if (w < 1) { RA.quaternion.copy(qa.slerp(RA.quaternion, w)); RF.quaternion.copy(qf.slerp(RF.quaternion, w)); RA.updateMatrixWorld(true); }
    if (out) {   // 火箭：企直（微微向前、向外斜），隻手揸住離底 20 % 嘅位（機頭去到耳仔高度，似概念圖）
      RH.getWorldPosition(_W);
      out.dir.copy(_u).addScaledVector(_f, 0.08).addScaledVector(_l, -0.3).normalize();   // 機頭微微向外（唔好遮塊面）
      out.pos.copy(_W).addScaledVector(_l, 0.03 * k).addScaledVector(_f, 0.05 * k).addScaledVector(out.dir, -0.2 * k);
    }
  }
  // ---------- ② 開放世界：hero_pick.js openRig(c === 'musk') 叫 ----------
  function hug(R, h) {
    // 大頭公仔：hero_pick.js 用 Head 骨 × 1.1 估身高（正常比例啱），Musk 個頭大 → 高到 2.7 米；網格本身 = 腳底 0、頭頂 1.8 米 → 直接用網格高度
    R.mesh.geometry.computeBoundingBox(); const bb = R.mesh.geometry.boundingBox, s = (h || 1.8) / (bb.max.y - bb.min.y);
    R.group.scale.setScalar(s); R.group.position.y = -bb.min.y * s + 0.02;
    const rk = rocket(); R.group.add(rk);
    const out = { pos: new THREE.Vector3(), dir: new THREE.Vector3() }, Zv = new THREE.Vector3(0, 0, 1), up0 = R.mixer.update.bind(R.mixer);
    R.mixer.update = (dt) => {   // open.js / hero_pick.js 每次 mixer.update 之後都擺手 + 擺火箭
      const r = up0(dt); if (!R.group.parent) return r;
      R.group.getWorldScale(_gs); const k = _gs.x;
      hugArm(R.group, R.bones, k, 1, out);
      R.group.getWorldQuaternion(_gq); _gq.invert();
      rk.position.copy(out.pos); R.group.worldToLocal(rk.position);
      rk.quaternion.setFromUnitVectors(Zv, out.dir.applyQuaternion(_gq)); rk.scale.setScalar(1);   // group 本地單位 = 網格米（1.8 米高嘅公仔 → 1 米火箭）
      return r;
    };
    return rk;
  }
  // ---------- ③ BRAWL engine：注入一次（hero_pick.js syncBrawl 喺 setHero('musk') 之前叫）----------
  function ext(a) {
    if (a && !a.__mk) { a.__mk = a.inject(window.MUSK_EXT); if (!a.__rx) a.setHero = a.__mk.setHero; }   // 時空裂縫（rift_code.js）之後載嘅話 A.setHero = RX.setHero，佢會叫返 HEROF.setHero（即係呢度嗰個）
    return a && a.__mk;
  }
  return { rocket, hug, hugArm, ext, NAME: '火箭富豪 Musk', MUSOU: '火箭・無雙' };
})();

// 喺 BRAWL.create() 入面行（api.inject → strict direct eval）：睇到 CHARS、heroBody、player、doHit、emit、ring、SND …
window.MUSK_EXT = function () {
  'use strict';
  const MK = window.MUSK, ZV = new THREE.Vector3(0, 0, 1), AX0 = new THREE.Vector3(-0.645, 0.713, 0.277).normalize();
  const noH = { pose() {}, each() {}, setFace() {} };
  const HCLIPS = ['Combat_Stance', 'Run_02', 'Basic_Jump', 'Dead', 'victory', 'Sword_Shout', 'Roll_Dodge', 'Hit_Reaction', 'Thrust_Slash', 'Left_Slash', 'Right_Hand_Sword_Slash',
    'Triple_Combo_Attack', 'Reaping_Swing', 'Double_Blade_Spin', 'Charged_Upward_Slash', 'Charged_Slash', '360_Power_Spin_Jump', 'Charged_Ground_Slam', 'Heavy_Hammer_Swing'];
  // 招式 → 動作片段（同女特工 HEROF 一樣嘅對照表）
  const SEG = { thrust: ['Thrust_Slash', 0.4, 0.73, 1.05], swingL: ['Left_Slash', 0.45, 0.77, 1.05], swingR: ['Right_Hand_Sword_Slash', 0.25, 0.53, 0.85],
    thrust2: ['Triple_Combo_Attack', 0.45, 0.73, 1.5, 1.75], swingWide: ['Reaping_Swing', 2.95, 3.3, 3.75], spin: ['Double_Blade_Spin', 0.4, 0.83, 1.23, 1.53, 1.95],
    upswing: ['Charged_Upward_Slash', 0.5, 1.03, 1.45], upthrust: ['Charged_Slash', 0.6, 1.17, 1.5], rise: ['360_Power_Spin_Jump', 0.4, 0.93, 1.2, 1.57, 1.95],
    slam: ['Charged_Ground_Slam', 0.6, 1.63, 2.1], chop: ['Heavy_Hammer_Swing', 0.8, 1.53, 1.8] };
  const LOOP = { flurry: ['Triple_Combo_Attack', 0.55, 0.95, 3], tornado: ['Double_Blade_Spin', 0.6, 1.6, 1.4] };
  const LOCKY = { Basic_Jump: 1, '360_Power_Spin_Jump': 1, Charged_Ground_Slam: 1 };
  const H = 1.9, GRIP_HAND = -0.12, GRIP_HUG = -0.2;   // 打鬥高度（紳士 2.1、女特工 1.9）；火箭揸位：出招揸近尾（當棍），攬住揸離底 20 %
  function segTime(seg, m, k) {
    const pts = seg.slice(1), hits = m.hits.map((h) => h[0]), n = pts.length - 2;
    const mk = hits.length === n ? [0, ...hits, m.dur] : [0, hits[0], m.dur], ck = hits.length === n ? pts : [pts[0], pts[1], pts[pts.length - 1]];
    for (let i = 0; i < mk.length - 1; i++) if (k <= mk[i + 1] || i === mk.length - 2) return ck[i] + (ck[i + 1] - ck[i]) * clamp((k - mk[i]) / Math.max(1e-4, mk[i + 1] - mk[i]), 0, 1);
  }
  const _hq = new THREE.Quaternion(), _gq = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(),
    _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3();
  const hugOut = { pos: new THREE.Vector3(), dir: new THREE.Vector3() };

  // ---------- 無雙：火箭 + 火 + 煙（煙用自己一個普通混合 Points：engine 粒子係加色，灰色會變發光）----------
  const SMAX = 360, SM = { x: new Float32Array(SMAX), y: new Float32Array(SMAX), z: new Float32Array(SMAX), vx: new Float32Array(SMAX), vy: new Float32Array(SMAX), vz: new Float32Array(SMAX),
    life: new Float32Array(SMAX), max: new Float32Array(SMAX), s0: new Float32Array(SMAX), s1: new Float32Array(SMAX), c: new Float32Array(SMAX), n: 0 };
  const sGeo = new THREE.BufferGeometry(), sPos = new Float32Array(SMAX * 3), sA = new Float32Array(SMAX * 2);
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setAttribute('sa', new THREE.BufferAttribute(sA, 2)); sGeo.setDrawRange(0, 0);
  const smoke = new THREE.Points(sGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { scale: { value: 400 } },
    vertexShader: 'attribute vec2 sa; varying vec2 vS; uniform float scale; void main(){ vS = sa; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = clamp(sa.y * scale / max(-mv.z, .5), 2., 300.); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec2 vS; void main(){ vec2 q = gl_PointCoord - .5; float r = length(q) * 2.; if (r > 1.) discard; float a = smoothstep(1., .25, r) * vS.x; float g = .34 + .2 * (1. - r) - .12 * q.y; gl_FragColor = vec4(vec3(g, g, g * 1.04), a); }' }));
  smoke.frustumCulled = false; smoke.renderOrder = 2; ROOT.add(smoke);
  function puff(x, y, z, vx, vy, vz, life, s0, s1) { if (SM.n >= SMAX) return; const i = SM.n++; SM.x[i] = x; SM.y[i] = y; SM.z[i] = z; SM.vx[i] = vx; SM.vy[i] = vy; SM.vz[i] = vz; SM.life[i] = SM.max[i] = life; SM.s0[i] = s0; SM.s1[i] = s1; }
  function stepSmoke(dt) {
    let n = SM.n;
    for (let i = 0; i < n; i++) {
      SM.life[i] -= dt; if (SM.life[i] <= 0) { n--; for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'max', 's0', 's1']) SM[k][i] = SM[k][n]; i--; continue; }
      const d = 1 - 1.2 * dt; SM.vx[i] *= d; SM.vz[i] *= d; SM.vy[i] = SM.vy[i] * d + 0.4 * dt; SM.x[i] += SM.vx[i] * dt; SM.y[i] += SM.vy[i] * dt; SM.z[i] += SM.vz[i] * dt;
    }
    SM.n = n;
    for (let i = 0; i < n; i++) { const k = SM.life[i] / SM.max[i]; sPos[i * 3] = SM.x[i]; sPos[i * 3 + 1] = SM.y[i]; sPos[i * 3 + 2] = SM.z[i]; sA[i * 2] = Math.min(1, k * 2.5) * 0.75; sA[i * 2 + 1] = SM.s1[i] + (SM.s0[i] - SM.s1[i]) * k; }
    sGeo.setDrawRange(0, n); sGeo.attributes.position.needsUpdate = sGeo.attributes.sa.needsUpdate = true;
    smoke.material.uniforms.scale.value = innerHeight * renderer.getPixelRatio() * 0.5;
  }
  const FL = (s, op) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); sp.scale.set(s, s * 1.6, 1); return sp; };
  const FLASH = [...Array(6)].map(() => { const f = FL(1, 0); f.material.color.setHex(0xff8a30); f.visible = false; ROOT.add(f); return { f, t: 9 }; }); let flashI = 0;   // 爆炸火光
  const FLY = [...Array(10)].map(() => { const g = new THREE.Group(), m = MK.rocket(), f = FL(0.9, 0.95), f2 = FL(0.5, 1); f.position.z = -0.25; f2.position.z = -0.12; f2.material.color.setHex(0xfff0b0); g.add(m, f, f2); g.visible = false; ROOT.add(g); return { g, f, f2, on: false }; });
  const MX = { on: false, list: [], t: 0, n: 0, hits: 0 };
  function targets(n) {   // 最近嘅敵人（10 米內，唔重複）→ 唔夠就喺主角身邊 3–7 米隨機
    const c = []; for (let i = 0; i < NMAX; i++) if (S.alive[i]) { const d = Math.hypot(S.x[i] - player.x, S.z[i] - player.z); if (d < 10) c.push([d, S.x[i], S.z[i]]); }
    if (boss.alive) { const d = Math.hypot(boss.x - player.x, boss.z - player.z); if (d < 12) c.push([d - 3, boss.x, boss.z]); }
    c.sort((a, b) => a[0] - b[0]); const out = [];
    for (let k = 0; k < n; k++) { if (c[k]) out.push([c[k][1], c[k][2]]); else { const a = Math.random() * TAU, r = rand(3, 7); out.push([player.x + Math.cos(a) * r, player.z + Math.sin(a) * r]); } }
    return out;
  }
  function startMusou() {
    MX.on = true; MX.t = 0; MX.hits = 0; MX.list.length = 0;
    const T = targets(8), [fx, fz] = fwd(player.yaw);
    MX.list.push({ up: true, t0: 0.35, dur: 0.6, k: 0 });   // 手上隻火箭射上天
    T.forEach(([x, z], k) => { const a = camYaw + Math.PI + rand(-1.1, 1.1); MX.list.push({ t0: 0.75 + k * 0.24, dur: 0.6, x, z, sx: x + Math.sin(a) * 14, sz: z + Math.cos(a) * 14, sy: 24, dmg: 14, r: 3.2 }); });   // 由鏡頭嗰邊斜斜射落（背後鏡頭見到成條軌跡）
    MX.list.push({ t0: 2.35, dur: 0.65, x: player.x + fx * 3, z: player.z + fz * 3, sx: player.x + fx * 3 + Math.sin(camYaw + Math.PI) * 12, sz: player.z + fz * 3 + Math.cos(camYaw + Math.PI) * 12, sy: 34, big: true });   // 最後一支大嘅：3 秒時 engine 大爆炸
    for (const f of FLY) { f.on = false; f.g.visible = false; }
  }
  function boom(x, z, big) {
    const n = big ? 60 : 26;
    for (let k = 0; k < n; k++) { const a = Math.random() * TAU, s = rand(3, big ? 16 : 10); emit(x, 0.6, z, Math.cos(a) * s, rand(3, big ? 14 : 9), Math.sin(a) * s, rand(.35, .8), rand(1.1, big ? 3 : 2.1), Math.random() < 0.5 ? 0xff8a30 : 0xffe080, 10, 1.5); }
    for (let k = 0; k < (big ? 26 : 12); k++) { const a = Math.random() * TAU, s = rand(0.5, big ? 5 : 3); puff(x + Math.cos(a) * 0.6, rand(0.4, 1.6), z + Math.sin(a) * 0.6, Math.cos(a) * s, rand(1, 3.5), Math.sin(a) * s, rand(1.4, big ? 3 : 2.2), rand(1.2, 2), rand(3, big ? 7 : 4.5)); }
    ring(x, z, big ? 9 : 3.8, 0xff9040, 0.5); if (big) ring(x, z, 5, 0xffffff, 0.35);
    const F = FLASH[flashI++ % FLASH.length]; F.t = 0; F.big = big; F.f.position.set(x, big ? 2.2 : 1.3, z); F.f.visible = true;
    camShake = Math.max(camShake, big ? 0.9 : 0.35);
    if (SND.ok('mkboom', 0.06)) { SND.tone(70, 0.3, 'sine', 0.45, 0.5); SND.noise(0.45, 0.4, 1400, 80, 'lowpass'); }
  }
  function stepMusou(rdt) {
    const p = player;
    if (p.st !== 'musou') { if (MX.on) { MX.on = false; for (const f of FLY) { f.on = false; f.g.visible = false; } } for (const F of FLASH) if (F.f.visible) { F.t += rdt; F.f.material.opacity = Math.max(0, 1 - F.t / 0.4) * 0.95; if (F.t > 0.4) F.f.visible = false; } return; }
    if (!MX.on) startMusou();
    const t = p.t; let fi = 0;
    for (const s of MX.list) {
      const k = (t - s.t0) / s.dur;
      if (k < 0 || s.done) continue;
      const F = FLY[fi++ % FLY.length]; F.g.visible = k < 1;
      if (s.up) {   // 由手 → 天上
        if (!s.init) { s.init = 1; CHARS.musk.wi.getWorldPosition(_v); s.x0 = _v.x; s.y0 = _v.y; s.z0 = _v.z; if (SND.ok('mkup', 0.1)) SND.noise(0.9, 0.3, 300, 2400, 'bandpass', 0, null, 1.2); }
        const e = k * k; _v.set(s.x0, s.y0 + e * 34, s.z0); F.g.position.copy(_v); F.g.quaternion.setFromUnitVectors(ZV, _d.set(0, 1, 0));
        if (k >= 1) s.done = true;
      } else {      // 天上 → 目標（微微弧線），機頭向前
        const e = Math.min(1, k), y1 = s.big ? 1.4 : 0.8, y = s.sy * (1 - e) + y1 * e + Math.sin(e * Math.PI) * 2;
        _v.set(s.sx + (s.x - s.sx) * e, y, s.sz + (s.z - s.sz) * e);
        _d.set(s.x - s.sx, y1 - s.sy + Math.cos(e * Math.PI) * 2 * Math.PI, s.z - s.sz).normalize();
        F.g.position.copy(_v); F.g.quaternion.setFromUnitVectors(ZV, _d); F.g.scale.setScalar(s.big ? 3.4 : 2.1);
        if (k >= 1) {
          s.done = true; F.g.visible = false; boom(s.x, s.z, s.big); MX.hits++;
          if (!s.big) doHit(s.r, 360, s.dmg, 7, 6, { musou: true, air: true, cx: s.x - p.x, cz: s.z - p.z });   // 大嗰支嘅傷害 = engine 3 秒時原本嗰下（8.5 米）
        }
      }
      if (F.g.visible) {   // 尾焰閃 + 煙尾 + 火花
        F.f.material.opacity = 0.7 + Math.random() * 0.3; F.f.scale.set(0.9 * (0.8 + Math.random() * 0.4), 1.5, 1);
        _w.set(0, 0, -0.3).applyQuaternion(F.g.quaternion).multiplyScalar(F.g.scale.x).add(F.g.position);
        for (let q = 0; q < 2; q++) puff(_w.x, _w.y, _w.z, rand(-.4, .4), rand(-.2, .6), rand(-.4, .4), rand(0.9, 1.6), 0.6, rand(1.8, 3));   // 煙尾
        emit(_w.x, _w.y, _w.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.25, 0.9, Math.random() < 0.5 ? 0xffb040 : 0xffe8a0, 0, 1);
      }
    }
    for (; fi < FLY.length; fi++) FLY[fi].g.visible = false;
    for (const F of FLASH) if (F.f.visible) { F.t += rdt; const k = F.t / 0.4, s = (F.big ? 11 : 6) * (0.5 + k); F.f.scale.set(s, s, 1); F.f.material.opacity = Math.max(0, 1 - k) * 0.95; if (k >= 1) F.f.visible = false; }
  }

  // ---------- 角色 ----------
  function make(tex) {
    const M = window.MRIG; if (!M || !M.musk || !window.MCLIPS) return false;
    const g = new THREE.Group(), w = new THREE.Group(), wi = new THREE.Group(); g.visible = false; heroBody.add(g); g.add(w); w.add(wi);
    const R = buildMeshyRig(M.musk, window.MCLIPS, HCLIPS), hipY = M.musk.bones[0].t[1];
    R.actions.Combat_Stance.play(); R.mixer.update(0); R.group.updateMatrixWorld(true);
    R.actions.Combat_Stance.stop(); R.mesh.geometry.computeBoundingBox();
    const bb = R.mesh.geometry.boundingBox, sc = H / (bb.max.y - bb.min.y) / hero.scale.x;   // 大頭公仔：用網格高度（腳底 → 頭頂），唔用 Head 骨估
    R.group.scale.setScalar(sc); R.group.position.y = -bb.min.y * sc; g.add(R.group);
    R.axis = R.handAxis(AX0); R.mesh.material.color.setHex(0xb4b4b4);   // 同女特工：跟身 heroLight 令淺色皮膚爆白 → 壓暗
    if (tex) { const t0 = R.mesh.material.map; R.mesh.material.map = tex; R.mesh.material.needsUpdate = true; t0.dispose(); }
    const k = sc, rk = MK.rocket(); rk.scale.setScalar(k); wi.add(rk);   // 火箭同角色一樣縮放（網格 1.8 米公仔 ↔ 1 米火箭）
    const C = CHARS.musk = { H: noH, g, w, wi, tip: (1 + GRIP_HAND) * k, col: 0xffb347, speed: CHARS.zy.speed, hp: CHARS.zy.hp, mk: 1, R, rk };
    let cur = null, prev = null, prevW = 0, loopT = 0, carryW = 1;
    const use = (name) => { const a = R.actions[name]; if (cur !== a) { if (prev) prev.stop(); prev = cur; prevW = prev ? 1 : 0; cur = a; cur.reset(); cur.play(); loopT = 0; } return a; };
    const at = (a, t) => { a.time = clamp(t, 0, a.getClip().duration); };
    C.rigUpdate = (rdt) => {
      const p = player, m = p.move, over = GAME.state === 'over';
      heroBody.rotation.x = 0; heroBody.position.y = 0; if (p.st === 'musou') heroBody.rotation.y = 0;   // 無雙：唔好跟 engine 轉六個圈（佢企定召喚火箭）
      let a, mode = 'hand';
      if (over && p.hp <= 0) { a = use('Dead'); loopT += rdt; at(a, Math.min(loopT, 2.9)); }
      else if (over) { a = use('victory'); loopT += rdt; at(a, loopT % a.getClip().duration); mode = 'idle'; }
      else if ((p.st === 'attack' || p.st === 'charge') && m && LOOP[m.anim]) { const [nm, t0, t1, hz] = LOOP[m.anim]; a = use(nm); loopT += rdt * hz; at(a, t0 + (t1 - t0) * (loopT % 1)); }
      else if ((p.st === 'attack' || p.st === 'charge') && m) { const sg = SEG[m.anim] || SEG.thrust; a = use(sg[0]); at(a, segTime(sg, m, p.t)); }
      else if (p.st === 'musou') { a = use('Sword_Shout'); at(a, p.t < 0.5 ? 0.8 + p.t * 0.9 : 1.25 + Math.sin(p.t * 5) * 0.06); }   // 舉手叫火箭
      else if (p.st === 'dive') { a = use('Heavy_Hammer_Swing'); at(a, 1.25 + Math.min(1, p.t / 0.3) * 0.28); }
      else if (p.st === 'dodge') { a = use('Roll_Dodge'); at(a, 0.1 + Math.min(1, p.t / 0.42) * 1.2); }
      else if (p.st === 'hurt') { a = use('Hit_Reaction'); at(a, Math.min(1, p.t / 0.45) * 0.8); }
      else if (p.y > 0.25) { a = use('Basic_Jump'); at(a, 1.75 + clamp(0.5 - p.vy / 24, 0, 1) * 0.7); mode = 'idle'; }
      else if (p.st === 'run') { a = use('Run_02'); loopT += rdt * (ACT.speed / 8.5); at(a, loopT % a.getClip().duration); mode = 'idle'; }
      else { a = use('Combat_Stance'); loopT += rdt; at(a, loopT % a.getClip().duration); mode = 'idle'; }
      prevW = Math.max(0, prevW - rdt / 0.12);
      if (prev) { prev.setEffectiveWeight(prevW); if (prevW <= 0) { prev.stop(); prev = null; } }
      cur.setEffectiveWeight(1 - (prev ? prevW : 0));
      R.mixer.update(0); if (LOCKY[cur.getClip().name]) R.bones.Hips.position.y = hipY;
      heroBody.updateMatrixWorld(true);
      carryW += ((mode === 'hand' ? 0 : 1) - carryW) * Math.min(1, rdt * 10);
      const kw = R.group.getWorldScale(_s).x;   // 網格米 → 世界米
      if (carryW > 0.01) MK.hugArm(R.group, R.bones, kw, carryW, hugOut);   // 企 / 跑：右手攬住火箭企直
      const hand = R.bones.RightHand; hand.getWorldQuaternion(_hq); hand.getWorldPosition(_p);
      _f.set(0, 1, 0).applyQuaternion(_hq); _p.addScaledVector(_f, 0.07 * R.group.scale.x * hero.scale.x);
      _d.copy(R.axis).applyQuaternion(_hq);
      if (carryW > 0.01) { _p.lerp(_w.copy(hugOut.pos).addScaledVector(hugOut.dir, -GRIP_HUG * kw), carryW); _d.lerp(hugOut.dir, carryW).normalize(); }   // 攬住：火箭企直喺手度
      C.g.worldToLocal(_p); C.g.getWorldQuaternion(_gq); _gq.invert(); _d.applyQuaternion(_gq);
      _qa.setFromUnitVectors(ZV, _d);
      C.w.position.copy(_p); C.w.quaternion.copy(_qa); C.wi.position.set(0, 0, 0);
      rk.position.z = (GRIP_HAND + (GRIP_HUG - GRIP_HAND) * carryW) * k; C.tip = (1 + rk.position.z / k) * k;
      rk.visible = !(p.st === 'musou' && p.t > 0.35 && p.t < 3.25);   // 無雙：手上隻火箭射咗上天，完先變返出嚟
      C.w.updateMatrixWorld(true);
      stepMusou(rdt); stepSmoke(rdt);
    };
    C.rigTip = (tipW, midW) => { tipW.set(0, 0, 1).applyMatrix4(rk.matrixWorld); midW.set(0, 0, 0.45).applyMatrix4(rk.matrixWorld); };   // 拖光 = 機頭
    return true;
  }
  const hideMusk = () => { if (CHARS.musk) CHARS.musk.g.visible = false; };
  // setChar：換角色都會經過（HEROF / 時空裂縫 RX.setHero）→ Musk 自己嘅 group 跟住收 / 現；HUD 名 MUSK
  { const sc0 = setChar; setChar = function (c) { sc0(c); if (CHARS.musk) CHARS.musk.g.visible = c === 'musk'; if (c === 'musk') $('face').textContent = 'MUSK'; }; }
  // 無雙大字：Musk = 「火箭・無雙」（橙色）；其他角色照舊
  { const bn0 = banner; banner = function (t, col, small) { if (CHAR === 'musk' && t === TX.musou) { t = MK.MUSOU; col = '#ffb347'; } return bn0(t, col, small); }; }
  const hf0 = HEROF.setHero;
  HEROF.setHero = function (c, tex) {   // 'musk' 自己整；其他交返原本（紳士 / 女特工）
    if (c !== 'musk') { hideMusk(); return hf0(c, tex); }
    if (!CHARS.musk && !make(tex)) return false;
    setChar('musk');
    for (const k of ['maid', 'student', 'zyun']) if (CHARS[k] && CHARS[k].g) CHARS[k].g.visible = false;
    if (CHARS.zy.rig) CHARS.zy.rig.group.visible = false;
    return true;
  };
  return { setHero: HEROF.setHero, MX, SM };
};
}
;
window.BOOT && BOOT(0.998)
;
// ============ 揀角色（v40，BG 09-30「點樣揀用女主角玩？」「hkcity 搬埋過去，加返角色」）============
// 紳士特工（預設，已經喺頁面入面）/ 女僕特工 / 學生特工 = games/agent 嘅 Meshy 女特工（衣著同 agent game 一樣保守）。
// 女特工好大（骨架 ~0.8 MB + 動作 ~0.56 MB）→ 唔入 hkcity.html：揀咗先載 hero_clips.js + hero_maid.js / hero_student.js（同 hkcity.html 放埋一齊）。
// 用喺：開放世界主角（OPEN.hero：行 / 跑 / 跳、上落車、地鐵、理大圖書館）+ 打鬥（storm_engine.js BRAWL：紳士風暴任務 + 隨街打交），招式一樣。
// 記喺 localStorage hkcity-hero；第一次入開放世界彈出，之後撳右上 👤（或者 ❓ 玩法入面「👤 換角色」）。
window.HEROPICK = (() => {
  const $ = (id) => document.getElementById(id);
  const LIST = [['zy', '🎩', '紳士特工', '西裝・長遮', '#8ff5ff'], ['maid', '🎀', '女僕特工', '女僕裝・黑遮', '#d8e8ff'], ['student', '🎒', '學生特工', '校服・深藍遮', '#ff8fd8'],
    ['zyun', '🐉', '趙雲', '白袍・龍膽亮銀槍', '#8fd0ff', '約 2 MB'], ['gy', '🌙', '關羽', '綠袍・青龍偃月刀', '#7dffb0', '約 1.5 MB'],   // v43 時空來客（三國）：timerift.js 載入（RIFT.loadHero）
    ['musk', '🚀', '火箭富豪 Musk', '卡通版・大招召喚火箭', '#ffb347', '約 1.2 MB']].filter((r) => !TOUCH || r[0] !== 'musk');   // v48 手機冇 Musk；v44 特別嘉賓：musk.js（hero_musk.js 揀咗先載）
  const NAME = {}; for (const r of LIST) NAME[r[0]] = r[2];
  const K3 = { zyun: 1, gy: 1 }, GUEST = { musk: 1 };
  const RIG = { maid: 'ag_maid', student: 'ag_student', zyun: 'zy', gy: 'guanyu', musk: 'musk' };
  const OPEN_H = 1.68, OPEN_HS = { zyun: 1.8, gy: 1.9, musk: 1.8 };   // 開放世界高度（紳士 1.78 米；agent game 女特工矮過紳士一成、差唔多同路人一樣高；趙雲 / 關羽高啲）
  const NAT = { walk: 0.85, run: 6.5 };   // 動作 1× 嘅步速（米 / 秒；GPU 機量：著地隻腳相對身體向後嘅速度，女僕 / 學生 walk 0.86 / 0.54、run 6.85 / 6.27）
  document.head.insertAdjacentHTML('beforeend', `<style>
#ohero{position:fixed;right:168px;top:136px;width:34px;height:34px;border-radius:50%;background:rgba(14,18,48,.8);border:1px solid rgba(140,160,255,.5);color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer}
#hpick{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(4,6,14,.55);padding:10px;pointer-events:auto}
#hpick .hp{width:min(540px,94vw);max-height:94vh;overflow:auto;padding:12px 14px;border-radius:14px;background:rgba(14,18,48,.96);border:1px solid rgba(140,160,255,.5);box-shadow:0 10px 40px #000}
#hpick .hh{display:flex;justify-content:space-between;align-items:center;font-size:18px;font-weight:900;margin-bottom:10px}#hpick .hh span{cursor:pointer;font-size:20px;padding:0 6px}
#hpick .row{display:flex;gap:8px}#hpick .sub{font-size:13px;font-weight:900;color:#e8c8ff;margin:10px 0 6px}
#hpick button{flex:1 1 0;min-width:0;padding:10px 4px 8px;border-radius:12px;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.18);color:#fff;font-family:inherit;cursor:pointer;text-align:center}
#hpick button.on{border-color:var(--c);box-shadow:0 0 12px var(--c);background:rgba(255,255,255,.14)}
#hpick .e{font-size:32px;line-height:1.15}#hpick .n{font-weight:900;font-size:16px;margin-top:3px}#hpick .d{font-size:12px;color:#aab3d6;margin-top:2px}
#hpick .s{font-size:12px;margin-top:4px;color:#ffd23f;min-height:1.3em}#hprowg{justify-content:center}#hpick #hprowg button{flex:0 1 calc(50% - 4px)}
@media (max-height:420px){#hpick .hp{padding:8px 12px}#hpick .hh{margin-bottom:6px}#hpick .e{font-size:22px}#hpick button{padding:6px 4px 5px}#hpick .d,#hpick .ft{display:none}#hpick .sub{margin:6px 0 4px}}   /* v44：手機打橫（高 360–390）三行都要睇到（Musk 嗰行唔好要捲先見到） */#hpick .ft{font-size:12px;color:#9aa3c7;margin-top:10px;text-align:center}
#hload{position:fixed;left:50%;top:44px;transform:translateX(-50%);padding:4px 12px;border-radius:14px;background:rgba(0,0,0,.65);font-size:13px;font-weight:900;white-space:nowrap}
@media (orientation:portrait){#hload{top:auto;bottom:150px}}
#hbody .hpk{margin:4px 0;padding:6px 14px;font:bold 14px inherit;font-family:inherit;color:#fff;border:1px solid rgba(160,210,255,.6);border-radius:16px;background:rgba(20,30,50,.8);cursor:pointer}
</style>`);
  $('oui').insertAdjacentHTML('beforeend', '<div id="ohero" title="換角色">👤</div><div id="hload" hidden></div>');
  document.body.insertAdjacentHTML('beforeend', '<div id="hpick" hidden><div class="hp"><div class="hh"><span style="cursor:auto;font-size:18px;padding:0">👤 揀角色</span><span id="hpickx">✕</span></div><div class="row" id="hprow"></div><div class="sub">⏳ 時空來客（三國）</div><div class="row" id="hprow3"></div><div class="sub">🚀 特別嘉賓（卡通版）</div><div class="row" id="hprowg"></div><div class="ft">三個特工招式一樣・趙雲長槍快攻、關羽大刀重擊' + (TOUCH ? '' : '・Musk 攬住火箭、無雙召喚火箭') + '・隨時撳右上角 👤 再換</div></div></div>'); if (TOUCH) $('hprowg').previousElementSibling.hidden = true;   // v48 手機冇 Musk
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'click', 'wheel']) $('hpick').addEventListener(ev, (e) => e.stopPropagation());
  $('ohero').onclick = () => show(); $('hpickx').onclick = () => hide();
  addEventListener('keydown', (e) => { if (!$('hpick').hidden && e.key === 'Escape') { e.stopImmediatePropagation(); hide(); } }, true);   // Esc 只係閂選單，唔好退出開放世界

  let cur = 'zy', want = null, saved = null; const busy = {}, fail = {};
  try { saved = localStorage.getItem('hkcity-hero'); } catch (e) {}
  if (!NAME[saved]) saved = null;
  function save(c) { saved = c; try { localStorage.setItem('hkcity-hero', c); } catch (e) {} }

  // ---------- 載入（script tag；同一個檔只載一次，失敗可以再試）----------
  const got = {};
  function script(src) {
    return got[src] || (got[src] = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = () => { delete got[src]; s.remove(); no(new Error(src)); }; document.head.appendChild(s);
    }));
  }
  const ready = (c) => c === 'zy' || (K3[c] ? !!(window.RIFT && RIFT.heroReady(c)) : !!(window.MRIG && MRIG[RIG[c]] && window.MCLIPS && window.buildMeshyRig));
  const load = (c) => (ready(c) ? Promise.resolve() : K3[c] ? (window.RIFT ? RIFT.loadHero(c) : Promise.reject(new Error('RIFT'))) : Promise.all([script('hero_clips.js'), script('hero_' + c + '.js')]));

  // ---------- 開放世界主角：Meshy 骨架 + open.js 用開嘅 { mixer, actions: idle / walk / run / jump } ----------
  const rigs = { zy: OPEN.hero.rig };
  function openRig(c) {
    if (rigs[c]) return rigs[c];
    const D = MRIG[RIG[c]], R = buildMeshyRig(D, MCLIPS, ['Idle', 'Casual_Walk', 'Run_02', 'Basic_Jump']);
    R.actions.Idle.play(); R.mixer.update(0); R.group.updateMatrixWorld(true);
    const wy = (n) => R.bones[n].getWorldPosition(new THREE.Vector3()).y, foot = Math.min(wy('LeftFoot'), wy('RightFoot'));
    const s = (OPEN_HS[c] || OPEN_H) / ((wy('Head') - foot) * 1.1); R.group.scale.setScalar(s); R.group.position.y = -foot * s + 0.08;   // 同 open.js 紳士一樣計法
    R.actions.Idle.stop(); R.mesh.material.color.setHex(0xd0d0d0);   // 貼圖冇 sRGB 解碼（同 agent game），壓暗少少先唔會喺街燈下爆白
    // 跳：Basic_Jump 只要離地嗰段（第 50–76 格）；盤骨高度鎖住（跳幾高由 open.js 計）
    const J = THREE.AnimationUtils.subclip(R.actions.Basic_Jump.getClip(), 'jump', 50, 76, 30), hy = D.bones[0].t[1];
    for (const t of J.tracks) if (t.name === 'Hips.position') for (let i = 1; i < t.values.length; i += 3) t.values[i] = hy;
    const A = { idle: R.actions.Idle, walk: R.actions.Casual_Walk, run: R.actions.Run_02, jump: R.mixer.clipAction(J) };
    A.jump.timeScale = J.duration / 0.74;   // open.js 起跳 5.2 m/s、g 14 → 離地 ~0.74 秒
    R.group.visible = false; OPEN.hero.root.add(R.group);
    if (K3[c] && window.RIFT) RIFT.back(R, c);   // v43：趙雲 / 關羽開放世界孭住兵器
    if (GUEST[c] && window.MUSK) MUSK.hug(R, OPEN_HS[c]);   // v44：Musk 右手攬住火箭（每格 IK）；大頭公仔身高用網格計
    // open.js：gait(速度) → [動作, timeScale]。預設行 2.6 m/s 用慢跑（Casual_Walk 要 3 倍速，好似快鏡）；搖桿推少少先用行
    const gait = (sp) => (sp < 1.6 ? ['walk', Math.min(1.8, Math.max(0.6, sp / NAT.walk))] : ['run', Math.min(1.6, Math.max(0.5, sp / NAT.run))]);
    return (rigs[c] = { group: R.group, mesh: R.mesh, bones: R.bones, mixer: R.mixer, actions: A, gait });
  }
  function apply(c) {
    const H = OPEN.hero, r = openRig(c), old = H.rig;
    if (r !== old) {
      if (old && old.group) old.group.visible = false;
      r.group.visible = true; r.mixer.stopAllAction(); r.actions.idle.play(); r.mixer.update(0); H.rig = r; H.act = 'idle';
      if (H.root.layers.mask & 2) r.group.traverse((o) => o.layers.enable(1));   // 理大圖書館入面（camera layer 1）都要見到（r128 冇 layers.isEnabled）
    }
    cur = c; syncBrawl();
  }
  function syncBrawl(a) {   // 打鬥 engine（紳士風暴 / 隨街打交）用同一個角色
    a = a || (window.BRAWL && BRAWL.api); if (!a || a.__hero === cur) return;
    if (GUEST[cur] && window.MUSK) MUSK.ext(a);   // v44：Musk 嘅 engine 部分（第一次先注入）
    if (a.setHero(cur, cur === 'zy' ? null : rigs[cur].mesh.material.map)) { a.__hero = cur; if (cur !== 'zy') warm(a); }
  }
  function warm(a) {   // 打鬥女特工第一次開打唔好卡（v40 量度：女僕第一拳 render ~180 ms）：而家先喺 1 像素畫一次，上載 mesh / 骨骼貼圖
    const h = a.hero, tmp = new THREE.Scene(), vis = h.visible, lights = []; tmp.fog = scene.fog;
    h.traverse((o) => { if (o.isPointLight) { lights.push([o, o.visible]); o.visible = false; } });   // 自由行冇主角補光 → 同一個 shader
    scene.traverseVisible((o) => { if (o.isLight) tmp.add(o.clone()); });
    tmp.add(h); h.visible = true;
    try { renderer.compile(tmp, camera); const sc = new THREE.Vector4(), st = renderer.getScissorTest(); renderer.getScissor(sc);
      renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.render(tmp, camera); renderer.setScissor(sc); renderer.setScissorTest(st); } catch (e) { console.warn('hero warm', e.message); }
    a.ROOT.add(h); h.visible = vis; for (const [o, v] of lights) o.visible = v;
  }
  { const en0 = BRAWL.ensure; BRAWL.ensure = () => { const a = en0(); syncBrawl(a); return a; }; }
  { const s0 = BRAWL.start; BRAWL.start = (...a) => { syncBrawl(BRAWL.ensure()); return s0(...a); }; }

  // v41：網上版（net.js）其他玩家都用佢揀嘅角色。複製一副骨架（共用 geometry / 貼圖 / 動作 clip，每人自己一個 mixer）；
  // 未載過嘅女特工照樣載 hero_*.js（失敗 → reject，net.js 用紳士頂住）。唔識嘅名 → 紳士。
  function model(c) {
    if (!NAME[c]) c = 'zy';
    return load(c).then(() => {
      const src = c === 'zy' ? rigs.zy : openRig(c);
      if (!src || !src.group || !src.mesh || !src.mesh.skeleton) throw new Error('no rig ' + c);
      const g = src.group.clone(true), by = {}; let mesh = null;
      g.traverse((o) => { if (o.isBone) by[o.name] = o; if (o.isSkinnedMesh) mesh = o; });
      mesh.bind(new THREE.Skeleton(src.mesh.skeleton.bones.map((b) => by[b.name]), src.mesh.skeleton.boneInverses), mesh.bindMatrix);   // SkinnedMesh.clone 會共用舊骨架 → 重新綁
      g.visible = true;
      const mixer = new THREE.AnimationMixer(g), actions = {};
      for (const k of ['idle', 'walk', 'run']) if (src.actions[k]) actions[k] = mixer.clipAction(src.actions[k].getClip());
      return { hero: c, group: g, mixer, actions, gait: src.gait || null };
    });
  }

  // ---------- 揀 ----------
  function pick(c) {
    want = c; save(c);
    if (ready(c)) { apply(c); hide(); draw(); return Promise.resolve(true); }
    busy[c] = 1; fail[c] = 0; draw(); chip();
    return load(c).then(() => { busy[c] = 0; if (want === c) { apply(c); hide(); } draw(); chip(); return true; },
      () => { busy[c] = 0; fail[c] = 1; const w = want === c; if (w) want = cur; draw(); chip(w ? `角色載入失敗（網絡？），暫時用返${NAME[cur]}` : null, 4000); return false; });
  }
  let chipT = 0;
  function chip(msg, ms) {   // 細提示：載緊（選單閂咗都睇到）/ 失敗
    const e = $('hload'), c = Object.keys(busy).find((k) => busy[k]);
    clearTimeout(chipT); e.textContent = msg || (c ? `👤 載入${NAME[c]}中…` : ''); e.hidden = !e.textContent || (!msg && !$('hpick').hidden);
    if (msg) chipT = setTimeout(() => chip(), ms);
  }
  function draw() {
    const row = $('hprow'), row3 = $('hprow3'), rowg = $('hprowg'); row.innerHTML = row3.innerHTML = rowg.innerHTML = '';
    for (const [c, e, n, d, col, mb] of LIST) {
      const b = document.createElement('button'); b.className = c === (want || cur) ? 'on' : ''; b.style.setProperty('--c', col);
      const st = busy[c] ? '載入中…' : fail[c] ? '載入失敗，再撳一次' : c === cur ? '而家用緊' : ready(c) ? '' : '第一次要下載' + (mb || '約 1.3 MB');
      b.innerHTML = `<div class="e">${e}</div><div class="n">${n}</div><div class="d">${d}</div><div class="s">${st}</div>`;
      b.onclick = () => pick(c); (K3[c] ? row3 : GUEST[c] ? rowg : row).appendChild(b);
    }
  }
  function show() { draw(); $('hpick').hidden = false; chip(); }
  function hide() { if ($('hpick').hidden) return; $('hpick').hidden = true; if (!saved) save(cur); chip(); }   // 閂咗都當揀咗（下次唔再自動彈）

  // 入開放世界：第一次彈選單；之前揀過女特工就載入（載好之前紳士頂住，有細提示）
  { const e0 = OPEN.enter; OPEN.enter = (...a) => { const r = e0(...a); if (!saved) show(); else if (saved !== cur && !busy[saved]) pick(saved); return r; }; }
  return { show, hide, pick, model, get cur() { return cur; }, get busy() { return Object.keys(busy).some((k) => busy[k]); }, ready, script };   // script：timerift.js 共用（同一個檔只載一次）
})();
;
window.BOOT && BOOT(0.998)
;
// ============ v43 時空裂縫（BG 2026-09-30：「趙雲無雙搬入城市：時空旅人」）============
// 開放世界：西九 M+ 附近空地（BG 批：位置 A，x ≈ −821、z ≈ 833，附近 110 米內冇樓）一道時空裂縫（紫金光柱、旋渦、小地圖紫點）。
// 行入去 → 載入三國角色（用到先載，唔入 hkcity.html）→ 成個環境變紫（霧、天、旋渦、光點）→ 用 BRAWL engine（cam.mode 'storm'）打：
// 魏兵 + 魏軍隊長（兩波）→ 張郃（朱雀）→ 呂布（最強：方天畫戟、擒拿 20 連斬）。贏 = +$6000；輸 = 再戰 / 返回城市；行出裂縫 = 放棄。
// engine 入面嘅嘢喺 rift_code.js（BRAWL.api.inject）。呢度：兵器模型、光柱、環境、載入、開始 / 離開、小地圖、提示；
// 仲有 hero_pick.js 用嘅 loadHero（趙雲 / 關羽做開放世界主角）同 back()（兵器孭喺背脊）。
window.RIFT = (() => {
  const $ = (id) => document.getElementById(id);
  const X = -821, Z = 833, R = 40, ARENA = 46, TARGET = TOUCH ? 50 : 60, PAY = 6000;   // 裂縫中心、裂縫牆半徑、活動範圍（keepIn）、目標擊倒、獎金
  const M = { id: 'rift', name: '時空裂縫', boss: ['zhanghe', 'lubu'], w: { 0: 0.8, 1: 0.2 }, dmg: 0.85, slots: 6, alive: [60, 90], mus: 0.9, bossHp: 1 };
  const S = { st: 'idle', k: 0, want: 0, fight: false, cool: 0, out: 0, won: false, t: 0, err: '' };   // st：idle / loading / fight
  let DONE = false; try { DONE = localStorage.getItem('hkcity-rift-done') === '1'; } catch (e) {}

  // ---------- 兵器（沿 +z，握位 z = 0；userData.tip = 刃尖 z）----------
  function weapon(kind) {
    const g = new THREE.Group(), L = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0 });
    const add = (geo, m, z, x = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, 0, z); g.add(o); return o; };
    const rod = (r, z0, z1, m, seg = 8) => add(new THREE.CylinderGeometry(r, r, z1 - z0, seg).rotateX(Math.PI / 2), m, (z0 + z1) / 2);
    const cone = (r, len, m, z, back, seg = 8) => add(new THREE.ConeGeometry(r, len, seg).rotateX(back ? -Math.PI / 2 : Math.PI / 2), m, z);   // 尖向 +z（back = 向 −z）
    const gold = L(0xd0a030, 0x2a1c04), red = L(0xc01818, 0x200000), steel = L(0xd4dae2, 0x1a2026);
    if (kind === 'spear') {   // 趙雲・龍膽亮銀槍：銀槍身、金箍、紅纓、菱形槍頭
      const silver = L(0xcfd5de, 0x14161a);
      rod(0.032, -1.0, 2.2, silver); cone(0.03, 0.14, silver, -1.07, true);
      rod(0.05, 2.12, 2.22, gold); cone(0.14, 0.34, red, 2.0, false, 10);
      cone(0.085, 0.6, new THREE.MeshBasicMaterial({ color: 0xeaf4ff }), 2.5, false, 4);
      g.userData.tip = 2.8;
    } else if (kind === 'glaive') {   // 關羽・青龍偃月刀（zhaoyun 09-29：刀身大 30 %、鋼色、紅纓）；成把 ×0.8
      const k = new THREE.Group(); k.scale.setScalar(0.8); g.add(k);
      const put = (o) => { g.remove(o); k.add(o); return o; };
      put(rod(0.04, -1.3, 2.15, L(0x3a2418, 0x0a0604)));
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.62, 0.35, 0.34, 1.35); sh.quadraticCurveTo(0.2, 0.7, -0.12, 0.5); sh.lineTo(-0.12, 0);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); bg.translate(0, 0, -0.025); bg.rotateX(Math.PI / 2); bg.rotateZ(Math.PI / 2);
      const bl = put(add(bg, new THREE.MeshLambertMaterial({ color: 0xd4dae2, emissive: 0x1a2026, side: THREE.DoubleSide }), 2.2)); bl.scale.setScalar(1.3);
      put(add(new THREE.BoxGeometry(0.26, 0.26, 0.2), gold, 2.12)); put(cone(0.17, 0.4, red, 1.86, false, 10)); put(add(new THREE.BoxGeometry(0.1, 0.1, 0.24), gold, -1.35));
      g.userData.tip = (2.2 + 1.35 * 1.3) * 0.8;
    } else if (kind === 'halberd') {   // 呂布・方天畫戟：深紅戟桿、金箍、紅纓、戟尖、兩邊月牙刃
      rod(0.045, -1.2, 2.45, L(0x3a1010, 0x100000)); for (const z of [-0.25, 0.95]) rod(0.056, z, z + 0.09, gold);
      cone(0.05, 0.22, steel, -1.3, true); cone(0.2, 0.44, red, 2.2, false, 10); rod(0.07, 2.42, 2.52, gold);
      cone(0.075, 0.8, steel, 2.92, false, 4);
      const cs = new THREE.Shape(); cs.moveTo(0, -0.42); cs.quadraticCurveTo(0.78, 0, 0, 0.42); cs.quadraticCurveTo(0.3, 0, 0, -0.42);
      const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.035, bevelEnabled: false }); cg.translate(0, 0, -0.0175); cg.rotateX(Math.PI / 2);
      const cm = new THREE.MeshLambertMaterial({ color: 0xd4dae2, emissive: 0x1a2026, side: THREE.DoubleSide });
      for (const s of [1, -1]) { const m = add(cg, cm, 2.75, s * 0.05); m.scale.x = s; }
      g.userData.tip = 3.32;
    }
    return g;
  }
  // 開放世界：兵器孭喺背脊（跟 Spine 骨；hero_pick.js openRig 叫）
  function back(Rg, c) {
    const kind = c === 'gy' ? 'glaive' : c === 'zyun' ? 'spear' : null, b = Rg.bones.Spine || Rg.bones.Spine01, root = Rg.group.parent; if (!kind || !b || !root) return;
    const w = weapon(kind), s = kind === 'glaive' ? 0.68 : 0.62; root.updateMatrixWorld(true);
    const bm = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(b.matrixWorld), chest = new THREE.Vector3().setFromMatrixPosition(bm);
    const dir = new THREE.Vector3(-0.42, 0.9, -0.1).normalize(), mid = kind === 'glaive' ? 1.1 : 0.9;
    const pos = chest.clone().add(new THREE.Vector3(0, -0.12, -0.2)).addScaledVector(dir, -mid * s);
    const nx = new THREE.Vector3(0, 0, 1).addScaledVector(dir, -dir.z).normalize(), ny = new THREE.Vector3().crossVectors(dir, nx);   // 刀面貼住背脊（本地 x = 向前後）
    const want = new THREE.Matrix4().makeBasis(nx, ny, dir).scale(new THREE.Vector3(s, s, s)).setPosition(pos);
    new THREE.Matrix4().copy(bm).invert().multiply(want).decompose(w.position, w.quaternion, w.scale); b.add(w);
  }

  // ---------- 載入（同 hero_pick.js 共用 script()：hero_clips.js 只載一次，唔會蓋走 rift_clips.js 加嘅動作）----------
  const js = (f) => HEROPICK.script(f);
  const clips = () => js('hero_clips.js').then(() => js('rift_clips.js'));
  let RX = null;
  function ext() {   // rift_code.js → engine 入面；趙雲 / 關羽經 api.setHero 入 engine
    const A = BRAWL.ensure(); if (RX) return RX;
    if (!window.RIFT_EXT) throw new Error('rift_code.js');
    RX = A.inject(window.RIFT_EXT); A.__rx = RX; A.setHero = RX.setHero;   // RX.setHero：趙雲 / 關羽自己整，其他照交 HEROF.setHero
    return RX;
  }
  const HF = { zyun: 'hero_zhaoyun.js', gy: 'hero_guanyu.js' }, HR = { zyun: 'zy', gy: 'guanyu' };
  const heroReady = (c) => !!(RX && window.MRIG && MRIG[HR[c]] && window.MCLIPS && window.buildMeshyRig);
  function loadHero(c) {   // hero_pick.js：揀趙雲 / 關羽
    if (heroReady(c)) return Promise.resolve();
    return Promise.all([js('hero_clips.js'), js('rift_code.js'), js(HF[c])]).then(() => { ext(); });
  }

  // ---------- 旋渦 shader（光柱頂、裂縫門、天上）----------
  const swirl = (a, b, op) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { t: { value: 0 }, op: { value: op }, ca: { value: new THREE.Color(a) }, cb: { value: new THREE.Color(b) } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float t, op; uniform vec3 ca, cb; varying vec2 vU; void main(){ float r = length(vU); if (r > 1.0) discard; float a = atan(vU.y, vU.x);'
      + ' float s = 0.5 + 0.5 * sin(a * 3.0 + r * 13.0 - t * 3.5); float core = smoothstep(0.35, 0.0, r); float edge = smoothstep(1.0, 0.72, r);'
      + ' vec3 c = mix(cb, ca, s) * (0.35 + 0.9 * s * s) + vec3(1.0, 0.95, 0.85) * core; gl_FragColor = vec4(c, op * edge * (0.45 + 0.55 * s + core)); }' });
  const canvasTex = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')); return new THREE.CanvasTexture(c); };

  // ---------- 開放世界嘅裂縫點：光柱 + 地上圈 + 細旋渦 + 名牌 ----------
  const mk = new THREE.Group(); mk.position.set(X, 0, Z); scene.add(mk);
  const beamTex = canvasTex(4, 128, (x) => { const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, 'rgba(170,90,255,.75)'); g.addColorStop(0.4, 'rgba(255,190,90,.35)'); g.addColorStop(1, 'rgba(170,90,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 200, 16, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 107.5; mk.add(beam);   // 光柱由 7.5 米起（下面係旋渦門，唔好俾光柱蓋住）
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 48), new THREE.MeshBasicMaterial({ color: 0xc77dff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; mk.add(ring);
  const door = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), swirl(0xffd070, 0x8a3cff, 0.9)); door.position.y = 2.7; mk.add(door);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  const drawLabel = () => { if (label.material.map) label.material.map.dispose(); label.material.map = canvasTex(512, 128, (x) => {
    x.fillStyle = 'rgba(20,8,40,.75)'; x.fillRect(0, 16, 512, 96); x.strokeStyle = '#d7a2ff'; x.lineWidth = 4; x.strokeRect(2, 18, 508, 92);
    x.font = '900 50px "PingFang HK","Noto Sans TC",sans-serif'; x.fillStyle = '#fff4d8'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText((DONE ? '✅ ' : '⏳ ') + '時空裂縫 ★★★★★', 256, 66, 490); }); label.material.needsUpdate = true; };
  drawLabel(); label.scale.set(10, 2.5, 1); label.position.y = 6.3; mk.add(label);

  // ---------- 裂縫環境：紫色霧 / 天、旋渦門、天上旋渦、裂縫牆、光點 ----------
  const env = new THREE.Group(); env.visible = false; scene.add(env);
  const FOG = new THREE.Color(0x1c0f33), HEMI = new THREE.Color(0xa888ff), tmpC = new THREE.Color();
  const gate = new THREE.Mesh(new THREE.CircleGeometry(9, 64), swirl(0xffd070, 0x7a2cff, 0.95)); env.add(gate);
  const gateRing = new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.35, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.9, fog: false })); env.add(gateRing);
  const sky = new THREE.Mesh(new THREE.CircleGeometry(70, 64), swirl(0xffc860, 0x5a1cc8, 0.75)); sky.rotation.x = Math.PI / 2; sky.position.set(X, 62, Z); env.add(sky);
  const wallTex = canvasTex(256, 256, (x) => { x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) { const g = x.createLinearGradient(0, 0, 256, 0), a = 0.05 + Math.random() * 0.12; g.addColorStop(0, 'rgba(160,90,255,0)'); g.addColorStop(0.5, i % 4 ? `rgba(190,120,255,${a})` : `rgba(255,210,120,${a})`); g.addColorStop(1, 'rgba(160,90,255,0)');
      x.save(); x.translate(Math.random() * 256, Math.random() * 256); x.rotate(-0.7); x.fillStyle = g; x.fillRect(-120, -3 - Math.random() * 6, 240, 6 + Math.random() * 12); x.restore(); } });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(7, 2);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 60, 64, 1, true), new THREE.MeshBasicMaterial({ map: wallTex, color: 0xc890ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  wall.position.set(X, 30, Z); env.add(wall);
  const NM = TOUCH ? 260 : 480, mp = new Float32Array(NM * 3), mv = new Float32Array(NM);
  for (let i = 0; i < NM; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R; mp[i * 3] = X + Math.cos(a) * r; mp[i * 3 + 1] = Math.random() * 14; mp[i * 3 + 2] = Z + Math.sin(a) * r; mv[i] = 0.6 + Math.random() * 1.6; }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const dotTex = canvasTex(32, 32, (x) => { const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); });
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ map: dotTex, color: 0xffd9a0, size: 0.35, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  motes.frustumCulled = false; env.add(motes);
  const vig = document.createElement('div'); vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(30,6,60,.8) 100%)';
  const chip = document.createElement('div'); chip.id = 'riftchip'; chip.hidden = true;
  chip.style.cssText = 'position:fixed;left:50%;top:44px;transform:translateX(-50%);z-index:8;padding:5px 14px;border-radius:14px;background:rgba(30,8,60,.82);border:1px solid #d7a2ff;color:#fff4d8;font:900 14px "PingFang HK","Noto Sans TC",sans-serif;white-space:nowrap;pointer-events:none';
  document.body.append(vig, chip);
  let chipT = 0;
  const say = (t, ms) => { chip.textContent = t; chip.hidden = !t; clearTimeout(chipT); if (ms) chipT = setTimeout(() => { chip.hidden = true; }, ms); };
  let savedTraffic = null, hidOn = false;
  function hideCity(on) {   // 裂縫入面冇車冇人（同 STORM.start）
    if (on === hidOn) return; hidOn = on;
    if (on) { const inside = (px, pz) => (px - X) ** 2 + (pz - Z) ** 2 < (ARENA + 12) ** 2; savedTraffic = TRAFFIC.hide; TRAFFIC.hide = (px, pz) => inside(px, pz) || (savedTraffic ? savedTraffic(px, pz) : false); PEOPLE.hide = inside; }
    else { PEOPLE.hide = null; TRAFFIC.hide = savedTraffic; savedTraffic = null; }
  }
  function envStep(dt) {
    S.k += (S.want - S.k) * Math.min(1, dt * 1.6); if (S.want === 0 && S.k < 0.01) S.k = 0;
    const k = S.k, show = k > 0.002, t = GAME.t;
    door.material.uniforms.t.value = gate.material.uniforms.t.value = sky.material.uniforms.t.value = t;
    env.visible = show; vig.style.opacity = k;
    if (!show) { if (hidOn && S.st !== 'fight') hideCity(false); if (S.filt) { S.filt = false; renderer.domElement.style.filter = ''; } return; }
    S.filt = true; renderer.domElement.style.filter = `saturate(${1 + 0.2 * k}) contrast(${1 + 0.08 * k})`;   // 唔用 hue-rotate：會將朱雀嘅火變綠
    scene.fog.color.lerp(FOG, k); U.fogCol.value.copy(scene.fog.color);
    U.fogNear.value = scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, 30, k); U.fogFar.value = scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, 240, k);
    tmpC.copy(hemi.color).lerp(HEMI, k); hemi.color.copy(tmpC); hemi.intensity *= 1 - 0.25 * k; sunL.intensity *= 1 - 0.6 * k;
    for (const m of TILES.mats()) m.color.multiplyScalar(1 - 0.3 * k);
    U.storm.value = Math.max(U.storm.value, 0.85 * k);
    // 裂縫門：企喺場邊（對住你入嚟嘅方向嘅對面），慢慢轉
    gate.position.set(S.gx, 9.5, S.gz); gate.lookAt(X, 9.5, Z); gateRing.position.copy(gate.position); gateRing.quaternion.copy(gate.quaternion); gateRing.rotateZ(t * 0.3);
    gate.material.uniforms.op.value = 0.95 * k; sky.material.uniforms.op.value = 0.75 * k; sky.rotation.z = t * 0.05;
    wall.material.opacity = 0.45 * k; wallTex.offset.x += dt * 0.04; wallTex.offset.y -= dt * 0.1; gateRing.material.opacity = 0.9 * k; motes.material.opacity = 0.85 * k;
    for (let i = 0; i < NM; i++) { let y = mp[i * 3 + 1] + mv[i] * dt; if (y > 16) y -= 16; mp[i * 3 + 1] = y; }
    mg.attributes.position.needsUpdate = true;
  }

  // ---------- 開始 / 離開 ----------
  function gates() {   // 增援入口：裂縫牆內 16 個方向，揀唔喺樓入面嘅
    const g = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, px = X + Math.cos(a) * (R - 3), pz = Z + Math.sin(a) * (R - 3); if (!blocked(px, pz)) g.push([px, pz]); }
    return g.length ? g : [[X, Z - R + 3]];
  }
  function begin() {
    if (window.FREEFIGHT && FREEFIGHT.on) FREEFIGHT.end(true);   // 有惡名 ★ 入裂縫：警察追唔入嚟（同 end 一樣收埋自由行打鬥，唔係之後 FREEFIGHT.tick 會 BRAWL.stop）
    const H = OPEN.hero, A = BRAWL.ensure(); S.st = 'fight'; S.fight = true; S.want = 1; S.out = 0; S.won = false; say('');
    H.root.visible = false; const ui = $('oui'); if (ui) ui.hidden = true;
    TRAFFIC.block = null; cam.mode = 'storm'; hideCity(true);
    const yaw = Math.atan2(H.x - X, H.z - Z) || Math.PI; S.gx = X - Math.sin(yaw) * (R + 1); S.gz = Z - Math.cos(yaw) * (R + 1);   // 裂縫門喺你對面
    RX.start(TOUCH ? M.alive[0] : M.alive[1]);
    BRAWL.start(X, Z, ARENA, gates(), yaw, TARGET, M);
    RX.log.push(['start', +A.GAME.t.toFixed(1)]);
  }
  function leave(why) {   // 返回城市（贏 / 輸之後撳、或者行出裂縫）
    if (S.st !== 'fight') return;
    const A = BRAWL.api, won = !!(A && A.won) && why !== 'abort';
    const px = A ? A.player.x : X, pz = A ? A.player.z : Z;
    BRAWL.stop(); RX.stop(); S.st = 'idle'; S.fight = false; S.want = 0; S.cool = 4;
    const H = OPEN.hero, dx = px - X, dz = pz - Z, d = Math.hypot(dx, dz), r = Math.max(d, 6), ux = d > 0.5 ? dx / d : 0, uz = d > 0.5 ? dz / d : 1;   // 由打完嘅位置繼續（離裂縫中心至少 6 米，唔會即刻再入）
    H.x = X + ux * r; H.z = Z + uz * r; H.y = 0; H.root.visible = true;
    const ui = $('oui'); if (ui) ui.hidden = false; cam.mode = 'open';
    if (won) { OPEN.addMoney(PAY, 'rift'); if (!DONE) { DONE = true; try { localStorage.setItem('hkcity-rift-done', '1'); } catch (e) {} drawLabel(); } }
    const e = $('oprompt'); if (e) { e.textContent = won ? `✅ 時空裂縫封印！+$${PAY}` : why === 'abort' ? '⏳ 你行出咗時空裂縫（任務放棄）' : '⏳ 返到現代香港'; e.hidden = false; }
    S.last = { why: why || 'button', won };
  }
  document.getElementById('ag-leave').addEventListener('click', () => { if (S.st === 'fight') leave('button'); });

  // ---------- 行入裂縫：載入（全部檔）→ bake 魏兵 → 準備 boss → 開打 ----------
  const RIFT_FILES = ['rift_code.js', 'rift_wei.js', 'rift_zhanghe.js', 'rift_lubu.js'];
  function enter() {
    S.st = 'loading'; S.want = 0.4; hideCity(true); let n = 0; const N = RIFT_FILES.length + 1, t0 = performance.now();
    const inc = () => { n++; if (S.st === 'loading') say(`⏳ 時空裂縫開啟中…（${n} / ${N}）`); };
    say(`⏳ 時空裂縫開啟中…（0 / ${N}）`);
    Promise.all([clips().then(inc), ...RIFT_FILES.map((f) => js(f).then(inc))])
      .then(() => { if (S.st !== 'loading') return; S.tm = { load: Math.round(performance.now() - t0) }; let q = performance.now(); ext(); S.tm.ext = Math.round(performance.now() - q); say('⏳ 時空裂縫開啟中…（準備魏軍）'); q = performance.now(); return RX.bake().then(() => { S.tm.bake = Math.round(performance.now() - q); }); })
      .then(() => new Promise((ok) => requestAnimationFrame(() => { let q = performance.now(); if (RX) RX.prep('zhanghe'); S.tm.prepZ = Math.round(performance.now() - q); requestAnimationFrame(() => { q = performance.now(); if (RX) RX.prep('lubu'); S.tm.prepL = Math.round(performance.now() - q); ok(); }); })))
      .then(() => { if (S.st !== 'loading') return; const q = performance.now(); begin(); S.tm.begin = Math.round(performance.now() - q); })
      .catch((e) => { console.warn('rift load', e && e.message); if (S.st === 'loading') { S.st = 'idle'; S.want = 0; S.cool = 3; S.err = String(e && e.message); say('時空裂縫載入失敗（網絡？），行開再入嚟試', 4000); } });
  }
  function tick(dt) {
    const t = GAME.t; S.cool -= dt;
    const open = cam.mode === 'open' && S.st !== 'fight';
    mk.visible = open; ring.rotation.z = t; ring.material.opacity = 0.55 + 0.3 * Math.sin(t * 4); door.rotation.y = Math.atan2(camera.position.x - X, camera.position.z - Z);
    door.scale.setScalar(S.st === 'loading' ? 1.4 + 0.1 * Math.sin(t * 6) : 1);
    { const cd = Math.hypot(camera.position.x - X, camera.position.z - Z), s = Math.max(1, cd / 150), ls = THREE.MathUtils.clamp(cd / 30, 0.45, 1) * (innerWidth < innerHeight ? 0.7 : 1); beam.scale.set(s, 1, s); label.scale.set(10 * ls, 2.5 * ls, 1); }   // 名牌：行近就細啲（手機直向唔好成個畫面）
    const H = OPEN.hero, dH = Math.hypot(H.x - X, H.z - Z);
    if (S.st === 'loading' && (dH > 12 || cam.mode !== 'open' || OPEN.inCar)) { S.st = 'idle'; S.want = 0; S.cool = 2; say('時空裂縫關閉咗（你行開咗）', 2500); }   // 載緊行開 = 取消（檔照載，下次快啲）
    if (S.st === 'idle' && cam.mode === 'open' && OPEN.active && !OPEN.inCar && S.cool <= 0 && dH < 3.2 && !(window.STORM && STORM.active)) enter();
    if (S.st === 'fight' && cam.mode === 'storm') {   // 行出裂縫牆 = 放棄
      const A = BRAWL.api, P = A.player, d = Math.hypot(P.x - X, P.z - Z);
      if (A.GAME.state === 'play' && d > R + 1.5) { S.out += dt; say(d > ARENA - 3 ? `⚠ 行出時空裂縫＝放棄任務（${Math.max(0, 1.2 - S.out).toFixed(1)}）` : '⚠ 前面係時空裂縫邊界', 0); if (d > ARENA - 3 && S.out > 1.2) leave('abort'); }
      else if (S.out) { S.out = 0; say(''); }
    }
  }

  // ---------- 預熱 shader（同 freefight.js warmStorm）：開打嗰格主角補光（point light）一出現，畫面每種材質都要重新 compile（v43 第一次量：開打嗰格 1.25 秒）。
  // 行近裂縫（150 米內）而又唔係打緊 / 揸車：每 0.1 秒 compile 一種（臨時 scene：城市嘅燈 + 補光 + 霧 → 同一個 program key）；裂縫環境（紫霧、旋渦、光點）都預先 compile。
  const WQ = { list: null, i: 0, t: 0, done: false, ms: 0, n: 0 };
  function proxy(o) {
    if (o.isInstancedMesh) { const p = new THREE.InstancedMesh(o.geometry, o.material, 1); p.instanceColor = o.instanceColor; return p; }
    if (o.isSkinnedMesh) { const p = new THREE.SkinnedMesh(o.geometry, o.material); p.bind(o.skeleton, o.bindMatrix); return p; }
    if (o.isSprite) return new THREE.Sprite(o.material);
    if (o.isPoints) return new THREE.Points(o.geometry, o.material);
    if (o.isLine) return new THREE.LineSegments(o.geometry, o.material);
    return new THREE.Mesh(o.geometry, o.material);
  }
  function warmStep(dt) {
    const A = window.BRAWL && BRAWL.api; if (WQ.done || !A || S.st === 'fight' || cam.mode !== 'open' || OPEN.inCar) return;
    if ((WQ.t -= dt) > 0) return; WQ.t = 0.1;
    if (!WQ.list) {
      const H = OPEN.hero; if (Math.hypot(H.x - X, H.z - Z) > 150) return;
      const hl = A.hero.children.find((o) => o.isPointLight); if (!hl) { WQ.done = true; return; }
      const seen = new Map(), add = (o) => { if (!o.material || !(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; const m = Array.isArray(o.material) ? o.material.map((q) => q.uuid).join() : o.material.uuid;
        const k = m + (o.isInstancedMesh ? (o.instanceColor ? 'IC' : 'I') : '') + (o.isSkinnedMesh ? 'S' : '') + (o.isPoints ? 'P' : o.isLine ? 'L' : o.isSprite ? 'W' : ''); if (!seen.has(k)) seen.set(k, o); };
      scene.traverseVisible((o) => { if (o !== A.ROOT) add(o); }); A.ROOT.traverse(add); env.traverse(add);
      WQ.list = [...seen.values()]; WQ.i = 0;
      const L = WQ.lights = new THREE.Scene(); L.fog = scene.fog; scene.traverseVisible((o) => { if (o.isLight) L.add(o.clone()); }); const h2 = hl.clone(); h2.visible = true; L.add(h2);
    }
    const t0 = performance.now(), T = WQ.lights;
    for (let n = 0; n < 6 && WQ.i < WQ.list.length && performance.now() - t0 < 4; n++) {
      const o = WQ.list[WQ.i++], np = (renderer.info.programs || []).length, p = proxy(o); T.add(p);
      try { renderer.compile(T, camera); } catch (e) { console.warn('rift warm', e.message); }
      T.remove(p); if ((renderer.info.programs || []).length !== np) { WQ.n++; break; }
    }
    WQ.ms += performance.now() - t0;
    if (WQ.i >= WQ.list.length) { WQ.done = true; WQ.list = WQ.lights = null; }
  }

  // ---------- 小地圖紫點 + 開放世界提示 ----------
  function map(x, cx, cz, SC) {   // open.js 小地圖（北向上，中心 150,150）；遠就貼住邊
    let dx = (X - cx) * SC, dz = (Z - cz) * SC; const l = Math.hypot(dx, dz); if (l > 136) { dx *= 136 / l; dz *= 136 / l; }
    const px = 150 + dx, pz = 150 + dz;
    x.fillStyle = '#9a4cff'; x.beginPath(); x.arc(px, pz, 11, 0, 7); x.fill(); x.strokeStyle = '#ffd86a'; x.lineWidth = 2.5; x.stroke();
    x.fillStyle = '#fff4d8'; x.beginPath(); x.moveTo(px - 5, pz - 6); x.lineTo(px + 5, pz - 6); x.lineTo(px, pz); x.lineTo(px + 5, pz + 6); x.lineTo(px - 5, pz + 6); x.lineTo(px, pz); x.closePath(); x.fill();   // 沙漏
  }
  function hint(H) {
    const d = Math.hypot(H.x - X, H.z - Z);
    return `<br>⏳ 時空裂縫：西九 M+ 附近${DONE ? ' ✅' : ''}（${d < 1000 ? Math.round(d) + ' 米' : (d / 1000).toFixed(1) + ' 公里'}），跟小地圖紫點行・三國魏軍、張郃、呂布`;
  }
  return { weapon, back, loadHero, heroReady, env(dt) { tick(dt); warmStep(dt); envStep(dt); }, map, hint, leave, begin, X, Z, R, ARENA, TARGET, PAY, S, M, WQ,
    get RX() { return RX; }, get done() { return DONE; }, ext };
})();
;
window.BOOT && BOOT(0.999)
;
// ============ 香港 3D 城市：網上多人（第一版：PythonAnywhere + HTTP polling）============
// 只喺網址有 ?online=1 先啟動；冇就乜都唔做，單機版完全唔受影響。
// 伺服器 = server/mp_flask（Flask，一個 worker，房間狀態喺記憶體）。整合步驟：net_test/INTEGRATION.md。
// 用到地圖嘅 scene、camera、cam、keys、GAME（包住 GAME.step）、OPEN（開放世界主角 / 車）、buildPeople + HK_PEOPLE
// （其他玩家用返街上嘅真 3D 路人模型；冇就用膠囊公仔）。所有介面文字用 textContent，唔會執行玩家打嘅 HTML。
(() => {
  if (!/[?&]online=1(&|$)/.test(location.search)) return;
  const SERVER_URL = 'https://hkcity.pythonanywhere.com';   // PythonAnywhere 免費帳戶 HKCITY（2026-09-29 部署；每月要喺 Web 分頁撳續期）
  const SERVER = window.NET_SERVER || SERVER_URL;   // NET_SERVER 只係測試頁用
  const G = window.GAME;
  if (!G || !window.THREE || typeof scene === 'undefined') { console.error('net.js: 要放喺遊戲 script 之後'); return; }
  const $ = (id) => document.getElementById(id);
  const T = THREE;

  // ---------- 介面 ----------
  document.head.insertAdjacentHTML('beforeend', `<style>
#nbar{position:fixed;left:12px;top:64px;z-index:30;display:flex;gap:6px;pointer-events:auto}
body.open #nbar{top:10px}
body.agent-on #nbar,body.agent-on #nticker,body.agent-on #nchat{display:none}
.nb{height:34px;min-width:34px;padding:0 10px;border-radius:17px;background:rgba(14,18,48,.82);border:1px solid rgba(140,160,255,.5);color:#fff;font:700 13px/1 inherit;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;position:relative;white-space:nowrap}
@media (max-width:480px){.nb{padding:0 8px;gap:4px}#nbar{gap:4px}#nbar .unit{display:none}}
#ndot{width:9px;height:9px;border-radius:50%;background:#888;flex:none}#ndot.ok{background:#3cff8a}#ndot.slow{background:#ffc83c}#ndot.off{background:#ff4a4a}
#nbadge{position:absolute;right:-4px;top:-4px;min-width:17px;height:17px;border-radius:9px;background:#ff3f6a;font-size:11px;line-height:17px;text-align:center;padding:0 3px}
#nticker{position:fixed;left:12px;top:52%;width:min(60vw,380px);z-index:29;pointer-events:none}
#nticker div{margin-top:4px;padding:3px 9px;border-radius:10px;background:rgba(0,0,0,.5);font-size:13px;line-height:1.4;text-shadow:0 1px 2px #000;transition:opacity .8s;overflow-wrap:anywhere;width:fit-content;max-width:100%}
#nchat{position:fixed;left:12px;top:104px;width:min(420px,calc(100vw - 24px));height:min(46vh,340px);z-index:40;display:flex;flex-direction:column;border-radius:14px;background:rgba(14,18,48,.95);border:1px solid rgba(140,160,255,.5);pointer-events:auto;box-shadow:0 6px 24px #000}
body.open #nchat{top:50px}
#nchat .nh{display:flex;justify-content:space-between;align-items:center;padding:7px 10px 5px;font-size:13px;color:#cfd8ff;border-bottom:1px solid rgba(255,255,255,.12)}
#nchat .nh b{color:#ffd23f;font-size:14px}#nchat .nh span{cursor:pointer;font-size:18px;padding:0 4px;color:#fff}
#nwho{padding:6px 10px;font-size:13px;line-height:1.5;border-bottom:1px solid rgba(140,160,255,.3);max-height:30%;overflow-y:auto}#nwho i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}#nlist{flex:1;overflow-y:auto;padding:6px 10px;font-size:14px;line-height:1.45;overflow-wrap:anywhere}
#nlist .nm{margin:2px 0}#nlist .nn{font-weight:900;cursor:pointer;margin-right:6px}#nlist .ns{color:#9aa3c7;font-size:12px;margin:2px 0}#nlist .ne{color:#ff8a8a;font-size:12px}
#nform{display:flex;gap:6px;padding:7px}
#ninp{flex:1;min-width:0;height:38px;border-radius:19px;border:1px solid rgba(140,160,255,.5);background:rgba(255,255,255,.1);color:#fff;font:16px inherit;font-family:inherit;padding:0 12px;outline:none}
.nbtn{height:38px;padding:0 14px;border-radius:19px;border:0;background:linear-gradient(90deg,#1f5f9b,#1fb5a8);color:#fff;font:700 15px inherit;font-family:inherit;cursor:pointer;white-space:nowrap}
.nbtn.g{background:rgba(255,255,255,.14)}.nbtn:disabled{opacity:.45}
#nmodal{position:fixed;inset:0;z-index:60;background:rgba(4,6,14,.72);display:flex;align-items:center;justify-content:center;padding:14px;pointer-events:auto}
#nmodal .nbox{width:min(420px,100%);max-height:92vh;overflow:auto;background:#141a2e;border:1px solid rgba(140,170,255,.45);border-radius:16px;padding:16px 18px;box-shadow:0 10px 40px #000;font-size:15px;line-height:1.5}
#nmodal h3{margin:0 0 10px;font-size:20px;color:#ffd23f}
#nmodal input{width:100%;box-sizing:border-box;height:42px;margin:4px 0 8px;border-radius:10px;border:1px solid rgba(140,160,255,.5);background:rgba(255,255,255,.08);color:#fff;font:16px inherit;font-family:inherit;padding:0 12px;outline:none}
#nmodal .row{display:flex;gap:8px;margin-top:6px}#nmodal .row .nbtn{flex:1}
#nmodal .note{font-size:12px;color:#9aa3c7;margin-top:10px}#nmodal .err{color:#ff8a8a;font-size:14px;min-height:20px;margin-top:6px}
#nmodal .rm{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid rgba(255,255,255,.1)}#nmodal .rm .t{flex:1;overflow-wrap:anywhere}#nmodal .rm small{color:#9aa3c7}
#nmodal .lnk{background:none;border:0;color:#9aa3c7;text-decoration:underline;font:12px inherit;font-family:inherit;cursor:pointer;padding:0}
#nmenu{position:fixed;z-index:70;background:#141a2e;border:1px solid rgba(140,170,255,.5);border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:4px;box-shadow:0 6px 20px #000;pointer-events:auto}
#nmenu .nbtn{height:34px;font-size:14px}
.lbtabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.lbtabs .nbtn{height:32px;font-size:14px;padding:0 10px}.lbtabs .on{background:#ffd23f;color:#111}
.lblist{max-height:52vh;overflow:auto;font-size:15px;line-height:1.8;margin-bottom:10px}.lblist div{display:flex;justify-content:space-between;gap:12px}.lblist .me{color:#ffd23f;border-top:1px solid #445;margin-top:4px;padding-top:4px}
</style>`);
  document.body.insertAdjacentHTML('beforeend', `<div id="nbar" hidden><div class="nb" id="nstat"><i id="ndot"></i><span id="ncount"></span><span class="unit">人</span></div>
<button class="nb" id="nchatb">💬<span id="nbadge" hidden></span></button><button class="nb" id="nlbb" title="排行榜">🏆</button><button class="nb" id="nroomb">🚪</button></div>
<div id="nticker"></div>
<div id="nchat" hidden><div class="nh"><div><b id="nroomname"></b> <span id="nping" style="font-size:12px;cursor:default;color:#9aa3c7"></span></div><span id="nclose">✕</span></div>
<div id="nwho"></div><div id="nlist"></div><form id="nform" autocomplete="off"><input id="ninp" maxlength="100" enterkeyhint="send" placeholder="講嘢… Say something"><button class="nbtn" id="nsend">送出</button></form></div>
<div id="nmodal" hidden><div class="nbox" id="nbox"></div></div>`);
  if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('touch');
  // 介面上嘅撳 / 打字唔好傳落遊戲（唔會郁鏡頭、搖桿、唔會觸發 WASD / E / Esc）
  for (const id of ['nbar', 'nchat', 'nmodal']) {
    const box = $(id);
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const ev of ['keydown', 'keyup']) box.addEventListener(ev, (e) => { e.stopPropagation(); if (e.key === 'Escape' && ev === 'keydown') { if (id === 'nchat') openChat(false); } });
  }
  const clearKeys = () => { if (typeof keys !== 'undefined') for (const k in keys) keys[k] = false; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&amp;/g, '&');   // 伺服器已經 escape，呢度還原再用 textContent 顯示

  const ERR = {
    name_chars: '用戶名要 3–16 個英文字母、數字或者 _（最少一個字母）', name_reserved: '呢個名唔用得，揀第二個', name_bad: '名入面有唔適合嘅字',
    name_taken: '呢個名已經有人用咗', pw_rules: '密碼要 6–64 個字，唔可以同用戶名一樣', bad_login: '用戶名或者密碼唔啱', rate: '試得太多次，等幾分鐘再試',
    banned: '呢個帳戶已經停用', full: '房間滿咗（最多 16 人）', no_room: '房間已經冇咗', rooms_full: '房間太多，入現有嘅房先', long: '太長喇（最多 100 字）',
    empty: '冇打字', fast: '慢啲啦，等一陣再講', muted: '你被舉報咗，暫時唔可以講嘢', network: '連唔到伺服器', timeout: '伺服器冇回應', origin: '呢個網頁唔准用呢個伺服器',
    auth: '請重新登入', no_server: '未設定伺服器（net.js 嘅 SERVER_URL）',
  };
  const errText = (e) => ERR[e.code] || '出錯：' + e.code;

  // ---------- 同伺服器傾偈：全部 POST text/plain（CORS simple request，唔使 preflight）----------
  async function api(path, body) {
    if (!SERVER) throw Object.assign(new Error('no_server'), { code: 'no_server' });
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(SERVER + '/api/' + path, { method: 'POST', body: JSON.stringify(body), signal: ctl.signal, credentials: 'omit' });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (!r.ok || !j || j.err) { const code = (j && j.err) || 'http_' + r.status; throw Object.assign(new Error(code), { code, body: j }); }
      return j;
    } catch (e) { if (!e.code) e.code = e.name === 'AbortError' ? 'timeout' : 'network'; throw e; }
    finally { clearTimeout(timer); }
  }

  // ---------- 狀態 ----------
  let tok = null, me = 0, myName = '', room = null, polling = false;
  let k = 0, rv = -1, cSeen = 0, eSeen = 0, mv = -1, iv = 250, fails = 0, rtt = 0, clockOff = null, lastSent = null, lastSentT = 0, mission = null, per = 0, lastT1 = 0;
  const remotes = new Map(), names = new Map(), muted = new Set(), shown = new Set();
  let unread = 0, chatOpen = false, firstTick = true, tickerT = 0;
  try { const s = JSON.parse(localStorage.getItem('hkcity-net') || 'null'); if (s && s.t) { tok = s.t; myName = s.n; } } catch (e) {}
  const save = () => { try { localStorage.setItem('hkcity-net', JSON.stringify(tok ? { t: tok, n: myName } : null)); } catch (e) {} };

  function status(s) {
    $('ndot').className = s;
    $('nping').textContent = s === 'ok' ? `延遲 ${Math.round(rtt)} ms` : s === 'slow' ? '連線唔穩…' : '斷咗線，重試緊';
  }
  function showBar(on) { $('nbar').hidden = !on; if (!on) { openChat(false); $('nticker').textContent = ''; } }
  function count() { $('ncount').textContent = names.size || 1; }

  // ---------- 登入 / 註冊 ----------
  function modal(build) { const b = $('nbox'); b.textContent = ''; build(b); $('nmodal').hidden = false; clearKeys(); }
  const hideModal = () => { $('nmodal').hidden = true; };
  function barOffline() { openChat(false); showBar(true); $('nstat').hidden = true; $('nchatb').hidden = true; $('nroomb').textContent = '🌐 網上'; }
  function offline() { hideModal(); room = null; barOffline(); }
  function showLogin(msg) {
    modal((b) => {
      b.append(el('h3', '', '🌐 網上多人 Online'));
      const u = el('input'), p = el('input'), er = el('div', 'err', msg || '');
      u.placeholder = '用戶名 Username'; u.maxLength = 16; u.autocomplete = 'username'; u.autocapitalize = 'off'; u.spellcheck = false; u.value = myName || '';
      p.placeholder = '密碼 Password'; p.type = 'password'; p.maxLength = 64; p.autocomplete = 'current-password';
      const row = el('div', 'row'), bl = el('button', 'nbtn', '登入 Log in'), br = el('button', 'nbtn g', '註冊 Sign up');
      row.append(bl, br);
      const go = async (kind) => {
        er.textContent = '…'; bl.disabled = br.disabled = true;
        try { const j = await api(kind, { u: u.value.trim(), p: p.value }); tok = j.t; myName = j.name; me = j.me; save(); showRooms(); }
        catch (e) { er.textContent = errText(e); } finally { bl.disabled = br.disabled = false; }
      };
      bl.onclick = () => go('login'); br.onclick = () => go('register');
      p.addEventListener('keydown', (e) => { if (e.key === 'Enter') go('login'); });
      const off = el('button', 'nbtn g', '只玩單機 Play offline'); off.style.width = '100%'; off.style.marginTop = '10px'; off.onclick = offline;
      b.append(u, p, row, er, el('div', 'note', '⚠️ 唔好用真名、電話或者學校名做用戶名。用戶名：3–16 個英文字母／數字／_；密碼最少 6 個字。聊天會自動過濾粗口，亦可以舉報。 Don\'t use your real name.'), off);
      setTimeout(() => (u.value ? p : u).focus(), 50);
    });
  }
  async function showRooms(msg) {
    modal((b) => {
      const head = el('div'); head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline';
      const lo = el('button', 'lnk', '登出 Log out'); lo.onclick = () => { if (tok) api('logout', { t: tok }).catch(() => {}); tok = null; save(); showLogin(); };
      head.append(el('h3', '', `🏙 揀房間 Rooms`), lo);
      const hi = el('div', 'note', `你好 ${myName}！揀一間房一齊行街。`); hi.style.marginTop = '0';
      const list = el('div', '', '載入中… Loading'), er = el('div', 'err', msg || '');
      const inp = el('input'); inp.placeholder = '新房間名稱 New room name'; inp.maxLength = 20;
      const row = el('div', 'row'), mk = el('button', 'nbtn', '建立 Create'), rf = el('button', 'nbtn g', '重新整理'), off = el('button', 'nbtn g', '只玩單機');
      row.append(mk, rf, off);
      const del = el('button', 'lnk', '刪除帳戶 Delete account'); del.style.marginTop = '10px';
      b.append(head, hi, list, inp, row, er, del);
      const load = async () => {
        try {
          const j = await api('rooms', {}); list.textContent = '';
          for (const r of j.rooms) {
            const line = el('div', 'rm'), t = el('span', 't', unesc(r.name)), n = el('small', '', `${r.n}/${r.max}`), go = el('button', 'nbtn', '加入');
            go.disabled = r.n >= r.max; go.onclick = () => join(r.id, er); line.append(t, n, go); list.append(line);
          }
        } catch (e) { list.textContent = ''; er.textContent = errText(e); }
      };
      mk.onclick = async () => { try { const j = await api('create', { t: tok, name: inp.value }); entered(j); } catch (e) { er.textContent = errText(e); if (e.code === 'auth') showLogin(ERR.auth); } };
      rf.onclick = load; off.onclick = offline;
      del.onclick = async () => {
        const pw = prompt('刪除帳戶：所有紀錄會刪除，唔可以還原。輸入密碼確認：'); if (!pw) return;
        try { await api('delete_me', { t: tok, p: pw }); tok = null; myName = ''; save(); showLogin('帳戶已刪除'); } catch (e) { er.textContent = errText(e); }
      };
      load();
    });
  }
  async function join(rid, er) {
    try { entered(await api('join', { t: tok, r: rid })); }
    catch (e) { if (e.code === 'auth') { tok = null; save(); showLogin(ERR.auth); } else if (er) er.textContent = errText(e); else throw e; }
  }
  function entered(j) {
    clearRemotes(); room = j.room; me = j.me; iv = j.iv || 250;
    k = 0; rv = -1; cSeen = 0; eSeen = 0; mv = -1; clockOff = null; lastSent = null; per = 0; lastT1 = 0; firstTick = true; names.clear(); shown.clear();
    $('nlist').textContent = ''; $('nroomname').textContent = unesc(room.name);
    hideModal(); showBar(true); $('nstat').hidden = false; $('nchatb').hidden = false; $('nroomb').textContent = '🚪'; count(); status('ok');
    sysLine(`入咗「${unesc(room.name)}」。撳右上「開放世界」或者「落街行」同其他人一齊行街；💬 = 聊天`);
    loop();
  }
  async function leave() {
    const r = room; room = null; clearRemotes(); barOffline();
    if (r) try { await api('leave', { t: tok }); } catch (e) {}
    showRooms();
  }
  addEventListener('pagehide', () => { if (room && tok && navigator.sendBeacon) navigator.sendBeacon(SERVER + '/api/leave', JSON.stringify({ t: tok })); });
  $('nroomb').onclick = () => (room ? leave() : tok ? showRooms() : showLogin());
  $('nlbb').onclick = () => showBoard();
  $('nchatb').onclick = () => openChat(!chatOpen);
  $('nclose').onclick = () => openChat(false);
  $('nstat').onclick = () => openChat(!chatOpen);

  // ---------- 我嘅位置（開放世界主角 / 車；落街行 = 鏡頭；其他模式 = 唔喺街上）----------
  function localState() {
    const O = window.OPEN, m = typeof cam !== 'undefined' ? cam.mode : '';
    let x, z, y, h, a = 0;
    if (O && O.active && (m === 'open' || m === 'brawl')) { const c = O.inCar ? O.car : O.hero; x = c.x; z = c.z; y = c.y || 0; h = c.h; a = O.inCar ? 1 : 0; }
    else if (m === 'walk') { x = cam.wx; z = cam.wz; y = cam.wy || 0; h = cam.wyaw + Math.PI; }
    else return lastSent ? [lastSent[0], lastSent[1], lastSent[2], lastSent[3], 2] : [0, 0, 0, 0, 2];   // 航拍 / 賽車 / 暴風：其他人見唔到你
    const c = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
    return [c(x * 10, -80000, 80000), c(z * 10, -80000, 80000), c(y * 10, -500, 5000), c(Math.atan2(Math.sin(h), Math.cos(h)) * 100, -315, 315), a];
  }

  // ---------- polling：一次一個 request；/api/tick 同時送我嘅狀態 + 攞其他人嘅變化 ----------
  async function loop() {
    if (polling) return; polling = true;
    while (room) {
      const t0 = performance.now(), s = localState(), rid = room.id;
      const body = { t: tok, r: rid, k, rv, c: cSeen, e: eSeen, mv, hr: (window.HEROPICK && HEROPICK.cur) || 'zy' };   // v41：我揀咗邊個角色（舊伺服器唔理）
      if (!lastSent || s.some((v, i) => v !== lastSent[i]) || t0 - lastSentT > 3000) body.s = s;
      try {
        const j = await api('tick', body);
        if (!room || room.id !== rid) continue;
        if (body.s) { lastSent = s; lastSentT = t0; }
        onTick(j, t0); fails = 0; status('ok');
      } catch (e) {
        if (!room) break;
        if (e.code === 'gone') { try { await join(room.id); } catch (e2) { sysLine('房間冇咗，返去揀房', true); room = null; clearRemotes(); showRooms(); break; } }
        else if (e.code === 'auth' || e.code === 'banned') { room = null; clearRemotes(); tok = null; save(); showLogin(ERR[e.code]); break; }
        else if (e.code === 'fast') iv = (e.body && e.body.iv) || iv;
        else { fails++; status(fails > 3 ? 'off' : 'slow'); }
      }
      const wait = Math.max(0, iv - (performance.now() - t0)) + (fails ? Math.min(5000, 400 * fails) : 0);
      await new Promise((r) => setTimeout(r, wait));
    }
    polling = false;
  }
  function onTick(j, t0) {
    const t1 = performance.now(); rtt += ((t1 - t0) - rtt) * (rtt ? 0.2 : 1);
    if (lastT1 && t1 - lastT1 < 5000) per += ((t1 - lastT1) - per) * (per ? 0.1 : 1);   // 實際 poll 週期（慢網絡會長過 iv）
    lastT1 = t1;
    const off = j.now - (t0 + t1) / 2; clockOff = clockOff === null ? off : clockOff + (off - clockOff) * 0.1;   // 伺服器時間 ≈ 本機 + clockOff
    iv = j.iv || iv; k = j.k;
    if (j.n) {
      rv = j.rv; names.clear(); for (const [pid, n] of j.n) names.set(pid, n);
      HEROS.clear(); for (const [pid, h] of j.hr || []) HEROS.set(pid, h);   // v41 伺服器先有；冇 = 紳士
      for (const [pid, R] of remotes) { if (!names.has(pid)) { dispose(R); remotes.delete(pid); } else if (R.want !== heroOf(pid)) setHero(R, heroOf(pid)); }
      count();
    }
    for (const [pid, x, z, y, h, a, t] of j.p) {
      if (pid === me) continue;
      let R = remotes.get(pid);
      if (!R) { R = makeAvatar(pid, names.get(pid) || '?'); remotes.set(pid, R); }
      const b = R.buf; if (b.length && t <= b[b.length - 1].t) continue;
      b.push({ t, x: x / 10, z: z / 10, y: y / 10, h: h / 100, a }); if (b.length > 12) b.shift();
    }
    if (j.m) { cSeen = j.c; for (const m of j.m) addMsg(m, firstTick); }
    if (j.e) { eSeen = j.e[j.e.length - 1][0]; if (!firstTick) for (const ev of j.e) onEvent(ev); }
    if ('mv' in j) { mv = j.mv; mission = j.ms; if (NET.onMission) NET.onMission(mission); }
    firstTick = false;
  }

  // ---------- 其他玩家：佢揀嘅角色（紳士 / 女僕 / 學生特工，v41）+ 腳下色圈 + 名牌；揸車時用色盒車 ----------
  // 冇 hero_pick.js / 冇特工骨架先用返真 3D 路人（v32）或者膠囊公仔
  const COLS = ['#ff5a5a', '#3cc8ff', '#ffd23f', '#7dff6a', '#c07bff', '#ff8a3c', '#3cffd0', '#ff6ad5'];
  let PP;
  function makeTag(name, col) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    x.font = 'bold 30px "PingFang HK","PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    const w = Math.min(250, x.measureText(name).width + 34);
    x.fillStyle = 'rgba(10,14,40,.8)'; x.beginPath(); x.moveTo(128 - w / 2 + 14, 8); x.arcTo(128 + w / 2, 8, 128 + w / 2, 56, 14); x.arcTo(128 + w / 2, 56, 128 - w / 2, 56, 14); x.arcTo(128 - w / 2, 56, 128 - w / 2, 8, 14); x.arcTo(128 - w / 2, 8, 128 + w / 2, 8, 14); x.fill();
    x.fillStyle = col; x.fillRect(128 - w / 2 + 10, 50, w - 20, 4);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 128, 31);
    const tex = new T.CanvasTexture(c), s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.scale.set(0.16, 0.04, 1); s.renderOrder = 20; return s;
  }
  const HEROS = new Map(), heroOf = (pid) => HEROS.get(pid) || 'zy';   // pid → 'zy' / 'maid' / 'student'
  function pedestrian(R) {   // v32 做法（後備）
    const body = R.body, col = R.col; let p = null;
    if (PP === undefined) PP = window.buildPeople && window.HK_PEOPLE ? buildPeople(HK_PEOPLE) : null;
    if (PP) { p = PP.make(R.pid % PP.count); p.root.scale.setScalar(1.7 / PP.height); p.actions.idle.play(); body.add(p.root); }
    else {
      const m = new T.MeshLambertMaterial({ color: col }), c = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 1.1, 12), m); c.position.y = 0.85; body.add(c);
      const hd = new T.Mesh(new T.SphereGeometry(0.22, 12, 10), new T.MeshLambertMaterial({ color: 0xf0c8a0 })); hd.position.y = 1.62; body.add(hd);
      const nose = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.16), m); nose.position.set(0, 1.62, 0.22); body.add(nose);
    }
    R.p = p; R.anim = 'idle';
  }
  function setHero(R, h) {   // 女特工未載好：先用紳士頂住，載好先換；載唔到就一直用紳士
    R.want = h;
    if (!window.HEROPICK || !HEROPICK.model) { if (!R.p && !R.m) pedestrian(R); return; }
    const use = (m) => { if (R.dead) return; if (R.m) R.body.remove(R.m.group); R.m = m; R.body.add(m.group); R.anim = null; };
    const zy = () => { if (!R.m && !R.dead) HEROPICK.model('zy').then((m) => { if (!R.m || R.want === 'zy') use(m); }, () => { if (!R.m && !R.p) pedestrian(R); }); };
    if (R.m && R.m.hero === h) return;
    HEROPICK.model(h).then((m) => { if (R.want === h) use(m); }, () => zy());
    if (h !== 'zy') zy();
  }
  function makeAvatar(pid, name) {
    const col = COLS[pid % COLS.length], root = new T.Group(), body = new T.Group();
    const ring = new T.Mesh(new T.RingGeometry(0.42, 0.58, 28), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; body.add(ring);
    const car = new T.Group(), cm = new T.MeshLambertMaterial({ color: col });
    const bx = (w, h, l, y, m) => { const b = new T.Mesh(new T.BoxGeometry(w, h, l), m); b.position.y = y; car.add(b); };
    bx(1.8, 0.8, 4.4, 0.65, cm); bx(1.6, 0.6, 2.2, 1.35, new T.MeshLambertMaterial({ color: 0x202a38 }));
    car.visible = false;
    const tag = makeTag(name, col); tag.position.y = 2.2;
    root.add(body, car, tag); root.visible = false; scene.add(root);
    const R = { pid, name, col, root, body, car, tag, p: null, m: null, want: null, buf: [], anim: 'idle', x: 0, z: 0, sp: 0, first: true };
    setHero(R, heroOf(pid)); return R;
  }
  function dispose(R) { R.dead = true; scene.remove(R.root); R.tag.material.map.dispose(); R.tag.material.dispose(); }
  function clearRemotes() { for (const R of remotes.values()) dispose(R); remotes.clear(); }
  function setAnim(R, name) {
    if (!R.p || R.anim === name) return; const A = R.p.actions, to = A[name], from = A[R.anim];
    to.reset().play(); if (from) to.crossFadeFrom(from, 0.2, false); R.anim = name;
  }
  const lerpA = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
  // 每格：將其他人畫喺「伺服器時間 − delay」嘅位置（兩個 snapshot 之間 lerp），車最多外推 0.25 秒
  function step(dt) {
    if ($('nticker').firstChild && (tickerT -= dt) < 0) { tickerT = 0.5; placeTicker(); }
    if (!room || clockOff === null) return;
    const rt = performance.now() + clockOff - (2 * Math.max(iv, per) + 150);   // 畫返過去少少：永遠有兩個 snapshot 之間可以 lerp
    const ts = 2 * Math.tan(camera.fov * Math.PI / 360) * (innerHeight < 500 ? 22 : 26) / innerHeight;   // 名牌約 22–26 px 高（手機橫放都睇得清）
    for (const R of remotes.values()) {
      const b = R.buf; if (!b.length) continue;
      while (b.length > 2 && b[1].t <= rt) b.shift();
      const s0 = b[0], s1 = b.length > 1 ? b[1] : b[0];
      let x = s1.x, z = s1.z, y = s1.y, h = s1.h;
      if (b.length > 1 && rt < s1.t && Math.abs(s1.x - s0.x) + Math.abs(s1.z - s0.z) > 80) R.first = true;   // 瞬移（搭地鐵）：唔好滑過去
      else if (b.length > 1 && rt < s1.t) { const f = Math.max(0, (rt - s0.t) / Math.max(1, s1.t - s0.t)); x = s0.x + (s1.x - s0.x) * f; z = s0.z + (s1.z - s0.z) * f; y = s0.y + (s1.y - s0.y) * f; h = lerpA(s0.h, s1.h, f); }
      else if (b.length > 1 && s1.a === 1 && s0.a === 1) { const e = Math.min(250, rt - s1.t) / Math.max(1, s1.t - s0.t); x += (s1.x - s0.x) * e; z += (s1.z - s0.z) * e; }
      const hidden = s1.a === 2; R.root.visible = !hidden; if (hidden) { R.first = true; continue; }
      const d = R.first ? 0 : Math.hypot(x - R.x, z - R.z); R.first = false;
      R.sp += (Math.min(20, d / Math.max(dt, 1e-3)) - R.sp) * Math.min(1, dt * 5); R.x = x; R.z = z;
      R.root.position.set(x, y, z); R.body.rotation.y = h; R.car.rotation.y = h;
      const inCar = s1.a === 1; R.car.visible = inCar; R.body.visible = !inCar; R.tag.position.y = inCar ? 2.4 : 2.2;
      if (R.m && !inCar) {   // 同 open.js 主角一樣：紳士用 run（慢啲播）；女特工 gait(速度)
        const M = R.m, g = R.sp > 0.35 ? (M.gait ? M.gait(R.sp) : ['run', 0.45 + R.sp / 6.5 * 0.75]) : ['idle', 1], to = M.actions[g[0]] || M.actions.idle;
        if (R.anim !== g[0]) { const from = M.actions[R.anim]; to.reset().play(); if (from && from !== to) to.crossFadeFrom(from, 0.2, false); R.anim = g[0]; }
        to.timeScale = g[1]; M.mixer.update(dt);
      } else if (R.p && !inCar) { setAnim(R, R.sp > 0.35 ? 'walk' : 'idle'); if (R.anim === 'walk') R.p.actions.walk.timeScale = Math.max(0.6, Math.min(3, R.sp / 1.25)); R.p.mixer.update(dt); }
      R.tag.visible = camera.position.distanceToSquared(R.root.position) < 300 * 300;   // 300 米內穿牆都見到名牌（搵朋友）
      R.tag.scale.set(ts * 4, ts, 1);
    }
  }
  // 大家入開放世界都喺同一個路邊出世：網上模式入去嗰一刻，按自己嘅玩家 id 移開 1.5–3 米（揀冇樓、冇水嘅位）
  let wasOpen = false;
  function spreadSpawn() {
    const H = OPEN.hero, a = (me * 2.39996) % (Math.PI * 2), r = 1.5 + (me % 3) * 0.75;   // 黃金角：唔同 id 散開唔同方向
    for (let k = 0; k < 8; k++) { const aa = a + k * Math.PI / 4, x = H.x + Math.sin(aa) * r, z = H.z + Math.cos(aa) * r;
      if (!(OPEN.solid && OPEN.solid(x, z))) { H.x = x; H.z = z; return; } }
  }
  const step0 = G.step;
  G.step = function (dt) {
    step0.call(this, dt);
    try {
      const isOpen = !!(window.OPEN && OPEN.active && !OPEN.inCar); if (isOpen && !wasOpen && room && me) spreadSpawn(); wasOpen = isOpen;
      step(dt);
    } catch (e) { console.error('net.js', e); }
  };

  // ---------- 聊天 ----------
  function openChat(on) {
    chatOpen = on && !!room; $('nchat').hidden = !chatOpen;
    if (chatOpen) { whoList(); unread = 0; badge(); $('nticker').textContent = ''; const l = $('nlist'); l.scrollTop = l.scrollHeight; clearKeys(); if (!matchMedia('(pointer:coarse)').matches) $('ninp').focus(); }
    else $('ninp').blur();
  }
  const DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];   // 遊戲座標：北 = −z、東 = +x
  function myPos() {
    const O = window.OPEN, m = typeof cam !== 'undefined' ? cam.mode : '';
    if (O && O.active) { const c = O.inCar ? O.car : O.hero; return { x: c.x, z: c.z }; }
    if (m === 'walk') return { x: cam.wx, z: cam.wz };
    return typeof cam !== 'undefined' ? { x: cam.tx, z: cam.tz } : null;
  }
  function whoList() {
    const w = $('nwho'); if (!chatOpen || !room) return;
    const me0 = myPos(), L = NET.positions();
    if (!L.length) { w.textContent = '房入面暫時得你一個'; return; }
    w.textContent = '';
    for (const q of L) {
      const r = typeof nearestRoad === 'function' ? nearestRoad(q.x, q.z) : null, st = r && r.name && r.name[0] ? r.name[0] : '';
      let where = q.hidden ? '航拍緊（未入開放世界）' : st || '（冇路名）';
      if (me0 && !q.hidden) { const dx = q.x - me0.x, dz = q.z - me0.z, d = Math.hypot(dx, dz), k = Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360 / 45) % 8;
        where += d < 15 ? '（就喺你隔籬）' : `（${DIRS[k]}面 ${d < 1000 ? Math.round(d) + ' 米' : (d / 1000).toFixed(1) + ' 公里'}）`; }
      const row = el('div'), dot = el('i'), nm = el('b', '', q.name); dot.style.background = q.col;   // textContent：名唔會當 HTML
      row.append(dot, nm, '：' + where); w.append(row);
    }
  }
  setInterval(whoList, 1000);
  function badge() { const b = $('nbadge'); b.hidden = !unread; b.textContent = unread > 9 ? '9+' : unread; }
  function sysLine(text, err) { const l = $('nlist'), d = el('div', err ? 'ns ne' : 'ns', text); l.append(d); l.scrollTop = l.scrollHeight; if (!chatOpen) tick(el('div', '', text)); }
  function placeTicker() {   // 左邊中間；任務框（#omis）長過嗰度就擺喺佢下面
    const r = $('omis') && $('omis').getBoundingClientRect(), b = r && r.height ? r.bottom + 8 : 0;   // 收埋咗 = 高度 0
    $('nticker').style.top = Math.max(innerHeight * 0.52, b) + 'px';
  }
  function tick(node) {   // 聊天框閂咗：左邊顯示最近 3 句，8 秒後淡出（唔擋手指：pointer-events none）
    const t = $('nticker'); t.append(node); while (t.children.length > 3) t.firstChild.remove(); placeTicker();
    setTimeout(() => { node.style.opacity = 0; setTimeout(() => node.remove(), 900); }, 8000);
  }
  function addMsg(m, quiet) {
    const [mid, pid, name, text] = m; if (shown.has(mid) || muted.has(pid)) return; shown.add(mid);
    const l = $('nlist'), d = el('div', pid ? 'nm' : 'ns'); d.dataset.pid = pid;
    if (pid) { const n = el('span', 'nn', name); n.style.color = COLS[pid % COLS.length]; if (pid !== me) n.onclick = (e) => menuFor(pid, name, e); d.append(n); }
    d.append(document.createTextNode(unesc(text))); l.append(d); while (l.children.length > 80) l.firstChild.remove();
    l.scrollTop = l.scrollHeight;
    if (quiet || chatOpen) return;
    if (pid && pid !== me) { unread++; badge(); }
    const t = el('div', pid ? 'nm' : ''); if (pid) { const n = el('b', '', name + '：'); n.style.color = COLS[pid % COLS.length]; t.append(n); } t.append(document.createTextNode(unesc(text))); tick(t);
  }
  $('nform').onsubmit = async (e) => {
    e.preventDefault(); const inp = $('ninp'), v = inp.value.trim(); if (!v || !room) return;
    inp.value = '';
    try { const j = await api('chat', { t: tok, r: room.id, text: v }); addMsg(j.m); }
    catch (err) { sysLine(errText(err), true); if (err.code === 'fast' || err.code === 'network' || err.code === 'timeout') inp.value = v; }
  };
  $('ninp').addEventListener('focus', clearKeys);
  addEventListener('keydown', (e) => {   // 電腦：Enter 開聊天
    if (e.key === 'Enter' && room && !chatOpen && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && $('nmodal').hidden) { e.preventDefault(); openChat(true); $('ninp').focus(); }
  });
  function menuFor(pid, name, ev) {
    ev.stopPropagation(); const old = $('nmenu'); if (old) old.remove();
    const m = el('div'); m.id = 'nmenu'; m.addEventListener('pointerdown', (e) => e.stopPropagation());
    m.style.left = Math.min(innerWidth - 190, ev.clientX) + 'px'; m.style.top = Math.min(innerHeight - 250, ev.clientY) + 'px';
    const close = () => m.remove(), btn = (t, f, g) => { const b = el('button', g ? 'nbtn g' : 'nbtn', t); b.onclick = f; m.append(b); };
    m.append(el('b', '', name));
    btn(muted.has(pid) ? '取消靜音 Unmute' : '靜音 Mute', async () => {
      const on = !muted.has(pid); on ? muted.add(pid) : muted.delete(pid); close();
      if (on) for (const d of [...$('nlist').children]) if (d.dataset.pid == pid) d.remove();
      sysLine(on ? `已經靜音 ${name}（你睇唔到佢講嘢）` : `已經取消靜音 ${name}`);
      try { await api('mute', { t: tok, target: pid, on }); } catch (e) {}
    });
    btn('舉報 Report', () => {
      m.textContent = ''; m.append(el('b', '', `舉報 ${name}：原因`));
      for (const [code, t] of [['swear', '講粗口'], ['bully', '欺凌 / 講人壞話'], ['spam', '洗版'], ['personal', '問人私人資料'], ['other', '其他']])
        btn(t, async () => { close(); try { const j = await api('report', { t: tok, r: room.id, target: pid, reason: code }); sysLine(`已經舉報 ${name}，多謝你${j.blocked ? '（佢暫時唔可以講嘢）' : ''}`); } catch (e) { sysLine(errText(e), true); } });
      btn('取消', close, true);
    });
    btn('取消', close, true);
    document.body.append(m); setTimeout(() => addEventListener('pointerdown', close, { once: true }), 0);
  }

  // ---------- 合作任務（第二期用）：伺服器記 KO、計時、判勝負 ----------
  function onEvent([id, kind, d]) {
    const t = kind === 'mission_start' ? `🎯 ${d.by} 開始咗合作任務：${unesc(d.title)}（目標 ${d.target}）` : kind === 'mission_done' ? `✅ 合作任務完成！（${d.ko}/${d.target}）`
      : kind === 'mission_fail' ? '⌛ 合作任務時間到' : kind === 'mission_abort' ? '✖ 合作任務取消咗' : '';
    if (t) sysLine(t);
    if (NET.onEvent) NET.onEvent(kind, d);
  }
  // ---------- v51 排行榜：賺錢 / 打低人先排隊，每 3 秒交一次；伺服器每樣都有上限，報大數都唔會收 ----------
  const LBQ = { e: [], d: {} }; let lbBusy = false;
  const earn = (src, v) => { if (tok && room && LBQ.e.length < 60) LBQ.e.push([src, Math.round(v)]); };
  const defeat = (k) => { if (tok && room) LBQ.d[k] = (LBQ.d[k] || 0) + 1; };
  setInterval(async () => {
    if (lbBusy || !tok || !room || (!LBQ.e.length && !Object.keys(LBQ.d).length)) return;
    const e = LBQ.e.splice(0, 20), d = Object.entries(LBQ.d).map(([k, n]) => [k, Math.min(20, n)]); LBQ.d = {};
    lbBusy = true; try { await api('score', { t: tok, r: room.id, e, d }); } catch (err) {} finally { lbBusy = false; }
  }, 3000);
  function showBoard(by = 'wealth', scope = 'week') {
    modal((b) => {
      b.append(el('h3', null, '🏆 排行榜'));
      const tabs = el('div', 'lbtabs');
      for (const [k, t] of [['wealth', '💰 財富'], ['defeats', '⚔️ 討伐'], ['week', '本週'], ['all', '總榜']]) {
        const isBy = k === 'wealth' || k === 'defeats', x = el('button', 'nbtn' + ((isBy ? by : scope) === k ? ' on' : ''), t);
        x.onclick = () => (isBy ? showBoard(k, scope) : showBoard(by, k)); tabs.append(x);
      }
      const list = el('div', 'lblist', '載入中…'), close = el('button', 'nbtn', '關閉');
      close.onclick = hideModal; b.append(tabs, list, close);
      const fmt = (v) => (by === 'wealth' ? '$' + v.toLocaleString() : v + (by === 'defeats' ? ' 分' : ''));
      api('top', tok ? { by, scope, t: tok } : { by, scope }).then((j) => {
        list.textContent = '';
        if (!j.rows.length) list.append(el('div', null, '暫時未有人上榜'));
        j.rows.forEach(([n, v], i) => { const r = el('div'); r.append(el('span', null, `${['🥇', '🥈', '🥉'][i] || i + 1 + '.'} ${n}`), el('span', null, fmt(v))); list.append(r); });
        if (j.me) { const r = el('div', 'me'); r.append(el('span', null, `你：第 ${j.me[0]} 名`), el('span', null, fmt(j.me[1]))); list.append(r); }
        else if (!tok) list.append(el('div', 'me', '登入網上版先會計你嘅分'));
        if (by === 'defeats') list.append(el('div', null, '打低幫會 1 分・Boss 50 分（途人唔計）'));
      }).catch((e) => { list.textContent = errText(e); });
    });
  }
  const NET = window.NET = {
    earn, defeat, showBoard,
    get room() { return room; }, get me() { return me; }, get mission() { return mission; },
    players: () => [...names].map(([pid, name]) => ({ pid, name, hero: heroOf(pid) })),
    positions: () => [...remotes.values()].filter((R) => R.buf.length && names.has(R.pid)).map((R) => { const b = R.buf[R.buf.length - 1];   // BG 09-30「標埋所有 player 喺邊」：小地圖點 + 玩家列表
      return { pid: R.pid, name: unesc(names.get(R.pid)), x: b.x, z: b.z, hidden: b.a === 2, col: COLS[R.pid % COLS.length] }; }),
    sendEvent: (type, data) => api('event', Object.assign({ t: tok, r: room && room.id, type }, data || {})),   // 例：NET.sendEvent('mission_start', {kind: 'storm', title: '油麻地果欄', target: 80, limit: 300}); NET.sendEvent('ko', {n: 1})
    onEvent: null, onMission: null,
    debug: () => ({ room: room && room.id, me, iv, rtt: Math.round(rtt), status: $('ndot').className, polling,
      remotes: [...remotes.values()].map((R) => ({ pid: R.pid, name: R.name, x: +R.x.toFixed(2), z: +R.z.toFixed(2), visible: R.root.visible, anim: R.anim, n: R.buf.length, hero: R.want, model: R.m ? R.m.hero : R.p ? 'ped' : 'capsule' })),
      chat: [...$('nlist').children].map((d) => d.textContent) }),
  };

  // ---------- 開始 ----------
  showBar(false);
  if (!SERVER) showLogin(ERR.no_server); else if (tok) showRooms(); else showLogin();
})();
;
window.BOOT && BOOT(1.000)
