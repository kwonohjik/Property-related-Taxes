/**
 * 증여로 보는 경우 Zod — Phase 3(추정·의제 §45·§45의2 · 기타이익 §41의2·§41의3·§42·§42의2·§42의3 ·
 * 법인 §45의3·§45의5) 브랜치 스키마. `gift-deemed-input.ts`에서 분리(800줄 정책) — 엔진 타입의
 * `gift-deemed-input-phase3.ts` 분할과 같은 경계다. union 조립은 본 파일에 남는다.
 */
import { z } from "zod";
import { forProfitDoneeShape, incomeTaxedDoneeShape, ratioSchema, sameClausePriorShape } from "./gift-deemed-input-shared";

export const acquisitionFundSchema = z.object({
  type: z.literal("acquisition_fund_presumption"),
  ...forProfitDoneeShape,
  ...incomeTaxedDoneeShape,
  subType: z.enum(["acquisition", "debt_repayment"]),
  acquisitionValue: z.number().positive({ message: "취득재산가액(채무상환금액)은 0보다 커야 합니다" }),
  provenAmount: z.number().nonnegative(),
});
export const nomineeTrustSchema = z
  .object({
    type: z.literal("nominee_trust"),
    // total 모드만 필수 (per_share는 perSharePrice×nomineeShares로 엔진 단일 도출) → superRefine로 모드별 검증
    propertyValue: z.number().nonnegative().optional(),
    hasTaxAvoidancePurpose: z.boolean(),
    isExcluded: z.boolean().optional(),
    valuationMode: z.enum(["total", "per_share"]).optional(),
    perSharePrice: z.number().nonnegative().optional(),
    nomineeShares: z.number().nonnegative().optional(),
    subscriptionPrice: z.number().nonnegative().optional(),
    theoreticalExRightsPrice: z.number().nonnegative().optional(),
    preIncreasePerShare: z.number().nonnegative().optional(),
    actualOwnerName: z.string().optional(),
    nomineeName: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.valuationMode === "per_share") {
      if (!val.perSharePrice || val.perSharePrice <= 0)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "1주당 평가액(명의개서일 §63)을 입력하세요", path: ["perSharePrice"] });
      if (!val.nomineeShares || val.nomineeShares <= 0)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "명의신탁 신주 수를 입력하세요", path: ["nomineeShares"] });
    } else if (!val.propertyValue || val.propertyValue <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "명의신탁 재산 가액을 입력하세요", path: ["propertyValue"] });
    }
  });
const shareholderDividendSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["major_shareholder", "related_party", "other"]),
  ownershipRatio: ratioSchema,
  actualDividend: z.number().nonnegative(),
  name: z.string().optional(),
  isForProfitCorp: z.boolean().optional(), // 「상증법」§2 9호·§4의2①·③ — 특수관계인(수증자) 행에서만 효력
});

const excessDividendGiftTaxContextSchema = z.object({
  donorRelationship: z.enum([
    "spouse",
    "lineal_ascendant_adult",
    "lineal_ascendant_minor",
    "lineal_descendant",
    "other_relative",
    // §53 열거 밖(비친족) — ⑫ strip 방지
    "none",
  ]),
  priorDeductionApplied: z.number().nonnegative().optional(),
  isGenerationSkip: z.boolean().optional(),
  isMinorGenerationSkip: z.boolean().optional(),
  isWithinFilingDeadline: z.boolean().optional(),
});

