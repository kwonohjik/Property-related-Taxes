import type { useRouter } from "next/navigation";
import type { CalculationRecord } from "@/lib/storage/types";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

/**
 * 이력 기록에서 양도세 수정신고/경정청구 마법사로 진입하는 공유 진입점.
 *
 * 드로어(HistoryDetailDrawer)와 카드(HistoryClient) 양쪽에서 재사용 — 진입 로직 단일 소스.
 * 세무사 모드 의뢰인 자동 선택(관문 스킵)·플래그 초기화 규칙이 한 곳에만 존재하도록 격리.
 *
 * 3-way 분기(계획서 §4.4):
 *   - single / §166⑥ bundled → 메인 마법사(/calc/transfer-tax, calc-wizard-store)
 *   - multi 직접입력          → 다건 마법사(/calc/transfer-tax/multi, multi-transfer-tax-store)
 * amend/refund는 양도세 전용이므로 라우트는 상수로 고정(TAX_TYPE_ROUTES는 컴포넌트 로컬 중복 정의라 미참조).
 */
const TRANSFER_ROUTE = "/calc/transfer-tax";
const MULTI_TRANSFER_ROUTE = "/calc/transfer-tax/multi";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * 정정(수정신고·경정청구) 가능한 양도세 record 분류 (계획서 §4.5 · 실측 V1).
 * 부담부증여·general_building은 제외.
 *   - single    : mode==="single"
 *   - bundled   : mode==="bundled" AND assets.length>1(§166⑥ companionAssets) AND 부담부증여 아님
 *                 (general_building은 위 general-building 분기가 **먼저** 잡는다)
 *   - mixed-use : mode==="mixed-use" AND splitMode!=="pre-2022-rejected"
 *   - multi     : mode 래퍼 없음 + AggregateTransferResult(properties[] top-level)
 *
 * ⚠️ 겸용주택에 "single"을 재사용하지 말 것 — classifyLoadableTransfer(transfer-multi-load-entry.ts)가
 *    이 가드를 재사용하며 "single"을 통과시켜 겸용주택이 다건 불러오기에 편입된다. 다건 경로는 겸용
 *    미지원이라 §160①단서 분리계산이 소실된다. 전용 값은 그 fallthrough로 자연 배제된다.
 */
export function classifyAmendableTransfer(
  record: CalculationRecord,
): "single" | "bundled" | "mixed-use" | "general-building" | "multi" | null {
  if (record.taxType !== "transfer") return null;
  const rd = record.resultData as {
    mode?: string;
    transferBurdenedGiftBreakdown?: unknown;
    properties?: unknown;
    result?: { splitMode?: string; total?: { transferTax?: number } };
    aggregated?: { generalBuildingValuationDetail?: unknown };
  } | null;
  if (!rd) return null;
  if (rd.mode === "single") return "single";
  if (rd.mode === "mixed-use") {
    // 2022.1.1 이전 양도분은 엔진이 계산을 거부(전 세액 0) → 정정 진입 자체를 차단
    return rd.result?.splitMode === "pre-2022-rejected" ? null : "mixed-use";
  }
  if (rd.mode === "bundled") {
    /**
     * 일반건물(GB) — 물건이 1개라 아래 `assets.length>1`에서 **자연 배제**되던 경로.
     *
     * 🔴 그 배제는 **법적 판단이 아니라 §166⑥ 가드의 부수 효과**였다. 국세기본법 §45①·§45의2①의
     *    요건은 「과세표준신고서를 법정신고기한까지 제출한 자」 + 기한이며, 본문에도 각 호에도
     *    **자산 종류·평가 방법·양도 유형을 가르는 문언이 없다**(KoreanLaw 실측 MST 288571).
     *    부담부증여도 같은 이유로 배제 근거가 없다 — 당초 결정세액은 `aggregated.determinedTax`
     *    (양도세분 단독, 증여세 미포함)라 축도 이미 올바르다.
     *
     * 판별자는 `aggregated.generalBuildingValuationDetail` — GB **3경로 전부**가 세팅한다
     * (`general-building-fractional.ts:364`·`-route-helper.ts:258`·`-route-actual.ts:679`).
     * `mode==="bundled"` 단독으로는 §166⑥ 일괄과 구분되지 않는다.
     *
     * ⚠️ **전용 값이어야 한다.** `"single"`·`"bundled"`를 재사용하면
     *    `classifyLoadableTransfer`(`transfer-multi-load-entry.ts:20-24`)가 통과시켜 GB가
     *    다건 경로로 새고 §160①단서 분리계산이 소실된다. 그쪽은 allow-list라
     *    **전용 값은 자동 배제**된다.
     */
    if (rd.aggregated?.generalBuildingValuationDetail) return "general-building";
    const assets = (record.inputData as { assets?: unknown[] } | null)?.assets;
    if ((assets?.length ?? 0) > 1 && !rd.transferBurdenedGiftBreakdown) return "bundled";
    return null;
  }
  if (rd.mode === undefined && Array.isArray(rd.properties)) {
    // 재진입 hydration은 전체 폼(B0 이후 저장분)만 가능 — 구 stub record(properties[].form 부재)는 제외.
    const inProps = (record.inputData as { properties?: Array<{ form?: unknown }> } | null)?.properties;
    if (Array.isArray(inProps) && inProps.length > 0 && inProps[0]?.form) return "multi";
    return null;
  }
  return null; // 부담부증여·general_building 등
}

