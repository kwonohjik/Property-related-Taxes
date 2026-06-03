/**
 * 영리법인 사전증여 필수요건 단일진실 헬퍼 (§13①2호 · §4의2③ · §3의2②)
 *
 * 동기화 지점 ⑧: client validatePriorGift + ⑨ Zod superRefine 양쪽이 동일 규칙을
 * 공유하여 API-직접/비로그인 경로에서도 client와 동일하게 차단한다.
 *
 * 법령 근거 (KoreanLaw MCP 검증 2026-06-04):
 *   §13①2호  — 상속개시일 전 5년 이내 피상속인이 **상속인 아닌 자**에게 증여한 재산가액 가산
 *              → 영리법인은 상속인 아닌 자(corporate)여야 함 (isHeir=false 강제)
 *   §4의2③   — 증여재산에 대해 법인세가 부과(비과세·감면 포함)되면 증여세 미부과
 *              → 영리법인 giftTaxPaid=0 (§4의2③ 비과세이므로 납부세액 없음)
 *   §3의2②   — 영리법인 수유자 주주 중 상속인 등이 있으면 지분상당액 납세의무
 *              → 엔진 §3의2② 면제 계산에 corporateGiftComputedTax(증여세 산출세액)가 필수
 *
 * 반환값:
 *   null      — 규칙 통과 (또는 corporate이 아닌 경우)
 *   string    — 위반 메시지 (client는 UI 표시, Zod superRefine은 ctx.addIssue 메시지로 사용)
 */

/** 공유 헬퍼가 필요로 하는 PriorGift 최소 형태 (타입 결합 없이 인라인으로 정의) */
export interface CorporateRuleInput {
  giftDate: string;
  isHeir?: boolean;
  giftTaxPaid: number;
  beneficiaryType?: "heir" | "legatee" | "corporate";
  corporateGiftComputedTax?: number;
  doneeId?: string;
}

/**
 * 영리법인 사전증여 필수요건 검사.
 *
 * @param gift - 검사할 사전증여 항목 (PriorGift 호환 최소 형태)
 * @returns null(통과) 또는 위반 메시지 문자열
 */
export function checkCorporateGiftRule(gift: CorporateRuleInput): string | null {
  // corporate 가 아닌 경우는 이 헬퍼의 검사 범위 밖
  if (gift.beneficiaryType !== "corporate") return null;

  // 규칙 1: §13①2호 — 상속인 아닌 자여야 함
  if (gift.isHeir === true) {
    return (
      `영리법인 사전증여 ${gift.giftDate} — beneficiaryType="corporate"는 isHeir=false여야 합니다 (§13①2호: 상속인 아닌 자 5년).`
    );
  }

  // 규칙 2: §3의2② 면제 한도 계산용 — corporateGiftComputedTax > 0 필수
  if (!gift.corporateGiftComputedTax || gift.corporateGiftComputedTax <= 0) {
    return (
      `영리법인 사전증여 ${gift.giftDate} — corporateGiftComputedTax(증여세 산출세액)는 필수입니다.`
    );
  }

  // 규칙 3: §4의2③ — 법인세 부과로 증여세 미부과, 납부세액은 0이어야 함
  if (gift.giftTaxPaid > 0) {
    return (
      `영리법인 사전증여 ${gift.giftDate} — giftTaxPaid는 0이어야 합니다 (§4의2③ 비과세, §3의2②로 별도 공제).`
    );
  }

  // 규칙 4: doneeId 필수 (§3의2② 영리법인별 면제 배부에 사용)
  if (!gift.doneeId) {
    return `영리법인 사전증여 ${gift.giftDate} — doneeId(수증자 Heir.id) 필수.`;
  }

  return null;
}
