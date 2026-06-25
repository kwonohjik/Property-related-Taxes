"use client";

/** 감자 §39의2 멀티(불균등 N:N) — 주주 명단 입력 테이블 (행 추가/삭제). */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { CdShareholderRow } from "./shared";

type Props = {
  shareholders: CdShareholderRow[];
  onChange: (rows: CdShareholderRow[]) => void;
};

let rowSeq = 0;
function newRow(): CdShareholderRow {
  rowSeq += 1;
  return { id: `cd-row-${rowSeq}-${Math.floor(performance.now())}`, name: "", preShares: "", redeemedShares: "", redemptionPrice: "", relationGroup: "" };
}

const textInputCls =
  "w-full rounded-md border border-amber-200 bg-white px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none";

export function CapitalDecreaseShareholderTable({ shareholders, onChange }: Props) {
  const update = (i: number, patch: Partial<CdShareholderRow>) =>
    onChange(shareholders.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...shareholders, newRow()]);
  const remove = (i: number) => onChange(shareholders.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3" data-testid="cd-shareholder-table">
      <p className="text-xs font-semibold text-amber-700">주주 명단</p>

      <div className="space-y-2">
        {shareholders.map((row, i) => {
          const isSurvivor = parseAmount(row.redeemedShares) === 0;
          return (
            <div
              key={row.id}
              data-testid={`cd-shareholder-row-${i}`}
              className="space-y-2 rounded-md border border-amber-200 bg-white/70 p-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-amber-800">주주 {i + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  data-testid={`cd-sh-delete-${i}`}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  × 삭제
                </button>
              </div>
              <input
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
                data-testid={`cd-sh-name-${i}`}
                placeholder="이름 (예: 갑·을·병)"
                className={textInputCls}
              />
              <CurrencyInput label="감자 전 주식수" value={row.preShares} onChange={(v) => update(i, { preShares: v })} placeholder="감자 전 보유 주식수" />
              <CurrencyInput label="감자 주식수" value={row.redeemedShares} onChange={(v) => update(i, { redeemedShares: v })} placeholder="소각 주식수 (0이면 잔존주주)" />
              {!isSurvivor && (
                <CurrencyInput label="소각대가 (1주당)" value={row.redemptionPrice} onChange={(v) => update(i, { redemptionPrice: v })} placeholder="소각 1주당 지급액" />
              )}
              <input
                value={row.relationGroup}
                onChange={(e) => update(i, { relationGroup: e.target.value })}
                data-testid={`cd-sh-group-${i}`}
                placeholder="특수관계 그룹 (같은 값=특수관계, 예: 가족A)"
                className={textInputCls}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        data-testid="cd-sh-add"
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100/60"
      >
        + 주주 추가
      </button>

      <p className="text-xs text-muted-foreground">
        감자 주식수 = 0 이면 잔존주주로 처리됩니다. 특수관계 그룹 태그가 같은 주주끼리 특수관계인으로 판정합니다(예: 부·모·자 모두 &quot;가족A&quot;). 비특수관계 주주는 다른 값(예: &quot;소액&quot;)을 입력하세요.
      </p>
    </div>
  );
}
