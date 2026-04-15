/**
 * 취득세 계산 API 입력 Zod 검증 스키마
 *
 * POST /api/calc/acquisition 엔드포인트 입력 검증
 */

import { z } from "zod";

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
  // 비취득 (지방세법 §6 단서 — 취득세 과세 제외)
  "redemption",
  "corporate_merger",
  "consensual_division",
]);

const acquirerTypeSchema = z.enum(["individual", "corporation", "government", "nonprofit"]);

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
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다"),
  amount: z.number().positive(),
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
  }).optional(),
  landCategory: z.object({
    prevCategory: z.string().min(1),
    newCategory: z.string().min(1),
    prevStandardValue: z.number().nonnegative(),
    newStandardValue: z.number().nonnegative(),
  }).optional(),
  renovation: z.object({
    renovationType: z.enum(["structural_change", "use_change", "major_repair"]),
    prevStandardValue: z.number().nonnegative(),
    newStandardValue: z.number().nonnegative(),
  }).optional(),
});

// ============================================================
// 메인 취득세 입력 스키마
// ============================================================

export const acquisitionTaxInputSchema = z.object({
  // 물건 정보
  propertyType: propertyObjectTypeSchema,
  acquisitionCause: acquisitionCauseSchema,

  // 취득가액
  reportedPrice: z.number().nonnegative().default(0),
  marketValue: z.number().nonnegative().optional(),
  standardValue: z.number().nonnegative().optional(),
  standardPriceInput: standardPriceInputSchema.optional(),

  // 부담부증여
  encumbrance: z.number().nonnegative().optional(),

  // 원시취득
  constructionCost: z.number().nonnegative().optional(),

  // 연부취득
  installments: z.array(installmentPaymentSchema).optional(),

  // 취득자 정보
  acquiredBy: acquirerTypeSchema,
  isRelatedParty: z.boolean().optional(),

  // 주택 관련
  areaSqm: z.number().nonnegative().optional(),
  houseCountAfter: z.number().int().positive().optional(),
  isRegulatedArea: z.boolean().optional(),
  isLuxuryProperty: z.boolean().optional(),

  // 감면
  isFirstHome: z.boolean().optional(),
  isMetropolitan: z.boolean().optional(),

  // 간주취득
  deemedInput: deemedAcquisitionInputSchema.optional(),

  // 취득 시기
  balancePaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform(v => v || undefined),
  registrationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform(v => v || undefined),
  contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform(v => v || undefined),
  usageApprovalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform(v => v || undefined),
  actualUsageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform(v => v || undefined),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform(v => v || undefined),
});

export type AcquisitionTaxInputSchema = z.infer<typeof acquisitionTaxInputSchema>;
