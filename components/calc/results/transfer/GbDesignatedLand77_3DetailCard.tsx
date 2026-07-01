"use client";

/**
 * 개발제한구역 매수대상 토지 감면 상세 카드 (조특법 §77의3 — 40%/25% 세액감면)
 *
 * ⑦ 결과 카드 — 감면세액 산출근거를 변수값으로 노출.
 * 적격: 적용 호·감면율 → 감면대상소득 → 감면세액 산식.
 * 불적격: rose + 사유.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function GbDesignatedLand77_3DetailCard({
  detail: d,
  calculatedTax,
  taxBase,
  aggregatedContext = false,
}: {
  detail: NonNullable<TransferTaxResult["gbDesignatedLandDetail"]>;
  calculatedTax?: number;
  taxBase?: number;
  /** 다건뷰: ③ 감면세액·capping을 숨기고 ①~② 구성만 표시. */
  aggregatedContext?: boolean;
}) {
  if (!d.isEligible) {
    return (
      <div className="mx-2 my-2 rounded-md border border-dashed border-rose-300 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-900 dark:text-rose-200 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-medium">개발제한구역 매수대상 토지 감면 (조특법 §77의3) — 적용 불가</p>
          <LawArticleModal legalBasis="조세특례제한법 §77의3" label="§77의3" />
        </div>
        {d.notEligibleReason && <p>{d.notEligibleReason}</p>}
      </div>
    );
  }
  return (
    <div className="mx-2 my-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="font-medium text-primary">개발제한구역 매수대상 토지 감면 상세 (조특법 §77의3)</p>
        <LawArticleModal legalBasis="조세특례제한법 §77의3" label="§77의3" />
        <LawArticleModal legalBasis="조세특례제한법 §133" label="§133 종합한도" />
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">
          ① 적용 감면율{d.appliedClause ? ` (§77의3① ${d.appliedClause})` : ""}
        </p>
        <p>{(d.reductionRate * 100).toFixed(0)}%</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">② 감면대상소득금액 = (양도소득금액 − 기본공제) × 감면율</p>
        {(() => {
          // base = 양도소득금액 − 기본공제. 엔진 echo(taxableIncome) 우선, 없으면 단건 taxBase(= 과세표준) fallback.
          const base = d.taxableIncome ?? taxBase;
          return base !== undefined ? (
            <p className="font-medium">
              {formatKRW(base)} × {(d.reductionRate * 100).toFixed(0)}%
              {" = "}{formatKRW(d.reducibleIncome)}
            </p>
          ) : (
            <p className="font-medium">{formatKRW(d.reducibleIncome)}</p>
          );
        })()}
      </div>
      {aggregatedContext ? (
        <p className="text-muted-foreground border-t border-primary/20 pt-1.5">
          ③ 감면세액은 여러 건 합산 재계산(§133 한도) 후 확정 — 「감면세액 합산 재계산 내역」 참조
        </p>
      ) : (
        <>
          <div className="space-y-0.5 border-t border-primary/20 pt-1.5">
            <p className="text-muted-foreground">③ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준</p>
            <p className="font-medium">
              {formatKRW(calculatedTax ?? 0)} × {formatKRW(d.reducibleIncome)} / {formatKRW(taxBase ?? 0)}
              {" = "}{formatKRW(d.rawReductionAmount)}
            </p>
          </div>
          {d.cappedByAnnualLimit && (
            <div className="space-y-0.5">
              <p className="text-red-600">※ 연간 한도 {formatKRW(d.appliedAnnualLimit)} 초과 → 한도 적용</p>
              <p className="font-medium">→ 적용 감면세액 (한도 후) = {formatKRW(d.reductionAmount)}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
