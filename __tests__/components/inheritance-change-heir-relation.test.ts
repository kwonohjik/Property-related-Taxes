import { describe, it, expect } from "vitest";
import { changeHeirRelation } from "@/components/calc/HeirComposition";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 상속인/수유자/법인 "종류 변경" 시 정합성 정리 (changeHeirRelation).
 *
 * 핵심: id·name 보존(자산 heirAllocations 참조 유지) + 새 관계에서 의미 없는
 * 전용 필드 제거(엔진 인적공제·법인면제 계산 정합성).
 */

// 모든 전용 필드를 채운 자연인(자녀)
const fullChild: Heir = {
  id: "heir-1",
  relation: "child",
  name: "홍자녀",
  birthDate: "2010-01-01",
  isDisabled: true,
  isCohabitant: true,
  isGenerationSkipBeneficiary: true,
};

// 모든 전용 필드를 채운 법인
const fullCorporate: Heir = {
  id: "heir-2",
  relation: "corporate",
  name: "M 주식회사",
  isForProfit: true,
  businessRegistrationNumber: "000-00-00000",
  businessAddress: "서울시 강남구",
  corporateGiftComputedTax: 5_000_000,
  shareholders: [{ id: "sh-1", relation: "heir", name: "주주", shareRatio: 0.6 }],
};

describe("changeHeirRelation — 종류 변경 정합성 정리", () => {
  it("CR-1: 자녀 → 법인 — 자연인 전용 필드 제거, id·name 보존", () => {
    const next = changeHeirRelation(fullChild, "corporate");
    expect(next.relation).toBe("corporate");
    // id·name 보존 (자산 협의분할 참조 유지)
    expect(next.id).toBe("heir-1");
    expect(next.name).toBe("홍자녀");
    // 자연인 전용 필드 제거 (법인은 인적공제·동거주택·세대생략 대상 아님)
    expect(next.birthDate).toBeUndefined();
    expect(next.isDisabled).toBeUndefined();
    expect(next.isCohabitant).toBeUndefined();
    expect(next.isGenerationSkipBeneficiary).toBeUndefined();
  });

  it("CR-2: 법인 → 배우자 — 법인 전용 필드 제거, id·name 보존", () => {
    const next = changeHeirRelation(fullCorporate, "spouse");
    expect(next.relation).toBe("spouse");
    expect(next.id).toBe("heir-2");
    expect(next.name).toBe("M 주식회사");
    // 법인 전용 필드 제거
    expect(next.isForProfit).toBeUndefined();
    expect(next.shareholders).toBeUndefined();
    expect(next.businessRegistrationNumber).toBeUndefined();
    expect(next.businessAddress).toBeUndefined();
    expect(next.corporateGiftComputedTax).toBeUndefined();
  });

  it("CR-3: 자녀 → 형제자매 — birthDate 보존(생년월일 대상), 동거주택만 해제", () => {
    const next = changeHeirRelation(fullChild, "sibling");
    expect(next.relation).toBe("sibling");
    // 형제자매도 생년월일 입력 대상 → 보존
    expect(next.birthDate).toBe("2010-01-01");
    // 장애인공제는 관계 무관 → 보존
    expect(next.isDisabled).toBe(true);
    // 동거주택(§23의2)은 자녀 전용 → 해제
    expect(next.isCohabitant).toBeUndefined();
  });

  it("CR-4: 자녀 → 배우자 — birthDate 제거(배우자는 생년월일 비대상), 동거주택 해제", () => {
    const next = changeHeirRelation(fullChild, "spouse");
    expect(next.relation).toBe("spouse");
    // 배우자는 생년월일 UI 비대상 → 잔류 데이터의 공제 영향 차단
    expect(next.birthDate).toBeUndefined();
    expect(next.isCohabitant).toBeUndefined();
    // 장애인 토글은 배우자도 노출(비법인) → 보존
    expect(next.isDisabled).toBe(true);
  });

  it("CR-5: 기타 → 수유자 — birthDate 보존, id 보존 (B-2: legatee §27 미성년 판정용)", () => {
    const other: Heir = {
      id: "heir-granddaughter",
      relation: "other",
      name: "홍손녀딸",
      birthDate: "2015-05-05",
    };
    const next = changeHeirRelation(other, "legatee");
    expect(next.relation).toBe("legatee");
    // id 보존 → 자산 heirAllocations[].heirId 참조가 그대로 유효 (삭제·재추가와 결정적 차이)
    expect(next.id).toBe("heir-granddaughter");
    expect(next.name).toBe("홍손녀딸");
    // B-2 (2026-06-01): legatee는 §27 미성년 자동 판정을 위해 birthDate 보존
    expect(next.birthDate).toBe("2015-05-05");
  });

  it("CR-6: 동일 관계 — 원본 참조 그대로 반환 (불필요 리렌더 방지)", () => {
    const next = changeHeirRelation(fullChild, "child");
    expect(next).toBe(fullChild);
  });

  it("CR-7: 자녀 → 직계존속 — birthDate 보존(둘 다 생년월일 대상), 동거주택 해제", () => {
    const next = changeHeirRelation(fullChild, "lineal_ascendant");
    expect(next.relation).toBe("lineal_ascendant");
    expect(next.birthDate).toBe("2010-01-01");
    expect(next.isCohabitant).toBeUndefined();
  });

  it("CR-8: 원본 불변(mutation 없음) — 새 객체 반환", () => {
    const snapshot = { ...fullChild };
    changeHeirRelation(fullChild, "corporate");
    expect(fullChild).toEqual(snapshot);
  });
});
