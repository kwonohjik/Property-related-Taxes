/**
 * 사전증여 수증자 파생 헬퍼 — anchor (A1·A2)
 *
 * Plan/Design: inheritance-prior-gift-donee-redesign
 */

import { describe, it, expect } from "vitest";
import {
  deriveDoneeRelationFromHeir,
  deriveBeneficiaryTypeFromHeir,
  deriveIsHeirFromHeir,
  isNonHeirRelation,
} from "@/lib/calc/prior-gift-donee-derive";
import type { Heir, HeirRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeHeir(relation: HeirRelation, overrides: Partial<Heir> = {}): Heir {
  return { id: "h1", relation, ...overrides };
}

describe("A1 — deriveDoneeRelationFromHeir (Heir.relation → DonorRelation)", () => {
  it("spouse → spouse", () => {
    expect(deriveDoneeRelationFromHeir("spouse")).toBe("spouse");
  });
  it("child → lineal_descendant", () => {
    expect(deriveDoneeRelationFromHeir("child")).toBe("lineal_descendant");
  });
  it("lineal_ascendant → lineal_ascendant_adult", () => {
    expect(deriveDoneeRelationFromHeir("lineal_ascendant")).toBe("lineal_ascendant_adult");
  });
  it("sibling → other_relative", () => {
    expect(deriveDoneeRelationFromHeir("sibling")).toBe("other_relative");
  });
  it("other → other_relative", () => {
    expect(deriveDoneeRelationFromHeir("other")).toBe("other_relative");
  });
  it("legatee → undefined (§53 공제 대상 아님)", () => {
    expect(deriveDoneeRelationFromHeir("legatee")).toBeUndefined();
  });
  it("corporate → undefined", () => {
    expect(deriveDoneeRelationFromHeir("corporate")).toBeUndefined();
  });
});

describe("A2 — deriveBeneficiaryTypeFromHeir (Heir → beneficiaryType, isHeir 일관)", () => {
  it("corporate → corporate", () => {
    expect(deriveBeneficiaryTypeFromHeir(makeHeir("corporate"))).toBe("corporate");
  });
  it("legatee → legatee", () => {
    expect(deriveBeneficiaryTypeFromHeir(makeHeir("legatee"))).toBe("legatee");
  });
  it("spouse → heir", () => {
    expect(deriveBeneficiaryTypeFromHeir(makeHeir("spouse"))).toBe("heir");
  });
  it("child → heir", () => {
    expect(deriveBeneficiaryTypeFromHeir(makeHeir("child"))).toBe("heir");
  });
  it("sibling → heir", () => {
    expect(deriveBeneficiaryTypeFromHeir(makeHeir("sibling"))).toBe("heir");
  });
  // ★ K 정정: isHeir prop이 false인 일반 relation → legatee (deriveIsHeirFromHeir 일관)
  it("child + isHeir=false → legatee (cutoff·분류 일관)", () => {
    expect(deriveBeneficiaryTypeFromHeir(makeHeir("child", { isHeir: false }))).toBe("legatee");
  });
  it("spouse + isHeir=true → heir", () => {
    expect(deriveBeneficiaryTypeFromHeir(makeHeir("spouse", { isHeir: true }))).toBe("heir");
  });
});

describe("deriveIsHeirFromHeir / isNonHeirRelation — 일관성 보조", () => {
  it("isNonHeirRelation: legatee·corporate true, 그 외 false", () => {
    expect(isNonHeirRelation("legatee")).toBe(true);
    expect(isNonHeirRelation("corporate")).toBe(true);
    expect(isNonHeirRelation("spouse")).toBe(false);
    expect(isNonHeirRelation("child")).toBe(false);
  });
  it("deriveIsHeirFromHeir: isHeir prop 우선", () => {
    expect(deriveIsHeirFromHeir(makeHeir("child"))).toBe(true);
    expect(deriveIsHeirFromHeir(makeHeir("legatee"))).toBe(false);
    expect(deriveIsHeirFromHeir(makeHeir("child", { isHeir: false }))).toBe(false);
    expect(deriveIsHeirFromHeir(makeHeir("legatee", { isHeir: true }))).toBe(true);
  });
  // beneficiaryType ↔ isHeir 항상 일관 (모순 방지 — 6차 검토 K)
  it("beneficiaryType·isHeir 일관: child+isHeir=false → 둘 다 비상속인", () => {
    const h = makeHeir("child", { isHeir: false });
    expect(deriveIsHeirFromHeir(h)).toBe(false);
    expect(deriveBeneficiaryTypeFromHeir(h)).toBe("legatee");
  });
});
