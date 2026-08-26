import { z } from "zod";
import { carryoverTaxationEngineShape } from "./transfer-tax-building-schemas";

// ─── ⑩ 장기임대주택 거주주택 비과세 특례 enum 재export (컴패니언) ─

export {
  RentalScenarioEnum,
  RentalCategoryEnum,
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
  /** §155⑯ 공공기관·법인 지방이전 — 처분기한 3년→5년 + 1년 요건 면제 */
  publicInstitutionRelocation: z.boolean().optional(),
  /** §155⑯ 연접 판정 — 행안부 표준 10자리. 미제공 시 자기선언 신뢰 */
  relocatedSigunguCode: z.string().optional(),
  newHouseSigunguCode: z.string().optional(),
  /** §155⑱ 처분기한 예외 — 「다른 주택 취득일부터 3년이 되는 날 현재」 각 호 해당 */
  disposalDelayReason: z
    .enum(["kamco", "auction", "public_sale", "cash_settlement_suit", "expropriation_suit"])
    .optional(),
});

/** ⑫ §155⑧ 수도권 밖 부득이 주택 — 양도 대상은 일반주택이고 이 주택은 보유만 한다 */
export const unavoidableOutsideCapitalHouseSchema = z.object({
  reason: z.enum(["study", "work", "illness", "other"]),
  /** 미제공 = 사유 미해소 → 3년 기한 미기산 (계획서 W-1) */
  resolvedDate: z.string().date().optional(),
});

/** ⑫ §155⑦ 농어촌주택 — 유형별 요건은 엔진이 판정한다(Zod는 형상만 검증) */
export const ruralHouseSchema = z.object({
  kind: z.enum(["inherited", "farm_exit", "return_to_farm"]),
  isOutsideCapitalEupMyeon: z.boolean(),
  decedentResidenceYears: z.number().nonnegative().optional(),
  ownerResidenceYears: z.number().nonnegative().optional(),
  acquisitionDate: z.string().date().optional(),
  isHighPriceAtAcquisition: z.boolean().optional(),
  landAreaSqm: z.number().nonnegative().optional(),
  wholeHouseholdMoved: z.boolean().optional(),
});

// ⑫ §156의2⑤ 대체주택 비과세 특례 Zod 스키마
export const replacementHouseSchema = z.object({
  businessApprovalDate: z.string().date(),
  completionDate: z.string().date(),
  replacementResidenceMonths: z.number().int().nonnegative(),
  willResideNewHouse: z.boolean(),
});

/**
 * ⑫ §89② 배제의 **3년 초과 예외** 선언 — 「소득세법 시행령」 §156의2④ · §156의3③ /
 * 「소득세법 시행규칙」 §75①.
 *
 * ⚠️ `kind`를 **discriminator**로 둔다 — 「신축주택 완성·이주」와 「경매·공매」는 요구 필드가
 *    완전히 다르고, 「해당 없음」은 **명시 선언**이라 세 번째 갈래가 필요하다.
 * ⚠️ `reason` 열거는 §75① **3호뿐**이다(§155⑱의 5호와 다르다 — 4·5호 없음).
 */
export const rightThreeYearExceptionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("new_house"),
    completionDate: z.string().date(),
    movedInWithin3Years: z.boolean(),
    residedOneYearOrMore: z.boolean(),
  }),
  z.object({
    kind: z.literal("delay"),
    reason: z.enum(["kamco", "auction", "public_sale"]),
    disposedByThatMethod: z.boolean(),
  }),
  z.object({ kind: z.literal("none") }),
]);

/**
 * ⑫ §89② 배제의 **합가 예외** 선언 — 「소득세법 시행령」 §156의2⑧(동거봉양)·⑨(혼인).
 * 분양권은 §156의3⑥이 그대로 준용하므로 별도 스키마를 두지 않는다.
 *
 * ⚠️ 갈래마다 요구 필드가 다르다 — 가목(`initial_right`)은 **둘**(인가일 이후 취득 ·
 *    1년 이상 거주), 나·다목은 하나, 3·5호는 없다. `discriminatedUnion`이 그 차이를 강제한다.
 */
export const mergedHouseholdFirstHouseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("house_only") }),
  z.object({
    kind: z.literal("initial_right"),
    acquiredAfterApproval: z.boolean(),
    residedOneYear: z.boolean(),
  }),
  z.object({ kind: z.literal("succeeded_right"), ownedBeforeRight: z.boolean() }),
  z.object({ kind: z.literal("presale_right"), ownedBeforeRight: z.boolean() }),
  z.object({ kind: z.literal("right_only") }),
  z.object({ kind: z.literal("none") }),
]);

// (제거 2026-06-16) 구 nonBusinessLandDetailsSchema 전용 leaf —
//   businessUsePeriodSchema·gracePeriodSchema·LAND_TYPE_VALUES·ZONE_TYPE_VALUES·
//   REVENUE_BUSINESS_TYPES·revenueTestSchema 는 raw 스키마(아래) 전환으로 dead → 삭제.
//   §168의11② 수입금액비율 후속 구현 시 raw 스키마에 직접 재정의.

// ─── NBL 정밀판정 raw 페이로드 (⑫) ─────────────────────────────
// 800줄 정책에 따라 transfer-tax-schema-nbl.ts로 분리(2026-08-04, Phase A-0).
// 하위 호환 위해 동일 이름으로 re-export한다.
export {
  NBL_UI_LAND_TYPE_VALUES,
  nonBusinessLandRawSchema,
} from "./transfer-tax-schema-nbl";

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
  // 양도시 기준시가는 상위 standardPriceAtTransfer로 공급 — 서브엔진은 산출하지 않음(deprecated).
  pricePerSqm_atTransfer: z.number().positive().optional(),
  grade_1990_0830: landGradeInputSchema,
  gradePrev_1990_0830: landGradeInputSchema,
  gradeAtAcquisition: landGradeInputSchema,
  forceRatioCap: z.boolean().optional(),
});

export const houseSchema = z.object({
  id: z.string().min(1),
  region: z.enum(["capital", "non_capital"]),
  /** ⑫ 법정동코드 10자리 — sellingHouse에 제공 시 엔진 isRegulatedByBjdCode() 정밀 판정 */
  regionCode: z.string().length(10).optional(),
  acquisitionDate: z.string().date(),
  officialPrice: z.number().int().nonnegative(),
  isInherited: z.boolean(),
  isLongTermRental: z.boolean(),
  isApartment: z.boolean().default(false),
  isOfficetel: z.boolean().default(false),
  isUnsoldHousing: z.boolean().default(false),
  // ⑬ 소형신축·준공후미분양 특례 (§167의3①12가·나목)
  acquisitionPrice: z.number().int().nonnegative().optional(),
  exclusiveArea: z.number().nonnegative().optional(),
  isUnsoldNewHouse: z.boolean().optional(),
  completionDate: z.string().date().optional(),
  // #2a 배우자 단독 보유 (§167의3⑨ 혼인 5년내 차감)
  isSpouseOwned: z.boolean().optional(),
  // 상속 5년 배제 기산 (소령 §167의3①7호)
  inheritedDate: z.string().date().optional(),
  // §155③ 공동상속 (2-A2)
  isCoInherited: z.boolean().optional(),
  isLargestCoInheritedShareholder: z.boolean().optional(),
  // §155② 단서(동거봉양·동일세대)·1~4호 순위 게이트
  decedentSameHouseholdAtInheritance: z.boolean().optional(),
  parentalCareMergeInheritedHouse: z.boolean().optional(),
  isRankingDisqualifiedInheritedHouse: z.boolean().optional(),
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
  saMokBaseArticle: z.enum(["가", "다", "라", "마"]).optional(),
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
  populationAreaType: z.enum(["decline", "interest"]).optional(),
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
  regionCriteria: z.enum(["REGION", "VALUE"]).optional(),
  rightValue: z.number().int().nonnegative().optional(),
  isSpouseOwned: z.boolean().optional(),
  // §156의2⑥·⑦ · §156의3④·⑤ — §89② 배제의 상속 예외 축
  /** ⑫ §89② 조합원입주권 축 시행일 게이트 — 법률 제7837호 부칙 §12①(인가일 기준). */
  managementDisposalApprovalDate: z.string().date().optional(),
  isInherited: z.boolean().optional(),
  isRankingDisqualifiedInheritedRight: z.boolean().optional(),
  isCoInherited: z.boolean().optional(),
  isLargestCoInheritedShareholder: z.boolean().optional(),
  decedentOwnedHouseAtDeath: z.boolean().optional(),
  decedentOwnedOtherRightTypeAtDeath: z.boolean().optional(),
  decedentSameHouseholdAtInheritance: z.boolean().optional(),
  parentalCareMergeInheritedRight: z.boolean().optional(),
  // 공급주택 소재지 코드 (시·군·구 5자리 또는 법정동 10자리) — 다·라목 2호 동일 시·군·구 비교
  regionCode: z.string().min(5).optional(),
});


