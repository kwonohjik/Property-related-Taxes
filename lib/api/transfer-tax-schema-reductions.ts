/**
 * 양도소득세 감면(reductions) Zod 스키마 (⑫) — 23개 조문 discriminatedUnion
 *
 * transfer-tax-schema-sub.ts 800줄 정책 분리 (P2, 2026-06-11).
 * 외부 import 호환은 transfer-tax-schema-sub.ts re-export 유지.
 */

import { z } from "zod";
import { rentHistorySchema, vacancyPeriodSchema } from "./transfer-tax-schema-sub";

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
    // ── 조특령 §66 ⑤⑥ 편입일 부분감면 ──
    /** 주거·상업·공업지역 편입일 (YYYY-MM-DD). 2002.1.1 이후 편입 시 부분감면 적용. */
    incorporationDate: z.string().date().optional(),
    /** 편입 지역 유형 */
    incorporationZoneType: z.enum(["residential", "commercial", "industrial"]).optional(),
    /** 편입일 당시 기준시가 (원 총액 또는 ㎡당, 취득·양도시 기준시가와 동일 단위) */
    standardPriceAtIncorporation: z.number().int().nonnegative().optional(),
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
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_proviso"),
    ...rental97CommonShape,
    constructionYear: z.number().int().optional(),
    isNationalHousing: z.boolean().optional(),
    provisoCase: z.enum(["a_construction", "b_purchase", "c_10years"]).optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_2"),
    ...rental97CommonShape,
    rental972Type: z.enum(["construction", "purchase"]).optional(),
    isNationalHousing: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_3"),
    /** @deprecated Phase 1 stub 호환 */
    rentalYears: z.number().int().nonnegative().optional(),
    /** @deprecated Phase 1 stub 호환 */
    rentIncreaseRate: z.number().min(0).max(1).optional(),
    ...rental97CommonShape,
    officialPriceAtStart: z.number().int().nonnegative().optional(),
    isNationalHousingScale: z.boolean().optional(),
    region: z.enum(["capital", "non_capital"]).optional(),
    propertyType: z.enum(["apartment", "non_apartment"]).optional(),
    rentalHousingType: z.enum(["long_term_private", "public_support_private"]).optional(),
    isConvertedFromShortTerm: z.boolean().optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_4"),
    ...rental97CommonShape,
    region: z.enum(["capital", "non_capital"]).optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  z.object({
    type: z.literal("rental_97_5"),
    ...rental97CommonShape,
    officialPriceAtStart: z.number().int().nonnegative().optional(),
    region: z.enum(["capital", "non_capital"]).optional(),
    _phase1Stub: z.literal(true).optional(),
  }),
  // §99 — P1 본격 구현 (2026-06-11): 차감형 본 필드 (⑫ — 누락 시 침묵 strip)
  z.object({
    type: z.literal("new_99"),
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
  z.object({ type: z.literal("unsold_98"),         _phase1Stub: z.literal(true).optional() }),
  z.object({ type: z.literal("unsold_98_2"),       _phase1Stub: z.literal(true).optional() }),
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
  z.object({ type: z.literal("unsold_98_4"),       _phase1Stub: z.literal(true).optional() }),
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
    contractDate986: z.string().date().optional(),
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
    contractDate988: z.string().date().optional(),
    acquisitionPrice988: z.number().int().nonnegative().optional(),
    exclusiveAreaSqm988: z.number().nonnegative().optional(),
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
