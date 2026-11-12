/* 数据完整性检查：每个节点都必须挂到树上、每条边都必须指向真实节点。
   这类错误在三维图里很难用眼睛发现（少几个点看不出来），但会静默丢内容。
   node datacheck.mjs                                                          */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'src', 'data.js'), 'utf8');
const g = {};
new Function('g', 'with(g){' + src + '; g.NODES=NODES; g.TREE=TREE; g.CROSS_LINKS=CROSS_LINKS; g.BRANCHES=BRANCHES; g.TOUR=TOUR;}')(g);
const { NODES, TREE, CROSS_LINKS, BRANCHES, TOUR } = g;

const problems = [];
const ids = new Set(NODES.map(n => n.id));

/* 1. id 唯一 */
const seen = new Set();
NODES.forEach(n => { if (seen.has(n.id)) problems.push('重复 id: ' + n.id); seen.add(n.id); });

/* 2. 每个节点（母题除外）都必须有父边 */
const child = new Set();
Object.keys(TREE).forEach(p => TREE[p].forEach(c => child.add(c)));
NODES.forEach(n => { if (n.id !== 'core' && !child.has(n.id)) problems.push('没有父边，不会被渲染: ' + n.id); });

/* 3. 每条边都必须指向存在的节点 */
Object.keys(TREE).forEach(p => {
  if (!ids.has(p)) problems.push('树的键不是节点: ' + p);
  TREE[p].forEach(c => { if (!ids.has(c)) problems.push('边指向不存在的节点: ' + p + ' -> ' + c); });
});

/* 4. 只有一个根 */
const roots = NODES.filter(n => n.id !== 'core' && !child.has(n.id)).length;
if (roots) problems.push('游离节点 ' + roots + ' 个');

/* 5. 跨章节关联两端都要存在 */
CROSS_LINKS.forEach(([a, b]) => {
  if (!ids.has(a)) problems.push('关联指向不存在的节点: ' + a);
  if (!ids.has(b)) problems.push('关联指向不存在的节点: ' + b);
});

/* 6. 导览引用的节点都要存在 */
TOUR.forEach((t, i) => t.focus.forEach(f => {
  if (!ids.has(f)) problems.push('导览第 ' + (i + 1) + ' 站引用不存在的节点: ' + f);
}));

/* 7. 必填字段 */
NODES.forEach(n => {
  ['id', 'label', 'tier', 'branch', 'slide'].forEach(k => {
    if (n[k] === undefined || n[k] === '') problems.push(n.id + ' 缺字段 ' + k);
  });
  if (n.tier >= 2 && !n.body && !n.brief) problems.push(n.id + ' 既没有 body 也没有 brief');
  /* band 节点必须带 wave（按年份落在制度浪潮曲线上） */
  if (n.band && !n.wave) problems.push(n.id + ' 属于浪潮簇但没有 wave，会落在原点');
});

/* 8. 层级连续性：子节点层级应为父 + 1 */
Object.keys(TREE).forEach(p => {
  const pn = NODES.find(n => n.id === p); if (!pn) return;
  TREE[p].forEach(c => {
    const cn = NODES.find(n => n.id === c); if (!cn) return;
    if (cn.tier !== pn.tier + 1) problems.push(`层级不连续: ${p}(tier${pn.tier}) -> ${c}(tier${cn.tier})`);
  });
});

/* 汇总 */
const byBranch = {};
NODES.forEach(n => { byBranch[n.branch] = (byBranch[n.branch] || 0) + 1; });
const edges = Object.keys(TREE).reduce((a, p) => a + TREE[p].length, 0);

console.log('节点 ' + NODES.length + '   树边 ' + edges + '   跨章节关联 ' + CROSS_LINKS.length +
  '   关系合计 ' + (edges + CROSS_LINKS.length) + '   导览 ' + TOUR.length + ' 站');
console.log('分层: ' + [0, 1, 2, 3].map(t => 'tier' + t + '=' + NODES.filter(n => n.tier === t).length).join('  '));
console.log('分簇: ' + ['core'].concat(BRANCHES.map(b => b.id))
  .map(b => (b === 'core' ? '母题' : BRANCHES.find(x => x.id === b).no + BRANCHES.find(x => x.id === b).name) + '=' + (byBranch[b] || 0))
  .join('  '));

console.log(problems.length ? '\n发现 ' + problems.length + ' 个问题:\n  - ' + problems.join('\n  - ') : '\n数据完整性检查通过');
process.exit(problems.length ? 1 : 0);
