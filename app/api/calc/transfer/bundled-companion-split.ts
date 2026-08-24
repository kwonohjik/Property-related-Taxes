/**
 * 컴패니언 주택부수토지 **배율 초과 분리** (영 §167의5) — 판정 + 두 자산 조립.
 *
 * `bundled-split-helpers.ts`에서 분리 (800줄 정책, 2026-08-23).
 * 함수 로직은 그대로 옮겼고, 이 파일이 다루는 관심사는 **한 필지를 면적 한도로 쪼개는 것** 하나다.
 *
 * ## 법령 (배분 키)
 *
 * 영 §167의5는 「정착면적 × 배율로 산정한 면적 **이내**의 토지」라는 **면적 범위 정의**일 뿐
 * 안분 명문이 없다. 법 §100② 후문의 「공통되는 취득가액과 양도비용」 안분은 **토지·건물 축 +
 * 가액 구분 불분명**이 요건이라 이 축(한 필지를 면적으로 나눔)에 직접 미치지 않는다.
 * ⇒ 배분 키는 **면적 비율**이고, 형제 경로(겸용주택 `calcExcessLandRatio`)가 이미 같은 규칙이다.
 * 조심 2024서2826도 647㎡ 중 222.83㎡에 초과분 세율을 적용해 면적 기준 분리를 전제한다.
 */

import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { resolveCompanionLandRate } from "@/lib/tax-engine/appurtenant-land-rate";

// ─── 타입 ───────────────────────────────────────────────────────

/** split 판정에 필요한 companion 정보 요약 */
export interface CompanionSplitContext {
  assetId: string;
  assetLabel: string;
  assetKind: "housing" | "land" | "building";
  areaM2?: number;
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
  /** 토지 성질 명시 입력 — "appurtenant_to_housing"일 때만 split 진입 */
  landNature?: "appurtenant_to_housing" | "non_appurtenant";
}

/** split 판정에 필요한 primary 컨텍스트 */
export interface PrimarySplitContext {
  acquisitionCause?: string;
  buildingFootprintArea?: number;
  isUrbanArea?: boolean;
  appurtenantLandZone?:
    | "metropolitan_residential"
    | "non_metropolitan_or_green"
    | "non_urban";
  holdingMonths: number;
  propertyType: TransferTaxItemInput["propertyType"];
  bundledSaleMode?: "actual" | "apportioned";
}

/** split 불필요 */
export type CompanionSplitNotApplied = { applied: false };

/** split 필요 — 비율 포함 */
export type CompanionSplitApplied = {
  applied: true;
  limitArea: number;
  excessArea: number;
  /** 한도 내(부수토지) 비율 (0~1) */
  appurtenantRatio: number;
  /** 한도 초과 비율 (0~1) */
  excessRatio: number;
};

/** split 결과 — applied=false면 split 불필요 */
export type CompanionSplitResult = CompanionSplitNotApplied | CompanionSplitApplied;

// ─── 함수 ───────────────────────────────────────────────────────

/**
 * companion을 한도 내/초과로 분리할지 판정하고 비율을 반환.
 */
export function resolveCompanionSplit(
  companion: CompanionSplitContext,
  primary: PrimarySplitContext,
  /** 양도일 — 영 §167의5 배율 경과조치(2022.1.1., 부칙 §39) 판정용. */
  transferDate?: Date,
): CompanionSplitResult {
  // split 진입 조건:
  //   1. companion이 토지이고 landNature === "appurtenant_to_housing" (명시적 부수토지 선언)
  //   2. 면적 확인 가능 (areaM2 > 0)
  //   3. 수동 오버라이드 없음 (manualHoldingPeriodOverride === undefined)
  // 이전 조건 "acquisitionCause === newConstruction"은 landNature 명시 입력으로 대체됨.
  if (
    companion.assetKind !== "land" ||
    companion.landNature !== "appurtenant_to_housing" ||
    !companion.areaM2 ||
    companion.areaM2 <= 0 ||
    companion.manualHoldingPeriodOverride !== undefined
  ) {
    return { applied: false };
  }

  const resolution = resolveCompanionLandRate(
    /**
     * 🔴 `landNature`를 **반드시 넘긴다.** 수신부(`appurtenant-land-rate.ts`)는 이 필드가
     *    `"appurtenant_to_housing"`이 아니면 즉시 `applied:false`를 반환한다. 위 진입 가드가
     *    같은 값을 이미 확인해 놓고도 여기서 빠뜨려, `resolveCompanionSplit`이 **항상**
     *    `{applied:false}`가 되고 `splitCompanionIntoTwo`가 한 번도 실행되지 않았다
     *    (배율 초과분에 주택 세율이 그대로 붙었다 — 실측 48,200,001원 과대).
     *    엔진 쪽 호출부(`transfer-tax-rate-calc.ts`)는 처음부터 넘기고 있었다.
     */
    { assetKind: "land", area: companion.areaM2, landNature: companion.landNature },
    {
      propertyType: primary.propertyType,
      holdingMonths: primary.holdingMonths,
      buildingFootprintArea: primary.buildingFootprintArea,
      isUrbanArea: primary.isUrbanArea,
      appurtenantLandZone: primary.appurtenantLandZone,
      bundledSaleMode: primary.bundledSaleMode,
    },
    transferDate,
  );

  if (!resolution.applied || !resolution.excessArea || resolution.excessArea <= 0) {
    return { applied: false };
  }

  const limitArea = resolution.limitArea!;
  const excessArea = resolution.excessArea;
  const totalArea = companion.areaM2;

  // 비율은 정밀 부동소수로 유지, 금액 안분 시에만 floor 적용
  const excessRatio = excessArea / totalArea;
  const appurtenantRatio = limitArea / totalArea;

  return { applied: true, limitArea, excessArea, appurtenantRatio, excessRatio };
}

