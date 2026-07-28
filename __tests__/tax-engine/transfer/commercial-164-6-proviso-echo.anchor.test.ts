/**
 * anchor — §164⑥ 단서 판정 echo (`sec164_5ProvisoApplicable`).
 *
 * 이 플래그는 **산출 근거 표시 전용**이다. 취득당시 건물 기준시가가 실제로 §164⑤로 산정됐는지는
 * 엔진이 알 수 없으므로(준용에 필요한 신축연도·구조·용도가 엔진 input에 없다) **계산은 바뀌지 않는다.**
 * → 판정값만 검증하고, 같은 입력의 금액이 취득연도와 무관하게 동일함을 함께 못박는다.
 *
 * 취득연도는 API 신규 필드가 아니라 `TransferTaxInput.acquisitionDate`에서 파생된다.
 *
 * 계획서: docs/01-plan/features/commercial-164-6-proviso-164-5-application.plan.md §5-3
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateCommercialBuildingValuation } from "@/lib/tax-engine/commercial-building-valuation";
import { calcSec164_8AdjustedDenominator } from "@/lib/tax-engine/commercial-building-valuation";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** C-01(pre_disclosure) 상가 — 취득일만 바꿔가며 판정을 본다. */
function preDisclosureInput(acquisitionDate: string): TransferTaxInput {
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
      buildingStdPriceAtAcquisition: 120_000_000,
      buildingStdPriceAtFirstDisclosure: 150_000_000,
      landPriceAtAcquisition: 1_000_000,
      landPriceAtFirstDisclosure: 1_500_000,
      landPriceAtTransfer: 3_000_000,
    },
  });
}

function detailOf(acquisitionDate: string) {
  const r = calculateTransferTax(preDisclosureInput(acquisitionDate), rates);
  return r.commercialBuildingValuationDetail;
}

describe("§164⑥ 단서 판정 echo", () => {
  it("취득 1998 → 단서 해당(나목 가액 부재 구간)", () => {
    expect(detailOf("1998-05-10")?.sec164_5ProvisoApplicable).toBe(true);
  });

  it("경계 — 2000-12-31 해당 / 2001-01-01 미해당", () => {
    expect(detailOf("2000-12-31")?.sec164_5ProvisoApplicable).toBe(true);
    expect(detailOf("2001-01-01")?.sec164_5ProvisoApplicable).toBe(false);
  });

  it("2003 취득은 나목 가액이 있어 미해당", () => {
    expect(detailOf("2003-05-10")?.sec164_5ProvisoApplicable).toBe(false);
  });

  it("★ 판정은 계산을 바꾸지 않는다 — 취득연도가 달라도 환산 금액이 동일하다", () => {
    const a = detailOf("1998-05-10")!;
    const b = detailOf("2003-05-10")!;
    expect(a.estimatedBasisAtAcq).toBe(b.estimatedBasisAtAcq);
    expect(a.estimatedAcquisitionTotal).toBe(b.estimatedAcquisitionTotal);
    expect(a.estimatedDeductionTotal).toBe(b.estimatedDeductionTotal);
  });

  it("acquisitionYear 미지정 시 판정을 생략한다 (엔진 직접 호출)", () => {
    const r = calculateCommercialBuildingValuation(
      {
        isPreDisclosure: true,
        exclusiveArea: 150,
        commonArea: 50,
        landArea: 100,
        unitPriceAtTransfer: 2_500_000,
        unitPriceAtFirstDisclosure: 1_200_000,
        buildingStdPriceAtAcquisition: 120_000_000,
        buildingStdPriceAtFirstDisclosure: 150_000_000,
        landPriceAtAcquisition: 1_000_000,
        landPriceAtFirstDisclosure: 1_500_000,
      },
      1_000_000_000,
    );
    expect(r.sec164_5ProvisoApplicable).toBeUndefined();
  });

  it("C-02(post_disclosure)는 §164⑥ 경로가 아니므로 판정이 없다", () => {
    const r = calculateCommercialBuildingValuation(
      {
        isPreDisclosure: false,
        exclusiveArea: 150,
        commonArea: 50,
        landArea: 100,
        unitPriceAtTransfer: 2_500_000,
        unitPriceAtAcquisition: 1_000_000,
        acquisitionYear: 1998,
      },
      1_000_000_000,
    );
    expect(r.sec164_5ProvisoApplicable).toBeUndefined();
  });
});

/**
 * S-01~S-04 — §164⑥ 산식 괄호 단서(취득당시 합계액 == 최초고시당시 합계액 → §164⑧ 준용) 탐지.
 * 계획서: docs/01-plan/features/commercial-164-6-same-value-164-8-proviso.plan.md
 */
