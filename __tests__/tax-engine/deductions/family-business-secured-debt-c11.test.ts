/**
 * C-11 + H-38 anchor — 개인가업 §15⑤1호 담보채무 차감 + resolveEstateItemValue 매매사례가액 단계
 *
 * 법령(KoreanLaw MCP 상증령 mst 283637):
 *  - §15⑤1호: 「소득세법」 적용 가업 = 사업용 자산가액에서 해당 자산에 담보된 채무액을 뺀 가액.
 *  - §15⑤2호: 「법인세법」 적용 가업(corporate_stock) = 주식가액 × (총자산 − 사업무관자산)/총자산.
 *  - §49④(매매사례가액=시가), §60②: resolveEstateItemValue 우선순위 market→appraised→similar→standard.
 *
 * 재현(C-11): 개인가업 공장 기준시가 5억·저당 8억 → 담보채무 8억은 §14로 별도 차감되는데
 *   가업공제 base에서도 차감해야 이중공제 방지 → max(0, 5억 − 8억) = 0.
 */
import { describe, it, expect } from "vitest";
import {
  resolveEstateItemValue,
  computeSecuredClaim,
} from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import {
  deriveFamilyBusinessValue,
  resolveFamilyBusinessAssetValue,
} from "@/lib/tax-engine/deductions/family-business";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function item(over: Partial<EstateItem>): EstateItem {
  return { id: "x", category: "real_estate_building", name: "자산", ...over };
}

describe("H-38 resolveEstateItemValue 매매사례가액 단계", () => {
  it("매매사례가액 7억 + 기준시가 5억 → 7억 (similar_sales, 종전 기준시가 5억)", () => {
    expect(
      resolveEstateItemValue(item({ similarSalesValue: 700_000_000, standardPrice: 500_000_000 })),
    ).toBe(700_000_000);
  });
  it("시가 10억 + 매매사례 7억 → 시가 우선 10억 (§49② 단서)", () => {
    expect(
      resolveEstateItemValue(item({ marketValue: 1_000_000_000, similarSalesValue: 700_000_000 })),
    ).toBe(1_000_000_000);
  });
});

describe("computeSecuredClaim (단일 진실)", () => {
  it("저당 5억 − 신용보증 1억 + 임대보증금 2억 = 6억", () => {
    expect(
      computeSecuredClaim(item({ mortgageAmount: 500_000_000, creditGuaranteeAmount: 100_000_000, leaseDeposit: 200_000_000 })),
    ).toBe(600_000_000);
  });
  it("담보 없음 → 0", () => {
    expect(computeSecuredClaim(item({ standardPrice: 500_000_000 }))).toBe(0);
  });
});

describe("C-11 개인가업 §15⑤1호 담보채무 차감", () => {
  it("공장 기준시가 10억·저당 3억 → 7억", () => {
    expect(
      resolveFamilyBusinessAssetValue(item({ familyBusinessCategory: "business_real_estate", standardPrice: 1_000_000_000, mortgageAmount: 300_000_000 })),
    ).toBe(700_000_000);
  });
  it("재현: 공장 기준시가 5억·저당 8억 → 0 (담보 > 자산, 음수 floor)", () => {
    expect(
      resolveFamilyBusinessAssetValue(item({ familyBusinessCategory: "business_real_estate", standardPrice: 500_000_000, mortgageAmount: 800_000_000 })),
    ).toBe(0);
  });
  it("담보 없는 개인가업 자산 → raw 불변 (회귀)", () => {
    expect(
      resolveFamilyBusinessAssetValue(item({ familyBusinessCategory: "business_equipment", category: "other", marketValue: 500_000_000 })),
    ).toBe(500_000_000);
  });
  it("corporate_stock는 담보차감 안 함 — 직접입력 모드 raw 불변 (§15⑤2호)", () => {
    expect(
      resolveFamilyBusinessAssetValue(item({ familyBusinessCategory: "corporate_stock", category: "unlisted_stock", marketValue: 1_500_000_000, mortgageAmount: 500_000_000 })),
    ).toBe(1_500_000_000);
  });

  it("통합 deriveFamilyBusinessValue: 공장(10억,저당3억)=7억 + 기계(5억,무담보)=5억 = 12억", () => {
    const items: EstateItem[] = [
      item({ id: "f", familyBusinessCategory: "business_real_estate", standardPrice: 1_000_000_000, mortgageAmount: 300_000_000 }),
      item({ id: "m", familyBusinessCategory: "business_equipment", category: "other", marketValue: 500_000_000 }),
    ];
    expect(deriveFamilyBusinessValue(items)).toBe(1_200_000_000);
  });
});
