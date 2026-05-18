import test from "node:test";
import assert from "node:assert/strict";

import { getUnicodeSubset } from "./compress-font";

test("full mode keeps punctuation by default", () => {
  const subset = getUnicodeSubset(false, false);

  assert.ok(subset.unicodes.includes("U+2000-206F"));
  assert.ok(subset.unicodes.includes("U+3000-303F"));
  assert.ok(subset.unicodes.includes("U+0020-007E"));
  assert.ok(subset.unicodes.includes("U+4E00-9FFF"));
});

test("nomarks removes punctuation ranges in full mode", () => {
  const subset = getUnicodeSubset(false, true);

  assert.equal(subset.unicodes.includes("U+2000-206F"), false);
  assert.equal(subset.unicodes.includes("U+3000-303F"), false);
  assert.equal(subset.unicodes.includes("U+FE10-FE1F"), false);
  assert.equal(subset.unicodes.includes("U+FE30-FE4F"), false);
  assert.equal(subset.unicodes.includes("U+FE50-FE6F"), false);
  assert.ok(subset.unicodes.includes("U+0020"));
  assert.ok(subset.unicodes.includes("U+0030-0039"));
  assert.ok(subset.unicodes.includes("U+0041-005A"));
  assert.ok(subset.unicodes.includes("U+0061-007A"));
  assert.ok(subset.unicodes.includes("U+4E00-9FFF"));
});

test("nomarks removes punctuation ranges in gb2312 mode", () => {
  const subset = getUnicodeSubset(true, true);

  assert.equal(subset.unicodes.includes("U+2000-206F"), false);
  assert.equal(subset.unicodes.includes("U+3000-303F"), false);
  assert.equal(subset.unicodes.includes("U+FE30-FE4F"), false);
  assert.ok(subset.unicodes.includes("U+0020"));
  assert.ok(subset.unicodes.includes("U+0030-0039"));
  assert.ok(subset.unicodes.includes("U+0041-005A"));
  assert.ok(subset.unicodes.includes("U+0061-007A"));
  assert.ok(subset.unicodes.some((range) => range.startsWith("U+4E00")));
});
