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
 * NBL-STATE-HISTORY-E1 — 기타토지 소유기간 중 상태 이력(건축물 신축·멸실 사건) 고지 문구 — 단일 소스. **E1에서는 어느 판정 경로도 싣지 않는다**(E2가 `applyStateHistory`에서 싣는다).
 * 기존 `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`(이력 없음 경로)는 바이트 동일하게 유지한다 — 이력 모드별 문구는 아래 상수가 따로 맡는다.
 * 결과 카드·입력 화면은 문구를 새로 짓지 않고 이 상수를 읽는다(UI R9·R14). 법 인용은 `NBL` 상수에서만 조립한다.
 */

/** `changed`로 구간 판정을 적용한 뒤 남은 한계(통합 Q-7 · 엔진 V-5). 이력 없음 고지(`NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`)를 대체한다. */
export const NBL_STATE_HISTORY_APPLIED_NOTICE =
  `소유기간 중 건축물의 신축·멸실 사건을 입력한 대로 건축물 유무와 철거 직전 재산세 구분만 기간별(일 단위 구간)로 판정했습니다. ` +
  `그 밖의 이용 상태(업종·호별 용도·면적·재산세 분류)는 양도일 현재 값을 소유기간 전체에 적용했고, 건축물이 있던 구간은 건축물 부속토지의 기준면적(바닥면적 × 적용배율) 이내라고 전제했습니다 — ` +
  `확인 필요 (${NBL.MAIN} ① 각 호 외의 부분 · ${NBL.CRITERIA}).`;

/** `unchanged`(소유기간 중 건축물 유무가 바뀐 적 없음) — 건축물 유무에 관한 「양도일 현재 상태 적용」 고지를 줄이고 유무 외 상태만 남긴다. */
export const NBL_STATE_HISTORY_UNCHANGED_NOTICE =
  `소유기간 중 건축물 유무가 바뀐 적이 없다는 답에 따라 판정했습니다. 건축물 유무 외의 이용 상태(업종·호별 용도·재산세 분류)는 양도일 현재 값을 소유기간 전체에 적용했습니다 — ` +
  `확인 필요 (${NBL.MAIN} ① 각 호 외의 부분 · ${NBL.CRITERIA}).`;

/** `unknown`(모름) — 현행 판정 + 확인 필요. 엔진은 현행 고지(`NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`)에 이 문구를 더한다(「모름」 = 혜택 불성립이 아니라 현행 + 고지 — 통합 Q-6). */
export const NBL_STATE_HISTORY_UNKNOWN_NOTICE =
  `소유기간 중 건축물 유무 이력을 확인하지 못했습니다. 양도일 현재의 상태를 소유기간 전체에 적용한 결과이므로 이력을 확인하면 결과가 달라질 수 있습니다 — 확인 필요.`;

/** 면적 일부만 비사업용으로 판정되는 경로(배율 초과·공장 초과·2% 바닥면적·호별·연접·복합용도)는 이력을 반영하지 않는다(통합 Q-8 (가)). */
export const NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE =
  `이 토지는 면적의 일부만 비사업용으로 판정되는 경로라 입력한 건축물 이력(기간별 구간)을 판정에 반영하지 않았습니다. 면적과 기간을 함께 따지는 판정은 지원하지 않습니다 — 확인 필요.`;

/** 양도일 의제 사유(영 §168조의14 ②)가 선택돼 있으면 이력을 적용하지 않는다(통합 Q-9 (가)). */
export const NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE =
  `${NBL.TRANSFER_DATE_PRESUMED}의 양도일 의제 사유를 선택해, 입력한 건축물 이력은 판정에 쓰지 않았습니다. 의제일 이후의 사건과 양도일 현재 상태가 어긋날 수 있기 때문입니다 — 확인 필요.`;

/** 철거 사건의 «철거 직전 재산세 구분»이 모름(`""`)일 때(통합 Q-3 (가)) — UI가 행 아래에 그대로 보인다. */
export const NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE =
  `재산세 구분을 모르면 철거 전 구간을 종합합산으로 보아 판정하고 확인 필요로 표시합니다. 재산세 납세고지서(과세구분)로 확인할 수 있습니다.`;

/** `changed`일 때 «당해 사업개시일» 칸 안내 — 개시일이 있으면 소유기간 중 그 날부터 양도일까지를 사업용 구간으로 센다(통합 Q-15 (가′): 이력과 합쳐 판정, 건너뛰지 않는다). */
export const NBL_STATE_HISTORY_REVENUE_START_NOTICE =
  `당해 사업개시일이 있으면 소유기간 중 그 날부터 양도일까지를 사업용 구간으로 세어, 입력한 건축물 이력의 사업용 구간과 함께 판정합니다. ` +
  `사업개시일 전 기간은 건축물 이력으로만 판정하고 다른 사용(업종 등)은 반영하지 않습니다 — 확인 필요.`;

/** 철거·신축 사건이 유예기간을 자동으로 만들지 않는다(통합 Q-10 (가)) — 사용자가 유예 사유를 직접 입력해야 경계(철거일 = 유예 시작일)가 맞는다. */
export const NBL_STATE_HISTORY_GRACE_ROW_NOTICE =
  `건축물 철거·신축 사건을 입력해도 유예기간은 자동으로 만들지 않습니다. 유예 사유에 해당하면 「부득이한 사유 유예기간」에 직접 입력하세요 — ` +
  `철거는 철거일을 기산일로 「건축물 멸실·철거·붕괴」(9호), 건축은 착공일부터 준공일까지를 「건설 착공」(5호)으로 입력하면 사건 구간과 경계가 맞습니다 (${NBL.UNAVOIDABLE_PERIOD}).`;

