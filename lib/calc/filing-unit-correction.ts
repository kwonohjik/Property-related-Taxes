/**
 * 다건 **신고서 단위** 수정신고·경정청구와 자산 편집 화면.
 *
 * 상태는 다건 폼(`multiForm.amendmentMode`)에 있고 자산 폼에는 없다. 그 상태에서 자산별 가산세 블록은 요청에서 빠지므로
 * (`buildPropertyPayload` G-28 — 수정신고와 무신고·과소신고가산세는 상호배타) 자산 화면의 안내·입력을 실제 계산에 맞춘다.
 * 계획서: docs/02-design/features/multi-amendment-overdue-note.plan.md
 */
import { collectStepIssues, type ValidationIssue } from "@/lib/calc/transfer-tax-validate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

export type FilingUnitCorrection = MultiTransferFormData["correctionKind"] | null;

/** 임베드된 자산 편집에서만 본다 — 단건 화면은 지난 다건 세션의 값을 읽지 않는다. */
export function filingUnitCorrectionOf(
  embeddedInMulti: boolean,
  multiForm: Pick<MultiTransferFormData, "amendmentMode" | "correctionKind">,
): FilingUnitCorrection {
  return embeddedInMulti && multiForm.amendmentMode ? multiForm.correctionKind : null;
}

/** Step6 — 입력칸 대신 내는 안내 */
export function filingUnitCorrectionStepNotice(kind: NonNullable<FilingUnitCorrection>): string {
  return kind === "refund_claim"
    ? "신고서 단위 경정청구 중입니다. 이 화면의 가산세 입력은 경정청구 계산에 쓰이지 않습니다."
    : "신고서 단위 수정신고 중입니다. 가산세는 공통 설정의 수정신고 항목에서 입력합니다.";
}

/** 공통 설정의 가산세 안내 */
export function aggregatePenaltyNotice(form: Pick<MultiTransferFormData, "amendmentMode" | "correctionKind">): string {
  if (!form.amendmentMode) {
    return "가산세(신고불성실·납부지연)는 자산별로 다를 수 있어 각 자산 편집 마법사 마지막 단계에서 입력합니다.";
  }
  return form.correctionKind === "refund_claim"
    ? "경정청구 계산에는 자산별 가산세 입력이 쓰이지 않습니다."
    : "수정신고 중에는 자산별 가산세 입력을 쓰지 않습니다. 가산세는 아래 수정신고 항목에서 입력합니다.";
}

/**
 * 마법사 단계 검증 — 신고서 단위 정정 중에는 숨긴 가산세 단계로 막지 않는다(고칠 칸이 없다).
 * 자산 폼 자체가 수정신고면 `AmendmentBlock`이 보이므로 그대로 검증한다.
 */
export function collectWizardStepIssues(
  step: number,
  form: TransferFormData,
  correction: FilingUnitCorrection,
): ValidationIssue[] {
  if (step === 3 && correction && !form.amendmentMode) return [];
  return collectStepIssues(step, form);
}
