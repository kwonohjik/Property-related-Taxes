/**
 * 정적 가드 — **부담부증여 채무비율(B/C)을 소수로 만들어 곱하지 않는다.** B·C 원값을 정수 `safeMultiplyThenDivide`에 넘긴다.
 *
 * 계획: docs/00-pm/burdened-gift-debt-ratio-precision.plan.md §2·§9.2
 *
 * 소령 §159①은 `A × B/C`를 정하고, 정본 경로(`apportionTransferPrice` 등)는 정수 `safeMultiplyThenDivide(A, B, C)`다.
 * 그런데 `debtRatio = B/C`(정수/정수의 부동소수 몫)를 다시 곱하면 순환 소수 비율(14/110 등)에서
 * `Math.floor(amount × ratio)`가 참값이 정수인 곱에서 **1원 과소**를 낸다 — `applyRatio`도 11자리 이상 비율은 옛 식으로 넘긴다.
 *
 * 형제 가드: `share-ratio-apply-policy.test.ts`(지분 비율 → `applyRatio`) · `estimated-acq-float-policy.test.ts`.
 * 지분 비율은 짧은 소수라 `applyRatio`가 맞고, **채무 비율은 순환 소수라 분수 그대로** 곱한다 — 두 가드의 처방이 다르다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

export const GUARDED_FILES = [
  "lib/tax-engine/redevelopment-burdened-gift.ts",
  "lib/tax-engine/redevelopment-split.ts",
  // 주식 부담부증여 ④ (PR-2 · 계획서 F3) — B·C 원값을 safeMultiplyThenDivide로. PR-7b-3에서 주식 부분을 아래 파일로 분리했다(부동산 파일도 계속 본다).
  "lib/calc/gift-burdened-transfer-api.ts",
  "lib/calc/gift-burdened-stock-transfer-api.ts",
  // 주식 엔진 (S-2 · `stock-burdened-debt-fraction-wire.plan.md`) — 와이어에 증여가액 C를 싣고 safeMultiplyThenDivide(base, B, C).
  // S-1 때는 와이어에 소수 비율뿐이라 `applyRatio`를 허용했으나(FLOOR_ONLY), 이제 `applyRatio(…, 비율)`도 금지다.
  "lib/tax-engine/stock-transfer/stock-acquisition-basis.ts",
];

/** 폐지된 와이어 필드 — 코드 줄(주석 제외)에 0곳. S-2 다음 릴리스에 «수신 거절» 정의도 지웠다. */
export const LEGACY_RATIO_FIELD = "burdenedGiftDebtRatio";
/** 구필드가 코드에 나오면 안 되는 파일 — 생산(④)·소비(엔진)·매핑(⑭)·타입·refine·스키마(⑫) */
export const LEGACY_FIELD_FORBIDDEN_FILES = [
  "lib/api/stock-transfer-tax-schema.ts",
  "lib/calc/gift-burdened-transfer-api.ts",
  "lib/calc/gift-burdened-stock-transfer-api.ts",
  "lib/tax-engine/stock-transfer/stock-acquisition-basis.ts",
  "lib/tax-engine/stock-transfer/types/stock-transfer.types.ts",
  "lib/api/stock-transfer-engine-input.ts",
  "lib/api/stock-transfer-tax-refines.ts",
];

/**
 * 재개발 β/개산공제 경로 — 소수 비율 식별자 자체를 쓰지 않는다 (Q3 (a): `debtRatio` → `debtFraction {debt, valuation}`).
 * 곱셈 패턴 가드(`scan`)로는 `computeEstimatedDeduction(…, lumpBaseRatio)`처럼 함수 인자로 넘기는 형태를 못 잡는다.
 */
export const IDENTIFIER_GUARDED_FILES = [
  "lib/calc/gift-burdened-transfer-api.ts",
  "lib/calc/gift-burdened-stock-transfer-api.ts",
  "lib/tax-engine/redevelopment-burdened-gift.ts",
  "lib/tax-engine/redevelopment-split.ts",
  "lib/tax-engine/redevelopment.ts",
  "lib/tax-engine/transfer-tax-redevelopment-steps.ts",
];

/** 채무비율 피연산자 — `debtRatio` · `burdenedGiftDebtRatio` · `lumpBaseRatio` 로 끝나는 이름 */
const DEBT_RATIO_NAME = /(^|[.\s(])(debtRatio|burdenedGiftDebtRatio|lumpBaseRatio)$/;

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

/** 괄호 깊이 0에서 `sep` 기준 분할 */
function splitTopLevel(inner: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let prev = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === sep && depth === 0) {
      parts.push(inner.slice(prev, i).trim());
      prev = i + 1;
    }
  }
  parts.push(inner.slice(prev).trim());
  return parts;
}

export interface Hit {
  line: number;
  text: string;
}

