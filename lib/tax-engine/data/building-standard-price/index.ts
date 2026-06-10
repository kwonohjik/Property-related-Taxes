/**
 * 건물 기준시가 계산기 — 정적 데이터 barrel
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 + 부록 지수표(첨부 PDF). 법령 조문 아님.
 * 각 파일 상단 주석에 PDF 출처·실측 일자·모호 셀 표기.
 *
 * 전사 현황(2026-06-10):
 *   ✅ D1 new-building-base-price / D2 structure-index / D4 location-index /
 *      D5 residual-rate / D6 acq-base-rate / D7 special-adjustment-rate / D8 structure-group-map
 *   ◑ D9 mech-parking-formula (확정 연도 2001·02·2012~2026 / 2003~2011 D3 연동 대기)
 *   ◑ D3 usage-index (시대별 스킴 레지스트리: 2012~2026 전사 완료 / 2011~2001 대기 — 번호 체계 연도군별 상이)
 */

// D1 신축가격기준액
export {
  NEW_BUILDING_BASE_PRICE,
  NEW_BUILDING_BASE_PRICE_MIN_YEAR,
  NEW_BUILDING_BASE_PRICE_MAX_YEAR,
  resolveNewBuildingBasePrice,
} from "./new-building-base-price";

// D2 구조지수
export {
  STRUCTURE_INDEX_MIN_YEAR,
  STRUCTURE_INDEX_MAX_YEAR,
  resolveStructureIndex,
  listStructureOptions,
} from "./structure-index";

// D4 위치지수
export {
  LOCATION_INDEX_MIN_YEAR,
  LOCATION_INDEX_MAX_YEAR,
  hasLocationIndexYear,
  resolveLocationIndex,
} from "./location-index";

// D5 잔가율
export {
  RESIDUAL_RATE_STEP,
  RESIDUAL_RATE_MIN,
  RESIDUAL_RATE_DURABLE_YEARS,
  durableYearsToResidualGroup,
  calcResidualRate,
} from "./residual-rate";

// D7 조정율
export {
  ADJUSTMENT_RATE_BASE,
  ROOF_MATERIAL_RATE,
  MAX_FLOORS_RATE,
  GROSS_AREA_RATE,
  INTELLIGENT_BUILDING_RATE,
  HOUSE_TYPE_RATE,
  COMMERCIAL_FLOOR_RATE,
  ANCILLARY_RATE,
  COMMERCIAL_WITH_ANCILLARY_RATE,
  REMODEL_COUNT_RATE,
  WALLESS_RATE,
  STRUCTURAL_SAFETY_RATE,
  resolveMaxFloorsRate,
  resolveGrossAreaRate,
  resolveWallessRate,
} from "./special-adjustment-rate";

// D3 용도지수
export {
  USAGE_LABELS,
  USAGE_LABELS_59,
  USAGE_INDEX_MIN_YEAR,
  USAGE_INDEX_MAX_YEAR,
  hasUsageIndexYear,
  resolveUsageIndex,
  listUsageOptions,
} from "./usage-index";

// D6 산정기준율
export { ACQ_BASE_RATE, resolveAcqBaseRate } from "./acq-base-rate";

// D8 구조그룹맵
export {
  STRUCTURE_META,
  resolveResidualGroup,
  resolveAcqBaseGroup,
} from "./structure-group-map";
export type { StructureMeta } from "./structure-group-map";

// D9 기계식주차 산식
export {
  MECH_PARKING_FORMULA,
  resolveMechParkingFormula,
} from "./mech-parking-formula";
export type { MechParkingFormula } from "./mech-parking-formula";
