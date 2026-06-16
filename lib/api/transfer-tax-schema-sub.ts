import { z } from "zod";

// ─── ⑩ 장기임대주택 거주주택 비과세 특례 enum 재export (컴패니언) ─

export {
  RentalScenarioEnum,
  RentalTypeEnum,
  RentalAcqTypeEnum,
  RentalRegionEnum,
  rentalUnitSchema,
  rentalHousingExceptionSchema,
} from "./transfer-tax-schema";

/**
 * ⑩ addRentalHousingExceptionRefines — 장기임대주택 특례 B 시나리오 추가 검증 헬퍼.
 * propertySchema.superRefine 내부에서 호출. 현재는 schema 수준 기본 검증만 수행.
 */
export function addRentalHousingExceptionRefines(
  data: { rentalHousingException?: unknown },
): void {
  // B 시나리오 기준시가 3개 시점 일관성은 schema-level optional이므로
  // validate.ts (⑧)에서 사용자 친화적 오류 메시지로 추가 검증.
  void data;
}

// ─── 하위 스키마 ────────────────────────────────────────────────

export const temporaryTwoHouseSchema = z.object({
  previousAcquisitionDate: z.string().date(),
  newAcquisitionDate: z.string().date(),
});

// (제거 2026-06-16) 구 nonBusinessLandDetailsSchema 전용 leaf —
//   businessUsePeriodSchema·gracePeriodSchema·LAND_TYPE_VALUES·ZONE_TYPE_VALUES·
//   REVENUE_BUSINESS_TYPES·revenueTestSchema 는 raw 스키마(아래) 전환으로 dead → 삭제.
//   §168의11② 수입금액비율 후속 구현 시 raw 스키마에 직접 재정의.

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

/** raw 유예기간 항목 (type=문자열 — 엔진이 GracePeriodType로 캐스팅) */
const nblGracePeriodRawSchema = z.object({
  type: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  description: z.string().optional(),
});

/** raw 거주이력 항목 */
const nblResidenceHistoryRawSchema = z.object({
  sigunguCode: z.string().optional(),
  sigunguName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  hasResidentRegistration: z.boolean(),
});

/** NBL 지목 — UI 노출 6값 (빌더가 nblLandType truthy시만 전송하므로 "" 미포함) */
export const NBL_UI_LAND_TYPE_VALUES = [
  "farmland", "forest", "pasture", "housing_site", "villa_land", "other_land",
] as const;

export const nonBusinessLandRawSchema = z.object({
  // 필수 (빌더 가드: nblUseDetailedJudgment && nblLandType && nblZoneType && acquisitionArea && acquisitionDate)
  nblUseDetailedJudgment: z.boolean(),
  nblLandType: z.enum(NBL_UI_LAND_TYPE_VALUES),
  nblZoneType: z.string(),
  acquisitionArea: z.string(),
  acquisitionDate: z.string(),
  transferDate: z.string(),
  // 공통
  nblUrbanIncorporationDate: z.string().optional(),
  nblIsMetropolitanArea: z.string().optional(),
  nblOwnershipRatio: z.string().optional(),
  nblFarmerResidenceDistance: z.string().optional(),
  nblLandSigunguCode: z.string().optional(),
  nblLandSigunguName: z.string().optional(),
  // 농지
  nblFarmingSelf: z.boolean().optional(),
  nblFarmlandIsWeekendFarm: z.boolean().optional(),
  nblFarmlandIsConversionApproved: z.boolean().optional(),
  nblFarmlandConversionDate: z.string().optional(),
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
  nblVillaIsAfter20150101: z.boolean().optional(),
  // 기타토지
  nblOtherPropertyTaxType: z.string().optional(),
  nblOtherBuildingValue: z.string().optional(),
  nblOtherLandValue: z.string().optional(),
  nblOtherIsRelatedToResidence: z.boolean().optional(),
  // §168의11② 수입금액비율 (기타토지 특정 업종)
  nblRevenueBusinessType: z.string().optional(),
  nblRevenueCurrentRevenue: z.string().optional(),
  nblRevenueCurrentLandValue: z.string().optional(),
  nblRevenuePriorRevenue: z.string().optional(),
  nblRevenuePriorLandValue: z.string().optional(),
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
  // 배열
  nblBusinessUsePeriods: z.array(nblPeriodRawSchema).optional(),
  nblResidenceHistories: z.array(nblResidenceHistoryRawSchema).optional(),
  nblGracePeriods: z.array(nblGracePeriodRawSchema).optional(),
});

