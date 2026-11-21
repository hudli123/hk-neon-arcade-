/* Street movement and storefront geometry. All coordinates are horizontal metres. */
const CityGeometry = (() => {
  const radius = 0.30;
  const epsilon = 1e-8;

  // Sweep the player's disc against the sides and the round ends of a wall.
  function firstContact(x, z, dx, dz, walls) {
    const speed2 = dx * dx + dz * dz;
    let first = 1, normal = null;
    function contact(t, nx, nz) {
      if (t >= -epsilon && t < first && dx * nx + dz * nz < -epsilon) {
        first = Math.max(0, t);
        normal = [nx, nz];
      }
    }
    function endCap(px, pz) {
      const rx = x - px, rz = z - pz, dot = rx * dx + rz * dz;
      if (dot >= 0) return;
      const disc = dot * dot - speed2 * (rx * rx + rz * rz - radius * radius);
      if (disc <= 0) return;
      const t = (-dot - Math.sqrt(disc)) / speed2;
      contact(t, (rx + t * dx) / radius, (rz + t * dz) / radius);
    }
    for (const wall of walls) {
      const [ax, az, bx, bz] = wall, ex = bx - ax, ez = bz - az, length = Math.hypot(ex, ez);
      if (length < epsilon) continue;
      const ux = ex / length, uz = ez / length, nx = -uz, nz = ux;
      const along = (x - ax) * ux + (z - az) * uz;
      const closest = Math.max(0, Math.min(length, along));
      const rx = x - ax - ux * closest, rz = z - az - uz * closest;
      const distance = Math.hypot(rx, rz);
      // An old spawn behind a shop can leave through its outward-facing display.
      if (wall.outward && (x - ax) * wall.outward[0] + (z - az) * wall.outward[1] <= 0 &&
          dx * wall.outward[0] + dz * wall.outward[1] > 0) continue;
      if (distance <= radius + epsilon) {
        if (distance > epsilon) contact(0, rx / distance, rz / distance);
        continue; // Already touching: permit sliding or increasing clearance.
      }
      const across = dx * nx + dz * nz;
      if (Math.abs(across) > epsilon) {
        const side = across < 0 ? 1 : -1;
        const t = (side * radius - ((x - ax) * nx + (z - az) * nz)) / across;
        const at = along + t * (dx * ux + dz * uz);
        if (at >= 0 && at <= length) contact(t, side * nx, side * nz);
      }
      endCap(ax, az);
      endCap(bx, bz);
    }
    return normal && [first, normal[0], normal[1]];
  }

  function slide(x, z, dx, dz, walls) {
    for (let i = 0; i < 3 && dx * dx + dz * dz > epsilon * epsilon; i++) {
      const hit = firstContact(x, z, dx, dz, walls);
      if (!hit) return [x + dx, z + dz];
      const [t, nx, nz] = hit;
      x += dx * t; z += dz * t;
      const inward = dx * nx + dz * nz;
      dx = (1 - t) * (dx - inward * nx);
      dz = (1 - t) * (dz - inward * nz);
    }
    return [x, z];
  }

  // A point exactly on a polygon edge may count as inside. Leave a micrometre
  // between the mask probes and the mathematical wall contact so sliding stays smooth.
  const probeRadius = radius - 1e-6, diagonal = probeRadius / Math.sqrt(2);
  const probes = [[probeRadius, 0], [-probeRadius, 0], [0, probeRadius], [0, -probeRadius],
    [diagonal, diagonal], [-diagonal, diagonal], [diagonal, -diagonal], [-diagonal, -diagonal]];
  function move(x, z, tx, tz, walls, blocked) {
    const steps = Math.ceil(Math.hypot(tx - x, tz - z) / 0.15);
    if (!steps) return [x, z];
    const dx = (tx - x) / steps, dz = (tz - z) / steps;
    // Preserve point-based barriers such as stairs, water and station structures.
    const crowded = (px, pz) => probes.some(([ox, oz]) => blocked(px + ox, pz + oz));
    let touching = crowded(x, z);
    function advance(vx, vz) {
      const p = slide(x, z, vx, vz, walls);
      if (blocked(p[0], p[1])) return false;
      const tight = crowded(p[0], p[1]);
      if (tight && !touching) return false;
      [x, z] = p; touching = tight;
      return true;
    }
    for (let i = 0; i < steps; i++) {
      if (!advance(dx, dz) && dx && dz) { advance(dx, 0); advance(0, dz); }
    }
    return [x, z];
  }
  function freeFrontage(frame, doorSegments) {
    const ux = (frame.B[0] - frame.A[0]) / frame.length, uz = (frame.B[1] - frame.A[1]) / frame.length, blocked = [];
    for (const [a, b] of doorSegments) {
      // Clip the door segment to a 45 cm strip around this wall. Doors on an
      // opposite or perpendicular wall must not reserve their entire projection here.
      const normal = p => (p[0] - frame.A[0]) * -uz + (p[1] - frame.A[1]) * ux;
      const na = normal(a), nb = normal(b), delta = nb - na;
      if (Math.min(na, nb) > 0.45 || Math.max(na, nb) < -0.45) continue;
      let t0 = 0, t1 = 1;
      if (Math.abs(delta) > 1e-8) {
        const tA = (-0.45 - na) / delta, tB = (0.45 - na) / delta;
        t0 = Math.max(0, Math.min(tA, tB)); t1 = Math.min(1, Math.max(tA, tB));
      }
      const start = (a[0] - frame.A[0]) * ux + (a[1] - frame.A[1]) * uz;
      const run = (b[0] - a[0]) * ux + (b[1] - a[1]) * uz;
      const first = start + t0 * run, last = start + t1 * run;
      const lo = Math.max(0, Math.min(first, last) - 0.3), hi = Math.min(frame.length, Math.max(first, last) + 0.3);
      if (hi > lo) blocked.push([lo, hi]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    let cursor = 0, best = [0, 0];
    for (const [lo, hi] of blocked) {
      if (lo - cursor > best[1] - best[0]) best = [cursor, lo];
      cursor = Math.max(cursor, hi);
    }
    if (frame.length - cursor > best[1] - best[0]) best = [cursor, frame.length];
    return { ...frame, ux, uz, span: best, spanLength: Math.max(0, best[1] - best[0]) };
  }

  function layoutKey(parts) {
    let hash = 2166136261;
    for (const part of parts) {
      const text = typeof part === 'string' ? part : JSON.stringify(part ?? null);
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
      hash = Math.imul(hash ^ 255, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function readLayout(data, key) {
    if (!data || data.version !== 1 || data.key !== key || typeof data.runs !== 'string' ||
        !Number.isSafeInteger(data.total) || data.total < 0) return null;
    const codes = new Uint16Array(data.total);
    if (!data.runs) return codes;
    let index = -1;
    for (const token of data.runs.split(',')) {
      if (!/^[a-z0-9]+$/.test(token)) return null;
      const n = parseInt(token, 36), code = n % 512;
      index += 1 + Math.floor(n / 512);
      if (!Number.isSafeInteger(n) || index >= data.total || (code >> 5) >= ((code >> 1) & 15)) return null;
      codes[index] = code;
    }
    return codes;
  }

  function bayFromCode(halfWidth, preferredOffset, code) {
    if (!code) return null;
    // Each bay is at most 8.4 m wide. Four bits per endpoint hold its grid marks.
    const pitch = 2 * halfWidth / Math.ceil(2 * halfWidth / 0.65);
    const first = code >> 5, last = (code >> 1) & 15;
    return { code, width: (last - first) * pitch, along: (first + last) * pitch / 2 - halfWidth,
      offset: code & 1 ? 0.15 : preferredOffset };
  }

  // Keep the longest continuous part of a bay. A doorway in the middle splits it.
  function fitBay(halfWidth, preferredOffset, valid) {
    const count = Math.ceil(2 * halfWidth / 0.65);
    const pitch = 2 * halfWidth / count;
    let best = null;
    const offsets = preferredOffset > 0.15 ? [preferredOffset, 0.15] : [preferredOffset];
    for (const offset of offsets) {
      let start = null, left = -halfWidth, leftOK = valid(left, offset);
      for (let i = 1; i <= count; i++) {
        const right = i === count ? halfWidth : -halfWidth + i * pitch;
        const rightOK = valid(right, offset);
        const usable = leftOK && rightOK && valid((left + right) * 0.5, offset);
        if (usable && start === null) start = i - 1;
        if (start !== null && (!usable || i === count)) {
          const end = usable ? i : i - 1, width = (end - start) * pitch;
          if (width >= 2.4 && (!best || width > best.width + 1e-6) && valid(-halfWidth + (start + end) * pitch * 0.5, offset)) {
            best = bayFromCode(halfWidth, preferredOffset, (start << 5) | (end << 1) | Number(offset !== preferredOffset));
          }
          start = null;
        }
        left = right; leftOK = rightOK;
      }
      if (best && best.width >= 2 * halfWidth - 1e-6) break;
    }
    return best;
  }
  return { radius, move, freeFrontage, fitBay, bayFromCode, layoutKey, readLayout };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CityGeometry;
