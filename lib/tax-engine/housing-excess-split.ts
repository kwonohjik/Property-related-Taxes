/**
 * 토지·건물을 **같은 날** 함께 산 주택(비-별개취득)의 **배율 초과 부수토지 분리** 판정 — 엔진·④·⑤·⑧이 함께 읽는 단일 소스 (#17 · S08-1).
 *
 * ## 왜 필요한가
 *
 * 「소득세법」 §89①3호 비과세 대상은 «주택부수토지»(정착면적 × 지역별 배율 이내 — 영 §154⑦)까지이고, 그 초과분은 §104의3①5호
 * 비사업용 토지다. 조심2024서2826 · 조심2018서2003 · 서울행정법원 2018구단74696은 토지·건물을 같은 날·일괄 취득한 사안에서도
 * 초과분 과세를 유지했다 — 초과분의 성격은 취득 형태와 무관하다. 종전 엔진은 배율 판정(G-2)을 «별개취득»에서만 돌려, 같은 날
 * 산 단독·다가구의 초과분이 1세대1주택으로 전액 비과세되고 고지도 없었다(예: 10억 주택 · 초과 200㎡ → 세액 0 vs 별개취득 입력 44,980,100).
 *
 * ## 무엇을 분리하나 — 자동 안분 fallback이 아니다
 *
 * 초과분 양도차익을 떼려면 토지·건물 가액 구분이 필요하다. 법정 방식은 영 §166⑥·부가가치세법 시행령 §64①1호의 **기준시가 안분**이다
 * (취득 쪽: 개별주택가격 × 토지 ÷ (토지 + 건물) · 양도 쪽: 양도 당시 기준시가 비율). 입력(취득시 3칸 · 양도시 2칸)이 없으면 계산하지 않고
 * ⑧이 막는다 — 비과세로 끝내지 않는다.
 *
 * 🔑 S3-1(2026-10-06)의 «취득시 기준시가 입력 칸은 소유자 분리에만 연다» 결정을 #17(2026-10-11)로 개정한다 — 같은 날 취득 주택의 배율 초과분
 * 분리에도 같은 칸(개별주택가격 · ㎡당 공시지가 · 건물 기준시가 + 양도시 ㎡당 공시지가 · 건물 기준시가)을 연다.
 *
 * ## 적용 범위(검증하지 못한 조합은 막지 않고 «초과분 미분리» 고지로 남긴다)
 *
 * 매매 취득(또는 개별주택가격 보충적 평가로 평가한 상속·증여 주택 — `suppValuedInherited`, #17-5 ②) · 소유자 같음 · 지분 아님 · 부담부증여 아님 · 겸용·재개발 아님 · 취득일 2005-04-30 이후(취득 당시 개별주택가격이
 * 존재) **또는** §164⑦ 3시점 환산(PHD — 자기 3시점 값으로 토지·건물을 나눠 5칸을 받지 않는다, #17-5 ①). 시가·감정 등 보충적 평가가 아닌 상속·증여 평가, 2005-04-30 전 취득 중
 * PHD가 아닌 것(실가·감정·매매사례), 환산 + 공익수용·공매·경락 양도(PHD 포함)는 이 범위 밖이다 — 막지 않고 비과세를 유지하며
 * «초과분 미분리 — 확인 필요»로 고지한다(`housingExcessUnseparatedNotice`).
 *
 * 함께 양도 주택 카드(컴패니언)도 같은 범위·같은 판정이다(#17-1) — 면적 사실만 `companionHousingLand`로 실려 오고
 * `appurtenantLandFactsOfInput`이 주 자산의 입력 키와 같은 값으로 읽는다.
 *
 * 취득가액 산정 방식(실지거래가액·환산·감정·매매사례)은 묻지 않는다(#17-4). 분리 경로(`calcSplitGain` 주택 비-별개)는 개별주택가격을
 * 가목 : 나목 비례로 나누고 환산 분모(양도시 개별주택가격)도 같은 척도로 나누므로, 토지분 + 건물분 환산취득가액이 자산 전체 환산취득가액
 * (양도가액 × 취득시 ÷ 양도시 개별주택가격)을 취득시 기준시가 비율로 나눈 값과 같다 — 감정·매매사례도 총액을 같은 비율로 나눈다(영 §166⑥).
 * 다만 환산 + 공익수용(§164⑨1호 주택 총액 특례)·공매·경락(같은 항 2호)은 환산 분모를 낮추는 특례가 분리 경로에 닿지 않는다 — 특례는 비분리
 * `calcTransferGain`의 `resolveConversionDenominatorAtTransfer`에서만 적용된다(주택 분리 + 수용 환산 미지원 Q6과 같은 이유) — 범위 밖.
 *
 * 자산 단위 자본적지출은 분리 경로가 쓰지 않는다(§100② 후문이 안분 대상으로 열거하지 않아 파트 귀속을 알아야 한다). 화면은 카드의 「그중 토지분
 * 자본적지출」 칸(⑧ 필수)을 ④가 파트 값(토지분 · 전체 − 토지분)으로 싣는다(#17 후속 — `housingExcessNeedsCapexSplit`). 파트 값 없이 자산 전체만
 * 실은 입력은 `housingExcessCapexNotice`가 반영하지 않은 금액을 고지한다.
 */
