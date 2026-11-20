/**
 * 기타토지 판정 (§168-11, PDF p.1706~1707 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 0     나대지 간주 검증 (건축물시가표준액 < 토지 × 2% → 재산세 별도합산 제외, 소득세법 §104의3①4호나목·지방세법 시행령 §101①2호나목)
 *   Step 3-1   재산세 종합합산이 아닌 토지 + 기간기준 → 사업용
 *   Step 3-1-1 거주·사업관련 토지 + 기간기준 → 사업용
 *   둘 다 미달 → 비사업용
 */

import { differenceInDays } from "../utc-date";
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
import { isAreaAtMost, isAreaOver, subtractAreas } from "../area-limit";
import { computeAreaProportioning } from "./utils/area-proportioning";
import { computeContiguousParcelNblAttribution } from "./utils/contiguous-parcel-proportioning";
import { computeRevenueTest, REVENUE_BUSINESS_TYPE_LABEL } from "./revenue-test";
import { judgeFactoryLandExcess } from "./factory-land-standard-area";
import { judgeAppurtenantLandExcess } from "../appurtenant-land-excess";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { propertyTaxTypeLabel } from "./property-tax-type-label";
import {
  resolveAreaLimit,
  resolveAreaLegalBasis,
  resolveMixedUseProportioning,
} from "./other-land-area-limit";
import { applyGraceToNonBusinessRemainder, pickWiderExclusion } from "./other-land-merge";
import { judgeHoRequirements } from "./other-land-ho-requirements";
import { wholesaleItemIssue } from "./revenue-wholesale-item";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";

/**
 * 나대지 간주 (소득세법 §104의3①4호나목 — 재산세 별도합산 제외 → 비사업용).
 *
 * NBL2611-V10-OL10 — **실제로 구현된 두 경우만** 참을 돌려준다:
 * - 건축물이 없다(`hasBuilding` 거짓) → 건축물 없는 토지
 * - 건축물 시가표준액과 부속토지 시가표준액이 **둘 다** 입력됐고 건축물 < 부속토지 × 2%
 *   → 건축물 없는 토지로 봄 (지방세법 시행령 §101①2호나목). 한쪽이라도 비면 이 경우는 판정하지 않는다.
 *
 * ⚠️ 「지방세법 시행령」 §101① 단서(무허가·사용승인 없이 사용 중인 건축물의 부속토지 제외)는 **처리하지 않는다**
 *    — 입력 칸이 없다(리뷰 Q-2 (가) 보류: 혼재 고지서 안내 + 확인 필요만). 단서 해당 여부는 판정하지 않는다.
 * 결과적으로 propertyTaxType을 "종합합산"으로 조정하는 판정용 술어다.
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

/**
 * NBL2611-V10-P · V2-C2 — 기타토지는 소유기간 중 사용기간을 입력으로 받지 않고 **양도일 현재 상태를 소유기간 전체(`fullPeriod`)에 적용**한다.
 * 그래서 기간기준 일수·비율은 «전 기간 사업용»으로 채운 표시값이며 판정 근거가 아니다. 이 사실을 echo(`periodEvaluation`)와 고지로 남긴다
 * (건물 철거·신축 등 소유기간 중 상태 변화는 반영되지 않는다. 상태 이력 모델은 리뷰 Q-4.)
 * 예외로 영 §168의14① 유예기간만은 판정에 쓴다 — 비사업용 잔여분에 «빈 사업기간 + 유예»로 기간기준을 본다(NBL2611-V2-C1, `other-land-merge.ts`).
 */
export function judgeOtherLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const core = judgeOtherLandCore(input, rules);
  if (!input.otherLand) return { ...core, periodEvaluation: { basis: "not_judged" } };
  // NBL2611-V2-C1 — 비사업용으로 끝난 잔여분(전량·부분)은 «빈 사업기간 + 유예기간»으로 기간기준을 다시 본다(영 §168의14①). 유예 입력이 없으면 그대로다.
  const { result, graceJudged } = applyGraceToNonBusinessRemainder(core, input, rules);
  return {
    ...result,
    periodEvaluation: graceJudged ? { basis: "state_at_transfer", graceJudged } : { basis: "state_at_transfer" },
    warnings: [...(result.warnings ?? []), NBL_STATE_AT_TRANSFER_APPLIED_NOTICE],
  };
}

