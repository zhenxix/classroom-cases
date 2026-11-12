/* 标签清晰度验收：直接算"贴图里的字有多少像素" 对 "屏幕上要画多少设备像素"。
   比值 >= 1 表示贴图被 1:1 或缩小使用（清晰）；< 1 表示被放大（糊）。
   这正是"点进去放大后标签发虚"的量化指标。
   node sharp.mjs                                                              */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = fs.readFileSync(path.join(ROOT, '认识大数据-3D知识图谱.html'), 'utf8');

/* 无头环境下 rAF 帧数有限，flyTo 的补间跑不完，所以直接把相机摆到
   frameNode 补间结束时的位置 —— 那才是"点进去以后"的真实状态。 */
function zoomTo(id) {
  return `
    var G = __GRAPH__;
    G.go('${id}', false);                       // 聚焦 + 开面板，但不飞
    var V = G.camera.position.constructor;
    var p = G.items['${id}'].pos;
    var dir = new V().subVectors(new V().fromArray(G.home[0]), new V().fromArray(G.home[1])).normalize();
    var t = G.items['${id}'].node.tier;
    var dist = ('${id}' === 'core') ? 320 : (t === 1 ? 215 : (t === 2 ? 135 : 95));
    G.camera.position.copy(p).addScaledVector(dir, dist);
    G.controls.target.copy(p);
    G.controls.update();
    G.refreshLabels();                           // 摆好相机后立刻重算标签尺寸
  `;
}

/* [名字, 到位后要执行的脚本] */
const CASES = [
  ['全览（默认机位）', ''],
  ['点进「大模型纪元」(节)', zoomTo('b3-9')],
  ['点进「第三次高潮」(节)', zoomTo('b3-8')],
  ['点进「图灵测试」(节)', zoomTo('b2-4')],
  ['点进「Transformer」(点)', zoomTo('b3-9-2')],
  ['点进「母题」(核)', zoomTo('core')]
];

const PROBE = `
  var G = __GRAPH__;
  var fovR = G.camera.fov * Math.PI / 360, tan = Math.tan(fovR);
  var Hcss = document.getElementById('stage').clientHeight;
  var fwd = new (G.camera.position.constructor)();
  fwd.subVectors(G.controls.target, G.camera.position).normalize();
  var d = new (G.camera.position.constructor)();
  var rows = [], behind = 0, bytes = 0;
  /* 全部标签贴图占多少显存（含 mipmap 的 1/3 开销） */
  Object.keys(G.items).forEach(function(id){
    var it = G.items[id];
    if (!it.basePx) return;
    var h = it.basePx * G.SS * it.glyphRatio;
    var w = h * it.labelAspect;
    bytes += w * h * 4 * 1.34;
  });
  G.camera.updateMatrixWorld();
  Object.keys(G.items).forEach(function(id){
    var it = G.items[id];
    if (!it.label || !it.label.visible) return;
    /* 只统计真的会出现在画面上的标签：在相机前方，且投影落在视口内 */
    var ndc = it.label.position.clone().project(G.camera);
    if (ndc.z > 1 || ndc.x < -1.02 || ndc.x > 1.02 || ndc.y < -1.02 || ndc.y > 1.02) { behind++; return; }
    d.subVectors(it.label.position, G.camera.position);
    var z = d.dot(fwd);
    if (z <= 1) { behind++; return; }
    var cssPx = it.label.scale.y / (2 * z * tan) * Hcss;   // sprite 高在屏幕上的 CSS 像素
    var devPx = cssPx * G.dpr;                              // 换算成设备像素
    var texPx = it.basePx * G.SS * it.glyphRatio;           // 贴图里对应的像素数
    rows.push({ id: id, tier: it.node.tier, z: Math.round(z),
      css: +cssPx.toFixed(1), dev: +devPx.toFixed(1), tex: Math.round(texPx),
      r: +(texPx / devPx).toFixed(2) });
  });
  document.body.setAttribute('data-sharp', JSON.stringify({ dpr: G.dpr, ss: G.SS, behind: behind, mb: +(bytes / 1048576).toFixed(1), rows: rows }));
`;

const results = [];
for (const [name, js] of CASES) {
  const html = BASE.replace('</body>',
    `<script>setTimeout(function(){ try{ ${js} }catch(e){} },600);
     setTimeout(function(){ try{ ${PROBE} }catch(e){ document.body.setAttribute('data-sharp', JSON.stringify({rows:[],err:e.message})); } },2600);<\/script>\n</body>`);
  const tmp = path.join(ROOT, '_sharp.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const domF = path.join(ROOT, '_sharp.txt');
  execFileSync(EDGE, ['--headless=new', '--no-sandbox', `--user-data-dir=${path.join(ROOT, '.edge-profile')}`,
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars',
    '--window-size=1600,1042', '--virtual-time-budget=9000', '--dump-dom',
    'file:///' + tmp.replace(/\\/g, '/')],
    { stdio: ['ignore', fs.openSync(domF, 'w'), 'ignore'], timeout: 90000 });
  const dom = fs.readFileSync(domF, 'utf8');
  const m = dom.match(/data-sharp="([^"]*)"/);
  if (!m) { console.log(`\n### ${name}\n  取不到数据`); continue; }
  const s = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  if (s.err) { console.log(`\n### ${name}\n  探针报错 ${s.err}`); continue; }
  const rows = s.rows;
  if (!rows.length) { console.log(`\n### ${name}\n  没有可见标签`); continue; }
  const rs = rows.map(r => r.r);
  const min = Math.min(...rs), avg = rs.reduce((a, b) => a + b, 0) / rs.length;
  const blurry = rows.filter(r => r.r < 0.95);
  console.log(`\n### ${name}`);
  console.log(`  可见标签 ${rows.length} 个  dpr=${s.dpr}  贴图超采样 SS=${s.ss.toFixed(2)}  全部标签贴图约 ${s.mb} MB`);
  console.log(`  清晰度比 (贴图像素/屏幕设备像素): 最小 ${min.toFixed(2)}  平均 ${avg.toFixed(2)}` +
    `   ${min >= 0.95 ? '=> 全部清晰' : '=> 有 ' + blurry.length + ' 个仍然发虚'}`);
  if (blurry.length) console.log('  发虚的: ' + blurry.slice(0, 8).map(r => `${r.id}(r=${r.r})`).join('  '));
  console.log('  最靠近相机的三个: ' + rows.sort((a, b) => a.z - b.z).slice(0, 3)
    .map(r => `${r.id} z=${r.z} 屏幕${r.dev}px 贴图${r.tex}px`).join('  |  '));
  results.push({ name, min, avg, n: rows.length });
}
console.log('\n===== 汇总 =====');
const worst = Math.min(...results.map(r => r.min));
console.log('所有场景里最差的一个标签清晰度比 = ' + worst.toFixed(2) + (worst >= 0.95 ? '  → 通过' : '  → 仍有放大'));
