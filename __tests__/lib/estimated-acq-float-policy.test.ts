/**
 * 정적 가드 — **환산취득가액·기준시가 비율 안분은 분자·분모를 정수로 둔 채 곱셈 먼저 나눈다.**
 *
 * 계획: docs/00-pm/estimated-acquisition-float-precision.plan.md §2·§6.1
 *
 * 부동소수 식은 두 모양으로 참값이 정수일 때 1원 과소가 난다(방향은 항상 과소):
 *   · R(비율 먼저) `Math.floor(a * (b / c))` — `b / c`가 이진 소수로 정확히 표현되지 않는다. 참값 정수 표본의 약 4%.
 *   · P(곱 먼저, 가드 없음) `Math.floor(a * b / c)` — `a * b`가 `MAX_SAFE_INTEGER`를 넘으면 곱 자체가 반올림된다.
 * 정본: `safeMultiplyThenDivide` / `calculateEstimatedAcquisitionPrice`(`tax-utils.ts`) · `apportionByStdPrice`(`std-price-apportion.ts`).
 *
 * 형제 선례: `unit-price-area-policy.test.ts`(「단가 × 면적」 → `multiplyByArea`).
 *
 * ## 대상
 * 이번에 고친 파일 11개(1단계 5 + 인접 축 6). `lib/tax-engine/**` 전체로 넓히지 않는다 — 다른 세목·감면의 기존 식은
 * 계획서 §7(범위 밖)이라 별건이다.
 *
 * ## ⛔ 허용 목록 (사유 필수)
 * 지분 규약 `applyRatio`(69곳)·사이드바 지분은 별도 계획(`share-ratio-apply-float-precision.plan.md`)에서 `applyRatio` 내부를 정확화하고
 * 사이드바 거울을 `applyRatio`로 통일했다 — 가드는 `share-ratio-apply-policy.test.ts`.
 * 이 가드는 `Math.floor(… * <비율 변수>)`가 이번 파일들에서 비율을 **분자·분모 쌍**으로 바꾼 곳에 남지 않게 한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** 고친 파일들 — 새 파일을 같은 유형으로 고치면 여기에 더한다. */
export const GUARDED_FILES = [
  // 1단계 (환산취득가액 직접 부동소수 18곳)
  "lib/tax-engine/transfer-tax-split-acq-price.ts",
  "lib/tax-engine/transfer-tax-carryover.ts",
  "lib/tax-engine/transfer-tax-pre-housing-disclosure.ts",
  "lib/tax-engine/transfer-reductions/phd-helper.ts",
  "lib/tax-engine/transfer-tax-aggregate-display-echo.ts",
  // 인접 축 (기준시가·면적 비율 안분 10곳)
  "lib/tax-engine/transfer-tax-mixed-use-commercial.ts",
  "lib/tax-engine/transfer-tax-mixed-use-housing.ts",
  "lib/tax-engine/transfer-tax-mixed-use-housing-acq.ts",
  "lib/tax-engine/transfer-tax-mixed-use-inheritance.ts",
  "lib/tax-engine/transfer-tax-mixed-use-helpers.ts",
  "lib/stores/calc-wizard-store.ts",
  // 일반건물 양도비 배분 기준(gb-transfer-expense-apportion-basis.plan.md Q-6) — 실가 경로·swap·split/PHD
  "app/api/calc/transfer/general-building-route-actual.ts",
  "lib/tax-engine/general-building-swap.ts",
  "lib/tax-engine/transfer-tax-split-gain.ts",
];

/**
 * A 모양 가드 대상 — `applyRate(금액, a / b)`. 비율 `a / b`가 이진 소수로 정확히 표현되지 않으면 `applyRate`가 `Math.floor(amount * rate)`로
 * 후퇴해(`tax-utils.ts` `applyRate`) R 모양과 같은 1원 과소가 난다. 정본은 `apportionByStdPrice` / `safeMultiplyThenDivide`.
 * 세율·감면율 상수 `applyRate(x, 0.5)`는 `/`가 없어 걸리지 않는다. 이번에 고친 세 파일만 대상이다 — 다른 파일의 `applyRate(…, a / b)`는 별건.
 */
export const APPLY_RATE_GUARDED_FILES = [
  "lib/tax-engine/general-building-swap.ts",
  "lib/tax-engine/transfer-tax-split-gain.ts",
];

