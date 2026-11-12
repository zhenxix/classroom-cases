/* HUD 结构验收：把每个面板的盒模型、溢出、裁切、互相压盖从真实 DOM 里量出来。
   比"看图"可靠：这里报的是 getBoundingClientRect 与 scrollWidth，不是印象。

   注意：headless=new 的窗口高度比视口高约 142px，所以窗口统一按 VH+142 给，
   让被测视口正好落在 900 / 768 / 720 这几档。
   node uicheck2.mjs                                                           */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = fs.readFileSync(path.join(ROOT, '神经网络简介-3D知识图谱.html'), 'utf8');
const CHROME_H = 142;

const SCENARIOS = [
  ['home', 1600, 900, ''],
  ['selected', 1600, 900, `__GRAPH__.go('b3-8', false);`],
  ['milestone', 1600, 900, `__GRAPH__.go('b3-11', false);`],
  ['tour', 1600, 900, `__GRAPH__.tourStart(11);`],
  ['search', 1600, 900, `var q=document.getElementById('q'); q.value='浪潮'; q.dispatchEvent(new Event('input'));`],
  ['links', 1600, 900, `document.getElementById('btnLinks').click();`],
  ['laptop', 1366, 768, `__GRAPH__.go('b2-4', false);`],
  ['small', 1280, 720, `__GRAPH__.tourStart(8);`],
  ['narrow', 900, 900, `__GRAPH__.go('b2-4', false);`]
];

const PROBE = `
  var out = { vw: innerWidth, vh: innerHeight, boxes: [], problems: [] };
  function add(sel, label, e){
    if (!e) { out.problems.push('缺少元素 ' + sel); return null; }
    var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    var o = { sel: label, x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      vis: cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05 && cs.display !== 'none',
      scrolls: cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowX === 'auto' || cs.overflowX === 'scroll' };
    o.off = r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
    o.clipV = e.scrollHeight > e.clientHeight + 2 && !o.scrolls;
    o.clipH = e.scrollWidth > e.clientWidth + 2 && !o.scrolls;
    out.boxes.push(o);
    if (o.vis && o.off) out.problems.push(label + ' 越出视口 [' + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h + ']');
    if (o.vis && o.clipV) out.problems.push(label + ' 纵向被裁切 ' + e.scrollHeight + '>' + e.clientHeight);
    if (o.vis && o.clipH) out.problems.push(label + ' 横向被裁切 ' + e.scrollWidth + '>' + e.clientWidth);
    return o;
  }
  function box(sel, label){ return add(sel, label || sel, document.querySelector(sel)); }
  box('.masthead', '标题块'); box('.tools', '工具条'); box('.rail', '左侧栏');
  box('.panel', '详情面板'); box('.tour', '导览条'); box('.ruler', '年份标尺');
  box('#pBody', '详情正文'); box('.status', '状态条');
  document.querySelectorAll('.rail .block').forEach(function(b, i){ add('', 'rail块' + (i + 1), b); });
  function rect(s){ var e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; }
  function hit(a, b){
    if (!a || !b) return 0;
    var ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    var oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return (ox > 0 && oy > 0) ? Math.round(ox * oy) : 0;
  }
  var R = { rail: rect('.rail'), panel: rect('.panel'), tour: rect('.tour'), tools: rect('.tools'), mast: rect('.masthead') };
  var panelOpen = parseFloat(getComputedStyle(document.querySelector('.panel')).opacity) > 0.5;
  var tourOpen = document.querySelector('.tour').classList.contains('open');
  if (hit(R.tools, R.mast) > 200) out.problems.push('工具条压住标题块 ' + hit(R.tools, R.mast) + 'px2');
  if (panelOpen && hit(R.rail, R.panel) > 200) out.problems.push('详情面板压住左侧栏 ' + hit(R.rail, R.panel) + 'px2');
  if (tourOpen && hit(R.tour, R.panel) > 200) out.problems.push('导览条压住详情面板 ' + hit(R.tour, R.panel) + 'px2');
  if (tourOpen && hit(R.tour, R.rail) > 200) out.problems.push('导览条压住左侧栏 ' + hit(R.tour, R.rail) + 'px2');
  document.querySelectorAll('.tool, .btn-mini, .br').forEach(function(b){
    if (b.getBoundingClientRect().width > 0 && b.scrollWidth > b.clientWidth + 2)
      out.problems.push('文字被裁: ' + b.textContent.trim().slice(0, 12));
  });
  var t = document.getElementById('pTitle');
  if (t && t.textContent) { out.panelTitle = t.textContent; out.panelTitleH = Math.round(t.getBoundingClientRect().height); }
  var eb = document.getElementById('pEyebrow');
  if (eb) out.eyebrow = eb.textContent.trim().slice(0, 74);
  out.branches = document.querySelectorAll('.br').length;
  out.kwChips = document.querySelectorAll('.chip--kw').length;
  out.gotoChips = document.querySelectorAll('[data-goto]').length;
  out.bodyTextLen = (document.getElementById('pBody') || { textContent: '' }).textContent.trim().length;
  document.body.setAttribute('data-ui', JSON.stringify(out));
`;

const rows = [];
for (const [name, W, VH, js] of SCENARIOS) {
  const html = BASE.replace('</body>',
    `<script>setTimeout(function(){ try{ ${js} }catch(e){ document.title='STEP-ERR '+e.message; } },600);
     setTimeout(function(){ try{ ${PROBE} }catch(e){ document.body.setAttribute('data-ui', JSON.stringify({vw:innerWidth,vh:innerHeight,boxes:[],problems:['PROBE-ERR '+e.message]})); } },1700);<\/script>\n</body>`);
  const tmp = path.join(ROOT, `_ui_${name}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const domF = path.join(ROOT, `_ui_${name}.txt`);
  execFileSync(EDGE, ['--headless=new', '--no-sandbox', `--user-data-dir=${path.join(ROOT, '.edge-profile')}`,
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars',
    `--window-size=${W},${VH + CHROME_H}`, '--virtual-time-budget=9000', '--dump-dom',
    'file:///' + tmp.replace(/\\/g, '/')],
    { stdio: ['ignore', fs.openSync(domF, 'w'), 'ignore'], timeout: 90000 });
  const dom = fs.readFileSync(domF, 'utf8');
  const m = dom.match(/data-ui="([^"]*)"/);
  if (!m) { console.log(`\n### ${name} ${W}x${VH}\n  取不到 data-ui`); continue; }
  const u = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  console.log(`\n### ${name}  视口 ${u.vw}x${u.vh}`);
  console.log('  ' + u.boxes.filter(b => b.vis && b.w > 0)
    .map(b => `${b.sel}=${b.x},${b.y} ${b.w}x${b.h}`).join('  '));
  if (u.panelTitle) console.log('  标题「' + u.panelTitle + '」高 ' + u.panelTitleH + 'px   面包屑「' + u.eyebrow + '」');
  if (u.bodyTextLen !== undefined) console.log('  正文 ' + u.bodyTextLen + ' 字 · 关键词 ' + u.kwChips + ' · 跳转 ' + u.gotoChips + ' · 图例 ' + u.branches + ' 项');
  console.log(u.problems.length ? '  ! ' + u.problems.join('\n  ! ') : '  OK 无越界 / 无裁切 / 无重叠');
  rows.push({ name, problems: u.problems });
}
console.log('\n===== 汇总 =====');
const bad = rows.filter(r => r.problems.length);
console.log(bad.length ? bad.map(r => r.name + ':' + r.problems.length).join('   ') : '全部场景通过');
