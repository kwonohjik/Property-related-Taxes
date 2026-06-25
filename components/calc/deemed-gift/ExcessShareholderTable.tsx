"use client";

/**
 * §41의2 초과배당 — 주주 입력 테이블
 * role(major_shareholder/related_party/other) + 지분율 + 실수령 배당금
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { EdShareholderRow } from "./shared";

type Props = {
  rows: EdShareholderRow[] | undefined;
  onChange: (rows: EdShareholderRow[]) => void;
};

/** role 표시 라벨 */
const ROLE_LABELS: Record<EdShareholderRow["role"], string> = {
  major_shareholder: "최대주주등",
  related_party: "특수관계인",
  other: "기타",
};

/** role 색상 */
const ROLE_COLORS: Record<EdShareholderRow["role"], string> = {
  major_shareholder: "bg-rose-100 text-rose-800 border border-rose-200",
  related_party: "bg-sky-100 text-sky-800 border border-sky-200",
  other: "bg-slate-100 text-slate-700 border border-slate-200",
};

/** role 순환 (클릭 시 변경) */
const ROLE_CYCLE: EdShareholderRow["role"][] = [
  "major_shareholder",
  "related_party",
  "other",
];

/** 신규 주주 행 생성 */
function newRow(id: string): EdShareholderRow {
  return {
    id,
    name: "",
    role: "other",
    ownershipRatioPctStr: "",
    actualDividendStr: "",
  };
}

export function ExcessShareholderTable({ rows, onChange }: Props) {
  const safeRows = rows ?? [];

  // 총 실수령 배당합계 (단순 합산 — 미리보기 표시용)
  const totalActualDividend = useMemo(
    () => safeRows.reduce((sum, r) => sum + parseAmount(r.actualDividendStr), 0),
    [safeRows],
  );

  function addRow() {
    const newId = `ed-sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onChange([...safeRows, newRow(newId)]);
  }

  function removeRow(id: string) {
    onChange(safeRows.filter((r) => r.id !== id));
  }

  function patchRow(id: string, patch: Partial<EdShareholderRow>) {
    onChange(safeRows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function cycleRole(row: EdShareholderRow) {
    const idx = ROLE_CYCLE.indexOf(row.role);
    const next = ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length];
    patchRow(row.id, { role: next });
  }

  return (
    <div className="space-y-3">
      {/* 주주 행 */}
      {safeRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-sky-200">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-sky-200 bg-sky-50/70 text-xs text-sky-700">
                <th className="py-2 pl-3 pr-2 text-left font-medium">이름</th>
                <th className="py-2 pr-2 text-left font-medium">역할 (클릭변경)</th>
                <th className="py-2 pr-2 text-right font-medium">실수령 배당금</th>
                <th className="py-2 pr-2 text-right font-medium">지분율 (%)</th>
                <th className="py-2 pr-2 text-center font-medium">삭제</th>
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row) => (
                <tr key={row.id} className="border-b border-sky-100 last:border-0">
                  <td className="py-1.5 pl-3 pr-2">
                    <input
                      type="text"
                      className="w-24 rounded border border-sky-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sky-300"
                      value={row.name}
                      onChange={(e) => patchRow(row.id, { name: e.target.value })}
                      placeholder="주주명"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <button
                      type="button"
                      onClick={() => cycleRole(row)}
                      className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${ROLE_COLORS[row.role]}`}
                      title="클릭하여 역할 변경"
                    >
                      {ROLE_LABELS[row.role]}
                    </button>
                  </td>
                  <td className="py-1.5 pr-2">
                    <CurrencyInput
                      label=""
                      hideLabel
                      value={row.actualDividendStr}
                      onChange={(v) => patchRow(row.id, { actualDividendStr: v })}
                      placeholder="실수령 배당금"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1">
                      <DecimalInput
                        value={row.ownershipRatioPctStr}
                        onChange={(v) => patchRow(row.id, { ownershipRatioPctStr: v })}
                        placeholder="지분율"
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      aria-label="주주 삭제"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 주주 추가 버튼 */}
      <button
        type="button"
        onClick={addRow}
        className="rounded-lg border border-dashed border-sky-300 bg-sky-50/40 px-3 py-2 text-sm text-sky-700 hover:bg-sky-100 hover:border-sky-400 transition-colors"
      >
        + 주주 추가
      </button>

      {/* 총 실수령 배당합계 — 미리보기 (§0.5: 자동산정 미리보기 금지, 합계만 표시) */}
      {safeRows.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-100/60 px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-sky-700">총 실수령 배당합계</span>
            <span className="font-mono tabular-nums whitespace-nowrap text-sky-900 font-semibold">
              {formatKRW(totalActualDividend)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            비례배당·초과배당금액은 계산 후 결과 화면에 엔진 산정값으로 표시됩니다.
          </p>
        </div>
      )}

      {/* 역할 안내 */}
      <div className="text-xs text-muted-foreground space-y-0.5 pl-1">
        <p>
          <span className="inline-block w-2 h-2 rounded-full bg-rose-300 mr-1" />
          <strong>최대주주등</strong> — 배당을 포기하거나 과소수령한 주주
        </p>
        <p>
          <span className="inline-block w-2 h-2 rounded-full bg-sky-300 mr-1" />
          <strong>특수관계인</strong> — 초과배당을 수령한 수증자 (증여세 납세의무자)
        </p>
        <p>
          <span className="inline-block w-2 h-2 rounded-full bg-slate-300 mr-1" />
          <strong>기타</strong> — 그 외 주주 (과소배당 총액 분모 계산에 포함)
        </p>
      </div>
    </div>
  );
}

/** 지분율 문자열 → 유효성 (0 초과 여부) */
export function isValidRatioPct(pctStr: string): boolean {
  return parseDecimal(pctStr) > 0;
}
