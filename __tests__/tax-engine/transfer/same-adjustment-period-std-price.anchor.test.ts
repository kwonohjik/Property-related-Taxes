/**
 * 동일조정기간 내 취득·양도 시 「양도당시 기준시가」 환산 — Pre-Do anchor
 *
 * 계획: docs/00-pm/transfer-same-adjustment-period-std-price.plan.md
 * 근거: 소득세법 시행령 §164⑧ · 소득세법 시행규칙 §80①~⑤ (KoreanLaw MCP 실측)
 *
 * A-1·A-2는 교재(집행기준 해설) 계산사례 2건의 **손계산 확정값**이다.
 * 현행 엔진은 트리거가 `transferYear === acquisitionYear`(연도 동일)라 두 사례 모두
 * 도달하지 못한다 — 이 anchor가 그 갭을 고정한다(계획 §3-1).
 */

import { describe, it, expect } from "vitest";
import {
  calcStdPriceMonths,
  classifySameAdjustmentPeriod,
  calcSameAdjustmentPeriodStdPrice,
} from "../../../lib/tax-engine/same-adjustment-period-std-price";

const D = (s: string) => new Date(`${s}T00:00:00`);

describe("SAP — §80⑤ 월수 (초일산입 + 1월 미만 절상)", () => {
  // A-8: 응당일 도달 후 끝수 4일 → 절상. 현행 monthsBetween은 9를 반환(계획 §3-2 실측).
  it("A-8 응당일 도달 + 끝수 → 절상 (2005-09-07 → 2006-06-10 = 10월)", () => {
    expect(calcStdPriceMonths(D("2005-09-07"), D("2006-06-10"))).toBe(10);
  });

  it("A-8b 응당일 미도달 (2005-07-28 → 2006-03-24 = 8월)", () => {
    expect(calcStdPriceMonths(D("2005-07-28"), D("2006-03-24"))).toBe(8);
  });

  it("A-8c 1월 미만 = 1월 (§80⑤)", () => {
    expect(calcStdPriceMonths(D("2005-07-01"), D("2005-07-02"))).toBe(1);
  });

  it("A-8d 정확히 응당일 = 끝수 없음 (2005-07-01 → 2006-06-30 = 12월)", () => {
    expect(calcStdPriceMonths(D("2005-07-01"), D("2006-06-30"))).toBe(12);
  });

  // A-11: §164⑥ 준용 C(취득일 ~ 상가 최초고시일 2005-01-01)의 월수 경계.
  // 종전 `transfer-tax-commercial-step.ts` private 헬퍼는 응당일 도달 후 끝수를 버려
  // 10을 반환했다. V-1 실측 결과 이 축을 검증하는 테스트가 **하나도 없었다**(회귀 0건)
  // — 그래서 정정 후 동작을 여기서 고정한다.
  it("A-11 §164⑥ 준용 C 경계: 2004-03-01 → 2005-01-01 = 11월 (종전 10)", () => {
    expect(calcStdPriceMonths(D("2004-03-01"), D("2005-01-01"))).toBe(11);
  });

  it("A-11b §164⑥ 준용 C: 응당일 미도달은 종전과 동일 (2004-03-15 → 2005-01-01 = 10월)", () => {
    expect(calcStdPriceMonths(D("2004-03-15"), D("2005-01-01"))).toBe(10);
  });

  // 말일 특례 — 응당일이 대상 월의 마지막 날을 넘지 않게 clamp (민법 §160③ 취지)
  it("A-13 말일 clamp: 2005-01-31 → 2005-02-28 = 1월", () => {
    expect(calcStdPriceMonths(D("2005-01-31"), D("2005-02-28"))).toBe(1);
  });
});

describe("SAP — 적용 요건 판정 (§164⑧ + §80①)", () => {
  const base = {
    standardPriceAtAcquisition: 161_000_000,
    standardPriceAtTransfer: 161_000_000,
    acquisitionDate: D("2005-07-28"),
    transferDate: D("2006-03-24"),
  };

  it("A-1g 두 기준시가 동일 + 다음 연도 말일 이전 → clause_1", () => {
    expect(classifySameAdjustmentPeriod(base)).toBe("clause_1");
  });

  // A-4: 기간요건 미충족 → §80①2호 (취득당시 기준시가 그대로)
  it("A-4 기간요건 미충족(취득연도+2년) → clause_2", () => {
    expect(
      classifySameAdjustmentPeriod({
        ...base,
        acquisitionDate: D("2005-03-01"),
        transferDate: D("2007-06-01"),
      }),
    ).toBe("clause_2");
  });

  it("A-4b 다음 연도 말일 당일은 포함 (2005 취득 → 2006-12-31 양도)", () => {
    expect(
      classifySameAdjustmentPeriod({ ...base, transferDate: D("2006-12-31") }),
    ).toBe("clause_1");
  });

  // A-5: 트리거 미성립 — 두 기준시가가 다르면 §164⑧ 자체가 적용되지 않는다
  it("A-5 두 기준시가 상이 → not_applicable", () => {
    expect(
      classifySameAdjustmentPeriod({ ...base, standardPriceAtTransfer: 170_000_000 }),
    ).toBe("not_applicable");
  });
});

