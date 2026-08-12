/**
 * compress-font.ts
 *
 * 将 OTF/TTF 压缩为 WOFF2 子集，保留常用简/繁体中文 + ASCII + 标点符号，
 * 不包含康熙部首、注音符号、兼容汉字等容易显得「乱码」的区间。
 * 默认汉字集为运行时真实码表生成：
 * GB2312（常用简体 6,763 字）∪ Big5 常用区（常用繁体 5,401 字）。
 * 底层依赖 Python fonttools（首次运行时会尝试自动安装）。
 *
 * 用法:
 *   npx tsx compress-font.ts <字体文件>                    # 常用简/繁体汉字模式（GB2312 ∪ Big5 常用区，无乱码区间）
 *   npx tsx compress-font.ts <字体文件> --gb2312            # 仅 GB2312 字符范围（简体为主）
 *   npx tsx compress-font.ts <字体文件> --nomarks           # 剔除标点符号
 *   npx tsx compress-font.ts <字体文件> --gb2312 --nomarks  # GB2312 + 剔除标点符号
 */

import { execFileSync, execSync } from "child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Unicode 区间定义
// ---------------------------------------------------------------------------

/**
 * 默认常用模式：只保留网页正文需要的 ASCII、Latin-1 和标点区间。
 * 汉字不整体保留 U+4E00-9FFF 主区（会混入大量生僻字），
 * 而是由 GB2312 ∪ Big5 真实码表运行时生成（见 getCommonHanzi）。
 */
type UnicodeDisplayRange = [string, string];

type UnicodeSubset = {
  unicodes: string[];
  displayRanges: UnicodeDisplayRange[];
};

const RANGES_COMMON_BASE: UnicodeDisplayRange[] = [
  ["U+0020-007E", "ASCII 可打印字符"],
  ["U+00A0-00FF", "Latin-1 补充（带音调拉丁字母等）"],
  ["U+2000-206F", "通用标点（引号、破折号等）"],
  ["U+3000-303F", "CJK 符号和标点（全角句号、书名号等）"],
  ["U+FF00-FFEF", "全角/半角形式（全角标点等）"],
];

const RANGES_COMMON_NOMARKS_BASE: UnicodeDisplayRange[] = [
  ["U+0020", "空格"],
  ["U+0030-0039", "ASCII 数字"],
  ["U+0041-005A", "ASCII 大写字母"],
  ["U+0061-007A", "ASCII 小写字母"],
  ["U+00C0-00D6", "Latin-1 字母"],
  ["U+00D8-00F6", "Latin-1 字母"],
  ["U+00F8-00FF", "Latin-1 字母"],
  ["U+FF10-FF19", "全角数字"],
  ["U+FF21-FF3A", "全角大写字母"],
  ["U+FF41-FF5A", "全角小写字母"],
];

/**
 * GB2312 精简模式：GB2312 主范围内的 CJK 字符，
 * 不含部分扩展繁体字及现代新字。
 */
const RANGES_GB2312_BASE: UnicodeDisplayRange[] = [
  ["U+0020-007E", "ASCII 可打印字符"],
  ["U+00A0-00FF", "Latin-1 补充"],
  ["U+2000-206F", "通用标点"],
  ["U+3000-303F", "CJK 符号和标点"],
  ["U+FE30-FE4F", "CJK 兼容形式"],
  ["U+FF00-FFEF", "全角/半角形式"],
];

const RANGES_GB2312_NOMARKS_BASE: UnicodeDisplayRange[] = [
  ["U+0020", "空格"],
  ["U+0030-0039", "ASCII 数字"],
  ["U+0041-005A", "ASCII 大写字母"],
  ["U+0061-007A", "ASCII 小写字母"],
  ["U+00C0-00D6", "Latin-1 字母"],
  ["U+00D8-00F6", "Latin-1 字母"],
  ["U+00F8-00FF", "Latin-1 字母"],
  ["U+FF10-FF19", "全角数字"],
  ["U+FF21-FF3A", "全角大写字母"],
  ["U+FF41-FF5A", "全角小写字母"],
];

type CommonHanzi = {
  specs: string[];
  totalCount: number;
  gb2312Count: number;
  big5Count: number;
};

