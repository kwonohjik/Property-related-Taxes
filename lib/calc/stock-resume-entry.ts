/**
 * 주식 양도세 — 이력 **편집 복원**(resume) 순수 함수.
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.1
 *
 * 이력 화면(`app/history/HistoryClient.tsx`)이 store에 무엇을 넣을지를 이 한 곳에서 정한다 —
 * 종전에는 그 결정이 컴포넌트 안에 인라인으로 있어 **테스트가 닿지 않았고**, 실제로 두 결함이
 * 거기서 났다(`transfer-resume-entry.ts`가 같은 이유로 분리됐다).
 *
 * 🔴 **`savedItems`를 반드시 함께 돌려준다.** 그것이 이 파일의 존재 이유다 —
 *    `savedItems`는 `partialize`로 sessionStorage에 영속되는데
 *    (`lib/stores/calc-wizard-stock-store.ts:232`) 종전 복원은 `formData`만 덮어쓰고 목록을
 *    비우지 않아, 다종목 작업 뒤 단건을 편집하면 **직전 종목들이 그대로 합산에 섞였다**.
 *    호출부가 목록을 「건드리지 않는」 선택지를 갖지 못하도록 값을 항상 싣는다.
 */
import {
  normalizeStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

export interface StockResumeState {
  /** 편집기에 올릴 종목 — 다종목이면 **마지막** 항목 */
  formData: StockTransferFormData;
  /** 확정 목록 — 다종목이면 앞 N-1건, 단건이면 **빈 배열** */
  savedItems: StockTransferFormData[];
}

/**
 * 이력 record의 `inputData`로부터 store 상태를 만든다.
 *
 * 규약은 저장 쪽(`StockTransferTaxCalculator`)과 **대칭**이다 —
 * 저장이 `[...savedItems, formData]`를 `items`로 싣고, 복원이 그것을 되돌린다.
 * 손상된 record(`items`가 없거나 빈 배열)는 단건처럼 안전하게 복원한다.
 */
export function buildStockResumeState(
  inputData: Record<string, unknown> | null | undefined,
): StockResumeState {
  const input = inputData ?? {};
  const items =
    input.__multiStock === true ? (input.items as unknown[] | undefined) : undefined;

  if (Array.isArray(items) && items.length > 0) {
    const normalized = items.map((item) => normalizeStockFormData(item));
    return {
      savedItems: normalized.slice(0, -1),
      formData: normalized[normalized.length - 1],
    };
  }

  return { savedItems: [], formData: normalizeStockFormData(input) };
}
