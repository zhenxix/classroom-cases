/* ============================================================================
   《人工智能导论》第 7 讲 · 神经网络简介（4.1） — 3D 知识图谱
   ---------------------------------------------------------------------------
   布局的立意（不是给大纲换层皮）：

     · 课件里最重要的一条线是「发展历史 · 四次起落」。所以它不做装饰，做骨架 ——
       一条三维浪潮带从 1943 流向 2026；启蒙、低潮、复兴、高潮的每个节点，
       都按自己的年份落在带子上，学科越热、浪潮越高。

     · 五个部分像一道浅拱：课程导入、深度学习概述在左，课程思政在右；
       神经网络概述（本讲主场）居中在前；发展历史骑在浪潮中段上方；
       母题「神经网络简介」悬在最顶上。浪潮尾段（2017→2026）汇入
       国家战略节点——技术史与思政在同一条曲线上接棒。

     · 虚线是这张图存在的理由：树突对应输入、连接强度对应权值、
       单层的坎对应《Perceptrons》。按 K 打开，大纲里看不出来的关系，线上看得出来。
   ========================================================================== */
(function () {
'use strict';

const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ============================================================ 0. 辉光贴图 */
/* 放在最前面：后面的流粒、节点光晕都要用它 */
let _glow = null;
function glowTexture() {
  if (_glow) return _glow;
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0.00, 'rgba(255,255,255,1)');
  rg.addColorStop(0.16, 'rgba(255,255,255,0.70)');
  rg.addColorStop(0.36, 'rgba(255,255,255,0.24)');
  rg.addColorStop(0.62, 'rgba(255,255,255,0.06)');
  rg.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  _glow = new THREE.CanvasTexture(cv);
  _glow.needsUpdate = true;
  return _glow;
}

/* ---------------------------------------------------------------- 布局常量 */
const L = {
  core:  [   0, 104,  20],
  b0:    [ -82,  57,  46],   // 00 课程导入（略靠右，给左侧读图面板让位）
  b1:    [ -52,  58,  56],   // 01 深度学习概述
  b2:    [  20,  36,  62],   // 02 神经网络概述：本讲主场，居中偏右在前（偏出中轴，扇面才能横向展开）
  b3:    [ -20,  58, -26],   // 03 发展历史：骑在低潮—复兴段上方的大节点，居中偏左清出浪潮尾部
  b4:    [ 104,  40,  40],   // 04 课程思政 · 中国线索（浪潮尾段汇入国家战略）

  RIBBON_Z: -40,
  RIB_MAIN: 9.0,
  RIB_GLOW: 40,
  RIB_CORE: 2.0,

  R2: 30, BASE2: 10, R2_DEPTH: 10,
  R3B: 15, R3K: 1.7, BASE3: 8, R3_DEPTH: 4.5,

  /* 投影到教室大屏上要"一眼看得见"，所以节点给得比常规图大一号 */
  SIZE:  { 0: 12.0, 1: 6.2, 2: 3.6, 3: 2.2 },
  GLOW:  { 0: 64,   1: 30,  2: 16,  3: 10 },
  /* LABEL 是"名义字号"（CSS 像素）：指相机停在 REF_DEPTH 时标签的屏幕高度 */
  LABEL: { 0: 27,   1: 19,  2: 14.5, 3: 12 },
  LABEL_Y: 1.45,
  REF_DEPTH: 492,
  /* 相机推近时标签最多放到名义字号的几倍 —— 封住它，放大时就不会糊成一团 */
  LABEL_MAX: 1.8,
  LABEL_MIN: 0.82,
  /* 选中的那个点再放大一点，作为"当前焦点"的提示 */
  LABEL_HOT: 2.2,
  /* 标签显示半径：写死绝对值在不同画幅下会失准，所以改成"相对全览景深"的倍数。
     [相机到注视点的距离倍数, 到该节点的距离倍数] —— 满足其一即显示 */
  LOD: { 2: [1.20, 0.48], 3: [0.55, 0.34] },
  /* 窄画幅（手机）上标签更挤：全览时只留母题与五个章，凑近一个簇才放"节"和"点" */
  LOD_TIGHT: { 2: 0.62, 3: 0.72 }
};

const YEAR_MIN = 1940, YEAR_MAX = 2026, X_MIN = -124, X_MAX = 124;
function yearToX(y) {
  const t = clamp((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN), 0, 1);
  return X_MIN + (X_MAX - X_MIN) * t;   // 八十年线性铺开：三段密集期（1958–63 / 1982–89 / 2006–26）平分呼吸空间
}
/* 四次起落：神经网络的学科温度计 —— 启蒙涌起，低潮见底，复兴回升，高潮陡升 */
const WAVE_PROFILE = [
  [1940, 4], [1943, 6], [1949, 8], [1953, 10], [1958, 14], [1963, 17], [1966, 18],
  [1969, 13], [1972, 7], [1976, 4], [1980, 5], [1982, 10], [1986, 17], [1989, 21],
  [1993, 20], [1998, 18], [2002, 20], [2006, 26], [2009, 31], [2012, 38], [2015, 44],
  [2017, 47], [2020, 50], [2023, 53], [2026, 57]
];

/* ============================================================ 1. 渲染地基 */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x04070e, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04070e, 0.00085);

/* 三维内容统一挂在一个可整体旋转的容器下。
   竖屏手机把整个世界绕 Z 转 90°，让"时间"竖着流 —— 这张图是 1.9:1 的横幅，
   塞进 0.55:1 的竖屏只剩 26% 的高度可用；转过来之后能填到 90%，
   节点也跟着大一倍多。星空与底盘不参与旋转。 */
const world = new THREE.Group();
scene.add(world);
const waveGroup = new THREE.Group();     // 浪潮带与流粒：跟着世界一起转
world.add(waveGroup);

/* 长焦一点：透视更平，浪潮带的整幅宽度才不会被近处的簇压扁 */
const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 1, 2600);
let gridHelper = null;   // 底盘在下一节创建，这里先声明：updateOrientation() 要用它

/* ---- 取景：所有相机距离都由"要把这些点全部塞进当前画幅"精确解出来 ----
   一开始用的是"实测有效半宽/半高"这种经验值，但透视放大倍率本身随距离变化，
   换个画幅就不准了（竖屏上曾经只填到 38%）。改成对真实节点坐标求解：
     相机在 C + dir·d，对每个点 q = p - C 有
       |x_ndc| = |q·right| / ((d - q·dir)·tan·aspect) ≤ 1/m
       |y_ndc| = |q·up|    / ((d - q·dir)·tan)         ≤ 1/m
     解出 d ≥ q·dir + m·|q·right|/(tan·aspect)，垂直同理，取所有点的最大值。
   精确、自适应，换画幅 / 换朝向都不用重调。 */
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const FIT_DIR = new THREE.Vector3(0, 0.183, 0.983).normalize();   // 俯角约 10.5°
const FRAME_DIR = new THREE.Vector3(0.16, 0.40, 1).normalize();
const SCENE_CENTER = new THREE.Vector3(0, 42, -6);                // 内容中心（局部坐标）
const HOME_MARGIN = 1.12;
const ORIENT = { target: 0 };

let homeDist = 492;      // 全览时的相机距离
let refDepth = 492;      // 标签"名义字号"对应的景深，跟随取景变化
let userMoved = false;   // 用户自己转过/缩放过之后，改窗口就不再强行复位
let orientSnapped = false;
const homeCenter = new THREE.Vector3(0, 42, -6);   // 全览注视点（世界坐标）
let ALL_PTS = [];        // 全部节点的局部坐标，布局求解完成后填充

const vTan = () => Math.tan(camera.fov * Math.PI / 360);
function portrait() { return camera.aspect < 0.95; }
/* 画幅"挤不挤"看短边：手机竖屏 390、横屏 390 都算挤，
   平板竖屏 744 和桌面 900 都还宽裕。只按 aspect 判断会把平板误伤。 */
function tightView() {
  const w = renderer.domElement.clientWidth || 1600;
  const h = renderer.domElement.clientHeight || 900;
  return Math.min(w, h) < 620;
}

const _fQ = new THREE.Vector3(), _fR = new THREE.Vector3(), _fU = new THREE.Vector3(), _fF = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/* 让 pts 全部落进画幅所需的相机距离；center 是注视点，dir 是"从注视点退开"的方向 */
function fitDistanceFor(pts, margin, dir, center, vUsable) {
  const t = vTan(), m = margin == null ? 1 : margin, s = vUsable == null ? 1 : vUsable;
  const as = Math.max(0.25, camera.aspect);
  _fF.copy(dir).negate();
  _fR.crossVectors(_fF, WORLD_UP).normalize();
  _fU.crossVectors(_fR, _fF).normalize();
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    _fQ.subVectors(pts[i], center);
    const qd = _fQ.dot(dir);
    const dh = qd + m * Math.abs(_fQ.dot(_fR)) / (t * as);
    const dv = qd + m * Math.abs(_fQ.dot(_fU)) / (t * s);
    if (dh > d) d = dh;
    if (dv > d) d = dv;
  }
  return d;
}
/* 画面上方在世界空间里的方向（由俯角决定），用于把内容压到可用带里 */
const _fwd0 = FIT_DIR.clone().negate();
const SCREEN_RIGHT = new THREE.Vector3().crossVectors(_fwd0, WORLD_UP).normalize();
const SCREEN_UP = new THREE.Vector3().crossVectors(SCREEN_RIGHT, _fwd0).normalize();

