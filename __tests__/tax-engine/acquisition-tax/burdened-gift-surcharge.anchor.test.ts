/**
 * 부담부증여 §13의2 중과 + 부가세 유상/무상 분리 anchor (R2 H5·M5 회귀 방어)
 *
 * H5: 부담부증여 본세가 §13의2 중과(유상분 §13의2① 다주택 8/12% + 무상분 §13의2② 증여 12%)를
 *     통째 누락하고 표준세율(매매율+3.5%)만 적용하던 버그.
 * M5: 농특세·지방교육세를 전체 과세표준 × 단일 유상세율로 계산(유상/무상 미분리)하던 버그.
 *
 * 법령: §13의2①3호(1세대 3주택 조정 = §11①7나 4% + 중과기준세율×400% = 12%),
 *       §13의2②(조정지역 3억 이상 무상취득 = 12%).
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

describe("[AT-BG] 부담부증여 §13의2 중과 + 부가세 분리 — R2 H5·M5", () => {
  it("[AT-BG-01] 다주택(3주택 조정) 부담부증여 — 유상분·무상분 각각 12% 중과", () => {
    const input = {
      propertyType: "housing",
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      marketValue: 1_000_000_000,
      standardValue: 1_000_000_000,
      wholeHouseStandardValue: 1_000_000_000, // §13의2② 3억 이상
      encumbrance: 600_000_000, // 유상분(채무인수) 6억
      acquiredBy: "individual",
      giftRelation: "other", // 배우자·직계존비속 아님 → burdened_gift 유지
      houseCountAfter: 3,
      isRegulatedArea: true,
      isMetropolitanRegion: true,
      balancePaymentDate: "2024-06-01",
    } as AcquisitionTaxInput;

    const r = calcAcquisitionTax(input);
    const bg = r.burdenedGiftBreakdown;

    // 유상분 6억 × §13의2①3호 12% = 72,000,000 (기존엔 매매율 3%로 18,000,000 과소)
    expect(bg?.onerousTaxBase).toBe(600_000_000);
    expect(bg?.onerousTax).toBe(72_000_000);
    // 무상분 4억 × §13의2② 12% = 48,000,000 (기존엔 3.5%로 14,000,000 과소)
    expect(bg?.gratuitousTaxBase).toBe(400_000_000);
    expect(bg?.gratuitousTax).toBe(48_000_000);
    // 본세 = 120,000,000
    expect(r.acquisitionTax).toBe(120_000_000);
    // [M5] 부가세 유상/무상 분리 합산:
    // 농특세 = (12%−2%)×6억×10% + (12%−2%)×4억×10% = 6,000,000 + 4,000,000 = 10,000,000
    expect(r.ruralSpecialTax).toBe(10_000_000);
    // 지방교육세 = 6억×0.4% + 4억×0.4% = 2,400,000 + 1,600,000 = 4,000,000
    expect(r.localEducationTax).toBe(4_000_000);
  });

  it("[AT-BG-02] 비중과(1주택·비조정) 부담부증여 — 유상 매매율 + 무상 3.5% (중과 없음)", () => {
    const input = {
      propertyType: "housing",
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      marketValue: 500_000_000,
      standardValue: 500_000_000,
      wholeHouseStandardValue: 500_000_000,
      encumbrance: 300_000_000, // 유상분 3억
      acquiredBy: "individual",
      giftRelation: "other",
      houseCountAfter: 1,
      isRegulatedArea: false,
      isMetropolitanRegion: false,
      balancePaymentDate: "2024-06-01",
    } as AcquisitionTaxInput;

    const r = calcAcquisitionTax(input);
    const bg = r.burdenedGiftBreakdown;

    // 유상분 3억(전체 5억 → 6억 이하 주택 1%) = 3,000,000
    expect(bg?.onerousTaxBase).toBe(300_000_000);
    expect(bg?.onerousTax).toBe(3_000_000);
    // 무상분 2억 × 증여 3.5% = 7,000,000
    expect(bg?.gratuitousTaxBase).toBe(200_000_000);
    expect(bg?.gratuitousTax).toBe(7_000_000);
    expect(r.acquisitionTax).toBe(10_000_000);
  });
});
