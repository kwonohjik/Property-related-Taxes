/**
 * anchor — 상업용건물 §164⑨ 1호 공익수용 특례 (계획 D16-CB).
 *
 * 종전: `transfer-tax.ts:305` STEP 0.35 `runCommercialBuildingStep`이 §164⑥·§176의2②2호 전용
 * 환산 후 `useEstimatedAcquisition: false`로 교체 → `calcTransferGain`의 §164⑨ 게이트 미진입(우회).
 * ⇒ 상가 + 수용 + 환산 시 특례 미적용 → 세액 86,784,934원 과다(probe 실증).
 *
 * 수정: `runCommercialBuildingStep`에서 §164⑨을 판정해 환산 분모(양도시 호별총액)를
 * min[호별고시가, 보상액, 보상기초] × 연면적으로 낮춘다. `applyExpropriationValuation` 재사용
 * (원/㎡ ← unitPriceAtTransfer, 면적 ← floorAreaTotal).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 상가 — 연면적 200㎡(전용 150 + 공용 50), 양도 10억, 호별고시가 2,500,000/㎡ */
function cb(
  overrides: Partial<TransferTaxInput> = {},
  cbOverrides: Record<string, unknown> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "commercial_building",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    transferCause: "public_expropriation",
    compensationPerSqm: 1_500_000,
    compensationBasisStdPrice: 2_000_000,
    commercialBuildingValuation: {
      isPreDisclosure: false,
      exclusiveArea: 150,
      commonArea: 50,
      unitPriceAtTransfer: 2_500_000,
      unitPriceAtAcquisition: 1_000_000,
      ...cbOverrides,
    },
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("상업용건물 §164⑨ 1호 공익수용 특례 (D16-CB)", () => {
  it("C-02 수용+환산 → min[] 적용, 세액 86,784,934원 해소", () => {
    const r = calculateTransferTax(cb(), rates);
    // 양도시 호별총액 = min[2,500,000·1,500,000·2,000,000] × 200㎡ = 300,000,000 (현행 500,000,000)
    // 환산취득가 = floor(10억 × 취득기준시가 2억 / 3억) = 666,666,666 (현행 400,000,000)
    // 양도차익 = 10억 − 666,666,666 − 개산공제 = 327,333,334 (현행 594,000,000)
    expect(r.transferGain).toBe(327_333_334);
    expect(r.calculatedTax).toBe(81_107_066);
    expect(r.expropriationValuationDetail?.denominator).toBe(300_000_000);
  });

  it("게이트 OFF — 수용 아님 → 미적용(현행 594,000,000)", () => {
    const r = calculateTransferTax(cb({ transferCause: "general" }), rates);
    expect(r.transferGain).toBe(594_000_000);
    expect(r.expropriationValuationDetail).toBeUndefined();
  });

  it("게이트 OFF — 양도 2009.02.03 → 미적용", () => {
    const r = calculateTransferTax(
      cb({ transferDate: new Date("2009-02-03"), acquisitionDate: new Date("2000-06-01") }),
      rates,
    );
    expect(r.transferGain).toBe(594_000_000);
  });

  it("게이트 OFF — 보상 후보 미입력 → 미적용", () => {
    const r = calculateTransferTax(cb({ compensationPerSqm: undefined }), rates);
    expect(r.transferGain).toBe(594_000_000);
  });

  // ※ C-01(isPreDisclosure) 별도 anchor는 두지 않는다 — min[] 주입점(`commercial-building-valuation.ts:151`
  //    `unitPriceTotalAtTransfer = unitPriceAtTransfer × 연면적`)이 C-01·C-02에 **동일하게** 전달되므로
  //    (`:154`·`:156`), C-02 세액 anchor가 주입점 정합을 이미 고정한다. C-01은 취득시 기준시가
  //    역환산만 다르고 양도시 호별총액(min[] 대상)은 동일 경로다.
});
