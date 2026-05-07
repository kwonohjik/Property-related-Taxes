/**
 * 양도소득세 Zod superRefine 공통 검증 헬퍼
 * transfer-tax-schema-sub.ts 800줄 정책에 따라 분리 (2026-05-08).
 */

import { z } from "zod";

/**
 * propertySchema.superRefine 에 주입되는 공통 검증 로직.
 * 단건·다건 스키마 모두 재사용.
 */
export function addPropertyRefines(
  data: {
    propertyType?: string;
    useEstimatedAcquisition: boolean;
    standardPriceAtAcquisition?: number;
    standardPriceAtTransfer?: number;
    acquisitionDate: string;
    transferDate: string;
    acquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
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
    /** 검용주택 PHD — mixedUse.preHousingDisclosure 위치 */
    mixedUse?: { preHousingDisclosure?: unknown };
    /** ⑩ 상업용건물·오피스텔 환산취득가 서브객체 — era별 필수 필드 검증 */
    commercialBuildingValuation?: Record<string, unknown> | null;
  },
  ctx: z.RefinementCtx,
) {
  // §164⑤ PHD 경로: 3-시점 입력으로 기준시가 자동 도출되므로 standardPriceAt* 불요
  // 검용주택 모드는 calcMixedUseTransferTax 별도 엔진에서 처리 → 일반 환산 검증 우회
  const hasPhd =
    (data.preHousingDisclosure !== undefined && data.preHousingDisclosure !== null) ||
    (data.mixedUse?.preHousingDisclosure !== undefined && data.mixedUse?.preHousingDisclosure !== null);
  const isMixedUseHouse = data.propertyType === "mixed-use-house";
  // 상업용건물 환산 모드는 commercialBuildingValuation 서브객체로 처리 → 표준 기준시가 검증 우회
  const isCommercialBuildingEstimated = !!data.commercialBuildingValuation;
  if (!isMixedUseHouse && !isCommercialBuildingEstimated && data.useEstimatedAcquisition && !data.standardPriceAtAcquisition && !hasPhd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["standardPriceAtAcquisition"],
      message: "환산취득가 사용 시 취득시 기준시가 필수",
    });
  }
  if (!isMixedUseHouse && !isCommercialBuildingEstimated && data.useEstimatedAcquisition && !data.standardPriceAtTransfer && !hasPhd) {
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
      message: "연간 기본공제 한도(2,500,000)를 초과할 수 없습니다",
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
  // ⑩ 상업용건물·오피스텔 환산취득가 era별 필수 필드 검증 (API 직접 호출 방어선)
  if (data.commercialBuildingValuation) {
    const cbv = data.commercialBuildingValuation;
    // era 무관 공통 필수: 취득시 개별공시지가
    if (!cbv.landPriceAtAcquisition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commercialBuildingValuation", "landPriceAtAcquisition"],
        message: "취득시 개별공시지가 필수",
      });
    }
    // pre_disclosure 전용 필수 필드
    if (cbv.isPreDisclosure === true) {
      if (!cbv.buildingStdPriceAtAcquisition) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["commercialBuildingValuation", "buildingStdPriceAtAcquisition"],
          message: "호별고시 전 취득: 취득시 건물 ㎡당 기준시가 필수",
        });
      }
      if (!cbv.buildingStdPriceAtFirstDisclosure) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["commercialBuildingValuation", "buildingStdPriceAtFirstDisclosure"],
          message: "호별고시 전 취득: 최초고시시(2005) 건물 ㎡당 기준시가 필수",
        });
      }
      if (!cbv.buildingStdPriceAtTransfer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["commercialBuildingValuation", "buildingStdPriceAtTransfer"],
          message: "호별고시 전 취득: 양도시 건물 ㎡당 기준시가 필수",
        });
      }
      if (!cbv.landPriceAtFirstDisclosure) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["commercialBuildingValuation", "landPriceAtFirstDisclosure"],
          message: "호별고시 전 취득: 최초고시시(2005) 개별공시지가 필수",
        });
      }
      if (!cbv.unitPriceAtFirstDisclosure) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["commercialBuildingValuation", "unitPriceAtFirstDisclosure"],
          message: "호별고시 전 취득: 최초고시(2005) ㎡당 호별고시가 필수",
        });
      }
    }
    // post_disclosure 전용 필수 필드
    if (cbv.isPreDisclosure === false) {
      if (!cbv.unitPriceAtAcquisition) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["commercialBuildingValuation", "unitPriceAtAcquisition"],
          message: "호별고시 후 취득: 취득시 ㎡당 호별고시가 필수",
        });
      }
    }
  }
}
