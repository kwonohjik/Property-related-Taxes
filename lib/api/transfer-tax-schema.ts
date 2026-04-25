/**
 * 양도소득세 Zod 입력 스키마 (단건·다건 공유)
 *
 * propertySchema  — 단건 route에서 inputSchema로 재export
 * multiInputSchema — 다건 route 전용 (properties[] + 공통 필드)
 */

import { z } from "zod";

// ─── 하위 스키마 ────────────────────────────────────────────────

const temporaryTwoHouseSchema = z.object({
  previousAcquisitionDate: z.string().date(),
  newAcquisitionDate: z.string().date(),
});

const businessUsePeriodSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  usageType: z.string().min(1),
});

const gracePeriodSchema = z.object({
  type: z.enum([
    "inheritance",
    "legal_restriction",
    "sale_contract",
    "construction",
    "unavoidable",
    "preparation",
    "land_replotting",
  ]),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

const LAND_TYPE_VALUES = [
  "farmland", "paddy", "field", "orchard",
  "forest", "pasture", "vacant_lot",
  "building_site", "housing_site",
  "villa_land", "other_land", "miscellaneous", "other",
] as const;

const ZONE_TYPE_VALUES = [
  "residential", "exclusive_residential", "general_residential", "semi_residential",
  "commercial", "industrial", "green", "management",
  "agriculture_forest", "natural_env", "unplanned", "undesignated",
] as const;

const REVENUE_BUSINESS_TYPES = [
  "car_driving_school",
  "sports_facility",
  "youth_facility",
  "tourist_lodging",
  "resort_business",
  "transportation",
  "default",
  "none",
] as const;

const revenueTestSchema = z.object({
  businessType: z.enum(REVENUE_BUSINESS_TYPES),
  annualRevenue: z.number().nonnegative(),
  landValue:     z.number().positive(),
});

const nonBusinessLandDetailsSchema = z.object({
  landType: z.enum(LAND_TYPE_VALUES),
  landArea: z.number().positive(),
  zoneType: z.enum(ZONE_TYPE_VALUES),
  acquisitionDate: z.string().date(),
  transferDate: z.string().date(),
  farmingSelf: z.boolean().optional(),
  farmerResidenceDistance: z.number().nonnegative().optional(),
  businessUsePeriods: z.array(businessUsePeriodSchema).default([]),
  gracePeriods: z.array(gracePeriodSchema).default([]),
  buildingFootprint: z.number().positive().optional(),
  revenueTest: revenueTestSchema.optional(),
});

const rentHistorySchema = z.object({
  contractDate: z.string().date(),
  monthlyRent: z.number().int().nonnegative(),
  deposit: z.number().int().nonnegative(),
  contractType: z.enum(["jeonse", "monthly", "semi_jeonse"]),
});

const vacancyPeriodSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

const rentalReductionDetailsSchema = z.object({
  isRegisteredLandlord: z.boolean(),
  isTaxRegistered: z.boolean(),
  registrationDate: z.string().date(),
  rentalHousingType: z.enum(["public_construction", "long_term_private", "public_support_private", "public_purchase"]),
  propertyType: z.enum(["apartment", "non_apartment"]),
  region: z.enum(["capital", "non_capital"]),
  officialPriceAtStart: z.number().int().nonnegative(),
  rentalStartDate: z.string().date(),
  transferDate: z.string().date(),
  vacancyPeriods: z.array(vacancyPeriodSchema).default([]),
  rentHistory: z.array(rentHistorySchema).default([]),
  calculatedTax: z.number().int().nonnegative().default(0),
});

const newHousingDetailsSchema = z.object({
  acquisitionDate: z.string().date(),
  transferDate: z.string().date(),
  region: z.enum(["nationwide", "metropolitan", "non_metropolitan", "outside_overconcentration"]),
  acquisitionPrice: z.number().int().nonnegative(),
  exclusiveAreaSquareMeters: z.number().nonnegative(),
  isFirstSale: z.boolean(),
  hasUnsoldCertificate: z.boolean(),
  totalCapitalGain: z.number().int().nonnegative().default(0),
  calculatedTax: z.number().int().nonnegative().default(0),
});

// ─── 1990.8.30. 이전 취득 토지 기준시가 환산 ─────────────────────
const landGradeInputSchema = z.union([
  z.number().int().min(1).max(365),
  z.object({ gradeValue: z.number().positive() }),
]);

const pre1990LandSchema = z.object({
  acquisitionDate: z.string().date(),
  transferDate: z.string().date(),
  areaSqm: z.number().positive(),
  pricePerSqm_1990: z.number().positive(),
  pricePerSqm_atTransfer: z.number().positive(),
  grade_1990_0830: landGradeInputSchema,
  gradePrev_1990_0830: landGradeInputSchema,
  gradeAtAcquisition: landGradeInputSchema,
  forceRatioCap: z.boolean().optional(),
});

const houseSchema = z.object({
  id: z.string().min(1),
  region: z.enum(["capital", "non_capital"]),
  acquisitionDate: z.string().date(),
  officialPrice: z.number().int().nonnegative(),
  isInherited: z.boolean(),
  isLongTermRental: z.boolean(),
  isApartment: z.boolean().default(false),
  isOfficetel: z.boolean().default(false),
  isUnsoldHousing: z.boolean().default(false),
});

const reductionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("self_farming"),
    farmingYears: z.number().int().nonnegative(),
    /**
     * 조특령 §66 ⑪ 1호 — 피상속인이 경작한 기간(년).
     * 본인 자경기간이 §69 요건(8년)에 미달할 때 합산한다.
     */
    decedentFarmingYears: z.number().int().nonnegative().optional(),
    // ── 조특령 §66 ⑤⑥ 편입일 부분감면 ──
    /** 주거·상업·공업지역 편입일 (YYYY-MM-DD). 2002.1.1 이후 편입 시 부분감면 적용. */
    incorporationDate: z.string().date().optional(),
    /** 편입 지역 유형 */
    incorporationZoneType: z.enum(["residential", "commercial", "industrial"]).optional(),
    /** 편입일 당시 기준시가 (원 총액 또는 ㎡당, 취득·양도시 기준시가와 동일 단위) */
    standardPriceAtIncorporation: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("long_term_rental"),
    rentalYears: z.number().int().nonnegative(),
    rentIncreaseRate: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal("new_housing"),
    region: z.enum(["metropolitan", "non_metropolitan"]),
  }),
  z.object({
    type: z.literal("unsold_housing"),
    region: z.enum(["metropolitan", "non_metropolitan"]),
  }),
  z.object({
    type: z.literal("public_expropriation"),
    cashCompensation: z.number().int().nonnegative(),
    bondCompensation: z.number().int().nonnegative(),
    bondHoldingYears: z.union([z.literal(3), z.literal(5), z.null()]).optional(),
    businessApprovalDate: z.string().date(),
  }).refine(
    (v) => v.cashCompensation + v.bondCompensation > 0,
    { message: "현금 또는 채권 보상액 중 최소 하나는 0보다 커야 합니다" },
  ),
]);

