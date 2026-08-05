/**
 * 양도소득세 Zod superRefine 공통 검증 헬퍼
 * transfer-tax-schema-sub.ts 800줄 정책에 따라 분리 (2026-05-08).
 */

import { z } from "zod";
import { isPhdEligible } from "@/lib/calc/phd-eligibility";

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
    acquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction" | "burdened_gift";
    decedentAcquisitionDate?: string;
    donorAcquisitionDate?: string;
    annualBasicDeductionUsed?: number;
    acquisitionMethod?: "actual" | "estimated" | "appraisal" | "salesCase";
    appraisalValue?: number;
    similarSalesValue?: number;
    isSelfBuilt?: boolean;
    buildingType?: "new" | "extension";
    extensionFloorArea?: number;
    constructionDate?: string;
    /** §164⑤ PHD 입력 — 제공 시 standardPriceAt* 필수 검증 우회 + §164⑦ 취득일 게이트 */
    preHousingDisclosure?: { firstDisclosureDate?: string } | null;
    /** ⑩ 비주택 → 주택 용도변경(§95⑥) — 주거용 사용 개시일의 취득일·양도일 사이 검증 */
    nonHousingToHousingConversion?: { residentialUseStartDate: string } | null;
    /** 이월과세(§97의2) — PHD 게이트 비교일 = 증여자 취득일 */
    carryoverTaxation?: { donorAcquisitionDate?: string } | null;
    /** 겸용주택 PHD — mixedUse.preHousingDisclosure 위치 (동일 §164⑦ 게이트 적용) */
    mixedUse?: { preHousingDisclosure?: { firstDisclosureDate?: string } | null };
    /** ⑩ 상업용건물·오피스텔 환산취득가 서브객체 — era별 필수 필드 검증 */
    commercialBuildingValuation?: Record<string, unknown> | null;
    /** ⑩ 일반건물(토지+건물 일괄) 환산취득가 서브객체 — base 스키마 positive() 제약으로 충분 */
    generalBuildingValuation?: Record<string, unknown> | null;
    /** ⑩ 재개발/재건축 환산취득가 서브객체 (시행령 §166③) — base 스키마 nonnegative()로 충분 */
    redevelopment?: Record<string, unknown> | null;
    /** 축 B 파트별 독립(§99①1호 나목) — 제공 시 결합 총액 검증 우회 */
    buildingStandardPriceAtAcquisition?: number;
  },
  ctx: z.RefinementCtx,
) {
  // §164⑤ PHD 경로: 3-시점 입력으로 기준시가 자동 도출되므로 standardPriceAt* 불요
  // 겸용주택 모드는 calcMixedUseTransferTax 별도 엔진에서 처리 → 일반 환산 검증 우회
  const hasPhd =
    (data.preHousingDisclosure !== undefined && data.preHousingDisclosure !== null) ||
    (data.mixedUse?.preHousingDisclosure !== undefined && data.mixedUse?.preHousingDisclosure !== null);
  const isMixedUseHouse = data.propertyType === "mixed-use-house";
  // 상업용건물/일반건물/재개발 환산 모드는 서브객체로 처리 → 표준 기준시가 검증 우회
  const isCommercialBuildingEstimated = !!data.commercialBuildingValuation;
  const isGeneralBuildingEstimated = !!data.generalBuildingValuation;
  const isRedevelopmentEstimated = !!data.redevelopment;
  const isSubObjectEstimated = isCommercialBuildingEstimated || isGeneralBuildingEstimated || isRedevelopmentEstimated;
  // 축 B 파트별 독립(building + 별개 취득): 토지분은 ㎡당 공시지가 × 면적(§99①1호 가목),
  // 건물분은 나목 명시 입력으로 산출한다 → **결합 총액이 애초에 공시되지 않으므로** 필수가 아니다.
  const hasIndependentAcqStd = !!data.buildingStandardPriceAtAcquisition;
  if (!isMixedUseHouse && !isSubObjectEstimated && data.useEstimatedAcquisition && !data.standardPriceAtAcquisition && !hasPhd && !hasIndependentAcqStd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["standardPriceAtAcquisition"],
      message: "환산취득가 사용 시 취득시 기준시가 필수",
    });
  }
  if (!isMixedUseHouse && !isSubObjectEstimated && data.useEstimatedAcquisition && !data.standardPriceAtTransfer && !hasPhd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["standardPriceAtTransfer"],
      message: "환산취득가 사용 시 양도시 기준시가 필수",
    });
  }
  // §164⑦ 적용가능 게이트 — 취득일(의제 1985-01-01 반영·이월과세는 증여자 취득일) ≥ 최초고시일이면
  // 취득당시 고시분 존재 → 3-시점 환산 대상 아님 (isPhdEligible 단일 소스 — validate ⑧과 동일 게이트)
  const phdFirstDate =
    data.preHousingDisclosure?.firstDisclosureDate ??
    data.mixedUse?.preHousingDisclosure?.firstDisclosureDate;
  if (phdFirstDate) {
    const phdCompareDate =
      data.acquisitionCause === "carryover_gift"
        ? (data.carryoverTaxation?.donorAcquisitionDate ?? "")
        : data.acquisitionDate;
    if (!isPhdEligible(phdCompareDate, phdFirstDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preHousingDisclosure", "firstDisclosureDate"],
        message:
          "취득일(이월과세는 증여자 취득일, 의제취득일 1985-01-01 반영)이 최초 고시일 이후 — 취득당시 주택공시가격이 고시되어 있어 3-시점 환산(§164⑦) 대상이 아닙니다",
      });
    }
  }
  if (data.acquisitionDate >= data.transferDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acquisitionDate"],
      message: "취득일은 양도일보다 이전이어야 합니다",
    });
  }
  // ⑩ 비주택 → 주택 용도변경 (§95⑥) — 주거용 사용 개시일은 취득일과 양도일 **사이**여야 한다.
  // 범위를 벗어나면 기간을 비주택/주택으로 나눌 수 없어 엔진이 TaxCalculationError를 던진다
  // (계획 C-8·C-9). 400으로 먼저 돌려주는 편이 낫다.
  if (data.nonHousingToHousingConversion) {
    const start = data.nonHousingToHousingConversion.residentialUseStartDate;
    if (start <= data.acquisitionDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nonHousingToHousingConversion", "residentialUseStartDate"],
        message: "주거용 사용 개시일은 취득일보다 이후여야 합니다",
      });
    }
    if (start >= data.transferDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nonHousingToHousingConversion", "residentialUseStartDate"],
        message: "주거용 사용 개시일은 양도일보다 이전이어야 합니다",
      });
    }
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
  // ⑩ 매매사례가액 추계(§176의2③1호) — salesCase 모드 시 similarSalesValue 필수
  if (data.acquisitionMethod === "salesCase" && !data.similarSalesValue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["similarSalesValue"],
      message: "매매사례가액 추계 방식 선택 시 매매사례가액을 입력하세요",
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
  // ⑩ 일반건물(토지+건물 일괄) 환산취득가 교차 검증 (base 스키마 positive() 제약으로 충분)
  if (data.generalBuildingValuation) {
    const gbv = data.generalBuildingValuation;
    // 모든 필드는 base 스키마에서 positive()로 정의됨.
    // 추가 교차 검증: 현재는 base 스키마 충분. 향후 교차 검증 필요 시 여기에 추가.
    void gbv; // 타입 참조 유지
  }
  // ⑩ 사례 39 — 단독주택 출자 §164⑤ PHD 2-point 환산취득가 필수 검증
  // 분기 활성 조건: originalAssetType="housing" + subject="right" + useEstimated=true
  // 3중 패턴(UI/API/validate) 동기화 — UI 통과 ↔ validate 차단 모순 방지
  if (data.redevelopment) {
    const rd = data.redevelopment as Record<string, unknown>;
    const isHousingEstimated =
      rd.originalAssetType === "housing" &&
      rd.subject === "right" &&
      (data as Record<string, unknown>).useEstimatedAcquisition === true;
    if (isHousingEstimated) {
      if (!rd.housingStdPriceAtAcq || (rd.housingStdPriceAtAcq as number) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redevelopment", "housingStdPriceAtAcq"],
          message: "단독주택 출자 환산취득가 — 취득당시 개별주택가격(§164⑤ 분자) 필수",
        });
      }
      if (!rd.housingStdPriceAtApproval || (rd.housingStdPriceAtApproval as number) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redevelopment", "housingStdPriceAtApproval"],
          message: "단독주택 출자 환산취득가 — 인가당시 부근 개별주택가격(§164⑤ 분모) 필수",
        });
      }
    }
  }
}