// rentHistorySchema·vacancyPeriodSchema는 reductions와 공유하는 leaf로 분리
// (순환 import → ESM 초기화 TDZ 방지). 본 파일 내부(rentalReductionDetailsSchema)에서
// 직접 참조하므로 import하고, 하위 호환 위해 동일 이름으로 re-export한다.
import {
  rentHistorySchema,
  vacancyPeriodSchema,
} from "./transfer-tax-schema-rental";
export { rentHistorySchema, vacancyPeriodSchema };

export const rentalReductionDetailsSchema = z.object({
  isRegisteredLandlord: z.boolean(),
  isTaxRegistered: z.boolean(),
  registrationDate: z.string().date(),
  rentalHousingType: z.enum(["public_construction", "long_term_private", "public_support_private", "public_purchase"]),
  propertyType: z.enum(["apartment", "non_apartment"]),
  region: z.enum(["capital", "non_capital"]),
  officialPriceAtStart: z.number().int().nonnegative(),
  rentalStartDate: z.string().date(),
  transferDate: z.string().date(),
  vacancyPeriods: z.array(vacancyPeriodSchema).default([]),
  rentHistory: z.array(rentHistorySchema).default([]),
  calculatedTax: z.number().int().nonnegative().default(0),
});

export const newHousingDetailsSchema = z.object({
  acquisitionDate: z.string().date(),
  transferDate: z.string().date(),
  region: z.enum(["nationwide", "metropolitan", "non_metropolitan", "outside_overconcentration"]),
  acquisitionPrice: z.number().int().nonnegative(),
  exclusiveAreaSquareMeters: z.number().nonnegative(),
  isFirstSale: z.boolean(),
  hasUnsoldCertificate: z.boolean(),
  totalCapitalGain: z.number().int().nonnegative().default(0),
  calculatedTax: z.number().int().nonnegative().default(0),
});

// ─── 1990.8.30. 이전 취득 토지 기준시가 환산 ─────────────────────
export const landGradeInputSchema = z.union([
  z.number().int().min(1).max(365),
  z.object({ gradeValue: z.number().positive() }),
]);

export const pre1990LandSchema = z.object({
  acquisitionDate: z.string().date(),
  transferDate: z.string().date(),
  areaSqm: z.number().positive(),
  pricePerSqm_1990: z.number().positive(),
  pricePerSqm_atTransfer: z.number().positive(),
  grade_1990_0830: landGradeInputSchema,
  gradePrev_1990_0830: landGradeInputSchema,
  gradeAtAcquisition: landGradeInputSchema,
  forceRatioCap: z.boolean().optional(),
});

