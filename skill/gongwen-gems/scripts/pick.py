#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gongwen-gems 确定性取句器（v5.0）

只输出 references/gems.md 库内的真实句子，绝不生成新句——
从机制上杜绝 LLM 写作时编造"听起来像"的金句。

用法示例：
  python3 scripts/pick.py --class C --strength S1,S2 --count 3
  python3 scripts/pick.py --class A,B --count 2
  python3 scripts/pick.py --class C --exclude-cluster C-清单 --count 2
  python3 scripts/pick.py --list-classes
  python3 scripts/pick.py --list-clusters --class C

退出码：0=有输出；1=无匹配；2=参数或解析错误
"""
import argparse
import re
import sys
from collections import Counter
from pathlib import Path

DEFAULT_LIB = Path(__file__).resolve().parent.parent / "references" / "gems.md"
ENTRY_RE = re.compile(r"^(\d+)\.\s+\*\*(.+?)\*\*\s*〔(.+?)〕")
CLASS_RE = re.compile(r"^(A|B|C2?|D|E)")


def norm_class(value):
    m = CLASS_RE.match(value.strip())
    return m.group(1) if m else value.strip()


def parse(lib_path):
    entries = []
    for line in lib_path.read_text(encoding="utf-8").splitlines():
        m = ENTRY_RE.match(line.strip())
        if not m:
            continue
        num, sentence, meta = int(m.group(1)), m.group(2), m.group(3)
        fields = {}
        for part in meta.split("｜"):
            part = part.strip()
            if not part:
                continue
            if "：" in part:
                key, val = part.split("：", 1)
            elif ":" in part:
                key, val = part.split(":", 1)
            else:
                key, val = "", part
            fields[key.strip()] = val.strip()
        entries.append({
            "num": num,
            "sentence": sentence,
            "class": norm_class(fields.get("类", "")),
            "cluster": fields.get("簇", ""),
            "strength": fields.get("强度", ""),
            "slot": fields.get("槽位", ""),
            "apply": fields.get("适用", ""),
        })
    return entries


def main():
    ap = argparse.ArgumentParser(description="gongwen-gems 确定性取句器（只输出库内真句）")
    ap.add_argument("--lib", default=str(DEFAULT_LIB), help="句库路径（默认 skill 内 references/gems.md）")
    ap.add_argument("--class", dest="classes", default="", help="按类过滤，逗号分隔：A,B,C,C2,D,E")
    ap.add_argument("--strength", default="", help="按强度过滤，逗号分隔：S1,S2,S3")
    ap.add_argument("--exclude-cluster", default="", help="排除簇，逗号分隔（同段限1句时剔除已用簇）")
    ap.add_argument("--count", type=int, default=3, help="输出条数上限（默认 3）")
    ap.add_argument("--list-classes", action="store_true", help="列出各类别与句数")
    ap.add_argument("--list-clusters", action="store_true", help="列出簇分布（可与 --class 组合）")
    args = ap.parse_args()

    lib = Path(args.lib)
    if not lib.exists():
        print(f"✗ 句库不存在：{lib}", file=sys.stderr)
        return 2
    entries = parse(lib)
    if not entries:
        print("✗ 句库解析失败（未匹配到条目行）", file=sys.stderr)
        return 2

    classes = [c.strip() for c in args.classes.split(",") if c.strip()]
    strengths = [s.strip() for s in args.strength.split(",") if s.strip()]
    exclude = [c.strip() for c in args.exclude_cluster.split(",") if c.strip()]

    if args.list_classes:
        counter = Counter(e["class"] for e in entries)
        print(f"共 {len(entries)} 句：")
        for cls in ["A", "B", "C", "C2", "D", "E"]:
            print(f"  {cls:<3} {counter.get(cls, 0):>3} 句")
        return 0

    if args.list_clusters:
        seen = {}
        for e in entries:
            if classes and e["class"] not in classes:
                continue
            seen.setdefault(e["cluster"], []).append(e["num"])
        print("簇分布（簇名 → 句号）：")
        for cluster, nums in sorted(seen.items()):
            print(f"  {cluster:<12} → {'、'.join(map(str, nums))}")
        return 0

    picked = []
    for e in entries:
        if classes and e["class"] not in classes:
            continue
        if strengths and e["strength"] not in strengths:
            continue
        if exclude and e["cluster"] in exclude:
            continue
        picked.append(e)

    if not picked:
        print("✗ 无匹配句子，请放宽 类/强度/簇 条件", file=sys.stderr)
        return 1

    shown = picked[: args.count]
    print(f"── 取句结果（{len(shown)}/{len(picked)} 条匹配）────────────────")
    for e in shown:
        print(f"#{e['num']}. {e['sentence']}")
        print(f"    类:{e['class']} ｜ 簇:{e['cluster']} ｜ 强度:{e['strength']} ｜ 槽位:{e['slot']}")
        print(f"    适用:{e['apply']}")
    print("────────────────────────────────────────────")
    print("提示：槽位必须用用户本轮输入中的实词填实，填不满请放弃该句；")
    print("同簇同段限用 1 句（E 类除外）；引用句须改写≥20%或仅借逻辑骨架。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