function isCommentLine(lineText: string): boolean {
  return lineText.startsWith("//") || lineText.startsWith("*") || lineText.startsWith("/*");
}

/** `Math.floor(… * debtRatio)` · `applyRatio(…, debtRatio)` 위치 */
export function scan(src: string): Hit[] {
  const hits: Hit[] = [];
  const lines = src.split("\n");

  const visit = (callee: string, test: (inner: string) => boolean) => {
    let idx = 0;
    for (;;) {
      const at = src.indexOf(`${callee}(`, idx);
      if (at === -1) break;
      idx = at + 1;
      const open = at + callee.length;
      const close = matchParen(src, open);
      if (close === -1) break;
      const line = src.slice(0, at).split("\n").length;
      if (isCommentLine((lines[line - 1] ?? "").trim())) continue;
      const inner = src.slice(open + 1, close);
      if (test(inner)) hits.push({ line, text: `${callee}(${inner.replace(/\s+/g, " ").trim().slice(0, 110)})` });
    }
  };

  visit("Math.floor", (inner) => {
    const ops = splitTopLevel(inner, "*");
    return ops.length > 1 && ops.some((op) => DEBT_RATIO_NAME.test(op));
  });
  visit("applyRatio", (inner) => {
    const args = splitTopLevel(inner, ",");
    return args.length >= 2 && DEBT_RATIO_NAME.test(args[1]);
  });
  return hits.sort((a, b) => a.line - b.line);
}

/** 주석을 뺀 코드 줄에서 `debtRatio` · `lumpBaseRatio` 식별자 위치 */
export function scanIdentifier(src: string): Hit[] {
  const hits: Hit[] = [];
  src.split("\n").forEach((raw, i) => {
    const trimmed = raw.trim();
    if (isCommentLine(trimmed)) return;
    const code = raw.replace(/\/\/.*$/, "");
    if (/\b(debtRatio|lumpBaseRatio)\b/.test(code)) hits.push({ line: i + 1, text: trimmed.slice(0, 110) });
  });
  return hits;
}

/** 주석을 뺀 코드 줄에서 폐지된 와이어 필드 `burdenedGiftDebtRatio` 위치 */
export function scanLegacyField(src: string): Hit[] {
  const hits: Hit[] = [];
  src.split("\n").forEach((raw, i) => {
    const trimmed = raw.trim();
    if (isCommentLine(trimmed)) return;
    const code = raw.replace(/\/\/.*$/, "");
    if (code.includes(LEGACY_RATIO_FIELD)) hits.push({ line: i + 1, text: trimmed.slice(0, 110) });
  });
  return hits;
}

