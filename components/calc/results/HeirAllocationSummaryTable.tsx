/**
 * 상속인별 상속세부담액 집계 표 (이미지 8) — 결과 화면 컴포넌트
 *
 * UI Design: docs/02-design/features/heir-allocation-summary-table.ui.design.md
 * 화면 33행 × N열(상속인) — buildSummaryTable 헬퍼로 엔진 echo 변환.
 */

"use client";

import { useMemo } from "react";
import type {
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  buildSummaryTable,
  fmt,
  labelOf,
} from "@/lib/calc/heir-allocation-summary";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface Props {
  result: InheritanceTaxResult;
  heirs: Heir[];
  sectionNum?: number;
}

export function HeirAllocationSummaryTable({
  result,
  heirs,
  sectionNum,
}: Props) {
  const data = useMemo(
    () => buildSummaryTable(result, heirs),
    [result, heirs],
  );

  if (!result.heirAllocationResult || heirs.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="heir-allocation-summary-title"
      className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/60 print:border-violet-300 print:bg-white"
    >
      <h3
        id="heir-allocation-summary-title"
        className="mb-3 text-base font-semibold text-violet-900 dark:text-violet-100 flex items-center gap-2"
      >
        {sectionNum !== undefined && (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 dark:bg-violet-700 dark:text-violet-100 select-none">
            {sectionNum}
          </span>
        )}
        상속인별 상속세부담액 집계
      </h3>

      {data.usedLegalShareFallback && (
        <div className="mb-3 rounded-md bg-violet-100/70 dark:bg-violet-900/40 px-3 py-2 text-xs text-violet-800 dark:text-violet-200">
          ⓘ 협의분할 미입력 자산·채무·추정상속은 법정상속분
          <LawArticleModal
            legalBasis="민법 §1009"
            label="§1009"
            className="mx-1"
          />
          자동 안분 적용. 영리법인·수유자(자연인)는 안분 대상에서 제외됩니다.
        </div>
      )}

      {/* 2-B: 사전증여 수증자 미지정 안내 배지
       * ② 행 total > 0 이면서 인별 셀이 모두 0(null)인 경우 — doneeId 미지정 상태.
       * 자동 안분 fallback 금지 정책에 따라 사용자에게 명시 입력 유도.
       */}
      {(() => {
        const priorGiftRow = data.rows.find((r) => r.rowId === "row-2-priorGift");
        const hasPriorGiftTotal =
          priorGiftRow != null && (priorGiftRow.total ?? 0) > 0;
        const allPerHeirZero =
          hasPriorGiftTotal &&
          data.heirOrder.every(
            (id) =>
              !priorGiftRow!.perHeir[id] || priorGiftRow!.perHeir[id] === 0,
          );
        if (!allPerHeirZero) return null;
        return (
          <div
            className="mb-3 rounded-md bg-sky-100/70 dark:bg-sky-900/40 px-3 py-2 text-xs text-sky-800 dark:text-sky-200"
            data-testid="prior-gift-donee-missing-badge"
          >
            ⓘ 사전증여 합계·증여세액공제(§28)는 <strong>과세가액·세액공제 합계에 이미 반영</strong>되었으나,
            수증자(상속인)가 지정되지 않아 ②·⑩·⑫ <strong>인별 배부만 생략</strong>되었습니다.
            사전증여 입력에서 수증자를 선택하면 인별 배부가 표시됩니다.
          </div>
        );
      })()}

      {/* T3(a): 자산 단위 정합 가드 — 협의분할 합 ≠ 엔진 평가액 (검증 우회 경로 방어).
       * 정상 흐름은 validate가 선차단하므로 미발생. echo allocationMismatch 노출. */}
      {(() => {
        const mm = result.heirAllocationResult?.allocationMismatch ?? [];
        if (mm.length === 0) return null;
        return (
          <div
            className="mb-3 rounded-md bg-rose-100/70 dark:bg-rose-900/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200"
            data-testid="allocation-mismatch-badge"
          >
            ⚠️ 협의분할 합계가 자산 평가액과 일치하지 않습니다 — 입력 재확인 필요:
            <ul className="mt-1 list-disc pl-4">
              {mm.map((m) => (
                <li key={m.assetId}>
                  자산 {m.assetId}: 인별 합 {m.actual.toLocaleString()} ≠ 평가액{" "}
                  {m.expected.toLocaleString()} (차이 {m.delta.toLocaleString()})
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      <HorizontalScrollContainer>
        <table
          role="table"
          data-testid="heir-allocation-summary-table"
          className="min-w-full border-collapse text-right text-xs tabular-nums"
        >
          <thead>
            <tr className="bg-violet-100 dark:bg-violet-900/60">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-violet-100 dark:bg-violet-900/60 px-3 py-2 text-left text-violet-900 dark:text-violet-100 font-semibold"
              >
                구분
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-violet-900 dark:text-violet-100 font-semibold"
              >
                합계
              </th>
              {data.heirOrder.map((id) => (
                <th
                  key={id}
                  scope="col"
                  className="px-3 py-2 text-violet-900 dark:text-violet-100 font-semibold whitespace-nowrap"
                >
                  {labelOf(id, heirs)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.rowId}
                data-testid={`heir-summary-row-${row.rowId}`}
                className={[
                  "border-b border-violet-200/60 dark:border-violet-800/60",
                  row.isGroupHeader
                    ? "bg-violet-100/60 dark:bg-violet-900/40 font-semibold text-violet-900 dark:text-violet-100"
                    : "",
                  row.isHeaderGroup
                    ? "bg-violet-100/40 dark:bg-violet-900/30 font-semibold"
                    : "",
                  row.isBoldFinal
                    ? "bg-violet-200/50 dark:bg-violet-800/50 font-bold text-violet-950 dark:text-violet-50"
                    : "",
                ].join(" ")}
              >
                <th
                  scope="row"
                  className={[
                    "sticky left-0 bg-violet-50 dark:bg-violet-950/60 px-3 py-1.5 text-left text-violet-900 dark:text-violet-100 whitespace-nowrap",
                    row.isGroupChild ? "pl-7" : "",
                  ].join(" ")}
                >
                  {row.rowNo && (
                    <span className="mr-1 font-semibold text-violet-700 dark:text-violet-300">
                      {row.rowNo}
                    </span>
                  )}
                  {row.label}
                </th>
                <td
                  className="px-3 py-1.5 tabular-nums"
                  data-testid={`heir-summary-cell-total-${row.rowId}`}
                >
                  {row.rowId === "row-s5-burdenRatio"
                    ? row.total != null
                      ? row.total.toFixed(4)
                      : ""
                    : fmt(row.total)}
                </td>
                {data.heirOrder.map((id) => (
                  <td
                    key={id}
                    className="px-3 py-1.5 tabular-nums"
                    data-testid={`heir-summary-cell-${id}-${row.rowId}`}
                  >
                    {row.rowId === "row-s5-burdenRatio"
                      ? row.perHeir[id] != null
                        ? (row.perHeir[id] as number).toFixed(4)
                        : ""
                      : fmt(row.perHeir[id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </HorizontalScrollContainer>

      <p className="mt-3 text-[10px] text-violet-700 dark:text-violet-300">
        산출 근거:
        <LawArticleModal
          legalBasis="상증법 §3의2②"
          label="§3의2②"
          className="ml-1"
        />
        <LawArticleModal
          legalBasis="상증법 §27"
          label="§27"
          className="ml-1"
        />
        <LawArticleModal
          legalBasis="상증법 §28"
          label="§28"
          className="ml-1"
        />
        ·집행기준 19-17-1
        <span className="ml-2 opacity-70">
          (간접배부 산식: 지정값 × (상속인별 과세가액상당액 − 사전증여가액) ÷
          배부대상 과세가액, 원 미만 절사)
        </span>
      </p>
    </section>
  );
}
