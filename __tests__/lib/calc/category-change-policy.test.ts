/**
 * category-change-policy — 카테고리 변경 매트릭스 anchor
 *
 * Plan estate-card-followup-phase2 §FU-6 · Design D2-O2
 */

import { describe, it, expect } from "vitest";
import {
  getCategoryGroup,
  pickPreservedFields,
  computeLossFields,
  LOSS_FIELD_LABELS,
} from "@/lib/calc/category-change-policy";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeRealEstate(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "re-1",
    category: "real_estate_land",
    name: "테스트 토지",
    marketValue: 1_000_000_000,
    appraisedValue: 950_000_000,
    standardPrice: 800_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 200_000_000,
    deductSecuredClaimAsDebt: true,
    estateAddress: { road: "서울시 ○○로 123" },
    ...overrides,
  };
}

// ============================================================
// getCategoryGroup 매트릭스
// ============================================================

describe("getCategoryGroup — 9 AssetCategory × 4 그룹 매핑", () => {
  it("real_estate_land·building·apartment → real_estate", () => {
    expect(getCategoryGroup("real_estate_land")).toBe("real_estate");
    expect(getCategoryGroup("real_estate_building")).toBe("real_estate");
    expect(getCategoryGroup("real_estate_apartment")).toBe("real_estate");
  });

  it("cash·financial → financial", () => {
    expect(getCategoryGroup("cash")).toBe("financial");
    expect(getCategoryGroup("financial")).toBe("financial");
  });

  it("deposit → deposit (단독)", () => {
    expect(getCategoryGroup("deposit")).toBe("deposit");
  });

  it("other·listed_stock·unlisted_stock → other (fallback)", () => {
    expect(getCategoryGroup("other")).toBe("other");
    expect(getCategoryGroup("listed_stock")).toBe("other");
    expect(getCategoryGroup("unlisted_stock")).toBe("other");
  });
});

// ============================================================
// pickPreservedFields 매트릭스
// ============================================================

describe("pickPreservedFields — 그룹 내 변경", () => {
  it("real_estate_land → real_estate_apartment → 전 필드 보존 + category 변경", () => {
    const item = makeRealEstate();
    const preserved = pickPreservedFields({
      item,
      newCategory: "real_estate_apartment",
    });
    expect(preserved.category).toBe("real_estate_apartment");
    expect(preserved.estateAddress).toEqual({ road: "서울시 ○○로 123" });
    expect(preserved.marketValue).toBe(1_000_000_000);
    expect(preserved.standardPrice).toBe(800_000_000);
    expect(preserved.mortgageAmount).toBe(200_000_000);
  });

  it("cash → financial → 전 필드 보존", () => {
    const item: EstateItem = {
      id: "c-1",
      category: "cash",
      name: "현금",
      marketValue: 50_000_000,
    };
    const preserved = pickPreservedFields({ item, newCategory: "financial" });
    expect(preserved.category).toBe("financial");
    expect(preserved.marketValue).toBe(50_000_000);
  });
});

describe("pickPreservedFields — 그룹 간 변경", () => {
  it("real_estate_apartment → financial → 부동산 필드 손실, marketValue 보존", () => {
    const item = makeRealEstate({ category: "real_estate_apartment" });
    const preserved = pickPreservedFields({ item, newCategory: "financial" });
    expect(preserved.category).toBe("financial");
    expect(preserved.id).toBe(item.id);
    expect(preserved.name).toBe(item.name);
    expect(preserved.marketValue).toBe(1_000_000_000);
    expect(preserved.estateAddress).toBeUndefined();
    expect(preserved.standardPrice).toBeUndefined();
    expect(preserved.leaseDeposit).toBeUndefined();
    expect(preserved.mortgageAmount).toBeUndefined();
    expect(preserved.deductSecuredClaimAsDebt).toBeUndefined();
  });

  it("deposit → cash → leaseDeposit → marketValue 매핑", () => {
    const item: EstateItem = {
      id: "d-1",
      category: "deposit",
      name: "전세",
      leaseDeposit: 500_000_000,
    };
    const preserved = pickPreservedFields({ item, newCategory: "cash" });
    expect(preserved.category).toBe("cash");
    expect(preserved.marketValue).toBe(500_000_000);
  });

  it("cash → deposit → marketValue → leaseDeposit 매핑", () => {
    const item: EstateItem = {
      id: "c-2",
      category: "cash",
      name: "현금",
      marketValue: 300_000_000,
    };
    const preserved = pickPreservedFields({ item, newCategory: "deposit" });
    expect(preserved.category).toBe("deposit");
    expect(preserved.leaseDeposit).toBe(300_000_000);
  });

  it("heirAllocations 항상 보존 (그룹 간)", () => {
    const item = makeRealEstate({
      heirAllocations: [{ heirId: "h1", amount: 500_000_000 }],
    });
    const preserved = pickPreservedFields({ item, newCategory: "financial" });
    expect(preserved.heirAllocations).toEqual([
      { heirId: "h1", amount: 500_000_000 },
    ]);
  });
});

