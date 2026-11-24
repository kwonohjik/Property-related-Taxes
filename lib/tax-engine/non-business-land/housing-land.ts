/**
 * 주택부수토지 판정 (§168-12, PDF p.1704 흐름도 1:1)
 *
 * 배율 (§168-12):
 *   - 도시지역 內 수도권 주·상·공: 3배
 *   - 도시지역 內 수도권 녹지 / 수도권 밖: 5배
 *   - 도시지역 外: 10배
 *
 * ⚠️ **건물(비주택) 부수토지는 여기서 처리하지 않는다** — 「지방세법 시행령」 §101①2호가
 * 소관이고 배율표가 다르다(수도권 축 없음). `building-site-land.ts` 참조.
 * 종전에는 `landType === "building_site"`를 이 모듈이 받아 주택 배율을 적용했다(A-BS-1, 2026-08-05 정정).
 */

import { areaRatio4 } from "../area-limit";
import { differenceInDays } from "../utc-date";
import { NBL } from "../legal-codes";
import type {
  AreaProportioning,
  CategoryJudgeResult,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
} from "./types";
import { HOUSING_METRO_DEFAULTED_WARNING, housingStateHistoryIsRead, judgeHousingLimit } from "./housing-limit";
import { applyHousingStateHistory } from "./housing-state-history";
import { getOwnershipStart } from "./utils/period-math";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE, NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE } from "../nbl-confirm-notices";
import { expropriationZoneBaseDateNotice } from "../appurtenant-land-rate";
import { applyGraceToNonBusinessRemainder } from "./other-land-merge";

/**
 * NBL2611-V10-P — 주택부수토지는 영 §168의12 배율 × 면적으로 판정한다. 배율 초과 상태는 양도일 현재 상태를 소유기간 전체에 적용하며(V2-C2),
 * 영 §168의6 기간기준은 **유예기간(영 §168의14①)만** 초과분에 반영한다(NBL2611-D1 · 리뷰 Q-3a (나) — 2026-07-31 방침(초과분 기간요건 일률)을 좁힘).
 * 유예 입력이 없거나 초과분이 없으면 기간기준을 판정하지 않은 것(`not_judged`)이다. 사용기간 입력·양도일 의제(§168의14②)는 이 지목에서 받지 않는다.
 * E3-③ — **배율 이내 분기**만 소유기간 중 신축·철거 이력(`landStateHistory.mode === "changed"`)을 일 단위로 판정한다(`housing-state-history.ts`). 배율 초과 분기는 그대로이고 이력은 반영하지 않는다(Q-3a (나) — 고지만).
 */
const HOUSING_PERIOD_EVALUATION = { basis: "not_judged", legalBasis: [NBL.HOUSING_MULTIPLIER] } as const;