import { appurtenantLandMultiplier, type AppurtenantLandZone } from "./appurtenant-land-rate";
import { round2 } from "./area-utils";
import { SEC_163_9_BUILDING_FIRST_DISCLOSURE, SEC_163_9_LAND_FIRST_DISCLOSURE } from "./transfer-split-part-cause";
import { deriveLegacyAcqMode, type PartAcqMode } from "./transfer-tax-split-acq-price";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import type { TransferTaxInput } from "./types/transfer.types";

/** 배율 초과 면적(㎡) — 한도 = 정착면적 × 법정 배율(양도일·지역 연혁). 초과가 없거나 입력이 모자라면 0. */
export function housingExcessAreaM2(p: {
  zone: AppurtenantLandZone | undefined;
  footprintM2: number;
  landAreaM2: number;
  transferDate: Date | undefined;
}): number {
  if (p.zone === undefined || p.transferDate === undefined) return 0;
  if (!(p.footprintM2 > 0) || !(p.landAreaM2 > 0)) return 0;
  const limit = round2(p.footprintM2 * appurtenantLandMultiplier(p.zone, p.transferDate));
  return round2(Math.max(0, p.landAreaM2 - limit));
}

export interface HousingExcessSplitFacts {
  /** 일반 주택(겸용·재개발·PHD·pre1990 아님) */
  isPlainHousing: boolean;
  /** 취득원인 매매 — 상속·증여·신축 평가 조합은 범위 밖(보충적 평가 주택 상속·증여만 `suppValuedInherited`로 연다) */
  isPurchase: boolean;
  /**
   * 개별주택가격(보충적 평가)으로 평가한 상속·증여 주택 — 취득가액(= 상증 평가액)을 토지·건물로 나눌 수 있는 경우만이다(#17-5 ②).
   * 상증 평가액은 이미 하나의 합계이므로 「건물 기준시가 · 토지 개별공시지가」로 안분하는 해석(서면인터넷방문상담4팀-688, 2006.3.23. — 상증법 §61①4호)이 있는
   * 보충적 평가(개별주택가격)에 한한다. 시가·감정·공매 등 다른 평가 방식은 근거가 없어 범위 밖이다(`isSuppValuedHouseInheritance`).
   */
  suppValuedInherited: boolean;
  /**
   * 환산취득가액 + §164⑨ 특례 양도(1호 공익수용 · 2호 공매·경락) — 특례가 환산 분모(양도시 개별주택가격)를 낮추는데 분리 경로는 그 특례를
   * 반영하지 못한다(범위 밖). 특례 발동 조건(2009-02-04 이후 양도·보상액·공매·경락가액 입력)까지 따지지 않는 보수적 상위집합이다 —
   * 걸리면 분리 대신 «초과분 미분리» 고지.
   */
  isSec164_9Conversion: boolean;
  /** 토지·건물 소유자 같음(`selfOwns === both`) */
  ownsBoth: boolean;
  /** 별개취득이면 기존 G-2 경로 — 이 경로의 대상이 아니다 */
  isSeparateAcquisition: boolean;
  isBurdenedGift: boolean;
  /** 공유지분 양도 */
  isFractional: boolean;
  /**
   * 취득일이 개별공시지가 최초 고시일(1990-08-30) 전 — 취득 당시 ㎡당 개별공시지가가 없어(§164④ 등급가액 환산 대상) 기준시가 안분 입력(취득시 ㎡당 공시지가)을
   * 줄 수 없다. §164⑦ 3시점 환산(`usesPhd`)은 그 환산을 자체 파생해 분리 경로를 타지만(#17-5 ①), 쓰지 않으면 막지 않고 비과세를 유지하며
   * «초과분 미분리 — 확인 필요» 고지로 남긴다(#17 조건). 취득일 미입력은 false(취득일 필수는 다른 ⑧이 막는다).
   * (2005-04-30 전 취득은 «취득 당시 개별주택가격»이 없어도 영 §164⑦ 추정값을 그 칸에 입력하면 5칸 경로를 탄다 — 서면인터넷방문상담4팀-685.)
   */
  acquiredBeforeLandFirstDisclosure: boolean;
  /**
   * 취득일(상속개시일·증여일)이 개별주택가격 최초 공시일(2005-04-30) 전 — 상속·증여는 취득가액이 평가액과 §164⑦ 기준시가 중 큰 금액(영 §163⑨ 2호)이라
   * «평가액을 건물 기준시가·토지 개별공시지가로 안분»하는 해석(#17-5 ②)이 닿지 않는다 → 범위 밖(`suppValuedInherited`에만 건다).
   */
  acquiredBeforeFirstDisclosure: boolean;
  /**
   * §164⑦ 개별주택가격 미공시 3시점 환산(PHD) 분리 경로를 타는가 — `phdSplitPathTaken`(엔진 `calcSplitGain` 게이트와 같은 술어)이다.
   * PHD는 토지·건물 가액을 **자기 3시점 값**으로 안분하므로(양도가액·환산취득가액 모두) 취득시 기준시가 5칸을 받지 않는다 — 그래서 분리 경로는 열되
   * 5칸 입력은 요구하지 않는다(`housingExcessNeedsStdInputs`).
   */
  usesPhd: boolean;
  excessAreaM2: number;
}

