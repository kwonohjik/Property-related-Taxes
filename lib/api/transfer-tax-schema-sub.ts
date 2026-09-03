import { z } from "zod";
import { burdenedGiftInfoSchema } from "./transfer-tax-burdened-gift-schema";
import { carryoverTaxationEngineShape } from "./transfer-tax-building-schemas";
import { commercialAppurtenantLandSchema } from "./transfer-tax-building-schemas";
import { commercialBuildingValuationSchema } from "./transfer-tax-building-schemas";

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
    /** ④2호 전단 — 완성일 없이 성립한다(R-3). 날짜 필드가 **없는 것이 정상**이다. */
    kind: z.literal("before_completion"),
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
  /** D1-04 — 조특법 §97① 각 호 신축연도 (public_construction 전용) */
  constructionYear: z.number().int().optional(),
  /** D1-04 — §97①2호 「1986.1.1 현재 입주된 사실이 없는」 자기확인 */
  isUnoccupiedAt1986: z.boolean().optional(),
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


// reductionSchema(24개 조문 discriminatedUnion)는 transfer-tax-schema-reductions.ts로 분리 (800줄 정책, P2)
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
  // §47조의3①1호 가목 base — optional. 미입력이면 전액 부정(종전 동작)
  fraudulentPortion: z.number().int().nonnegative().optional(),
  filingType:        z.enum(["none", "under", "excess_refund", "correct"]),
  penaltyReason:     z.enum(["normal", "fraudulent", "offshore_fraud"]),
  /**
   * 🔴 G-05 ⑫ — 기한 후 신고 감면 축(「국세기본법」 §48②2호·§48②3호라목).
   *
   * ⚠️ **이 층은 TypeScript 가 못 잡는다.** 여기에 키가 없으면 ④가 실어 보내도 Zod 가
   *    조용히 stripping 하고 엔진에 닿지 않는다(리뷰 G-14 가 정확히 이 층의 공백이었다).
   *
   * 날짜는 **ISO 문자열**로 받는다 — 공용 leaf `late-filing-reduction.ts` 가
   * `parseISO` 로 파싱하는 계약이라 `new Date(문자열)` 금지 규약과 충돌하지 않는다.
   */
  lateFiling: z.object({
    statutoryDeadline:       z.string().date(),
    actualFilingDate:        z.string().date(),
    finalReturnDeadline:     z.string().date().optional(),
    priorAssessmentNotified: z.boolean().optional(),
  }).optional(),
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
  /**
   * 🔄 **`commercial_building` 추가 (2026-09-03).** 종전 3종 enum은 컴패니언 상가를
   * **400으로 죽였다** — ⑧ `SINGLE_ONLY`에는 상가가 없어 화면은 통과시키는데
   * route가 「Invalid option」을 내는 **안내 없는 dead-end**였다(실측).
   * 「상가는 차단하지 않는다」는 종전 주석은 **primary가 상가일 때만** 맞았다.
   *
   * ⚠️ 나머지 4종(`general_building`·`redevelopment_apt`·`right_to_move_in`·`presale_right`)은
   *    여전히 빠져 있고 ⑧이 막는다. 열려면 각자의 서브객체(§166 등)를 함께 배관해야 한다 —
   *    enum만 넓히면 침묵 오산이 된다(입주권·분양권은 `toEngineAssetKind`가 housing으로
   *    접어 **200이 나오면서 틀린 값**이 되는 것이 그 실례다).
   */
  assetKind: z.enum(["housing", "land", "building", "commercial_building"]),
  /**
   * ⑫ 상가 부수토지 초과분(§101① 배율) — **물건 전체 면적**이라 지분·안분과 무관하다.
   * 누락 시 §104①8호 +10%p 세율이 통째로 사라진다(primary 축에서 실측 이력).
   */
  commercialAppurtenantLand: commercialAppurtenantLandSchema.optional(),
  /** ⑫ 상가 환산취득가(cb 기준시가) — 분자·분모로 약분되므로 지분 스케일 불요. */
  commercialBuildingValuation: commercialBuildingValuationSchema.optional(),
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
  /**
   * ⑫ 부담부증여(소령 §159) — 축 B(지분 분할 취득) 컴패니언. **누락 시 침묵 stripping**이라
   * 그 지분만 §159를 타지 않아 세액이 조용히 틀린다.
   *
   * 채무 4필드는 ④(`buildBurdenedGiftInfo`)가 **이 자산의 지분율로 안분해** 보낸다 —
   * 축 A(공유 소유)와 **반대** 규약이다. 평가액·기준시가는 물건 전체 raw이고
   * 엔진이 `ownershipRatio`로 줄인다.
   */
  burdenedGiftInfo: burdenedGiftInfoSchema.optional(),
  /**
   * ⑫ 양도 형태 — 엔진의 §159 게이트(`transfer-tax-burdened-gift-step.ts`
   * `isBurdenedGiftEngine`)가 **이 값**을 본다. `burdenedGiftInfo`만 실어도
   * 이것이 없으면 STEP 0.48이 **발동하지 않는다**(실측: 컴패니언 차익이
   * 「총계약가 × 지분율」로 남아 400,000,000 — 정답 116,400,000).
   */
  transferType: z.enum(["regular", "burdened_gift"]).optional(),
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
  /**
   * §77 감면 자산이 「직접 경작한 토지」인지 — 농특세령 §4①1호 괄호 (D11-02).
   * ④가 자산의 reductions에서 승격해 싣는다(자산 축 — 엔진은 감면 유형 확정 후에 본다).
   */
  isSelfCultivatedExpropriatedLand: z.boolean().optional(),
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
  // 환지 감환지/증환지 (소득세법 시행령 §162①9호 단서)
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

// ─── 취득가액 의제·환산 스키마 — 별도 파일로 분리 (800줄 정책, CB-08) ──────
// 실체: ./transfer-tax-schema-acq-deemed.ts
export * from "./transfer-tax-schema-acq-deemed";

// ─── 겸용주택 분리계산 Zod 스키마 — 별도 파일로 분리 (800줄 정책) ──────
// 실체: ./transfer-tax-schema-mixed-use.ts
export { mixedUseAssetSchema } from "./transfer-tax-schema-mixed-use";