/**
 * 허용 목록 — `file:줄 안의 식`. 사유 없이 추가하지 않는다.
 * 키는 `Math.floor(` 인자를 공백 정규화한 문자열이다(줄 번호는 흔들리므로 쓰지 않는다).
 */
export const ALLOWED: Record<string, string> = {
  // 비사업용토지 비율 nonBizRatio — 환산·기준시가 안분이 아니라 비사업용 기간 비율이다. 계획서 §7 «범위 밖(관찰만)».
  "lib/tax-engine/transfer-tax-mixed-use-helpers.ts::gainSplit.landGain * nonBizRatio": "NBL nonBizRatio — 범위 밖(§7)",
  "lib/tax-engine/transfer-tax-mixed-use-helpers.ts::part.landTransferGain * nonBizRatio": "NBL nonBizRatio — 범위 밖(§7)",
};

/** `(`의 짝 `)` 위치 — 정규식은 중첩 호출에서 깨진다. */
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

/** 괄호 깊이 0의 연산자 위치 */
function topLevel(s: string, ch: string): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ch && depth === 0) out.push(i);
  }
  return out;
}

/** 최상위 `*` 기준 피연산자들 */
function starOperands(inner: string): string[] {
  const idx = topLevel(inner, "*");
  if (idx.length === 0) return [];
  const parts: string[] = [];
  let prev = 0;
  for (const i of idx) {
    parts.push(inner.slice(prev, i).trim());
    prev = i + 1;
  }
  parts.push(inner.slice(prev).trim());
  return parts;
}

/** 소괄호로 전체가 싸인 피연산자의 안쪽. `(a / b)` → `a / b` */
function unwrap(op: string): string | null {
  const t = op.trim();
  if (!t.startsWith("(") || matchParen(t, 0) !== t.length - 1) return null;
  return t.slice(1, -1);
}

export type Shape = "R" | "P" | "RV" | "A";

/**
 * 한 `Math.floor(...)` 인자가 위험한 모양인가.
 *   · R   — `a * (b / c)` : 곱의 피연산자 하나가 나눗셈을 담은 괄호
 *   · P   — `a * b / c`, `(a * b) / c` : 같은 인자 안에 곱과 나눗셈이 함께 있다(가드 없음)
 *   · RV  — `a * ratio` : 곱의 피연산자가 「나눗셈으로 만든 비율 변수」(`ratioVars`)
 */
export function classify(inner: string, ratioVars: ReadonlySet<string> = new Set()): Shape | null {
  const ops = starOperands(inner);
  if (ops.length >= 2) {
    // R: 피연산자가 나눗셈을 담은 괄호
    for (const op of ops) {
      const body = unwrap(op);
      if (body !== null && topLevel(body, "/").length > 0) return "R";
    }
    // RV: 피연산자가 비율 변수
    // 함수 인자로 받은 비율(예: splitPair의 `landRatio`)은 선언을 볼 수 없으므로 이름(`…Ratio`)으로도 잡는다.
    for (const op of ops) if (ratioVars.has(op) || /^[A-Za-z_$][\w$.]*Ratio$/.test(op)) return "RV";
  }
  // P: 최상위 `/` 와 곱(최상위 `*` 또는 괄호 안 곱)이 함께
  if (topLevel(inner, "/").length > 0) {
    if (ops.length >= 2) return "P";
    const slash = topLevel(inner, "/")[0];
    const left = unwrap(inner.slice(0, slash));
    if (left !== null && topLevel(left, "*").length > 0) return "P";
  }
  return null;
}

/** `const name = ... / ...;` 로 만든 변수 이름 — 3항 `? a / b : 0.5`도 잡는다. */
export function ratioVariables(src: string): Set<string> {
  const out = new Set<string>();
  const re = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rhs = m[2];
    if (/Math\.floor|safeMultiplyThenDivide|apportionByStdPrice/.test(rhs)) continue; // 이미 정수 안분
    if (topLevel(rhs, "/").length > 0 || /[?][^:]*\/[^:]*:/.test(rhs)) out.add(m[1]);
  }
  return out;
}

