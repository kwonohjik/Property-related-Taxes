/**
 * 주식 양도소득세 — 취득 후 상장 환산취득가 모듈
 *
 * 시행령 §165⑤ 본문 + 단서 (Phase A KoreanLaw 검증 2026-05-18):
 *   양도일 현재 상장주식이지만 취득당시 비상장이었던 경우
 *   → 환산식 적용
 *
 * 취득기준시가 = 상장일 이후 1개월 종가평균
 *             × (취득일 직전 사업연도 비상장 평가액 / 상장일 직전 사업연도 비상장 평가액)
 *
 * ★ "상장일 이후 1개월" 확정 (Phase A — v3 "상장일 1개월" 모호 표현 정정):
 *   §165⑤ 본문이 "코스닥/코넥스 상장일 현재의 제4항에 따른 평가액"을 분모로 사용.
 *   상장일 이전은 비상장 기간 → 종가 미존재.
 *   PDF 사례 48 입력 일자 2009-08-21(상장)~2009-09-21 일치.
 *
 * 비상장 평가: (순손익가치 ÷ 10%) × 3/5 + 순자산가치 × 2/5
 *   (시행령 §165④1 본칙 — 부동산과다보유 가중치 반전은 PR-2에서)
 *   80% 하한은 양도일 평가에만 적용. 환산비율 분자·분모에는 미적용.
 *
 * 환원율 10% 위임 체인 (Phase A 정정):
 *   소령 §165④1 가목 → 시행규칙 §81② → 상증법 시행규칙 §17 → 연간 100분의 10
 *   ※ v3 "시행규칙 §82" 인용은 오류 (소법 시행규칙 §82 = "신축주택·미분양주택 요건")
 *
 * 소칙 §81④ 월할 가산 (§165⑨ 위임):
 *   취득일 평가 = 상장일 평가인 동일 사업연도 케이스
 *   양도당시 기준시가 = 직전 사업연도 기준시가 + (직전 − 전전) × (보유월수 / 직전 사업연도 월수)
 *   1개월 미만은 1개월로 본다.
 *
 * 사례 48 본칙 anchor:
 *   상장일 직전 사업연도 평가 = 61,570 × 3/5 + 5,352 × 2/5 = 39,083
 *   취득일 직전 사업연도 평가 = 44,520 × 3/5 + 4,348 × 2/5 = 28,451
 *   환산비율         = 28,451 / 39,083 = 0.72792...
 *   1주당 취득기준시가 = floor(8,001 × 0.72792) = 5,824
 *   취득가액         = 5,824 × 5,000 = 29,120,000
 */

import type {
  StockTransferInput,
  PostListingValuationResult,
  NIYear,
  NAYear,
} from "./types/stock-transfer.types";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

// 본 모듈에서 사용하는 PostListingValuationResult는 types/stock-transfer.types.ts에서 단일 정의 (Phase C4 통합).
// detail 필드는 단순 환산(simple 모드)에서는 채우지 않음 — full/listing_only는 buildPostListingFromDetail(C6)에서 채움.
export type { PostListingValuationResult };

// ============================================================
// Phase C5 — 엔진 헬퍼 H-01 ~ H-04 (export)
// UI 미리보기·anchor 테스트에서 직접 import하여 재사용
// [[feedback_ui_engine_dual_truth_avoidance]] — UI 자체 산식 재구현 금지
// ============================================================

/**
 * H-01 — 종가 1개월 평균 (소령 §165⑤ — 상장일 이후 1개월)
 * @param dates  YYYY-MM-DD 배열 (휴일·주말은 빈 문자열)
 * @param closes 원 배열 (휴일·주말은 빈 문자열 또는 0)
 * @returns { tradingDays, sum, avg } — avg는 1주당 원 단위 절사
 */
export function calcMonthlyClosingAverage(
  dates: string[],
  closes: number[],
): { tradingDays: number; sum: number; avg: number } {
  // 거래일 = closes > 0 인 셀 수
  let tradingDays = 0;
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && c > 0) {
      tradingDays += 1;
      sum += c;
    }
  }
  if (tradingDays <= 0) return { tradingDays: 0, sum: 0, avg: 0 };
  return { tradingDays, sum, avg: Math.floor(sum / tradingDays) };
}

/**
 * H-02 — 1주당 순손익가치 (상증령 §54 동치)
 * netIncomeAmount = sum(addA) − sum(subB)
 * perShareIncome = floor(netIncomeAmount / shareCount)
 * perShareValue  = floor(perShareIncome / discountRate)   ※ 환원율 default 0.10
 */
