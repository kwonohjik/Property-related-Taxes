/**
 * 주식 양도세 — 취득 후 상장 환산 Flat ↔ Nested 어댑터
 *
 * 본 모듈의 책임 (Round 2 R2-03 + Round 4 H-02):
 *   1. 폼-전역 80개 flat 필드를 nested PostListingDetailInput로 변환
 *   2. listing_only/full 모드 시 기존 4 결과 필드(listingYear*PerShare 등) 자동 합성
 *   3. 환원율 "10" (%) → 0.10 (decimal) 변환
 *   4. UI 미리보기 / API 변환 양쪽에서 동일 import — 단일 진실 ([[feedback_ui_engine_dual_truth_avoidance]])
 *
 * Phase A KoreanLaw 검증 2026-05-18 결론 반영:
 *   - 상장일 이후 1개월 (소령 §165⑤)
 *   - 환원율 10% (소법 시행규칙 §81② → 상증법 시행규칙 §17)
 *   - 80% 하한 환산비율 단계 미적용 (§165④1 단서 — 양도일 평가 전용)
 */

import {
  calcClosingAvgWithEvent,
  calcNetIncomePerShare,
  calcNetAssetPerShare,
  calcUnlistedPerShareWeighted,
} from "./stock-valuation-post-listing";
import type {
  PostListingDetailInput,
  NIYear,
  NAYear,
  StockTransferInput,
} from "./types/stock-transfer.types";

// ============================================================
// Flat 폼 입력 타입 (80필드 → adapter 입력)
// ============================================================

/**
 * UI store(`StockTransferFormData`)에서 본 어댑터로 넘어오는 80개 flat 필드.
 * UI에서 본 타입을 직접 import하여 partial form 입력을 만들 수 있다.
 */
export interface PostListingFlatForm {
  unlistedDetailMode?: "simple" | "listing_only" | "full";
  monthlyAccrualToggle?: boolean;

  // 상장일 이후 1개월 종가 (4필드)
  listingPriceDates?: string[];           // YYYY-MM-DD 최대 32 슬롯
  listingPriceClosing?: string[];         // 원 (CurrencyInput parse 결과 또는 string)
  listingPriceBasisDate?: string;         // YYYY-MM-DD
  listingPriceHasIncrease?: boolean;
  listingPriceIncreaseDate?: string;      // [B-5] 증자·합병 발생일 YYYY-MM-DD

  // 순손익 — 상장연도 (18 필드)
  niAddRow1Listing?: string;
  niAddRow2Listing?: string;
  niAddRow3Listing?: string;
  niAddRow4Listing?: string;
  niSubRow5Listing?: string;
  niSubRow6Listing?: string;
  niSubRow7Listing?: string;
  niSubRow8Listing?: string;
  niSubRow9Listing?: string;
  niSubRow10Listing?: string;
  niSubRow11Listing?: string;
  niSubRow12Listing?: string;
  niSubRow13Listing?: string;
  niSubRow14Listing?: string;
  niSubRow15Listing?: string;
  niSubRow16Listing?: string;
  niShareCountListing?: string;           // 주식수
  niDiscountRateListing?: string;         // % (예: "10" → 0.10)

  // 순손익 — 취득연도 (18 필드)
  niAddRow1Acq?: string;
  niAddRow2Acq?: string;
  niAddRow3Acq?: string;
  niAddRow4Acq?: string;
  niSubRow5Acq?: string;
  niSubRow6Acq?: string;
  niSubRow7Acq?: string;
  niSubRow8Acq?: string;
  niSubRow9Acq?: string;
  niSubRow10Acq?: string;
  niSubRow11Acq?: string;
  niSubRow12Acq?: string;
  niSubRow13Acq?: string;
  niSubRow14Acq?: string;
  niSubRow15Acq?: string;
  niSubRow16Acq?: string;
  niShareCountAcq?: string;
  niDiscountRateAcq?: string;

