import { z } from "zod";

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

// ⑫ §155① 일시적 2주택 — 800줄 정책으로 분리(경로 호환 재수출).
export { temporaryTwoHouseSchema } from "./transfer-tax-schema-temp-two-house";

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

/**
 * ⑫ §155의2 장기저당담보주택 — 거주요건 면제 + ② 동거봉양 합가 1주택 의제.
 *
 * 🔑 요건 판정은 **전부 엔진**이 한다(`meetsLongTermMortgageHouse`) — Zod는 형상만 본다.
 *    ①1호 60세·②2호 계약기간 10년 같은 임계값을 여기에 적으면 법령 상수가 두 벌이 된다.
 * 🔑 ③ 「계약기간 만료 이전 양도」는 **배제 사유**라 값이 `true`여도 정상 입력이다 —
 *    Zod가 막으면 사용자가 사실대로 적을 길이 없어진다.
 */
export const longTermMortgageHouseSchema = z.object({
  contractDate: z.string().date(),
  borrowerAgeAtContract: z.number().int().nonnegative(),
  contractYears: z.number().int().nonnegative(),
  maturityLumpSumRepayment: z.boolean(),
  transferredBeforeMaturity: z.boolean(),
  isTransferredHouseMortgaged: z.boolean(),
  /** ② 담보주택 보유 직계존속과 동거봉양 합가로 2주택이 된 경우 */
  parentalCareMerge: z.boolean().optional(),
});

/**
 * ⑫ §155의3 상생임대주택 — §154①·§155⑳1호·§159의4의 **거주기간 제한 면제**.
 *
 * 🔑 의제가 아니라 거주요건 면제다 — 중과 배제(§167의10①15호)는 붙지 않는다.
 * ⚠️ 임대기간은 **개월 수**로 받는다. ③ 월력 계산·1개월 미만 절상과 ④ 임차인 사정 합산은
 *    엔진이 하지 않으므로 **입력 화면이 이미 반영한 값**이어야 한다(엔진 타입 주석과 동일 규약).
 */
export const winWinRentalHouseSchema = z.object({
  winWinContractDate: z.string().date(),
  /** ①1호 증가율(%) — 인하 계약도 성립하므로 음수를 막지 않는다 */
  increaseRatePct: z.number(),
  priorLeaseMonths: z.number().int().nonnegative(),
  winWinLeaseMonths: z.number().int().nonnegative(),
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

// ─── 1990.8.30. 이전 취득 토지 기준시가 환산 — leaf로 분리(컴패니언 §163⑨ 운반이 순환 없이 재사용, CP-3) ──
export { landGradeInputSchema, pre1990LandSchema } from "./transfer-tax-schema-pre1990-land";

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
  // §155④⑤ 합가 전 보유 쪽 — 판정 메뉴 명부 입력(merge-composition.ts)
  mergeOrigin: z.enum(["seller_side", "counterpart_side"]).optional(),
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
  // 5% 초과 증액 계약 체결·갱신일 — 대통령령 제29523호 부칙 제6조(2019-02-12 전 계약분은 요건 밖)
  rentIncreaseContractDate: z.string().date().optional(),
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
  /** 소송 **확정판결일**(§167의10①7호 기산점) — 필드명은 legacy(F-17) */
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
  /**
   * ⚠️ 이 칸만은 **selling 전용이 아니다** (2026-09-22) — §167의3①6호가 §155⑥1호를 그대로
   * 인용해 명부 행도 이 호에 해당할 수 있다. 어댑터가 행의 `oneHouseCulturalHeritage`를
   * 여기에 싣는다(`transfer-tax-api-houses.ts` · `multi-transfer-tax-api.ts`).
   */
  isCulturalHeritage: z.boolean().optional(),
  isDayCareCenter: z.boolean().optional(),
  dayCareOperationYears: z.number().nonnegative().optional(),
  // ── 공고 전 매매계약(영 §167의10①11호 등) — selling 전용 · **양도** 계약일 + 계약금 수령(장기임대 `hasContractDepositProof`와 별개) ──
  contractDate: z.string().date().optional(),
  saleDepositReceived: z.boolean().optional(),
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
  /**
   * PEN-C — `manual`은 값 그대로(0 = 완납) · `auto`는 결정세액 전액 미납 · 부재는 종전 의미
   * (0 → 전액 · 값 → 그 값). 엔진 `resolveUnpaidTax`(`lib/tax-engine/transfer-tax-unpaid-tax.ts`).
   */
  unpaidTaxMode:      z.enum(["auto", "manual"]).optional(),
  paymentDeadline:    z.string().date(),
  actualPaymentDate:  z.string().date().optional(),
}).superRefine((d, ctx) => {
  // ④는 auto일 때 0을 싣는다 — auto에 값이 오면 「자동」과 「그 값」 중 무엇인지 모호하다.
  if (d.unpaidTaxMode === "auto" && d.unpaidTax > 0)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unpaidTaxMode"],
      message: "미납세액 자동(결정세액 전액 미납) 모드에는 미납세액을 싣지 않습니다 — 값을 쓰려면 manual로 보내세요",
    });
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

