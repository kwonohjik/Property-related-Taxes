"use client";

/**
 * §43②·영 §32의4 11호 — 소급 1년 이내 «같은 호» 선행거래 입력 테이블.
 *
 * 법 §43② 「그 증여일부터 소급하여 1년 이내에 동일한 거래 등이 있는 경우에는 각각의 거래 등에
 * 따른 이익을 해당 이익별로 합산하여 계산한다」 — §45의5가 명시 열거돼 있다.
 * 영 §32의4 11호가 그 「이익」을 「같은 항 **각 호의 거래에 따른 이익별로 구분된 이익**」으로
 * 특정하므로 **호가 같은 거래만** 합산한다.
 *
 * 없으면 쪼갠 거래가 각각 영 §34의5⑤ 1억원 미만이 되어 전부 비과세로 빠진다.
 * 윈도(1년) 판정·합산은 **엔진**이 한다 — 여기서 다시 계산하지 않는다(dual-truth 회피).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { makeScPriorTxRow, type ScPriorTxRow } from "./deemed-form-rows";

type Props = {
  rows: ScPriorTxRow[];
  onChange: (rows: ScPriorTxRow[]) => void;
};

let rowSeq = 0;
function newRow(): ScPriorTxRow {
  rowSeq += 1;
  return makeScPriorTxRow(`sc-pt-${rowSeq}-${Math.floor(performance.now())}`);
}

export function SpecificCorpPriorTxTable({ rows, onChange }: Props) {
  const update = (i: number, patch: Partial<ScPriorTxRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div
      className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3"
      data-testid="sc-prior-tx-table"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-amber-800">
          소급 1년 이내 같은 호 거래 (§43²)
        </p>
        <button
          type="button"
          onClick={() => onChange([...rows, newRow()])}
          data-testid="sc-pt-add"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100/60"
        >
          + 행 추가
        </button>
      </div>

      {rows.length === 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          같은 호의 거래가 1년 이내에 더 있으면 &quot;+ 행 추가&quot;로 입력하세요 — 합산해 금액기준을
          판정합니다
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={row.id}
            data-testid={`sc-pt-row-${i}`}
            className="space-y-2 rounded-md border border-amber-200 bg-white/70 dark:bg-white/5 p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-800">선행거래 {i + 1}</span>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                data-testid={`sc-pt-delete-${i}`}
                className="text-xs font-medium text-rose-600 hover:text-rose-700"
              >
                × 삭제
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="whitespace-nowrap text-xs text-muted-foreground">거래한 날</label>
              <DateInput
                value={row.date}
                onChange={(v) => update(i, { date: v })}
                data-testid={`sc-pt-date-${i}`}
              />
            </div>

            <CurrencyInput
              label="그 거래의 이익"
              value={row.benefit}
              onChange={(v) => update(i, { benefit: v })}
              hint="영 §34의5④1호 이익 — 이번 거래와 같은 호의 것만"
              data-testid={`sc-pt-benefit-${i}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
