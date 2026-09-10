/**
 * 상세명세서 3단계 — 장기보유특별공제 항목 조립
 *
 * `DetailedStatementHelpers.ts`에서 분리 (800줄 정책).
 *
 * 겸용(`mixedUseDetail`)은 주택분·비주택분(상가)·배율초과 부수토지를 부분별로 분리 표시하고,
 * 그 외 자산은 보유 기간분·거주 기간분으로 분리 표시한다. 이 파일은 `items` Map에
 * 3단계 항목만 set 하며, 계산은 엔진 step·echo 값과 `splitLtDeduction` 가공에 의존한다.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { isTable2Applied } from "@/components/calc/results/transfer/lthd-split-display";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { calcLongTermRate } from "@/lib/tax-engine/transfer-tax-mixed-use-helpers";
import { buildLthdFallbackFormulas } from "./DetailedStatementLthdFormulas";
import {
  holdingMonthsFromDates,
  splitLtDeduction,
  getAcqDateForCard,
} from "./FilingFormTableHelpers";
import { buildLthFormula } from "./DetailedStatementFormulaBuilders";
import { findStepByLabel, buildPerAssetWithFormula } from "./DetailedStatementHelpers";
import type { StatementItem } from "./DetailedStatementConfig";

interface LthdItemsArgs {
  result: TransferTaxResult;
  isAggregate: boolean;
  /** 다건 모드 자산별 분해 — 단건은 빈 배열 */
  properties: PerPropertyBreakdown[];
  /** 대표 자산 (asset ?? formData.assets[0]) */
  primary: AssetForm | undefined;
  /** 양도일 "YYYY-MM-DD" */
  transferDate: string;
  /** 거주 개월 (대표 자산 — 단건·합계 행용) */
  residenceMs: number;
  /**
   * 다건 모드에서 **그 양도건 자신의** 거주 개월수.
   *
   * 🔴 종전에는 `splitForAsset`이 대표 자산의 `residenceMs` 하나를 **모든 자산에** 적용했다.
   *   1번이 거주 24개월 이상 고가주택이고 2번이 토지·상가면 **거주 사실이 없는 토지에도
   *   「거주 기간분 장특」이 배정**됐고, 반대 배치에서는 실제 거주한 자산의 거주분이 0으로 눌렸다.
   *   자산별 취득일·양도일은 이미 `acqDateOf`·`transferDateOf`로 갈라 놓은 상태였다 —
   *   거주 축만 남아 있었다.
   */
  residenceMsOf: (propertyId: string) => number;
  /**
   * 다건 모드에서 **그 양도건 자신의** 취득일·양도일을 돌려주는 해석기.
   *
   * 🔴 종전에는 자산별 보유/거주분을 전부 `primary`(1번 양도건)의 취득일과 신고단위 양도일로
   *   계산했다. 같은 화면 신고서 양식은 `propertyFormMap`으로 자산별 날짜를 쓰므로 **두 카드가
   *   같은 자산의 장특 분할을 다르게 표시**했다 — 실측(2019년 취득 고가주택 + 2005년 취득 토지):
   *   토지 보유분 69,230,770(명세서) vs 88,235,295(신고서), 차이 19,004,525
   *   (결과탭 코드리뷰 #054·#093).
   */
  acqDateOf: (propertyId: string) => string;
  transferDateOf: (propertyId: string) => string;
}

