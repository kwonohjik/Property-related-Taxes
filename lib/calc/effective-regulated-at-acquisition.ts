/**
 * 「취득 당시 조정대상지역」의 **화면·검증용 실효값** — ⑤ 카드 표시와 ⑧ 검증이 엔진과 같은 값을 읽게 하는 단일 leaf.
 *
 * 엔진 `resolveWasRegulatedAtAcquisition`(`transfer-tax-exemption-holding.ts`)은 **법정동코드(주소)가 있으면 숨은
 * 토글 `wasRegulatedAtAcquisition`을 읽지 않고** 코드·기준일로 판정한다. 그런데 §155⑳ 카드·⑧은 토글 저장값을 그대로
 * 읽어, 같은 화면에서 주소 판정(「조정대상지역 해당」)과 반대로 「거주요건이 없습니다 ✓」를 띄우거나(정방향) 엔진은 성립시키는
 * 사건을 ⑧이 막았다(역방향) — 1세대1주택 코드 리뷰 G1-13·S10-6.
 *
 * 이 함수는 엔진 leaf를 **그대로 부른다**(별도 판정식 금지 — `regulated-areas.ts` 머리 주석의 단일 진실 정책).
 * 주소가 없거나 기준일이 없으면 엔진도 토글을 쓰므로 저장값(없으면 「아님」)이다.
 *
 * 근거: 「소득세법 시행령」 제154조제1항(취득 당시 조정대상지역이면 거주 2년) · 제10항(§155⑳ 표준 경로의 2019.2.12. 전 취득 분기).
 * 이 함수는 **읽기 쪽**만 맞춘다 — 주소가 있을 때 토글을 숨기거나 읽기 전용으로 바꾸는 정책은 별개다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { redevAptHoldingStartDate } from "@/lib/calc/redev-field-scope";
import { carryoverResidenceJudgmentDate } from "@/lib/calc/transfer-tax-api-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import {
  resolveWasRegulatedAtAcquisition,
  type ResidenceReqInput,
} from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import { sameHouseholdInheritanceHoldingStart } from "@/lib/tax-engine/one-house/same-household-inheritance-start";
import { resolveIsRegulatedAtTransfer } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

export function effectiveWasRegulatedAtAcquisition(o: {
  /** 법정동코드(PNU 앞 10자리). 없으면 저장값 */
  regionCode?: string;
  /** 지정 지구 안인가(사용자 선언) — 엔진과 같은 `inDistrict` */
  regionInDesignatedDistrict?: boolean;
  /**
   * 「주택 취득 당시」 기준일(YYYY-MM-DD). 통상 취득일이지만 용도변경·동일세대 상속이면 호출부가 엔진
   * `resolveResidenceJudgmentDate`와 같은 순서로 골라 넘긴다.
   */
  judgmentDate?: string;
  /** 숨은 토글 저장값 — 주소 판정이 없을 때만 쓴다 */
  stored?: boolean;
  /**
   * 증여받은 주택의 세대 사실(결정 #38) — 있으면 엔진이 `gift-household-basis.ts`로 후보일·결합 방식을 정한다(같은 세대 확인 시
   * 세대 보유 시작일과 증여일 둘 다 지정 중일 때만). 이때 `judgmentDate`는 증여일(취득일)이다.
   */
  giftHouseholdBasis?: ResidenceReqInput["giftHouseholdBasis"];
}): boolean {
  const date = toOptionalDate(o.judgmentDate);
  if (!o.regionCode || !date) return o.stored === true;
  return resolveWasRegulatedAtAcquisition({
    regionCode: o.regionCode,
    regionInDesignatedDistrict: o.regionInDesignatedDistrict,
    acquisitionDate: date,
    giftHouseholdBasis: o.giftHouseholdBasis,
  } as ResidenceReqInput);
}

/**
 * 양도세 계산기 ⑤ §155⑳ 카드·⑧ 공용 — 자산 폼에서 위 실효값을 낸다.
 * 기준일은 Step4 「조정대상지역 자동 판별」(`residenceJudgmentDate`)과 같은 순서다(용도변경 사용개시일 → 승계조합원 준공일 → 취득일).
 * `stored`는 폼-전역 숨은 토글(`form.wasRegulatedAtAcquisition`), `formRegionCode`는 ④의 폴백(`primary.regionCode || form.regionCode`)이다.
 */
export function calcEffectiveWasRegulatedAtAcquisition(
  asset: AssetForm,
  stored: boolean | undefined,
  formRegionCode?: string,
): boolean {
  return effectiveWasRegulatedAtAcquisition({
    regionCode: asset.regionCode || formRegionCode || undefined,
    regionInDesignatedDistrict: asset.regionCode ? asset.regionInDesignatedDistrict : undefined,
    judgmentDate: calcResidenceJudgmentDate(asset),
    stored,
  });
}

