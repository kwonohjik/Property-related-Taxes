/**
 * 재산평가 입력 Zod 스키마
 * 상속·증여 API Route에서 입력 검증에 사용
 */
import { z } from "zod";

// ============================================================
// 비상장주식 평가 데이터 스키마
// ============================================================

export const unlistedStockDataSchema = z.object({
  totalShares: z.number().int().positive({ message: "총 발행주식 수는 1 이상이어야 합니다." }),
  ownedShares: z.number().int().positive({ message: "보유 주식 수는 1 이상이어야 합니다." }),
  weightedNetIncome: z.number(), // 최근 3년 가중평균 순손익 — 적자 시 0 입력
  netAssetValue: z.number().nonnegative({ message: "순자산가치는 0 이상이어야 합니다." }),
  capitalizationRate: z.number().min(0.01).max(1).default(0.10),
});

// ============================================================
// 자산 종류별 discriminatedUnion 스키마
// ============================================================

// ── 종합사례 PDF 확장 — HeirAllocation·deemedCategory ──
export const heirAllocationSchema = z.object({
  heirId: z.string().min(1),
  amount: z.number().nonnegative(),
  areaM2: z.number().nonnegative().optional(),
});

const baseItemSchema = z.object({
  id: z.string().min(1),
  // cash·financial·deposit은 위치 기반이 아니므로 자산명 선택 입력 (빈 문자열 허용)
  name: z.string(),
  marketValue: z.number().nonnegative().optional(),
  appraisedValue: z.number().nonnegative().optional(),
  standardPrice: z.number().nonnegative().optional(),
  mortgageAmount: z.number().nonnegative().optional(),
  leaseDeposit: z.number().nonnegative().optional(),
  // 종합사례 PDF 확장
  heirAllocations: z.array(heirAllocationSchema).optional(),
  deemedCategory: z.enum(["retirement", "insurance", "trust"]).optional(),
  isFamilyBusinessAsset: z.boolean().optional(),
});

export const landItemSchema = baseItemSchema.extend({
  category: z.literal("real_estate_land"),
});

export const apartmentItemSchema = baseItemSchema.extend({
  category: z.literal("real_estate_apartment"),
});

export const buildingItemSchema = baseItemSchema.extend({
  category: z.literal("real_estate_building"),
});

export const listedStockItemSchema = baseItemSchema.extend({
  category: z.literal("listed_stock"),
  listedStockAvgPrice: z
    .number()
    .positive({ message: "전후 2개월 종가 평균가는 0보다 커야 합니다." }),
  listedStockShares: z
    .number()
    .int()
    .positive({ message: "보유 주식 수는 1 이상이어야 합니다." }),
});

export const unlistedStockItemSchema = baseItemSchema.extend({
  category: z.literal("unlisted_stock"),
  unlistedStockData: unlistedStockDataSchema,
});

export const cashItemSchema = baseItemSchema.extend({
  category: z.literal("cash"),
  marketValue: z.number().nonnegative({ message: "현금 금액은 0 이상이어야 합니다." }),
});

export const financialItemSchema = baseItemSchema.extend({
  category: z.literal("financial"),
  marketValue: z.number().nonnegative(),
});

export const depositItemSchema = baseItemSchema.extend({
  category: z.literal("deposit"),
  leaseDeposit: z.number().positive({ message: "임대보증금은 0보다 커야 합니다." }),
});

export const otherItemSchema = baseItemSchema.extend({
  category: z.literal("other"),
});

/** 자산 항목 discriminatedUnion 스키마 */
export const estateItemSchema = z.discriminatedUnion("category", [
  landItemSchema,
  apartmentItemSchema,
  buildingItemSchema,
  listedStockItemSchema,
  unlistedStockItemSchema,
  cashItemSchema,
  financialItemSchema,
  depositItemSchema,
  otherItemSchema,
]);

export type EstateItemInput = z.infer<typeof estateItemSchema>;

// ============================================================
// 저가·고가 양도 증여의제 판정 스키마 (상증법 §35)
// ============================================================

export const bargainTransferInputSchema = z.object({
  transactionPrice: z.number().nonnegative({ message: "거래가액은 0 이상이어야 합니다." }),
  marketValue: z.number().positive({ message: "시가는 0보다 커야 합니다." }),
  isRelatedParty: z.boolean(),
  transactionType: z.enum(["purchase", "sale"]),
});

export type BargainTransferInputSchema = z.infer<typeof bargainTransferInputSchema>;

// ============================================================
// 사전증여 내역 스키마
// ============================================================

