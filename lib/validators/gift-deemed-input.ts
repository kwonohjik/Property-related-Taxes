/**
 * 증여로 보는 경우 (Phase 1) — Zod 입력 검증 스키마.
 *
 * ⚠️ discriminatedUnion 제약: 각 브랜치는 순수 z.object여야 한다.
 * z.object().superRefine()는 ZodEffects가 되어 discriminatedUnion에 넣을 수 없으므로,
 * cross-field 검증은 union 전체에 .superRefine()을 한 번만 적용한다.
 */
import { z } from "zod";

const rateFractionSchema = z.object({ numer: z.number().nonnegative(), denom: z.number().positive() });
const trustBenefitSchema = z.object({
  type: z.literal("trust_benefit"),
  beneficiaryType: z.enum(["same", "diff_principal", "diff_income"]),
  trustPropertyValue: z.number().nonnegative(),
  yieldRate: rateFractionSchema.optional(),
  withholdingRate: rateFractionSchema,
  // §61②→§62 정기금 유형 (기본 finite). finite일 때만 installments 필수
  incomeAnnuityType: z.enum(["finite", "perpetual", "lifetime"]).optional(),
  installments: z.number().int().positive().optional(),
  incomeIntervalYears: z.number().positive().optional(),
  expectedRemainingYears: z.number().nonnegative().optional(),
  beneficiaryGender: z.enum(["male", "female"]).optional(),
  beneficiaryAge: z.number().nonnegative().optional(),
  // 증여시기 분리 (§33①1·2호) — string 수신 → Date 변환
  incomeGiftDate: z.coerce.date().optional(),
  principalGiftDate: z.coerce.date().optional(),
  surrenderValue: z.number().nonnegative().optional(),
  giftTimingType: z.enum(["actual", "decedent_death", "agreed", "first_installment"]).optional(),
});

const insuranceSchema = z.object({
  type: z.literal("insurance"),
  caseType: z.enum(["non_payer", "gifted_premium"]),
  insuranceProceeds: z.number().nonnegative({ message: "보험금은 0 이상이어야 합니다" }),
  totalPremiumPaid: z.number().positive({ message: "총 납부보험료는 0보다 커야 합니다" }),
  relevantPremium: z.number().nonnegative({ message: "관련 보험료는 0 이상이어야 합니다" }),
  isInheritanceInsurance: z.boolean(),
});

const bargainTransferSchema = z.object({
  type: z.literal("bargain_transfer"),
  transactionPrice: z.number().nonnegative({ message: "거래대가는 0 이상이어야 합니다" }),
  marketValue: z.number().positive({ message: "시가는 0보다 커야 합니다" }),
  isRelatedParty: z.boolean(),
  transactionType: z.enum(["purchase", "sale"]),
  hasJustifiableReason: z.boolean().optional(),
  isExcludedTransaction: z.boolean().optional(),
});

const debtForgivenessSchema = z.object({
  type: z.literal("debt_forgiveness"),
  forgivenDebt: z.number().positive({ message: "면제·인수·변제 채무액은 0보다 커야 합니다" }),
  compensation: z.number().nonnegative({ message: "보상액은 0 이상이어야 합니다" }),
  occurType: z.enum(["creditor_waiver", "third_party_assumption"]),
});

const freeRealEstateSchema = z.object({
  type: z.literal("free_realestate"),
  subType: z.enum(["free_use", "collateral"]),
  propertyValue: z.number().nonnegative().optional(),
  loanAmount: z.number().nonnegative().optional(),
  actualInterestPaid: z.number().nonnegative().optional(),
  isRelatedParty: z.boolean(),
  hasJustifiableReason: z.boolean().optional(),
  // 다기간 (G2/G3) — undefined=단일 / [...]=다기간 (빈 []은 superRefine 차단)
  periods: z
    .array(
      z.object({
        startDate: z.string().min(1),
        propertyValue: z.number().nonnegative().optional(),
        loanAmount: z.number().nonnegative().optional(),
        actualInterestPaid: z.number().nonnegative().optional(),
      })
    )
    .optional(),
  // 경정청구 (G1)
  rectification: z
    .object({
      giftTaxCalculated: z.number().nonnegative(),
      giftDate: z.string().min(1),
      terminationDate: z.string().min(1),
    })
    .optional(),
});

const freeLoanSchema = z.object({
  type: z.literal("free_loan"),
  loanAmount: z.number().positive({ message: "대출금액은 0보다 커야 합니다" }),
  actualInterestPaid: z.number().nonnegative({ message: "실제 지급이자는 0 이상이어야 합니다" }),
  appropriateRate: z.object({
    numer: z.number().positive(),
    denom: z.number().positive(),
  }),
  isRelatedParty: z.boolean(),
  hasJustifiableReason: z.boolean().optional(),
});