/**
 * 「주택 취득 당시」 기준일 — 엔진 `resolveResidenceJudgmentDate`와 같은 순서다: 용도변경 주거용 사용 개시일 → §154⑧3호 동일세대 상속의
 * 동일세대 보유 개시일 → 이월과세 증여일/세대 보유 시작일 → 승계조합원 완공APT 준공일 → 취득일. ⑤ 자동 판정 카드·⑧·⑤ §155⑳ 카드가 같은 날짜를 본다
 * (동일세대 상속을 빠뜨리면 카드가 엔진과 다른 값을 「자동」이라며 보였다).
 */
export function calcResidenceJudgmentDate(asset: AssetForm): string {
  if (isUsageConversionActive(asset)) return asset.residentialUseStartDate;
  const acquisition = toOptionalDate(asset.acquisitionDate);
  const cohabitation = toOptionalDate(asset.decedentCohabitationHoldingStartDate);
  const sameHouseholdStart =
    acquisition && cohabitation
      ? sameHouseholdInheritanceHoldingStart({
          acquisitionCause: asset.acquisitionCause,
          decedentSameHouseholdBeforeInheritance: asset.decedentSameHouseholdBeforeInheritance,
          decedentCohabitationHoldingStartDate: cohabitation,
          acquisitionDate: acquisition,
        })
      : undefined;
  if (sameHouseholdStart) return asset.decedentCohabitationHoldingStartDate;
  // 이월과세 주택은 자산 카드에 취득일 칸이 없다 — 증여일/세대 보유 시작일(결정 #33)이 기준일이다.
  return carryoverResidenceJudgmentDate(asset) ?? redevAptHoldingStartDate(asset);
}

/**
 * 「양도 당시 조정대상지역」의 **실효값** — 위 취득 당시 값과 같은 규약이다(결정 #5, G7-6).
 *
 * 주소(법정동코드)가 있으면 엔진 leaf(`resolveIsRegulatedAtTransfer`)가 양도일·소재지로 판정하고 숨은 토글 `isRegulatedArea`를 읽지
 * 않는다. 그런데 명부 없이 주택 수만 넣던 옛 기록 등에서는 중과 판정(`transfer-tax-surcharge-predicate.ts`)이 토글 저장값을 읽어,
 * 화면에 없는 값이 세액을 정했다. ④는 이 값을 `isRegulatedArea`로 싣는다 — 주소가 있으면 저장된 토글 대신 주소 판정값이 간다.
 * 주소가 없거나 양도일이 없으면 엔진도 토글을 쓰므로 저장값이다.
 */
export function effectiveIsRegulatedAtTransfer(o: {
  regionCode?: string;
  regionInDesignatedDistrict?: boolean;
  /** YYYY-MM-DD */
  transferDate?: string;
  stored?: boolean;
}): boolean {
  const date = toOptionalDate(o.transferDate);
  if (!o.regionCode || !date) return o.stored === true;
  return resolveIsRegulatedAtTransfer({
    regionCode: o.regionCode,
    regionInDesignatedDistrict: o.regionInDesignatedDistrict,
    transferDate: date,
    isRegulatedArea: o.stored === true,
  });
}

/** 양도세 계산기 폼에서 위 실효값을 낸다 — ④와 같은 코드 폴백(`primary.regionCode || form.regionCode`)·지구 선언 규약. */
export function calcEffectiveIsRegulatedAtTransfer(
  form: Pick<TransferFormData, "assets" | "regionCode" | "transferDate" | "isRegulatedArea">,
): boolean {
  const primary = form.assets?.[0];
  return effectiveIsRegulatedAtTransfer({
    regionCode: primary?.regionCode || form.regionCode || undefined,
    regionInDesignatedDistrict: primary?.regionCode ? primary.regionInDesignatedDistrict : undefined,
    transferDate: form.transferDate,
    stored: form.isRegulatedArea,
  });
}

/**
 * 화면용 자동 판정(근거 문구·신뢰도 포함) — 주소(법정동코드)와 기준일(YYYY-MM-DD)이 모두 있을 때만 낸다. 없으면 `null`(토글을 보인다).
 * 엔진 leaf(`isRegulatedByBjdCode`)를 그대로 부른다 — 위 실효값 둘과 같은 판정이다.
 */
export function regulatedVerdictForDisplay(o: {
  regionCode?: string;
  regionInDesignatedDistrict?: boolean;
  date?: string;
}): ReturnType<typeof isRegulatedByBjdCode> | null {
  if (!o.regionCode || !o.date || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return null;
  return isRegulatedByBjdCode(o.regionCode, o.date, o.regionInDesignatedDistrict);
}
