/* 无依赖 PNG 解码 + 画面结构分析。
   目的：在没有可靠"眼睛"的情况下，用像素证据判断构图 ——
   内容分布是否均衡、浪潮带在不在、有没有大片空白或糊成一片。
   node pixels.mjs shots/scene.png [gridW gridH]                                  */
import fs from 'node:fs';
import zlib from 'node:zlib';

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit supported, got ' + depth);
  if (interlace) throw new Error('interlaced not supported');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error('colour type ' + ctype + ' unsupported');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, y * stride + stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= ch) ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

const file = process.argv[2];
const GW = +(process.argv[3] || 32), GH = +(process.argv[4] || 18);
const img = decodePNG(fs.readFileSync(file));
const { w, h, ch, data } = img;

const cells = Array.from({ length: GH }, () => Array.from({ length: GW }, () => ({ lum: 0, n: 0, r: 0, g: 0, b: 0 })));
let total = 0, bright = 0, hot = 0, maxL = 0;
const hist = new Array(10).fill(0);

for (let y = 0; y < h; y++) {
  const gy = Math.min(GH - 1, (y * GH / h) | 0);
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    total += L; maxL = Math.max(maxL, L);
    if (L > 26) bright++;
    if (L > 150) hot++;
    hist[Math.min(9, (L / 25.6) | 0)]++;
    const c = cells[gy][Math.min(GW - 1, (x * GW / w) | 0)];
    c.lum += L; c.r += r; c.g += g; c.b += b; c.n++;
  }
}
const N = w * h;
const RAMP = ' .:-=+*#%@';
console.log('file      : ' + file);
console.log('size      : ' + w + 'x' + h + '  channels=' + ch);
console.log('mean lum  : ' + (total / N).toFixed(1) + '   max=' + maxL.toFixed(0));
console.log('lum>26    : ' + (bright / N * 100).toFixed(1) + '%   lum>150: ' + (hot / N * 100).toFixed(2) + '%');
console.log('lum hist  : ' + hist.map((v, i) => i + ':' + (v / N * 100).toFixed(1)).join('  '));

console.log('\n--- 亮度分布 (每格平均亮度, 0-9) ---');
const norm = cells.map(row => row.map(c => c.lum / c.n));
const gmax = Math.max(...norm.flat());
for (const row of norm) {
  console.log(row.map(v => RAMP[Math.min(9, Math.round(v / gmax * 9))]).join(''));
}

console.log('\n--- 主色相分布 (. 空 / R 暖橙 / Y 金 / G 青绿 / B 靛蓝 / P 紫 / W 白亮) ---');
for (const row of cells) {
  console.log(row.map(c => {
    const r = c.r / c.n, g = c.g / c.n, b = c.b / c.n;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L < 7) return '.';
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
    if (s < 0.14) return L > 120 ? 'W' : 'w';
    if (r >= g && r >= b) return (g > b * 1.25 && g > 90) ? 'Y' : 'R';
    if (g >= r && g >= b) return (b > r * 1.15) ? 'G' : 'g';
    return (r > g * 1.35) ? 'P' : 'B';
  }).join(''));
}

/* 内容包围盒 + 加权重心（用亮度减去底色，把星尘和暗角排除掉） */
let x0 = w, x1 = 0, y0 = h, y1 = 0;
let sw = 0, sx = 0, sy = 0, sx2 = 0, sy2 = 0;
const TH = +(process.env.INK_TH || 60);
let ink = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * ch;
  const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  if (L > TH) {
    ink++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const wt = Math.max(0, L - 12);
  if (wt > 0) { sw += wt; sx += wt * x; sy += wt * y; sx2 += wt * x * x; sy2 += wt * y * y; }
}
console.log('\nink (L>' + TH + '): ' + (ink / (w * h) * 100).toFixed(2) + '%' +
  '   bbox: x ' + x0 + '..' + x1 + '  y ' + y0 + '..' + y1 +
  '   (占画面 ' + ((x1 - x0) / w * 100).toFixed(0) + '% x ' + ((y1 - y0) / h * 100).toFixed(0) + '%)');
if (sw > 0) {
  const cx = sx / sw, cy = sy / sw;
  const vx = Math.sqrt(Math.max(0, sx2 / sw - cx * cx)) / w;
  const vy = Math.sqrt(Math.max(0, sy2 / sw - cy * cy)) / h;
  console.log('重心: (' + (cx / w * 100).toFixed(1) + '%, ' + (cy / h * 100).toFixed(1) + '%)   ' +
    '散布: ' + (vx * 100).toFixed(1) + '% x ' + (vy * 100).toFixed(1) + '%   ' +
    '(理想重心 ≈ 50%,50%)');
}

