/**
 * 취득세 계산 API 입력 Zod 검증 스키마
 *
 * POST /api/calc/acquisition 엔드포인트 입력 검증
 *
 * ⑫ 동기화 지점 — 이 스키마는 엔진 입력 타입(AcquisitionTaxInput)과 1:1 미러.
 * Zod 기본 strip 모드 특성상 여기 정의되지 않은 필드는 safeParse 통과 시
 * 침묵 제거되어 엔진에 도달하지 않는다 (2026-06 리뷰 R1: P1~P4 38개 필드
 * 누락으로 일시적 2주택·자경 감면·읍면 농특세 면제 등이 무력화된 사례).
 * 엔진 input 필드 추가 시 반드시 이 스키마에도 추가할 것 — 파일 하단의
 * 컴파일 타임 가드가 키 누락·타입 드리프트를 차단한다.
 */

import { z } from "zod";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

// ============================================================
// 공통 프리미티브
// ============================================================

/** YYYY-MM-DD 날짜 문자열 */
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다");

/** 빈 문자열 → undefined 정규화 허용 날짜 (클라이언트 빈 값 방어) */
const dateStrOrEmpty = dateStr
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

// ============================================================
// 열거형 스키마
// ============================================================

const propertyObjectTypeSchema = z.enum([
  "housing",
  "land",
  "land_farmland",
  "building",
  "vehicle",
  "machinery",
  "aircraft",
  "vessel",
  "mining_right",
  "fishing_right",
  "membership",
  "standing_tree",
]);

/**
 * 취득 원인 — 지방세법 §6①에 따른 유상·무상·원시·간주취득.
 *
 * ※ 환매(§15①1호)·법인합병(§15①3호)·공유물분할(§15①4호)은 별도 취득 원인이
 * 아니라 §15 세율특례 과세 대상이므로 specialRateType으로 입력한다.
 * (과거 enum의 "redemption"·"corporate_merger"·"consensual_division" 비취득
 * 3종은 지방세법 §6에 해당 단서가 존재하지 않는 법령 드리프트로 확인되어 제거 —
 * KoreanLaw 지방세법 §6·§15 실측, 2026-06-11)
 */
const acquisitionCauseSchema = z.enum([
  "purchase",
  "exchange",
  "auction",
  "in_kind_investment",
  "inheritance",
  "inheritance_farmland",
  "gift",
  "burdened_gift",
  "donation",
  "new_construction",
  "extension",
  "reconstruction",
  "reclamation",
  "deemed_major_shareholder",
  "deemed_land_category",
  "deemed_renovation",
]);

const acquirerTypeSchema = z.enum(["individual", "corporation", "government", "nonprofit"]);

/** 법정 지목 28종 (공간정보의 구축 및 관리 등에 관한 법률 §67) */
const landCategorySchema = z.enum([
  "전", "답", "과수원", "목장용지", "임야", "광천지", "염전", "대",
  "공장용지", "학교용지", "주차장", "주유소용지", "창고용지", "도로",
  "철도용지", "제방", "하천", "구거", "유지", "양어장", "수도용지",
  "공원", "체육용지", "유원지", "종교용지", "사적지", "묘지", "잡종지",
]);

// ============================================================
// 시가표준액 입력 스키마
// ============================================================

const standardPriceInputSchema = z.object({
  propertyType: propertyObjectTypeSchema,
  housingPublicPrice: z.number().nonnegative().optional(),
  individualLandPrice: z.number().nonnegative().optional(),
  landArea: z.number().nonnegative().optional(),
  newBuildingBasePrice: z.number().nonnegative().optional(),
  structureIndex: z.number().positive().optional(),
  usageIndex: z.number().positive().optional(),
  locationIndex: z.number().positive().optional(),
  elapsedYears: z.number().nonnegative().int().optional(),
  floorArea: z.number().nonnegative().optional(),
});

// ============================================================
// 연부취득 회차 스키마
// ============================================================

const installmentPaymentSchema = z.object({
  paymentDate: dateStr,
  amount: z.number().positive(),
  /** 회차 라벨 (예: "계약금", "1차 중도금") — 결과 신고 스케줄에 echo */
  label: z.string().optional(),
});

