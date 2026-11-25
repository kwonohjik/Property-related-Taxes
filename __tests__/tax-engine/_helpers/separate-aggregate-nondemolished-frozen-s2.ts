/**
 * PSA-S2 — **동결 복제본**: master e9ab93fb0 의 `lib/tax-engine/separate-aggregate-land.ts` `isSeparateAggregateLand` 중 **비철거(`demolished !== true`) 분기**를
 * 한 글자도 바꾸지 않고(이름에 `frozen` 접두만) 옮긴 것이다. **수정 금지.** (철거 분기는 이번 PR이 건드리지 않는다 — 별도 anchor가 허가 칸을 읽지 않음을 지킨다.)
 * 새 «허가 우선» 판정(허가 접힘을 `hasBuilding`·`calculateBaseArea` 앞으로)과의 판정 동치·완화만·throw 0 비교용 — 테스트 전용 fixture(프로덕션 import 금지).
 * 기준면적(`calculateBaseArea`)·고지 문구·허가 술어는 실제 모듈의 것을 그대로 import한다(이번 PR에서 바뀌지 않는다).
 */
import { PROPERTY_SEPARATE } from "../../../lib/tax-engine/legal-codes";
import { calculateBaseArea } from "../../../lib/tax-engine/separate-aggregate-land";
import type { LandSeparateCheckResult, SeparateAggregateLandItem } from "../../../lib/tax-engine/separate-aggregate-land";
import { PROPERTY_BUILDING_PERMIT_NO_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { propertyBuildingPermitHolds } from "../../../lib/tax-engine/property-separate-requirements";
import { parseISO } from "../../../lib/tax-engine/utc-date";

export function frozenIsSeparateAggregateLandNonDemolished(land: SeparateAggregateLandItem & { taxBaseDate: string }): LandSeparateCheckResult {
  const warnings: string[] = [];
  const taxBaseDate = land.taxBaseDate;

  // ── 1단계: 건축물 존재 여부 ──
  const hasBuilding = land.buildingFloorArea !== undefined && land.buildingFloorArea > 0;

  if (!hasBuilding) {
    return {
      landId: land.id,
      isSeparateAggregate: false,
      recognizedArea: 0,
      excessArea: land.landArea,
      baseArea: 0,
      multiplier: 0,
      demolishedGraceApplied: false,
      legalBasis: PROPERTY_SEPARATE.SUBJECT,
      warnings: ["건축물이 없는 토지는 종합합산과세대상입니다."],
    };
  }

  // ── 4단계: 기준면적 계산 및 면적 분리 ──
  const { baseArea, multiplier, legalBasis: areaLegal } = calculateBaseArea(land);

  if (baseArea <= 0) {
    return {
      landId: land.id,
      isSeparateAggregate: false,
      recognizedArea: 0,
      excessArea: land.landArea,
      baseArea: 0,
      multiplier,
      demolishedGraceApplied: false,
      legalBasis: areaLegal,
      warnings: [...warnings, "기준면적을 산정할 수 없어 종합합산으로 처리합니다."],
    };
  }

  if (!propertyBuildingPermitHolds({ taxBaseDate: parseISO(taxBaseDate), permit: land.buildingPermit })) {
    return {
      landId: land.id,
      isSeparateAggregate: false,
      recognizedArea: 0,
      excessArea: land.landArea,
      baseArea: 0,
      multiplier,
      demolishedGraceApplied: false,
      legalBasis: PROPERTY_SEPARATE.BUILDING_PERMIT_101,
      warnings: [...warnings, land.buildingPermit === "no" ? PROPERTY_BUILDING_PERMIT_NO_NOTICE : PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE],
      buildingPermitFolded: true,
    };
  }

  const recognizedArea = Math.min(land.landArea, baseArea);
  const excessArea = Math.max(0, land.landArea - baseArea);

  if (excessArea > 0) {
    warnings.push(
      `토지 ${land.landArea}㎡ 중 ${recognizedArea}㎡는 별도합산, ` +
      `${excessArea}㎡는 기준면적 초과로 종합합산에 이관됩니다.`,
    );
  }

  return {
    landId: land.id,
    isSeparateAggregate: recognizedArea > 0,
    recognizedArea,
    excessArea,
    baseArea,
    multiplier,
    demolishedGraceApplied: false,
    legalBasis: areaLegal,
    warnings,
  };
}