/* 手机端上下各有一条贴边的 HUD，取景时要把这块让出来 */
function uiInsetTop() {
  const t = document.querySelector('.topbar');
  return t ? t.getBoundingClientRect().height : 0;
}
function uiInsetBottom() {
  const r = document.querySelector('.rail');
  if (!r) return 0;
  return getComputedStyle(r).position === 'fixed' ? r.getBoundingClientRect().height : 0;
}
function usableHeight() {
  const h0 = renderer.domElement.clientHeight || 900;
  return clamp(1 - (uiInsetTop() + uiInsetBottom()) / h0, 0.5, 1);
}
function orientQuat() { return new THREE.Quaternion().setFromAxisAngle(AXIS_Z, ORIENT.target); }

/* 全览：把整张图塞进可用带，并让内容中心落在带中心而不是屏幕几何中心 */
function computeHome() {
  const q = orientQuat();
  const c = SCENE_CENTER.clone().applyQuaternion(q);
  const src = ALL_PTS.length ? ALL_PTS : [SCENE_CENTER];
  const pts = src.map(p => p.clone().applyQuaternion(q));
  homeDist = clamp(fitDistanceFor(pts, HOME_MARGIN, FIT_DIR, c, usableHeight()), 240, 2800);
  refDepth = homeDist;
  homeCenter.copy(c);
  const h0 = renderer.domElement.clientHeight || 900;
  const off = (uiInsetTop() - uiInsetBottom()) / 2;    // 正 = 可用带中心在屏幕中心下方
  if (Math.abs(off) > 0.5) {
    homeCenter.addScaledVector(SCREEN_UP, off * (2 * homeDist * vTan() / h0));
  }
  if (controls) controls.maxDistance = Math.max(900, homeDist * 1.6);
}
function updateHome() { computeHome(); }
function homeTarget() { return homeCenter.clone(); }
function homePos() { return homeTarget().addScaledVector(FIT_DIR, homeDist); }
function goHome(ms) {
  userMoved = false;
  flyTo(homePos().toArray(), homeTarget().toArray(), ms == null ? 900 : ms);
}

/* 竖屏：整个世界绕 Z 转 90°，让"时间"竖着流 */
function updateOrientation() {
  ORIENT.target = portrait() ? -Math.PI / 2 : 0;
  if (gridHelper) gridHelper.visible = !portrait();   // 底盘是水平的，转过来就成墙了
}

let controls = null;
updateOrientation();
updateHome();
camera.position.copy(homePos());

controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.copy(homeTarget());
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.rotateSpeed = 0.62;
controls.zoomSpeed = 0.85;
controls.panSpeed = 0.7;
controls.minDistance = 40;
controls.maxDistance = 900;          // 真正的上限由 updateHome() 按画幅决定
controls.maxPolarAngle = Math.PI * 0.93;
controls.autoRotateSpeed = 0.32;
controls.autoRotate = false;
/* 用户一旦自己动过镜头，改窗口尺寸就不再强行拉回全览 */
controls.addEventListener('start', () => { userMoved = true; });
controls.update();

const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));
const bloom = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.86, 0.66, 0.15
);
composer.addPass(bloom);

/* ============================================================ 2. 底噪氛围 */
const ambient = new THREE.Group();
scene.add(ambient);

(function stars() {
  const N = 1500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const r = 640 + Math.random() * 900;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.62 + 40;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    c.setHSL(0.56 + Math.random() * 0.1, 0.42, 0.40 + Math.random() * 0.45);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ambient.add(new THREE.Points(g, new THREE.PointsMaterial({
    size: 1.8, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.34, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false
  })));
})();

(function floor() {
  const grid = new THREE.PolarGridHelper(320, 12, 8, 72, 0x2A4569, 0x16283F);
  grid.position.set(0, -88, -30);
  grid.material.transparent = true;
  grid.material.opacity = 0.26;
  grid.material.depthWrite = false;
  ambient.add(grid);
  gridHelper = grid;
})();

/* ============================================================ 3. 浪潮曲线 */
const waveCurve = (function () {
  const pts = WAVE_PROFILE.map(([y, v]) => new THREE.Vector3(yearToX(y), v, L.RIBBON_Z));
  const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  c.arcLengthDivisions = 2400;
  return c;
})();

const WS = 900;
const waveTable = [];
for (let i = 0; i <= WS; i++) {
  const u = i / WS;
  waveTable.push({ u, p: waveCurve.getPointAt(u), t: waveCurve.getTangentAt(u) });
}
function waveAtX(x) {
  let lo = 0, hi = waveTable.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (waveTable[mid].p.x < x) lo = mid; else hi = mid;
  }
  const a = waveTable[lo], b = waveTable[hi];
  const span = b.p.x - a.p.x;
  const k = span > 1e-6 ? clamp((x - a.p.x) / span, 0, 1) : 0;
  return { p: a.p.clone().lerp(b.p, k), t: a.t.clone().lerp(b.t, k).normalize(), u: lerp(a.u, b.u, k) };
}
function waveAtYear(y) { return waveAtX(yearToX(y)); }
function waveOf(id) { return pos[id] ? waveAtX(pos[id].x) : null; }
let pos = {};   // 前向声明，布局阶段填充

/* ---- 三维带：沿曲线立起来的一道「潮」 ---- */
const RIB_VERT = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const RIB_FRAG = `
  uniform vec3  uA; uniform vec3 uB; uniform vec3 uC;
  uniform float uTime; uniform float uAlpha; uniform float uFlow; uniform float uGain;
  varying vec2 vUv;
  void main(){
    float edge = smoothstep(0.0, 0.30, vUv.y) * smoothstep(1.0, 0.70, vUv.y);
    float f  = sin((vUv.x * 34.0 - uTime * uFlow) * 3.14159265);
    float head = pow(max(f, 0.0), 2.4);
    float f2 = sin((vUv.x * 11.0 - uTime * uFlow * 0.42) * 3.14159265);
    float band = 0.30 + 0.70 * pow(max(f2, 0.0), 1.6);
    vec3 col = mix(uA, uB, smoothstep(0.0, 0.55, vUv.x));
    col = mix(col, uC, smoothstep(0.58, 1.0, vUv.x));
    float a = uAlpha * uGain * edge * band * (0.72 + 0.62 * head);
    a *= smoothstep(0.0, 0.045, vUv.x) * smoothstep(1.0, 0.945, vUv.x);
    gl_FragColor = vec4(col * (0.72 + 0.75 * head), a);
  }`;

function ribbonGeometry(halfW, samples) {
  const verts = [], uvs = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const s = waveTable[Math.round(i / samples * WS)];
    const side = new THREE.Vector3().crossVectors(s.t, up).normalize();
    const vert = new THREE.Vector3().crossVectors(side, s.t).normalize();
    const a = s.p.clone().addScaledVector(vert, halfW);
    const b = s.p.clone().addScaledVector(vert, -halfW);
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uvs.push(i / samples, 1, i / samples, 0);
    if (i < samples) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

const ribMats = [];
function addRibbon(halfW, a, b, c, alpha, flow, samples) {
  const u = {
    uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) },
    uC: { value: new THREE.Color(c) }, uTime: { value: 0 },
    uAlpha: { value: alpha }, uFlow: { value: flow }, uGain: { value: 1 }
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: RIB_VERT, fragmentShader: RIB_FRAG,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const mesh = new THREE.Mesh(ribbonGeometry(halfW, samples), m);
  mesh.renderOrder = 1;
  waveGroup.add(mesh);
  ribMats.push({ mat: m, base: alpha });
  return mesh;
}
addRibbon(L.RIB_GLOW / 2, 0x3A1A0C, 0x8C2E0E, 0x123A46, 0.20, 0.30, 260);
addRibbon(L.RIB_MAIN / 2, 0xFFA45C, 0xFF6B2E, 0x35C6B0, 0.62, 0.62, 420);
addRibbon(L.RIB_CORE / 2, 0xFFE0B0, 0xFFB27A, 0xBDEFE6, 1.0, 0.62, 520);

/* ---- 潮头上的流粒 ---- */
const flow = (function () {
  const N = 620;
  const posA = new Float32Array(N * 3), seed = new Float32Array(N * 2), col = new Float32Array(N * 3);
  const A = new THREE.Color(0xFFD9A8), B = new THREE.Color(0x7FE6D6), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    seed[i * 2] = Math.random();
    seed[i * 2 + 1] = 0.012 + Math.random() * 0.035;
    c.copy(A).lerp(B, seed[i * 2]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    size: 3.4, sizeAttenuation: true, vertexColors: true, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    map: glowTexture(), fog: false
  }));
  pts.frustumCulled = false;
  waveGroup.add(pts);
  return { N, seed, pos: posA, geo: g };
})();