// reductionSchema(23개 조문 discriminatedUnion)는 transfer-tax-schema-reductions.ts로 분리 (800줄 정책, P2)
// 순환 import 방지: 본 파일의 rentHistorySchema·vacancyPeriodSchema를 그쪽에서 import.
import { reductionSchema } from "./transfer-tax-schema-reductions";
export { reductionSchema };
// ⑫ 분리취득 축 — 단건·컴패니언 공용 shape (leaf라 TDZ 안전).
import { splitAcquisitionShape } from "./transfer-tax-schema-split";

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

/** 수정신고(경정) — 국세기본법 §45·§48 */
export const amendmentSchema = z.object({
  originalDeterminedTax:      z.number().int().nonnegative(),
  applyUnderReportingPenalty: z.boolean(),
  underReportingReason:       z.enum(["normal", "fraudulent", "offshore_fraud"]),
  underReductionMode:         z.enum(["exempt", "auto_48_2"]),
  statutoryFilingDeadline:    z.string().date().optional(),
  amendedFilingDate:          z.string().date().optional(),
  priorAssessmentNotified:    z.boolean().optional(),
  applyLatePaymentPenalty:    z.boolean(),
  amendedPaymentDate:         z.string().date().optional(),
  // 경정청구(세액 감소·환급) — 국세기본법 §45의2
  correctionKind:             z.enum(["amend", "refund_claim"]).optional(),
  claimReasonType:            z.enum(["ordinary", "posterior"]).optional(),
  posteriorEventDate:         z.string().date().optional(),
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

/**
 * ⑫ 동일조정기간 내 취득·양도 시 「양도당시 기준시가」 환산 (소령 §164⑧ · 소칙 §80①~⑤).
 *
 * 엔진이 요건을 게이트하므로 스키마는 **형태만** 검증한다. 여기 없으면 route에서
 * 침묵 strip되어 엔진에 도달하지 못한다.
 *
 * `priorBasis`·`priceSource`는 계산에 영향이 없지만 결과 화면의 근거·배지 표시에 쓰이므로
 * 함께 통과시킨다 — 「세액 무영향이니 빼도 된다」가 침묵 strip의 전형이다.
 */
export const sameAdjustmentPeriodSchema = z.object({
  formula: z.enum(["prev", "new"]).optional(),
  priorStandardPrice: z.number().int().nonnegative().optional(),
  newStandardPrice: z.number().int().nonnegative().optional(),
  adjustmentMonths: z.number().int().positive().optional(),
  priorBasis: z.enum(["direct", "nearby_land", "first_notice_rate", "ratio_conversion"]).optional(),
  priceSource: z.enum(["lookup", "manual"]).optional(),
});

export const companionAssetSchema = z.object({
  /**
   * ⑫ 토지·건물 **분리취득** 축 (N-6(A), 2026-08-23) — 단건과 **같은 shape**을 spread한다.
   *
   * 🔴 종전에는 이 축의 필드가 **하나도 없었다**. ⑤ UI(`CompanionAcqPurchaseBlock`의
   * 「토지·건물 취득일 다름」 토글)는 자산 인덱스를 보지 않아 컴패니언에도 렌더되고,
   * ④ 빌더(`buildSplitPayload`)도 `AssetForm`을 받는 공용 함수인데, ⑫에 칸이 없어
   * **조용히 strip**됐다 ⇒ 컴패니언에서 분리취득을 켜도 세액이 1원도 안 움직였다.
   *
   * ⚠️ 목록을 여기 **복사하지 않는다** — 두 벌이면 단건에 필드가 늘 때 컴패니언만 빠진다.
   */
  ...splitAcquisitionShape,
  assetId: z.string().min(1),
  assetLabel: z.string().min(1),
  assetKind: z.enum(["housing", "land", "building"]),
  /**
   * 양도시점 기준시가 — **§97①1호나목 환산 분모**(매매 estimated·이월과세 general 환산).
   *
   * 🔴 **안분 키가 아니다.** 이월과세 `general` 환산 컴패니언에서 ④가 이 칸을
   *    **증여자의** 양도시 기준시가로 덮어쓰기 때문이다
   *    (`lib/calc/transfer-tax-api-carryover.ts` `topLevelOverrides`).
   *    §166⑥ 안분 키는 아래 `standardPriceAtTransferForApportion`이다.
   */
  standardPriceAtTransfer: z.number().int().positive().optional(),
  /**
   * §166⑥ **안분 키** — 사용자가 자산 카드에 입력한 「양도시 기준시가」.
   * 주택: 개별주택가격, 토지: 공시지가×면적. apportioned 모드에서 필수
   * (actual 모드·지분 컴패니언은 선택 — `transfer-tax-schema.ts` superRefine).
   *
   * 🔑 주 자산의 폼-전역 `standardPriceAtTransferForApportion`과 **같은 역할**이다.
   *    이 필드가 없으면 이월과세 general 환산 컴패니언에서 안분 키가 증여자 기준시가로
   *    치환된다(D-5).
   */
  standardPriceAtTransferForApportion: z.number().int().positive().optional(),
  /** 취득시점 기준시가 (선택) — totalAcquisitionPrice 안분 또는 매매 estimated 환산 시 키 */
  standardPriceAtAcquisition: z.number().int().positive().optional(),
  /** ⑫ §164⑧ 환산 — 컴패니언 자산도 자기 취득·양도일 축으로 판정된다 */
  sameAdjustmentPeriod: sameAdjustmentPeriodSchema.optional(),
  /**
   * ⑫ 공익수용·공매 §164⑨ 특례 — **컴패니언 자산도 대상**(소득세법 시행령 §164⑨).
   *
   * §164⑨은 법 §99①1호 **가목~라목(토지·건물·오피스텔/상업용 건물·주택) 전부**를 대상으로 하는
   * **자산 단위** 규정이고, 「주된 자산 전용」·「일괄양도 제외」 문언이 본문·괄호·단서 어디에도 없다.
   * 나아가 법 §100② → 영 §166⑥ → 「부가가치세법 시행령」 §64①1호가 일괄양도 안분 키를
   * **기준시가**로 지정하므로, 컴패니언의 양도 당시 기준시가는 법적으로 살아있는 값이고
   * §164⑨이 바로 그 값을 계산하는 규정이다.
   *
   * 🔴 이 9필드가 없으면 ④(`buildAssetPayload`)가 실은 값을 Zod가 **조용히 떼어내**
   *    ⑭(`bundled-split-helpers.ts`)의 매핑이 이미 있어도 엔진에 도달하지 못한다.
   *    (실측: 400이 아니라 200 + 특례 미적용값 — 화면에는 입력값이 그대로 보인다.)
   *
   * 타입은 단건 `propertyBaseShape`(transfer-tax-schema.ts)와 **동일**해야 한다.
   * ⚠️ 2호(공매·경락)는 조문상 수용을 요건으로 하지 않는다 — `transferCause`에 종속시키지 말 것.
   */
  transferCause: z.enum(["general", "public_expropriation"]).optional(),
  /** §164⑨1호 원/㎡ 트랙 (가·나목) — 엔진이 게이트, 여기선 strip 방지 */
  standardPricePerSqmAtTransfer: z.number().int().nonnegative().optional(),
  transferArea: z.number().positive().optional(),
  compensationPerSqm: z.number().int().nonnegative().optional(),
  compensationBasisStdPrice: z.number().int().nonnegative().optional(),
  /** §164⑨2호 공매·경락 — 1호와 독립 요건(수용 불요) */
  isAuctionTransfer: z.boolean().optional(),
  auctionPrice: z.number().int().nonnegative().optional(),
  /** §164⑨1호 주택 총액 트랙 (라목) — 개별·공동주택가격은 총액이라 원/㎡ 분해가 없다 */
  housingCompensationTotal: z.number().int().nonnegative().optional(),
  housingCompensationBasisTotal: z.number().int().nonnegative().optional(),
  /**
   * 공유지분율 (0<r≤1) — 필요경비 개산공제(§163⑥) base 축소 전용. ⑫ 침묵 stripping 방지.
   * 기준시가는 물건 전체 값을 유지하고 개산공제만 「지분 기준시가 × 3%」가 된다.
   */
  ownershipRatio: z.number().positive().max(1).optional(),
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
  /** §154⑧3호 상속주택 자체 양도 보유기간 통산 (동일세대 게이트 + 거주·보유 개시일) */
  decedentSameHouseholdBeforeInheritance: z.boolean().optional(),
  decedentCohabitationHoldingStartDate: z.string().date().optional(),
  decedentCohabitationResidenceMonths: z.number().int().nonnegative().optional(),
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
  /**
   * ⑫ 배우자등 이월과세 §97의2 — `acquisitionCause === "carryover_gift"` 시 필수
   * (필수 판정은 `transfer-tax-schema.ts`의 컴패니언 superRefine `carryover_gift` arm).
   *
   * 🔴 이 필드가 없던 동안 ④(`buildAssetPayload` → `buildCarryoverPayload`)가 싣던 값이
   *    Zod에서 **조용히 strip**됐다 — 400이 아니라 200 + 컴패니언 취득가액 **0**이었다(D-1).
   *
   * shape은 GB 파트용 `carryoverTaxationEngineShape`를 **재사용**한다. 단건
   * (`transfer-tax-schema.ts`) 인라인 shape과 필드·타입 11개가 전부 일치한다(V-5 기계 대조).
   * ⚠️ `giftTaxAmount`의 **의미**만 소비자마다 다르다 — GB 파트는 「이미 안분된 값」,
   *    컴패니언·단건은 사용자가 영 §163의2②로 산정해 넣은 **자산 전체분**이다.
   */
  carryoverTaxation: carryoverTaxationEngineShape.optional(),
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
  // 공익수용 §164⑨ 1호 — 필지별 min[] 특례. 엔진이 게이트(수용·환산·2009.02.04) 판정.
  compensationPerSqm: z.number().int().nonnegative().optional(),
  compensationBasisStdPrice: z.number().int().nonnegative().optional(),
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
  // case A: 의제취득일(1985.1.1.) 전 상속·증여 — max(① 상증법 평가액, ③ 환산취득가)
  z
    .object({
      mode: z.literal("pre-deemed"),
      /** 상속개시일 */
      inheritanceStartDate: z.string().date(),
      /** 자산 종류 */
      assetKind: z.enum(["land", "house_individual", "house_apart"]),
      /** ① 상증법 §60~66 평가액 (상속세 신고가액) — max(①,③) 후보 */
      reportedValue: z.number().int().nonnegative().optional(),
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


// ─── 비주택 → 주택 용도변경 (§95⑤·⑥ · 시행령 §154⑤ 단서) ──────────────

/**
 * ⑫ 비주택 → 주택 용도변경 입력.
 *
 * 미정의 시 Zod가 **조용히 필드를 떼어내** 엔진에 도달하지 않는다(침묵 stripping).
 * 날짜 순서(취득일 < 주거용 사용일 < 양도일) 검증은 `addPropertyRefines`가 한다 —
 * 여기서는 취득일·양도일을 볼 수 없기 때문이다.
 */
export const nonHousingToHousingConversionSchema = z.object({
  /** 사실상 주거용으로 사용한 날 (YYYY-MM-DD). 불분명하면 공부상 용도변경일 — §95⑥ 단서. */
  residentialUseStartDate: z.string().date(),
  /**
   * §95⑤2호 클램프로 잘려나간 거주 개월 수.
   * 결과 화면 절사 안내 전용 — 계산에는 쓰이지 않는다(거주기간 자체는 이미 클램프된 값이 온다).
   */
  residenceMonthsTrimmed: z.number().int().nonnegative(),
});

// ─── 겸용주택 분리계산 Zod 스키마 — 별도 파일로 분리 (800줄 정책) ──────
// 실체: ./transfer-tax-schema-mixed-use.ts
export { mixedUseAssetSchema } from "./transfer-tax-schema-mixed-use";
