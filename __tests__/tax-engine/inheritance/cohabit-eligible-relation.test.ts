/**
 * G5: 동거주택공제(§23의2) 대상 상속인 범위 확대 — anchor
 *
 * 법령: §23의2①1호 (2022.1.1. 개정, KoreanLaw time_travel 20210101↔20220101 자수 755→787 검증)
 *   ~2021.12.31.:  직계비속(child + 손자녀 legatee)만 적격
 *   2022.1.1.~:   직계비속 + 민법§1003② 대습상속된 직계비속의 배우자도 적격
 *
 * Pre-Do anchor (feedback_pre_anchor_verification):
 *   - G5-PRE2022-LINEAL: 2021 상속, legatee + isGenerationSkipBeneficiary=true, isSubstituteInheritance=false
 *     현행(child 하드코딩): false → RED. 변경 후: true
 *   - G5-SUBST-2022: 2022 상속, relation=other + isSubstituteInheritance=true
 *     현행: false → RED. 변경 후: true
 *
 * 계약 C1: HeirRelation에 lineal_descendant 추가 금지.
 *   legatee + isGenerationSkipBeneficiary=true + isSubstituteInheritance≠true = 손자녀(직계비속)
 * 계약 C2: 대습상속 배우자 = relation="other" + isSubstituteInheritance=true
 */