describe("§164⑥ 괄호 단서 — §164⑧ 준용 대상 탐지", () => {
  /** 두 시점 기준시가합을 동일하게 맞춘 입력 (토지·건물 모두 동일) */
  const sameSums = {
    isPreDisclosure: true as const,
    exclusiveArea: 150,
    commonArea: 50,
    landArea: 100,
    unitPriceAtTransfer: 2_500_000,
    unitPriceAtFirstDisclosure: 1_200_000,
    buildingStdPriceAtAcquisition: 120_000_000,
    buildingStdPriceAtFirstDisclosure: 120_000_000,
    landPriceAtAcquisition: 1_000_000,
    landPriceAtFirstDisclosure: 1_000_000,
  };

  it("S-01: 두 합계액이 같으면 플래그가 선다", () => {
    const r = calculateCommercialBuildingValuation(sameSums, 1_000_000_000);
    expect(r.combinedStdAtAcq).toBe(r.combinedStdAtFirst);
    expect(r.sec164_8ProvisoApplicable).toBe(true);
  });

  it("S-02: 합계액이 다르면 플래그가 없다", () => {
    const r = calculateCommercialBuildingValuation(
      { ...sameSums, buildingStdPriceAtFirstDisclosure: 150_000_000 },
      1_000_000_000,
    );
    expect(r.sec164_8ProvisoApplicable).toBeUndefined();
  });

  it("S-03: C-02(post_disclosure)는 대상이 아니다", () => {
    const r = calculateCommercialBuildingValuation(
      {
        isPreDisclosure: false,
        exclusiveArea: 150,
        commonArea: 50,
        landArea: 100,
        unitPriceAtTransfer: 2_500_000,
        unitPriceAtAcquisition: 2_500_000,
      },
      1_000_000_000,
    );
    expect(r.sec164_8ProvisoApplicable).toBeUndefined();
  });

  it("S-04: ★ 탐지는 계산을 바꾸지 않는다 — 비율 1 그대로 산출된다", () => {
    const r = calculateCommercialBuildingValuation(sameSums, 1_000_000_000);
    // 합계액이 같으므로 비율 = 1 → P_A = 최초고시 호별총액
    expect(r.estimatedBasisAtAcq).toBe(r.unitPriceTotalAtFirst);
    expect(r.estimatedAcquisitionTotal).toBeGreaterThan(0);
  });
});

/**
 * S-05~S-10 — §164⑧ 준용 **산정**.
 *   취득당시 기준시가 = 최초고시 기준시가 × A / [A + (A − B) × C/D]
 * 캡 결정(계획서 §0-1): C/D 100% 한도 **적용** / 분모 하한(≥A) **미적용**.
 */
describe("§164⑧ 준용 산정", () => {
  // A = floor(1,000,000 × 100) + 120,000,000 = 220,000,000 (취득·최초고시 동일)
  const base = {
    isPreDisclosure: true as const,
    exclusiveArea: 150,
    commonArea: 50,
    landArea: 100,
    unitPriceAtTransfer: 2_500_000,
    unitPriceAtFirstDisclosure: 1_200_000,
    buildingStdPriceAtAcquisition: 120_000_000,
    buildingStdPriceAtFirstDisclosure: 120_000_000,
    landPriceAtAcquisition: 1_000_000,
    landPriceAtFirstDisclosure: 1_000_000,
  };
  const A = 220_000_000;
  /** 최초고시 호별총액 = floor(1,200,000 × 200) */
  const F = 240_000_000;

  it("S-05: 분모 산식 — A + (A−B) × C/D", () => {
    // B=200,000,000 · C=6 · D=12 → 분모 = 220,000,000 + 20,000,000 × 0.5 = 230,000,000
    expect(calcSec164_8AdjustedDenominator(A, 200_000_000, 6, 12)).toBe(230_000_000);
  });

  it("S-06: C/D에 100% 한도를 적용한다 (시행규칙 §80①1호가목)", () => {
    // C=120·D=12 → 비율 10이지만 1로 제한 → 분모 = 220,000,000 + 20,000,000 = 240,000,000
    expect(calcSec164_8AdjustedDenominator(A, 200_000_000, 120, 12)).toBe(240_000_000);
  });

  it("S-07: 분모 하한(≥A)은 적용하지 않는다 — A<B(기준시가 하락) 구간", () => {
    // B=240,000,000 > A → 분모 = 220,000,000 − 20,000,000 × 0.5 = 210,000,000 (< A)
    expect(calcSec164_8AdjustedDenominator(A, 240_000_000, 6, 12)).toBe(210_000_000);
  });

  it("S-08: B·C가 없으면 null — 준용 산정 불가(탐지만)", () => {
    expect(calcSec164_8AdjustedDenominator(A, undefined, 6, 12)).toBeNull();
    expect(calcSec164_8AdjustedDenominator(A, 200_000_000, undefined, 12)).toBeNull();
  });

  it("S-09: 준용이 적용되면 P_A가 낮아진다 (분모 > A)", () => {
    const withProviso = calculateCommercialBuildingValuation(
      { ...base, prevStdPriceSum: 200_000_000, holdingMonthsToFirstDisclosure: 6, stdPriceAdjustMonths: 12 },
      1_000_000_000,
    );
    const without = calculateCommercialBuildingValuation(base, 1_000_000_000);

    // 준용 미적용: 비율 1 → P_A = F
    expect(without.estimatedBasisAtAcq).toBe(F);
    expect(without.sec164_8AdjustedDenominator).toBeUndefined();

    // 준용 적용: P_A = floor(F × A / 230,000,000) < F
    expect(withProviso.sec164_8AdjustedDenominator).toBe(230_000_000);
    expect(withProviso.estimatedBasisAtAcq).toBe(Math.floor((F * A) / 230_000_000));
    expect(withProviso.estimatedBasisAtAcq!).toBeLessThan(without.estimatedBasisAtAcq!);
  });

  it("S-10: D 미지정 시 12개월을 적용한다", () => {
    const r = calculateCommercialBuildingValuation(
      { ...base, prevStdPriceSum: 200_000_000, holdingMonthsToFirstDisclosure: 6 },
      1_000_000_000,
    );
    expect(r.sec164_8AdjustedDenominator).toBe(230_000_000); // C/D = 6/12 = 0.5
  });
});
