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
 */
import { isCrisisAcqExempt } from "./legal-codes";

/** 「소득세법」 §104①8호 비사업용 토지 가산율(+10%p) — 겸용 파트의 기본값. */
export const MIXED_NBL_ADDITIONAL_RATE = 0.10;

export interface MixedNblRate {
  additionalRate: number;
  surchargeExcludedBy?: "crisis_acquisition";
}

export function resolveMixedNblRate(landAcquisitionDate: Date): MixedNblRate {
  return isCrisisAcqExempt(landAcquisitionDate)
    ? { additionalRate: 0, surchargeExcludedBy: "crisis_acquisition" }
    : { additionalRate: MIXED_NBL_ADDITIONAL_RATE };
}
