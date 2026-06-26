"use client";

/** §45의5 특정법인 다주주 명단 입력 테이블 (행 추가/삭제). CapitalDecreaseShareholderTable 패턴 차용. */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import type { ScShareholderRow } from "./deemed-form-state";
import type { ScRelation } from "@/lib/tax-engine/gift-deemed/types";

type Props = {
  rows: ScShareholderRow[];
  onChange: (rows: ScShareholderRow[]) => void;
};

let rowSeq = 0;
function newRow(): ScShareholderRow {
  rowSeq += 1;
  return {
    id: `sc-row-${rowSeq}-${Math.floor(performance.now())}`,
    name: "",
    relation: "lineal_descendant",
    shares: "",
    isDonor: false,
  };
}

const SC_RELATION_OPTIONS: { value: ScRelation; label: string }[] = [
  { value: "lineal_ascendant", label: "직계존속" },
  { value: "lineal_descendant", label: "직계비속" },
  { value: "spouse", label: "배우자" },
  { value: "sibling", label: "형제자매" },
  { value: "other_relative", label: "기타친족" },
  { value: "other", label: "타인" },
];

const textInputCls =
  "w-full rounded-md border border-sky-200 bg-white px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none";

export function SpecificCorpShareholderTable({ rows, onChange }: Props) {
  const update = (i: number, patch: Partial<ScShareholderRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, newRow()]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3" data-testid="sc-shareholder-table">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-sky-700">주주 명단</p>
        <button
          type="button"
          onClick={add}
          data-testid="sc-sh-add"
          className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100/60"
        >
          + 행 추가
        </button>
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          &quot;+ 행 추가&quot;로 주주를 입력하세요
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={row.id}
            data-testid={`sc-sh-row-${i}`}
            className="space-y-2 rounded-md border border-sky-200 bg-white/70 p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sky-800">주주 {i + 1}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                data-testid={`sc-sh-delete-${i}`}
                className="text-xs font-medium text-rose-600 hover:text-rose-700"
              >
                × 삭제
              </button>
            </div>

            {/* 성명 */}
            <input
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              data-testid={`sc-sh-name-${i}`}
              placeholder="성명 (예: 갑·을·병)"
              className={textInputCls}
            />

            {/* 관계 드롭다운 */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">관계</label>
              <select
                value={row.relation}
                onChange={(e) => update(i, { relation: e.target.value as ScRelation })}
                data-testid={`sc-sh-relation-${i}`}
                className="flex-1 rounded-md border border-sky-200 bg-white px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none"
              >
                {SC_RELATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 주식수 */}
            <CurrencyInput
              label="주식수"
              value={row.shares}
              onChange={(v) => update(i, { shares: v })}
              placeholder="보유 주식수"
              data-testid={`sc-sh-shares-${i}`}
            />

            {/* 증여자 본인 여부 */}
            <label
              className="flex items-center gap-2 cursor-pointer"
              data-testid={`sc-sh-is-donor-label-${i}`}
            >
              <input
                type="checkbox"
                checked={row.isDonor}
                onChange={(e) => update(i, { isDonor: e.target.checked })}
                data-testid={`sc-sh-is-donor-${i}`}
                className="rounded border-sky-300"
              />
              <span className="text-xs text-sky-800">증여자 본인 (과세 제외)</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
