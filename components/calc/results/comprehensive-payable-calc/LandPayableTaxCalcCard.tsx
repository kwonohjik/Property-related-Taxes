"use client";

/**
 * LandPayableTaxCalcCard — 토지분 "납부할세액의 계산" 산출근거 카드 (교재 사례10·11).
 *
 * 종합합산·별도합산 공용 — ①~⑤ 5단계(세액공제 단계 없음). 주택분 카드 아래 배치·기본 접힘.
 * 단일 진실: 전 값 result echo(UI 재계산 금지). 재산세 구간은 getLandStandardRateBracket.
 * Design: comprehensive-land-payable-calc.ui.design.md
 */

import { useState } from "react";
import { Calculator } from "lucide-react";
import type {
  AggregateLandTaxResult,
  SeparateAggregateLandTaxResult,
} from "@/lib/tax-engine/types/comprehensive.types";
import type { LandKind } from "@/lib/tax-engine/comprehensive-land-parcels";
import { getLandStandardRateBracket } from "@/lib/tax-engine/comprehensive-land-parcels";
import { won, eok, pct, StepLine, Bullet, GaNaDaLine } from "./payable-calc-helpers";
import { CurrentJurisdictionBlock, LandPriorYearBreakdown } from "./land-payable-sections";
import { expandToggleClass, expandToggleLabel } from "../shared/ExpandToggleButton";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

type LandResult = AggregateLandTaxResult | SeparateAggregateLandTaxResult;

function officialSum(result: LandResult): number {
  return "totalOfficialValue" in result ? result.totalOfficialValue : result.totalPublicPrice;
}

