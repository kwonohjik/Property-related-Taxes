/**
 * 양도소득세 감면(reductions) Zod 스키마 (⑫) — 24개 조문 discriminatedUnion
 *
 * transfer-tax-schema-sub.ts 800줄 정책 분리 (P2, 2026-06-11).
 * 외부 import 호환은 transfer-tax-schema-sub.ts re-export 유지.
 */

import { z } from "zod";
// 공용 leaf에서 직접 import — sub와의 순환(ESM 초기화 TDZ) 방지
import { rentHistorySchema, vacancyPeriodSchema } from "./transfer-tax-schema-rental";

/**
 * 장기임대 §97 시리즈 공통 필드 (Phase 2 — 2026-06-11).
 * 날짜는 YYYY-MM-DD string — Route handler에서 Date 변환 (⑭).
 */
const rental97CommonShape = {
  registrationDate: z.string().date().optional(),
  rentalStartDate: z.string().date().optional(),
  isTaxRegistered: z.boolean().optional(),
  rentIncreaseViolated: z.boolean().optional(),
  rentHistory: z.array(rentHistorySchema).optional(),
  vacancyPeriods: z.array(vacancyPeriodSchema).optional(),
  /** D2-06 — 임대가 양도일까지 계속되었는가 (조특령 §97의3⑤ B·§97의5②) */
  rentalContinuesToTransfer: z.boolean().optional(),
  /** D2-06 — 실제 임대기간 마지막 날의 기준시가 (원) */
  stdPriceAtRentalEnd: z.number().int().nonnegative().optional(),
  /**
   * Q10 — 안분 산식 E·D (조특령 §97의3⑤·§97의5②). **감면-수준 override**이고,
   * 없으면 라우터가 자산-수준 기준시가(ctx)로 폴백한다. ⑫에 없으면 침묵 stripping된다.
   */
  stdPriceAtAcquisition: z.number().int().nonnegative().optional(),
  stdPriceAtTransfer: z.number().int().nonnegative().optional(),
} as const;

/** §97 본문·단서 전용 — 조특령 §97① 5호 요건 + §97⑤4호 5호 미만 기간 (D1-01) */
const rental97UnitCountShape = {
  hasMin5RentalUnits: z.boolean().optional(),
  belowMin5UnitsPeriods: z.array(vacancyPeriodSchema).optional(),
  /** D1-06 — §97①2호 「1985.12.31 이전에 신축된 공동주택」 */
  isMultiUnitHousing: z.boolean().optional(),
  /** D1-06 — §97①2호 「1986.1.1 현재 입주된 사실이 없는 주택」 */
  isUnoccupiedAt1986: z.boolean().optional(),
  /** D1-07 — §97① 단서 나목 「취득 당시 입주된 사실이 없는 주택만 해당」 */
  isUnoccupiedAtAcquisition: z.boolean().optional(),
} as const;

