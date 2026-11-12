/* 多机位取证：为每个视角生成一个临时副本，用 Edge 无头渲染成 PNG。
   node shots.mjs [name ...]   —— 不带参数则全部拍。 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, '神经网络概述-3D知识图谱.html');
const OUTDIR = path.join(ROOT, 'shots');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = fs.readFileSync(SRC, 'utf8');
fs.mkdirSync(OUTDIR, { recursive: true });

/* 每个视角：一段在 800ms 后执行的脚本（虚拟时间里立即跑） */
const VIEWS = {
  home:  { delay: 900, js: `/* 默认机位 */` },
  scene: { delay: 900, js: `document.getElementById('hud').classList.add('hidden');
                            document.getElementById('status').classList.add('dim');` },
  plan:  { delay: 900, js: `var G=__GRAPH__; G.controls.dispatchEvent({type:'start'}); G.camera.position.set(16,640,50); G.controls.target.set(16,-30,-20); G.controls.update();
                            document.getElementById('hud').classList.add('hidden');` },
  side:  { delay: 900, js: `var G=__GRAPH__; G.controls.dispatchEvent({type:'start'}); G.camera.position.set(-620,110,30); G.controls.target.set(10,10,-20); G.controls.update();
                            document.getElementById('hud').classList.add('hidden');` },
  wave:  { delay: 900, js: `var G=__GRAPH__; G.controls.dispatchEvent({type:'start'}); G.camera.position.set(20,110,240); G.controls.target.set(30,18,-40); G.controls.update();
                            document.getElementById('hud').classList.add('hidden');` },
  deep:  { delay: 1400, js: `var G=__GRAPH__; G.go('b2-4'); G.snapCam(); document.getElementById('hud').classList.add('hidden');` },
  links: { delay: 1400, js: `var G=__GRAPH__; document.getElementById('btnLinks').click();
                             G.tourStart(16); G.snapCam(); document.getElementById('hud').classList.add('hidden');` },
  mid:   { delay: 1400, js: `var G=__GRAPH__; G.tourStart(8); G.snapCam();` }
};

const only = process.argv.slice(2).filter(a => !/^\d+$/.test(a));
const SZ = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const names = only.length ? only : Object.keys(VIEWS);

for (const name of names) {
  const v = VIEWS[name];
  if (!v) { console.log('skip unknown view: ' + name); continue; }
  const inject = `<script>setTimeout(function(){ try{ ${v.js} }catch(e){ document.title='INJECT-ERR '+e.message; } }, ${v.delay});<\/script>`;
  const html = BASE.replace('</body>', inject + '\n</body>');
  const tmp = path.join(ROOT, `_view_${name}.html`);
  fs.writeFileSync(tmp, html, 'utf8');

  const png = path.join(OUTDIR, `${name}.png`);
  if (fs.existsSync(png)) fs.unlinkSync(png);
  const url = 'file:///' + tmp.replace(/\\/g, '/');
  try {
    execFileSync(EDGE, [
      '--headless=new', '--no-sandbox',
      `--user-data-dir=${path.join(ROOT, '.edge-profile')}`,
      '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      '--hide-scrollbars', `--window-size=${SZ[0] || 1600},${(SZ[1] || 900) + 142}`,
      '--virtual-time-budget=12000',
      `--screenshot=${png}`, url
    ], { stdio: 'ignore', timeout: 90000 });
  } catch (e) { /* Edge 退出码不稳定，看文件即可 */ }
  const ok = fs.existsSync(png);
  console.log((ok ? 'OK  ' : 'MISS') + '  ' + name.padEnd(6) + (ok ? (fs.statSync(png).size / 1024).toFixed(0) + ' KB' : ''));
  fs.unlinkSync(tmp);
}