const filingPenaltyDetailsSchema = z.object({
  determinedTax:     z.number().int().nonnegative(),
  reductionAmount:   z.number().int().nonnegative(),
  priorPaidTax:      z.number().int().nonnegative(),
  originalFiledTax:  z.number().int().nonnegative(),
  excessRefundAmount:z.number().int().nonnegative(),
  interestSurcharge: z.number().int().nonnegative(),
  filingType:        z.enum(["none", "under", "excess_refund", "correct"]),
  penaltyReason:     z.enum(["normal", "fraudulent", "offshore_fraud"]),
});

const delayedPaymentDetailsSchema = z.object({
  unpaidTax:          z.number().int().nonnegative(),
  paymentDeadline:    z.string().date(),
  actualPaymentDate:  z.string().date().optional(),
});

// ─── 일괄양도 안분 — 상속 보충적평가액 입력 스키마 ───────────────

const inheritanceValuationSchema = z.object({
  /** 상속개시일 */
  inheritanceDate: z.string().date(),
  /** 자산 종류 */
  assetKind: z.enum(["land", "house_individual", "house_apart"]),
  /** 토지 면적 (㎡) — assetKind=land 필수 */
  landAreaM2: z.number().positive().optional(),
  /** 상속개시일 직전 공시가격 (원/㎡ for land, 원 총액 for house) */
  publishedValueAtInheritance: z.number().int().nonnegative(),
  /** 시가 (우선순위 1) */
  marketValue: z.number().int().nonnegative().optional(),
  /** 감정평가 평균 (우선순위 2) */
  appraisalAverage: z.number().int().nonnegative().optional(),
});

