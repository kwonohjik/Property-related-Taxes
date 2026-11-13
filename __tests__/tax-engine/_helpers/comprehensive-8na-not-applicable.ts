import type { RentalExclusion8NaFacts } from "@/lib/tax-engine/types/comprehensive-exclusion-8na.types";

/**
 * 종부령 §3①8호 나목 1)~4)·7호 단서·11호 나목 1)·2)·10·11호 2025 특례(아파트)에 「해당 없음」이 확정된 사실 — 그 판정과 무관한 기존 합산배제 픽스처용.
 * 값이 없으면 엔진은 「모름」=혜택 불성립으로 본다(#8호 나목 PR-1). 나목 판정 자체는
 * `comprehensive-exclusion-8ho-na.anchor.test.ts`가 행마다 이 값을 하나씩 풀어 검증한다.
 */
export const NA8_NOT_APPLICABLE = {
  householdOwnedHouseAtAcquisition: false,
  regulatedAtAssessment: false,
  isApartment: false,
  convertedFromShortTerm: false,
} as const satisfies RentalExclusion8NaFacts;
