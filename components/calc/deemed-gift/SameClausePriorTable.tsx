"use client";

/**
 * 「상증법」§43² 소급 1년 선행 이익 표 — 활성 조건(`activeSameClauseRowsKey`)이 참일 때만 그린다.
 * ⑤가 ④·⑧과 같은 술어를 부르도록 한 곳에 모았다. 표 자체는 §45의5와 같은 `SpecificCorpPriorTxTable`.
 */
import { activeSameClauseRowsKey, SAME_CLAUSE_ITEM, type SameClauseRowsKey } from "@/lib/calc/gift-deemed-43-2";
import { SpecificCorpPriorTxTable } from "./SpecificCorpPriorTxTable";
import type { DeemedFormState } from "./shared";

/** testid 접두어 — `${prefix}-prior-tx-table` */
const PREFIX: Record<SameClauseRowsKey, string> = {
  ciPriorSameClauseRows: "ci",
  mrgPriorSameClauseRows: "mrg",
  cdPriorSameClauseRows: "cd",
  conPriorSameClauseRows: "con",
  cbPriorSameClauseRows: "cb",
  freePriorSameClauseRows: "free",
  psuPriorSameClauseRows: "psu",
};

type Props = {
  form: DeemedFormState;
  set: (patch: Partial<DeemedFormState>) => void;
  rowsKey: SameClauseRowsKey;
  /** 합산 단위와 금액기준 — 예: 「같은 호(저가발행 §39①1호)의 이익만 — 3억 금액기준 …」 */
  benefitHint: string;
};

export function SameClausePriorTable({ form, set, rowsKey, benefitHint }: Props) {
  if (activeSameClauseRowsKey(form) !== rowsKey) return null;
  return (
    <SpecificCorpPriorTxTable
      rows={form[rowsKey] ?? []}
      onChange={(rows) => set({ [rowsKey]: rows })}
      testIdPrefix={PREFIX[rowsKey]}
      copy={{
        item: SAME_CLAUSE_ITEM[rowsKey],
        dateLabel: "증여일",
        benefitLabel: "그 거래의 이익",
        benefitHint,
      }}
    />
  );
}
