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
import { TRANSFER } from "./legal-codes";

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

/**
 * NBL2611-V1-B — 기타토지에서 나목(재산세 별도합산·분리과세 면적 범위)과 다목(영 §168의11① 호별 기준면적)이 **둘 다** 일부 면적만 사업용으로 인정했을 때,
 * 엔진은 넓은 쪽 면적을 사업용으로 썼다(법 §104의3①4호 가·나·다목은 위계 없는 병렬 제외 사유 — 단순 합산은 같은 땅을 두 번 세는 이중 계상이라 하지 않는다).
 * 두 범위는 위치 입력이 없어 겹치는지 알 수 없다 — 서로 다른 위치라면 사업용으로 인정되는 면적이 더 넓을 수 있다.
 */
export const NBL_EXCLUSION_RANGE_POSITION_NOTICE =
  `${NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION}의 면적 범위와 ${NBL.OTHER_LAND_BUSINESS}의 호별 기준면적이 모두 일부 면적만 사업용으로 인정돼 넓은 쪽 면적을 사업용으로 계산했습니다. ` +
  `두 범위가 토지의 서로 다른 위치라면 사업용으로 인정되는 면적이 더 넓을 수 있습니다 — 확인 필요.`;

/**
 * NBL2611-V8-VL04 — 별장 부속토지의 범위를 가르는 경계 판정을 하지 않았다는 고지.
 * 법 §104의3①6호 후단 「별장에 부속된 토지의 경계가 명확하지 아니한 경우에는 그 건축물 바닥면적의 10배에 해당하는 토지를 부속토지로 본다」 —
 * 엔진은 입력한 토지 면적 전체를 부속토지로 보아 판정하고, 경계 불명확 시 바닥면적 10배 한도는 적용하지 않는다.
 */
export const NBL_VILLA_LAND_SCOPE_NOTICE =
  `입력한 토지 면적 전체를 별장의 부속토지로 보아 판정했습니다. ${NBL.MAIN} ① 6호 후단은 별장에 부속된 토지의 경계가 명확하지 아니한 경우 ` +
  `그 건축물 바닥면적의 10배에 해당하는 토지를 부속토지로 본다고 정하는데, 이 경계 판정(바닥면적 10배 한도)은 하지 않았습니다 — 확인 필요.`;

/**
 * NBL2611-V3-O — 무조건 사업용 의제 중 규칙 §83의5④ 3~7호는 지원하지 않는다는 고지(입력 화면용).
 * 영 §168의14③5호가 위임한 규칙 §83의5④는 1·2호(공장 오염피해 인접토지·이농 농지)만 입력으로 받는다.
 */
export const NBL_UNCONDITIONAL_RULE_4_UNSUPPORTED_NOTICE =
  `${NBL.UNCONDITIONAL_RULE_4_3_TO_7}의 사유 — 부실징후기업·관리대상기업이 약정에 따라 양도하는 토지(3·4호), 산업시설구역의 산업용지를 관리기관에 양도하는 토지(5호), ` +
  `방조제공사 보상으로 조성된 농지를 8년 이상 직접 경작한 경우(6호), 회생계획인가 결정에 따라 양도하는 토지(7호) — 는 이 화면이 지원하지 않습니다. ` +
  `해당하면 무조건 사업용 여부를 따로 확인하세요 — 확인 필요.`;

/** NBL2611-V1-OL06 — 재산세 과세 분류 칸의 출처 안내(입력 hint). 선택하는 값은 사용자가 확인한 사실이다. */
export const NBL_PROPERTY_TAX_TYPE_SOURCE_HINT =
  "해당 토지의 재산세 과세내역(고지서) 또는 위택스(www.wetax.go.kr)의 재산세 과세내역에서 과세 구분을 확인해 선택하세요.";

/**
 * NBL2611-V1-OL06 (Q-2 (가)) — 한 필지에 별도합산과 종합합산이 섞여 부과된 경우의 선택 안내 + 확인 필요.
 * 판정 로직은 바꾸지 않는다: 이 칸은 하나만 고를 수 있고, 「지방세법 시행령」 §101① 단서는 판정하지 않는다.
 */
