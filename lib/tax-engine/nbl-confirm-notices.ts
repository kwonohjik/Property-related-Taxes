/**
 * 비사업용 토지 **«확인 필요» 고지 문구** — 단일 소스 (NBL2611 · 로드맵 R13).
 *
 * 판정을 도입하지 않고 «판정하지 않았다»는 사실만 알린다(2026-10-04 「모름 = 확인 필요」 원칙).
 * 결과 화면(「확인이 필요한 사항」 카드)·입력 화면 안내(`NblExcessConfirmNotice`)·엔진 `warnings`가 같은 문구를 읽는다.
 *
 * ⚠️ 법 인용은 `NBL` 상수에서만 조립한다 — 문자열 리터럴로 조문을 적지 않는다(CLAUDE.md 법령 조문 상수 규칙).
 *
 * 재사용 지점: `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`는 일반건물 외에 기타토지·주택 부수토지의
 * «양도일 현재 상태를 소유기간 전체에 적용»(V2-C2) 고지에도 같은 문구로 쓴다(B2·D1).
 */
import { NBL } from "./legal-codes/transfer-nbl";

/**
 * V10-BX06 — 건축물(비주택) 부속토지 기준면적 초과분을 비사업용으로 보았을 때, 사업용 해당 여부를 따로 판정하지 않았다는 고지.
 * 일반건물(GB)·상업용건물(CB) 공통 — 두 경로 모두 `judgeAppurtenantLandExcess`(배율 초과분)만 쓰고 아래 사항은 판정하지 않는다(리뷰 §7.2 기각: NBL 엔진으로 GB·CB 초과분을 판정하지 않는다).
 */
export const NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE =
  `건축물 부속토지의 기준면적(바닥면적 × 적용배율) 초과분은 비사업용 토지로 보고 계산했습니다. 그 초과분이 ` +
  `${NBL.MAIN} ① 4호 다목·${NBL.OTHER_LAND_BUSINESS}의 사업용 토지, ` +
  `${NBL.BUILDING_SITE_SEPARATE_AGG_LIST}의 토지(부설주차장 설치기준면적 이내의 토지 등), ` +
  `${NBL.OTHER_LAND_FOOTPRINT_CARVEOUT}의 건축물(시가표준액이 부속토지 시가표준액의 100분의 2에 미달), ` +
  `공장용 건축물 부속토지(${NBL.FACTORY_LAND_AGGREGATE}) 중 어디에 해당하는지는 판정하지 않았습니다 — 확인 필요.`;

/**
 * V2-C2 — 양도일 현재의 토지 이용 상태를 소유기간 전체에 적용했다는 고지.
 * 근거: 법 §104의3① 각 호 외의 부분(「소유하는 기간 중 대통령령으로 정하는 기간 동안」)·영 §168조의6.
 */
export const NBL_STATE_AT_TRANSFER_APPLIED_NOTICE =
  `비사업용 토지 여부를 양도일 현재의 상태로 판정해 소유기간 전체에 적용했습니다. 소유기간 중 건물의 철거·신축·증축이나 용도 변경으로 상태가 달랐다면 ` +
  `결과가 달라질 수 있습니다 — 확인 필요 (${NBL.MAIN} ① 각 호 외의 부분 · ${NBL.CRITERIA}).`;

/** 일반건물 결과 상세에서 초과분(전체 비사업용 포함)이 있으면 붙는 고지 목록. 한도 이내면 빈 목록. */
export function gbExcessConfirmNotices(detail: { nonBusinessRatio?: number } | undefined): string[] {
  return (detail?.nonBusinessRatio ?? 0) > 0
    ? [NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE, NBL_STATE_AT_TRANSFER_APPLIED_NOTICE]
    : [];
}

/** 여러 일반건물 상세의 고지를 중복 없이 모은다 — 함께 양도·다건이 자산마다 같은 문구를 반복하지 않게. */
export function mergeGbExcessConfirmNotices(details: ReadonlyArray<{ nonBusinessRatio?: number } | undefined>): string[] {
  return [...new Set(details.flatMap(gbExcessConfirmNotices))];
}
