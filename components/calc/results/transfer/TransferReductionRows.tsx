"use client";

/**
 * 양도세 결과뷰 — §99의3 신축주택·공익사업 수용(§77) 감면 상세 카드.
 * TransferTaxResultView → ReductionDetailCards에서 조건부 렌더.
 * 순수 표시 컴포넌트 — 계산 로직 없음, prop만 렌더 (계산과정 변수값 노출용).
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";

/** §99의3 신축주택 과세특례 상세 (적용/불가 양쪽) */
export function New993DetailCard({
  detail: d,
}: {
  detail: NonNullable<TransferTaxResult["new993Detail"]>;
}) {
  if (!d.isEligible) {
    return (
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
    );
  }
  return (
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
  );
}

/** §77 감면율 세트 배지 라벨 */
const RATE_SET_LABEL: Record<string, string> = {
  amended_2025: "2025 개정율 (현금 15% / 채권 20~45%)",
  current_2018: "현행 감면율 (2018)",
  legacy: "종전 감면율 (부칙 §53)",
};

/** 공익사업 수용 감면 상세 (조특법 §77) */
export function PublicExpropriationDetailCard({
  detail: d,
  calculatedTax,
  taxBase,
  aggregatedContext = false,
}: {
  detail: NonNullable<TransferTaxResult["publicExpropriationDetail"]>;
  /** 단건 컨텍스트에서만 사용 (⑤ 산식 분모·분자). 다건(집계)에선 생략. */
  calculatedTax?: number;
  taxBase?: number;
  /** 다건뷰: ⑤ 감면세액·capping을 숨기고 ①~④ 구성만 표시 (최종액은 §133 합산 재계산 카드가 담당). */
  aggregatedContext?: boolean;
}) {
  const bd = d.breakdown;
  return (
    <div className="mx-2 my-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="font-medium text-primary">공익사업 수용 감면 상세 (조특법 §77)</p>
        <LawArticleModal legalBasis="조세특례제한법 §77" label="§77" />
        <LawArticleModal legalBasis="조세특례제한법 §133" label="§133 종합한도" />
      </div>
      <p className="text-muted-foreground">적용 감면율: {RATE_SET_LABEL[d.rateSetApplied] ?? d.rateSetApplied}</p>
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
        <p className="text-muted-foreground">④ 자산별 감면금액 = (보상분 소득 − 기본공제) × 감면율</p>
        <p>
          현금 = ({formatKRW(bd.cashIncome)} − {formatKRW(bd.basicDeductionOnCash)}) × {(bd.cashRate * 100).toFixed(0)}%
          {" = "}{formatKRW(bd.cashReduction)}
        </p>
        <p>
          채권 = ({formatKRW(bd.bondIncome)} − {formatKRW(bd.basicDeductionOnBond)}) × {(bd.bondRate * 100).toFixed(0)}%
          {" = "}{formatKRW(bd.bondReduction)}
        </p>
        <p className="font-medium">
          감면대상소득금액 = 현금 {formatKRW(bd.cashReduction)} + 채권 {formatKRW(bd.bondReduction)}
          {" = "}{formatKRW(bd.reducibleIncome)}
        </p>
      </div>
      {aggregatedContext ? (
        <p className="text-muted-foreground border-t border-primary/20 pt-1.5">
          ⑤ 감면세액은 여러 건 합산 재계산(§133 한도) 후 확정 — 「감면세액 합산 재계산 내역」 참조
        </p>
      ) : (
        <>
          <div className="space-y-0.5 border-t border-primary/20 pt-1.5">
            <p className="text-muted-foreground">⑤ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준</p>
            <p className="font-medium">
              {formatKRW(calculatedTax ?? 0)} × {formatKRW(bd.reducibleIncome)} / {formatKRW(taxBase ?? 0)}
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
      {d.useLegacyRates && (
        <p className="text-amber-700">※ 조특법 부칙 §53 종전 감면율 적용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도)</p>
      )}
    </div>
  );
}