export const reductionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("self_farming"),
    farmingYears: z.number().int().nonnegative(),
    /**
     * 조특령 §66 ⑪ 1호 — 피상속인이 경작한 기간(년).
     * 본인 자경기간이 §69 요건(8년)에 미달할 때 합산한다.
     */
    decedentFarmingYears: z.number().int().nonnegative().optional(),
    /** 조특령 §66⑪ 본문 — 상속받은 농지 1년 이상 계속 경작 */
    heirContinuedFarming1Year: z.boolean().optional(),
    /** 조특령 §66⑫ 대체요건 — 3년 내 양도·수용 + 택지개발지구·산업단지 등 지정 */
    meetsDecedentAggregationAlt: z.boolean().optional(),
    /** 조특령 §66⑭ — 거주자 본인 결격 과세기간 수(년) */
    disqualifiedTaxPeriodsSelf: z.number().int().nonnegative().optional(),
    /** 조특령 §66⑭ — 피상속인(배우자 포함) 결격 과세기간 수(년) */
    disqualifiedTaxPeriodsDecedent: z.number().int().nonnegative().optional(),
    // ── 조특령 §66④1호(3년 배제)·§66⑦(부분감면) 편입 ──
    /** 주거·상업·공업지역 편입일 (YYYY-MM-DD). 2002.1.1 이후 편입 시 부분감면 적용. */
    incorporationDate: z.string().date().optional(),
    /** 편입 지역 유형 */
    incorporationZoneType: z.enum(["residential", "commercial", "industrial"]).optional(),
    /** 양도일 현재 소재지 구분 — §66④1호 3년 배제의 소재지 요건 */
    incorporationLocationType: z.enum(["metro_or_city", "gun_or_eup_myeon"]).optional(),
    /** §66④1호 단서 가·나·다목 해당 — 3년 배제 제외 */
    hasIncorporationProvisoException: z.boolean().optional(),
    /** 편입일 당시 기준시가 (원 총액 또는 ㎡당, 취득·양도시 기준시가와 동일 단위) */
    standardPriceAtIncorporation: z.number().int().nonnegative().optional(),
    /** 취득시 기준시가 (원) — 편입 부분감면 비율 산정. 미제공 시 자산-수준 fallback */
    standardPriceAtAcquisition: z.number().int().nonnegative().optional(),
    /** 양도시 기준시가 (원) — 편입 부분감면 비율 산정. 미제공 시 자산-수준 fallback */
    standardPriceAtTransfer: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("long_term_rental"),
    rentalYears: z.number().int().nonnegative(),
    rentIncreaseRate: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal("new_housing"),
    region: z.enum(["metropolitan", "non_metropolitan"]),
  }),
  z.object({
    type: z.literal("unsold_housing"),
    region: z.enum(["metropolitan", "non_metropolitan"]),
  }),
  z.object({
    type: z.literal("public_expropriation"),
    cashCompensation: z.number().int().nonnegative(),
    bondCompensation: z.number().int().nonnegative(),
    bondHoldingYears: z.union([z.literal(3), z.literal(5), z.null()]).optional(),
    businessApprovalDate: z.string().date(),
  }).refine(
    (v) => v.cashCompensation + v.bondCompensation > 0,
    { message: "현금 또는 채권 보상액 중 최소 하나는 0보다 커야 합니다" },
  ),
  // 조특법 §77의3 — 개발제한구역 매수 토지 감면
  z.object({
    type: z.literal("gb_designated_land"),
    branch: z.union([z.literal("in_zone"), z.literal("released")]),
    /**
     * ① 매수 경로 — 「개발제한구역법」 §17(토지매수 청구, 매수대상**토지**) / §20(협의매수, 토지등).
     * ②는 공익사업법 경로라 미전달. optional인 이유는 ② payload에는 이 키가 없기 때문이다.
     */
    purchaseRoute: z.union([z.literal("claim"), z.literal("negotiated")]).optional(),
    designationDate: z.string().date(),
    triggerDate: z.string().date(),
    releasedDate: z.string().date().optional(),
    freeEconZone: z.boolean().optional(),
    residedFromAcqToTrigger: z.boolean(),
  }),
  // 조특법 §77의2 — 대토보상 과세특례 (40% 세액감면)
  z.object({
    type: z.literal("replacement_land_comp"),
    cashCompensation: z.number().int().nonnegative(),
    replacementLandComp: z.number().int().nonnegative(),
    // §77의2① 소급 2년 취득요건 — 자산-수준 사업인정고시일 재사용(미상 시 생략)
    businessApprovalDate: z.string().date().optional(),
  }).refine(
    (v) => v.replacementLandComp > 0,
    { message: "대토보상액은 0보다 커야 합니다" },
  ),
  // ─────────────────────────────────────────────────────────────
  // Phase 1 골격 (2026-05-06): 23개 조문 인벤토리 신규 stub 멤버 (20개)
  // 본 단계는 type 식별 + 시한 검증만 — 본 요건 필드는 Phase 2~ 에서 추가.
  // 매핑: lib/tax-engine/transfer-reductions/types.ts TransferReductionId
  // ─────────────────────────────────────────────────────────────
  // ── Phase 2 (2026-06-11): 장기임대 §97 시리즈 본 요건 필드 (모두 optional — stub 호환 + UI/validate에서 필수 검증) ──
  // 명명 통일(E5): registrationDate — 폼·API·Route·엔진 동일 키.
  z.object({
    type: z.literal("rental_97_main"),
    ...rental97CommonShape,
    constructionYear: z.number().int().optional(),
    isNationalHousing: z.boolean().optional(),
    ...rental97UnitCountShape,
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_proviso"),
    ...rental97CommonShape,
    constructionYear: z.number().int().optional(),
    isNationalHousing: z.boolean().optional(),
    ...rental97UnitCountShape,
    provisoCase: z.enum(["a_construction", "b_purchase", "c_10years"]).optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_2"),
    ...rental97CommonShape,
    rental972Type: z.enum(["construction", "purchase"]).optional(),
    isNationalHousing: z.boolean().optional(),
    /** 조특령 §97의2① — 신축임대 1호 포함 2호 이상 임대 (D1-02) */
    hasNewRentalPlus2Units: z.boolean().optional(),
    /** D1-07 — §97의2①2호 「취득 당시 입주된 사실이 없는 주택만 해당」 */
    isUnoccupiedAtAcquisition: z.boolean().optional(),
    /** D9-01 — §97의2①1호 나목 「1999.8.19 이전 신축 공동주택」 */
    isMultiUnitHousing972: z.boolean().optional(),
    /** D9-01 — §97의2①1호 나목 「1999.8.20 현재 입주된 사실이 없는 주택」 */
    isUnoccupiedAt19990820: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_3"),
    /** D2-07 — §97의3① 「민간건설임대주택」 한정 (2023.1.1 이후 등록분) */
    isPrivateConstructionRental: z.boolean().optional(),
    /** @deprecated Phase 1 stub 호환 */
    rentalYears: z.number().int().nonnegative().optional(),
    /** @deprecated Phase 1 stub 호환 */
    rentIncreaseRate: z.number().min(0).max(1).optional(),
    ...rental97CommonShape,
    officialPriceAtStart: z.number().int().nonnegative().optional(),
    isNationalHousingScale: z.boolean().optional(),
    region: z.enum(["capital", "non_capital"]).optional(),
    rentalHousingType: z.enum(["long_term_private", "public_support_private"]).optional(),
    isConvertedFromShortTerm: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_4"),
    /** D2-04 — 임대개시일 당시 주택+부수토지 기준시가 합계 (소령 §167의3①2호 가목·다목 한도) */
    officialPriceAtStart: z.number().int().nonnegative().optional(),
    /** D2-04 — 가목(민간매입 1호↑) / 다목(건설임대 2호↑) */
    rental974Category: z.enum(["purchase_a", "construction_c"]).optional(),
    ...rental97CommonShape,
    region: z.enum(["capital", "non_capital"]).optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_5"),
    /** CA-01 — §97의5①3호 준용 (조특령 §97의3③2호 국민주택규모) */
    isNationalHousingScale: z.boolean().optional(),
    ...rental97CommonShape,
    officialPriceAtStart: z.number().int().nonnegative().optional(),
    region: z.enum(["capital", "non_capital"]).optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §99 — P1 본격 구현 (2026-06-11): 차감형 본 필드 (⑫ — 누락 시 침묵 strip)
  z.object({
    type: z.literal("new_99"),
    /** D11-05 — 법 §99① 「거주자(주택건설사업자는 제외한다)가 …」 */
    isResident99: z.boolean().optional(),
    isHousingConstructionBusiness99: z.boolean().optional(),
    region: z.enum(["metropolitan", "non_metropolitan"]).optional(),
    contractDate99: z.string().date().optional(),
    usageApprovalDate99: z.string().date().optional(),
    acquisitionType99: z.enum(["from_builder", "self_built"]).optional(),
    isNationalHousing99: z.boolean().optional(),
    standardPriceAtAcquisition99: z.number().int().nonnegative().optional(),
    standardPriceAt5Years99: z.number().int().nonnegative().optional(),
    standardPriceAtTransfer99: z.number().int().nonnegative().optional(),
    exclusiveAreaSqm99: z.number().nonnegative().optional(),
    hasOccupancyAtContract99: z.boolean().optional(),
    isRecontractExcluded99: z.boolean().optional(),
    recontractUnavoidableCause99: z.boolean().optional(),
    isRedevelopedNewHouse99: z.boolean().optional(),
    previousHouseStdPrice99: z.number().int().nonnegative().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §99의3 — Phase 2 본격 구현 (2026-05-06): 본 요건 필드 추가 + Phase 1 stub 호환
  z.object({
    type: z.literal("new_99_3"),
    /** Phase 1 stub 호환 region 필드 (deprecated, 마이그레이션 전 임시) */
    region: z.enum(["metropolitan", "non_metropolitan"]).optional(),
    _phase1Stub: z.literal(true).optional(),
    // ── Phase 2 본 요건 필드 (모두 optional — Phase 1 stub 호환 + UI에서 필수 검증) ──
    /** 분양계약일 (1호 적용) */
    contractDate993: z.string().date().optional(),
    /** 사용승인일 (2호 적용) */
    usageApprovalDate993: z.string().date().optional(),
    /** 5년 시점 기준시가 (원) */
    standardPriceAt5Years: z.number().int().nonnegative().optional(),
    /** 취득시 기준시가 (원) — PHD 환산 결과 */
    standardPriceAtAcquisition993: z.number().int().nonnegative().optional(),
    /** 양도시 기준시가 (원) */
    standardPriceAtTransfer993: z.number().int().nonnegative().optional(),
    isRecontractExcluded993: z.boolean().optional(),
    recontractUnavoidableCause993: z.boolean().optional(),
    isRedevelopedNewHouse993: z.boolean().optional(),
    previousHouseStdPrice993: z.number().int().nonnegative().optional(),
    /** 전용면적(㎡) — 고가주택 판정(2002.12.31 이전 취득) */
    exclusiveAreaSqm993: z.number().nonnegative().optional(),
    /** 지역 — 가격 급등 지역 내/외 */
    region993: z.enum(["outside_speculation", "speculation"]).optional(),
    /** 취득 유형 — 1호 / 2호 */
    acquisitionType993: z.enum(["from_builder", "self_built"]).optional(),
    /** 매매계약일 입주사실 (1호 단서) */
    hasOccupancyAtContract: z.boolean().optional(),
    /** 거주자 여부 */
    isResident993: z.boolean().optional(),
    /** 본인이 주택건설사업자 */
    isHousingConstructionBusiness993: z.boolean().optional(),
    // Round 10 (2026-05-06): PHD 환산 입력 (취득시 추정 공동주택가격 자동 산출)
    phdMode993: z.boolean().optional(),
    phdFirstDisclosureDate993: z.string().date().optional(),
    phdFirstDisclosurePrice993: z.number().int().nonnegative().optional(),
    phdLandAreaSqm993: z.number().nonnegative().optional(),
    phdLandPricePerSqmAtAcq993: z.number().int().nonnegative().optional(),
    phdLandPricePerSqmAtFirst993: z.number().int().nonnegative().optional(),
    phdBuildingStdAtAcq993: z.number().int().nonnegative().optional(),
    phdBuildingStdAtFirst993: z.number().int().nonnegative().optional(),
  }),
  // §99의4 — Phase 2 본격 구현 (2026-06-11): 주택수 제외 본 필드 (⑫ — 누락 시 침묵 strip)
  z.object({
    type: z.literal("new_99_4_rural"),
    ruralHouseAcquisitionDate: z.string().date().optional(),
    ruralHouseStdPrice: z.number().int().nonnegative().optional(),
    isRegisteredHanok: z.boolean().optional(),
    isAdjacentArea: z.boolean().optional(),
    meetsLocationRequirement: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("new_99_4_hometown"),
    ruralHouseAcquisitionDate: z.string().date().optional(),
    ruralHouseStdPrice: z.number().int().nonnegative().optional(),
    isRegisteredHanok: z.boolean().optional(),
    isAdjacentArea: z.boolean().optional(),
    meetsLocationRequirement: z.boolean().optional(),
    meetsHometownRequirement: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98 — P5 본격 구현 (2026-06-12, ⑫)
  z.object({
    type: z.literal("unsold_98"),
    /** D11-05 — 법 §98① 「거주자가 …」 */
    isResident98: z.boolean().optional(),
    contractDate98: z.string().date().optional(),
    isNationalScale98: z.boolean().optional(),
    isOutsideSeoul98: z.boolean().optional(),
    isUnsoldConfirmed98: z.boolean().optional(),
    isNotRentalHousing98: z.boolean().optional(),
    isFirstBuyerNoOccupancy98: z.boolean().optional(),
    rentedFor5Years98: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98의2 — P4 본격 구현 (2026-06-12, ⑫)
  z.object({
    type: z.literal("unsold_98_2"),
    /** D11-05 — 법 §98의2① 「거주자가 …」 */
    isResident982: z.boolean().optional(),
    contractDate982: z.string().date().optional(),
    isNonCapitalUnsold982: z.boolean().optional(),
    isFirstOrFcfsContract982: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98의3 — P3 본격 구현 (2026-06-12): 하이브리드 본 필드 (⑫ — 누락 시 침묵 strip)
  z.object({
    type: z.literal("unsold_98_3"),
    region: z.enum(["metropolitan", "non_metropolitan"]).optional(),
    residencyType983: z.enum(["resident", "nonresident_no_pe"]).optional(),
    houseType983: z.enum(["purchased", "self_built"]).optional(),
    contractDate983: z.string().date().optional(),
    constructionStartDate983: z.string().date().optional(),
    usageApprovalDate983: z.string().date().optional(),
    isOutsideSeoulNotDesignated983: z.boolean().optional(),
    isOverconcentration983: z.boolean().optional(),
    landAreaSqm983: z.number().nonnegative().optional(),
    floorAreaSqm983: z.number().nonnegative().optional(),
    isUnsoldConfirmed983: z.boolean().optional(),
    isFirstContract983: z.boolean().optional(),
    isNotOccupiedAtContract983: z.boolean().optional(),
    isNotRecontract983: z.boolean().optional(),
    isNotExcludedSelfBuilt983: z.boolean().optional(),
    standardPriceAtAcquisition983: z.number().int().nonnegative().optional(),
    standardPriceAt5Years983: z.number().int().nonnegative().optional(),
    standardPriceAtTransfer983: z.number().int().nonnegative().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98의4 — P4 본격 구현 (2026-06-12, ⑫)
  z.object({
    type: z.literal("unsold_98_4"),
    contractDate984: z.string().date().optional(),
    isNonResidentNoPe984: z.boolean().optional(),
    isNotUnsold983House984: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98의5 — P3 본격 구현 (2026-06-12)
  z.object({
    type: z.literal("unsold_98_5"),
    priceReductionRate: z.number().min(0).max(1).optional(),
    contractDate985: z.string().date().optional(),
    priceReductionRatePct985: z.number().nonnegative().optional(),
    isNonCapitalUnsoldAtCutoff985: z.boolean().optional(),
    isFirstContract985: z.boolean().optional(),
    isNotOccupiedAtContract985: z.boolean().optional(),
    isNotRecontract985: z.boolean().optional(),
    standardPriceAtAcquisition985: z.number().int().nonnegative().optional(),
    standardPriceAt5Years985: z.number().int().nonnegative().optional(),
    standardPriceAtTransfer985: z.number().int().nonnegative().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98의6 — P3 본격 구현 (2026-06-12)
  z.object({
    type: z.literal("unsold_98_6"),
    hoType986: z.enum(["seller_rented", "buyer_rented"]).optional(),
    stdPriceSumAtBase986: z.number().int().nonnegative().optional(),
    floorAreaSqm986: z.number().nonnegative().optional(),
    isUnsoldAfterCompletion986: z.boolean().optional(),
    isFirstContract986: z.boolean().optional(),
    isNotOccupiedAfterCompletion986: z.boolean().optional(),
    isNotRecontract986: z.boolean().optional(),
    sellerRented2Years986: z.boolean().optional(),
    rentalContractDate986: z.string().date().optional(),
    rentalStartDate986: z.string().date().optional(),
    rentalEndDate986: z.string().date().optional(),
    inheritedRentalMonths986: z.number().int().nonnegative().optional(),
    standardPriceAtAcquisition986: z.number().int().nonnegative().optional(),
    standardPriceAt5Years986: z.number().int().nonnegative().optional(),
    standardPriceAtTransfer986: z.number().int().nonnegative().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98의7 — P2 본격 구현 (2026-06-11): 하이브리드 본 필드 (⑫ — 누락 시 침묵 strip)
  z.object({
    type: z.literal("unsold_98_7"),
    /** D11-05 — 법 §98의7① 「내국인이 …」 (조특법 §2①1호) */
    isDomestic987: z.boolean().optional(),
    contractDate987: z.string().date().optional(),
    acquisitionPrice987: z.number().int().nonnegative().optional(),
    isUnsoldAtCutoff987: z.boolean().optional(),
    isFirstContract987: z.boolean().optional(),
    isNotOccupiedAtContract987: z.boolean().optional(),
    isNotRecontract987: z.boolean().optional(),
    standardPriceAtAcquisition987: z.number().int().nonnegative().optional(),
    standardPriceAt5Years987: z.number().int().nonnegative().optional(),
    standardPriceAtTransfer987: z.number().int().nonnegative().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98의8 — P1 본격 구현 (2026-06-11): 차감형 50% 본 필드 (⑫ — 누락 시 침묵 strip)
  z.object({
    type: z.literal("unsold_98_8"),
    /** D11-05 — 법 §98의8① 「거주자가 …」 */
    isResident988: z.boolean().optional(),
    contractDate988: z.string().date().optional(),
    acquisitionPrice988: z.number().int().nonnegative().optional(),
    exclusiveAreaSqm988: z.number().nonnegative().optional(),
    rentalContractDate988: z.string().date().optional(),
    rentalStartDate988: z.string().date().optional(),
    rentalEndDate988: z.string().date().optional(),
    inheritedRentalMonths988: z.number().int().nonnegative().optional(),
    isUnsoldAfterCompletion988: z.boolean().optional(),
    isFirstContract988: z.boolean().optional(),
    isNotRecontract988: z.boolean().optional(),
    standardPriceAtAcquisition988: z.number().int().nonnegative().optional(),
    standardPriceAt5Years988: z.number().int().nonnegative().optional(),
    standardPriceAtTransfer988: z.number().int().nonnegative().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §98의9 — Phase 2 본격 구현 (2026-06-11): 주택수 제외 본 필드 (⑫ — 누락 시 침묵 strip)
  z.object({
    type: z.literal("unsold_98_9"),
    unsoldHouseAcquisitionDate: z.string().date().optional(),
    unsoldHouseAcquisitionPrice: z.number().int().nonnegative().optional(),
    unsoldHouseExclusiveArea: z.number().nonnegative().optional(),
    isNonCapitalRegion: z.boolean().optional(),
    wasOneHouseholdAtAcquisition: z.boolean().optional(),
    meetsSellerAndContractRequirement: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §99의2 — P2 본격 구현 (2026-06-11): 하이브리드 본 필드 (⑫ — 누락 시 침묵 strip)
  z.object({
    type: z.literal("unsold_99_2"),
    houseType992: z.enum(["new_or_unsold", "self_built", "existing_one_house"]).optional(),
    contractDate992: z.string().date().optional(),
    usageApprovalDate992: z.string().date().optional(),
    acquisitionPrice992: z.number().int().nonnegative().optional(),
    exclusiveAreaSqm992: z.number().nonnegative().optional(),
    meetsHouseTypeRequirement992: z.boolean().optional(),
    isNotExcludedSelfBuilt992: z.boolean().optional(),
    meetsOneHouseSellerRequirement992: z.boolean().optional(),
    isOfficetel992: z.boolean().optional(),
    meetsOfficetelRequirement992: z.boolean().optional(),
    isNotRecontract992: z.boolean().optional(),
    hasConfirmationSeal992: z.boolean().optional(),
    standardPriceAtAcquisition992: z.number().int().nonnegative().optional(),
    standardPriceAt5Years992: z.number().int().nonnegative().optional(),
    standardPriceAtTransfer992: z.number().int().nonnegative().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
]);