export const houseSchema = z.object({
  id: z.string().min(1),
  region: z.enum(["capital", "non_capital"]),
  acquisitionDate: z.string().date(),
  officialPrice: z.number().int().nonnegative(),
  isInherited: z.boolean(),
  isLongTermRental: z.boolean(),
  isApartment: z.boolean().default(false),
  isOfficetel: z.boolean().default(false),
  isUnsoldHousing: z.boolean().default(false),
  // 상속 5년 배제 기산 (소령 §167의3①7호)
  inheritedDate: z.string().date().optional(),
  // 장기임대 legacy 등록 경로 (등록사업자 + 등록일 2종 + 임대기간 5년↑)
  isRegisteredRental: z.boolean().optional(),
  rentalRegistrationDate: z.string().date().optional(),
  businessRegistrationDate: z.string().date().optional(),
  rentalPeriodYears: z.number().nonnegative().optional(),
  rentalCancelledDate: z.string().date().optional(),
  // ── ⑨⑫ 장기임대 9유형 매트릭스 (가~자목) 18필드 ──
  rentalType: z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "I"]).optional(),
  rentIncreaseUnder5Pct: z.boolean().optional(),
  isNationalSizeHousing: z.boolean().optional(),
  hasMinimum2Units: z.boolean().optional(),
  hasMinimum5UnitsInCity: z.boolean().optional(),
  rentalLandArea: z.number().nonnegative().optional(),
  rentalTotalFloorArea: z.number().nonnegative().optional(),
  isConvertedToSale: z.boolean().optional(),
  firstSaleContractDate: z.string().date().optional(),
  acquisitionOfficialPrice: z.number().int().nonnegative().optional(),
  rentalStartOfficialPrice: z.number().int().nonnegative().optional(),
  hasHalfDutyPeriodMet: z.boolean().optional(),
  isSoldWithin1YearOfCancellation: z.boolean().optional(),
  rentalCancellationDate: z.string().date().optional(),
  isExcluded918Rule: z.boolean().optional(),
  isExcludedAfter20200711Apt: z.boolean().optional(),
  isExcludedShortToLongChange: z.boolean().optional(),
  hasContractDepositProof: z.boolean().optional(),
  // ── P2 특수 배제 (other-house 2주택·인구감소) ──
  isUnavoidableReason: z.boolean().optional(),
  unavoidableResidenceYears: z.number().nonnegative().optional(),
  unavoidableReasonResolvedDate: z.string().date().optional(),
  isLitigationHousing: z.boolean().optional(),
  litigationAcquisitionDate: z.string().date().optional(),
  isRedevelopmentZone: z.boolean().optional(),
  isPopulationDeclineArea: z.boolean().optional(),
  isSecondHomeRegistered: z.boolean().optional(),
  // ── P2 특수 배제 (selling-house 3주택+) ──
  isMortgageExecution: z.boolean().optional(),
  isEmployeeHousing: z.boolean().optional(),
  freeProvisionYears: z.number().nonnegative().optional(),
  isTaxSpecialExemption: z.boolean().optional(),
  isCulturalHeritage: z.boolean().optional(),
  isDayCareCenter: z.boolean().optional(),
  dayCareOperationYears: z.number().nonnegative().optional(),
});

// 세대 보유 분양권·입주권 (2021.1.1 이후 취득분 주택 수 산입 — 소령 §167의11)
export const presaleRightSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["presale_right", "redevelopment_right"]),
  acquisitionDate: z.string().date(),
  region: z.enum(["capital", "non_capital"]),
});


// reductionSchema(23개 조문 discriminatedUnion)는 transfer-tax-schema-reductions.ts로 분리 (800줄 정책, P2)
// 순환 import 방지: 본 파일의 rentHistorySchema·vacancyPeriodSchema를 그쪽에서 import.
import { reductionSchema } from "./transfer-tax-schema-reductions";
export { reductionSchema };

export const filingPenaltyDetailsSchema = z.object({
  determinedTax:     z.number().int().nonnegative(),
  reductionAmount:   z.number().int().nonnegative(),
  priorPaidTax:      z.number().int().nonnegative(),
  originalFiledTax:  z.number().int().nonnegative(),
  excessRefundAmount:z.number().int().nonnegative(),
  interestSurcharge: z.number().int().nonnegative(),
  filingType:        z.enum(["none", "under", "excess_refund", "correct"]),
  penaltyReason:     z.enum(["normal", "fraudulent", "offshore_fraud"]),
});

export const delayedPaymentDetailsSchema = z.object({
  unpaidTax:          z.number().int().nonnegative(),
  paymentDeadline:    z.string().date(),
  actualPaymentDate:  z.string().date().optional(),
});

