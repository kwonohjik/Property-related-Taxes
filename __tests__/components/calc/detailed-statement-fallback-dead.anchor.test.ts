/**
 * C probe (dynamic) — 상세명세서 fallback 라벨 도달성 실측.
 * 계획서: docs/02-design/features/detailed-statement-formula-inline-values-bc.plan.md §C
 *
 * 배경: DetailedStatement의 여러 행은 `findStepByLabel(steps, kw)?.formula ?? "<fallback>"`.
 *   fallback(라벨만)은 엔진 step이 formula와 함께 emit되면 **dead**(사용자에 노출 안 됨).
 *   본 anchor는 실엔진(calculateTransferTax) 결과에서 각 step이 값-인라인 formula로
 *   존재함을 고정 → fallback이 dead임을 증명하고, 엔진 regress 시 회귀로 검출한다.
 *
 * findStepByLabel은 substring 매칭(label.includes) → "비과세 양도소득금액"이
 *   엔진 라벨 "비과세 양도소득금액 (소령 §161①)"에도 매칭됨.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { findStepByLabel } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";

// 과세 시나리오(비과세 아님) — 다주택 1세대 아님 → 양도소득금액·과세표준·산출세액 등 전체 step emit.
const result = calculateTransferTax(
  baseTransferInput({ isOneHousehold: false, householdHousingCount: 2 }),
  makeMockRates(),
);
const hasDigit = (s: string | undefined) => !!s && /\d/.test(s);

describe("C probe — 상세명세서 단건 행 fallback dead (엔진 step 값-인라인 커버)", () => {
  // 단건 주계산 경로에서 항상(또는 조건부로) emit되는 step. formula가 있으면 Helpers fallback 미도달.
  const KEYWORDS = [
    "양도소득금액", // C1 incomeAmount
    "장기보유특별공제", // C10 ltDeduction
    "기본공제", // C3 basicDeduction (if !skipBasicDeduction)
    "과세표준", // C4 taxBase
    "산출세액", // C11 calculatedTax
    "감면세액", // C5 reductionTax
    "결정세액", // C6 determinedTax
  ] as const;

  it.each(KEYWORDS)("엔진이 '%s' step을 emit → Helpers fallback dead", (kw) => {
    const step = findStepByLabel(result.steps, kw);
    expect(step, `엔진 step "${kw}" 부재 — fallback 도달(라벨만) 위험`).toBeDefined();
    expect(step!.formula, `step "${kw}" formula 없음 — fallback 도달`).toBeTruthy();
  });

  it("금액 행(양도소득금액·과세표준·산출세액·결정세액)은 값 인라인(숫자 포함)", () => {
    for (const kw of ["양도소득금액", "과세표준", "산출세액", "결정세액"]) {
      const step = findStepByLabel(result.steps, kw);
      expect(hasDigit(step?.formula as string | undefined), `"${kw}" 값 미인라인`).toBe(true);
    }
  });

  // 비과세 양도소득금액(C2): 엔진 step은 nontaxableGainAmount>0(임대주택 특례)일 때만 emit.
  // 비-RH 기본 시나리오는 step 부재 → Helpers fallback(값 0) — 행이 "특례 시만 표시"라 무영향.
  // RH 시 엔진 step(transfer-tax-rental-housing-step.ts)이 값-인라인 formula 제공(정적 확인).
  it("비과세 양도소득금액: 비-RH 기본 시나리오에서는 step 부재(행 비표시 대상)", () => {
    expect(findStepByLabel(result.steps, "비과세 양도소득금액")).toBeUndefined();
  });
});
