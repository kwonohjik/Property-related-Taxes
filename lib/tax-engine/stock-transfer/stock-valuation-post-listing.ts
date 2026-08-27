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
 *   (시행령 §165④1 본칙 — 부동산과다보유법인 §94①4 다목은 가중치 2:3 반전)
 *
 * 🔴 **2026-08-10 정정 — 종전에는 환산비율 분자·분모에 80% 하한을 걸지 않았다**
 *   (종전 주석: "80% 하한은 양도일 평가에만 적용. 환산비율 분자·분모에는 미적용").
 *   근거가 인용된 적이 **한 번도 없다** — §165④ 취득측 하한과 **같은 뿌리**의 자기참조였다
 *   ([[project_stock_unlisted_acq_basis_floor80_open]]).
 *
 *   반면 §165⑤ 본문은 분자·분모를 각각 「취득일 현재의 **제4항에 따른 평가액**」·
 *   「상장일 현재의 **제4항에 따른 평가액**」이라 부르고, 80% 하한은 바로 그 **제4항 제1호
 *   단서**다. 후단의 §165⑨ 준용 트리거도 「제4항에 따른 평가액이 **같은 경우**」라
 *   ⇒ **트리거 비교까지 하한 적용 후 값**이어야 한다.
 *
 *   ⇒ 평가액 산정은 `valuation-165-4-basis.ts`의 `calcSection165_4Value` **단일 정본**에 위임한다
 *     (가중치·하한 연혁 게이팅 = 양도일 기준).
 *
 *   ⚠️ **하한은 「비율」에 걸리지 않는다** — 환산비율이 0.8 미만이어도 0.8로 끌어올리지 않는다.
 *      분자·분모 각각의 평가액에 개별로 걸릴 뿐이다 (회귀 보호: PL-FLOOR-1·2).
 *
 * 환원율 10% 위임 체인 (Phase A 정정):
 *   소령 §165④1 가목 → 시행규칙 §81② → 상증법 시행규칙 §17 → 연간 100분의 10
 *   ※ v3 "시행규칙 §82" 인용은 오류 (소법 시행규칙 §82 = "신축주택·미분양주택 요건")
 *
 * 소칙 §81④ 월할 가산 (§165⑤ 후단 → §165⑨ 준용, 2단 조건):
 *   [1단] §165⑤ 후단 트리거 — 취득일 §4항 평가액 == 상장일 §4항 평가액
 *   [2단] §81④ 1호/2호 구분 (monthlyAccrualToggle):
 *     1호(ON, 동일 사업연도 취득·상장): 상장일 평가액을 아래 보정값으로 교체(= 환산식 분모 교체)
 *       보정 평가액 = 직전 사업연도 평가 + (직전 − 전전) × (보유월수 ÷ 직전 사업연도 월수)
 *       ※ 1개월 미만의 월수는 1개월로 본다 (calcAccrualMonths 절상)
 *     2호(OFF): 보정 없음 — 상장일 평가액 그대로
 *   monthlyAccrualApplied = true는 1호 보정 실제 발동 시에만 (감지 아님).
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
import { calcAccrualMonths, apply81_4Accrual } from "./apply-81-4-accrual";
import { calcSection165_4Value } from "./valuation-165-4-basis";

// §81④ 월할 헬퍼는 apply-81-4-accrual.ts로 추출(본체·준용 공용). import 경로 보존 위해 re-export.
export { calcAccrualMonths } from "./apply-81-4-accrual";

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
 * [B-5] 증자·합병 기간 조정 종가평균 (상증령 §52의2②2호 — §99①3·§63①1가목 준용 해석)
 *
 * 상장일 이후 1개월(forward 윈도우) 종가평균 산정 중 증자·합병 발생 시,
 * 사유 발생일 이전(전일까지) 종가만 평균(발생일·이후 제외). 환산주식수 아닌 기간 절단.
 *
 * ★ §165⑤ proxy 적용은 해석 — 명문·예규 미확인(사용자 결정 2026-06-13).
 *   윈도우 밖 발생일·절단 후 0건은 전체 평균 + warning(자동 fallback 금지 → 절단만 미적용).
 *
 * @returns avg(절단 후) · tradingDays · truncation(발동 시) · warning(C-3·C-5)
 */