// ─── 일괄양도 안분 — 상속 보충적평가액 입력 스키마 ───────────────

export const inheritanceValuationSchema = z.object({
  /** 상속개시일 */
  inheritanceDate: z.string().date(),
  /** 자산 종류 */
  assetKind: z.enum(["land", "house_individual", "house_apart"]),
  /** 토지 면적 (㎡) — assetKind=land 필수 */
  landAreaM2: z.number().positive().optional(),
  /** 상속개시일 직전 공시가격 (원/㎡ for land, 원 총액 for house) */
  publishedValueAtInheritance: z.number().int().nonnegative(),
  /** 시가 (우선순위 1) */
  marketValue: z.number().int().nonnegative().optional(),
  /** 감정평가 평균 (우선순위 2) */
  appraisalAverage: z.number().int().nonnegative().optional(),
});

// ─── 함께 양도된 자산(Companion Asset) 스키마 ────────────────────
// 소득세법 시행령 §166 ⑥ — 주 자산과 한 계약으로 일괄양도된 다른 자산.
// 주 자산 정보는 propertyBaseShape의 기본 필드로 들어오고,
// companionAssets는 주 자산과 기준시가 비율로 안분될 보조 자산들이다.

export const companionAssetSchema = z.object({
  assetId: z.string().min(1),
  assetLabel: z.string().min(1),
  assetKind: z.enum(["housing", "land", "building"]),
  /**
   * 양도시점 기준시가 (안분 키) — 주택: 개별주택가격, 토지: 공시지가×면적.
   * apportioned 모드에서 필수, actual 모드(fixedSalePrice 사용)에서는 선택.
   */
  standardPriceAtTransfer: z.number().int().positive().optional(),
  /** 취득시점 기준시가 (선택) — totalAcquisitionPrice 안분 또는 매매 estimated 환산 시 키 */
  standardPriceAtAcquisition: z.number().int().positive().optional(),
  /** 자산 직접 귀속 필요경비 (원, 선택) */
  directExpenses: z.number().int().nonnegative().optional(),
  /** 자본적 지출액 (소득세법 §97① 가목) — §97② 단서 swap 비교에 사용. 지분 모드는 × ratio 적용된 값 */
  capitalExpenditure: z.number().int().nonnegative().optional(),
  /** 양도비 (소득세법 §97① 나목) — §97② 단서 swap 비교에 사용. 지분 모드는 × ratio 적용된 값 */
  transferExpense: z.number().int().nonnegative().optional(),
  /** 상속·증여·매매(actual) 등 취득가액이 자산별로 확정된 경우 (선택) */
  fixedAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** 상속 보충적평가액 산정용 입력 (선택) — 지정 시 fixedAcquisitionPrice로 주입됨 */
  inheritanceValuation: inheritanceValuationSchema.optional(),
  /** 자산별 감면 (예: 농지 자경 감면) */
  reductions: z.array(reductionSchema).default([]),
  /** 자산별 1세대 1주택 여부 (주택 자산에 적용) */
  isOneHousehold: z.boolean().optional(),
  /** 자산별 거주기간(월) — 주택의 1세대1주택 판정용 */
  residencePeriodMonths: z.number().int().nonnegative().optional(),
  /** 자산별 미등기 여부 */
  isUnregistered: z.boolean().optional(),
  /** 자산별 비사업용 토지 여부 */
  isNonBusinessLand: z.boolean().optional(),
  // ── 일괄양도 보완: 양도가액 모드 + 취득원인 분기 ──
  /**
   * 계약서에 구분 기재된 실제 양도가액 (원, 선택).
   * §166⑥ 본문 — 지정 시 안분 대상 제외, 그대로 allocatedSalePrice로 사용.
   */
  fixedSalePrice: z.number().int().positive().optional(),
  /** 동반자산 취득 원인 — 기본 "inheritance" (기존 동작 호환).
   *  "newConstruction"은 사례 28(나대지 + 신축주택 일괄양도) 신축자가건축 케이스. */
  acquisitionCause: z
    .enum(["purchase", "inheritance", "gift", "carryover_gift", "newConstruction"])
    .default("inheritance"),
  /**
   * 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용 (단독 소유는 미설정).
   * 동일 물건을 다회 분할 취득(지분 단계취득)한 자산에서 본 자산이 보유한 지분의
   * 분모로 총 물건 양도가액을 전달. fixedSalePrice는 이미 × ratio 적용됨.
   */
  totalPropertyTransferPrice: z.number().int().positive().optional(),
  /** 매매 시 환산취득가 사용 여부 */
  useEstimatedAcquisition: z.boolean().optional(),
  /** 본인 취득일 (YYYY-MM-DD) — 보유기간 산정용 */
  acquisitionDate: z.string().date().optional(),
  /** Round 9 (2026-05-06): 자산-수준 매매계약일 — §99의3 등 13개 매매계약일 기준 조문 시한 판정 */
  assetContractDate: z.string().date().optional(),
  /** 상속 시 피상속인 취득일 (자산별 단기보유 통산용) */
  decedentAcquisitionDate: z.string().date().optional(),
  /** 증여 시 증여자 취득일 */
  donorAcquisitionDate: z.string().date().optional(),
  /**
   * ⑩⑫ 사용자 수동 세율 오버라이드 — 부수토지 일체과세 자동 분기 무시.
   * 미지정(undefined) 시 landNature 기반 자동 분기.
   *
   * - "shortTermHousing70": 주택 단기보유 70% 강제
   * - "shortTerm60":        1년~2년 주택 세율 60% 강제
   * - "progressive":        일반 누진세율 강제
   *
   * 법령 근거: 소득세법 §89①3호 / 시행령 §154⑦ / §104①후단
   * (기재부 재산-53(2015.1.15), 재산-1354(2022.10.27))
   */
  manualHoldingPeriodOverride: z
    .enum(["shortTermHousing70", "shortTerm60", "progressive"])
    .optional(),
  /**
   * ⑩⑫ 토지 성질 명시 입력 (assetKind === "land" companion 자산).
   * 사용자가 자산 카드에서 선언.
   * - "appurtenant_to_housing": 주택 부수토지 (§89①3호·영§154⑦ 일체과세 대상)
   * - "non_appurtenant": 독립 나대지 (토지 본래 세율 적용)
   */
  landNature: z
    .enum(["appurtenant_to_housing", "non_appurtenant"])
    .optional(),
  /**
   * ⑫ G-2 companion 토지 면적 (㎡) — 부수토지 한도 초과 split 판정용 (영 §154⑦).
   * 신축주택 케이스에서 한도 내/초과분을 분리하기 위해 전달.
   * 미입력 시 split 판정 불가 → 전량 부수토지로 취급.
   */
  areaM2: z.number().positive().optional(),
  /**
   * ⑫ 사례 28 — companion 자산이 신축주택일 때 정착면적(㎡).
   * 사용자가 주택을 companion(자산 2)으로 입력한 경우 부수토지 자동 분기를 위해 필수.
   * primary가 land이고 companion 중 housing이 있으면 housingCtxFromCompanion 빌드 시 사용.
   */
  buildingFootprintArea: z.number().positive().optional(),
  /** @deprecated 사례 28 — companion 자산이 신축주택일 때 도시지역 여부 (영 §154⑦) */
  isUrbanArea: z.boolean().optional(),
  /** 사례 28 — companion 자산이 신축주택일 때 부수토지 한도 zone (영 §154⑦ 3/5/10배 분기) */
  appurtenantLandZone: z
    .enum(["metropolitan_residential", "non_metropolitan_or_green", "non_urban"])
    .optional(),
  /** 사례 28 — companion 신축주택 4시점 (가장 빠른 날 → acquisitionDate 자동 도출) */
  occupancyApprovalDate: z.string().date().optional(),
  approvalCertificateDate: z.string().date().optional(),
  temporaryApprovalDate: z.string().date().optional(),
  actualUseDate: z.string().date().optional(),
});

