/**
 * anchor (A3 · OH-04) — 토지·건물 분리취득(splitDetail)에서 장특공제 기준 과세 양도차익은
 * STEP 3(`resolveTaxableGain`)이 **실제로 쓴** 12억 안분 결과와 같아야 한다.
 *
 * 법령: 소득세법 §95③ · 시행령 §160① — 고가주택의 양도차익과 장기보유특별공제액은 **같은** 안분
 *   (양도차익 × (양도가액 − 기준금액) ÷ 양도가액)으로 계산한다. 안분 여부는 비과세 판정
 *   (`checkExemption`의 `isPartialExempt` — §155 의제 1주택 포함)이 정하고, 분모는 §156①(공유지분은
 *   물건 전체)·부담부증여 분모까지 반영한 STEP 3 분모가 정본이다.
 *
 * 결함: LTHD가 `isOneHouseSingle && selfTransferPrice > THRESHOLD`로 **다시** 판정해
 *   (a) §155 의제 1주택은 안분하지 않고 전액에 공제율을 곱했고(P1 — 세액 0),
 *   (b) 비과세 요건 미충족 1주택은 과세 대상 전액이 아니라 안분액에 공제율을 곱했으며(P2 — 과대 과세),
 *   (c) 공유지분은 지분 가액이 12억 이하라 안분을 건너뛰었다(S1 — 세액 0).
 *
 * 기대값은 법정 산식으로 손으로 계산했다(엔진 관측값 복사 아님):
 *   표2 = 보유 4%×년(최대 40%) + 거주 4%×년(최대 40%) · 표1 = 보유 2%×년.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 분리취득 주택 — 토지 2010-01-01 · 건물 2012-01-01 · 양도 2025-06-01 */
function split(over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferDate: D("2025-06-01"),
    acquisitionDate: D("2012-01-01"),
    landAcquisitionDate: D("2010-01-01"),
    isSeparateAcquisition: true,
    selfOwns: "both",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isOneHousehold: true,
    residencePeriodMonths: 60,
    ...over,
  });
}

describe("OH-04 — 분리취득 LTHD는 STEP 3 안분을 그대로 쓴다", () => {
  it("🔴 P1 §155① 의제 1주택(일시적 2주택) 고가주택 — 과세분 2억 × 60% = 1.2억", () => {
    const r = calculateTransferTax(
      split({
        transferPrice: 1_500_000_000,
        landTransferPrice: 1_000_000_000,
        buildingTransferPrice: 500_000_000,
        landStandardPriceAtTransfer: 1_000_000_000,
        buildingStandardPriceAtTransfer: 500_000_000,
        acquisitionPrice: 500_000_000,
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 200_000_000,
        householdHousingCount: 2,
        temporaryTwoHouse: {
          previousAcquisitionDate: D("2012-01-01"),
          newAcquisitionDate: D("2024-01-01"),
        },
      }),
      rates,
    );
    // 양도차익 10억(토지 7억·건물 3억) × (15억 − 12억)/15억 = 2억(토지 1.4억·건물 0.6억)
    expect(r.taxableGain).toBe(200_000_000);
    // 토지 15년·건물 13년 → 보유 40% + 거주 5년 20% = 60%
    expect(r.longTermHoldingDeduction).toBe(120_000_000);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("🔴 P2 1주택이나 비과세 요건 미충족(조정 취득·거주 1년) — 전액 과세분에 표1", () => {
    const r = calculateTransferTax(
      split({
        transferPrice: 1_500_000_000,
        landTransferPrice: 1_000_000_000,
        buildingTransferPrice: 500_000_000,
        landStandardPriceAtTransfer: 1_000_000_000,
        buildingStandardPriceAtTransfer: 500_000_000,
        acquisitionPrice: 500_000_000,
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 200_000_000,
        acquisitionDate: D("2018-01-01"),
        landAcquisitionDate: D("2017-01-01"),
        wasRegulatedAtAcquisition: true,
        householdHousingCount: 1,
        residencePeriodMonths: 12,
      }),
      rates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(1_000_000_000);
    // 토지 8년 16% × 7억 + 건물 7년 14% × 3억 = 1.12억 + 0.42억
    expect(r.longTermHoldingDeduction).toBe(154_000_000);
  });

  it("🔴 S1 공유지분 50%(물건 전체 20억) 1주택 — 분모는 물건 전체(§156①)", () => {
    const r = calculateTransferTax(
      split({
        transferPrice: 1_000_000_000,
        totalPropertyTransferPrice: 2_000_000_000,
        landTransferPrice: 600_000_000,
        buildingTransferPrice: 400_000_000,
        landStandardPriceAtTransfer: 600_000_000,
        buildingStandardPriceAtTransfer: 400_000_000,
        acquisitionPrice: 400_000_000,
        landAcquisitionPrice: 200_000_000,
        buildingAcquisitionPrice: 200_000_000,
        householdHousingCount: 1,
      }),
      rates,
    );
    // 6억(토지 4억·건물 2억) × (20억 − 12억)/20억 = 2.4억(토지 1.6억·건물 0.8억)
    expect(r.taxableGain).toBe(240_000_000);
    expect(r.longTermHoldingDeduction).toBe(144_000_000);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("회귀 짝 — 단순 1주택 고가(분리취득) · 안분 결과 불변: 과세 2억 × 60%", () => {
    const r = calculateTransferTax(
      split({
        transferPrice: 1_500_000_000,
        landTransferPrice: 1_000_000_000,
        buildingTransferPrice: 500_000_000,
        landStandardPriceAtTransfer: 1_000_000_000,
        buildingStandardPriceAtTransfer: 500_000_000,
        acquisitionPrice: 500_000_000,
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 200_000_000,
        householdHousingCount: 1,
      }),
      rates,
    );
    expect(r.taxableGain).toBe(200_000_000);
    expect(r.longTermHoldingDeduction).toBe(120_000_000);
  });
});
