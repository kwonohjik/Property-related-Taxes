/**
 * 사례 49 anchor tests — 취득시 장부분실 액면가 + 양도시 §165④ 보충 평가
 *
 * 계획서: stock-transfer-case-49-acq-face-value-only.plan.md v3
 * Engine: .engine.design.md v2
 *
 * 매트릭스 16 케이스 (acqFaceValueOnly × mode × isNetAssetOnly × isHeavyRE)
 *  - Pre-Do anchor: C49-02, C49-02b (Phase A1.5)
 *  - 회귀 보호: C49-01 (acqFaceValueOnly 비활성), C49-14 (face_value 모드)
 *  - 핵심 분기: C49-03~12 (80% 하한·NA 단독·full 모드)
 *  - validate: C49-09, C49-17 (face_value 충돌)
 */

import { describe, test, expect } from "vitest";
import { calcUnlistedValuation } from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseInput(patch: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: true,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2026-05-01"),
    shareCount: 2000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    acquisitionMode: "estimated",
    bookLost: false,
    expenseMode: "actual",
    filingType: "preliminary",
    isElectronicFiling: false,
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    lotsMode: "single",
    ...patch,
  } as StockTransferInput;
}

describe("사례 49 — 회귀 보호 (acqFaceValueOnly 비활성)", () => {
  test("C49-01: acqFaceValueOnly === false → 기존 가중평균 동작 유지 (method !== 'acq_face_value_only')", () => {
    const input = baseInput({
      acqFaceValueOnly: false,
      transferYearNetIncomePerShare: 30000,
      transferYearNetAssetPerShare: 80000,
      acquisitionYearNetIncomePerShare: 25000,
      acquisitionYearNetAssetPerShare: 70000,
    });
    const r = calcUnlistedValuation(input, 100_000_000);
    expect(r.method).not.toBe("acq_face_value_only");
    expect(r.appliedRules).not.toContain(STOCK.SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ);
  });

  test("C49-14: 기존 face_value 모드 (bookLost=true) 무변동", () => {
    const input = baseInput({
      acquisitionMode: "face_value",
      bookLost: true,
      faceValuePerShare: 5000,
    });
    const r = calcUnlistedValuation(input, 100_000_000);
    expect(r.method).toBe("face_value");
    expect(r.perShareValue).toBe(5000);
    expect(r.acquisitionStdPriceTotal).toBe(10_000_000);
  });
});

describe("사례 49 — isNetAssetOnly 분기 (C49-03)", () => {
  test("C49-03: acqFaceValueOnly + 순자산 단독 → NI 무시, NA만 사용, 80% 하한 미적용", () => {
    const input = baseInput({
      acqFaceValueOnly: true,
      acqFaceValuePerShare: 5000,
      transferYearNetIncomePerShare: 30000,  // 무시
      transferYearNetAssetPerShare: 80000,
      netAssetOnlyReason: "stock_holding_company",
    });
    const r = calcUnlistedValuation(input, 100_000_000);
    expect(r.method).toBe("acq_face_value_only");
    // NA 단독: 80,000 / 80% 하한 미적용
    expect(r.transferStdPriceAfterFloor).toBe(80_000);
    expect(r.netAssetFloorApplied).toBe(false);
    // 환산취득가 = 100M × (5000/80000) = 6,250,000
    expect(r.totalAcquisitionPrice).toBe(6_250_000);
    expect(r.appliedRules).toContain(STOCK.SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ);
  });
});

describe("사례 49 — isHeavyRE 가중치 반전 (C49-07)", () => {
  test("C49-07: acqFaceValueOnly + isHeavyRE → 가중치 2/3 반전 적용", () => {
    const input = baseInput({
      acqFaceValueOnly: true,
      acqFaceValuePerShare: 5000,
      transferYearNetIncomePerShare: 100000,
      transferYearNetAssetPerShare: 80000,
      isHeavyRealEstateForValuation: true,
    });
    const r = calcUnlistedValuation(input, 100_000_000);
    // 가중치 반전: (100000 × 2 + 80000 × 3)/5 = 88,000
    // 80% 하한 = 64,000 → 미발동
    expect(r.transferStdPriceAfterFloor).toBe(88_000);
    expect(r.netAssetFloorApplied).toBe(false);
  });
});

