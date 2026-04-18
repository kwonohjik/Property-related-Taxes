/**
 * 양도소득세 계산 API Route
 *
 * Layer 1 (Orchestrator):
 *   Zod 입력 검증 → preloadTaxRates → calculateTransferTax → 결과 반환
 *
 * POST /api/calc/transfer
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

// ============================================================
// Zod 입력 스키마 (⑫-1)
// ============================================================

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

// [C3 수정] landType / zoneType을 열린 문자열 대신 고정 enum으로 제한 (타입 안전성)
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
});

// [C7 수정] 장기임대 감면 정밀 엔진 입력 스키마
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

// [C7 수정] 신축/미분양 감면 정밀 엔진 입력 스키마
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
]);

const inputSchema = z
  .object({
    /** 1. 물건 종류 */
    propertyType: z.enum(["housing", "land", "building", "right_to_move_in", "presale_right"]),
    /** 2. 양도가액 (원, 양수 정수) */
    transferPrice: z.number().int().positive(),
    /** 3. 양도일 (YYYY-MM-DD) */
    transferDate: z.string().date(),
    /** 4. 취득가액 (0이면 환산취득가 사용) */
    acquisitionPrice: z.number().int().nonnegative(),
    /** 5. 취득일 (YYYY-MM-DD) */
    acquisitionDate: z.string().date(),
    /** 5a. 취득 원인 (매매·상속·증여) */
    acquisitionCause: z.enum(["purchase", "inheritance", "gift"]).optional(),
    /** 5b. 상속 시 피상속인 취득일 */
    decedentAcquisitionDate: z.string().date().optional(),
    /** 5c. 증여 시 증여자 취득일 */
    donorAcquisitionDate: z.string().date().optional(),
    /** 6. 필요경비 */
    expenses: z.number().int().nonnegative(),
    /** 7. 환산취득가 사용 여부 */
    useEstimatedAcquisition: z.boolean(),
    /** 8. 취득시 기준시가 */
    standardPriceAtAcquisition: z.number().int().positive().optional(),
    /** 9. 양도시 기준시가 */
    standardPriceAtTransfer: z.number().int().positive().optional(),
    /** 10. 세대 보유 주택 수 */
    householdHousingCount: z.number().int().min(0),
    /** 11. 거주기간 (월) */
    residencePeriodMonths: z.number().int().nonnegative(),
    /** 12. 양도일 기준 조정대상지역 여부 */
    isRegulatedArea: z.boolean(),
    /** 13. 취득일 기준 조정대상지역 여부 */
    wasRegulatedAtAcquisition: z.boolean(),
    /** 14. 미등기 여부 */
    isUnregistered: z.boolean(),
    /** 15. 비사업용 토지 여부 */
    isNonBusinessLand: z.boolean(),
    /** 15a. 조합원입주권 승계취득 여부 (right_to_move_in 전용) */
    isSuccessorRightToMoveIn: z.boolean().optional(),
    /** 16. 1세대 여부 */
    isOneHousehold: z.boolean(),
    /** 17. 일시적 2주택 정보 */
    temporaryTwoHouse: temporaryTwoHouseSchema.optional(),
    /** 18. 조세특례 감면 목록 */
    reductions: z.array(reductionSchema).default([]),
    /** 19. 당해 연도 기사용 기본공제 */
    annualBasicDeductionUsed: z.number().int().nonnegative().default(0),
    /** 20. 비사업용 토지 상세 정보 (선택 — 제공 시 정밀 판정) */
    nonBusinessLandDetails: nonBusinessLandDetailsSchema.optional(),
    /** 21. 세대 보유 주택 목록 (선택 — 제공 시 정밀 중과세 산정) */
    houses: z.array(houseSchema).optional(),
    /** 22. 양도 주택 ID (houses 제공 시) */
    sellingHouseId: z.string().optional(),
    /** 23. 혼인합가 정보 */
    marriageMerge: z.object({ marriageDate: z.string().date() }).optional(),
    /** 24. 동거봉양 합가 정보 */
    parentalCareMerge: z.object({ mergeDate: z.string().date() }).optional(),
    /** 25. 장기임대주택 감면 정밀 정보 (선택 — C7) */
    rentalReductionDetails: rentalReductionDetailsSchema.optional(),
    /** 26. 신축/미분양 감면 정밀 정보 (선택 — C7) */
    newHousingDetails: newHousingDetailsSchema.optional(),
    /** 27. 취득가 산정 방식 (§114조의2 가산세 판정용) */
    acquisitionMethod: z.enum(["actual", "estimated", "appraisal"]).optional(),
    /** 28. 감정가액 (acquisitionMethod === "appraisal" 시) */
    appraisalValue: z.number().int().nonnegative().optional(),
    /** 29. 본인 신축·증축 여부 */
    isSelfBuilt: z.boolean().optional(),
    /** 30. 신축/증축 구분 */
    buildingType: z.enum(["new", "extension"]).optional(),
    /** 31. 신축일 또는 증축 완공일 */
    constructionDate: z.string().date().optional(),
    /** 32. 증축 바닥면적 합계 (㎡) */
    extensionFloorArea: z.number().nonnegative().optional(),
    /** 33. 신고불성실가산세 입력 (선택) */
    filingPenaltyDetails: z.object({
      determinedTax:     z.number().int().nonnegative(),
      reductionAmount:   z.number().int().nonnegative(),
      priorPaidTax:      z.number().int().nonnegative(),
      originalFiledTax:  z.number().int().nonnegative(),
      excessRefundAmount:z.number().int().nonnegative(),
      interestSurcharge: z.number().int().nonnegative(),
      filingType:        z.enum(["none", "under", "excess_refund", "correct"]),
      penaltyReason:     z.enum(["normal", "fraudulent", "offshore_fraud"]),
    }).optional(),
    /** 34. 지연납부가산세 입력 (선택) */
    delayedPaymentDetails: z.object({
      unpaidTax:          z.number().int().nonnegative(),
      paymentDeadline:    z.string().date(),
      actualPaymentDate:  z.string().date().optional(),
    }).optional(),
  })
  .superRefine((data, ctx) => {
    // V-1: 환산취득가 사용 시 취득시 기준시가 필수
    if (data.useEstimatedAcquisition && !data.standardPriceAtAcquisition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["standardPriceAtAcquisition"],
        message: "환산취득가 사용 시 취득시 기준시가 필수",
      });
    }
    // V-2: 환산취득가 사용 시 양도시 기준시가 필수
    if (data.useEstimatedAcquisition && !data.standardPriceAtTransfer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["standardPriceAtTransfer"],
        message: "환산취득가 사용 시 양도시 기준시가 필수",
      });
    }
    // V-3: 취득일은 양도일보다 이전이어야 함
    if (data.acquisitionDate >= data.transferDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acquisitionDate"],
        message: "취득일은 양도일보다 이전이어야 합니다",
      });
    }
    // V-3a: 상속 시 피상속인 취득일 필수 + 취득일(상속개시일)보다 이전
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
    // V-3b: 증여 시 증여자 취득일 필수 + 증여일(취득일)보다 이전
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
    // V-4: 당해연도 기사용 기본공제는 연간 한도(250만 원) 이하
    if (data.annualBasicDeductionUsed > 2_500_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["annualBasicDeductionUsed"],
        message: "연간 기본공제 한도(2,500,000원)를 초과할 수 없습니다",
      });
    }
    // V-5: 감정가액 방식 선택 시 감정가액 필수
    if (data.acquisitionMethod === "appraisal" && !data.appraisalValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["appraisalValue"],
        message: "감정가액 방식 선택 시 감정가액을 입력하세요",
      });
    }
    // V-6: 증축 선택 시 바닥면적 필수
    if (data.isSelfBuilt && data.buildingType === "extension" && !data.extensionFloorArea) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["extensionFloorArea"],
        message: "증축 시 바닥면적을 입력하세요",
      });
    }
    // V-7: 신축/증축 선택 시 건축일 필수
    if (data.isSelfBuilt && !data.constructionDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["constructionDate"],
        message: "신축·증축일을 입력하세요",
      });
    }
  });