  // 순자산 — 상장연도 (19 필드)
  naAssetTotalRow1Listing?: string;
  naAssetAddRow2Listing?: string;
  naAssetAddRow3Listing?: string;
  naAssetAddRow4Listing?: string;
  naAssetAddRow5Listing?: string;
  naAssetSubRow6Listing?: string;
  naAssetSubRow7Listing?: string;
  naLiabTotalRow8Listing?: string;
  naLiabAddRow9Listing?: string;
  naLiabAddRow10Listing?: string;
  naLiabAddRow11Listing?: string;
  naLiabAddRow12Listing?: string;
  naLiabAddRow13Listing?: string;
  naLiabAddRow14Listing?: string;
  naLiabSubRow15Listing?: string;
  naLiabSubRow16Listing?: string;
  naLiabSubRow17Listing?: string;
  naGoodwillRow19Listing?: string;
  naShareCountListing?: string;

  // 순자산 — 취득연도 (19 필드)
  naAssetTotalRow1Acq?: string;
  naAssetAddRow2Acq?: string;
  naAssetAddRow3Acq?: string;
  naAssetAddRow4Acq?: string;
  naAssetAddRow5Acq?: string;
  naAssetSubRow6Acq?: string;
  naAssetSubRow7Acq?: string;
  naLiabTotalRow8Acq?: string;
  naLiabAddRow9Acq?: string;
  naLiabAddRow10Acq?: string;
  naLiabAddRow11Acq?: string;
  naLiabAddRow12Acq?: string;
  naLiabAddRow13Acq?: string;
  naLiabAddRow14Acq?: string;
  naLiabSubRow15Acq?: string;
  naLiabSubRow16Acq?: string;
  naLiabSubRow17Acq?: string;
  naGoodwillRow19Acq?: string;
  naShareCountAcq?: string;

  // 기존 4 결과 필드 (simple 모드 직접 입력 또는 listing_only 취득연도)
  // string(UI) 또는 number(API 사후) 둘 다 허용
  listingDatePriceAvg1Month?: number | string;
  listingYearNetIncomePerShare?: number | string;
  listingYearNetAssetPerShare?: number | string;
  acquisitionYearNetIncomePerShare?: number | string;
  acquisitionYearNetAssetPerShare?: number | string;

  // 부동산과다 가중치 반전 echo (UI에서 별도 입력)
  isHeavyRealEstateForValuation?: boolean;
}

// ============================================================
// 내부 헬퍼
// ============================================================