const _fp = new THREE.Vector3(), _ft = new THREE.Vector3();
function updateFlow(time) {
  const { N, seed, pos: arr } = flow;
  for (let i = 0; i < N; i++) {
    const u = (seed[i * 2] + time * seed[i * 2 + 1]) % 1;
    const fi = u * WS, i0 = Math.floor(fi), k = fi - i0;
    const a = waveTable[i0], b = waveTable[Math.min(i0 + 1, WS)];
    _fp.copy(a.p).lerp(b.p, k);
    _ft.copy(a.t).lerp(b.t, k).normalize();
    const wob = Math.sin(i * 12.9898 + time * 1.4) * (1.6 + (i % 5) * 1.1);
    const lift = ((i % 7) - 3) * 1.5;
    arr[i * 3]     = _fp.x - _ft.z * wob * 0.35;
    arr[i * 3 + 1] = _fp.y + lift + wob * 0.55;
    arr[i * 3 + 2] = _fp.z + _ft.x * wob * 0.35 + wob * 0.4;
  }
  flow.geo.attributes.position.needsUpdate = true;
}

/* ============================================================ 4. 节点材质 */
const NODE_VERT = `
  varying vec3 vN; varying vec3 vV;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const NODE_FRAG = `
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uBoost;
  varying vec3 vN; varying vec3 vV;
  void main(){
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.85);
    vec3 col = uColor * (0.58 + uBoost * 0.38 + (1.30 + uBoost * 0.9) * f);
    gl_FragColor = vec4(col, uOpacity);
  }`;
function nodeMaterial(color, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity == null ? 0.97 : opacity },
      uBoost: { value: 0 }
    },
    vertexShader: NODE_VERT, fragmentShader: NODE_FRAG,
    transparent: true, depthWrite: true, fog: false
  });
}

/* ============================================================ 5. 布局求解 */
const BR = {}; BRANCHES.forEach(b => BR[b.id] = b);
BR.core = CORE;
const NODE = {}; NODES.forEach(n => NODE[n.id] = n);
const CHILD = TREE;
const PARENT = {};
Object.keys(CHILD).forEach(p => CHILD[p].forEach(c => { PARENT[c] = p; }));

const sceneCentre = new THREE.Vector3(0, 24, 0);

function placeCore() { pos.core = new THREE.Vector3().fromArray(L.core); }

/* 章 → 节：以章为心，向外张开一把扇 */
function fanOut(anchorId, kids, R, base, depth) {
  const A = pos[anchorId];
  const ax = new THREE.Vector3(A.x - sceneCentre.x, A.y - sceneCentre.y, 0).normalize();
  const pH = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0)).normalize();
  const pV = new THREE.Vector3().crossVectors(pH, ax).normalize();
  const n = kids.length;
  kids.forEach((id, i) => {
    const ang = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2.10;
    pos[id] = A.clone()
      .addScaledVector(ax, base + Math.cos(ang) * R * 0.62)
      .addScaledVector(pV, Math.sin(ang) * R)
      .addScaledVector(pH, ((i % 2) ? 1 : -1) * depth * (0.6 + (i % 3) * 0.35));
  });
}

/* 节 → 点：从节向外拖出一束彗尾 */
function sprayLeaves(sectionId, kids) {
  const P = pos[sectionId];
  const A = pos[PARENT[sectionId]] || pos.core;
  const ax = new THREE.Vector3().subVectors(P, A).normalize();
  const pH = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0)).normalize();
  const pV = new THREE.Vector3().crossVectors(pH, ax).normalize();
  const n = kids.length;
  const R = L.R3B + n * L.R3K;
  kids.forEach((id, k) => {
    const ang = n === 1 ? 0 : (k / (n - 1) - 0.5) * 2.05;
    pos[id] = P.clone()
      .addScaledVector(ax, L.BASE3 + Math.cos(ang) * R * 0.55)
      .addScaledVector(pV, Math.sin(ang) * R)
      .addScaledVector(pH, ((k % 2) ? 1 : -1) * L.R3_DEPTH * (0.7 + (k % 3) * 0.4));
  });
}

/* ---- 求解 ---- */
placeCore();
pos.b0 = new THREE.Vector3().fromArray(L.b0);
pos.b1 = new THREE.Vector3().fromArray(L.b1);
pos.b2 = new THREE.Vector3().fromArray(L.b2);
pos.b3 = new THREE.Vector3().fromArray(L.b3);
pos.b4 = new THREE.Vector3().fromArray(L.b4);

/* 国家战略与数据制度：一整簇按年份落在制度浪潮曲线上 */
const bandIds = [];
const historyIds = [];
Object.keys(NODE).forEach(id => {
  const n = NODE[id];
  if (!n.band || !n.wave) return;
  const s = waveAtYear(n.wave.year);
  pos[id] = new THREE.Vector3(s.p.x, s.p.y + n.wave.lift, n.wave.z != null ? n.wave.z : L.RIBBON_Z + 8);
  bandIds.push(id);
  if (n.tier === 2) historyIds.push(id);
});

/* 其余章节：章→节 扇开；节→点 拖尾 */
Object.keys(CHILD).forEach(pid => {
  if (pid === 'core' || !NODE[pid]) return;
  if (NODE[pid].band) return;                         // 浪潮簇走曲线，另行安排
  const kids = CHILD[pid].filter(k => NODE[k] && !NODE[k].band);   // band 子节点已按年份落位，别覆盖
  if (!kids.length) return;
  if (NODE[pid].tier === 1) fanOut(pid, kids, L.R2, L.BASE2, L.R2_DEPTH);
  else if (NODE[pid].tier === 2) sprayLeaves(pid, kids);
});

/* 历史簇的节 → 点：沿竖直方向拖尾，不打乱年份轴 */
historyIds.forEach(pid => {
  const kids = CHILD[pid].filter(k => NODE[k] && !NODE[k].wave);   // 有 wave 的子节点已按年份落位
  if (!kids.length) return;
  const P = pos[pid];
  const ax = new THREE.Vector3(0, P.y > 30 ? 1 : (P.y < -6 ? -1 : 1), 0);
  const pH = new THREE.Vector3(0, 0, 1);
  const pV = new THREE.Vector3().crossVectors(pH, ax).normalize();
  const n = kids.length;
  const R = L.R3B + n * L.R3K;
  kids.forEach((id, k) => {
    const ang = n === 1 ? 0 : (k / (n - 1) - 0.5) * 2.15;
    pos[id] = P.clone()
      .addScaledVector(ax, L.BASE3 + Math.cos(ang) * R * 0.50)
      .addScaledVector(pV, Math.sin(ang) * R)
      .addScaledVector(pH, ((k % 2) ? 1 : -1) * L.R3_DEPTH * (0.8 + (k % 3) * 0.5));
  });
});

/* 这一簇的坐标解出来之后，全览取景才有意义：重新算一次并归位 */
ALL_PTS = Object.keys(pos).map(k => pos[k]);
updateHome();
camera.position.copy(homePos());
if (controls) controls.target.copy(homeTarget());

/* ============================================================ 6. 建几何 */
const nodeGroup = new THREE.Group(); world.add(nodeGroup);
const pickables = [];
const items = {};

const sphGeo = {
  0: new THREE.IcosahedronGeometry(L.SIZE[0], 2),
  1: new THREE.IcosahedronGeometry(L.SIZE[1], 2),
  2: new THREE.SphereGeometry(L.SIZE[2], 20, 14),
  3: new THREE.SphereGeometry(L.SIZE[3], 14, 10)
};
const pickGeo = { 2: new THREE.SphereGeometry(4.6, 8, 6), 3: new THREE.SphereGeometry(3.4, 8, 6) };
const pickMat = new THREE.MeshBasicMaterial({ visible: false });

function branchColor(node) { return node.branch === 'core' ? CORE.color : (BR[node.branch] || BR.core).color; }

/* ---- 文本贴图 ----
   糊的根因不是缩放，是分辨率：贴图按名义字号烘焙，而 frameNode 会把相机推到
   景深 ~95，等于把贴图放大 5 倍。两件事一起解决：
     1) 画布按 SS 倍超采样，SS 由"最大放大倍数 × 设备像素比"反推；
     2) 屏幕尺寸做上下限（LABEL_MIN / LABEL_MAX），近处不再无限放大。
   于是贴图永远处于"1:1 或缩小"的状态，放大到最近也是清晰的。
   超采样倍率按 LABEL_HOT（选中时放得最大）反推，留 15% 余量。 */
const SS = Math.min(3.8, Math.max(2.6, L.LABEL_HOT * (window.devicePixelRatio || 1) * 1.15));

const labelCache = new Map();
function makeLabel(text, colorHex, px, weight) {
  const key = text + '|' + colorHex + '|' + px + '|' + weight + '|' + SS.toFixed(2);
  if (labelCache.has(key)) return labelCache.get(key);
  const fontPx = Math.round(px * SS);              // 画布里的真实字号
  const font = `${weight} ${fontPx}px "Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif`;
  const cv = document.createElement('canvas');
  let g = cv.getContext('2d');
  g.font = font;
  const tw = Math.ceil(g.measureText(text).width);
  const padX = Math.round(fontPx * 0.32), padY = Math.round(fontPx * 0.28);
  cv.width = tw + padX * 2;
  cv.height = Math.round(fontPx * 1.06) + padY * 2;
  g = cv.getContext('2d');
  g.font = font;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  /* 深色底衬：让宋体在亮节点上也读得清 */
  g.fillStyle = 'rgba(5,9,17,0.82)';
  g.beginPath();
  const rad = Math.max(3, fontPx * 0.18);
  if (g.roundRect) g.roundRect(1.5, 1.5, cv.width - 3, cv.height - 3, rad);
  else g.rect(1.5, 1.5, cv.width - 3, cv.height - 3);
  g.fill();
  g.strokeStyle = colorHex + '3A';
  g.lineWidth = Math.max(1.2, fontPx * 0.05);
  g.stroke();
  g.fillStyle = '#F2F7FF';
  g.fillText(text, cv.width / 2, cv.height / 2 + fontPx * 0.03);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.minFilter = THREE.LinearMipmapLinearFilter;   // 缩小时走 mipmap，远处不闪
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  /* glyphRatio = 画布高 / 字号，用来把"想要多大字"换算成"spirit 要多高" */
  const out = { tex, aspect: cv.width / cv.height, glyphRatio: cv.height / fontPx };
  labelCache.set(key, out);
  return out;
}

