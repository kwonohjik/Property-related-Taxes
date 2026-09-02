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

  // §103② 기본공제 그룹
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

/**
 * addStockRefines — 단건 입력에 cross-field 검증 추가
 *
 * 부동산 addPropertyRefines 패턴 차용:
 *   - 외국법인(out_of_scope_foreign) 차단 (Zod 레벨 이중 차단)
 *   - 국제거래 부정: isInternationalTransaction=true → isFraudulent=true 필수
 *   - 과점주주 3년 누적: §94①4 다목 → cumulativeTransferRatio 필수
 */
export function addStockRefines(
  schema: typeof stockTransferInputSchema,
) {
  return schema.superRefine((data, ctx) => {
    // 외국법인 차단 (UI validate 와 동기 — 3중 패턴)
    if ((data.marketType as string) === "out_of_scope_foreign") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["marketType"],
        message: "해외주식(§94①3 다목)은 이 계산기의 스코프 외입니다",
      });
    }

    // 국제거래 부정 60% → 반드시 isFraudulent=true (단서 조건)
    if (data.isInternationalTransaction && !data.isFraudulent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isInternationalTransaction"],
        message: "국제거래 부정 가산세(§47의2②1 단서)는 부정행위 과소신고(isFraudulent=true)와 함께 적용됩니다",
      });
    }

    // 부정행위·국제거래 가산은 신고 위반이 전제 (filingViolation !== "none")
    if (data.filingViolation === "none" && (data.isFraudulent || data.isInternationalTransaction)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["filingViolation"],
        message: "부정행위·국제거래 가산세는 신고 위반(과소신고 또는 무신고)이 전제됩니다. 신고 위반 여부를 선택하세요.",
      });
    }

    /**
     * [C-3] 양도일 거래정지 + 취득 후 상장 — 법령상 양립 불가(서버 방어, validate G-5 미러)
     * §165⑤은 양도일에 §3항 주식(상장+정상거래) 전제. 거래정지는 상증령 §52의2③로 §3항 제외 → §165⑤ 불성립.
     *
     * 🔑 **취득모드 게이트를 추가한다** — 종전에는 무조건이라, 두 토글이 stale로 남은 채
     *    취득모드를 실가로 되돌리면 **아무 영향도 없는 조합에 400**이 났다(과다 차단).
     *    두 플래그는 엔진에서 `acquisitionMode === "estimated"` 분기 **안에서만** 읽히므로
     *    그 밖에서는 애초에 판단 대상이 아니다(⑧ validate도 같은 게이트 안에 있다).
     *
     * ⚠️ validate는 여기에 더해 **상장 3종** 게이트도 갖고 있지만 이쪽은 걸지 않는다 —
     *    서버 가드를 시장까지 좁히면 비상장 stale 조합(UI로는 도달 불가·API 직접 호출로는 가능)의
     *    차단이 사라진다. 좁히는 방향은 그 자체로 위험이므로 필요한 축만 맞춘다.
     */
    const haltGateApplies = data.acquisitionMode === "estimated";
    if (haltGateApplies && data.tradingHaltAtTransfer && data.acquiredBeforeListing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tradingHaltAtTransfer"],
        message: "양도일 거래정지·관리종목 주식은 §3항 주식이 아니어서(상증령 §52의2③ 제외) 취득 후 상장(§165⑤) 환산 대상이 아닙니다. 거래정지 또는 취득 후 상장 중 하나만 선택하세요.",
      });
    }

    // [C-1 M-4] 취득일 거래정지 + 취득 후 상장 — 취득 당시 비상장이면 취득일 거래정지 개념 불성립
    // (validate G-5 패턴과 동일 문구 — 기존 G-5는 validate만 차단·Zod 부재 = 기존 갭, 신규 필드만 완전 방어)
    if (haltGateApplies && data.tradingHaltAtAcquisition && data.acquiredBeforeListing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tradingHaltAtAcquisition"],
        message: "취득 당시 비상장 주식은 취득일 거래정지 대상이 아닙니다. 취득일 거래정지 토글 또는 취득 후 상장 토글을 해제하세요.",
      });
    }

    /**
     * 상장 환산 1개월 종가평균 필수 — 시행령 §176의2②1호 (⑧ validate step2와 3중 패턴).
     *
     * 미입력이면 `calcListedValuation`의 0-가드에 걸려 **취득가액·개산공제가 둘 다 0**으로
     * 떨어진다. 종전에는 ⑧에만 게이트가 있어 API를 직접 호출하거나 ⑤ 입력 UI가 없는
     * 경로(주식 부담부증여 §159)가 그대로 통과했다.
     *
     * 면제 축: 분자(취득측)는 취득일 거래정지 또는 취득 후 상장(§165⑤) 시 법령상 무효라
     * 엔진이 쓰지 않고, 분모(양도측)는 양도일 거래정지 시 무효다.
     *
     * ⚠️ 분모는 **취득 후 상장(§165⑤)도 면제**한다 — ⑧보다 한 칸 느슨한 유일한 지점이다.
     * 그 분기는 `resolveTransferStd`가 1주당 양도가로 fallback하고 경고까지 남기는
     * **설계된 동작**이라, 여기서 막으면 엔진이 정상 처리하는 payload를 400으로 돌린다
     * (좁히는 방향은 그 자체로 위험 — 필요한 축만 막는다). ⑧은 fallback에 기대지 않도록
     * UI에서 더 강하게 요구하고, ⑫는 **소리 없이 0이 되는** 일반 상장 환산만 차단한다.
     */
    if (
      data.acquisitionMode === "estimated" &&
      ["kospi", "kosdaq", "konex"].includes(data.marketType as string)
    ) {
      if (
        !data.tradingHaltAtTransfer &&
        !data.acquiredBeforeListing &&
        !(data.transferDatePriceAvg1Month ?? 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferDatePriceAvg1Month"],
          message: "상장 환산: 양도일 이전 1개월 종가 평균을 입력하세요 (시행령 §176의2②1호 환산비율 분모)",
        });
      }
      if (
        !data.acquiredBeforeListing &&
        !data.tradingHaltAtTransfer &&
        !data.tradingHaltAtAcquisition &&
        !(data.acquisitionDatePriceAvg1Month ?? 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionDatePriceAvg1Month"],
          message: "상장 환산: 취득일 이전 1개월 종가 평균을 입력하세요 (시행령 §176의2②1호 환산비율 분자)",
        });
      }
    }

    // R-1' 매매사례가액 — 시장 유형 게이트 (영§176의2③1호 단서)
    if (data.acquisitionMode === "sale_case") {
      const isListed = ["kospi", "kosdaq", "konex"].includes(data.marketType as string);
      if (isListed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionMode"],
          message: "매매사례가액 모드는 비상장·기타자산 전용입니다 (영§176의2③1호 단서 — 주권상장법인 주식등 제외)",
        });
      }
    }

    // [A-2] R-2 자본조정 — split 모드 결합 허용 (lot별 희석 전처리로 지원). split 차단 제거.

    // 기타자산 입력 시 관련 필드 최소 1개 필수
    if (data.marketType === "other_asset") {
      if (!data.isQualifyingBlockShareholder && !data.isHeavyRealEstateForRate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["marketType"],
          message: "기타자산은 §94①4 다목(과점주주) 또는 라목(부동산과다보유법인) 중 하나 이상 해당해야 합니다",
        });
      }
    }

    // 양도가액 total 모드 필수성 (single 모드 한정 — split 모드는 위 게이트에서 차단)
    if (
      data.transferPriceMode === "actual" &&
      (data.transferActualInputMode ?? "total") === "total" &&
      (!data.transferTotalPrice || data.transferTotalPrice <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transferTotalPrice"],
        message: "총액 직접 입력 시 양도가액 합계는 0보다 커야 합니다",
      });
    }

    // ── lots-only 모드 (취득 다건 입력 + 양도 단일) refine 3건 ──
    // 기존 isSplit 게이트와 독립 작용 (API 합성 후 body는 isSplit도 통과)
    const isLotsOnlyMode =
      (data.acquisitionActualInputMode ?? "per_share") === "lots";
    if (isLotsOnlyMode) {
      // Refine 1 — acquisitionLots ≥ 1 강제
      if (!data.acquisitionLots || data.acquisitionLots.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionLots"],
          message: "취득가액 다건 입력 모드: 매수 lot을 1행 이상 입력하세요",
        });
      }
      // (Refine 2 폐기) total + lots 조합 차단 제거 — 2026-05-18 사용자 요청.
      // API 변환에서 perShareTransferPrice를 Math.round(transferTotalPrice / shareCount)로 역산.
      // UI 안내 카드(Step2)에서 잔돈 오차 가능 사전 고지.
      // (Refine 3 폐기 — A-1) specific 차단 제거 → 합성 매도 lot 1건에 대한 매수 lot별 매칭 지원.
      //   무결성(매칭 합 = 합성 매도 수량, 매수 lot별 ≤ 잔여)은 아래 isSplit 매칭 무결성 체크가 담당.
    }

    // 분할 매수·분할 양도 호환성 게이트 (Plan v2.2)
    const isSplit =
      (data.acquisitionLots && data.acquisitionLots.length > 0) ||
      (data.transferLots && data.transferLots.length > 0) ||
      data.costAllocationMethod !== undefined;
    if (isSplit) {
      // [A-2] 자본조정 존재 시 raw 수량 정합 검증 면제(희석은 엔진 전처리) — 아래 게이트에서 사용
      const hasCapitalAdjustments = !!(data.capitalAdjustments && data.capitalAdjustments.length > 0);
      // 양쪽 lot 배열 모두 ≥ 1
      if (!data.acquisitionLots || data.acquisitionLots.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionLots"],
          message: "분할 모드: 매수 lot을 1행 이상 입력하세요",
        });
      }
      if (!data.transferLots || data.transferLots.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferLots"],
          message: "분할 모드: 매도 lot을 1행 이상 입력하세요",
        });
      }
      if (!data.costAllocationMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["costAllocationMethod"],
          message: "분할 모드: 산정방법(specific/fifo/moving_avg)을 선택하세요",
        });
      }
      // 분할 모드는 실가 모드만 (acquisitionMode === "actual")
      if (data.acquisitionMode !== "actual") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionMode"],
          message: "분할 모드에서는 취득가 산정방법으로 실가(actual)만 지원합니다",
        });
      }
      if (data.transferPriceMode === "exchange") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferPriceMode"],
          message: "분할 모드에서는 양도가액 모드로 교환을 지원하지 않습니다",
        });
      }
      // 분할 모드에서 total 직접 입력 차단 (UI disabled의 Zod 방어선)
      // 단, lots-only 모드(acquisitionActualInputMode === "lots")는 허용 — 2026-05-18 제약 해제.
      // lots-only는 API에서 합성 transferLot 1건만 생성 → 정확한 분할 양도 아님.
      if (
        data.transferActualInputMode === "total" &&
        (data.acquisitionActualInputMode ?? "per_share") !== "lots"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferActualInputMode"],
          message: "분할 모드에서는 양도가액 합계 직접 입력을 지원하지 않습니다 (lot별 단가 사용)",
        });
      }
      // cause별 보조 일자 필수
      data.acquisitionLots?.forEach((lot, i) => {
        if (lot.acquisitionCause === "inheritance" && !lot.decedentAcquisitionDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["acquisitionLots", i, "decedentAcquisitionDate"],
            message: "상속 lot은 피상속인 취득일을 입력하세요 (§104②1)",
          });
        }
        if (lot.acquisitionCause === "merger_split" && !lot.preMergerAcquisitionDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["acquisitionLots", i, "preMergerAcquisitionDate"],
            message: "합병·분할 lot은 종전 주식 취득일을 입력하세요 (§104②3)",
          });
        }
      });
      // specific 매칭 무결성 — 매도 lot별 매칭 합 = 매도 수량
      if (data.costAllocationMethod === "specific" && data.specificMatchings && data.transferLots) {
        for (const trn of data.transferLots) {
          const sum = data.specificMatchings
            .filter((m) => m.transferLotId === trn.id)
            .reduce((s, m) => s + m.shareCount, 0);
          if (sum !== trn.shareCount) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["specificMatchings"],
              message: `매도 lot ${trn.id ?? "?"}의 매칭 합계(${sum})가 매도 수량(${trn.shareCount})과 다릅니다`,
            });
          }
        }
        // 매수 lot별 매칭 합 ≤ lot 수량
        // [A-2] 자본조정(무상증자) 시 lot 주식수가 희석 전(raw)이라 매칭(희석 후)과 단위 불일치 →
        //   엔진 matchSpecific의 lot 잔여 가드에 위임(초과 시 warning·skip). 정적 검증 면제.
        if (data.acquisitionLots && !hasCapitalAdjustments) {
          for (const acq of data.acquisitionLots) {
            const sum = data.specificMatchings
              .filter((m) => m.acquisitionLotId === acq.id)
              .reduce((s, m) => s + m.shareCount, 0);
            if (sum > acq.shareCount) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["specificMatchings"],
                message: `매수 lot ${acq.id ?? "?"}에 매칭된 합계(${sum})가 lot 수량(${acq.shareCount})을 초과합니다`,
              });
            }
          }
        }
      }
      // 매도 수량 합 ≤ 매수 수량 합
      // [A-2] 자본조정 시 매수 수량이 희석 전이라 무상증자로 매도>매수가 정당 → 엔진 allocateLots 가드에 위임.
      const totalTrn = data.transferLots?.reduce((s, l) => s + l.shareCount, 0) ?? 0;
      const totalAcq = data.acquisitionLots?.reduce((s, l) => s + l.shareCount, 0) ?? 0;
      if (totalTrn > totalAcq && !hasCapitalAdjustments) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferLots"],
          message: `총 매도 수량(${totalTrn})이 총 매수 수량(${totalAcq})을 초과합니다`,
        });
      }
      /**
       * 매도 시점별 누적 검사 — 총수량만 보면 **매도일보다 나중에 취득한 lot**이
       * 소진돼 보유일수가 음수가 되고 `isShortTerm`으로 세율까지 갈린다.
       * ⑧ validate(`pushLotTimelineErrors`)와 같은 규칙이며, 누적 수량 쪽만
       * 자본조정(희석 전 단위) 면제를 위 총수량 검사와 같은 기준으로 공유한다.
       */
      if (data.acquisitionLots && data.transferLots) {
        // JSON 경유 후 string으로 도달할 수 있다 — 직접 비교하면 조용히 false가 된다.
        const asTime = (v: unknown): number => toOptionalDate(v)?.getTime() ?? NaN;
        const buys = data.acquisitionLots
          .map((l) => ({ time: asTime(l.acquisitionDate), shares: l.shareCount }))
          .filter((b) => Number.isFinite(b.time));
        const sales = [...data.transferLots]
          .map((l, i) => ({ index: i, time: asTime(l.transferDate), shares: l.shareCount }))
          .filter((s) => Number.isFinite(s.time))
          .sort((a, b) => a.time - b.time);
        let cumulativeSold = 0;
        for (const sale of sales) {
          const availableShares = buys
            .filter((b) => b.time <= sale.time)
            .reduce((s, b) => s + b.shares, 0);
          cumulativeSold += sale.shares;
          if (availableShares === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["transferLots", sale.index, "transferDate"],
              message: "이 양도일 이전에 취득한 매수 lot이 없습니다",
            });
          } else if (!hasCapitalAdjustments && cumulativeSold > availableShares) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["transferLots", sale.index, "shareCount"],
              message: `이 양도일까지 누적 매도(${cumulativeSold})가 그 시점 보유 수량(${availableShares})을 초과합니다`,
            });
          }
        }
      }
    }
  });
}

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
