/**
 * 조특법 특례 2-스트림 — validateStep ⑧ ↔ Zod superRefine ⑩ 동기화 회귀 가드
 *
 * Medium 버그(Check 발견): UI validateStep이 "특례 자산 1개라도 태깅됨"만 통과시켜,
 * 일부 태깅 후 신규 자산(undefined) 추가 시 UI 통과 ↔ Zod(미귀속 차단) 400 모순.
 * → validateStep을 Zod와 동일하게 "미귀속(undefined) 1개라도 있으면 차단"으로 정렬.
 *
 * 정책: 자동 fallback 금지 — undefined를 일반으로 자동 처리하지 않고 명시 강제.
 */
import { describe, it, expect } from "vitest";
import { validateStep, INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const STEP3 = 3;

function item(id: string, tag: boolean | undefined): EstateItem {
  return {
    id,
    category: "cash",
    name: id,
    marketValue: 1_000_000_000,
    ...(tag === undefined ? {} : { isSpecialTreatmentAsset: tag }),
  };
}

function form(giftItems: EstateItem[], specialTreatment: "" | "startup" | "family_business") {
  return { ...INITIAL_FORM, giftItems, stockItems: [], specialTreatment };
}

describe("특례 2-스트림 validateStep ⑧ — Zod 동기화", () => {
  it("특례 미선택 → 귀속 검증 없음 (통과)", () => {
    expect(validateStep(STEP3, form([item("a", undefined), item("b", undefined)], ""))).toBeNull();
  });

  it("자산 1개 + 특례 선택 → 자동 귀속, 차단 없음", () => {
    expect(validateStep(STEP3, form([item("a", undefined)], "startup"))).toBeNull();
  });

  it("N≥2 전부 명시(true/false 혼합) → 통과", () => {
    expect(
      validateStep(STEP3, form([item("a", true), item("b", false)], "startup")),
    ).toBeNull();
  });

  it("N≥2 일부 태깅 + 신규 자산 미귀속(undefined) → 차단 (모순 버그 회귀)", () => {
    // 종전 버그: hasTagged(a=true) → UI 통과했으나 Zod는 b(undefined) 차단 → 400
    const msg = validateStep(STEP3, form([item("a", true), item("b", undefined)], "startup"));
    expect(msg).not.toBeNull();
    expect(msg).toContain("미선택 1개");
  });

  it("N≥2 전부 미귀속 → 차단", () => {
    const msg = validateStep(STEP3, form([item("a", undefined), item("b", undefined)], "family_business"));
    expect(msg).not.toBeNull();
    expect(msg).toContain("가업승계");
  });
});