describe("사례 49 — division by zero 가드 (C49-16)", () => {
  test("C49-16: 양도 NI/NA 모두 0 → totalAcquisitionPrice = 0 + warning", () => {
    const input = baseInput({
      acqFaceValueOnly: true,
      acqFaceValuePerShare: 5000,
      transferYearNetIncomePerShare: 0,
      transferYearNetAssetPerShare: 0,
    });
    const r = calcUnlistedValuation(input, 100_000_000);
    expect(r.totalAcquisitionPrice).toBe(0);
    expect(r.transferStdPriceAfterFloor).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain("미입력");
  });
});

describe("사례 49 — BigInt 안전 (C49-08)", () => {
  test("C49-08: 큰 양도가 1조 × 액면가 5,000 → BigInt overflow 없음", () => {
    const input = baseInput({
      acqFaceValueOnly: true,
      acqFaceValuePerShare: 5000,
      transferYearNetIncomePerShare: 30000,
      transferYearNetAssetPerShare: 80000,
    });
    // 양도가 1조원
    const r = calcUnlistedValuation(input, 1_000_000_000_000);
    // 양도기준시가 64,000 (80% 하한 발동)
    // 환산취득가 = 1조 × 5000 / 64000 = 78,125,000,000
    expect(r.totalAcquisitionPrice).toBe(78_125_000_000);
    expect(r.method).toBe("acq_face_value_only");
  });
});

describe("사례 49 — Pre-Do anchor (Phase A1.5 [M-1])", () => {
  test("C49-02: 80% 하한 발동 — NI 30k / NA 80k / 액면가 5k → 양도기준시가 64k / 환산취득가 7,812,500", () => {
    const input = baseInput({
      acqFaceValueOnly: true,
      acqFaceValuePerShare: 5000,
      transferYearNetIncomePerShare: 30000,
      transferYearNetAssetPerShare: 80000,
    });
    const r = calcUnlistedValuation(input, 100_000_000);
    // [I-4 anchor 검증 필드 6종]
    expect(r.method).toBe("acq_face_value_only");
    // 양도기준시가: (30000×3 + 80000×2)/5 = 50,000 → 80% 하한 64,000 발동
    expect(r.transferStdPriceAfterFloor).toBe(64_000);
    expect(r.perShareValue).toBe(64_000);
    expect(r.netAssetFloorApplied).toBe(true);
    // 취득기준시가 = 5,000 × 2,000주 = 10,000,000
    expect(r.acquisitionStdPriceTotal).toBe(10_000_000);
    // 환산취득가 = 100M × (5,000/64,000) = 7,812,500
    expect(r.totalAcquisitionPrice).toBe(7_812_500);
    expect(r.appliedRules).toContain(STOCK.SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ);
    expect(r.appliedRules).toContain(STOCK.SECTION_165_4_1_FLOOR_80);
  });

  test("C49-02b: 80% 하한 미발동 — NI 90k / NA 80k / 액면가 5k → 양도기준시가 86k / 환산취득가 5,813,953", () => {
    const input = baseInput({
      acqFaceValueOnly: true,
      acqFaceValuePerShare: 5000,
      transferYearNetIncomePerShare: 90000,
      transferYearNetAssetPerShare: 80000,
    });
    const r = calcUnlistedValuation(input, 100_000_000);
    expect(r.method).toBe("acq_face_value_only");
    // 양도기준시가: (90000×3 + 80000×2)/5 = 86,000 (80% 하한 64,000 미발동)
    expect(r.transferStdPriceAfterFloor).toBe(86_000);
    expect(r.perShareValue).toBe(86_000);
    expect(r.netAssetFloorApplied).toBe(false);
    expect(r.acquisitionStdPriceTotal).toBe(10_000_000);
    // 환산취득가 = floor(100M × 5,000 / 86,000) = 5,813,953
    expect(r.totalAcquisitionPrice).toBe(5_813_953);
    expect(r.appliedRules).toContain(STOCK.SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ);
    expect(r.appliedRules.filter((s) => s.includes("80%"))).toHaveLength(0);
  });
});