type CarryoverIn = TransferTaxItemInput["carryoverTaxation"];

/**
 * 배우자등 이월과세(§97의2) 서브객체 안분 — **금액 4필드만** 나누고 나머지는 복제한다.
 *
 * ## 🔑 지분(공유) 축과 규칙이 반대다 — 헷갈리면 조용히 틀린다
 *
 * 지분 축(`lib/calc/transfer-tax-api-carryover.ts` · `-gb-carryover.ts`)에서
 * `giftTaxAmount`는 **미스케일**이다. 사용자가 「실제 증여받은 지분 기준」 금액을 넣기 때문에
 * 「100% 기준 증여세 상당액」이라는 관측 가능한 금액이 존재하지 않는다.
 *
 * 여기는 **하나의 자산을 둘로 쪼개는** 축이다. 증여받은 것은 토지 1필지 하나이고 그 위의
 * 증여세 상당액도 하나다 — 양쪽에 전액을 실으면 **입력의 2배**가 된다.
 * ⇒ 이 축에서는 `giftTaxAmount`를 **포함해** 모든 금액이 나뉜다.
 *
 * 🔴 **`donorStandardPriceAtAcquisition`(기준시가)은 나누지 않는다.** 환산 산식
 *    `양도가액 × 취득시 기준시가 ÷ 양도시 기준시가`에서 분모(양도시 기준시가)가 물건 전체
 *    기준이라 분자만 줄이면 **× ratio가 두 번** 걸린다(`transferPrice`가 이미 나뉘었다).
 *    같은 규율이 지분 축 분류표에도 명문화돼 있다.
 *
 * 실측(수정 전): 취득가액 100,000,000·증여세 20,000,000이 양쪽에 전액 복제되어
 * 양도차익 합이 380,000,000 → 260,000,000으로 소실, 결정세액 **37,800,000원 과소**.
 */
function splitCarryover(
  ct: CarryoverIn,
  excessRatio: number,
): { appurtenant: CarryoverIn; excess: CarryoverIn } {
  if (!ct) return { appurtenant: undefined, excess: undefined };
  const cut = (total: number | undefined) => {
    if (total === undefined) return { appurtenant: undefined, excess: undefined };
    const excess = Math.floor(total * excessRatio);
    return { appurtenant: total - excess, excess };
  };
  const acq = cut(ct.donorAcquisitionPrice);
  const capex = cut(ct.donorCapitalExpenditure);
  const giftTax = cut(ct.giftTaxAmount);
  const giftVal = cut(ct.giftDateValuation);
  return {
    appurtenant: {
      ...ct,
      donorAcquisitionPrice: acq.appurtenant,
      donorCapitalExpenditure: capex.appurtenant,
      giftTaxAmount: giftTax.appurtenant ?? 0,
      giftDateValuation: giftVal.appurtenant ?? 0,
    },
    excess: {
      ...ct,
      donorAcquisitionPrice: acq.excess,
      donorCapitalExpenditure: capex.excess,
      giftTaxAmount: giftTax.excess ?? 0,
      giftDateValuation: giftVal.excess ?? 0,
    },
  };
}

