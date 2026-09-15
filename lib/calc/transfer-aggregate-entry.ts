/**
 * 이력에서 **단건 신고서를 골라 다건 합산**으로 재계산하는 진입점.
 *
 * 계획서: `docs/00-pm/transfer-history-multi-aggregate-entry.plan.md`
 *
 * 이력 목록 카드(`app/history/HistoryClient.tsx`)와 상세 드로어(`HistoryDetailDrawer.tsx`)
 * 양쪽에서 쓴다 — 진입 로직 단일 소스(`transfer-amendment-entry.ts`와 같은 층위).
 *
 * 🔒 **엔진은 건드리지 않는다.** 이미 완성된 다건 집계 엔진(`transfer-tax-aggregate.ts`)에
 *    이력을 실어 주는 경로일 뿐이라, API payload 빌더·Zod·Route는 한 줄도 바뀌지 않는다.
 *    그래서 세액의 정확성은 **편입의 정확성**으로 환원된다 — 누구를, 어떤 순서로, 어떤
 *    플래그 상태로 싣는가.
 */
import type { useRouter } from "next/navigation";
import type { CalculationRecord } from "@/lib/storage/types";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import {
  useMultiTransferStore,
  defaultMultiTransferFormData,
} from "@/lib/stores/multi-transfer-tax-store";
import { classifyLoadableTransfer, buildPropertyFromSingleRecord } from "./transfer-multi-load-entry";
import { extractTaxYear } from "./cross-104-5-history";

const MULTI_TRANSFER_ROUTE = "/calc/transfer-tax/multi";

type AppRouter = ReturnType<typeof useRouter>;

/** 모달 목록 1행 */
export interface AggregateCandidate {
  record: CalculationRecord;
  /** 과세연도 — 기준과 다르면 `disabledReason`이 붙는다 */
  taxYear: number | null;
  /** 선택 불가 사유. null이면 선택 가능 */
  disabledReason: string | null;
  /** 버튼을 누른 기준 record인가 (항상 선택된 채 고정) */
  isBase: boolean;
}

/**
 * 합산 진입이 가능한 이력인가.
 *
 * 🔒 **다건 이력은 제외한다** — 이미 합산 결과이고, 그것을 다시 합산 대상으로 넣으면
 *    소득세법 §107②의 러닝 합산분이 이중 계상될 수 있다. 다건 이력의 재사용은 다건 화면의
 *    「이력에서 불러오기」(세션 전체 replace)가 담당한다.
 *
 * 겸용주택·부담부증여·일반건물은 `classifyLoadableTransfer`가 이미 떨군다 — allow-list라
 * 전용 분류값이 **자동 배제**된다(`transfer-amendment-entry.ts`의 경고 참조).
 */
export function canAggregateFromHistory(record: CalculationRecord): boolean {
  if (classifyLoadableTransfer(record) !== "single") return false;
  // 과세연도를 못 뽑으면 「같은 과세연도」 요건 자체를 판정할 수 없다 → 진입시키지 않는다.
  return extractTaxYear(record) !== null;
}

/** 이력 record의 양도일(정렬 키). 없으면 빈 문자열 — 정렬에서 맨 앞으로 간다. */
function transferDateOf(record: CalculationRecord): string {
  return (record.inputData as { transferDate?: string } | null)?.transferDate ?? "";
}

/** 의뢰인(양도인) 동일성 — 개인 모드는 양쪽 null이라 자동으로 같은 그룹이 된다 */
function sameTransferor(a: CalculationRecord, b: CalculationRecord): boolean {
  return (a.clientId ?? null) === (b.clientId ?? null);
}

/**
 * 합산 후보 선별 — **순수 함수**(계산·네트워크 없음).
 *
 * 규칙: 같은 양도인(`clientId`) · 단건 이력만 목록에 오르고, 과세연도가 기준과 다르면
 * **사유를 붙여 비활성**한다(지우지 않는다 — 왜 못 고르는지 보여야 한다).
 *
 * 순서는 **이력 목록 순서 그대로**(최신순)이되 기준 record만 맨 앞으로 올린다.
 * ⚠️ 편입 순번(「양도 N번」)은 이 순서가 아니라 **양도일 오름차순**이다 — `enterMultiAggregate`.
 */
export function selectAggregateCandidates(
  records: CalculationRecord[],
  base: CalculationRecord,
): AggregateCandidate[] {
  const baseYear = extractTaxYear(base);
  const pool = records.filter((r) => canAggregateFromHistory(r) && sameTransferor(r, base));
  const ordered = [
    ...pool.filter((r) => r.id === base.id),
    ...pool.filter((r) => r.id !== base.id),
  ];
  return ordered.map((record) => {
    const taxYear = extractTaxYear(record);
    const mismatch = taxYear !== null && baseYear !== null && taxYear !== baseYear;
    return {
      record,
      taxYear,
      disabledReason: mismatch ? `${taxYear}년 (과세연도 불일치)` : null,
      isBase: record.id === base.id,
    };
  });
}

/**
 * 선택한 단건 이력들을 **다건 세션으로 편입**하고 다건 마법사로 이동한다.
 *
 * 🔴 **기본값 상수에서 시작한다**(`defaultMultiTransferFormData`). 직전 세션의
 *    `amendmentMode`·`priorPaidTaxEdited`·`annualBasicDeductionUsed`가 묻어가면
 *    **조용히 다른 세액**이 된다 — 새 확정신고에 수정신고 플래그가 얹히는 것이다.
 *    값을 복제하지 말 것(상수 한 곳이 단일 소스).
 *
 * 기납부세액은 **여기서 합산하지 않는다** — 자산별 예정세액(`priorPaidNational/Local`)만
 * 실어 두면 `computeAutoPriorPaid`가 신고일 필터(§111③)로 파생한다.
 */
export function enterMultiAggregate(records: CalculationRecord[], router: AppRouter): void {
  const list = records.filter(canAggregateFromHistory);
  if (list.length === 0) return;

  // 편입 순번은 **양도일 오름차순** — 예정신고 순서이자 §111③ 신고일 필터의 직관이다.
  const sorted = [...list].sort((a, b) => transferDateOf(a).localeCompare(transferDateOf(b)));
  const properties = sorted.map((r, i) => buildPropertyFromSingleRecord(r, `양도 ${i + 1}번`));

  useMultiTransferStore.getState().setForm({
    ...defaultMultiTransferFormData,
    taxYear: extractTaxYear(sorted[0]) ?? new Date().getFullYear(),
    properties,
    activeStep: "list",
    activePropertyIndex: 0,
  });

  // 결과 자동저장의 clientId가 원본과 같아야 이력에서 같은 양도인으로 묶인다.
  useProfessionalStore.getState().setActiveClientId(sorted[0].clientId ?? null);

  router.push(MULTI_TRANSFER_ROUTE);
}
