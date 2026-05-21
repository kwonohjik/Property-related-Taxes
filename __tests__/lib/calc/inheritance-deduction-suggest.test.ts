/**
 * 상속세 자동 채움 헬퍼 — anchor 테스트
 *
 * 계획서: docs/00-pm/inheritance-additional-deduction-autofill.plan.md §8.2
 */

import { describe, expect, it } from "vitest";

import {
  suggestCohabitHouseCandidates,
  suggestFamilyBusinessValue,
  suggestFarmingAssetValue,
  suggestLegateeAmountNonHeir,
  suggestNetFinancialAssets,
  suggestPriorGiftDeductionTotal,
  suggestSpouseActualAmount,
} from "@/lib/calc/inheritance-deduction-suggest";
import type {
  DebtItem,
  EstateItem,
  Heir,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼
// ============================================================

function asset(over: Partial<EstateItem>): EstateItem {
  return {
    id: over.id ?? "a1",
    category: over.category ?? "financial",
    name: over.name ?? "예금",
    ...over,
  };
}

function debt(over: Partial<DebtItem>): DebtItem {
  return {
    id: over.id ?? "d1",
    category: over.category ?? "financial",
    name: over.name ?? "은행대출",
    amount: over.amount ?? 0,
    ...over,
  };
}

function heir(over: Partial<Heir>): Heir {
  return {
    id: over.id ?? "h1",
    relation: over.relation ?? "child",
    ...over,
  };
}

function gift(over: Partial<PriorGift>): PriorGift {
  return {
    giftDate: over.giftDate ?? "2020-01-01",
    isHeir: over.isHeir ?? true,
    giftAmount: over.giftAmount ?? 0,
    giftTaxPaid: over.giftTaxPaid ?? 0,
    ...over,
  };
}

// ============================================================
// ADS-1 ~ ADS-5: 순 금융재산
// ============================================================

describe("suggestNetFinancialAssets — 순 금융재산 §22", () => {
  it("ADS-1: 예금 5천만(default true) + 부동산 10억(default false) → 5천만", () => {
    const items = [
      asset({ id: "a1", category: "financial", marketValue: 50_000_000 }),
      asset({
        id: "a2",
        category: "real_estate_land",
        standardPrice: 1_000_000_000,
      }),
    ];
    const r = suggestNetFinancialAssets(items, []);
    expect(r.value).toBe(50_000_000);
    expect(r.isApplicable).toBe(true);
  });

  it("ADS-2: 예금 5천만 + 금융기관 대출 3천만(financial) → 2천만", () => {
    const items = [asset({ category: "financial", marketValue: 50_000_000 })];
    const debts = [debt({ category: "financial", amount: 30_000_000 })];
    const r = suggestNetFinancialAssets(items, debts);
    expect(r.value).toBe(20_000_000);
  });

  it("ADS-2b: 예금 5천만 + 사적채무 3천만(personal) → 5천만 (§19④ 제외, override 불가)", () => {
    const items = [asset({ category: "financial", marketValue: 50_000_000 })];
    const debts = [
      debt({
        category: "personal",
        amount: 30_000_000,
        isFinancialDebtForDeduction: true, // override 시도 — 강제 false
      }),
    ];
    const r = suggestNetFinancialAssets(items, debts);
    expect(r.value).toBe(50_000_000);
  });

  it("ADS-3: 보험금 2억(insurance) + 퇴직금 1억(retirement) → 2억", () => {
    const items = [
      asset({
        id: "a1",
        category: "cash",
        deemedCategory: "insurance",
        marketValue: 200_000_000,
      }),
      asset({
        id: "a2",
        category: "cash",
        deemedCategory: "retirement",
        marketValue: 100_000_000,
      }),
    ];
    const r = suggestNetFinancialAssets(items, []);
    expect(r.value).toBe(200_000_000);
  });

  it("ADS-4: 채무가 자산보다 큼 → 0 (음수 차단)", () => {
    const items = [asset({ category: "financial", marketValue: 10_000_000 })];
    const debts = [debt({ category: "financial", amount: 20_000_000 })];
    const r = suggestNetFinancialAssets(items, debts);
    expect(r.value).toBe(0);
    expect(r.notes?.some((n) => n.includes("차감 채무가 자산보다"))).toBe(true);
  });

  it("ADS-5: debtItems undefined (legacy 모드) → debts=0 + 안내", () => {
    const items = [asset({ category: "financial", marketValue: 50_000_000 })];
    const r = suggestNetFinancialAssets(items, undefined);
    expect(r.value).toBe(50_000_000);
    expect(r.notes?.some((n) => n.includes("협의분할 모드"))).toBe(true);
  });

  it("자산·채무 모두 0건 → isApplicable=false", () => {
    const r = suggestNetFinancialAssets([], []);
    expect(r.isApplicable).toBe(false);
  });

  it("trust + cash_trust → 포함", () => {
    const items = [
      asset({
        id: "a1",
        category: "other",
        deemedCategory: "trust",
        trustType: "cash_trust",
        marketValue: 300_000_000,
      }),
    ];
    const r = suggestNetFinancialAssets(items, []);
    expect(r.value).toBe(300_000_000);
  });

  it("trust + real_estate → 미포함", () => {
    const items = [
      asset({
        id: "a1",
        category: "other",
        deemedCategory: "trust",
        trustType: "real_estate",
        marketValue: 500_000_000,
      }),
    ];
    const r = suggestNetFinancialAssets(items, []);
    expect(r.value).toBe(0);
    expect(r.isApplicable).toBe(false);
  });
});

// ============================================================
// ADS-6 ~ ADS-7: 사전증여 증여재산공제
// ============================================================

describe("suggestPriorGiftDeductionTotal — §53", () => {
  it("ADS-6: 배우자 회차 1건 6억 → 6억 (한도)", () => {
    const r = suggestPriorGiftDeductionTotal([
      gift({ doneeRelation: "spouse", giftAmount: 600_000_000 }),
    ]);
    expect(r.value).toBe(600_000_000);
  });

  it("ADS-7: 직계비속 회차 2건 합 5천만 한도", () => {
    const r = suggestPriorGiftDeductionTotal([
      gift({ doneeRelation: "lineal_descendant", giftAmount: 30_000_000 }),
      gift({ doneeRelation: "lineal_descendant", giftAmount: 40_000_000 }),
    ]);
    // 합 7천만 → 한도 5천만 적용
    expect(r.value).toBe(50_000_000);
  });

  it("배우자 + 직계비속 혼합 → 합산 (6억 + 5천만)", () => {
    const r = suggestPriorGiftDeductionTotal([
      gift({ doneeRelation: "spouse", giftAmount: 1_000_000_000 }),
      gift({ doneeRelation: "lineal_descendant", giftAmount: 100_000_000 }),
    ]);
    expect(r.value).toBe(600_000_000 + 50_000_000);
  });

  it("doneeRelation 미입력 → 자동 합계 제외 + 안내", () => {
    const r = suggestPriorGiftDeductionTotal([
      gift({ giftAmount: 100_000_000 }),  // doneeRelation undefined
    ]);
    expect(r.value).toBe(0);
    expect(r.notes?.some((n) => n.includes("관계 미입력"))).toBe(true);
  });

  it("사전증여 0건 → isApplicable=false", () => {
    const r = suggestPriorGiftDeductionTotal([]);
    expect(r.isApplicable).toBe(false);
  });
});

// ============================================================
// ADS-8: 가업상속재산가액
// ============================================================

describe("suggestFamilyBusinessValue — §18의2", () => {
  it("ADS-8: isFamilyBusinessAsset=true 2건 합산", () => {
    const items = [
      asset({
        id: "a1",
        category: "unlisted_stock",
        marketValue: 2_000_000_000,
        isFamilyBusinessAsset: true,
      }),
      asset({
        id: "a2",
        category: "other",
        marketValue: 1_000_000_000,
        isFamilyBusinessAsset: true,
      }),
      asset({
        id: "a3",
        category: "real_estate_land",
        standardPrice: 500_000_000,
        // 가업자산 아님 — 제외
      }),
    ];
    const r = suggestFamilyBusinessValue(items);
    expect(r.value).toBe(3_000_000_000);
  });

  it("isFamilyBusinessAsset=true 자산 없음 → isApplicable=false", () => {
    const r = suggestFamilyBusinessValue([
      asset({ category: "financial", marketValue: 100_000_000 }),
    ]);
    expect(r.isApplicable).toBe(false);
  });
});

// ============================================================
// ADS-9: 상속외자 유증
// ============================================================

describe("suggestLegateeAmountNonHeir", () => {
  it("ADS-9: legatee 분배 합 (heir 분배 제외)", () => {
    const heirs = [
      heir({ id: "h1", relation: "spouse" }),
      heir({ id: "h2", relation: "child" }),
      heir({ id: "h3", relation: "legatee" }),  // 손녀 등
    ];
    const items = [
      asset({
        id: "a1",
        marketValue: 1_000_000_000,
        heirAllocations: [
          { heirId: "h1", amount: 400_000_000 },
          { heirId: "h2", amount: 400_000_000 },
          { heirId: "h3", amount: 200_000_000 },
        ],
      }),
    ];
    const r = suggestLegateeAmountNonHeir(items, heirs);
    expect(r.value).toBe(200_000_000);
  });

  it("협의분할 없음 → isApplicable=false", () => {
    const heirs = [heir({ id: "h3", relation: "legatee" })];
    const items = [asset({ marketValue: 100_000_000 })];
    const r = suggestLegateeAmountNonHeir(items, heirs);
    expect(r.isApplicable).toBe(false);
  });

  it("상속외자 없음 → isApplicable=false", () => {
    const heirs = [heir({ id: "h1", relation: "spouse" })];
    const items = [
      asset({
        marketValue: 100_000_000,
        heirAllocations: [{ heirId: "h1", amount: 100_000_000 }],
      }),
    ];
    const r = suggestLegateeAmountNonHeir(items, heirs);
    expect(r.isApplicable).toBe(false);
  });
});

// ============================================================
// ADS-10: 배우자 실제 상속액
// ============================================================

// ============================================================
// ADS-11: 동거주택 후보
// ============================================================

// ============================================================
// FS-1 ~ FS-6: 영농상속재산가액
// ============================================================

describe("suggestFarmingAssetValue — 영농상속재산 §18의3", () => {
  it("FS-1: 농지 5억 + 초지 2억 → 7억", () => {
    const items = [
      asset({ id: "a1", category: "real_estate_land", farmingCategory: "farmland", standardPrice: 500_000_000 }),
      asset({ id: "a2", category: "real_estate_land", farmingCategory: "pasture", standardPrice: 200_000_000 }),
    ];
    const r = suggestFarmingAssetValue(items);
    expect(r.value).toBe(700_000_000);
    expect(r.isApplicable).toBe(true);
  });

  it("FS-2: 농지 5억 + 저당 1억 → 4억 (§16⑤ 단서)", () => {
    const items = [
      asset({
        id: "a1",
        category: "real_estate_land",
        farmingCategory: "farmland",
        standardPrice: 500_000_000,
        mortgageAmount: 100_000_000,
      }),
    ];
    const r = suggestFarmingAssetValue(items);
    expect(r.value).toBe(400_000_000);
  });

  it("FS-3: farmingCategory 미설정 자산 → 제외", () => {
    const items = [
      asset({ id: "a1", category: "real_estate_land", standardPrice: 500_000_000 }),  // farmingCategory undefined
      asset({ id: "a2", category: "real_estate_land", farmingCategory: "farmland", standardPrice: 200_000_000 }),
    ];
    const r = suggestFarmingAssetValue(items);
    expect(r.value).toBe(200_000_000);
  });

  it("FS-4: 영농 자산 0건 → isApplicable=false", () => {
    const r = suggestFarmingAssetValue([
      asset({ id: "a1", category: "real_estate_land", standardPrice: 500_000_000 }),
    ]);
    expect(r.isApplicable).toBe(false);
  });

  it("FS-5: 담보가 자산보다 큼 → 0 (음수 차단)", () => {
    const items = [
      asset({
        id: "a1",
        category: "real_estate_land",
        farmingCategory: "farmland",
        standardPrice: 100_000_000,
        mortgageAmount: 200_000_000,
      }),
    ];
    const r = suggestFarmingAssetValue(items);
    expect(r.value).toBe(0);
  });

  it("FS-6: 농지 35억 → suggestion=35억 + 30억 한도 안내", () => {
    const items = [
      asset({
        id: "a1",
        category: "real_estate_land",
        farmingCategory: "farmland",
        marketValue: 3_500_000_000,
      }),
    ];
    const r = suggestFarmingAssetValue(items);
    expect(r.value).toBe(3_500_000_000);
    expect(r.notes?.some((n) => n.includes("30억 한도"))).toBe(true);
  });
});

describe("suggestCohabitHouseCandidates", () => {
  it("ADS-11: 주택 2건 + isCohabitant=true 자녀 1명 → 후보 2건 isApplicable", () => {
    const heirs = [
      heir({ id: "h1", relation: "child", isCohabitant: true }),
      heir({ id: "h2", relation: "child" }),
    ];
    const items = [
      asset({
        id: "a1",
        category: "real_estate_apartment",
        name: "강남 아파트",
        standardPrice: 800_000_000,
      }),
      asset({
        id: "a2",
        category: "real_estate_building",
        name: "본가 단독주택",
        standardPrice: 500_000_000,
      }),
      asset({
        id: "a3",
        category: "real_estate_land",
        standardPrice: 300_000_000,
      }),
    ];
    const r = suggestCohabitHouseCandidates(items, heirs);
    expect(r.candidates.length).toBe(2);
    expect(r.hasCohabitantChild).toBe(true);
    expect(r.isApplicable).toBe(true);
  });

  it("동거 자녀 없음 → isApplicable=false", () => {
    const heirs = [heir({ id: "h1", relation: "child" })];
    const items = [
      asset({
        id: "a1",
        category: "real_estate_apartment",
        standardPrice: 800_000_000,
      }),
    ];
    const r = suggestCohabitHouseCandidates(items, heirs);
    expect(r.isApplicable).toBe(false);
    expect(r.hasCohabitantChild).toBe(false);
  });

  it("주택 없음 → 후보 0건", () => {
    const heirs = [heir({ id: "h1", relation: "child", isCohabitant: true })];
    const items = [
      asset({ id: "a1", category: "real_estate_land", standardPrice: 100_000_000 }),
    ];
    const r = suggestCohabitHouseCandidates(items, heirs);
    expect(r.candidates.length).toBe(0);
    expect(r.isApplicable).toBe(false);
  });

  it("standardPrice 0 또는 미입력 → 후보 제외", () => {
    const heirs = [heir({ id: "h1", relation: "child", isCohabitant: true })];
    const items = [
      asset({ id: "a1", category: "real_estate_apartment" }),  // standardPrice undefined
      asset({
        id: "a2",
        category: "real_estate_apartment",
        standardPrice: 0,
      }),
    ];
    const r = suggestCohabitHouseCandidates(items, heirs);
    expect(r.candidates.length).toBe(0);
  });
});

describe("suggestSpouseActualAmount", () => {
  it("ADS-10: 협의분할 spouse 분배 합", () => {
    const heirs = [
      heir({ id: "h1", relation: "spouse" }),
      heir({ id: "h2", relation: "child" }),
    ];
    const items = [
      asset({
        id: "a1",
        marketValue: 1_000_000_000,
        heirAllocations: [
          { heirId: "h1", amount: 600_000_000 },
          { heirId: "h2", amount: 400_000_000 },
        ],
      }),
    ];
    const r = suggestSpouseActualAmount(items, heirs);
    expect(r.value).toBe(600_000_000);
  });

  it("배우자 없음 → isApplicable=false", () => {
    const r = suggestSpouseActualAmount([], [heir({ relation: "child" })]);
    expect(r.isApplicable).toBe(false);
  });

  it("협의분할 없음 → isApplicable=false (엔진 fallback 안내)", () => {
    const heirs = [heir({ id: "h1", relation: "spouse" })];
    const items = [asset({ marketValue: 100_000_000 })];
    const r = suggestSpouseActualAmount(items, heirs);
    expect(r.isApplicable).toBe(false);
    expect(r.reason).toContain("법정상속분");
  });
});
