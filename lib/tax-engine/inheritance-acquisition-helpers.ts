/**
 * 상속 부동산 취득가액 의제 — transfer-tax.ts STEP 0.45 helper
 *
 * transfer-tax.ts 800줄 정책 준수를 위해 분리.
 * 순환 의존 방지: 이 파일은 transfer-tax.ts를 import하지 않는다.
 */

import { calculateInheritanceAcquisitionPrice } from "./inheritance-acquisition-price";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import { calculateInheritanceHouseValuation, HOUSE_FIRST_DISCLOSURE_DATE } from "./inheritance-house-valuation";
import { calcStdPriceSum, calcEstimatedStdPriceAtAcq } from "./commercial-building-valuation";
import type { InheritanceAcquisitionInput, InheritanceAcquisitionResult, CommercialInheritanceValuationInput } from "./types/inheritance-acquisition.types";
import type { InheritanceHouseValuationResult } from "./types/inheritance-house-valuation.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import type { Pre1990LandValuationResult } from "./pre-1990-land-valuation";

/** STEP 0.45 실행 결과 */
export interface InheritedAcquisitionStepResult {
  updatedInput: TransferTaxInput;
  result: InheritanceAcquisitionResult;
  step: CalculationStep;
  houseValuationResult?: InheritanceHouseValuationResult;
}

/**
 * STEP 0.45: 상속 부동산 취득가액 의제 적용.
 *
 * - rawInput.inheritedAcquisition이 없으면 null 반환 (skip 신호).
 * - case A + 토지: pre1990LandResult.standardPriceAtAcquisition을
 *   standardPriceAtDeemedDate로 자동 주입 (사용자 미입력 시).
 * - case A + 주택 + 상속개시일 < 2005-04-30: inheritedHouseValuation 결과로
 *   standardPriceAtDeemedDate / standardPriceAtTransfer 자동 주입 (사용자 미입력 시).
 */
export function runInheritedAcquisitionStep(
  rawInput: TransferTaxInput,
  currentInput: TransferTaxInput,
  pre1990LandResult: Pre1990LandValuationResult | undefined,
): InheritedAcquisitionStepResult | null {
  if (!rawInput.inheritedAcquisition) return null;

  // 주택 미공시 환산이 필요하면 먼저 산출
  const houseValuationResult = resolveHouseValuation(rawInput);

  const resolvedInput = resolveInheritedAcquisitionInput(
    rawInput,
    currentInput,
    pre1990LandResult,
    houseValuationResult,
  );

  const result = calculateInheritanceAcquisitionPrice(resolvedInput);

  const updatedInput = applyResultToInput(currentInput, result, resolvedInput);

  const step: CalculationStep = {
    label: "상속 취득가액 의제",
    formula: result.formula,
    amount: result.acquisitionPrice,
    legalBasis: result.legalBasis,
  };

  return { updatedInput, result, step, houseValuationResult };
}

/**
 * 재개발 상속 종전자산의 "확인된 취득가액"(§163⑨) 추출 — transfer-tax.ts 재개발 분기에서 사용.
 *
 * §166③ 환산은 "취득가액을 확인할 수 없는 경우"에만 적용된다. 상속 종전자산은 §163⑨이
 * 상속개시일 상증법 평가액을 취득당시 실지거래가액으로 의제하므로, 그 평가액이 확인되면
 * 취득가액이 "확인 가능" → §166③ 환산·§163⑥ 개산공제 배제. 이 확인된 평가액을 반환한다.
 *
 * - post-deemed: result.acquisitionPrice(§163⑨ 본문/2호 평가액, 항상 확인됨).
 * - pre-deemed: preDeemedBreakdown.reportedAmount(상증법 평가액)만 "확인된 취득가액"으로 본다.
 *   §176조의2④ 환산(converted)은 추정치라 §166③ "확인 불가" 영역 → 제외.
 * - 확인된 값이 없으면(신고가액 미입력 등) null → 호출측이 현행 §166③ 환산 경로를 유지한다.
 */
