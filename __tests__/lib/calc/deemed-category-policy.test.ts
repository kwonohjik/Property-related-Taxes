/**
 * deemed-category-policy — 간주상속재산 호환 매트릭스 anchor
 *
 * Plan estate-card-followup-phase2 §INT-4·O-P2-6
 */

import { describe, it, expect } from "vitest";
import {
  DEEMED_ALLOWED_CATEGORIES,
  DEEMED_FILTER_NOTE,
  isDeemedCategoryCompatible,
} from "@/lib/calc/deemed-category-policy";

describe("DEEMED_ALLOWED_CATEGORIES", () => {
  it("none → 12 SupportedCategory 전체 허용 (deposit·superficies·intangible_ip·receivable·convertible_bond·crypto_asset 포함)", () => {
    expect(DEEMED_ALLOWED_CATEGORIES.none).toHaveLength(12);
    expect(DEEMED_ALLOWED_CATEGORIES.none).toContain("deposit");
    expect(DEEMED_ALLOWED_CATEGORIES.none).toContain("superficies");
    expect(DEEMED_ALLOWED_CATEGORIES.none).toContain("intangible_ip");
    expect(DEEMED_ALLOWED_CATEGORIES.none).toContain("receivable");
    expect(DEEMED_ALLOWED_CATEGORIES.none).toContain("convertible_bond");
    expect(DEEMED_ALLOWED_CATEGORIES.none).toContain("crypto_asset");
  });

  it("insurance (§8) → cash·financial·other만 (3건)", () => {
    expect(DEEMED_ALLOWED_CATEGORIES.insurance).toEqual([
      "cash",
      "financial",
      "other",
    ]);
  });

  it("trust (§9) → 전체 허용", () => {
    expect(DEEMED_ALLOWED_CATEGORIES.trust).toHaveLength(12);
  });

  it("retirement (§10) → cash·financial만 (2건)", () => {
    expect(DEEMED_ALLOWED_CATEGORIES.retirement).toEqual(["cash", "financial"]);
  });
});

describe("DEEMED_FILTER_NOTE 안내 문구", () => {
  it("insurance·trust·retirement 3건 정의", () => {
    expect(DEEMED_FILTER_NOTE.insurance).toContain("§8");
    expect(DEEMED_FILTER_NOTE.trust).toContain("§9");
    expect(DEEMED_FILTER_NOTE.retirement).toContain("§10");
  });
});

describe("isDeemedCategoryCompatible", () => {
  it("deemed=undefined → 모든 카테고리 호환 (true)", () => {
    expect(isDeemedCategoryCompatible(undefined, "real_estate_land")).toBe(true);
    expect(isDeemedCategoryCompatible(undefined, "cash")).toBe(true);
  });

  it("deemed=none → 모든 카테고리 호환 (true)", () => {
    expect(isDeemedCategoryCompatible("none", "real_estate_apartment")).toBe(true);
  });

  it("insurance + cash → true", () => {
    expect(isDeemedCategoryCompatible("insurance", "cash")).toBe(true);
    expect(isDeemedCategoryCompatible("insurance", "financial")).toBe(true);
    expect(isDeemedCategoryCompatible("insurance", "other")).toBe(true);
  });

  it("insurance + real_estate_* → false (§8 금전 한정)", () => {
    expect(isDeemedCategoryCompatible("insurance", "real_estate_land")).toBe(false);
    expect(isDeemedCategoryCompatible("insurance", "real_estate_building")).toBe(false);
    expect(isDeemedCategoryCompatible("insurance", "real_estate_apartment")).toBe(false);
  });

  it("insurance + deposit → false (deposit 비포함)", () => {
    expect(isDeemedCategoryCompatible("insurance", "deposit")).toBe(false);
  });

  it("trust + real_estate_land → true (§9 전체 허용)", () => {
    expect(isDeemedCategoryCompatible("trust", "real_estate_land")).toBe(true);
    expect(isDeemedCategoryCompatible("trust", "deposit")).toBe(true);
  });

  it("retirement + cash → true / + other → false", () => {
    expect(isDeemedCategoryCompatible("retirement", "cash")).toBe(true);
    expect(isDeemedCategoryCompatible("retirement", "financial")).toBe(true);
    expect(isDeemedCategoryCompatible("retirement", "other")).toBe(false);
    expect(isDeemedCategoryCompatible("retirement", "real_estate_land")).toBe(false);
  });

  it("insurance + listed_stock (stock 자산) → false (SupportedCategory 외)", () => {
    expect(isDeemedCategoryCompatible("insurance", "listed_stock")).toBe(false);
    expect(isDeemedCategoryCompatible("insurance", "unlisted_stock")).toBe(false);
  });
});
