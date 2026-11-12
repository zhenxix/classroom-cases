/* 多机位取证：为每个视角生成一个临时副本，用 Edge 无头渲染成 PNG。
   node shots.mjs [name ...]   —— 不带参数则全部拍。 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, '神经网络简介-3D知识图谱.html');
const OUTDIR = path.join(ROOT, 'shots');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = fs.readFileSync(SRC, 'utf8');
fs.mkdirSync(OUTDIR, { recursive: true });

/* 每个视角：一段在 800ms 后执行的脚本（虚拟时间里立即跑） */
const VIEWS = {
  home:  { delay: 900, js: `/* 默认机位 */` },
  scene: { delay: 900, js: `document.getElementById('hud').classList.add('hidden');
                            document.getElementById('status').classList.add('dim');` },
  plan:  { delay: 2600, js: `var G=__GRAPH__; G.camera.position.set(0,640,40); G.controls.target.set(0,-30,-10); G.controls.update();
                            document.getElementById('hud').classList.add('hidden');` },
  side:  { delay: 2600, js: `var G=__GRAPH__; G.camera.position.set(-600,90,60); G.controls.target.set(0,20,-20); G.controls.update();
                            document.getElementById('hud').classList.add('hidden');` },
  wave:  { delay: 2600, js: `var G=__GRAPH__; G.camera.position.set(10,140,320); G.controls.target.set(0,20,-40); G.controls.update();
                            document.getElementById('hud').classList.add('hidden');` },
  deep:  { delay: 1400, js: `var G=__GRAPH__; G.go('b2-2'); document.getElementById('hud').classList.add('hidden');` },
  links: { delay: 1400, js: `var G=__GRAPH__; document.getElementById('btnLinks').click();
                             G.tourStart(14); document.getElementById('hud').classList.add('hidden');` },
  mid:   { delay: 1400, js: `var G=__GRAPH__; G.tourStart(9);` }
};

const only = process.argv.slice(2);
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
      '--hide-scrollbars', '--window-size=1600,900',
      '--virtual-time-budget=12000',
      `--screenshot=${png}`, url
    ], { stdio: 'ignore', timeout: 90000 });
  } catch (e) { /* Edge 退出码不稳定，看文件即可 */ }
  const ok = fs.existsSync(png);
  console.log((ok ? 'OK  ' : 'MISS') + '  ' + name.padEnd(6) + (ok ? (fs.statSync(png).size / 1024).toFixed(0) + ' KB' : ''));
  fs.unlinkSync(tmp);
}
