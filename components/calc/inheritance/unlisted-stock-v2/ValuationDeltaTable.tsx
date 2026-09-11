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
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  /** 섹션 번호 (부모 UnlistedStockV2Card 단일 출처 — 다-섹션 카드 패턴) */
  sectionNum?: number;
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
  sectionNum = 4,
}: ValuationDeltaTableProps) {
  // 행 단위 입력 모드 — derived from rows.length > 0
  // 사용자가 명시적으로 OFF 시 행이 보존되어 있어도 fallback 모드로 (DM3 정정)
  const hasRows = evaluationDeltaRows.length > 0;
  const [inputModeUserPreference, setInputModeUserPreference] = useState<boolean>(hasRows);
  const [discardOpen, setDiscardOpen] = useState(false);
  /** 사용자가 실제로 넣은 값이 있는가 — 계정과목 또는 금액. 빈 행만 있으면 false. */
  const hasRowData = evaluationDeltaRows.some(
    (r) => (r.accountName ?? "").trim() !== "" || r.bookAmount > 0 || r.evaluationAmount > 0,
  );
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

  /**
   * 행 모드 OFF — 자산 50행·부채 30행까지의 계정과목별 입력을 «되돌릴 수 없이» 파기한다.
   * 형제 토글 3개(PreIpoListing·EstimatedProfit·EvaluationCommittee)는 모두 확인 Dialog를
   * 거친다. 게다가 종전에는 `onFallbackChange`를 안 불러 ② 평가차액이 행 합계에서
   * **stale 총액(대개 0)** 으로 조용히 떨어져 순자산가액·1주당 평가액·세액이 바뀌었다. (IG-061)
   */
  function discardRows() {
    // 파기 전에 «지금 계산된 평가차액»을 총액 모드로 이월한다 — 값이 0으로 증발하지 않게.
    onFallbackChange?.(evaluationDelta);
    onRowsChange([]);
  }

  function toggleInputMode(next: boolean) {
    if (!next && hasRowData) {
      // 확인 Dialog를 거친다 — preference는 확인 후에 내린다(취소 시 ON 유지).
      // ⚠️ 게이트는 `hasRows`가 아니라 «실제 입력이 있는가»다. ON 토글이 자동 생성한
      //    빈 행 2개에까지 확인을 물으면 «잃을 것이 없는» 상황에 마찰만 생긴다 —
      //    형제 토글 3개도 전부 hasData 축이다(G4 IG-131·138과 같은 기준).
      setDiscardOpen(true);
      return;
    }
    setInputModeUserPreference(next);
    if (next && evaluationDeltaRows.length === 0) {
      // ON 토글 시 자산·부채 빈 행 1개씩 자동 생성 → 바로 입력 가능
      onRowsChange([makeNewRow("asset"), makeNewRow("liability")]);
    } else if (!next && hasRows) {
      // 데이터 없는 빈 행은 확인 없이 즉시 정리한다 —
      // `inputMode = preference || hasRows`이므로 행을 남기면 모드가 꺼지지 않는다.
      discardRows();
    }
  }

  return (
    <ToneCard
      tone="emerald"
      sectionNum={sectionNum}
      bodyClassName="space-y-3"
      title="평가차액 (별지 3쪽 — 자산·부채 계정과목별)"
      noDark
    >
      <p className="text-caption text-emerald-700/80">
        상증법 §60·§66 평가액 vs 재무상태표 차액. ① 자산 합 − ② 부채 합 = 평가차액 →{" "}
        <strong>2쪽 4.가.② 기재</strong> (상증령 §55② + §17의2)
      </p>

      <ToggleCard
        lawLinks="상증법"
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
              <p className="text-caption font-semibold text-sky-800">
                자산 평가차액 ({assetRows.length}/{MAX_ASSET_ROWS})
              </p>
              <button
                type="button"
                onClick={() => addRow("asset")}
                disabled={assetRows.length >= MAX_ASSET_ROWS}
                className="text-micro rounded bg-sky-600 text-white px-2 py-0.5 hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                + 자산 행 추가
              </button>
            </div>

            {assetRows.length === 0 && (
              <p className="text-micro text-sky-700/70 py-2 text-center">
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
                    className="text-caption border border-sky-300 rounded px-1.5 py-0.5"
                  />
                  <CurrencyInput
                    label="평가액"
                    value={String(row.evaluationAmount || "")}
                    onChange={(v) =>
                      updateRow(row.rowId, { evaluationAmount: Number(v.replace(/,/g, "")) || 0 })
                    }
                    placeholder="상증법"
                    hideUnit
                  />
                  <CurrencyInput
                    label="장부"
                    value={String(row.bookAmount || "")}
                    onChange={(v) =>
                      updateRow(row.rowId, { bookAmount: Number(v.replace(/,/g, "")) || 0 })
                    }
                    placeholder="금액"
                    hideUnit
                  />
                  <div
                    className={`text-caption font-mono tabular-nums text-right ${
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

            <div className="border-t border-sky-300 pt-1 mt-1 flex justify-between text-caption font-bold text-sky-900">
              <span>① 자산 합계</span>
              <span className="font-mono tabular-nums">{assetTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* 부채 평가차액 */}
          <div className="rounded border border-rose-200 bg-rose-50/60 p-2 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-caption font-semibold text-rose-800">
                부채 평가차액 ({liabilityRows.length}/{MAX_LIABILITY_ROWS})
              </p>
              <button
                type="button"
                onClick={() => addRow("liability")}
                disabled={liabilityRows.length >= MAX_LIABILITY_ROWS}
                className="text-micro rounded bg-rose-600 text-white px-2 py-0.5 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                + 부채 행 추가
              </button>
            </div>

            {liabilityRows.length === 0 && (
              <p className="text-micro text-rose-700/70 py-2 text-center">
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
                    className="text-caption border border-rose-300 rounded px-1.5 py-0.5"
                  />
                  <CurrencyInput
                    label="평가액"
                    value={String(row.evaluationAmount || "")}
                    onChange={(v) =>
                      updateRow(row.rowId, { evaluationAmount: Number(v.replace(/,/g, "")) || 0 })
                    }
                    placeholder="상증법"
                    hideUnit
                  />
                  <CurrencyInput
                    label="장부"
                    value={String(row.bookAmount || "")}
                    onChange={(v) =>
                      updateRow(row.rowId, { bookAmount: Number(v.replace(/,/g, "")) || 0 })
                    }
                    placeholder="금액"
                    hideUnit
                  />
                  <div
                    className={`text-caption font-mono tabular-nums text-right ${
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

            <div className="border-t border-rose-300 pt-1 mt-1 flex justify-between text-caption font-bold text-rose-900">
              <span>② 부채 합계</span>
              <span className="font-mono tabular-nums">{liabilityTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* 평가차액 (자산 − 부채) */}
          <div className="rounded border-2 border-emerald-400 bg-emerald-100/80 p-3 flex justify-between items-center">
            <div>
              <p className="text-caption font-bold text-emerald-900">평가차액 (① − ②)</p>
              <p className="text-micro text-emerald-700">
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
          <p className="text-caption font-semibold text-emerald-800">
            총액 직접 입력 (자산 평가차액 단일 값)
          </p>
          <p className="text-micro text-emerald-700/80">
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

      {/* 행 폐기 확인 — 형제 토글 3개와 동일 관례 (memory feedback_dialog_data_discard_confirm) */}
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="행 단위 입력을 폐기할까요?"
        description={`입력한 계정과목 ${evaluationDeltaRows.length}행이 모두 삭제되고 총액 직접 입력 모드로 돌아갑니다. 현재 계산된 평가차액은 총액 칸으로 이월됩니다.`}
        confirmLabel="삭제하고 총액 모드로"
        destructive
        onConfirm={() => {
          setInputModeUserPreference(false);
          discardRows();
        }}
      />
    </ToneCard>
  );
}
