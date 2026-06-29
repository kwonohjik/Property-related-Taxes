/**
 * 주택 게이트 — 양도세 감면 카테고리별 적용 가능 자산 판정 (2026-06-29)
 *
 * (B) 확정: rental(§97)=입주권·분양권 배제 / new·unsold=포함.
 */
import { describe, it, expect } from "vitest";
import {
  isReductionCategoryAllowedForAssetKind,
  isReductionAllowedForAssetKind,
  type ReductionAssetKind,
} from "@/lib/tax-engine/transfer-reductions";

const HOUSING: ReductionAssetKind = "housing";
const REDEV: ReductionAssetKind = "redevelopment_apt";
const MOVE_IN: ReductionAssetKind = "right_to_move_in";
const PRESALE: ReductionAssetKind = "presale_right";
const NON_HOUSING: ReductionAssetKind[] = ["land", "building", "commercial_building", "general_building"];

describe("isReductionCategoryAllowedForAssetKind", () => {
  it("rental(§97): housing·redevelopment_apt만 허용, 입주권·분양권 배제", () => {
    expect(isReductionCategoryAllowedForAssetKind("rental", HOUSING)).toBe(true);
    expect(isReductionCategoryAllowedForAssetKind("rental", REDEV)).toBe(true);
    expect(isReductionCategoryAllowedForAssetKind("rental", MOVE_IN)).toBe(false);
    expect(isReductionCategoryAllowedForAssetKind("rental", PRESALE)).toBe(false);
  });

  it("new_housing(§99)·unsold(§98·§99의2): 입주권·분양권 포함 허용", () => {
    for (const cat of ["new_housing", "unsold_housing"] as const) {
      expect(isReductionCategoryAllowedForAssetKind(cat, HOUSING)).toBe(true);
      expect(isReductionCategoryAllowedForAssetKind(cat, REDEV)).toBe(true);
      expect(isReductionCategoryAllowedForAssetKind(cat, MOVE_IN)).toBe(true);
      expect(isReductionCategoryAllowedForAssetKind(cat, PRESALE)).toBe(true);
    }
  });

  it("비주택 자산(토지·건물·상가·일반건물)은 3개 카테고리 전부 차단", () => {
    for (const kind of NON_HOUSING) {
      for (const cat of ["rental", "new_housing", "unsold_housing"] as const) {
        expect(isReductionCategoryAllowedForAssetKind(cat, kind)).toBe(false);
      }
    }
  });

  it("standalone(자경·공익)은 자산 종류 무관 항상 허용", () => {
    for (const kind of [...NON_HOUSING, HOUSING, MOVE_IN]) {
      expect(isReductionCategoryAllowedForAssetKind("standalone", kind)).toBe(true);
    }
  });
});

describe("isReductionAllowedForAssetKind (id 단위)", () => {
  it("신규 조문 id: 카테고리 게이트와 동일", () => {
    expect(isReductionAllowedForAssetKind("rental_97_3", PRESALE)).toBe(false); // rental → 분양권 배제
    expect(isReductionAllowedForAssetKind("new_99_3", PRESALE)).toBe(true); // new_housing → 포함
    expect(isReductionAllowedForAssetKind("unsold_99_2", MOVE_IN)).toBe(true); // unsold → 포함
    expect(isReductionAllowedForAssetKind("rental_97_main", "land")).toBe(false);
  });

  it("standalone 조문(self_farming·public_expropriation)은 항상 허용", () => {
    expect(isReductionAllowedForAssetKind("self_farming", "land")).toBe(true);
    expect(isReductionAllowedForAssetKind("public_expropriation", "commercial_building")).toBe(true);
  });

  it("레거시 평면 타입(long_term_rental·new_housing·unsold_housing)도 게이트 적용", () => {
    expect(isReductionAllowedForAssetKind("long_term_rental", PRESALE)).toBe(false); // rental
    expect(isReductionAllowedForAssetKind("long_term_rental", HOUSING)).toBe(true);
    expect(isReductionAllowedForAssetKind("new_housing", PRESALE)).toBe(true); // new_housing
    expect(isReductionAllowedForAssetKind("unsold_housing", "land")).toBe(false);
  });

  it("미지 타입은 차단하지 않음 (방어적)", () => {
    expect(isReductionAllowedForAssetKind("unknown_type", "land")).toBe(true);
  });
});