export function LandPayableTaxCalcCard({
  kind,
  result,
  assessmentYear,
}: {
  kind: LandKind;
  result: LandResult;
  assessmentYear: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const yr = String(assessmentYear).slice(2);
  const pyr = String(assessmentYear - 1).slice(2);
  const title =
    kind === "aggregate"
      ? "종합합산토지분 종합부동산세 납부할 세액 산출 근거"
      : "별도합산토지분 종합부동산세 납부할 세액 산출 근거";
  const testPrefix = kind === "aggregate" ? "land-agg" : "land-sep";

  return (
    <div
      className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/30 dark:bg-sky-950/10"
      data-testid={`${testPrefix}-payable-calc`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-sky-800 dark:text-sky-200 print:hidden"
      >
        <span className="flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          {title}
        </span>
        <span className={expandToggleClass("sky")}>{expandToggleLabel(expanded)}</span>
      </button>

      <div className={expanded ? "block" : "hidden print:block"}>
        <div className="px-4 pb-4 pt-1 text-sm">
          <p className="mb-2 font-bold text-sky-900 dark:text-sky-100">[{title}]</p>

          {!result.isSubjectToTax ? (
            <p className="rounded-md bg-sky-100/60 border border-sky-200 px-3 py-2 text-sky-900 dark:bg-sky-900/20 dark:text-sky-100">
              공시가격이 기본공제({eok(result.basicDeduction)}) 이하 — 종합부동산세 납세의무가 없습니다.
            </p>
          ) : (
            <div className="space-y-1">
              <LandStep1 result={result} testPrefix={testPrefix} />
              <LandStep2 result={result} kind={kind} yr={yr} testPrefix={testPrefix} />
              <LandStep3 result={result} testPrefix={testPrefix} />
              <LandStep4 result={result} yr={yr} pyr={pyr} testPrefix={testPrefix} />
              <LandStep5 result={result} yr={yr} testPrefix={testPrefix} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ① 재산세공제전 종합부동산세액
function LandStep1({ result, testPrefix }: { result: LandResult; testPrefix: string }) {
  const official = officialSum(result);
  const perJ = result.perJurisdiction;
  const hasPd = result.progressiveDeduction > 0;
  return (
    <div>
      <StepLine badge="1" label="재산세공제전 종합부동산세액" amount={result.calculatedTax} strong testId={`${testPrefix}-payable-step1`} />
      <Bullet>
        공시가격 : {eok(official)}
        {perJ && perJ.length > 1 ? `(= ${perJ.map((j) => eok(j.officialValueSum)).join(" + ")})` : ""}
      </Bullet>
      <Bullet>
        종합부동산세 과세표준 : ({eok(official)} − {eok(result.basicDeduction)}) × {pct(result.fairMarketRatio)}
        (공정시장가액비율) = {eok(result.taxBase)}
      </Bullet>
      <Bullet>
        종합부동산세액 : {eok(result.taxBase)} × {pct(result.appliedRate)}
        {hasPd ? ` − ${won(result.progressiveDeduction)}` : ""} = {won(result.calculatedTax)}
      </Bullet>
    </div>
  );
}

// ② 공제할 재산세액
function LandStep2({ result, kind, yr, testPrefix }: { result: LandResult; kind: LandKind; yr: string; testPrefix: string }) {
  const c = result.propertyTaxCredit;
  const fmr = result.propertyFairMarketRatio ?? 0.7;
  const perJ = result.perJurisdiction;
  const topRate = getLandStandardRateBracket(kind, Number.MAX_SAFE_INTEGER).rate;
  const denomBase = Math.floor((officialSum(result) * Math.round(fmr * 100)) / 100);
  const denomBracket = getLandStandardRateBracket(kind, denomBase);
  return (
    <div>
      <StepLine badge="2" label="공제할 재산세액" amount={c.creditAmount} strong testId={`${testPrefix}-payable-step2`} />
      <StepLine
        badge="ⓐ"
        badgeShape="circle"
        label={`해당연도('${yr}년) 재산세액`}
        amount={c.propertyTaxAmount}
        indent={1}
        testId={`${testPrefix}-payable-step2-a`}
      />
      {perJ?.map((j) => (
        <CurrentJurisdictionBlock key={j.jurisdiction} j={j} />
      ))}
      <StepLine badge="ⓑ" badgeShape="circle" label="종합부동산세 과세표준에 대한 표준세율재산세액" amount={c.comprehensiveTaxBase} indent={1} />
      <Bullet indent={2}>
        {eok(result.taxBase)} × {pct(fmr)}(재산세 공정시장가액비율) × {pct(topRate)} = {won(c.comprehensiveTaxBase)}
      </Bullet>
      <StepLine badge="ⓒ" badgeShape="circle" label="총표준세율재산세액" amount={c.propertyTaxBase} indent={1} />
      <Bullet indent={2}>
        {eok(officialSum(result))} × {pct(fmr)}(재산세 공정시장가액비율) × {pct(topRate)}
        {denomBracket.deduction > 0 ? ` − ${won(denomBracket.deduction)}` : ""} = {won(c.propertyTaxBase)}
      </Bullet>
      <StepLine badge="ⓓ" badgeShape="circle" label="공제할 재산세액" formula="(ⓐ × ⓑ / ⓒ)" amount={c.creditAmount} indent={1} />
      <Bullet indent={2}>
        {won(c.propertyTaxAmount)} × <Frac top={won(c.comprehensiveTaxBase)} bottom={won(c.propertyTaxBase)} /> = {won(c.creditAmount)}
      </Bullet>
    </div>
  );
}

// ③ 세부담 상한전 종합부동산세액
function LandStep3({ result, testPrefix }: { result: LandResult; testPrefix: string }) {
  return (
    <div>
      <StepLine
        badge="3"
        label="세부담 상한전 종합부동산세액"
        formula="(① − ②)"
        amount={result.taxBeforeCap ?? Math.max(result.calculatedTax - result.propertyTaxCredit.creditAmount, 0)}
        strong
        testId={`${testPrefix}-payable-step3`}
      />
      <Bullet>
        {won(result.taxBeforeCap ?? 0)}(= {won(result.calculatedTax)} − {won(result.propertyTaxCredit.creditAmount)})
      </Bullet>
    </div>
  );
}

// ④ 세부담 상한 초과세액
function LandStep4({
  result,
  yr,
  pyr,
  testPrefix,
}: {
  result: LandResult;
  yr: string;
  pyr: string;
  testPrefix: string;
}) {
  const cap = result.taxCap;
  if (!cap) {
    return (
      <StepLine
        badge="4"
        label={
          <>
            세부담 상한 초과세액{" "}
            <span className="text-muted-foreground font-normal">: 직전연도 세액 미입력 — 계산 생략</span>
          </>
        }
        strong
        testId={`${testPrefix}-payable-step4`}
      />
    );
  }
  const cur = result.currentYearTotalEquivalent ?? 0;
  const excess = Math.max(0, cur - cap.capAmount);
  const pye = result.previousYearEquivalent;
  return (
    <div>
      <StepLine badge="4" label="세부담 상한 초과세액" formula="(가 − 다 ≥ 0)" amount={excess} strong testId={`${testPrefix}-payable-step4`} />
      <GaNaDaLine prefix="가" label={`해당연도('${yr}년) 총세액상당액`} formula="(= ②의ⓐ + ③)" amount={cur} testId={`${testPrefix}-payable-step4-ga`} />
      <Bullet indent={2}>
        {won(cur)} = {won(result.propertyTaxCredit.propertyTaxAmount)} + {won(result.taxBeforeCap ?? 0)}
      </Bullet>
      {pye ? (
        <>
          <GaNaDaLine prefix="나" label={`직전연도('${pyr}년) 총세액상당액`} formula="(① + ②)" amount={pye.total} testId={`${testPrefix}-payable-step4-na`} />
          <LandPriorYearBreakdown pye={pye} testPrefix={testPrefix} />
        </>
      ) : (
        <GaNaDaLine prefix="나" label={`직전연도('${pyr}년) 총세액상당액`} formula="(직접 입력)" amount={cap.previousYearTotalTax} testId={`${testPrefix}-payable-step4-na`} />
      )}
      <GaNaDaLine prefix="다" label={`해당연도('${yr}년) 세부담 상한액`} formula={`(나 × ${pct(cap.capRate)})`} amount={cap.capAmount} testId={`${testPrefix}-payable-step4-da`} />
      <p className="py-0.5 text-xs leading-relaxed text-muted-foreground" style={{ paddingLeft: `${2 * 14 + 18}px` }}>
        {`해당연도('${yr}년) 총세액상당액 ${won(cur)}(가)이 세부담 상한액 ${won(cap.capAmount)}(다)을 ${
          excess > 0 ? "초과하므로" : "초과하지 않으므로"
        } 세부담 상한 초과금액은 "${won(excess)}"입니다.`}
      </p>
    </div>
  );
}

// ⑤ 납부할세액
function LandStep5({ result, yr, testPrefix }: { result: LandResult; yr: string; testPrefix: string }) {
  const excess = result.taxCap
    ? Math.max(0, (result.currentYearTotalEquivalent ?? 0) - result.taxCap.capAmount)
    : 0;
  return (
    <div className="mt-1 border-t border-sky-200 dark:border-sky-800 pt-1">
      <StepLine
        badge="5"
        label={`해당연도('${yr}년) 종합부동산세 납부할세액`}
        formula="(③ − ④)"
        amount={result.determinedTax}
        strong
        testId={`${testPrefix}-payable-step5`}
      />
      <Bullet>
        {won(result.determinedTax)}(= {won(result.taxBeforeCap ?? 0)} − {won(excess)})
      </Bullet>
    </div>
  );
}
