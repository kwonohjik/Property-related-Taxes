/**
 * 양도소득세 수정신고(경정) 공개 타입
 *
 * 당초 신고 후 양도가액·취득가액·필요경비 수정 → 추가 납부세액 산출.
 * 신고불성실(§47의3, §48② 자동감면 대상)·납부지연(§47의4, 감면 미적용) 선택.
 * 설계: docs/02-design/features/transfer-tax-amendment.engine.design.md
 */

import type { PenaltyReason } from "../transfer-tax-penalty";
import type { CalculationStep } from "./transfer.types";

/** 신고불성실가산세 감면 방식 */
export type AmendmentUnderReductionMode =
  | "exempt"     // 정당한 사유 면제 (국세기본법 §48①2호 — 증액보상금 등)
  | "auto_48_2"; // 경과기간별 자동감면 (국세기본법 §48②1호)

export interface AmendmentInput {
  /** 당초 결정세액(=당초 납부 본세) */
  originalDeterminedTax: number;
  /** 신고불성실가산세(§47의3) 적용 여부 */
  applyUnderReportingPenalty: boolean;
  /** 신고불성실 기본율 (normal 10% / fraudulent 40% / offshore_fraud 60%) */
  underReportingReason: PenaltyReason;
  /** 감면 방식 (exempt=면제 / auto_48_2=§48② 자동감면) */
  underReductionMode: AmendmentUnderReductionMode;
  /** 법정신고기한 — auto_48_2·납부지연 기산점 (소득세법 §110① 확정신고기한) */
  statutoryFilingDeadline?: Date;
  /** 수정신고일 — §48② 경과기간 종점 */
  amendedFilingDate?: Date;
  /** 경정 예고 후 수정신고 → §48② 감면 배제(율 0) */
  priorAssessmentNotified?: boolean;
  /** 납부지연가산세(§47의4) 적용 여부 — §48② 감면 대상 아님 */
  applyLatePaymentPenalty: boolean;
  /** 수정신고 납부(예정)일 — 납부지연 경과일 종점 */
  amendedPaymentDate?: Date;
  // ── 경정청구(세액 감소·환급) 확장 — 국세기본법 §45의2 ──
  /** 정정 방향 (미지정=amend, 기존 수정신고 불변) */
  correctionKind?: "amend" | "refund_claim";
  /** 경정청구 사유 유형 (refund_claim 전용): ordinary=일반 5년 / posterior=후발적 3개월 */
  claimReasonType?: "ordinary" | "posterior";
  /** 후발적 사유 안 날 — posterior 3개월 기산점 (§45의2②) */
  posteriorEventDate?: Date;
}

export interface AmendmentDetail {
  originalDeterminedTax: number;
  /** 수정 결정세액 (= 이번 계산 determinedTax) */
  amendedDeterminedTax: number;
  /** 추가 납부 본세 = max(0, 수정 − 당초) */
  additionalTax: number;
  /** 적용 §48② 감면율(0~0.9) — UI 산식 단일진실 */
  underReportingReductionRate: number;
  /** 신고불성실가산세 (감면 반영, OFF면 0) */
  underReportingPenalty: number;
  /** 납부지연가산세 (OFF면 0) */
  latePaymentPenalty: number;
  /** 참고 — 추가 지방소득세(지자체 별도 신고) */
  additionalLocalIncomeTax: number;
  /** 수정신고 총 납부세액 = 추가본세 + 가산세 */
  totalPayable: number;
  // ── 경정청구(refund_claim) 전용 — 미지정/amend=기존 수정신고(비파괴) ──
  /** 정정 방향 */
  correctionKind?: "amend" | "refund_claim";
  /** 환급세액 = max(0, 당초 − 경정) */
  refundTax?: number;
  /** 참고 — 지방소득세 환급(환급세액×10%, 지자체 별도) */
  refundLocalIncomeTax?: number;
  /** 경정청구 사유 유형 */
  claimReasonType?: "ordinary" | "posterior";
  /** 청구기한 ISO "YYYY-MM-DD" (§45의2① 5년 / ② 3개월) — Date 아님(JSON 안전) */
  claimDeadline?: string;
  /** 청구기한 도과 경고 */
  isDeadlineExceeded?: boolean;
  steps: CalculationStep[];
}