export function calcClosingAvgWithEvent(closing: {
  dates: string[];
  closes: number[];
  basisDate: string;
  hasIncrease: boolean;
  increaseDate?: string;
}): {
  avg: number;
  sum: number;
  tradingDays: number;
  truncation?: { eventDate: string; includedDays: number; excludedDays: number };
  warning?: string;
} {
  const base = calcMonthlyClosingAverage(closing.dates, closing.closes);
  if (!closing.hasIncrease || !closing.increaseDate) {
    return { avg: base.avg, sum: base.sum, tradingDays: base.tradingDays }; // C-1
  }

  const event = closing.increaseDate;
  // §52의2②2호 (forward 윈도우): 상장일 ~ 발생일 전일. date < event 인 거래일만.
  // YYYY-MM-DD 고정 포맷 → 문자열 사전식 비교 = 날짜순(Date 객체·timezone 함정 회피).
  const keptDates: string[] = [];
  const keptCloses: number[] = [];
  let excluded = 0;
  for (let i = 0; i < closing.dates.length; i++) {
    const d = closing.dates[i];
    const c = closing.closes[i];
    if (!d || typeof c !== "number" || c <= 0) continue; // 빈 셀(주말·휴일)
    if (d < event) {
      keptDates.push(d);
      keptCloses.push(c);
    } else {
      excluded += 1; // 발생일 당일·이후
    }
  }

  // C-3: 발생일이 윈도우 밖(이후 종가 없음 = 제외 0) → 절단 무효, 전체 평균 + warning
  if (excluded === 0) {
    return {
      avg: base.avg,
      sum: base.sum,
      tradingDays: base.tradingDays,
      warning:
        "증자·합병 발생일이 종가 윈도우(상장일 이후 1개월) 밖이거나 이후 종가가 없어 기간 조정이 적용되지 않았습니다.",
    };
  }

  const trunc = calcMonthlyClosingAverage(keptDates, keptCloses);
  // C-5: 절단 후 거래일 0(모든 종가가 발생일 당일·이후) → 전체 평균 + warning
  if (trunc.tradingDays <= 0) {
    return {
      avg: base.avg,
      sum: base.sum,
      tradingDays: base.tradingDays,
      warning: "증자·합병 발생일 이전 종가가 없어 기간 조정이 적용되지 않았습니다.",
    };
  }

  return {
    avg: trunc.avg,
    sum: trunc.sum,
    tradingDays: trunc.tradingDays,
    truncation: { eventDate: event, includedDays: trunc.tradingDays, excludedDays: excluded }, // C-2
  };
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
 * ⚠️ **이것은 「본칙」이지 「제4항에 따른 평가액」이 아니다** — 단서(80% 하한)도 연혁 게이팅도
 *    들어 있지 않다. 산식 중간단계를 **표시**할 때만 쓴다.
 *    실제 평가액이 필요한 곳(엔진·validate·프리뷰 결론값)은 `calcSection165_4Value`를 쓸 것.
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
  // Round 4 H-04: simple 모드도 mode + 하한 발동 여부 명시 echo
  // (초기값 false/false — 실제 값은 평가 후 아래에서 덮어쓴다. 조기 return 경로는 평가 전이라 false.)
  const detailBase: NonNullable<PostListingValuationResult["detail"]> = {
    mode,
    floor80Applied: { listing: false, acquisition: false },
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
  // [B-5] 증자·합병 기간 절단 echo (상증령 §52의2②2호) — 발동 시만 채움
  let capitalEventTruncation: PostListingValuationResult["capitalEventTruncation"];
  if (postListingDetail && postListingDetail.unlistedDetailMode !== "simple") {
    // [B-5] calcClosingAvgWithEvent — 절단 평균 + truncation/warning 동시 산출
    const closingResult = postListingDetail.closing
      ? calcClosingAvgWithEvent(postListingDetail.closing)
      : undefined;
    const closing = closingResult
      ? { tradingDays: closingResult.tradingDays, sum: closingResult.sum, avg: closingResult.avg }
      : undefined;
    if (closingResult?.truncation) capitalEventTruncation = closingResult.truncation;
    if (closingResult?.warning) warnings.push(closingResult.warning);
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
      floor80Applied: { listing: false, acquisition: false }, // 아래 평가 후 확정
      closing,
      netIncome: niListing ? { listing: niListing, acquisition: niAcq } : undefined,
      netAsset: naListing ? { listing: naListing, acquisition: naAcq } : undefined,
    };
  }

  // §165⑤ 가중치 반전 (부동산과다보유법인 §94①4 다목 — 별개 임계 50%)
  const isHeavyRE = input.isHeavyRealEstateForValuation === true;

  // 상장일 직전 사업연도 「제4항에 따른 평가액」(= 환산식 분모)
  const listingEval = calcSection165_4Value(
    listingYearNetIncomePerShare,
    listingYearNetAssetPerShare,
    isHeavyRE,
    input.transferDate,
  );
  const listingYearPerShareValue = listingEval.value;

  // 취득일 직전 사업연도 「제4항에 따른 평가액」(= 환산식 분자)
  const acquisitionEval = calcSection165_4Value(
    acquisitionYearNetIncomePerShare,
    acquisitionYearNetAssetPerShare,
    isHeavyRE,
    input.transferDate,
  );
  const acquisitionYearPerShareValue = acquisitionEval.value;

  // [표시 전용 echo] 결과 카드가 가중평균 산식을 라벨·변수값으로 펼치기 위한 산출 근거.
  // 가중치는 실제 적용값(연혁·§94①4다목 반전 반영)이라 화면이 3/5·2/5를 추정하지 않아도 된다.
  const weightedBasis: PostListingValuationResult["weightedBasis"] = {
    niWeight: listingEval.niWeight,
    naWeight: listingEval.naWeight,
    listing: {
      netIncomeValue: listingYearNetIncomePerShare,
      netAssetValue: listingYearNetAssetPerShare,
      weightedRaw: Math.floor(listingEval.weightedRaw),
    },
    acquisition: {
      netIncomeValue: acquisitionYearNetIncomePerShare,
      netAssetValue: acquisitionYearNetAssetPerShare,
      weightedRaw: Math.floor(acquisitionEval.weightedRaw),
    },
  };

  if (listingEval.floorApplied || acquisitionEval.floorApplied) {
    appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_4_1_FLOOR_80);
  }
  detailExtended = {
    ...detailExtended,
    floor80Applied: {
      listing: listingEval.floorApplied,
      acquisition: acquisitionEval.floorApplied,
    },
  };

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
      weightedBasis,
      appliedRules,
      warnings,
      capitalEventTruncation,
      detail: detailExtended,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 소칙 §81④ 월할 가산 분기 (§165⑤ 후단 준용)
  // 트리거(§165⑤ 후단): 취득일 §4항 평가액 == 상장일 §4항 평가액
  //   - 토글 OFF → §81④ 2호: 보정 없음 (상장일 평가액 그대로)
  //   - 토글 ON  → §81④ 1호: 직전·전전 차액을 보유월수로 안분해 분모(상장일 평가액) 보정
  // ──────────────────────────────────────────────────────────
  const valuesEqual = acquisitionYearPerShareValue === listingYearPerShareValue;
  const accrualToggle = postListingDetail?.monthlyAccrualToggle === true;
  const hasPrePrior =
    typeof input.prePriorYearNetIncomePerShare === "number" &&
    typeof input.prePriorYearNetAssetPerShare === "number" &&
    input.listingDate instanceof Date;

  let denominator = listingYearPerShareValue; // 환산식 분모 (기본 = 현행)
  let monthlyAccrualApplied = false;
  let monthlyAccrualDetail: PostListingValuationResult["monthlyAccrualDetail"];

  if (!valuesEqual && accrualToggle) {
    // C-7: 평가액 상이 — §81④ 미적용 (토글 잔존)
    warnings.push(
      "취득일·상장일 직전 사업연도 평가액이 달라 소칙 §81④ 월할 가산이 적용되지 않습니다.",
    );
  } else if (valuesEqual && !accrualToggle) {
    // C-2: §81④ 2호 — 동일 사업연도 취득·상장이 아니므로 보정 없음
    appliedRules.push(STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL);
    warnings.push(
      "취득일·상장일 직전 사업연도 평가액이 동일하나 동일 사업연도 취득·상장(토글)이 아니므로 " +
        "소칙 §81④ 2호에 따라 상장일 평가액을 그대로 적용합니다.",
    );
  } else if (valuesEqual && accrualToggle && !hasPrePrior) {
    // C-4: 1호 보정에 필요한 전전연도 평가 또는 상장일 미입력 — 엔진 방어 (validate 1차 차단)
    appliedRules.push(STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL);
    warnings.push(
      "소칙 §81④ 1호 월할 가산에 필요한 전전사업연도 평가(또는 상장일)가 입력되지 않아 " +
        "보정을 적용하지 못했습니다.",
    );
  } else if (valuesEqual && accrualToggle && hasPrePrior) {
    // C-3·C-5·C-6: §81④ 1호 월할 보정 발동
    //
    // 🟡 **전전사업연도 평가에는 하한을 걸지 않았다 — 의도적 미판단이다.**
    //    「소득세법 시행규칙」 §81④의 전전연도 값이 「제4항에 따른 평가액」인지는 **본문 미확인**이다
    //    (§165⑤ 본문은 분자·분모만 그렇게 부른다). 본체 경로
    //    `stock-valuation-unlisted.ts`의 §165⑨ 블록도 전전연도를 하한 없이 쓰고 있어
    //    **두 경로가 대칭**이다. 한쪽만 바꾸면 같은 규칙이 갈린다.
    //    ⚠️ 시행규칙 §81④ 본문을 확인하면 **양쪽을 함께** 판단할 것.
    const prePrior = calcUnlistedPerShareWeighted(
      input.prePriorYearNetIncomePerShare!,
      input.prePriorYearNetAssetPerShare!,
      isHeavyRE,
    );
    const holdingMonths = calcAccrualMonths(input.acquisitionDate, input.listingDate!);
    const priorBizYearMonths = input.priorBizYearMonths ?? 12;
    const prior = acquisitionYearPerShareValue; // 트리거상 분자·분모 원값 동일
    // §81④ 1호 산식 공유 헬퍼 (분수 단일 floor — 음수 차이 C-5 방향 일관)
    const { adjusted } = apply81_4Accrual(prior, prePrior, holdingMonths, priorBizYearMonths);

    if (adjusted <= 0) {
      // C-6: 보정 평가액 0 이하 → 환산 불가 (보정 미발동)
      warnings.push("소칙 §81④ 월할 보정 평가액이 0 이하입니다. 환산 불가.");
      return {
        listingYearPerShareValue,
        acquisitionYearPerShareValue,
        conversionRatio: 0,
        finalPerShareValue: 0,
        totalAcquisitionPrice: 0,
        monthlyAccrualApplied: false,
        weightedBasis,
        appliedRules,
        warnings,
        capitalEventTruncation,
        detail: detailExtended,
      };
    }

    denominator = adjusted;
    monthlyAccrualApplied = true;
    monthlyAccrualDetail = {
      prePriorYearPerShareValue: prePrior,
      holdingMonths,
      priorBizYearMonths,
      adjustedListingYearPerShareValue: adjusted,
    };
    appliedRules.push(STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL);
  }

  // 환산비율 = 취득일 직전 평가 / (보정된) 상장일 직전 평가
  // 부동소수점 정밀도: 비율은 부동소수 echo, 최종 1주당만 floor
  const conversionRatio = acquisitionYearPerShareValue / denominator;

  // 1주당 취득기준시가 = floor(상장일 1개월 종가평균 × 환산비율)
  //   보정 경로는 분수 정수 연산(분모 교체 — 1원 오차 방지), 비보정 경로는 기존 부동소수 곱 유지(사례 48 불변)
  const finalPerShareValue = monthlyAccrualApplied
    ? Math.floor((listingDatePriceAvg1Month * acquisitionYearPerShareValue) / denominator)
    : Math.floor(listingDatePriceAvg1Month * conversionRatio);

  const totalAcquisitionPrice = finalPerShareValue * shareCount;

  return {
    listingYearPerShareValue,
    acquisitionYearPerShareValue,
    conversionRatio,
    finalPerShareValue,
    totalAcquisitionPrice,
    monthlyAccrualApplied,
    monthlyAccrualDetail,
    weightedBasis,
    capitalEventTruncation,
    appliedRules,
    warnings,
    detail: detailExtended,
  };
}
