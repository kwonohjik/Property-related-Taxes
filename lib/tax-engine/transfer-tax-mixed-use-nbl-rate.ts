/**
 * 겸용주택 배율 초과분(비사업용 토지 파트)의 가산율 — NBL2611-V4-HS01.
 *
 * 종전에는 `buildNonBusinessPart`의 `additionalRate: 0.10` 리터럴이라, 같은 사실(2009.3.16.~2012.12.31. 취득 토지의 배율 초과분)을
 * 단일 주택 G-2·함께 양도 파트 카드(`buildNblPartRateInput` → `calcTax`)는 배제하고 겸용 단건만 +10%p를 얹었다.
 * 배제 판정은 같은 정본 leaf(`isCrisisAcqExempt` ← `CRISIS_ACQ_EXCLUSION_WINDOW`)를 쓴다 — 윈도우를 여기서 다시 쓰지 않는다.
 *
 * 효과는 「소득세법」 부칙(2008.12.26. 법률 제9270호) 제14①대로 **세율만** 배제(→ §104①1호)다. 장기보유특별공제 표1은 그대로
 * (서울행정법원 2024구단72950 — `legal-codes/surcharge-transition.ts` 주석). 기준일은 단건 `calcTax`와 같이 **토지 취득일**이다
 * (배율 초과분은 토지이고 `landAcquisitionDate ?? acquisitionDate`로 읽는다).
 *
 * NBL2611-C5 — 수용 무조건 의제(영 §168의14③3호)·주택 초과분 유예(①)도 같은 자리에서 정한다. C4가 만든 «파트 규칙 leaf»(`appurtenant-excess-deeming.ts`)를
 * 그대로 부른다 — 단일 주택 G-2·동일일 분리·§155⑳·함께 양도 주택 카드와 같은 판정이다. 의제는 «비사업용 토지 여부»만 바꾸므로 초과분은 여전히
 * 비과세 범위 밖이라 파트로 떼어 전액 과세하되 가산율만 0이다(초과분이 비과세로 새지 않는다). 위기취득 배제보다 앞선다(비사업용이 아니면 배제를 따질 필요가 없다).
 * 상가분 부수토지는 읽지 않는다(Q-8 (가) — 해석례 확보가 착수 조건).
 */
import { isCrisisAcqExempt } from "./legal-codes";
import { housingExcessDeemNotices, housingExcessDeemedBusiness, type HousingFacts } from "./appurtenant-excess-deeming";
import type { DeemedBusinessExcess } from "./types/transfer-split-gain.types";
import type { MixedUseAssetInput } from "./types/transfer-mixed-use.types";

/** 「소득세법」 §104①8호 비사업용 토지 가산율(+10%p) — 겸용 파트의 기본값. */
export const MIXED_NBL_ADDITIONAL_RATE = 0.10;

export interface MixedNblRate {
  additionalRate: number;
  surchargeExcludedBy?: "crisis_acquisition";
  /** 수용 의제·유예로 비사업용 토지가 아닌 초과분(NBL2611-C5) — 있으면 `additionalRate`는 0이다. */
  deemedBusiness?: DeemedBusinessExcess;
}

/**
 * 초과분(토지)의 취득 경위 사실 — 겸용은 토지 취득원인 칸이 없어 상속개시일(= 건물 취득일)과 같은 날 취득한 토지만 상속분으로 본다(`isInheritedPart`와 같은 규칙).
 * 다른 날 취득한 토지는 피상속인 취득일을 쓰지 않는다. 이월과세는 겸용이 지원하지 않아 증여자 취득일이 없다.
 */
function excessFactsOf(asset: MixedUseAssetInput, transferDate: Date): HousingFacts {
  const landInherited =
    asset.decedentAcquisitionDate !== undefined && asset.landAcquisitionDate.getTime() === asset.buildingAcquisitionDate.getTime();
  return {
    transferCause: asset.transferCause,
    appurtenantExcessFacts: asset.appurtenantExcessFacts,
    transferDate,
    acquisitionDate: asset.landAcquisitionDate,
    acquisitionCause: landInherited ? "inheritance" : "purchase",
    decedentAcquisitionDate: landInherited ? asset.decedentAcquisitionDate : undefined,
    nonHeirBequest: asset.nonHeirBequest,
  };
}

export function resolveMixedNblRate(asset: MixedUseAssetInput, transferDate: Date): MixedNblRate {
  const deemedBusiness = housingExcessDeemedBusiness(excessFactsOf(asset, transferDate));
  if (deemedBusiness) return { additionalRate: 0, deemedBusiness };
  return isCrisisAcqExempt(asset.landAcquisitionDate)
    ? { additionalRate: 0, surchargeExcludedBy: "crisis_acquisition" }
    : { additionalRate: MIXED_NBL_ADDITIONAL_RATE };
}

/** 초과분 파트가 있을 때의 의제 고지 — 수용인데 고시일이 없으면 «확인 필요», 의제 성립이면 근거, 유예를 입력했으나 기간기준 미충족이면 그 사실. */
export function mixedNblDeemNotices(asset: MixedUseAssetInput, transferDate: Date): string[] {
  return housingExcessDeemNotices(excessFactsOf(asset, transferDate), true);
}
