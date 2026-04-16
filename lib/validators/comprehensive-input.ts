/**
 * 종합부동산세 입력 Zod 스키마 (T-04)
 *
 * POST /api/calc/comprehensive 요청 본문 검증
 * 종합부동산세법 §8~§15 기반 입력 유효성 검사
 */

import { z } from "zod";

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

export const comprehensivePropertySchema = z.object({
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

  /** 임대주택 합산배제 상세 정보 */
  rentalInfo: rentalExclusionInfoSchema.optional(),

  /** 기타 합산배제 상세 정보 */
  otherInfo: otherExclusionInfoSchema.optional(),
});

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
// 종합부동산세 전체 입력 스키마 (메인)
// ============================================================

export const comprehensiveTaxInputSchema = z.object({
  /**
   * 보유 주택 목록 (1건 이상 필수)
   * 합산배제 신청 주택 포함
   */
  properties: z
    .array(comprehensivePropertySchema)
    .min(1, { message: "주택 정보를 1건 이상 입력해주세요." }),

  /**
   * 1세대1주택자 여부
   * - true: 기본공제 12억, 세액공제(고령자·장기보유) 적용
   * - false: 기본공제 9억
   */
  isOneHouseOwner: z.boolean(),

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
   * 조정대상지역 2주택+ 여부 (세부담 상한 300% 적용)
   * false 또는 미입력 시 150% 적용
   */
  isMultiHouseInAdjustedArea: z.boolean().optional(),

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

  /**
   * 계산 기준일 오버라이드 (테스트·소급 계산용)
   * YYYY-MM-DD 형식, 미입력 시 assessmentYear-06-01 사용
   */
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// ============================================================
// 타입 추론 Export
// ============================================================

export type ComprehensiveTaxInputSchema = z.infer<typeof comprehensiveTaxInputSchema>;
export type ComprehensivePropertySchema = z.infer<typeof comprehensivePropertySchema>;
export type AggregateLandSchema = z.infer<typeof aggregateLandSchema>;
export type SeparateLandItemSchema = z.infer<typeof separateLandItemSchema>;
