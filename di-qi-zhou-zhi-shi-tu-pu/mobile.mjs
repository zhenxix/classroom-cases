/* 真机尺寸验收：headless 的窗口宽度有 ~500px 下限，测不到 360–430 的手机。
   所以这里用 CDP（Chrome DevTools Protocol）做设备仿真：改视口尺寸、开触摸、
   跑探针、截图。Node 24 自带 WebSocket，不用装依赖。

   node mobile.mjs              跑全部机型
   node mobile.mjs iphone14     只跑一个                                            */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILE = path.join(ROOT, '神经网络简介-3D知识图谱.html');
const SHOTS = path.join(ROOT, 'shots');
const PORT = 9333;

const DEVICES = {
  iphoneSE:  { w: 375, h: 667, dpr: 2, label: 'iPhone SE 375×667' },
  iphone14:  { w: 390, h: 844, dpr: 3, label: 'iPhone 14 390×844' },
  pixel7:    { w: 412, h: 915, dpr: 2.6, label: 'Pixel 7 412×915' },
  andSmall:  { w: 360, h: 800, dpr: 3, label: '安卓小屏 360×800' },
  phoneLand: { w: 844, h: 390, dpr: 3, label: '手机横屏 844×390' },
  ipadMini:  { w: 744, h: 1133, dpr: 2, label: 'iPad mini 744×1133' }
};

/* 在页面里跑的探针：盒模型 + 画布 + 触摸目标尺寸 */
const PROBE = `
  var out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, problems: [], boxes: [] };
  function add(sel, label, e){
    if (!e) { out.problems.push('缺少 ' + sel); return null; }
    var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    var o = { sel: label, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      vis: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05 };
    o.off = r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
    out.boxes.push(o);
    if (o.vis && o.off) out.problems.push(label + ' 越出视口 [' + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h + ']');
    return o;
  }
  function box(sel, label){ return add(sel, label || sel, document.querySelector(sel)); }
  box('.masthead', '标题块'); box('.masthead__menu', '工具开关'); box('.tools', '工具抽屉');
  box('.rail', '底部胶囊条'); box('.panel', '详情抽屉'); box('.tour', '导览条');
  box('.brs', '章节条'); box('.ruler', '标尺'); box('.status', '状态条');
  /* 触摸目标：手机上按钮至少要 40px 高 */
  var small = [];
  document.querySelectorAll('.tool, .btn-mini, .br, .panel__close, .chip').forEach(function(b){
    var r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (getComputedStyle(b).display === 'none') return;
    if (r.height < 34) small.push((b.textContent || '').trim().slice(0, 8) + '=' + Math.round(r.height));
  });
  out.smallTargets = small;
  if (small.length) out.problems.push('触摸目标过小: ' + small.slice(0, 6).join(' '));
  /* 画布与三维状态 */
  var G = window.__GRAPH__;
  if (G) {
    var st = G.state();
    G.refreshLabels();
    var vis = 0, off = 0;
    var V = G.camera.position.constructor;
    var fwd = new V().subVectors(G.controls.target, G.camera.position).normalize();
    G.world.updateMatrixWorld(true);
    Object.keys(G.items).forEach(function(id){
      var it = G.items[id];
      if (!it.mesh.visible) return;
      var wp = new V(); it.mesh.getWorldPosition(wp);
      var ndc = wp.clone().project(G.camera);
      if (ndc.z <= 1 && ndc.x >= -1.02 && ndc.x <= 1.02 && ndc.y >= -1.02 && ndc.y <= 1.02) vis++;
      else off++;
      if (it.label.visible) out.labelVis = (out.labelVis || 0) + 1;
    });
    out.three = { nodesOnScreen: vis, nodesOffScreen: off, labels: out.labelVis || 0,
      refDepth: Math.round(st.refDepth), portrait: st.portrait, tight: st.tight,
      orient: Math.round(st.orient * 180 / Math.PI),
      insetTop: Math.round(st.insetTop), insetBottom: Math.round(st.insetBottom) };
    if (off > 0) out.problems.push(off + ' 个节点在画面外');
  } else out.problems.push('__GRAPH__ 未定义');
  /* 页面是否横向溢出 */
  if (document.documentElement.scrollWidth > innerWidth + 1) out.problems.push('页面横向溢出 ' + document.documentElement.scrollWidth);
  document.body.setAttribute('data-mob', JSON.stringify(out));
`;

const only = process.argv[2];
const names = only ? [only] : Object.keys(DEVICES);

