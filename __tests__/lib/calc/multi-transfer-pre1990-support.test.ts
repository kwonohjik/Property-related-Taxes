/**
 * Pre-Do anchor — 다건 양도 "1990.8.30. 이전 취득 토지 기준시가 환산" 지원
 *
 * 배경: 다건 경로가 pre1990 토지를 명시 차단(validateMultiSupportedMode)하고
 *       buildPropertyPayload가 pre1990Land sub-object를 구성하지 않았다.
 *       엔진(transfer-tax-aggregate → per-asset calculateTransferTax)·Zod·route(⑭)는
 *       이미 pre1990Land를 지원하므로 calc 계층(validate ⑧ + payload ⑬) 2곳만 보완하면 된다.
 *
 * round-3 검증: standardPriceAtAcquisition·standardPriceAtTransfer는 세액뿐 아니라
 *   aggregate 표시 취득가액 재구성(effectiveAcquisitionPrice = transferPrice ×
 *   stdAtAcq / stdAtTransfer)에 load-bearing이므로 양수 전송을 함께 가드한다.
 */

import { describe, it, expect } from "vitest";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculatePre1990LandValuation } from "@/lib/tax-engine/pre-1990-land-valuation";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../tax-engine/_helpers/mock-rates";

/** pre1990 토지 폼 — UI가 auto-fill하는 값을 그대로 재현 (standardPriceAtAcq = grade 산출 취득기준시가). */
function pre1990LandForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-03-01";
  form.contractTotalPrice = "500,000,000";
  form.householdHousingCount = "1";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionDate: "1985-06-01", // < 1990-08-30
    useEstimatedAcquisition: true, // pre1990Enabled 자동 체크의 선행 조건
    pre1990Enabled: true,
    pre1990GradeMode: "value",
    pre1990Grade_current: "100",
    pre1990Grade_prev: "95",
    pre1990Grade_atAcq: "80",
    pre1990PricePerSqm_1990: "50,000",
    acquisitionArea: "100",
    // Pre1990LandValuationInput.onCalculatedPrice가 채우는 취득기준시가(양수) — 표시 재구성에 필수
    standardPriceAtAcq: "40,000,000",
    standardPriceAtTransfer: "80,000,000",
  };
  return form;
}

describe("다건 pre1990 토지 지원", () => {
  it("validateMultiSupportedMode가 더 이상 차단하지 않는다 (File A)", () => {
    expect(validateMultiSupportedMode(pre1990LandForm())).toBeNull();
  });

  it("buildPropertyPayload가 pre1990Land sub-object를 구성한다 (File B)", () => {
    const payload = buildPropertyPayload(pre1990LandForm()) as Record<string, unknown>;
    const pre1990Land = payload.pre1990Land as Record<string, unknown> | undefined;

    expect(pre1990Land).toBeDefined();
    expect(pre1990Land!.acquisitionDate).toBe("1985-06-01");
    expect(pre1990Land!.transferDate).toBe("2026-03-01");
    expect(pre1990Land!.areaSqm).toBe(100);
    expect(pre1990Land!.pricePerSqm_1990).toBe(50000);
    // value 모드 → { gradeValue: n }
    expect(pre1990Land!.grade_1990_0830).toEqual({ gradeValue: 100 });
    expect(pre1990Land!.gradePrev_1990_0830).toEqual({ gradeValue: 95 });
    expect(pre1990Land!.gradeAtAcquisition).toEqual({ gradeValue: 80 });
  });

  it("표시 재구성 load-bearing 필드(std at acq/transfer)를 양수로 전송한다 (round-3)", () => {
    const payload = buildPropertyPayload(pre1990LandForm()) as unknown as Record<string, number>;
    expect(payload.standardPriceAtAcquisition).toBeGreaterThan(0);
    expect(payload.standardPriceAtTransfer).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────
// end-to-end 엔진 anchor — 다건 aggregate가 단건과 동일 결과(pre1990 보존) + 표시 취득가액 재구성
// ─────────────────────────────────────────────────────────

const TRANSFER_PRICE = 500_000_000;
const STD_AT_TRANSFER = 80_000_000;

const PRE1990_LAND = {
  acquisitionDate: new Date("1985-06-01"),
  transferDate: new Date("2026-03-01"),
  areaSqm: 100,
  pricePerSqm_1990: 50_000,
  grade_1990_0830: { gradeValue: 100 },
  gradePrev_1990_0830: { gradeValue: 95 },
  gradeAtAcquisition: { gradeValue: 80 },
} as const;

/** UI Pre1990LandValuationInput.onCalculatedPrice가 standardPriceAtAcq에 채우는 값(=엔진 STEP 0.4 산출값). */
const GRADE_STD_AT_ACQ = calculatePre1990LandValuation(PRE1990_LAND).standardPriceAtAcquisition;

function singleEngineInput(): TransferTaxInput {
  return {
    ...(baseTransferInput() as TransferTaxInput),
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2026-03-01"),
    acquisitionDate: new Date("1985-06-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: GRADE_STD_AT_ACQ, // UI auto-fill 재현 (load-bearing)
    standardPriceAtTransfer: STD_AT_TRANSFER,
    pre1990Land: PRE1990_LAND,
  };
}

describe("다건 pre1990 토지 end-to-end (aggregate == 단건)", () => {
  const rates = makeMockRates();

  it("aggregate 자산별 transferGain이 단건 엔진과 일치 (pre1990 환산 보존)", () => {
    const single = calculateTransferTax(singleEngineInput(), rates);
    const aggInput: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      properties: [
        { ...(singleEngineInput() as unknown as TransferTaxItemInput), propertyId: "p1", propertyLabel: "토지" },
      ],
    };
    const agg = calculateTransferTaxAggregate(aggInput, rates);

    // 환산취득가가 실제 적용됐는지 — 양도차익 < 양도가액 (취득가 차감됨)
    expect(single.transferGain).toBeGreaterThan(0);
    expect(single.transferGain).toBeLessThan(TRANSFER_PRICE);
    // pre1990 환산은 taxableGain 상류라 aggregate가 소실 없이 소비 (H-1 감면과 대비)
    expect(agg.properties[0].transferGain).toBe(single.transferGain);
  });

  it("aggregate 표시 취득가액 = 양도가액 × grade취득기준시가 / 양도기준시가 (round-3 재구성)", () => {
    const aggInput: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      properties: [
        { ...(singleEngineInput() as unknown as TransferTaxItemInput), propertyId: "p1", propertyLabel: "토지" },
      ],
    };
    const agg = calculateTransferTaxAggregate(aggInput, rates);
    const expected = Math.floor((TRANSFER_PRICE * GRADE_STD_AT_ACQ) / STD_AT_TRANSFER);

    expect(agg.properties[0].acquisitionPrice).toBeGreaterThan(0);
    expect(agg.properties[0].acquisitionPrice).toBe(expected);
  });
});
