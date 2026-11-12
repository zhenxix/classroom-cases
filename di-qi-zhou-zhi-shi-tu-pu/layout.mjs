/* 构图验收（纯几何，不依赖"看图"）：
     · 把节点投到屏幕上，统计有多少落在画幅外
     · 按页面里真实的标签世界坐标/尺寸，复现 LOD 规则，只统计"真的会被画出来"的标签
     · 打印 ASCII 正视图，检查浪潮带与五个簇的分布
   node layout.mjs [--cam x,y,z --tgt x,y,z]                                  */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, '_scene.json'), 'utf8'));

const argv = process.argv.slice(2);
const argOf = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1].split(',').map(Number) : null; };
const eye = argOf('--cam') || S.cam;
const tgt = argOf('--tgt') || S.tgt;

/* 与 app.js 的 L.LOD 保持一致：阈值是"相对全览景深"的倍数 */
const LOD = S.lod || { 2: [1.20, 0.48], 3: [0.55, 0.34] };
const LOD_TIGHT = S.lodTight || { 2: 0.62, 3: 0.72 };
const REF = S.refDepth || 492;

const W = S.vw || 1600, H = S.vh || 900;
const fov = S.fov * Math.PI / 180, aspect = S.aspect, th = Math.tan(fov / 2);
/* 页面自己判定"挤不挤"（窄画幅或矮画幅），这里跟着它，别各算各的 */
const tight = (S.state && typeof S.state.tight === 'boolean') ? S.state.tight : (Math.min(W, H) < 620);
const K2 = tight ? LOD_TIGHT[2] : 1, K3 = tight ? LOD_TIGHT[3] : 1;
const D2 = REF * LOD[2][0] * K2, R2 = REF * LOD[2][1] * K2;
const D3 = REF * LOD[3][0] * K3, R3 = REF * LOD[3][1] * K3;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const f = norm(sub(tgt, eye)), s = norm(cross(f, [0, 1, 0])), u = cross(s, f);
const dcam = Math.hypot(...sub(eye, tgt));

function project(p) {
  const d = sub(p, eye), z = dot(d, f);
  if (z <= 1) return null;
  return { x: (dot(d, s) / (z * th * aspect) * .5 + .5) * W, y: (.5 - dot(d, u) / (z * th) * .5) * H, z };
}

/* ---- 标签：按页面真实世界坐标与尺寸投到屏幕 ---- */
const labels = [];
for (const n of S.nodes) {
  const q = project(n.lp);
  if (!q) continue;
  const hpx = n.ls[1] / (2 * q.z * th) * H;
  const wpx = hpx * (n.ls[0] / n.ls[1]);
  const d = Math.hypot(...sub(eye, n.lp));
  const vis = n.tier <= 1 ? true
    : n.tier === 2 ? (dcam < D2 || d < R2)
    : (dcam < D3 && d < R3);
  labels.push({ n, q, x0: q.x - wpx / 2, x1: q.x + wpx / 2, y0: q.y - hpx / 2, y1: q.y + hpx / 2, wpx, hpx, vis, d });
}

/* ---- 出画统计（节点本体） ---- */
const proj = {};
for (const n of S.nodes) proj[n.id] = project(n.p);
const outR = 30;
const off = S.nodes.filter(n => { const q = proj[n.id]; return !q || q.x < -outR || q.x > W + outR || q.y < -outR || q.y > H + outR; });
const scroll = S.nodes.filter(n => { const q = proj[n.id]; return q && (q.x < 0 || q.x > W || q.y < 0 || q.y > H); });

/* ---- 标签重叠（只看可见的） ---- */
const V = labels.filter(l => l.vis);
let overlaps = [];
for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
  const A = V[i], B = V[j];
  const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
  const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  if (ox <= 0 || oy <= 0) continue;
  const frac = (ox * oy) / Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
  if (frac > 0.15) overlaps.push({ a: A.n.id, b: B.n.id, frac });
}
const cnt = {};
overlaps.forEach(o => { cnt[o.a] = (cnt[o.a] || 0) + 1; cnt[o.b] = (cnt[o.b] || 0) + 1; });
const worst = Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 10);

console.log('相机 ' + eye.map(v => v.toFixed(0)).join(',') + '   注视 ' + tgt.map(v => v.toFixed(0)).join(',') +
  '   视距 ' + dcam.toFixed(0));
console.log('节点 ' + S.nodes.length + '  完全出画 ' + off.length + '  部分出画 ' + scroll.length);
console.log('标签可见 ' + V.length + '/' + labels.length +
  '  平均字高 ' + (V.reduce((a, l) => a + l.hpx, 0) / V.length).toFixed(1) + 'px' +
  '  最小 ' + Math.min(...V.map(l => l.hpx)).toFixed(1) + 'px');
