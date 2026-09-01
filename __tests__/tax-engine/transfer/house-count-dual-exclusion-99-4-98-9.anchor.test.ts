// D4-01 anchor — §99의4 · §98의9 동시 적격 시 주택수 제외는 2채다
//
// 조문 실측:
//  · §99의4①: 「…그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로 보아 「소득세법」
//    제89조제1항제3호를 적용한다」 — 그 농어촌주택등 **취득 전에 보유하던** 일반주택 양도가 대상.
//  · §98의9①: 「**1주택을 보유한 1세대**가 2024.1.10~2026.12.31 중에 … 준공후미분양주택을
//    취득한 후 준공후미분양주택을 **취득하기 전에 보유한 주택**을 양도하는 경우에는 그
//    준공후미분양주택을 해당 1세대의 소유주택이 아닌 것으로 보아 같은 법 제89조제1항제3호를 적용한다」.
//
// 두 조문의 효과는 주택수 의제뿐이고 감면세액이 없다. §127⑦은 「거주자가 토지등을 양도하여
// 둘 이상의 양도소득세의 **감면규정**을 동시에 적용받는 경우」로 한정되고, §127⑨는
// §98의2·§98의3만 열거한다 ⇒ 중복배제 근거가 없다.
//
// 요건도 서로를 인용하지 않는다. 취득 순서를 「일반주택 → 준공후미분양 → 농어촌주택」으로 두면
// 미분양 취득 시점에 세대는 일반주택 1채뿐이라 §98의9①의 「1주택을 보유한 1세대」가 성립하고,
// 양도하는 일반주택은 두 주택 모두의 취득 전에 보유한 것이라 §99의4①도 함께 성립한다.
//
// 종전에는 `resolveHouseCountExclusion`이 단수 `applied`를 반환해 §99의4 한 채만 제외됐다.
// 실측(수정 전): 결정세액 133,060,000 · 지방소득세 13,306,000 · totalTax 146,366,000.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveHouseCountExclusion } from "@/lib/tax-engine/transfer-reductions/unsold-98-9";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 농어촌주택 취득 2024-04-01 — 미분양(2024-02-01) **뒤**여야 §98의9 1주택 요건이 산다 */
const RURAL = {
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: new Date("2024-04-01"),
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

const UNSOLD = {
  type: "unsold_98_9" as const,
  unsoldHouseAcquisitionDate: new Date("2024-02-01"),
  unsoldHouseAcquisitionPrice: 500_000_000,
  unsoldHouseExclusiveArea: 84,
  isNonCapitalRegion: true,
  wasOneHouseholdAtAcquisition: true,
  meetsSellerAndContractRequirement: true,
};

function run(
  reductions: TransferTaxInput["reductions"],
  householdHousingCount: number,
  transferPrice = 1_000_000_000,
) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: true,
      householdHousingCount,
      isRegulatedArea: false,
      residencePeriodMonths: 120,
      reductions,
    }),
    rates,
  );
}

describe("D4-01 §99의4 + §98의9 동시 적격 — 각각 1채씩 제외", () => {
  const ctx = {
    generalHouseAcquisitionDate: new Date("2014-01-01"),
    transferDate: new Date("2024-06-01"),
  };

  it("D4-01-1: resolve가 2건을 §99의4 → §98의9 순으로 반환한다", () => {
    const r = resolveHouseCountExclusion([RURAL, UNSOLD], ctx);
    expect(r.appliedList).toHaveLength(2);
    expect(r.appliedList.map((x) => x.id)).toEqual(["new_99_4_rural", "unsold_98_9"]);
  });

  it("D4-01-2: 3주택 − 2채 제외 = 1채 → 1세대1주택 비과세 (양도 10억 ≤ 12억)", () => {
    const r = run([RURAL, UNSOLD], 3);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(r.determinedTax).toBe(0);
  });

  it("D4-01-3: 종전 결함 재현값과의 대조 — 1채만 제외하면 146,366,000이 나왔다", () => {
    // §98의9만 빼면 제외 1채 → 유효 2주택 → 과세. 종전 동시적격 동작과 같은 자리다.
    const only994 = run([RURAL], 3);
    expect(only994.isExempt).toBe(false);
    expect(only994.determinedTax).toBe(133_060_000);
    expect(only994.localIncomeTax).toBe(13_306_000);
    expect(only994.totalTax).toBe(146_366_000);
  });

  it("D4-01-4: step이 두 조문 각각 push되고 주택 수가 순차로 줄어든다", () => {
    const r = run([RURAL, UNSOLD], 3);
    const s994 = r.steps.find((s) => s.label.includes("§99의4"));
    const s989 = r.steps.find((s) => s.label.includes("§98의9"));
    expect(s994?.formula).toContain("3채");
    expect(s994?.formula).toContain("2채");
    expect(s989?.formula).toContain("2채");
    expect(s989?.formula).toContain("1채");
  });

  it("D4-01-5: §98의9 echo에 dualExclusionApplied가 실린다 (카드 안내용)", () => {
    const r = run([RURAL, UNSOLD], 3);
    expect(r.unsold989Detail?.isEligible).toBe(true);
    if (r.unsold989Detail?.isEligible) {
      expect(r.unsold989Detail.dualExclusionApplied).toBe(true);
    }
  });

  it("D4-01-6: 한쪽만 적격이면 dualExclusionApplied는 붙지 않는다", () => {
    const r = run([UNSOLD], 2);
    expect(r.unsold989Detail?.isEligible).toBe(true);
    if (r.unsold989Detail?.isEligible) {
      expect(r.unsold989Detail.dualExclusionApplied).toBeUndefined();
    }
  });

  it("D4-01-7: 4주택이면 2채 제외해도 2채 → 비과세 아님 (캡이 아니라 실제 차감)", () => {
    const r = run([RURAL, UNSOLD], 4);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(133_060_000);
  });

  it("D4-01-8: 미분양이 불적격이면 §99의4 1채만 제외된다 (과잉완화 방지)", () => {
    // 전용면적 90㎡ — 조특령 요건 초과로 §98의9 불적격
    const r = run([RURAL, { ...UNSOLD, unsoldHouseExclusiveArea: 90 }], 3);
    expect(r.unsold989Detail?.isEligible).toBe(false);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(133_060_000);
  });

  it("D4-01-9: 상속주택 제외와 겹칠 때 진입 주택수 표시가 hce 2채를 반영한다", () => {
    // 일반 + 미분양 + 농어촌 + 상속 = 4채 → hce 2채 + §155② 1채 = 3채 제외 → 1채
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date("2024-06-01"),
        isOneHousehold: true,
        householdHousingCount: 4,
        isRegulatedArea: false,
        residencePeriodMonths: 120,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("inherited", { isInherited: true, inheritedDate: new Date("2023-01-01") }),
        ],
        sellingHouseId: "selling",
        reductions: [RURAL, UNSOLD],
      }),
      rates,
    );
    const sInherited = r.steps.find((s) => s.label.includes("§155②"));
    // 진입 시점 = 4 − hce 2 = 2 → 1 (종전 캡이면 3 → 2로 표시됐다)
    expect(sInherited?.formula).toContain("주택수 2 → 1");
    expect(r.isExempt).toBe(true);
  });
});
