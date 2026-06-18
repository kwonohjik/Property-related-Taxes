/**
 * 종합부동산세 입력 Zod 스키마 (T-04)
 *
 * POST /api/calc/comprehensive 요청 본문 검증
 * 종합부동산세법 §8~§15 기반 입력 유효성 검사
 */

import { z } from "zod";
import { requiredCorporateReqKey } from "@/lib/tax-engine/comprehensive-corporate-class";

// ============================================================
// 합산배제 유형 enum
// ============================================================

const exclusionTypeSchema = z.enum([
  "private_construction_rental",
  "private_purchase_rental_long",
  "private_purchase_rental_short",
  "public_support_rental",
  "public_construction_rental",
  "public_purchase_rental",
  "private_short_term_rental_6y_construction",
  "private_short_term_rental_6y_purchase",
  "unsold_housing",
  "daycare_housing",
  "employee_housing",
  "developer_unsold",
  "cultural_heritage",
  "religious",
  "senior_welfare",
  "none",
]);

// ============================================================
// 임대주택 합산배제 입력 스키마 (시행령 §3)
// ============================================================

const rentalRegistrationTypeSchema = z.enum([
  "private_construction",
  "private_purchase_long",
  "private_purchase_short",
  "public_support",
  "public_construction",
  "public_purchase",
  "private_short_term_6y_construction",
  "private_short_term_6y_purchase",
]);

const rentalExclusionInfoSchema = z.object({
  /** 임대등록 유형 */
  registrationType: rentalRegistrationTypeSchema,

  /** 임대사업자 등록일 (YYYY-MM-DD) */
  rentalRegistrationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." }),

  /** 임대개시일 (YYYY-MM-DD) */
  rentalStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." }),

  /** 공시가격 (원, 양의 정수) */
  assessedValue: z
    .number()
    .int({ message: "공시가격은 원 단위 정수여야 합니다." })
    .nonnegative({ message: "공시가격은 0원 이상이어야 합니다." }),

  /** 전용면적 (㎡) */
  area: z
    .number()
    .positive({ message: "전용면적은 0㎡ 초과여야 합니다." }),

  /** 수도권 여부 */
  location: z.enum(["metro", "non_metro"]),

  /** 직전 임대료 (환산 월세 기준, 원) */
  previousRent: z
    .number()
    .nonnegative()
    .optional(),

  /** 현재 임대료 (원) */
  currentRent: z
    .number()
    .nonnegative({ message: "임대료는 0원 이상이어야 합니다." }),

  /** 최초 계약 여부 */
  isInitialContract: z.boolean(),

  /** 실제 임대 경과 연수 (시행령 §3⑦ 합산, 선택) — 의무기간 미달 시 추징 경고용 */
  actualRentalYears: z
    .number()
    .nonnegative({ message: "임대 경과 연수는 0년 이상이어야 합니다." })
    .optional(),

  /** 임대등록 말소일 (YYYY-MM-DD, 선택) — 과세기준일 이전이면 합산배제 거부 */
  registrationRevokedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
    .optional(),
});

// ============================================================
// 기타 합산배제 입력 스키마 (시행령 §4)
// ============================================================

const otherExclusionInfoSchema = z.object({
  // 미분양주택 (시행령 §4①1호)
  recruitmentNoticeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  acquisitionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  isFirstSale: z.boolean().optional(),

  // 가정어린이집 (시행령 §4①2호)
  hasDaycarePermit: z.boolean().optional(),
  isActuallyUsedAsDaycare: z.boolean().optional(),

  // 사원용 주택 (시행령 §4①3호)
  isProvidedToEmployee: z.boolean().optional(),
  /** 임대료율 (시세 대비 비율, 0~1) */
  rentalFeeRate: z
    .number()
    .min(0)
    .max(1)
    .optional(),
});

// ============================================================
// 개별 주택 입력 스키마
// ============================================================

