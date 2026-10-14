/**
 * 이월과세 × 부담부증여 × K-6/K-7 — ④ 폼 → 엔진 입력 anchor
 *
 * 입력 의미(계획서 §2): `bgAcquisitionMethod`(감정가액·매매사례가액)는 **당초 증여자** 쪽 방식이고,
 * 당초 증여자 값 = `bgCoDonorPresumedAcquisition*`, 양도인(증여받은 사람)의 증여일 상증법 평가액 = `bgActualAcquisition*`.
 */
import { describe, it, expect } from "vitest";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

function carry(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2018-10-20",
    acquisitionCause: "carryover_gift",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "400,000,000",
    bgMortgageDebtAmount: "80,000,000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "appraisal",
    standardPriceAtTransfer: "320,000,000",
    standardPriceAtAcq: "180,000,000",
    bgActualAcquisitionLand: "300,000,000",
    bgCoDonorPresumedAcquisitionLand: "250,000,000",
    bgCoDonorLandStdPriceAtAcq: "150,000,000",
    bgCoDonorBuildingStdPriceAtAcq: "0",
    // 양도인 칸에 남은 stale 값 — 이월과세에서는 읽지 않는다
    bgPresumedAcquisitionLand: "999,999,999",
    ...over,
  } as AssetForm;
}

const info = (a: AssetForm) => buildBurdenedGiftInfo(a) as unknown as Record<string, unknown>;
const donor = (a: AssetForm) => info(a).carryoverDonorBasis as Record<string, unknown>;

describe("④ 이월과세 × K-7/K-6 payload", () => {
  it("당초 증여자 감정가액은 carryoverDonorBasis로, 양도인 증여일 평가액은 actual*로 간다", () => {
    const a = carry();
    expect(info(a).acquisitionMethod).toBe("appraisal");
    expect(donor(a).presumedLandAcquisitionPrice).toBe(250_000_000);
    expect(donor(a).landStdPriceAtAcquisition).toBe(150_000_000);
    expect(info(a).actualLandAcquisitionPrice).toBe(300_000_000);
  });

  it("양도인 칸의 stale presumed 값(999,999,999)은 싣지 않는다", () => {
    const a = carry();
    expect(info(a).presumedLandAcquisitionPrice).toBeUndefined();
    expect(info(a).presumedAcquisitionTotal).toBeUndefined();
  });

  it("총액 입력(주택)은 당초 증여자 총액 칸으로", () => {
    const a = carry({
      assetKind: "housing",
      bgActualAcquisitionLand: "",
      bgActualAcquisitionTotal: "300,000,000",
      bgCoDonorPresumedAcquisitionLand: "",
      bgCoDonorPresumedAcquisitionTotal: "250,000,000",
    });
    expect(donor(a).presumedAcquisitionTotal).toBe(250_000_000);
    expect(donor(a).presumedLandAcquisitionPrice).toBeUndefined();
    expect(info(a).actualAcquisitionTotal).toBe(300_000_000);
  });

  it("🔴 구별력 — 이월과세가 아니면 종전대로 양도인 칸의 presumed를 싣고 donor 블록은 없다", () => {
    const a = carry({ acquisitionCause: "purchase", bgActualAcquisitionLand: "" });
    expect(info(a).presumedLandAcquisitionPrice).toBe(999_999_999);
    expect(info(a).carryoverDonorBasis).toBeUndefined();
  });

  it("환산·실지 이월과세는 새 칸을 싣지 않는다(회귀)", () => {
    const a = carry({ bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionLand: "100,000,000" });
    expect(donor(a).presumedLandAcquisitionPrice).toBeUndefined();
    expect(info(a).actualLandAcquisitionPrice).toBe(300_000_000);
  });

  it("양도인의 취득시 기준시가는 이월과세 × 새 방식에서 요구하지 않는다(A는 당초 증여자 값, B는 증여일 평가액) / 이월과세가 아니면 요구한다", () => {
    expect(needsBgAcqStdPriceInput(carry())).toBe(false);
    expect(needsBgAcqStdPriceInput(carry({ acquisitionCause: "purchase" }))).toBe(true);
  });
});