/** 3단계 항목(`ltDeduction` 외 부분별 행)을 `items`에 set 한다. */
export function setLongTermDeductionItems(
  items: Map<string, StatementItem>,
  args: LthdItemsArgs,
): void {
  const { result, isAggregate, properties, primary, transferDate, residenceMs, residenceMsOf, acqDateOf, transferDateOf } =
    args;

  // 겸용주택은 주택분(표2 가능·보유+거주)과 비주택분(상가, 표1·보유만)이 공제율 체계가 달라
  // 단일 blended 율로 뭉뚱그리면 부정확·난해 → mixedUseDetail이 있으면 부분별로 분리 표시.
  const mu = result.mixedUseDetail;
  const lthStep = findStepByLabel(result.steps, "장기보유");
  const pct = (r: number | undefined) => `${((r ?? 0) * 100).toFixed(0)}%`;
  items.set("ltDeduction", {
    label: "장기보유특별공제",
    value: isAggregate
      ? properties.reduce((s, p) => s + p.longTermHoldingDeduction, 0)
      : result.longTermHoldingDeduction,
    formula:
      lthStep?.formula ??
      (mu
        ? `주택분 ${mu.housingPart.longTermDeductionAmount.toLocaleString()} + 비주택분(상가) ${mu.commercialPart.longTermDeductionAmount.toLocaleString()}${mu.nonBusinessLandPart ? ` + 배율초과 부수토지(비사업용) ${mu.nonBusinessLandPart.longTermDeductionAmount.toLocaleString()}` : ""} = ${(mu.housingPart.longTermDeductionAmount + mu.commercialPart.longTermDeductionAmount + (mu.nonBusinessLandPart?.longTermDeductionAmount ?? 0)).toLocaleString()} (부분별 공제율 상이 — 아래 부분별 분리)`
        : `과세대상 양도차익 × ${(result.longTermHoldingRate * 100).toFixed(0)}% (보유 + 거주)`),
    legalBasis: lthStep?.legalBasis ?? "소득세법 §95②·표1·표2",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.longTermHoldingDeduction,
          buildLthFormula,
        )
      : undefined,
  });

  // 보유분/거주분 분리 — splitLtDeduction 정확 산식 사용 (§95② 표2)
  // useTable2 휴리스틱: 거주 ≥ 24개월 (1세대1주택 고가주택 표2 적용 신호)
  // FilingFormTable·BundledAllocationCard와 동일 정책 (DRY 핵심 로직 재사용)
  const totalHoldingMs = holdingMonthsFromDates(primary?.acquisitionDate, transferDate);
  // 표2 여부는 엔진 신호가 정본이다 — 폼값 휴리스틱은 fallback (#067).
  const useTable2 = isTable2Applied(result.steps, residenceMs >= 24);
  const totalLth = isAggregate
    ? properties.reduce((s, p) => s + p.longTermHoldingDeduction, 0)
    : result.longTermHoldingDeduction;
  const lthSplit = splitLtDeduction(totalLth, totalHoldingMs, residenceMs, useTable2);

  // 다건 모드 자산별 보유/거주분 (자산별 holdingMs 기준)
  const splitForAsset = (p: PerPropertyBreakdown) => {
    // 자산별 거주 개월수 — 거주 사실이 없는 자산은 0이 되어 거주분이 배정되지 않는다.
    const rms = residenceMsOf(p.propertyId);
    return splitLtDeduction(
      p.longTermHoldingDeduction,
      holdingMonthsFromDates(acqDateOf(p.propertyId), transferDateOf(p.propertyId)),
      rms,
      /**
       * 표2 판정도 **그 자산의** 거주 개월수로 fallback 한다.
       *
       * 🔴 전역 `useTable2`는 대표 자산의 거주 개월수를 fallback으로 쓴다. 그래서 1번이 토지,
       *   2번이 실제 거주한 고가주택이면 전역 판정이 표1이 되어 **거주한 자산의 거주분까지
       *   0으로 눌렸다**. 엔진 신호가 있으면 그것이 우선인 것은 종전과 같다.
       */
      isTable2Applied(result.steps, rms >= 24),
    );
  };
  const ltHoldingPerAsset = isAggregate
    ? properties.map((p) => ({ label: p.propertyLabel, value: splitForAsset(p).holdingAmount }))
    : undefined;
  const ltResidencePerAsset = isAggregate
    ? properties.map((p) => ({ label: p.propertyLabel, value: splitForAsset(p).residenceAmount }))
    : undefined;

  // 보유분/거주분 — 엔진이 정식 emit한 sub-step의 산식 우선 (정확한 안분율·금액 노출).
  // sub-step 미발생 케이스(표1·차손 자산·겸용 합산 등)는 splitLtDeduction 가공값 fallback.
  // fallback 산식도 실제 값(연수·공제율·금액)을 인라인하고, 표1/표2 분기를 정확히 반영한다
  //   (splitLtDeduction: 표2는 거주분 직접 산정 후 보유분에 잔액 귀속, 표1은 보유분 전액·거주분 0).
  const lthHoldingStep = findStepByLabel(result.steps, "보유 기간분 장특");
  const lthResidenceStep = findStepByLabel(result.steps, "거주 기간분 장특");
  const {
    exclusionLabel: lthdExclusionLabel,
    holdingFormula: lthHoldingFallbackFormula,
    residenceFormula: lthResidenceFallbackFormula,
  } = buildLthdFallbackFormulas({
    result, isAggregate, totalHoldingMs, residenceMs, useTable2, totalLth, lthSplit,
  });

  if (mu) {
    // 겸용 — 주택분(표1/표2 보유·거주) + 비주택분(상가, 표1 보유) 분리.
    // 신규 계산은 엔진 echo(정확값)를 쓰고, echo가 없는 과거/이력 결과는 자산 기준으로 재구성
    //   (연수=취득일→양도일, 율=calcLongTermRate, 보유/거주 금액=splitLtDeduction — 신고서 양식과 동일).
    const h = mu.housingPart;
    const c = mu.commercialPart;
    const hT2 = h.longTermDeductionTable === 2;
    const hBasis = hT2 ? "소득세법 §95② 표2" : "소득세법 §95② 표1";
    const hHoldYears = h.holdingYears ?? Math.floor(totalHoldingMs / 12);
    const hResYears = h.residenceYears ?? (hT2 ? Math.floor(residenceMs / 12) : 0);
    const hHoldRate = h.holdingDeductionRate ?? calcLongTermRate(hHoldYears, 0, hT2);
    const hResRate =
      h.residenceDeductionRate ??
      calcLongTermRate(hHoldYears, hResYears, hT2) - calcLongTermRate(hHoldYears, 0, hT2);
    const hSplit =
      h.holdingDeductionAmount !== undefined && h.residenceDeductionAmount !== undefined
        ? { holdingAmount: h.holdingDeductionAmount, residenceAmount: h.residenceDeductionAmount }
        : splitLtDeduction(h.longTermDeductionAmount, totalHoldingMs, residenceMs, hT2);
    const cYears = c.holdingYears ?? Math.floor(totalHoldingMs / 12);
    items.set("ltHousingPart", {
      label: " 주택분 장특",
      value: h.longTermDeductionAmount,
      formula: hT2
        ? `주택분 과세대상 양도차익 × 표2 [보유 ${hHoldYears}년 ${pct(hHoldRate)} + 거주 ${hResYears}년 ${pct(hResRate)}] = ${h.longTermDeductionAmount.toLocaleString()}`
        : `주택분 과세대상 양도차익 × 표1 [보유 ${hHoldYears}년 ${pct(hHoldRate)}] = ${h.longTermDeductionAmount.toLocaleString()}`,
      legalBasis: hBasis,
    });
    items.set("ltHousingHolding", {
      label: " · 주택 보유 기간분",
      value: hSplit.holdingAmount,
      formula: `주택분 과세대상 양도차익 × 보유 ${pct(hHoldRate)}(보유 ${hHoldYears}년) = ${hSplit.holdingAmount.toLocaleString()}`,
      legalBasis: hBasis,
    });
    items.set("ltHousingResidence", {
      label: " · 주택 거주 기간분",
      value: hSplit.residenceAmount,
      formula: hT2
        ? `주택분 과세대상 양도차익 × 거주 ${pct(hResRate)}(거주 ${hResYears}년) = ${hSplit.residenceAmount.toLocaleString()}`
        : "0 (표1 — 거주기간 공제 대상 아님)",
      legalBasis: hBasis,
    });
    items.set("ltCommercialPart", {
      label: " 비주택분(상가) 장특",
      value: c.longTermDeductionAmount,
      formula: `상가분 과세대상 양도차익 × 표1 [보유 ${cYears}년 ${pct(c.longTermDeductionRate)}] = ${c.longTermDeductionAmount.toLocaleString()} (거주기간 공제 없음)`,
      legalBasis: "소득세법 §95② 표1",
    });
    // 배율초과 부수토지(비사업용) — 1세대1주택 비과세 안분 대상이 아니라 전액 과세되므로
    // 그 양도차익에 표1 보유분 공제율을 적용한다(거주기간 공제 없음).
    const nbPart = mu.nonBusinessLandPart;
    if (nbPart) {
      items.set("ltNonBusinessPart", {
        label: " 배율초과 부수토지(비사업용) 장특",
        value: nbPart.longTermDeductionAmount,
        formula: `배율초과 부수토지 양도차익 ${nbPart.transferGain.toLocaleString()} × 표1 ${pct(nbPart.longTermDeductionRate)} = ${nbPart.longTermDeductionAmount.toLocaleString()} (거주기간 공제 없음)`,
        legalBasis: "소득세법 §95② 표1",
      });
    }
  } else {
    items.set("ltHoldingPart", {
      label: " 보유 기간분 장특",
      value: lthHoldingStep?.amount ?? lthSplit.holdingAmount,
      formula: lthHoldingStep?.formula ?? lthHoldingFallbackFormula,
      legalBasis: lthHoldingStep?.legalBasis ?? (useTable2 ? "소득세법 §95② 표2" : "소득세법 §95② 표1"),
      note: lthdExclusionLabel
        ? lthdExclusionLabel
        : result.usageConversionDetail
          // §95⑤ — 보유분이 표2 단독이 아니라 「비주택 기간 표1 + 주택 기간 표2」다.
          ? `비주택 → 주택 용도변경 (§95⑤) — 비주택 ${result.usageConversionDetail.nonHousingYears}년 표1 ${result.usageConversionDetail.table1Pct}% + 주택 ${result.usageConversionDetail.housingYears}년 표2 ${result.usageConversionDetail.table2HoldingPct}%`
          : useTable2
            ? "1세대1주택 고가주택 표2 적용 (거주 ≥ 24개월)"
            : "표1 적용 — 거주분 0 (거주 미충족 또는 일반 자산)",
      perAsset: ltHoldingPerAsset,
    });
    items.set("ltResidencePart", {
      label: " 거주 기간분 장특",
      value: lthResidenceStep?.amount ?? lthSplit.residenceAmount,
      formula: lthResidenceStep?.formula ?? lthResidenceFallbackFormula,
      legalBasis: lthResidenceStep?.legalBasis ?? (useTable2 ? "소득세법 §95② 표2" : "소득세법 §95② 표1"),
      perAsset: ltResidencePerAsset,
    });
  }
}
