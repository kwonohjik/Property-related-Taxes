/**
 * 별도합산과세대상 토지 입력 Zod 스키마 (P4-03)
 *
 * 주요 검증 규칙:
 * - demolished === true 시 demolishedDate 필수
 * - demolishedDate는 YYYY-MM-DD 형식
 * - buildingFloorArea > 0 이어야 별도합산 판정 가능
 * - landArea > 0 필수
 * - previousYearTax 미입력 허용 (세부담상한 생략)
 */

import { z } from "zod";

/** 용도지역 코드 (지방세법 시행령 §101②1호 배율 맵과 일치) */
const zoningDistrictSchema = z.enum([
  "commercial",      // 상업지역 3배
  "industrial",      // 공업지역 4배
  "residential",     // 주거지역 5배
  "green",           // 녹지지역 5배
  "management",      // 관리지역 5배
  "agricultural",    // 농림지역 7배
  "nature_preserve", // 자연환경보전지역 7배
]);

/** 단일 필지 별도합산 입력 스키마 */
export const separateAggregateLandSchema = z
  .object({
    /** 필지 식별자 (납세자 내 고유값) */
    id: z.string().min(1, { message: "필지 식별자는 필수입니다." }),

    /** 관할 지자체 코드 (예: "11110" — 서울 종로구) */
    jurisdictionCode: z
      .string()
      .min(5, { message: "지자체 코드는 5자리 이상이어야 합니다." }),

    /** 토지 면적 (㎡, 양의 실수) */
    landArea: z
      .number()
      .positive({ message: "토지 면적은 0㎡ 초과여야 합니다." }),

    /** 개별공시지가 (원/㎡, 양의 정수) */
    officialLandPrice: z
      .number()
      .int({ message: "공시지가는 원 단위 정수여야 합니다." })
      .positive({ message: "공시지가는 0원 초과여야 합니다." }),

    /** 용도지역 (지방세법 시행령 §101②1호 배율 결정) */
    zoningDistrict: zoningDistrictSchema,

    /** 건축물 바닥면적 (㎡) — 기준면적 = 바닥면적 × 배율 */
    buildingFloorArea: z
      .number()
      .nonnegative({ message: "건축물 바닥면적은 0㎡ 이상이어야 합니다." })
      .optional(),

    /** 공장용지 여부 (별도합산 기준면적: 공장입지기준면적 이내) */
    isFactory: z.boolean().optional(),

    /** 공장입지기준면적 (㎡) — isFactory===true 시 기준면적으로 사용 */
    factoryStandardArea: z
      .number()
      .positive({ message: "공장입지기준면적은 0㎡ 초과여야 합니다." })
      .optional(),

    /**
     * 철거 여부 (지방세법 시행령 §101③ — 철거 후 6개월 이내 별도합산 유지 특례)
     * true 시 demolishedDate 필수
     */
    demolished: z.boolean().optional(),

    /**
     * 철거일 (YYYY-MM-DD)
     * demolished === true 시 반드시 입력
     */
    demolishedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "철거일은 YYYY-MM-DD 형식이어야 합니다.",
      })
      .optional(),

    /** 과세기준일 (YYYY-MM-DD, 기본: 당해년도 6월 1일) */
    taxBaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "과세기준일은 YYYY-MM-DD 형식이어야 합니다.",
      })
      .optional(),
    // previousYearTax는 필지 단위가 아닌 separateAggregateInputSchema 최상위에만 존재 (M-08)
  })
  .superRefine((data, ctx) => {
    // 철거 시 철거일 필수
    if (data.demolished === true && !data.demolishedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["demolishedDate"],
        message: "건축물 철거(demolished=true) 시 철거일(demolishedDate)은 필수입니다.",
      });
    }

    // 철거일이 있는데 demolished=false(또는 미입력)인 경우 경고
    if (data.demolishedDate && !data.demolished) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["demolished"],
        message: "철거일(demolishedDate)이 입력된 경우 demolished는 true여야 합니다.",
      });
    }

    // 공장용지인데 공장입지기준면적 미입력 경고 (오류는 아님 — fallback으로 바닥면적×4 사용)
    if (data.isFactory && !data.factoryStandardArea && !data.buildingFloorArea) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["factoryStandardArea"],
        message: "공장용지(isFactory=true)의 경우 공장입지기준면적 또는 건축물 바닥면적 중 하나는 입력해야 합니다.",
      });
    }
  });

/** 별도합산 계산 전체 입력 스키마 */
export const separateAggregateInputSchema = z.object({
  /** 납세자 식별자 */
  taxpayerId: z.string().min(1, { message: "납세자 식별자는 필수입니다." }),

  /** 과세연도 (예: 2025) */
  targetYear: z
    .number()
    .int()
    .min(2000)
    .max(2100),

  /** 전국 보유 별도합산 대상 토지 목록 (1개 이상) */
  landList: z
    .array(separateAggregateLandSchema)
    .min(1, { message: "토지 목록은 1개 이상이어야 합니다." }),

  /** 전년도 별도합산 세액 (세부담상한 계산용, 없으면 상한 미적용) */
  previousYearTax: z
    .number()
    .int()
    .nonnegative()
    .optional(),
});

export type SeparateAggregateLandInput = z.infer<typeof separateAggregateLandSchema>;
export type SeparateAggregateInput = z.infer<typeof separateAggregateInputSchema>;
export type ZoningDistrict = z.infer<typeof zoningDistrictSchema>;