let gb2312CodePointsCache: Set<number> | null = null;
let big5CodePointsCache: Set<number> | null = null;
let gb2312HanziSpecsCache: string[] | null = null;
let commonHanziCache: CommonHanzi | null = null;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function fmt(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fmtCodePoint(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, "0");
}

function formatUnicodeRange(start: number, end: number): string {
  if (start === end) return `U+${fmtCodePoint(start)}`;
  return `U+${fmtCodePoint(start)}-${fmtCodePoint(end)}`;
}

function createFatalDecoder(encoding: string): TextDecoder {
  try {
    return new TextDecoder(encoding, { fatal: true });
  } catch {
    throw new Error(
      `当前 Node.js 环境不支持 ${encoding} 解码，无法生成真实汉字码表。请使用官方 Node.js 18+ 版本。`,
    );
  }
}

/**
 * 收集 GB2312 真实双字节码表中的 CJK 主区汉字（6,763 字，常用简体）。
 */
function collectGb2312CodePoints(): Set<number> {
  if (gb2312CodePointsCache) {
    return gb2312CodePointsCache;
  }

  const decoder = createFatalDecoder("gbk");
  const codePoints = new Set<number>();

  for (let highByte = 0xa1; highByte <= 0xf7; highByte++) {
    for (let lowByte = 0xa1; lowByte <= 0xfe; lowByte++) {
      try {
        const char = decoder.decode(Uint8Array.from([highByte, lowByte]));
        const codePoint = char.codePointAt(0);

        if (codePoint && codePoint >= 0x4e00 && codePoint <= 0x9fff) {
          codePoints.add(codePoint);
        }
      } catch {
        // 无效字节对直接跳过。
      }
    }
  }

  if (codePoints.size !== 6763) {
    throw new Error(
      `生成的 GB2312 汉字数量异常: ${codePoints.size}，预期 6763。`,
    );
  }

  gb2312CodePointsCache = codePoints;
  return codePoints;
}

/**
 * 收集 Big5 常用区（0xA440-0xC67E，5,401 字）中的 CJK 主区汉字（常用繁体）。
 * 不收集次常用区（0xC940-0xF9D5，含龘等生僻字）、符号区（0xA1-0xA3）
 * 与造字区（0xC6A1-0xC8FE），映射到主区之外的字自然被排除。
 */
function collectBig5CodePoints(): Set<number> {
  if (big5CodePointsCache) {
    return big5CodePointsCache;
  }

  const decoder = createFatalDecoder("big5");
  const codePoints = new Set<number>();

  // Big5 常用区：0xA440-0xC67E（首行 0xA4 从 0x40 起，末行 0xC6 到 0x7E 止）
  for (let highByte = 0xa4; highByte <= 0xc6; highByte++) {
    for (let lowByte = 0x40; lowByte <= 0xfe; lowByte++) {
      if (lowByte > 0x7e && lowByte < 0xa1) continue;
      if (highByte === 0xc6 && lowByte > 0x7e) continue;

      try {
        const char = decoder.decode(Uint8Array.from([highByte, lowByte]));
        const codePoint = char.codePointAt(0);

        if (codePoint && codePoint >= 0x4e00 && codePoint <= 0x9fff) {
          codePoints.add(codePoint);
        }
      } catch {
        // 无效字节对直接跳过。
      }
    }
  }

  // Big5 常用区汉字标准为 5,401 字，严格校验。
  if (codePoints.size !== 5401) {
    throw new Error(
      `生成的 Big5 常用汉字数量异常: ${codePoints.size}，预期 5401。`,
    );
  }

  big5CodePointsCache = codePoints;
  return codePoints;
}

/**
 * 将码点集合压缩为 U+XXXX-YYYY 形式的 Unicode 区间（供 pyftsubset --unicodes 使用）。
 */
function compressCodePointsToSpecs(codePoints: Set<number>): string[] {
  const sortedCodePoints = [...codePoints].sort((left, right) => left - right);

  const specs: string[] = [];
  let start = sortedCodePoints[0];
  let prev = sortedCodePoints[0];

  for (let index = 1; index < sortedCodePoints.length; index++) {
    const codePoint = sortedCodePoints[index];
    if (codePoint === prev + 1) {
      prev = codePoint;
      continue;
    }

    specs.push(formatUnicodeRange(start, prev));
    start = codePoint;
    prev = codePoint;
  }

  specs.push(formatUnicodeRange(start, prev));
  return specs;
}

