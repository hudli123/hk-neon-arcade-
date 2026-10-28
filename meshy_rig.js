// Meshy 角色（tools/pack_meshy.py）→ three.js SkinnedMesh + AnimationMixer（r128）
// 動作庫 window.MCLIPS 係由趙雲個 rig 出嘅；其他角色用「世界旋轉差」retarget：
//   delta = 來源世界旋轉(動畫) × 來源綁定世界旋轉⁻¹；目標世界旋轉 = delta × 目標綁定世界旋轉；再轉返 local。
// 兩邊都係 Meshy A-pose 綁定，所以 delta 可以直接搬。Hips 高度按盤骨高比例縮放。
window.buildMeshyRig = function (R, CL, want) {
  const dec = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
  const p16 = dec(R.pos, Int16Array), n = p16.length / 3, pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = p16[i] / R.Q;
  const n8 = dec(R.nrm, Int8Array), nrm = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) nrm[i] = n8[i] / 127;
  const u16 = dec(R.uv, Uint16Array), uv = new Float32Array(n * 2); for (let i = 0; i < n * 2; i++) uv[i] = u16[i] / 65535;
  const ji = dec(R.ji, Uint8Array), jw8 = dec(R.jw, Uint8Array), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) { si[i] = ji[i]; sw[i] = jw8[i] / 255; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(dec(R.idx, R.big ? Uint32Array : Uint16Array), 1));
  const group = new THREE.Group(), arm = new THREE.Group(); arm.scale.setScalar(R.rs); group.add(arm);
  const bones = R.bones.map((b) => { const o = new THREE.Bone(); o.name = b.n; o.position.fromArray(b.t); o.quaternion.fromArray(b.r); return o; });
  R.bones.forEach((b, k) => { (b.p >= 0 ? bones[b.p] : arm).add(bones[k]); });
  const inv = R.bones.map((_, k) => new THREE.Matrix4().fromArray(R.ibm, k * 16));
  const tex = new THREE.TextureLoader().load(R.tex); tex.flipY = false;   // 唔 decode sRGB：遊戲 renderer 冇設 outputEncoding（成個 pipeline 線性），decode 咗會暗一大截
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshLambertMaterial({ map: tex, skinning: true }));
  mesh.frustumCulled = false; group.add(mesh);
  group.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
  const byName = {}; bones.forEach((b) => { byName[b.name] = b; });

  // ---- retarget ----
  const S = CL.bones, NS = S.length, srcIdx = {}; S.forEach((b, k) => { srcIdx[b.n] = k; });
  const sBW = S.map((b) => new THREE.Quaternion().fromArray(b.bw)), sBWi = sBW.map((q) => q.clone().invert());
  const tBW = R.bones.map((b) => new THREE.Quaternion().fromArray(b.bw));
  const same = R.bones.every((b, k) => srcIdx[b.n] === k && sBW[k].angleTo(tBW[k]) < 1e-3);   // 趙雲自己：唔使計
  const hipK = R.bones[0].hl[1] / CL.hips[1];
  const sW = S.map(() => new THREE.Quaternion()), tW = R.bones.map(() => new THREE.Quaternion()), q = new THREE.Quaternion(), qi = new THREE.Quaternion();
  const mixer = new THREE.AnimationMixer(group), actions = {};
  for (const name in CL.clips) {
    if (want && !want.includes(name)) continue;
    const c = CL.clips[name], N = c.n, times = new Float32Array(N); for (let f = 0; f < N; f++) times[f] = f / CL.fps;
    const srcQ = S.map((b) => (c.r[b.n] ? dec(c.r[b.n], Int16Array) : null));
    const out = R.bones.map(() => new Float32Array(N * 4));
    for (let f = 0; f < N; f++) {
      for (let k = 0; k < NS; k++) {   // 來源世界旋轉
        const a = srcQ[k]; if (a) q.set(a[f * 4] / 32767, a[f * 4 + 1] / 32767, a[f * 4 + 2] / 32767, a[f * 4 + 3] / 32767).normalize(); else q.fromArray(S[k].r);
        if (S[k].p >= 0) sW[k].multiplyQuaternions(sW[S[k].p], q); else sW[k].copy(q);
      }
      for (let k = 0; k < R.bones.length; k++) {
        const b = R.bones[k], s = srcIdx[b.n];
        if (same) { const a = srcQ[k]; if (a) q.set(a[f * 4] / 32767, a[f * 4 + 1] / 32767, a[f * 4 + 2] / 32767, a[f * 4 + 3] / 32767).normalize(); else q.fromArray(b.r); q.toArray(out[k], f * 4); continue; }
        if (s === undefined) tW[k].copy(tBW[k]); else tW[k].multiplyQuaternions(sW[s], sBWi[s]).multiply(tBW[k]);
        if (b.p >= 0) qi.copy(tW[b.p]).invert().multiply(tW[k]); else qi.copy(tW[k]);
        qi.toArray(out[k], f * 4);
      }
    }
    const tracks = R.bones.map((b, k) => new THREE.QuaternionKeyframeTrack(b.n + '.quaternion', times, out[k]));
    if (c.h) {
      const h = dec(c.h, Int16Array), v = new Float32Array(N * 3), [bx, by, bz] = R.bones[0].hl, [sx, sy, sz] = CL.hips;
      for (let f = 0; f < N; f++) { v[f * 3] = bx + (h[f * 3] / 100 - sx) * hipK; v[f * 3 + 1] = by + (h[f * 3 + 1] / 100 - sy) * hipK; v[f * 3 + 2] = bz + (h[f * 3 + 2] / 100 - sz) * hipK; }
      tracks.push(new THREE.VectorKeyframeTrack(R.bones[0].n + '.position', times, v));
    }
    actions[name] = mixer.clipAction(new THREE.AnimationClip(name, (N - 1) / CL.fps, tracks));
  }
  // 趙雲手骨 local 軸 → 呢個角色手骨 local 軸（武器方向校正用）
  const hs = srcIdx.RightHand, ht = R.bones.findIndex((b) => b.n === 'RightHand');
  const handAxis = (v) => v.clone().applyQuaternion(sBW[hs]).applyQuaternion(tBW[ht].clone().invert());
  const hl = R.bones.findIndex((b) => b.n === 'LeftHand');   // 左手：將右手軸喺綁定姿勢左右鏡像（x 反轉）再轉入左手骨座標
  const handAxisL = (v) => { const w = v.clone().applyQuaternion(sBW[hs]); w.x = -w.x; return w.applyQuaternion(tBW[hl].clone().invert()); };
  return { group, mesh, bones: byName, mixer, actions, handAxis, handAxisL, height: R.bones[0].hl[1] * R.rs / 0.82 };
};