// ─── 함께 양도된 자산(Companion Asset) 스키마 ────────────────────
// 소득세법 시행령 §166 ⑥ — 주 자산과 한 계약으로 일괄양도된 다른 자산.
// 주 자산 정보는 propertyBaseShape의 기본 필드로 들어오고,
// companionAssets는 주 자산과 기준시가 비율로 안분될 보조 자산들이다.

const companionAssetSchema = z.object({
  assetId: z.string().min(1),
  assetLabel: z.string().min(1),
  assetKind: z.enum(["housing", "land", "building"]),
  /**
   * 양도시점 기준시가 (안분 키) — 주택: 개별주택가격, 토지: 공시지가×면적.
   * apportioned 모드에서 필수, actual 모드(fixedSalePrice 사용)에서는 선택.
   */
  standardPriceAtTransfer: z.number().int().positive().optional(),
  /** 취득시점 기준시가 (선택) — totalAcquisitionPrice 안분 또는 매매 estimated 환산 시 키 */
  standardPriceAtAcquisition: z.number().int().positive().optional(),
  /** 자산 직접 귀속 필요경비 (원, 선택) */
  directExpenses: z.number().int().nonnegative().optional(),
  /** 상속·증여·매매(actual) 등 취득가액이 자산별로 확정된 경우 (선택) */
  fixedAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** 상속 보충적평가액 산정용 입력 (선택) — 지정 시 fixedAcquisitionPrice로 주입됨 */
  inheritanceValuation: inheritanceValuationSchema.optional(),
  /** 자산별 감면 (예: 농지 자경 감면) */
  reductions: z.array(reductionSchema).default([]),
  /** 자산별 1세대 1주택 여부 (주택 자산에 적용) */
  isOneHousehold: z.boolean().optional(),
  /** 자산별 거주기간(월) — 주택의 1세대1주택 판정용 */
  residencePeriodMonths: z.number().int().nonnegative().optional(),
  /** 자산별 미등기 여부 */
  isUnregistered: z.boolean().optional(),
  /** 자산별 비사업용 토지 여부 */
  isNonBusinessLand: z.boolean().optional(),
  // ── 일괄양도 보완: 양도가액 모드 + 취득원인 분기 ──
  /**
   * 계약서에 구분 기재된 실제 양도가액 (원, 선택).
   * §166⑥ 본문 — 지정 시 안분 대상 제외, 그대로 allocatedSalePrice로 사용.
   */
  fixedSalePrice: z.number().int().positive().optional(),
  /** 동반자산 취득 원인 — 기본 "inheritance" (기존 동작 호환) */
  acquisitionCause: z.enum(["purchase", "inheritance", "gift"]).default("inheritance"),
  /** 매매 시 환산취득가 사용 여부 */
  useEstimatedAcquisition: z.boolean().optional(),
  /** 본인 취득일 (YYYY-MM-DD) — 보유기간 산정용 */
  acquisitionDate: z.string().date().optional(),
  /** 상속 시 피상속인 취득일 (자산별 단기보유 통산용) */
  decedentAcquisitionDate: z.string().date().optional(),
  /** 증여 시 증여자 취득일 */
  donorAcquisitionDate: z.string().date().optional(),
});

// ─── superRefine 공통 검증 ──────────────────────────────────────

