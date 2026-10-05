// 原始地政總署 3D model（hd/<ID>/，唔減面）：鏡頭行近先載，行遠就卸走。hkcity / hkrace 共用
// 遊戲 renderer 冇 sRGB（成個 pipeline 線性），所以貼圖唔 decode sRGB，同圖幅一致
window.HDM = (() => {
  const E0 = 835469, N0 = 818879;
  const LIST = [{ id: 'B357421737102063A0', en: 'The Peninsula', x: 273.8, z: 1516.3 }];
  function create(scene, o) {
    const px = o.px || 2048, R = o.R || 350, R2 = o.R2 || 500, aniso = o.aniso || 4;
    const items = LIST.map((L) => ({ ...L, state: 0, root: null, texs: [], mats: [], ims: [] }));
    async function load(it) {
      it.state = 1;
      try {
        const base = `hd/${it.id}/`;
        const g = await (await fetch(`${base}${it.id}.gltf`)).json();
        const bin = await (await fetch(`${base}${g.buffers[0].uri}`)).arrayBuffer();
        const m = g.nodes[0].matrix, T = [m[12], m[13], m[14]];
        const acc = (i) => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
          const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
          return new C(bin, (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n); };
        let zmin = Infinity;
        for (const me of g.meshes) for (const p of me.primitives) zmin = Math.min(zmin, g.accessors[p.attributes.POSITION].min[2]);
        const texs = g.textures.map(() => { const t = new THREE.Texture(); t.flipY = false; t.anisotropy = aniso; return t; });
        // 一張張解（同時解 16 張 2048 會爆手機記憶體）；全部解完先擺出嚟，唔會見到白色牆
        for (let k = 0; k < texs.length; k++) {
          if (it.state !== 1) return;
          const b = await (await fetch(base + g.images[g.textures[k].source].uri)).blob();
          const im = await createImageBitmap(b, px < 2048 ? { imageOrientation: 'none', resizeWidth: px, resizeHeight: px, resizeQuality: 'high' } : { imageOrientation: 'none' });
          it.ims.push(im); texs[k].image = im; texs[k].needsUpdate = true;
        }
        const mats = g.materials.map((mt) => { const t = texs[mt.pbrMetallicRoughness.baseColorTexture.index];
          return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, emissive: 0xffdcaa, emissiveMap: t, emissiveIntensity: 0 }); });
        const root = new THREE.Group();
        for (const me of g.meshes) for (const p of me.primitives) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(acc(p.attributes.POSITION), 3));
          if (p.attributes.NORMAL != null) geo.setAttribute('normal', new THREE.BufferAttribute(acc(p.attributes.NORMAL), 3)); else geo.computeVertexNormals();
          geo.setAttribute('uv', new THREE.BufferAttribute(acc(p.attributes.TEXCOORD_0), 2));
          geo.setIndex(new THREE.BufferAttribute(acc(p.indices), 1));
          root.add(new THREE.Mesh(geo, mats[p.material]));
        }
        root.matrixAutoUpdate = false;   // glTF 世界 = (x, z, -y) + T；遊戲：X = E - E0，Z = N0 - N，地面 y = 0
        root.matrix.set(1, 0, 0, T[0] - E0, 0, 0, 1, -zmin, 0, -1, 0, T[2] + N0, 0, 0, 0, 1);
        if (it.state !== 1) { root.traverse((c) => c.geometry && c.geometry.dispose()); texs.forEach((t) => t.dispose()); return; }
        Object.assign(it, { root, texs, mats, state: 2 }); scene.add(root);
        o.onShow && o.onShow(it, true);
      } catch (e) { it.state = -1; console.warn('hdmodel', it.id, e.message); }
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
