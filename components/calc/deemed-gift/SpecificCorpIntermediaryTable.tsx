"use client";

/**
 * §45의5 간접출자관계 입력 테이블 (개인 → 법인 → 특정법인).
 *
 * 「주식보유비율」은 법 §45의3①이 §45의5까지 확장한 정의어라 **직접 또는 간접**을 모두 산입한다.
 * 간접보유비율 산식은 상증령 §34의3②(각 단계 직접보유비율의 곱 · 경로가 둘 이상이면 합)이다.
 *
 * ⚠️ 경유 법인의 «특정법인 지분»은 여기서 받지 않는다 — 그 법인이 주주 명단의 한 행이므로
 * 그 행의 직접보유 주식수가 곧 그 값이다. §45의3은 두 곳에서 따로 받아 교차검증이 없다(RC-L).
 */

import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import type { ScIntermediaryRow, ScShareholderRow } from "./deemed-form-rows";

type Props = {
  rows: ScIntermediaryRow[];
  shareholders: ScShareholderRow[];
  onChange: (rows: ScIntermediaryRow[]) => void;
};

let rowSeq = 0;
function newRow(): ScIntermediaryRow {
  rowSeq += 1;
  return { id: `sc-im-${rowSeq}-${Math.floor(performance.now())}`, corpShareholderId: "", owners: [] };
}

const selectCls =
  "flex-1 rounded-md border border-violet-200 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm focus:border-violet-400 focus:outline-none";

function rowLabel(sh: ScShareholderRow, i: number) {
  return sh.name.trim() || `주주 ${i + 1}`;
}

export function SpecificCorpIntermediaryTable({ rows, shareholders, onChange }: Props) {
  const corps = shareholders.filter((sh) => sh.isCorporate);
  const individuals = shareholders.filter((sh) => !sh.isCorporate);

  const update = (i: number, patch: Partial<ScIntermediaryRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div
      className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3"
      data-testid="sc-intermediary-table"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-violet-700">간접출자관계 (개인 → 법인 → 특정법인)</p>
        <button
          type="button"
          onClick={() => onChange([...rows, newRow()])}
          disabled={corps.length === 0}
          data-testid="sc-im-add"
          className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100/60 disabled:opacity-40"
        >
          + 행 추가
        </button>
      </div>

      {corps.length === 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground" data-testid="sc-im-no-corp">
          주주 명단에서 「법인주주」로 표시한 행이 있어야 간접출자관계를 입력할 수 있습니다.
        </p>
      )}

      {corps.length > 0 && rows.length === 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          법인을 통한 간접보유가 있으면 &quot;+ 행 추가&quot;로 입력하세요
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={row.id}
            data-testid={`sc-im-row-${i}`}
            className="space-y-2 rounded-md border border-violet-200 bg-white/70 dark:bg-white/5 p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-violet-800">간접출자관계 {i + 1}</span>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                data-testid={`sc-im-delete-${i}`}
                className="text-xs font-medium text-rose-600 hover:text-rose-700"
              >
                × 삭제
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="whitespace-nowrap text-xs text-muted-foreground">경유 법인</label>
              <select
                value={row.corpShareholderId}
                onChange={(e) => update(i, { corpShareholderId: e.target.value })}
                data-testid={`sc-im-corp-${i}`}
                className={selectCls}
              >
                <option value="">-- 법인 선택 --</option>
                {corps.map((c) => (
                  <option key={c.id} value={c.id}>
                    {rowLabel(c, shareholders.indexOf(c))}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-caption text-muted-foreground">
              이 법인의 특정법인 지분은 주주 명단의 직접보유 주식수를 그대로 씁니다.
            </p>

            <div className="space-y-1">
              {row.owners.map((o, j) => (
                <div key={j} className="flex items-center gap-2" data-testid={`sc-im-owner-${i}-${j}`}>
                  <select
                    value={o.individualId}
                    onChange={(e) =>
                      update(i, {
                        owners: row.owners.map((x, idx) =>
                          idx === j ? { ...x, individualId: e.target.value } : x,
                        ),
                      })
                    }
                    data-testid={`sc-im-owner-who-${i}-${j}`}
                    className={selectCls}
                  >
                    <option value="">-- 개인 소유주 --</option>
                    {individuals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {rowLabel(p, shareholders.indexOf(p))}
                      </option>
                    ))}
                  </select>
                  <div className="w-28">
                    <DecimalInput
                      value={o.ratioPctStr}
                      onChange={(v) =>
                        update(i, {
                          owners: row.owners.map((x, idx) => (idx === j ? { ...x, ratioPctStr: v } : x)),
                        })
                      }
                      data-testid={`sc-im-owner-ratio-${i}-${j}`}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">%</span>
                  <button
                    type="button"
                    onClick={() => update(i, { owners: row.owners.filter((_, idx) => idx !== j) })}
                    data-testid={`sc-im-owner-delete-${i}-${j}`}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update(i, { owners: [...row.owners, { individualId: "", ratioPctStr: "" }] })}
                data-testid={`sc-im-owner-add-${i}`}
                className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100/60"
              >
                + 개인 소유주
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