function addPropertyRefines(
  data: {
    useEstimatedAcquisition: boolean;
    standardPriceAtAcquisition?: number;
    standardPriceAtTransfer?: number;
    acquisitionDate: string;
    transferDate: string;
    acquisitionCause?: "purchase" | "inheritance" | "gift";
    decedentAcquisitionDate?: string;
    donorAcquisitionDate?: string;
    annualBasicDeductionUsed?: number;
    acquisitionMethod?: "actual" | "estimated" | "appraisal";
    appraisalValue?: number;
    isSelfBuilt?: boolean;
    buildingType?: "new" | "extension";
    extensionFloorArea?: number;
    constructionDate?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (data.useEstimatedAcquisition && !data.standardPriceAtAcquisition) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["standardPriceAtAcquisition"],
      message: "환산취득가 사용 시 취득시 기준시가 필수",
    });
  }
  if (data.useEstimatedAcquisition && !data.standardPriceAtTransfer) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["standardPriceAtTransfer"],
      message: "환산취득가 사용 시 양도시 기준시가 필수",
    });
  }
  if (data.acquisitionDate >= data.transferDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acquisitionDate"],
      message: "취득일은 양도일보다 이전이어야 합니다",
    });
  }
  if (data.acquisitionCause === "inheritance") {
    if (!data.decedentAcquisitionDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decedentAcquisitionDate"],
        message: "상속의 경우 피상속인 취득일이 필수입니다",
      });
    } else if (data.decedentAcquisitionDate >= data.acquisitionDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decedentAcquisitionDate"],
        message: "피상속인 취득일은 상속개시일보다 이전이어야 합니다",
      });
    }
  }
  if (data.acquisitionCause === "gift") {
    if (!data.donorAcquisitionDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["donorAcquisitionDate"],
        message: "증여의 경우 증여자 취득일이 필수입니다",
      });
    } else if (data.donorAcquisitionDate >= data.acquisitionDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["donorAcquisitionDate"],
        message: "증여자 취득일은 증여일보다 이전이어야 합니다",
      });
    }
  }
  if (data.annualBasicDeductionUsed !== undefined && data.annualBasicDeductionUsed > 2_500_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["annualBasicDeductionUsed"],
      message: "연간 기본공제 한도(2,500,000원)를 초과할 수 없습니다",
    });
  }
  if (data.acquisitionMethod === "appraisal" && !data.appraisalValue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["appraisalValue"],
      message: "감정가액 방식 선택 시 감정가액을 입력하세요",
    });
  }
  if (data.isSelfBuilt && data.buildingType === "extension" && !data.extensionFloorArea) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["extensionFloorArea"],
      message: "증축 시 바닥면적을 입력하세요",
    });
  }
  if (data.isSelfBuilt && !data.constructionDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["constructionDate"],
      message: "신축·증축일을 입력하세요",
    });
  }
}

// ─── 다필지 스키마 ────────────────────────────────────────────

const parcelSchema = z.object({
  id: z.string().min(1),
  acquisitionDate: z.string().date(),
  acquisitionMethod: z.enum(["actual", "estimated"]),
  acquisitionPrice: z.number().int().nonnegative().optional(),
  acquisitionArea: z.number().positive(),
  transferArea: z.number().positive(),
  standardPricePerSqmAtAcq: z.number().nonnegative().optional(),
  standardPricePerSqmAtTransfer: z.number().nonnegative().optional(),
  expenses: z.number().int().nonnegative().optional(),
  useDayAfterReplotting: z.boolean().optional(),
  replottingConfirmDate: z.string().date().optional(),
  // 환지 감환지/증환지 (소득세법 시행령 §162의2)
  entitlementArea: z.number().positive().optional(),
  allocatedArea: z.number().positive().optional(),
  priorLandArea: z.number().positive().optional(),
}).superRefine((p, ctx) => {
  if (p.acquisitionMethod === "estimated") {
    if (!p.standardPricePerSqmAtAcq || p.standardPricePerSqmAtAcq <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "환산취득가 방식: 취득시 ㎡당 기준시가 필수", path: ["standardPricePerSqmAtAcq"] });
    }
    if (!p.standardPricePerSqmAtTransfer || p.standardPricePerSqmAtTransfer <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "환산취득가 방식: 양도시 ㎡당 기준시가 필수", path: ["standardPricePerSqmAtTransfer"] });
    }
  } else {
    if (p.acquisitionPrice === undefined || p.acquisitionPrice <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "실가 방식: 취득가액 필수", path: ["acquisitionPrice"] });
    }
  }
  if (p.useDayAfterReplotting && !p.replottingConfirmDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "환지처분확정일 입력 필요", path: ["replottingConfirmDate"] });
  }
  // 환지 면적 3필드 일관성 검증 — 일부만 제공되면 오류
  const ex = [p.entitlementArea, p.allocatedArea, p.priorLandArea];
  const providedCount = ex.filter((v) => v !== undefined).length;
  if (providedCount > 0 && providedCount < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entitlementArea"],
      message: "환지 면적은 권리·교부·종전 3필드 모두 입력하거나 모두 비워야 합니다",
    });
  }
});

