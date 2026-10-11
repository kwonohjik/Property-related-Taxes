/**
 * S07-11 anchor — 판정 서브트리의 §155② 상속주택 사유는 STEP 0.95(정본 `resolveInheritedHouseExclusionFromInput`)가 낸
 * 결과를 이어받는다. 서브트리가 다른 입력으로 정본을 다시 부르면 답이 갈린다.
 *
 * 재개발 승계조합원 신축주택(승계 2011-06-01 · 상속개시 2012-01-01 · 준공 2015-06-01 · 양도 2016-12-01):
 *   STEP 0.95는 「상속개시 당시 보유한 조합원입주권에 의한 신축주택」(E-8)으로 보아 상속주택을 1채 뺀다.
 *   서브트리 입력은 취득일 = 준공일 · `redevelopment` strip이라 정본을 다시 부르면 「상속개시 후 취득」으로 읽혀
 *   「빼지 않습니다」 사유가 나왔다(결과: 같은 계산 안에서 제외 1채 · 안내 「빼지 않음」 모순).
 *
 * 법령: 「소득세법 시행령」 제155조제2항 괄호 「상속개시 당시 보유한 조합원입주권에 의하여 사업시행 완료 후 취득한 신축주택」.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveInheritedHouseExclusionFromInput } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { judgeRedevAptOneHouseExemption } from "@/lib/tax-engine/transfer-tax-redevelopment-apt-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { baseTransferInput, makeMockRates, makeHouseInfo } from "../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const D = (s: string) => new Date(s);
const rates = makeMockRates();
const parsed = parseRatesFromMap(rates);

function redevInput(over: Partial<{ rightAcq: string; inh: string; completion: string; transfer: string }> = {}): TransferTaxInput {
  const p = { rightAcq: "2011-06-01", inh: "2012-01-01", completion: "2015-06-01", transfer: "2016-12-01", ...over };
  const redevelopment: RedevelopmentInfo = {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: D("2010-12-01"),
    rightsValue: 0,
    settlementDirection: "pay",
    settlementAmount: 0,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    isSuccessorMember: true,
    completionDate: D(p.completion),
  };
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 800_000_000,
    transferDate: D(p.transfer),
    acquisitionDate: D(p.rightAcq),
    acquisitionPrice: 400_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    isSuccessorRightToMoveIn: true,
    sellingHouseId: "selling",
    houses: [
      makeHouseInfo("selling", { acquisitionDate: D(p.completion) }),
      makeHouseInfo("inh", { isInherited: true, inheritedDate: D(p.inh), acquisitionDate: D(p.inh) }),
    ],
    redevelopment,
  });
}

const unmetIds = (i: TransferTaxInput) =>
  judgeRedevAptOneHouseExemption(i, [], undefined, parsed).exemptionResult!.unmetExceptions.map((u) => u.id);

describe("S07-11 — 판정 서브트리는 STEP 0.95의 상속주택 제외 결과를 이어받는다", () => {
  it("D1 승계조합원 신축주택: STEP 0.95가 상속주택을 뺐으면 서브트리에 「빼지 않음」 사유가 없다", () => {
    const i = redevInput();
    expect(resolveInheritedHouseExclusionFromInput(i).excludedCount).toBe(1);
    expect(unmetIds(i)).not.toContain("155-2-inherited-house");
  });

  it("긍정 짝 — 상속개시 후 승계(STEP 0.95 제외 0)면 사유가 그대로 남는다", () => {
    const i = redevInput({ rightAcq: "2012-06-01", inh: "2011-06-01" });
    expect(resolveInheritedHouseExclusionFromInput(i).excludedCount).toBe(0);
    expect(unmetIds(i)).toContain("155-2-inherited-house");
  });

  it("판정 보류(era-undetermined)도 같은 echo를 읽는다 — 재상속 상속주택이 STEP 0.95에서 제외되면 기준일 미확인 고지가 선다", () => {
    const i = redevInput();
    const reinherited = { ...i, houses: i.houses!.map((h) => (h.id === "inh" ? { ...h, decedentSameHouseholdAtInheritance: true, reInheritedFromSeparateHousehold: true } : h)) };
    expect(resolveInheritedHouseExclusionFromInput(reinherited).excludedCount).toBe(1);
    const und = judgeRedevAptOneHouseExemption(reinherited, [], undefined, parsed).exemptionResult!.undetermined.map((u) => u.id);
    expect(und).toContain("155-2-reinheritance-reference-date-unverified");
  });

  it("계산기 결과는 이 정정으로 달라지지 않는다 — 제외 1채가 판정 주택 수에 반영된다(결정세액 불변)", () => {
    const r = calculateTransferTax(redevInput(), rates);
    // 준공 후 1.5년 보유라 보유 2년 미달로 과세 — 상속 제외 안내가 새로 붙지 않는다.
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(133_060_000);
  });
});
