/**
 * 「상증법」§4의2③ — 수증자 1명(한 묶음) 입력의 과세 픽스처 모집단 (7-16).
 * 영리법인 계산 단위 토글과 같은 모집단(13종 + 명부형 3종 단일 모드)에 §39 단건·전환주식·§45의5 단일을 더한다.
 * 전부 `applied: true`여야 한다 — 과세되지 않는 입력으로는 게이트를 증명하지 못한다(§8-F).
 */
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { FOR_PROFIT_DONEE_APPLIED } from "./for-profit-donee-applied.fixture";
import { toDate } from "@/lib/api/date-coerce";
import { SINGLE_MODE, ROSTER_MODE } from "./for-profit-donee-single-mode.fixture";

const CI = {
  direction: "low", subType: "forfeited_realloc", preIssuePrice: 10_000, preIssueShares: 100_000,
  issuedShares: 50_000, acquiredShares: 10_000, forfeitedShares: 20_000, relatedAcquiredShares: 10_000,
  // ⑧이 요구하는 증여일 — 2026-09-30 ⑫ 필수화(#20). 현행 구간이라 가액 무관.
  // 엔진 직접 호출 anchor도 이 픽스처를 쓰므로 Date로 둔다(JSON 왕복 anchor에서는 ISO 문자열이 된다).
  giftDate: toDate("2025-06-01", "giftDate"),
};

export const INCOME_TAXED_APPLIED: Record<string, DeemedGiftInput> = {
  ...FOR_PROFIT_DONEE_APPLIED,
  ...SINGLE_MODE,
  // §39 단건 — 실권주 재배정(저가) 66,660,000
  capital_increase: { type: "capital_increase", ...CI, newSharePrice: 5_000 } as unknown as DeemedGiftInput,
  // §39①3호 전환주식 — 전환후 이익 > 발행당시 이익 → 53,320,000
  convertible_stock: {
    type: "convertible_stock",
    atConversion: { ...CI, newSharePrice: 3_000 },
    atIssuance: { ...CI, newSharePrice: 7_000, giftDate: toDate("2020-01-01", "giftDate") }, // 발행일(부칙 §5② 2017 이후)
  } as unknown as DeemedGiftInput,
  // §45의5 단일(지분율 직접) — 1,449,000,000 (gift-deemed-45-5-limit-tax-path SINGLE)
  specific_corp_single: {
    type: "specific_corp", counterparty: "ruling_shareholder", transactionType: "gratuitous", transactionDate: "2025-06-01",
    transactionBenefit: 3_000_000_000, annualIncome: 4_000_000_000, corporateTaxComputed: 780_000_000,
    giftDeduction: 50_000_000, ownershipRatio: { numer: 6_000, denom: 10_000 },
  } as unknown as DeemedGiftInput,
};

/** ③ 계산 단위 토글이 걸리지 않는 입력 — 명부 모드(1명 입력만 범위) · 법이 ③을 배제(§41의2)·②(§45의2) */
export const INCOME_TAXED_OUT_OF_SCOPE: Record<string, DeemedGiftInput> = {
  ...ROSTER_MODE,
  specific_corp_roster: {
    ...INCOME_TAXED_APPLIED.specific_corp_single,
    ownershipRatio: undefined,
    shareholders: [
      { id: "gap", name: "갑", relation: "lineal_descendant", shares: 60_000, totalShares: 100_000, isDonor: false, isRelated: true },
    ],
  } as unknown as DeemedGiftInput,
};
