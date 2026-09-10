/**
 * 정적 가드 — **「단가 × 면적」은 `multiplyByArea()`로만 곱한다.**
 *
 * `Math.floor(unitPrice * area)`는 **1원 과소산정**한다(면적의 이진 배정도 표현 오차를
 * `floor`가 1원으로 확대). 단가 5,000,000원 기준 면적 0.01~2000.00㎡ 전수 20만 개 중
 * **11,105건(5.6%)**, 방향은 **항상 과소**다. 상세·실증: `area-utils.ts`의
 * `multiplyByArea` JSDoc과 `__tests__/tax-engine/unit-price-area-precision.anchor.test.ts`.
 *
 * ## 판정 순서가 중요하다
 *
 * `perSqm`·`pricePerSqm`·`sqmAtAcq`는 「Sqm」을 포함하지만 **단가**다.
 * **단가를 먼저 판정하고 남은 것만 면적으로 본다** — 순서를 바꾸면 단가가 면적으로
 * 오분류돼 76행 중 61행을 놓친다(실측). 형태를 열거하지 말고 역할로 가른다
 * (memory `feedback_regex_charclass_undercounts_population`).
 *
 * ## ⛔ 대상이 아닌 것
 *
 * 1. **`area-utils.ts` 자신** — 표준 구현체다.
 * 2. **3항 이상 곱** — `단가 × 면적 × 지분`은 **지분을 언제 적용하는지**를 먼저 정해야 한다
 *    (`applyRatio`가 저장소의 지분 단일 규약이므로 `applyRatio(multiplyByArea(p, a), r)`가
 *    유력하나, floor가 한 번 더 들어가 결과가 갈린다). 판정하지 않은 형태에 하드게이트를
 *    걸지 않는다 — 남은 곳은 **4행**이고 아래 래칫이 잠근다:
 *    `NblLandAutoFetch.tsx:65·66`(단가×면적×지분) ·
 *    `comprehensive-land-parcels.ts:58`·`comprehensive-land-prior-year.ts:74`
 *    (면적×지분율×단가 — 종부세 토지).
 *    ⚠️ 이 목록을 처음엔 「2행」이라 적었다가 **이 가드가 4행임을 잡아냈다**. 모집단은
 *    세어 보기 전에는 모른다(`feedback_closure_claim_scoped_to_verified_subset`).
 * 3. **나눗셈이 섞인 안분** — `floor(금액 × 면적 / 전체면적)`은 다른 규약이다
 *    (`feedback_safemul_decimal_apportion_precision` — 면적 직접 안분).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name !== "node_modules") walk(rel, out);
    } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** ⚠️ 단가를 **먼저** 판정한다 — `perSqm`은 「Sqm」을 포함하지만 단가다. */
export function isUnitPrice(expr: string): boolean {
  return (
    /per\s*_?(sqm|m2)/i.test(expr) ||
    /price/i.test(expr) ||
    /\bsqmAt/i.test(expr) ||
    /단가|공시|기준시가/.test(expr)
  );
}

/** 단가가 아닌 것 중 면적인 것. */
export function isAreaExpr(expr: string): boolean {
  return (
    !isUnitPrice(expr) &&
    (/area/i.test(expr) || /면적/.test(expr) || /\bsqm\b/i.test(expr) || /m2\b/i.test(expr))
  );
}

/** `Math.floor(` 의 괄호를 균형 잡아 닫는 위치. 정규식으로 자르면 중첩 호출에서 깨진다. */
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

/** 괄호 밖 최상위 `*` 위치. */
function topLevelStars(s: string): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "*" && depth === 0) out.push(i);
  }
  return out;
}

/** 그 `Math.floor(...)` 인자가 「단가 × 면적」 2항 곱인가. */
export function isUnitPriceTimesArea(inner: string): boolean {
  if (/[/%]/.test(inner)) return false; // 나눗셈 섞인 안분은 다른 규약
  const stars = topLevelStars(inner);
  if (stars.length !== 1) return false; // 3항 이상은 미판정
  const left = inner.slice(0, stars[0]).trim();
  const right = inner.slice(stars[0] + 1).trim();
  if (!left || !right) return false;
  return (
    (isAreaExpr(right) && isUnitPrice(left)) || (isAreaExpr(left) && isUnitPrice(right))
  );
}