describe("pickPreservedFields — deemedCategory 호환성", () => {
  it("insurance + cash → 그룹 간 변경 시 deemedCategory 보존 (호환)", () => {
    const item: EstateItem = {
      id: "i-1",
      category: "financial",
      name: "보험금",
      marketValue: 100_000_000,
      deemedCategory: "insurance",
    };
    const preserved = pickPreservedFields({ item, newCategory: "cash" });
    expect(preserved.deemedCategory).toBe("insurance");
  });

  it("insurance + real_estate_land → 그룹 간 변경 시 deemedCategory 자동 undefined (비호환)", () => {
    const item: EstateItem = {
      id: "i-2",
      category: "financial",
      name: "보험금",
      marketValue: 100_000_000,
      deemedCategory: "insurance",
    };
    const preserved = pickPreservedFields({
      item,
      newCategory: "real_estate_land",
    });
    expect(preserved.deemedCategory).toBeUndefined();
  });
});

// ============================================================
// computeLossFields
// ============================================================

describe("computeLossFields", () => {
  it("그룹 내 변경 → 손실 0건", () => {
    const item = makeRealEstate();
    const preserved = pickPreservedFields({
      item,
      newCategory: "real_estate_apartment",
    });
    expect(computeLossFields(item, preserved)).toEqual([]);
  });

  it("real_estate → financial 그룹 간 → 6개 손실", () => {
    const item = makeRealEstate({ category: "real_estate_apartment" });
    const preserved = pickPreservedFields({ item, newCategory: "financial" });
    const loss = computeLossFields(item, preserved);
    expect(loss).toContain("estateAddress");
    expect(loss).toContain("standardPrice");
    expect(loss).toContain("appraisedValue");
    expect(loss).toContain("leaseDeposit");
    expect(loss).toContain("mortgageAmount");
    expect(loss).toContain("deductSecuredClaimAsDebt");
  });

  it("loss 결과는 LOSS_FIELD_LABELS에 매핑 가능 (한국어 라벨)", () => {
    const item = makeRealEstate({ category: "real_estate_apartment" });
    const preserved = pickPreservedFields({ item, newCategory: "cash" });
    const loss = computeLossFields(item, preserved);
    for (const key of loss) {
      expect(LOSS_FIELD_LABELS[key]).toBeDefined();
      expect(LOSS_FIELD_LABELS[key]).toMatch(/[가-힣]/); // 한국어 포함
    }
  });
});

// ============================================================
// LOSS_FIELD_LABELS — 한국어 라벨 매트릭스
// ============================================================

describe("LOSS_FIELD_LABELS — 한국어 라벨 13건", () => {
  it("13개 필드 모두 정의", () => {
    expect(Object.keys(LOSS_FIELD_LABELS)).toHaveLength(13);
  });

  it("주요 라벨 sample", () => {
    expect(LOSS_FIELD_LABELS.estateAddress).toBe("소재지 주소");
    expect(LOSS_FIELD_LABELS.deductSecuredClaimAsDebt).toBe(
      "§14 담보채무 자동공제",
    );
    expect(LOSS_FIELD_LABELS.deemedCategory).toBe("간주상속재산 분류");
  });
});
