/**
 * 이월과세(§97의2) 시나리오 입력 술어·조립 — `transfer-tax-carryover.ts`에서 800줄 정책으로 내린 leaf(동작 무변경).
 * 시나리오 A의 소유자 분리·PHD 입력 보정 술어, 시나리오 B 입력(`buildInputB`), 적용배제 빈 시나리오.
 */
import { dayKey } from "./transfer-split-part-cause-input";
import { summarizeSplitGain } from "./transfer-tax-split-display";
import { isBurdenedGiftCarryover, toTransferorBasisInfo } from "./transfer-tax-carryover-burdened-gift";
import { carryoverGiftHouseholdBasis, resolveHouseCountExclusionDate } from "./one-house/gift-household-basis";
import type { TransferTaxInput } from "./types/transfer.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { CarryoverScenarioADetail, CarryoverScenarioBDetail } from "./types/transfer-carryover.types";


/** 소유자 분리 + 증여자 취득가액 모름(일반 환산) — ⑧ `ownerSplitDonorEstimated`·⑫ refine 2a와 같은 조건. PHD·APD는 3시점 경로, 부담부증여는 §159 경로라 제외. */
export function ownerSplitDonorConversion(
  rawInput: TransferTaxInput,
  ct: NonNullable<TransferTaxInput["carryoverTaxation"]>,
): boolean {
  // 부담부증여는 §159 경로라 제외 — ⑧ `ownerSplitDonorEstimated`(`nonPurchaseOwnerSplit`)도 제외한다(리뷰 게이트 D-2).
  return !!rawInput.selfOwns && rawInput.selfOwns !== "both" && ct.useEstimatedAcquisition === true && !rawInput.preHousingDisclosure
    && !isBurdenedGiftCarryover(rawInput);
}

/** 소유자 분리이고 엔진이 실제로 분리 계산했으면 본인 파트 — 분리 계산이 없으면(환산 입력 부족 등) 종전 자산 단위 갈래로 둔다. */
export function ownerSplitPartOf(rawInput: TransferTaxInput, splitDetail: SplitGainResult | undefined): "land" | "building" | null {
  if (!splitDetail || !rawInput.selfOwns || rawInput.selfOwns === "both") return null;
  return rawInput.selfOwns === "building_only" ? "building" : "land";
}

/** 시나리오의 본인 파트 양도가액·취득가액 echo — 위 `acquisitionPrice`(자산 전체)와 본인 파트 `transferGain`이 한 카드에서 등식을 이루게 한다(V-4·V-1). */
export function ownerSplitPartEcho(rawInput: TransferTaxInput, splitDetail: SplitGainResult | undefined) {
  if (!ownerSplitPartOf(rawInput, splitDetail)) return {};
  const s = summarizeSplitGain(splitDetail!);
  return { ownerSplitPart: { transferPrice: s.transferPrice, acquisitionPrice: s.acquisitionDeducted } };
}

/** 증여자 취득가액 모름 + PHD·APD 페이로드 + 토지 취득일 없음 또는 건물과 같은 날(비별개) — 부담부증여는 §159 경로라 제외. */
export function carryoverPhdSplit(
  rawInput: TransferTaxInput,
  ct: NonNullable<TransferTaxInput["carryoverTaxation"]>,
): boolean {
  if (ct.useEstimatedAcquisition !== true || !rawInput.preHousingDisclosure || isBurdenedGiftCarryover(rawInput)) return false;
  const land = dayKey(rawInput.landAcquisitionDate);
  return !land || land === dayKey(rawInput.acquisitionDate);
}

/** 소유자 분리이고 토지 취득일이 본문 취득일과 같은 날인가 — 시나리오 A에서 두 날짜를 함께 증여자 취득일로 옮긴다(C-1). */
export function ownerSplitSameDayLand(rawInput: TransferTaxInput): boolean {
  if (!rawInput.selfOwns || rawInput.selfOwns === "both") return false;
  const land = dayKey(rawInput.landAcquisitionDate);
  return !!land && land === dayKey(rawInput.acquisitionDate);
}

/**
 * Scenario B 입력 구성 — 수증자 기준 (증여 당시 평가액, 등기접수일 기산)
 * §97조의2 적용 없는 일반 취득으로 처리.
 */
