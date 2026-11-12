/* 一次性诊断：把几个标签的真实 scale / basePx / glyphRatio 与屏幕尺寸打出来。
   node diaglabel.mjs [宽] [高] [节点id]                                                */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = fs.readFileSync(path.join(ROOT, '神经网络简介-3D知识图谱.html'), 'utf8');
const W = +(process.argv[2] || 1024), H = +(process.argv[3] || 768);

const js = `
  var G = __GRAPH__;
  var V = G.camera.position.constructor;
  var st = G.state();
  var out = { vw: document.getElementById('stage').clientWidth, vh: document.getElementById('stage').clientHeight,
              ref: st.refDepth, home: st.homeDist, tight: st.tight, dcam: G.camera.position.distanceTo(G.controls.target),
              ss: G.SS, label: G.L.LABEL, max: G.L.LABEL_MAX, min: G.L.LABEL_MIN, rows: [] };
  G.world.updateMatrixWorld(true);
  var ids = ['b2-3-1','b2-3','core','b3-9-2','b0-1-1'];
  function grab(tag){
    var out2 = [];
    ids.forEach(function(id){
      var it = G.items[id]; if (!it) return;
      out2.push({ id: id, tag: tag, tier: it.node.tier, basePx: it.basePx, glyphRatio: +it.glyphRatio.toFixed(3),
        scaleY: +it.label.scale.y.toFixed(2), vis: !!it.label.visible,
        meshVis: !!it.mesh.visible, op: +it.mat.uniforms.uOpacity.value.toFixed(3) });
    });
    return out2;
  }
  out.before = grab('before');
  G.refreshLabels();
  out.after = grab('after');
  ids.forEach(function(id){
    var it = G.items[id]; if (!it) return;
    var d = new V().subVectors(it.pos, G.camera.position);
    var fwd = new V().subVectors(G.controls.target, G.camera.position).normalize();
    out.rows.push({ id: id, tier: it.node.tier, basePx: it.basePx, glyphRatio: +it.glyphRatio.toFixed(3),
      aspect: +it.labelAspect.toFixed(2), scaleY: +it.label.scale.y.toFixed(2),
      zTrue: +d.dot(fwd).toFixed(0), zSoft: +(st.homeDist*0.72 + d.dot(fwd)*0.28).toFixed(0),
      ratio: +(st.refDepth / (st.homeDist*0.72 + d.dot(fwd)*0.28)).toFixed(2) });
  });
  document.body.setAttribute('data-diag', JSON.stringify(out));
`;
const html = BASE.replace('</body>', `<script>setTimeout(function(){ try{ ${js} }catch(e){ document.title='ERR '+e.message; } },1200);<\/script>\n</body>`);
const tmp = path.join(ROOT, '_diag.html');
fs.writeFileSync(tmp, html, 'utf8');
const domF = path.join(ROOT, '_diag.txt');
execFileSync(EDGE, ['--headless=new', '--no-sandbox', `--user-data-dir=${path.join(ROOT, '.edge-profile')}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars',
  `--window-size=${W},${H + 142}`, '--virtual-time-budget=9000', '--dump-dom',
  'file:///' + tmp.replace(/\\/g, '/')],
  { stdio: ['ignore', fs.openSync(domF, 'w'), 'ignore'], timeout: 90000 });
const dom = fs.readFileSync(domF, 'utf8');
const m = dom.match(/data-diag="([^"]*)"/);
if (!m) { console.log('取不到 data-diag；title=' + ((dom.match(/<title>([^<]*)</) || [])[1] || '')); process.exit(1); }
const d = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log(`视口 ${d.vw}x${d.vh}  refDepth=${Math.round(d.ref)}  homeDist=${Math.round(d.home)}  dcam=${Math.round(d.dcam)}  tight=${d.tight}  SS=${d.ss.toFixed(2)}`);
console.log('LABEL=' + JSON.stringify(d.label) + '  MAX=' + d.max + ' MIN=' + d.min);
const th = Math.tan(34 * Math.PI / 360);
console.log('id            tier base  glyph  scaleY  zTrue  zSoft  ratio  屏幕高(px)');
for (const r of d.rows) {
  const px = r.scaleY / (2 * r.zTrue * th) * d.vh;
  console.log(r.id.padEnd(13) + String(r.tier).padEnd(5) + String(r.basePx).padEnd(6) +
    String(r.glyphRatio).padEnd(7) + String(r.scaleY).padEnd(8) + String(r.zTrue).padEnd(7) +
    String(r.zSoft).padEnd(7) + String(r.ratio).padEnd(8) + px.toFixed(1) + '  (字号≈' + (px / r.glyphRatio).toFixed(1) + ')');
}
console.log('\n--- refreshLabels() 前后对比 ---');
console.log('id            before: scaleY/vis/meshVis/op      after: scaleY/vis/meshVis/op');
for (let i = 0; i < d.before.length; i++) {
  const a = d.before[i], b = d.after[i];
  console.log(a.id.padEnd(13) +
    `${a.scaleY}/${a.vis}/${a.meshVis}/${a.op}`.padEnd(30) +
    `${b.scaleY}/${b.vis}/${b.meshVis}/${b.op}`);
}
for (const f of ['_diag.html', '_diag.txt']) { try { fs.unlinkSync(path.join(ROOT, f)); } catch (e) {} }