/** 취득일(ISO `YYYY-MM-DD…`)이 개별공시지가 최초 고시일(1990-08-30) 전인가 — ⑧·④·엔진이 같은 상수·같은 비교를 쓴다. */
export function isBeforeLandPriceFirstDisclosure(acquisitionDate: string | Date | undefined): boolean {
  if (!acquisitionDate) return false;
  if (acquisitionDate instanceof Date) {
    return acquisitionDate.getTime() < new Date(`${SEC_163_9_LAND_FIRST_DISCLOSURE}T00:00:00.000Z`).getTime();
  }
  return acquisitionDate.slice(0, 10) < SEC_163_9_LAND_FIRST_DISCLOSURE;
}

/** 취득일(ISO `YYYY-MM-DD…`)이 개별주택가격 최초 공시일(2005-04-30) 전인가 — 화면 힌트(취득시 개별주택가격 = 영 §164⑦ 추정값)가 쓴다. */
export function isBeforeHousePriceFirstDisclosure(acquisitionDate: string | Date | undefined): boolean {
  if (!acquisitionDate) return false;
  if (acquisitionDate instanceof Date) {
    return acquisitionDate.getTime() < new Date(`${SEC_163_9_BUILDING_FIRST_DISCLOSURE}T00:00:00.000Z`).getTime();
  }
  return acquisitionDate.slice(0, 10) < SEC_163_9_BUILDING_FIRST_DISCLOSURE;
}

/** 같은 날 취득 주택의 초과분 분리 경로(5칸 입력 + 기준시가 안분)를 타는가. */
export function housingExcessSplitApplies(f: HousingExcessSplitFacts): boolean {
  return (
    f.isPlainHousing &&
    (f.isPurchase || (f.suppValuedInherited && !f.acquiredBeforeFirstDisclosure)) &&
    !f.isSec164_9Conversion &&
    f.ownsBoth &&
    !f.isSeparateAcquisition &&
    !f.isBurdenedGift &&
    !f.isFractional &&
    // 1990-08-30 전 취득은 PHD 환산을 쓸 때만 — 취득 당시 ㎡당 개별공시지가가 없어 5칸 안분을 줄 수 없고, PHD가 §164④ 등급가액 환산까지 파생한다(#17-5 ①).
    (f.usesPhd || !f.acquiredBeforeLandFirstDisclosure) &&
    f.excessAreaM2 > 0
  );
}