// ============================================================
// POST handler (⑫-2, ⑫-3)
// ============================================================

export async function POST(request: NextRequest) {
  // 단계 0: Rate Limiting — 분당 30회 (C6)
  const ip = getClientIp(request);
  const rl = checkRateLimit(`transfer:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." } },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // 단계 1: JSON 파싱
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
      { status: 400 },
    );
  }

  // 단계 2: Zod 검증
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return NextResponse.json(
      {
        error: {
          code: TaxErrorCode.INVALID_INPUT,
          message: "입력값이 올바르지 않습니다",
          fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  // 단계 3: string → Date 변환
  const data = parsed.data;
  const transferDate = new Date(data.transferDate);
  const acquisitionDate = new Date(data.acquisitionDate);

  const engineInput: TransferTaxInput = {
    propertyType: data.propertyType,
    transferPrice: data.transferPrice,
    transferDate,
    acquisitionPrice: data.acquisitionPrice,
    acquisitionDate,
    expenses: data.expenses,
    useEstimatedAcquisition: data.useEstimatedAcquisition,
    standardPriceAtAcquisition: data.standardPriceAtAcquisition,
    standardPriceAtTransfer: data.standardPriceAtTransfer,
    householdHousingCount: data.householdHousingCount,
    residencePeriodMonths: data.residencePeriodMonths,
    isRegulatedArea: data.isRegulatedArea,
    wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
    isUnregistered: data.isUnregistered,
    isNonBusinessLand: data.isNonBusinessLand,
    isSuccessorRightToMoveIn: data.isSuccessorRightToMoveIn,
    acquisitionCause: data.acquisitionCause,
    decedentAcquisitionDate: data.decedentAcquisitionDate
      ? new Date(data.decedentAcquisitionDate)
      : undefined,
    donorAcquisitionDate: data.donorAcquisitionDate
      ? new Date(data.donorAcquisitionDate)
      : undefined,
    isOneHousehold: data.isOneHousehold,
    temporaryTwoHouse: data.temporaryTwoHouse
      ? {
          previousAcquisitionDate: new Date(data.temporaryTwoHouse.previousAcquisitionDate),
          newAcquisitionDate: new Date(data.temporaryTwoHouse.newAcquisitionDate),
        }
      : undefined,
    reductions: data.reductions,
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
    nonBusinessLandDetails: data.nonBusinessLandDetails
      ? {
          ...data.nonBusinessLandDetails,
          landType: data.nonBusinessLandDetails.landType,
          zoneType: data.nonBusinessLandDetails.zoneType,
          acquisitionDate: new Date(data.nonBusinessLandDetails.acquisitionDate),
          transferDate: new Date(data.nonBusinessLandDetails.transferDate),
          businessUsePeriods: data.nonBusinessLandDetails.businessUsePeriods.map((p) => ({
            startDate: new Date(p.startDate),
            endDate: new Date(p.endDate),
            usageType: p.usageType,
          })),
          gracePeriods: data.nonBusinessLandDetails.gracePeriods.map((g) => ({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: g.type as any,
            startDate: new Date(g.startDate),
            endDate: new Date(g.endDate),
          })),
        }
      : undefined,
    houses: data.houses
      ? data.houses.map((h) => ({
          id: h.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          region: h.region as any,
          acquisitionDate: new Date(h.acquisitionDate),
          officialPrice: h.officialPrice,
          isInherited: h.isInherited,
          isLongTermRental: h.isLongTermRental,
          isApartment: h.isApartment,
          isOfficetel: h.isOfficetel,
          isUnsoldHousing: h.isUnsoldHousing,
        }))
      : undefined,
    sellingHouseId: data.sellingHouseId,
    marriageMerge: data.marriageMerge
      ? { marriageDate: new Date(data.marriageMerge.marriageDate) }
      : undefined,
    parentalCareMerge: data.parentalCareMerge
      ? { mergeDate: new Date(data.parentalCareMerge.mergeDate) }
      : undefined,
    // [C7 수정] 장기임대 감면 정밀 입력
    rentalReductionDetails: data.rentalReductionDetails
      ? {
          ...data.rentalReductionDetails,
          registrationDate: new Date(data.rentalReductionDetails.registrationDate),
          rentalStartDate: new Date(data.rentalReductionDetails.rentalStartDate),
          transferDate: new Date(data.rentalReductionDetails.transferDate),
          vacancyPeriods: data.rentalReductionDetails.vacancyPeriods.map((v) => ({
            startDate: new Date(v.startDate),
            endDate: new Date(v.endDate),
          })),
          rentHistory: data.rentalReductionDetails.rentHistory.map((r) => ({
            contractDate: new Date(r.contractDate),
            monthlyRent: r.monthlyRent,
            deposit: r.deposit,
            contractType: r.contractType,
          })),
        }
      : undefined,
    // [C7 수정] 신축/미분양 감면 정밀 입력
    newHousingDetails: data.newHousingDetails
      ? {
          ...data.newHousingDetails,
          acquisitionDate: new Date(data.newHousingDetails.acquisitionDate),
          transferDate: new Date(data.newHousingDetails.transferDate),
        }
      : undefined,
    // §114조의2 가산세 판정 필드
    acquisitionMethod: data.acquisitionMethod,
    appraisalValue: data.appraisalValue,
    isSelfBuilt: data.isSelfBuilt,
    buildingType: data.buildingType,
    constructionDate: data.constructionDate ? new Date(data.constructionDate) : undefined,
    extensionFloorArea: data.extensionFloorArea,
    // 신고불성실·지연납부 가산세 (선택)
    filingPenaltyDetails: data.filingPenaltyDetails
      ? { ...data.filingPenaltyDetails }
      : undefined,
    delayedPaymentDetails: data.delayedPaymentDetails
      ? {
          unpaidTax: data.delayedPaymentDetails.unpaidTax,
          paymentDeadline: new Date(data.delayedPaymentDetails.paymentDeadline),
          actualPaymentDate: data.delayedPaymentDetails.actualPaymentDate
            ? new Date(data.delayedPaymentDetails.actualPaymentDate)
            : undefined,
        }
      : undefined,
  };

  // 단계 4: 세율 로드
  let rates;
  try {
    rates = await preloadTaxRates(["transfer"], transferDate);
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: { code: "TAX_RATE_NOT_FOUND", message: "세율 데이터를 로드할 수 없습니다" } },
      { status: 500 },
    );
  }

  // 단계 5: 계산 실행
  try {
    // 신고불성실가산세의 determinedTax + 지연납부의 unpaidTax는 실제 결정세액으로 주입 필요
    // → 먼저 가산세 없이 계산하여 결정세액 확보 후, 가산세 디테일에 주입
    if (engineInput.filingPenaltyDetails || engineInput.delayedPaymentDetails) {
      const baseResult = calculateTransferTax(
        { ...engineInput, filingPenaltyDetails: undefined, delayedPaymentDetails: undefined },
        rates,
      );
      if (engineInput.filingPenaltyDetails) {
        engineInput.filingPenaltyDetails.determinedTax = baseResult.determinedTax;
        engineInput.filingPenaltyDetails.reductionAmount = baseResult.reductionAmount;
      }
      // unpaidTax === 0이면 결정세액 전액 미납으로 가정 (자동 가산세 적용 흐름)
      if (engineInput.delayedPaymentDetails && engineInput.delayedPaymentDetails.unpaidTax === 0) {
        engineInput.delayedPaymentDetails.unpaidTax = baseResult.determinedTax;
      }
    }
    const result = calculateTransferTax(engineInput, rates);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "계산 중 오류가 발생했습니다" } },
      { status: 500 },
    );
  }
}
