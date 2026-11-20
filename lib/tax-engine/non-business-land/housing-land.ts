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

import { areaRatio4, areaTimes, judgeAreaLimit } from "../area-limit";
import { differenceInDays } from "../utc-date";
import { NBL } from "../legal-codes";
import type {
  AreaProportioning,
  CategoryJudgeResult,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
} from "./types";
import { getHousingMultiplier } from "./urban-area";
import { getOwnershipStart } from "./utils/period-math";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { expropriationZoneBaseDateNotice } from "../appurtenant-land-rate";

/** NBL2611-V10-P — 주택부수토지는 영 §168의12 배율 × 면적으로만 판정한다. 기간기준(영 §168의6)은 판정하지 않는다(2026-07-31 방침 · V2-C2). */
const HOUSING_PERIOD_EVALUATION = { basis: "not_judged", legalBasis: [NBL.HOUSING_MULTIPLIER] } as const;

export function judgeHousingLand(
  input: NonBusinessLandInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _rules: NonBusinessLandJudgmentRules,
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

  // isMetropolitanArea 미지정 시 수도권으로 보수적 처리 (납세자에게 불리한 쪽 적용)
  let isMetropolitan: boolean;
  if (input.isMetropolitanArea === undefined) {
    warnings.push(
      "수도권 여부(isMetropolitanArea) 미제공 — 보수적 기본값(수도권)으로 배율 산정. 수도권 여부를 명시하면 정확한 배율이 적용됩니다.",
    );
    isMetropolitan = true;
  } else {
    isMetropolitan = input.isMetropolitanArea;
  }
  // 영 §168의12 배율 경과조치(2022.1.1., 부칙 §39) — 양도일 기준.
  const { multiplier, detail: multiplierDetail } = getHousingMultiplier(
    input.zoneType,
    isMetropolitan,
    input.transferDate,
  );
  // NBL2611-V9-I — 한도·초과 면적은 정수 정확 비교(`area-limit.ts` 단일 소스).
  const allowedArea = areaTimes(footprint, multiplier);
  const limit = judgeAreaLimit(input.landArea, allowedArea);

  steps.push({
    id: "housing_multiplier",
    label: "§168-12 배율 결정",
    status: "PASS",
    detail: `${multiplierDetail} → 허용면적 ${allowedArea}㎡ (정착면적 ${footprint}㎡ × ${multiplier}배)`,
    legalBasis: NBL.HOUSING_MULTIPLIER,
  });

  if (limit.within) {
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
    return {
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
    };
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
  return {
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
}
