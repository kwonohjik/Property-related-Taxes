/**
 * 겸용주택 결과 카드 — **어댑터·표시 파생 헬퍼**.
 *
 * `MixedUseResultCard.tsx`에서 분리(800줄 정책). 순수 함수만 두며 JSX는 없다.
 * `mixedUseToFilingResult`는 신고서·명세서 컴포넌트가 기대하는 `TransferTaxResult` 형상으로
 * 겸용 결과를 변환한다.
 */

import type {
  MixedUseGainBreakdown,
  MixedUseTotalTax,
} from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

/** MixedUseGainBreakdown → TransferTaxResult 어댑터 (FilingFormTable 호환) */
export function mixedUseToFilingResult(b: MixedUseGainBreakdown): TransferTaxResult {
  const t = b.total;
  const localTax = t.localTax;
  // 취득 모드 판별 — 본문 계산 섹션(isDeemedAcq)과 동일 기준. 실가(§100²·§97①1호가목)·상속/증여
  // 의제(§163⑨)는 실제 취득가액을 표시(개산공제 미표시), 환산·감정/매매사례(§176의2 추계)는 추계 분기.
  const acqRoute = b.calculationRoute.acquisitionConversionRoute;
  const isDeemedOrActual =
    acqRoute === "section97_actual" ||
    acqRoute === "inheritance_direct" ||
    acqRoute === "inheritance_phd_max" ||
    acqRoute === "gift_direct" ||
    acqRoute === "gift_phd_max";
  // 취득가액 = 주택분 + 상가분 (해당 모드 값이 estimatedAcquisitionPrice에 담김).
  const acqPrice = b.housingPart.estimatedAcquisitionPrice + b.commercialPart.estimatedAcquisitionPrice;
  // 필요경비 = 개산공제 합계(환산·감정/매매사례) 또는 실제 필요경비(의제) — appraisalDed 필드가 담음. 실가는 0.
  // 상세명세서 실가 분기(취득가액 = 양도가액 − 양도차익 − expenses)가 acqPrice를 정확히 역산하도록 전달.
  const acqDeduction =
    b.housingPart.landAppraisalDed +
    b.housingPart.buildingAppraisalDed +
    b.commercialPart.landAppraisalDed +
    b.commercialPart.buildingAppraisalDed;
  // 배율초과 비사업용토지 — 「소득세법」 제104조 제5항 본문 후단에 따라 **별개 자산으로 보아**
  // 산출세액을 계산하는 **과세** 대상이다. 주택분 안분과세분(`proratedTaxableGain`)은 비사토를
  // 이미 떼어낸 뒤의 값이므로 여기서 더하지 않으면 신고서의 「비과세 양도차익」으로 오계상된다.
  // ⚠️ `transferGain`은 비사토를 **이미 포함한 gross**(`hp.transferGain` = 안분 전 gainSplit 합)다
  //    — 더하면 이중계상이므로 건드리지 않는다.
  const nb = b.nonBusinessLandPart;
  const nbTaxableGain = nb?.transferGain ?? 0;
  const nbLtDeduction = nb?.longTermDeductionAmount ?? 0;
  const taxableGain =
    b.housingPart.proratedTaxableGain + b.commercialPart.transferGain + nbTaxableGain;
  const longTermHoldingDeduction =
    b.housingPart.longTermDeductionAmount + b.commercialPart.longTermDeductionAmount + nbLtDeduction;
  return {
    isExempt: false,
    transferGain: b.housingPart.transferGain + b.commercialPart.transferGain,
    taxableGain,
    usedEstimatedAcquisition: !isDeemedOrActual,
    // 환산·추계 분기: 취득가액(추계)·개산공제를 실제 값으로 표시. 실가/의제는 undefined(실가 역산 분기 사용).
    estimatedBase: isDeemedOrActual ? undefined : acqPrice,
    estimatedDeduction: isDeemedOrActual ? undefined : acqDeduction,
    expenses: acqDeduction,
    longTermHoldingDeduction,
    // 겸용은 주택분(표2 가능)·상가분(표1)·비사토(표1)가 서로 다른 공제율이라 단일 rate가 없음 —
    // 상단 요약 산식용 실효 blended rate = 장특공제 합계 ÷ 과세대상 양도차익 합계.
    longTermHoldingRate: taxableGain > 0 ? longTermHoldingDeduction / taxableGain : 0,
    lthdStartDate: new Date(0), // mixed-use 합산 mock: 표시용
    basicDeduction: t.basicDeduction,
    taxBase: t.taxBase,
    appliedRate: t.appliedRate,
    progressiveDeduction: t.progressiveDeduction,
    calculatedTax: adoptedCalculatedTax(t),
    isSurchargeSuspended: false,
    /**
     * 🔴 종전에는 이 네 줄이 **0 하드코딩**이었다(F17-B, 2026-08-23).
     *
     * 겸용 엔진에 감면·가산세 축 자체가 없어서 0이 «맞는» 값이었지만, 그래서 결과 카드에
     * 「감면 미적용」이라는 고지조차 없이 사용자가 고른 §77이 사라졌다. 엔진이 계산하게 된
     * 지금 그대로 두면 **계산과 표시가 갈린다**(memory `feedback_engine_result_display_drift`).
     */
    reductionAmount: t.reductionAmount,
    /**
     * ⑲ 세액감면대상금액 라우팅·§127⑦ 표시가 읽는 두 값 — 종전에는 어댑터가 싣지 않아
     * 신고서 ⑲가 **0**, 명세서 산식이 「감면 대상 없음」이라 같은 화면의 ⑮ 감면세액과
     * 자기모순이었다(결과탭 코드리뷰 #049).
     */
    reductionTypeApplied: t.reductionTypeApplied,
    reducibleIncome: t.reducibleIncome,
    // §77의2 ⑲는 `eligibleTransferIncome` echo를 읽으므로 detail도 함께 실어야 한다.
    ...(t.reductionDetails ?? {}),
    determinedTax: t.determinedTax,
    // §114조의2 환산가액적용가산세는 겸용 경로에 없다 — 신고불성실·납부지연만 온다
    // (`transfer-tax-mixed-use-totals.ts`: `penaltyTax: penalty?.totalPenalty ?? 0`).
    penaltyBase: 0,
    penaltyTax: t.penaltyTax,
    /**
     * 🔴 G-43: 가산세 **산출근거** 승계.
     *
     * 종전에는 이 슬롯이 비어 있어 결과 화면에 금액만 뜨고 세율·산정일수·기준금액 행이
     * 하나도 생성되지 않았다(`TransferTaxResultView.tsx:395`·`FilingFormTableHelpers.ts:650`이
     * `penaltyDetail`을 국기법 가산세의 근거로 읽는다). 세액은 위 `penaltyTax`가 정본이므로
     * 이 승계로 금액이 바뀌지는 않는다.
     */
    ...(t.penaltyDetail ? { penaltyDetail: t.penaltyDetail } : {}),
    /**
     * 지방소득세 과세표준 산입분 = **0**. 위 `penaltyTax` 슬롯이 담고 있는 것은 국기법
     * §47의2~§47의4 가산세이고, 그것은 지방소득세 과세표준에서 제외된다(지방세법 §103의3).
     * 겸용 엔진도 `applyRate(determinedTax, 0.10)`으로 가산세를 base에서 빼고 있다.
     * 이 필드가 없으면 신고서·명세서가 슬롯을 §114조의2로 오인해 base를 부풀린다.
     */
    localTaxPenalty: 0,
    localIncomeTax: localTax,
    // 겸용 엔진도 농특세를 산정해 `totalPayable`에 합산한다 — 승계하지 않으면 신고서·명세서에서 0이 된다.
    ruralSurtax: t.ruralSurtax,
    totalTax: t.totalPayable,
    // b.steps는 MixedUseStep[] (id/title/legalBasis/values 구조)로 CalculationStep[]과
    // 형태가 달라 재사용 불가. 명세서 카드는 mixedUseDetail·result 필드로 값을 뽑고
    // formula는 fallback을 쓰므로 빈 배열로 전달 (findStepByLabel 매칭 자연 실패).
    steps: [],
    mixedUseDetail: b,
  };
}

