/**
 * 비상장주식 V2 평가 입력 Zod 스키마 — 별지 부표3 완전 재현
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Engine Types: lib/tax-engine/types/unlisted-stock-valuation.types.ts
 * KoreanLaw 검증 2026-05-22:
 *   §54④ 4호 삭제 → 1·2·3·5·6호 5종
 *   조특법 §101 삭제 → 상증법 §63③ + 상증령 §53⑥⑦⑧9호
 *   환원율 §17 (10%) / 영업권 이자율 §19① (10%)
 *
 * 분리 사유: property-valuation-input.ts 800줄 정책 준수 (2026-05-22)
 */

import { z } from "zod";

/** §54④ 순자산 단독 평가 사유 5종 (4호 삭제 반영) */
export const unlistedNetAssetOnlyReasonSchema = z.enum([
  "liquidation",        // 1호
  "lt3y",               // 2호
  "real_estate_80",     // 3호 (단서)
  "stock_holding_80",   // 5호 (단서) — 4호 아님
  "remaining_3y",       // 6호
]);

/** §53⑧ 최대주주 할증 배제 사유 9가지 */
export const unlistedPremiumExclusionReasonSchema = z.enum([
  "continuous_loss_3y",        // 1호
  "all_sold_within_6m",        // 2호
  "calc_gift_profit",          // 3호
  "subsidiary_other_max",      // 4호
  "all_negative_op_income_3y", // 5호
  "liquidation_confirmed",     // 6호
  "not_max_after_succession",  // 7호
  "deemed_gift_nominee",       // 8호
  "small_medium_enterprise",   // 9호
]);

/** 자본금 변동 — 상증규 §17의3⑤ + §56⑤ */
export const unlistedCapitalChangeSchema = z.object({
  changeType: z.enum(["paid_in", "free_issue", "capital_reduction"]),
  /** 변동일 — 새 행은 undefined로 시작. 미입력은 inheritance-validate.ts가 차단. Zod는 optional 허용. */
  changeDate: z.coerce.date().optional(),
  sharesIssued: z.number().int().positive({ message: "주식수는 1 이상이어야 합니다." }),
  pricePerShare: z.number().nonnegative().optional(),
});

/** 사업연도 가산·차감 — 별지 6쪽 ①~㉒ (§56④) */
export const fiscalYearAdjustmentSchema = z
  .object({
    fiscalYearLabel: z.string().min(1),
    fiscalYearEndDate: z.coerce.date(),
    /**
     * §17의3② 1년 미만 사업연도 연환산용 개시일 (선택).
     * 미입력 시 12개월 가정 — 회귀 0.
     * 입력 시 개시일 > 종료일이면 validation 차단.
     */
    fiscalYearStartDate: z.coerce.date().optional(),
    taxableIncome: z.number(),
    // 가산 ②~⑦
    addRefundInterest: z.number().nonnegative().optional(),
    addLossFromDividend: z.number().nonnegative().optional(),
    addCarriedDonation: z.number().nonnegative().optional(),
    addCarriedCarPayment: z.number().nonnegative().optional(),
    addForexValuationGain: z.number().nonnegative().optional(),
    addOtherByOrdinance: z.number().nonnegative().optional(),
    // 차감 ⑧~㉒
    subCorporateTax: z.number().nonnegative().optional(),
    subAdditionalTaxes: z.number().nonnegative().optional(),
    subFines: z.number().nonnegative().optional(),
    subCompulsoryPublicCharges: z.number().nonnegative().optional(),
    subPunitiveDamages: z.number().nonnegative().optional(),
    subWithholdingPenalty: z.number().nonnegative().optional(),
    subExcessiveExpenses: z.number().nonnegative().optional(),
    subDonationExcess: z.number().nonnegative().optional(),
    subEntertainmentExcess: z.number().nonnegative().optional(),
    subNonBusinessExpenses: z.number().nonnegative().optional(),
    subNonBusinessCarExpenses: z.number().nonnegative().optional(),
    subInterestPayment: z.number().nonnegative().optional(),
    subDepreciationShortage: z.number().nonnegative().optional(),
    subForexValuationLoss: z.number().nonnegative().optional(),
    subOtherByOrdinance: z.number().nonnegative().optional(),
  })
  .superRefine((fy, ctx) => {
    // 개시일 > 종료일 차단 (§17의3② 입력 검증)
    if (fy.fiscalYearStartDate && fy.fiscalYearStartDate > fy.fiscalYearEndDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fiscalYearStartDate"],
        message: "사업연도 개시일은 종료일 이전이어야 합니다.",
      });
    }
  });

/** 평가차액 행 단위 입력 (3쪽 5.평가차액) — PR-N */
export const evaluationDeltaRowSchema = z.object({
  rowId: z.string().min(1),
  category: z.enum(["asset", "liability"]),
  accountName: z.string().min(1, { message: "계정과목은 필수입니다." }),
  evaluationAmount: z.number().nonnegative(),
  bookAmount: z.number().nonnegative(),
});

