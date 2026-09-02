/**
 * 정상 경로(산출세액 있음) 결과 조립 — STEP 7.5 ~ 11/12.
 *
 * `finalizeTransferTax`(감면·가산세·지방소득세·경정)를 부르고 그 반환을 `TransferTaxResult`
 * 형태로 펼친다. 계산은 하지 않는다 — **조립만** 한다.
 *
 * `transfer-tax.ts`에서 분리했다(파일 크기 정책 · 800줄 초과). 양도차손 경로의
 * `transfer-tax-loss-return.ts`와 짝을 이룬다. **동작은 그대로**다 — 지역변수를
 * 인자로 받는 것 외에 바뀐 것이 없다.
 */
import { finalizeTransferTax, buildTransferResultDetails } from "./transfer-tax-finalize";
import { resolveLTHDStartDate } from "./transfer-tax-lthd-start";
import type { CalculationStep, TransferTaxInput, TransferTaxResult } from "./types/transfer.types";

type FinalizeArgs = Parameters<typeof finalizeTransferTax>[0];
type ResultDetailArgs = Parameters<typeof buildTransferResultDetails>[0];

export interface NormalReturnArgs extends FinalizeArgs {
  /** 표시 전용 자본적지출 — 파생 전 **원본** 입력을 쓴다 */
  rawInput: TransferTaxInput;
  exemptionResult: { isPartialExempt: boolean; exemptReason?: string };
  warnings: string[];
  transferGain: number;
  usedEstimated: boolean;
  estimatedDeduction: number;
  appliedExpenses: number;
  longTermHoldingRate: number;
  swapApplied: boolean | undefined;
  swapComparison: TransferTaxResult["swapComparison"];
  expropriationValuationDetail: TransferTaxResult["expropriationValuationDetail"];
  auctionValuationDetail: TransferTaxResult["auctionValuationDetail"];
  housingExpropriationValuationDetail: TransferTaxResult["housingExpropriationValuationDetail"];
  nonBusinessLandJudgment: ResultDetailArgs["nonBusinessLandJudgment"];
  pre1990LandResult: ResultDetailArgs["pre1990LandResult"];
  carryoverDetail: ResultDetailArgs["carryoverDetail"];
  inheritedAcquisitionStep: ResultDetailArgs["inheritedAcquisitionStep"];
  cbStep: ResultDetailArgs["cbStep"];
  rental97LthdDetail: TransferTaxResult["rental97LthdDetail"];
  usageConversionDetail: TransferTaxResult["usageConversionDetail"];
  lthdExclusionReason: TransferTaxResult["lthdExclusionReason"];
  new994Detail: TransferTaxResult["new994Detail"];
  unsold989Detail: TransferTaxResult["unsold989Detail"];
  specialHouseExclusionDetail: NonNullable<TransferTaxResult["specialHouseExclusionDetail"]>;
  transferBurdenedGiftBreakdown: TransferTaxResult["transferBurdenedGiftBreakdown"];
  steps: CalculationStep[];
}

