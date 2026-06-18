/**
 * 증여로 보는 경우 (Phase 1) — Zod 입력 검증 스키마.
 *
 * ⚠️ discriminatedUnion 제약: 각 브랜치는 순수 z.object여야 한다.
 * z.object().superRefine()는 ZodEffects가 되어 discriminatedUnion에 넣을 수 없으므로,
 * cross-field 검증은 union 전체에 .superRefine()을 한 번만 적용한다.
 */
import { z } from "zod";

const insuranceSchema = z.object({
  type: z.literal("insurance"),
  caseType: z.enum(["non_payer", "gifted_premium"]),
  insuranceProceeds: z.number().nonnegative({ message: "보험금은 0 이상이어야 합니다" }),
  totalPremiumPaid: z.number().positive({ message: "총 납부보험료는 0보다 커야 합니다" }),
  relevantPremium: z.number().nonnegative({ message: "관련 보험료는 0 이상이어야 합니다" }),
  isInheritanceInsurance: z.boolean(),
});

const bargainTransferSchema = z.object({
  type: z.literal("bargain_transfer"),
  transactionPrice: z.number().nonnegative({ message: "거래대가는 0 이상이어야 합니다" }),
  marketValue: z.number().positive({ message: "시가는 0보다 커야 합니다" }),
  isRelatedParty: z.boolean(),
  transactionType: z.enum(["purchase", "sale"]),
  hasJustifiableReason: z.boolean().optional(),
  isExcludedTransaction: z.boolean().optional(),
});

const debtForgivenessSchema = z.object({
  type: z.literal("debt_forgiveness"),
  forgivenDebt: z.number().positive({ message: "면제·인수·변제 채무액은 0보다 커야 합니다" }),
  compensation: z.number().nonnegative({ message: "보상액은 0 이상이어야 합니다" }),
  occurType: z.enum(["creditor_waiver", "third_party_assumption"]),
});

const freeRealEstateSchema = z.object({
  type: z.literal("free_realestate"),
  subType: z.enum(["free_use", "collateral"]),
  propertyValue: z.number().nonnegative().optional(),
  loanAmount: z.number().nonnegative().optional(),
  actualInterestPaid: z.number().nonnegative().optional(),
  isRelatedParty: z.boolean(),
  hasJustifiableReason: z.boolean().optional(),
});

const freeLoanSchema = z.object({
  type: z.literal("free_loan"),
  loanAmount: z.number().positive({ message: "대출금액은 0보다 커야 합니다" }),
  actualInterestPaid: z.number().nonnegative({ message: "실제 지급이자는 0 이상이어야 합니다" }),
  appropriateRate: z.object({
    numer: z.number().positive(),
    denom: z.number().positive(),
  }),
  isRelatedParty: z.boolean(),
  hasJustifiableReason: z.boolean().optional(),
});

// ── Phase 2: 자본거래 (평가가액·주식수 직접 입력) ──
const mergerSchema = z.object({
  type: z.literal("merger"),
  mergedSharePrice: z.number().nonnegative(),
  overvaluedSharePrice: z.number().nonnegative(),
  preMergerShares: z.number().nonnegative(),
  exchangedShares: z.number().positive({ message: "교부받은 주식수는 0보다 커야 합니다" }),
  majorShares: z.number().nonnegative(),
});
const capitalIncreaseSchema = z.object({
  type: z.literal("capital_increase"),
  preIssuePrice: z.number().nonnegative(),
  preIssueShares: z.number().positive({ message: "증자 전 발행주식총수는 0보다 커야 합니다" }),
  newSharePrice: z.number().nonnegative(),
  issuedShares: z.number().nonnegative(),
  forfeitedShares: z.number().nonnegative(),
});
const capitalDecreaseSchema = z.object({
  type: z.literal("capital_decrease"),
  sharePrice: z.number().nonnegative(),
  redemptionPrice: z.number().nonnegative(),
  totalRedeemedShares: z.number().positive({ message: "총감자 주식수는 0보다 커야 합니다" }),
  majorPostRatio: z.object({ numer: z.number().nonnegative(), denom: z.number().positive() }),
  relatedRedeemedShares: z.number().nonnegative(),
});
const contributionSchema = z.object({
  type: z.literal("contribution"),
  preContribPrice: z.number().nonnegative(),
  preContribShares: z.number().positive({ message: "현물출자 전 발행주식총수는 0보다 커야 합니다" }),
  newSharePrice: z.number().nonnegative(),
  contributedShares: z.number().nonnegative(),
  allocatedShares: z.number().nonnegative(),
});
const convertibleBondSchema = z.object({
  type: z.literal("convertible_bond"),
  bondMarketValue: z.number().positive({ message: "전환사채 시가는 0보다 커야 합니다" }),
  acquisitionPrice: z.number().nonnegative(),
});

export const deemedGiftInputSchema = z
  .discriminatedUnion("type", [
    insuranceSchema,
    bargainTransferSchema,
    debtForgivenessSchema,
    freeRealEstateSchema,
    freeLoanSchema,
    mergerSchema,
    capitalIncreaseSchema,
    capitalDecreaseSchema,
    contributionSchema,
    convertibleBondSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.type === "insurance") {
      if (data.relevantPremium > data.totalPremiumPaid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["relevantPremium"],
          message: "관련 보험료가 총 납부보험료를 초과할 수 없습니다 (§34①)",
        });
      }
    }
    if (data.type === "free_realestate") {
      if (data.subType === "free_use" && !data.propertyValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["propertyValue"],
          message: "무상사용은 부동산 가액 입력이 필요합니다 (§37①)",
        });
      }
      if (data.subType === "collateral" && !data.loanAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["loanAmount"],
          message: "무상담보는 차입금 입력이 필요합니다 (§37②)",
        });
      }
    }
  });

export type DeemedGiftInputParsed = z.infer<typeof deemedGiftInputSchema>;