describe("SAP — 산식 (§80①1호 가목·나목)", () => {
  // ── A-1 교재 사례1 (가목) ───────────────────────────────────────────
  // 공동주택. 취득 2005-07-28 취득당시 161,000,000(2005-07-01 고시)
  //           전기 149,000,000(2004-07-01 고시) · 양도 2006-03-24 · 새 고시 2006-07-01
  // 조정월수 = 2004-07-01 ~ 2005-06-30 = 12월
  // 보유월수 = 2005-07-28 ~ 2006-03-24 = 8월
  // 161,000,000 + (161,000,000 − 149,000,000) × 8/12 = 169,000,000
  it("A-1 교재 사례1 (가목): 169,000,000", () => {
    const r = calcSameAdjustmentPeriodStdPrice({
      formula: "prev",
      standardPriceAtAcquisition: 161_000_000,
      priorStandardPrice: 149_000_000,
      holdingMonths: 8,
      adjustmentMonths: 12,
    });
    expect(r.value).toBe(169_000_000);
    expect(r.capApplied).toBe(false);
    expect(r.flooredToAcquisition).toBe(false);
  });

  // ── A-2 교재 사례2 (나목) ───────────────────────────────────────────
  // 취득 2005-09-07 취득당시 210,000,000(2005-07-01 고시)
  // 새 220,000,000(2006-07-01 고시) · 양도 2006-06-10
  // 조정월수 = 2005-07-01 ~ 2006-06-30 = 12월 · 보유월수 = 10월
  // 210,000,000 + (220,000,000 − 210,000,000) × 10/12 = 218,333,333 (절사)
  it("A-2 교재 사례2 (나목): 218,333,333", () => {
    const r = calcSameAdjustmentPeriodStdPrice({
      formula: "new",
      standardPriceAtAcquisition: 210_000_000,
      newStandardPrice: 220_000_000,
      holdingMonths: 10,
      adjustmentMonths: 12,
    });
    expect(r.value).toBe(218_333_333);
    expect(r.capApplied).toBe(false);
  });

  // A-3: §80①1호 본문 단서 — 계산값 < 취득당시 → 취득당시
  it("A-3 하한 발동 (가목·하락장: 전기 > 취득당시)", () => {
    const r = calcSameAdjustmentPeriodStdPrice({
      formula: "prev",
      standardPriceAtAcquisition: 149_000_000,
      priorStandardPrice: 161_000_000, // delta < 0
      holdingMonths: 8,
      adjustmentMonths: 12,
    });
    expect(r.value).toBe(149_000_000);
    expect(r.flooredToAcquisition).toBe(true);
  });

  it("A-3b 하한 발동 (나목·하락장: 새 기준시가 < 취득당시)", () => {
    const r = calcSameAdjustmentPeriodStdPrice({
      formula: "new",
      standardPriceAtAcquisition: 210_000_000,
      newStandardPrice: 200_000_000,
      holdingMonths: 10,
      adjustmentMonths: 12,
    });
    expect(r.value).toBe(210_000_000);
    expect(r.flooredToAcquisition).toBe(true);
  });

  // A-6: 100분의 100 한도 — 가목 전용 (§80①1호가목 괄호)
  it("A-6 cap 발동 (가목: 보유월수 > 조정월수 → h' = 조정월수)", () => {
    const r = calcSameAdjustmentPeriodStdPrice({
      formula: "prev",
      standardPriceAtAcquisition: 161_000_000,
      priorStandardPrice: 149_000_000,
      holdingMonths: 20,
      adjustmentMonths: 12,
    });
    // cap → 12/12 = 1 → 161,000,000 + 12,000,000 = 173,000,000
    expect(r.value).toBe(173_000_000);
    expect(r.capApplied).toBe(true);
  });

  // A-10: 파생 불변식 — 하한 발동 ⟺ delta ≤ 0
  it("A-10 불변식: delta > 0이면 항상 취득당시 이상 · flooredToAcquisition=false", () => {
    for (let h = 1; h <= 24; h++) {
      const r = calcSameAdjustmentPeriodStdPrice({
        formula: "prev",
        standardPriceAtAcquisition: 100_000_000,
        priorStandardPrice: 99_999_999, // delta = 1
        holdingMonths: h,
        adjustmentMonths: 12,
      });
      expect(r.value).toBeGreaterThanOrEqual(100_000_000);
      expect(r.flooredToAcquisition).toBe(false);
    }
  });

  it("A-10b 불변식: delta === 0 → 취득당시 · flooredToAcquisition=true", () => {
    const r = calcSameAdjustmentPeriodStdPrice({
      formula: "prev",
      standardPriceAtAcquisition: 100_000_000,
      priorStandardPrice: 100_000_000,
      holdingMonths: 6,
      adjustmentMonths: 12,
    });
    expect(r.value).toBe(100_000_000);
    expect(r.flooredToAcquisition).toBe(true);
  });

  // 정수 연산 — applyRate 부동소수 1원 부족 회피 (계획 §5-1 F-5)
  it("A-12 분수 정수 연산: 1원 오차 없음", () => {
    // delta × h ÷ adj = 10,000 × 1 ÷ 3 = 3,333.33 → floor 3,333
    const r = calcSameAdjustmentPeriodStdPrice({
      formula: "prev",
      standardPriceAtAcquisition: 1_000_000,
      priorStandardPrice: 990_000, // delta = 10,000
      holdingMonths: 1,
      adjustmentMonths: 3,
    });
    expect(r.value).toBe(1_003_333);
  });
});

