/* 抓运行时错误：把 window.onerror / 未捕获 Promise 写进 <title>，再 dump-dom 取回。
   node errprobe.mjs [宽] [高]                                                      */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Excel.exe'.replace('Excel.exe', 'Edge\\Application\\msedge.exe');
const W = +(process.argv[2] || 1600), H = +(process.argv[3] || 1042);
const BASE = fs.readFileSync(path.join(ROOT, '神经网络简介-3D知识图谱.html'), 'utf8');

const catcher = `<script>
window.__errs = [];
function __note(t){ document.title = 'PROBE|' + t; }
window.addEventListener('error', function(e){
  window.__errs.push((e.message||'?') + ' @' + (e.lineno||0) + ':' + (e.colno||0) +
    (e.error && e.error.stack ? '\\n' + e.error.stack.split('\\n').slice(0,4).join(' | ') : ''));
  __note('ERROR ' + window.__errs.join(' ;; '));
});
window.addEventListener('unhandledrejection', function(e){
  window.__errs.push('reject: ' + (e.reason && e.reason.stack ? e.reason.stack.split('\\n').slice(0,4).join(' | ') : e.reason));
  __note('ERROR ' + window.__errs.join(' ;; '));
});
setTimeout(function(){
  if (!window.__errs.length) __note('OK graph=' + (typeof window.__GRAPH__ !== 'undefined'));
}, 2500);
<\/script>`;

const html = BASE.replace('<body>', '<body>\n' + catcher);
const tmp = path.join(ROOT, '_err.html');
fs.writeFileSync(tmp, html, 'utf8');
const domF = path.join(ROOT, '_err.txt');
execFileSync(EDGE, ['--headless=new', '--no-sandbox', `--user-data-dir=${path.join(ROOT, '.edge-profile')}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars',
  `--window-size=${W},${H}`, '--virtual-time-budget=9000', '--dump-dom',
  'file:///' + tmp.replace(/\\/g, '/')],
  { stdio: ['ignore', fs.openSync(domF, 'w'), 'ignore'], timeout: 90000 });

const dom = fs.readFileSync(domF, 'utf8');
const t = (dom.match(/<title>([\s\S]*?)<\/title>/) || [, '(无 title)'])[1];
console.log('viewport ' + W + 'x' + H);
console.log(t.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
for (const f of ['_err.html', '_err.txt']) { try { fs.unlinkSync(path.join(ROOT, f)); } catch (e) {} }
