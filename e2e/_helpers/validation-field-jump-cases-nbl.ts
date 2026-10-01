/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 4 (nbl)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「nbl: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `lib/calc/transfer-tax-validate-nbl.ts`(비사업용 토지 정밀판정) · `-nbl-other.ts`(기타토지 §168의11).
 * 한 메시지 = 한 케이스. 행·유예 배열처럼 키가 동적인 메시지(`nblBusinessUsePeriods.0.startDate` 등)는
 * 정적 게이트(`transfer-validation-field-anchor-coverage`)가 읽지 못하므로 이 케이스가 유일한 안전망이다.
 */
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 0~3단계를 통과하는 농지 정밀판정(지목 농지·농림지역·자경 ON) — probe 실측 */
const nbl = (patch: Record<string, unknown> = {}) => () =>
  withPrimary({
    assetKind: "land",
    landNature: "farmland",
    acquisitionArea: "1000",
    transferArea: "1000",
    // 상세 입력 섹션의 렌더 게이트는 `isNonBusinessLand && nblUseDetailedJudgment` 둘 다다(`AssetSectionExtras`).
    // 토글을 끄면 `nblUseDetailedJudgment`도 함께 꺼지므로(SpecialSituationSection) 두 플래그는 같이 켠다.
    isNonBusinessLand: true,
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    nblFarmingSelf: true,
    ...patch,
  });

/** 도시지역 농지 — 소재지가 「시」라 읍·면 구분이 판정을 가른다(안성시) */
const urbanFarm = (patch: Record<string, unknown> = {}) =>
  nbl({ nblZoneType: "general_residential", nblLandSigunguCode: "41550", nblLandSigunguName: "안성시", ...patch });

/** 기타토지 — 재산세 과세 분류를 골라 둔 상태 */
const other = (patch: Record<string, unknown> = {}) =>
  nbl({ nblLandType: "other_land", nblOtherPropertyTaxType: "separate", ...patch });

/** 기타토지 + 수입금액비율 업종 선택 */
const revenue = (patch: Record<string, unknown> = {}) =>
  other({ nblRevenueBusinessType: "parking_operation", nblRevenueCurrentRevenue: "10000000", nblRevenueCurrentLandValue: "100000000", ...patch });

/** 기타토지 + 공장 부수토지 — 읍·면/산업단지 경로 */
const factory = (patch: Record<string, unknown> = {}) =>
  other({ nblFactoryEnabled: true, nblFactoryLocationCategory: "eup_myeon_or_complex", nblFactoryTotalLandArea: "5000", ...patch });

const seg = (patch: Record<string, unknown> = {}) => ({ id: "seg-1", industryLabel: "", floorArea: "1000", ratePercent: "40", ...patch });
const emptyRow = { startDate: "", endDate: "", usageType: "자경" };

