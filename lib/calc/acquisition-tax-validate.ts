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

  // ── step 2 (주택 현황 — 보유주택 목록) ──
  if (step === 2 && form.propertyType === "housing") {
    const msg = validateOwnedHouses(form);
    if (msg) return msg;
  }

  return null;
}

/**
 * 보유주택 목록 — 엔진이 날짜 없이 조용히 계산하는 조합을 막는다(④·⑫와 같은 조건).
 *
 * - 입주권·분양권·오피스텔 행: 취득일 필수 — 법률 제17473호 부칙 제3조(2020.8.12. 전 취득분 제외)
 * - 분양권·입주권으로 취득(소급): 권리취득일 필수, 모든 행 취득일 필수 — §28의4① 후단 기준일 비교
 * - 상속 토글 ON: 상속개시일 필수 — ④는 날짜가 없으면 상속 정보를 통째로 보내지 않는다
 */
function validateOwnedHouses(form: FormState): string | null {
  if (form.acquiredViaRight && !form.rightAcquisitionDate) {
    return "분양권·입주권으로 취득 — 권리취득일(분양계약일)을 입력하세요.";
  }
  const rows = form.ownedHouses ?? [];
  for (let i = 0; i < rows.length; i++) {
    const h = rows[i];
    const isRightOrOffice =
      h.propertyType === "officetel" || h.propertyType === "right" || h.propertyType === "subscription_right";
    if (!h.acquisitionDate && isRightOrOffice) {
      return `보유 주택 #${i + 1} — 입주권·분양권·오피스텔은 취득일을 입력하세요 (2020.8.12. 전 취득분은 주택 수에서 제외).`;
    }
    if (!h.acquisitionDate && form.acquiredViaRight) {
      return `보유 주택 #${i + 1} — 권리취득일 기준 소급 산정에는 취득일이 필요합니다.`;
    }
    if (h.isInherited && !h.inheritanceDate) {
      return `보유 주택 #${i + 1} — 상속개시일을 입력하세요.`;
    }
  }
  return null;
}
