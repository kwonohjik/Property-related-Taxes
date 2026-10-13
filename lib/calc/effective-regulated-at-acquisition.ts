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
import { format } from "date-fns";
import { toOptionalDate } from "@/lib/api/date-coerce";
import {
  buildGiftHouseholdPayload,
  calcGiftHouseholdFactAsked,
  giftHouseholdFactErrors,
} from "@/lib/calc/gift-household-payload";
import { redevAptHoldingStartDate } from "@/lib/calc/redev-field-scope";
import { carryoverHouseholdPayload, carryoverResidenceJudgmentDate } from "@/lib/calc/transfer-tax-api-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import {
  resolveWasRegulatedAtAcquisition,
  type ResidenceReqInput,
} from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import { resolveResidenceJudgmentPlan } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { carryoverGiftHouseholdBasis, type GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";
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
 * 증여받은 주택의 세대 사실을 **묻는 위치** — ⑤ 위젯(`CompanionAcquisitionCauseSection`)·⑧(`validateAssetEntry`)·④(`buildCalcGiftHouseholdPayload`)와
 * 같은 값이다(`calcGiftHouseholdFactAsked`의 `where`). 이 위치가 아니면 엔진은 세대 사실 없이 증여일 기준으로 판정하므로 화면도 그렇게 읽는다.
 */
export type GiftHouseholdScope = { isPrimary: boolean };

/** 단건 계산기 주 자산 — 세대 사실을 묻고 ④가 싣는 위치(판정 메뉴도 같다). */
export const GIFT_HOUSEHOLD_SCOPE_PRIMARY: GiftHouseholdScope = { isPrimary: true };

/**
 * 증여받은 주택의 세대 사실을 엔진 입력(`giftHouseholdBasis`)으로 옮긴다 — **④가 route에 싣는 것과 같은 사실·같은 엔진 leaf**
 * (결정 #38-10, 취득 당시 조정대상지역 표시 정합).
 *
 * 엔진은 이 basis로 「취득 당시」 후보일과 결합 방식을 정한다(`resolveGiftResidenceDates` — 계속 같은 세대면 세대 보유 시작일**과** 증여일
 * 둘 다 지정 중일 때만, 미확인이면 증여일·증여자 취득일 중 하나라도). 화면·⑧이 증여일 하나만 보면 거울상(세대 보유 시작일에만 지정 중)과
 * 통산 성립 시 반대 방향(시작일엔 비지정·증여일엔 지정 중)에서 엔진과 다른 값을 「자동」이라며 보였다.
 *
 * - 이월과세(`carryover_gift`): 엔진 `carryoverGiftHouseholdBasis`를 그대로 부른다(별도 판정식 금지). 세대 답은 ④ 전송 조각
 *   (`carryoverHouseholdPayload`)과 같은 것만 — 묻지 않는 경로의 stale 값은 싣지 않아 미확인으로 읽힌다(엔진도 그렇게 읽는다).
 * - 일반 증여: 묻는 위치(`calcGiftHouseholdFactAsked`)에서 답이 있고 ⑧ 규칙(`giftHouseholdFactErrors`)을 통과할 때만 — `buildCalcGiftHouseholdPayload`
 *   와 같은 조건이라, 답하지 않은 경로는 엔진도 basis 없이(증여일 기준) 판정한다.
 * - 용도변경 주택은 엔진이 용도변경일을 먼저 보고 basis를 쓰지 않는다(`resolveResidenceJudgmentPlan`) — 여기서도 만들지 않는다.
 *
 * 다건 ④도 #38-3 이후 건마다 주 자산의 이 사실을 싣는다 — 다건 편집에 임베드된 화면도 같은 scope(첫 자산)로 읽는다.
 */
export function calcGiftHouseholdBasis(asset: AssetForm, scope: GiftHouseholdScope): GiftHouseholdBasis | undefined {
  if (isUsageConversionActive(asset)) return undefined;
  if (asset.acquisitionCause === "carryover_gift") {
    const c = asset.carryover;
    const giftRegistryDate = toOptionalDate(c?.giftRegistryDate);
    const donorAcquisitionDate = toOptionalDate(c?.donorAcquisitionDate);
    if (!c || !giftRegistryDate || !donorAcquisitionDate) return undefined;
    const fact = carryoverHouseholdPayload(asset);
    return carryoverGiftHouseholdBasis(
      {
        giftRegistryDate,
        donorAcquisitionDate,
        donorSameHouseholdContinuous: fact.donorSameHouseholdContinuous,
        donorHouseholdHoldingStartDate: toOptionalDate(fact.donorHouseholdHoldingStartDate),
        donorDeceased: c.donorDeceased || undefined,
        donorRelation: c.donorRelation || undefined,
      },
      true,
    );
  }
  // 결정 #38-6 — 증여자 사망이면 「계속 같은 세대」를 묻지 않으므로 답이 없어도 사실이 있다. basis는 ④ 조각(`buildGiftHouseholdPayload`)에서 만든다
  // — 사망은 통산 없이(`continuousSameHousehold` 미지정 + `donorDeceased`), 재결합은 「아니오」 + `rejoinedAfterDivorce`로 엔진과 같다.
  if ((!asset.giftSameHousehold && !asset.giftDonorDeceased) || !calcGiftHouseholdFactAsked(asset, scope)) return undefined;
  if (giftHouseholdFactErrors(asset).length > 0) return undefined;
  const giftDate = toOptionalDate(asset.acquisitionDate);
  const donorAcquisitionDate = toOptionalDate(asset.donorAcquisitionDate);
  if (!giftDate || !donorAcquisitionDate) return undefined;
  const fact = buildGiftHouseholdPayload(asset);
  if (fact.giftSameHouseholdContinuous === undefined && !fact.giftDonorDeceased) return undefined;
  return {
    giftDate,
    donorAcquisitionDate,
    continuousSameHousehold: fact.giftSameHouseholdContinuous,
    householdHoldingStartDate: fact.giftSameHouseholdContinuous === true ? toOptionalDate(fact.giftHouseholdHoldingStartDate) : undefined,
    donorDeceased: fact.giftDonorDeceased === true ? true : undefined,
    rejoinedAfterDivorce: fact.giftRejoinedAfterDivorce === true ? true : undefined,
  };
}

/**
 * 양도세 계산기 ⑤ §155⑳ 카드·⑧ 공용 — 자산 폼에서 위 실효값을 낸다.
 * 기준일은 Step4 「조정대상지역 자동 판별」(`residenceJudgmentDate`)과 같은 순서다(용도변경 사용개시일 → 승계조합원 준공일 → 취득일).
 * `stored`는 폼-전역 숨은 토글(`form.wasRegulatedAtAcquisition`), `formRegionCode`는 ④의 폴백(`primary.regionCode || form.regionCode`)이다.
 *
 * `giftScope`를 주면 증여받은 주택의 세대 사실(이월과세 · 일반 증여)을 엔진과 같은 basis로 읽는다 — 단건·판정 메뉴 호출부만 준다.
 * 다건 편집에 임베드된 마법사도 같은 scope를 준다(#38-3 — 다건 ④가 건마다 사실을 싣는다). 주지 않는 호출부는 단일 기준일이다.
 */
export function calcEffectiveWasRegulatedAtAcquisition(
  asset: AssetForm,
  stored: boolean | undefined,
  formRegionCode?: string,
  giftScope?: GiftHouseholdScope,
): boolean {
  return effectiveWasRegulatedAtAcquisition({
    regionCode: asset.regionCode || formRegionCode || undefined,
    regionInDesignatedDistrict: asset.regionCode ? asset.regionInDesignatedDistrict : undefined,
    judgmentDate: calcResidenceJudgmentDate(asset),
    stored,
    giftHouseholdBasis: giftScope ? calcGiftHouseholdBasis(asset, giftScope) : undefined,
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

/**
 * 취득 당시 조정대상지역의 화면용 자동 판정 — **증여받은 주택의 세대 사실을 반영한다**(결정 #38-10).
 *
 * 증여 basis가 있으면 엔진 `resolveResidenceJudgmentPlan`이 정한 후보일·결합 방식(`all` 모두 / `any` 하나라도)대로 후보일마다 엔진 leaf
 * (`isRegulatedByBjdCode`)를 불러 합친다 — `calcEffectiveWasRegulatedAtAcquisition`과 같은 결론이다. 보여 주는 근거(`basis`·신뢰도)는 **결론을
 * 정한 후보일**의 것이다(`all`이 미해당이면 지정 중이 아닌 날, `any`가 해당이면 지정 중인 날, 그 밖에는 첫 후보).
 * basis가 없으면 `regulatedVerdictForDisplay`와 같다.
 */
export function regulatedVerdictForAcquisition(o: {
  regionCode?: string;
  regionInDesignatedDistrict?: boolean;
  date?: string;
  giftHouseholdBasis?: GiftHouseholdBasis;
}): ReturnType<typeof isRegulatedByBjdCode> | null {
  const base = regulatedVerdictForDisplay(o);
  if (!base || !o.regionCode || !o.giftHouseholdBasis) return base;
  const plan = resolveResidenceJudgmentPlan({
    acquisitionDate: o.giftHouseholdBasis.giftDate,
    giftHouseholdBasis: o.giftHouseholdBasis,
  } as ResidenceReqInput);
  const verdicts = plan.dates.map((d) => isRegulatedByBjdCode(o.regionCode!, format(d, "yyyy-MM-dd"), o.regionInDesignatedDistrict));
  const decided = verdicts.find((v) => v.isRegulated === (plan.mode === "any"));
  return decided ?? verdicts[0];
}