/** 쉼표 기준 최상위 인자들 */
function topLevelArgs(inner: string): string[] {
  const idx = topLevel(inner, ",");
  const out: string[] = [];
  let prev = 0;
  for (const i of idx) {
    out.push(inner.slice(prev, i).trim());
    prev = i + 1;
  }
  out.push(inner.slice(prev).trim());
  return out;
}

/** `applyRate(amount, <나눗셈>)` 인가 — 둘째 인자에 최상위 `/`가 있다. 비율 변수(`…Ratio`)도 같은 취급. */
export function classifyApplyRate(inner: string): Shape | null {
  const args = topLevelArgs(inner);
  if (args.length < 2) return null;
  const rate = args[1];
  if (topLevel(rate, "/").length > 0) return "A";
  if (/^[A-Za-z_$][\w$.]*Ratio$/.test(rate)) return "A";
  return null;
}

interface Hit {
  key: string;
  file: string;
  line: number;
  shape: Shape;
  text: string;
}

/** `applyRate(...)` 호출 중 A 모양만 모은다. 주석 줄은 건너뛴다. */
export function scanApplyRate(file: string, src: string): Hit[] {
  const hits: Hit[] = [];
  const lines = src.split("\n");
  let idx = 0;
  for (;;) {
    const at = src.indexOf("applyRate(", idx);
    if (at === -1) break;
    idx = at + 1;
    if (at > 0 && /[\w$.]/.test(src[at - 1])) continue; // `xxxApplyRate(` 같은 접미 이름은 제외
    const open = at + "applyRate".length;
    const close = matchParen(src, open);
    if (close === -1) break;
    const inner = src.slice(open + 1, close);
    const line = src.slice(0, at).split("\n").length;
    const lineText = (lines[line - 1] ?? "").trim();
    if (lineText.startsWith("//") || lineText.startsWith("*") || lineText.startsWith("/*")) continue;
    const shape = classifyApplyRate(inner);
    const norm = inner.replace(/\s+/g, " ").trim();
    if (shape) hits.push({ key: `${file}::applyRate(${norm})`, file, line, shape, text: norm.slice(0, 120) });
  }
  return hits;
}

export function scan(file: string, src: string): Hit[] {
  const hits: Hit[] = [];
  const ratioVars = ratioVariables(src);
  const lines = src.split("\n");
  let idx = 0;
  for (;;) {
    const at = src.indexOf("Math.floor(", idx);
    if (at === -1) break;
    idx = at + 1;
    const open = at + "Math.floor".length;
    const close = matchParen(src, open);
    if (close === -1) break;
    const inner = src.slice(open + 1, close);
    const line = src.slice(0, at).split("\n").length;
    const lineText = (lines[line - 1] ?? "").trim();
    if (lineText.startsWith("//") || lineText.startsWith("*") || lineText.startsWith("/*")) continue;
    const norm = inner.replace(/\s+/g, " ").trim();
    const shape = classify(inner, ratioVars);
    if (shape) hits.push({ key: `${file}::${norm}`, file, line, shape, text: norm.slice(0, 120) });
  }
  return hits;
}

describe("환산·비율 안분 정밀도 — 분자·분모 정수 곱셈 먼저 (safeMultiplyThenDivide)", () => {
  it("🔴 고친 파일 11개에 위험한 `Math.floor` 모양이 0건이다 (허용 목록 제외)", () => {
    const found: Hit[] = [];
    for (const file of GUARDED_FILES) {
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const h of scan(file, src)) if (!(h.key in ALLOWED)) found.push(h);
    }
    const msg = found.map((h) => `  ${h.file}:${h.line} [${h.shape}]\n    Math.floor(${h.text})`).join("\n");
    expect(
      found,
      `부동소수 환산·비율 안분 ${found.length}건 — safeMultiplyThenDivide/calculateEstimatedAcquisitionPrice/apportionByStdPrice로 바꿀 것:\n${msg}`,
    ).toHaveLength(0);
  });

  it("🔴 일반건물 양도비 배분 파일에 `applyRate(금액, a / b)` 모양이 0건이다", () => {
    const found: Hit[] = [];
    for (const file of APPLY_RATE_GUARDED_FILES) {
      found.push(...scanApplyRate(file, readFileSync(join(ROOT, file), "utf8")));
    }
    const msg = found.map((h) => `  ${h.file}:${h.line} [${h.shape}]\n    applyRate(${h.text})`).join("\n");
    expect(found, `applyRate 비율 인자가 나눗셈 ${found.length}건 — apportionByStdPrice/safeMultiplyThenDivide로 바꿀 것:\n${msg}`).toHaveLength(0);
  });

  it("허용 목록의 모든 항목이 실제로 존재한다 — 낡은 허용 항목이 가드를 조용히 약화시키지 않는다", () => {
    const keys = new Set<string>();
    for (const file of GUARDED_FILES) {
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const h of scan(file, src)) keys.add(h.key);
    }
    for (const k of Object.keys(ALLOWED)) expect(keys.has(k), `낡은 허용 항목: ${k}`).toBe(true);
  });
});