// ============================================================
// 간주취득 입력 스키마
// ============================================================

const deemedAcquisitionInputSchema = z.object({
  majorShareholder: z.object({
    corporateAssetValue: z.number().nonnegative(),
    prevShareRatio: z.number().min(0).max(1),
    newShareRatio: z.number().min(0).max(1),
    isListed: z.boolean(),
    /** 합병·분할로 인한 주식 취득 (형식적 취득 — 과세 제외 처리) */
    isMergerOrSplitShare: z.boolean().optional(),
    /** 법인 설립 시 주식 취득 (지방세법 §7⑤ 괄호 — 취득으로 보지 아니함) */
    isFoundingShare: z.boolean().optional(),
  }).optional(),
  landCategory: z.object({
    prevCategory: landCategorySchema,
    newCategory: landCategorySchema,
    prevStandardValue: z.number().nonnegative(),
    newStandardValue: z.number().nonnegative(),
    /** 사실상 지목변경 완료일 — 공부 등록일과 빠른 날이 취득시기 (시행령 §20⑩) */
    actualChangeDate: dateStr.optional(),
    /** 공부(公簿) 지목 변경 등록일 */
    registrationDate: dateStr.optional(),
  }).optional(),
  renovation: z.object({
    renovationType: z.enum(["structural_change", "use_change", "major_repair"]),
    prevStandardValue: z.number().nonnegative(),
    newStandardValue: z.number().nonnegative(),
    /** 사용승인일 — 사실상 사용개시일과 빠른 날이 취득시기 (지방세법 §20) */
    usageApprovalDate: dateStr.optional(),
    /** 사실상 사용개시일 */
    actualUsageDate: dateStr.optional(),
  }).optional(),
});

// ============================================================
// [P3] 주택 수 자동 산정 입력 스키마 (house-count/types.ts 미러)
// ============================================================

const houseTypeSchema = z.enum([
  "apartment", "villa", "single_family", "multi_household",
  "urban_living", "officetel", "other",
]);

const ownedHouseInfoSchema = z.object({
  id: z.string().optional(),
  standardValue: z.number().nonnegative(),
  type: houseTypeSchema,
  acquisitionDate: z.string(),
  isMetropolitan: z.boolean(),
  isUrbanRegenerationArea: z.boolean().optional(),
  // 11종 제외 항목
  isElderHousing: z.boolean().optional(),
  isCulturalHeritage: z.boolean().optional(),
  isFarmlandRural: z.boolean().optional(),
  isUnsoldAptNonMetro: z.boolean().optional(),
  isUnsoldFromConstructor: z.boolean().optional(),
  isCreditorAcquisition: z.boolean().optional(),
  isPublicSupportedLeaseRegistered: z.boolean().optional(),
  isPopulationDeclineLease: z.boolean().optional(),
  isStaffRentalHousing: z.boolean().optional(),
  // 한시 특례
  isHansiBenefitNewBuild: z.boolean().optional(),
  isHansiBenefitLeaseRegistered: z.boolean().optional(),
  isHansiBenefitUnsoldApt: z.boolean().optional(),
  // 공유지분
  ownershipShare: z.number().nonnegative().optional(),
  coOwnersAllInHousehold: z.boolean().optional(),
  // 공동상속
  inheritanceDate: z.string().optional(),
  shareInInheritance: z.number().optional(),
  maxShareInInheritors: z.number().optional(),
  tieInMaxShare: z.boolean().optional(),
  isResidentInInheritedHouse: z.boolean().optional(),
  isOldestInheritor: z.boolean().optional(),
});

const rightAssetSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["redevelopment_right", "subscription_right"]),
  rightAcquisitionDate: z.string(),
  isPreMarriageSubscriptionRight: z.boolean().optional(),
  inheritanceDate: z.string().optional(),
});

const officeAssetSchema = z.object({
  id: z.string().optional(),
  standardValue: z.number().nonnegative(),
  inheritanceDate: z.string().optional(),
});

