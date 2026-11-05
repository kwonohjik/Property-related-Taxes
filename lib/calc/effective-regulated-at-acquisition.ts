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
import { z } from "zod";
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
import { isHousingLike, isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import { judgeRegulatedArea, type RegulatedAreaResult } from "@/lib/regulated-area";

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
    // P5 — 파트 이월과세 C·B도 같다: 엔진 해결자가 건물 파트 사건 사실로 같은 leaf(`carryoverGiftHouseholdBasis`)의 basis를 만든다.
    //   `carryover`가 건물 파트 서브폼이라 증여자 취득일이 곧 건물 증여자 취득일이다.
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
        donorPriorHouseholdResidenceMonths: fact.donorPriorHouseholdResidenceMonths,
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
    priorHouseholdResidenceMonths: fact.giftSameHouseholdContinuous === true ? fact.giftPriorHouseholdResidenceMonths : undefined,
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

/** `calcStoredRegulatedFlags`가 읽는 폼 조각 — 두 숨은 토글과 「직접 만짐」 표지. */
export type RegulatedFlagsForm = Pick<
  TransferFormData,
  "assets" | "transferDate" | "isRegulatedArea" | "wasRegulatedAtAcquisition" | "isRegulatedAreaTouched" | "wasRegulatedAtAcquisitionTouched"
>;

/** route 스키마(`/api/address/regulated-area`)와 같은 날짜 검사 — 어긋나면 route가 400을 내고 Step4 훅은 아무것도 쓰지 않는다. */
const ymd = z.string().date();

/**
 * 「조정대상지역」 두 숨은 토글의 **Step4를 거친 값** — Step4 `useRegulatedAreaAutoTip`이 토글에 써 넣었을 값을 동기로 낸다.
 *
 * 법정동코드가 없고 주소 문자열만 있으면 조정대상지역 판정은 Step4 「보유 상황」이 마운트될 때 도는 그 훅만 했다. 단계 탭은 자유 이동이라
 * Step4를 건너뛰고 계산하면 기본값(아님)이 ④에 가서 거주요건(소득세법 시행령 §154①)·중과(소득세법 §104⑦)가 빠졌다
 * (계획서 `docs/00-pm/regulated-area-skip-step4-sync-judgment.plan.md` §1 — 1주택 0 ↔ 237,435,000).
 *
 * 훅과 **같은 조건·같은 판정 함수**(`judgeRegulatedArea` — route와 공용)다. 저장값을 바꾸지 않고 읽는 쪽이 파생한다(useEffect → store 미러링 금지).
 * - 주 자산이 주택 계열(`isHousingLike`)이고 주소 또는 법정동코드, 양도일이 있을 때만 판정한다. 아니면 저장값이다(훅도 쓰지 않는다).
 * - 사용자가 직접 만진 토글(`*Touched`)은 저장값이다. 단 §154① 판정 대상이 아닌 자산(입주권·분양권)은 Step4가 마운트 때 만짐 표지를
 *   지우므로(`Step4.tsx` 자산 종류 리셋 effect) 훅이 판정값을 쓴다 — 여기서도 표지를 보지 않는다.
 * - 취득 당시 기준일은 훅에 넘기는 `residenceJudgmentDate`와 같은 leaf(`calcResidenceJudgmentDate`)다. 없으면 route처럼 「아님」이다.
 * - 판정 신뢰도(medium·low)는 보지 않는다 — 훅도 신뢰도와 무관하게 쓴다(계획서 Q-3 a).
 */
export function calcStoredRegulatedFlags(form: RegulatedFlagsForm): { isRegulatedArea: boolean; wasRegulatedAtAcquisition: boolean } {
  const j = storedRegulatedJudgments(form);
  return { isRegulatedArea: j.transfer.value, wasRegulatedAtAcquisition: j.acquisition.value };
}

/** 두 숨은 토글의 값과, 그 값이 주소 판정에서 왔으면 그 판정(기준일·근거) — `calcStoredRegulatedFlags`·결과 고지가 같은 판정을 읽는다. */
type StoredRegulatedJudgment = { value: boolean; judged?: { date: string; judgment: RegulatedAreaResult } };

function storedRegulatedJudgments(form: RegulatedFlagsForm): { transfer: StoredRegulatedJudgment; acquisition: StoredRegulatedJudgment } {
  const stored = {
    transfer: { value: form.isRegulatedArea === true },
    acquisition: { value: form.wasRegulatedAtAcquisition === true },
  };
  const primary = form.assets?.[0];
  if (!primary || !isHousingLike(primary.assetKind)) return stored;
  const address = primary.addressRoad || primary.addressJibun || "";
  const regionCode = primary.regionCode || "";
  if (!address && !regionCode) return stored;
  const acquisitionDate = calcResidenceJudgmentDate(primary) || "";
  if (
    !ymd.safeParse(form.transferDate).success ||
    (acquisitionDate && !ymd.safeParse(acquisitionDate).success) ||
    (address && address.length < 2) ||
    (regionCode && regionCode.length < 2)
  ) {
    return stored;
  }
  const loc = {
    address: address || undefined,
    regionCode: regionCode || undefined,
    inDistrict: regionCode ? primary.regionInDesignatedDistrict : undefined,
  };
  const respectTouched = isOneHouseExemptionAsset(primary.assetKind);
  const judgeAt = (date: string): StoredRegulatedJudgment => {
    const judgment = judgeRegulatedArea(loc, date);
    return { value: judgment.isRegulated, judged: { date, judgment } };
  };
  return {
    transfer: respectTouched && form.isRegulatedAreaTouched ? stored.transfer : judgeAt(form.transferDate),
    acquisition:
      respectTouched && form.wasRegulatedAtAcquisitionTouched
        ? stored.acquisition
        : acquisitionDate
          ? judgeAt(acquisitionDate)
          : { value: false },
  };
}

/** 결과 화면 고지 한 줄 — 어느 값을 어느 날 기준으로 어떻게 판정했는가. */
export type RegulatedAddressAssumption = {
  which: "transfer" | "acquisition";
  /** YYYY-MM-DD */
  date: string;
  isRegulated: boolean;
  confidence: "medium" | "low";
  basis: string;
};

/**
 * 결과 화면 「조정대상지역 판정 — 확인 필요」(계획서 `docs/00-pm/regulated-area-assumption-notice.plan.md` Q-1~Q-3 a).
 *
 * ④가 실은 두 값 중 **주소 문자열 판정에서 왔고 신뢰도가 high가 아닌 것**을 낸다 — 시·도를 알아볼 수 없어 조정대상지역으로 본 경우(low),
 * 시군구 단위 매칭이라 동·읍·면 예외를 못 본 경우(medium), 데이터에 없는 시·도(low · 아님) 모두. 판정은 `calcStoredRegulatedFlags`와
 * 같은 함수 호출이다(별도 판정식 금지).
 * - 법정동코드(자산 → 폼 전역)가 있으면 ④는 코드로 판정한다 → 빈 배열.
 * - 직접 만진 토글은 사용자가 정한 값이다 → 그 값은 내지 않는다(입주권·분양권은 표지를 보지 않는다 — `calcStoredRegulatedFlags`와 같다).
 */
export function regulatedAddressAssumptions(form: RegulatedFlagsForm & Pick<TransferFormData, "regionCode">): RegulatedAddressAssumption[] {
  const primary = form.assets?.[0];
  if (!primary || primary.regionCode || form.regionCode) return [];
  const j = storedRegulatedJudgments(form);
  const out: RegulatedAddressAssumption[] = [];
  for (const [which, v] of [["transfer", j.transfer], ["acquisition", j.acquisition]] as const) {
    const c = v.judged?.judgment.confidence;
    if (!v.judged || c === undefined || c === "high") continue;
    out.push({ which, date: v.judged.date, isRegulated: v.value, confidence: c, basis: v.judged.judgment.basis });
  }
  return out;
}

/** 양도세 계산기 폼에서 위 실효값을 낸다 — ④와 같은 코드 폴백(`primary.regionCode || form.regionCode`)·지구 선언 규약. */
export function calcEffectiveIsRegulatedAtTransfer(form: RegulatedFlagsForm & Pick<TransferFormData, "regionCode">): boolean {
  const primary = form.assets?.[0];
  return effectiveIsRegulatedAtTransfer({
    regionCode: primary?.regionCode || form.regionCode || undefined,
    regionInDesignatedDistrict: primary?.regionCode ? primary.regionInDesignatedDistrict : undefined,
    transferDate: form.transferDate,
    // 코드가 없을 때 쓰는 저장값 — Step4를 거쳤을 값(주소 문자열 판정 포함)이다.
    stored: calcStoredRegulatedFlags(form).isRegulatedArea,
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
