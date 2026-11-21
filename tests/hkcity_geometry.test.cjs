const test = require('node:test');
const assert = require('node:assert/strict');
const { move, radius, fitBay, freeFrontage, readLayout, layoutKey, bayFromCode } = require('../hkcity_geometry.js');

const clear = () => false;
const wall = [[0, -5, 0, 5], [0.10, -5, 0.10, 5]];
const occupied = (x, z) => x >= 0 && x <= 0.10 && Math.abs(z) < 5;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, a + ' vs ' + b);
test('Walk and Open World walking/sprinting stop on both sides of a 10 cm wall', () => {
  for (const fps of [15, 30, 60, 120]) for (const speed of [2.6, 4.5, 6.5, 12]) {
    for (const direction of [1, -1]) {
      let x = direction > 0 ? -0.734 : 0.834;
      for (let i = 0; i < fps; i++) [x] = move(x, 0, x + direction * speed / fps, 0, wall, occupied);
      near(x, direction > 0 ? -radius : 0.10 + radius);
    }
  }
});
test('continuous sweep slides along an angled facade and stops in corners', () => {
  const [x, z] = move(-1, 0, 2, 1, [[-5, -5, 5, 5]], clear);
  near((z - x) / Math.SQRT2, radius);
  near(x + z, 3);
  const corner = move(-2, -2, 2, 2, [[0, -4, 0, 0], [-4, 0, 0, 0]], clear);
  near(corner[0], -radius); near(corner[1], -radius);
});
test('doorways admit the body only when there is room between both jambs', () => {
  function pass(gap) {
    return move(-1, 0, 1, 0, [[0, -5, 0, -gap / 2], [0, gap / 2, 0, 5]], clear)[0];
  }
  near(pass(1.2), 1);
  assert.ok(pass(0.45) < 0);
});
test('a partly overlapping spawn can leave, and a shop correction cannot cross another wall', () => {
  const shop = [0, -2, 0, 2]; shop.outward = [1, 0];
  near(move(-0.1, 0, 0.45, 0, [shop], clear)[0], 0.45);
  near(move(0.12, 0, -1, 0, [shop], clear)[0], 0.12);
  near(move(-0.1, 0, 2.0, 0, [shop, [0.8, -3, 0.8, 3]], clear)[0], 0.8 - radius);
});
test('point-based station, water, and railing masks still stop movement', () => {
  const [x,z] = move(-1, 0, 1, 1, [], (x) => x >= 0 && x <= 0.5);
  assert.ok(x < -0.29); near(z,1);
});
test('storefronts stay on one continuous portion of a wall and can fall back flush', () => {
  const corner = fitBay(3, 0.35, t => t <= 1.1);
  assert.ok(corner.width >= 2.4 && corner.along + corner.width / 2 <= 1.1);
  const split = fitBay(4, 0.35, t => t < -0.6 || t > 0.6);
  assert.ok(split.along + split.width / 2 <= -0.6 || split.along - split.width / 2 >= 0.6);
  assert.equal(fitBay(3, 0.35, t => Math.abs(t) < 0.8), null);
  const flush = fitBay(3, 2.5, (t,d) => d < 0.3);
  near(flush.width, 6); near(flush.offset, 0.15);
  assert.deepEqual(bayFromCode(3, 2.5, flush.code), flush);
});
test('indoor fixtures use the longest free wall interval and respect overlapping doors', () => {
  const frame = { A:[0,0], B:[6,0], length:6 };
  const span = doors => freeFrontage(frame, doors).span;
  near(span([[[2.5,0],[3.5,0]]])[1], 2.2);
  assert.deepEqual(span([[[0,0],[6,0]]]), [0,0]);
  assert.deepEqual(span([[[2.5,4],[3.5,4]]]), [0,6]); // door on opposite wall
  const after = span([[[0,0],[2,0]],[[3.3,0],[1,0]]]);
  near(after[0], 3.6); near(after[1], 6);
  const rightAngle = span([[[0,3],[0,0]]]);
  near(rightAngle[0],0.3); near(rightAngle[1],6);
});
test('precomputed placements have stable slot IDs and changed map inputs invalidate them', () => {
  const key = layoutKey(['walkways',[[1,2]]]), code = fitBay(3, 1, () => true).code;
  const data = {version:1, key, total:4, runs: [(512 + code).toString(36),code.toString(36)].join(',')};
  assert.deepEqual(Array.from(readLayout(data,key)),[0,code,code,0]);
  assert.equal(readLayout(data,layoutKey(['walkways',[[1,3]]])),null);
  assert.deepEqual(Array.from(readLayout({...data,runs:''},key)),[0,0,0,0]);
  assert.equal(readLayout({...data,runs:null},key),null);
});