/** §8④ 1세대1주택자 의제 특례 유형 */
const section8para4TypeSchema = z.enum([
  "none",
  "appurtenant_land_only", // 1호 부속토지
  "temporary_two_house",   // 2호 일시적 2주택
  "inherited_house",       // 3호 상속주택
  "regional_low_price",    // 4호 지방 저가주택
]);

/** 건물·부속토지 소유자 분리 시가표준액 안분 (사례6) — 당해·직전 공용 */
const appurtenantSplitSchema = z.object({
  ownedPart: z.enum(["land", "building"]),
  landStandardValue: z.number().int().nonnegative(),
  buildingStandardValue: z.number().int().nonnegative(),
});

export const comprehensivePropertySchema = z
  .object({
    /** 주택 식별자 */
    propertyId: z.string().min(1, { message: "propertyId가 필요합니다." }),

    /** 공시가격 (원, 양의 정수) */
    assessedValue: z
      .number()
      .int({ message: "공시가격은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "공시가격은 0원 이상이어야 합니다." }),

    /** 전용면적 (㎡, 합산배제 판정 시 필요) */
    area: z
      .number()
      .positive()
      .optional(),

    /** 수도권 여부 (합산배제 판정 시 필요) */
    location: z.enum(["metro", "non_metro"]).optional(),

    /** 합산배제 유형 (미입력 시 "none" 처리) */
    exclusionType: exclusionTypeSchema.optional(),

    /** §8④ 1세대1주택자 의제 특례 유형 (미입력 시 "none") */
    section8para4Type: section8para4TypeSchema.optional(),

    /** §8④2호 신규주택 취득일 (YYYY-MM-DD) — UI·검증 전용 (엔진 미전달, 령 §4의2① 3년) */
    newHouseAcquisitionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
      .optional(),

    /** §8④3호 상속개시일 (YYYY-MM-DD) — UI·검증 전용 (령 §4의2② 5년) */
    inheritanceOpenDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
      .optional(),

    /** §8④3호 상속 지분율 (%, 0~100) — UI·검증 전용 (령 §4의2②2호 40% 이하) */
    inheritanceShareRatio: z
      .number()
      .min(0, { message: "지분율은 0% 이상이어야 합니다." })
      .max(100, { message: "지분율은 100% 이하여야 합니다." })
      .optional(),

    /**
     * 지자체 조례 재산세 감면율 (0~1, 예: 25% → 0.25).
     * 미입력 시 0으로 처리 (감면 없음). T-07 ⑨ 동기화.
     */
    reductionRate: z
      .number()
      .min(0, { message: "재산세 감면율은 0 이상이어야 합니다." })
      .max(1, { message: "재산세 감면율은 1(100%) 이하여야 합니다." })
      .optional(),

    /** 공유지분율 (0~1). 미입력 시 1(단독 100%) 처리. 공시가격·재산세 안분. */
    ownershipRatio: z
      .number()
      .min(0, { message: "지분율은 0 이상이어야 합니다." })
      .max(1, { message: "지분율은 1(100%) 이하여야 합니다." })
      .optional(),

    /** 건물·부속토지 소유자 분리 시가표준액 안분 (사례6). 미입력 = 분리 없음. */
    appurtenantSplit: appurtenantSplitSchema.optional(),

    /**
     * 재산세 부과세액 직접입력 (비율 안분 공제 ⓐ). 미입력 = 자동계산(하위호환).
     * 다가구 구별 면적안분 합산·세부담상한·감면 적용 실부과액 (사례7·8·9).
     * 엔진은 effectiveFactor 후곱 없이 원값 사용 — 이미 감면·지분·세부담상한 반영.
     */
    propertyTaxAmount: z
      .number()
      .int({ message: "재산세 부과세액은 정수(원)여야 합니다." })
      .nonnegative({ message: "재산세 부과세액은 0 이상이어야 합니다." })
      .optional(),

    /**
     * 다가구주택 층별(구별) 면적 목록 (트랙 A, 사례7 이상).
     * multiFamilyEnabled ON + 1개 이상 행 입력 시 전송. 빈값 = 자동계산.
     * area는 양수(㎡). ⑧ validate: 전송 시 rows≥1·area>0·Σ>0 (자동 안분 fallback 금지).
     */
    floorUnits: z
      .array(
        z.object({
          label: z.string(),
          area: z.number().positive({ message: "구별 면적은 0㎡ 초과여야 합니다." }),
        }),
      )
      .min(1, { message: "다가구주택 층별 면적 행이 1개 이상 필요합니다." })
      .optional(),

    /**
     * 직전연도 주택공시가격 (직전 공시 단일 입력원, 2단계 통합).
     * §122 layer-1 + §10 layer-2(변환이 previousYearAuto로 파생) — capMode "auto" 시 전송.
     * 정수(원), 양의 정수. 빈값/0/none 모드 = strip(세부담상한 미적용).
     * ⑧ validate: auto 모드 시 전 주택 >0 필수 (자동 안분 fallback 금지 정책).
     */
    priorAssessedValue: z
      .number()
      .int({ message: "직전연도 공시가격은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "직전연도 공시가격은 0원 이상이어야 합니다." })
      .optional(),

    /** 임대주택 합산배제 상세 정보 */
    rentalInfo: rentalExclusionInfoSchema.optional(),

    /** 기타 합산배제 상세 정보 */
    otherInfo: otherExclusionInfoSchema.optional(),
  })
  .refine(
    // ⑧ §8④4호 지방 저가주택은 수도권·광역시·세종 외 소재 (령 §4의2③2호) — location 차단 (안정 요건).
    //   공시 기준액(현행 4억)은 2022 귀속 축자 불가 → 금액 비차단(엔진 신뢰 입력·UI 안내), 후속 자동판정.
    (v) =>
      !(v.section8para4Type === "regional_low_price" && v.location === "metro"),
    {
      message:
        "§8④4호 지방 저가주택은 수도권·광역시·특별자치시 외 지역(비수도권)에 소재해야 합니다.",
      path: ["section8para4Type"],
    },
  );

// ============================================================
// 종합합산 토지 입력 스키마
// ============================================================

export const aggregateLandSchema = z.object({
  /** 인별 종합합산 토지 공시지가 합산 (원) */
  totalOfficialValue: z
    .number()
    .int({ message: "공시지가 합산은 원 단위 정수여야 합니다." })
    .nonnegative(),

  /** 재산세 과세표준 (비율 안분 공제 분모) */
  propertyTaxBase: z
    .number()
    .int()
    .nonnegative(),

  /** 재산세 부과세액 */
  propertyTaxAmount: z
    .number()
    .int()
    .nonnegative(),

  /** 전년도 총세액 (세부담 상한 계산용, 미입력 시 상한 생략) */
  previousYearTotalTax: z
    .number()
    .int()
    .nonnegative()
    .optional(),
});

// ============================================================
// 별도합산 토지 개별 물건 스키마
// ============================================================

export const separateLandItemSchema = z.object({
  /** 토지 식별자 */
  landId: z.string().min(1),

  /** 개별공시지가 × 면적 (원) */
  publicPrice: z
    .number()
    .int()
    .nonnegative(),

  /** 재산세 과세표준 (property-tax.ts에서 전달) */
  propertyTaxBase: z
    .number()
    .int()
    .nonnegative(),

  /** 재산세 부과세액 (property-tax.ts에서 전달) */
  propertyTaxAmount: z
    .number()
    .int()
    .nonnegative(),
});

// ============================================================
// 토지 필지 스키마 (납부할세액 카드 — 종합합산·별도합산 공용)
// ============================================================

export const landParcelSchema = z.object({
  parcelId: z.string().min(1),
  jurisdiction: z.string().min(1, { message: "시군구를 입력하세요." }),
  name: z.string().optional(),
  area: z.number().positive({ message: "면적은 0보다 커야 합니다." }),
  shareRatio: z
    .number()
    .gt(0, { message: "지분율은 0보다 커야 합니다." })
    .lte(1, { message: "지분율은 100% 이하여야 합니다." }),
  officialPricePerSqm: z.number().int().nonnegative(),
  priorOfficialPricePerSqm: z.number().int().nonnegative().optional(),
});

// ============================================================
// 종합부동산세 전체 입력 스키마 (메인)
// ============================================================

export const comprehensiveTaxInputSchema = z.object({
  /**
   * 보유 주택 목록 (0건 허용 — 토지전용 사례10·11 입력 경로)
   * 합산배제 신청 주택 포함. 주택·토지 동시 부재는 하단 refine으로 차단.
   */
  properties: z.array(comprehensivePropertySchema).min(0),

  /**
   * 납세의무자 유형 (§9②). 미입력 = "individual" | "corporate".
   * 법인 세부 §9② class는 corporateHousingType + 조건 플래그로 도출(resolveCorporateHousingClass).
   */
  taxpayerType: z.enum(["individual", "corporate"]).optional(),

  /** 법인 세부 유형 (시행령 §4의4 자동판정). corporate일 때 (기본 general_corp) */
  corporateHousingType: z
    .enum([
      "public_housing_operator",
      "housing_association",
      "redevelopment_operator",
      "private_rental_operator",
      "urban_dev_operator",
      "social_enterprise",
      "clan",
      "public_interest_corp",
      "general_corp",
    ])
    .optional(),
  /** §4의4 조건부 요건 충족 여부 (3-state). 조건부 유형 미응답(undefined) 차단은 하단 refine(C-15) */
  corpHoldsOnlyPublicPurposeHousing: z.boolean().optional(),
  corpHoldsQualifyingRentalHousingOnly: z.boolean().optional(),
  corpMeetsSocialEnterpriseRequirements: z.boolean().optional(),

  /**
   * 1세대1주택자 여부
   * - true: 기본공제 12억, 세액공제(고령자·장기보유) 적용
   * - false: 기본공제 9억
   * (법인 선택 시 엔진이 무시 — API 변환에서도 strip)
   */
  isOneHouseOwner: z.boolean(),

  /**
   * 부부 공동명의 1주택자 특례 신청 (§10의2). 미입력 = false.
   * 1세대1주택자로 보아 계산 (§10의2③) — isOneHouseOwner와 상호배타 (하단 refine).
   */
  isJointOwnershipSpecialCase: z.boolean().optional(),

  /**
   * 생년월일 (고령자 세액공제용, isOneHouseOwner=true 시 필요)
   * YYYY-MM-DD 형식
   */
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
    .optional(),

  /**
   * 최초 취득일 (장기보유 세액공제용, isOneHouseOwner=true 시 필요)
   * YYYY-MM-DD 형식
   */
  acquisitionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
    .optional(),

  /**
   * 과세연도 (과세기준일 = 해당연도 6월 1일)
   * 예: 2024 → 과세기준일 2024-06-01
   */
  assessmentYear: z
    .number()
    .int()
    .min(2000)
    .max(2100),

  /**
   * 전년도 총세액 (종부세 + 재산세, 농특세 제외)
   * 미입력 시 세부담 상한 계산 생략
   */
  previousYearTotalTax: z
    .number()
    .int()
    .nonnegative()
    .optional(),

  /**
   * 직전연도 종합부동산세상당액 자동계산 입력 (세부담상한 — 시행령 §5②, 별지 5호서식 부표).
   * previousYearTotalTax(직접입력)와 상호배타 (하단 refine 차단).
   */
  previousYearAuto: z
    .object({
      assessedValue: z.number().int().nonnegative(),
      isOneHouseOwner: z.boolean(),
      birthDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
        .optional(),
      acquisitionDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식이어야 합니다." })
        .optional(),
      /**
       * 해당연도 감면율 (법령 원칙3 — 직전연도 감면 여부와 무관하게 해당연도 감면율 적용).
       * 0~1 범위. 미입력 시 0 처리. T-07 ⑩ 동기화.
       */
      reductionRate: z
        .number()
        .min(0, { message: "재산세 감면율은 0 이상이어야 합니다." })
        .max(1, { message: "재산세 감면율은 1(100%) 이하여야 합니다." })
        .optional(),
      /** 직전연도 자동계산용 지분율 (해당연도 지분율 적용). 미입력 1(단독). */
      ownershipRatio: z
        .number()
        .min(0, { message: "지분율은 0 이상이어야 합니다." })
        .max(1, { message: "지분율은 1(100%) 이하여야 합니다." })
        .optional(),
      /** 직전연도 주택별 공시가격(원) — 재산세 주택별 합산용 (사례4 다주택). 미입력=단일. */
      priorHouseValues: z.array(z.number().int().nonnegative()).optional(),
      /** 직전연도 주택별 감면율(0~1) — priorHouseValues 인덱스 정합. 주택별 감면 상이(사례9). 미입력=단일 fallback. */
      priorHouseReductionRates: z.array(z.number().min(0).max(1)).optional(),
      /** 직전연도 주택별 공유지분율(0~1) — priorHouseValues 인덱스 정합(사례9 강남 50%). 미입력=단독(1). */
      priorHouseOwnershipRatios: z.array(z.number().min(0).max(1)).optional(),
      /** 직전연도 조정대상지역 2주택 (중과세율 분기). 당해 isMultiHouseInAdjustedArea와 별개. */
      isMultiHouseInAdjustedArea: z.boolean().optional(),
      /** 직전연도 세율 주택 수 (3주택 이상 중과). 미입력=priorHouseValues.length ?? 1. */
      taxableHouseCount: z.number().int().positive().optional(),
      /** 직전 §8④ 특례주택 공시 합(원) — §9⑦⑨ 고령자 공제 안분 분자(사례5). 미입력=안분 미적용. */
      priorSection8Para4Value: z.number().int().nonnegative().optional(),
      /** 직전 건물·부속토지 시가표준액 안분 (사례6) — 당해와 독립(시가표준액 연도 변동). */
      appurtenantSplit: appurtenantSplitSchema.optional(),
    })
    .optional(),

  /**
   * 종합합산 토지 정보 (선택)
   * 종합합산 토지 보유자만 입력
   */
  landAggregate: aggregateLandSchema.optional(),

  /**
   * 별도합산 토지 목록 (선택)
   * 별도합산 토지 보유자만 입력
   */
  landSeparate: z
    .array(separateLandItemSchema)
    .optional(),

  /** 토지 필지 모드 (납부할세액 카드 — 집계 입력과 상호배타) */
  landAggregateParcels: z.array(landParcelSchema).optional(),
  landSeparateParcels: z.array(landParcelSchema).optional(),
  landAggregatePreviousYearTotalTax: z.number().int().nonnegative().optional(),
  landSeparatePreviousYearTotalTax: z.number().int().nonnegative().optional(),

  /**
   * 조정대상지역 2주택 이상 여부 (구 §9①3호·§10② — 2022 귀속 이하에서만 유효)
   * 2023+ 연도 요청에서는 엔진이 무시 (주택 수 3 이상만 중과)
   * 미입력 시 false로 처리
   */
  isMultiHouseInAdjustedArea: z.boolean().optional(),

  /**
   * 계산 기준일 오버라이드 (테스트·소급 계산용)
   * YYYY-MM-DD 형식, 미입력 시 assessmentYear-06-01 사용
   */
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
}).refine(
  // §10의2 특례와 1세대1주택자는 상호배타 — 특례는 "1세대1주택자로 본다"는 의제이므로 중복 선언 불가
  (v) => !(v.isOneHouseOwner && v.isJointOwnershipSpecialCase),
  {
    message:
      "1세대1주택자와 부부 공동명의 특례(§10의2)는 동시에 선택할 수 없습니다. 부부 공동명의 1주택이면 특례만 선택하세요.",
    path: ["isJointOwnershipSpecialCase"],
  },
).refine(
  // C-15: 법인 조건부 세부유형(민간건설임대·도시개발·사회적기업·공익법인)은 요건 충족 여부 필수 (미응답 차단)
  (v) => {
    if ((v.taxpayerType ?? "individual") !== "corporate") return true;
    const reqKey = requiredCorporateReqKey(v.corporateHousingType ?? "general_corp");
    return reqKey === null || v[reqKey] !== undefined;
  },
  {
    message: "법인 세부 유형의 요건 충족 여부를 선택해주세요 (시행령 §4의4).",
    path: ["corporateHousingType"],
  },
).refine(
  // 종합합산: 집계 입력(landAggregate)과 필지 모드(landAggregateParcels) 상호배타
  (v) => !(v.landAggregate !== undefined && (v.landAggregateParcels?.length ?? 0) > 0),
  { message: "종합합산 토지는 집계 입력과 필지별 입력을 동시에 사용할 수 없습니다.", path: ["landAggregateParcels"] },
).refine(
  // 별도합산: 동일 상호배타
  (v) => !((v.landSeparate?.length ?? 0) > 0 && (v.landSeparateParcels?.length ?? 0) > 0),
  { message: "별도합산 토지는 집계 입력과 필지별 입력을 동시에 사용할 수 없습니다.", path: ["landSeparateParcels"] },
).refine(
  // 필지 모드 자동 세부담상한: priorOfficialPricePerSqm 전부-or-전무 (자동 안분 fallback 금지)
  (v) => {
    const check = (arr?: z.infer<typeof landParcelSchema>[]) => {
      if (!arr || arr.length === 0) return true;
      const withPrior = arr.filter((p) => p.priorOfficialPricePerSqm !== undefined && p.priorOfficialPricePerSqm > 0).length;
      return withPrior === 0 || withPrior === arr.length;
    };
    return check(v.landAggregateParcels) && check(v.landSeparateParcels);
  },
  { message: "직전연도 공시지가는 전 필지를 입력하거나 전부 비워야 합니다 (일부만 입력 불가).", path: ["landAggregateParcels"] },
).refine(
  // 주택 0채 허용(토지전용) 시 완전 빈 입력(주택 0 + 토지 0) 차단.
  //   변환(comprehensive-api.ts)이 토지 미보유 시 land 필드를 undefined/생략하므로 아래 판정이 정확.
  (v) =>
    v.properties.length > 0 ||
    v.landAggregate !== undefined ||
    (v.landSeparate?.length ?? 0) > 0 ||
    (v.landAggregateParcels?.length ?? 0) > 0 ||
    (v.landSeparateParcels?.length ?? 0) > 0,
  { message: "주택 또는 토지를 1건 이상 입력해주세요.", path: ["properties"] },
);
// (Phase B 통합 — comprehensive-prior-year-2step) refine ⑫ priorAssessedValue ↔
//   previousYearAuto.priorHouseValues 상호배타 제거: 직전공시 단일 입력원에서 변환이 둘 다
//   파생하므로 중복이 아님. dual-truth 방지는 변환의 단일 소스(priorAssessedValue)로 보장.

// ============================================================
// 타입 추론 Export
// ============================================================

export type ComprehensiveTaxInputSchema = z.infer<typeof comprehensiveTaxInputSchema>;
export type ComprehensivePropertySchema = z.infer<typeof comprehensivePropertySchema>;
export type AggregateLandSchema = z.infer<typeof aggregateLandSchema>;
export type SeparateLandItemSchema = z.infer<typeof separateLandItemSchema>;