export function buildNormalTransferTaxResult(args: NormalReturnArgs): TransferTaxResult {
  const {
    input,
    effectiveInput,
    rawInput,
    steps,
    taxResult,
    multiHouseSurchargeResult,
    taxableGain,
    longTermHoldingDeduction,
    longTermHoldingRate,
    basicDeduction,
    taxBase,
    estimatedBase,
    splitDetailForRate,
    exemptionResult,
    warnings,
    transferGain,
    usedEstimated,
    estimatedDeduction,
    appliedExpenses,
    swapApplied,
    swapComparison,
    expropriationValuationDetail,
    auctionValuationDetail,
    housingExpropriationValuationDetail,
    nonBusinessLandJudgment,
    pre1990LandResult,
    carryoverDetail,
    inheritedAcquisitionStep,
    cbStep,
    rental97LthdDetail,
    usageConversionDetail,
    lthdExclusionReason,
    new994Detail,
    unsold989Detail,
    specialHouseExclusionDetail,
    transferBurdenedGiftBreakdown,
  } = args;
  // STEP 7.5 ~ 11/12: 산출세액 이후 단계 통합 (transfer-tax-finalize.ts)
  const finalize = finalizeTransferTax(args);
  const {
    new993FinalResult,
    new99FinalResult,
    unsold988FinalResult,
    unsold987FinalResult,
    unsold992FinalResult,
    unsold983FinalResult,
    unsold985FinalResult,
    unsold986FinalResult,
    unsold982FinalResult,
    unsold984FinalResult,
    unsold98FinalResult,
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    aggregateReductionRate,
    reducibleIncomeNetOfBasicDeduction,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    // §77의3·§77의2 — finalize가 필수로 돌려주는데 종전에는 이 두 키만 구조분해에서 빠져
    // 결과에 실리지 않았다(TransferTaxResult가 optional이라 TS가 못 잡는다). 그 결과
    // 상세 카드·다건 breakdown·별지84호 부표 1 ⑲가 모두 undefined를 받았다.
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
    determinedTax,
    penaltyTax,
    penaltyBase,
    localIncomeTax,
    penaltyDetail,
    // 농특세 총액 — 구조분해에서 빠뜨리면 조용히 소실된다(위 §77의3·§77의2와 같은 사고).
    ruralSurtax,
    totalTax,
    amendmentDetail,
  } = finalize;
  return {
    isExempt: false,
    // §89①3호 각 목에는 해당하나 12억 초과분만 과세되는 상태(고가주택). D-8 ②2호 판정이 읽는다.
    isPartialExempt: exemptionResult.isPartialExempt,
    exemptReason: exemptionResult.exemptReason,
    warnings: warnings.length > 0 ? warnings : undefined,
    transferGain,
    taxableGain,
    usedEstimatedAcquisition: usedEstimated,
    estimatedBase: usedEstimated ? estimatedBase : undefined,
    estimatedDeduction: usedEstimated ? estimatedDeduction : undefined,
    estimatedStdPriceAtAcquisition: effectiveInput.useEstimatedAcquisition && !splitDetailForRate ? effectiveInput.standardPriceAtAcquisition : undefined,
    estimatedStdPriceAtTransfer: effectiveInput.useEstimatedAcquisition && !splitDetailForRate ? effectiveInput.standardPriceAtTransfer : undefined,
    expenses: appliedExpenses,
    swapApplied,
    swapComparison,
    expropriationValuationDetail,
    auctionValuationDetail,
    housingExpropriationValuationDetail,
    capitalExpenditureForDisplay: rawInput.capitalExpenditure ?? 0,
    longTermHoldingDeduction,
    longTermHoldingRate,
    lthdStartDate: resolveLTHDStartDate(effectiveInput),
    basicDeduction,
    taxBase,
    appliedRate: taxResult.appliedRate,
    progressiveDeduction: taxResult.progressiveDeduction,
    calculatedTax: taxResult.calculatedTax,
    surchargeType: taxResult.surchargeType,
    surchargeRate: taxResult.surchargeRate,
    isSurchargeSuspended: taxResult.surchargeSuspended,
    rateSurchargeStatutoryExcluded: multiHouseSurchargeResult?.rateSurchargeStatutoryExcluded,
    // houses[] 정밀 판정 원본 echo — 다건 집계가 자산별 세액을 다시 구할 때 **같은 판정**을
    // 쓰도록 그대로 싣는다(표시용 multiHouseSurchargeDetail에는 surchargeApplicable·
    // surchargeType·isSurchargeSuspended가 없어 재사용할 수 없다). 세액 로직 불변 — F01.
    multiHouseSurchargeEvaluation: multiHouseSurchargeResult,
    nblSurchargeExcluded: taxResult.nblSurchargeExcluded,
    /**
     * 엔진이 실제로 적용한 §104① 호(「승자」) — 신고서 ③ 세율구분 코드의 단일 소스.
     *
     * 표시 쪽에서 자산종류·보유기간·중과유형으로 호를 **다시 유도하면 이중 진실**이 된다.
     * §104① 후단·§104⑦ 후단 비교의 승자는 엔진만 알기 때문이다.
     */
    rateClause: taxResult.rateClause,
    shortTermNote: taxResult.shortTermNote,
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    aggregateReductionRate,
    reducibleIncomeNetOfBasicDeduction,
    determinedTax,
    penaltyTax,
    penaltyBase,
    localIncomeTax,
    ruralSurtax,
    totalTax,
    steps,
    ...buildTransferResultDetails({
      multiHouseSurchargeResult,
      nonBusinessLandJudgment,
      pre1990LandResult,
      carryoverDetail,
      inheritedAcquisitionStep,
      cbStep,
      splitDetail: splitDetailForRate,
    }),
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97LthdDetail,
    usageConversionDetail,
    lthdExclusionReason,
    rental97TaxDetail,
    new994Detail,
    unsold989Detail,
    penaltyDetail,
    amendmentDetail,
    new993Detail: new993FinalResult,
    new99Detail: new99FinalResult,
    unsold988Detail: unsold988FinalResult,
    unsold987Detail: unsold987FinalResult,
    unsold992Detail: unsold992FinalResult,
    unsold983Detail: unsold983FinalResult,
    unsold985Detail: unsold985FinalResult,
    unsold986Detail: unsold986FinalResult,
    unsold982Detail: unsold982FinalResult,
    unsold984Detail: unsold984FinalResult,
    unsold98Detail: unsold98FinalResult,
    specialHouseExclusionDetail:
      specialHouseExclusionDetail.entries.length > 0 ? specialHouseExclusionDetail : undefined,
    transferBurdenedGiftBreakdown,
  };
}