/** 순자산가액 계산 입력 — 별지 2~3쪽 (§55① + §17의2) */
export const unlistedNetAssetCalculationSchema = z.object({
  bsTotalAssets: z.number().nonnegative(),
  assetValuationDelta: z.number(),
  corpTaxReservedAmount: z.number(),
  paidInCapitalIncrease: z.number().nonnegative(),
  otherEarnedRights: z.number().nonnegative(),
  prepaidExpenses: z.number().nonnegative(),
  preGiftRetainedEarnings: z.number().nonnegative(),
  bsTotalLiabilities: z.number().nonnegative(),
  corporateTaxPayable: z.number().nonnegative(),
  farmingSurtax: z.number().nonnegative(),
  localIncomeTax: z.number().nonnegative(),
  dividendPayable: z.number().nonnegative(),
  retirementProvision: z.number().nonnegative(),
  otherProvision: z.number().nonnegative(),
  reserveExcluded: z.number().nonnegative(),
  allowanceExcluded: z.number().nonnegative(),
  deferredTaxAdjustment: z.number(),
  insuranceReservePolicy: z.number().nonnegative().optional(),
  insuranceExtraordinaryReserve: z.number().nonnegative().optional(),
  insuranceSurrenderReserve: z.number().nonnegative().optional(),
  // PR-N: 평가차액 행 단위 입력 (자산 50행·부채 30행 한도)
  evaluationDeltaRows: z
    .array(evaluationDeltaRowSchema)
    .max(80)
    .optional()
    .superRefine((rows, ctx) => {
      if (!rows) return;
      const assetCount = rows.filter((r) => r.category === "asset").length;
      const liabilityCount = rows.filter((r) => r.category === "liability").length;
      if (assetCount > 50) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "자산 평가차액 행은 50개를 초과할 수 없습니다." });
      }
      if (liabilityCount > 30) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "부채 평가차액 행은 30개를 초과할 수 없습니다." });
      }
    }),
});

