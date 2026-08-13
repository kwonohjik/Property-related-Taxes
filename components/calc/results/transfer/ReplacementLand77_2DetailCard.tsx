"use client";

/**
 * 대토보상 과세특례 상세 카드 (조특법 §77의2 — 40% 세액감면 모드)
 *
 * ⑦ 결과 카드 — 감면세액 산출근거를 변수값으로 노출.
 * 적격: 대토비율 → 대토보상분 소득 → 감면대상소득(×40%) → 감면세액 산식.
 * 불적격: rose + 사유.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

export function ReplacementLand77_2DetailCard({
  detail: d,
  calculatedTax,
  taxBase,
  aggregatedContext = false,
}: {
  detail: NonNullable<TransferTaxResult["replacementLandDetail"]>;
  calculatedTax?: number;
  taxBase?: number;
  /** 다건뷰: ④ 감면세액·capping을 숨기고 ①~③ 구성만 표시. */
  aggregatedContext?: boolean;
}) {
  if (!d.isEligible) {
    return (
      <div className="mx-2 my-2 rounded-md border border-dashed border-rose-300 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-900 dark:text-rose-200 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-medium">대토보상 과세특례 (조특법 §77의2) — 적용 불가</p>
          <LawArticleModal legalBasis="조세특례제한법 §77의2" label="§77의2" />
        </div>
        {d.notEligibleReason && <p>{d.notEligibleReason}</p>}
      </div>
    );
  }
  return (
    <div className="mx-2 my-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="font-medium text-primary">대토보상 과세특례 상세 (조특법 §77의2 · 40% 세액감면)</p>
        <LawArticleModal legalBasis="조세특례제한법 §77의2" label="§77의2" />
        <LawArticleModal legalBasis="조세특례제한법 §133" label="§133 종합한도" />
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">① 대토보상 비율 = 대토보상 / (현금보상 + 대토보상)</p>
        <p>{(d.replacementRatio * 100).toFixed(2)}%</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">② 대토보상분 소득 (기본공제 배정 후)</p>
        <p>{formatKRW(d.replacementTaxableIncome)}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">③ 감면대상소득금액 = 대토보상분 소득 × {(d.reductionRate * 100).toFixed(0)}%</p>
        <p className="font-medium">
          {formatKRW(d.replacementTaxableIncome)} × {(d.reductionRate * 100).toFixed(0)}%
          {" = "}{formatKRW(d.reducibleIncome)}
        </p>
      </div>
      {aggregatedContext ? (
        <p className="text-muted-foreground border-t border-primary/20 pt-1.5">
          ④ 감면세액은 여러 건 합산 재계산(§133 한도) 후 확정 — 「감면세액 합산 재계산 내역」 참조
        </p>
      ) : (
        <>
          <div className="space-y-0.5 border-t border-primary/20 pt-1.5">
            <p className="text-muted-foreground">④ 감면세액 = 산출세액 × <Frac top="감면대상소득금액" bottom="과세표준" /></p>
            <p className="font-medium">
              {formatKRW(calculatedTax ?? 0)} × <Frac top={formatKRW(d.reducibleIncome)} bottom={formatKRW(taxBase ?? 0)} />
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