// ─── 단건 기본 필드 객체 (단건·다건 공유) ───────────────────────

const propertyBaseShape = {
  propertyType: z.enum(["housing", "land", "building", "right_to_move_in", "presale_right"]),
  transferPrice: z.number().int().positive(),
  transferDate: z.string().date(),
  acquisitionPrice: z.number().int().nonnegative(),
  acquisitionDate: z.string().date(),
  acquisitionCause: z.enum(["purchase", "inheritance", "gift"]).optional(),
  decedentAcquisitionDate: z.string().date().optional(),
  donorAcquisitionDate: z.string().date().optional(),
  expenses: z.number().int().nonnegative(),
  useEstimatedAcquisition: z.boolean(),
  standardPriceAtAcquisition: z.number().int().positive().optional(),
  standardPriceAtTransfer: z.number().int().positive().optional(),
  householdHousingCount: z.number().int().min(0),
  residencePeriodMonths: z.number().int().nonnegative(),
  isRegulatedArea: z.boolean(),
  wasRegulatedAtAcquisition: z.boolean(),
  isUnregistered: z.boolean(),
  isNonBusinessLand: z.boolean(),
  isSuccessorRightToMoveIn: z.boolean().optional(),
  isOneHousehold: z.boolean(),
  temporaryTwoHouse: temporaryTwoHouseSchema.optional(),
  reductions: z.array(reductionSchema).default([]),
  nonBusinessLandDetails: nonBusinessLandDetailsSchema.optional(),
  houses: z.array(houseSchema).optional(),
  sellingHouseId: z.string().optional(),
  marriageMerge: z.object({ marriageDate: z.string().date() }).optional(),
  parentalCareMerge: z.object({ mergeDate: z.string().date() }).optional(),
  rentalReductionDetails: rentalReductionDetailsSchema.optional(),
  newHousingDetails: newHousingDetailsSchema.optional(),
  acquisitionMethod: z.enum(["actual", "estimated", "appraisal"]).optional(),
  appraisalValue: z.number().int().nonnegative().optional(),
  isSelfBuilt: z.boolean().optional(),
  buildingType: z.enum(["new", "extension"]).optional(),
  constructionDate: z.string().date().optional(),
  extensionFloorArea: z.number().nonnegative().optional(),
  pre1990Land: pre1990LandSchema.optional(),
  parcels: z.array(parcelSchema).max(10).optional(),

  // ─── 일괄양도 안분 (소득세법 시행령 §166 ⑥) ────────────────
  /** 함께 양도된 자산들 (2개 이상 일괄 양도 시). 없거나 빈 배열이면 단건으로 처리. */
  companionAssets: z.array(companionAssetSchema).max(10).optional(),
  /** 매매계약 상 총 양도가액 (일괄양도 시 필수). 없으면 transferPrice가 총액으로 간주. */
  totalSalePrice: z.number().int().positive().optional(),
  /** 안분 방식 (v1은 standard_price_transfer만 지원) */
  apportionmentMethod: z.literal("standard_price_transfer").optional(),
  /** 주 자산의 양도시점 기준시가 — 일괄양도 안분 키 (apportioned 모드 시 필수) */
  standardPriceAtTransferForApportion: z.number().int().positive().optional(),
  /** 주 자산이 상속 보충적평가액 산정 대상인 경우 */
  primaryInheritanceValuation: inheritanceValuationSchema.optional(),
  /**
   * 일괄양도 양도가액 결정 모드 (계약서 단위 단일 결정).
   * - "actual": 계약서에 자산별 가액이 구분 기재된 경우 (§166⑥ 본문)
   * - "apportioned": 구분 불분명 → 기준시가 비율 안분 (§166⑥ 단서, 기본값)
   */
  bundledSaleMode: z.enum(["actual", "apportioned"]).default("apportioned"),
  /** actual 모드 시 주 자산의 계약서상 양도가액 (원) */
  primaryActualSalePrice: z.number().int().positive().optional(),
};

// ─── 단건 스키마 (기존 inputSchema와 동일) ─────────────────────

const priorReductionUsageSchema = z.array(
  z.object({
    year: z.number().int().min(1990).max(new Date().getFullYear()),
    type: z.enum(["self_farming", "long_term_rental", "new_housing", "unsold_housing", "public_expropriation"]),
    amount: z.number().int().nonnegative(),
  }),
).default([]);

