/**
 * anchor: 「상증법」§43① 중복적용 배제 표지 — 증여의제 **전 유형** 일괄(#112 · 사용자 확정 범위)
 *
 * §43① verbatim(현행 2026.01.02. 시행본 조회):
 *   「하나의 증여에 대하여 제33조부터 제39조까지, 제39조의2, 제39조의3, 제40조, 제41조의2부터
 *    제41조의5까지, 제42조, 제42조의2, 제42조의3, 제44조, 제45조 및 제45조의3부터 제45조의5까지의
 *    규정이 둘 이상 동시에 적용되는 경우에는 그 중 이익이 가장 많게 계산되는 것 하나만을 적용한다.」
 *
 * 🔴 §4의2⑥ 유형표를 복사하면 틀린다 — §33 신탁이익·§34 보험금은 ⑥ 단서 열거 **밖**이지만
 *    §43①에는 **안**이다(「제33조부터」). §45의2 명의신탁은 양쪽 모두 **밖**.
 * 세액 영향 0 — 계산기가 한 번에 한 유형만 계산하므로 표지는 「다른 유형도 성립하면 큰 쪽 하나만」
 * 이라는 고지 전용이다.
 */
import { describe, it, expect } from "vitest";
import { dupExclusionAppliesToDeemedType } from "@/lib/tax-engine/gift-deemed/dup-exclusion";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { jointLiabilityExemptForDeemedType } from "@/lib/tax-engine/gift-deemed/taxpayer-gate";
import type { DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";

/** 기대 표 — §43① 원문과 한 줄씩 대조했다. `satisfies`라 새 유형이 생기면 tsc가 키를 요구한다. */
const EXPECTED = {
  trust_benefit: true, // §33 — 「제33조부터」
  insurance: true, // §34
  bargain_transfer: true, // §35
  debt_forgiveness: true, // §36
  free_realestate: true, // §37
  merger: true, // §38
  capital_increase: true, // §39
  capital_increase_allocation: true, // §39 cap-table
  convertible_stock: true, // §39①3호
  capital_decrease: true, // §39의2
  contribution: true, // §39의3
  convertible_bond: true, // §40
  excess_dividend: true, // §41의2
  listing_gain: true, // §41의3·§41의5
  free_loan: true, // §41의4
  free_loan_aggregated: true, // §41의4
  property_service_use: true, // §42
  org_change: true, // §42의2
  value_increase: true, // §42의3
  acquisition_fund_presumption: true, // §45
  nominee_trust: false, // §45의2 — 열거 밖
  related_corp: true, // §45의3
  specific_corp: true, // §45의5
} satisfies Record<DeemedGiftType, boolean>;

describe("[DX] §43① 유형표", () => {
  it("[DX-1] 🔴 23개 유형 전수가 §43① 열거와 일치한다", () => {
    for (const [type, expected] of Object.entries(EXPECTED) as [DeemedGiftType, boolean][]) {
      expect([type, dupExclusionAppliesToDeemedType(type)]).toEqual([type, expected]);
    }
  });

  it("[DX-2] ⑥ 표와 **다른** 지점을 명시적으로 고정 — §33·§34는 ⑥ 밖·§43① 안", () => {
    expect(jointLiabilityExemptForDeemedType("trust_benefit")).toBe(false);
    expect(dupExclusionAppliesToDeemedType("trust_benefit")).toBe(true);
    expect(jointLiabilityExemptForDeemedType("insurance")).toBe(false);
    expect(dupExclusionAppliesToDeemedType("insurance")).toBe(true);
  });
});

describe("[DX-R] 엔진 표지 echo", () => {
  it("[DX-3] 🔴 라우터 — §39 단건에 표지", () => {
    const r = calcDeemedGift({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000,
      issuedShares: 50_000, forfeitedShares: 10_000,
    });
    expect(r.dupExclusionApplies).toBe(true);
  });

  it("[DX-4] 🔴 라우터 — §33 신탁이익에도 표지(⑥ 표를 복사하면 여기서 깨진다)", () => {
    const r = calcDeemedGift({
      type: "trust_benefit", beneficiaryType: "same", trustPropertyValue: 100_000_000,
      withholdingRate: { numer: 154, denom: 1000 },
    });
    expect(r.dupExclusionApplies).toBe(true);
  });

  it("[DX-5] 긍정 짝 — §45의2 명의신탁은 열거 밖이라 false", () => {
    const r = calcDeemedGift({ type: "nominee_trust", hasTaxAvoidancePurpose: true });
    expect(r.dupExclusionApplies).toBe(false);
  });

  it("[DX-6] 🔴 cap-table(라우터를 거치지 않는 진입점)도 같은 표", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "low", preIssuePrice: 20_000, newSharePrice: 10_000,
      shareholders: [
        { id: "A", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, relatedTo: ["B"] },
        { id: "B", preShares: 40_000, entitledShares: 40_000, subscribedShares: 100_000, reallocatedShares: 60_000, relatedTo: ["A"] },
      ],
    });
    expect(r.dupExclusionApplies).toBe(true);
  });
});
