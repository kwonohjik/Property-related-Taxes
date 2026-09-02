import { z } from "zod";

// ─── NBL 정밀판정 raw 페이로드 (⑫) — store nbl* 평면 1:1 ──────────
// 아키텍처 B: 클라이언트가 raw 평면을 전송 → route가 mapAssetToNblInput로 nested+Date 변환.
// 날짜는 z.string()(빈 문자열 허용) — route의 toOptionalDate/toDate가 변환(z.string().date()는 ""거부).

/** raw 기간 항목 (사업용/축산/별장 공용 — usageType·type·description 모두 optional 수용) */
const nblPeriodRawSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  usageType: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
});

/** raw 유예기간 항목 (§168의14①·§83의5①) — 종료일은 엔진이 사유별 법정기간으로 자동산정 */
const nblGracePeriodRawSchema = z.object({
  reasonCode: z.string(),
  anchorDate: z.string().optional(),
  endDate: z.string().optional(),
  secondaryDate: z.string().optional(),
  secondaryEndDate: z.string().optional(),
  description: z.string().optional(),
});

/** §168의11⑤ 연접 다필지 raw 항목 (전부 z.string() — route의 parseRawNumber/toOptionalDate가 변환). superRefine 금지: off 상태 stale 항목 거부 방지(검증은 validate ⑧에서 nblOtherUseParcels 게이트). */
const nblOtherParcelRawSchema = z.object({
  id: z.string(),
  landArea: z.string(),
  acquisitionDate: z.string(),
  hasBuilding: z.boolean(),
  buildingFootprintArea: z.string().optional(),
});

/** raw 거주이력 항목 */
const nblResidenceHistoryRawSchema = z.object({
  sigunguCode: z.string().optional(),
  sigunguName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  hasResidentRegistration: z.boolean(),
  // 거주지 좌표 (직선거리 30km 재촌 판정, §153③3호) — 주소검색 파생. string→number는 form-mapper.
  lat: z.string().optional(),
  lng: z.string().optional(),
});

/** 별표6 2호다 — 업종별 (연면적, 기준공장면적률). 값은 UI 문자열 그대로, 파싱은 form-mapper. */
const nblFactorySegmentRawSchema = z.object({
  id: z.string(),
  floorArea: z.string(),
  ratePercent: z.string(),
  industryLabel: z.string().optional(),
});

/** NBL 지목 — UI 노출 6값. 무조건 사업용 의제(§168의14③) 성립 시 빌더가 지목 "" 로 전송 → "" 허용 */
export const NBL_UI_LAND_TYPE_VALUES = [
  "farmland", "forest", "pasture", "housing_site", "villa_land", "other_land",
] as const;