export const propertySchema = z
  .object({
    ...propertyBaseShape,
    annualBasicDeductionUsed: z.number().int().nonnegative().default(0),
    priorReductionUsage: priorReductionUsageSchema,
    filingPenaltyDetails: filingPenaltyDetailsSchema.optional(),
    delayedPaymentDetails: delayedPaymentDetailsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    addPropertyRefines(data, ctx);

    // 일괄양도 유효성 (소득세법 시행령 §166 ⑥)
    const companions = data.companionAssets ?? [];
    if (companions.length > 0) {
      // 총 양도가액 필수
      if (data.totalSalePrice === undefined || data.totalSalePrice <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalSalePrice"],
          message: "일괄양도 시 총 양도가액(totalSalePrice)이 필수입니다",
        });
      }

      // ── 양도가액 모드 단일 결정 검증 (계약서 단위) ──
      if (data.bundledSaleMode === "actual") {
        // 주 자산 actual 가액 필수
        if (!data.primaryActualSalePrice || data.primaryActualSalePrice <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["primaryActualSalePrice"],
            message: "actual 모드: 주 자산의 계약서상 양도가액 필수",
          });
        }
        // 모든 컴패니언이 fixedSalePrice 가져야 함
        for (let i = 0; i < companions.length; i++) {
          if (!companions[i].fixedSalePrice || companions[i].fixedSalePrice! <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "fixedSalePrice"],
              message: "actual 모드: 모든 자산의 계약서상 양도가액 필수",
            });
          }
        }
        // 합계 = totalSalePrice 검증
        if (data.totalSalePrice && data.primaryActualSalePrice) {
          const sumFixed =
            data.primaryActualSalePrice +
            companions.reduce((s, c) => s + (c.fixedSalePrice ?? 0), 0);
          if (sumFixed !== data.totalSalePrice) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["primaryActualSalePrice"],
              message: `구분 기재된 양도가액 합(${sumFixed.toLocaleString()})이 총 양도가액(${data.totalSalePrice.toLocaleString()})과 일치하지 않습니다`,
            });
          }
        }
      } else {
        // apportioned: 주 자산 양도시점 기준시가 필수 (안분 키)
        if (
          data.standardPriceAtTransferForApportion === undefined ||
          data.standardPriceAtTransferForApportion <= 0
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["standardPriceAtTransferForApportion"],
            message: "apportioned 모드: 주 자산의 양도시점 기준시가 필수",
          });
        }
        // 모든 컴패니언이 standardPriceAtTransfer 가져야 함
        for (let i = 0; i < companions.length; i++) {
          if (!companions[i].standardPriceAtTransfer || companions[i].standardPriceAtTransfer! <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "standardPriceAtTransfer"],
              message: "apportioned 모드: 양도시 기준시가 필수",
            });
          }
        }
      }

      // ── 컴패니언별 acquisitionCause 검증 ──
      for (let i = 0; i < companions.length; i++) {
        const c = companions[i];
        if (c.acquisitionCause === "purchase") {
          if (c.useEstimatedAcquisition) {
            if (!c.standardPriceAtAcquisition || c.standardPriceAtAcquisition <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["companionAssets", i, "standardPriceAtAcquisition"],
                message: "매매(환산) 시 취득시 기준시가 필수",
              });
            }
            if (!c.standardPriceAtTransfer || c.standardPriceAtTransfer <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["companionAssets", i, "standardPriceAtTransfer"],
                message: "매매(환산) 시 양도시 기준시가 필수",
              });
            }
          } else {
            if (!c.fixedAcquisitionPrice || c.fixedAcquisitionPrice <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["companionAssets", i, "fixedAcquisitionPrice"],
                message: "매매(실가) 시 취득가액 필수",
              });
            }
          }
          if (!c.acquisitionDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "acquisitionDate"],
              message: "매매 자산은 취득일 필수",
            });
          }
        } else if (c.acquisitionCause === "gift") {
          if (!c.fixedAcquisitionPrice || c.fixedAcquisitionPrice <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "fixedAcquisitionPrice"],
              message: "증여 자산은 신고가액(취득가액) 필수",
            });
          }
          if (!c.donorAcquisitionDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "donorAcquisitionDate"],
              message: "증여 자산은 증여자 취득일 필수",
            });
          }
          if (!c.acquisitionDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "acquisitionDate"],
              message: "증여 자산은 증여일 필수",
            });
          }
        } else if (c.acquisitionCause === "inheritance") {
          // 상속: inheritanceValuation(auto) 또는 fixedAcquisitionPrice(manual) 중 하나 필요
          const hasAuto = c.inheritanceValuation !== undefined;
          const hasManual = c.fixedAcquisitionPrice !== undefined && c.fixedAcquisitionPrice > 0;
          if (!hasAuto && !hasManual) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "fixedAcquisitionPrice"],
              message: "상속 자산은 보충적평가 또는 직접입력 취득가액 필수",
            });
          }
          if (!c.decedentAcquisitionDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["companionAssets", i, "decedentAcquisitionDate"],
              message: "상속 자산은 피상속인 취득일 필수",
            });
          }
        }
      }

      // assetId 중복 금지
      const ids = companions.map((a) => a.assetId);
      const seen = new Set<string>();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === "primary") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "assetId"],
            message: `"primary"는 주 자산 예약 식별자입니다`,
          });
        }
        if (seen.has(ids[i])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "assetId"],
            message: `assetId "${ids[i]}"가 중복됩니다`,
          });
        }
        seen.add(ids[i]);
      }
      // inheritanceValuation 사용 시 landAreaM2 일관성
      for (let i = 0; i < companions.length; i++) {
        const v = companions[i].inheritanceValuation;
        if (v?.assetKind === "land" && (!v.landAreaM2 || v.landAreaM2 <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "inheritanceValuation", "landAreaM2"],
            message: "토지 상속평가액 산정 시 면적(㎡)이 필수입니다",
          });
        }
      }
    }
  });