export function calcNetIncomePerShare(
  year: NIYear,
): { netIncomeAmount: number; perShareIncome: number; perShareValue: number } {
  const addA = (year.addA ?? []).reduce((s, v) => s + (v || 0), 0);
  const subB = (year.subB ?? []).reduce((s, v) => s + (v || 0), 0);
  const netIncomeAmount = addA - subB;
  const shareCount = year.shareCount || 0;
  if (shareCount <= 0) return { netIncomeAmount, perShareIncome: 0, perShareValue: 0 };
  const perShareIncome = Math.floor(netIncomeAmount / shareCount);
  const discountRate = year.discountRate > 0 ? year.discountRate : 0.10; // 시행규칙 §81② → 상증령 §17
  const perShareValue = Math.floor(perShareIncome / discountRate);
  return { netIncomeAmount, perShareIncome, perShareValue };
}

/**
 * H-03 — 1주당 순자산가치 (상증령 §55 동치)
 * assetSubtotal = assetTotalRow1 + sum(assetAdd) − sum(assetSub)
 * liabSubtotal  = liabTotalRow8 + sum(liabAdd) − sum(liabSub)
 * netAssetAmount = assetSubtotal − liabSubtotal + goodwillRow19
 * perShareAsset  = floor(netAssetAmount / shareCount)
 */
export function calcNetAssetPerShare(
  year: NAYear,
): { netAssetAmount: number; perShareAsset: number } {
  const assetAdd = (year.assetAdd ?? []).reduce((s, v) => s + (v || 0), 0);
  const assetSub = (year.assetSub ?? []).reduce((s, v) => s + (v || 0), 0);
  const liabAdd = (year.liabAdd ?? []).reduce((s, v) => s + (v || 0), 0);
  const liabSub = (year.liabSub ?? []).reduce((s, v) => s + (v || 0), 0);
  const assetSubtotal = (year.assetTotalRow1 || 0) + assetAdd - assetSub;
  const liabSubtotal = (year.liabTotalRow8 || 0) + liabAdd - liabSub;
  const netAssetAmount = assetSubtotal - liabSubtotal + (year.goodwillRow19 || 0);
  const shareCount = year.shareCount || 0;
  if (shareCount <= 0) return { netAssetAmount, perShareAsset: 0 };
  return { netAssetAmount, perShareAsset: Math.floor(netAssetAmount / shareCount) };
}

/**
 * H-04 — 1주당 비상장 가중평균 평가액 (§165④1 본칙).
 * 일반: 순손익×3/5 + 순자산×2/5
 * 부동산과다보유법인 (§94①4 다목): 순손익×2/5 + 순자산×3/5 (반전)
 *
 * ★ 80% 하한 미적용 (환산비율 산정용). 양도일 평가는 별도.
 *
 * Phase C5 — Private → Export 전환 (UI Preview·anchor 재사용).
 */
export function calcUnlistedPerShareWeighted(
  netIncomeValue: number,
  netAssetValue: number,
  isHeavyRE: boolean = false,
): number {
  const weighted = isHeavyRE
    ? (netIncomeValue * 2) / 5 + (netAssetValue * 3) / 5
    : (netIncomeValue * 3) / 5 + (netAssetValue * 2) / 5;
  return Math.floor(weighted);
}

/**
 * 취득 후 상장 환산취득가 계산 (simple 모드 — 기존 4 결과값 직접 입력).
 *
 * full/listing_only 모드에서 80개 폼 필드로 nested 입력하는 경우는
 * `buildPostListingFromDetail()` (post-listing-flat-adapter.ts) 가
 * 본 4 필드를 합성하여 채운 뒤 본 함수를 호출한다.
 */
