/**
 * validate anchor — 겸용주택 §164⑨1호 공익수용 보상 4필드 필수 (계획 P7/D8).
 * 겸용 + 수용 + 2009.02.04 시 주택분 2 + 상가분 토지 2 = 4필드 필수(UI 노출 조건과 동일).
 */
import { describe, it, expect } from "vitest";
import {
  validateMixedUseExprAsset,
  validateSplitLandExprAsset,
  validateHousingExprAsset,
} from "@/lib/calc/transfer-tax-validate-expropriation";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const TD = "2023-06-01";

function mixed(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    isMixedUseHouse: true,
    transferCause: "public_expropriation" as const,
    ...over,
  };
}

describe("validateMixedUseExprAsset (P7/D8)", () => {
  it("겸용 수용 — 4필드 미입력 → 주택분 보상액 총액부터 차단", () => {
    expect(validateMixedUseExprAsset(mixed(), "자산", TD)).toMatch(/주택분 보상액 총액/);
  });

  it("겸용 수용 — 주택분만 입력 → 상가분 토지 보상액 차단", () => {
    const a = mixed({ housingCompensationTotal: "600,000,000", housingCompensationBasisTotal: "700,000,000" });
    expect(validateMixedUseExprAsset(a, "자산", TD)).toMatch(/상가분 토지 보상액 총액/);
  });

  it("겸용 수용 — 4필드 완비 → 통과", () => {
    const a = mixed({
      housingCompensationTotal: "600,000,000",
      housingCompensationBasisTotal: "700,000,000",
      mixedCommercialLandCompensationTotal: "200,000,000",
      mixedCommercialLandCompensationBasisTotal: "250,000,000",
    });
    expect(validateMixedUseExprAsset(a, "자산", TD)).toBeNull();
  });

  it("게이트 OFF — 수용 아님(general) → null", () => {
    expect(validateMixedUseExprAsset(mixed({ transferCause: "general" }), "자산", TD)).toBeNull();
  });

  it("게이트 OFF — 겸용 아님(단독 주택) → null", () => {
    expect(validateMixedUseExprAsset(mixed({ isMixedUseHouse: false }), "자산", TD)).toBeNull();
  });

  it("게이트 OFF — 양도 2009.02.03 → null", () => {
    expect(validateMixedUseExprAsset(mixed(), "자산", "2009-02-03")).toBeNull();
  });

  // 코드리뷰 2026-07-17 회귀 — 겸용은 split-land/housing 검증기가 오발동해선 안 된다(겸용 전담: mixedUse).
  it("겸용은 validateSplitLandExprAsset가 오차단하지 않는다 (hasSeperate 강제·useEstimated 잔류 시나리오)", () => {
    const a = mixed({ hasSeperateLandAcquisitionDate: true, useEstimatedAcquisition: true });
    expect(validateSplitLandExprAsset(a, "자산", TD)).toBeNull();
    expect(validateHousingExprAsset(a, "자산", TD)).toBeNull();
  });
});
