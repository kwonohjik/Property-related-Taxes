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
 * - pre-deemed: **①(§163⑨ 본문 상증법 평가액)과 ②(§163⑨1호·2호 §164④~⑦ 기준시가) 중 큰 값**.
 *   ①②는 **둘 다 법 §97①1호 가목** = 취득당시 실지거래가액 의제라 법적 성격이 같다.
 *   ③ 환산(§163⑫ → §176조의2)만 추계라 §166③ "확인 불가" 영역 → 제외.
 *   ⚠️ ③이 채택(selectedMethod==="converted")됐더라도 ①② 중 확인된 값이 있으면 그것을 반환한다
 *      — §166③의 판단 기준은 "채택 여부"가 아니라 "**확인 가능 여부**"다.
 * - 확인된 값이 없으면(신고가액 미입력 등) null → 호출측이 현행 §166③ 환산 경로를 유지한다.
 */
export function resolveInheritedRedevelopmentAcqPrice(
  step: InheritedAcquisitionStepResult | undefined,
): number | null {
  if (!step) return null;
  const r = step.result;
  if (r.preDeemedBreakdown) {
    const confirmed = Math.max(
      r.preDeemedBreakdown.reportedAmount ?? 0,
      r.preDeemedBreakdown.sec164Amount ?? 0,
    );
    return confirmed > 0 ? confirmed : null;
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
 * 개별공시지가 최초고시일 — 이 날짜 전 상속·증여 토지는 §163⑨**1호**로 §164④ max 대상.
 * (「부동산 가격공시에 관한 법률」에 따른 1990.8.30. 최초고시 — §163⑨1호·§164④ 문언과 동일.)
 */
const LAND_FIRST_DISCLOSURE_DATE = new Date("1990-08-30T00:00:00.000Z");

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

  // 주택 미공시: §164⑦ 취득당시 기준시가를 max 비교용(②)으로 주입 (소령 §163⑨2호).
  // ⚠️ **pre/post 구분이 없다** — §163⑨은 「의제취득일」이 아니라 「기준시가 고시 전 상속·증여」만
  //    조건으로 하므로 pre-deemed(1985 이전)도 당연히 해당한다. 2026-08-05 확장.
  //    · post-deemed: max(①,②) — 나목이 §163⑨ 의제로 대체돼 ③이 **없다**
  //    · pre-deemed : **가목 우선** — `clauseA = max(①,②)`이고 그것이 0일 때만 ③이다.
  //      ⚠️ 종전 주석은 「max(①,②,③)」이었으나 **#1089(`af74d907`)에서 재편됐다**.
  //      ③은 아래 standardPriceAtDeemedDate(환산 분자)로 별도 계산되며, 가목이 확인되면 도달하지 않는다.
  //    같은 `housePriceAtInheritanceUsed` 값이 ②(비교값)와 ③의 분자로 **둘 다** 쓰이므로
  //    필드를 분리해 주입한다(역할이 둘 — 계획서 D-2).
  const shouldInjectHouseMax = !!houseValuationResult && isHousePreDisclosure;

  // 상가 + 최초고시(2005) 전 상속: §164⑥ 취득당시 기준시가(P_A)를 max 비교용(②) 주입 (소령 §163⑨2호).
  // 주택과 같은 이유로 pre/post 구분 없다(2026-08-05 확장).
  // opt-in — commercialInheritanceValuation payload 있을 때만(주택 inheritedHouseValuation opt-in 미러).
  const shouldInjectCommercialMax =
    rawInput.propertyType === "commercial_building" &&
    !!rawInput.commercialInheritanceValuation &&
    base.inheritanceDate.getTime() < COMMERCIAL_FIRST_DISCLOSURE_DATE.getTime();

  // case A + 토지: STEP 0.4 결과 자동 주입 (사용자가 standardPriceAtDeemedDate 미입력 시, 주택 주입보다 낮은 우선순위)
  const shouldInjectPre1990 =
    !shouldInjectHouseValuation && pre1990LandResult && isPreDeemed && !base.standardPriceAtDeemedDate;

  // 토지 + 개별공시지가 최초고시(1990-08-30) 전 상속·증여: §164④ 취득당시 기준시가를
  // max 비교용(②)으로 주입 (소령 §163⑨**1호**). 주택 §164⑦(2호)과 같은 구조다.
  // ⚠️ 주택·상가와 마찬가지로 **같은 값이 ③의 환산 분자로도 쓰이므로 필드를 분리**한다.
  //    시점은 **의제취득일 기준**이다 — `pre1990LandResult`가 그렇게 산출되고
  //    UI도 "1985.1.1. 개별공시지가 × 면적"이라 안내한다(계획서 §4.1(d)).
  // ⚠️ **pre/post 구분이 없다** — §163⑨1호의 조건은 「1990.8.30. 고시 前 상속·증여받은 토지」뿐이라
  //    의제취득일 이후(1985.1.1.~1990.8.30.) 상속 토지도 당연히 대상이다(주택·상가 2호와 동일).
  //    `pre1990LandResult`는 `transfer-tax.ts:85`가 `rawInput.pre1990Land` 유무만 보고 산출하므로
  //    post-deemed에서도 그대로 공급된다 — 소비는 `calcPostDeemed`의 sec164Std에서 한다.
  const shouldInjectLandMax =
    !!pre1990LandResult &&
    base.assetKind === "land" &&
    base.inheritanceDate.getTime() < LAND_FIRST_DISCLOSURE_DATE.getTime();

  let standardPriceAtDeemedDate = base.standardPriceAtDeemedDate;
  let standardPriceAtTransfer = base.standardPriceAtTransfer ?? currentInput.standardPriceAtTransfer;

  if (shouldInjectHouseValuation) {
    // 주택 §176조의2④ 환산취득가는 개별주택가격 단일값을 분자/분모로 사용
    // (토지+건물 합계 기준시가가 아님). 개산공제도 동일 base × 3%.
    // ⚠️ **이름-의미 불일치(V-2)** — `housePriceAtInheritanceUsed`는 **상속개시일** 시점 값인데
    //    `standardPriceAtDeemedDate`는 §176조의2④1호상 **의제취득일 현재** 기준시가를 뜻한다.
    //    ⭐ 그럼에도 **세액에 노출되지 않는다**: 같은 값이 ②(houseValuationStdPrice)로도 주입되어
    //       가목(§163⑨)이 확인되고, 법 §97①1호 단서상 가목이 확인되면 ③에 도달하지 않는다.
    //       (③이 쓰이는 것은 ①② 모두 부존재일 때뿐이고, 그때 이 값은 사용자 직접 입력이다.)
    //    ⇒ ②·③ 분자를 분리하거나 ③을 다시 max 후보로 되돌린다면 **여기부터 재검토**할 것.
    //       `V2-G` 가드(inherited-acquisition.test.ts)가 이 성질을 고정한다.
    //    계획서: docs/02-design/features/inheritance-pre-deemed-converted-numerator-timing.plan.md
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
    ...(shouldInjectHouseMax && {
      houseValuationStdPrice: houseValuationResult!.housePriceAtInheritanceUsed,
    }),
    ...(shouldInjectCommercialMax && {
      commercialValuationStdPrice: computeCommercial164_6StdPrice(rawInput.commercialInheritanceValuation!),
    }),
    ...(shouldInjectLandMax && {
      landValuationStdPrice: pre1990LandResult!.standardPriceAtAcquisition,
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

  // 🔴 **가목 확인 시 추계 플래그를 명시적으로 해제한다** (B-3 · 2026-08-07).
  //   STEP 0.4(`transfer-tax.ts:85-96`)는 `pre1990Land` payload가 있으면 §164④ 환산을 준비하며
  //   `useEstimatedAcquisition: true`·`acquisitionMethod: "estimated"`를 **무조건 강제**한다.
  //   여기서 해제하지 않으면 가목(①·②)을 채택하고도 하류 `calcTransferGain`이 취득가액을
  //   **환산으로 재계산**하고 개산공제(§163⑥)까지 붙인다 — 법 §97①1호 단서가 금지한 경로다.
  //   (실측: 가목 300,000,000인데 양도차익이 환산 62,482,583 기준으로 계산돼 294,984,122 과대)
  //   ⚠️ **`acquisitionPrice > 0`일 때만** 해제한다. ①②③이 모두 없어 0인 경우까지 실가 모드로
  //      바꾸면 환산조차 못 하고 「취득가액 0 실가」가 되어 더 나빠진다.
  const clauseAConfirmed = !isConvertedSelected && result.acquisitionPrice > 0;

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
    // 가목(§163⑨) = **실지거래가액 의제**다. 실제 필요경비를 공제하고 개산공제는 적용하지 않는다.
    ...(clauseAConfirmed && {
      useEstimatedAcquisition: false,
      acquisitionMethod: "actual" as const,
    }),
  };
}