// ─── superRefine 공통 검증 — 별도 파일로 분리 (800줄 정책) ──────
// 실체: ./transfer-tax-schema-refines.ts
export { addPropertyRefines } from "./transfer-tax-schema-refines";

// ─── 다필지 스키마 ────────────────────────────────────────────

export const parcelSchema = z.object({
  id: z.string().min(1),
  acquisitionDate: z.string().date(),
  acquisitionMethod: z.enum(["actual", "estimated"]),
  acquisitionPrice: z.number().int().nonnegative().optional(),
  acquisitionArea: z.number().positive(),
  transferArea: z.number().positive(),
  standardPricePerSqmAtAcq: z.number().nonnegative().optional(),
  standardPricePerSqmAtTransfer: z.number().nonnegative().optional(),
  expenses: z.number().int().nonnegative().optional(),
  useDayAfterReplotting: z.boolean().optional(),
  replottingConfirmDate: z.string().date().optional(),
  // 환지 감환지/증환지 (소득세법 시행령 §162의2)
  entitlementArea: z.number().positive().optional(),
  allocatedArea: z.number().positive().optional(),
  priorLandArea: z.number().positive().optional(),
}).superRefine((p, ctx) => {
  if (p.acquisitionMethod === "estimated") {
    if (!p.standardPricePerSqmAtAcq || p.standardPricePerSqmAtAcq <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "환산취득가 방식: 취득시 ㎡당 기준시가 필수", path: ["standardPricePerSqmAtAcq"] });
    }
    if (!p.standardPricePerSqmAtTransfer || p.standardPricePerSqmAtTransfer <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "환산취득가 방식: 양도시 ㎡당 기준시가 필수", path: ["standardPricePerSqmAtTransfer"] });
    }
  } else {
    if (p.acquisitionPrice === undefined || p.acquisitionPrice <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "실가 방식: 취득가액 필수", path: ["acquisitionPrice"] });
    }
  }
  if (p.useDayAfterReplotting && !p.replottingConfirmDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "환지처분확정일 입력 필요", path: ["replottingConfirmDate"] });
  }
  // 환지 면적 3필드 일관성 검증 — 일부만 제공되면 오류
  const ex = [p.entitlementArea, p.allocatedArea, p.priorLandArea];
  const providedCount = ex.filter((v) => v !== undefined).length;
  if (providedCount > 0 && providedCount < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entitlementArea"],
      message: "환지 면적은 권리·교부·종전 3필드 모두 입력하거나 모두 비워야 합니다",
    });
  }
});