export const NBL_PROPERTY_TAX_TYPE_MIXED_NOTICE =
  `한 필지의 고지서에 별도합산과 종합합산이 함께 부과된 경우 이 칸에는 하나만 고를 수 있습니다. ` +
  `${NBL.BUILDING_SITE_SEPARATE_AGG_PROVISO}(허가 등을 받지 않은 건축물, 사용승인 없이 사용 중인 건축물의 부속토지는 별도합산 제외) 해당 여부는 판정하지 않으며, ` +
  `어느 쪽을 선택했는지에 따라 비사업용 판정이 달라질 수 있습니다 — 확인 필요.`;

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

/**
 * NBL2611-V7-DM02 · Q-6 (다) — 5호 예비군훈련장으로 인정한 토지에서 입력으로 판정할 수 없는 요건. 엔진은 나목(도시지역 주·상·공 지역 밖)과
 * 다목의 기준면적만 판정한다. 가목(지목)·다목의 시설기준·라목(소유자)은 자기 선언이다.
 */
export const NBL_RESERVE_FORCES_SELF_DECLARED_NOTICE =
  `${NBL.OTHER_LAND_HO_RESERVE}(예비군훈련장)의 요건 중 가목(지목이 대지 또는 공장용지가 아닐 것)·다목의 시설기준(소득세법 시행규칙 별표 6 제1호)·` +
  `라목(수임 군부대의 장으로부터 예비군훈련의 실시를 위임받은 자가 소유할 것)은 판정하지 않았습니다 — 자기 선언 요건, 확인 필요.`;

/**
 * NBL2611-V9-DM11 · Q-6 (다) — 13호 무주택 1세대 나지로 인정한 토지에서 입력으로 판정할 수 없는 요건. 엔진은 «건축물 없음(나지)»과 660㎡ 한도만 판정한다.
 */
export const NBL_VACANT_LOT_SELF_DECLARED_NOTICE =
  `${NBL.OTHER_LAND_HO_VACANT_LOT}(무주택 1세대 1필지 나지)의 요건 중 주택을 소유하지 아니하는 1세대일 것, 1필지일 것(나지가 2필지 이상이면 소득세법 시행규칙 §83조의4 ⑰의 선택·순위), ` +
  `주택 신축이 금지·제한되는 지역에 소재하지 아니하고 지목이 대지이거나 실질적으로 주택을 신축할 수 있을 것(같은 조 ⑯)은 판정하지 않았습니다 — 자기 선언 요건, 확인 필요.`;

/**
 * NBL2611-V5-G1 (C2 남은 한계) — 상가의 토지분·건물분 양도차익 부호가 달라(한쪽이 양도차손) 장기보유특별공제와 통산을 자산 단위 순액으로 계산했다는 고지.
 * 비사업용 파트와 그 밖의 파트의 장특은 파트로 가르지만, 건물분 차손과 사업용 토지분 차익은 한 파트(그 밖의 파트) 안에서 순액으로 합쳐진다.
 */
export const NBL_CB_MIXED_SIGN_LTHD_NOTICE =
  `상가의 토지분과 건물분 양도차익의 부호가 달라(한쪽이 양도차손) 장기보유특별공제(${TRANSFER.LONG_TERM_DEDUCTION})와 양도차손 통산(${TRANSFER.LOSS_OFFSET})을 ` +
  `비사업용 파트와 그 밖의 파트로만 나눠 계산하고 그 밖의 파트 안에서는 토지분·건물분 순액으로 보았습니다. 토지분과 건물분을 별개의 자산으로 보아 각각 장기보유특별공제를 공제한 뒤 통산하면 결과가 달라질 수 있습니다 — 확인 필요.`;

/** 상가 비사업용 파트가 적용됐고 토지분·건물분 양도차익의 부호가 서로 다르면 고지, 아니면 `undefined`. */
export function cbMixedSignLthdNotice(part: { applied: boolean; landGain: number; buildingGain: number } | undefined): string | undefined {
  if (!part?.applied) return undefined;
  return (part.landGain > 0 && part.buildingGain < 0) || (part.landGain < 0 && part.buildingGain > 0) ? NBL_CB_MIXED_SIGN_LTHD_NOTICE : undefined;
}