describe("가드 자체의 구별력 — 규칙이 실제로 무언가를 잡는가", () => {
  it("🔑 R 모양: `a * (b / c)`", () => {
    expect(classify("partTransferPrice * (partStdAtAcq / partStdAtTransfer)")).toBe("R");
    expect(classify("a * (b / c) * d")).toBe("R");
  });
  it("🔑 P 모양: `a * b / c` · `(a * b) / c`", () => {
    expect(classify("firstDisclosureHousingPrice * sumAtAcquisition / sumAtFirstDisclosure")).toBe("P");
    expect(classify("(r.singleInput.transferPrice * (r.singleInput.standardPriceAtAcquisition ?? 0)) / tsfStd")).toBe("P");
  });
  it("🔑 RV 모양: `금액 * <나눗셈으로 만든 비율 변수>`", () => {
    const vars = ratioVariables("const housRatio = totalFloor > 0 ? a / totalFloor : 0;\nconst x = 1;");
    expect(vars.has("housRatio")).toBe(true);
    expect(vars.has("x")).toBe(false);
    expect(classify("acqCommTotal * housRatio", vars)).toBe("RV");
    expect(classify("acqCommTotal * share", new Set())).toBeNull(); // 이름이 Ratio로 끝나지 않으면 선언(ratioVariables)을 봐야 한다 — scan이 파일 단위로 채운다
    expect(classify("acqCommTotal * share", new Set(["share"]))).toBe("RV");
    expect(classify("total * landRatio")).toBe("RV"); // 함수 인자 비율은 이름(…Ratio)으로 잡는다
  });
  it("🔑 정본 안분으로 만든 변수는 비율 변수가 아니다", () => {
    expect(ratioVariables("const landAcq = safeMultiplyThenDivide(a, b, c);").size).toBe(0);
    expect(ratioVariables("const q = Math.floor(a / b);").size).toBe(0);
  });
  it("🔑 안전한 식은 잡지 않는다", () => {
    expect(classify("a / b")).toBeNull();
    expect(classify("a * b")).toBeNull();
    expect(classify("a * 0.5")).toBeNull();
    expect(classify("totalAcqPrice / 2")).toBeNull();
    expect(classify("x / (a * b)")).toBeNull(); // 분모의 곱
  });
  it("🔑 A 모양: `applyRate(금액, a / b)` · 비율 변수 — 세율 상수는 잡지 않는다", () => {
    expect(classifyApplyRate("totalTransferExpense, landTransferPrice / transferPriceTotal")).toBe("A");
    expect(classifyApplyRate("amount, basis(c) / basisTotal")).toBe("A");
    expect(classifyApplyRate("amount, landRatio")).toBe("A");
    expect(classifyApplyRate("amount, 0.5")).toBeNull();
    expect(classifyApplyRate("amount, rate")).toBeNull();
    expect(classifyApplyRate("fn(a, b), 0.3")).toBeNull(); // 안쪽 쉼표는 인자 구분이 아니다
    const src = "// applyRate(a, b / c)\nconst x = applyRate(a, b / c);\nconst y = reapplyRate(a, b / c);\nconst z = applyRate(a, 0.5);\n";
    const hits = scanApplyRate("t.ts", src);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(2);
  });
  it("🔑 scan: 주석 안의 인용은 세지 않는다", () => {
    const src = "// Math.floor(a * (b / c))\n/* Math.floor(a * b / c) */\nconst y = Math.floor(a * (b / c));\n";
    expect(scan("t.ts", src)).toHaveLength(1);
    expect(scan("t.ts", src)[0].line).toBe(3);
  });
});