describe("부담부증여 채무비율 — 소수 비율을 곱하지 않는다", () => {
  it("🔴 가드 대상 파일(주식 엔진 포함)에 `Math.floor(… * 채무비율)`·`applyRatio(…, 채무비율)`이 0건이다", () => {
    const found: string[] = [];
    for (const file of GUARDED_FILES) {
      for (const h of scan(readFileSync(join(ROOT, file), "utf8"))) found.push(`  ${file}:${h.line}\n    ${h.text}`);
    }
    expect(
      found,
      `채무비율 소수 곱 ${found.length}건 — B·C 원값을 safeMultiplyThenDivide(금액, B, C)에 넘길 것:\n${found.join("\n")}`,
    ).toHaveLength(0);
  });

  it("🔴 재개발 β/개산공제 경로에 소수 비율 식별자(`debtRatio` · `lumpBaseRatio`)가 코드에 남아 있지 않다", () => {
    const found: string[] = [];
    for (const file of IDENTIFIER_GUARDED_FILES) {
      for (const h of scanIdentifier(readFileSync(join(ROOT, file), "utf8"))) found.push(`  ${file}:${h.line}\n    ${h.text}`);
    }
    expect(found, `소수 비율 식별자 ${found.length}건 — debtFraction {debt, valuation}으로 바꿀 것:\n${found.join("\n")}`).toHaveLength(0);
  });

  it("🔴 폐지된 와이어 필드 `burdenedGiftDebtRatio`가 코드에 남아 있지 않다 (S-2 · 생산·스키마·매핑·엔진 전부)", () => {
    const found: string[] = [];
    for (const file of LEGACY_FIELD_FORBIDDEN_FILES) {
      for (const h of scanLegacyField(readFileSync(join(ROOT, file), "utf8"))) found.push(`  ${file}:${h.line}\n    ${h.text}`);
    }
    expect(found, `폐지 필드 ${found.length}건 — 증여가액 C(burdenedGiftValuationAmount)로 바꿀 것:\n${found.join("\n")}`).toHaveLength(0);
  });

  it("대상 파일이 코드(주석 제외)에서 safeMultiplyThenDivide를 실제로 호출한다 (가드가 «아무것도 안 보는» 상태로 통과하지 않는다)", () => {
    const count = (file: string) =>
      readFileSync(join(ROOT, file), "utf8")
        .split("\n")
        .filter((l) => !isCommentLine(l.trim()))
        .join("\n")
        .match(/\bsafeMultiplyThenDivide\(/g)?.length ?? 0;
    expect(count("lib/tax-engine/redevelopment-burdened-gift.ts")).toBeGreaterThanOrEqual(1); // β 4항 공용 scale()
    expect(count("lib/tax-engine/redevelopment-split.ts")).toBeGreaterThanOrEqual(1); // 개산공제 base 외 기존 안분 호출도 포함
    expect(count("lib/calc/gift-burdened-stock-transfer-api.ts")).toBeGreaterThanOrEqual(1); // ④ actual 모드 안분 취득가(주식 — PR-7b-3에서 분리)
    expect(count("lib/tax-engine/stock-transfer/stock-acquisition-basis.ts")).toBeGreaterThanOrEqual(1); // 주식 엔진 개산공제 base 안분
  });

  it("주식 엔진은 개산공제 base를 증여가액 C 와이어로 분수 곱한다 (코드 줄에서 호출 존재)", () => {
    const code = readFileSync(join(ROOT, "lib/tax-engine/stock-transfer/stock-acquisition-basis.ts"), "utf8")
      .split("\n")
      .filter((l) => !isCommentLine(l.trim()))
      .join("\n");
    expect(code).toMatch(/\bsafeMultiplyThenDivide\(\s*estimatedBase\s*,\s*transferPrice\s*,\s*input\.burdenedGiftValuationAmount\s*\)/);
  });
});

describe("가드 자체의 구별력", () => {
  it("🔑 잡는 모양: Math.floor(x * debtRatio) · applyRatio(x, debtRatio) · lumpBaseRatio · burdenedGiftDebtRatio", () => {
    expect(scan("const a = Math.floor(base * debtRatio);")).toHaveLength(1);
    expect(scan("const a = Math.floor(info.estimatedBase * input.burdenedGiftDebtRatio);")).toHaveLength(1);
    expect(scan("const a = applyRatio(info.rightsValue, debtRatio);")).toHaveLength(1);
    expect(scan("const a = applyRatio(numerator, lumpBaseRatio);")).toHaveLength(1);
    expect(scan("const a = Math.floor(actualAcquisitionPrice * debtRatio);")).toHaveLength(1);
  });
  it("🔑 식별자 가드: 코드 줄은 잡고 주석은 안 잡는다", () => {
    expect(scanIdentifier("computeEstimatedDeduction(n, rate, lumpBaseRatio);")).toHaveLength(1);
    expect(scanIdentifier("  debtRatio?: number;")).toHaveLength(1);
    expect(scanIdentifier("const x = burdenedGift?.debtRatio;")).toHaveLength(1);
    expect(scanIdentifier("const x = 1; // debtRatio 설명")).toHaveLength(0);
    expect(scanIdentifier("   * `debtRatio`를 곱하지 않는다")).toHaveLength(0);
    expect(scanIdentifier("const x = debtFraction.debt;")).toHaveLength(0);
  });
  it("🔑 구필드 가드: 코드 줄은 잡고 주석·새 필드는 안 잡는다", () => {
    expect(scanLegacyField("  burdenedGiftDebtRatio: z.never().optional(),")).toHaveLength(1);
    expect(scanLegacyField("body.burdenedGiftDebtRatio = debtRatio;")).toHaveLength(1);
    expect(scanLegacyField("   * `burdenedGiftDebtRatio` 는 폐지")).toHaveLength(0);
    expect(scanLegacyField("const x = 1; // burdenedGiftDebtRatio 설명")).toHaveLength(0);
    expect(scanLegacyField("body.burdenedGiftValuationAmount = valuationAmount;")).toHaveLength(0);
  });
  it("🔑 안 잡는 모양: safeMultiplyThenDivide · 지분 비율 applyRatio · 주석 · 표시용 비율 필드 읽기", () => {
    expect(scan("const a = safeMultiplyThenDivide(x, debt, valuation);")).toHaveLength(0);
    expect(scan("const a = applyRatio(x, ownershipRatio);")).toHaveLength(0);
    expect(scan("const a = safeMultiplyThenDivide(estimatedBase, transferPrice, input.burdenedGiftValuationAmount);")).toHaveLength(0);
    expect(scan("// Math.floor(x * debtRatio)\nconst b = 1;")).toHaveLength(0);
    expect(scan(" * applyRatio(x, debtRatio) 로 곱하면 1원 과소\nconst b = 1;")).toHaveLength(0);
    expect(scan("const echo = breakdown.debtRatio.toFixed(4);")).toHaveLength(0);
  });
});