export function calcPostListingConversion(input: StockTransferInput): PostListingValuationResult {
  const {
    listingDatePriceAvg1Month,
    listingYearNetIncomePerShare,
    listingYearNetAssetPerShare,
    acquisitionYearNetIncomePerShare,
    acquisitionYearNetAssetPerShare,
    shareCount,
    postListingDetail,
  } = input;

  const mode = postListingDetail?.unlistedDetailMode ?? "simple";
  const appliedRules: string[] = [STOCK.ENFORCEMENT_DECREE_165_5_POST_LISTING];
  const warnings: string[] = [];

  // detail base — full/listing_only 모드에서 채움
  // Round 4 H-04: simple 모드도 mode + floor80NotApplied 명시 echo
  const detailBase: NonNullable<PostListingValuationResult["detail"]> = {
    mode,
    floor80NotApplied: true,
  };

  // 입력값 검증 (validate에서 차단해야 하지만 방어 처리)
  if (
    !listingDatePriceAvg1Month ||
    !listingYearNetIncomePerShare ||
    !listingYearNetAssetPerShare ||
    !acquisitionYearNetIncomePerShare ||
    !acquisitionYearNetAssetPerShare
  ) {
    warnings.push("취득 후 상장 환산에 필요한 입력값이 없습니다. validate에서 차단되어야 합니다.");
    return {
      listingYearPerShareValue: 0,
      acquisitionYearPerShareValue: 0,
      conversionRatio: 0,
      finalPerShareValue: 0,
      totalAcquisitionPrice: 0,
      monthlyAccrualApplied: false,
      appliedRules,
      warnings,
      detail: detailBase,
    };
  }

  // Round 4 H-04 — full/listing_only 모드: nested PostListingDetailInput에서 산출된 중간값 echo
  let detailExtended = detailBase as NonNullable<PostListingValuationResult["detail"]>;
  if (postListingDetail && postListingDetail.unlistedDetailMode !== "simple") {
    const closing = postListingDetail.closing
      ? calcMonthlyClosingAverage(postListingDetail.closing.dates, postListingDetail.closing.closes)
      : undefined;
    const niListing = postListingDetail.netIncome?.listing
      ? calcNetIncomePerShare(postListingDetail.netIncome.listing)
      : undefined;
    const naListing = postListingDetail.netAsset?.listing
      ? calcNetAssetPerShare(postListingDetail.netAsset.listing)
      : undefined;
    const niAcq = postListingDetail.unlistedDetailMode === "full" && postListingDetail.netIncome?.acquisition
      ? calcNetIncomePerShare(postListingDetail.netIncome.acquisition)
      : undefined;
    const naAcq = postListingDetail.unlistedDetailMode === "full" && postListingDetail.netAsset?.acquisition
      ? calcNetAssetPerShare(postListingDetail.netAsset.acquisition)
      : undefined;

    detailExtended = {
      mode,
      floor80NotApplied: true,
      closing,
      netIncome: niListing ? { listing: niListing, acquisition: niAcq } : undefined,
      netAsset: naListing ? { listing: naListing, acquisition: naAcq } : undefined,
    };
  }

  // §165⑤ 가중치 반전 (부동산과다보유법인 §94①4 다목 — 별개 임계 50%)
  const isHeavyRE = input.isHeavyRealEstateForValuation === true;

  // 상장일 직전 사업연도 비상장 평가
  const listingYearPerShareValue = calcUnlistedPerShareWeighted(
    listingYearNetIncomePerShare,
    listingYearNetAssetPerShare,
    isHeavyRE,
  );

  // 취득일 직전 사업연도 비상장 평가
  const acquisitionYearPerShareValue = calcUnlistedPerShareWeighted(
    acquisitionYearNetIncomePerShare,
    acquisitionYearNetAssetPerShare,
    isHeavyRE,
  );

  // 분모가 0인 경우 방어
  if (listingYearPerShareValue <= 0) {
    warnings.push("상장일 직전 비상장 평가액이 0 이하입니다. 환산 불가.");
    return {
      listingYearPerShareValue,
      acquisitionYearPerShareValue,
      conversionRatio: 0,
      finalPerShareValue: 0,
      totalAcquisitionPrice: 0,
      monthlyAccrualApplied: false,
      appliedRules,
      warnings,
      detail: detailExtended,
    };
  }

  // 월할 가산 분기 (소칙 §81④)
  // 취득일 평가 = 상장일 평가인 경우 → 월할 보정 적용
  // PR-1 범위: 월할 가산 플래그만 기록, 실제 산식은 PR-2에서
  // 현재는 취득·상장 평가액이 동일한지만 확인
  const monthlyAccrualApplied = acquisitionYearPerShareValue === listingYearPerShareValue;
  if (monthlyAccrualApplied) {
    appliedRules.push(STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL);
    warnings.push(
      "취득일 직전과 상장일 직전 비상장 평가액이 동일합니다. " +
      "소칙 §81④ 월할 가산 적용 대상 — PR-2에서 월할 보정값 적용 예정."
    );
  }

  // 환산비율 = 취득일 직전 평가 / 상장일 직전 평가
  // 부동소수점 정밀도: 비율 계산은 부동소수 그대로 유지, 최종 1주당만 floor
  const conversionRatio = acquisitionYearPerShareValue / listingYearPerShareValue;

  // 1주당 취득기준시가 = floor(상장일 1개월 종가평균 × 환산비율)
  const rawPerShare = listingDatePriceAvg1Month * conversionRatio;
  const finalPerShareValue = Math.floor(rawPerShare);

  const totalAcquisitionPrice = finalPerShareValue * shareCount;

  return {
    listingYearPerShareValue,
    acquisitionYearPerShareValue,
    conversionRatio,
    finalPerShareValue,
    totalAcquisitionPrice,
    monthlyAccrualApplied,
    appliedRules,
    warnings,
    detail: detailExtended,
  };
}
