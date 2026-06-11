/**
 * EstateItem Zod 스키마 round-trip anchor (H-7, 2026-06-04)
 *
 * 목적: estateItemSchema (discriminatedUnion)가 EstateItem optional 필드를
 *       strip 하지 않고 그대로 보존하는지 `.parse()` round-trip으로 검증.
 *
 * 가드 메커니즘: 신규 optional 필드를 schema에 추가하지 않으면 Zod strip →
 *   이 테스트가 RED가 됨 → 14지점 ⑫ 침묵 strip 회귀 탐지.
 *
 * H-6 짝: listedStockCode를 schema에 추가(H-6) 전에는 아래 케이스 L-1이 RED,
 *         추가 후 GREEN — 가드 실효성이 실증됨.
 *
 * 참조:
 *   - feedback_api_zod_schema_sync (14지점 ⑫ Zod 입력 객체 정의)
 *   - feedback_numeric_impact_verify_before_bug_claim (가드 실효성 검증)
 *   - project_listed_stock_name_typeahead (listedStockCode 도입)
 *   - project_section22_major_shareholder_toggle (isSection22MajorShareholder)
 *   - project_inheritance_cohabit_farming_autofill_v3 (isCohabitantHouse)
 *   - project_inheritance_collateral_66_max (securedClaimIsFinancialDebt)
 *   - project_inheritance_remaining_gaps_triage (isFinancialAssetForDeduction)
 */

import { describe, it, expect } from "vitest";
import { estateItemSchema } from "@/lib/validators/property-valuation-input";