/**
 * 당초 결정세액 소스 — single=result / bundled=aggregated / mixed-use=result.total (계획서 §4.4).
 * 겸용주택은 본세가 `total.transferTax`(지방소득세 제외) — 단건 determinedTax와 동일 축.
 */
export function extractOriginalDeterminedTax(record: CalculationRecord): number | undefined {
  const rd = record.resultData as {
    result?: { determinedTax?: number; total?: { transferTax?: number } };
    aggregated?: { determinedTax?: number };
  };
  return rd.result?.determinedTax ?? rd.result?.total?.transferTax ?? rd.aggregated?.determinedTax;
}

/** 수정신고(경정) 진입 — 당초 결정세액 차감·추가 납부세액 (국세기본법 §45) */
export function enterAmendment(record: CalculationRecord, router: AppRouter): void {
  const kind = classifyAmendableTransfer(record);
  if (kind === "multi") return enterMultiAmendment(record, router);
  // 겸용주택도 동일 store·동일 마법사(/calc/transfer-tax) — 진입 경로 공유
  if (kind !== "single" && kind !== "bundled" && kind !== "mixed-use" && kind !== "general-building")
    return;
  Promise.all([
    import("@/lib/stores/calc-wizard-store"),
    import("@/lib/calc/transfer-amendment-helpers"),
  ]).then(([{ useCalcWizardStore }, { deriveStatutoryDeadline }]) => {
    const { updateFormData, setStep } = useCalcWizardStore.getState();
    const transferDate = (record.inputData as { transferDate?: string }).transferDate;
    updateFormData({
      ...(record.inputData as Parameters<typeof updateFormData>[0]),
      amendmentMode: true,
      correctionKind: "amend",
      amendmentSourceId: record.id,
      originalDeterminedTax: String(extractOriginalDeterminedTax(record) ?? ""),
      statutoryFilingDeadline: deriveStatutoryDeadline(transferDate),
      // 당초 무신고/과소신고 가산세 입력은 수정신고와 상호배타 — 초기화
      enablePenalty: false,
    });
    if (record.clientId) {
      useProfessionalStore.getState().setActiveClientId(record.clientId);
    }
    setStep(0);
    router.push(TRANSFER_ROUTE);
  });
}

