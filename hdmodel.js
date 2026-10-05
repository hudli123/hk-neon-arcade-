// 原始地政總署 3D model（hd/<ID>/，唔減面）：鏡頭行近先載，行遠就卸走。hkcity / hkrace 共用
// 遊戲 renderer 冇 sRGB（成個 pipeline 線性），所以貼圖唔 decode sRGB，同圖幅一致
window.HDM = (() => {
  const E0 = 835469, N0 = 818879;
  // ids：同一個地標嘅幾件 model（半島 = 舊翼 + 1994 年加建嘅塔樓，塔樓坐喺 48 mPD 天台）；ground = 地面 mPD（遊戲 y = 0）
  const LIST = [{ en: 'The Peninsula', x: 273.8, z: 1516.3, ground: 3.574, ids: ['B357421737102063A0', 'B357411738401063A0'] }];
  function create(scene, o) {
    const px = o.px || 2048, R = o.R || 350, R2 = o.R2 || 500, aniso = o.aniso || 4;
    const items = LIST.map((L) => ({ ...L, state: 0, root: null, texs: [], mats: [], ims: [] }));
    async function load(it) {
      it.state = 1;
      try {
        const root = new THREE.Group(), texs = [], mats = [];
        for (const id of it.ids) {
        const base = `hd/${id}/`;
        const g = await (await fetch(`${base}${id}.gltf`)).json();
        const bin = await (await fetch(`${base}${g.buffers[0].uri}`)).arrayBuffer();
        const m = g.nodes[0].matrix, T = [m[12], m[13], m[14]];
        const acc = (i) => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
          const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
          return new C(bin, (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n); };
        const tx = g.textures.map(() => { const t = new THREE.Texture(); t.flipY = false; t.anisotropy = aniso; return t; });
        texs.push(...tx);
        // 一張張解（同時解十幾張 2048 會爆手機記憶體）；全部解完先擺出嚟，唔會見到白色牆
        for (let k = 0; k < tx.length; k++) {
          if (it.state !== 1) { tx.forEach((t) => t.dispose()); return; }
          const b = await (await fetch(base + g.images[g.textures[k].source].uri)).blob();
          const im = await createImageBitmap(b, px < 2048 ? { imageOrientation: 'none', resizeWidth: px, resizeHeight: px, resizeQuality: 'high' } : { imageOrientation: 'none' });
          it.ims.push(im); tx[k].image = im; tx[k].needsUpdate = true;
        }
        const mt = g.materials.map((q) => { const t = tx[q.pbrMetallicRoughness.baseColorTexture.index];
          return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, emissive: 0xffdcaa, emissiveMap: t, emissiveIntensity: 0 }); });
        mats.push(...mt);
        const part = new THREE.Group();
        for (const me of g.meshes) for (const p of me.primitives) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(acc(p.attributes.POSITION), 3));
          if (p.attributes.NORMAL != null) geo.setAttribute('normal', new THREE.BufferAttribute(acc(p.attributes.NORMAL), 3)); else geo.computeVertexNormals();
          geo.setAttribute('uv', new THREE.BufferAttribute(acc(p.attributes.TEXCOORD_0), 2));
          geo.setIndex(new THREE.BufferAttribute(acc(p.indices), 1));
          part.add(new THREE.Mesh(geo, mt[p.material]));
        }
        part.matrixAutoUpdate = false;   // glTF 世界 = (x, z, -y) + T（T = HK1980 + mPD）；遊戲：X = E - E0，Z = N0 - N，y = mPD - ground
        part.matrix.set(1, 0, 0, T[0] - E0, 0, 0, 1, T[1] - it.ground, 0, -1, 0, T[2] + N0, 0, 0, 0, 1);
        root.add(part);
        }
        if (it.state !== 1) { root.traverse((c) => c.geometry && c.geometry.dispose()); texs.forEach((t) => t.dispose()); return; }
        Object.assign(it, { root, texs, mats, state: 2 }); scene.add(root);
        o.onShow && o.onShow(it, true);
      } catch (e) { it.state = -1; console.warn('hdmodel', it.en, e.message); }
    }
    function unload(it) {
      if (it.root) { scene.remove(it.root); it.root.traverse((c) => c.geometry && c.geometry.dispose()); }
      it.mats.forEach((m) => m.dispose()); it.texs.forEach((t) => t.dispose()); it.ims.forEach((im) => im.close && im.close());
      if (it.state === 2) o.onShow && o.onShow(it, false);
      Object.assign(it, { state: 0, root: null, texs: [], mats: [], ims: [] });
    }
    function step(x, z) {
      for (const it of items) {
        const d = Math.hypot(it.x - x, it.z - z);
        if (d < R && it.state === 0) load(it);
        else if (d > R2 && it.state >= 1) unload(it);
      }
    }
    return { step, items, px };
  }
  return { create, LIST };
})();
