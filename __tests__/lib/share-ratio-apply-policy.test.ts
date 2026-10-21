/**
 * 정적 가드 — **지분 비율 적용은 `applyRatio`(`lib/tax-engine/tax-utils.ts`) 하나로 한다.**
 *
 * 계획: docs/00-pm/share-ratio-apply-float-precision.plan.md §4(S′)·§5-4
 *
 * `applyRatio`는 소수 10자리 이하 비율을 십진 정확(BigInt)으로 계산해 `Math.floor(금액 × 0.7)`의 1원 과소를 없앤다.
 * 사이드바(⑥)·신고서(⑦)·입력 카드 안내가 `Math.floor(금액 × 지분)`을 따로 쓰면 **엔진(④)과 1원씩 어긋난다** — 거울 9곳 + 입력 카드 2곳을
 * 통일한 뒤 같은 곳에 옛 식이 되돌아오지 않게 한다. 형제 가드: `estimated-acq-float-policy.test.ts`(환산·비율 안분).
 * 입력 카드 2곳 계획: docs/00-pm/input-card-share-mirror-precision.plan.md §5.2
 *
 * ## 대상
 * 거울 9곳이 있던 3개 파일 + 입력 카드 2개 파일(화면 안내 표시 — 표시 전용이지만 ④와 같은 숫자여야 한다).
 * 이 파일들의 모든 `Math.floor(… * <지분 비율>)`을 금지한다
 * (지분 비율 = 이름이 `ratio`·`ownRatio`·`ownershipRatio`로 끝나거나 `(분자 / 분모)` 괄호 식).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

export const GUARDED_FILES = [
  "lib/stores/transfer-per-asset-summary.ts",
  "lib/stores/calc-wizard-store.ts",
  "components/calc/results/transfer/FilingFormTableHelpers.ts",
  "components/calc/transfer/CompanionSaleModeBlock.tsx",
  "components/calc/transfer/asset-sections/AssetSectionExpense.tsx",
];

function matchParen(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 괄호 깊이 0의 `*` 기준 피연산자 */
function starOperands(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let prev = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "*" && depth === 0) {
      parts.push(inner.slice(prev, i).trim());
      prev = i + 1;
    }
  }
  if (parts.length === 0) return [];
  parts.push(inner.slice(prev).trim());
  return parts;
}

/** 이 피연산자가 지분 비율인가 — 이름이 ratio류이거나 `(a / b)` 괄호 식 */
function isRatioOperand(op: string): boolean {
  if (/(^|[.\s])(ratio|ownRatio|ownershipRatio|primaryRatio|shareRatio)$/.test(op)) return true;
  return /^\([^()]*\/[^()]*\)$/.test(op);
}

export interface Hit {
  line: number;
  text: string;
}

/** `Math.floor(… * <지분 비율>)` 위치 */
export function scan(src: string): Hit[] {
  const hits: Hit[] = [];
  const lines = src.split("\n");
  let idx = 0;
  for (;;) {
    const at = src.indexOf("Math.floor(", idx);
    if (at === -1) break;
    idx = at + 1;
    const open = at + "Math.floor".length;
    const close = matchParen(src, open);
    if (close === -1) break;
    const line = src.slice(0, at).split("\n").length;
    const lineText = (lines[line - 1] ?? "").trim();
    if (lineText.startsWith("//") || lineText.startsWith("*") || lineText.startsWith("/*")) continue;
    const inner = src.slice(open + 1, close);
    if (starOperands(inner).some(isRatioOperand)) hits.push({ line, text: inner.replace(/\s+/g, " ").trim().slice(0, 120) });
  }
  return hits;
}

describe("지분 비율 적용 — 거울 9곳 + 입력 카드 2곳은 applyRatio를 쓴다", () => {
  it("🔴 거울이 있던 3개 파일 + 입력 카드 2개 파일에 `Math.floor(… * 지분 비율)`이 0건이다", () => {
    const found: string[] = [];
    for (const file of GUARDED_FILES) {
      for (const h of scan(readFileSync(join(ROOT, file), "utf8"))) found.push(`  ${file}:${h.line}\n    Math.floor(${h.text})`);
    }
    expect(found, `지분 적용 ${found.length}건 — applyRatio(금액, 비율)로 바꿀 것:\n${found.join("\n")}`).toHaveLength(0);
  });

  it("거울 9곳 + 입력 카드 2곳이 applyRatio를 실제로 호출한다 (가드가 «아무것도 안 보는» 상태로 통과하지 않는다)", () => {
    const count = (file: string) => (readFileSync(join(ROOT, file), "utf8").match(/\bapplyRatio\(/g) ?? []).length;
    expect(count("lib/stores/transfer-per-asset-summary.ts")).toBeGreaterThanOrEqual(7); // 기존 2 + 거울 5
    expect(count("lib/stores/calc-wizard-store.ts")).toBeGreaterThanOrEqual(1);
    expect(count("components/calc/results/transfer/FilingFormTableHelpers.ts")).toBeGreaterThanOrEqual(3);
    expect(count("components/calc/transfer/CompanionSaleModeBlock.tsx")).toBeGreaterThanOrEqual(1);
    expect(count("components/calc/transfer/asset-sections/AssetSectionExpense.tsx")).toBeGreaterThanOrEqual(1);
  });
});

describe("가드 자체의 구별력", () => {
  it("🔑 잡는 모양: ratio · ownRatio · (n / d)", () => {
    expect(scan("const a = Math.floor(total * ratio);")).toHaveLength(1);
    expect(scan("const a = Math.floor(rawTotalPrice * ownRatio);")).toHaveLength(1);
    expect(scan("const a = Math.floor(raw * (n / d));")).toHaveLength(1);
    expect(scan("const a = Math.floor(x.value * ownershipRatio);")).toHaveLength(1);
  });
  it("🔑 안 잡는 모양: applyRatio · 비율이 아닌 곱 · 주석", () => {
    expect(scan("const a = applyRatio(total, ratio);")).toHaveLength(0);
    expect(scan("const a = Math.floor(price * 3 / 100);")).toHaveLength(0);
    expect(scan("const a = Math.floor(a / b);")).toHaveLength(0);
    expect(scan("// Math.floor(total * ratio)\nconst b = 1;")).toHaveLength(0);
  });
});