// ── Phase 2: 자본거래 (평가가액·주식수 직접 입력) — sub-case 필드는 caseType별 optional ──
const ratioSchema = z.object({ numer: z.number().nonnegative(), denom: z.number().positive() });
const mergerShareholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  shares: z.number().nonnegative(),
});
const mergerSchema = z.object({
  type: z.literal("merger"),
  caseType: z.enum(["stock", "non_stock"]).optional(),
  overvaluedSharePrice: z.number().nonnegative(),
  majorShares: z.number().nonnegative(),
  mergedSharePrice: z.number().nonnegative().optional(),
  preMergerShares: z.number().nonnegative().optional(),
  exchangedShares: z.number().nonnegative().optional(),
  faceValue: z.number().nonnegative().optional(),
  mergeConsideration: z.number().nonnegative().optional(),
  // Phase A 평가 §28⑤
  mergedPriceMode: z.enum(["direct", "auto"]).optional(),
  underSharePrice: z.number().nonnegative().optional(),
  underPreShares: z.number().nonnegative().optional(),
  postMergerTotalShares: z.number().nonnegative().optional(),
  listedPostAvgPrice: z.number().nonnegative().optional(),
  isListed: z.boolean().optional(),
  // G0 echo §28①②
  isRelatedCompany: z.boolean().optional(),
  shareholderOwnedShares: z.number().nonnegative().optional(),
  shareholderTotalShares: z.number().nonnegative().optional(),
  faceValueSum: z.number().nonnegative().optional(),
  // Phase B 매트릭스
  shareholders: z
    .object({
      overvalued: z.array(mergerShareholderSchema),
      undervalued: z.array(mergerShareholderSchema),
      exchangeRatio: z.object({ numer: z.number(), denom: z.number() }),
    })
    .optional(),
  // Phase C 분할합병 §28⑦
  isSplitMerger: z.boolean().optional(),
  splitValuationMode: z.enum(["supplementary", "net_asset_ratio"]).optional(),
  splitCompanyPreSharePrice: z.number().nonnegative().optional(),
  splitBusinessNetAsset: z.number().nonnegative().optional(),
  splitCompanyNetAsset: z.number().nonnegative().optional(),
});
const capitalIncreaseShape = {
  direction: z.enum(["low", "high"]).optional(),
  subType: z.enum(["forfeited_realloc", "third_party", "excess", "no_realloc"]).optional(),
  preIssuePrice: z.number().nonnegative(),
  preIssueShares: z.number().positive({ message: "증자 전 발행주식총수는 0보다 커야 합니다" }),
  newSharePrice: z.number().nonnegative(),
  issuedShares: z.number().nonnegative(),
  forfeitedShares: z.number().nonnegative(),
  relatedAcquiredShares: z.number().nonnegative().optional(),
  ratioDenomShares: z.number().nonnegative().optional(),
  smallShareholderImputation: z.boolean().optional(),
} as const;
const capitalIncreaseSchema = z.object({ type: z.literal("capital_increase"), ...capitalIncreaseShape });
const capitalIncreaseInnerSchema = z.object(capitalIncreaseShape);
// §39 cap-table 다수증자·다증여자 (equity-delta)
const capShareholderSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  preShares: z.number().nonnegative(),
  entitledShares: z.number().nonnegative(),
  subscribedShares: z.number().nonnegative(),
  reallocatedShares: z.number().nonnegative().optional(),
  relatedTo: z.array(z.string()).optional(),
});
const capitalIncreaseAllocationSchema = z.object({
  type: z.literal("capital_increase_allocation"),
  direction: z.enum(["low", "high"]),
  preIssuePrice: z.number().nonnegative(),
  newSharePrice: z.number().nonnegative(),
  shareholders: z.array(capShareholderSchema).min(2, { message: "주주를 2명 이상 입력하세요" }),
});
const convertibleStockSchema = z.object({
  type: z.literal("convertible_stock"),
  atConversion: capitalIncreaseInnerSchema,
  atIssuance: capitalIncreaseInnerSchema,
});
const capitalDecreaseShareholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  preShares: z.number().nonnegative(),
  redeemedShares: z.number().nonnegative(),
  redemptionPricePerShare: z.number().nonnegative().optional(),
  relationGroup: z.string().optional(),
});
const capitalDecreaseSchema = z.object({
  type: z.literal("capital_decrease"),
  caseType: z.enum(["low", "high"]).optional(),
  sharePrice: z.number().nonnegative(),
  redemptionPrice: z.number().nonnegative().optional(),
  totalRedeemedShares: z.number().nonnegative().optional(),
  majorPostRatio: ratioSchema.optional(),
  relatedRedeemedShares: z.number().nonnegative().optional(),
  faceValue: z.number().nonnegative().optional(),
  ownRedeemedShares: z.number().nonnegative().optional(),
  // 멀티(불균등 감자 N:N) 모드
  shareholders: z.array(capitalDecreaseShareholderSchema).optional(),
  preTotalShares: z.number().nonnegative().optional(),
});
const contributionPartySchema = z.object({
  name: z.string().optional(),
  preShares: z.number().nonnegative(),
  relation: z
    .enum(["father", "mother", "grandparent", "spouse", "lineal_descendant", "sibling", "other_relative", "other"])
    .optional(),
});
const contributionSchema = z
  .object({
    type: z.literal("contribution"),
    caseType: z.enum(["low", "high"]).optional(),
    preContribPrice: z.number().nonnegative(),
    preContribShares: z.number().positive({ message: "현물출자 전 발행주식총수는 0보다 커야 합니다" }),
    newSharePrice: z.number().nonnegative(),
    contributedShares: z.number().nonnegative(),
    allocatedShares: z.number().nonnegative(),
    relatedRatio: ratioSchema.optional(),
    smallShareholderImputation: z.boolean().optional(),
    // 3-state: undefined=OFF / []=ON빈(차단) / [{...}]=데이터
    parties: z.array(contributionPartySchema).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.parties === undefined) return; // OFF 경로 — gross/relatedRatio 경로
    if (val.parties.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${val.caseType === "high" ? "수증자" : "증여자"}를 1명 이상 추가하세요`,
        path: ["parties"],
      });
      return;
    }
    // 합계 주식수 > 기준 주식수 차단
    const sum = val.parties.reduce((acc, p) => acc + p.preShares, 0);
    if (val.preContribShares > 0 && sum > val.preContribShares) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "당사자 주식수 합계가 현물출자 전 발행주식총수를 초과합니다",
        path: ["parties"],
      });
    }
  });
const acquisitionFundSchema = z.object({
  type: z.literal("acquisition_fund_presumption"),
  subType: z.enum(["acquisition", "debt_repayment"]),
  acquisitionValue: z.number().positive({ message: "취득재산가액(채무상환금액)은 0보다 커야 합니다" }),
  provenAmount: z.number().nonnegative(),
});
const nomineeTrustSchema = z.object({
  type: z.literal("nominee_trust"),
  propertyValue: z.number().nonnegative(),
  hasTaxAvoidancePurpose: z.boolean(),
  isExcluded: z.boolean().optional(),
});
const shareholderDividendSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["major_shareholder", "related_party", "other"]),
  ownershipRatio: ratioSchema,
  actualDividend: z.number().nonnegative(),
  name: z.string().optional(),
});

const excessDividendGiftTaxContextSchema = z.object({
  donorRelationship: z.enum([
    "spouse",
    "lineal_ascendant_adult",
    "lineal_ascendant_minor",
    "lineal_descendant",
    "other_relative",
  ]),
  priorDeductionApplied: z.number().nonnegative().optional(),
  isGenerationSkip: z.boolean().optional(),
  isMinorGenerationSkip: z.boolean().optional(),
  isWithinFilingDeadline: z.boolean().optional(),
});

const excessDividendSchema = z.object({
  type: z.literal("excess_dividend"),
  shareholders: z.array(shareholderDividendSchema).min(1),
  dividendDate: z.coerce.date(),
  incomeTaxMode: z.enum(["undetermined", "separate", "comprehensive", "exempt"]),
  separateIncomeTax: z.number().nonnegative().optional(),
  comprehensiveTaxBase: z.number().nonnegative().optional(),
  comprehensiveTaxBaseExcluding: z.number().nonnegative().optional(),
  incomeTaxYear: z.number().int().positive().optional(),
  isDiligentFiler: z.boolean().optional(),
  actualIncomeTax: z.number().nonnegative().optional(),
  giftTaxContext: excessDividendGiftTaxContextSchema.optional(),
});
const listingGainSchema = z.object({
  type: z.literal("listing_gain"),
  eventType: z.enum(["listing", "merger"]).optional(),
  settlementPerSharePrice: z.number().nonnegative(),
  perShareAcqValue: z.number().nonnegative(),
  perShareCorpGrowth: z.number(),
  shares: z.number().nonnegative(),
});
const propertyServiceUseSchema = z.object({
  type: z.literal("property_service_use"),
  subType: z.enum(["free_use", "low_price", "high_price"]),
  marketValue: z.number().nonnegative(),
  consideration: z.number().nonnegative().optional(),
});
const orgChangeSchema = z.object({
  type: z.literal("org_change"),
  subType: z.enum(["share_change", "value_change"]),
  baseValue: z.number().nonnegative(),
  preShares: z.number().nonnegative().optional(),
  postShares: z.number().nonnegative().optional(),
  postPerSharePrice: z.number().nonnegative().optional(),
  preValue: z.number().nonnegative().optional(),
  postValue: z.number().nonnegative().optional(),
});
const valueIncreaseSchema = z.object({
  type: z.literal("value_increase"),
  currentValue: z.number().nonnegative(),
  acquisitionCost: z.number().nonnegative(),
  normalIncrease: z.number().nonnegative(),
  contribution: z.number().nonnegative(),
});
const specificCorpSchema = z.object({
  type: z.literal("specific_corp"),
  transactionBenefit: z.number().nonnegative(),
  corporateTax: z.number().nonnegative(),
  ownershipRatio: ratioSchema,
});
const convertibleBondSchema = z.object({
  type: z.literal("convertible_bond"),
  caseType: z.enum(["acquisition", "conversion", "conversion_reverse", "transfer"]).optional(),
  bondMarketValue: z.number().nonnegative(),
  acquisitionPrice: z.number().nonnegative().optional(),
  transferPrice: z.number().nonnegative().optional(),
  preConvPrice: z.number().nonnegative().optional(),
  preConvShares: z.number().nonnegative().optional(),
  conversionPrice: z.number().nonnegative().optional(),
  increasedShares: z.number().nonnegative().optional(),
  creditedShares: z.number().nonnegative().optional(),
  isListed: z.boolean().optional(),
  listedMarketAvg: z.number().nonnegative().optional(),
  interestLoss: z.number().nonnegative().optional(),
  acquisitionGainPrior: z.number().nonnegative().optional(),
  bondTransferGainForCap: z.number().nonnegative().optional(),
  relatedPreRatio: ratioSchema.optional(),
});
// §45의3 일감몰아주기 — 순수 z.object (cross-field 지분합·매출합은 validate ⑧에 위임: discriminatedUnion superRefine 제약)
const relatedCorpSchema = z.object({
  type: z.literal("related_corp"),
  enterpriseSize: z.enum(["small", "medium", "large"]),
  totalSales: z.number().int().min(1),
  preTaxAdjOperatingIncome: z.number().int(),
  taxableIncome: z.number().int().min(1),
  corporateTaxNet: z.number().int().min(0),
  shareholders: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        relation: z.enum(["self", "relative", "other"]),
        directRatio: ratioSchema,
        isCorporate: z.boolean(),
      }),
    )
    .min(1),
  intermediaryCorps: z.array(
    z.object({
      corpShareholderId: z.string().min(1),
      stakeInBeneficiary: ratioSchema,
      owners: z.array(z.object({ individualId: z.string().min(1), ratio: ratioSchema })),
    }),
  ),
  salesPartners: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        salesAmount: z.number().int().min(0),
        isRelated: z.boolean(),
        exclusionType: z
          .enum([
            "sec10_1",
            "sec10_2",
            "sec10_3",
            "sec10_4",
            "sec10_5",
            "sec10_5_2",
            "sec10_5_3",
            "sec10_6",
            "sec10_7",
            "sec10_8",
          ])
          .optional(),
        rulingShareholderStakes: z
          .array(z.object({ shareholderId: z.string().min(1), ratio: ratioSchema }))
          .optional(),
      }),
    )
    .min(1),
});

export const deemedGiftInputSchema = z
  .discriminatedUnion("type", [
    trustBenefitSchema,
    insuranceSchema,
    bargainTransferSchema,
    debtForgivenessSchema,
    freeRealEstateSchema,
    freeLoanSchema,
    mergerSchema,
    capitalIncreaseSchema,
    capitalIncreaseAllocationSchema,
    capitalDecreaseSchema,
    contributionSchema,
    convertibleStockSchema,
    convertibleBondSchema,
    acquisitionFundSchema,
    nomineeTrustSchema,
    excessDividendSchema,
    listingGainSchema,
    propertyServiceUseSchema,
    orgChangeSchema,
    valueIncreaseSchema,
    specificCorpSchema,
    relatedCorpSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.type === "insurance") {
      if (data.relevantPremium > data.totalPremiumPaid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["relevantPremium"],
          message: "관련 보험료가 총 납부보험료를 초과할 수 없습니다 (§34①)",
        });
      }
    }
    if (data.type === "free_realestate") {
      // 다기간 모드(periods 정의됨) — 빈 배열 차단(자동 fallback 금지)
      if (data.periods !== undefined) {
        if (data.periods.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periods"], message: "다기간 입력 시 기간을 1개 이상 추가하세요 (§37·시행령§27③⑤)" });
        }
      } else {
        // 단일기간
        if (data.subType === "free_use" && !data.propertyValue) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["propertyValue"], message: "무상사용은 부동산 가액 입력이 필요합니다 (§37①)" });
        }
        if (data.subType === "collateral" && !data.loanAmount) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["loanAmount"], message: "무상담보는 차입금 입력이 필요합니다 (§37②)" });
        }
      }
    }
  });

export type DeemedGiftInputParsed = z.infer<typeof deemedGiftInputSchema>;