/* 某个景深下，1 个 CSS 像素对应多少世界单位 */
function worldPerPixel(z) {
  const h = renderer.domElement.clientHeight || window.innerHeight || 900;
  return 2 * (z || refDepth) * Math.tan(camera.fov * Math.PI / 360) / h;
}

function labelSprite(node) {
  const px = L.LABEL[node.tier];
  const m = makeLabel(node.label, branchColor(node), px, node.tier <= 1 ? 700 : 600);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: m.tex, transparent: true, depthWrite: false, depthTest: true,
    opacity: 0.94, fog: false, sizeAttenuation: true
  }));
  sp.userData.label = { basePx: px, glyphRatio: m.glyphRatio, aspect: m.aspect };
  const h = px * m.glyphRatio;
  sp.scale.set(h * m.aspect, h, 1);
  sp.renderOrder = 12;
  return sp;
}

/* 屏幕上"向下/向前"在世界容器局部空间里是哪个方向。
   竖屏把世界转了 90° 之后就不再是世界 -Y 了，所以每帧重算一次。 */
const LABEL_DOWN = new THREE.Vector3(0, -1, 0);
const LABEL_FWD = new THREE.Vector3(0, 0, 1);
const _wq = new THREE.Quaternion(), _wv = new THREE.Vector3();
function updateLabelAxes() {
  _wv.set(0, 1, 0).applyQuaternion(camera.quaternion);        // 屏幕上方（世界空间）
  _wq.copy(world.quaternion).invert();
  LABEL_DOWN.copy(_wv).multiplyScalar(-1).applyQuaternion(_wq).normalize();
  LABEL_FWD.set(0, 0, 1);
}

/* 把"屏幕上要多少 CSS 像素高"写进 sprite 的 scale，并按当前朝向摆好位置。
   zTrue 用于把 CSS 像素换算成世界尺寸（必须是真实景深，否则屏幕尺寸会二次放大）；
   ratio 是软化过的"相对远近"，只影响字号。 */
function sizeLabel(it, zTrue, ratio, hot) {
  const cap = hot ? L.LABEL_HOT : L.LABEL_MAX;
  const css = clamp(it.basePx * ratio, it.basePx * L.LABEL_MIN, it.basePx * cap);
  const h = css * it.glyphRatio * worldPerPixel(zTrue);
  it.label.scale.set(h * it.labelAspect, h, 1);
  it.label.position.copy(it.pos)
    .addScaledVector(LABEL_DOWN, it.labelGap + h * 0.5)
    .addScaledVector(LABEL_FWD, 2);
}