/**
 * 실제 채택된 **산출세액**(비사업용 가산 제외분).
 *
 * §104⑤2호(자산별 산출세액 합)가 채택되면 `taxByBasicRate`(1호)는 **채택되지 않은 값**이다.
 * 그걸 그대로 표시하면 「산출세액 < 지방소득세×10」 같은 불일치가 난다.
 * 결과 카드·신고서 어댑터가 **같은 식**을 쓰도록 단일 소스로 둔다
 * (memory `feedback_engine_result_display_drift`).
 *
 * `rateBasis` 미주입(구 캐시 결과)이면 종전 동작(1호)으로 fallback.
 */
export function adoptedCalculatedTax(t: MixedUseTotalTax): number {
  return t.rateBasis === "clause2" ? t.transferTax - t.nonBusinessSurcharge : t.taxByBasicRate;
}

/** 양도소득세 기본세율 8구간 (소득세법 §104) — 캐시된 결과 fallback용 */
export function deriveBasicRateBracket(taxBase: number): { rate: number; deduction: number } {
  if (taxBase <= 14_000_000) return { rate: 0.06, deduction: 0 };
  if (taxBase <= 50_000_000) return { rate: 0.15, deduction: 1_260_000 };
  if (taxBase <= 88_000_000) return { rate: 0.24, deduction: 5_760_000 };
  if (taxBase <= 150_000_000) return { rate: 0.35, deduction: 15_440_000 };
  if (taxBase <= 300_000_000) return { rate: 0.38, deduction: 19_940_000 };
  if (taxBase <= 500_000_000) return { rate: 0.40, deduction: 25_940_000 };
  if (taxBase <= 1_000_000_000) return { rate: 0.42, deduction: 35_940_000 };
  return { rate: 0.45, deduction: 65_940_000 };
}

/** 계산 섹션 id — ④ 비사업용토지는 조건부 렌더 */
