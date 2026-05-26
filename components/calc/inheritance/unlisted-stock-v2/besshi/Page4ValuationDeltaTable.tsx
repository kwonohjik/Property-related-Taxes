"use client";

/**
 * Page4ValuationDeltaTable — 별지 부표3 제4쪽 5.평가차액 (공식 2025.07.10 양식)
 *
 * 공식 레이아웃: 좌우 2블록 [자산금액 4열 | 부채금액 4열] + 헤더 바 + 작성방법 푸터.
 *   가. 평가차액 = ① 자산 차액 합 − ② 부채 차액 합 → 제2쪽 4. 순자산가액 「가」의 ② 기재.
 *
 * ★ 「①·②·가」는 엔진 `resolveEvaluationDelta` 단일 도출 (raw.assetValuationDelta 직접 사용 금지 — 행 모드 미동기화로 stale).
 * ★ 항상 표시 (raw만 필요, null 가드 없음) — PDF Page4ValuationDelta와 동일.
 *
 * 법령: 상증령 §55② + 상증규 §17의2
 * 라벨·헤더·작성방법은 `besshi-form-constants.ts` 단일 출처 (PDF와 공유).
 */

import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, renderDelta, SectionTitle } from "./BesshiSharedAtoms";
import { BESSHI_P4_SECTION5 } from "./besshi-form-constants";
import { resolveEvaluationDelta } from "@/lib/tax-engine/property-valuation/evaluation-delta";

export interface Page4ValuationDeltaTableProps {
  raw: UnlistedNetAssetCalculation;
}

const TD = "border border-black p-1";
const TD_AMT = `${TD} text-right font-mono`;
const TD_DIV = `${TD} border-l-2`; // 자산/부채 블록 구분선

export function Page4ValuationDeltaTable({ raw }: Page4ValuationDeltaTableProps) {
  const C5 = BESSHI_P4_SECTION5;
  const allRows = raw.evaluationDeltaRows ?? [];
  const resolved = resolveEvaluationDelta({
    assetDeltaRows: allRows.filter((r) => r.category === "asset"),
    liabilityDeltaRows: allRows.filter((r) => r.category === "liability"),
    assetEvaluationDeltaTotal: raw.assetValuationDelta,
  });
  const assetRows = resolved.assetRows;
  const liabilityRows = resolved.liabilityRows;
  const isTotalMode = resolved.source === "total";

  const assetEvalSum = assetRows.reduce((s, r) => s + r.evaluationAmount, 0);
  const assetBookSum = assetRows.reduce((s, r) => s + r.bookAmount, 0);
  const liabEvalSum = liabilityRows.reduce((s, r) => s + r.evaluationAmount, 0);
  const liabBookSum = liabilityRows.reduce((s, r) => s + r.bookAmount, 0);

  const bodyCount = Math.max(assetRows.length, liabilityRows.length);
  const renderCount = bodyCount > 0 ? bodyCount : C5.emptyTemplateRows;

  return (
    <section aria-label="제4쪽 평가차액">
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <span>{C5.unitNote}</span>
        <span>{C5.pageNote}</span>
      </div>
      <SectionTitle>{C5.header}</SectionTitle>

      {/* 헤더 바 */}
      <div className="flex border border-black text-[10px] font-semibold">
        <div className="flex-1 p-1 border-r border-black">{C5.calcTitle}</div>
        <div className="flex-1 p-1 text-right text-[9px] font-normal text-gray-600">{C5.crossRef}</div>
      </div>

      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <tbody>
          {/* 블록 헤더 */}
          <tr className="bg-gray-100 print:bg-gray-100 font-bold text-center">
            <td colSpan={4} className={TD}>{C5.assetBlock}</td>
            <td colSpan={4} className={TD_DIV}>{C5.liabilityBlock}</td>
          </tr>
          {/* 컬럼 헤더 */}
          <tr className="bg-gray-50 print:bg-gray-50 text-[9px]">
            {C5.columns.map((c, i) => (
              <td key={`a-${i}`} className={`${TD} ${i > 0 ? "text-right" : ""}`}>{c}</td>
            ))}
            {C5.columns.map((c, i) => (
              <td key={`l-${i}`} className={`${i === 0 ? TD_DIV : TD} ${i > 0 ? "text-right" : ""}`}>{c}</td>
            ))}
          </tr>
          {/* ① / ② 합계 (맨 위) */}
          <tr className="bg-yellow-50 print:bg-yellow-50 font-bold">
            <td className={TD} data-besshi-cell="p4-①" data-testid="p4-①">{C5.assetTotalLabel}</td>
            <td className={TD_AMT}>{fmt(assetEvalSum)}</td>
            <td className={TD_AMT}>{fmt(assetBookSum)}</td>
            <td className={TD_AMT}>{renderDelta(resolved.assetDelta)}</td>
            <td className={`${TD_DIV} text-left`} data-besshi-cell="p4-②" data-testid="p4-②">{C5.liabilityTotalLabel}</td>
            <td className={TD_AMT}>{fmt(liabEvalSum)}</td>
            <td className={TD_AMT}>{fmt(liabBookSum)}</td>
            <td className={TD_AMT}>{renderDelta(resolved.liabilityDelta)}</td>
          </tr>
          {/* 데이터 행 (좌우 병치 / 데이터 없으면 빈 양식 N행) */}
          {Array.from({ length: renderCount }).map((_, i) => {
            const a = assetRows[i];
            const l = liabilityRows[i];
            return (
              <tr key={i}>
                <td className={TD}>{a?.accountName ?? ""}</td>
                <td className={TD_AMT}>{a ? fmt(a.evaluationAmount) : ""}</td>
                <td className={TD_AMT}>{a ? fmt(a.bookAmount) : ""}</td>
                <td className={TD_AMT}>{a ? renderDelta(a.delta) : ""}</td>
                <td className={TD_DIV}>{l?.accountName ?? ""}</td>
                <td className={TD_AMT}>{l ? fmt(l.evaluationAmount) : ""}</td>
                <td className={TD_AMT}>{l ? fmt(l.bookAmount) : ""}</td>
                <td className={TD_AMT}>{l ? renderDelta(l.delta) : ""}</td>
              </tr>
            );
          })}
          {/* 가. 평가차액 */}
          <tr className="bg-emerald-50 print:bg-emerald-50 font-bold border-t-2 border-black" data-besshi-cell="p4-가" data-testid="p4-가">
            <td colSpan={7} className={TD}>{C5.deltaLabel}</td>
            <td className={TD_AMT}>{renderDelta(resolved.evaluationDelta)}</td>
          </tr>
        </tbody>
      </table>

      {isTotalMode && resolved.evaluationDelta !== 0 && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-3">
          {C5.totalModeNote}
        </p>
      )}

      {/* 작성방법 */}
      <div className="bg-gray-100 print:bg-gray-100 text-center text-[10px] font-bold py-1 border border-black">
        {C5.guideTitle}
      </div>
      <p className="text-[9px] leading-relaxed px-1 py-1">{C5.guideBody}</p>
      <ol className="text-[9px] leading-relaxed px-1 list-none space-y-0.5">
        {C5.guideItems.map((item, i) => (
          <li key={i}>{`${i + 1}. ${item}`}</li>
        ))}
      </ol>
    </section>
  );
}