/* ---- 生成 ---- */
NODES.forEach(node => {
  const p = pos[node.id];
  if (!p) return;
  const col = branchColor(node);
  const r = L.SIZE[node.tier];
  const mat = nodeMaterial(col, node.tier === 3 ? 0.98 : 1.0);
  const mesh = new THREE.Mesh(sphGeo[node.tier], mat);
  mesh.position.copy(p);
  mesh.userData.id = node.id;
  nodeGroup.add(mesh);

  let glow = null;
  if (node.tier <= 2) {
    const gsz = L.GLOW[node.tier];
    const gm = new THREE.SpriteMaterial({
      map: glowTexture(), color: new THREE.Color(col), transparent: true,
      opacity: node.tier === 0 ? 0.72 : (node.tier === 1 ? 0.68 : 0.44),
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false
    });
    glow = new THREE.Sprite(gm);
    glow.scale.set(gsz, gsz, 1);
    glow.position.copy(p);
    glow.renderOrder = 3;
    nodeGroup.add(glow);
  }

  const label = labelSprite(node);
  const lm = label.userData.label;
  nodeGroup.add(label);      // 具体位置每帧由 sizeLabel() 按当前朝向摆

  let ring = null;
  if (node.milestone) {
    ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 2.5, 0.28, 6, 54),
      new THREE.MeshBasicMaterial({
        color: 0xFFD166, transparent: true, opacity: 0.92,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    ring.position.copy(p);
    ring.userData.spin = 0.34 + Math.random() * 0.2;
    nodeGroup.add(ring);
  }

  if (pickGeo[node.tier]) {
    const pick = new THREE.Mesh(pickGeo[node.tier], pickMat);
    pick.position.copy(p);
    pick.userData.id = node.id;
    nodeGroup.add(pick);
    pickables.push(pick);
  } else {
    pickables.push(mesh);
  }

  items[node.id] = {
    node, mesh, mat, glow, label, ring,
    base: mat.uniforms.uOpacity.value,
    glowBase: glow ? glow.material.opacity : 0,
    basePx: lm.basePx,
    glyphRatio: lm.glyphRatio,
    labelAspect: lm.aspect,
    labelGap: r * L.LABEL_Y,
    pos: p
  };
});

/* ---- 母题的两层壳 ---- */
(function coreShells() {
  const p = pos.core;
  items.core.shells = [[17, 0.17, 0.10], [23.5, 0.10, -0.07]].map(([r, op, sp]) => {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshBasicMaterial({
        color: 0x9FE8FF, wireframe: true, transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    m.position.copy(p);
    m.userData.spin = sp;
    m.userData.base = op;
    nodeGroup.add(m);
    return m;
  });
})();

/* ============================================================ 7. 连线 */
const edgeGroup = new THREE.Group(); world.add(edgeGroup);

function edgeCurve(a, b, bow, drape) {
  const mid = a.clone().lerp(b, 0.5);
  const d = b.clone().sub(a);
  const len = d.length();
  const perp = new THREE.Vector3().crossVectors(d.clone().normalize(), new THREE.Vector3(0, 1, 0)).normalize();
  mid.addScaledVector(perp, (bow == null ? 0.14 : bow) * len);
  mid.y += 0.05 * len;
  /* drape：把中点按到浪潮带上，让"发展历史"的连线顺着那条曲线走 */
  if (drape) { const w = waveAtX(mid.x); mid.y = w ? w.p.y + 7 : mid.y; mid.z = L.RIBBON_Z + 16; }
  return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
}

const primaryEdges = [];
Object.keys(CHILD).forEach(pid => {
  if (!pos[pid] || !NODE[pid]) return;
  const pn = NODE[pid];
  if (pn.tier === 2) return;                       // 节→点 归合并线管
  CHILD[pid].forEach(cid => {
    if (!pos[cid] || !NODE[cid]) return;
    const cn = NODE[cid];
    const isHub = (pid === 'b3' && cn.band === true);   // 只有通向浪潮簇的边贴着曲线走
    if (pid !== 'core' && cn.tier === 3) return;
    const curve = edgeCurve(pos[pid], pos[cid], pid === 'core' ? 0.06 : 0.13, isHub);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(branchColor(cn)), transparent: true,
      opacity: isHub ? 0.11 : (pid === 'core' ? 0.34 : 0.26),
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, pid === 'core' ? 0.42 : 0.22, 5, false), mat);
    tube.userData = { a: pid, b: cid, base: mat.opacity };
    edgeGroup.add(tube);
    primaryEdges.push(tube);
  });
});

/* 点级边：合并成一条 LineSegments，一次绘制 */
const leafPairs = [];
const leafLine = (function () {
  const positions = [], colors = [];
  Object.keys(CHILD).forEach(pid => {
    const pn = NODE[pid];
    if (!pn || pn.tier !== 2 || !pos[pid]) return;
    CHILD[pid].forEach(cid => {
      if (!pos[cid] || !NODE[cid]) return;
      const pts = edgeCurve(pos[pid], pos[cid], 0.16).getPoints(9);
      const col = new THREE.Color(branchColor(NODE[cid]));
      for (let i = 0; i < pts.length - 1; i++) {
        const n0 = positions.length / 3;
        positions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
        leafPairs.push({ i: n0, a: pid, b: cid });
      }
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.42,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const ls = new THREE.LineSegments(g, m);
  ls.frustumCulled = false;
  edgeGroup.add(ls);
  return ls;
})();
const leafBaseColors = Float32Array.from(leafLine.geometry.attributes.color.array);

/* 跨章节虚线 */
const crossLines = [];
CROSS_LINKS.forEach(([a, b, why]) => {
  if (!pos[a] || !pos[b]) return;
  const g = new THREE.BufferGeometry().setFromPoints(edgeCurve(pos[a], pos[b], 0.20).getPoints(30));
  const m = new THREE.LineDashedMaterial({
    color: 0xFFD166, transparent: true, opacity: 0.5,
    dashSize: 3.4, gapSize: 3.0, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false
  });
  const ln = new THREE.Line(g, m);
  ln.computeLineDistances();
  ln.visible = false;
  ln.userData = { a, b, why };
  edgeGroup.add(ln);
  crossLines.push(ln);
});

/* 历史节点与浪潮带的牵引线：把节点"钉"回曲线上 */
const stems = [];
bandIds.forEach(id => {
  const n = NODE[id];
  if (!n.wave || Math.abs(n.wave.lift) > 60 || !pos[id]) return;
  const s = waveAtYear(n.wave.year);
  const a = new THREE.Vector3(s.p.x, s.p.y, L.RIBBON_Z);
  const b = pos[id].clone().setZ(L.RIBBON_Z);
  if (a.distanceTo(b) < 2) return;
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const m = new THREE.LineBasicMaterial({
    color: n.milestone ? 0xFFD166 : 0xFF7A45, transparent: true,
    opacity: n.milestone ? 0.34 : 0.20,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const ln = new THREE.Line(g, m);
  ln.userData = { base: m.opacity, id };
  ln.visible = false;    // 默认隐藏，只在聚焦到该节点时点亮
  world.add(ln);
  stems.push(ln);
});

/* ============================================================ 8. 交互状态 */
let hovered = null, selected = null, focusSet = null;
let showLabels = true, showLeaves = true, showCross = false, spinning = false;
let activeBranch = null;
const DIM = { node: 0.10, glow: 0.03, edge: 0.05 };

function ancestors(id) { const out = []; let c = id; while (c) { out.push(c); c = PARENT[c]; } return out; }
function neighbourhood(id) {
  const s = new Set(ancestors(id)); s.add(id);
  (CHILD[id] || []).forEach(k => { if (NODE[k]) s.add(k); });
  CROSS_LINKS.forEach(([a, b]) => { if (a === id) s.add(b); if (b === id) s.add(a); });
  return s;
}
function branchSet(bid) {
  const s = new Set(['core', bid]);
  Object.keys(NODE).forEach(id => { if (NODE[id].branch === bid) s.add(id); });
  return s;
}
function subtreeSet(id) {
  const s = new Set();
  (function walk(x) { s.add(x); (CHILD[x] || []).forEach(k => { if (NODE[k]) walk(k); }); })(id);
  return s;
}

function applyFocus(set) {
  focusSet = set;
  const has = !!set;
  const histOn = has && Object.keys(NODE).some(id => set.has(id) && NODE[id].band);

  Object.keys(items).forEach(id => {
    const it = items[id], tw = it.node.tier;
    const on = !has || set.has(id);
    const vis = showLeaves || tw !== 3;
    it.mesh.visible = vis;
    it.mat.uniforms.uOpacity.value = on ? it.base : (has ? it.base * DIM.node : it.base);
    it.mat.uniforms.uBoost.value = on && has ? ((id === selected || id === hovered) ? 1 : 0.45) : 0;
    if (it.glow) {
      it.glow.visible = vis;
      it.glow.material.opacity = on ? it.glowBase : (has ? it.glowBase * DIM.glow : it.glowBase);
    }
    if (it.label) it.label.visible = vis;
    if (it.ring) {
      it.ring.visible = vis;
      it.ring.material.opacity = on ? 0.92 : (has ? 0.08 : 0.92);
    }
    if (it.shells) it.shells.forEach(s => {
      s.material.opacity = !has ? s.userData.base : (set.has('core') ? s.userData.base : s.userData.base * 0.25);
    });
  });

  primaryEdges.forEach(e => {
    const on = !has || (set.has(e.userData.a) && set.has(e.userData.b));
    e.material.opacity = on ? e.userData.base : (has ? e.userData.base * DIM.edge : e.userData.base);
  });

  const ca = leafLine.geometry.attributes.color;
  for (let i = 0; i < leafPairs.length; i++) {
    const pr = leafPairs[i];
    const on = !has || (set.has(pr.a) && set.has(pr.b));
    const k = on ? 1 : (has ? 0.09 : 1);
    const o = pr.i * 3;
    for (let j = 0; j < 6; j++) ca.array[o + j] = leafBaseColors[o + j] * k;
  }
  ca.needsUpdate = true;

  crossLines.forEach(ln => {
    const on = !has || (set.has(ln.userData.a) && set.has(ln.userData.b));
    ln.visible = showCross && on;
    ln.material.opacity = on ? 0.5 : 0.06;
  });
  stems.forEach(ln => { ln.visible = histOn && set.has(ln.userData.id); });
  /* 聚焦到历史分支时，让浪潮带亮起来 */
  ribMats.forEach(r => {
    const tgt = histOn ? 1.5 : 1;
    r.mat.uniforms.uGain.value += (tgt - r.mat.uniforms.uGain.value) * 0.12;
  });
}
function clearFocus() { applyFocus(null); }

/* ============================================================ 9. 相机飞行 */
let fly = null;
function flyTo(camPos, camTgt, ms) {
  const d = RM ? 0 : (ms == null ? 1150 : ms);
  const p1 = new THREE.Vector3().fromArray(camPos);
  const t1 = new THREE.Vector3().fromArray(camTgt);
  if (d === 0) { camera.position.copy(p1); controls.target.copy(t1); fly = null; return; }
  fly = { t: 0, d, p0: camera.position.clone(), p1, t0: controls.target.clone(), t1 };
}
/* 把一组节点精确放进画面：距离由 fitDistanceFor 解出，所以窄画幅会自动退远 */
function fitAround(pts, centerPt, margin, dir) {
  const d = fitDistanceFor(pts, margin == null ? 1.2 : margin, dir, centerPt, usableHeight());
  return clamp(d, 90, 2800);
}
function frameNode(id) {
  const n = NODE[id], p = pos[id];
  if (!p) return;
  /* 取景范围 = 这个节点 + 它的下一级（点级则取同辈），保证上下文也在画面里 */
  let set;
  if (n.tier === 3) set = (CHILD[PARENT[id]] || []).filter(k => NODE[k] && pos[k]);
  else set = (CHILD[id] || []).filter(k => NODE[k] && pos[k]);
  if (!set || set.length < 2) set = []; else set = set.concat([id]);
  const q = orientQuat();
  const pc = p.clone().applyQuaternion(q);
  const pts = set.map(k => pos[k].clone().applyQuaternion(q));
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  if (!isFinite(dir.x) || dir.lengthSq() < 1e-6) dir.copy(FRAME_DIR);
  const dist = fitAround(pts, pc, 1.15, dir);
  flyTo(pc.clone().addScaledVector(dir, dist).toArray(), pc.toArray(), 950);
}
function frameSet(ids, pad) {
  const q = orientQuat();
  const pts = ids.filter(k => pos[k]).map(k => pos[k].clone().applyQuaternion(q));
  if (!pts.length) return;
  const c = new THREE.Vector3();
  pts.forEach(p => c.add(p));
  c.multiplyScalar(1 / pts.length);
  const dist = fitAround(pts, c, pad == null ? 1.5 : pad, FRAME_DIR);
  flyTo(c.clone().addScaledVector(FRAME_DIR, dist).toArray(), c.toArray(), 1150);
}

/* ============================================================ 10. 拾取 */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2(-2, -2);
let pointerDown = null, dragMoved = false;

function pickAt(cx, cy) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickables, false);
  for (let i = 0; i < hits.length; i++) {
    const id = hits[i].object.userData.id;
    if (!id || !items[id] || !items[id].mesh.visible) continue;
    if (!showLeaves && NODE[id].tier === 3) continue;
    return id;
  }
  return null;
}

/* ============================================================ 11. UI */
const $ = s => document.querySelector(s);
const el = {
  hud: $('#hud'), panel: $('#panel'), pEyebrow: $('#pEyebrow'), pTitle: $('#pTitle'),
  pSub: $('#pSub'), pBody: $('#pBody'), pClose: $('#pClose'),
  brs: $('#brs'), q: $('#q'), qhits: $('#qhits'),
  tip: $('#tip'), tipT: $('#tipT'), tipB: $('#tipB'), tipK: $('#tipK'),
  tour: $('#tour'), tIdx: $('#tIdx'), tTitle: $('#tTitle'), tNote: $('#tNote'),
  tProg: $('#tProg'), tPlay: $('#tPlay'), tPrev: $('#tPrev'), tNext: $('#tNext'), tExit: $('#tExit'),
  veil: $('#veil'), veilBar: $('#veilBar'),
  stNodes: $('#stNodes'), stLinks: $('#stLinks'), stFps: $('#stFps'),
  status: $('#status'), rulerPath: $('#rulerPath'), rulerTrack: $('#rulerTrack'),
  btnTour: $('#btnTour'), btnLabels: $('#btnLabels'), btnLinks: $('#btnLinks'),
  btnLeaves: $('#btnLeaves'), btnSpin: $('#btnSpin'), btnReset: $('#btnReset'),
  btnShot: $('#btnShot'), btnHide: $('#btnHide'),
  btnMenu: $('#btnMenu'), tools: $('#tools')
};

const branchDefs = [CORE].concat(BRANCHES);
branchDefs.forEach(b => {
  const count = b.id === 'core' ? 1 : NODES.filter(n => n.branch === b.id).length;
  const btn = document.createElement('button');
  btn.className = 'br'; btn.type = 'button';
  btn.style.setProperty('--c', b.color);
  btn.dataset.branch = b.id;
  btn.title = b.axis || '';
  btn.innerHTML = `<span class="br__no">${b.no}</span><span class="br__name">${b.name}</span><span class="br__n">${count}</span>`;
  btn.addEventListener('click', () => selectBranch(b.id));
  btn.addEventListener('mouseenter', () => { if (!activeBranch && !tour.on) applyFocus(branchSet(b.id)); });
  btn.addEventListener('mouseleave', () => { if (!activeBranch && !tour.on) { selected ? applyFocus(neighbourhood(selected)) : clearFocus(); } });
  el.brs.appendChild(btn);
});
function syncBranchUI() {
  [...el.brs.children].forEach(c => { c.dataset.active = (c.dataset.branch === activeBranch) ? 'true' : 'false'; });
}
function selectBranch(bid) {
  if (activeBranch === bid) { activeBranch = null; selected = null; clearFocus(); closePanel(); syncBranchUI(); return; }
  activeBranch = bid; selected = null; closePanel(); syncBranchUI();
  applyFocus(branchSet(bid));
  if (bid === 'core') frameNode('core');
  else frameSet([...subtreeSet(bid)], 1.35);
}
syncBranchUI();

/* ---- 详情面板 ---- */
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function openPanel(id) {
  const n = NODE[id]; if (!n) return;
  const col = branchColor(n);
  const br = n.branch === 'core' ? CORE : BR[n.branch];
  el.panel.style.setProperty('--c', col);

  const crumb = [br.no === '※' ? '母题' : br.no + ' · ' + br.name];
  if (n.tier > 1) {
    const path = []; let p = PARENT[id];
    while (p && p !== 'core') { path.unshift(NODE[p].label); p = PARENT[p]; }
    if (path.length) crumb.push(path.join(' › '));
  }
  el.pEyebrow.innerHTML = esc(crumb.join(' / ')) + ` <span>· 课件 P${esc(n.slide)}</span>`;
  el.pTitle.textContent = n.label;
  el.pSub.textContent = n.sub || n.brief || '';

  const bits = [`<p class="panel__text">${esc(n.body || n.brief || '')}</p>`];
  const tags = [`<span class="tag tag--c">${['母题', '章', '节', '点'][n.tier]}</span>`];
  /* 年份标签只给真正的时间锚点；b3-5 小结的 wave 仅用于取位，不是年代 */
  if (n.wave && n.id !== 'b3-5') tags.push(`<span class="tag tag--c">${n.wave.year}</span>`);
  if (n.milestone) tags.push(`<span class="tag tag--gold">◆ 里程碑</span>`);
  const kids = (CHILD[id] || []).filter(k => NODE[k]);
  if (kids.length) tags.push(`<span class="tag">展开 ${kids.length} 项</span>`);
  bits.push(`<div class="meta">${tags.join('')}</div>`);

  if (n.keys && n.keys.length) {
    bits.push(`<div class="panel__sect"><div class="panel__sect-h">关键词<i></i></div><div class="chips">${
      n.keys.map(k => `<span class="chip chip--kw">${esc(k)}</span>`).join('')}</div></div>`);
  }

  const rel = [];
  if (PARENT[id] && NODE[PARENT[id]]) rel.push([PARENT[id], col]);
  kids.forEach(k => rel.push([k, branchColor(NODE[k])]));
  CROSS_LINKS.forEach(([a, b]) => {
    if (a === id && NODE[b]) rel.push([b, '#FFD166']);
    if (b === id && NODE[a]) rel.push([a, '#FFD166']);
  });
  if (rel.length) {
    bits.push(`<div class="panel__sect"><div class="panel__sect-h">相邻知识点<i></i></div><div class="chips">${
      rel.map(([rid, c]) => `<button class="chip chip--link" data-goto="${esc(rid)}" style="--dc:${c}"><i></i>${esc(NODE[rid].label)}</button>`).join('')
    }</div></div>`);
  }
  const xs = CROSS_LINKS.filter(([a, b]) => a === id || b === id);
  if (xs.length) {
    bits.push(`<div class="panel__sect"><div class="panel__sect-h">为什么连线<i></i></div><div class="chips">${
      xs.map(([, , why]) => `<span class="chip chip--kw">${esc(why)}</span>`).join('')}</div></div>`);
  }

  el.pBody.innerHTML = bits.join('');
  el.pBody.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => go(b.dataset.goto)));
  el.pBody.scrollTop = 0;
  el.panel.classList.add('open');
  el.panel.setAttribute('aria-hidden', 'false');
}
function closePanel() { el.panel.classList.remove('open'); el.panel.setAttribute('aria-hidden', 'true'); }

function go(id, flyCam) {
  const n = NODE[id]; if (!n) return;
  if (!showLeaves && n.tier === 3) { showLeaves = true; syncToggles(); }
  if (isMobileUI() && el.hud.classList.contains('tools-open')) setTools(false);
  selected = id; activeBranch = null; syncBranchUI();
  applyFocus(neighbourhood(id));
  stems.forEach(ln => { ln.visible = (ln.userData.id === id); });
  openPanel(id);
  if (flyCam !== false) frameNode(id);
}
function deselect() {
  selected = null; activeBranch = null; syncBranchUI();
  stems.forEach(ln => ln.visible = false);
  clearFocus(); closePanel();
}
el.pClose.addEventListener('click', deselect);

/* ---- 搜索 ---- */
let hits = [];
function runSearch(q) {
  q = (q || '').trim().toLowerCase();
  hits = [];
  if (!q) {
    el.qhits.textContent = '';
    selected ? applyFocus(neighbourhood(selected)) : clearFocus();
    return;
  }
  NODES.forEach(n => {
    const hay = (n.label + ' ' + (n.sub || '') + ' ' + (n.brief || '') + ' ' + (n.body || '') + ' ' +
      (n.keys || []).join(' ') + ' ' + (n.slide || '')).toLowerCase();
    if (hay.indexOf(q) >= 0) hits.push(n.id);
  });
  el.qhits.textContent = String(hits.length);
  if (!hits.length) { clearFocus(); return; }
  applyFocus(new Set(hits.concat(['core'])));
  frameSet(hits.slice(0, 16), 1.25);
  const first = hits.find(h => NODE[h].tier <= 2) || hits[0];
  selected = first; openPanel(first);
}
let qTimer = null;
el.q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => runSearch(el.q.value), 160); });
el.q.addEventListener('keydown', e => {
  if (e.key === 'Enter' && hits.length) go(hits[0]);
  if (e.key === 'Escape') { el.q.value = ''; runSearch(''); el.q.blur(); }
});