export const excessDividendSchema = z.object({
  type: z.literal("excess_dividend"),
  shareholders: z.array(shareholderDividendSchema).min(1),
  targetDoneeId: z.string().optional(), // 계산 대상 수증자(특수관계인 1인 단위 — 법 §41의2①)
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
export const listingGainSchema = z.object({
  type: z.literal("listing_gain"),
  ...forProfitDoneeShape,
  ...incomeTaxedDoneeShape,
  eventType: z.enum(["listing", "merger"]).optional(),
  settlementPerSharePrice: z.number().nonnegative(),
  perShareAcqValue: z.number().nonnegative(),
  perShareCorpGrowth: z.number(),
  shares: z.number().nonnegative(),
  isMajorShareholder: z.boolean().optional(), // §63③ 최대주주 20% 할증
  isSurchargeExemptEntity: z.boolean().optional(), // §63③ 단서 배제(중소·중견·결손)
  // 령§31의3⑤ 기업가치 자동계산 (지정 시 perShareCorpGrowth 대신)
  corpGrowthAuto: z
    .object({
      totalNetIncomePerShare: z.number(),
      monthsBusinessStartToListingPrevDay: z.number().nonnegative(),
      monthsAcqToSettlement: z.number().nonnegative(),
    })
    .optional(),
});
export const propertyServiceUseSchema = z.object({
  type: z.literal("property_service_use"),
  ...forProfitDoneeShape,
  ...incomeTaxedDoneeShape,
  subType: z.enum(["free_use", "low_price", "high_price"]),
  marketValue: z.number().nonnegative(),
  consideration: z.number().nonnegative().optional(),
  ...sameClausePriorShape,
});
export const orgChangeSchema = z.object({
  type: z.literal("org_change"),
  ...forProfitDoneeShape,
  ...incomeTaxedDoneeShape,
  subType: z.enum(["share_change", "value_change"]),
  baseValue: z.number().nonnegative(),
  preShares: z.number().nonnegative().optional(),
  postShares: z.number().nonnegative().optional(),
  postPerSharePrice: z.number().nonnegative().optional(),
  preValue: z.number().nonnegative().optional(),
  postValue: z.number().nonnegative().optional(),
});
export const valueIncreaseSchema = z.object({
  type: z.literal("value_increase"),
  ...forProfitDoneeShape,
  ...incomeTaxedDoneeShape,
  currentValue: z.number().nonnegative(),
  acquisitionCost: z.number().nonnegative(),
  normalIncrease: z.number().nonnegative(),
  contribution: z.number().nonnegative(),
  // echo (적용요건 표시 — 산식 무관)
  acquisitionCause: z.enum(["gift", "inside_info", "borrowed_funds"]).optional(),
  valueIncreaseReason: z
    .enum(["development", "form_change", "partition", "license", "kotc_registration", "konex_listing", "similar"])
    .optional(),
  acquisitionDate: z.string().optional(),
  eventDate: z.string().optional(),
});
// §45의5 주주 행 Zod (엔진 SpecificCorpShareholder에 대응)
const scRelationSchema = z.enum([
  "self", // 지배주주 본인 (SC-4-e)
  "lineal_ascendant",
  "lineal_descendant",
  "spouse",
  "sibling",
  "other_relative",
  "other",
]);
const specificCorpShareholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  relation: scRelationSchema,
  // 주식수도 같은 이유로 정수다 — roster 경로의 `shares/totalShares`가 곧 비율 분자·분모다.
  shares: z.number().int().nonnegative(),
  totalShares: z.number().int().nonnegative(),
  isDonor: z.boolean(),
  isRelated: z.boolean(),
  isCorporate: z.boolean().optional(),
  donorRelation: z
    // "none" = §53 열거 밖(비친족) — ⑫ strip 방지
    .enum(["spouse", "lineal_ascendant_adult", "lineal_ascendant_minor", "lineal_descendant", "other_relative", "none"])
    .optional(),
  isGenerationSkip: z.boolean().optional(),
});
/** §45의5 간접출자관계 — 개인 → 법인 → 특정법인 (상증령 §34의3② 각 단계 곱) */
const specificCorpIntermediarySchema = z.object({
  corpShareholderId: z.string(),
  stakeInBeneficiary: ratioSchema,
  owners: z.array(
    z.object({
      individualId: z.string(),
      ratio: ratioSchema,
    }),
  ),
});
export const specificCorpSchema = z.object({
  type: z.literal("specific_corp"),
  ...incomeTaxedDoneeShape,
  transactionBenefit: z.number().nonnegative(),
  // 법 §45의5① 거래상대방·각 호 거래유형 (영 §34의5②④⑥⑦) — ⑫ 미등록이면 조용히 stripping된다
  counterparty: z.enum(["ruling_shareholder", "ruling_related", "other"]).optional(),
  transactionType: z
    .enum(["gratuitous", "low_price", "high_price", "capital_transaction", "debt_relief"])
    .optional(),
  marketValue: z.number().nonnegative().optional(),
  consideration: z.number().nonnegative().optional(),
  isDissolvingWithoutResidual: z.boolean().optional(),
  // §53·§57 — 수증자별 축 (roster 행이 담는다)
  // single 하위호환
  corporateTax: z.number().nonnegative().optional(),
  ownershipRatio: ratioSchema.optional(), // ⓑ 승수(인별)
  controllingGroupRatio: ratioSchema.optional(), // ⓐ §45의5① 특정법인 해당성 — 지배주주등 합계(직접+간접)
  // roster 모드 신규 필드 (⑫ Zod 입력 객체 정의 — TS 미감지 지점)
  shareholders: z.array(specificCorpShareholderSchema).optional(),
  intermediaryCorps: z.array(specificCorpIntermediarySchema).optional(),
  // 증여자 2인 이상은 §45의5①상 별개 거래다 — ⑧과 같은 규칙을 ⑫에도 건다(3중 패턴)
  annualIncome: z.number().nonnegative().optional(),
  corporateTaxComputed: z.number().nonnegative().optional(),
  // 영 §34의5④2호가목 — 법인세법 §55의2 토지등 양도소득에 대한 법인세액(산출세액에서 제외)
  corporateTaxOnLandTransfer: z.number().nonnegative().optional(),
  corporateTaxCredit: z.number().nonnegative().optional(),
  giftDeduction: z.number().nonnegative().optional(),
  // §45의5① 「거래한 날을 증여일로 하여」 — §43② 1년 윈도·§69 공제율의 기준일 (⑫ strip 방지)
  transactionDate: z.string().optional(),
  // §43②·영 §32의4 11호 — 소급 1년 이내 같은 호 선행거래 (⑫ strip 방지)
  priorTransactions: z
    .array(
      z.object({
        date: z.string().min(1),
        benefit: z.number().nonnegative(),
        label: z.string().optional(),
      }),
    )
    .optional(),
}).refine(
  (v) => (v.shareholders ?? []).filter((sh) => sh.isDonor).length <= 1,
  { message: "증여자 본인은 1명만 지정할 수 있습니다 (§45의5① — 거래별로 나누어 계산)", path: ["shareholders"] },
);
// §45의3 일감몰아주기 — 순수 z.object (cross-field 지분합·매출합은 validate ⑧에 위임: discriminatedUnion superRefine 제약)
export const relatedCorpSchema = z.object({
  type: z.literal("related_corp"),
  // §45의3③ 「수혜법인의 해당 사업연도 종료일을 증여시기로 본다」 (⑫ strip 방지 — 빠지면 엔진 미도달)
  fiscalYearEndDate: z.string().optional(),
  enterpriseSize: z.enum(["small", "medium", "large"]),
  totalSales: z.number().int().min(1),
  preTaxAdjOperatingIncome: z.number().int(),
  taxableIncome: z.number().int().min(1),
  corporateTaxNet: z.number().int().min(0),
  /** §⑮1호·2호 분모 — 수혜법인의 사업연도 말일 배당가능이익 (⑫ strip 방지) */
  distributableProfit: z.number().int().min(0).optional(),
  shareholders: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        relation: z.enum(["self", "relative", "other"]),
        directRatio: ratioSchema,
        isCorporate: z.boolean(),
        /** §⑮1호 분자 — 수혜법인으로부터 받은 배당소득 */
        dividendFromBeneficiary: z.number().int().min(0).optional(),
      }),
    )
    .min(1),
  intermediaryCorps: z.array(
    z.object({
      corpShareholderId: z.string().min(1),
      stakeInBeneficiary: ratioSchema,
      /** §⑮2호 분모 — 간접출자법인의 사업연도 말일 배당가능이익 */
      distributableProfit: z.number().int().min(0).optional(),
      owners: z.array(
        z.object({
          individualId: z.string().min(1),
          ratio: ratioSchema,
          /** §⑮2호 분자 — 이 간접출자법인으로부터 받은 배당소득 */
          dividendIncome: z.number().int().min(0).optional(),
        }),
      ),
    }),
  ),
  salesPartners: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        salesAmount: z.number().int().min(0),
        isRelated: z.boolean(),
        /** §⑩ 후단 「동시에 해당하는 경우에는 더 큰 금액으로 한다」 — 한 매출액이 여러 호를 가질 수 있다 */
        exclusionTypes: z
          .array(
            z.enum([
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
            ]),
          )
          .optional(),
        /** §⑩3호 전용 — 수혜법인의 그 특수관계법인에 대한 주식보유비율 */
        beneficiaryStakeInPartner: ratioSchema.optional(),
        /** §⑭1호 — 이 매출처가 §⑱ 간접출자법인이면 그 법인주주 id */
        intermediaryCorpShareholderId: z.string().optional(),
        rulingShareholderStakes: z
          .array(z.object({ shareholderId: z.string().min(1), ratio: ratioSchema }))
          .optional(),
      }),
    )
    .min(1),
});
