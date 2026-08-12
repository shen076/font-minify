import test from "node:test";
import assert from "node:assert/strict";

import { getUnicodeSubset } from "./compress-font";

/** 统计所有 Unicode 规格中落在 U+4E00-9FFF 的码点总数 */
function countHanzi(unicodes: string[]): number {
  let count = 0;
  for (const spec of unicodes) {
    const match = /^U\+([0-9A-F]{4,6})(?:-([0-9A-F]{4,6}))?$/.exec(spec);
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    if (start >= 0x4e00 && end <= 0x9fff) count += end - start + 1;
  }
  return count;
}

/** 判断某个码点是否被 Unicode 规格覆盖 */
function covers(unicodes: string[], codePoint: number): boolean {
  return unicodes.some((spec) => {
    const match = /^U\+([0-9A-F]{4,6})(?:-([0-9A-F]{4,6}))?$/.exec(spec);
    if (!match) return false;
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    return codePoint >= start && codePoint <= end;
  });
}

test("默认模式保留 ASCII 和核心标点", () => {
  const subset = getUnicodeSubset(false, false);

  assert.ok(subset.unicodes.includes("U+0020-007E"));
  assert.ok(subset.unicodes.includes("U+00A0-00FF"));
  assert.ok(subset.unicodes.includes("U+2000-206F"));
  assert.ok(subset.unicodes.includes("U+3000-303F"));
  assert.ok(subset.unicodes.includes("U+FF00-FFEF"));
});

test("默认模式汉字为 GB2312 ∪ Big5 常用区，不整体保留主区", () => {
  const subset = getUnicodeSubset(false, false);

  assert.equal(subset.unicodes.includes("U+4E00-9FFF"), false);

  // 覆盖常用简体（GB2312）与常用繁体（Big5 常用区）
  assert.ok(covers(subset.unicodes, 0x6c49), "应包含 汉（GB2312 常用简体）");
  assert.ok(covers(subset.unicodes, 0x9ad4), "应包含 體（Big5 常用繁体）");
  assert.ok(covers(subset.unicodes, 0x6f22), "应包含 漢（Big5 常用繁体）");

  // 不保留次常用区，龘等生僻字被排除
  assert.equal(covers(subset.unicodes, 0x9f98), false, "不应包含 龘（Big5 次常用区生僻字）");
  assert.equal(covers(subset.unicodes, 0x9fa5), false, "不应包含 龥（主区生僻字）");

  const count = countHanzi(subset.unicodes);
  assert.ok(
    count >= 8500 && count <= 9200,
    `常用汉字并集数量异常: ${count}`,
  );
});

test("默认模式排除易乱码区间", () => {
  const subset = getUnicodeSubset(false, false);

  const excludedRanges = [
    "U+2E80-2EFF", // CJK 部首补充
    "U+2F00-2FDF", // 康熙部首
    "U+3100-312F", // 注音符号
    "U+31A0-31BF", // 注音符号扩展
    "U+F900-FAFF", // CJK 兼容汉字
    "U+FE10-FE1F", // 竖排变体标点
    "U+FE30-FE4F", // CJK 兼容形式
    "U+FE50-FE6F", // 小形式变体
  ];

  for (const range of excludedRanges) {
    assert.equal(subset.unicodes.includes(range), false, `${range} 应被排除`);
  }
});

test("nomarks 在默认模式剔除标点", () => {
  const subset = getUnicodeSubset(false, true);

  assert.equal(subset.unicodes.includes("U+2000-206F"), false);
  assert.equal(subset.unicodes.includes("U+3000-303F"), false);
  assert.equal(subset.unicodes.includes("U+FF00-FFEF"), false);
  assert.ok(subset.unicodes.includes("U+0020"));
  assert.ok(subset.unicodes.includes("U+0030-0039"));
  assert.ok(subset.unicodes.includes("U+0041-005A"));
  assert.ok(subset.unicodes.includes("U+0061-007A"));
  assert.ok(countHanzi(subset.unicodes) >= 8500);
});

test("gb2312 模式仅保留真实 GB2312 码表 6,763 字", () => {
  const subset = getUnicodeSubset(true, false);

  assert.ok(subset.unicodes.includes("U+0020-007E"));
  assert.ok(subset.unicodes.includes("U+2000-206F"));
  assert.equal(countHanzi(subset.unicodes), 6763);
});

test("nomarks 在 gb2312 模式剔除标点", () => {
  const subset = getUnicodeSubset(true, true);

  assert.equal(subset.unicodes.includes("U+2000-206F"), false);
  assert.equal(subset.unicodes.includes("U+3000-303F"), false);
  assert.equal(subset.unicodes.includes("U+FE30-FE4F"), false);
  assert.ok(subset.unicodes.includes("U+0020"));
  assert.ok(subset.unicodes.includes("U+0030-0039"));
  assert.ok(subset.unicodes.includes("U+0041-005A"));
  assert.ok(subset.unicodes.includes("U+0061-007A"));
  assert.equal(countHanzi(subset.unicodes), 6763);
});