function toNumber(v: string | number | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string" || v.trim() === "") return 0;
  // CurrencyInput parse — 콤마 제거 후 숫자
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 환원율 "10" (%) → 0.10 (decimal). 미입력 또는 0 이하면 default 10%. */
function toDiscountRate(v: string | undefined): number {
  const n = toNumber(v);
  if (n <= 0) return 0.10;
  // 사용자가 "10" 입력 시 0.10, "0.10" 입력 시 0.10 (방어)
  return n >= 1 ? n / 100 : n;
}

function buildNIYear(
  add: (string | undefined)[],
  sub: (string | undefined)[],
  shareCount: string | undefined,
  discountRate: string | undefined,
): NIYear {
  return {
    addA: add.map(toNumber),
    subB: sub.map(toNumber),
    shareCount: toNumber(shareCount),
    discountRate: toDiscountRate(discountRate),
  };
}

function buildNAYear(
  assetTotal: string | undefined,
  assetAdd: (string | undefined)[],
  assetSub: (string | undefined)[],
  liabTotal: string | undefined,
  liabAdd: (string | undefined)[],
  liabSub: (string | undefined)[],
  goodwill: string | undefined,
  shareCount: string | undefined,
): NAYear {
  return {
    assetTotalRow1: toNumber(assetTotal),
    assetAdd: assetAdd.map(toNumber),
    assetSub: assetSub.map(toNumber),
    liabTotalRow8: toNumber(liabTotal),
    liabAdd: liabAdd.map(toNumber),
    liabSub: liabSub.map(toNumber),
    goodwillRow19: toNumber(goodwill),
    shareCount: toNumber(shareCount),
  };
}

// ============================================================
// Public — adaptFlatToPostListingDetail (H-05a)
// ============================================================

/**
 * Flat 폼 → nested PostListingDetailInput 변환.
 * unlistedDetailMode 별 분기:
 *   - "simple": closing/netIncome/netAsset 모두 undefined (기존 4 필드만 사용)
 *   - "listing_only": closing + listing 측 채움. acquisition 측 undefined (기존 4 필드 사용)
 *   - "full": 모두 채움
 */
export function adaptFlatToPostListingDetail(
  form: PostListingFlatForm,
): PostListingDetailInput {
  const mode = form.unlistedDetailMode ?? "simple";
  const monthlyAccrualToggle = form.monthlyAccrualToggle === true;

  if (mode === "simple") {
    return { unlistedDetailMode: "simple", monthlyAccrualToggle };
  }

  // closing — listing_only 와 full 모두 필요
  const dates = form.listingPriceDates ?? [];
  const closesRaw = form.listingPriceClosing ?? [];
  const closes = closesRaw.map(toNumber);
  const closing = {
    dates,
    closes,
    basisDate: form.listingPriceBasisDate ?? "",
    hasIncrease: form.listingPriceHasIncrease === true,
    increaseDate: form.listingPriceIncreaseDate ?? "", // [B-5] 증자·합병 발생일
  };

  // listing 측 — 두 모드 모두 채움
  const niListing = buildNIYear(
    [form.niAddRow1Listing, form.niAddRow2Listing, form.niAddRow3Listing, form.niAddRow4Listing],
    [
      form.niSubRow5Listing, form.niSubRow6Listing, form.niSubRow7Listing, form.niSubRow8Listing,
      form.niSubRow9Listing, form.niSubRow10Listing, form.niSubRow11Listing, form.niSubRow12Listing,
      form.niSubRow13Listing, form.niSubRow14Listing, form.niSubRow15Listing, form.niSubRow16Listing,
    ],
    form.niShareCountListing,
    form.niDiscountRateListing,
  );
  const naListing = buildNAYear(
    form.naAssetTotalRow1Listing,
    [form.naAssetAddRow2Listing, form.naAssetAddRow3Listing, form.naAssetAddRow4Listing, form.naAssetAddRow5Listing],
    [form.naAssetSubRow6Listing, form.naAssetSubRow7Listing],
    form.naLiabTotalRow8Listing,
    [form.naLiabAddRow9Listing, form.naLiabAddRow10Listing, form.naLiabAddRow11Listing,
     form.naLiabAddRow12Listing, form.naLiabAddRow13Listing, form.naLiabAddRow14Listing],
    [form.naLiabSubRow15Listing, form.naLiabSubRow16Listing, form.naLiabSubRow17Listing],
    form.naGoodwillRow19Listing,
    form.naShareCountListing,
  );

  if (mode === "listing_only") {
    return {
      unlistedDetailMode: "listing_only",
      monthlyAccrualToggle,
      closing,
      netIncome: {
        listing: niListing,
        // acquisition은 사용자 직접 입력값 그대로 사용 — nested 미포함
        acquisition: { addA: [], subB: [], shareCount: 0, discountRate: 0.10 },
      },
      netAsset: {
        listing: naListing,
        acquisition: { assetTotalRow1: 0, assetAdd: [], assetSub: [], liabTotalRow8: 0, liabAdd: [], liabSub: [], goodwillRow19: 0, shareCount: 0 },
      },
    };
  }

  // full 모드 — acquisition 측도 채움
  const niAcq = buildNIYear(
    [form.niAddRow1Acq, form.niAddRow2Acq, form.niAddRow3Acq, form.niAddRow4Acq],
    [
      form.niSubRow5Acq, form.niSubRow6Acq, form.niSubRow7Acq, form.niSubRow8Acq,
      form.niSubRow9Acq, form.niSubRow10Acq, form.niSubRow11Acq, form.niSubRow12Acq,
      form.niSubRow13Acq, form.niSubRow14Acq, form.niSubRow15Acq, form.niSubRow16Acq,
    ],
    form.niShareCountAcq,
    form.niDiscountRateAcq,
  );
  const naAcq = buildNAYear(
    form.naAssetTotalRow1Acq,
    [form.naAssetAddRow2Acq, form.naAssetAddRow3Acq, form.naAssetAddRow4Acq, form.naAssetAddRow5Acq],
    [form.naAssetSubRow6Acq, form.naAssetSubRow7Acq],
    form.naLiabTotalRow8Acq,
    [form.naLiabAddRow9Acq, form.naLiabAddRow10Acq, form.naLiabAddRow11Acq,
     form.naLiabAddRow12Acq, form.naLiabAddRow13Acq, form.naLiabAddRow14Acq],
    [form.naLiabSubRow15Acq, form.naLiabSubRow16Acq, form.naLiabSubRow17Acq],
    form.naGoodwillRow19Acq,
    form.naShareCountAcq,
  );

  return {
    unlistedDetailMode: "full",
    monthlyAccrualToggle,
    closing,
    netIncome: { listing: niListing, acquisition: niAcq },
    netAsset: { listing: naListing, acquisition: naAcq },
  };
}

// ============================================================
// Public — adaptFlatToApiBody (H-05b, Round 4 C-03 — Pick 7개)
// ============================================================

/**
 * Flat 폼 → API body 필드 매핑.
 * Round 4 C-03 — Pick 확장 (listing_only 모드의 취득 4 필드 + listingDatePriceAvg1Month).
 *
 * 분기:
 *   - "simple": 기존 4 필드 그대로. postListingDetail 미포함.
 *   - "listing_only": 종가 평균 + 상장연도 가중평균 자동 합성 → listingDatePriceAvg1Month + listingYear* 채움.
 *                     acquisitionYear*는 사용자 입력 그대로.
 *   - "full": 양 연도 모두 합성하여 5 필드 + postListingDetail 둘 다 송신.
 */
export function adaptFlatToApiBody(
  form: PostListingFlatForm,
  acquiredBeforeListing: boolean,
): Pick<
  StockTransferInput,
  | "postListingDetail"
  | "acquiredBeforeListing"
  | "listingDatePriceAvg1Month"
  | "listingYearNetIncomePerShare"
  | "listingYearNetAssetPerShare"
  | "acquisitionYearNetIncomePerShare"
  | "acquisitionYearNetAssetPerShare"
> {
  const mode = form.unlistedDetailMode ?? "simple";
  const isHeavyRE = form.isHeavyRealEstateForValuation === true;

  // simple 모드 — 기존 4 필드 그대로 (string/number 둘 다 toNumber)
  if (mode === "simple" || !acquiredBeforeListing) {
    return {
      acquiredBeforeListing,
      postListingDetail: undefined,
      listingDatePriceAvg1Month: toNumber(form.listingDatePriceAvg1Month),
      listingYearNetIncomePerShare: toNumber(form.listingYearNetIncomePerShare),
      listingYearNetAssetPerShare: toNumber(form.listingYearNetAssetPerShare),
      acquisitionYearNetIncomePerShare: toNumber(form.acquisitionYearNetIncomePerShare),
      acquisitionYearNetAssetPerShare: toNumber(form.acquisitionYearNetAssetPerShare),
    };
  }

  const detail = adaptFlatToPostListingDetail(form);

  // 종가 평균 자동 계산
  const closingAvg = detail.closing
    ? calcClosingAvgWithEvent(detail.closing).avg
    : toNumber(form.listingDatePriceAvg1Month);

  // 상장연도 1주당 순손익가치·순자산가치 자동 합성
  const listingNI = detail.netIncome?.listing
    ? calcNetIncomePerShare(detail.netIncome.listing).perShareValue
    : toNumber(form.listingYearNetIncomePerShare);
  const listingNA = detail.netAsset?.listing
    ? calcNetAssetPerShare(detail.netAsset.listing).perShareAsset
    : toNumber(form.listingYearNetAssetPerShare);

  if (mode === "listing_only") {
    return {
      acquiredBeforeListing,
      postListingDetail: detail,
      listingDatePriceAvg1Month: closingAvg,
      listingYearNetIncomePerShare: listingNI,
      listingYearNetAssetPerShare: listingNA,
      // 취득연도는 사용자 직접 입력값 사용
      acquisitionYearNetIncomePerShare: toNumber(form.acquisitionYearNetIncomePerShare),
      acquisitionYearNetAssetPerShare: toNumber(form.acquisitionYearNetAssetPerShare),
    };
  }

  // full 모드 — 취득연도도 합성
  const acqNI = detail.netIncome?.acquisition
    ? calcNetIncomePerShare(detail.netIncome.acquisition).perShareValue
    : toNumber(form.acquisitionYearNetIncomePerShare);
  const acqNA = detail.netAsset?.acquisition
    ? calcNetAssetPerShare(detail.netAsset.acquisition).perShareAsset
    : toNumber(form.acquisitionYearNetAssetPerShare);

  void isHeavyRE; // adapter는 1주당 가치까지만 합성. 가중평균(H-04)은 엔진 본체에서 호출.

  return {
    acquiredBeforeListing,
    postListingDetail: detail,
    listingDatePriceAvg1Month: closingAvg,
    listingYearNetIncomePerShare: listingNI,
    listingYearNetAssetPerShare: listingNA,
    acquisitionYearNetIncomePerShare: acqNI,
    acquisitionYearNetAssetPerShare: acqNA,
  };
}

// ============================================================
// Public — buildPostListingFromDetail (H-05c, 엔진 본체 통합용)
// ============================================================

/**
 * Nested PostListingDetailInput → 엔진 본체용 4 필드 + closing avg 합성.
 * 엔진 본체(stock-transfer-tax.ts)에서 직접 호출 — 1주당 가치까지만 산출.
 * 가중평균(H-04 isHeavyRE)은 calcPostListingConversion 내부 처리.
 */
export function buildPostListingFromDetail(
  detail: PostListingDetailInput,
): {
  listingDatePriceAvg1Month: number;
  listingYearNetIncomePerShare: number;
  listingYearNetAssetPerShare: number;
  acquisitionYearNetIncomePerShare: number;
  acquisitionYearNetAssetPerShare: number;
} {
  if (detail.unlistedDetailMode === "simple") {
    return {
      listingDatePriceAvg1Month: 0,
      listingYearNetIncomePerShare: 0,
      listingYearNetAssetPerShare: 0,
      acquisitionYearNetIncomePerShare: 0,
      acquisitionYearNetAssetPerShare: 0,
    };
  }

  const closingAvg = detail.closing
    ? calcClosingAvgWithEvent(detail.closing).avg
    : 0;
  const listingNI = detail.netIncome?.listing
    ? calcNetIncomePerShare(detail.netIncome.listing).perShareValue
    : 0;
  const listingNA = detail.netAsset?.listing
    ? calcNetAssetPerShare(detail.netAsset.listing).perShareAsset
    : 0;
  const acqNI = detail.netIncome?.acquisition
    ? calcNetIncomePerShare(detail.netIncome.acquisition).perShareValue
    : 0;
  const acqNA = detail.netAsset?.acquisition
    ? calcNetAssetPerShare(detail.netAsset.acquisition).perShareAsset
    : 0;

  return {
    listingDatePriceAvg1Month: closingAvg,
    listingYearNetIncomePerShare: listingNI,
    listingYearNetAssetPerShare: listingNA,
    acquisitionYearNetIncomePerShare: acqNI,
    acquisitionYearNetAssetPerShare: acqNA,
  };
}

// Re-export for UI / API convenience
export { calcUnlistedPerShareWeighted };

// ============================================================
// synthesizePostListingInput (P3 G-12 — stock-transfer-tax.ts 800줄 분할)
// ============================================================

/**
 * Round 4 — full/listing_only 모드 시 nested postListingDetail에서 4 필드 자동 합성.
 * simple 모드 또는 postListingDetail 미입력 시 원본 input 그대로 반환.
 *
 * 엔진 본체 `stock-transfer-tax.ts`에서 호출 — 본 모듈로 분리하여 800줄 정책 해소.
 */
export function synthesizePostListingInput(input: StockTransferInput): StockTransferInput {
  const detail = input.postListingDetail;
  if (!detail || detail.unlistedDetailMode === "simple") return input;

  const synthesized = buildPostListingFromDetail(detail);

  if (detail.unlistedDetailMode === "listing_only") {
    // 상장연도만 합성, 취득연도는 사용자 직접 입력 유지
    return {
      ...input,
      listingDatePriceAvg1Month: synthesized.listingDatePriceAvg1Month || input.listingDatePriceAvg1Month,
      listingYearNetIncomePerShare: synthesized.listingYearNetIncomePerShare || input.listingYearNetIncomePerShare,
      listingYearNetAssetPerShare: synthesized.listingYearNetAssetPerShare || input.listingYearNetAssetPerShare,
    };
  }

  // full 모드 — 5 필드 모두 합성값으로 대체
  return {
    ...input,
    listingDatePriceAvg1Month: synthesized.listingDatePriceAvg1Month,
    listingYearNetIncomePerShare: synthesized.listingYearNetIncomePerShare,
    listingYearNetAssetPerShare: synthesized.listingYearNetAssetPerShare,
    acquisitionYearNetIncomePerShare: synthesized.acquisitionYearNetIncomePerShare,
    acquisitionYearNetAssetPerShare: synthesized.acquisitionYearNetAssetPerShare,
  };
}