/* ---- 顶部按钮 ---- */
function syncToggles() {
  el.btnLabels.setAttribute('aria-pressed', String(showLabels));
  el.btnLeaves.setAttribute('aria-pressed', String(showLeaves));
  el.btnLinks.setAttribute('aria-pressed', String(showCross));
  el.btnSpin.setAttribute('aria-pressed', String(spinning));
  controls.autoRotate = spinning && !RM;
  applyFocus(focusSet);
}
el.btnLabels.addEventListener('click', () => { showLabels = !showLabels; syncToggles(); });
el.btnLeaves.addEventListener('click', () => { showLeaves = !showLeaves; if (!showLeaves) showCross = false; syncToggles(); });
el.btnSpin.addEventListener('click', () => { spinning = !spinning; syncToggles(); });
el.btnLinks.addEventListener('click', () => {
  showCross = !showCross;
  if (showCross) { showLeaves = true; showLabels = true; }
  syncToggles();
});
el.btnReset.addEventListener('click', () => {
  tour.on && tourStop(true);
  deselect(); el.q.value = ''; el.qhits.textContent = ''; hits = [];
  showCross = false; spinning = false; showLeaves = true; showLabels = true;
  syncToggles();
  updateHome();
  goHome(900);
});
el.btnShot.addEventListener('click', snapshot);
el.btnHide.addEventListener('click', () => {
  el.hud.classList.toggle('hidden');
  const hidden = el.hud.classList.contains('hidden');
  el.status.classList.toggle('dim', hidden);
  el.btnHide.firstChild ? (el.btnHide.childNodes[0].nodeValue = hidden ? '显示' : '隐藏') : null;
});

