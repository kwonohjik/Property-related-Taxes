/**
 * 감사 결함 회귀 테스트 — resolveAcquisitionOverride salesCase 경로 미무력화
 *
 * findingRef: transfer-tax-acquisition-override.ts:88 (plausible / building-val-ext)
 *
 * 결함: resolveAcquisitionOverride는 override 적용 시 환산(useEstimatedAcquisition=false)과
 *   감정가액(acquisitionMethod "appraisal"→"actual", appraisalValue=undefined)만 무력화하고,
 *   동일 성격의 추계 경로인 매매사례가액(acquisitionMethod="salesCase", similarSalesValue)은
 *   그대로 두었다. calcTransferGain salesCase 분기(transfer-tax-helpers.ts:339-348)는
 *   acquisitionCostBase = input.similarSalesValue ?? input.acquisitionPrice 를 사용하므로,
 *   override로 강제한 취득가액이 완전히 우회되어 세액이 과소/오산정된다.
 *
 * 법적 근거: 소득세법 §97의2④ 가업상속 의제취득가액(및 override 계약 일반)은
 *   §176의2③1호 매매사례가액 추계보다 우선 강제되어야 함.
 *   JSDoc 계약: "STEP 2 결정 결과 무시하고 본 값 강제".
 *
 * 기대값 독립 도출(자기확증 금지):
 *   양도가 700,000,000, override 취득가 300,000,000, 필요경비 0.
 *   법령상 올바른 값 = override가 취득가로 강제되어야 하므로
 *   양도차익 = 700,000,000 − 300,000,000 = 400,000,000.
 *   (매매사례가액 similarSalesValue=400,000,000 은 무시되어야 함 → 오답 300,000,000)
 *
 *   기존 감정가액 대칭 테스트(TRP-OVERRIDE-CROSS-2)와 구조 동일 —
 *   감정가액 400,000,000 무시 후 override 300,000,000 적용 시 400,000,000 이 되는 것과 같은 원리.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

describe("AUDIT-FIX: 매매사례가액 모드 + acquisitionOverride → similarSalesValue 추계 우회", () => {
  it("acquisitionMethod='salesCase' + similarSalesValue=400M + override=300M → 취득가 300M 강제, 차익 400M", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 700_000_000,
      acquisitionPrice: 0,
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2024-06-01"),
      acquisitionMethod: "salesCase", // §176의2③1호 매매사례가액 추계 모드
      similarSalesValue: 400_000_000, // override 시 무시되어야 할 추계값
      standardPriceAtAcquisition: 0, // 개산공제 = 0 (필요경비 0으로 간소화)
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      annualBasicDeductionUsed: 2_500_000,
    });

    // 사전 확인: override 없을 때는 매매사례가액 400M 기준 → 차익 300M (700M − 400M)
    const baseResult = calculateTransferTax(input, mockRates);
    expect(baseResult.transferGain).toBe(300_000_000);

    // override=300M → salesCase 추계 경로 무력화되고 실가 300M 강제
    const overrideResult = calculateTransferTax(input, mockRates, {
      acquisitionOverride: 300_000_000,
    });

    // 법령상 올바른 값: override 취득가 300M → 차익 400M
    expect(overrideResult.transferGain).toBe(400_000_000);
    // 결함이 남아있으면 similarSalesValue(400M) 기준 차익 300M 이 반환됨
    expect(overrideResult.transferGain).not.toBe(300_000_000);
    // 추계 경로가 우회되었으므로 환산/추계 플래그도 꺼져야 함
    expect(overrideResult.usedEstimatedAcquisition).toBe(false);
  });
});
