/**
 * 주식 양도소득세 — 취득 후 상장 환산취득가 모듈
 *
 * 시행령 §165⑤ 단서:
 *   양도일 현재 상장주식이지만 취득당시 비상장이었던 경우
 *   → 환산식 적용
 *
 * 취득기준시가 = 상장일 1개월 종가평균
 *             × (취득일 직전 비상장 평가액 / 상장일 직전 비상장 평가액)
 *
 * 비상장 평가: (순손익가치 ÷ 10%) × 3/5 + 순자산가치 × 2/5
 * (시행령 §165④1 본칙 — 부동산과다보유 가중치 반전은 PR-2에서)
 *
 * 소칙 §81④ 월할 가산:
 *   취득일 평가 = 상장일 평가인 경우 → 사업연도 내 월할 보정
 *
 * 사례 48 본칙 anchor:
 *   상장일 직전 평가 = 61,570 × 3/5 + 5,352 × 2/5 = 39,083
 *   취득일 직전 평가 = 44,520 × 3/5 + 4,348 × 2/5 = 28,451
 *   환산비율         = 28,451 / 39,083 = 0.72792...
 *   1주당 취득기준시가 = floor(8,001 × 0.72792) = 5,824
 *   취득가액         = 5,824 × 5,000 = 29,120,000
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

export interface PostListingValuationResult {
  /** 상장일 직전 비상장 1주당 평가액 */
  listingYearPerShareValue: number;
  /** 취득일 직전 비상장 1주당 평가액 */
  acquisitionYearPerShareValue: number;
  /** 환산비율 = 취득일 평가 / 상장일 평가 */
  conversionRatio: number;
  /** 1주당 취득기준시가 = floor(상장일 1개월 종가평균 × 환산비율) */
  finalPerShareValue: number;
  /** 취득가액 = 1주당 취득기준시가 × 주식수 */
  totalAcquisitionPrice: number;
  /** 월할 가산 적용 여부 (소칙 §81④) */
  monthlyAccrualApplied: boolean;
  appliedRules: string[];
  warnings: string[];
}

/**
 * 비상장 1주당 평가액 계산 (§165④1 본칙 — 가중평균)
 * 순손익가치 × 3/5 + 순자산가치 × 2/5
 *
 * ★ 입력값 규약:
 *   netIncomeValue = 1주당 순손익가치 (= 1주당 순손익액 ÷ 10%를 이미 반영한 값)
 *   netAssetValue  = 1주당 순자산가치
 *
 *   UI에서 순손익가치(= 순손익액 ÷ 할인율 10%)로 입력받음.
 *   본 함수에서는 ÷ 10% 재적용 금지.
 *   (사례 48: listingYearNetIncomePerShare=61,570 → 이미 순손익가치)
 *
 * 주의: 80% 하한(§165④1 단서)은 양도일 기준 비상장 평가 시 적용.
 * 취득 후 상장 환산비율 계산(분자·분모)에는 적용하지 않음.
 */
function calcUnlistedPerShareWeighted(
  netIncomeValue: number,  // 1주당 순손익가치 (÷10% 이미 반영)
  netAssetValue: number,   // 1주당 순자산가치
): number {
  // 가중평균: 순손익가치 × 3/5 + 순자산가치 × 2/5
  const weighted = (netIncomeValue * 3) / 5 + (netAssetValue * 2) / 5;
  // 1주당은 원 단위 미만 절사
  return Math.floor(weighted);
}

/**
 * 취득 후 상장 환산취득가 계산
 */
export function calcPostListingConversion(input: StockTransferInput): PostListingValuationResult {
  const {
    listingDatePriceAvg1Month,
    listingYearNetIncomePerShare,
    listingYearNetAssetPerShare,
    acquisitionYearNetIncomePerShare,
    acquisitionYearNetAssetPerShare,
    shareCount,
  } = input;

  const appliedRules: string[] = [STOCK.ENFORCEMENT_DECREE_165_5_POST_LISTING];
  const warnings: string[] = [];

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
    };
  }

  // 상장일 직전 사업연도 비상장 평가
  const listingYearPerShareValue = calcUnlistedPerShareWeighted(
    listingYearNetIncomePerShare,
    listingYearNetAssetPerShare,
  );

  // 취득일 직전 사업연도 비상장 평가
  const acquisitionYearPerShareValue = calcUnlistedPerShareWeighted(
    acquisitionYearNetIncomePerShare,
    acquisitionYearNetAssetPerShare,
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
  };
}