/**
 * companion 엔진 입력 기반(base)과 split 결과를 받아
 * [appurtenant, excess] 두 TransferTaxItemInput을 반환.
 *
 * 금액 안분 (Math.floor — 정수 보존, Math.round 금지):
 *   excess 몫 = Math.floor(전체 × excessRatio)
 *   appurtenant 몫 = 전체 - excess 몫 (나머지 귀속)
 *
 * ⚠️ **`{...base}`가 여기서 명시적으로 나누지 않은 모든 필드를 양쪽에 복제한다.**
 *    금액·면적 필드를 새로 추가할 때는 **반드시 안분 여부를 판정**할 것 — 복제하면 2배가 된다.
 *    나누는 것: 양도가액·취득가액·필요경비·자본적지출·양도비·양도면적·공매가액·이월과세 4필드.
 *    복제가 정답인 것: 기준시가(환산 산식에서 약분) · ㎡당 단가 · 물건-수준 총액
 *    (`totalPropertyTransferPrice`) · 일자·플래그·감면 요건.
 */
export function splitCompanionIntoTwo(
  base: TransferTaxItemInput,
  split: CompanionSplitApplied,
  primaryCtx: NonNullable<TransferTaxItemInput["primaryContextForCompanionRate"]>,
): [TransferTaxItemInput, TransferTaxItemInput] {
  const { appurtenantRatio, excessRatio, limitArea } = split;

  // 금액 안분 헬퍼 — floor 적용, 나머지는 appurtenant에 귀속
  function splitAmount(total: number): { appurtenant: number; excess: number } {
    const excess = Math.floor(total * excessRatio);
    return { appurtenant: total - excess, excess };
  }

  const xferSplit = splitAmount(base.transferPrice);
  const acqSplit = splitAmount(base.acquisitionPrice);
  const expSplit = splitAmount(base.expenses ?? 0);
  const capexSplit = splitAmount(base.capitalExpenditure ?? 0);
  const texpSplit = splitAmount(base.transferExpense ?? 0);
  const areaSplit = splitAmount(base.transferArea ?? 0);
  const auctionSplit = splitAmount(base.auctionPrice ?? 0);
  const ctSplit = splitCarryover(base.carryoverTaxation, excessRatio);

  // 자산 A: 부수토지 한도 내 — primaryContextForCompanionRate 유지 (70% 적용)
  const appurtenant: TransferTaxItemInput = {
    ...base,
    propertyId: `${base.propertyId}__appurtenant`,
    propertyLabel: `${base.propertyLabel}(부수토지 한도 내)`,
    transferPrice: xferSplit.appurtenant,
    acquisitionPrice: acqSplit.appurtenant,
    expenses: expSplit.appurtenant,
    capitalExpenditure: capexSplit.appurtenant > 0 ? capexSplit.appurtenant : undefined,
    transferExpense: texpSplit.appurtenant > 0 ? texpSplit.appurtenant : undefined,
    // §164⑨ 수용 환산의 승수·공매가액 — 금액·면적이라 나눈다(복제하면 2배).
    transferArea: base.transferArea === undefined ? undefined : areaSplit.appurtenant,
    auctionPrice: base.auctionPrice === undefined ? undefined : auctionSplit.appurtenant,
    carryoverTaxation: ctSplit.appurtenant,
    acquisitionArea: limitArea,
    // 부수토지 → 주택 세율(70%) 자동 적용을 위해 primaryCtx 그대로 유지
    primaryContextForCompanionRate: primaryCtx,
  };

  // 자산 B: 한도 초과 — primaryContextForCompanionRate 제거 (토지 본래 보유기간 적용)
  //   영 §167의5 한도 초과분은 주택부수토지가 아니다 → 토지 본래 보유기간 기준 §104① 적용.
  //   ⚠️ 초과분은 「소득세법」 §104의3①5호(위임 영 §168의12)에 따라 **비사업용 토지**에도
  //      해당할 수 있으나(정의요건) 기간요건(영 §168의6)은 별도이며, 현재 이 분기는
  //      isNonBusinessLand를 사용자 입력값 그대로 상속한다 — 자동 적용하지 않는다.
  const excess: TransferTaxItemInput = {
    ...base,
    propertyId: `${base.propertyId}__excess`,
    propertyLabel: `${base.propertyLabel}(한도 초과)`,
    transferPrice: xferSplit.excess,
    acquisitionPrice: acqSplit.excess,
    expenses: expSplit.excess,
    capitalExpenditure: capexSplit.excess > 0 ? capexSplit.excess : undefined,
    transferExpense: texpSplit.excess > 0 ? texpSplit.excess : undefined,
    transferArea: base.transferArea === undefined ? undefined : areaSplit.excess,
    auctionPrice: base.auctionPrice === undefined ? undefined : auctionSplit.excess,
    carryoverTaxation: ctSplit.excess,
    acquisitionArea: split.excessArea,
    // 한도 초과분은 주택 일체과세 배제 → primaryContext 없음
    primaryContextForCompanionRate: undefined,
    // 수동 오버라이드도 없음 (본래 보유기간 기준 세율 자동 적용)
    manualHoldingPeriodOverride: undefined,
  };

  return [appurtenant, excess];
}
