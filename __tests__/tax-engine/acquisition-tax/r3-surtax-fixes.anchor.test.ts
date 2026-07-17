/**
 * R3 부가세(농특세·지방교육세) 산식 rewrite anchor (2026-07-17)
 *
 * R3-02 농특세(농특세법 §5①6호): "표준세율을 2%로 적용한 취득세액 × 10%".
 *   = (2% + 중과분) × 과세표준 × 10%. 중과분 = 적용세율 − (중과가 사용한 표준세율).
 *   구 산식 (적용세율−2%)는 표준율≠4% 취득 전반 과소(특히 1% 주택 → 0).
 * R3-01 지방교육세(§151①1): 사치성(§13⑤)은 가목(§13②③⑥⑦)·나목(§13의2) 부재 → 본문.
 *   구 1.4%/1.8% 하드코딩(중과분 반영)은 법 근거 없는 과다과세.
 *
 * 마스킹 방지: 구 anchor가 표준율 4%·wholeStd 명시 케이스만 고정해 통과했던 갭을 메운다.
 */

import { describe, it, expect } from "vitest";
import {
  calcRuralSpecialTax,
  calcLocalEducationTax,
} from "../../../lib/tax-engine/acquisition-tax-rate";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

describe("[AT-R3-02] 농특세 — 표준세율 2% 치환 (비중과 0.2% flat)", () => {
  it("[AT-R3-02-01] 6억↓ 주택 매매 1%(>85㎡) — 농특세 0.2% (구 산식은 0원)", () => {
    const r = calcAcquisitionTax({
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      standardValue: 500_000_000,
      acquiredBy: "individual",
      houseCountAfter: 1,
      areaSqm: 100, // 85㎡ 초과 → 농특세 과세
      balancePaymentDate: "2024-06-01",
    } as AcquisitionTaxInput);
    // 표준세율 1% → 2% 치환 → 5억 × 0.2% = 1,000,000 (구: 세율 1%≤2% 조기반환 0)
    expect(r.appliedRate).toBe(0.01);
    expect(r.ruralSpecialTax).toBe(1_000_000);
  });

  it("[AT-R3-02-02] 사치성 단독 6억↓ 주택 9%(표준 1%) — 농특세 1.0% = 5,000,000", () => {
    const tax = calcRuralSpecialTax({
      taxBase: 500_000_000,
      appliedRate: 0.09, // 1% + 8%p
      acquisitionTax: 45_000_000,
      propertyType: "housing",
      isSurcharged: true,
      surchargeType: "luxury_solo",
      basicRate: 0.01,
    });
    // 사치성 기준 = 물건 표준율 1% → (2% + (9%−1%)) × 5억 × 10% = 10% × 5억 × 10% = 5,000,000
    // (구 산식 (9%−2%)=0.7% → 3,500,000 과소)
    expect(tax).toBe(5_000_000);
  });

  it("[AT-R3-02-03] 증여 §13의2② 12% — 농특세 기준 §11①7나 4% → 1.0% = 5,000,000", () => {
    const tax = calcRuralSpecialTax({
      taxBase: 500_000_000,
      appliedRate: 0.12,
      acquisitionTax: 60_000_000,
      propertyType: "housing",
      isSurcharged: true,
      surchargeType: "gift_12",
      basicRate: 0.035, // 증여 표준율 3.5%지만 §13의2②는 4% 기준 → adjustedStd 4%
    });
    // (2% + (12%−4%)) × 5억 × 10% = 10% × 5억 × 10% = 5,000,000 (basicRate 3.5% 무관)
    expect(tax).toBe(5_000_000);
  });
});

describe("[AT-R3-01] 지방교육세 — 사치성은 본문(표준세율 기준)", () => {
  it("[AT-R3-01-01] 사치성 단독 고급오락장 4% — 교육세 본문 (4%−2%)×20% = 0.4% = 2,000,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 500_000_000,
      appliedRate: 0.12, // 4% + 8%p
      acquisitionTax: 60_000_000,
      propertyType: "building",
      acquisitionCause: "purchase",
      isSurcharged: true,
      surchargeType: "luxury_solo",
      basicRate: 0.04,
    });
    // 사치성 = 본문(표준율 기준). 중과분 미반영 → (4%−2%)×20% = 0.4%. (구 1.4% = 7,000,000 오류)
    expect(result).toBe(2_000_000);
  });

  it("[AT-R3-01-02] 사치성 단독 고급주택 증여(무상) — 교육세 본문 (3.5%−2%)×20% = 0.3% = 1,500,000", () => {
    const result = calcLocalEducationTax({
      taxBase: 500_000_000,
      appliedRate: 0.115, // 3.5% + 8%p
      acquisitionTax: 57_500_000,
      propertyType: "housing",
      acquisitionCause: "gift", // 무상 → §11①8 주택유상 아님, 본문 (표준−2%)×20%
      isSurcharged: true,
      surchargeType: "luxury_solo",
      basicRate: 0.035,
    });
    expect(result).toBe(1_500_000);
  });
});
