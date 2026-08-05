#!/usr/bin/env node
/**
 * gongwen-gems 句库校验脚本（commit 前必跑）
 *
 * 检查项：
 *  1. 序号连续（1..N 无缺号、无重号）
 *  2. 字段协议完整（类｜簇｜强度｜槽位｜适用 五字段齐全）
 *  3. 类/强度取值合法（A/B/C/C2/D/E；S0-S3，E 类强度恒 S3）
 *  4. 槽位语法统一（{#槽位} 成对出现，无残留旧式 {占位符}）
 *  5. 正反例配对（每条至少各 1 个 ✅/❌，E 类除外）
 *  6. 数据隔离声明存在
 *  7. 簇一致性（同簇句子跨类检查）
 *  8. skill 副本与权威句库一致（skill/gongwen-gems/references/gems.md）
 *
 * 用法：node tools/validate.js [path/to/gems.md]
 * 退出码：0 = 通过；1 = 有错误
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'gems.md');
const text = fs.readFileSync(file, 'utf8');

const errors = [];
const warnings = [];

// ── 8. skill 副本一致性 ──────────────────────────────────
const skillCopy = path.join(__dirname, '..', 'skill', 'gongwen-gems', 'references', 'gems.md');
if (fs.existsSync(skillCopy)) {
  if (fs.readFileSync(skillCopy, 'utf8') !== text) {
    errors.push('skill 副本与权威句库不一致：运行 node tools/sync-skill.js 同步');
  }
} else {
  errors.push('缺少 skill 副本：skill/gongwen-gems/references/gems.md（运行 node tools/sync-skill.js）');
}

// ── 块级解析：条目行 + 其后的示例行（直到下一条目/章节标题） ──
const lines = text.split(/\r?\n/);
const entries = [];
let cur = null;

const stripLabel = (s) => {
  const m = s.match(/^([^:：]+)[:：]\s*(.*)$/);
  return m ? m[2].trim() : s.trim();
};

for (const line of lines) {
  const m = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*〔(.+?)〕/);
  if (m) {
    if (cur) entries.push(cur);
    cur = { num: parseInt(m[1]), sentence: m[2], meta: m[3], block: [line] };
  } else if (cur) {
    if (/^#{1,6}\s/.test(line)) { entries.push(cur); cur = null; } // 新章节标题
    else cur.block.push(line);
  }
}
if (cur) entries.push(cur);

if (entries.length === 0) {
  console.error('✗ 未解析到任何句条目（格式应为：序号. **句子** 〔字段〕）');
  process.exit(1);
}

// ── 1. 序号连续 ──────────────────────────────────────────
const nums = entries.map(e => e.num).sort((a, b) => a - b);
for (let i = 0; i < nums.length; i++) {
  if (nums[i] !== i + 1) {
    errors.push(`序号不连续：期望 ${i + 1}，实际 ${nums[i]}（第 ${i + 1} 条）`);
    break;
  }
}
const dupNums = nums.filter((n, i) => nums.indexOf(n) !== i);
if (dupNums.length) errors.push(`序号重复：${[...new Set(dupNums)].join(', ')}`);

// ── 2/3. 字段协议 ────────────────────────────────────────
const VALID_CLASS = ['A', 'B', 'C', 'C2', 'D', 'E'];
const VALID_STRENGTH = ['S0', 'S1', 'S2', 'S3'];
const clusterClasses = {};

// 字段值自带标签（如 类:A破题定调）——提取首码/首标记
const codeOf = (s) => {
  // 类：A / B / C / C2 / D / E（在 "A破题定调" 中提取 A）
  const cm = s.match(/^(A|B|C2?|D|E)/);
  if (cm) return cm[1];
  // 强度：S0-S3
  const sm = s.match(/^(S[0-3])/);
  if (sm) return sm[1];
  return s;
};

for (const e of entries) {
  const parts = e.meta.split('｜').map(p => p.trim());
  if (parts.length < 5) {
    errors.push(`#${e.num} 字段不足（期望 ≥5 个，实际 ${parts.length}）：${e.meta}`);
    continue;
  }
  const cls = codeOf(stripLabel(parts[0]));
  const cluster = stripLabel(parts[1]);
  const strength = codeOf(stripLabel(parts[2]));
  const slot = stripLabel(parts[3]);
  const apply = stripLabel(parts[4]);

  if (!VALID_CLASS.includes(cls)) errors.push(`#${e.num} 类非法：${cls}`);
  if (!VALID_STRENGTH.includes(strength)) errors.push(`#${e.num} 强度非法：${strength}`);
  if (cls === 'E' && strength !== 'S3') errors.push(`#${e.num} E类强度必须为S3，实际 ${strength}`);
  if (!cluster) errors.push(`#${e.num} 缺少簇字段`);
  if (!slot) errors.push(`#${e.num} 缺少槽位字段`);
  if (!apply) errors.push(`#${e.num} 缺少适用字段`);

  // ── 4. 槽位语法 ────────────────────────────────────────
  const braces = e.sentence.match(/\{([^}]*)\}/g) || [];
  for (const b of braces) {
    if (!b.startsWith('{#')) errors.push(`#${e.num} 槽位语法错误（应为 {#槽位}）：${b}`);
    if (b === '{#}') errors.push(`#${e.num} 空槽位：{#}`);
  }
  const legacy = e.sentence.match(/\{[^#][^}]*\}/);
  if (legacy) errors.push(`#${e.num} 残留旧式占位符：${legacy[0]}`);

  // ── 5. 正反例配对（E 类除外） ─────────────────────────
  if (cls !== 'E') {
    const block = e.block.join('\n');
    if (!/✅/.test(block)) errors.push(`#${e.num} 缺少 ✅ 正例`);
    if (!/❌/.test(block)) errors.push(`#${e.num} 缺少 ❌ 反例`);
  }

  // ── 簇跨类统计 ─────────────────────────────────────────
  if (cluster) {
    if (!clusterClasses[cluster]) clusterClasses[cluster] = new Set();
    clusterClasses[cluster].add(cls);
  }
}

// ── 6. 数据隔离声明 ──────────────────────────────────────
if (!text.includes('演示数据')) {
  errors.push('缺少数据隔离声明（应包含"演示数据"字样）');
}

// ── 7. 簇一致性 ──────────────────────────────────────────
for (const [cluster, classes] of Object.entries(clusterClasses)) {
  if (classes.size > 1) warnings.push(`簇 ${cluster} 跨多个类：${[...classes].join(', ')}（确认是否合理）`);
}

// ── 汇总 ─────────────────────────────────────────────────
console.log(`句条目：${entries.length} 条`);
console.log(`字段错误：${errors.length} 项，警告：${warnings.length} 项`);

if (warnings.length) {
  console.log('\n⚠️ 警告：');
  warnings.forEach(w => console.log('  - ' + w));
}
if (errors.length) {
  console.log('\n✗ 错误：');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}
console.log('\n✓ 校验通过：序号连续、五字段齐全、类/强度合法、槽位语法正确、正反例配对、数据隔离声明存在');
