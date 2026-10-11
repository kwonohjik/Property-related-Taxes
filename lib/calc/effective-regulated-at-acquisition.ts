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
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import {
  resolveWasRegulatedAtAcquisition,
  type ResidenceReqInput,
} from "@/lib/tax-engine/transfer-tax-exemption-requirements";

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
}): boolean {
  const date = toOptionalDate(o.judgmentDate);
  if (!o.regionCode || !date) return o.stored === true;
  return resolveWasRegulatedAtAcquisition({
    regionCode: o.regionCode,
    regionInDesignatedDistrict: o.regionInDesignatedDistrict,
    acquisitionDate: date,
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
    judgmentDate: isUsageConversionActive(asset) ? asset.residentialUseStartDate : redevAptHoldingStartDate(asset),
    stored,
  });
}
