/**
 * [AT-NUM] 취득세 리뷰 R1 수정 — numeric 정밀도 회귀 anchor
 *
 * N-1: 농특세 bps 부동소수 절사 오류 (선형보간 2% 초과분 < 1bps 누락)
 * N-2: 부담부증여 유상분 선형보간 float 반올림 과소
 *
 * 모두 KoreanLaw 농특세법 §5·지방세법 §10의4 기준 정밀값으로 고정.
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import { calcRuralSpecialTax, calcBurdenedGiftTax } from "@/lib/tax-engine/acquisition-tax-rate";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

describe("[AT-NUM-1] 농특세 bps 정밀도 — 선형보간 2% 초과분", () => {
  it("[AT-NUM-1a] 750,750,000원 주택 (보간 2.005%) → 농특세 3,753원", () => {
    // 적용세율 0.02005 — 2% 초과분 0.5bps. 기존 bps(만분율) 반올림은 200으로 깎여 0원.
    const input: AcquisitionTaxInput = {
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 750_750_000,
      acquiredBy: "individual",
      houseCountAfter: 1,
      areaSqm: 120, // 85㎡ 초과 → 농특세 과세 대상
      balancePaymentDate: "2024-06-01",
    };
    const r = calcAcquisitionTax(input);
    // 보간세율 (750,750,000×2−9억)/300억 = 0.02005
    expect(r.appliedRate).toBe(0.02005);
    // [R3-02] 비중과 농특세 = 표준세율을 2%로 치환 → 과세표준 × 0.2% flat (농특세법 §5①6호).
    //   6~9억 주택(선형보간)도 표준세율 성분을 2%로 보므로 초과분 bps와 무관하게 0.2%.
    //   750,750,000 × 0.2% = 1,501,500. (구값 3,753은 (적용세율−2%) 오산식 산물)
    expect(r.ruralSpecialTax).toBe(1_501_500);
  });

  it("[AT-NUM-1b] 비중과 농지 매매 3% 5억: 농특세 0.2% = 1,000,000원", () => {
    const tax = calcRuralSpecialTax({
      taxBase: 500_000_000,
      appliedRate: 0.03,
      acquisitionTax: 15_000_000,
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
    });
    // [R3-02] 비중과: 표준세율 2% 치환 → 5억 × 0.2% = 1,000,000 (표준율 3% 무관 flat)
    expect(tax).toBe(1_000_000);
  });

  it("[AT-NUM-1c] 다주택 중과 8%(§13의2): 농특세 (8%−4%+2%)×10% = 0.6% = 4,800,000원", () => {
    const tax = calcRuralSpecialTax({
      taxBase: 800_000_000,
      appliedRate: 0.08,
      acquisitionTax: 64_000_000,
      propertyType: "housing",
      acquisitionCause: "purchase",
      isSurcharged: true,
      surchargeType: "multi_house_8", // §13의2 표준세율 = §11①7나 4%
    });
    // [R3-02] §13의2 기준율 4% → (2% + 중과분 4%) × 8억 × 10% = 0.6% = 4,800,000
    expect(tax).toBe(4_800_000);
  });

  it("[AT-NUM-1d] 비중과 2% 취득: 농특세 표준 2% 치환 → 0.2% = 1,000,000원", () => {
    const tax = calcRuralSpecialTax({
      taxBase: 500_000_000,
      appliedRate: 0.02,
      acquisitionTax: 10_000_000,
      propertyType: "building",
      acquisitionCause: "purchase",
    });
    // [R3-02] 표준세율 2% → 농특세 과세표준 = 5억×2%, ×10% = 1,000,000 (구값 0은 오산식)
    expect(tax).toBe(1_000_000);
  });
});

describe("[AT-NUM-2] 부담부증여 유상분 — 선형보간 BigInt 정밀", () => {
  it("[AT-NUM-2a] 전체 8억(보간 2.333%)·채무 5억 유상분 → 11,666,666원", () => {
    // 유상분 세율은 전체 취득가액 기준 보간세율. float 0.02333 곱이 아닌
    // BigInt 정밀: floor(5억 × (8억×2−9억)/300억) = floor(11,666,666.66) = 11,666,666
    const { onerousTax, gratuitousTax } = calcBurdenedGiftTax(
      500_000_000, // 유상분 (채무)
      300_000_000, // 무상분 (초과분)
      "housing",
      800_000_000, // 전체 취득가액
    );
    expect(onerousTax).toBe(11_666_666);
    // 무상분 3억 × 3.5% = 10,500,000
    expect(gratuitousTax).toBe(10_500_000);
  });

  it("[AT-NUM-2b] 대조군 — 비선형보간(9억 초과 3%) 유상분: float 정확 유지", () => {
    // 전체 10억 → 3% 고정세율. 채무 7억 × 3% = 21,000,000 (회귀 0)
    const { onerousTax } = calcBurdenedGiftTax(
      700_000_000,
      300_000_000,
      "housing",
      1_000_000_000,
    );
    expect(onerousTax).toBe(21_000_000);
  });

  it("[AT-NUM-2c] 대조군 — 비주택 토지 4% 유상분: float 정확 유지", () => {
    const { onerousTax } = calcBurdenedGiftTax(
      400_000_000,
      100_000_000,
      "land",
      500_000_000,
    );
    // 4% × 4억 = 16,000,000
    expect(onerousTax).toBe(16_000_000);
  });
});