const pendingAcquisitionSchema = z.object({
  isMetropolitan: z.boolean(),
  acquisitionValue: z.number().nonnegative(),
  areaSqm: z.number().nonnegative().optional(),
  type: houseTypeSchema.optional(),
  isHansiBenefitNewBuild: z.boolean().optional(),
  isHansiBenefitLeaseRegistered: z.boolean().optional(),
  isHansiBenefitUnsoldApt: z.boolean().optional(),
  isMultiHouseholdWithUnitArea: z.boolean().optional(),
  acquiredViaRight: z.boolean().optional(),
  rightAcquisitionDate: z.string().optional(),
});

const householdMemberSchema = z.object({
  id: z.string().optional(),
  relation: z.enum(["self", "spouse", "child", "parent", "grandparent", "sibling", "other"]),
  age: z.number(),
  isMinor: z.boolean().optional(),
  income12Months: z.number().optional(),
  medianIncome: z.number().optional(),
  hasIndependentLivelihood: z.boolean().optional(),
  isElderlyCohabitation: z.boolean().optional(),
  overseasMoreThan90Days: z.boolean().optional(),
  relocateWithin60Days: z.boolean().optional(),
});

const houseCountInputSchema = z.object({
  houses: z.array(ownedHouseInfoSchema),
  rights: z.array(rightAssetSchema),
  offices: z.array(officeAssetSchema),
  pendingAcquisition: pendingAcquisitionSchema.optional(),
  household: z.object({ members: z.array(householdMemberSchema) }).optional(),
  trustedHouseCount: z.number().int().nonnegative().optional(),
  referenceDate: z.string().optional(),
});

// ============================================================
// 메인 취득세 입력 스키마
// ============================================================

