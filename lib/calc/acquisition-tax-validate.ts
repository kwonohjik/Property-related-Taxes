/**
 * 취득세 마법사 cross-field 유효성 검사 (⑧ 동기화 지점)
 *
 * components/calc/acquisition/shared.ts 의 validateStep(단계별 필수값 검증)이
 * 마지막에 이 함수를 호출한다. 이 파일은 "필드 간 조합" 조건만 담당:
 * 엔진이 침묵 기본값으로 흡수할 수 있는 미입력 조합을 명시 차단한다
 * (자동 안분·침묵 fallback 금지 정책).
 *
 * 주의: FormState는 type-only import — shared.ts → 본 파일 → shared.ts
 * 순환을 만들지 않는다 (타입 import는 컴파일 시 제거됨).
 */

import type { FormState } from "@/components/calc/acquisition/shared";

/**
 * 단계 공통 cross-field 검증.
 * @returns 오류 메시지 (null이면 통과)
 */
export function validateAcquisitionCrossFields(
  step: number,
  form: FormState,
): string | null {
  // ── step 3 (중과 분기) ──
  if (step === 3 && form.propertyType === "housing" && form.isTemporaryTwoHouse) {
    // 일시적 2주택 처분기한(시행령 §28의5)은 종전·신규 주택 지역 조합으로
    // 결정된다. 미선택 시 엔진이 비조정으로 침묵 기본 처리하므로 명시 차단.
    if (!form.previousHouseRegion) {
      return "일시적 2주택 — 종전 주택 소재 지역(조정/비조정)을 선택하세요.";
    }
    if (!form.newHouseRegion) {
      return "일시적 2주택 — 신규 주택 소재 지역(조정/비조정)을 선택하세요.";
    }
  }

  return null;
}
