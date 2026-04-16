/**
 * 재산세 입력 Zod 스키마 (P1-12)
 *
 * POST /api/calc/property 요청 본문 검증
 */

import { z } from "zod";

const zoningDistrictSchema = z.enum([
  "commercial",
  "industrial",
  "residential",
  "green",
  "management",
  "agricultural",
  "nature_preserve",
]);

export const propertyTaxInputSchema = z
  .object({
    /** 물건 유형 (지방세법 §104) */
    objectType: z.enum(["housing", "land", "building", "vessel", "aircraft"]),

    /** 공시가격 (원, 양의 정수) */
    publishedPrice: z
      .number()
      .int({ message: "공시가격은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "공시가격은 0원 이상이어야 합니다." }),

    /** 1세대 1주택 특례 여부 (주택 전용) */
    isOneHousehold: z.boolean().optional(),

    /** 도시지역 여부 */
    isUrbanArea: z.boolean().optional(),

    /** 건축물 유형 (objectType==="building" 시 유효) */
    buildingType: z
      .enum(["general", "golf_course", "luxury", "factory"])
      .optional(),

    /** 전년도 재산세 납부세액 (원, 세부담상한 계산용) */
    previousYearTax: z
      .number()
      .int({ message: "전년도 납부세액은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "전년도 납부세액은 0원 이상이어야 합니다." })
      .optional(),

    /** 계산 기준일 (YYYY-MM-DD) */
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "targetDate는 YYYY-MM-DD 형식이어야 합니다.",
      })
      .optional(),

    /**
     * 토지 과세 유형 (objectType==="land" 시 필수)
     * - comprehensive_aggregate: 종합합산 (§106①1호)
     * - separate_aggregate: 별도합산 (§106①2호)
     * - separated: 분리과세 (§106①3호)
     */
    landTaxType: z
      .enum(["comprehensive_aggregate", "separate_aggregate", "separated"])
      .optional(),

    /**
     * 별도합산 단일 필지 데이터 (landTaxType==="separate_aggregate" 시 필수)
     * 지방세법 §106①2호, 시행령 §101
     */
    separateAggregateItem: z
      .object({
        id: z.string(),
        jurisdictionCode: z.string(),
        landArea: z.number().positive({ message: "토지 면적은 0보다 커야 합니다." }),
        officialLandPrice: z
          .number()
          .nonnegative({ message: "개별공시지가는 0 이상이어야 합니다." }),
        zoningDistrict: zoningDistrictSchema,
        buildingFloorArea: z.number().positive().optional(),
        isFactory: z.boolean().optional(),
        factoryStandardArea: z.number().positive().optional(),
        demolished: z.boolean().optional(),
        demolishedDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, {
            message: "철거일은 YYYY-MM-DD 형식이어야 합니다.",
          })
          .optional(),
      })
      .optional(),

    /**
     * 분리과세 판정 입력 (landTaxType==="separated" 시 사용)
     * assessedValue는 publishedPrice에서 자동 설정됨
     * 지방세법 §106①3호, 시행령 §102
     */
    separateTaxationItem: z
      .object({
        landCategory: z.string().optional(),
        actualUsage: z.string().optional(),
        isFarmland: z.boolean().optional(),
        isLivestockFarm: z.boolean().optional(),
        isProtectedForest: z.boolean().optional(),
        isFactoryLand: z.boolean().optional(),
        factoryLocation: z.enum(["industrial_zone", "urban", "other"]).optional(),
        isSaltField: z.boolean().optional(),
        isTerminalOrParking: z.boolean().optional(),
        isGolfCourse: z.boolean().optional(),
        golfCourseType: z.enum(["member", "public", "simple"]).optional(),
        isHighClassEntertainment: z.boolean().optional(),
        area: z.number().optional(),
        ownerType: z.enum(["individual", "corporation"]).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    // buildingType은 objectType==="building" 일 때만 유효
    if (data.buildingType && data.objectType !== "building") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["buildingType"],
        message: "buildingType은 objectType이 'building'일 때만 사용합니다.",
      });
    }
    // isOneHousehold는 objectType==="housing" 일 때만 유효
    if (data.isOneHousehold && data.objectType !== "housing") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isOneHousehold"],
        message: "isOneHousehold는 objectType이 'housing'일 때만 적용됩니다.",
      });
    }
    // landTaxType은 objectType==="land" 일 때 필수
    if (data.objectType === "land" && !data.landTaxType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["landTaxType"],
        message:
          "토지(land) 계산 시 landTaxType이 필요합니다: " +
          "'comprehensive_aggregate' | 'separate_aggregate' | 'separated'",
      });
    }
    // separateAggregateItem은 landTaxType==="separate_aggregate" 시 필수
    if (data.landTaxType === "separate_aggregate" && !data.separateAggregateItem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["separateAggregateItem"],
        message:
          "별도합산(separate_aggregate) 계산 시 separateAggregateItem이 필요합니다.",
      });
    }
  });

export type PropertyTaxInputDto = z.infer<typeof propertyTaxInputSchema>;
