/**
 * 「상증법」§4의2⑥ 단서 — 증여자 연대납부의무 면제 표지를 **증여의제 전 유형**에 확장.
 *
 * 단서 verbatim(2025.10.01. 시행본):
 *   「다만, 제4조제1항제2호 및 제3호, 제35조부터 제39조까지, 제39조의2, 제39조의3,
 *    제40조, 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제45조,
 *    제45조의3부터 제45조의5까지 및 제48조(…)에 해당하는 경우는 제외한다.」
 *
 * ⚠️ 이 파일의 픽스처는 **⑥ 표지 축만** 겨냥한다 — 금액·적용 여부는 단언하지 않는다.
 *    각 유형의 산식 anchor는 유형별 파일이 따로 갖고 있다.
 *
 * 긍정 짝이 이 파일의 핵심이다 — 「전부 true」로 뭉개는 과잉 수정은
 * §33·§34·§45의2 3종이 잡는다(단서 열거 **밖**이라 증여자에게 연대납부의무가 **있다**).
 */
import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { jointLiabilityExemptForDeemedType } from "@/lib/tax-engine/gift-deemed/taxpayer-gate";
import type { DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-api";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

const RATE = { numer: 46, denom: 1000 };
const CI = {
  direction: "low" as const,
  subType: "forfeited_realloc" as const,
  preIssuePrice: 10_000,
  preIssueShares: 100_000,
  newSharePrice: 5_000,
  issuedShares: 50_000,
  acquiredShares: 10_000,
  forfeitedShares: 0,
};

/**
 * 유형 × 최소 입력. **라우터가 dispatch하는 22종**이 모집단이다 —
 * `capital_increase_allocation`은 라우터를 거치지 않는 별도 진입점이라 [JLT-4]가 따로 본다.
 * `Record<RouterType, …>`이라 새 유형이 생기면 tsc가 여기 키를 요구한다.
 */
type RouterType = Exclude<DeemedGiftType, "capital_increase_allocation">;
const FIXTURES: Record<RouterType, DeemedGiftInput> = {
  trust_benefit: {
    type: "trust_benefit",
    beneficiaryType: "same",
    trustPropertyValue: 100_000_000,
    withholdingRate: { numer: 154, denom: 1000 },
  },
  insurance: {
    type: "insurance",
    caseType: "non_payer",
    insuranceProceeds: 100_000_000,
    totalPremiumPaid: 10_000_000,
    relevantPremium: 10_000_000,
    isInheritanceInsurance: false,
  },
  bargain_transfer: { type: "bargain_transfer", transactionPrice: 500_000_000, marketValue: 1_000_000_000, isRelatedParty: true, transactionType: "purchase" },
  debt_forgiveness: { type: "debt_forgiveness", forgivenDebt: 500_000_000, compensation: 0, occurType: "creditor_waiver" },
  free_realestate: { type: "free_realestate", subType: "free_use", isRelatedParty: true },
  free_loan: { type: "free_loan", loanAmount: 1_000_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true },
  free_loan_aggregated: {
    type: "free_loan_aggregated",
    loans: [{ loanDate: "2025-01-01", loanAmount: 1_000_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true }],
  },
  merger: { type: "merger", overvaluedSharePrice: 10_000, majorShares: 100_000 },
  capital_increase: { type: "capital_increase", ...CI },
  capital_decrease: { type: "capital_decrease", sharePrice: 10_000 },
  contribution: {
    type: "contribution",
    preContribPrice: 10_000,
    preContribShares: 100_000,
    newSharePrice: 5_000,
    contributedShares: 50_000,
    allocatedShares: 50_000,
  },
  convertible_stock: { type: "convertible_stock", atConversion: { ...CI }, atIssuance: { ...CI } },
  convertible_bond: { type: "convertible_bond", bondMarketValue: 1_000_000_000 },
  acquisition_fund_presumption: { type: "acquisition_fund_presumption", subType: "acquisition", acquisitionValue: 1_000_000_000, provenAmount: 0 },
  nominee_trust: { type: "nominee_trust", hasTaxAvoidancePurpose: true },
  excess_dividend: {
    type: "excess_dividend",
    shareholders: [
      { id: "a", role: "major_shareholder", ownershipRatio: { numer: 60, denom: 100 }, actualDividend: 0 },
      { id: "b", role: "related_party", ownershipRatio: { numer: 40, denom: 100 }, actualDividend: 100_000_000 },
    ],
    dividendDate: new Date("2025-03-31"),
    incomeTaxMode: "undetermined",
  },
  listing_gain: {
    type: "listing_gain",
    settlementPerSharePrice: 20_000,
    perShareAcqValue: 5_000,
    perShareCorpGrowth: 1_000,
    shares: 100_000,
    totalNetIncomePerShare: 1_000,
    monthsBusinessStartToListingPrevDay: 60,
    monthsAcqToSettlement: 36,
  },
  property_service_use: { type: "property_service_use", subType: "free_use", marketValue: 1_000_000_000 },
  org_change: { type: "org_change", subType: "share_change", baseValue: 1_000_000_000 },
  value_increase: { type: "value_increase", currentValue: 2_000_000_000, acquisitionCost: 1_000_000_000, normalIncrease: 100_000_000, contribution: 0 },
  specific_corp: { type: "specific_corp", transactionBenefit: 1_000_000_000 },
  related_corp: {
    type: "related_corp",
    enterpriseSize: "small",
    totalSales: 10_000_000_000,
    preTaxAdjOperatingIncome: 1_000_000_000,
    taxableIncome: 1_000_000_000,
    corporateTaxNet: 200_000_000,
    shareholders: [{ id: "s1", name: "갑", relation: "self", directRatio: { numer: 50, denom: 100 }, isCorporate: false }],
    intermediaryCorps: [],
    salesPartners: [],
  },
} as Record<RouterType, DeemedGiftInput>;

/** 단서 열거 **밖** — 증여자에게 연대납부의무가 성립한다. */
const NOT_ENUMERATED: RouterType[] = ["trust_benefit", "insurance", "nominee_trust"];
const ALL_TYPES = Object.keys(FIXTURES) as RouterType[];
const ENUMERATED = ALL_TYPES.filter((t) => !NOT_ENUMERATED.includes(t));

describe("「상증법」§4의2⑥ 단서 — 전 유형 연대납부의무 면제 표지", () => {
  it("[JLT-0] 픽스처가 22개 유형을 모두 덮는다 (모집단 자체를 먼저 고정)", () => {
    expect(ALL_TYPES).toHaveLength(22);
  });

  it.each(ENUMERATED)("[JLT-1] %s — 단서 열거 조문이므로 표지 true", (type) => {
    const r = calcDeemedGift(FIXTURES[type]);
    expect(r.donorJointLiabilityExempt).toBe(true);
  });

  it.each(NOT_ENUMERATED)("[JLT-2] 긍정 짝: %s — 열거 밖이므로 표지를 세우지 않는다", (type) => {
    const r = calcDeemedGift(FIXTURES[type]);
    expect(r.donorJointLiabilityExempt).not.toBe(true);
  });

  it("[JLT-3] 표는 유형만으로 판정한다 — 입력 축이 없다", () => {
    expect(jointLiabilityExemptForDeemedType("bargain_transfer")).toBe(true);
    expect(jointLiabilityExemptForDeemedType("nominee_trust")).toBe(false);
  });

  // ── 이관 체인 — §39가 아닌 유형에서도 EstateItem 행별 표지까지 도달하는가 ──
  //    기존 JL-7·JL-8은 §39·§34만 본다. ⑥ 축이 전 유형으로 넓어졌으므로
  //    「§39가 아닌 열거 유형」 한 건을 끝까지 따라가 둔다.
  const formOf = (patch: Partial<DeemedFormState>): DeemedFormState => ({
    ...INITIAL_DEEMED,
    giftDate: "2025-03-15",
    ...patch,
  });

  it("[JLT-5] §35 저가 양수 — 라우터 표지가 EstateItem까지 이어진다", () => {
    const prefill = buildGiftWizardPrefill(
      formOf({ type: "bargain_transfer" }),
      calcDeemedGift(FIXTURES.bargain_transfer),
    );
    expect(prefill.giftItems?.length).toBeGreaterThan(0);
    expect(prefill.giftItems?.every((g) => g.isJointLiabilityExemptGift === true)).toBe(true);
  });

  it("[JLT-6] 긍정 짝: §45의2 명의신탁 — 표지가 false라 EstateItem에 붙지 않는다", () => {
    const r = calcDeemedGift(FIXTURES.nominee_trust);
    expect(r.donorJointLiabilityExempt).toBe(false); // 부재가 아니라 명시적 false
    const prefill = buildGiftWizardPrefill(formOf({ type: "nominee_trust" }), r);
    expect(prefill.giftItems?.length).toBeGreaterThan(0);
    expect(prefill.giftItems?.some((g) => g.isJointLiabilityExemptGift === true)).toBe(false);
  });

  it("[JLT-4] cap-table 진입점(라우터를 거치지 않는다)도 같은 표를 따른다", () => {
    const r = calcCapitalIncreaseAllocation({
      preIssuePrice: 10_000,
      newSharePrice: 5_000,
      direction: "low",
      shareholders: [
        { id: "a", name: "갑", preShares: 60_000, entitledShares: 30_000, subscribedShares: 0 },
        { id: "b", name: "을", preShares: 40_000, entitledShares: 20_000, subscribedShares: 50_000, reallocatedShares: 30_000, relatedTo: ["a"] },
      ],
    } as Parameters<typeof calcCapitalIncreaseAllocation>[0]);
    expect(r.donorJointLiabilityExempt).toBe(true);
  });
});
