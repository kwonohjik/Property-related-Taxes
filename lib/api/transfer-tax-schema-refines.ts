/**
 * 양도소득세 Zod superRefine 공통 검증 헬퍼
 * transfer-tax-schema-sub.ts 800줄 정책에 따라 분리 (2026-05-08).
 */

import { z } from "zod";
import { isPhdEligible } from "@/lib/calc/phd-eligibility";
import { toDate } from "@/lib/api/date-coerce";
import { maxPriorResidenceMonthsBetween } from "@/lib/tax-engine/one-house/gift-household-basis";

import { refineRedevelopment166_3Inputs } from "./transfer-tax-schema-redev-166-3-refines";
import { refineReductionRequiredInputs } from "./transfer-tax-schema-reduction-refines";
import { refineMixedUseBurdenedGift } from "./transfer-tax-schema-mixed-bg-refines";
import { refineMixedUseInheritedSplitDate } from "./transfer-tax-schema-mixed-bg-refines";
import { refineDonorBuiltOuter, type DonorBuiltWire } from "./transfer-tax-schema-donor-built";
import { refineSelfBuiltHousing, isSeparatedLike } from "./transfer-tax-schema-self-built-housing";
/**
 * Q-1(D15) — 미등기 + 자경농지 감면(조특법 §69) 동시 입력 거부.
 *
 * 조특법 §129②는 미등기양도자산의 감면을 끄지만, 자경농지 토지는 애초에 미등기양도자산이
 * 아니다(소득세법 시행령 §168①3호) — 모순 입력이다. ⑧ `validateStep2Reductions`와 같은 조건.
 * 주 자산(`addPropertyRefines`)과 컴패니언(`transfer-tax-schema.ts` 일괄양도 루프)이 공용한다.
 */
export function refineUnregisteredSelfFarming(
  isUnregistered: boolean | undefined,
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  if (isUnregistered !== true) return;
  if (!(reductions ?? []).some((r) => r.type === "self_farming")) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: "자경농지 감면 대상 토지는 미등기양도자산이 아닙니다(소득세법 시행령 §168①3호) — 미등기와 자경농지 감면을 함께 보낼 수 없습니다",
  });
}

/**
 * F-7 — 컴패니언 일반건물은 자산 단일 `isUnregistered`를 쓰지 않는다.
 *
 * GB 분기(`bundled-split-helpers.ts`)는 `generalBuildingValuation.unregisteredLand`·
 * `unregisteredBuilding` 2축만 읽는다. 단일 값을 받아 주면 70%가 **조용히 빠진다** — 거부한다.
 * ⑧ `validateAssetEntry`와 같은 조건(축 B는 이 배열을 쓰지 않는다).
 */
