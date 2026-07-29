/**
 * Pre-Do 앵커 — 공동상속주택(§155③) + 단독·공동 풀 분리 비과세 (Tier 2-A2 LEAN)
 *
 * 설계: docs/02-design/features/transfer-155-2a2-inheritance-ranking.engine.design.md.
 * 결정(2026-07-19): §155③ 공동상속만 구현. §155②1~4호 순위는 세액 무영향 → Tier 2-B 이월.
 * 세법:
 *  - §155③ 공동상속주택은 다른 주택 양도 시 거주자 주택으로 보지 아니함(주택수 제외).
 *    단, 상속지분 최대 상속인은 산입(제외 아님).
 *  - §155② 단독상속 상속주택 1채 제외. 단독 풀 + 공동(소수지분) 풀은 독립 → 최대 2채 제외 가능.
 *
 * RED 대상:
 *  - C11(공동 최대지분 → 과세): 현행 2-A1은 isInherited=true만으로 제외 → 잘못된 비과세(RED, 기대 false).
 *  - C12(단독1+공동소수1 → 비과세): 현행 2-A1은 inheritedCount=2 캡 → 제외 0 → 과세(RED, 기대 true).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const mockRates = makeMockRates();

// 양도주택(일반, selling, isInherited=false) + 상속주택들. 일반주택 양도, §154① 충족.
function coInheritedInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    sellingHouseId: "selling",
    transferPrice: 500_000_000, // < 12억
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2018-01-01"), // 일반주택 취득 (보유 2년↑)
    transferDate: new Date("2025-06-01"),
    ...over,
  });
}

describe("§155③ 공동상속주택 비과세 (2-A2 LEAN 앵커)", () => {
  it("C10 공동상속 소수지분 1채 → 비과세 (§155③ 본문 주택수 제외)", () => {
    const r = calculateTransferTax(
      coInheritedInput({
        householdHousingCount: 2,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("co", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            isCoInherited: true,
            isLargestCoInheritedShareholder: false,
          }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("★ C11 공동상속 최대지분자 → 산입(과세) (§155③ 단서, RED→GREEN)", () => {
    const r = calculateTransferTax(
      coInheritedInput({
        householdHousingCount: 2,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("co", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            isCoInherited: true,
            isLargestCoInheritedShareholder: true,
          }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("★ C12 단독상속 1채 + 공동상속 소수지분 1채 → 2채 제외 비과세 (RED→GREEN)", () => {
    const r = calculateTransferTax(
      coInheritedInput({
        householdHousingCount: 3,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("sole", { isInherited: true, inheritedDate: new Date("2023-01-01") }),
          makeHouseInfo("co", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            isCoInherited: true,
            isLargestCoInheritedShareholder: false,
          }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("회귀: 단독상속 1채 (2-A1) → 비과세 불변", () => {
    const r = calculateTransferTax(
      coInheritedInput({
        householdHousingCount: 2,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("sole", { isInherited: true, inheritedDate: new Date("2023-01-01") }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("회귀: 공동상속 소수지분 2채 (순위 미구현) → 보수적 과세", () => {
    const r = calculateTransferTax(
      coInheritedInput({
        householdHousingCount: 3,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("co1", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            isCoInherited: true,
            isLargestCoInheritedShareholder: false,
          }),
          makeHouseInfo("co2", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            isCoInherited: true,
            isLargestCoInheritedShareholder: false,
          }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });
});