/** Phase A: 증여자 관계 enum (7그룹 8값, gift-prior-aggregation.ts와 동일) */
export const giftDonorRelationSchema = z.enum([
  "father",
  "mother",
  "grandparent",
  "spouse",
  "lineal_descendant",
  "sibling",
  "other_relative",
  "other",
]);

export const priorGiftSchema = z.object({
  giftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  isHeir: z.boolean().optional(),
  giftAmount: z.number().nonnegative(),
  giftTaxPaid: z.number().nonnegative(),
  giftTaxBase: z.number().nonnegative().optional(),
  doneeRelation: z
    .enum([
      "spouse",
      "lineal_ascendant_adult",
      "lineal_ascendant_minor",
      "lineal_descendant",
      "other_relative",
    ])
    .optional(),
  // Phase A: 동일인 §47 합산 + §58/§57 한도 산식용
  donor: giftDonorRelationSchema.optional(),
  computedTax: z.number().nonnegative().optional(),
  additionalGenerationSkipSurcharge: z.number().nonnegative().optional(),
  wasGenerationSkip: z.boolean().optional(),
  // 종합사례 PDF 확장 — 상속인별 배부·영리법인 면제
  doneeId: z.string().min(1).optional(),
  beneficiaryType: z.enum(["heir", "legatee", "corporate"]).optional(),
  corporateGiftComputedTax: z.number().nonnegative().optional(),
  // UI 메타 (이력 조회 출처) — 엔진 무시. buildInput에서 strip(④) 누락 안전망(⑨).
  sourceCalculationId: z.string().optional(),
});

// ============================================================
// 비과세 항목 스키마 — ExemptionCheckedItem[] 기반 (§11·§12·§46·§46의2)
// ============================================================

export const exemptionCheckedItemSchema = z.object({
  ruleId: z.string().min(1),
  claimedAmount: z.number().nonnegative(),
  priorDisabledTrustUsed: z.number().nonnegative().optional(),
  relatedStockExceeded: z.boolean().optional(),
  excessStockAmount: z.number().nonnegative().optional(),
  marriageExemptionAlreadyUsed: z.boolean().optional(),
  claimedAreaM2: z.number().nonnegative().optional(),
});

/** @deprecated ExemptionInput → ExemptionCheckedItem[] 로 대체됨 */
export const exemptionInputSchema = z.object({
  isWarHero: z.boolean().optional(),
  donatedToState: z.number().nonnegative().optional(),
  ceremonialProperty: z.number().nonnegative().optional(),
  culturalProperty: z.number().nonnegative().optional(),
  socialNormGifts: z.number().nonnegative().optional(),
  publicInterestContribution: z.number().nonnegative().optional(),
});

// ============================================================
// 상속인 스키마
// ============================================================

export const heirSchema = z.object({
  id: z.string().min(1),
  relation: z.enum([
    "spouse",
    "child",
    "lineal_ascendant",
    "sibling",
    "other",
    // 종합사례 PDF 확장
    "legatee",
    "corporate",
  ]),
  name: z.string().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
  isDisabled: z.boolean().optional(),
  actualShareRatio: z.number().min(0).max(1).optional(),
  isCohabitant: z.boolean().optional(),
  // 종합사례 PDF 확장
  isHeir: z.boolean().optional(),
  isGenerationSkipBeneficiary: z.boolean().optional(),
  corporateGiftComputedTax: z.number().nonnegative().optional(),
});

// ── DebtItem 스키마 (Phase A0 협의분할) ──
export const debtItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["financial", "tax", "personal", "funeral"]),
  name: z.string(),
  amount: z.number().nonnegative(),
  isBongan: z.boolean().optional(),
  heirAllocations: z.array(heirAllocationSchema).optional(),
});

// ── PresumedInheritanceItem 스키마 (Phase A §15) ──
export const presumedInheritanceItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["real_estate", "deposit", "other_asset", "financial_debt"]),
  amountWithin1Y: z.number().nonnegative(),
  amountWithin2Y: z.number().nonnegative(),
  verifiedUseAmount: z.number().nonnegative(),
  heirAllocations: z.array(heirAllocationSchema).optional(),
});

// ============================================================
// 상속공제 입력 스키마
// ============================================================

