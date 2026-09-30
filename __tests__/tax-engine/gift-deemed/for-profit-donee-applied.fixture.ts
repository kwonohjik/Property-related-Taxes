/**
 * 「상증법」§4의2①·③ 공통 게이트(7-12) — **실제로 과세되는** 단일 수증자 13종 입력.
 *
 * 과세되지 않는 픽스처로는 게이트를 증명하지 못한다(게이트는 과세되는 결과에만 걸린다).
 * 각 입력이 `applied: true`인지는 엔진 anchor `[FPD-1]`이 매번 전제로 확인한다.
 * 필드 이름은 입력 인터페이스와 대조했다 — `as` 단언은 초과 속성을 허용해서, 존재하지 않는
 * 필드(§40 `caseType: "acquire_low"`·§42 `isRelatedParty`)가 조용히 무시된 채 초록이었다.
 */
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { toDate } from "@/lib/api/date-coerce";

const R = { numer: 46, denom: 1000 };
/** §33 권리별 증여시기 — ⑧이 요구하는 값(2026-09-30 ⑫ 필수화 #28). 엔진 가액에는 닿지 않는다(subGifts echo) */
const GIFT_DATE = toDate("2025-06-01", "giftDate");

/** 13종 × **실제로 과세되는** 입력 — 과세되지 않는 픽스처로는 게이트를 증명하지 못한다 */
export const FOR_PROFIT_DONEE_APPLIED: Record<string, DeemedGiftInput> = {
  trust_benefit: { type: "trust_benefit", beneficiaryType: "same", trustPropertyValue: 1_000_000_000, withholdingRate: { numer: 154, denom: 1000 }, yieldRate: { numer: 50, denom: 1000 }, installments: 10, incomeAnnuityType: "finite", incomeGiftDate: GIFT_DATE, principalGiftDate: GIFT_DATE },
  insurance: { type: "insurance", caseType: "non_payer", insuranceProceeds: 100_000_000, totalPremiumPaid: 10_000_000, relevantPremium: 6_000_000, isInheritanceInsurance: false },
  bargain_transfer: { type: "bargain_transfer", transactionPrice: 600_000_000, marketValue: 1_000_000_000, isRelatedParty: true, transactionType: "purchase" },
  debt_forgiveness: { type: "debt_forgiveness", forgivenDebt: 500_000_000, compensation: 0, occurType: "creditor_waiver" },
  free_realestate: { type: "free_realestate", subType: "free_use", isRelatedParty: true, propertyValue: 3_000_000_000 },
  free_loan: { type: "free_loan", loanAmount: 2_000_000_000, actualInterestPaid: 0, appropriateRate: R, isRelatedParty: true },
  free_loan_aggregated: { type: "free_loan_aggregated", loans: [{ loanDate: "2025-01-01", loanAmount: 2_000_000_000, actualInterestPaid: 0, appropriateRate: R, isRelatedParty: true }] },
  convertible_bond: { type: "convertible_bond", caseType: "acquisition", bondMarketValue: 1_000_000_000, acquisitionPrice: 500_000_000 },
  listing_gain: { type: "listing_gain", settlementPerSharePrice: 20_000, perShareAcqValue: 5_000, perShareCorpGrowth: 1_000, shares: 100_000, totalNetIncomePerShare: 1_000, monthsBusinessStartToListingPrevDay: 60, monthsAcqToSettlement: 36 },
  property_service_use: { type: "property_service_use", subType: "free_use", marketValue: 1_000_000_000 },
  org_change: { type: "org_change", subType: "value_change", baseValue: 100_000_000, preValue: 100_000_000, postValue: 500_000_000 },
  value_increase: { type: "value_increase", currentValue: 3_000_000_000, acquisitionCost: 1_000_000_000, normalIncrease: 100_000_000, contribution: 0 },
  acquisition_fund_presumption: { type: "acquisition_fund_presumption", subType: "acquisition", acquisitionValue: 1_000_000_000, provenAmount: 0 },
} as Record<string, DeemedGiftInput>;
