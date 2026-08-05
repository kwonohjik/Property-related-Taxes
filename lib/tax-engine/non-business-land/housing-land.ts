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

import { differenceInDays } from "date-fns";
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
      warnings,
    };
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
  const allowedArea = footprint * multiplier;

  steps.push({
    id: "housing_multiplier",
    label: "§168-12 배율 결정",
    status: "PASS",
    detail: `${multiplierDetail} → 허용면적 ${allowedArea}㎡ (정착면적 ${footprint}㎡ × ${multiplier}배)`,
    legalBasis: NBL.HOUSING_MULTIPLIER,
  });

  if (input.landArea <= allowedArea) {
    const area: AreaProportioning = {
      totalArea: input.landArea,
      businessArea: input.landArea,
      nonBusinessArea: 0,
      nonBusinessRatio: 0,
      buildingMultiplier: multiplier,
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
      warnings,
    };
  }

  const nonBusinessArea = input.landArea - allowedArea;
  const area: AreaProportioning = {
    totalArea: input.landArea,
    businessArea: allowedArea,
    nonBusinessArea,
    nonBusinessRatio: Math.round((nonBusinessArea / input.landArea) * 10000) / 10000,
    buildingMultiplier: multiplier,
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
    businessUseRatio: area.nonBusinessRatio,
    criteria: { rule2of3Years: false, rule5Years: false, rule80Percent: false },
    warnings,
  };
}
