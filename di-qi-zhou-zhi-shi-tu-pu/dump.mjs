/* 把页面里真实的节点/标签世界坐标、相机、朝向导出成 JSON，供 layout.mjs 用几何而非"看图"验收。
   注意：竖屏时整个世界会绕 Z 转 90°，所以这里导出的是 getWorldPosition()，
   不是局部坐标 —— 否则投影会算错。
   node dump.mjs [宽] [高]      -> _scene.json                                 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = fs.readFileSync(path.join(ROOT, '神经网络简介-3D知识图谱.html'), 'utf8');
const W = +(process.argv[2] || 1600), H = +(process.argv[3] || 900);

const js = `
  var G = __GRAPH__;
  var V = G.camera.position.constructor;
  G.world.updateMatrixWorld(true);
  G.refreshLabels();          // 无头环境下 rAF 帧数有限，这里明确刷一次标签尺寸
  G.world.updateMatrixWorld(true);
  var out = { vw: document.getElementById('stage').clientWidth,
              vh: document.getElementById('stage').clientHeight,
              cam: G.camera.position.toArray(), tgt: G.controls.target.toArray(),
              fov: G.camera.fov, aspect: G.camera.aspect,
              portrait: G.portrait(), orient: G.state().orient, worldZ: G.world.rotation.z,
              refDepth: G.state().refDepth,
              state: G.state(),
              lod: G.L.LOD, lodTight: G.L.LOD_TIGHT,
              ribbon: G.ribbon.map(function(p){
                return new V(p[0], p[1], p[2]).applyMatrix4(G.world.matrixWorld).toArray(); }),
              nodes: [] };
  Object.keys(G.items).forEach(function(id){
    var it = G.items[id];
    var wp = new V(); it.mesh.getWorldPosition(wp);
    var lp = new V(); it.label.getWorldPosition(lp);
    out.nodes.push({ id: id, tier: it.node.tier, branch: it.node.branch,
      p: wp.toArray(), lp: lp.toArray(),
      ls: [it.label.scale.x, it.label.scale.y] });
  });
  document.body.setAttribute('data-scene', JSON.stringify(out));
`;
const html = BASE.replace('</body>', `<script>setTimeout(function(){ try{ ${js} }catch(e){ document.title='ERR '+e.message; } },900);<\/script>\n</body>`);
const tmp = path.join(ROOT, '_dump.html');
fs.writeFileSync(tmp, html, 'utf8');

const domFile = path.join(ROOT, '_dom.txt');
execFileSync(EDGE, ['--headless=new', '--no-sandbox',
  `--user-data-dir=${path.join(ROOT, '.edge-profile')}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--hide-scrollbars', `--window-size=${W},${H + 142}`,   /* headless 窗口比视口高约 142px */
  '--virtual-time-budget=9000', '--dump-dom',
  'file:///' + tmp.replace(/\\/g, '/')],
  { stdio: ['ignore', fs.openSync(domFile, 'w'), 'ignore'], timeout: 90000 });

const dom = fs.readFileSync(domFile, 'utf8');
const m = dom.match(/data-scene="([^"]*)"/);
if (!m) {
  console.error('未拿到 data-scene。dom 长度=' + dom.length);
  const t = dom.match(/<title>([^<]*)<\/title>/);
  if (t) console.error('title = ' + t[1]);
  process.exit(1);
}
const unesc = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const scene = JSON.parse(unesc);
fs.writeFileSync(path.join(ROOT, '_scene.json'), JSON.stringify(scene));
console.log('导出 ' + scene.nodes.length + ' 个节点 → _scene.json   视口 ' + scene.vw + 'x' + scene.vh +
  '   ' + (scene.portrait ? '竖屏（世界转了 ' + Math.round(scene.orient * 180 / Math.PI) + '°）' : '横屏') +
  '   refDepth ' + Math.round(scene.refDepth));
console.log('相机 ' + scene.cam.map(v => v.toFixed(0)).join(',') + '  注视 ' + scene.tgt.map(v => v.toFixed(0)).join(','));
const st = scene.state || {};
console.log('安全区 上 ' + Math.round(st.insetTop || 0) + 'px  下 ' + Math.round(st.insetBottom || 0) +
  'px  画布高 ' + Math.round(st.canvasH || 0) + 'px   →  可用 ' +
  (100 * (1 - ((st.insetTop || 0) + (st.insetBottom || 0)) / (st.canvasH || 1))).toFixed(0) + '%');
