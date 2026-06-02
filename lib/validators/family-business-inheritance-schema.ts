/**
 * 가업상속공제 입력 Zod 스키마 (상증법 §18의2 + 상증령 §15)
 *
 * property-valuation-input.ts 800줄 정책으로 sibling 분리 (2026-06-02).
 * inheritanceDeductionInputSchema.familyBusiness에서 사용.
 *
 * ⚠️ z.object는 미지의 키를 strip — FamilyBusinessInheritanceInput 신규 필드는 반드시 본 스키마에 추가.
 *    (요건 자동판정 기초데이터 누락 시 엔진 미도달)
 */
import { z } from "zod";

export const familyBusinessInheritanceInputSchema = z.object({
  businessType: z.enum(["individual", "corporate"]),
  operatingYears: z.number().int().nonnegative(),
  deathDate: z.string().optional(),
  enterpriseSize: z.enum(["sme", "medium"]),
  averageRevenue3Y: z.number().nonnegative().optional(),
  totalAssets: z.number().nonnegative().optional(),
  isEligibleIndustry: z.boolean(),
  decedentMajorShareholdingMet: z.boolean().optional(),
  isListedOnExchange: z.boolean().optional(),
  decedentCEORequirementMet: z.boolean(),
  heirIsAdult: z.boolean(),
  heirTwoYearEngagement: z.boolean(),
  decedentEarlyDeath: z.boolean().optional(),
  heirOfficerByFilingDeadline: z.boolean(),
  heirCEOWithinTwoYears: z.boolean(),
  spouseFulfillsRequirements: z.boolean().optional(),
  heirOtherEstateValue: z.number().nonnegative().optional(),
  heirDebt: z.number().nonnegative().optional(),
  unrelatedAssetsAcknowledged: z.boolean(),
  postManagementAcknowledged: z.boolean(),
  // 기회발전특구 특례 (상증령 §15㉕, 2026-05-21 추가)
  isInOpportunityDevelopmentZone: z.boolean().optional(),
  ofzWorkforceRatio50PlusMet: z.boolean().optional(),
  hasTaxFraudConviction: z.boolean().optional(),
  // ⑫ 요건 자동판정 기초데이터 (Phase 1, 2026-06-02) — 미추가 시 z.object 침묵 strip → 엔진 미도달
  heirId: z.string().optional(),
  heirBirthDate: z.string().optional(),
  heirEngagementStartDate: z.string().optional(),
  heirCEOAppointDate: z.string().optional(),
  heirIsAdultOverride: z.boolean().optional(),
  heirTwoYearEngagementOverride: z.boolean().optional(),
  heirOfficerByFilingDeadlineOverride: z.boolean().optional(),
  heirCEOWithinTwoYearsOverride: z.boolean().optional(),
});