// ─── 상속 부동산 취득가액 의제 스키마 (소령 §176조의2④·§163⑨) ──

export const inheritedAcquisitionSchema = z.discriminatedUnion("mode", [
  // case A: 의제취득일(1985.1.1.) 전 상속 — max(환산가액, 피상속인 실가×물가상승률)
  z
    .object({
      mode: z.literal("pre-deemed"),
      /** 상속개시일 */
      inheritanceStartDate: z.string().date(),
      /** 자산 종류 */
      assetKind: z.enum(["land", "house_individual", "house_apart"]),
      /** 의제취득일(1985.1.1.) 시점 기준시가 (원) */
      standardPriceAtDeemedDate: z.number().int().nonnegative().optional(),
      /** 양도시 기준시가 (원) */
      standardPriceAtTransfer: z.number().int().positive().optional(),
      /** 피상속인 실지취득가액 입증 가능 여부 */
      hasDecedentActualPrice: z.boolean().default(false),
      /** 피상속인 취득일 (hasDecedentActualPrice=true 시 필수) */
      decedentAcquisitionDate: z.string().date().optional(),
      /** 피상속인 실지취득가액 (원, hasDecedentActualPrice=true 시 필수) */
      decedentActualPrice: z.number().int().nonnegative().optional(),
    })
    .refine(
      (v) =>
        !v.hasDecedentActualPrice ||
        (!!v.decedentAcquisitionDate &&
          v.decedentActualPrice !== undefined &&
          v.decedentActualPrice > 0),
      {
        message: "피상속인 실지취득가액 입증 시 취득일과 취득가가 필수입니다",
        path: ["decedentAcquisitionDate"],
      },
    ),

  // case B: 의제취득일 이후 상속 — 상속세 신고가액을 취득가로 인정
  z.object({
    mode: z.literal("post-deemed"),
    /** 상속개시일 */
    inheritanceStartDate: z.string().date(),
    /** 자산 종류 */
    assetKind: z.enum(["land", "house_individual", "house_apart"]),
    /** 상속세 신고가액 (원) */
    reportedValue: z.number().int().nonnegative(),
    /** 신고 시 적용한 평가방법 */
    reportedMethod: z.enum([
      "market_value",
      "appraisal",
      "auction_public_sale",
      "similar_sale",
      "supplementary",
    ]),
    /** 평가 근거 메모 (감정평가서 번호 등, 선택) */
    evidenceMemo: z.string().max(200).optional(),
    /** 보충적평가 보조계산 사용 여부 (supplementary 선택 시만) */
    useSupplementaryHelper: z.boolean().default(false),
    /** 보조계산: 토지 면적 (㎡) */
    landAreaM2: z.number().nonnegative().optional(),
    /** 보조계산: 개별공시지가 (원/㎡) 또는 주택 공시가격 (원) */
    publishedValueAtInheritance: z.number().int().nonnegative().optional(),
  }),
]);

