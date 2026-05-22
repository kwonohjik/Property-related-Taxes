"use client";

/**
 * ValuationDeltaTable — 별지 부표3 3쪽 5.평가차액 (자산·부채 평가액 vs 재무상태표 금액)
 *
 * 법령: 상증령 §55② + 상증규 §17의2 — KoreanLaw 검증 2026-05-22
 *
 * Phase D (PR-N UI 통합) 확장: display-only → input-capable
 *   - 입력 모드 토글: 행 단위 입력 vs 총액 fallback
 *   - 자산·부채 통합 배열 (category 필드로 분리)
 *   - 행 추가/삭제 + 음수 차액 △ 표시
 *   - 합계 자동 계산 + 평가차액(자산 합 − 부채 합) 도출
 *   - 행 입력 시 onChange로 evaluationDeltaRows + assetValuationDelta 동시 갱신
 *   - 엔진 진입점 resolveEvaluationDelta가 자산 합−부채 합 차액을 assetValuationDelta로 처리
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §2-1
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md §2-3
 */

import { useMemo, useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { EvaluationDeltaRow } from "@/lib/tax-engine/property-valuation/evaluation-delta";

// 행 max 제한 (계획서 §6 정책)
const MAX_ASSET_ROWS = 50;
const MAX_LIABILITY_ROWS = 30;

export interface ValuationDeltaTableProps {
  /** 통합 배열 (category 필드로 자산/부채 분리). 미입력 시 총액 fallback */
  evaluationDeltaRows: EvaluationDeltaRow[];
  /** 총액 fallback (행 미입력 시 사용) — 자산 평가차액 단일 총액 */
  fallbackAssetValuationDelta: number;
  /** 행 변경 콜백 (단일 통합 배열) */
  onRowsChange: (rows: EvaluationDeltaRow[]) => void;
  /** 총액 fallback 변경 콜백 (행 미입력 시만 사용) */
  onFallbackChange?: (next: number) => void;
}

function makeNewRow(category: "asset" | "liability"): EvaluationDeltaRow {
  return {
    rowId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    accountName: "",
    evaluationAmount: 0,
    bookAmount: 0,
  };
}

export function ValuationDeltaTable({
  evaluationDeltaRows,
  fallbackAssetValuationDelta,
  onRowsChange,
  onFallbackChange,
}: ValuationDeltaTableProps) {
  // 행 단위 입력 모드 — derived from rows.length > 0
  // 사용자가 명시적으로 OFF 시 행이 보존되어 있어도 fallback 모드로 (DM3 정정)
  const hasRows = evaluationDeltaRows.length > 0;
  const [inputModeUserPreference, setInputModeUserPreference] = useState<boolean>(hasRows);
  const inputMode = inputModeUserPreference || hasRows;

  const assetRows = useMemo(
    () => evaluationDeltaRows.filter((r) => r.category === "asset"),
    [evaluationDeltaRows],
  );
  const liabilityRows = useMemo(
    () => evaluationDeltaRows.filter((r) => r.category === "liability"),
    [evaluationDeltaRows],
  );

  const assetTotal = useMemo(
    () => assetRows.reduce((s, r) => s + (r.evaluationAmount - r.bookAmount), 0),
    [assetRows],
  );
  const liabilityTotal = useMemo(
    () => liabilityRows.reduce((s, r) => s + (r.evaluationAmount - r.bookAmount), 0),
    [liabilityRows],
  );
  const evaluationDelta = assetTotal - liabilityTotal;

  function updateRow(rowId: string, patch: Partial<EvaluationDeltaRow>) {
    onRowsChange(
      evaluationDeltaRows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );
  }

  function addRow(category: "asset" | "liability") {
    const currentCount = category === "asset" ? assetRows.length : liabilityRows.length;
    const max = category === "asset" ? MAX_ASSET_ROWS : MAX_LIABILITY_ROWS;
    if (currentCount >= max) return;
    onRowsChange([...evaluationDeltaRows, makeNewRow(category)]);
  }

  function removeRow(rowId: string) {
    onRowsChange(evaluationDeltaRows.filter((r) => r.rowId !== rowId));
  }

  function toggleInputMode(next: boolean) {
    setInputModeUserPreference(next);
    if (!next && hasRows) {
      // OFF 토글 시 행 클리어 + fallback 총액으로 전환 (silent omission 차단)
      onRowsChange([]);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
          4
        </span>
        <p className="text-xs font-semibold text-emerald-700">
          평가차액 (별지 3쪽 — 자산·부채 계정과목별)
        </p>
      </div>
      <p className="text-[11px] text-emerald-700/80">
        상증법 §60·§66 평가액 vs 재무상태표 차액. ① 자산 합 − ② 부채 합 = 평가차액 →{" "}
        <strong>2쪽 4.가.② 기재</strong> (상증령 §55② + §17의2)
      </p>

      <ToggleCard
        tone="emerald"
        title="행 단위 입력 모드"
        description={
          inputMode
            ? "자산·부채 계정과목별 행 추가/삭제 가능"
            : "총액 직접 입력 모드 (행 단위 입력하려면 토글 ON)"
        }
        checked={inputMode}
        onCheckedChange={toggleInputMode}
        variant="card"
      >
        <div className="space-y-3">
          {/* 자산 평가차액 */}
          <div className="rounded border border-sky-200 bg-sky-50/60 p-2 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-sky-800">
                자산 평가차액 ({assetRows.length}/{MAX_ASSET_ROWS})
              </p>
              <button
                type="button"
                onClick={() => addRow("asset")}
                disabled={assetRows.length >= MAX_ASSET_ROWS}
                className="text-[10px] rounded bg-sky-600 text-white px-2 py-0.5 hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                + 자산 행 추가
              </button>
            </div>

            {assetRows.length === 0 && (
              <p className="text-[10px] text-sky-700/70 py-2 text-center">
                &quot;+ 자산 행 추가&quot; 버튼으로 계정과목을 입력하세요
              </p>
            )}

            {assetRows.map((row) => {
              const delta = row.evaluationAmount - row.bookAmount;
              return (
                <div
                  key={row.rowId}
                  className="grid grid-cols-[1fr_1fr_1fr_5rem_auto] items-center gap-1.5 py-0.5"
                >
                  <input
                    type="text"
                    value={row.accountName}
                    onChange={(e) => updateRow(row.rowId, { accountName: e.target.value })}
                    placeholder="계정과목"
                    className="text-[11px] border border-sky-300 rounded px-1.5 py-0.5"
                  />
                  <CurrencyInput
                    label="평가액"
                    value={String(row.evaluationAmount || "")}
                    onChange={(v) =>
                      updateRow(row.rowId, { evaluationAmount: Number(v.replace(/,/g, "")) || 0 })
                    }
                    placeholder="상증법 평가액"
                    hideUnit
                  />
                  <CurrencyInput
                    label="장부"
                    value={String(row.bookAmount || "")}
                    onChange={(v) =>
                      updateRow(row.rowId, { bookAmount: Number(v.replace(/,/g, "")) || 0 })
                    }
                    placeholder="장부금액"
                    hideUnit
                  />
                  <div
                    className={`text-[11px] font-mono text-right ${
                      delta < 0 ? "text-rose-700" : "text-sky-900"
                    }`}
                  >
                    {delta < 0 ? `△${Math.abs(delta).toLocaleString()}` : delta.toLocaleString()}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.rowId)}
                    className="text-rose-600 hover:text-rose-800 px-1 text-xs"
                    aria-label="행 삭제"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            <div className="border-t border-sky-300 pt-1 mt-1 flex justify-between text-[11px] font-bold text-sky-900">
              <span>① 자산 합계</span>
              <span className="font-mono">{assetTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* 부채 평가차액 */}
          <div className="rounded border border-rose-200 bg-rose-50/60 p-2 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-rose-800">
                부채 평가차액 ({liabilityRows.length}/{MAX_LIABILITY_ROWS})
              </p>
              <button
                type="button"
                onClick={() => addRow("liability")}
                disabled={liabilityRows.length >= MAX_LIABILITY_ROWS}
                className="text-[10px] rounded bg-rose-600 text-white px-2 py-0.5 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                + 부채 행 추가
              </button>
            </div>

            {liabilityRows.length === 0 && (
              <p className="text-[10px] text-rose-700/70 py-2 text-center">
                &quot;+ 부채 행 추가&quot; 버튼으로 계정과목을 입력하세요
              </p>
            )}

            {liabilityRows.map((row) => {
              const delta = row.evaluationAmount - row.bookAmount;
              return (
                <div
                  key={row.rowId}
                  className="grid grid-cols-[1fr_1fr_1fr_5rem_auto] items-center gap-1.5 py-0.5"
                >
                  <input
                    type="text"
                    value={row.accountName}
                    onChange={(e) => updateRow(row.rowId, { accountName: e.target.value })}
                    placeholder="계정과목"
                    className="text-[11px] border border-rose-300 rounded px-1.5 py-0.5"
                  />
                  <CurrencyInput
                    label="평가액"
                    value={String(row.evaluationAmount || "")}
                    onChange={(v) =>
                      updateRow(row.rowId, { evaluationAmount: Number(v.replace(/,/g, "")) || 0 })
                    }
                    placeholder="상증법 평가액"
                    hideUnit
                  />
                  <CurrencyInput
                    label="장부"
                    value={String(row.bookAmount || "")}
                    onChange={(v) =>
                      updateRow(row.rowId, { bookAmount: Number(v.replace(/,/g, "")) || 0 })
                    }
                    placeholder="장부금액"
                    hideUnit
                  />
                  <div
                    className={`text-[11px] font-mono text-right ${
                      delta < 0 ? "text-rose-700" : "text-rose-900"
                    }`}
                  >
                    {delta < 0 ? `△${Math.abs(delta).toLocaleString()}` : delta.toLocaleString()}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.rowId)}
                    className="text-rose-600 hover:text-rose-800 px-1 text-xs"
                    aria-label="행 삭제"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            <div className="border-t border-rose-300 pt-1 mt-1 flex justify-between text-[11px] font-bold text-rose-900">
              <span>② 부채 합계</span>
              <span className="font-mono">{liabilityTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* 평가차액 (자산 − 부채) */}
          <div className="rounded border-2 border-emerald-400 bg-emerald-100/80 p-3 flex justify-between items-center">
            <div>
              <p className="text-[11px] font-bold text-emerald-900">평가차액 (① − ②)</p>
              <p className="text-[10px] text-emerald-700">
                → 2쪽 4.가.② &quot;평가차액&quot;으로 자동 흡수 (엔진 resolveEvaluationDelta 처리)
              </p>
            </div>
            <span
              className={`font-mono text-sm font-bold ${
                evaluationDelta < 0 ? "text-rose-700" : "text-emerald-900"
              }`}
            >
              {evaluationDelta < 0
                ? `△${Math.abs(evaluationDelta).toLocaleString()}`
                : evaluationDelta.toLocaleString()}
              원
            </span>
          </div>
        </div>
      </ToggleCard>

      {/* 총액 fallback 모드 */}
      {!inputMode && (
        <div className="rounded border border-emerald-300 bg-emerald-50/60 p-2 space-y-1">
          <p className="text-[11px] font-semibold text-emerald-800">
            총액 직접 입력 (자산 평가차액 단일 값)
          </p>
          <p className="text-[10px] text-emerald-700/80">
            ※ 행 단위 입력하려면 위 토글을 ON. 본 입력은 NetAssetCalculation의 ②(평가차액)에
            직접 반영됩니다.
          </p>
          {onFallbackChange && (
            <CurrencyInput
              label="평가차액 총액"
              value={String(fallbackAssetValuationDelta || "")}
              onChange={(v) => onFallbackChange(Number(v.replace(/,/g, "")) || 0)}
              placeholder="평가차액 (자산 − 부채)"
              hideUnit
            />
          )}
        </div>
      )}
    </div>
  );
}
