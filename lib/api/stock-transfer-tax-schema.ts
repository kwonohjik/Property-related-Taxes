/**
 * 주식 양도소득세 API — Zod 입력 스키마 (14지점 ⑨⑫)
 *
 * 법령: 소득세법 2026.4.21. 시행
 * 필드는 StockTransferInput과 1:1 매핑.
 *
 * 주의: TypeScript는 이 파일의 필드 누락을 감지하지 못함 (⑫ 점검).
 * 신규 필드 추가 시 반드시 이 파일에도 추가.
 */

import { z } from "zod";
import { foreignStockInputSchema } from "./stock-transfer-foreign-schema";
import { toOptionalDate } from "./date-coerce";
import {
  isTradingHaltMarketScopeViolation,
  TRADING_HALT_MARKET_SCOPE_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/trading-halt-market-scope";


/**
 * ⑫ **필수** 날짜 칸 — 빈 문자열을 거부한다.
 *
 * 종전에는 `z.union([z.string(), z.date()])` 라 **빈 문자열이 통과**했고, 그 값이 route 의
 * `coerceDates` 를 지나 엔진에 도달해 `transferDate.getTime is not a function` 으로 터졌다(500).
 * 다종목 확정 경로가 특히 위험했다 — 확정 게이트가 종목명·시장 2개뿐이라 **금액도 날짜도 빈
 * 종목**이 목록에 남을 수 있다(V-3 실측 2026-08-27).
 *
 * 클라이언트 `validateFilingItems` 가 먼저 막지만, API 를 직접 호출하는 경로에는 이 게이트가
 * 유일한 방어다.
 */
const requiredDateSchema = z.union([z.string().min(1, "날짜를 입력하세요"), z.date()]);

// ============================================================
// ⑨ Zod enum 정의 (8차 정정 — 7종 enum)
// ============================================================

export const marketTypeSchema = z.enum([
  "kospi",
  "kosdaq",
  "konex",
  "unlisted",
  "other_asset",
]);

export const acquisitionModeSchema = z.enum([
  "actual",
  "sale_case",
  "estimated",
  "face_value",
]);

export const transferPriceModeSchema = z.enum(["actual", "exchange"]);

export const transferActualInputModeSchema = z.enum(["per_share", "total"]);

export const acquisitionActualInputModeSchema = z.enum(["per_share", "lots"]);

export const netAssetOnlyReasonSchema = z.enum([
  "liquidation_or_owner_death",
  "no_business_or_short_or_closed",
  "stock_holding_company",
  "remaining_term_under_3y",
]);

export const acquisitionCauseSchema = z.enum([
  "purchase",
  "inheritance",
  "gift",
  /**
   * §97의2① 이월과세가 적용되는 증여 — §104②2호로 증여자 취득일 기산.
   * 2024.12.31. 개정(법률 제20615호·시행 2025.1.1.)으로 §94①3호 주식등이 ①에 포섭되면서 추가.
   */
  "carryover_gift",
  "merger_split",
]);

/** §97의2① 본문 — 증여자와의 관계. 배우자 사별·직계존비속 양도당시 사망이면 ① 미해당. */
export const donorRelationSchema = z.enum(["spouse", "lineal", "other"]);

export const filingTypeSchema = z.enum(["preliminary", "final", "revised"]);

export const filingViolationSchema = z.enum(["none", "under_report", "non_report"]);

export const expenseModeSchema = z.enum(["actual", "estimated"]);

// R-2 자본조정 (무상증자·감자) — 법§17② 단서·집행기준 97-163-12
export const capitalAdjustmentTypeSchema = z.enum([
  "bonus_capital_reserve",
  "bonus_retained_earnings",
  "reduction_proportional",
  "reduction_capital_return",
]);

export const capitalAdjustmentSchema = z.object({
  type: capitalAdjustmentTypeSchema,
  eventDate: requiredDateSchema,
  ratio: z.number().positive(),
  notes: z.string().optional(),
});

// 분할 매수·분할 양도 (Plan v2.2)
export const lotsModeSchema = z.enum(["single", "split"]);
export const costAllocationMethodSchema = z.enum(["specific", "fifo", "moving_avg"]);

// 취득 후 상장 환산 PDF 사례 재현 (Phase D~G — Round 4 H-04)
export const unlistedDetailModeSchema = z.enum(["simple", "listing_only", "full"]);
export const niYearSchema = z.object({
  addA: z.array(z.number()).default([]),
  subB: z.array(z.number()).default([]),
  shareCount: z.number().default(0),
  discountRate: z.number().default(0.10),
});
export const naYearSchema = z.object({
  assetTotalRow1: z.number().default(0),
  assetAdd: z.array(z.number()).default([]),
  assetSub: z.array(z.number()).default([]),
  liabTotalRow8: z.number().default(0),
  liabAdd: z.array(z.number()).default([]),
  liabSub: z.array(z.number()).default([]),
  goodwillRow19: z.number().default(0),
  shareCount: z.number().default(0),
});
export const postListingDetailSchema = z.object({
  unlistedDetailMode: unlistedDetailModeSchema,
  monthlyAccrualToggle: z.boolean().default(false),
  closing: z.object({
    dates: z.array(z.string()).default([]),
    closes: z.array(z.number()).default([]),
    basisDate: z.string().default(""),
    hasIncrease: z.boolean().default(false),
    increaseDate: z.string().optional(), // [B-5] 증자·합병 발생일
  }).optional(),
  netIncome: z.object({
    listing: niYearSchema,
    acquisition: niYearSchema,
  }).optional(),
  netAsset: z.object({
    listing: naYearSchema,
    acquisition: naYearSchema,
  }).optional(),
});

// ============================================================
// 분할 lot z.object 정의 (⑫ TypeScript 미감지 — 명시 필수)
// ============================================================

export const acquisitionLotSchema = z.object({
  id: z.string().optional(),
  acquisitionDate: requiredDateSchema,
  shareCount: z.number().int().positive(),
  perShareAcquisitionPrice: z.number().int().positive(),
  acquisitionCause: acquisitionCauseSchema,
  decedentAcquisitionDate: z.union([z.string(), z.date()]).optional(),
  /** 이월과세 lot — 증여자 취득일 (§104②2). 없으면 `resolveLotStartDate`가 수증일로 fallback. */
  donorAcquisitionDate: z.union([z.string(), z.date()]).optional(),
  /** 이월과세 lot — 증여자 취득 당시 1주당 실지거래가액 (§97의2①1호). 없으면 승계하지 않는다. */
  donorAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** 이월과세 lot — 증여자 자본적지출 (§97의2①2호). lot 전체 주식수 기준 총액. */
  donorCapitalExpenditure: z.number().int().nonnegative().optional(),
  /** 이월과세 lot — 그 증여 건의 증여세 산출세액 (영 §163의2②1호) */
  donorGiftTaxAmount: z.number().int().nonnegative().optional(),
  /** 이월과세 lot — 그 증여 건의 증여세 과세가액 (영 §163의2②3호 · 안분 분모) */
  donorGiftTaxableValue: z.number().int().nonnegative().optional(),
  /** 이월과세 lot — 관계 요건 (§97의2① 본문 괄호) */
  donorRelation: donorRelationSchema.optional(),
  donorDeceased: z.boolean().optional(),
  preMergerAcquisitionDate: z.union([z.string(), z.date()]).optional(),
});

export const transferLotSchema = z.object({
  id: z.string().optional(),
  transferDate: requiredDateSchema,
  shareCount: z.number().int().positive(),
  perShareTransferPrice: z.number().int().positive(),
});

export const specificMatchingSchema = z.object({
  transferLotId: z.string(),
  acquisitionLotId: z.string(),
  shareCount: z.number().int().positive(),
});

// ============================================================
// ⑫ Zod 입력 객체 정의 (TypeScript 미감지 — 전수 점검 필수)
// ============================================================

export const stockTransferInputSchema = z.object({
  // §94①3 시장 분류
  marketType: marketTypeSchema,

  // 대주주 판정 (시행령 §157) — 2-step
  isMajorShareholder: z.boolean(),
  selfShareRatio: z.number().min(0).max(1),
  selfMarketCap: z.number().min(0),
  isLargestShareholderGroup: z.boolean(),
  combinedShareRatio: z.number().min(0).max(1),
  combinedMarketCap: z.number().min(0),
  priorYearEndDate: requiredDateSchema,

  // §94①4 기타자산
  isQualifyingBlockShareholder: z.boolean(),
  isHeavyRealEstateForRate: z.boolean(),
  isHeavyRealEstateForValuation: z.boolean(),

  // 회사 분류
  isSmallMediumEnterprise: z.boolean(),
  isMidsizeEnterprise: z.boolean(),
  isListedSmallShareholder: z.boolean(),
  isVentureCompany: z.boolean(),
  isKOTCTrading: z.boolean(),
  // §94①3 가목 1) 단서 — 장내 거래 여부 (default true, 기존 동작 호환)
  isOnMarketTransaction: z.boolean().optional().default(true),
  // F-15·F-16 (2026-05-19) — 대차주식·사모펀드 간접소유 자동 가산 (§157 2013.2.15.~)
  lentSharesCount: z.number().int().nonnegative().optional().default(0),
  pefIndirectSharesCount: z.number().int().nonnegative().optional().default(0),
  // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override (합병·분할·신설법인 특수)
  judgmentDateOverride: z.union([z.string(), z.date()]).optional(),
  judgmentBasis: z.enum(["merger", "split", "split_new_entity", "incorporation"]).optional(),

  // 거래 일자·수량
  acquisitionDate: requiredDateSchema,
  transferDate: requiredDateSchema,
  shareCount: z.number().int().positive(),
  totalIssuedShares: z.number().int().positive(),

  // 보유기간 기산점 §104②
  acquisitionCause: acquisitionCauseSchema,
  decedentAcquisitionDate: z.union([z.string(), z.date()]).optional(),
  donorAcquisitionDate: z.union([z.string(), z.date()]).optional(),
  preMergerAcquisitionDate: z.union([z.string(), z.date()]).optional(),

  // ── §97의2① 이월과세 **본체(필요경비)** — `carryover_gift` 전용 ──
  // ⚠️ 엔진 내부 전용(`carryoverGiftTaxExpense`·`acquisitionStdPriceOverridePerShare`)은
  //    **여기 넣지 않는다** — 사용자 입력이 아니라 `stock-carryover.ts`가 채우는 값이다.
  /** ① 본문 괄호 — 증여자와의 관계 */
  donorRelation: donorRelationSchema.optional(),
  /** ① 본문 괄호 — 증여자 사망(배우자=사별 / 직계존비속=양도 당시 사망) */
  donorDeceased: z.boolean().optional(),
  /** ①1호 가목 — 증여자 취득 당시 1주당 실지거래가액 */
  donorAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** ①1호 나목 — 증여자 취득 당시 1주당 기준시가(환산 분자) */
  donorAcquisitionStdPrice: z.number().int().nonnegative().optional(),
  /** ①2호 — 증여자 자본적지출 총액 (양도비 §97①3호 제외) */
  donorCapitalExpenditure: z.number().int().nonnegative().optional(),
  /** ①3호 × 영 §163의2②1호 — 증여세 산출세액 */
  giftTaxAmount: z.number().int().nonnegative().optional(),
  /** 영 §163의2②2호 — 양도한 해당 자산가액(안분 분자) */
  transferredAssetValue: z.number().int().nonnegative().optional(),
  /** 영 §163의2②3호 — 증여세 과세가액(안분 분모) */
  giftTaxableValue: z.number().int().nonnegative().optional(),

  // §94①4 다목 부가
  cumulativeTransferRatio: z.number().min(0).max(1).optional(),
  // §94①4 다목 요건 3종 + 합산창 (2026-09-13) — 전부 **0~1 소수**(④ 가 % 에서 변환).
  blockShareholderRealEstateRatio: z.number().min(0).max(1).optional(),
  blockShareholderOwnershipRatio: z.number().min(0).max(1).optional(),
  /** 영 §158② 합산기간 최초 양도일 — ⑭ 가 `toOptionalDate` 로 Date 화한다. */
  aggregationFirstTransferDate: z.union([z.string(), z.date()]).optional(),
  /** 영 §168② 「대주주로서 납부하였거나 납부할 세액」(원) */
  priorMajorShareholderTax: z.number().min(0).optional(),
  /**
   * 영 §158② 기신고분 합산액(원 · 당회차 **제외**). 엔진이 STEP 4.5 에서 더한다.
   * ⚠️ 여기가 빠지면 ⑫ Zod 가 **침묵 strip** 해 합산이 엔진에 닿지 않는다.
   */
  priorTransferPrice: z.number().min(0).optional(),
  priorAcquisitionPrice: z.number().min(0).optional(),
  priorExpenses: z.number().min(0).optional(),
  priorShareCount: z.number().min(0).optional(),
  /** 합산에 들어간 기신고 건수 — 결과 표시 전용(합산 여부를 가르지 않는다) */
  priorAggregationSourceCount: z.number().min(0).optional(),
  /** §104①9호 판정 — 법인 자산총액 중 비사업용토지 가액 비율(0~1 소수). 시행령 §167의7 임계 0.5 */
  nblRatioOfCorpAssets: z.number().min(0).max(1).optional(),
  /** §104⑤ 크로스 조정 — 같은 과세기간 부동산 §104①8호 과세표준(원). 미입력이면 조정 미적용 */
  crossClause8TaxBase: z.number().min(0).optional(),

  // 양도가액
  transferPriceMode: transferPriceModeSchema,
  transferActualInputMode: transferActualInputModeSchema.optional().default("total"),  // 3중 패턴 default: "total" (store·normalize·api 일치)
  perShareTransferPrice: z.number().min(0).optional(),
  transferTotalPrice: z.number().int().min(0).optional(),
  exchangePropertyValue: z.number().min(0).optional(),
  exchangeDebtRelief: z.number().min(0).optional(),
  exchangeCash: z.number().min(0).optional(),

  // 취득가액
  acquisitionMode: acquisitionModeSchema,
  acquisitionActualInputMode: acquisitionActualInputModeSchema.optional(),  // default "per_share" (lots-only 모드)
  perShareAcquisitionPrice: z.number().min(0).optional(),

  // R-1' 매매사례가액 (영§176의2③1호) — sale_case 모드 확장
  acquisitionMarketSamplePrice: z.number().min(0).optional(),
  acquisitionMarketSampleDate: z.union([z.string(), z.date()]).optional(),
  acquisitionMarketSampleCounterparty: z.string().optional(),
  transferMarketSamplePrice: z.number().min(0).optional(),
  transferMarketSampleDate: z.union([z.string(), z.date()]).optional(),
  transferMarketSampleCounterparty: z.string().optional(),

  // R-2 자본조정 (무상증자·감자)
  capitalAdjustments: z.array(capitalAdjustmentSchema).max(100).optional(),

  // 환산 — 상장
  transferDatePriceAvg1Month: z.number().min(0).optional(),
  acquisitionDatePriceAvg1Month: z.number().min(0).optional(),
  // §163⑨ 분모 입력 방식 (메타·산식 영향 없음 — UI mirror 패턴 식별용)
  transferStdInputMode: z.enum(["direct", "daily"]).optional().default("direct"),
  // §165⑤ 첫 항(상장일 이후 1개월 종가) 입력 방식 (메타·산식 영향 없음 — 결과 배너용)
  listingStdInputMode: z.enum(["direct", "daily"]).optional().default("direct"),
  listingDate: z.union([z.string(), z.date()]).optional(),
  listingDatePriceAvg1Month: z.number().min(0).optional(),
  acquiredBeforeListing: z.boolean(),
  // Round 4 — nested PostListingDetailInput (full/listing_only 모드)
  postListingDetail: postListingDetailSchema.optional(),
  tradingHaltAtTransfer: z.boolean(),
  // [C-1] 취득일 거래정지 (소령 §165③ 후문 — 취득시 기준시가만 §165④ 보충 평가)
  tradingHaltAtAcquisition: z.boolean().optional(),

  // 환산 — 비상장 보충적 평가 (3시점)
  transferYearNetIncomePerShare: z.number().optional(),
  transferYearNetAssetPerShare: z.number().optional(),
  listingYearNetIncomePerShare: z.number().optional(),
  listingYearNetAssetPerShare: z.number().optional(),
  acquisitionYearNetIncomePerShare: z.number().optional(),
  acquisitionYearNetAssetPerShare: z.number().optional(),

  // 소칙 §81④ 1호 월할 가산 (전전사업연도 평가 + 직전사업연도 월수) — 본체·준용 공용
  prePriorYearNetIncomePerShare: z.number().optional(),
  prePriorYearNetAssetPerShare: z.number().optional(),
  priorBizYearMonths: z.number().int().min(1).max(12).optional(),
  // [B-4 §165⑨ 본체] 비상장 환산 양도·취득 기준시가 동일 동일사업연도 토글
  unlistedSameBizYearToggle: z.boolean().optional(),

  // 장부분실 §99①4
  bookLost: z.boolean(),
  faceValuePerShare: z.number().min(0).optional(),

  // [사례 49] 취득시 장부분실 액면가 (§99①4 후단) + 양도시 §165④ 보충 평가
  // DR-2: boolean default(false) — body 미설정 시에도 안전
  acqFaceValueOnly: z.boolean().default(false),
  acqFaceValuePerShare: z.number().int().positive().optional(),

  // 순자산 단독 평가 사유 §165④3
  netAssetOnlyReason: netAssetOnlyReasonSchema.optional(),

  // 필요경비
  expenseMode: expenseModeSchema,
  actualExpenses: z.number().min(0).optional(),

  // 신고
  filingType: filingTypeSchema,
  filingDate: requiredDateSchema,
  isElectronicFiling: z.boolean(),
  filingViolation: filingViolationSchema,
  isFraudulent: z.boolean(),
  isInternationalTransaction: z.boolean(),

  // 가산세 상세 — 국세기본법 §47조의3①「과소신고납부세액등」 차감 항목 · §47조의4 납부지연
  originalFiledTax: z.number().min(0).optional(),
  priorPaidTax: z.number().min(0).optional(),
  interestSurcharge: z.number().min(0).optional(),
  fraudulentPortion: z.number().min(0).optional(),
  unpaidTax: z.number().min(0).optional(),
  paymentDeadline: z.union([z.string(), z.date()]).optional(),
  actualPaymentDate: z.union([z.string(), z.date()]).optional(),

  // §103① 기본공제 그룹
  realEstateGroupBasicDeductionUsed: z.number().min(0),

  // 분할 매수·분할 양도 (Plan v2.2 — optional, lotsMode='split' 시 필수)
  // .max() — 요청당 계산 비용 상한 (DoS 표면 차단; 실무상 lot 수는 수백 미만)
  acquisitionLots: z.array(acquisitionLotSchema).max(500).optional(),
  transferLots: z.array(transferLotSchema).max(500).optional(),
  costAllocationMethod: costAllocationMethodSchema.optional(),
  specificMatchings: z.array(specificMatchingSchema).max(2000).optional(),

  // [부담부증여 전용] §159 개산공제 base 안분 비율 B/C (비상장 estimated 경로 전용)
  // acquisitionMode === "estimated" && marketType === "unlisted" 시에만 유효.
  // 범위 0~1 (exclusive 0, inclusive 1). undefined = 일반 주식 양도(기존 동작 보존).
  burdenedGiftDebtRatio: z.number().min(0).max(1).optional(),
});

export type StockTransferInputSchema = z.infer<typeof stockTransferInputSchema>;

// ============================================================
// ⑩ Zod 컴패니언 — 다자산 합산 스키마 + addStockRefines
// ============================================================

// `addStockRefines` 는 `stock-transfer-tax-refines.ts` 로 분리했다(800줄 정책).
// 🔑 `export { X } from "..."` 는 **지역 바인딩을 만들지 않는다** — 아래
//    `aggregateStockItemSchema` 가 이 파일 안에서 호출하므로 import 도 함께 한다.
export { addStockRefines } from "./stock-transfer-tax-refines";
import { addStockRefines } from "./stock-transfer-tax-refines";

/*
 * 다자산 합산 입력 스키마(`stockTransferAggregateInputSchema`)는 **파일 하단**에 있다 —
 * `items`가 `foreignStockInputSchema`를 union으로 참조하는데 그 스키마가 아래에서 정의되기
 * 때문이다(const는 호이스팅되지 않는다).
 */

// 해외주식 Zod 스키마는 `stock-transfer-foreign-schema.ts` 로 분리했다(파일 크기 정책).
// 기존 import 경로를 깨지 않도록 **그대로 re-export** 한다.
export {
  foreignTransferPriceModeSchema,
  foreignAcquisitionModeSchema,
  foreignTaxMethodSchema,
  transferReceiptModeSchema,
  installmentReceiptSchema,
  foreignStockInputSchema,
} from "./stock-transfer-foreign-schema";

// ============================================================
// 다자산 합산 입력 스키마 — 종목별 배열 (국내주식 + 국외주식)
//
// 같은 과세기간에 복수 종목을 양도할 때의 합산신고:
//   · §102①2호 — 국내·국외주식이 **같은 호**라 양도차손 통산 대상
//   · §103①2호 — 기본공제 250만원 **공동 그룹** 연 1회
//   · §103② — 먼저 양도한 자산부터 배분
//   · §118의6①1호 — 국외 종목 외국납부세액 공제한도 A × B / C 안분
//
// ⚠️ **`marketType`으로 갈리는 discriminated union**이다. 국외주식은
//    `marketType: "foreign_stock"`이고 필수 필드 집합이 국내와 완전히 다르다.
//    ⇒ `z.union`이라 실패 메시지가 두 갈래로 나온다. 어느 쪽 스키마를 의도했는지는
//      `marketType`을 보면 알 수 있다.
// ============================================================

/**
 * 합산 대상 종목 1건 — 국내주식 또는 국외주식
 *
 * 🔑 국내 갈래는 **단건과 같은 refine**을 탄다. 종전에는 맨 `stockTransferInputSchema`라
 *    **단건이면 400인 payload가 items[]에 넣으면 통과**했다 —
 *    국외 갈래는 자체 `.superRefine`이 인라인이라 살아남고 국내만 빠지는 비대칭이었다.
 *    이 파일 상단 주석이 「API를 직접 호출하는 경로에는 이 게이트가 유일한 방어다」라고
 *    적어 둔 그 게이트다(마법사 UI는 `validateFilingItems`가 먼저 막으므로 발현은
 *    API 직접 호출·외부 연동에 한정된다).
 *
 * ⚠️ `addStockRefines`는 `ZodEffects`를 돌려주므로 union 요소 타입이 바뀐다 —
 *    `route.ts`의 `rawItems.map`·`marketType === "foreign_stock"` 분기는 **파싱 출력**을
 *    보므로 영향이 없다(출력 타입은 그대로다).
 */
export const aggregateStockItemSchema = z.union([
  foreignStockInputSchema,
  addStockRefines(stockTransferInputSchema),
]);

export const stockTransferAggregateInputSchema = z.object({
  /** 양도 종목 배열 (최소 1개, 최대 100 — 요청당 계산 비용 상한) */
  items: aggregateStockItemSchema.array().min(1).max(100),
  /**
   * 다자산 합산 시 §103① 기본공제 그룹별 한도 적용 방식
   * - "each_item": 각 종목별 개별 공제 (단건과 동일 — 과다공제 가능)
   * - "aggregate": 합산 후 그룹별 1회 공제 (법령 정합)
   */
  deductionMode: z.enum(["each_item", "aggregate"]).default("aggregate"),
  /**
   * §111③ 확정신고 기납부세액 — **신고 단위**(종목별이 아니다).
   *
   * ⚠️ 종목 스키마의 `priorPaidTax`(국세기본법 §47조의3① 가산세 base)와 **다른 축**이다.
   *    이름이 섞이면 한쪽을 고칠 때 다른 쪽이 조용히 따라온다.
   * ⚠️ 이 필드가 스키마에 없으면 Zod가 **침묵 strip**해 엔진에 도달하지 않는다(⑫).
   */
  preliminaryPaidTax: z.number().int().nonnegative().optional(),
  preliminaryPaidLocalTax: z.number().int().nonnegative().optional(),
});

// ============================================================
// PR-4B 국외전출세 스키마 — 별도 파일로 분리 (800줄 정책)
// stock-transfer-exit-tax-schema.ts 에서 re-export
// ============================================================
export {
  departureDayValuationModeSchema,
  deferralReasonSchema,
  foreignTaxExclusionReasonSchema,
  exitTaxHoldingSchema,
  exitTaxInputSchema,
} from "./stock-transfer-exit-tax-schema";
