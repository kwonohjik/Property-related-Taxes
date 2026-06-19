import { describe, it, expect } from "vitest";
import {
  isCreditItemActive,
  creditItemHasValue,
  visibleCreditItems,
  isLinealAscendantDonor,
  type GiftCreditFormSlice,
} from "@/lib/calc/gift-credit-checklist";

const EMPTY: GiftCreditFormSlice = {
  donorRelation: "spouse",
  marriageExemption: "",
  birthExemption: "",
  priorUsedMarriageBirthDeduction: "",
  priorUsedDeduction: "",
  appraisalRealEstateFee: "",
  appraisalUnlistedFee: "",
  appraisalTangibleFee: "",
  foreignTaxPaid: "",
  specialTreatment: "",
  splitPaymentEnabled: false,
};
const NONE = new Set<never>();

describe("gift-credit-checklist", () => {
  it("빈 폼 + 미펼침 → 모든 항목 비활성(기본 접힘)", () => {
    for (const it of visibleCreditItems(EMPTY)) {
      expect(isCreditItemActive(EMPTY, it.key, NONE)).toBe(false);
    }
  });

  it("수동 펼침 → active", () => {
    expect(isCreditItemActive(EMPTY, "foreignTax", new Set(["foreignTax"]))).toBe(true);
  });

  it("[C1] specialTreatment 선택 → 값으로 항상 active (validation trigger 노출)", () => {
    const s = { ...EMPTY, specialTreatment: "family_business" };
    expect(creditItemHasValue(s, "specialTreatment")).toBe(true);
    expect(isCreditItemActive(s, "specialTreatment", NONE)).toBe(true);
  });

  it("[C1] splitPaymentEnabled true → 항상 active", () => {
    const s = { ...EMPTY, splitPaymentEnabled: true };
    expect(isCreditItemActive(s, "splitPayment", NONE)).toBe(true);
  });

  it("[C1] priorUsedMarriageBirthDeduction 값 → 혼인·출산 항상 active", () => {
    const s = { ...EMPTY, donorRelation: "lineal_ascendant_adult", priorUsedMarriageBirthDeduction: "5000000" };
    expect(isCreditItemActive(s, "marriageBirth", NONE)).toBe(true);
  });

  it("감정수수료/외국납부/기사용 — 값 입력 시 active", () => {
    expect(isCreditItemActive({ ...EMPTY, appraisalRealEstateFee: "100000" }, "appraisalFee", NONE)).toBe(true);
    expect(isCreditItemActive({ ...EMPTY, foreignTaxPaid: "100000" }, "foreignTax", NONE)).toBe(true);
    expect(isCreditItemActive({ ...EMPTY, priorUsedDeduction: "100000" }, "priorUsed", NONE)).toBe(true);
  });

  it("혼인·출산 칩 — 직계존속 공여자만 노출", () => {
    expect(visibleCreditItems(EMPTY).some((i) => i.key === "marriageBirth")).toBe(false);
    expect(isLinealAscendantDonor(EMPTY)).toBe(false);
    const asc = { ...EMPTY, donorRelation: "lineal_ascendant_minor" };
    expect(visibleCreditItems(asc).some((i) => i.key === "marriageBirth")).toBe(true);
    expect(isLinealAscendantDonor(asc)).toBe(true);
  });
});