function judgeOtherLandCore(
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
  // NBL2611-V10-K — 재산세 분류는 한국어 라벨로 쓰고, 이 단계들의 근거는 법 §104의3①4호 가·나목이다(다목 위임조문 영 §168의11①이 아니다).
  const declaredLabel = propertyTaxTypeLabel(o.propertyTaxType);
  const effectiveLabel = propertyTaxTypeLabel(effectiveTaxType);
  appliedLaws.push(NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION);
  steps.push({
    id: "other_bare_land",
    label: "Step 0 나대지 간주 검증 (2% 기준)",
    status: bareLand ? "FAIL" : "PASS",
    detail: bareLand
      ? (o.hasBuilding
          ? `건축물 시가표준액 < 토지 시가표준액 × 2% → 별도합산 제외(종합합산 취급)`
          : `건축물 없는 토지(나대지) → 종합합산 취급`)
      : `건축물 부속토지 (선택한 재산세 분류 유지: ${declaredLabel})`,
    legalBasis: NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION,
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
    // NBL2611-V7-S · Q-6 (다) — 12호 도소매업은 규칙 §83조의4⑭ 열거 품목만(농·수·축산물은 시장·유사 장소 한정). 품목 미선택은 차단, 시장 요건 불충족은 불인정.
    const wholesale = wholesaleItemIssue(input.revenueTest);
    if (wholesale?.kind === "missing") throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, wholesale.message);
    steps.push({
      id: "other_revenue_test",
      label: "§168의11② 수입금액비율",
      status: revenueTestDetail.pass ? "PASS" : "FAIL",
      detail: revenueTestDetail.detail,
      legalBasis: NBL.REVENUE_TEST,
    });
    if (wholesale?.kind === "not_in_market") {
      steps.push({
        id: "other_revenue_wholesale_item",
        label: "§168의11①12호 도소매업 품목 (규칙 §83조의4⑭)",
        status: "FAIL",
        detail: wholesale.message,
        legalBasis: NBL.OTHER_LAND_WHOLESALE_ITEMS,
      });
    }
    if (revenueTestDetail.pass && wholesale === undefined) {
      appliedLaws.push(NBL.REVENUE_TEST);
      const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
      return buildPass(`수입금액비율 충족 (${REVENUE_BUSINESS_TYPE_LABEL[revenueTestDetail.businessType]})`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
  }

  // NBL2611-V2-PR04 인계 — 비종합합산 선언이 기간기준 미충족(소유일수 0 등)으로 비사업용이 될 때 끝의 사유가 「종합합산」으로 오표기되던 것을 바로잡는다(판정 불변).
  let periodFailedReason: string | undefined;
  if (isNonComprehensive) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    if (r.meets) {
      steps.push({
        id: "other_tax_type_criteria",
        label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
        status: "PASS",
        detail: `재산세 ${effectiveLabel} + 기간기준 충족`,
        legalBasis: NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION,
      });
      return buildPass(`재산세 ${effectiveLabel} + 기간기준 충족`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
    periodFailedReason = `재산세 ${effectiveLabel}이나 기간기준 미충족 — ${r.detail}`;
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
      status: "FAIL",
      detail: periodFailedReason,
      legalBasis: NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION,
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
        : buildingExcess
          ? `선택한 재산세 분류(${declaredLabel})이나 건물 부수토지 배율 초과 — 초과분은 별도합산으로 보지 않는다`
          : "재산세 종합합산과세대상 (원칙 비사업용)",
      legalBasis: NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION,
    });
  }

  // ── 나목 부분 적용 — Step 3-1-2 배율 초과 · Step 0.5 공장 초과 · Step 3-2 2% 바닥면적 ──
  // 법 §104의3①4호 가·나·다목은 위계 없는 병렬 제외 사유다(NBL2611-V1-B). 다목(수입금액비율·호별·연접·복합용도)이 **전량** 사업용이면 이 단계를 거치지 않고 끝나지만,
  // 다목이 **일부 면적만** 인정하면 나목이 인정한 면적과 비교해 넓은 쪽을 쓴다(`mergeWithNaMok` — 단순 합산은 이중 계상이라 하지 않는다).
  // 나목 어느 쪽도 해당하지 않으면 `undefined`.
  const applyNaMok = (): CategoryJudgeResult | undefined => {
    // ── Step 0.5 적용: 공장 기준면적 초과분 비사업용 ─────────────────────
    // 수입금액비율(②)·거주사업관련(① 호별) 우선 경로를 모두 통과하지 못한 경우에만 확정한다
    // (§104의3①4호 가·나·다목은 택일이므로 나목 미달만으로 비사업용을 단정하면 안 된다).
    // ── Step 3-1-2: 일반 건물 §101①2호 배율 초과분 적용 ──────────────
    // 여기까지 왔다는 것은 다목(수입금액비율·호별 기준면적·복합용도)이 모두 미해당이라는 뜻이다.
    // 이제 비로소 배율 초과분을 비사업용으로 확정한다(Step 0.6에서 미룬 판단).
    if (buildingExcess) {
      const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
      const areaProportioning: AreaProportioning = {
        ...computeAreaProportioning(input.landArea, buildingExcess.allowedLandArea),
        legalBasis: [NBL.BUILDING_SITE_MULTIPLIER],
      };
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
      const areaProportioning: AreaProportioning = {
        ...computeAreaProportioning(input.landArea, businessAreaOfAsset),
        legalBasis: [factoryLegalBasis!],
      };
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
      if (isAreaAtMost(input.landArea, fp)) {
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
      const areaProportioning: AreaProportioning = {
        ...computeAreaProportioning(input.landArea, fp),
        legalBasis: [NBL.OTHER_LAND_FOOTPRINT_CARVEOUT],
      };
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
    return undefined;
  };
  const mergeWithNaMok = (daMok: CategoryJudgeResult): CategoryJudgeResult => {
    const na = applyNaMok();
    return na ? pickWiderExclusion(daMok, na, input.landArea, steps, warnings) : daMok;
  };

  // ── Step 3-1-1: §168의11① 거주·사업관련 토지 (호별 면적기준) ──────────
  // relatedBusinessType(호) 우선, 미설정 시 legacy isRelatedToResidenceOrBusiness fallback.
  const relatedType = o.relatedBusinessType;
  // NBL2611-V7-DM02·V9-DM11 — 호의 면적 외 요건(5호 나목 용도지역 · 13호 나지)을 입력으로 판정할 수 있는 만큼 판정한다. 불충족이면 호를 인정하지 않는다.
  const hoReq = judgeHoRequirements(relatedType, o, input.zoneType);
  if (hoReq.failStep) steps.push(hoReq.failStep);
  // NBL2611-V7-S · Q-5 (나) — 14호처럼 호를 인정하지 않는 사유가 «확인 필요»를 동반하면 판정 경로와 무관하게 결과에 남긴다.
  if (hoReq.failNotice) warnings.push(hoReq.failNotice);
  const isRecognizedHo = relatedType !== undefined && relatedType !== "none" && !hoReq.failStep;
  // §168의11⑥ 복합용도 건축물 부속토지 안분 — 건축물에 거주·특정사업 사용분(특정용도분)이 있으면
  // 그 자체가 거주·사업관련(isRelated)에 해당 → mode 단독으로도 isRelated 의제.
  const mixedUse = resolveMixedUseProportioning(o, input.landArea);
  // NBL2611-V6-D — 레거시 boolean은 호가 **미설정**일 때만 fallback이다. 사용자가 호를 명시했으면(「해당 없음」 `none` 포함) 그 선택이 정한다 —
  // 복원 자산에 남은 숨은 boolean이 명시한 「해당 없음」까지 사업용으로 덮지 못하게(Q-10 (나)의 migrate가 못 닿는 직접 API·sessionStorage 경로 포함).
  const legacyRelated = relatedType === undefined && o.isRelatedToResidenceOrBusiness;
  const isRelated = isRecognizedHo || legacyRelated || mixedUse !== undefined;

  if (isRelated) {
    // NBL2611-V7-S — 3호는 «조성 완료일부터 2년» 구간만 사업용 기간이다(`hoReq.businessPeriods`). 그 밖의 호는 소유기간 전체.
    const r = meetsPeriodCriteria(hoReq.businessPeriods ?? fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
    const legalBasis = resolveAreaLegalBasis(relatedType);
    // Q-6 (다) — 호로 판정에 쓰는 경우(⑥ 복합용도 안분이 호별 기준면적을 대체하지 않을 때)에만 자기 선언 요건을 고지한다.
    if (isRecognizedHo && mixedUse === undefined && hoReq.notice) warnings.push(hoReq.notice);

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
      return mergeWithNaMok({
        isBusiness: false,
        reason: `복합용도 건축물 — 특정용도분(${pctBiz.toFixed(1)}%)만 사업용·잔여 비사업용 (§168의11⑥)`,
        steps,
        appliedLaws,
        areaProportioning: { ...mixedUse.ap, legalBasis: [mixedUse.legalBasis] },
        totalOwnershipDays,
        effectiveBusinessDays: r.effectiveBusinessDays,
        gracePeriodDays: r.gracePeriodDays,
        // NBL2611-V10-P ① — 종전에는 비사업용 비율을 그대로 넣어 역전됐다(표시 전용 — 세액은 nonBusinessRatio를 쓴다).
        businessUseRatio: 1 - mixedUse.ap.nonBusinessRatio,
        criteria: r.criteria,
        revenueTestDetail,
        warnings,
      });
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
        businessArea: subtractAreas(c.totalArea, c.nonBusinessArea),
        nonBusinessArea: c.nonBusinessArea,
        nonBusinessRatio: c.nonBusinessRatio,
        buildingMultiplier: 1,
        contiguousNblDetail: c.detail,
        legalBasis: [NBL.OTHER_LAND_CONTIGUOUS],
      };
      steps.push({
        id: "other_contiguous_nbl",
        label: `Step 3-1-1 §168의11⑤ 연접 다필지(${hoLabel}) 취득시기순 안분`,
        status: "FAIL",
        detail: `총면적 ${c.totalArea.toFixed(1)}㎡ − 기준면적 ${areaLimit}㎡ → 초과분 ${c.nonBusinessArea.toFixed(1)}㎡(취득시기 늦은 필지부터) 비사업용`,
        legalBasis: NBL.OTHER_LAND_CONTIGUOUS,
      });
      return mergeWithNaMok({
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
      });
    }

    // 호별 기준면적 해석 — 초과분 비사업용 면적 안분 (§168의11①) [단일 필지]
    if (areaLimit !== undefined && isAreaOver(input.landArea, areaLimit)) {
      const areaProportioning: AreaProportioning = { ...computeAreaProportioning(input.landArea, areaLimit), legalBasis: [legalBasis] };
      steps.push({
        id: "other_area_limit",
        label: "Step 3-1-1 §168의11① 호별 기준면적",
        status: "FAIL",
        detail: `기준면적 ${areaLimit}㎡ 초과 → 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
        legalBasis,
      });
      return mergeWithNaMok({
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
      });
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

  const naMokResult = applyNaMok();
  if (naMokResult) return naMokResult;

  steps.push({
    id: "other_residence_business",
    label: "Step 3-1-1 거주·사업관련 토지",
    status: "NOT_APPLICABLE",
    detail: "거주·사업과 직접 관련 플래그 미설정",
    legalBasis: NBL.OTHER_LAND_BUSINESS,
  });
  const dummyR = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
  return buildFail(
    periodFailedReason ? `${periodFailedReason} → 비사업용` : "종합합산 + 거주·사업관련 미해당 → 비사업용",
    steps, appliedLaws, warnings, {
      r: dummyR, totalOwnershipDays, revenueTestDetail,
    },
  );
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