export function resolveInheritedRedevelopmentAcqPrice(
  step: InheritedAcquisitionStepResult | undefined,
): number | null {
  if (!step) return null;
  const r = step.result;
  if (r.preDeemedBreakdown) {
    const reported = r.preDeemedBreakdown.reportedAmount;
    return reported && reported > 0 ? reported : null;
  }
  return r.acquisitionPrice > 0 ? r.acquisitionPrice : null;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────

/**
 * 상가/오피스텔 기준시가 최초고시일 — 이 날짜 전 상속 상가는 §163⑨2호로 §164⑥ max 대상.
 * (commercial-building.types.ts isPreDisclosure 경계와 동일: 2005-01-01.)
 */
const COMMERCIAL_FIRST_DISCLOSURE_DATE = new Date("2005-01-01T00:00:00.000Z");

/**
 * §164⑥ 취득당시 기준시가(P_A) 산정 — 최초고시(2005) 역환산.
 * P_A = INT(최초고시 호별총액 × 취득시 기준시가합 / 최초고시시 기준시가합).
 * commercial-building-valuation.ts의 기준시가합(법 §99①1호 가목·나목)·§164⑥ 역환산 함수 재사용(single-source).
 */
export function computeCommercial164_6StdPrice(v: CommercialInheritanceValuationInput): number {
  const floorAreaTotal = v.exclusiveArea + v.commonArea;
  const unitTotalAtFirst = Math.floor(v.unitPriceAtFirstDisclosure * floorAreaTotal);
  const combinedStdAtAcq = calcStdPriceSum(
    v.landPriceAtAcquisition,
    v.landArea,
    v.buildingStdPriceAtAcquisition,
  );
  const combinedStdAtFirst = calcStdPriceSum(
    v.landPriceAtFirstDisclosure,
    v.landArea,
    v.buildingStdPriceAtFirstDisclosure,
  );
  return calcEstimatedStdPriceAtAcq(unitTotalAtFirst, combinedStdAtAcq, combinedStdAtFirst);
}

/**
 * 주택 자산 + 상속개시일 < 2005-04-30 시 inheritedHouseValuation 자동 산출.
 * inheritedHouseValuation 입력이 없으면 null.
 */
function resolveHouseValuation(
  rawInput: TransferTaxInput,
): InheritanceHouseValuationResult | undefined {
  if (!rawInput.inheritedHouseValuation) return undefined;
  return calculateInheritanceHouseValuation(rawInput.inheritedHouseValuation);
}

function resolveInheritedAcquisitionInput(
  rawInput: TransferTaxInput,
  currentInput: TransferTaxInput,
  pre1990LandResult: Pre1990LandValuationResult | undefined,
  houseValuationResult: InheritanceHouseValuationResult | undefined,
): InheritanceAcquisitionInput {
  const base = rawInput.inheritedAcquisition!;

  const isPreDeemed =
    base.inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime();

  const isHousePreDisclosure =
    base.inheritanceDate.getTime() < HOUSE_FIRST_DISCLOSURE_DATE.getTime() &&
    (base.assetKind === "house_individual" || base.assetKind === "house_apart");

  // case A(pre-deemed) + 주택 미공시: houseValuationResult로 standardPriceAtDeemedDate / standardPriceAtTransfer 주입
  // (§176조의2④ 환산취득가 = 양도가 × 취득기준시가/양도기준시가)
  const shouldInjectHouseValuation =
    houseValuationResult && isPreDeemed && isHousePreDisclosure && !base.standardPriceAtDeemedDate;

  // case B(post-deemed) + 주택 미공시: §164⑦ 취득당시 기준시가를 max(①,②) 비교용으로 주입 (소령 §163⑨2호)
  // ③(환산취득가/양도가 스케일) 적용 불가 → housePriceAtInheritanceUsed(②, 미스케일)만 취함
  const shouldInjectPostDeemedHouseMax =
    !!houseValuationResult && !isPreDeemed && isHousePreDisclosure;

  // case B(post-deemed) + 상가 + 최초고시(2005) 전 상속: §164⑥ 취득당시 기준시가(P_A)를 max 비교용 주입 (소령 §163⑨2호)
  // opt-in — commercialInheritanceValuation payload 있을 때만(주택 inheritedHouseValuation opt-in 미러).
  const shouldInjectCommercialMax =
    !isPreDeemed &&
    rawInput.propertyType === "commercial_building" &&
    !!rawInput.commercialInheritanceValuation &&
    base.inheritanceDate.getTime() < COMMERCIAL_FIRST_DISCLOSURE_DATE.getTime();

  // case A + 토지: STEP 0.4 결과 자동 주입 (사용자가 standardPriceAtDeemedDate 미입력 시, 주택 주입보다 낮은 우선순위)
  const shouldInjectPre1990 =
    !shouldInjectHouseValuation && pre1990LandResult && isPreDeemed && !base.standardPriceAtDeemedDate;

  let standardPriceAtDeemedDate = base.standardPriceAtDeemedDate;
  let standardPriceAtTransfer = base.standardPriceAtTransfer ?? currentInput.standardPriceAtTransfer;

  if (shouldInjectHouseValuation) {
    // 주택 §176조의2④ 환산취득가는 개별주택가격 단일값을 분자/분모로 사용
    // (토지+건물 합계 기준시가가 아님). 개산공제도 동일 base × 3%.
    standardPriceAtDeemedDate = houseValuationResult.housePriceAtInheritanceUsed;
    standardPriceAtTransfer =
      rawInput.inheritedHouseValuation?.housePriceAtTransfer ?? standardPriceAtTransfer;
  } else if (shouldInjectPre1990) {
    standardPriceAtDeemedDate = pre1990LandResult.standardPriceAtAcquisition;
  }

  return {
    ...base,
    standardPriceAtDeemedDate,
    standardPriceAtTransfer,
    ...(shouldInjectPostDeemedHouseMax && {
      houseValuationStdPrice: houseValuationResult!.housePriceAtInheritanceUsed,
    }),
    ...(shouldInjectCommercialMax && {
      commercialValuationStdPrice: computeCommercial164_6StdPrice(rawInput.commercialInheritanceValuation!),
    }),
    transferDate: base.transferDate ?? rawInput.transferDate,
    transferPrice: base.transferPrice ?? rawInput.transferPrice,
  };
}

function applyResultToInput(
  currentInput: TransferTaxInput,
  result: InheritanceAcquisitionResult,
  resolvedInput: InheritanceAcquisitionInput,
): TransferTaxInput {
  const isConvertedSelected =
    result.preDeemedBreakdown?.selectedMethod === "converted";

  return {
    ...currentInput,
    acquisitionPrice: result.acquisitionPrice,
    // case A에서 환산취득가가 채택된 경우: 이후 단계의 useEstimatedAcquisition 흐름과 일치
    ...(isConvertedSelected && resolvedInput.standardPriceAtDeemedDate && {
      useEstimatedAcquisition: true,
      acquisitionMethod: "estimated" as const,
      standardPriceAtAcquisition: resolvedInput.standardPriceAtDeemedDate,
      standardPriceAtTransfer:
        resolvedInput.standardPriceAtTransfer ?? currentInput.standardPriceAtTransfer,
    }),
  };
}
