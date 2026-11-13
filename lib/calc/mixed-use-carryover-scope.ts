/**
 * 겸용주택 분리계산 × 이월과세(증여) — **지원하지 않는다**(계획서 `docs/00-pm/mixed-use-4col-separate-acq-bg-carryover.plan.md` Q-1 a).
 *
 * 겸용 엔진(`calcMixedUseTransferTax`)에는 이월과세 처리가 없다. ⑧은 `carryover_gift` 분기(이월과세 전용 검증)가 겸용 분기보다 먼저라 통과했고,
 * 라우트의 겸용 분기(`route.ts` 5-a-2)가 `carryoverTaxation`을 읽지 않아 **이월과세가 조용히 무시**됐다(같은 조건의 «매매 + 환산» 겸용과 4열 전 행이 같았다).
 * 컴패니언 겸용은 파트 카드 5장이 증여자 취득가액 전액을 각각 받았다.
 *
 * ⑧(`validateAssetAcquisition`) · ⑫(단건 `refineMixedUseNoCarryover` · 컴패니언 `refineCompanionMixedUseNoCarryover`) · ⑤ 취득원인 선택지가 **같은 문구·같은 술어**를 쓴다.
 * 겸용 × **부담부증여**의 이월과세(MB-9)는 별도 가드(`mixed-use-burdened-gift-prepare.ts`)가 막으므로 이 규칙 밖이다.
 */
export const MIXED_USE_CARRYOVER_UNSUPPORTED_MESSAGE =
  "겸용주택 분리계산은 이월과세(증여) 취득을 지원하지 않습니다 — 이월과세 입력이 세액에 반영되지 않아 계산을 막습니다.";

/** ⑤ 선택지에 붙는 짧은 사유. */
export const MIXED_USE_CARRYOVER_OPTION_HINT = "겸용주택 미지원";

type ScopeAsset = {
  assetKind?: string;
  isMixedUseHouse?: boolean;
  acquisitionCause?: string;
  transferType?: string;
};

/** ⑧·⑤용 — 폼 자산이 겸용 일반 양도(부담부증여 아님)이면서 이월과세 취득원인인가. */
export function isMixedCarryoverUnsupported(a: ScopeAsset): boolean {
  return (
    a.assetKind === "housing" &&
    a.isMixedUseHouse === true &&
    a.acquisitionCause === "carryover_gift" &&
    a.transferType !== "burdened_gift"
  );
}

type ScopeRequest = {
  mixedUse?: unknown;
  acquisitionCause?: string;
  transferType?: string;
  burdenedGiftInfo?: unknown;
};

/** ⑫용 — 요청 body(단건 본체·컴패니언 항목 공용)가 겸용 일반 양도 + 이월과세 취득원인인가. 부담부증여는 `burdenedGiftInfo`로 가른다. */
export function isMixedCarryoverRequest(d: ScopeRequest): boolean {
  return !!d.mixedUse && d.acquisitionCause === "carryover_gift" && d.transferType !== "burdened_gift" && !d.burdenedGiftInfo;
}