export function refineCompanionGbUnregisteredAxis(
  c: { assetKind?: string; isUnregistered?: boolean },
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  if (c.assetKind !== "general_building" || c.isUnregistered !== true) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: "일반건물 컴패니언의 미등기는 generalBuildingValuation.unregisteredLand·unregisteredBuilding으로 보내야 합니다 — isUnregistered는 계산에 쓰이지 않습니다",
  });
}

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
    /** 양도 형태 — 겸용주택 × 부담부증여 판정용 */
    transferType?: string;
    /** 겸용주택 × 부담부증여 판정 입력(`refineMixedUseBurdenedGift`) */
    ownershipRatio?: number;
    burdenedGiftInfo?: unknown;
    companionAssets?: ReadonlyArray<unknown>;
    decedentAcquisitionDate?: string;
    donorAcquisitionDate?: string;
    giftSameHouseholdContinuous?: boolean;
    giftHouseholdHoldingStartDate?: string;
    giftPriorHouseholdResidenceMonths?: number;
    annualBasicDeductionUsed?: number;
    acquisitionMethod?: "actual" | "estimated" | "appraisal" | "salesCase";
    appraisalValue?: number;
    similarSalesValue?: number;
    isSelfBuilt?: boolean;
    buildingType?: "new" | "extension";
    extensionFloorArea?: number;
    constructionDate?: string;
    /** 일체 주택 본인 신축 × §114조의2 가산세 base 건물분 입력(Q-12) — 닿을 수 없는 조합은 `refineSelfBuiltHousing` 이 막는다 */
    selfBuiltHousing?: unknown;
    /** §164⑦ PHD 입력 — 제공 시 standardPriceAt* 필수 검증 우회 + §164⑦ 취득일 게이트 */
    preHousingDisclosure?: { firstDisclosureDate?: string } | null;
    /** ⑩ 비주택 → 주택 용도변경(§95⑥) — 주거용 사용 개시일의 취득일·양도일 사이 검증 */
    nonHousingToHousingConversion?: { residentialUseStartDate: string } | null;
    /** 이월과세(§97의2) — PHD 게이트 비교일 = 증여자 취득일 */
    carryoverTaxation?: { donorAcquisitionDate?: string; donorBuilt?: DonorBuiltWire } | null;
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
    /** Q-1(D15) — 미등기 + 자경농지 감면 교차 검증 */
    isUnregistered?: boolean;
    reductions?: ReadonlyArray<{ type: string } & Record<string, unknown>>;
    /** 감면 매매계약일 fallback(§99·§99의3) — ⑧·라우터와 같은 자산-수준 값 */
    assetContractDate?: string;
    selfOwns?: string;
    landAcquisitionDate?: string;
    /** 별개 취득 — 주택 비-별개에서는 나목이 있어도 결합 총액이 비례 안분의 분자라 필수(S3-1) */
    isSeparateAcquisition?: boolean;
    houses?: ReadonlyArray<{ isInherited: boolean; inheritedDate?: string }>;
    decedentSameHouseholdBeforeInheritance?: boolean;
    decedentCohabitationHoldingStartDate?: string;
  },
  ctx: z.RefinementCtx,
) {
  // 보유 주택 명부 — 상속주택이면 상속개시일 (⑧ `transfer-tax-validate.ts` 명부 검증·
  // `one-house-exemption-validate.ts`와 같은 조건). 비우면 엔진이 「상속 당시 보유」로 읽어
  // 주택 수·비과세 판정이 바뀌었다(`inheritance-general-house-era.ts` — 2026-09-30).
  (data.houses ?? []).forEach((h, i) => {
    if (h.isInherited && !h.inheritedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["houses", i, "inheritedDate"],
        message: "상속주택이면 상속개시일(inheritedDate)이 필요합니다",
      });
    }
  });
  // 동일세대 상속 주택 — 동일세대 거주·보유 개시일 (§154⑧3호 통산, ⑧ `transfer-tax-validate-acquisition.ts`
  // 상속 분기와 같은 조건). 비우면 엔진이 취득일(상속개시일)로 기산했다.
  if (
    data.acquisitionCause === "inheritance" &&
    data.propertyType === "housing" &&
    data.decedentSameHouseholdBeforeInheritance === true &&
    !data.decedentCohabitationHoldingStartDate
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decedentCohabitationHoldingStartDate"],
      message: "동일세대 상속이면 동일세대 거주·보유 개시일이 필요합니다 (소득세법 시행령 §154⑧3호)",
    });
  }
  // 소유자 분리 — 토지 취득일 (소령 §166⑥, §168②). 단건·다건 공용. 다건 자산은 이 검증 없이 통과해
  // 토지 취득일 누락이 200 + 분리 없는 세액이 됐다(2026-09-30 — 단건만 걸려 있었다).
  // (주택·건물 외 자산의 selfOwns 거부는 `refinePropertyRequiredInputs` — 단건·다건 공용, M2 2026-09-30)
  if (data.selfOwns && data.selfOwns !== "both" && !data.landAcquisitionDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["landAcquisitionDate"],
      message: "토지·건물 소유자가 다른 경우 토지 취득일을 입력해 주세요",
    });
  }
  refineUnregisteredSelfFarming(data.isUnregistered, data.reductions, ctx, ["reductions"]);
  refineReductionRequiredInputs(data.reductions, data.assetContractDate, ctx, ["reductions"]);
  // §164⑦ PHD 경로: 3-시점 입력으로 기준시가 자동 도출되므로 standardPriceAt* 불요
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
  // ⚠️ 주택 **비-별개**에서는 면제하지 않는다 — 개별주택가격(총액 H)이 가목:나목 비례 안분의 **분자**라 필수다(S3-1).
  //    나목이 있어도 H가 없으면 쌍이 안 만들어져 분할이 조용히 사라진다. 별개 취득·일반건물만 면제한다.
  const hasIndependentAcqStd =
    !!data.buildingStandardPriceAtAcquisition &&
    !(data.propertyType === "housing" && data.isSeparateAcquisition !== true);
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
  // 주택 종류는 전송되지 않는다(표시 축). 겸용주택에는 공동주택이 없어 개별주택가격·§164⑦, 일반 경로는 두 가격·두 조문을 함께 적는다
  // (화면에서는 ⑧이 같은 게이트로 먼저 막고 주택 종류별 문장을 보인다 — 계획서 docs/00-pm/phd-residual-limits-fix.plan.md Q-2 (a))
  const phdIsMixedUse = !data.preHousingDisclosure?.firstDisclosureDate;
  if (phdFirstDate) {
    const phdCompareDate =
      data.acquisitionCause === "carryover_gift"
        ? (data.carryoverTaxation?.donorAcquisitionDate ?? "")
        : data.acquisitionDate;
    if (!isPhdEligible(phdCompareDate, phdFirstDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preHousingDisclosure", "firstDisclosureDate"],
        message: phdIsMixedUse
          ? "취득일(이월과세는 증여자 취득일, 의제취득일 1985-01-01 반영)이 최초 고시일 이후 — 취득당시 개별주택가격이 고시되어 있어 3-시점 환산(§164⑦) 대상이 아닙니다"
          : "취득일(이월과세는 증여자 취득일, 의제취득일 1985-01-01 반영)이 최초 고시일 이후 — 취득당시 개별주택가격 또는 공동주택가격(국세청장이 고시한 기준시가 포함)이 고시되어 있어 3-시점 환산(단독·다가구 §164⑦ · 공동주택 §164⑥·⑦) 대상이 아닙니다",
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
    // 증여자 취득일은 **필수가 아니다** — 단순 증여의 세율 보유기간은 「증여받은 날」부터이고
    // (§104② 본문 + 영 §162①5호), §104②2호는 이월과세(`carryover_gift`)에만 적용된다.
    // UI validate(`transfer-tax-validate-asset.ts`)도 같은 기준이다 — 한쪽만 풀면
    // 「UI 통과 ↔ API 400」 모순이 된다(14지점 ⑧·⑩).
    // 값이 있으면 순서만 검증한다.
    if (data.donorAcquisitionDate && data.donorAcquisitionDate >= data.acquisitionDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["donorAcquisitionDate"],
        message: "증여자 취득일은 증여일보다 이전이어야 합니다",
      });
    }
    // 결정 #38 — 증여자와 계속 같은 세대면 세대 보유 시작일(증여자 취득일 ≤ 시작일 < 증여일)이 필수다.
    //   비우면 엔진이 통산하지 못해 「같다고 답했는데 효과가 없는」 상태가 된다. ⑧(판정 메뉴 검증)과 같은 조건.
    if (data.giftSameHouseholdContinuous === true) {
      const start = data.giftHouseholdHoldingStartDate;
      if (!data.donorAcquisitionDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["donorAcquisitionDate"],
          message: "증여자와 계속 같은 세대이면 증여자 취득일이 필요합니다",
        });
      }
      if (!start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["giftHouseholdHoldingStartDate"],
          message: "증여자와 계속 같은 세대이면 세대 보유 시작일이 필요합니다 (소득세법 시행령 §154①)",
        });
      } else if (start >= data.acquisitionDate || (data.donorAcquisitionDate && start < data.donorAcquisitionDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["giftHouseholdHoldingStartDate"],
          message: "세대 보유 시작일은 증여자 취득일 이후, 증여일 이전이어야 합니다",
        });
      } else if (data.giftPriorHouseholdResidenceMonths !== undefined) {
        // 결정 #38-7 — 증여 전 동일세대 거주 개월은 세대 보유 시작일부터 증여일까지를 넘을 수 없다(⑧과 같은 상한).
        const max = maxPriorResidenceMonthsBetween(toDate(start, "giftHouseholdHoldingStartDate"), toDate(data.acquisitionDate, "acquisitionDate"));
        if (data.giftPriorHouseholdResidenceMonths > max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["giftPriorHouseholdResidenceMonths"],
            message: `증여 전 동일세대 거주 개월은 세대 보유 시작일부터 증여일까지(${max}개월)를 넘을 수 없습니다`,
          });
        }
      }
    } else if (data.giftPriorHouseholdResidenceMonths !== undefined) {
      // 계속 같은 세대가 아니면 통산하지 않는다 — 조용히 무시되는 입력이 되지 않게 막는다(⑧·④는 「예」일 때만 보낸다).
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["giftPriorHouseholdResidenceMonths"],
        message: "증여 전 동일세대 거주 개월은 증여자와 계속 같은 세대일 때만 입력할 수 있습니다",
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
  // 겸용주택 × 부담부증여 (소령 §159) — 판정은 엔진 leaf 하나(MB-1~MB-18). ⑧·엔진 throw와 같은 함수다.
  refineMixedUseBurdenedGift(data, ctx);
  // 겸용 상속·증여 × 토지·건물 취득일 중 한쪽만 1985.1.1. 전 — 일반 양도(부담부증여는 위 collector)
  refineMixedUseInheritedSplitDate(data, ctx);
  // 이월과세 × 증여자 신축·증축(§114조의2) — 자산 종류·취득원인 의존 규칙(서브객체 수준 규칙은 shape 가 한다)
  refineDonorBuiltOuter(data, ctx);
  // 일체 주택 본인 신축 × 건물분 가산세 입력(Q-12) — 단건·다건 공용(컴패니언은 `transfer-tax-schema.ts` 루프)
  refineSelfBuiltHousing(
    data.selfBuiltHousing !== undefined,
    {
      isHousing: data.propertyType === "housing",
      isSelfBuilt: data.isSelfBuilt,
      acquisitionCause: data.acquisitionCause,
      burdenedGift: data.transferType === "burdened_gift" || data.burdenedGiftInfo !== undefined,
      mixedUse: !!data.mixedUse,
      buildingType: data.buildingType,
      separated: isSeparatedLike(data),
      preHousingDisclosure: !!data.preHousingDisclosure,
    },
    ctx,
    ["selfBuiltHousing"],
  );
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
  // ⑩ 재개발·재건축 §166③ 환산 입력(분자·분모) — 컴패니언과 같은 규칙(계획서 companion-redev-166-3-required.plan.md)
  refineRedevelopment166_3Inputs(data, ctx);
}