export const inheritanceDeductionInputSchema = z.object({
  heirs: z.array(heirSchema).min(1, "상속인이 1명 이상 필요합니다."),
  spouseActualAmount: z.number().nonnegative().optional(),
  preferLumpSum: z.boolean().optional(),
  netFinancialAssets: z.number().nonnegative().optional(),
  cohabitHouseStdPrice: z.number().nonnegative().optional(),
  farmingAssetValue: z.number().nonnegative().optional(),
  familyBusinessValue: z.number().nonnegative().optional(),
  familyBusinessYears: z.number().int().nonnegative().optional(),
  // 종합사례 PDF Phase D·E
  familyBusinessDirectAmount: z.number().nonnegative().optional(),
  cohabitDirectAmount: z.number().nonnegative().optional(),
  spouseLegalShareOverride: z.number().nonnegative().optional(),
  legateeAmountNonHeir: z.number().nonnegative().optional(),
  priorGiftDeductionTotal: z.number().nonnegative().optional(),
  disasterLossDeduction: z.number().nonnegative().optional(),
});

// ============================================================
// 증여공제 입력 스키마
// ============================================================

export const giftDeductionInputSchema = z.object({
  donorRelation: z.enum([
    "spouse",
    "lineal_ascendant_adult",
    "lineal_ascendant_minor",
    "lineal_descendant",
    "other_relative",
  ]),
  marriageExemption: z.number().min(0).max(100_000_000).optional(),
  birthExemption: z.number().min(0).max(100_000_000).optional(),
  priorUsedDeduction: z.number().nonnegative().optional(),
});

// ============================================================
// 세액공제 입력 스키마
// ============================================================

export const inheritanceTaxCreditInputSchema = z.object({
  priorGifts: z.array(priorGiftSchema).optional(),
  foreignTaxPaid: z.number().nonnegative().optional(),
  shortTermReinheritYears: z.number().int().min(0).max(10).optional(),
  shortTermReinheritTaxPaid: z.number().nonnegative().optional(),
  isFiledOnTime: z.boolean(),
});

export const giftTaxCreditInputSchema = z.object({
  foreignTaxPaid: z.number().nonnegative().optional(),
  isFiledOnTime: z.boolean(),
  specialTreatment: z.enum(["startup", "family_business"]).optional(),
  startupInvestmentCompleted: z.boolean().optional(),
});

// ============================================================
// 상속세 전체 입력 스키마
// ============================================================

export const inheritanceTaxInputSchema = z.object({
  decedentType: z.enum(["resident", "non_resident"]),
  deathDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  estateItems: z.array(estateItemSchema).min(1, "상속재산이 1개 이상 필요합니다."),
  // legacy debts·funeralExpense — debtItems 입력 시 우선
  funeralExpense: z.number().min(0).max(15_000_000).optional().default(0),
  funeralIncludesBongan: z.boolean().optional().default(false),
  debts: z.number().nonnegative().optional().default(0),
  // 종합사례 PDF Phase A0·A
  debtItems: z.array(debtItemSchema).optional(),
  presumedItems: z.array(presumedInheritanceItemSchema).optional(),
  exemptions: z.array(exemptionCheckedItemSchema).optional(),
  preGiftsWithin10Years: z.array(priorGiftSchema),
  heirs: z.array(heirSchema).min(1),
  deductionInput: inheritanceDeductionInputSchema,
  creditInput: inheritanceTaxCreditInputSchema,
  valuationBaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isGenerationSkip: z.boolean().optional(),
  isMinorHeir: z.boolean().optional(),
  generationSkipAssetAmount: z.number().nonnegative().optional(),
});

export type InheritanceTaxInputSchema = z.infer<typeof inheritanceTaxInputSchema>;

// ============================================================
// 증여세 전체 입력 스키마
// ============================================================

export const giftTaxInputSchema = z.object({
  giftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  donorRelation: z.enum([
    "spouse",
    "lineal_ascendant_adult",
    "lineal_ascendant_minor",
    "lineal_descendant",
    "other_relative",
  ]),
  /** Phase A: 증여자 관계 (동일인 §47 합산 그룹화 + §57 적용 판정) — 필수 */
  donor: giftDonorRelationSchema,
  giftItems: z.array(estateItemSchema).min(1, "증여재산이 1개 이상 필요합니다."),
  exemptions: z.array(exemptionCheckedItemSchema).optional(),
  priorGiftsWithin10Years: z.array(priorGiftSchema),
  isGenerationSkip: z.boolean(),
  isMinorDonee: z.boolean(),
  deductionInput: giftDeductionInputSchema,
  creditInput: giftTaxCreditInputSchema,
  valuationBaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type GiftTaxInputSchema = z.infer<typeof giftTaxInputSchema>;