/** 경정청구(세액 감소·환급) 진입 — 수정신고와 방향만 다름(correctionKind) (국세기본법 §45의2) */
export function enterRefundClaim(record: CalculationRecord, router: AppRouter): void {
  const kind = classifyAmendableTransfer(record);
  if (kind === "multi") return enterMultiRefundClaim(record, router);
  if (kind !== "single" && kind !== "bundled" && kind !== "mixed-use" && kind !== "general-building")
    return;
  Promise.all([
    import("@/lib/stores/calc-wizard-store"),
    import("@/lib/calc/transfer-amendment-helpers"),
  ]).then(([{ useCalcWizardStore }, { deriveStatutoryDeadline }]) => {
    const { updateFormData, setStep } = useCalcWizardStore.getState();
    const transferDate = (record.inputData as { transferDate?: string }).transferDate;
    updateFormData({
      ...(record.inputData as Parameters<typeof updateFormData>[0]),
      amendmentMode: true,
      correctionKind: "refund_claim",
      // [F6] 경정청구는 가산세 없음 — amend 플래그 초기화
      applyUnderReportingPenalty: false,
      applyLatePaymentPenalty: false,
      amendmentSourceId: record.id,
      originalDeterminedTax: String(extractOriginalDeterminedTax(record) ?? ""),
      statutoryFilingDeadline: deriveStatutoryDeadline(transferDate),
      amendedFilingDate: todayISO(), // [F7] 경정청구일=오늘 → 도과 경고 활성
      enablePenalty: false,
    });
    if (record.clientId) {
      useProfessionalStore.getState().setActiveClientId(record.clientId);
    }
    setStep(0);
    router.push(TRANSFER_ROUTE);
  });
}

// ── multi 직접입력 경로 (별도 store·마법사, 계획서 §4.4 · B7) ──

/** 다건 수정신고 진입 — multi-transfer-tax-store에 전체 폼 hydrate + settings step */
export function enterMultiAmendment(record: CalculationRecord, router: AppRouter): void {
  if (record.taxType !== "transfer") return;
  Promise.all([
    import("@/lib/stores/multi-transfer-tax-store"),
    import("@/lib/calc/transfer-amendment-helpers"),
  ]).then(([{ useMultiTransferStore }, { deriveStatutoryDeadline }]) => {
    const input = record.inputData as unknown as MultiTransferFormData;
    const rd = record.resultData as { determinedTax?: number };
    useMultiTransferStore.getState().setForm({
      ...input,
      activeStep: "settings",
      amendmentMode: true,
      correctionKind: "amend",
      originalDeterminedTax: String(rd.determinedTax ?? ""),
      statutoryFilingDeadline: deriveStatutoryDeadline(`${input.taxYear}-12-31`),
      applyUnderReportingPenalty: false,
      applyLatePaymentPenalty: false,
    });
    if (record.clientId) {
      useProfessionalStore.getState().setActiveClientId(record.clientId);
    }
    router.push(MULTI_TRANSFER_ROUTE);
  });
}

/** 다건 경정청구 진입 — 방향만 다름 */
export function enterMultiRefundClaim(record: CalculationRecord, router: AppRouter): void {
  if (record.taxType !== "transfer") return;
  Promise.all([
    import("@/lib/stores/multi-transfer-tax-store"),
    import("@/lib/calc/transfer-amendment-helpers"),
  ]).then(([{ useMultiTransferStore }, { deriveStatutoryDeadline }]) => {
    const input = record.inputData as unknown as MultiTransferFormData;
    const rd = record.resultData as { determinedTax?: number };
    useMultiTransferStore.getState().setForm({
      ...input,
      activeStep: "settings",
      amendmentMode: true,
      correctionKind: "refund_claim",
      applyUnderReportingPenalty: false,
      applyLatePaymentPenalty: false,
      originalDeterminedTax: String(rd.determinedTax ?? ""),
      statutoryFilingDeadline: deriveStatutoryDeadline(`${input.taxYear}-12-31`),
      amendedFilingDate: todayISO(),
    });
    if (record.clientId) {
      useProfessionalStore.getState().setActiveClientId(record.clientId);
    }
    router.push(MULTI_TRANSFER_ROUTE);
  });
}

/** 오늘 날짜 YYYY-MM-DD (로컬) */
function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}
