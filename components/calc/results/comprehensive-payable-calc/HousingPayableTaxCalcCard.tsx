"use client";

/**
 * HousingPayableTaxCalcCard — "주택분 종합부동산세 납부할세액의 계산" 산출근거 카드.
 *
 * 국세청 「종합부동산세 계산 사례」 사례12 p.186~187 narrative(①~⑥) 형식 재현.
 * 결과 탭 "신고서 서식" 바로 아래 배치 · 기본 접힘(신고서 서식과 동일 패턴).
 *
 * 단일 진실: 전 값 result echo 직접 사용(UI 재계산 금지 — [[ui_engine_dual_truth_avoidance]]).
 *   재산세 표준세율 구간(세율·누진공제)은 getHousingStandardRateBracket(엔진 single-source).
 * Design: docs/01-plan/features/comprehensive-housing-payable-tax-calc-card.plan.md §2·§3
 */

import { useState } from "react";
import { Calculator } from "lucide-react";
import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { getHousingStandardRateBracket } from "@/lib/tax-engine/property-tax";
import { won, eok, pct, StepLine, Bullet, GaNaDaLine } from "./payable-calc-helpers";
import { expandToggleClass, expandToggleLabel } from "../shared/ExpandToggleButton";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";

export function HousingPayableTaxCalcCard({
  result,
  properties,
}: {
  result: ComprehensiveTaxResult;
  properties?: PropertyEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  const yr = result.assessmentDate.slice(0, 4);
  const pyr = String(Number(yr) - 1);
  const isCorporateSpecial = result.taxpayerType === "corporate_special";

  return (
    <div
      className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10"
      data-testid="housing-payable-calc"
    >
      {/* 헤더 — 화면 펼침 토글(인쇄 시 항상 표시) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200 print:hidden"
      >
        <span className="flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          종합부동산세 납부할 세액 산출 근거
        </span>
        <span className={expandToggleClass("emerald")}>{expandToggleLabel(expanded)}</span>
      </button>

      {/* 본문 — CSS-only 인쇄 노출 */}
      <div className={expanded ? "block" : "hidden print:block"}>
        <div className="px-4 pb-4 pt-1 text-sm">
          <p className="mb-2 font-bold text-emerald-900 dark:text-emerald-100">
            [종합부동산세 납부할 세액 산출 근거]
          </p>

          {!result.isSubjectToHousingTax ? (
            <p className="rounded-md bg-emerald-100/60 border border-emerald-200 px-3 py-2 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100">
              종합부동산세 과세표준이 기본공제 이하 — 주택분 종합부동산세 납세의무가 없습니다.
            </p>
          ) : (
            <div className="space-y-1">
              <Step1 result={result} properties={properties} />
              <Step2 result={result} yr={yr} properties={properties} />
              <Step3 result={result} isCorporateSpecial={isCorporateSpecial} />
              <Step4 result={result} />
              <Step5 result={result} yr={yr} pyr={pyr} isCorporateSpecial={isCorporateSpecial} />
              <Step6 result={result} yr={yr} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ① 재산세공제전 종합부동산세액
// ════════════════════════════════════════════════════════════
function Step1({
  result,
  properties,
}: {
  result: ComprehensiveTaxResult;
  properties?: PropertyEntry[];
}) {
  const hasPd = result.progressiveDeduction > 0;
  // 지분율 — form 값 직접 사용 (result echo로는 역산 불가 — engine.design §2)
  // 단일 주택 기준: 첫 번째 주택의 지분율 사용
  const ownershipRatioStr = properties?.[0]?.ownershipRatio ?? "100";
  const ownershipRatioNum = parseFloat(ownershipRatioStr);
  const hasOwnershipRatio =
    !isNaN(ownershipRatioNum) && ownershipRatioNum < 100 && ownershipRatioNum >= 0;

  // 감면율이 적용된 경우: effectiveIncludedAssessedValue < includedAssessedValue
  const hasReduction =
    result.effectiveIncludedAssessedValue != null &&
    result.effectiveIncludedAssessedValue < result.includedAssessedValue;
  // 사례6: 건물·부속토지 시가표준액 안분 (form 직접 — result echo 역산 불가)
  const apProp = properties?.[0];
  const apLand = parseAmount(apProp?.landStdValue ?? "");
  const apBldg = parseAmount(apProp?.buildingStdValue ?? "");
  const apTotal = apLand + apBldg;
  const apOwnLand = (apProp?.appurtenantOwnedPart ?? "land") === "land";
  const apNum = apOwnLand ? apLand : apBldg;
  const hasAppurtenant = !!apProp?.appurtenantSplitEnabled && apTotal > 0 && apNum > 0;
  const apPct = hasAppurtenant ? ((apNum / apTotal) * 100).toFixed(2) : "0";
  return (
    <div>
      <StepLine
        badge="1"
        label="재산세공제전 종합부동산세액"
        amount={result.calculatedTax}
        strong
        testId="payable-step1"
      />
      {/* 지분율 적용 시 — 지분 → 감면 순으로 독립 2줄
          includedAssessedValue = 원공시 합산(지분 전), effectiveIncludedAssessedValue = 지분·감면 후
          지분만 적용 시: effective = 원공시 × 지분율 */}
      {hasOwnershipRatio && (
        <Bullet testId="payable-step1-ownership">
          공시가격 × 지분율({ownershipRatioNum}%) = 안분 공시가격 : {eok(result.effectiveIncludedAssessedValue ?? result.includedAssessedValue)}
        </Bullet>
      )}
      {/* 사례6: 건물·부속토지 시가표준액 비율 안분 */}
      {hasAppurtenant && (
        <Bullet testId="payable-step1-appurtenant">
          공시가격 합산 {eok(result.includedAssessedValue)} × ({apOwnLand ? "토지" : "건물"} 시가표준액 {eok(apNum)} / 전체 {eok(apTotal)} = {apPct}%) = 안분 공시가격 {eok(result.effectiveIncludedAssessedValue ?? result.includedAssessedValue)}
        </Bullet>
      )}
      {/* 조례 감면 적용 시: 원공시 합산 × (1−감면율) = 과세 공시가격 */}
      {hasReduction && (
        <Bullet>
          과세 공시가격 : 공시가격 합산 {eok(result.includedAssessedValue)} × (1−감면율) ={" "}
          {eok(result.effectiveIncludedAssessedValue)}
        </Bullet>
      )}
      <Bullet>
        종합부동산세 과세표준 : ({eok(result.effectiveIncludedAssessedValue ?? result.includedAssessedValue)} − {eok(result.basicDeduction)})
        × {pct(result.fairMarketRatio)}(공정시장가액비율) = {eok(result.taxBase)}
      </Bullet>
      <Bullet>
        종합부동산세액 : {eok(result.taxBase)} × {pct(result.appliedRate)}
        {hasPd ? ` − ${won(result.progressiveDeduction)}(누진공제액)` : ""} = {won(result.calculatedTax)}
      </Bullet>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ② 공제할 재산세액
// ════════════════════════════════════════════════════════════
function Step2({
  result,
  yr,
  properties,
}: {
  result: ComprehensiveTaxResult;
  yr: string;
  properties?: PropertyEntry[];
}) {
  const c = result.propertyTaxCredit;
  const fmr = c.propertyFairMarketRatio ?? 0;
  const ptBase = c.propertyTaxBaseAmount ?? 0;
  const bracket = getHousingStandardRateBracket(ptBase);
  // ②ⓐ 세부담상한 Min 행: 자동모드(직전연도 상당액 + capPct) 존재 시만
  const capPct = c.priorPropertyTaxCapPct;
  const showCapRow = capPct != null && !!result.previousYearEquivalent;
  const capLimit =
    showCapRow && result.previousYearEquivalent
      ? Math.floor((result.previousYearEquivalent.propertyTaxEquiv * capPct!) / 100)
      : 0;

  // 사례6: 건물·부속토지 시가표준액 안분 — ⓐ는 100% 지분 재산세로 세부담상한 적용 후 안분 (교재 ②ⓐ)
  const apProp = properties?.[0];
  const apLand = parseAmount(apProp?.landStdValue ?? "");
  const apBldg = parseAmount(apProp?.buildingStdValue ?? "");
  const apTotal = apLand + apBldg;
  const apOwnLand = (apProp?.appurtenantOwnedPart ?? "land") === "land";
  const apNum = apOwnLand ? apLand : apBldg;
  const hasAppurtenant = !!apProp?.appurtenantSplitEnabled && apTotal > 0 && apNum > 0;
  // 사례7·8·9: 재산세 부과세액 직접입력 시 ⓐ는 고지서 실부과액 합계 — 자동계산 산식 대신 직접입력 표시
  const hasManualPropertyTax =
    properties?.some((p) => p.propertyTaxAmount && parseAmount(p.propertyTaxAmount) > 0) ?? false;
  // 100% 지분 재산세 (안분 전): 과세표준 = 원공시 × FMR, 표준세율 누진 1회
  const p100Base = Math.floor((result.includedAssessedValue * Math.round(fmr * 100)) / 100);
  const p100Bracket = getHousingStandardRateBracket(p100Base);
  const p100Tax = Math.max(Math.floor(p100Base * p100Bracket.rate) - p100Bracket.deduction, 0);
  // 직전 100% 지분 재산세 = 안분 직전 재산세상당액 ÷ 직전 안분비율 (세부담상한 비교용)
  const apPriorLand = parseAmount(apProp?.priorLandStdValue ?? "");
  const apPriorBldg = parseAmount(apProp?.priorBuildingStdValue ?? "");
  const apPriorTotal = apPriorLand + apPriorBldg;
  const apPriorNum = apOwnLand ? apPriorLand : apPriorBldg;
  const prior100 =
    showCapRow && result.previousYearEquivalent && apPriorNum > 0
      ? Math.round((result.previousYearEquivalent.propertyTaxEquiv * apPriorTotal) / apPriorNum)
      : 0;
  const capLimit100 = prior100 > 0 ? Math.floor((prior100 * (capPct ?? 0)) / 100) : 0;
  const p100AfterCap = capLimit100 > 0 ? Math.min(p100Tax, capLimit100) : p100Tax;

  return (
    <div>
      <StepLine badge="2" label="공제할 재산세액" amount={c.creditAmount} strong testId="payable-step2" />

      {/* ⓐ 해당연도 재산세액 */}
      <StepLine
        badge="ⓐ"
        badgeShape="circle"
        label={`해당연도('${yr.slice(2)}년) 재산세액`}
        amount={c.totalPropertyTax}
        indent={1}
        testId="payable-step2-a"
      />
      {hasManualPropertyTax ? (
        <Bullet indent={2}>
          재산세 부과세액(고지서 기재) 직접입력 합계 : {won(c.totalPropertyTax)}
        </Bullet>
      ) : hasAppurtenant ? (
        <>
          {/* 사례6: 100% 지분 재산세로 세부담상한 적용 후 시가표준액 비율 안분 (교재 ②ⓐ) */}
          <Bullet indent={2}>
            재산세 과세표준(100% 지분) : {eok(result.includedAssessedValue)} × {pct(fmr)}(재산세 공정시장가액비율) = {eok(p100Base)}
          </Bullet>
          <Bullet indent={2}>
            세부담 상한 적용 전 재산세(100% 지분) : {eok(p100Base)} × {pct(p100Bracket.rate)}(세율) − {won(p100Bracket.deduction)}(누진공제액) = {won(p100Tax)}
          </Bullet>
          {prior100 > 0 && (
            <>
              <Bullet indent={2}>직전연도(100% 지분) 재산세액 : {won(prior100)}</Bullet>
              <Bullet indent={2}>
                재산세 세부담 상한액 : {won(prior100)} × {capPct}% = {won(capLimit100)}
              </Bullet>
              <Bullet indent={2}>
                세부담 상한후 재산세(100% 지분) : {won(p100AfterCap)} [= Min({won(p100Tax)}, {won(capLimit100)})]
              </Bullet>
            </>
          )}
          <Bullet indent={2}>
            부과된 재산세액 : {won(p100AfterCap)} × ({apOwnLand ? "토지" : "건물"} 시가표준액 {eok(apNum)} / 전체 {eok(apTotal)}) = {won(c.totalPropertyTax)}
          </Bullet>
        </>
      ) : (
        <>
          <Bullet indent={2}>
            재산세 과세표준 : {eok(result.includedAssessedValue)} × {pct(fmr)}(재산세 공정시장가액비율) ={" "}
            {eok(ptBase)}
          </Bullet>
          <Bullet indent={2}>
            세부담 상한 적용 전 재산세 : {eok(ptBase)} × {pct(bracket.rate)}(세율) − {won(bracket.deduction)}
            (누진공제액) = {won(c.propertyTaxBase)}
          </Bullet>
          {showCapRow && result.previousYearEquivalent && (
            <Bullet indent={2}>
              재산세 세부담 상한액 : 직전연도 재산세상당액 {won(result.previousYearEquivalent.propertyTaxEquiv)}{" "}
              × {capPct}% = {won(capLimit)}
            </Bullet>
          )}
          <Bullet indent={2}>
            부과된 재산세액 : {won(c.totalPropertyTax)}
            {showCapRow ? `[= Min(${won(c.propertyTaxBase)}, ${won(capLimit)})]` : ""}
          </Bullet>
        </>
      )}

      {/* 트랙 A: 다가구 구별 안분 명세 — floorUnits 자동 산정 주택만 (manual·단일 ⓐ와 직교, multiFamilyBreakdown 존재 시만) */}
      {result.properties
        .filter((rp) => rp.multiFamilyBreakdown && rp.multiFamilyBreakdown.length > 0)
        .map((rp, pi) => (
          <MultiFamilyBreakdownRow key={rp.propertyId ?? pi} rp={rp} />
        ))}

      {/* 트랙 B: 주택 세부담상한 산식 (housingTaxCapDetail 존재 시만) — 조건 블록 밖 배치 필수 (Track A 교훈) */}
      {result.properties
        .filter((rp) => rp.housingTaxCapDetail != null)
        .map((rp, pi) => (
          <HousingTaxCapDetailRow key={(rp.propertyId ?? pi) + "-cap"} rp={rp} />
        ))}

      {/* ⓑ 종합부동산세 과세표준의 표준세율재산세액 (누진공제 없음) */}
      <StepLine
        badge="ⓑ"
        badgeShape="circle"
        label="종합부동산세 과세표준의 표준세율재산세액"
        amount={c.comprehensiveTaxBase}
        indent={1}
        testId="payable-step2-b"
      />
      <Bullet indent={2}>
        {eok(result.taxBase)} × {pct(fmr)}(재산세 공정시장가액비율) × {pct(bracket.rate)} ={" "}
        {won(c.comprehensiveTaxBase)}
      </Bullet>

      {/* ⓒ 총표준세율재산세액 (누진공제 차감) */}
      <StepLine
        badge="ⓒ"
        badgeShape="circle"
        label="총표준세율재산세액"
        amount={c.propertyTaxBase}
        indent={1}
        testId="payable-step2-c"
      />
      <Bullet indent={2}>
        {eok(result.effectiveIncludedAssessedValue ?? result.includedAssessedValue)} × {pct(fmr)}(재산세 공정시장가액비율) × {pct(bracket.rate)} −{" "}
        {won(bracket.deduction)} = {won(c.propertyTaxBase)}
      </Bullet>

      {/* ⓓ 공제할 재산세액 */}
      <StepLine
        badge="ⓓ"
        badgeShape="circle"
        label="공제할 재산세액"
        formula="(ⓐ × ⓑ / ⓒ)"
        amount={c.creditAmount}
        indent={1}
        testId="payable-step2-d"
      />
      <Bullet indent={2}>
        {won(c.totalPropertyTax)} × ({won(c.comprehensiveTaxBase)} / {won(c.propertyTaxBase)}) ={" "}
        {won(c.creditAmount)}
      </Bullet>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ③ 세액공제액 (1세대1주택 — 고령자·장기보유)
// ════════════════════════════════════════════════════════════
function Step3({
  result,
  isCorporateSpecial,
}: {
  result: ComprehensiveTaxResult;
  isCorporateSpecial: boolean;
}) {
  const d = result.oneHouseDeduction;
  if (!d || d.deductionAmount <= 0) {
    return (
      <StepLine
        badge="3"
        label={
          <>
            세액공제액{" "}
            <span className="text-muted-foreground font-normal">
              : 해당 없음 {isCorporateSpecial ? "(법인)" : "(1세대1주택자 아님)"}
            </span>
          </>
        }
        strong
        testId="payable-step3"
      />
    );
  }
  const ap = d.apportionmentRatio;
  return (
    <div>
      <StepLine
        badge="3"
        label="세액공제액"
        formula={`[(① − ②) × ${pct(d.combinedRate)}(장기보유 ${pct(d.longTermRate)} + 고령자 ${pct(d.seniorRate)})${d.isMaxCapApplied ? " · 80% 상한" : ""}]`}
        amount={d.deductionAmount}
        strong
        testId="payable-step3"
      />
      <Bullet>
        {won(d.deductionAmount)}[= ({won(result.calculatedTax)} − {won(result.propertyTaxCredit.creditAmount)})
        × {pct(d.combinedRate)}]
      </Bullet>
      {ap && (
        <Bullet>
          1세대1주택자 안분 (§9⑦⑨) : {won(ap.mainHouseAssessedValue)} ÷ {won(ap.totalAssessedValue)}
        </Bullet>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ④ 세부담 상한전 종합부동산세액
// ════════════════════════════════════════════════════════════
function Step4({ result }: { result: ComprehensiveTaxResult }) {
  const d = result.oneHouseDeduction;
  const dedAmt = d?.deductionAmount ?? 0;
  return (
    <div>
      <StepLine
        badge="4"
        label="세부담 상한전 종합부동산세액"
        formula={dedAmt > 0 ? "(① − ② − ③)" : "(① − ②)"}
        amount={result.taxBeforeCap}
        strong
        testId="payable-step4"
      />
      <Bullet>
        {won(result.taxBeforeCap)}(= {won(result.calculatedTax)} − {won(result.propertyTaxCredit.creditAmount)}
        {dedAmt > 0 ? ` − ${won(dedAmt)}` : ""})
      </Bullet>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ⑤ 세부담 상한 초과세액
// ════════════════════════════════════════════════════════════
function Step5({
  result,
  yr,
  pyr,
  isCorporateSpecial,
}: {
  result: ComprehensiveTaxResult;
  yr: string;
  pyr: string;
  isCorporateSpecial: boolean;
}) {
  const cap = result.taxCap;
  // 세부담상한 미적용/생략
  if (!cap) {
    return (
      <StepLine
        badge="5"
        label={
          <>
            세부담 상한 초과세액{" "}
            <span className="text-muted-foreground font-normal">
              :{" "}
              {isCorporateSpecial
                ? "미적용 (§10 단서 — §9②3호 세율 적용 법인)"
                : "직전연도 세액 미입력 — 계산 생략"}
            </span>
          </>
        }
        strong
        testId="payable-step5"
      />
    );
  }

  const cur = result.currentYearTotalEquivalent ?? 0; // ⑤가
  const excess = Math.max(0, cur - cap.capAmount); // 교재 가 − 다 (≥0)
  const pye = result.previousYearEquivalent;

  return (
    <div>
      <StepLine
        badge="5"
        label="세부담 상한 초과세액"
        formula="(가 − 다 ≥ 0)"
        amount={excess}
        strong
        testId="payable-step5"
      />

      {/* 가. 해당연도 총세액상당액 */}
      <GaNaDaLine
        prefix="가"
        label={`해당연도('${yr.slice(2)}년) 총세액상당액`}
        formula="(= ②의ⓐ + ④)"
        amount={cur}
        testId="payable-step5-ga"
      />
      <Bullet indent={2}>
        {won(cur)} = {won(result.propertyTaxCredit.totalPropertyTax)} + {won(result.taxBeforeCap)}
      </Bullet>

      {/* 나. 직전연도 총세액상당액 */}
      {pye ? (
        <>
          <GaNaDaLine
            prefix="나"
            label={`직전연도('${pyr.slice(2)}년) 총세액상당액`}
            formula="(① + ②)"
            amount={pye.total}
            testId="payable-step5-na"
          />
          <PriorYearBreakdown pye={pye} />
        </>
      ) : (
        <GaNaDaLine
          prefix="나"
          label={`직전연도('${pyr.slice(2)}년) 총세액상당액`}
          formula="(직접 입력)"
          amount={cap.previousYearTotalTax}
          testId="payable-step5-na"
        />
      )}

      {/* 다. 세부담 상한액 + 초과 판단 문장 */}
      <GaNaDaLine
        prefix="다"
        label={`해당연도('${yr.slice(2)}년) 세부담 상한액`}
        formula={`(나 × ${pct(cap.capRate)})`}
        amount={cap.capAmount}
        testId="payable-step5-da"
      />
      <Bullet indent={2}>
        {won(cap.capAmount)} = {won(cap.previousYearTotalTax)} × {pct(cap.capRate)}
      </Bullet>
      <p
        className="py-0.5 text-[13px] leading-relaxed text-muted-foreground"
        style={{ paddingLeft: `${2 * 14 + 18}px` }}
        data-testid="payable-step5-judgment"
      >
        {`해당연도('${yr.slice(2)}년) 총세액상당액 ${won(cur)}(가)이 세부담 상한액 ${won(
          cap.capAmount,
        )}(다)을 ${excess > 0 ? "초과하므로" : "초과하지 않으므로"} 세부담 상한 초과금액은 "${won(
          excess,
        )}"입니다.`}
      </p>
      {isCorporateSpecial && (
        <Bullet indent={2}>법인(§9②3호 세율)은 세부담 상한 미적용 — 참고용 표기</Bullet>
      )}
    </div>
  );
}

// ⑤-나 직전연도 상당액 전체 분해 (자동모드 전용)
function PriorYearBreakdown({
  pye,
}: {
  pye: NonNullable<ComprehensiveTaxResult["previousYearEquivalent"]>;
}) {
  const dt = pye.detail;
  const pFmr = dt.propertyFairMarketRatio ?? 0;
  const pPtBase = dt.propertyTaxBaseAmount ?? 0;
  const pBracket = getHousingStandardRateBracket(pPtBase);

  return (
    <>
      {/* 나의 ① 직전연도 재산세상당액 */}
      <StepLine
        badge="①"
        badgeShape="circle"
        label="직전연도 재산세상당액"
        amount={pye.propertyTaxEquiv}
        indent={2}
        testId="payable-step5-na-1"
      />
      <Bullet indent={3}>
        재산세 과세표준 : {eok(dt.assessedValue)} × {pct(pFmr)}(재산세 공정시장가액비율) = {eok(pPtBase)}
      </Bullet>
      <Bullet indent={3}>
        표준세율 재산세액 : {eok(pPtBase)} × {pct(pBracket.rate)} − {won(pBracket.deduction)} ={" "}
        {won(pye.propertyTaxEquiv)}
      </Bullet>

      {/* 나의 ② 직전연도 종합부동산세상당액 */}
      <StepLine
        badge="②"
        badgeShape="circle"
        label="직전연도 종합부동산세상당액"
        formula="(ⓐ − ⓑ − ⓒ)"
        amount={pye.comprehensiveTaxEquiv}
        indent={2}
        testId="payable-step5-na-2"
      />
      <Bullet indent={3}>
        {won(pye.comprehensiveTaxEquiv)}(= {won(dt.calculatedTax)} − {won(dt.creditAmount)} −{" "}
        {won(dt.oneHouseDeductionAmount)})
      </Bullet>

      {/* ⓐ 재산세공제전 종합부동산세액 */}
      <StepLine
        badge="ⓐ"
        badgeShape="circle"
        label="재산세공제전 종합부동산세액"
        amount={dt.calculatedTax}
        indent={3}
      />
      <Bullet indent={4}>
        종합부동산세 과세표준 : ({eok(dt.assessedValue)} − {eok(dt.basicDeduction)}) ×{" "}
        {pct(dt.fairMarketRatio)}(공정시장가액비율) = {eok(dt.taxBase)}
      </Bullet>
      <Bullet indent={4}>
        종합부동산세액 : {eok(dt.taxBase)} × {pct(dt.appliedRate)} = {won(dt.calculatedTax)}
      </Bullet>

      {/* ⓑ 공제할 재산세액 */}
      <StepLine
        badge="ⓑ"
        badgeShape="circle"
        label="공제할 재산세액"
        amount={dt.creditAmount}
        indent={3}
      />
      <Bullet indent={4}>직전연도 재산세상당액 : {won(pye.propertyTaxEquiv)}</Bullet>
      <Bullet indent={4}>
        종합부동산세 과세표준에 대한 표준세율재산세액 : {eok(dt.taxBase)} × {pct(pFmr)} ×{" "}
        {pct(pBracket.rate)} = {won(dt.stdTaxNumerator)}
      </Bullet>
      <Bullet indent={4}>
        총표준세율재산세액 : {eok(dt.assessedValue)} × {pct(pFmr)} × {pct(pBracket.rate)} −{" "}
        {won(pBracket.deduction)} = {won(dt.stdTaxDenominator)}
      </Bullet>
      <Bullet indent={4}>
        공제할 재산세액 : {won(pye.propertyTaxEquiv)} × ({won(dt.stdTaxNumerator)} /{" "}
        {won(dt.stdTaxDenominator)}) = {won(dt.creditAmount)}
      </Bullet>

      {/* ⓒ 세액공제액 */}
      <StepLine
        badge="ⓒ"
        badgeShape="circle"
        label="세액공제액"
        formula={`[(ⓐ − ⓑ) × ${pct(dt.oneHouseDeductionRate)}]`}
        amount={dt.oneHouseDeductionAmount}
        indent={3}
      />
      <Bullet indent={4}>
        {won(dt.oneHouseDeductionAmount)}[= ({won(dt.calculatedTax)} − {won(dt.creditAmount)}) ×{" "}
        {pct(dt.oneHouseDeductionRate)}]
      </Bullet>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// ⑥ 납부할세액 (결정세액 — 엔진 단일 진실, ≥0 클램프)
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// 다가구 구별 안분 명세 (트랙 A — ExpandToggleButton 펼침)
// ════════════════════════════════════════════════════════════
function MultiFamilyBreakdownRow({
  rp,
}: {
  rp: ComprehensiveTaxResult["properties"][number];
}) {
  const [expanded, setExpanded] = useState(false);
  const bd = rp.multiFamilyBreakdown ?? [];
  if (bd.length === 0) return null;
  return (
    <div className="ml-8 mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-violet-700 hover:underline"
      >
        <span className={expandToggleClass("violet")}>{expandToggleLabel(expanded)}</span>
        다가구 구별 안분 명세 ({bd.length}개 구)
      </button>
      {expanded && (
        <div className="mt-1 rounded-md border border-violet-200 bg-violet-50/40 px-3 py-2 text-xs text-violet-900 space-y-0.5">
          {bd.map((row, i) => (
            <div key={i} className="flex justify-between">
              <span>{row.label}</span>
              <span>
                안분 공시 {won(row.apportionedAssessedValue)} → 재산세 {won(row.tax)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 트랙 B: 주택 세부담상한 산식 명세 (ExpandToggleButton 펼침)
// ════════════════════════════════════════════════════════════
function HousingTaxCapDetailRow({
  rp,
}: {
  rp: ComprehensiveTaxResult["properties"][number];
}) {
  const [expanded, setExpanded] = useState(false);
  const d = rp.housingTaxCapDetail;
  if (!d) return null;
  return (
    <div className="ml-8 mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-sky-700 hover:underline"
      >
        <span className={expandToggleClass("sky")}>{expandToggleLabel(expanded)}</span>
        주택 세부담상한 산식
      </button>
      {expanded && (
        <div className="mt-1 rounded-md border border-sky-200 bg-sky-50/40 px-3 py-2 text-xs text-sky-900 space-y-0.5">
          {/* 당해 표준세율 재산세 */}
          <div>당해 표준세율 재산세: {won(d.standardTax)}</div>
          {/* 직전 표준세율 재산세 + 세부담상한 */}
          {d.capPct != null && d.capAmount != null ? (
            <>
              <div>
                직전 표준세율 재산세: {won(d.priorStandardTax)} → 세부담상한 {d.capPct}% = {won(d.capAmount)}
              </div>
              <div>
                세부담상한 적용: min({won(d.standardTax)}, {won(d.capAmount)}) = {won(d.cappedTax)}
              </div>
            </>
          ) : (
            <div>세부담상한 미적용 (2024년 폐지 · 과세표준상한제)</div>
          )}
          {/* 감면·지분 적용 후 부과세액 */}
          <div>감면·지분 적용 후 부과세액 ⓐ: {won(d.imposedTax)}</div>
        </div>
      )}
    </div>
  );
}

function Step6({ result, yr }: { result: ComprehensiveTaxResult; yr: string }) {
  const excess = result.taxCap
    ? Math.max(0, (result.currentYearTotalEquivalent ?? 0) - result.taxCap.capAmount)
    : 0;
  return (
    <div className="mt-1 border-t border-emerald-200 dark:border-emerald-800 pt-1">
      <StepLine
        badge="6"
        label={`해당연도('${yr.slice(2)}년) 종합부동산세 납부할세액`}
        formula="(④ − ⑤)"
        amount={result.determinedHousingTax}
        strong
        testId="payable-step6"
      />
      <Bullet>
        {won(result.determinedHousingTax)}(= {won(result.taxBeforeCap)} − {won(excess)})
      </Bullet>
    </div>
  );
}
