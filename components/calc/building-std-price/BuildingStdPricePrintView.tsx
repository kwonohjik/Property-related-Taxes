"use client";

/**
 * 건물 기준시가 인쇄·PDF 전용 뷰 — 화면에서는 숨김(hidden), 인쇄 시에만 표시(print:block).
 * 시점별(취득·양도·평가) + 복합건물 부분별로 「기준시가의 계산」 서식 테이블을 각각 출력.
 * 흑백·흰 배경 강제(다크모드 무관). window.print()로 PDF 저장/인쇄.
 */
import type { BuildingStandardPriceResult } from "@/lib/tax-engine/building-standard-price";
import { BuildingStdPricePrintTable } from "./BuildingStdPricePrintTable";

export function BuildingStdPricePrintView({
  result,
  floorArea,
}: {
  result: BuildingStandardPriceResult;
  floorArea: number;
}) {
  const { valuation, acquisition, transfer, compositeBreakdowns, sameYearAdjusted } = result;

  return (
    <div className="hidden bg-white text-black print:block">
      <h2 className="mb-4 text-base font-bold">건물 기준시가 계산서</h2>

      {valuation && <BuildingStdPricePrintTable title="기준시가의 계산" bd={valuation} floorArea={floorArea} />}
      {acquisition && (
        <BuildingStdPricePrintTable title="취득당시 기준시가의 계산" bd={acquisition} floorArea={floorArea} />
      )}
      {transfer && (
        <BuildingStdPricePrintTable
          title={`양도당시 기준시가의 계산${sameYearAdjusted ? " (§164⑧ 동일연도 환산)" : ""}`}
          bd={transfer}
          floorArea={floorArea}
        />
      )}

      {compositeBreakdowns?.map((bd, i) => (
        <BuildingStdPricePrintTable
          key={i}
          title={`${bd.label ?? `부분 ${i + 1}`} 기준시가의 계산`}
          bd={bd}
          floorArea={bd.floorArea ?? floorArea}
        />
      ))}
      {compositeBreakdowns && compositeBreakdowns.length > 0 && result.compositeTotal !== undefined && (
        <p className="mt-2 text-[13px] font-bold">
          건물 기준시가 합계: {result.compositeTotal.toLocaleString("ko-KR")}원
        </p>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-neutral-500">{result.legalBasis}</p>
    </div>
  );
}