/** 분리 경로 중 **취득시 기준시가 5칸**(개별주택가격·㎡당 공시지가·건물 기준시가 + 양도시 2칸)을 받는 경로인가 — PHD는 자기 3시점 칸을 쓰므로 아니다. */
export function housingExcessNeedsStdInputs(f: HousingExcessSplitFacts): boolean {
  return housingExcessSplitApplies(f) && !f.usesPhd;
}

/**
 * §164⑦ PHD 3시점 환산 분리 경로(`calcSplitGainPreDisclosure`)를 타는 입력인가 — `calcSplitGain` 게이트와 ④⑤⑧의 PHD 사실이 **같은 술어**를 읽는다.
 * PHD 페이로드가 있고 토지·건물 파트가 모두 환산일 때만이다(혼합 모드는 PHD 알고리즘이 아니라 파트별 경로 — 2026-07-28 게이트 강화).
 */
export function phdSplitPathTaken(
  input: Pick<TransferTaxInput, "preHousingDisclosure" | "landAcqMode" | "buildingAcqMode" | "useEstimatedAcquisition" | "acquisitionMethod">,
): boolean {
  if (!input.preHousingDisclosure) return false;
  const land: PartAcqMode = input.landAcqMode ?? deriveLegacyAcqMode(input as TransferTaxInput);
  const building: PartAcqMode = input.buildingAcqMode ?? deriveLegacyAcqMode(input as TransferTaxInput);
  return land === "estimated" && building === "estimated";
}

/**
 * 상속·증여 주택의 취득가액이 «개별주택가격(보충적 평가) 단일 합계»인가 — 엔진 입력(`inheritedAcquisition`)과 ④ 전송 페이로드가 **같은 술어**를 읽는다.
 * 의제취득일(1985-01-01) 이후 · 단독·다가구(개별주택가격) · 평가방법 보충적 · 신고가액 > 0. 공동주택가격·시가·감정·공매 평가는 근거가 없어 false(모름 = 불성립).
 */