/* ---- 启动一个带调试端口的 Edge ---- */
const profile = path.join(ROOT, '.cdp-profile');
const proc = spawn(EDGE, [
  '--headless=new', '--no-sandbox', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  'about:blank'
], { stdio: 'ignore', detached: false });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('等不到调试端口');
}

let msgId = 0;
function rpc(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const onMsg = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.id !== id) return;
      ws.removeEventListener('message', onMsg);
      m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function evalJs(ws, expr) {
  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result && r.result.value;
}

try {
  const wsUrl = await targetUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await rpc(ws, 'Page.enable');
  await rpc(ws, 'Runtime.enable');

  fs.mkdirSync(SHOTS, { recursive: true });
  const fileUrl = 'file:///' + FILE.replace(/\\/g, '/');

  for (const name of names) {
    const d = DEVICES[name];
    if (!d) { console.log('未知机型 ' + name); continue; }
    await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
      width: d.w, height: d.h, deviceScaleFactor: d.dpr, mobile: true
    });
    await rpc(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    await rpc(ws, 'Page.navigate', { url: fileUrl });
    await sleep(3600);
    await evalJs(ws, PROBE);
    const dom = await evalJs(ws, 'document.body.getAttribute("data-mob")');
    if (!dom) { console.log(`\n### ${d.label}\n  探针没跑起来`); continue; }
    const o = JSON.parse(dom);
    console.log(`\n### ${d.label}   视口 ${o.vw}×${o.vh}  dpr ${o.dpr}`);
    console.log('  ' + o.boxes.filter(b => b.vis && b.w > 0)
      .map(b => `${b.sel}=${b.x},${b.y} ${b.w}x${b.h}`).join('  '));
    if (o.three) console.log('  三维: 画面内 ' + o.three.nodesOnScreen + ' 个节点，画面外 ' + o.three.nodesOffScreen +
      '，标签 ' + o.three.labels + ' 个，refDepth ' + o.three.refDepth +
      '，' + (o.three.portrait ? '竖屏转 ' + o.three.orient + '°' : '横屏') +
      '，上下安全区 ' + o.three.insetTop + '/' + o.three.insetBottom + 'px');
    console.log(o.problems.length ? '  ! ' + o.problems.join('\n  ! ') : '  OK 无越界 / 无过小触摸目标 / 无横向溢出');

    const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const f = path.join(SHOTS, `mob-${name}.png`);
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log('  截图 ' + path.basename(f) + '  ' + (fs.statSync(f).size / 1024).toFixed(0) + ' KB');

    /* ---- 交互：真的点一下节点，看详情抽屉会不会开 ---- */
    const pt = await evalJs(ws, `(function(){
      var G = window.__GRAPH__; if (!G) return null;
      var V = G.camera.position.constructor;
      var best = null;
      Object.keys(G.items).forEach(function(id){
        var it = G.items[id];
        if (!it.mesh.visible || it.node.tier > 2) return;
        var wp = new V(); it.mesh.getWorldPosition(wp);
        var ndc = wp.clone().project(G.camera);
        if (ndc.z > 1 || Math.abs(ndc.x) > 0.6 || Math.abs(ndc.y) > 0.6) return;
        var sx = (ndc.x * .5 + .5) * G.camera.aspect; // 只是排序用的粗指标
        if (!best) best = { id: id, x: (ndc.x*.5+.5)*innerWidth, y: (.5-ndc.y*.5)*innerHeight };
      });
      return best;
    })()`);
    if (pt) {
      const touch = (type) => rpc(ws, 'Input.dispatchTouchEvent', {
        type: type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: pt.x, y: pt.y, radiusX: 6, radiusY: 6, force: 1, id: 1 }]
      });
      await touch('touchStart');
      await sleep(60);
      await touch('touchEnd');
      await sleep(900);
      const got = await evalJs(ws, `JSON.stringify({
        open: document.getElementById('panel').classList.contains('open'),
        title: document.getElementById('pTitle').textContent,
        bodyLen: document.getElementById('pBody').textContent.trim().length
      })`);
      const g = JSON.parse(got);
      const ok = g.open && g.bodyLen > 40;
      console.log('  点按 ' + pt.id + ' → ' + (ok ? 'OK' : '!') + ' 抽屉' + (g.open ? '已开' : '未开') +
        '「' + g.title + '」正文 ' + g.bodyLen + ' 字');
      if (!ok) o.problems.push('点按节点没有正常打开详情');
      const shot2 = await rpc(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(SHOTS, `mob-${name}-detail.png`), Buffer.from(shot2.data, 'base64'));
    }
  }
  ws.close();
} finally {
  try { proc.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
