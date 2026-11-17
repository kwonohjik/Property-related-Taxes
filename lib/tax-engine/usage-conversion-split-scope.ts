/**
 * 비주택 → 주택 용도변경(「소득세법」 §95⑤·⑥) × 토지·건물 분리 계산 — **지원하지 않는 조합**의 단일 판정(엔진·⑫ 공용, ⑧은 ④ 전송 조건으로 같은 사실을 읽는다).
 *
 * 엔진은 토지 취득일이 오면 토지·건물을 나눠 계산하고(`calcSplitGain` — `landAcquisitionDate`가 진입 조건), 그 경우 §95⑤ 혼합공제를 건너뛴다
 * (`transfer-tax-lthd.ts` `!splitDetail`). 종전에는 ⑧ C-19가 「별개 취득 토글」만 봐서 토글 없이 토지 취득일이 실리는 경로(상속·증여 소유자 분리 ·
 * 파트 이월과세 · 배율 초과분 분리 · 개별주택가격 미공시 환산)와 ⑫(API 직접 호출)가 통과했고, 용도변경이 **조용히 무시된** 세액이 나왔다
 * (2026-11-17 실측 — 증여 토지만 본인 + 용도변경 토지 60% · API 같은 날 분리 + 용도변경 43,901,000 vs 분리 없음 47,245,000).
 * 사용자 결정(2026-11-17): 구현하지 않고 빈틈없이 막는다 — 파트별 §95⑤ 적용은 정면 해석을 찾지 못했다.
 */
import { TRANSFER } from "./legal-codes";

export const USAGE_CONVERSION_SPLIT_UNSUPPORTED_MESSAGE =
  `건물 전체를 주택으로 용도변경한 자산(${TRANSFER.LONG_TERM_DEDUCTION_CONVERSION})은 토지·건물을 나눠 계산하는 경우(토지 취득일 입력 — 토지·건물 취득일 다름 · 소유자 다름 · ` +
  "배율 초과분 분리 · 개별주택가격 미공시 환산 등)와 함께 계산하지 않습니다 — 용도변경이 조용히 빠진 세액이 나오지 않도록 막습니다";

/** 엔진·⑫ 입력에서 읽는다 — 주택·건물(분리 계산 대상)에 용도변경과 토지 취득일이 함께 오면 true. */
export function usageConversionSplitConflict(a: {
  propertyType?: string;
  nonHousingToHousingConversion?: unknown;
  landAcquisitionDate?: unknown;
}): boolean {
  if (a.propertyType !== "housing" && a.propertyType !== "building") return false;
  return !!a.nonHousingToHousingConversion && !!a.landAcquisitionDate;
}
