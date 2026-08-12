# font-minify

将 OTF/TTF 字体压缩为 WOFF2 子集，按需保留简/繁体中文、ASCII 和标点符号，大幅缩减字体体积，适合用于网页项目。

## 功能特性

- 自动检测并安装 Python [fonttools](https://github.com/fonttools/fonttools)，零配置开箱即用
- 两种压缩模式：**常用简/繁汉字**（GB2312 ∪ Big5 常用区，去重后约 8,836 字，不含部首/注音/兼容汉字等乱码区间）和 **GB2312 精简**（真实码表中的 6763 个汉字）
- 输出 WOFF2 格式（最优网页字体压缩比）
- 自动生成对应的 `@font-face` CSS 文件
- 可选 `--nomarks` 剔除标点符号
- 输出文件统一写入 `font/` 目录

## 环境依赖

| 依赖    | 版本要求           |
| ------- | ------------------ |
| Node.js | ≥ 18               |
| Python  | ≥ 3.8（pip3 可用） |

> Python fonttools 和 brotli 会在首次运行时自动安装，也可手动安装：
>
> ```bash
> pip3 install fonttools brotli
> ```

## 安装

```bash
npm install
```

## 用法

```bash
# 常用简/繁汉字模式（默认，GB2312 ∪ Big5，不含乱码区间）
npx tsx compress-font.ts <字体文件.otf>

# GB2312 精简模式（简体为主，真实码表中的 6763 个汉字，体积更小）
npx tsx compress-font.ts <字体文件.otf> --gb2312

# 剔除标点符号
npx tsx compress-font.ts <字体文件.otf> --nomarks
npx tsx compress-font.ts <字体文件.otf> --gb2312 --nomarks
```

### 示例

```bash
npx tsx compress-font.ts font/汇文明朝体.OTF
npx tsx compress-font.ts font/汇文明朝体.OTF --gb2312
npx tsx compress-font.ts font/汇文明朝体.OTF --nomarks
npx tsx compress-font.ts font/汇文明朝体.OTF --gb2312 --nomarks
```

输出文件写入 `font/` 目录：

```text
font/
├── 汇文明朝体.OTF              # 原始字体（不纳入版本控制）
├── 汇文明朝体-subset.woff2     # 常用模式输出
├── 汇文明朝体-subset.css
├── 汇文明朝体-gb2312-subset.woff2          # GB2312 模式输出
├── 汇文明朝体-gb2312-subset.css
├── 汇文明朝体-nomarks-subset.woff2         # 剔除标点输出
├── 汇文明朝体-nomarks-subset.css
├── 汇文明朝体-gb2312-nomarks-subset.woff2  # GB2312 + 剔除标点输出
└── 汇文明朝体-gb2312-nomarks-subset.css
```

## 引入 CSS

在 HTML `<head>` 中引用生成的 CSS 文件：

```html
<link rel="stylesheet" href="font/汇文明朝体-subset.css" />
```

或直接通过 `@import`：

```css
@import url("font/汇文明朝体-subset.css");
```

## Unicode 覆盖区间

### 常用模式（默认）

汉字不再整体保留 U+4E00–9FFF 主区（约 20,902 字，含大量生僻字），而是在运行时解码 GB2312 ∪ Big5 常用区（0xA440–0xC67E）的真实双字节码表，生成常用简/繁汉字并集（去重后约 8,836 字）。Big5 次常用区（含龘等生僻字）不保留。康熙部首、CJK 部首补充、注音符号、CJK 兼容汉字、竖排标点、小形式变体等容易显得「乱码」的区间均已剔除。

| 区间          | 说明                                 |
| ------------- | ------------------------------------ |
| U+0020–007E   | ASCII 可打印字符                     |
| U+00A0–00FF   | Latin-1 补充                         |
| U+2000–206F   | 通用标点（引号、破折号等）           |
| U+3000–303F   | CJK 符号和标点（全角句号、书名号等） |
| U+FF00–FFEF   | 全角/半角形式（全角标点等）          |
| 常用简/繁汉字表 | GB2312 ∪ Big5 真实码表生成的并集    |

### GB2312 精简模式

该模式不再使用 `U+4E00–9FA5` 这样的近似连续区间，而是按 GB2312 双字节码表在运行时生成真实汉字集合，再额外保留网页常用 ASCII 和标点范围。

| 区间          | 说明                             |
| ------------- | -------------------------------- |
| U+0020–007E   | ASCII 可打印字符                 |
| U+00A0–00FF   | Latin-1 补充                     |
| U+2000–206F   | 通用标点                         |
| U+3000–303F   | CJK 符号和标点                   |
| GB2312 汉字表 | 真实双字节码表生成的 6763 个汉字 |
| U+FE30–FE4F   | CJK 兼容形式                     |
| U+FF00–FFEF   | 全角/半角形式                    |

### `--nomarks`

添加 `--nomarks` 后会剔除标点相关区间，并将 ASCII / 全角范围收窄为数字、英文字母和空格：

| 区间                                  | 说明                     |
| ------------------------------------- | ------------------------ |
| U+0020                                | 空格                     |
| U+0030–0039 / U+0041–005A / U+0061–007A | ASCII 数字和英文字母     |
| U+00C0–00D6 / U+00D8–00F6 / U+00F8–00FF | Latin-1 字母             |
| U+FF10–FF19 / U+FF21–FF3A / U+FF41–FF5A | 全角数字和英文字母       |
| 中文相关区间或 GB2312 汉字表          | 按当前压缩模式继续保留   |

## License

MIT
