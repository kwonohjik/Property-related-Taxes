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
  "appraisal",
  "estimated",
  "face_value",
]);

export const transferPriceModeSchema = z.enum(["actual", "exchange"]);

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
  "merger_split",
]);

export const filingTypeSchema = z.enum(["preliminary", "final", "revised"]);

export const expenseModeSchema = z.enum(["actual", "estimated"]);

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
  priorYearEndDate: z.union([z.string(), z.date()]),

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

  // 거래 일자·수량
  acquisitionDate: z.union([z.string(), z.date()]),
  transferDate: z.union([z.string(), z.date()]),
  shareCount: z.number().int().positive(),
  totalIssuedShares: z.number().int().positive(),

  // 보유기간 기산점 §104②
  acquisitionCause: acquisitionCauseSchema,
  decedentAcquisitionDate: z.union([z.string(), z.date()]).optional(),
  donorAcquisitionDate: z.union([z.string(), z.date()]).optional(),
  preMergerAcquisitionDate: z.union([z.string(), z.date()]).optional(),

  // §94①4 다목 부가
  cumulativeTransferRatio: z.number().min(0).max(1).optional(),

  // 양도가액
  transferPriceMode: transferPriceModeSchema,
  perShareTransferPrice: z.number().min(0).optional(),
  exchangePropertyValue: z.number().min(0).optional(),
  exchangeDebtRelief: z.number().min(0).optional(),
  exchangeCash: z.number().min(0).optional(),

  // 취득가액
  acquisitionMode: acquisitionModeSchema,
  perShareAcquisitionPrice: z.number().min(0).optional(),

  // 환산 — 상장
  transferDatePriceAvg1Month: z.number().min(0).optional(),
  listingDate: z.union([z.string(), z.date()]).optional(),
  listingDatePriceAvg1Month: z.number().min(0).optional(),
  acquiredBeforeListing: z.boolean(),
  tradingHaltAtTransfer: z.boolean(),

  // 환산 — 비상장 보충적 평가 (3시점)
  transferYearNetIncomePerShare: z.number().optional(),
  transferYearNetAssetPerShare: z.number().optional(),
  listingYearNetIncomePerShare: z.number().optional(),
  listingYearNetAssetPerShare: z.number().optional(),
  acquisitionYearNetIncomePerShare: z.number().optional(),
  acquisitionYearNetAssetPerShare: z.number().optional(),

  // 장부분실 §99①4
  bookLost: z.boolean(),
  faceValuePerShare: z.number().min(0).optional(),

  // 순자산 단독 평가 사유 §165④3
  netAssetOnlyReason: netAssetOnlyReasonSchema.optional(),

  // 필요경비
  expenseMode: expenseModeSchema,
  actualExpenses: z.number().min(0).optional(),

  // 신고
  filingType: filingTypeSchema,
  filingDate: z.union([z.string(), z.date()]),
  isElectronicFiling: z.boolean(),
  isFraudulent: z.boolean(),
  isInternationalTransaction: z.boolean(),

  // §103② 기본공제 그룹
  realEstateGroupBasicDeductionUsed: z.number().min(0),
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
  });
}

/**
 * 다자산 합산 입력 스키마 — 종목별 배열
 *
 * 같은 연도 복수 종목 양도 시 합산신고:
 *   - §103② 기본공제 250만원은 그룹별 1회 한정
 *   - 각 종목 결과 개별 계산 후 합산
 */
export const stockTransferAggregateInputSchema = z.object({
  /** 양도 종목 배열 (최소 1개) */
  items: stockTransferInputSchema.array().min(1),
  /**
   * 다자산 합산 시 §103② 기본공제 그룹별 한도 적용 방식
   * - "each_item": 각 종목별 개별 공제 (단건과 동일 — 과다공제 가능)
   * - "aggregate": 합산 후 그룹별 1회 공제 (법령 정합)
   */
  deductionMode: z.enum(["each_item", "aggregate"]).default("aggregate"),
});
