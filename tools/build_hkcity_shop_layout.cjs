// Rebuild the shipped street-shop layout from the same map and placement rules as the game.
// Run with --check to compare without writing. No browser or npm packages are required.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const file = path.join(root, 'hkcity.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi), match => match[1]);
const app = scripts.find(script => script.includes('const BLD = readPolys'));

function section(start, stop) {
  const a = app.indexOf(start), b = app.indexOf(stop, a + start.length);
  if (a < 0 || b < 0) throw Error('City source section missing: ' + start);
  return app.slice(a, b);
}
const ctx = { performance, atob, console, location: { search: '' } };
ctx.window = ctx;
vm.createContext(ctx);
const run = code => vm.runInContext(code, ctx);

run(scripts.find(script => script.includes('SPDX-License-Identifier: MIT') && script.includes('WebGLRenderer')));
let readingMap = false;
for (const script of scripts) {
  if (script.startsWith('__J.push(`{"tiles"')) { run('window.__J=[]'); readingMap = true; }
  if (readingMap && (script.startsWith('__J.push') || script.includes('window.CITY = JSON.parse'))) run(script);
  if (script.includes('window.CITY = JSON.parse')) readingMap = false;
  if (/window\.(BSHOP|BSHOP_LANE|KERB|SHOPS|BFACE) =/.test(script) && script.length > 1000) run(script);
}
run(fs.readFileSync(path.join(root, 'hkcity_geometry.js'), 'utf8'));
run(section('function b64i16', '// ---------- 天空'));
run(section('let onSidewalk', '// Meshy 路邊嘢'));
run('{' + section('  const COL = [0x60636a', '  const flat =') +
  '{' + section('    const CS = 8, gkey', '  if (window.KERB && KERB.mh)') + '}');
run('const LIFT=0.1;' + section('const GS = 20', '// ---------- 路邊嘢'));
run(section('function nearestRoad(x, z)', '  return best;') + '  return best;\n}');
run(section('const WBOX = WAT.map', 'const SHOPF = (() => {'));

// The render loop consumes only accepted bays. Record its decisions before any GPU buffers are built.
const result = run('(()=>{const SH=window.SHOPS, runs=[]; let previous=-1;\n' +
  section('  const P = [], UV = [], WALLSEEN', '      const wallOffset = front.offset') +
  'runs.push(((slot - previous - 1) * 512 + front.code).toString(36)); previous=slot;\n' +
  '} } return {version:1,key:layoutKey,total:bayIndex,runs:runs.join(",")};})()');
const replacement = '<script>window.HK_SHOP_LAYOUT = ' + JSON.stringify(result) + ';</script>';
const marker = /<script>window\.HK_SHOP_LAYOUT = [^\n]*?;<\/script>/;
if (!marker.test(html)) throw Error('Cannot find embedded shop layout');
const updated = html.replace(marker, () => replacement);
if (process.argv.includes('--check')) {
  if (updated !== html) throw Error('Shop layout is stale. Run node tools/build_hkcity_shop_layout.cjs');
} else {
  fs.writeFileSync(file, updated);
}
console.log(result.runs.split(',').length + ' valid storefronts across ' + result.total + ' ground-level candidates.');
