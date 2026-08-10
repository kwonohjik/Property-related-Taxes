/**
 * C-08: 이월과세 분기 skip — `carryoverTaxation`이 없거나 `acquisitionCause`가 다른 케이스.
 *
 * ## 🔴 이 파일의 원래 전제는 틀렸다 (2026-08-10 정정)
 *
 * 헤더는 이렇게 적고 있었다:
 *
 * > ~~실무에서 "배우자 사망 후 양도" 케이스는 acquisitionCause를 "carryover_gift"가 아닌
 * > 다른 값으로 입력하거나 carryoverTaxation 자체를 생략하여 처리.~~
 *
 * **법리 판단을 사용자에게 떠넘기는 설계**였다 — 「사별이면 §97의2① 미적용」이라는 괄호를
 * 사용자가 알고 있어야만 올바른 `acquisitionCause`를 고를 수 있는데, 화면에 그 안내가 없었다.
 * 그 사이 엔진은 §97의2②3호로 **MAX(적용, 미적용)** 를 취해 과대과세했다(실측 89,630,000).
 *
 * ⇒ 사망 배제는 이제 **정식 입력**(`donorRelation`·`donorDeceased`)으로 판정한다.
 *   그 검증은 `carryover-donor-death.anchor.test.ts`에 있다.
 *
 * ## 이 파일이 지금 지키는 것
 *
 * 아래 단언들은 **사망과 무관하다** — 「carryover_gift가 아니거나 서브객체가 없으면 skip」이라는
 * 진입 조건만 본다. 회귀 방어로서 유효하므로 그대로 둔다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

describe("C-08: 이월과세 비적용 케이스 (acquisitionCause != carryover_gift)", () => {
  /**
   * 배우자 사망 후 양도 시: UI에서 acquisitionCause="gift"(일반 증여) 또는
   * "purchase"로 처리. carryoverTaxation이 없으면 엔진은 skip.
   */
  const inputNoCarryover = baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate: new Date("2025-06-01"),
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2020-01-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 24,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "gift", // 일반 증여 — carryover_gift 아님
    // carryoverTaxation 미입력
  });

  it("C-08-1: carryoverTaxationDetail = undefined (이월과세 분기 skip)", () => {
    const result = calculateTransferTax(inputNoCarryover, MOCK_RATES);
    expect(result.carryoverTaxationDetail).toBeUndefined();
  });

  it("C-08-2: 일반 양도세 계산됨 (기존 gift 경로)", () => {
    const result = calculateTransferTax(inputNoCarryover, MOCK_RATES);
    expect(result.determinedTax).toBeGreaterThanOrEqual(0);
  });
});

describe("C-08b: 이월과세 비적용 — acquisitionCause=carryover_gift 이나 carryoverTaxation 미입력", () => {
  const inputMissing = baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate: new Date("2025-06-01"),
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2020-01-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 24,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    // carryoverTaxation 미입력 → 엔진이 skip
  });

  it("C-08b-1: carryoverTaxation 미입력 시 carryoverTaxationDetail = undefined", () => {
    const result = calculateTransferTax(inputMissing, MOCK_RATES);
    expect(result.carryoverTaxationDetail).toBeUndefined();
  });
});
