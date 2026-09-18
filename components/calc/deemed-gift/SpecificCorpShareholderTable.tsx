"use client";

/** §45의5 특정법인 다주주 명단 입력 테이블 (행 추가/삭제). CapitalDecreaseShareholderTable 패턴 차용. */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
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
    isCorporate: false,
    donorRelation: "",
    isGenerationSkip: false,
  };
}

/** §53 증여재산공제 구분 — ""는 입력 단의 단일 「증여재산공제」로 떨어진다(기사용 공제 경로) */
const SC_DONOR_RELATION_OPTIONS: { value: ScShareholderRow["donorRelation"]; label: string }[] = [
  { value: "", label: "미지정 (아래 증여재산공제 사용)" },
  { value: "spouse", label: "배우자 (6억)" },
  { value: "lineal_ascendant_adult", label: "직계존속 → 성년 (5천만)" },
  { value: "lineal_ascendant_minor", label: "직계존속 → 미성년 (2천만)" },
  { value: "lineal_descendant", label: "직계비속 (5천만)" },
  { value: "other_relative", label: "기타친족 (1천만)" },
];

const SC_RELATION_OPTIONS: { value: ScRelation; label: string }[] = [
  { value: "self", label: "본인(지배주주)" },
  { value: "lineal_ascendant", label: "직계존속" },
  { value: "lineal_descendant", label: "직계비속" },
  { value: "spouse", label: "배우자" },
  { value: "sibling", label: "형제자매" },
  { value: "other_relative", label: "기타친족" },
  { value: "other", label: "타인" },
];

const textInputCls =
  "w-full rounded-md border border-sky-200 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none";

export function SpecificCorpShareholderTable({ rows, onChange }: Props) {
  const update = (i: number, patch: Partial<ScShareholderRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, newRow()]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3" data-testid="sc-shareholder-table">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-sky-700">지배주주등 주주 명단</p>
        <button
          type="button"
          onClick={add}
          data-testid="sc-sh-add"
          className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100/60"
        >
          + 행 추가
        </button>
      </div>
      {/* 🔴 SC-4-e: 관계 드롭다운의 **기준점**이 화면에 없었다. 같은 행에 `isDonor`(증여자 본인)
          체크가 함께 있어 「증여자와의 관계」로 읽히기 쉬운데, §45의5①의 「지배주주등」은
          **지배주주**와 그 친족이다. 기준을 잘못 읽으면 그 주주분이 통째로 과세에서 빠진다. */}
      <p className="text-caption text-muted-foreground" data-testid="sc-sh-relation-basis">
        관계는 <b>지배주주 기준</b>입니다(증여자 기준이 아닙니다). 지배주주의 친족이 아니면
        「타인」을 고르세요 — 그 주주는 지배주주등이 아니므로 과세에서 제외됩니다(법 §45의5①).
      </p>

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
            className="space-y-2 rounded-md border border-sky-200 bg-white/70 dark:bg-white/5 p-2"
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
              <label className="text-xs text-muted-foreground whitespace-nowrap">지배주주와의 관계</label>
              <select
                value={row.relation}
                onChange={(e) => update(i, { relation: e.target.value as ScRelation })}
                data-testid={`sc-sh-relation-${i}`}
                className="flex-1 rounded-md border border-sky-200 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none"
              >
                {SC_RELATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 주식수 — 직접보유분. 간접분은 아래 「간접출자관계」에서 표현한다 */}
            <CurrencyInput
              label="직접보유 주식수"
              value={row.shares}
              onChange={(v) => update(i, { shares: v })}
              placeholder="직접 보유한 주식수"
              hint="법인 경유 간접보유는 아래 「간접출자관계」에"
              data-testid={`sc-sh-shares-${i}`}
            />

            {/* 법인주주 — 지배주주등은 「지배주주와 그 친족」(법 §45의4①)이라 개인뿐이다 */}
            <ToggleCard
              variant="chip"
              tone="sky"
              title="법인주주 (간접출자 경유 법인)"
              checked={row.isCorporate}
              onCheckedChange={(v) => update(i, { isCorporate: v, isDonor: v ? false : row.isDonor })}
              data-testid={`sc-sh-is-corporate-${i}`}
            />

            {/* §53 증여재산공제 구분 — 「증여자와의」 관계 (위 「관계」는 지배주주와의 관계라 다른 축) */}
            {!row.isCorporate && !row.isDonor && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">증여자와의 관계</label>
                  <select
                    value={row.donorRelation}
                    onChange={(e) =>
                      update(i, { donorRelation: e.target.value as ScShareholderRow["donorRelation"] })
                    }
                    data-testid={`sc-sh-donor-relation-${i}`}
                    className="flex-1 rounded-md border border-sky-200 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none"
                  >
                    {SC_DONOR_RELATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <ToggleCard
                  variant="chip"
                  tone="sky"
                  title="세대생략 (증여자의 손자녀 등 — §57 할증)"
                  checked={row.isGenerationSkip}
                  onCheckedChange={(v) => update(i, { isGenerationSkip: v })}
                  data-testid={`sc-sh-generation-skip-${i}`}
                />
              </>
            )}

            {/* 증여자 본인 여부 — native checkbox 금지(components/calc/CLAUDE.md), ToggleCard chip (IG-096) */}
            {!row.isCorporate && (
              <ToggleCard
                variant="chip"
                tone="sky"
                title="증여자 본인 (과세 제외)"
                checked={row.isDonor}
                // §45의5①은 「거래한 날을 증여일로 하여」 — 증여자가 2인이면 별개 거래다.
                // 켜면 나머지를 끈다(⑧·⑫와 같은 규칙 — 3중 패턴).
                onCheckedChange={(v) =>
                  onChange(
                    rows.map((r, idx) =>
                      idx === i ? { ...r, isDonor: v } : v ? { ...r, isDonor: false } : r,
                    ),
                  )
                }
                data-testid={`sc-sh-is-donor-${i}`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
