"use client";

/**
 * 양도세 결과뷰 — §99의3 신축주택·공익사업 수용 감면 상세 행 (결과 테이블 tr).
 * TransferTaxResultView에서 추출 (800줄 정책 준수, 2026-06-15).
 * 순수 표시 컴포넌트 — 계산 로직 없음, prop만 렌더.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";

/** §99의3 신축주택 과세특례 상세 (적용/불가 양쪽) */
export function New993ReductionRow({
  detail: d,
}: {
  detail: NonNullable<TransferTaxResult["new993Detail"]>;
}) {
  if (!d.isEligible) {
    return (
      <tr><td colSpan={2} className="p-0">
      <div className="mx-2 my-2 rounded-md border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1">
        <p className="font-medium">조특법 §99의3 신축주택 과세특례 — 적용 불가</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="조세특례제한법 §99의3" label="§99의3 신축주택" />
          <LawArticleModal legalBasis="조세특례제한법 시행령 §99" label="조특령 §99" />
        </div>
        <ul className="list-disc list-inside space-y-0.5">
          {d.ineligibleReasons.map((r, i) => (
            <li key={i}>{r.message}</li>
          ))}
        </ul>
      </div>
      </td></tr>
    );
  }
  return (
    <tr><td colSpan={2} className="p-0">
    <div className="mx-2 my-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1.5">
      <p className="font-medium text-primary">조특법 §99의3 신축주택 과세특례 (양도소득금액 차감 방식)</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §99의3" label="§99의3 신축주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §99" label="조특령 §99" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>
      <p className="text-muted-foreground">
        {d.isWithin5Years
          ? "5년 이내 양도 — 양도소득금액 전액 차감"
          : `5년 후 양도 — 5년 안분 산식 (부호 케이스: ${d.signCase})`}
      </p>
      <div className="space-y-0.5">
        {d.formulaSteps.map((s, i) => (
          <p key={i}>
            <span className="text-muted-foreground">{s.label}: </span>
            {s.formula ?? formatKRW(typeof s.value === "number" ? s.value : 0)}
          </p>
        ))}
      </div>
      <div className="border-t border-primary/20 pt-1.5 space-y-0.5">
        <p>감면 양도소득금액 = {formatKRW(d.reducibleTransferIncome)}</p>
        <p>양도세 감면세액 = {formatKRW(d.taxReductionForRuralSurtax)}</p>
        <p className="font-medium">농어촌특별세 (20%) = {formatKRW(d.ruralSurtax)}</p>
      </div>
    </div>
    </td></tr>
  );
}

/** 공익사업 수용 감면 상세 (조특법 §77) */
export function PublicExpropriationReductionRow({
  detail: d,
  calculatedTax,
  taxBase,
}: {
  detail: NonNullable<TransferTaxResult["publicExpropriationDetail"]>;
  calculatedTax: number;
  taxBase: number;
}) {
  const bd = d.breakdown;
  return (
    <tr><td colSpan={2} className="p-0">
    <div className="mx-2 my-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1.5">
      <p className="font-medium text-primary">공익사업 수용 감면 상세 (조특법 §77)</p>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">① 보상 구성</p>
        <p>현금보상 {formatKRW(bd.cashAmount)} · 채권보상 {formatKRW(bd.bondAmount)}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">② 양도소득금액 안분 (보상액 비율)</p>
        <p>현금분 소득 {formatKRW(bd.cashIncome)} · 채권분 소득 {formatKRW(bd.bondIncome)}</p>
      </div>
      {(bd.basicDeductionOnCash > 0 || bd.basicDeductionOnBond > 0) && (
        <div className="space-y-0.5">
          <p className="text-muted-foreground">③ 기본공제 배정 (§103② — 감면율 낮은 자산 우선)</p>
          <p>
            {bd.basicDeductionOnCash > 0 && <>현금분 −{formatKRW(bd.basicDeductionOnCash)}</>}
            {bd.basicDeductionOnCash > 0 && bd.basicDeductionOnBond > 0 && " · "}
            {bd.basicDeductionOnBond > 0 && <>채권분 −{formatKRW(bd.basicDeductionOnBond)}</>}
          </p>
        </div>
      )}
      <div className="space-y-0.5">
        <p className="text-muted-foreground">④ 자산별 감면금액</p>
        <p>
          현금 {formatKRW(bd.cashReduction)} ({(bd.cashRate * 100).toFixed(0)}%)
          {" · "}채권 {formatKRW(bd.bondReduction)} ({(bd.bondRate * 100).toFixed(0)}%)
        </p>
        <p>감면대상소득금액 = {formatKRW(bd.reducibleIncome)}</p>
      </div>
      <div className="space-y-0.5 border-t border-primary/20 pt-1.5">
        <p className="text-muted-foreground">⑤ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준</p>
        <p className="font-medium">
          {formatKRW(calculatedTax)} × {formatKRW(bd.reducibleIncome)} / {formatKRW(taxBase)}
          {" = "}{formatKRW(d.rawReductionAmount)}
        </p>
      </div>
      {d.cappedByAnnualLimit && (
        <p className="text-red-600">※ 연간 한도 {formatKRW(d.appliedAnnualLimit)} 초과 → capping</p>
      )}
      {d.useLegacyRates && (
        <p className="text-amber-700">※ 조특법 부칙 §53 종전 감면율 적용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도)</p>
      )}
    </div>
    </td></tr>
  );
}
