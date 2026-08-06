/**
 * 건물(비주택) 부수토지 판정 — 「지방세법 시행령」 §101①2호·§101②
 *
 * ## 왜 주택과 분리하는가 (A-BS-1)
 *
 * 종전에는 `building_site`가 `housing` 그룹으로 분류되어 `judgeHousingLand`가 처리했고,
 * 그 안에서 **「소득세법 시행령」 §168의12(주택 부수토지) 배율**이 적용됐다. 두 조문은
 * 배율표가 다르다:
 *
 * | 자산 | 근거 | 수도권 축 | 배율 |
 * |---|---|---|---|
 * | **주택** 부수토지 | 「소득세법」 §104의3①5호 → 시행령 §168의12 | **있음** | 3 / 5 / 10 |
 * | **건물**(비주택) 부수토지 | 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 → 시행령 §101①2호 | **없음** | 5 / 3 / 4 / 7 |
 *
 * 22개 조합 중 19개가 어긋난다. 같은 프로젝트에서 이미 한 번 같은 실수를 했다 —
 * `getLandFootprintMultiplier(zone, metro, kind)`가 `kind`와 무관하게 주택 배율을 반환했고
 * 2026-07-30에 폐지됐다(`building-site-multiplier.anchor.test.ts` 헤더).
 *
 * ⇒ **두 조문을 한 함수 뒤에 두지 않는다.** 배율은 정본 `judgeAppurtenantLandExcess`
 * (→ `local-tax-zone-multiplier.ts`)에 위임하고, 이 모듈은 판정 결과 조립만 한다.
 * 같은 정본을 일반건물(GB)·상업용건물(CB)·공장(§101①1호 경로)도 쓴다.
 *
 * ## 🔴 도달 불가 — 노출하기 전에 **다목을 먼저 넣어야 한다** (2026-08-06)
 *
 * 현재 `building_site`는 UI 선택지·Zod enum 어느 쪽에도 없어 도달할 수 없다
 * (`NBL_UI_LAND_TYPE_VALUES` 6종).
 *
 * **그대로 노출하면 안 된다.** 이 모듈은 §101①2호 배율만 계산하고 배율 초과 시 곧바로
 * `isBusiness: false`로 확정하는데, 「소득세법」 §104의3①4호는 "가·나·다목을 **제외한**
 * 토지"를 비사업용으로 규정한다 — 나목(배율)을 넘어도 **다목**에 해당하면 사업용이다.
 * 이 모듈에는 다목 기계가 **하나도 없다**:
 *
 * | 다목 근거 | `other-land.ts` | 이 모듈 |
 * |---|---|---|
 * | §168의11② 수입금액비율 | ✅ | ❌ |
 * | §168의11① 호별 기준면적 | ✅ | ❌ |
 * | §168의11⑥ 복합용도 안분 | ✅ | ❌ |
 * | §101①2호나목 나대지 간주(2%) | ✅ | ❌ |
 *
 * ⇒ 형제 선택지로 노출하면 같은 토지가 **어느 입구를 고르냐에 따라 다른 답**을 받는다.
 *
 * ## 배율 검증 자체는 `other-land.ts`가 이미 한다
 *
 * 2026-08-06에 사용자의 「별도합산」 선언을 검증하지 않던 갭을 `other-land.ts`
 * **Step 0.6(판정) / Step 3-1-2(적용)** 로 메웠다 — 공장(Step 0.5)과 같은 형태로
 * 판정만 하고 다목은 뒤에서 살린다. 지금 시점에 이 모듈의 실익은 사실상 없다.
 *
 * 그래도 노출하려면: 다목 기계 이식 → 지목 옵션·`nblBuildingFootprint` 입력·validate 추가.
 * 도달 불가는 `__tests__/lib/property-dead-classifier-reachability.test.ts`와 같은 형태의
 * 가드가 필요하다(현재 없음 — 별건).
 */

import { differenceInDays } from "date-fns";
import { NBL } from "../legal-codes";
import { judgeAppurtenantLandExcess } from "../appurtenant-land-excess";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";
import type {
  AreaProportioning,
  CategoryJudgeResult,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
} from "./types";
import { getOwnershipStart } from "./utils/period-math";

export function judgeBuildingSiteLand(
  input: NonBusinessLandInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.BUILDING_SITE_MULTIPLIER];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(input.transferDate, ownershipStart));

  // 정착면적 미입력을 「비사업용」으로 삼키지 않는다 — 근거 없이 불리한 판정이 된다.
  const footprint = input.buildingFootprint ?? 0;
  if (footprint <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "건물 부수토지 비사업용 판정: 건물 바닥면적(㎡)을 입력하세요. " +
        "(「지방세법 시행령」 제101조 제1항 제2호 — 바닥면적 × 같은 조 제2항 적용배율)",
    );
  }

  // 배율·한도·초과분은 정본 헬퍼가 결정한다(추정 배율 금지 — 미등재 용도지역은 throw).
  const judged = judgeAppurtenantLandExcess({
    landArea: input.landArea,
    buildingFootprintArea: footprint,
    zoneType: input.zoneType,
    context: "건물 부수토지",
  });

  steps.push({
    id: "building_site_multiplier",
    label: "§101①2호 배율 결정",
    status: "PASS",
    detail:
      `${judged.multiplierDetail} → 허용면적 ${judged.allowedLandArea}㎡ ` +
      `(바닥면적 ${footprint}㎡ × ${judged.multiplier}배)`,
    legalBasis: NBL.BUILDING_SITE_MULTIPLIER,
  });

  const area: AreaProportioning = {
    totalArea: input.landArea,
    businessArea: Math.min(input.landArea, judged.allowedLandArea),
    nonBusinessArea: judged.nonBusinessArea,
    nonBusinessRatio: Math.round(judged.nonBusinessRatio * 10000) / 10000,
    buildingMultiplier: judged.multiplier,
  };

  if (judged.isWithinLimit) {
    steps.push({
      id: "building_site_area_check",
      label: "면적 검증",
      status: "PASS",
      detail: `${input.landArea}㎡ ≤ ${judged.allowedLandArea}㎡ → 전체 사업용`,
      legalBasis: NBL.BUILDING_SITE_MULTIPLIER,
    });
    return {
      isBusiness: true,
      reason: "건물 부수토지 배율 이내 → 사업용",
      steps,
      appliedLaws,
      areaProportioning: area,
      totalOwnershipDays,
      effectiveBusinessDays: totalOwnershipDays,
      gracePeriodDays: 0,
      businessUseRatio: 1,
      criteria: { rule2of3Years: true, rule5Years: false, rule80Percent: false },
      warnings,
    };
  }

  steps.push({
    id: "building_site_area_check",
    label: "면적 검증",
    status: "FAIL",
    detail:
      `${input.landArea}㎡ > ${judged.allowedLandArea}㎡ → 초과분 ${judged.nonBusinessArea}㎡ ` +
      `비사업용 (${Math.round(area.nonBusinessRatio * 100)}%)`,
    legalBasis: NBL.BUILDING_SITE_MULTIPLIER,
  });
  return {
    isBusiness: false,
    reason: `배율(${judged.multiplier}배) 초과 — 초과분 ${judged.nonBusinessArea}㎡ 비사업용`,
    steps,
    appliedLaws,
    areaProportioning: area,
    totalOwnershipDays,
    effectiveBusinessDays: totalOwnershipDays,
    gracePeriodDays: 0,
    businessUseRatio: area.nonBusinessRatio,
    criteria: { rule2of3Years: false, rule5Years: false, rule80Percent: false },
    warnings,
  };
}
