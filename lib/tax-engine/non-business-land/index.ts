/**
 * 비사업용 토지 판정 v2 엔진 — 공개 API barrel.
 */

export * from "./types";

// 유틸
export {
  mergeOverlappingPeriods,
  sumDaysInWindow,
  getOverlappingPeriods,
  invertPeriods,
  getOwnershipStart,
} from "./utils/period-math";

// 주거 이력
export { computeResidencePeriods, fallbackResidenceFromDistance } from "./residence";
export type { ComputeResidenceOptions } from "./residence";

// 기간기준
export {
  meetsPeriodCriteria,
  checkIncorporationGrace,
  getThresholdRatio,
} from "./period-criteria";
export type {
  PeriodCriteriaResult,
  PeriodCriteriaUsed,
  IncorporationGraceResult,
} from "./period-criteria";

// 도시지역
export {
  isUrbanResidentialCommercialIndustrial,
  isUrbanForFarmland,
  isUrbanForPasture,
  isUrbanForForest,
  isUrbanForHousing,
  getHousingMultiplier,
} from "./urban-area";

// 지목 분류
export { classifyLandCategory, getLandCategoryGroup } from "./land-category";
export type { LandCategoryResult } from "./land-category";

// 무조건 의제
export { checkUnconditionalExemption } from "./unconditional-exemption";
export type { UnconditionalExemptionResult } from "./unconditional-exemption";

// 지목별 judge
export { judgeFarmland, checkFarmlandDeeming } from "./farmland";
export { judgeForest } from "./forest";
export { judgePasture } from "./pasture";
export { judgeHousingLand } from "./housing-land";
export { judgeVillaLand } from "./villa-land";
export { judgeOtherLand, isBareLand } from "./other-land";

// 메인 엔진
export {
  judgeNonBusinessLand,
  createBusinessResult,
  createNonBusinessResult,
} from "./engine";