console.log('可见标签重叠对 ' + overlaps.length + '   重灾: ' + (worst.length ? worst.map(([i, c]) => i + '×' + c).join('  ') : '无'));
if (off.length) console.log('出画: ' + off.slice(0, 16).map(n => n.id).join(', ') + (off.length > 16 ? ' …' : ''));

/* ---- ASCII 正视图 ---- */
const cols = 84, rows = 32;
const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '));
const put = (x, y, ch, over) => {
  const gx = Math.round(x / W * (cols - 1)), gy = Math.round(y / H * (rows - 1));
  if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return;
  if (over || grid[gy][gx] === ' ') grid[gy][gx] = ch;
};
for (const p of (S.ribbon || [])) { const q = project(p); if (q) put(q.x, q.y, '~', false); }
const CH = { 0: 'O', 1: 'H', 2: 'o', 3: '.' };
for (const n of S.nodes) { const q = proj[n.id]; if (q) put(q.x, q.y, CH[n.tier] || '.', n.tier <= 1); }
/* 可见标签占位，用 '#' 标出文字区 */
for (const l of V) { if (l.n.tier <= 2) put(l.q.x, l.q.y, '=', false); }

console.log('\n--- ASCII 正视图   O=母题 H=章 o=节 .=点 ~=浪潮带 ==文字 ---');
console.log('+' + '-'.repeat(cols) + '+');
grid.forEach(r => console.log('|' + r.join('') + '|'));
console.log('+' + '-'.repeat(cols) + '+');

/* ---- 浪潮带是否真的把"四次起落"讲出来了 ----
   不去数曲线的极值点（端点和基线会被误判），而是直接看课件的四个阶段
   在屏幕上是否先抑后扬：启蒙涌起 → 低潮见底 → 复兴回升 → 高潮最高。 */
(function waveShape() {
  /* 竖屏时世界转了 90°：时间沿屏幕向下流，"潮位"改由屏幕 X 表达（越靠右越高） */
  const P = !!S.portrait;
  const pts = (S.ribbon || []).map(p => project(p)).filter(Boolean);
  if (pts.length >= 8) {
    const ry = pts.map(p => p.y), rx = pts.map(p => p.x);
    const spanX = Math.max(...rx) - Math.min(...rx), spanY = Math.max(...ry) - Math.min(...ry);
    console.log('\n--- 浪潮带的形状（屏幕空间，' + (P ? '竖屏：时间沿屏幕向下' : '横屏：时间沿屏幕向右') + '） ---');
    console.log('时间轴跨度 ' + (P ? spanY.toFixed(0) + 'px 高' : spanX.toFixed(0) + 'px 宽') +
      '，潮位起伏 ' + (P ? spanX.toFixed(0) + 'px 宽' : spanY.toFixed(0) + 'px 高'));
  }
  const PHASES = [
    ['b3-1', '第一阶段 · 启蒙'], ['b3-2', '第二阶段 · 低潮'],
    ['b3-3', '第三阶段 · 复兴'], ['b3-4', '第四阶段 · 高潮']
  ];
  const rowsx = PHASES.map(([id, name]) => {
    const n = S.nodes.find(x => x.id === id);
    const q = n ? project(n.p) : null;
    return { id, name, q };
  });
  if (rowsx.some(r => !r.q)) { console.log('阶段节点取样失败'); return; }
  const up = rowsx.map(r => (P ? r.q.x : -r.q.y));   // 统一成"越大越高"
  console.log('四个阶段的潮位（屏幕' + (P ? 'X，越右越高' : '高度，越上越高') + '）:');
  console.log('  ' + rowsx.map((r, i) => r.name + ' ' + up[i].toFixed(0)).join('   '));
  const dipOK = up[0] > up[1] && up[2] > up[1];      // 低潮是谷底
  const peakOK = up[3] === Math.max(...up);          // 高潮是最高点
  console.log(dipOK ? '  => 低潮是谷底：启蒙、复兴都在它之上，第一次退潮立住了'
    : '  => 低潮没有沉到谷底，"退潮"没讲出来');
  console.log(peakOK ? '  => 高潮是整条带的最高点，深度学习时代的陡升立住了'
    : '  => 高潮不是最高点，与"高潮时期"的史实不符');
})();

console.log('\n--- 各簇屏幕范围（占画面 %） ---');
const byB = {};
S.nodes.forEach(n => { const q = proj[n.id]; if (!q) return; (byB[n.branch] = byB[n.branch] || []).push([q.x / W * 100, q.y / H * 100]); });
const order = ['core', 'b0', 'b1', 'b2', 'b3', 'b4'];
order.forEach(b => {
  const arr = byB[b]; if (!arr) return;
  const xs = arr.map(v => v[0]), ys = arr.map(v => v[1]);
  console.log(`${b.padEnd(5)} n=${String(arr.length).padStart(3)}  x ${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)}%` +
    `  y ${Math.min(...ys).toFixed(0)}–${Math.max(...ys).toFixed(0)}%`);
});