// ─────────────────────────────────────────────────────────────────────────────
// 케이스 L-1: 상장주식 — listedStockCode (H-6 추가분) + besshi 메타 + §22 포함
// ─────────────────────────────────────────────────────────────────────────────
describe("EstateItem Zod round-trip — 상장주식 (listed_stock)", () => {
  const listed = {
    id: "rt-listed-001",
    category: "listed_stock" as const,
    name: "삼성전자",
    listedStockAvgPrice: 76_500,
    listedStockShares: 1_000,
    // H-6 핵심 — schema 미선언 시 strip → inheritance-asset-category.ts §63 분류 분기 무력
    listedStockCode: "005930",
    // besshi 메타
    companyName: "삼성전자(주)",
    representative: "홍길동",
    companyAddress: "경기 수원시",
    stockClass: "common" as const,
    listingDate: "2000-01-01",
    // §63③ 최대주주
    isMaxShareholder: true,
    companySize: "large" as const,
    premiumExclusionReason: "none" as const,
    // §22 최대주주 법정 배제
    isSection22MajorShareholder: true,
    // unlistedShareMode (라디오 상태 보존)
    unlistedShareMode: "none" as const,
    isCapitalIncreaseUnlistedShare: false,
  };

  it("L-1: listedStockCode 보존 (H-6 strip 방지 anchor)", () => {
    const result = estateItemSchema.safeParse(listed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "listed_stock") return;
    // H-6 추가 전에는 이 줄이 RED
    expect(result.data.listedStockCode).toBe("005930");
  });

  it("L-2: besshi 메타 필드 보존 (companyName·representative·companyAddress)", () => {
    const result = estateItemSchema.safeParse(listed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "listed_stock") return;
    expect(result.data.companyName).toBe("삼성전자(주)");
    expect(result.data.representative).toBe("홍길동");
    expect(result.data.companyAddress).toBe("경기 수원시");
    expect(result.data.stockClass).toBe("common");
    expect(result.data.listingDate).toBe("2000-01-01");
  });

  it("L-3: §63③ 최대주주·isSection22MajorShareholder 보존", () => {
    const result = estateItemSchema.safeParse(listed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "listed_stock") return;
    expect(result.data.isMaxShareholder).toBe(true);
    expect(result.data.companySize).toBe("large");
    expect(result.data.premiumExclusionReason).toBe("none");
    expect(result.data.isSection22MajorShareholder).toBe(true);
  });

  it("L-4: unlistedShareMode 보존 (UI 라디오 상태 round-trip)", () => {
    const result = estateItemSchema.safeParse(listed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "listed_stock") return;
    expect(result.data.unlistedShareMode).toBe("none");
    expect(result.data.isCapitalIncreaseUnlistedShare).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 케이스 U-1: 비상장주식 — isSection22MajorShareholder + unlistedValuationMode
// ─────────────────────────────────────────────────────────────────────────────
describe("EstateItem Zod round-trip — 비상장주식 (unlisted_stock)", () => {
  const unlisted = {
    id: "rt-unlisted-001",
    category: "unlisted_stock" as const,
    name: "비상장법인",
    unlistedValuationMode: "simple" as const,
    unlistedStockData: {
      totalShares: 10_000,
      ownedShares: 5_000,
      netAssetValue: 500_000_000,
      capitalizationRate: 0.1,
    },
    // baseItemSchema 공용 필드 (비상장도 적용)
    isSection22MajorShareholder: true,
    isFinancialAssetForDeduction: false,
  };

  it("U-1: isSection22MajorShareholder 보존 (비상장 §22 법정 배제)", () => {
    const result = estateItemSchema.safeParse(unlisted);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "unlisted_stock") return;
    expect(result.data.isSection22MajorShareholder).toBe(true);
  });

  it("U-2: unlistedValuationMode 보존 (simple/formal 모드 선택)", () => {
    const result = estateItemSchema.safeParse(unlisted);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "unlisted_stock") return;
    expect(result.data.unlistedValuationMode).toBe("simple");
  });

  it("U-3: isFinancialAssetForDeduction 보존 (§22 금융재산공제 자동화)", () => {
    const result = estateItemSchema.safeParse(unlisted);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "unlisted_stock") return;
    expect(result.data.isFinancialAssetForDeduction).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 케이스 G-1: 일반 자산 (apartment) — baseItemSchema 공용 optional 필드 보존
// ─────────────────────────────────────────────────────────────────────────────
describe("EstateItem Zod round-trip — 부동산 (real_estate_apartment)", () => {
  const apt = {
    id: "rt-apt-001",
    category: "real_estate_apartment" as const,
    name: "서울 아파트",
    marketValue: 800_000_000,
    standardPrice: 600_000_000,
    areaSqm: 84.99,
    // §23의2 동거주택
    isCohabitantHouse: true,
    // §22 금융재산공제
    isFinancialAssetForDeduction: false,
    // 담보채무 §14
    securedClaimIsFinancialDebt: true,
    deductSecuredClaimAsDebt: true,
    securedClaimCreditorName: "국민은행",
    mortgageAmount: 200_000_000,
    // 평가방식
    valuationMethod: "market_value" as const,
  };

  it("G-1: isCohabitantHouse 보존 (§23의2 동거주택 자동도출 v3)", () => {
    const result = estateItemSchema.safeParse(apt);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "real_estate_apartment") return;
    expect(result.data.isCohabitantHouse).toBe(true);
  });

  it("G-2: securedClaimIsFinancialDebt·deductSecuredClaimAsDebt 보존 (§14 담보채무)", () => {
    const result = estateItemSchema.safeParse(apt);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "real_estate_apartment") return;
    expect(result.data.securedClaimIsFinancialDebt).toBe(true);
    expect(result.data.deductSecuredClaimAsDebt).toBe(true);
    expect(result.data.securedClaimCreditorName).toBe("국민은행");
  });

  it("G-3: valuationMethod 보존 (평가방식 라디오)", () => {
    const result = estateItemSchema.safeParse(apt);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "real_estate_apartment") return;
    expect(result.data.valuationMethod).toBe("market_value");
  });

  it("G-4: §47① assumedDebtForGift·burdenedGiftDebtConfirmed 보존 (부담부증여 strip 방지)", () => {
    const result = estateItemSchema.safeParse({
      ...apt,
      assumedDebtForGift: 400_000_000,
      burdenedGiftDebtConfirmed: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "real_estate_apartment") return;
    expect(result.data.assumedDebtForGift).toBe(400_000_000);
    expect(result.data.burdenedGiftDebtConfirmed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 케이스 M-1: 메타 anchor — schema에 없는 가짜 필드는 strip됨 (가드 실효성)
// ─────────────────────────────────────────────────────────────────────────────
describe("메타 anchor — Zod strip 동작 자체 검증", () => {
  it("M-1: schema에 미선언된 가짜 필드는 strip됨 (가드 메커니즘 실효성 확인)", () => {
    const withFakeField = {
      id: "meta-001",
      category: "real_estate_land" as const,
      name: "토지",
      marketValue: 100_000_000,
      // schema에 존재하지 않는 가짜 필드
      __nonExistentField__: "should_be_stripped",
    };
    const result = estateItemSchema.safeParse(withFakeField);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Zod strip이 작동하므로 가짜 필드는 사라져야 함
    expect((result.data as Record<string, unknown>)["__nonExistentField__"]).toBeUndefined();
  });

  it("M-2: schema에 선언된 필드는 strip 안 됨 (정상 보존 확인)", () => {
    const withRealField = {
      id: "meta-002",
      category: "real_estate_land" as const,
      name: "토지",
      marketValue: 50_000_000,
      isCohabitantHouse: true,       // baseItemSchema 선언됨
      isFinancialAssetForDeduction: false, // baseItemSchema 선언됨
    };
    const result = estateItemSchema.safeParse(withRealField);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // 선언된 필드는 보존
    expect(result.data.isCohabitantHouse).toBe(true);
    expect(result.data.isFinancialAssetForDeduction).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 케이스 E-1: listedStockCode RED→GREEN 가드 실효성 실증 (H-6 짝)
// H-6 추가 전: listedStockCode는 strip되어 undefined → inheritance-asset-category
//   §63 분류 분기(item.listedStockCode != null)가 항상 false
// H-6 추가 후: strip 방지 → 분기 정상 작동
// ─────────────────────────────────────────────────────────────────────────────
describe("H-6·H-7 짝 — listedStockCode 가드 실효성", () => {
  it("E-1: listedStockCode='005930' 입력 후 parse → '005930' 보존 (GREEN after H-6)", () => {
    const result = estateItemSchema.safeParse({
      id: "e1-listed",
      category: "listed_stock",
      name: "삼성전자",
      listedStockAvgPrice: 76_500,
      listedStockShares: 100,
      listedStockCode: "005930",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "listed_stock") return;
    // H-6 전: strip → undefined (RED)
    // H-6 후: 보존 → "005930" (GREEN)
    expect(result.data.listedStockCode).toBe("005930");
  });

  it("E-2: listedStockCode 미입력 → undefined (schema optional 정합)", () => {
    const result = estateItemSchema.safeParse({
      id: "e2-listed",
      category: "listed_stock",
      name: "현대차",
      listedStockAvgPrice: 200_000,
      listedStockShares: 50,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.category !== "listed_stock") return;
    expect(result.data.listedStockCode).toBeUndefined();
  });
});