export function buildInputB(
  rawInput: TransferTaxInput,
  ct: NonNullable<TransferTaxInput["carryoverTaxation"]>,
): TransferTaxInput {
  return {
    ...rawInput,
    acquisitionPrice: ct.giftDateValuation,
    acquisitionDate: ct.giftRegistryDate,
    useEstimatedAcquisition: false,           // B는 실가(증여 당시 평가액)
    capitalExpenditure: rawInput.capitalExpenditure, // 수증자 capex만 (증여자 capex 제외)
    carryoverTaxation: undefined,             // 재귀 방지
    // 부담부증여 K-6/K-7: B는 양도인(증여받은 사람) 기준 — 증여일 상증법 평가액을 실지거래가액으로 본다(소령 §163⑨)
    ...(isBurdenedGiftCarryover(rawInput)
      ? { burdenedGiftInfo: toTransferorBasisInfo(rawInput.burdenedGiftInfo!) }
      : {}),
    /**
     * B는 일반 취득으로 처리 — **세율 보유기간도 증여일 기산이 된다**(§104②2호 미적용).
     *
     * 이는 의도된 결과다. §104②2호의 대상은 「§97의2제1항에 **해당하는 자산**」인데,
     * 구법(~2013.12.31)에서는 §104②2호가 「**제97조제4항**에 해당하는 자산」이었고
     * 구 §97④가 배제사유(수용)를 **본문 안 「~한 경우 외에는」**으로 품고 있어서
     * 배제 자산은 문언상 「④에 해당하는 자산」이 **아니었다**.
     * 2014.1.1.(법률 제12169호)의 §97의2 이관은 개정이유에 **가업상속 ④ 신설만** 적힌
     * **조문 정비**이므로 적용 범위는 그대로다.
     * ⇒ §97의2②(수용·1세대1주택·세액비교)로 배제되면 증여자 취득일로 소급하지 않는다.
     *
     * 계획서 §2 ⑧ · §3.2 / anchor `rate-104-2-2-gift-scope.anchor.test.ts` C-1~C-3.
     * ⚠️ 이 줄을 `"carryover_gift"`로 바꾸면 배제 자산에 통산이 들어가 과소과세가 된다.
     */
    acquisitionCause: "purchase",
    // §99의4·§98의9 취득순서 판정 축 — A/B 어느 쪽이 채택되든 세대 기준은 같다 (D4-05)
    houseCountExclusionAcquisitionDate: resolveHouseCountExclusionAcqDate(rawInput, ct),
    // §154① 보유 통산·「취득 당시」 — 증여자와 계속 같은 세대로 확인되면 세대 보유 시작일부터(결정 #34 G4-2). 장특·세율 보유기간은 증여일 그대로.
    giftHouseholdBasis: carryoverGiftHouseholdBasis(ct, false),
    // preHousingDisclosure: B에서는 환산 사용 안 함 — 명시적으로 제거
    preHousingDisclosure: undefined,
  };
}

/**
 * §99의4①·§98의9①의 「그 주택 취득 **전에 보유하던** 다른 주택」 판정용 일반주택 취득일 (D4-05).
 *
 * 원칙은 **양도자 본인의 취득일**이다 — 이월과세는 취득가액만 의제하고 취득시기를 의제하지
 * 않는다(§97의2①; 보유기간 승계는 §95④·§104②의 별도 명문). 시나리오 A는 `acquisitionDate`를
 * 증여자 취득일로 교체하므로 그대로 두면 취득순서 요건이 부당하게 통과한다.
 *
 * 증여자와 증여일부터 양도일까지 **계속 같은 세대**로 확인되면(배우자는 소득세법 §88 6호 기준 혼인 유지) 세대 보유 시작일이다.
 * 종전에는 배우자 증여면 사실 확인 없이 증여자 취득일을 썼으나 양도 전에 이혼한 배우자까지 세대로 보게 되어, 입력으로 확인될 때만
 * 쓰도록 바꿨다(결정 #33). 미확인은 양도자 본인의 취득일이다.
 */
export function resolveHouseCountExclusionAcqDate(
  rawInput: Pick<TransferTaxInput, "acquisitionDate">,
  ct: NonNullable<TransferTaxInput["carryoverTaxation"]>,
): Date {
  return resolveHouseCountExclusionDate(rawInput.acquisitionDate, carryoverGiftHouseholdBasis(ct, false));
}

/** 적용배제 시 Scenario A 빈 객체 (결과 카드 표시 불필요) */
export function makeEmptyScenarioA(): CarryoverScenarioADetail {
  return {
    acquisitionPrice: 0,
    holdingPeriodYears: 0,
    giftTaxAddedToExpense: 0,
    giftTaxLimitApplied: false,
    giftTaxLimitCap: 0,
    donorCapexAddedToExpense: 0,
    donorCapexGuardApplied: false,
    effectiveCapex: 0,
    transferGain: 0,
    determinedTax: 0,
  };
}

/** 적용배제 시 Scenario B 빈 객체 */
export function makeEmptyScenarioB(acquisitionPrice: number): CarryoverScenarioBDetail {
  return {
    acquisitionPrice,
    holdingPeriodYears: 0,
    transferGain: 0,
    determinedTax: 0,
  };
}