export const nonBusinessLandRawSchema = z.object({
  // 필수 (빌더 가드: nblUseDetailedJudgment && acquisitionArea && acquisitionDate,
  //  + 지목·용도지역은 무조건 의제 미성립 시 필수 — 의제 성립 시 "" 허용)
  nblUseDetailedJudgment: z.boolean(),
  nblLandType: z.enum(NBL_UI_LAND_TYPE_VALUES).or(z.literal("")),
  nblZoneType: z.string(),
  acquisitionArea: z.string(),
  acquisitionDate: z.string(),
  transferDate: z.string(),
  // 공익수용 단일 소스 (서버 isExpr·고시일 fallback) — z.object strip 방지
  transferCause: z.enum(["general", "public_expropriation"]).optional(),
  expropriationNoticeDate: z.string().optional(),
  // ⑫ §164⑨ 1호 환산 min[] 특례 3후보 — **컴패니언 자산 지원**(계획 Q5).
  // 누락 시 z.object가 조용히 strip → `buildCompanionEngineInputs`가 undefined를 실어 특례 미발동.
  // 게이트는 엔진이 판정(적격 자산·환산·수용·2009.02.04·후보>0).
  standardPricePerSqmAtTransfer: z.number().int().nonnegative().optional(),
  transferArea: z.number().nonnegative().optional(),
  compensationPerSqm: z.number().int().nonnegative().optional(),
  compensationBasisStdPrice: z.number().int().nonnegative().optional(),
  // ⑫ §164⑨2호 공매·경락 특례 — 컴패니언 지원(P4, 1호와 대칭). 누락 시 침묵 strip.
  isAuctionTransfer: z.boolean().optional(),
  auctionPrice: z.number().int().nonnegative().optional(),
  // ⑫ §164⑨1호 주택 총액 트랙 — 컴패니언 지원(P5). 누락 시 침묵 strip.
  housingCompensationTotal: z.number().int().nonnegative().optional(),
  housingCompensationBasisTotal: z.number().int().nonnegative().optional(),
  // §168의14③3호나목 취득일 소급 — 상속=피상속인 취득일 / 이월과세=증여자 취득일 (strip 방지)
  acquisitionCause: z.string().optional(),
  decedentAcquisitionDate: z.string().optional(),
  donorAcquisitionDate: z.string().optional(),
  // 공통
  nblDeemedTransferReason: z.string().optional(),
  nblDeemedTransferDate: z.string().optional(),
  nblUrbanIncorporationDate: z.string().optional(),
  nblIsMetropolitanArea: z.string().optional(),
  nblLandDivision: z.string().optional(),
  nblOwnershipRatio: z.string().optional(),
  nblFarmerResidenceDistance: z.string().optional(),
  nblLandSigunguCode: z.string().optional(),
  nblLandSigunguName: z.string().optional(),
  // 농지 좌표 (직선거리 30km 재촌 판정 기준점) — 양도 물건 주소검색 파생. string→number는 form-mapper.
  nblLandLat: z.string().optional(),
  nblLandLng: z.string().optional(),
  // 농지
  nblFarmingSelf: z.boolean().optional(),
  nblFarmlandIsWeekendFarm: z.boolean().optional(),
  nblFarmlandIsConversionApproved: z.boolean().optional(),
  nblFarmlandIsFarmDevZone: z.boolean().optional(),
  nblFarmlandIsMarginalFarm: z.boolean().optional(),
  nblFarmlandIsReclaimedLand: z.boolean().optional(),
  nblFarmlandIsPublicProjectUse: z.boolean().optional(),
  nblFarmlandIsSickElderlyRental: z.boolean().optional(),
  // 임야
  nblForestHasPlan: z.boolean().optional(),
  nblForestIsPublicInterest: z.boolean().optional(),
  nblForestIsProtected: z.boolean().optional(),
  nblForestIsSuccessor: z.boolean().optional(),
  nblForestInheritedWithin3Years: z.boolean().optional(),
  nblForestInheritanceDate: z.string().optional(),
  // 목장
  nblPastureIsLivestockOperator: z.boolean().optional(),
  nblPastureLivestockType: z.string().optional(),
  nblPastureHasFacility: z.boolean().optional(),
  nblPastureHasGrassland: z.boolean().optional(),
  nblPastureHasFodder: z.boolean().optional(),
  nblPastureLivestockCount: z.string().optional(),
  nblPastureLivestockPeriods: z.array(nblPeriodRawSchema).optional(),
  nblPastureInheritanceDate: z.string().optional(),
  nblPastureIsSpecialOrgUse: z.boolean().optional(),
  // 주택부속
  nblHousingFootprint: z.string().optional(),
  // 별장
  nblVillaUsePeriods: z.array(nblPeriodRawSchema).optional(),
  nblVillaIsEupMyeon: z.boolean().optional(),
  nblVillaIsRuralHousing: z.boolean().optional(),
  nblVillaBuildingFloorArea: z.string().optional(),
  nblVillaAttachedLandArea: z.string().optional(),
  nblVillaCombinedStdValue: z.string().optional(),
  nblVillaIsInRestrictedArea: z.boolean().optional(),
  nblVillaIsAfter20150101: z.boolean().optional(),
  // 기타토지
  nblOtherPropertyTaxType: z.string().optional(),
  nblOtherBuildingValue: z.string().optional(),
  nblOtherLandValue: z.string().optional(),
  nblOtherIsRelatedToResidence: z.boolean().optional(),
  nblOtherHasBuilding: z.boolean().optional(),
  nblOtherBuildingFloorArea: z.string().optional(),
  // §168의11⑥ 복합용도 건축물 부속토지 안분 (B)
  nblOtherMixedUseMode: z.string().optional(),
  nblOtherMixedUseSpecificFloorArea: z.string().optional(),
  nblOtherMixedUseTotalFloorArea: z.string().optional(),
  nblOtherMixedUseSpecificFootprint: z.string().optional(),
  nblOtherMixedUseTotalFootprint: z.string().optional(),
  // §168의11⑤ 연접 다필지 (C·D)
  nblOtherUseParcels: z.boolean().optional(),
  nblOtherParcels: z.array(nblOtherParcelRawSchema).optional(),
  // §168의11① 호별 면적기준 (갭 3a)
  nblOtherRelatedBusinessType: z.string().optional(),
  nblOtherStandardAreaLimit: z.string().optional(),
  nblOtherMaxAnnualArea: z.string().optional(),
  nblOtherYouthCapacity: z.string().optional(),
  nblOtherMinGarageArea: z.string().optional(),
  nblOtherSportsFacilityType: z.string().optional(),
  nblOtherReserveUnitSize: z.string().optional(),
  nblOtherReserveFacilities: z.array(z.string()).optional(),
  // F2 Phase B — 체육시설 유형(별표3/4/5)·종업원 체육시설(별표5)
  nblOtherSportsCategory: z.string().optional(),
  nblOtherEmployeeCount: z.string().optional(),
  nblOtherEmployeeFacilityKinds: z.array(z.string()).optional(),
  // F2 Phase B(B-3) — 6호 휴양 §83의4⑫ 3요소
  nblOtherResortOutdoorArea: z.string().optional(),
  nblOtherResortParkingStdArea: z.string().optional(),
  nblOtherResortBuildingArea: z.string().optional(),
  // F2 Phase B(B-2) — 선수가산·실내미설치·종목합산
  nblOtherSportsPlayerCount: z.string().optional(),
  nblOtherIndoorNotInstalled: z.boolean().optional(),
  nblOtherSportsExtraEvents: z.array(z.string()).optional(),
  nblOtherIndoorFloorArea: z.string().optional(),
  // F2 Phase B(B-3) — 6호 휴양 건축물 바닥면적(§101② 배율 자동)
  nblOtherResortBuildingFloorArea: z.string().optional(),
  // ⑫ 공장용 건축물 부속토지 기준면적 (「지방세법 시행령」 §102①1호 별표6 / §101①1호)
  //
  // ⚠️ 누락 시 z.object가 조용히 strip → 엔진에 factory가 도달하지 않아 **한도 판정 자체가
  // 사라진다**(초과분 중과 미발동). 필드명은 반드시 `nbl` prefix — `buildNonBusinessLandRaw`가
  // prefix-pick(`k.startsWith("nbl")`)으로 운반하기 때문이다.
  //
  // 면적은 전부 **1구의 공장 전체값**이다(양도 대상 필지 면적이 아님 — 조심 2023지0373).
  // 용도지역은 별도 필드를 두지 않고 자산의 `nblZoneType`을 쓴다(단일 소스).
  nblFactoryEnabled: z.boolean().optional(),
  /** "eup_myeon_or_complex"(읍·면·산단·공업지역) | "urban_other"(그 밖) — 한도 산식을 가른다 */
  nblFactoryLocationCategory: z.string().optional(),
  /** 공장 전체 부속토지 면적(㎡) */
  nblFactoryTotalLandArea: z.string().optional(),
  /** 별표6 경로 — 업종별 연면적·기준공장면적률(2호다 다업종 합산) */
  nblFactorySegments: z.array(nblFactorySegmentRawSchema).optional(),
  /** 별표6 3호가1) 「산집법」 §20① 공장 신설 제한지역 — 10%·3,000㎡ 한도 vs 20% */
  nblFactoryIsRestrictedZone: z.boolean().optional(),
  /** 별표6 3호나~바 추가 인정면적 합계(㎡) */
  nblFactoryAdditionalRecognizedArea: z.string().optional(),
  /** §101①1호 경로 — 공장용 건축물 **바닥면적**(㎡). 연면적과 다른 값이다 */
  nblFactoryFootprintArea: z.string().optional(),
  /** §102①1호 단서·§101① 단서 — 허가·사용승인 미이행 */
  nblFactoryIsUnregistered: z.boolean().optional(),
  // §168의11② 수입금액비율 (기타토지 특정 업종)
  nblRevenueBusinessType: z.string().optional(),
  nblRevenueCurrentRevenue: z.string().optional(),
  nblRevenueCurrentLandValue: z.string().optional(),
  nblRevenuePriorRevenue: z.string().optional(),
  nblRevenuePriorLandValue: z.string().optional(),
  // §168의11③3호 연환산 — 당해 사업개시일·직전 영위일수
  nblRevenueCurrentBusinessStartDate: z.string().optional(),
  nblRevenuePriorBusinessDays: z.string().optional(),
  // §168의11③1호 간주임대료 — 전세금·보증금·임대일수
  nblRevenueCurrentDeposit: z.string().optional(),
  nblRevenueCurrentRentDays: z.string().optional(),
  nblRevenuePriorDeposit: z.string().optional(),
  nblRevenuePriorRentDays: z.string().optional(),
  // §168의11③2호 공통수입 안분
  nblRevenueCommonApportion: z.boolean().optional(),
  nblRevenueCommonRevenue: z.string().optional(),
  nblRevenueOtherLandValue: z.string().optional(),
  nblRevenuePriorCommonRevenue: z.string().optional(),
  nblRevenuePriorOtherLandValue: z.string().optional(),
  // 무조건 의제 (§168의14③)
  nblExemptInheritBefore2007: z.boolean().optional(),
  nblExemptInheritDate: z.string().optional(),
  nblExemptLongOwned20y: z.boolean().optional(),
  nblExemptAncestor8YearFarming: z.boolean().optional(),
  nblExemptPublicExpropriation: z.boolean().optional(),
  nblExemptPublicNoticeDate: z.string().optional(),
  nblExemptFactoryAdjacent: z.boolean().optional(),
  nblExemptJongjoongOwned: z.boolean().optional(),
  nblExemptJongjoongAcqDate: z.string().optional(),
  nblExemptUrbanFarmlandJongjoong: z.boolean().optional(),
  nblExemptInong: z.boolean().optional(),
  nblExemptInongDate: z.string().optional(),
  // §83의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제)
  nblBusinessIsRealEstateDealer: z.boolean().optional(),
  // 배열
  nblBusinessUsePeriods: z.array(nblPeriodRawSchema).optional(),
  nblResidenceHistories: z.array(nblResidenceHistoryRawSchema).optional(),
  nblGracePeriods: z.array(nblGracePeriodRawSchema).optional(),
});