function getGb2312HanziSpecs(): string[] {
  if (!gb2312HanziSpecsCache) {
    gb2312HanziSpecsCache = compressCodePointsToSpecs(
      collectGb2312CodePoints(),
    );
  }
  return gb2312HanziSpecsCache;
}

/**
 * 默认模式的汉字集：GB2312（常用简体）∪ Big5 常用区（常用繁体）。
 */
function getCommonHanzi(): CommonHanzi {
  if (!commonHanziCache) {
    const gb2312CodePoints = collectGb2312CodePoints();
    const big5CodePoints = collectBig5CodePoints();
    const unionCodePoints = new Set<number>([
      ...gb2312CodePoints,
      ...big5CodePoints,
    ]);

    commonHanziCache = {
      specs: compressCodePointsToSpecs(unionCodePoints),
      totalCount: unionCodePoints.size,
      gb2312Count: gb2312CodePoints.size,
      big5Count: big5CodePoints.size,
    };
  }
  return commonHanziCache;
}

export function getUnicodeSubset(
  gb2312Mode: boolean,
  noMarksMode: boolean,
): UnicodeSubset {
  if (!gb2312Mode) {
    const commonHanzi = getCommonHanzi();
    const baseRanges = noMarksMode
      ? RANGES_COMMON_NOMARKS_BASE
      : RANGES_COMMON_BASE;

    return {
      unicodes: [...baseRanges.map(([range]) => range), ...commonHanzi.specs],
      displayRanges: [
        ...baseRanges,
        [
          "常用简/繁汉字表",
          `GB2312 (${commonHanzi.gb2312Count.toLocaleString("en-US")} 字) ∪ Big5 常用区 (${commonHanzi.big5Count.toLocaleString("en-US")} 字)，去重后 ${commonHanzi.totalCount.toLocaleString("en-US")} 字，${commonHanzi.specs.length} 段`,
        ],
      ],
    };
  }

  const gb2312HanziSpecs = getGb2312HanziSpecs();
  const baseRanges = noMarksMode
    ? RANGES_GB2312_NOMARKS_BASE
    : RANGES_GB2312_BASE;

  return {
    unicodes: [...baseRanges.map(([range]) => range), ...gb2312HanziSpecs],
    displayRanges: [
      ...baseRanges,
      [
        "GB2312 汉字表",
        `真实双字节码表生成（6763 字，${gb2312HanziSpecs.length} 段）`,
      ],
    ],
  };
}

function findPyftsubset(): string | null {
  // 1. 优先检查 PATH（fonttools --help 返回 exit 2，需特殊处理）
  try {
    execSync("pyftsubset --help", { stdio: "pipe" });
    return "pyftsubset";
  } catch (e: any) {
    const out = (e?.stdout?.toString() ?? "") + (e?.stderr?.toString() ?? "");
    if (out.includes("fonttools") || out.includes("subset")) {
      return "pyftsubset";
    }
  }
  // 2. pyenv shim 路径兜底
  const shimPath = `${process.env.HOME}/.pyenv/shims/pyftsubset`;
  if (existsSync(shimPath)) return shimPath;
  return null;
}

function ensureFonttools(): void {
  if (findPyftsubset()) {
    console.log("✔ pyftsubset 已就绪");
    return;
  }
  console.log("→ 未检测到 pyftsubset，尝试安装 fonttools + brotli …");
  try {
    execSync("pip3 install fonttools brotli", { stdio: "inherit" });
  } catch {
    execSync("pip install fonttools brotli", { stdio: "inherit" });
  }
  if (!findPyftsubset()) {
    throw new Error(
      "fonttools 安装失败，请手动运行: pip3 install fonttools brotli",
    );
  }
  console.log("✔ 安装完成");
}

