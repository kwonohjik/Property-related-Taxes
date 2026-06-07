/**
 * 증여세·공용 보조 Zod 스키마 — property-valuation-input.ts 800줄 정책 분리 (2026-06-07)
 *
 * giftDeductionInputSchema / giftTaxCreditInputSchema / appraisalFeeSchema 분리.
 * 외부 import 경로 보존: property-valuation-input.ts에서 re-export.
 */
import { z } from "zod";

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
// 증여세 세액공제 입력 스키마
// ============================================================

export const giftTaxCreditInputSchema = z.object({
  foreignTaxPaid: z.number().nonnegative().optional(),
  isFiledOnTime: z.boolean(),
  specialTreatment: z.enum(["startup", "family_business"]).optional(),
  startupInvestmentCompleted: z.boolean().optional(),
});

// ============================================================
// 감정평가수수료 공제 스키마 (상속 §20의3 / 증여 §46의2 준용 — 공용)
// ============================================================

export const appraisalFeeSchema = z.object({
  realEstateAppraisalFee: z.number().nonnegative().optional(),
  unlistedStockAppraisalFee: z.number().nonnegative().optional(),
  unlistedTargetCount: z.number().int().positive().optional(),
  unlistedAgencyCount: z.number().int().positive().optional(),
  tangibleAppraisalFee: z.number().nonnegative().optional(),
});
