import { z } from "zod";

// ─── 하위 스키마 ────────────────────────────────────────────────

export const temporaryTwoHouseSchema = z.object({
  previousAcquisitionDate: z.string().date(),
  newAcquisitionDate: z.string().date(),
});

export const businessUsePeriodSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  usageType: z.string().min(1),
});

export const gracePeriodSchema = z.object({
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

export const LAND_TYPE_VALUES = [
  "farmland", "paddy", "field", "orchard",
  "forest", "pasture", "vacant_lot",
  "building_site", "housing_site",
  "villa_land", "other_land", "miscellaneous", "other",
] as const;

export const ZONE_TYPE_VALUES = [
  "residential", "exclusive_residential", "general_residential", "semi_residential",
  "commercial", "industrial", "green", "management",
  "agriculture_forest", "natural_env", "unplanned", "undesignated",
] as const;

export const REVENUE_BUSINESS_TYPES = [
  "car_driving_school",
  "sports_facility",
  "youth_facility",
  "tourist_lodging",
  "resort_business",
  "transportation",
  "default",
  "none",
] as const;

export const revenueTestSchema = z.object({
  businessType: z.enum(REVENUE_BUSINESS_TYPES),
  annualRevenue: z.number().nonnegative(),
  landValue:     z.number().positive(),
});

export const nonBusinessLandDetailsSchema = z.object({
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

export const rentHistorySchema = z.object({
  contractDate: z.string().date(),
  monthlyRent: z.number().int().nonnegative(),
  deposit: z.number().int().nonnegative(),
  contractType: z.enum(["jeonse", "monthly", "semi_jeonse"]),
});

export const vacancyPeriodSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export const rentalReductionDetailsSchema = z.object({
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

export const newHousingDetailsSchema = z.object({
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
export const landGradeInputSchema = z.union([
  z.number().int().min(1).max(365),
  z.object({ gradeValue: z.number().positive() }),
]);

export const pre1990LandSchema = z.object({
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

export const houseSchema = z.object({
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

export const reductionSchema = z.discriminatedUnion("type", [
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

export const filingPenaltyDetailsSchema = z.object({
  determinedTax:     z.number().int().nonnegative(),
  reductionAmount:   z.number().int().nonnegative(),
  priorPaidTax:      z.number().int().nonnegative(),
  originalFiledTax:  z.number().int().nonnegative(),
  excessRefundAmount:z.number().int().nonnegative(),
  interestSurcharge: z.number().int().nonnegative(),
  filingType:        z.enum(["none", "under", "excess_refund", "correct"]),
  penaltyReason:     z.enum(["normal", "fraudulent", "offshore_fraud"]),
});

export const delayedPaymentDetailsSchema = z.object({
  unpaidTax:          z.number().int().nonnegative(),
  paymentDeadline:    z.string().date(),
  actualPaymentDate:  z.string().date().optional(),
});

// ─── 일괄양도 안분 — 상속 보충적평가액 입력 스키마 ───────────────

export const inheritanceValuationSchema = z.object({
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

export const companionAssetSchema = z.object({
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

export function addPropertyRefines(
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
    /** §164⑤ PHD 입력 — 제공 시 standardPriceAt* 필수 검증 우회 */
    preHousingDisclosure?: unknown;
  },
  ctx: z.RefinementCtx,
) {
  // §164⑤ PHD 경로: 3-시점 입력으로 기준시가 자동 도출되므로 standardPriceAt* 불요
  const hasPhd = data.preHousingDisclosure !== undefined && data.preHousingDisclosure !== null;
  if (data.useEstimatedAcquisition && !data.standardPriceAtAcquisition && !hasPhd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["standardPriceAtAcquisition"],
      message: "환산취득가 사용 시 취득시 기준시가 필수",
    });
  }
  if (data.useEstimatedAcquisition && !data.standardPriceAtTransfer && !hasPhd) {
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

export const parcelSchema = z.object({
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

// ─── 개별주택가격 미공시 취득 환산 스키마 (§164⑤) ──────────────

export const preHousingDisclosureSchema = z.object({
  /** 최초 고시일 (사용자 직접 입력) */
  firstDisclosureDate: z.string().date(),
  /** 최초 고시 개별주택가격 P_F (원) */
  firstDisclosureHousingPrice: z.number().int().positive(),
  /** 토지 면적 (㎡) */
  landArea: z.number().positive(),
  /** 취득당시 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtAcquisition: z.number().int().positive(),
  /** 취득당시 건물 기준시가 (원) */
  buildingStdPriceAtAcquisition: z.number().int().nonnegative(),
  /** 최초공시일 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtFirstDisclosure: z.number().int().positive(),
  /** 최초공시일 건물 기준시가 (원) */
  buildingStdPriceAtFirstDisclosure: z.number().int().nonnegative(),
  /** 양도시 개별주택가격 P_T (원) */
  transferHousingPrice: z.number().int().positive(),
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: z.number().int().positive(),
  /** 양도시 건물 기준시가 (원) */
  buildingStdPriceAtTransfer: z.number().int().nonnegative(),
});