/**
 * NBL2611-V1-B — 기타토지에서 나목(재산세 별도합산·분리과세 면적 범위)과 다목(영 §168의11① 호별 기준면적)이 **둘 다** 일부 면적만 사업용으로 인정했을 때,
 * 엔진은 넓은 쪽 면적을 사업용으로 썼다(법 §104의3①4호 가·나·다목은 위계 없는 병렬 제외 사유 — 단순 합산은 같은 땅을 두 번 세는 이중 계상이라 하지 않는다).
 * 두 범위는 위치 입력이 없어 겹치는지 알 수 없다 — 서로 다른 위치라면 사업용으로 인정되는 면적이 더 넓을 수 있다.
 */
export const NBL_EXCLUSION_RANGE_POSITION_NOTICE =
  `${NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION}의 면적 범위와 ${NBL.OTHER_LAND_BUSINESS}의 호별 기준면적이 모두 일부 면적만 사업용으로 인정돼 넓은 쪽 면적을 사업용으로 계산했습니다. ` +
  `두 범위가 토지의 서로 다른 위치라면 사업용으로 인정되는 면적이 더 넓을 수 있습니다 — 확인 필요.`;

/**
 * NBL2611-D1 (DM-01 · Q-4 (나)) — 수입금액비율을 충족했으나 직전 비율②가 미통과여서 사업 구간을 「당해 사업개시일 ~ 양도일」로 보아 기간기준을 판정했다는 고지.
 * 개시일 전의 토지 이용 상태(다른 사업용 사용·유예 사유 등)는 입력받지 않아 사업용으로 보지 않았다 — 상태 이력 입력 모델은 도입하지 않았다.
 */
export const NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE =
  `수입금액비율(${NBL.REVENUE_TEST})을 충족했으나 직전 비율②가 기준에 미달해, 이 토지를 그 업종에 사용한 구간을 당해 사업개시일부터 양도일까지로 보아 ` +
  `기간기준(${NBL.CRITERIA})을 판정했습니다. 사업개시일 전 기간의 이용 상태(다른 사업용 사용·유예 사유 등)는 반영하지 않았습니다 — 확인 필요.`;

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

/**
 * 일반건물 결과 상세에서 초과분(전체 비사업용 포함)이 있으면 붙는 고지 목록. 한도 이내면 빈 목록.
 * NBL2611-C4 — 수용 의제 고지(`expropriationDeemNotices`)는 초과분이 없어도(의제로 비사업용에서 빠진 경우 포함) 싣는다.
 */
export function gbExcessConfirmNotices(detail: { nonBusinessRatio?: number; expropriationDeemNotices?: string[] } | undefined): string[] {
  return [
    ...((detail?.nonBusinessRatio ?? 0) > 0 ? [NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE, NBL_STATE_AT_TRANSFER_APPLIED_NOTICE] : []),
    ...(detail?.expropriationDeemNotices ?? []),
  ];
}

/** 여러 일반건물 상세의 고지를 중복 없이 모은다 — 함께 양도·다건이 자산마다 같은 문구를 반복하지 않게. */
export function mergeGbExcessConfirmNotices(details: ReadonlyArray<{ nonBusinessRatio?: number; expropriationDeemNotices?: string[] } | undefined>): string[] {
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

/**
 * NBL2611-C4 (R16 · Q-3b) — 공익수용 양도인데 사업인정 고시일이 비어 배율 초과분의 무조건 의제(영 §168의14③3호)를 판정하지 못했다는 고지.
 * 「모름 = 혜택 불성립」 — 의제하지 않고 초과분을 비사업용으로 보았다. 입력을 막지는 않는다(고시일을 모르는 납세자도 계산은 받는다).
 */
export const NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE =
  `공익사업 수용 양도이나 사업인정 고시일이 입력되지 않아 배율(기준면적) 초과분에 대한 ${NBL.UNCONDITIONAL_PUBLIC}의 무조건 사업용 의제를 판정하지 못했습니다. ` +
  `의제하지 않고 초과분을 비사업용 토지로 보아 계산했습니다 — 사업인정 고시일을 입력하면 다시 판정합니다 — 확인 필요.`;

/**
 * NBL2611-C4 — 건물(비주택) 부속토지 초과분의 수용 의제에서 이월과세(법 §97의2) 토지는 적용 여부가 비교과세로 정해져 증여자 취득일로 소급할 수 없다는 고지.
 * 일반건물·상가 카드는 시나리오 분기 전에 초과분을 가르므로 수증일을 기준으로 판정했다 — 이월과세가 적용되면 증여자 취득일 기준이라 결과가 달라질 수 있다.
 */
export const NBL_EXPROPRIATION_CARRYOVER_BASIS_NOTICE =
  `배율 초과분의 ${NBL.UNCONDITIONAL_PUBLIC} 판정에서 이월과세(소득세법 §97의2) 토지는 수증일을 취득일로 보았습니다. ` +
  `이월과세가 적용되면 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날이 기준이라(같은 호 나목 괄호) 의제 여부가 달라질 수 있습니다 — 확인 필요.`;