/* ---- 手机/触摸端的工具抽屉 ---- */
const MOBILE_UI = '(max-width: 720px), (max-width: 1024px) and (pointer: coarse)';
const isMobileUI = () => window.matchMedia(MOBILE_UI).matches;
function setTools(open) {
  if (el.hud.classList.contains('tools-open') === open) return;
  el.hud.classList.toggle('tools-open', open);
  el.btnMenu.setAttribute('aria-expanded', String(open));
  el.btnMenu.textContent = open ? '收起' : '工具';
  el.btnMenu.setAttribute('aria-label', open ? '收起工具栏' : '展开工具栏');
  /* 抽屉占了上下安全区，取景要跟着让位 */
  requestAnimationFrame(() => { updateHome(); if (!userMoved && !selected && !tour.on) goHome(0); });
}
el.btnMenu.addEventListener('click', () => setTools(!el.hud.classList.contains('tools-open')));
el.tools.addEventListener('click', e => {
  /* 触屏上点完一个工具就收起来，别挡着图 */
  if (e.target.closest('.tool') && !e.target.closest('.search') && isMobileUI()) {
    setTimeout(() => setTools(false), 140);
  }
});

/* ---- 导出 PNG ---- */
function snapshot() {
  composer.render();
  const src = renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0);
  const s = cv.width / 1600, pad = 28 * s;
  g.textAlign = 'right'; g.textBaseline = 'bottom';
  g.font = `700 ${Math.round(26 * s)}px "Noto Serif SC","Songti SC",serif`;
  g.fillStyle = 'rgba(233,241,252,0.92)';
  g.fillText('神经网络简介', cv.width - pad, cv.height - pad - 24 * s);
  g.font = `400 ${Math.round(13 * s)}px "JetBrains Mono",Consolas,monospace`;
  g.fillStyle = 'rgba(148,170,196,0.78)';
  g.fillText('人工智能导论 · 第四章 · 第 7 讲 · 3D 知识图谱', cv.width - pad, cv.height - pad);
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png');
  a.download = '神经网络简介-知识图谱-' + new Date().toISOString().slice(0, 10) + '.png';
  document.body.appendChild(a); a.click(); a.remove();
  toast('已导出当前视角');
}
let toastTimer = null;
function toast(msg) {
  const node = el.stNodes, was = node.textContent;
  node.textContent = msg; node.style.color = '#9FE8FF';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.textContent = was; node.style.color = '';
    if (el.hud.classList.contains('hidden')) el.status.classList.add('dim');
  }, 2400);
}

/* ============================================================ 12. 导览 */
const tour = { on: false, i: 0, playing: true, t: 0, dur: RM ? 0 : 8200 };
function tourGo(i) {
  tour.i = clamp(i, 0, TOUR.length - 1);
  tour.t = 0;
  const st = TOUR[tour.i];
  el.tIdx.textContent = String(tour.i + 1).padStart(2, '0') + ' / ' + TOUR.length;
  el.tTitle.textContent = st.title;
  el.tNote.textContent = st.note;
  el.tProg.style.width = '0%';

  const set = new Set(['core']);
  st.focus.forEach(f => subtreeSet(f).forEach(x => set.add(x)));
  if (st.links) CROSS_LINKS.forEach(([a, b]) => { if (set.has(a) || set.has(b)) { set.add(a); set.add(b); } });
  if (st.links && !showCross) { showCross = true; showLeaves = true; showLabels = true; }
  selected = null; activeBranch = null; syncBranchUI();
  syncToggles();
  applyFocus(set);
  frameSet([...set].filter(x => items[x]), st.links ? 2.0 : 1.5);

  const anchor = st.focus.find(f => f !== 'core' && NODE[f] && NODE[f].tier <= 2) || 'core';
  openPanel(anchor);
}
function tourStart(i) {
  tour.on = true; tour.playing = !RM;
  el.tour.classList.add('open');
  el.hud.classList.add('touring');
  el.btnTour.setAttribute('aria-pressed', 'true');
  el.tPlay.setAttribute('aria-pressed', String(tour.playing));
  el.tPlay.textContent = tour.playing ? '暂停' : '播放';
  tourGo(i || 0);
}
function tourStop(silent) {
  tour.on = false;
  el.tour.classList.remove('open');
  el.hud.classList.remove('touring');
  el.btnTour.setAttribute('aria-pressed', 'false');
  deselect();
  if (showCross) { showCross = false; syncToggles(); }
  if (!silent) { updateHome(); goHome(900); }
}
el.btnTour.addEventListener('click', () => tour.on ? tourStop() : tourStart(0));
el.tNext.addEventListener('click', () => tourGo(tour.i + 1));
el.tPrev.addEventListener('click', () => tourGo(tour.i - 1));
el.tExit.addEventListener('click', () => tourStop());
el.tPlay.addEventListener('click', () => {
  tour.playing = !tour.playing;
  el.tPlay.setAttribute('aria-pressed', String(tour.playing));
  el.tPlay.textContent = tour.playing ? '暂停' : '播放';
});

/* ============================================================ 13. 指针 */
const dom = renderer.domElement;
function restoreFocus() {
  if (tour.on) return;
  if (selected) applyFocus(neighbourhood(selected));
  else if (activeBranch) applyFocus(branchSet(activeBranch));
  else clearFocus();
}
dom.addEventListener('pointerdown', e => {
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  dragMoved = false;
  dom.classList.add('dragging');
});
dom.addEventListener('pointermove', e => {
  if (pointerDown) {
    if (Math.abs(e.clientX - pointerDown.x) + Math.abs(e.clientY - pointerDown.y) > 5) dragMoved = true;
    el.tip.classList.remove('show');
    return;
  }
  const id = pickAt(e.clientX, e.clientY);
  if (id !== hovered) {
    hovered = id;
    if (id) {
      const n = NODE[id];
      el.tipT.textContent = n.label;
      el.tipB.textContent = n.brief || n.sub || '';
      el.tipK.textContent = (n.branch === 'core' ? '母题' : (BR[n.branch] ? BR[n.branch].no + ' · ' + BR[n.branch].name : ''))
        + (n.wave ? '   ' + n.wave.year : '') + (n.milestone ? '   ◆ 里程碑' : '');
      el.tip.style.setProperty('--c', branchColor(n));
    }
    if (!tour.on) { id ? applyFocus(neighbourhood(id)) : restoreFocus(); }
  }
  dom.classList.toggle('on-node', !!id);
  if (id) {
    const pad = 18, w = 292, h = el.tip.offsetHeight || 76;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 12) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 12) y = e.clientY - h - pad;
    el.tip.style.left = x + 'px';
    el.tip.style.top = y + 'px';
    el.tip.classList.add('show');
  } else {
    el.tip.classList.remove('show');
  }
});
dom.addEventListener('pointerup', e => {
  dom.classList.remove('dragging');
  const wasDrag = dragMoved || (pointerDown && performance.now() - pointerDown.t > 600);
  const pd = pointerDown; pointerDown = null;
  if (!pd || wasDrag) return;
  const id = pickAt(e.clientX, e.clientY);
  if (id) {
    if (tour.on) { tour.playing = false; el.tPlay.textContent = '播放'; el.tPlay.setAttribute('aria-pressed', 'false'); }
    go(id);
  } else if (!tour.on) {
    deselect();
  }
});
dom.addEventListener('pointerleave', () => {
  el.tip.classList.remove('show');
  hovered = null;
  restoreFocus();
});
dom.addEventListener('contextmenu', e => e.preventDefault());

