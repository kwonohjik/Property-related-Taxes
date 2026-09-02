/**
 * 기타토지 판정 (§168-11, PDF p.1706~1707 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 0     나대지 간주 검증 (건축물시가표준액 < 토지 × 2% → 재산세 별도합산 제외, 소득세법 §104의3①4호나목·지방세법 시행령 §101①2호나목)
 *   Step 3-1   재산세 종합합산이 아닌 토지 + 기간기준 → 사업용
 *   Step 3-1-1 거주·사업관련 토지 + 기간기준 → 사업용
 *   둘 다 미달 → 비사업용
 */

import { differenceInDays } from "date-fns";
import { NBL } from "../legal-codes";
import type {
  AreaProportioning,
  CategoryJudgeResult,
  DateInterval,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
  PropertyTaxType,
  RevenueTestResult,
} from "./types";
import { getPeriodJudgmentDate, meetsPeriodCriteria, type PeriodCriteriaResult } from "./period-criteria";
import { getOwnershipStart } from "./utils/period-math";
import { computeAreaProportioning } from "./utils/area-proportioning";
import { computeContiguousParcelNblAttribution } from "./utils/contiguous-parcel-proportioning";
import { computeRevenueTest } from "./revenue-test";
import { judgeFactoryLandExcess } from "./factory-land-standard-area";
import { judgeAppurtenantLandExcess } from "../appurtenant-land-excess";
import {
  resolveAreaLimit,
  resolveAreaLegalBasis,
  resolveMixedUseProportioning,
} from "./other-land-area-limit";

/**
 * 나대지 간주 (소득세법 §104의3①4호나목 + 지방세법 시행령 §101①2호나목·단서 — 재산세 별도합산 제외 → 비사업용):
 * - 건축물시가표준액 < 부속토지 시가표준액 × 2% → 건축물 없는 토지로 봄 (지방세법 시행령 §101①2호나목)
 * - 무허가·사용승인 없는 건축물 부속토지 → 건축물 없는 토지로 봄 (지방세법 시행령 §101①단서)
 * 결과적으로 propertyTaxType을 "종합합산"으로 조정.
 */
export function isBareLand(input: NonBusinessLandInput): boolean {
  const o = input.otherLand;
  if (!o) return false;
  if (!o.hasBuilding) return true;
  if (o.buildingStandardValue !== undefined && o.landStandardValue !== undefined) {
    if (o.buildingStandardValue < o.landStandardValue * 0.02) return true;
  }
  return false;
}