export function isSuppValuedHouseInheritance(v: {
  assetKind?: string;
  reportedMethod?: string;
  reportedValue?: number;
  postDeemed: boolean;
}): boolean {
  return v.postDeemed && v.assetKind === "house_individual" && v.reportedMethod === "supplementary" && (v.reportedValue ?? 0) > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// 엔진 입력 어댑터 — `calcSplitGain` 게이트·`resolveTaxableGain` 차단·고지가 같은 값을 읽는다
// ──────────────────────────────────────────────────────────────────────────────

type EngineFacts = Pick<
  TransferTaxInput,
  | "propertyType"
  | "acquisitionCause"
  | "useEstimatedAcquisition"
  | "acquisitionMethod"
  | "inheritedAcquisition"
  | "familyBusinessInheritance"
  | "landAcquisitionCause"
  | "landAcqMode"
  | "buildingAcqMode"
  | "preHousingDisclosure"
  | "selfOwns"
  | "isSeparateAcquisition"
  | "transferType"
  | "ownershipRatio"
  | "totalPropertyTransferPrice"
  | "oneHouseUnitRole"
  | "transferCause"
  | "isAuctionTransfer"
  | "pre1990Land"
  | "redevelopment"
  | "appurtenantLandZone"
  | "buildingFootprintArea"
  | "acquisitionArea"
  | "companionHousingLand"
  | "transferDate"
  | "acquisitionDate"
>;

/**
 * 배율 판정에 쓰는 면적 사실 — 소재지 구분 · 건물 정착면적 · 토지 면적(엔진 입력에서 읽는 단일 지점).
 *
 * 주 자산 주택은 `appurtenantLandZone`·`buildingFootprintArea`·`acquisitionArea`를 직접 싣는다. 함께 양도 주택 카드(컴패니언)는 앞의 두 키를
 * 싣지 않는다 — 형제 토지 카드의 주택 컨텍스트 전용 키라 싣는 순간 토지 세율 자동 분기가 움직인다. 그래서 ④가 같은 사실을 `companionHousingLand`로
 * 운반하고 여기서 같은 값으로 읽는다 — 주 자산과 컴패니언이 **같은 판정**을 하게 하는 유일한 접점이다(#17-1).
 */
export function appurtenantLandFactsOfInput(
  input: Pick<TransferTaxInput, "appurtenantLandZone" | "buildingFootprintArea" | "acquisitionArea" | "companionHousingLand">,
): { zone: AppurtenantLandZone | undefined; footprintM2: number; landAreaM2: number } {
  const c = input.companionHousingLand;
  return {
    zone: input.appurtenantLandZone ?? c?.zone,
    footprintM2: input.buildingFootprintArea ?? c?.footprintM2 ?? 0,
    landAreaM2: input.acquisitionArea ?? c?.landAreaM2 ?? 0,
  };
}

/** 배율 초과 면적(㎡) — 별개취득 여부·취득원인과 무관한 순수 면적 판정(고지의 모집단). */
export function housingExcessAreaOfInput(input: EngineFacts): number {
  if (input.propertyType !== "housing") return 0;
  const facts = appurtenantLandFactsOfInput(input);
  return housingExcessAreaM2({
    zone: facts.zone,
    footprintM2: facts.footprintM2,
    landAreaM2: facts.landAreaM2,
    transferDate: input.transferDate,
  });
}

/** 분리 경로(5칸 입력 + 기준시가 안분)를 타는 입력인가 — 엔진 어댑터. */
export function housingExcessSplitAppliesToInput(input: EngineFacts): boolean {
  return housingExcessSplitApplies({
    isPlainHousing: input.propertyType === "housing" && !input.pre1990Land && !input.redevelopment,
    isPurchase: (input.acquisitionCause ?? "purchase") === "purchase",
    // 상속·증여(단순 증여 — 이월과세·부담부증여는 취득원인이 달라 제외) + 보충적 평가 주택 + 가업상속·토지 취득원인 혼합이 아닌 것(#17-5 ②).
    suppValuedInherited:
      (input.acquisitionCause === "inheritance" || input.acquisitionCause === "gift") &&
      !input.familyBusinessInheritance &&
      input.landAcquisitionCause === undefined &&
      input.inheritedAcquisition !== undefined &&
      isSuppValuedHouseInheritance({
        assetKind: input.inheritedAcquisition.assetKind,
        reportedMethod: input.inheritedAcquisition.reportedMethod,
        reportedValue: input.inheritedAcquisition.reportedValue,
        postDeemed: input.inheritedAcquisition.inheritanceDate.getTime() >= DEEMED_ACQUISITION_DATE.getTime(),
      }),
    isSec164_9Conversion:
      input.useEstimatedAcquisition === true && (input.transferCause === "public_expropriation" || input.isAuctionTransfer === true),
    ownsBoth: (input.selfOwns ?? "both") === "both",
    isSeparateAcquisition: input.isSeparateAcquisition === true,
    isBurdenedGift: input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift",
    /**
     * 지분 = `ownershipRatio < 1`(클라이언트 술어 `getOwnershipRatio < 1`과 같은 축). `totalPropertyTransferPrice`는 지분 표식이 아니라 12억 판정·안분
     * 분모다 — 일괄양도 1세대1주택 단위(#18 `applyOneHouseUnitPrice`)는 지분이 아닌 주택 카드(`oneHouseUnitRole === "house"`)에도 주택 + 부수토지
     * 합계액을 싣는다. 종전에는 그 값만 보고 지분으로 판정해, ⑤⑧이 받고 ④가 보낸 기준시가 5칸을 엔진이 버리고 초과분을 비과세로 남겼다(#17-3).
     * 그 밖의 경로(겸용 파트 카드의 주택분 합계 등)는 종전대로 지분처럼 범위 밖으로 둔다.
     */
    isFractional:
      (input.ownershipRatio !== undefined && input.ownershipRatio < 1) ||
      (input.totalPropertyTransferPrice !== undefined && input.oneHouseUnitRole !== "house"),
    acquiredBeforeLandFirstDisclosure: isBeforeLandPriceFirstDisclosure(input.acquisitionDate),
    acquiredBeforeFirstDisclosure: isBeforeHousePriceFirstDisclosure(input.acquisitionDate),
    usesPhd: phdSplitPathTaken(input),
    excessAreaM2: housingExcessAreaOfInput(input),
  });
}

/** 분리 경로 중 취득시 기준시가 5칸을 받는 경로인가 — 엔진 어댑터(`housingExcessNeedsStdInputs`의 입력 어댑터). */
export function housingExcessNeedsStdInputsOfInput(input: EngineFacts): boolean {
  return housingExcessSplitAppliesToInput(input) && !phdSplitPathTaken(input);
}