// ─── 개별주택가격 미공시 취득 환산 스키마 (§164⑤) ──────────────

export const preHousingDisclosureSchema = z.object({
  /** 최초 고시일 (사용자 직접 입력) */
  firstDisclosureDate: z.string().date(),
  /** 최초 고시 개별주택가격 P_F (원) */
  firstDisclosureHousingPrice: z.number().int().positive(),
  /** 토지 면적 (㎡) */
  landArea: z.number().positive(),
  /** 취득당시 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtAcquisition: z.number().int().positive(),
  /** 취득당시 건물 기준시가 (원) */
  buildingStdPriceAtAcquisition: z.number().int().nonnegative(),
  /** 최초공시일 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtFirstDisclosure: z.number().int().positive(),
  /** 최초공시일 건물 기준시가 (원) */
  buildingStdPriceAtFirstDisclosure: z.number().int().nonnegative(),
  /** 양도시 개별주택가격 P_T (원) */
  transferHousingPrice: z.number().int().positive(),
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: z.number().int().positive(),
  /** 양도시 건물 기준시가 (원) */
  buildingStdPriceAtTransfer: z.number().int().nonnegative(),

  // Case A 4부분 안분 전용 (겸용주택 + house_to_commercial + firstDisclosure < usageChange)
  // 모두 충족 시 PHD 엔진이 4부분 안분 모드로 분기.
  /** 취득시 상가건물 기준시가 (원) */
  commercialBuildingStdPriceAtAcq: z.number().int().nonnegative().optional(),
  /** 최초공시일 상가건물 기준시가 (원) */
  commercialBuildingStdPriceAtFirstDisclosure: z.number().int().nonnegative().optional(),
  /** 양도시 상가건물 기준시가 (원) — 미입력 시 transferStandardPrice.commercialBuildingPrice 자동 사용 */
  commercialBuildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
  /** 주택부수토지 면적 (㎡) — 미입력 시 derived.residentialLandArea 자동 사용 */
  housingLandArea: z.number().positive().optional(),
  /** 상가부수토지 면적 (㎡) — 미입력 시 derived.commercialLandArea 자동 사용 */
  commercialLandArea: z.number().positive().optional(),
  /** 양도시 주택건물 기준시가 (원) — 미입력 시 buildingStdPriceAtTransfer 자동 fallback */
  housingBuildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
  /** 총 양도가액 (원) — 4부분 안분 시 필수 */
  totalTransferPriceForFourPart: z.number().int().nonnegative().optional(),
});

