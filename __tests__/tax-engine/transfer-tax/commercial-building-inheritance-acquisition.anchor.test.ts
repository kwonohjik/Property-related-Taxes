/**
 * 상업용건물(commercial_building) 상속 취득가액 엔진정합(소령 §163⑨) anchor 테스트.
 *
 * 버그(수정 전): 상가 + 상속 + 환산 ON 시 STEP 0.35(applyCommercialBuildingStep)가
 *   STEP 0.45(상속 취득가액 의제)의 상속개시일 평가액을 환산+개산공제로 덮어씀.
 *   → transferGain = 540M − 환산 135,155,041 − 개산 3,588,219 = 401,256,740 (과대과세).
 *
 * 정합(수정 후, §163⑨): 상속개시일 상증법 §60~66 평가액을 취득당시 실지거래가액으로 본다.
 *   상가는 상속개시일 평가액(단일 총액)을 직접 취득가액으로 사용, 개산공제 미적용.
 *   → transferGain = 540M − 300,000,000 − 0 = 240,000,000.
 *
 * 케이스 인벤토리:
 *   A1 ★ 상가 + 상속 + 환산 ON payload → 상속평가액 직접, 환산 무시 (primary anchor)
 *   B  대조: 매매 상가 환산(case-29 원본) → 환산 유지 불변 (회귀)
 *
 * 근거: 소득세법 시행령 §163⑨(상속·증여 자산 취득가액 의제)·§163⑥(개산공제 환산 전용).
 * 겸용 PR#710·일반건물 PR#713과 동일 클래스.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates } from "../_helpers/mock-rates";
import { makeCase29Input, CALCULATED_TAX, ESTIMATED_ACQ_TOTAL } from "./_helpers/case-29-fixtures";
import type { InheritanceAcquisitionInput } from "@/lib/tax-engine/types/inheritance-acquisition.types";

const rates = makeMockRates();

/** 상속개시일 상증법 평가액 (post-deemed reportedValue) */
const INHERITANCE_APPRAISAL = 300_000_000;

const inheritedAcq: InheritanceAcquisitionInput = {
  inheritanceDate: new Date("2017-09-15"),
  assetKind: "land", // 상가 미지원 → 현행 default "land" (reportedValue 직접 경로, assetKind 미사용)
  reportedValue: INHERITANCE_APPRAISAL,
  reportedMethod: "supplementary",
};

// ============================================================
// A1: 상가 + 상속 + 환산 ON payload → 상속평가액 직접, 환산 무시
// ============================================================

describe("A1 — 상가 상속 취득가액 §163⑨ 직접 산정 (환산 override 차단)", () => {
  const input = makeCase29Input({
    acquisitionCause: "inheritance",
    inheritedAcquisition: inheritedAcq,
    // makeCase29Input 기본: useEstimatedAcquisition:true + commercialBuildingValuation(환산 payload) 유지
  });
  const result = calculateTransferTax(input, rates);

  it("A1-01 ★: 양도차익 = 240,000,000 (540M − 상속평가액 300M − 0), 환산 401,256,740 아님", () => {
    expect(result.transferGain).toBe(240_000_000);
    expect(result.transferGain).not.toBe(401_256_740); // 버그 baseline
  });

  it("A1-02: 상속 취득가액 = 300,000,000 (inheritedAcquisitionDetail)", () => {
    expect(result.inheritedAcquisitionDetail?.acquisitionPrice).toBe(INHERITANCE_APPRAISAL);
  });

  it("A1-03: 환산 결과 카드 미표시 (commercialBuildingValuationDetail undefined — CB STEP 미발동)", () => {
    expect(result.commercialBuildingValuationDetail).toBeUndefined();
  });

  it("A1-04: 개산공제 미적용 (환산 총액 135,155,041 무시)", () => {
    // 환산이 적용됐다면 취득가 135,155,041 + 개산공제 3,588,219 → gain 401,256,740.
    // 상속평가액 직접이면 그 흔적이 없어야 함.
    expect(result.transferGain).not.toBe(401_256_740);
    expect(result.commercialBuildingValuationDetail?.estimatedDeductionTotal).toBeUndefined();
  });

  it("A1-05: usedEstimatedAcquisition = false (실가 경로)", () => {
    expect(result.usedEstimatedAcquisition).toBe(false);
  });
});

// ============================================================
// B: 대조 — 매매 상가 환산 (case-29 원본) 불변 (회귀)
// ============================================================

describe("B — 매매 상가 환산 경로 불변 (acquisitionCause≠inheritance)", () => {
  const input = makeCase29Input(); // 매매(기본), 환산 ON
  const result = calculateTransferTax(input, rates);

  it("B-01: 환산취득가 유지 = 135,155,041", () => {
    expect(result.commercialBuildingValuationDetail?.estimatedAcquisitionTotal).toBe(ESTIMATED_ACQ_TOTAL);
  });

  it("B-02: 산출세액 불변 = 85,844,292 (2022 §55)", () => {
    expect(result.calculatedTax).toBe(CALCULATED_TAX);
  });
});
