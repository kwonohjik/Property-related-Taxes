import type { useRouter } from "next/navigation";
import type { CalculationRecord } from "@/lib/storage/types";
import { useProfessionalStore } from "@/lib/stores/professional-store";

/**
 * 이력 기록에서 양도세 수정신고/경정청구 마법사로 진입하는 공유 진입점.
 *
 * 드로어(HistoryDetailDrawer)와 카드(HistoryClient) 양쪽에서 재사용 — 진입 로직 단일 소스.
 * 세무사 모드 의뢰인 자동 선택(관문 스킵)·플래그 초기화 규칙이 한 곳에만 존재하도록 격리.
 *
 * amend/refund는 양도세 전용이므로 라우트는 상수로 고정(TAX_TYPE_ROUTES는 컴포넌트 로컬 중복 정의라 미참조).
 */
const TRANSFER_ROUTE = "/calc/transfer-tax";

type AppRouter = ReturnType<typeof useRouter>;

/** 수정신고(경정) 진입 — 당초 결정세액 차감·추가 납부세액 (국세기본법 §45) */
export function enterAmendment(record: CalculationRecord, router: AppRouter): void {
  if (record.taxType !== "transfer") return;
  Promise.all([
    import("@/lib/stores/calc-wizard-store"),
    import("@/lib/calc/transfer-amendment-helpers"),
  ]).then(([{ useCalcWizardStore }, { deriveStatutoryDeadline }]) => {
    const { updateFormData, setStep } = useCalcWizardStore.getState();
    const result = (record.resultData as { result?: { determinedTax?: number } }).result;
    const transferDate = (record.inputData as { transferDate?: string }).transferDate;
    updateFormData({
      ...(record.inputData as Parameters<typeof updateFormData>[0]),
      amendmentMode: true,
      correctionKind: "amend",
      amendmentSourceId: record.id,
      originalDeterminedTax: String(result?.determinedTax ?? ""),
      statutoryFilingDeadline: deriveStatutoryDeadline(transferDate),
      // 당초 무신고/과소신고 가산세 입력은 수정신고와 상호배타 — 초기화
      enablePenalty: false,
    });
    // 당초 신고서의 의뢰인을 자동 선택 — 세무사 모드에서 의뢰인 재선택 관문 스킵
    if (record.clientId) {
      useProfessionalStore.getState().setActiveClientId(record.clientId);
    }
    setStep(0);
    router.push(TRANSFER_ROUTE);
  });
}

/** 경정청구(세액 감소·환급) 진입 — 수정신고와 방향만 다름(correctionKind) (국세기본법 §45의2) */
export function enterRefundClaim(record: CalculationRecord, router: AppRouter): void {
  if (record.taxType !== "transfer") return;
  Promise.all([
    import("@/lib/stores/calc-wizard-store"),
    import("@/lib/calc/transfer-amendment-helpers"),
  ]).then(([{ useCalcWizardStore }, { deriveStatutoryDeadline }]) => {
    const { updateFormData, setStep } = useCalcWizardStore.getState();
    const result = (record.resultData as { result?: { determinedTax?: number } }).result;
    const transferDate = (record.inputData as { transferDate?: string }).transferDate;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    updateFormData({
      ...(record.inputData as Parameters<typeof updateFormData>[0]),
      amendmentMode: true,
      correctionKind: "refund_claim",
      // [F6] 경정청구는 가산세 없음 — amend 플래그 초기화
      applyUnderReportingPenalty: false,
      applyLatePaymentPenalty: false,
      amendmentSourceId: record.id,
      originalDeterminedTax: String(result?.determinedTax ?? ""),
      statutoryFilingDeadline: deriveStatutoryDeadline(transferDate),
      amendedFilingDate: today, // [F7] 경정청구일=오늘 → 도과 경고 활성
      enablePenalty: false,
    });
    // 당초 신고서의 의뢰인을 자동 선택 — 세무사 모드에서 의뢰인 재선택 관문 스킵
    if (record.clientId) {
      useProfessionalStore.getState().setActiveClientId(record.clientId);
    }
    setStep(0);
    router.push(TRANSFER_ROUTE);
  });
}