/* ============================================================ 14. 键盘 */
window.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') {
    e.preventDefault();
    if (tour.on) { tour.playing = !tour.playing; el.tPlay.textContent = tour.playing ? '暂停' : '播放'; el.tPlay.setAttribute('aria-pressed', String(tour.playing)); }
    else tourStart(0);
  } else if (k === 'escape') {
    tour.on ? tourStop() : deselect();
  } else if (k === 'r') { el.btnReset.click(); }
  else if (k === 's') { e.preventDefault(); snapshot(); }
  else if (k === 'h') { el.btnHide.click(); }
  else if (k === 'l') { el.btnLabels.click(); }
  else if (k === 'k') { el.btnLinks.click(); }
  else if (k === '/') { e.preventDefault(); el.q.focus(); el.q.select(); }
  else if (tour.on && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault(); tourGo(tour.i + (e.key === 'ArrowRight' ? 1 : -1));
  }
});

/* ============================================================ 15. 年份标尺 */
(function ruler() {
  const W = 268, H = 26;
  const min = Math.min.apply(null, WAVE_PROFILE.map(p => p[1]));
  const max = Math.max.apply(null, WAVE_PROFILE.map(p => p[1]));
  const pts = waveTable.filter((_, i) => i % 6 === 0).map(s => {
    const x = ((s.p.x - X_MIN) / (X_MAX - X_MIN)) * W;
    const y = H - 3 - ((s.p.y - min) / (max - min)) * (H - 8);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  el.rulerPath.setAttribute('d', 'M' + pts.join(' L'));
  [[1943], [1969], [1986], [2012]].forEach(([yr]) => {
    const x = ((yearToX(yr) - X_MIN) / (X_MAX - X_MIN)) * 100;
    const d = document.createElement('div');
    d.className = 'ruler__medal'; d.style.left = x + '%'; d.title = String(yr);
    el.rulerTrack.appendChild(d);
    const t = document.createElement('div');
    t.className = 'ruler__label'; t.style.left = x + '%'; t.textContent = String(yr);
    el.rulerTrack.appendChild(t);
  });
  for (let y = 1940; y <= 2026; y += 10) {
    const t = document.createElement('div');
    t.className = 'ruler__tick';
    t.style.left = ((yearToX(y) - X_MIN) / (X_MAX - X_MIN)) * 100 + '%';
    el.rulerTrack.appendChild(t);
  }
})();

/* ============================================================ 16. 动画 */
const clock = new THREE.Clock();
let frames = 0, fpsT = 0;
const camFwd = new THREE.Vector3(), _d = new THREE.Vector3();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  /* 画幅变了 → 朝向与取景都要重算。手机上转屏就是这么触发的 */
  updateOrientation();
  updateHome();
  /* 首次布局直接摆正（别让页面一打开先转半圈）；之后转屏才走缓动 */
  if (!orientSnapped) { world.rotation.z = ORIENT.target; orientSnapped = true; }
  /* 用户还没自己动过镜头、也没选中任何东西时，跟着新的画幅回家 */
  if (!userMoved && !selected && !tour.on) goHome(0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

function updateLabels() {
  const dcam = camera.position.distanceTo(controls.target);
  const cam = camera.position;
  camFwd.subVectors(controls.target, cam).normalize();
  updateLabelAxes();
  /* 阈值随全览景深缩放；窄画幅或矮画幅再收紧一档 */
  const tight = tightView();
  const l2 = L.LOD[2], l3 = L.LOD[3];
  const k2 = tight ? L.LOD_TIGHT[2] : 1, k3 = tight ? L.LOD_TIGHT[3] : 1;
  const d2 = refDepth * l2[0] * k2, r2 = refDepth * l2[1] * k2;
  const d3 = refDepth * l3[0] * k3, r3 = refDepth * l3[1] * k3;
  Object.keys(items).forEach(id => {
    const it = items[id], n = it.node, lab = it.label;
    if (!showLabels || !it.mesh.visible) { lab.visible = false; return; }
    const f = it.mat.uniforms.uOpacity.value / (it.base || 1);
    if (f < 0.25) { lab.visible = false; return; }
    const hot = (selected === id || hovered === id);
    const d = cam.distanceTo(it.pos);
    let vis;
    if (n.tier === 3) vis = hot || (dcam < d3 && d < r3);
    else if (n.tier === 2) vis = hot || dcam < d2 || d < r2;
    else vis = true;
    lab.visible = vis;
    if (vis) {
      lab.material.opacity = 0.92 * clamp(f, 0, 1);
      /* 真实景深决定世界尺寸；软化后的景深只决定字号，
         这样前后排的字不会一个胀到 40px、一个缩成 8px。 */
      _d.subVectors(it.pos, cam);
      const zTrue = Math.max(1, _d.dot(camFwd));
      const zSoft = dcam * 0.72 + zTrue * 0.28;
      sizeLabel(it, zTrue, refDepth / Math.max(1, zSoft), hot);
    }
  });
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (fly) {
    fly.t += dt * 1000;
    const k = clamp(fly.t / fly.d, 0, 1), e = easeIO(k);
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) fly = null;
  }

  ribMats.forEach(r => { r.mat.uniforms.uTime.value = t; });
  if (!RM) updateFlow(t);

  /* 朝向（桌面 0°，竖屏 -90°）缓动到位 */
  if (Math.abs(world.rotation.z - ORIENT.target) > 1e-4) {
    world.rotation.z = RM ? ORIENT.target
      : world.rotation.z + (ORIENT.target - world.rotation.z) * Math.min(1, dt * 8);
  }

  if (items.core.shells) items.core.shells.forEach(s => {
    s.rotation.y += dt * s.userData.spin;
    s.rotation.x += dt * s.userData.spin * 0.42;
  });
  Object.keys(items).forEach(id => {
    const it = items[id];
    if (it.ring && it.ring.visible) {
      it.ring.rotation.z += dt * it.ring.userData.spin * 0.6;
      it.ring.rotation.y += dt * it.ring.userData.spin * 0.25;
    }
    if (it.node.tier <= 1 && it.mesh.visible) {
      it.mesh.scale.setScalar(1 + Math.sin(t * 0.85 + it.pos.x * 0.03) * 0.028);
    }
  });

  controls.update();
  updateLabels();

  if (tour.on && tour.playing && tour.dur > 0) {
    tour.t += dt * 1000;
    el.tProg.style.width = clamp(tour.t / tour.dur, 0, 1) * 100 + '%';
    if (tour.t >= tour.dur) {
      if (tour.i < TOUR.length - 1) tourGo(tour.i + 1);
      else {
        tour.playing = false;
        el.tPlay.textContent = '播放'; el.tPlay.setAttribute('aria-pressed', 'false');
        el.tProg.style.width = '100%';
      }
    }
  }

  composer.render();

  frames++; fpsT += dt;
  if (fpsT > 1) { el.stFps.textContent = Math.round(frames / fpsT) + ' fps'; frames = 0; fpsT = 0; }
}

/* ============================================================ 17. 启动 */
el.stNodes.textContent = String(NODES.length);
/* 报"逻辑关系数"而不是绘制段数：树边 + 跨章节关联 */
el.stLinks.textContent = String(
  Object.keys(CHILD).reduce((a, p) => a + CHILD[p].filter(c => NODE[c]).length, 0) + crossLines.length
);

let vp = 0;
const vT = setInterval(() => {
  vp = Math.min(100, vp + 14 + Math.random() * 22);
  el.veilBar.style.width = vp + '%';
  if (vp >= 100) clearInterval(vT);
}, 80);

function boot() {
  tick();
  setTimeout(() => {
    el.veilBar.style.width = '100%';
    el.veil.classList.add('gone');
    setTimeout(() => { if (el.veil.parentNode) el.veil.remove(); }, 900);
  }, 480);
  /* 字体到位后重画标签，宋体才不会掉成回退字形 */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      labelCache.clear();
      Object.keys(items).forEach(id => {
        const it = items[id], old = it.label;
        const fresh = labelSprite(it.node);
        fresh.position.copy(old.position);
        nodeGroup.remove(old);
        if (old.material.map) old.material.map.dispose();
        old.material.dispose();
        nodeGroup.add(fresh);
        it.label = fresh;
        const lm = fresh.userData.label;
        it.glyphRatio = lm.glyphRatio;
        it.labelAspect = lm.aspect;
      });
      updateLabels();     // 换过贴图要立刻按当前景深重新摆位，否则会闪一帧原始尺寸
    });
  }
}
boot();

window.__GRAPH__ = {
  scene, world, camera, controls, go, tourStart, tourStop, applyFocus, NODES, pos, items,
  /* 供构图/清晰度校验脚本取样 */
  ribbon: waveTable.filter((_, i) => i % 8 === 0).map(s => [s.p.x, s.p.y, s.p.z]),
  home: [homePos().toArray(), homeTarget().toArray()],
  fitDir: FIT_DIR.toArray(),
  allPts: () => ALL_PTS.length,
  refreshLabels: updateLabels,
  goHome, updateHome, updateOrientation, portrait,
  state: () => ({
    refDepth, homeDist, portrait: portrait(), tight: tightView(), orient: ORIENT.target, aspect: camera.aspect,
    insetTop: uiInsetTop(), insetBottom: uiInsetBottom(), canvasH: renderer.domElement.clientHeight
  }),
  L, SS, dpr: window.devicePixelRatio || 1
};

})();
