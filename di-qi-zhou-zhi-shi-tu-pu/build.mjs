/* ============================================================================
   把 src/ + vendor/ 打成一个可离线双击打开的 HTML。
   课堂场景里没有网络、没有本地服务器，所以 three.js 与后处理全部内联，
   目标是：一个文件，拷到 U 盘里也能放。
   ---------------------------------------------------------------------------
   node build.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const VENDOR = path.join(ROOT, 'vendor');
const OUT = path.join(ROOT, '神经网络简介-3D知识图谱.html');

const read = p => fs.readFileSync(p, 'utf8');

/* 内联脚本里出现 </script 会提前闭合标签，必须打断 */
const guard = js => js.replace(/<\/script/gi, '<\\/script');

/* 顺序有依赖：EffectComposer 定义 THREE.Pass，其余 Pass 继承它 */
const VENDOR_ORDER = [
  ['three.min.js', '                         three.js r147 (MIT)'],
  ['OrbitControls.js', '                      轨道控制'],
  ['CopyShader.js', '                         后处理 · CopyShader'],
  ['LuminosityHighPassShader.js', '           后处理 · 亮度高通'],
  ['EffectComposer.js', '                     后处理 · EffectComposer + Pass'],
  ['ShaderPass.js', '                         后处理 · ShaderPass'],
  ['MaskPass.js', '                           后处理 · MaskPass'],
  ['RenderPass.js', '                         后处理 · RenderPass'],
  ['UnrealBloomPass.js', '                    后处理 · 泛光']
];

const parts = {
  '/*__THREE__*/': '/* three.js r147 (MIT License) — inlined for offline use */\n' +
    guard(read(path.join(VENDOR, 'three.min.js'))),
  '/*__ORBIT__*/': '/* three.js examples/js/controls/OrbitControls.js (MIT) */\n' +
    guard(read(path.join(VENDOR, 'OrbitControls.js'))),
  '/*__POSTFX__*/': VENDOR_ORDER.slice(2)
    .map(([f]) => '/* three.js examples/js — ' + f + ' (MIT) */\n' + guard(read(path.join(VENDOR, f))))
    .join('\n'),
  '/*__DATA__*/': '/* ---- 知识图谱数据（源自课件《4.1 神经网络简介.pptx》，67 页）---- */\n' +
    guard(read(path.join(SRC, 'data.js'))),
  '/*__APP__*/': '/* ---- 应用层 ---- */\n' + guard(read(path.join(SRC, 'app.js'))),
  '/*__CSS__*/': read(path.join(SRC, 'style.css'))
};

let html = read(path.join(SRC, 'index.html'));
const missing = [];
for (const token of Object.keys(parts)) {
  if (html.indexOf(token) < 0) { missing.push(token); continue; }
  html = html.replace(token, () => parts[token]);
}
if (missing.length) {
  console.error('✗ index.html 缺少占位符：' + missing.join(', '));
  process.exit(1);
}

fs.writeFileSync(OUT, html, 'utf8');

/* 自检：必须是一个文件、无外部 JS 依赖 */
const externalScript = /<script[^>]+src=/i.test(html);
const externalCss = /<link[^>]+rel=["']stylesheet["'][^>]*>/.test(html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log('✓ ' + path.basename(OUT) + '   ' + kb + ' KB');
console.log('  外链脚本: ' + (externalScript ? '有（不符合预期）' : '无'));
console.log('  外链样式: ' + (externalCss ? '有 —— 仅 Google Fonts，断网时自动回退到系统宋体/黑体' : '无'));
console.log('  节点: ' + (html.match(/id: '/g) || []).length + ' 处 id 声明（含边与导览）');