// ─── 다건 개별 자산 스키마 (propertyId·propertyLabel 추가) ──────

export const propertyItemSchema = z
  .object({
    propertyId: z.string().min(1),
    propertyLabel: z.string().min(1),
    ...propertyBaseShape,
    // 자산별 가산세 — 단건 엔진이 자산별 결정세액 기준으로 계산.
    filingPenaltyDetails: filingPenaltyDetailsSchema.optional(),
    delayedPaymentDetails: delayedPaymentDetailsSchema.optional(),
  })
  .superRefine((data, ctx) => addPropertyRefines(data, ctx));

// ─── 다건 입력 스키마 ────────────────────────────────────────────

export const multiInputSchema = z
  .object({
    taxYear: z.number().int().min(2000).max(2100),
    properties: z.array(propertyItemSchema).min(1).max(20),
    annualBasicDeductionUsed: z.number().int().nonnegative().default(0),
    priorReductionUsage: priorReductionUsageSchema,
    basicDeductionAllocation: z
      .enum(["MAX_BENEFIT", "FIRST", "EARLIEST_TRANSFER"])
      .default("MAX_BENEFIT"),
    // 가산세는 자산별로 입력 (propertyItemSchema.filingPenaltyDetails / delayedPaymentDetails).
  })
  .superRefine((data, ctx) => {
    // taxYear 일관성 — 모든 양도일이 taxYear 내에 있어야 함
    for (let i = 0; i < data.properties.length; i++) {
      const year = new Date(data.properties[i].transferDate).getFullYear();
      if (year !== data.taxYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["properties", i, "transferDate"],
          message: `양도일(${data.properties[i].transferDate})이 과세연도(${data.taxYear})와 다릅니다`,
        });
      }
    }
    // propertyId 중복 금지
    const ids = data.properties.map((p) => p.propertyId);
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      if (seen.has(ids[i])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["properties", i, "propertyId"],
          message: `propertyId "${ids[i]}"가 중복됩니다`,
        });
      }
      seen.add(ids[i]);
    }
    // annualBasicDeductionUsed 한도 검증
    if (data.annualBasicDeductionUsed > 2_500_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["annualBasicDeductionUsed"],
        message: "연간 기본공제 한도(2,500,000원)를 초과할 수 없습니다",
      });
    }
  });

export type PropertySchemaInput = z.infer<typeof propertySchema>;
export type PropertyItemSchemaInput = z.infer<typeof propertyItemSchema>;
export type MultiInputSchemaInput = z.infer<typeof multiInputSchema>;
