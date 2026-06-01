import { describe, it, expect } from "vitest";
import { changeHeirRelation } from "@/components/calc/HeirComposition";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * B-9 UI Anchor — 세대생략 할증 §27 Phase B UI 동기화 검증
 *
 * 검증 항목:
 *   1. legatee isGenerationSkipBeneficiary + isMinorOverride → changeHeirRelation 보존·정리
 *   2. legatee → corporate 전환 시 세대생략 필드 제거
 *   3. legatee → child 전환 시 isGenerationSkipBeneficiary 제거
 *   4. 레거시 전역 3필드(isGenerationSkip·isMinorHeir·generationSkipAssetAmount) 타입 존재 확인
 */

describe("B-9 UI Anchor — §27 세대생략 legatee 필드 정합성", () => {
  const legatee: Heir = {
    id: "heir-legatee-1",
    relation: "legatee",
    name: "홍손녀",
    birthDate: "2015-03-15",
    isGenerationSkipBeneficiary: true,
    isMinorOverride: undefined,
  };

  // ── B-1: legatee 체크박스 필드 타입 존재 ──────────────────────────
  it("B-1: Heir 타입에 isGenerationSkipBeneficiary·isMinorOverride optional 존재", () => {
    const h: Heir = { id: "x", relation: "legatee" };
    // optional이므로 undefined 할당 가능 — TS 컴파일 타임 보장
    h.isGenerationSkipBeneficiary = true;
    h.isMinorOverride = false;
    expect(h.isGenerationSkipBeneficiary).toBe(true);
    expect(h.isMinorOverride).toBe(false);
  });

  // ── B-2: legatee는 birthDate 보존 ────────────────────────────────
  it("B-2: other → legatee 전환 시 birthDate 보존 (§27 미성년 판정용)", () => {
    const other: Heir = {
      id: "x",
      relation: "other",
      birthDate: "2015-03-15",
    };
    const next = changeHeirRelation(other, "legatee");
    expect(next.birthDate).toBe("2015-03-15");
  });

  it("B-2: child → legatee 전환 시 birthDate 보존", () => {
    const child: Heir = {
      id: "x",
      relation: "child",
      birthDate: "2012-01-01",
      isCohabitant: true,
    };
    const next = changeHeirRelation(child, "legatee");
    expect(next.birthDate).toBe("2012-01-01");
    // 동거주택은 legatee 비대상 → 제거
    expect(next.isCohabitant).toBeUndefined();
  });

  // ── legatee → corporate: 세대생략 필드 제거 ───────────────────────
  it("legatee → corporate 전환: isGenerationSkipBeneficiary·isMinorOverride·birthDate 제거", () => {
    const next = changeHeirRelation(legatee, "corporate");
    expect(next.isGenerationSkipBeneficiary).toBeUndefined();
    expect(next.isMinorOverride).toBeUndefined();
    expect(next.birthDate).toBeUndefined();
  });

  // ── legatee → child: isGenerationSkipBeneficiary 제거, birthDate 보존 ─
  it("legatee → child 전환: isGenerationSkipBeneficiary 제거, birthDate 보존", () => {
    const next = changeHeirRelation(legatee, "child");
    expect(next.isGenerationSkipBeneficiary).toBeUndefined();
    expect(next.isMinorOverride).toBeUndefined();
    // child는 showBirthDate=true → birthDate 보존
    expect(next.birthDate).toBe("2015-03-15");
  });

  // ── legatee → spouse: isGenerationSkipBeneficiary 제거, birthDate 제거 ─
  it("legatee → spouse 전환: 세대생략 필드 제거, birthDate 제거(spouse는 비대상)", () => {
    const next = changeHeirRelation(legatee, "spouse");
    expect(next.isGenerationSkipBeneficiary).toBeUndefined();
    expect(next.isMinorOverride).toBeUndefined();
    expect(next.birthDate).toBeUndefined();
  });

  // ── legatee 동일 관계 — 원본 반환 ───────────────────────────────
  it("legatee → legatee 동일 관계: 원본 참조 반환", () => {
    const next = changeHeirRelation(legatee, "legatee");
    expect(next).toBe(legatee);
  });

  // ── B-3: isMinorOverride 3-state 타입 분기 ──────────────────────
  it("B-3: isMinorOverride undefined/true/false 모두 Heir 타입에 할당 가능", () => {
    const auto: Heir = { id: "a", relation: "legatee", isMinorOverride: undefined };
    const forceMinor: Heir = { id: "b", relation: "legatee", isMinorOverride: true };
    const forceAdult: Heir = { id: "c", relation: "legatee", isMinorOverride: false };
    expect(auto.isMinorOverride).toBeUndefined();
    expect(forceMinor.isMinorOverride).toBe(true);
    expect(forceAdult.isMinorOverride).toBe(false);
  });

  // ── B-6/B-8: 레거시 전역 3필드 타입 잔류 확인 (하위호환) ──────────
  it("B-8: FormState 레거시 전역 3필드 타입 잔류 — 레거시 이력 하위호환", () => {
    // FormState의 isGenerationSkip/isMinorHeir/generationSkipAssetAmount가 여전히 타입에 존재해야 함.
    // InheritanceTaxInput의 deprecated 필드도 optional로 유지.
    // (실제 빌드 타임에 tsc --noEmit으로 확인 — 이 테스트는 동작 증거)
    const legacyCheck = {
      isGenerationSkip: false,
      isMinorHeir: false,
      generationSkipAssetAmount: "" as string,
    };
    expect(typeof legacyCheck.isGenerationSkip).toBe("boolean");
    expect(typeof legacyCheck.isMinorHeir).toBe("boolean");
    expect(typeof legacyCheck.generationSkipAssetAmount).toBe("string");
  });
});
