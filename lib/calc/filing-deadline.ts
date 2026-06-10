/**
 * 양도소득세 신고·납부기한 계산 헬퍼
 *
 * 소득세법 §105 (양도소득과세표준 예정신고):
 *   주택·토지·건물·분양권·입주권의 양도소득은
 *   양도일이 속하는 달의 말일부터 2개월 이내 신고·납부.
 *
 * 예) 양도일 2025-01-10 → 신고기한 2025-03-31
 *     양도일 2025-12-20 → 신고기한 2026-02-28
 */

/**
 * 신고기한(=납부기한) 계산.
 * @param transferDate "YYYY-MM-DD" 형식
 * @returns "YYYY-MM-DD" 형식의 신고기한, 입력이 비어있거나 잘못되면 ""
 */
export function getFilingDeadline(transferDate: string): string {
  if (!transferDate) return "";
  const parts = transferDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "";
  const [y, m] = parts;
  // new Date(y, m + 2, 0) → "(m+1)월의 말일" (JS month는 0-indexed; day=0이면 전월의 마지막날)
  // 양도월(1-indexed m)의 말일 + 2개월 = 양도월+2의 말일
  const deadline = new Date(y, m + 2, 0);
  const yy = deadline.getFullYear();
  const mm = String(deadline.getMonth() + 1).padStart(2, "0");
  const dd = String(deadline.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * 신고일이 신고기한을 지났는지 판단.
 * 신고일이 비어있으면 false.
 */
export function isFilingOverdue(transferDate: string, filingDate: string): boolean {
  if (!transferDate || !filingDate) return false;
  const deadline = getFilingDeadline(transferDate);
  if (!deadline) return false;
  return filingDate > deadline;
}

/** derivePenaltyFields가 읽는 현재 가산세 상태 (cross-field 파생용) */
export interface PenaltyDerivationState {
  enablePenalty: boolean;
  filingType: "none" | "under" | "excess_refund" | "correct";
  penaltyReason: "normal" | "fraudulent" | "offshore_fraud";
  paymentDeadline: string;
  actualPaymentDate: string;
}

/** derivePenaltyFields가 반환하는 가산세 패치 (변경 없으면 빈 객체) */
export type PenaltyPatch = Partial<PenaltyDerivationState>;

/**
 * 양도일·신고일로부터 가산세 필드를 파생한다 (cross-field 동기화).
 *
 * memory `feedback_useeffect_store_mirror_forbidden` — useEffect→store 미러링 대신
 * onChange 핸들러(라이브 편집)·마이그레이션(로드 시점)에서 직접 호출하는 순수 함수.
 *
 * - 신고기한 초과 + 가산세 OFF: 무신고(filingType="none") + 지연납부 자동 ON
 *   (paymentDeadline=신고기한, actualPaymentDate=신고일)
 * - 신고기한 초과 + 이미 ON: 사용자가 Step6에서 수동 선택한 신고유형(과소·초과환급 등)은
 *   보존하고 paymentDeadline·actualPaymentDate만 새 날짜로 갱신
 * - 기한 이내 또는 양도일·신고일 미입력: 가산세 자동 OFF (penaltyReason도 normal로 리셋 —
 *   stale 부정행위 사유가 재-ON 시 잔류하는 것 방지)
 * - 이미 동일 상태면 빈 패치 반환 (불필요한 store 갱신 방지)
 */
export function derivePenaltyFields(
  transferDate: string,
  filingDate: string,
  current: PenaltyDerivationState,
): PenaltyPatch {
  const offPatch: PenaltyPatch = {
    enablePenalty: false,
    filingType: "correct",
    penaltyReason: "normal",
    paymentDeadline: "",
    actualPaymentDate: "",
  };
  const needsOff = current.enablePenalty || current.penaltyReason !== "normal";

  if (!transferDate || !filingDate) {
    return needsOff ? offPatch : {};
  }

  if (isFilingOverdue(transferDate, filingDate)) {
    const deadline = getFilingDeadline(transferDate);
    if (!current.enablePenalty) {
      // OFF → ON 자동 전이: 무신고 기본값으로 초기화
      return {
        enablePenalty: true,
        filingType: "none",
        penaltyReason: current.penaltyReason || "normal",
        paymentDeadline: deadline,
        actualPaymentDate: filingDate,
      };
    }
    // 이미 ON: 수동 선택(filingType·penaltyReason) 보존, 날짜 파생값만 동기화
    if (
      current.paymentDeadline !== deadline ||
      current.actualPaymentDate !== filingDate
    ) {
      return { paymentDeadline: deadline, actualPaymentDate: filingDate };
    }
    return {};
  }

  return needsOff ? offPatch : {};
}
