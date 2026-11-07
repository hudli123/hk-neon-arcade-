// Meshy NPC 試做（?npc=1）：3 個港式路人（阿伯 / OL / 外賣仔）喺上海街 × 亞皆老街行人路來回行。test branch 用，唔影響正常玩。
(() => {
  const js = (s) => new Promise((ok, no) => { const e = document.createElement('script'); e.src = s; e.onload = ok; e.onerror = no; document.head.appendChild(e); });
  const X0 = -102.3, Z0 = -1133.5;   // LandsD StreetCentreLines 交界（EPSG:2326 835366.73, 820012.54）
  const LIST = [['npc_uncle', 1.65, 1.0], ['npc_ol', 1.62, 1.25], ['npc_rider', 1.72, 1.4]];
  const S = { npcs: [], ready: false, err: null };
  function seg() {   // 交界附近最近、南北向嘅路段 = 上海街
    let best = null, bd = 1e9;
    for (const r of ROADS) for (let k = 0; k + 1 < r.pts.length; k++) {
      const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1], len = Math.hypot(bx - ax, bz - az); if (len < 5) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len; if (Math.abs(tz) < 0.7) continue;
      const u = Math.max(0, Math.min(len, (X0 - ax) * tx + (Z0 - az) * tz)), d = Math.hypot(ax + tx * u - X0, az + tz * u - Z0);
      if (d < bd) { bd = d; best = { tx: tz > 0 ? tx : -tx, tz: Math.abs(tz) }; }
    }
    return best || { tx: 0, tz: 1 };
  }
  function start() {
    const { tx, tz } = seg(), side = -1, nx = -tz * side, nz = tx * side;   // 西邊行人路
    LIST.forEach(([id, h, v], i) => {
      const R = buildMeshyRig(MRIG[id], MCLIPS, ['Idle', 'Casual_Walk']);
      R.actions.Idle.play(); R.mixer.update(0); R.group.updateMatrixWorld(true);
      const wy = (b) => R.bones[b].getWorldPosition(new THREE.Vector3()).y, foot = Math.min(wy('LeftFoot'), wy('RightFoot')), sc = h / ((wy('Head') - foot) * 1.1);
      R.group.scale.setScalar(sc); R.group.position.y = -foot * sc + 0.08; R.actions.Idle.stop();   // 同主角一樣計法
      R.mesh.material.color.setHex(0xd0d0d0);
      const root = new THREE.Group(); root.add(R.group);
      const along = 14 + i * 4, px = X0 + tx * along, pz = Z0 + tz * along, [wd] = rayWall(px, pz, nx, nz, 28);
      const off = (wd < 28 ? wd : 9) - 1.6 - i * 0.6;
      const n = { id, R, root, nx, nz, v, x: px + nx * off, z: pz + nz * off, a: 0, dir: i % 2 ? -1 : 1, tx, tz, len: 10 };
      n.x0 = n.x; n.z0 = n.z; R.actions.Casual_Walk.play(); scene.add(root); S.npcs.push(n);
    });
    const step = GAME.step;
    GAME.step = function (dt) {
      const r = step.apply(this, arguments);
      for (const n of S.npcs) {
        n.a += n.dir * n.v * dt; if (Math.abs(n.a) > n.len) { n.a = Math.sign(n.a) * n.len; n.dir *= -1; }
        n.x = n.x0 + n.tx * n.a; n.z = n.z0 + n.tz * n.a;
        const y = (window.OPEN && OPEN.hero) ? OPEN.hero.y : 0;
        n.root.position.set(n.x, Math.max(0, y), n.z); n.root.rotation.y = Math.atan2(n.tx * n.dir, n.tz * n.dir);
        n.R.mixer.update(dt * n.v / 1.2);
      }
      return r;
    };
    S.ready = true;
  }
  const go = () => (window.MCLIPS ? Promise.resolve() : js('hero_clips.js')).then(() => js('npc_meshy.js')).then(start).catch((e) => { S.err = String(e); });
  window.NPCT = S;
  if (window.OPEN && window.GAME) go(); else addEventListener('load', go);
})();
