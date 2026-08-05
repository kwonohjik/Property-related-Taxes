/**
 * 재산세 입력 Zod 스키마 (P1-12)
 *
 * POST /api/calc/property 요청 본문 검증
 */

import { z } from "zod";

/**
 * 용도지역 코드 — 「지방세법 시행령」 제101조 제2항 [표] 구분.
 * 배율 정본 `lib/tax-engine/local-tax-zone-multiplier.ts`의 키와 일치해야 한다.
 */
const zoningDistrictSchema = z.enum([
  "exclusive_residential",
  "semi_residential",
  "commercial",
  "general_residential",
  "industrial",
  "green",
  "unplanned",
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

    /** 직전연도 공시가격 (원, 주택 과세표준상한제 §110③ 계산용 — 주택 전용) */
    priorYearPublishedPrice: z
      .number()
      .int({ message: "직전연도 공시가격은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "직전연도 공시가격은 0원 이상이어야 합니다." })
      .optional(),

    /** 주택 건축물 부분 시가표준액 (원, 주택 건물분 소방분 §146④ 단서 — 주택 전용) */
    housingBuildingValue: z
      .number()
      .int({ message: "주택 건축물 부분 시가표준액은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "주택 건축물 부분 시가표준액은 0원 이상이어야 합니다." })
      .optional(),

    /** 1세대 1주택 특례 여부 (주택 전용) */
    isOneHousehold: z.boolean().optional(),

    /** 도시지역 여부 */
    isUrbanArea: z.boolean().optional(),

    /** 건축물 유형 (objectType==="building" 시 유효) */
    buildingType: z
      .enum(["general", "golf_course", "luxury", "factory"])
      .optional(),

    /** 선박 유형 (objectType==="vessel" 시 유효) — 고급선박 §111①4호 가목(5%)·§13⑤5호 */
    vesselType: z
      .enum(["general", "luxury"])
      .optional(),

    /** 화재위험 건축물 등급 — 소방분 중과(§146③2호·2의2호, objectType==="building" 시 유효) */
    fireHazardClass: z
      .enum(["none", "fire_hazard", "large_fire_hazard"])
      .optional(),

    /** 전년도 재산세 납부세액 (원, 세부담상한 계산용) */
    previousYearTax: z
      .number()
      .int({ message: "전년도 납부세액은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "전년도 납부세액은 0원 이상이어야 합니다." })
      .optional(),

    /** 직전연도 과세표준 (원) — recompute 모드(§118 본문) 직전 세율 재산정용 */
    previousYearTaxBase: z
      .number()
      .int({ message: "직전연도 과세표준은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "직전연도 과세표준은 0원 이상이어야 합니다." })
      .optional(),

    /** [부칙 제15조] 직전연도 주택 본세 (원) — 주택 세부담상한 경과조치용 (housing 전용) */
    previousYearHousingBaseTax: z
      .number()
      .int({ message: "직전연도 본세는 원 단위 정수여야 합니다." })
      .nonnegative({ message: "직전연도 본세는 0원 이상이어야 합니다." })
      .optional(),

    /** [부칙 제15조 v2] 직전연도 주택 도시지역분 (원) — 도시지역분 세부담상한(§118 본문) (housing 전용) */
    previousYearHousingUrbanTax: z
      .number()
      .int({ message: "직전연도 도시지역분은 원 단위 정수여야 합니다." })
      .nonnegative({ message: "직전연도 도시지역분은 0원 이상이어야 합니다." })
      .optional(),

    /** 세부담상한 모드 — direct(직접입력) | recompute(과세표준 재산정) */
    taxCapMode: z.enum(["direct", "recompute"]).optional(),

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

    /**
     * 납세의무자(지방세법 §107) 판정 입력 — 선택.
     * 미입력 시 납세의무자 판정 생략(계산 100% 불변).
     * TS 미감지 strip 주의 — grep 자가 점검 필수.
     */
    taxpayerInfo: z
      .object({
        /** 공부상 소유자 식별자 (§107②1호 fallback) */
        registeredOwner: z.string().min(1, { message: "공부상 소유자를 입력하세요." }),
        /** 사실상 소유자 — 공부와 불일치 시 납세의무자(§107①본문) */
        actualOwner: z.string().optional(),
        /** 신탁재산 여부 (§107②5호) */
        isTrust: z.boolean().optional(),
        /** 신탁 유형 */
        trustType: z.enum(["self", "other"]).optional(),
        /** 위탁자(신탁 설정자) */
        settlor: z.string().optional(),
        /** 상속 미등기 여부 (§107②2호) */
        isInheritanceUnregistered: z.boolean().optional(),
        /** 상속인 목록 (§107②2호 주된 상속자 판정 — 성명·지분·생년) */
        heirs: z
          .array(
            z.object({
              name: z.string().min(1),
              shareRatio: z.number().positive().max(1).optional(),
              birthDate: z.string().optional(),
            }),
          )
          .optional(),
        /** 공유 지분 목록 (§107①1호) */
        coOwnershipShares: z
          .array(
            z.object({
              ownerId: z.string().min(1),
              shareRatio: z.number().positive().max(1),
            }),
          )
          .optional(),
        // ── 기타 6종 §107 ──
        /** 종중재산 미신고 여부 (§107②3호) — 공부상 소유자가 납세의무자 */
        isClanProperty: z.boolean().optional(),
        /** 연부 매수계약자 식별자 (§107②4호) */
        installmentBuyer: z.string().optional(),
        /** 환지 체비지·보류지 사업시행자 식별자 (§107②6호) */
        projectOperator: z.string().optional(),
        /** 외국인 항공기·선박 수입자 식별자 (§107②7호) */
        importer: z.string().optional(),
        /** 파산재단 여부 (§107②8호) — 공부상 소유자가 납세의무자 */
        isBankruptcyEstate: z.boolean().optional(),
        /** 소유권 귀속 불명 시 사용자 식별자 (§107③) */
        ownershipUnclearUser: z.string().optional(),
        // ── §107①2호: 주택 건물·부속토지 소유자 분리 ──
        /** 건물·부속토지 소유자 분리 여부 (§107①2호, housing 전용) */
        isHouseSplit: z.boolean().optional(),
        /** 건물 소유자 식별자 */
        buildingOwner: z.string().optional(),
        /** 부속토지 소유자 식별자 */
        landOwner: z.string().optional(),
        /** 부속토지 시가표준액 (원, §4①) */
        landStdValue: z.number().nonnegative().optional(),
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
    // vesselType은 objectType==="vessel" 일 때만 유효 (고급선박 §111①4호 가목)
    if (data.vesselType && data.objectType !== "vessel") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vesselType"],
        message: "vesselType은 objectType이 'vessel'일 때만 사용합니다.",
      });
    }
    // fireHazardClass는 objectType==="building" 일 때만 유효 (화재위험 중과 §146③2호·2의2호)
    if (
      data.fireHazardClass &&
      data.fireHazardClass !== "none" &&
      data.objectType !== "building"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fireHazardClass"],
        message: "fireHazardClass는 objectType이 'building'일 때만 적용됩니다.",
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
    // priorYearPublishedPrice는 objectType==="housing" 일 때만 유효 (과세표준상한제 §110③)
    if (data.priorYearPublishedPrice != null && data.objectType !== "housing") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priorYearPublishedPrice"],
        message: "priorYearPublishedPrice는 objectType이 'housing'일 때만 적용됩니다.",
      });
    }
    // housingBuildingValue는 objectType==="housing" 일 때만 유효 (건물분 소방분 §146④ 단서)
    if (data.housingBuildingValue != null && data.objectType !== "housing") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["housingBuildingValue"],
        message: "housingBuildingValue는 objectType이 'housing'일 때만 적용됩니다.",
      });
    }
    // previousYearHousingBaseTax는 objectType==="housing" 일 때만 유효 (부칙 제15조 경과조치)
    if (data.previousYearHousingBaseTax != null && data.objectType !== "housing") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousYearHousingBaseTax"],
        message: "previousYearHousingBaseTax는 objectType이 'housing'일 때만 적용됩니다.",
      });
    }
    // previousYearHousingUrbanTax는 objectType==="housing" 일 때만 유효 (부칙 제15조 v2 도시지역분 §118 본문)
    if (data.previousYearHousingUrbanTax != null && data.objectType !== "housing") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousYearHousingUrbanTax"],
        message: "previousYearHousingUrbanTax는 objectType이 'housing'일 때만 적용됩니다.",
      });
    }
    // 도시지역분 세부담상한(v2)은 본세 세부담상한과 함께만 입력 — 본세 미적용+도시만 적용 경로 차단(echo 일관, UI validate 미러링)
    if (
      data.previousYearHousingUrbanTax != null &&
      data.previousYearHousingBaseTax == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousYearHousingUrbanTax"],
        message: "도시지역분 세부담상한은 직전연도 본세(previousYearHousingBaseTax)와 함께 입력해야 합니다.",
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
