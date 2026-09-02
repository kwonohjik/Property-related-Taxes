"use client";

/**
 * 양도세 결과뷰 — §99의3 신축주택·공익사업 수용(§77) 감면 상세 카드.
 * TransferTaxResultView → ReductionDetailCards에서 조건부 렌더.
 * 순수 표시 컴포넌트 — 계산 로직 없음, prop만 렌더 (계산과정 변수값 노출용).
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { ReductionDetailWarnings } from "@/components/calc/results/transfer/ReductionDetailWarnings";
import { ReductionStatutoryCapRow } from "@/components/calc/results/transfer/ReductionStatutoryCapRow";
import { RATED_REDUCIBLE_INCOME_LABEL } from "@/components/calc/results/transfer/reduction-eligible-income";
import { ELIGIBLE_INCOME_VS_FORM_NOTE } from "@/components/calc/results/transfer/reduction-eligible-income";

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
          <LawArticleModal legalBasis="조세특례제한법 시행령 §99의3" label="조특령 §99의3" />
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
        <LawArticleModal legalBasis="조세특례제한법 시행령 §99의3" label="조특령 §99의3" />
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
  excludedByOverlap = false,
  appliedReductionAmount,
}: {
  detail: NonNullable<TransferTaxResult["publicExpropriationDetail"]>;
  /** 단건 컨텍스트에서만 사용 (⑤ 산식 분모·분자). 다건(집계)에선 생략. */
  calculatedTax?: number;
  taxBase?: number;
  /**
   * 조특법 §127⑦로 **배제된 후보**인가 — 승자가 아니면 감면세액 단정을 감춘다(#045).
   * 배제 사실 자체는 `ReductionOverlapExclusionBanner`가 카드 위에 적는다.
   */
  excludedByOverlap?: boolean;
  /**
   * §133 연간·5년 누적 한도 반영 후 **최종 적용 감면세액**.
   * detail의 `reductionAmount`(연간 한도까지만)보다 작으면 그 차이를 카드가 밝힌다(#046).
   */
  appliedReductionAmount?: number;
  /** 다건뷰: ⑤ 감면세액·capping을 숨기고 ①~④ 구성만 표시 (최종액은 §133 합산 재계산 카드가 담당). */
  aggregatedContext?: boolean;
}) {
  // 적용 불가 — 사유를 표시한다(§77의2·§77의3 카드와 동일 규약).
  // 종전에는 `ReductionDetailCards`가 `?.isEligible` 게이트로 카드를 통째로 숨겨,
  // 감면을 입력했는데도 **왜 적용되지 않았는지 알 수 없었다**.
  if (!d.isEligible) {
    return (
      <div className="mx-2 my-2 rounded-md border border-dashed border-rose-300 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-900 dark:text-rose-200 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-medium">공익사업 수용 감면 (조특법 §77) — 적용 불가</p>
          <LawArticleModal legalBasis="조세특례제한법 §77" label="§77" />
        </div>
        {d.notEligibleReason && <p>{d.notEligibleReason}</p>}
      </div>
    );
  }
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
          {RATED_REDUCIBLE_INCOME_LABEL} = 현금 {formatKRW(bd.cashReduction)} + 채권 {formatKRW(bd.bondReduction)}
          {" = "}{formatKRW(bd.reducibleIncome)}
        </p>
        <p className="text-muted-foreground">{ELIGIBLE_INCOME_VS_FORM_NOTE}</p>
      </div>
      {excludedByOverlap ? (
        <p className="text-muted-foreground border-t border-primary/20 pt-1.5">
          ⑤ 감면세액 — 조특법 §127⑦ 중복배제로 <b>적용되지 않았습니다</b>
        </p>
      ) : aggregatedContext ? (
        <p className="text-muted-foreground border-t border-primary/20 pt-1.5">
          ⑤ 감면세액은 여러 건 합산 재계산(§133 한도) 후 확정 — 「감면세액 합산 재계산 내역」 참조
        </p>
      ) : (
        <>
          <div className="space-y-0.5 border-t border-primary/20 pt-1.5">
            <p className="text-muted-foreground">⑤ 감면세액 = 산출세액 × <Frac top={RATED_REDUCIBLE_INCOME_LABEL} bottom="과세표준" /></p>
            <p className="font-medium">
              {formatKRW(calculatedTax ?? 0)} × <Frac top={formatKRW(bd.reducibleIncome)} bottom={formatKRW(taxBase ?? 0)} />
              {" = "}{formatKRW(d.rawReductionAmount)}
            </p>
          </div>
          {d.cappedByAnnualLimit && (
            <div className="space-y-0.5">
              <p className="text-red-600">※ 연간 한도 {formatKRW(d.appliedAnnualLimit)} 초과 → 한도 적용</p>
              <p className="font-medium">→ 적용 감면세액 (한도 후) = {formatKRW(d.reductionAmount)}</p>
            </div>
          )}
          <ReductionStatutoryCapRow
            detailAmount={d.reductionAmount}
            appliedAmount={appliedReductionAmount}
          />
        </>
      )}
      {d.useLegacyRates && (
        <p className="text-amber-700">※ 조특법 부칙 §53 종전 감면율 적용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도)</p>
      )}
      {/* 엔진이 채우는 나머지 경고 — 렌더러가 0개였다(결과탭 코드리뷰 #057).
          위 두 줄이 이미 말한 사실(연간 한도·종전 감면율)은 leaf가 걸러낸다. */}
      <ReductionDetailWarnings detail={d} />
    </div>
  );
}