import { describe, it, expect } from "vitest";
import { isCohabitDeductionEligibleRelation } from "@/lib/tax-engine/deductions/inheritance-deductions";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("G5 §23의2①1호 적격 상속인 범위 — isCohabitDeductionEligibleRelation", () => {
  // ─── child (자녀): 전 기간 항상 적격 ───────────────────────────
  it("G5-CHILD-ALWAYS child는 전 기간 적격", () => {
    const heir: Heir = { id: "h1", relation: "child" };
    expect(isCohabitDeductionEligibleRelation(heir, "2015-01-01")).toBe(true);
    expect(isCohabitDeductionEligibleRelation(heir, "2020-01-01")).toBe(true);
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(true);
    expect(isCohabitDeductionEligibleRelation(heir, undefined)).toBe(true);
  });

  // ─── legatee 손자녀(직계비속): 전 기간 적격 (계약 C1) ────────────
  it("G5-LINEAL-DESC 2021 상속 손자녀(legatee+genSkip, 비대습) → 적격 ★Pre-Do RED", () => {
    // 현행: showCohabitant = relation==="child" → legatee는 false
    // 변경 후: 직계비속 손자녀로 인식 → true
    const heir: Heir = {
      id: "h2",
      relation: "legatee",
      isGenerationSkipBeneficiary: true,
      isSubstituteInheritance: false,
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2021-06-01")).toBe(true);
  });

  it("G5-LINEAL-DESC-2023 2023 상속 손자녀 → 적격", () => {
    const heir: Heir = {
      id: "h3",
      relation: "legatee",
      isGenerationSkipBeneficiary: true,
      isSubstituteInheritance: false,
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(true);
  });

  it("G5-LEGATEE-NOT-GENSKI legatee이지만 isGenerationSkipBeneficiary 미설정 → 부적격", () => {
    // legatee 수유자이지만 손자녀(직계비속) 판정 안 됨
    const heir: Heir = { id: "h4", relation: "legatee" };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(false);
  });

  // ─── 대습상속 배우자: 2022.1.1.~ (계약 C2) ─────────────────────
  it("G5-SUBST-2022 2022 상속, relation=other + isSubstituteInheritance=true → 적격 ★Pre-Do RED", () => {
    // 현행: relation!=="child" → false
    // 변경 후: deathDate >= 2022 + isSubstituteInheritance=true → true
    const heir: Heir = {
      id: "h5",
      relation: "other",
      isSubstituteInheritance: true,
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2022-06-01")).toBe(true);
  });

  it("G5-PRE2022-SUBST 2021.12.31. 이전 대습배우자 → 부적격", () => {
    // 2022 이전: 민법 §1003② 배우자 개정 미적용
    const heir: Heir = {
      id: "h6",
      relation: "other",
      isSubstituteInheritance: true,
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2021-06-01")).toBe(false);
  });

  it("G5-SUBST-EXACT-2022-01-01 2022-01-01 정확 경계 → 적격", () => {
    const heir: Heir = {
      id: "h7",
      relation: "other",
      isSubstituteInheritance: true,
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2022-01-01")).toBe(true);
  });

  it("G5-SUBST-2021-12-31 2021-12-31 경계 직전 → 부적격", () => {
    const heir: Heir = {
      id: "h8",
      relation: "other",
      isSubstituteInheritance: true,
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2021-12-31")).toBe(false);
  });

  // ─── 대습상속 legatee (§27 대습 + §23의2 적격 동시 해당) ─────────
  it("G5-SUBST-LEGATEE legatee + isSubstituteInheritance=true → 직계비속 대습(비손자녀 경로 제외)", () => {
    // isGenerationSkipBeneficiary=true가 없으므로 손자녀 아님
    // isSubstituteInheritance는 있지만 relation=legatee + genSkip 없으면 부적격
    const heir: Heir = {
      id: "h9",
      relation: "legatee",
      isSubstituteInheritance: true, // 대습 플래그 있어도 genSkip 없음
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(false);
  });

  // ─── 부적격 관계 ─────────────────────────────────────────────
  it("G5-SPOUSE 배우자 → 부적격 (배우자공제는 §19)", () => {
    const heir: Heir = { id: "h10", relation: "spouse" };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(false);
  });

  it("G5-ASCENDANT 직계존속 → 부적격", () => {
    const heir: Heir = { id: "h11", relation: "lineal_ascendant" };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(false);
  });

  it("G5-SIBLING 형제자매 → 부적격", () => {
    const heir: Heir = { id: "h12", relation: "sibling" };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(false);
  });

  it("G5-CORPORATE 영리법인 → 부적격", () => {
    const heir: Heir = { id: "h13", relation: "corporate" };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(false);
  });

  it("G5-OTHER-NO-SUBST relation=other 이지만 isSubstituteInheritance 없음 → 부적격", () => {
    const heir: Heir = { id: "h14", relation: "other" };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-01-01")).toBe(false);
  });

  it("G5-UNDEF-DEATHDATE deathDate undefined → 9999-12-31 가정 → 2022 이후이므로 대습배우자 적격", () => {
    const heir: Heir = {
      id: "h15",
      relation: "other",
      isSubstituteInheritance: true,
    };
    expect(isCohabitDeductionEligibleRelation(heir, undefined)).toBe(true);
  });

  // 후속: 그룹키 모델 대습 손자(직계비속) §23의2 적격 — KoreanLaw §23의2①1호 "직계비속"
  it("G5-SUBST-GRANDCHILD 대습 손자(other+descendant+forRelation=child) → 직계비속 적격(전 기간)", () => {
    const heir: Heir = {
      id: "h16",
      relation: "other",
      substituteGroupId: "g1",
      substituteForRelation: "child",
      substituteRole: "descendant",
    };
    // 직계비속 — 2009~ 전 기간 (대습배우자 2022 게이트와 무관)
    expect(isCohabitDeductionEligibleRelation(heir, "2015-05-01")).toBe(true);
  });

  it("G5-SUBST-NEPHEW 대습 조카(forRelation=sibling) → 피상속인 직계비속 아님 → 부적격", () => {
    const heir: Heir = {
      id: "h17",
      relation: "other",
      substituteGroupId: "g1",
      substituteForRelation: "sibling",
      substituteRole: "descendant",
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-05-01")).toBe(false);
  });

  it("G5-SUBST-GROUP-SPOUSE 그룹키 며느리(role=spouse) → 2022~ 대습배우자 적격·이전 부적격", () => {
    const heir: Heir = {
      id: "h18",
      relation: "other",
      substituteGroupId: "g1",
      substituteForRelation: "child",
      substituteRole: "spouse",
    };
    expect(isCohabitDeductionEligibleRelation(heir, "2023-05-01")).toBe(true);
    expect(isCohabitDeductionEligibleRelation(heir, "2020-05-01")).toBe(false);
  });
});