// ════════════════════════════════════════════════════════════════════
// A-11w — §164⑥ 준용 **배선** anchor (leaf anchor는 배선을 커버하지 않는다)
//
// `transfer-tax-commercial-step.ts`가 C(취득일 ~ 상가 최초고시일 2005-01-01 월수)를
// `calcStdPriceMonths`로 파생해 `holdingMonthsToFirstDisclosure`로 내려보내는 경로를 고정한다.
//
// V-1 실측: 월수 헬퍼를 통째로 바꿔도 **12,168건 중 0건**이 실패했다 — 이 축을 보는 테스트가
// 하나도 없었다. 기존 `commercial-164-6-proviso-echo.anchor.test.ts`가 *"취득연도가 달라도
// 환산 금액이 동일하다"*를 단언하는데, 그 입력에 `prevStdPriceSum`(B)이 없어 §164⑧ 준용
// 분모 자체가 산정되지 않기 때문이다(`commercial-building-valuation.ts:267` — B 없으면 null).
//
// ⇒ B를 넣어 준용 분모를 실제로 발동시키고, **취득일만** 1일 단위로 바꿔 C가 달라질 때
//   환산 취득가액이 따라 움직이는지 본다(구별력 확보).
// ════════════════════════════════════════════════════════════════════
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const ratesA11 = makeMockRates();

function cbInputWithPrev(acquisitionDate: string): TransferTaxInput {
  return baseTransferInput({
    propertyType: "commercial_building",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2021-06-01"),
    acquisitionDate: new Date(acquisitionDate),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    transferCause: "general",
    commercialBuildingValuation: {
      isPreDisclosure: true,
      exclusiveArea: 150,
      commonArea: 50,
      landArea: 100,
      unitPriceAtTransfer: 2_500_000,
      unitPriceAtFirstDisclosure: 1_200_000,
      // 🔑 §164⑧ 준용 게이트(`commercial-building-valuation.ts:268`)는
      //    **취득시 기준시가합 === 최초고시시 기준시가합**일 때만 열린다 — 두 시점을 같게 둔다.
      buildingStdPriceAtAcquisition: 150_000_000,
      buildingStdPriceAtFirstDisclosure: 150_000_000,
      landPriceAtAcquisition: 1_500_000,
      landPriceAtFirstDisclosure: 1_500_000,
      landPriceAtTransfer: 3_000_000,
      // B — 전기의 토지 및 건물 기준시가 합계. 있어야 §164⑧ 준용 분모가 산정된다.
      prevStdPriceSum: 180_000_000,
    },
  });
}

const basisOf = (d: string) =>
  calculateTransferTax(cbInputWithPrev(d), ratesA11).commercialBuildingValuationDetail
    ?.estimatedBasisAtAcq;

describe("A-11w §164⑥ 준용 C 배선 (calcStdPriceMonths 도달)", () => {
  it("준용 분모가 실제로 발동한다 — B 유무로 환산 기준액이 달라진다", () => {
    const withPrev = basisOf("2004-03-01");
    const noPrev = calculateTransferTax(
      {
        ...cbInputWithPrev("2004-03-01"),
        commercialBuildingValuation: {
          ...cbInputWithPrev("2004-03-01").commercialBuildingValuation!,
          prevStdPriceSum: undefined,
        },
      },
      ratesA11,
    ).commercialBuildingValuationDetail?.estimatedBasisAtAcq;
    expect(withPrev).toBeDefined();
    expect(withPrev).not.toBe(noPrev);
  });

  it("★ C가 달라지면 환산 기준액이 움직인다 — 2004-03-01(C=11) ≠ 2004-03-15(C=10)", () => {
    // 두 날짜는 같은 달·같은 연도라 §164⑥ 단서 판정(취득연도 축)은 동일하다.
    // 달라지는 것은 오직 C(월수)뿐이다 → 값이 갈리면 C가 분모까지 도달했다는 뜻.
    expect(calcStdPriceMonths(D("2004-03-01"), D("2005-01-01"))).toBe(11);
    expect(calcStdPriceMonths(D("2004-03-15"), D("2005-01-01"))).toBe(10);
    expect(basisOf("2004-03-01")).not.toBe(basisOf("2004-03-15"));
  });
});
