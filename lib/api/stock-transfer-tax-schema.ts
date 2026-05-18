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
  "merger_split",
]);

export const filingTypeSchema = z.enum(["preliminary", "final", "revised"]);

export const expenseModeSchema = z.enum(["actual", "estimated"]);

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
  acquisitionDate: z.union([z.string(), z.date()]),
  shareCount: z.number().int().positive(),
  perShareAcquisitionPrice: z.number().int().positive(),
  acquisitionCause: acquisitionCauseSchema,
  decedentAcquisitionDate: z.union([z.string(), z.date()]).optional(),
  preMergerAcquisitionDate: z.union([z.string(), z.date()]).optional(),
});

export const transferLotSchema = z.object({
  id: z.string().optional(),
  transferDate: z.union([z.string(), z.date()]),
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
  // §94①3 가목 1) 단서 — 장내 거래 여부 (default true, 기존 동작 호환)
  isOnMarketTransaction: z.boolean().optional().default(true),

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
  transferActualInputMode: transferActualInputModeSchema.optional(),  // default "per_share"
  perShareTransferPrice: z.number().min(0).optional(),
  transferTotalPrice: z.number().int().min(0).optional(),
  exchangePropertyValue: z.number().min(0).optional(),
  exchangeDebtRelief: z.number().min(0).optional(),
  exchangeCash: z.number().min(0).optional(),

  // 취득가액
  acquisitionMode: acquisitionModeSchema,
  acquisitionActualInputMode: acquisitionActualInputModeSchema.optional(),  // default "per_share" (lots-only 모드)
  perShareAcquisitionPrice: z.number().min(0).optional(),

  // 환산 — 상장
  transferDatePriceAvg1Month: z.number().min(0).optional(),
  acquisitionDatePriceAvg1Month: z.number().min(0).optional(),
  listingDate: z.union([z.string(), z.date()]).optional(),
  listingDatePriceAvg1Month: z.number().min(0).optional(),
  acquiredBeforeListing: z.boolean(),
  // Round 4 — nested PostListingDetailInput (full/listing_only 모드)
  postListingDetail: postListingDetailSchema.optional(),
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

  // 분할 매수·분할 양도 (Plan v2.2 — optional, lotsMode='split' 시 필수)
  acquisitionLots: z.array(acquisitionLotSchema).optional(),
  transferLots: z.array(transferLotSchema).optional(),
  costAllocationMethod: costAllocationMethodSchema.optional(),
  specificMatchings: z.array(specificMatchingSchema).optional(),
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

    // 양도가액 total 모드 필수성 (single 모드 한정 — split 모드는 위 게이트에서 차단)
    if (
      data.transferPriceMode === "actual" &&
      (data.transferActualInputMode ?? "per_share") === "total" &&
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
      // Refine 3 — specific 차단 (UI disabled의 방어선)
      if (data.costAllocationMethod === "specific") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["costAllocationMethod"],
          message: "취득 다건 입력 모드에서는 개별법(specific)을 지원하지 않습니다 (fifo 또는 moving_avg)",
        });
      }
    }

    // 분할 매수·분할 양도 호환성 게이트 (Plan v2.2)
    const isSplit =
      (data.acquisitionLots && data.acquisitionLots.length > 0) ||
      (data.transferLots && data.transferLots.length > 0) ||
      data.costAllocationMethod !== undefined;
    if (isSplit) {
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
        if (data.acquisitionLots) {
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
      const totalTrn = data.transferLots?.reduce((s, l) => s + l.shareCount, 0) ?? 0;
      const totalAcq = data.acquisitionLots?.reduce((s, l) => s + l.shareCount, 0) ?? 0;
      if (totalTrn > totalAcq) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferLots"],
          message: `총 매도 수량(${totalTrn})이 총 매수 수량(${totalAcq})을 초과합니다`,
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
