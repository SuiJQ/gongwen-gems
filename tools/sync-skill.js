#!/usr/bin/env node
/**
 * gongwen-gems 句库同步脚本（v5.0）
 *
 * 根目录 gems.md 是唯一权威数据源；skill 包内的 references/gems.md 是自包含副本。
 * 每次修改根目录句库后运行本脚本同步副本，并校验一致性：
 *
 *   node tools/sync-skill.js            # 同步 + 校验
 *   node tools/sync-skill.js --check    # 仅校验，不写入
 *
 * 退出码：0 = 一致；1 = 不一致（--check 时）或同步完成
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'gems.md');
const DST = path.join(ROOT, 'skill', 'gongwen-gems', 'references', 'gems.md');

const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(SRC)) {
  console.error(`✗ 权威句库不存在：${SRC}`);
  process.exit(1);
}

const src = fs.readFileSync(SRC, 'utf8');
const dst = fs.existsSync(DST) ? fs.readFileSync(DST, 'utf8') : null;

if (dst === src) {
  console.log('✓ 一致：根目录 gems.md 与 skill 副本完全相同');
  process.exit(0);
}

if (checkOnly) {
  console.error('✗ 不一致：skill 副本与根目录 gems.md 有差异（运行 node tools/sync-skill.js 同步）');
  process.exit(1);
}

fs.writeFileSync(DST, src);
console.log(`✓ 已同步：gems.md → skill/gongwen-gems/references/gems.md（${Buffer.byteLength(src)} 字节）`);
process.exit(0);
