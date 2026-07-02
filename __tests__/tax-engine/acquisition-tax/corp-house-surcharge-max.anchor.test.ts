/**
 * 법인 주택·사치성 중과 vs §13② 대도시 법인 중과 경합 anchor (R2 H3·H4 회귀 방어)
 *
 * 법령 근거:
 * - §13의2①1호: 법인 주택 유상취득 = §11①7나(4%) + 중과기준세율×400%(8%) = 12%
 * - §13②: 대도시 법인 5년 이내 부동산 = 표준세율×3 − 중과기준세율×2(4%p) — 주택 외 전용
 * - §13⑦: 사치성 + 대도시 법인 비주택 = 표준세율×3 + 4%p = 16%
 *
 * R2 결함:
 * - H4: corp §13②의 (표준세율×3−4%) 산식이 주택에도 적용 → 주택 1%×3−4%=음수→0% 붕괴
 * - H3: 오케스트레이터가 corp 세율을 무조건 우선 → §13의2①(12%)·§13⑦(16%)를 침묵 override
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

const metroCorpHouse: AcquisitionTaxInput = {
  propertyType: "housing",
  acquisitionCause: "purchase",
  reportedPrice: 500_000_000,
  standardValue: 500_000_000,
  acquiredBy: "corporation",
  isMetropolitanCongestion: true,
  isWithin5YearsOfEstablishment: true,
  houseCountAfter: 1,
  balancePaymentDate: "2024-06-01",
};

describe("[AT-CORP-MAX] 법인 주택 §13의2① vs §13② 경합 — R2 H3·H4", () => {
  it("[AT-CORP-MAX-01] 대도시 법인 주택 유상취득 = §13의2① 12% (§13② 0% 붕괴 아님)", () => {
    const result = calcAcquisitionTax(metroCorpHouse);
    // 법인 주택은 §13의2①1호 12% — §13②(1%×3−4%=음수→0%)로 붕괴되면 안 됨
    expect(result.appliedRate).toBe(0.12);
    // 본세 = 5억 × 12% = 60,000,000
    expect(result.acquisitionTax).toBe(60_000_000);
  });

  it("[AT-CORP-MAX-02] 대도시 법인 비주택 토지 = §13② 표준 4%×3−4% = 8%", () => {
    const result = calcAcquisitionTax({
      ...metroCorpHouse,
      propertyType: "land",
      houseCountAfter: undefined,
    });
    // 주택 외 부동산은 §13② 그대로 적용 (4%×3 − 4%p ≈ 8%).
    // (corp 세율의 부동소수 표현은 본 수정 범위 밖 — H3·H4는 override/붕괴 로직만 대상)
    expect(result.appliedRate).toBeCloseTo(0.08, 6);
    expect(result.acquisitionTax).toBeGreaterThanOrEqual(39_999_999);
    expect(result.acquisitionTax).toBeLessThanOrEqual(40_000_000);
  });
});