// ─── 상속 주택 환산취득가 — 개별주택 미공시 + 1990 이전 토지 스키마 ──

/** 등급가액 입력 스키마: 등급 번호 또는 등급가액 직접 입력 */
const gradeInputSchema = z.union([
  z.number().int().positive(),                          // 등급 번호 (1~365)
  z.object({ gradeValue: z.number().positive() }),      // 등급가액 직접 입력
]);

export const inheritanceHouseValuationSchema = z
  .object({
    /** 상속개시일 (1990-08-30 분기 + 2005-04-30 적용 여부 판단) */
    inheritanceDate: z.string().date(),
    /** 양도일 */
    transferDate: z.string().date(),
    /** 토지 면적 (㎡) */
    landArea: z.number().positive(),
    /** 양도시 개별공시지가 (원/㎡) */
    landPricePerSqmAtTransfer: z.number().int().positive(),
    /** 최초고시 시점 개별공시지가 (원/㎡) */
    landPricePerSqmAtFirstDisclosure: z.number().int().positive(),
    /** 양도시 개별주택가격 (원) */
    housePriceAtTransfer: z.number().int().nonnegative(),
    /** 최초고시 시점 개별주택가격 (원) */
    housePriceAtFirstDisclosure: z.number().int().positive(),
    /** 상속개시일 시점 개별공시지가 (원/㎡) — 1990-08-30 이후 시 필수 */
    landPricePerSqmAtInheritance: z.number().int().positive().optional(),
    /** 상속개시일 시점 주택가격 직접 입력 override (원) */
    housePriceAtInheritanceOverride: z.number().int().nonnegative().optional(),
    /** 양도시 건물기준시가 (원) — Sum 분모(양도시) 정확화. 미입력 시 housePriceAtTransfer로 대체 */
    buildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
    /** 최초고시 시점 건물기준시가 (원) — §164⑤ Sum_F 분모: 토지기준시가 + 이 값 */
    buildingStdPriceAtFirstDisclosure: z.number().int().nonnegative().optional(),
    /** 상속개시일 시점 건물기준시가 (원) — §164⑤ Sum_A 분자: 토지기준시가 + 이 값 */
    buildingStdPriceAtInheritance: z.number().int().nonnegative().optional(),
    /** 최초 고시일 (기본 "2005-04-30") */
    firstDisclosureDate: z.string().date().default("2005-04-30"),
    /** 1990-08-30 이전 취득 토지 등급가액 환산 입력 */
    pre1990: z
      .object({
        grade_1990_0830: gradeInputSchema,
        gradePrev_1990_0830: gradeInputSchema,
        gradeAtAcquisition: gradeInputSchema,
        pricePerSqm_1990: z.number().int().positive(),
        forceRatioCap: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    const isBefore1990 = v.inheritanceDate < "1990-08-30";
    const hasDirectInput = v.landPricePerSqmAtInheritance !== undefined;
    const hasPre1990 = v.pre1990 !== undefined;

    if (isBefore1990 && !hasDirectInput && !hasPre1990) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "상속개시일이 1990-08-30 이전이면 pre1990 등급가액 또는 landPricePerSqmAtInheritance 중 하나가 필수입니다",
        path: ["pre1990"],
      });
    }
    if (!isBefore1990 && !hasDirectInput && !hasPre1990) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "상속개시일이 1990-08-30 이후이면 landPricePerSqmAtInheritance가 필수입니다",
        path: ["landPricePerSqmAtInheritance"],
      });
    }
  });


// ─── 겸용주택 분리계산 Zod 스키마 — 별도 파일로 분리 (800줄 정책) ──────
// 실체: ./transfer-tax-schema-mixed-use.ts
export { mixedUseAssetSchema } from "./transfer-tax-schema-mixed-use";
