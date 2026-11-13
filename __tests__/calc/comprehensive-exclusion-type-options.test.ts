/**
 * 가드 — 종부세 합산배제 유형 선택지(`EXCLUSION_TYPE_OPTIONS`)가 Zod·엔진과 맞는지.
 * 계기(2026-11-13 실태조사 · docs/01-plan/features/comprehensive-rental-excl-7ho-construction-long.plan.md R-1):
 *  - 선택지 키 `public_support_rental`이 Zod에 없어 고르면 계산 400(#464가 건설·매입으로 나눌 때 이 목록을 놓쳤다).
 *  - 라벨 조문 번호 오기 4건(장기일반 매입 「2호」·공공지원 「3호」·공공건설 「4호」·공공매입 「5호」).
 *  - 첫 드롭다운이 임대등록 유형을 맞추지 않아 공공건설·공공매입·민간건설이 8호로 판정됐다.
 */
import { describe, it, expect } from "vitest";
import { EXCLUSION_TYPE_OPTIONS } from "@/components/calc/property-list-shared";
import { comprehensivePropertySchema } from "@/lib/validators/comprehensive-input";
import {
  isRentalExclusionType,
  toRegistrationType,
  validateRequiredExclusionAndLandInputs,
} from "@/lib/calc/comprehensive-api";
import { defaultFormData, makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveFormData } from "@/lib/stores/comprehensive-wizard-store";

const keys = EXCLUSION_TYPE_OPTIONS.map(([k]) => k);
const label = (k: string) => EXCLUSION_TYPE_OPTIONS.find(([key]) => key === k)?.[1] ?? "";

describe("선택지 키 = Zod exclusionType", () => {
  it.each(keys)("%s — Zod가 exclusionType으로 받는다", (k) => {
    const r = comprehensivePropertySchema.safeParse({ exclusionType: k });
    const exclusionIssues = r.success ? [] : r.error.issues.filter((i) => i.path[0] === "exclusionType");
    expect(exclusionIssues).toEqual([]);
  });
  it("폐기 키 public_support_rental은 선택지에 없다 · 공공지원 건설·매입·기존임대는 있다", () => {
    expect(keys).not.toContain("public_support_rental");
    expect(keys).toEqual(
      expect.arrayContaining(["public_support_construction_rental", "public_support_purchase_rental", "existing_rental"]),
    );
  });
});

describe("라벨 조문 번호 — 종부령 §3① 현행 호", () => {
  it.each([
    ["private_purchase_rental_long", "§3①8호"],
    ["private_purchase_rental_short", "§3①2호"],
    ["private_construction_rental", "§3①1호"],
    ["public_support_construction_rental", "§3①7호"],
    ["public_support_purchase_rental", "§3①8호"],
    ["public_construction_rental", "§3①1호"],
    ["public_purchase_rental", "§3①2호"],
    ["existing_rental", "§3①3호"],
    ["private_short_term_rental_6y_construction", "§3①10호"],
    ["private_short_term_rental_6y_purchase", "§3①11호"],
    ["unsold_purchase_rental", "§3①6호"],
  ])("%s → %s", (k, ho) => {
    expect(label(k)).toContain(ho);
  });
});

describe("⑤ 첫 드롭다운 → 임대등록 유형 동기화 대상", () => {
  it("선택지의 임대 키는 모두 동기화 대상이고 toRegistrationType이 기본값(장기일반 매입)으로 떨어지지 않는다", () => {
    const rental = keys.filter(isRentalExclusionType);
    expect(rental).toHaveLength(11);
    for (const k of rental) {
      if (k === "private_purchase_rental_long") continue;
      expect(toRegistrationType(k), k).not.toBe("private_purchase_long");
    }
  });
  it("§4 유형·미신청은 동기화하지 않는다", () => {
    expect(isRentalExclusionType("unsold_housing")).toBe(false);
    expect(isRentalExclusionType("none")).toBe(false);
  });
});

describe("⑧ 세션·이력에 남은 폐기 키", () => {
  it("public_support_rental이면 다시 고르라고 막는다(400 대신)", () => {
    const form = {
      ...defaultFormData,
      properties: [{ ...makeProperty(), assessedValue: "300,000,000", exclusionType: "public_support_rental" }],
    } as ComprehensiveFormData;
    expect(validateRequiredExclusionAndLandInputs(form)).toMatch(/합산배제 유형을 다시 고르세요/);
  });
});