interface Site {
  file: string;
  line: number;
  text: string;
}

const violations: Site[] = [];
const multiTerm: Site[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (/__tests__|\.test\.|\.spec\./.test(file)) continue;
    if (file.endsWith("lib/tax-engine/area-utils.ts")) continue; // 표준 구현체
    const src = readFileSync(join(ROOT, file), "utf8");
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
      const text = inner.replace(/\s+/g, " ").trim().slice(0, 110);
      // 주석 안의 인용은 세지 않는다
      const lineText = src.split("\n")[line - 1]?.trim() ?? "";
      if (lineText.startsWith("//") || lineText.startsWith("*")) continue;

      if (isUnitPriceTimesArea(inner)) {
        violations.push({ file, line, text });
        continue;
      }
      // 3항 이상 곱에 면적·단가가 함께 있으면 «미판정»으로 따로 센다
      const stars = topLevelStars(inner);
      if (stars.length >= 2 && !/[/%]/.test(inner)) {
        const parts = inner.split("*").map((p) => p.trim());
        if (parts.some(isAreaExpr) && parts.some(isUnitPrice)) {
          multiTerm.push({ file, line, text });
        }
      }
    }
  }
}

describe("단가 × 면적 정밀도 — multiplyByArea()만 쓴다", () => {
  it("🔴 `Math.floor(단가 * 면적)`이 0건이다", () => {
    const msg = violations.map((v) => `  ${v.file}:${v.line}\n    Math.floor(${v.text})`).join("\n");
    expect(
      violations,
      `부동소수 단가×면적 ${violations.length}건 — multiplyByArea()로 바꿀 것:\n${msg}`,
    ).toHaveLength(0);
  });

  /**
   * 🔒 3항 이상 곱(`단가 × 면적 × 지분`)은 **지분 적용 순서 판정이 먼저**라 남겨 뒀다.
   * 실측 4행(NBL 자동조회 2 · 종부세 토지 2). **늘리지 않는다** — 새로 쓰려면 순서를 먼저
   * 정하고 위 문서 주석에 근거를 적을 것.
   */
  it("🔒 미판정 3항 곱 래칫 — 4행 이하 (줄이기만 한다)", () => {
    const msg = multiTerm.map((v) => `  ${v.file}:${v.line}\n    Math.floor(${v.text})`).join("\n");
    expect(multiTerm.length, `미판정 3항 곱:\n${msg}`).toBeLessThanOrEqual(4);
  });
});

describe("가드 자체의 구별력 — 규칙이 실제로 무언가를 잡는가", () => {
  it("🔑 단가 × 면적을 잡는다", () => {
    expect(isUnitPriceTimesArea("price * area")).toBe(true);
    expect(isUnitPriceTimesArea("landPricePerSqm * landArea")).toBe(true);
    expect(isUnitPriceTimesArea("acqArea * sqmAtAcq")).toBe(true);
  });

  it("🔑 `perSqm`을 면적으로 오분류하지 않는다 — 이 순서가 61행을 갈랐다", () => {
    expect(isUnitPrice("perSqm")).toBe(true);
    expect(isAreaExpr("perSqm")).toBe(false);
    expect(isUnitPriceTimesArea("perSqm * area")).toBe(true);
  });

  it("🔑 단가 × 비율은 잡지 않는다 — 면적이 아니다", () => {
    expect(isUnitPriceTimesArea("input.pricePerSqm_1990 * appliedRatio")).toBe(false);
  });

  it("🔑 나눗셈이 섞인 안분은 잡지 않는다 — 다른 규약이다", () => {
    expect(isUnitPriceTimesArea("(totalPrice * areas[i]) / total")).toBe(false);
    expect(isUnitPriceTimesArea("phdBuilding * nonResArea / totalFloor")).toBe(false);
  });

  it("🔑 3항 곱은 «위반»으로 세지 않는다 — 미판정 래칫으로 간다", () => {
    expect(isUnitPriceTimesArea("cur.pricePerSqm * area * ratio")).toBe(false);
  });
});