export function judgeHousingLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.HOUSING_MULTIPLIER];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(input.transferDate, ownershipStart));

  const footprint = input.housingFootprint ?? 0;
  if (footprint <= 0) {
    steps.push({
      id: "housing_footprint",
      label: "주택 정착면적",
      status: "FAIL",
      detail: "정착면적 미입력",
      legalBasis: NBL.HOUSING_MULTIPLIER,
    });
    return {
      isBusiness: false,
      reason: "정착면적 미입력",
      steps,
      appliedLaws,
      totalOwnershipDays,
      effectiveBusinessDays: 0,
      gracePeriodDays: 0,
      businessUseRatio: 0,
      criteria: { rule2of3Years: false, rule5Years: false, rule80Percent: false },
      periodEvaluation: HOUSING_PERIOD_EVALUATION,
      warnings,
    };
  }

  // NBL2611-V2-C2 — 양도일 현재 상태(정착면적·토지면적)를 소유기간 전체에 적용한다. 고지는 판정이 실제로 도는 경로에만 싣는다.
  warnings.push(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  // NBL2611-V4-R — 영 §168의12 후단: 수용 양도(2025.11.28. 이후)의 배율 용도지역은 사업인정 고시일 전날 현재 용도지역이다.
  // 「사업인정 고시일 전에 해당 토지를 취득한 경우로 한정」 — 고시일 이후 취득이 명백하면 대상이 아니다. 고시일 미입력이면 확인 필요로 고지한다.
  const expr = input.unconditionalExemption;
  const acquiredAfterNotice = expr?.publicNoticeDate !== undefined && input.acquisitionDate >= expr.publicNoticeDate;
  if (expr?.isPublicExpropriation && !acquiredAfterNotice) {
    const zoneNotice = expropriationZoneBaseDateNotice({ transferCause: "public_expropriation", transferDate: input.transferDate });
    if (zoneNotice) warnings.push(zoneNotice);
  }

  // 배율·한도 계산은 `housing-limit.ts` 단일 소스(E3-③ D-12 — 과거 주택 구간 판정과 공유). isMetropolitanArea 미지정 시 수도권으로 보수적 처리 (납세자에게 불리한 쪽 적용).
  const { multiplier, multiplierDetail, allowedArea, limit, metroDefaulted } = judgeHousingLimit({
    zoneType: input.zoneType,
    isMetropolitanArea: input.isMetropolitanArea,
    transferDate: input.transferDate,
    footprint,
    landArea: input.landArea,
  });
  if (metroDefaulted) warnings.push(HOUSING_METRO_DEFAULTED_WARNING);

  steps.push({
    id: "housing_multiplier",
    label: "§168-12 배율 결정",
    status: "PASS",
    detail: `${multiplierDetail} → 허용면적 ${allowedArea}㎡ (정착면적 ${footprint}㎡ × ${multiplier}배)`,
    legalBasis: NBL.HOUSING_MULTIPLIER,
  });

  if (housingStateHistoryIsRead(limit)) {
    const area: AreaProportioning = {
      totalArea: input.landArea,
      businessArea: input.landArea,
      nonBusinessArea: 0,
      nonBusinessRatio: 0,
      buildingMultiplier: multiplier,
      legalBasis: [NBL.HOUSING_MULTIPLIER],
    };
    steps.push({
      id: "housing_area_check",
      label: "면적 검증",
      status: "PASS",
      detail: `${input.landArea}㎡ ≤ ${allowedArea}㎡ → 전체 사업용`,
      legalBasis: NBL.HOUSING_MULTIPLIER,
    });
    // E3-③ — 양도일 현재 배율 이내(전량 사업용)일 때만 소유기간 중 신축·철거 이력(`changed`)을 일 단위로 판정한다. 이력이 없으면 core 그대로(바이트 동일).
    return applyHousingStateHistory(
      {
        isBusiness: true,
        reason: "주택 부수 토지 배율 이내 → 사업용",
        steps,
        appliedLaws,
        areaProportioning: area,
        totalOwnershipDays,
        effectiveBusinessDays: totalOwnershipDays,
        gracePeriodDays: 0,
        businessUseRatio: 1,
        criteria: { rule2of3Years: true, rule5Years: false, rule80Percent: false },
        periodEvaluation: HOUSING_PERIOD_EVALUATION,
        warnings,
      },
      input,
      rules,
    );
  }

  const nonBusinessArea = limit.excess;
  const area: AreaProportioning = {
    totalArea: input.landArea,
    businessArea: allowedArea,
    nonBusinessArea,
    nonBusinessRatio: areaRatio4(nonBusinessArea, input.landArea),
    buildingMultiplier: multiplier,
    legalBasis: [NBL.HOUSING_MULTIPLIER],
  };
  steps.push({
    id: "housing_area_check",
    label: "면적 검증",
    status: "FAIL",
    detail: `${input.landArea}㎡ > ${allowedArea}㎡ → 초과분 ${nonBusinessArea}㎡ 비사업용 (${Math.round(area.nonBusinessRatio * 100)}%)`,
    legalBasis: NBL.HOUSING_MULTIPLIER,
  });
  const excessResult: CategoryJudgeResult = {
    isBusiness: false,
    reason: `배율(${multiplier}배) 초과 — 초과분 ${nonBusinessArea}㎡ 비사업용`,
    steps,
    appliedLaws,
    areaProportioning: area,
    totalOwnershipDays,
    effectiveBusinessDays: totalOwnershipDays,
    gracePeriodDays: 0,
    businessUseRatio: 1 - area.nonBusinessRatio,
    criteria: { rule2of3Years: false, rule5Years: false, rule80Percent: false },
    periodEvaluation: HOUSING_PERIOD_EVALUATION,
    warnings,
  };
  // NBL2611-D1 (V2-C1 · Q-3a (나)) — 초과분은 «빈 사업기간 + 유예기간»으로 기간기준을 본다(영 §168의14①). 충족하면 초과분이 사업용이 되어 전량 사업용이다.
  const { result, graceJudged } = applyGraceToNonBusinessRemainder(excessResult, input, rules, "housing");
  // E3-③ Q-3a (나) 경계 — 양도일 현재 배율 초과(부분 면적)는 판정·세액·echo를 바꾸지 않는다. 이력 `changed`이면 «이력 미반영» 고지(주택 변형 문구 — UI Low 1)만 더한다. `unknown`·`unchanged`·`""`는 고지도 없다(E0 compat G19 보존 —
  // 입력 화면은 이 분기에서 `unknown` 고지를 보이지 않는다: UI Low 2는 입력 화면을 결과에 맞춘다).
  const partialNotice = (r: CategoryJudgeResult): CategoryJudgeResult =>
    input.landStateHistory?.mode === "changed" ? { ...r, warnings: [...(r.warnings ?? []), NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE] } : r;
  if (!graceJudged) return partialNotice(excessResult);
  return partialNotice({
    ...result,
    // 유예로 사업용이 돼도 배율·면적 정보는 남긴다(사업용 면적 = 전체, 초과 0).
    areaProportioning: result.isBusiness
      ? { ...area, businessArea: input.landArea, nonBusinessArea: 0, nonBusinessRatio: 0, legalBasis: [NBL.HOUSING_MULTIPLIER, NBL.UNAVOIDABLE_PERIOD] }
      : result.areaProportioning,
    periodEvaluation: { basis: "state_at_transfer", legalBasis: [NBL.HOUSING_MULTIPLIER], graceJudged },
  });
}