export const NBL_FIELD_JUMP_CASES: FieldJumpCase[] = [
  // ── transfer-tax-validate-nbl.ts ──────────────────────────────────────────
  { name: "nbl: 지목", field: "nblLandType", step: 0, assetIndex: A, message: /^자산: 비사업용 토지 정밀판정을 선택했습니다\. 지목을/, form: nbl({ nblLandType: "" }) },
  { name: "nbl: 용도지역", field: "nblZoneType", step: 0, assetIndex: A, message: /^자산: 비사업용 토지 정밀판정 — 용도지역을/, form: nbl({ nblZoneType: "" }) },
  { name: "nbl: 토지 면적", field: "acquisitionArea", step: 0, assetIndex: A, message: /^자산: 비사업용 토지 판정을 위해 토지 면적/, form: nbl({ acquisitionArea: "" }) },
  { name: "nbl: 결격 과세기간 형식", field: "nblDisqualifiedTaxPeriods", step: 0, assetIndex: A, message: /^자산: 결격 과세기간\(조특령 §66⑭\)은 4자리 연도를/, form: nbl({ nblDisqualifiedTaxPeriods: "abc" }) },
  { name: "nbl: 결격 과세기간 범위", field: "nblDisqualifiedTaxPeriods", step: 0, assetIndex: A, message: /^자산: 결격 과세기간\(조특령 §66⑭\)은 취득연도\(2015\)부터/, form: nbl({ nblDisqualifiedTaxPeriods: "1990" }) },
  {
    name: "nbl: 수도권 여부", field: "nblIsMetropolitanArea", step: 0, assetIndex: A, message: /^자산: 주택부수토지 도시지역 주·상·공은 수도권 여부/,
    form: nbl({ nblLandType: "housing_site", nblZoneType: "general_residential", nblIsMetropolitanArea: "", nblHousingFootprint: "100" }),
  },
  {
    name: "nbl: 정착면적 (주택부수토지)", field: "nblHousingFootprint", step: 0, assetIndex: A, message: /^자산: 주택부수토지 — 주택 정착면적/,
    form: nbl({ nblLandType: "housing_site", nblZoneType: "general_residential", nblIsMetropolitanArea: "yes", nblHousingFootprint: "" }),
  },
  {
    name: "nbl: 정착면적 (별장 부속토지)", field: "nblHousingFootprint", step: 0, assetIndex: A, message: /^자산: 별장 부속토지 — 주택 정착면적/,
    form: nbl({ nblLandType: "villa_land", nblZoneType: "general_residential", nblIsMetropolitanArea: "yes", nblHousingFootprint: "" }),
  },
  { name: "nbl: 소재지 행정구역 단위", field: "nblLandDivision", step: 0, assetIndex: A, message: /^자산: 도시지역 농지 — 소재지 행정구역 단위/, form: urbanFarm({ nblLandDivision: "" }) },
  { name: "nbl: 도시지역 편입일", field: "nblUrbanIncorporationDate", step: 0, assetIndex: A, message: /^자산: 도시지역 농지 — 도시지역 편입일을/, form: urbanFarm({ nblLandDivision: "dong", nblUrbanIncorporationDate: "" }) },
  { name: "nbl: 양도일 의제일", field: "nblDeemedTransferDate", step: 0, assetIndex: A, message: /^자산: 양도일 의제 사유를 선택했습니다/, form: nbl({ nblDeemedTransferReason: "auction", nblDeemedTransferDate: "" }) },

  // 수입금액비율(§168의11②)
  { name: "nbl: 수입금액", field: "nblRevenueCurrentRevenue", step: 0, assetIndex: A, message: /^자산: 수입금액비율 업종 선택 시 당해 과세기간 수입금액/, form: revenue({ nblRevenueCurrentRevenue: "" }) },
  { name: "nbl: 당해 토지가액", field: "nblRevenueCurrentLandValue", step: 0, assetIndex: A, message: /^자산: 수입금액비율 업종 선택 시 당해 토지가액/, form: revenue({ nblRevenueCurrentLandValue: "" }) },
  { name: "nbl: 공통수입금액", field: "nblRevenueCommonRevenue", step: 0, assetIndex: A, message: /^자산: 공통수입 안분 시 당해 공통수입금액/, form: revenue({ nblRevenueCommonApportion: true }) },
  {
    name: "nbl: 그 밖의 토지가액", field: "nblRevenueOtherLandValue", step: 0, assetIndex: A, message: /^자산: 공통수입 안분 시 당해 '그 밖의 토지가액'/,
    form: revenue({ nblRevenueCommonApportion: true, nblRevenueCommonRevenue: "5000000" }),
  },
  {
    name: "nbl: 직전 공통쌍 — 그 밖의 토지가액이 빔", field: "nblRevenuePriorOtherLandValue", step: 0, assetIndex: A, message: /^자산: 직전 공통수입 안분은 공통수입금액과/,
    form: revenue({ nblRevenueCommonApportion: true, nblRevenueCommonRevenue: "5000000", nblRevenueOtherLandValue: "50000000", nblRevenuePriorCommonRevenue: "3000000" }),
  },
  {
    name: "nbl: 직전 공통쌍 — 공통수입금액이 빔", field: "nblRevenuePriorCommonRevenue", step: 0, assetIndex: A, message: /^자산: 직전 공통수입 안분은 공통수입금액과/,
    form: revenue({ nblRevenueCommonApportion: true, nblRevenueCommonRevenue: "5000000", nblRevenueOtherLandValue: "50000000", nblRevenuePriorOtherLandValue: "30000000" }),
  },

  // 행 단위(기간·이력) — 키가 동적(`배열.i.startDate`)
  { name: "nbl: 자경기간 시작일", field: "nblBusinessUsePeriods.0.startDate", step: 0, assetIndex: A, message: /^자산: 사업용 사용기간\(자경 등\) 1번째 행 — 시작일/, form: nbl({ nblBusinessUsePeriods: [{ ...emptyRow }] }) },
  { name: "nbl: 자경기간 종료일", field: "nblBusinessUsePeriods.0.endDate", step: 0, assetIndex: A, message: /^자산: 사업용 사용기간\(자경 등\) 1번째 행 — 종료일/, form: nbl({ nblBusinessUsePeriods: [{ ...emptyRow, startDate: "2016-01-01" }] }) },
  { name: "nbl: 축산기간 시작일", field: "nblPastureLivestockPeriods.0.startDate", step: 0, assetIndex: A, message: /^자산: 목장 축산기간 1번째 행 — 시작일/, form: nbl({ nblLandType: "pasture", nblPastureLivestockPeriods: [{ ...emptyRow }] }) },
  { name: "nbl: 축산기간 종료일", field: "nblPastureLivestockPeriods.0.endDate", step: 0, assetIndex: A, message: /^자산: 목장 축산기간 1번째 행 — 종료일/, form: nbl({ nblLandType: "pasture", nblPastureLivestockPeriods: [{ ...emptyRow, startDate: "2016-01-01" }] }) },
  { name: "nbl: 별장 사용기간 시작일", field: "nblVillaUsePeriods.0.startDate", step: 0, assetIndex: A, message: /^자산: 별장 사용기간 1번째 행 — 시작일/, form: nbl({ nblLandType: "villa_land", nblHousingFootprint: "100", nblVillaUsePeriods: [{ ...emptyRow }] }) },
  { name: "nbl: 별장 사용기간 종료일", field: "nblVillaUsePeriods.0.endDate", step: 0, assetIndex: A, message: /^자산: 별장 사용기간 1번째 행 — 종료일/, form: nbl({ nblLandType: "villa_land", nblHousingFootprint: "100", nblVillaUsePeriods: [{ ...emptyRow, startDate: "2016-01-01" }] }) },
  {
    name: "nbl: 거주 이력 시작일", field: "nblResidenceHistories.0.startDate", step: 0, assetIndex: A, message: /^자산: 거주 이력 1번째 행 — 시작일/,
    form: nbl({ nblResidenceHistories: [{ sigunguCode: "", sigunguName: "", startDate: "", endDate: "", hasResidentRegistration: false }] }),
  },
  {
    name: "nbl: 거주 이력 종료일", field: "nblResidenceHistories.0.endDate", step: 0, assetIndex: A, message: /^자산: 거주 이력 1번째 행 — 종료일/,
    form: nbl({ nblResidenceHistories: [{ sigunguCode: "", sigunguName: "", startDate: "2016-01-01", endDate: "", hasResidentRegistration: false }] }),
  },

  // 부득이한 사유 유예기간 — 사유별 필수 일자
  { name: "nbl: 유예 5호 착공일", field: "nblGracePeriods.0.secondaryDate", step: 0, assetIndex: A, message: /^자산: 건설 착공\(5호\) 유예기간 — 착공일/, form: nbl({ nblGracePeriods: [{ reasonCode: "construction_in_progress", anchorDate: "", endDate: "", description: "" }] }) },
  { name: "nbl: 유예 기산일", field: "nblGracePeriods.0.anchorDate", step: 0, assetIndex: A, message: /^자산: 건축물 멸실·철거·붕괴 \(9호\) 유예기간 — 기산일/, form: nbl({ nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "", endDate: "", description: "" }] }) },
  { name: "nbl: 유예 개시일", field: "nblGracePeriods.0.anchorDate", step: 0, assetIndex: A, message: /^자산: 법령상 사용 금지·제한 유예기간 — 개시일/, form: nbl({ nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "", endDate: "", description: "" }] }) },
  { name: "nbl: 유예 종료일", field: "nblGracePeriods.0.endDate", step: 0, assetIndex: A, message: /^자산: 법령상 사용 금지·제한 유예기간 — 종료일/, form: nbl({ nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2020-01-01", endDate: "", description: "" }] }) },

  // ── transfer-tax-validate-nbl-other.ts (기타토지 §168의11) ─────────────────
  { name: "nbl: 재산세 과세 분류", field: "nblOtherPropertyTaxType", step: 0, assetIndex: A, message: /^자산: 기타토지 — 재산세 과세 분류/, form: other({ nblOtherPropertyTaxType: "" }) },
  { name: "nbl: 건축물 바닥면적", field: "nblOtherBuildingFloorArea", step: 0, assetIndex: A, message: /^자산: 기타토지 — 건축물 바닥면적/, form: other({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "" }) },
  { name: "nbl: 부설주차장 기준면적", field: "nblOtherStandardAreaLimit", step: 0, assetIndex: A, message: /^자산: 선택한 호의 기준면적/, form: other({ nblOtherRelatedBusinessType: "parking_attached" }) },
  { name: "nbl: 휴양시설", field: "nblOtherResortOutdoorArea", step: 0, assetIndex: A, message: /^자산: 휴양시설 — 옥외방목장/, form: other({ nblOtherRelatedBusinessType: "resort" }) },
  { name: "nbl: 종업원 체육시설 — 종업원 수가 빔", field: "nblOtherEmployeeCount", step: 0, assetIndex: A, message: /^자산: 종업원 체육시설 — 종업원 수와 보유 시설/, form: other({ nblOtherRelatedBusinessType: "sports", nblOtherSportsCategory: "employee" }) },
  {
    name: "nbl: 종업원 체육시설 — 시설 선택이 빔(직접입력 칸으로)", field: "nblOtherStandardAreaLimit", step: 0, assetIndex: A, message: /^자산: 종업원 체육시설 — 종업원 수와 보유 시설/,
    form: other({ nblOtherRelatedBusinessType: "sports", nblOtherSportsCategory: "employee", nblOtherEmployeeCount: "30" }),
  },
  { name: "nbl: 체육시설 종목", field: "nblOtherSportsFacilityType", step: 0, assetIndex: A, message: /^자산: 체육시설 — 종목을 선택하거나/, form: other({ nblOtherRelatedBusinessType: "sports", nblOtherSportsCategory: "workplace" }) },
  { name: "nbl: 예비군훈련장", field: "nblOtherReserveUnitSize", step: 0, assetIndex: A, message: /^자산: 예비군훈련장 — 부대편성인원/, form: other({ nblOtherRelatedBusinessType: "reserve_forces" }) },
  { name: "nbl: 하치장", field: "nblOtherMaxAnnualArea", step: 0, assetIndex: A, message: /^자산: 하치장 — 매년 최대 사용면적/, form: other({ nblOtherRelatedBusinessType: "hatchang" }) },
  { name: "nbl: 청소년수련시설", field: "nblOtherYouthCapacity", step: 0, assetIndex: A, message: /^자산: 청소년수련시설 — 수용정원/, form: other({ nblOtherRelatedBusinessType: "youth_training" }) },
  { name: "nbl: 업무용자동차 주차장", field: "nblOtherMinGarageArea", step: 0, assetIndex: A, message: /^자산: 업무용자동차 주차장 — 최저차고기준면적/, form: other({ nblOtherRelatedBusinessType: "parking_garage" }) },

  // 연접 다필지(§168의11⑤)
  { name: "nbl: 다필지 없음", field: "nblOtherParcels", step: 0, assetIndex: A, message: /^자산: 연접 다필지 입력을 켰습니다/, form: other({ nblOtherUseParcels: true, nblOtherParcels: [] }) },
  {
    name: "nbl: 다필지 면적", field: "nblOtherParcels.0.landArea", step: 0, assetIndex: A, message: /^자산: 연접 다필지 — 필지 1의 면적/,
    form: other({ nblOtherUseParcels: true, nblOtherParcels: [{ id: "p1", landArea: "", acquisitionDate: "2016-01-01", hasBuilding: false, buildingFootprintArea: "" }] }),
  },
  {
    name: "nbl: 다필지 취득일", field: "nblOtherParcels.0.acquisitionDate", step: 0, assetIndex: A, message: /^자산: 연접 다필지 — 필지 1의 취득일/,
    form: other({ nblOtherUseParcels: true, nblOtherParcels: [{ id: "p1", landArea: "500", acquisitionDate: "", hasBuilding: false, buildingFootprintArea: "" }] }),
  },
  {
    name: "nbl: 다필지 건축물 바닥면적", field: "nblOtherParcels.0.buildingFootprintArea", step: 0, assetIndex: A, message: /^자산: 연접 다필지 — 필지 1은 건축물이 있어/,
    form: other({ nblOtherUseParcels: true, nblOtherParcels: [{ id: "p1", landArea: "500", acquisitionDate: "2016-01-01", hasBuilding: true, buildingFootprintArea: "" }] }),
  },

  // 복합용도 건축물 안분(§168의11⑥) — 건축물이 있어야 화면에 나온다
  { name: "nbl: 복합용도 단일건물 분자", field: "nblOtherMixedUseSpecificFloorArea", step: 0, assetIndex: A, message: /^자산: 복합용도 건축물 안분 — 특정용도분 면적과 전체/, form: other({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "100", nblOtherMixedUseMode: "single_building" }) },
  {
    name: "nbl: 복합용도 단일건물 분모", field: "nblOtherMixedUseTotalFloorArea", step: 0, assetIndex: A, message: /^자산: 복합용도 건축물 안분 — 특정용도분 면적과 전체/,
    form: other({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "100", nblOtherMixedUseMode: "single_building", nblOtherMixedUseSpecificFloorArea: "50" }),
  },
  {
    name: "nbl: 복합용도 단일건물 분자>분모", field: "nblOtherMixedUseSpecificFloorArea", step: 0, assetIndex: A, message: /^자산: 복합용도 건축물 안분 — 특정용도분 면적은 전체 면적을 초과/,
    form: other({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "100", nblOtherMixedUseMode: "single_building", nblOtherMixedUseSpecificFloorArea: "80", nblOtherMixedUseTotalFloorArea: "50" }),
  },
  { name: "nbl: 복합용도 다수건물 분자", field: "nblOtherMixedUseSpecificFootprint", step: 0, assetIndex: A, message: /^자산: 복합용도 건축물 안분 — 특정용도분 면적과 전체/, form: other({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "100", nblOtherMixedUseMode: "multiple_buildings" }) },
  {
    name: "nbl: 복합용도 다수건물 분모", field: "nblOtherMixedUseTotalFootprint", step: 0, assetIndex: A, message: /^자산: 복합용도 건축물 안분 — 특정용도분 면적과 전체/,
    form: other({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "100", nblOtherMixedUseMode: "multiple_buildings", nblOtherMixedUseSpecificFootprint: "50" }),
  },

  // 공장 부수토지(§102①1호 별표6 / §101①1호)
  { name: "nbl: 공장 소재 지역", field: "nblFactoryLocationCategory", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 소재 지역을 선택하세요/, form: factory({ nblFactoryLocationCategory: "" }) },
  { name: "nbl: 공장 전체 부속토지 면적", field: "nblFactoryTotalLandArea", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 공장 전체\(하나의 울타리 기준\)/, form: factory({ nblFactoryTotalLandArea: "" }) },
  { name: "nbl: 공장 업종 없음", field: "nblFactorySegments", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 공장건축물 연면적\(㎡\)과 업종별/, form: factory({ nblFactorySegments: [] }) },
  { name: "nbl: 공장 업종 연면적", field: "nblFactorySegments.0.floorArea", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 업종의 공장건축물 연면적/, form: factory({ nblFactorySegments: [seg({ floorArea: "" })] }) },
  { name: "nbl: 공장 업종 기준공장면적률", field: "nblFactorySegments.0.ratePercent", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 업종의 기준공장면적률/, form: factory({ nblFactorySegments: [seg({ ratePercent: "" })] }) },
  {
    name: "nbl: 공장 종업원용 체육시설 — 종업원수", field: "nblFactorySportsEmployeeCount", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 종업원용 체육시설용지를 입력했습니다/,
    form: factory({ nblFactorySegments: [seg()], nblFactorySportsPlaygroundArea: "100" }),
  },
  {
    name: "nbl: 공장 종업원용 체육시설 — 사업주체", field: "nblFactorySportsEntityType", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 종업원 30명\(50명 이하\)입니다/,
    form: factory({ nblFactorySegments: [seg()], nblFactorySportsPlaygroundArea: "100", nblFactorySportsEmployeeCount: "30" }),
  },
  { name: "nbl: 공장 바닥면적", field: "nblFactoryFootprintArea", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 공장용 건축물 바닥면적/, form: factory({ nblFactoryLocationCategory: "urban_other", nblZoneType: "general_residential" }) },
  {
    name: "nbl: 공장 용도지역 배율 없음", field: "nblZoneType", step: 0, assetIndex: A, message: /^자산: 공장 부수토지 — 용도지역 "residential"은/,
    form: factory({ nblFactoryLocationCategory: "urban_other", nblFactoryFootprintArea: "1000", nblZoneType: "residential" }),
    unreachableInUi:
      "용도지역 선택지(`NblSectionContainer` ZONE_TYPE_OPTIONS 11종)는 전부 적용배율표에 있다 — 표에 없는 값(세분 전 `residential`)은 옛 저장 폼으로만 들어온다",
  },
];
