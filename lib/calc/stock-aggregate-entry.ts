/**
 * 이력에서 **주식 신고서를 골라 합산**으로 재계산하는 진입점.
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.4 (PR-3)
 * 부동산 정본: `transfer-aggregate-entry.ts` — 같은 층위·같은 규약이다.
 *
 * 🔒 **엔진은 건드리지 않는다.** 합산 엔진(§102② 양도차손 통산 · §103① 그룹별 기본공제
 *    연 1회 · §104⑤ 비교과세)은 이미 완성돼 있다. 이 파일은 이력을 store 에 실어 주는
 *    경로일 뿐이라 API payload·Zod·Route 는 한 줄도 바뀌지 않는다.
 *    그래서 세액의 정확성이 **편입의 정확성**으로 환원된다 — 누구를, 어떤 순서로 싣는가.
 */
import type { useRouter } from "next/navigation";
import type { CalculationRecord } from "@/lib/storage/types";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import {
  useStockTransferStore,
  normalizeStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import { extractStockTransferDate } from "@/lib/storage/title-generator";
import { calcPreliminaryDeadline } from "./stock-filing-type";
import { computeStockAutoPriorPaid } from "./stock-prior-filed";
import { extractTaxYear } from "./cross-104-5-history";
import type { AggregateCandidate } from "./aggregate-candidate";

export type { AggregateCandidate };

const STOCK_ROUTE = "/calc/stock-transfer-tax";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * 합산 진입이 가능한 이력인가.
 *
 * 🔒 **다종목 이력은 제외한다** — 이미 합산 결과다. 다시 합산 대상으로 넣으면 같은 종목이
 *    두 번 계상되어 §103① 기본공제·§102② 통산이 모두 어긋난다. 다종목 이력의 재사용은
 *    「편집」(`buildStockResumeState`)이 담당한다. 부동산 다건을 합산 후보에서 빼는 것과
 *    같은 규약이다.
 */
export function canStockAggregateFromHistory(record: CalculationRecord): boolean {
  if (record.taxType !== "stock_transfer") return false;
  if ((record.inputData as Record<string, unknown> | null)?.__multiStock === true) return false;
  // 과세연도를 못 뽑으면 「같은 과세연도」 요건 자체를 판정할 수 없다 → 진입시키지 않는다.
  return extractTaxYear(record) !== null;
}

/** 이력 record 의 양도일(정렬 키). 없으면 빈 문자열 — 정렬에서 맨 앞으로 간다. */
function transferDateOf(record: CalculationRecord): string {
  return extractStockTransferDate((record.inputData ?? {}) as Record<string, unknown>) ?? "";
}

/** 의뢰인(양도인) 동일성 — 개인 모드는 양쪽 null 이라 자동으로 같은 그룹이 된다 */
function sameTransferor(a: CalculationRecord, b: CalculationRecord): boolean {
  return (a.clientId ?? null) === (b.clientId ?? null);
}

/**
 * 합산 후보 선별 — **순수 함수**(계산·네트워크 없음).
 *
 * 같은 양도인·단건 이력만 목록에 오르고, 과세연도가 기준과 다르면 **사유를 붙여 비활성**한다
 * (지우지 않는다 — 왜 못 고르는지 보여야 한다).
 *
 * 순서는 **이력 목록 순서 그대로**이되 기준 record 만 맨 앞으로 올린다.
 * ⚠️ 편입 순번은 이 순서가 아니라 **양도일 오름차순**이다 — `buildStockAggregateSession`.
 */
export function selectStockAggregateCandidates(
  records: CalculationRecord[],
  base: CalculationRecord,
): AggregateCandidate[] {
  const baseYear = extractTaxYear(base);
  const pool = records.filter((r) => canStockAggregateFromHistory(r) && sameTransferor(r, base));
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

export interface StockAggregateSession {
  savedItems: StockTransferFormData[];
  formData: StockTransferFormData;
}

/** 이력 record 의 신고일 — 없으면 §105① **법정 예정신고 기한**으로 대체한다. */
function filingDateOf(record: CalculationRecord): string {
  const input = (record.inputData ?? {}) as Record<string, unknown>;
  const declared = (input.filingDate as string | undefined)?.trim();
  if (declared) return declared;
  // 비워 두면 그 종목이 신고일 필터에서 통째로 빠져 기납부가 **과소 집계**된다.
  return (
    calcPreliminaryDeadline(
      (input.transferDate as string | undefined) ?? undefined,
      input.marketType as string | undefined,
    ) ?? ""
  );
}

/** 이력 record 의 결정세액·지방소득세 — 주식은 결과가 최상위에 저장된다. */
function paidTaxOf(record: CalculationRecord): { national: number; local: number } {
  const rd = (record.resultData ?? {}) as { finalTax?: number; localIncomeTax?: number };
  return { national: rd.finalTax ?? 0, local: rd.localIncomeTax ?? 0 };
}

/**
 * 선택한 단건 이력들을 **다종목 세션**으로 편입한다 — 순수 함수(테스트가 닿는 자리).
 *
 * 🔴 **편입 순번은 양도일 오름차순**이다. §103②가 「해당 과세기간에 **먼저 양도한 자산의
 *    양도소득금액에서부터 순서대로** 공제한다」이므로 이 순서가 곧 법정 배분 순서다.
 *    순서를 뒤집으면 어느 종목이 기본공제 250만원을 가져가는지가 달라져 **세액이 바뀐다**.
 *
 * 🔴 **`normalizeStockFormData`를 거친다** — 이력에 없던 신규 필드를 기본값으로 채우기
 *    위해서다. 그냥 실으면 `filingViolation` 같은 가산세 게이트가 `undefined`로 들어가
 *    엔진 분기가 흔들린다.
 *
 * 규약: 마지막(양도일이 가장 늦은) 종목이 **편집기**다 — 마법사의
 * `[...savedItems, formData]` 규약을 그대로 만족시킨다.
 */
export function buildStockAggregateSession(
  records: CalculationRecord[],
): StockAggregateSession {
  const list = records.filter(canStockAggregateFromHistory);
  const sorted = [...list].sort((a, b) => transferDateOf(a).localeCompare(transferDateOf(b)));
  const forms = sorted.map((r) => normalizeStockFormData(r.inputData ?? {}));
  if (forms.length === 0) {
    return { savedItems: [], formData: normalizeStockFormData({}) };
  }

  /**
   * §111③ 기납부세액 자동 채움 — **마지막 예정신고서를 제외한** 나머지 산출세액 합계.
   * 묶는 단위는 종목이 아니라 **신고일**이다(§105①2호 반기 → 같은 반기는 한 신고서).
   */
  const auto = computeStockAutoPriorPaid(
    sorted.map((r) => ({ filingDate: filingDateOf(r), ...paidTaxOf(r) })),
  );

  /**
   * 🔴 **확정신고로 둔다.** 그러지 않으면 자동값이 **no-op** 이다 —
   *    ⑤ 입력란과 ④ 전송이 모두 `filingType === "final"`을 요구하므로 이력의
   *    `"preliminary"`가 남으면 화면에도 안 뜨고 엔진에도 안 간다
   *    ([[feedback_api_trigger_without_input_path_is_noop]]).
   *
   * 법적으로도 그 상태다 — 영 §173⑤3호: 주식등을 **2회 이상** 양도하고 §103②를 적용해
   * 산출세액이 달라지면 **확정신고 의무**가 생긴다(법 §110④ 단서). 합산 진입 자체가 그 상황이다.
   * 종목이 1건이면 요건을 못 채우므로 이력 값을 그대로 둔다.
   */
  const isAggregate = forms.length >= 2;
  const filingPatch: Partial<StockTransferFormData> = isAggregate
    ? {
        filingType: "final",
        preliminaryPaidTax: String(auto.national),
        preliminaryPaidLocalTax: String(auto.local),
      }
    : {};
  // 신고 단위 필드라 **전 종목에 같은 값**을 싣는다(`carryFilingFields`와 같은 규약).
  const patched = forms.map((f) => ({ ...f, ...filingPatch }));

  return { savedItems: patched.slice(0, -1), formData: patched[patched.length - 1] };
}

/** 편입 + 마법사로 이동. 부수효과는 여기만 — 판정·조립은 위 순수 함수들이 한다. */
export function enterStockAggregate(records: CalculationRecord[], router: AppRouter): void {
  const session = buildStockAggregateSession(records);
  if (session.savedItems.length === 0 && records.filter(canStockAggregateFromHistory).length === 0) {
    return;
  }

  useStockTransferStore.setState({
    currentStep: 0,
    formData: session.formData,
    savedItems: session.savedItems,
    result: null,
    aggregateResult: null,
    error: null,
    isLoading: false,
  });

  // 결과 자동저장의 clientId 가 원본과 같아야 이력에서 같은 양도인으로 묶인다.
  const first = records.find(canStockAggregateFromHistory);
  useProfessionalStore.getState().setActiveClientId(first?.clientId ?? null);

  router.push(STOCK_ROUTE);
}
