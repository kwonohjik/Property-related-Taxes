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

/**
 * 용도지역 코드 — 「지방세법 시행령」 제101조 제2항 [표] 구분.
 * 배율 정본 `lib/tax-engine/local-tax-zone-multiplier.ts`의 키와 일치해야 한다.
 *
 * 주거지역은 전용(5배)·일반(4배)·준주거(3배)가 모두 달라 통합 키를 허용하지 않는다.
 */
const zoningDistrictSchema = z.enum([
  "exclusive_residential", // 전용주거지역 5배
  "semi_residential",      // 준주거지역 3배
  "commercial",            // 상업지역 3배
  "general_residential",   // 일반주거지역 4배
  "industrial",            // 공업지역 4배
  "green",                 // 녹지지역 7배
  "unplanned",             // 미계획지역 4배
  "management",            // 관리지역 (도시지역 외) 7배
  "agricultural",          // 농림지역 (도시지역 외) 7배
  "nature_preserve",       // 자연환경보전지역 (도시지역 외) 7배
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

    /** 용도지역 (지방세법 시행령 §101② 적용배율 결정) */
    zoningDistrict: zoningDistrictSchema,

    /** 건축물 바닥면적 (㎡) — 기준면적 = 바닥면적 × 배율 */
    buildingFloorArea: z
      .number()
      .nonnegative({ message: "건축물 바닥면적은 0㎡ 이상이어야 합니다." })
      .optional(),

    /** 공장용지 여부 (지방세법 시행령 §101①1호) */
    isFactory: z.boolean().optional(),

    /**
     * @deprecated 별도합산 기준면적에 쓰이지 않는다(2026-08-05 정정).
     * 공장입지기준면적은 「지방세법 시행령」 §102①1호(**분리과세**) 한도이고,
     * §101①1호(별도합산) 본문에는 그 개념이 없다. 하위 호환을 위해 필드만 남긴다.
     */
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

    // 공장용지도 별도합산 기준면적은 §101①1호 본칙(바닥면적 × §101② 적용배율)이다.
    // 공장입지기준면적(별표6)은 §102①1호 **분리과세** 한도라 여기서 대체 입력이 될 수 없다(2026-08-05 정정).
    if (data.isFactory && !data.buildingFloorArea) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["buildingFloorArea"],
        message:
          "공장용지(isFactory=true)도 건축물 바닥면적(㎡)이 필요합니다. " +
          "별도합산 기준면적은 「지방세법 시행령」 제101조 제1항 제1호에 따라 바닥면적 × 같은 조 제2항 적용배율로 산정합니다.",
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