/** 비상장주식 V2 평가 입력 — 별지 양식 1:1 매핑 */
export const unlistedStockValuationV2Schema = z
  .object({
    corpName: z.string().min(1),
    representative: z.string().optional(),
    businessStartDate: z.coerce.date(),
    evaluationDate: z.coerce.date(),
    faceValuePerShare: z.number().positive(),
    totalShares: z.number().int().positive(),
    ownedShares: z.number().int().positive(),
    isRealEstateHeavy: z.boolean(),
    netAssetOnlyReason: unlistedNetAssetOnlyReasonSchema.optional(),
    fiscalYears: z.tuple([
      fiscalYearAdjustmentSchema,
      fiscalYearAdjustmentSchema,
      fiscalYearAdjustmentSchema,
    ]),
    capitalChanges: z.array(unlistedCapitalChangeSchema),
    netAssetValueRaw: unlistedNetAssetCalculationSchema,
    isContinuousLossLastThreeYears: z.boolean(),
    capitalizationRate: z.number().min(0.01).max(1).default(0.10),
    goodwillRate: z.number().min(0.01).max(1).optional(),
    isMaxShareholder: z.boolean(),
    companySize: z.enum(["small", "medium", "large"]),
    // §22② 최대주주 해당 여부 (금융재산공제 배제 토글). 레거시 3-state string 호환:
    // manual_on→true, manual_off·auto→false (auto는 종전 표시 전용이라 계산상 미배제=false 보존).
    isSection22MajorShareholder: z.preprocess(
      (v) => (v === "manual_on" ? true : v === "manual_off" || v === "auto" ? false : v),
      z.boolean().optional(),
    ),
    // PR-P (§54③): 다른 비상장주식 10% 이하 보유 옵션 (이동평균법 취득가액 갈음)
    otherUnlistedHoldings: z
      .array(
        z.object({
          rowId: z.string().min(1),
          issuerCorpName: z.string().min(1),
          holdingShares: z.number().int().nonnegative(),
          totalShares: z.number().int().positive(),
          treasuryShares: z.number().int().nonnegative().optional(),
          movingAverageAcquisitionValue: z.number().nonnegative().optional(),
          marketValue: z.number().nonnegative().optional(),
        }),
      )
      .optional(),
    // PR-K (§54⑥): 평가심의위원회 신청 옵션 (70~130% 4방법)
    evaluationCommittee: z
      .object({
        method: z.enum(["clm", "dcf", "ddm", "other"]),
        taxpayerPerShareValuation: z.number().positive(),
        methodNotes: z.string().optional(),
        evaluatorOrganization: z.string().optional(),
      })
      .optional(),
    // PR-G (§56②): 추정이익 갈음 옵션 (둘 이상 평가기관 1주당 추정이익 평균가액)
    estimatedProfit: z
      .object({
        reasonCode: z.enum([
          "asset_receipt_50pct",
          "merger_split_business_change",
          "merger_gift_section38",
          "closure_over_1yr",
          "disposal_gain_50pct",
          "sales_period_under_3yr",
          "similar_notified",
        ]),
        agencyEstimates: z.array(z.number().finite()),
        filedWithinDeadline: z.boolean(),
        baseDateAndReportWithinDeadline: z.boolean(),
        sameYearAsInheritanceOrGift: z.boolean(),
      })
      .optional(),
    // PR-L (§63②1호) / PR-L2 (§63②2호): 기업공개·상장신청 준비 중 평가 (MAX(공모가, §54 보충적평가))
    preIpoListing: z
      .object({
        publicOfferingPrice: z.number(),
        securitiesFilingDate: z.coerce.date(),
        taxKind: z.enum(["inheritance", "gift"]),
        listingDate: z.coerce.date().optional(),
        // PR-L2: 준비 유형 (미입력 → exchange_listing, PR-L 하위호환). 윈도우·MAX 동일, 문자열만 분기.
        preparationType: z.enum(["exchange_listing", "association_registration"]).optional(),
      })
      .optional(),
  })
  .superRefine((input, ctx) => {
    // 사업연도 종료일 순서 검증 (1년전 > 2년전 > 3년전)
    if (input.fiscalYears[0].fiscalYearEndDate <= input.fiscalYears[1].fiscalYearEndDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fiscalYears", 1, "fiscalYearEndDate"],
        message: "2년전 사업연도 종료일은 1년전보다 이전이어야 합니다.",
      });
    }
    if (input.fiscalYears[1].fiscalYearEndDate <= input.fiscalYears[2].fiscalYearEndDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fiscalYears", 2, "fiscalYearEndDate"],
        message: "3년전 사업연도 종료일은 2년전보다 이전이어야 합니다.",
      });
    }
    // 소유주식수 > 발행주식총수 차단
    if (input.ownedShares > input.totalShares) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownedShares"],
        message: "보유주식수는 발행주식총수를 초과할 수 없습니다.",
      });
    }
    // 평가기준일 < 사업개시일 차단
    if (input.evaluationDate < input.businessStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evaluationDate"],
        message: "평가기준일은 사업개시일 이후여야 합니다.",
      });
    }
    // 자본금 변동 날짜 검증
    for (let i = 0; i < input.capitalChanges.length; i++) {
      const c = input.capitalChanges[i];
      // changeDate가 undefined인 미입력 행은 Zod optional 통과 — inheritance-validate.ts가 차단
      if (c.changeDate !== undefined && c.changeDate > input.evaluationDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["capitalChanges", i, "changeDate"],
          message: "자본금 변동일은 평가기준일 이전이어야 합니다.",
        });
      }
      if (c.changeType === "paid_in" && !c.pricePerShare) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["capitalChanges", i, "pricePerShare"],
          message: "유상증자는 1주당 납입금액을 입력해야 합니다. (§56⑤)",
        });
      }
      if (c.changeType === "capital_reduction" && !c.pricePerShare) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["capitalChanges", i, "pricePerShare"],
          message: "유상감자는 1주당 지급금액을 입력해야 합니다. (§56⑤)",
        });
      }
    }
    // PR-K (§54⑥): method="other" 선택 시 methodNotes(평가법 사유) 필수 (§49의2⑤2호)
    if (
      input.evaluationCommittee?.method === "other" &&
      (!input.evaluationCommittee.methodNotes ||
        input.evaluationCommittee.methodNotes.trim() === "")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evaluationCommittee", "methodNotes"],
        message: "기타 평가법 선택 시 평가법 사유(methodNotes)가 필수입니다. (§49의2⑤2호)",
      });
    }
    // PR-G (§56②): 추정이익 갈음 ON 시 둘 이상 평가기관 산출액 필수
    if (input.estimatedProfit && input.estimatedProfit.agencyEstimates.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedProfit", "agencyEstimates"],
        message: "추정이익 갈음은 둘 이상의 평가기관 산출액이 필요합니다. (상증령 §56②)",
      });
    }
    // PR-L (§63②1호): 기업공개 준비 옵션 ON 시 공모가 > 0 필수 (신고일은 z.coerce.date 필수)
    if (input.preIpoListing && input.preIpoListing.publicOfferingPrice <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preIpoListing", "publicOfferingPrice"],
        message: "기업공개 준비 중 평가는 공모가격(1주당)을 입력해야 합니다. (상증령 §57①1호)",
      });
    }
  });

export type UnlistedStockValuationV2Input = z.infer<typeof unlistedStockValuationV2Schema>;
