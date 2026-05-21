/**
 * ANCHOR-P1~P11 — PR 3 부표 1 enum 정합화 + 헬퍼 함수 검증.
 *
 * 계획서: docs/00-pm/inheritance-besshi-9-buppyo-1-property-code-alignment.plan.md
 */

import { describe, it, expect } from "vitest";
import {
  getPropertyCategoryLabel,
  inferPropertyKindCode,
} from "@/components/calc/results/inheritance-filing-form-helpers";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

function buildGift(overrides: Partial<PriorGift>): PriorGift {
  return {
    giftDate: "2022-05-21",
    isHeir: true,
    giftAmount: 100_000_000,
    giftTaxPaid: 0,
    ...overrides,
  };
}

describe("PR 3 — 부표 1 enum 정합화 (getPropertyCategoryLabel)", () => {
  it("ANCHOR-P1: 04 개별주택 라벨", () => {
    const gift = buildGift({ propertyCategory: "real_estate_individual_house" });
    expect(getPropertyCategoryLabel(gift)).toBe("04 개별주택 (부수토지 포함)");
  });

  it("ANCHOR-P2: 06 오피스텔·상업용 라벨", () => {
    const gift = buildGift({ propertyCategory: "real_estate_officetel" });
    expect(getPropertyCategoryLabel(gift)).toBe(
      "06 오피스텔·상업용건물 (부수토지 포함)",
    );
  });

  it("ANCHOR-P3: 08 부동산 권리 라벨", () => {
    const gift = buildGift({ propertyCategory: "real_estate_acquisition_right" });
    expect(getPropertyCategoryLabel(gift)).toBe("08 부동산을 취득할 수 있는 권리");
  });

  it("ANCHOR-P4: 토지II 토글 ON → 03", () => {
    const gift = buildGift({
      propertyCategory: "real_estate_land",
      isAttachedLandToBuilding: true,
    });
    expect(getPropertyCategoryLabel(gift)).toBe("03 토지II (일반건물 부수토지)");
  });

  it("ANCHOR-P5: 토지I 토글 OFF → 02", () => {
    const gift = buildGift({
      propertyCategory: "real_estate_land",
      isAttachedLandToBuilding: false,
    });
    expect(getPropertyCategoryLabel(gift)).toBe("02 토지I (순수토지)");
  });

  it("ANCHOR-P6 (회귀): 토지 토글 미설정 — legacy 호환", () => {
    const gift = buildGift({ propertyCategory: "real_estate_land" });
    expect(getPropertyCategoryLabel(gift)).toBe(
      "02/03 토지 (부수토지 여부 미지정)",
    );
  });

  it("ANCHOR-P7 (회귀): 기존 cash 무변화", () => {
    const gift = buildGift({ propertyCategory: "cash" });
    expect(getPropertyCategoryLabel(gift)).toBe("01 현금");
  });

  it("ANCHOR-P8 (회귀): legacy deposit 보조 라벨 무변화", () => {
    const gift = buildGift({ propertyCategory: "deposit" });
    expect(getPropertyCategoryLabel(gift)).toBe("11 금융재산 (예금)");
  });

  it("ANCHOR-P8b: 09 유가증권(상장) 라벨 변경", () => {
    const gift = buildGift({ propertyCategory: "listed_stock" });
    expect(getPropertyCategoryLabel(gift)).toBe("09 유가증권 (상장)");
  });

  it("ANCHOR-P8c: 10 유가증권(비상장) 라벨 변경", () => {
    const gift = buildGift({ propertyCategory: "unlisted_stock" });
    expect(getPropertyCategoryLabel(gift)).toBe("10 유가증권 (비상장)");
  });

  it("ANCHOR-P8d: propertyCategory 미설정 fallback", () => {
    const gift = buildGift({});
    expect(getPropertyCategoryLabel(gift)).toBe("12 기타재산");
  });
});

describe("PR 3 — 재산구분코드 자동 추론 (inferPropertyKindCode)", () => {
  it("ANCHOR-P9: 자연인 상속인 → A21", () => {
    const gift = buildGift({ isHeir: true });
    expect(inferPropertyKindCode(gift)).toBe("A21");
  });

  it("ANCHOR-P9b: 자연인 비상속인 → A22", () => {
    const gift = buildGift({ isHeir: false });
    expect(inferPropertyKindCode(gift)).toBe("A22");
  });

  it("ANCHOR-P10: 영리법인 → A22", () => {
    const gift = buildGift({
      isHeir: false,
      beneficiaryType: "corporate",
      giftTaxPaid: 0,
      corporateGiftComputedTax: 50_000_000,
    });
    expect(inferPropertyKindCode(gift)).toBe("A22");
  });

  it("ANCHOR-P11: 창업자금 (조특법 §30의5) → A23", () => {
    const gift = buildGift({ isHeir: true });
    expect(inferPropertyKindCode(gift, "startup")).toBe("A23");
  });

  it("ANCHOR-P11b: 가업승계 (조특법 §30의6) → A24", () => {
    const gift = buildGift({ isHeir: true });
    expect(inferPropertyKindCode(gift, "family_business")).toBe("A24");
  });
});