// ─── 일괄양도 안분 보조 · 함께 양도된 자산(Companion) 스키마 — 별도 파일로 분리 (800줄 정책) ──────
// 실체: ./transfer-tax-schema-companion.ts
export {
  inheritanceValuationSchema,
  sameAdjustmentPeriodSchema,
  companionAssetSchema,
} from "./transfer-tax-schema-companion";

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

/**
 * ⑫ §89①4호 **1세대1입주권 비과세 — 판정 사실만** (P4-3b)
 *
 * ## 🔴 왜 `redevelopment` 블록을 쓰지 않는가
 *
 * `redevelopmentSchema`는 보내는 순간 `rightsValue`·`settlementDirection`·`settlementAmount`·
 * `preApprovalExpenses`를 **필수**로 요구한다. 그 넷은 순수 §166 3분할 **세액 산식 입력**이고,
 * Q-7이 「계산기에 남긴다」고 정한 바로 그것들이다. 판정 메뉴가 판정 하나를 받으려고
 * **산식 입력을 지어내는 것**은 거짓 데이터를 보내는 일이라 하지 않는다.
 *
 * ⇒ 판정 사실만 담는 좁은 블록을 따로 둔다(§155의2·§155의3 선례와 같은 형태).
 *
 * 🔑 **규칙은 한 벌이다.** 판정은 `resolveOneRightExemptionClause` 하나가 하고, 계산기는
 *    `redevelopment`에서, 판정 메뉴는 이 블록에서 **같은 두 사실**을 그 함수에 넘긴다.
 *    운반 상자가 둘일 뿐 규칙이 둘이 아니다.
 *
 * 🔑 요건 판정은 전부 엔진이 한다 — 「3년 이내」 같은 임계값을 여기 적지 않는다.
 */
export const oneRightExemptionFactsSchema = z.object({
  /** 인가일 현재 §89①3호가목 요건을 갖춘 기존주택 소유 — **사용자 자기선언**(기존 설계 승계) */
  eligibleAtApproval: z.boolean(),
  /**
   * 나목 — 「1조합원입주권 외에 1주택을 보유한 경우」 그 1주택의 취득일.
   * 가목(다른 주택 0채)이면 비운다. 미입력이면 엔진이 나목을 **적용하지 않는다**(판정 불가).
   */
  otherHouseAcquisitionDate: z.string().date().optional(),
  /** 양도하는 입주권의 관리처분계획인가일 — 분양권 요건 연혁(법률 제18578호 부칙 제7조②·③) 판정용(E-3 후속) */
  approvalDate: z.string().date().optional(),
});

// ─── 취득가액 의제·환산 스키마 — 별도 파일로 분리 (800줄 정책, CB-08) ──────
// 실체: ./transfer-tax-schema-acq-deemed.ts
export * from "./transfer-tax-schema-acq-deemed";

// ─── 겸용주택 분리계산 Zod 스키마 — 별도 파일로 분리 (800줄 정책) ──────
// 실체: ./transfer-tax-schema-mixed-use.ts
export { mixedUseAssetSchema } from "./transfer-tax-schema-mixed-use";