function runSubset(
  inputPath: string,
  outputPath: string,
  unicodes: string[],
): void {
  const bin = findPyftsubset()!;
  const args = [
    inputPath,
    `--unicodes=${unicodes.join(",")}`,
    "--layout-features=*", // 保留所有 OpenType 特性（kern、liga 等）
    "--glyph-names",
    "--symbol-cmap",
    "--legacy-cmap",
    "--notdef-glyph",
    "--notdef-outline",
    "--recommended-glyphs",
    "--name-IDs=*",
    "--no-hinting", // 去掉 hinting（网页字体无需，减小体积）
    "--desubroutinize", // 展开 CFF subroutine，有利于 WOFF2 再压缩
    "--drop-tables+=SVG", // 丢弃 SVG 彩色表（文本字体用不到）
    "--flavor=woff2",
    `--output-file=${outputPath}`,
  ];

  execFileSync(bin, args, { stdio: "inherit" });
}

function writeCss(
  fontName: string,
  woff2File: string,
  dir: string,
  suffix: string,
): void {
  const cssPath = path.join(dir, `${fontName}${suffix}.css`);
  const css = `/* 自动生成的 @font-face 声明 */
@font-face {
  font-family: '${fontName}';
  src: url('./${woff2File}') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: swap; /* 先用系统字体显示，加载完成后平滑切换 */
}
`;
  writeFileSync(cssPath, css, "utf8");
  console.log(`→ CSS: ${path.basename(cssPath)}`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main(): void {
  const argv = process.argv.slice(2);
  const gb2312Mode = argv.includes("--gb2312");
  const noMarksMode = argv.includes("--nomarks");
  const inputFile = argv.find((a) => !a.startsWith("--"));

  if (!inputFile) {
    console.error(
      "用法: npx tsx compress-font.ts <字体文件.otf> [--gb2312] [--nomarks]\n" +
        "  默认模式保留 GB2312 ∪ Big5 常用区的常用简/繁汉字 + ASCII + 标点，不含乱码区间\n" +
        "  --gb2312   仅使用 GB2312 字符范围（简体为主，体积更小）\n" +
        "  --nomarks  剔除标点符号",
    );
    process.exit(1);
  }

  const inputPath = path.resolve(inputFile);
  if (!existsSync(inputPath)) {
    console.error(`文件不存在: ${inputPath}`);
    process.exit(1);
  }

  ensureFonttools();

  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  // 输出到脚本运行目录下的 font/ 文件夹
  const dir = path.resolve("font");
  mkdirSync(dir, { recursive: true });
  const suffix = `${gb2312Mode ? "-gb2312" : ""}${
    noMarksMode ? "-nomarks" : ""
  }-subset`;
  const outputPath = path.join(dir, `${base}${suffix}.woff2`);

  const originalSize = statSync(inputPath).size;
  const subset = getUnicodeSubset(gb2312Mode, noMarksMode);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`输入文件 : ${path.basename(inputPath)}  (${fmt(originalSize)})`);
  console.log(
    `压缩模式 : ${gb2312Mode ? "GB2312 精简（简体为主）" : "常用简/繁汉字（GB2312 ∪ Big5 常用区）"}`,
  );
  console.log(`剔除标点 : ${noMarksMode ? "是" : "否"}`);
  console.log("Unicode 区间:");
  subset.displayRanges.forEach(([range, desc]) =>
    console.log(`  ${range.padEnd(18)} ${desc}`),
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("→ 开始子集化（可能需要 1-2 分钟，字体较大请耐心等待）…\n");

  runSubset(inputPath, outputPath, subset.unicodes);

  const outputSize = statSync(outputPath).size;
  const reduction = ((1 - outputSize / originalSize) * 100).toFixed(1);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`输出文件 : ${path.basename(outputPath)}`);
  console.log(
    `大小     : ${fmt(originalSize)}  →  ${fmt(outputSize)}  (缩减 ${reduction}%)`,
  );

  // writeCss(base, path.basename(outputPath), dir, suffix);
  // const cssHref = path.posix.join("font", `${base}${suffix}.css`);

  // console.log(
  //   `\n在 HTML <head> 中引用：\n  <link rel="stylesheet" href="${cssHref}">`,
  // );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

if (require.main === module) {
  main();
}