export function judgeOtherLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.OTHER_LAND];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  // §168조의14② 양도일 의제 — §168조의6 기간기준 전용
  const pjDate = getPeriodJudgmentDate(input);
  const totalOwnershipDays = Math.max(0, differenceInDays(pjDate, ownershipStart));

  const o = input.otherLand;
  if (!o) {
    steps.push({
      id: "other_missing",
      label: "기타토지 사용현황 입력",
      status: "FAIL",
      detail: "사용현황 미입력",
      legalBasis: NBL.OTHER_LAND,
    });
    return {
      isBusiness: false,
      reason: "기타토지 사용현황 미입력",
      steps,
      appliedLaws,
      totalOwnershipDays,
      effectiveBusinessDays: 0,
      gracePeriodDays: 0,
      businessUseRatio: 0,
      criteria: { rule2of3Years: false, rule5Years: false, rule80Percent: false },
      warnings,
    };
  }

  // Step 0: 나대지 간주
  const bareLand = isBareLand(input);
  const effectiveTaxType: PropertyTaxType = bareLand ? "comprehensive" : o.propertyTaxType;
  steps.push({
    id: "other_bare_land",
    label: "Step 0 나대지 간주 검증 (2% 기준)",
    status: bareLand ? "FAIL" : "PASS",
    detail: bareLand
      ? (o.hasBuilding
          ? `건축물 시가표준액 < 토지 시가표준액 × 2% → 별도합산 제외(종합합산 취급)`
          : `건축물 없는 토지(나대지) → 종합합산 취급`)
      : `건축물 부속토지 (원 재산세 유형 유지: ${o.propertyTaxType})`,
    legalBasis: NBL.OTHER_LAND,
  });

  const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: pjDate }];

  // ── Step 0.5: 공장용 건축물 부속토지 기준면적 — **판정만** (적용은 Step 3-2 직전) ──
  // 「소득세법」 §104의3①4호나목이 제외하는 것은 재산세 별도합산·분리과세 대상 토지인데,
  // 공장 부속토지는 두 경로 모두 **면적 한도**가 있다(§102①1호 별표6 / §101①1호 배율).
  // 한도 초과분은 §106①1호 종합합산으로 떨어져 나목의 제외에서 벗어난다.
  //
  // ⚠️ **초과라고 해서 여기서 곧바로 비사업용으로 확정하면 안 된다.** §104의3①4호는
  // "다음 각 목을 **제외한** 토지"를 비사업용으로 규정하므로 가·나·다목 중 **어느 하나**에
  // 해당하면 사업용이다. 나목(공장 한도)에 미달해도 **다목**(§168의11① 호별 기준면적,
  // ② 수입금액비율)에 해당하면 여전히 사업용이다 — 먼저 확정하면 법 근거 없는 불리 적용이 된다.
  // Step 3-2(§101①2호나목)가 같은 이유로 뒤에 놓여 있다.
  //
  // 여기서 하는 일은 두 가지뿐이다:
  //   (1) 한도 이내면 재산세 구분을 확정해 Step 3-1이 나목으로 통과시키게 한다
  //   (2) 한도 초과면 결과만 보관하고 판단을 미룬다
  let factoryTaxTypeOverride: PropertyTaxType | undefined;
  let factoryExcess: ReturnType<typeof judgeFactoryLandExcess> | undefined;
  let factoryLegalBasis: string | undefined;
  if (o.factory) {
    const f = judgeFactoryLandExcess(o.factory, "기타토지(공장)");
    factoryLegalBasis =
      f.route === "separate_taxation" ? NBL.FACTORY_LAND_SEPARATE : NBL.FACTORY_LAND_AGGREGATE;
    appliedLaws.push(factoryLegalBasis);

    if (f.isWithinLimit) {
      steps.push({
        id: "other_factory_area",
        label: "Step 0.5 공장용 건축물 부속토지 기준면적",
        status: "PASS",
        detail: `${f.detail} ≥ 공장 전체 부속토지 ${o.factory.totalAppurtenantLandArea}㎡ → 전량 사업용`,
        legalBasis: factoryLegalBasis,
      });
      // 한도 이내 — 재산세 구분을 경로에 맞게 확정한다. 사용자가 `propertyTaxType`을
      // 종합합산으로 두었더라도 §104의3①4호나목은 「지방세법」상 **해당 여부**를 묻지
      // 실제 부과 내용을 따르지 않는다(조심 2025서2489 — "재산세 경정 여부와 무관하게").
      factoryTaxTypeOverride = f.route === "separate_taxation" ? "special_sum" : "separate";
    } else {
      factoryExcess = f;
    }
  }

  // ── Step 0.6: 일반 건물 부속토지 §101①2호 배율 — **판정만** (적용은 Step 3-2 직전) ──
  // 「지방세법 시행령」 §101①2호 본문은 별도합산 대상을 "건축물의 바닥면적…에 제2항에 따른
  // 용도지역별 적용배율을 곱하여 산정한 면적 **범위의 토지**"로 한정한다. 그런데 종전에는
  // 사용자가 고른 `propertyTaxType`(별도합산)을 **그대로 신뢰**해 배율을 검증하지 않았다
  // — 배율 초과분도 별도합산으로 통과했다.
  //
  // ⚠️ **게이트는 「별도합산」 선언(`"separate"`)에만 건다.** §101(제목 "별도합산과세대상 토지의
  //    범위") ①2호·②의 용도지역별 적용배율은 별도합산 축 전용이고, 분리과세(`"special_sum"`,
  //    「지방세법」 §106①3호·영 §102)에는 일반건축물 배율이 **존재하지 않는다**(분리과세 공장용지
  //    한도는 영 §102①1호 → 「지방세법 시행규칙」 §50 [별표 6]이며 Step 0.5 소관) — 걸면 법 근거
  //    없는 불리 적용이다. enum 정본은 `separate`=별도합산 · `special_sum`=분리과세(UI Select ·
  //    위 :316 factory route 매핑 · NBL 상수 인용이 모두 이 매핑). 2026-08 F28에서 반전 정정.
  //
  // ⚠️ 공장(Step 0.5)과 **같은 이유로 여기서 확정하지 않는다.** §104의3①4호는 "가·나·다목을
  // 제외한 토지"를 비사업용으로 규정하므로 나목(배율)을 넘어도 **다목**(§168의11① 호별
  // 기준면적, ② 수입금액비율, ⑥ 복합용도 안분)에 해당하면 여전히 사업용이다.
  //
  // ⚠️ 공장이 입력된 경우는 Step 0.5가 이미 §101①1호/§102①1호로 판정했으므로 건너뛴다
  //    (같은 토지에 두 배율을 겹쳐 적용하지 않는다).
  let buildingExcess: ReturnType<typeof judgeAppurtenantLandExcess> | undefined;
  if (
    !o.factory &&
    !bareLand &&
    o.hasBuilding &&
    effectiveTaxType === "separate" && // 「별도합산」 선언 — 분리과세("special_sum")엔 배율 없음
    o.buildingFloorArea !== undefined &&
    o.buildingFloorArea > 0
  ) {
    const b = judgeAppurtenantLandExcess({
      landArea: input.landArea,
      buildingFootprintArea: o.buildingFloorArea,
      zoneType: input.zoneType,
      context: "기타토지(건물 부수토지)",
    });
    appliedLaws.push(NBL.BUILDING_SITE_MULTIPLIER);
    steps.push({
      id: "other_building_multiplier",
      label: "Step 0.6 건물 부수토지 §101①2호 배율",
      status: b.isWithinLimit ? "PASS" : "FAIL",
      detail: b.isWithinLimit
        ? `${b.multiplierDetail} → 허용 ${b.allowedLandArea}㎡ ≥ 부속토지 ${input.landArea}㎡ → 별도합산 유지`
        : `${b.multiplierDetail} → 허용 ${b.allowedLandArea}㎡ 초과분 ${b.nonBusinessArea}㎡는 별도합산 제외`,
      legalBasis: NBL.BUILDING_SITE_MULTIPLIER,
    });
    if (!b.isWithinLimit) buildingExcess = b;
  }

  // ── Step 3-1: 재산세 종합합산이 아닌 토지 + 기간기준 ───────────────
  // 공장이 입력된 경우 나목 해당 여부는 **한도 판정 결과**가 정한다 — 초과면 나목에
  // 해당하지 않으므로 사용자가 고른 `propertyTaxType`으로 통과시키지 않는다.
  // 일반 건물도 같다 — 배율을 초과하면 그 선언을 그대로 신뢰하지 않는다.
  const isNonComprehensive = o.factory
    ? factoryTaxTypeOverride !== undefined
    : effectiveTaxType !== "comprehensive" && buildingExcess === undefined;

  // ── §168의11② 수입금액비율 (2호다목·10·11다·12호 특정 업종) ──────────
  let revenueTestDetail: RevenueTestResult | undefined;
  if (input.revenueTest && input.revenueTest.businessType !== "none") {
    revenueTestDetail = computeRevenueTest(input.revenueTest);
    steps.push({
      id: "other_revenue_test",
      label: "§168의11② 수입금액비율",
      status: revenueTestDetail.pass ? "PASS" : "FAIL",
      detail: revenueTestDetail.detail,
      legalBasis: NBL.REVENUE_TEST,
    });
    if (revenueTestDetail.pass) {
      appliedLaws.push(NBL.REVENUE_TEST);
      const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
      return buildPass(`수입금액비율 충족 (${revenueTestDetail.businessType})`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
  }

  if (isNonComprehensive) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    if (r.meets) {
      steps.push({
        id: "other_tax_type_criteria",
        label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
        status: "PASS",
        detail: `재산세 ${effectiveTaxType} + 기간기준 충족`,
        legalBasis: NBL.OTHER_LAND,
      });
      return buildPass(`재산세 ${effectiveTaxType} + 기간기준 충족`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
      status: "FAIL",
      detail: `재산세 ${effectiveTaxType}이나 기간기준 미충족 — ${r.detail}`,
      legalBasis: NBL.OTHER_LAND,
    });
  } else {
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산 여부",
      status: "FAIL",
      // 공장은 「전량 종합합산」이 아니라 「한도 초과분만 종합합산」이다 — 뭉뚱그리면
      // 뒤따르는 부분 안분 결과와 문구가 어긋난다.
      detail: factoryExcess
        ? "공장 기준면적 초과분이 종합합산 — 나목(별도합산·분리과세)으로는 전량 사업용이 되지 않는다"
        : "재산세 종합합산과세대상 (원칙 비사업용)",
      legalBasis: NBL.OTHER_LAND,
    });
  }

  // ── Step 3-1-1: §168의11① 거주·사업관련 토지 (호별 면적기준) ──────────
  // relatedBusinessType(호) 우선, 미설정 시 legacy isRelatedToResidenceOrBusiness fallback.
  const relatedType = o.relatedBusinessType;
  const isRecognizedHo = relatedType !== undefined && relatedType !== "none";
  // §168의11⑥ 복합용도 건축물 부속토지 안분 — 건축물에 거주·특정사업 사용분(특정용도분)이 있으면
  // 그 자체가 거주·사업관련(isRelated)에 해당 → mode 단독으로도 isRelated 의제.
  const mixedUse = resolveMixedUseProportioning(o, input.landArea);
  const isRelated = isRecognizedHo || o.isRelatedToResidenceOrBusiness || mixedUse !== undefined;

  if (isRelated) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    const legalBasis = resolveAreaLegalBasis(relatedType);

    if (!r.meets) {
      steps.push({
        id: "other_residence_business",
        label: "Step 3-1-1 거주·사업관련 토지 + 기간기준",
        status: "FAIL",
        detail: `거주·사업관련이나 기간기준 미충족 — ${r.detail}`,
        legalBasis,
      });
      return buildFail("거주·사업관련 토지이나 기간기준 미충족", steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }

    // ── §168의11⑥ 복합용도 건축물 부속토지 안분 (⑥ 단독 — ① 호별 기준면적 미적용·이중차감 방지) ──
    // 기간기준(§168의6) 충족 후 진입. 특정용도분(거주·특정사업 사용분)만 사업용, 잔여 부속토지는 비사업용.
    if (mixedUse) {
      appliedLaws.push(mixedUse.legalBasis);
      const pctBiz = (mixedUse.ap.mixedUseBuildingRatio ?? 0) * 100;
      if (mixedUse.ap.nonBusinessRatio <= 0) {
        // 부속토지 전부가 특정용도분(거주·특정사업) → 전량 사업용
        steps.push({
          id: "other_mixed_use",
          label: "Step 3-1-1 §168의11⑥ 복합용도 건축물 부속토지 안분",
          status: "PASS",
          detail: `특정용도분 비율 ${pctBiz.toFixed(1)}% → 부속토지 전량 사업용`,
          legalBasis: mixedUse.legalBasis,
        });
        return buildPass("복합용도 건축물 — 특정용도분 부속토지 전량 사업용 (§168의11⑥)", steps, appliedLaws, warnings, {
          r, totalOwnershipDays, revenueTestDetail,
        });
      }
      steps.push({
        id: "other_mixed_use",
        label: "Step 3-1-1 §168의11⑥ 복합용도 건축물 부속토지 안분",
        status: "FAIL",
        detail: `특정용도분 비율 ${pctBiz.toFixed(1)}% → 사업용 ${mixedUse.ap.businessArea.toFixed(1)}㎡·비사업용(종합합산) ${mixedUse.ap.nonBusinessArea.toFixed(1)}㎡`,
        legalBasis: mixedUse.legalBasis,
      });
      return {
        isBusiness: false,
        reason: `복합용도 건축물 — 특정용도분(${pctBiz.toFixed(1)}%)만 사업용·잔여 비사업용 (§168의11⑥)`,
        steps,
        appliedLaws,
        areaProportioning: mixedUse.ap,
        totalOwnershipDays,
        effectiveBusinessDays: r.effectiveBusinessDays,
        gracePeriodDays: r.gracePeriodDays,
        businessUseRatio: mixedUse.ap.nonBusinessRatio,
        criteria: r.criteria,
        revenueTestDetail,
        warnings,
      };
    }

    appliedLaws.push(legalBasis);

    const areaLimit = resolveAreaLimit(o, input.zoneType);

    // ── §168의11⑤ 연접 다필지 취득시기순 안분 (parcels 제공 시 — 호별 기준면적 초과분을 늦은 필지부터 귀속) ──
    if (o.parcels && o.parcels.length > 0 && areaLimit !== undefined) {
      const c = computeContiguousParcelNblAttribution(o.parcels, areaLimit);
      const hoLabel = c.hasBuilding ? "2호" : "1호";
      appliedLaws.push(NBL.OTHER_LAND_CONTIGUOUS);
      if (c.clampWarning) {
        warnings.push(
          `§168의11⑤ — 기준면적 초과분(${c.excessArea.toFixed(1)}㎡)이 귀속 후보(건축물 바닥면적 제외 ${c.candidateTotal.toFixed(1)}㎡)를 초과하여 후보 면적으로 한정했습니다. 바닥면적분은 사업용으로 유지됩니다.`,
        );
      }
      if (c.nonBusinessRatio <= 0) {
        steps.push({
          id: "other_contiguous_nbl",
          label: `Step 3-1-1 §168의11⑤ 연접 다필지(${hoLabel}) 안분`,
          status: "PASS",
          detail: `총면적 ${c.totalArea.toFixed(1)}㎡ ≤ 기준면적 ${areaLimit}㎡ → 전량 사업용`,
          legalBasis: NBL.OTHER_LAND_CONTIGUOUS,
        });
        return buildPass("연접 다필지 — 기준면적 이내 전량 사업용 (§168의11⑤)", steps, appliedLaws, warnings, {
          r, totalOwnershipDays, revenueTestDetail,
        });
      }
      const areaProportioning: AreaProportioning = {
        totalArea: c.totalArea,
        businessArea: c.totalArea - c.nonBusinessArea,
        nonBusinessArea: c.nonBusinessArea,
        nonBusinessRatio: c.nonBusinessRatio,
        buildingMultiplier: 1,
        contiguousNblDetail: c.detail,
      };
      steps.push({
        id: "other_contiguous_nbl",
        label: `Step 3-1-1 §168의11⑤ 연접 다필지(${hoLabel}) 취득시기순 안분`,
        status: "FAIL",
        detail: `총면적 ${c.totalArea.toFixed(1)}㎡ − 기준면적 ${areaLimit}㎡ → 초과분 ${c.nonBusinessArea.toFixed(1)}㎡(취득시기 늦은 필지부터) 비사업용`,
        legalBasis: NBL.OTHER_LAND_CONTIGUOUS,
      });
      return {
        isBusiness: false,
        reason: `연접 다필지 기준면적 초과 — 초과분 ${c.nonBusinessArea.toFixed(1)}㎡ 비사업용 (§168의11⑤ ${hoLabel})`,
        steps,
        appliedLaws,
        areaProportioning,
        totalOwnershipDays,
        effectiveBusinessDays: r.effectiveBusinessDays,
        gracePeriodDays: r.gracePeriodDays,
        businessUseRatio: 1 - areaProportioning.nonBusinessRatio,
        criteria: r.criteria,
        revenueTestDetail,
        warnings,
      };
    }

    // 호별 기준면적 해석 — 초과분 비사업용 면적 안분 (§168의11①) [단일 필지]
    if (areaLimit !== undefined && input.landArea > areaLimit) {
      const areaProportioning = computeAreaProportioning(input.landArea, areaLimit);
      steps.push({
        id: "other_area_limit",
        label: "Step 3-1-1 §168의11① 호별 기준면적",
        status: "FAIL",
        detail: `기준면적 ${areaLimit}㎡ 초과 → 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
        legalBasis,
      });
      return {
        isBusiness: false,
        reason: `기준면적 초과 — 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
        steps,
        appliedLaws,
        areaProportioning,
        totalOwnershipDays,
        effectiveBusinessDays: r.effectiveBusinessDays,
        gracePeriodDays: r.gracePeriodDays,
        businessUseRatio: 1 - areaProportioning.nonBusinessRatio,
        criteria: r.criteria,
        revenueTestDetail,
        warnings,
      };
    }

    // 기준면적 이내 또는 면적기준 없는 호(14호·legacy) → 전량 사업용
    steps.push({
      id: "other_residence_business",
      label: areaLimit !== undefined ? "Step 3-1-1 §168의11① 호별 기준면적" : "Step 3-1-1 거주·사업관련 토지 + 기간기준",
      status: "PASS",
      detail: areaLimit !== undefined
        ? `거주·사업관련(§168의11①) + 기준면적 ${areaLimit}㎡ 이내 + 기간기준 충족`
        : "거주·사업과 직접 관련 + 기간기준 충족",
      legalBasis,
    });
    return buildPass(
      areaLimit !== undefined ? "거주·사업관련 토지 + 기준면적 이내" : "거주·사업관련 토지 + 기간기준 충족",
      steps, appliedLaws, warnings, { r, totalOwnershipDays, revenueTestDetail },
    );
  }

  // ── Step 0.5 적용: 공장 기준면적 초과분 비사업용 ─────────────────────
  // 수입금액비율(②)·거주사업관련(① 호별) 우선 경로를 모두 통과하지 못한 경우에만 확정한다
  // (§104의3①4호 가·나·다목은 택일이므로 나목 미달만으로 비사업용을 단정하면 안 된다).
  // ── Step 3-1-2: 일반 건물 §101①2호 배율 초과분 적용 ──────────────
  // 여기까지 왔다는 것은 다목(수입금액비율·호별 기준면적·복합용도)이 모두 미해당이라는 뜻이다.
  // 이제 비로소 배율 초과분을 비사업용으로 확정한다(Step 0.6에서 미룬 판단).
  if (buildingExcess) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    const areaProportioning = computeAreaProportioning(input.landArea, buildingExcess.allowedLandArea);
    steps.push({
      id: "other_building_multiplier_apply",
      label: "Step 3-1-2 건물 부수토지 배율 초과분",
      status: "FAIL",
      detail:
        `허용 ${buildingExcess.allowedLandArea}㎡ 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용 ` +
        `(§101①2호 배율 ${buildingExcess.multiplier}배)`,
      legalBasis: NBL.BUILDING_SITE_MULTIPLIER,
    });
    return {
      isBusiness: false,
      reason: `건물 부수토지 배율(${buildingExcess.multiplier}배) 초과 — 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
      steps,
      appliedLaws,
      areaProportioning,
      totalOwnershipDays,
      effectiveBusinessDays: r.effectiveBusinessDays,
      gracePeriodDays: r.gracePeriodDays,
      businessUseRatio: 1 - areaProportioning.nonBusinessRatio,
      criteria: r.criteria,
      revenueTestDetail,
      warnings,
    };
  }

  if (factoryExcess) {
    // 반환값 조립용(effectiveBusinessDays·criteria). **판정 분기로 쓰지 않는다** —
    // `fullPeriod`(전 보유기간)를 사업용 기간으로 넘기므로 모든 창의 비사업용 일수가 0이 되어
    // `meets`는 보유기간 길이와 무관하게 항상 true다(period-criteria.ts:160-189 실측).
    // Step 3-1도 같은 인자를 쓰며 그 FAIL 분기 역시 도달하지 않는다.
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    if (factoryExcess.isUnregisteredException) {
      // 단서(허가·사용승인 미이행) — 안분 없이 전량 비사업용
      steps.push({
        id: "other_factory_area",
        label: "Step 0.5 공장용 건축물 부속토지 기준면적",
        status: "FAIL",
        detail: factoryExcess.detail,
        legalBasis: factoryLegalBasis!,
      });
      return buildFail(factoryExcess.detail, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
    // ⚠️ 한도 비교는 **공장 전체**로 끝났다(`factoryExcess.nonBusinessRatio`). 여기서는 그
    // 비율을 **양도 대상 토지**(`input.landArea`)에 적용한다 — 양도분이 공장 일부일 수 있으므로
    // `factoryExcess.standardArea`를 양도분과 직접 비교하면 안 된다(§1.4 약분 구조).
    const factoryTotal = o.factory!.totalAppurtenantLandArea;
    const businessAreaOfAsset = input.landArea * (1 - factoryExcess.nonBusinessRatio);
    const areaProportioning = computeAreaProportioning(input.landArea, businessAreaOfAsset);
    steps.push({
      id: "other_factory_area",
      label: "Step 0.5 공장용 건축물 부속토지 기준면적",
      status: "FAIL",
      detail:
        `${factoryExcess.detail} < 공장 전체 부속토지 ${factoryTotal}㎡ → 초과비율 ` +
        `${(factoryExcess.nonBusinessRatio * 100).toFixed(2)}% · 양도분 ${input.landArea}㎡ 중 ` +
        `${areaProportioning.nonBusinessArea.toFixed(2)}㎡ 비사업용(종합합산)`,
      legalBasis: factoryLegalBasis!,
    });
    return {
      isBusiness: false,
      reason: `공장 기준면적 초과 — 초과분 ${areaProportioning.nonBusinessArea.toFixed(2)}㎡ 비사업용`,
      steps,
      appliedLaws,
      areaProportioning,
      totalOwnershipDays,
      effectiveBusinessDays: r.effectiveBusinessDays,
      gracePeriodDays: r.gracePeriodDays,
      businessUseRatio: 1 - areaProportioning.nonBusinessRatio,
      criteria: r.criteria,
      revenueTestDetail,
      warnings,
    };
  }

  // ── Step 3-2: §101①2호나목 footprint carve-out ──────────────────
  // 수입금액비율·비종합합산·거주사업관련 모두 미해당이고 2% 미달(bareLand·건물有)인 경우,
  // 건축물 바닥면적(footprint)분 토지는 별도합산(사업용) 유지하고 잔여 부속토지만 종합합산(비사업용).
  // (지방세법 시행령 §101①2호나목 — "건축물의 바닥면적을 제외한 부속토지"만 별도합산 제외)
  // 진입 위치 주의: 수입금액비율(②)·거주사업관련(① 호별) 우선 경로 이후 — 법 근거 없는 불리 적용 방지.
  if (bareLand && o.hasBuilding && o.buildingFloorArea !== undefined && o.buildingFloorArea > 0) {
    const fp = o.buildingFloorArea;
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    appliedLaws.push(NBL.OTHER_LAND_FOOTPRINT_CARVEOUT);
    if (fp >= input.landArea) {
      // 부속토지 전부가 바닥면적분 → 전량 별도합산(사업용) 유지
      steps.push({
        id: "other_footprint_carveout",
        label: "Step 3-2 §101①2호나목 건축물 바닥면적 별도합산 유지",
        status: "PASS",
        detail: `건축물 바닥면적 ${fp}㎡ ≥ 부속토지 ${input.landArea}㎡ → 전량 별도합산(사업용) 유지`,
        legalBasis: NBL.OTHER_LAND_FOOTPRINT_CARVEOUT,
      });
      return buildPass("건축물 바닥면적 별도합산 유지 (§101①2호나목)", steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
    const areaProportioning = computeAreaProportioning(input.landArea, fp);
    steps.push({
      id: "other_footprint_carveout",
      label: "Step 3-2 §101①2호나목 건축물 바닥면적 별도합산 유지",
      status: "FAIL",
      detail: `건축물 바닥면적 ${fp}㎡ 별도합산 유지(사업용)·잔여 ${areaProportioning.nonBusinessArea}㎡ 종합합산(비사업용)`,
      legalBasis: NBL.OTHER_LAND_FOOTPRINT_CARVEOUT,
    });
    return {
      isBusiness: false,
      reason: `건축물 바닥면적 ${fp}㎡ 별도합산 유지·잔여 ${areaProportioning.nonBusinessArea}㎡ 비사업용 (§101①2호나목)`,
      steps,
      appliedLaws,
      areaProportioning,
      totalOwnershipDays,
      effectiveBusinessDays: r.effectiveBusinessDays,
      gracePeriodDays: r.gracePeriodDays,
      businessUseRatio: 1 - areaProportioning.nonBusinessRatio,
      criteria: r.criteria,
      revenueTestDetail,
      warnings,
    };
  }

  steps.push({
    id: "other_residence_business",
    label: "Step 3-1-1 거주·사업관련 토지",
    status: "NOT_APPLICABLE",
    detail: "거주·사업과 직접 관련 플래그 미설정",
    legalBasis: NBL.OTHER_LAND_BUSINESS,
  });
  const dummyR = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
  return buildFail("종합합산 + 거주·사업관련 미해당 → 비사업용", steps, appliedLaws, warnings, {
    r: dummyR, totalOwnershipDays, revenueTestDetail,
  });
}

interface Ctx {
  r: PeriodCriteriaResult;
  totalOwnershipDays: number;
  revenueTestDetail?: RevenueTestResult;
}

function buildPass(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: true,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    revenueTestDetail: ctx.revenueTestDetail,
    warnings,
  };
}

function buildFail(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: false,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    revenueTestDetail: ctx.revenueTestDetail,
    warnings,
  };
}