export const acquisitionTaxInputSchema = z.object({
  // ─── 물건 정보 ───
  propertyType: propertyObjectTypeSchema,
  acquisitionCause: acquisitionCauseSchema,

  // ─── 취득가액 ───
  reportedPrice: z.number().nonnegative().default(0),
  marketValue: z.number().nonnegative().optional(),
  standardValue: z.number().nonnegative().optional(),
  standardPriceInput: standardPriceInputSchema.optional(),

  // ─── 부담부증여 ───
  encumbrance: z.number().nonnegative().optional(),

  // ─── 원시취득 ───
  constructionCost: z.number().nonnegative().optional(),

  // ─── 연부취득 ───
  installments: z.array(installmentPaymentSchema).optional(),

  // ─── 취득자 정보 ───
  acquiredBy: acquirerTypeSchema,
  isRelatedParty: z.boolean().optional(),

  // ─── 주택 관련 ───
  areaSqm: z.number().nonnegative().optional(),
  houseCountAfter: z.number().int().positive().optional(),
  isRegulatedArea: z.boolean().optional(),
  isLuxuryProperty: z.boolean().optional(),

  // ─── 감면 ───
  isFirstHome: z.boolean().optional(),
  isMetropolitan: z.boolean().optional(),

  // ─── [P4] 부가세 정밀화 ───
  isRuralRegion: z.boolean().optional(),
  isSmallHouseFirstHome: z.boolean().optional(),

  // ─── [P1] 다주택·중과 정밀화 ───
  isUrbanRegenerationArea: z.boolean().optional(),
  isTemporaryTwoHouse: z.boolean().optional(),
  previousHouseAcquisitionDate: dateStrOrEmpty,
  previousHouseRegion: z.enum(["regulated", "non_regulated"]).optional(),
  newHouseRegion: z.enum(["regulated", "non_regulated"]).optional(),
  wholeHouseStandardValue: z.number().nonnegative().optional(),
  isMetropolitanRegion: z.boolean().optional(),

  // ─── [P1] 부담부증여·무상취득 관계 ───
  giftRelation: z.enum(["spouse_or_lineal", "other"]).optional(),
  giftorRelation: z.enum([
    "spouse",
    "lineal_ascendant",
    "lineal_ascendant_spouse",
    "lineal_descendant",
    "lineal_descendant_step",
    "other",
  ]).optional(),
  giftorIs1HHHolder: z.boolean().optional(),

  // ─── [P1] §13의2④ 조정대상지역 지정 전 계약 보호 ───
  contractDateBeforeRegulation: z.boolean().optional(),
  regulationDesignationDate: dateStrOrEmpty,
  hasContractDepositProof: z.boolean().optional(),

  // ─── [P1] 사치성 + 대도시 법인 중복 (§13⑦) ───
  isCorpMetroSurcharge: z.boolean().optional(),
  luxuryType: z.enum([
    "villa", "golf_course", "luxury_housing", "luxury_entertainment", "luxury_vessel",
  ]).optional(),

  // ─── [P2] 법인·공장 중과 §13①② ───
  isMetropolitanCongestion: z.boolean().optional(),
  isHeadquarterNewBuild: z.boolean().optional(),
  isNonUrbanFactory: z.boolean().optional(),
  factoryComponent: z.enum(["land", "building", "combined"]).optional(),
  isWithin5YearsOfEstablishment: z.boolean().optional(),
  excludedBusinessType: z.enum([
    "infrastructure", "bank", "overseas_construction", "housing_construction",
    "telecom", "high_tech", "distribution", "transport", "gov_funded",
  ]).optional(),
  isDormantCorpAcquisition: z.boolean().optional(),
  dormantCorpType: z.enum([
    "dissolved", "deemed_dissolved", "closed",
    "re_registered_1yr", "no_continue_reg_1yr", "officer_50pct_change",
  ]).optional(),
  majorShareholderDate: dateStrOrEmpty,

  // ─── [P2] 세율특례 §15 ───
  specialRateType: z.enum([
    "redemption", "inheritance_one_house", "corp_merger",
    "co_ownership_split", "building_relocation", "divorce_division",
    "hoyu_division", "timber", "leasing",
  ]).optional(),
  isOneHouseHousehold: z.boolean().optional(),
  isSelfCultivatedFarmlandInheritance: z.boolean().optional(),

  // ─── [P2] 자경농지 50% 감면 (지특법 §6) ───
  isSelfCultivatedFarmer: z.boolean().optional(),
  farmingYears: z.number().nonnegative().optional(),
  farmlandArea: z.number().nonnegative().optional(),
  farmlandLocationDistance: z.number().nonnegative().optional(),

  // ─── [P3] 주택 수 자동 산정 ───
  houseCountInput: houseCountInputSchema.optional(),
  acquisitionOwnershipShare: z.number().min(0).max(1).optional(),
  coOwnersAllInHousehold: z.boolean().optional(),
  acquiredViaRight: z.boolean().optional(),
  rightAcquisitionDate: dateStrOrEmpty,
  isHansiBenefitNewBuild: z.boolean().optional(),
  isHansiBenefitLeaseRegistered: z.boolean().optional(),
  isHansiBenefitUnsoldApt: z.boolean().optional(),
  isMultiHouseholdWithUnitArea: z.boolean().optional(),
  separateHouseholdReason: z.enum([
    "under30_income", "over65_cohabitation", "overseas_90days", "relocate_60days",
  ]).nullable().optional(),
  trustedHouseCount: z.number().int().nonnegative().optional(),

  // ─── 간주취득 ───
  deemedInput: deemedAcquisitionInputSchema.optional(),

  // ─── 취득 시기 ───
  balancePaymentDate: dateStrOrEmpty,
  registrationDate: dateStrOrEmpty,
  contractDate: dateStrOrEmpty,
  usageApprovalDate: dateStrOrEmpty,
  actualUsageDate: dateStrOrEmpty,
  targetDate: dateStrOrEmpty,
});

export type AcquisitionTaxInputSchema = z.infer<typeof acquisitionTaxInputSchema>;

// ============================================================
// ⑫ 컴파일 타임 동기화 가드 (런타임 영향 없음)
// ============================================================
// 1) 스키마 출력이 엔진 입력 타입에 그대로 대입 가능 — 타입 드리프트 차단
// 2) 엔진 입력의 모든 키가 스키마에 존재 — 신규 필드 침묵 strip 차단
//    (둘 중 하나라도 깨지면 tsc가 이 파일에서 실패한다)
const _zodEngineSyncGuards: [
  AcquisitionTaxInputSchema extends AcquisitionTaxInput ? true : never,
  Exclude<keyof AcquisitionTaxInput, keyof AcquisitionTaxInputSchema> extends never ? true : never,
] = [true, true];
void _zodEngineSyncGuards;
