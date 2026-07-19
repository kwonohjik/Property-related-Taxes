/**
 * Pre-Do 앵커 — §155② 단서(동거봉양·동일세대) + §155②1~4호 순위 게이트 (2-A2 잔여 완성)
 *
 * 세법 (소득세법 시행령 §155②):
 *  - 단서: 상속인·피상속인이 상속개시 당시 동일세대이면 상속주택 특례(주택수 제외)를 배제.
 *    단, 직계존속 동거봉양을 위해 세대를 합침에 따라 2주택이 된 경우로서 "합치기 이전부터
 *    보유하고 있었던 주택만" 상속받은 주택으로 본다 → 그 경우만 제외 허용. (§155③도 준용.)
 *  - 1~4호 순위: 피상속인이 상속개시 당시 2 이상 주택 소유 시, 순위(소유기간→거주기간→
 *    상속개시당시 거주→기준시가)에 따른 1주택만 상속주택. 하위순위 상속주택은 특례 부적격.
 *
 * RED 대상 (현행 resolveInheritedHouseExclusion는 별도세대/순위를 무판정 → isInherited만으로 제외):
 *  - D1(동일세대 비동거봉양 → 과세): 현행 무조건 제외 → 잘못된 비과세(RED, 기대 false).
 *  - D3(순위 부적격 → 과세): 현행 제외 → 잘못된 비과세(RED, 기대 false).
 *  - D6(공동 소수지분 + 동일세대 비동거봉양 → 과세): 현행 §155③ 제외 → 잘못된 비과세(RED).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveInheritedHouseExclusion } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const mockRates = makeMockRates();

function inheritedInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
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

describe("§155② 단서·순위 게이트 — 상속주택 비과세 (2-A2 잔여, 앵커)", () => {
  // ── 전-엔진 비과세 판정 (isExempt) ──

  it("★ D1 동일세대(비동거봉양) 단독상속 → 과세 (§155② 단서, RED→GREEN)", () => {
    const r = calculateTransferTax(
      inheritedInput({
        householdHousingCount: 2,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("sole", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            decedentSameHouseholdAtInheritance: true,
          }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("D2 동일세대 + 동거봉양 합가 전 보유 → 비과세 (§155② 단서 예외)", () => {
    const r = calculateTransferTax(
      inheritedInput({
        householdHousingCount: 2,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("sole", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            decedentSameHouseholdAtInheritance: true,
            parentalCareMergeInheritedHouse: true,
          }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("★ D3 순위 부적격 단독상속 → 과세 (§155②1~4호, RED→GREEN)", () => {
    const r = calculateTransferTax(
      inheritedInput({
        householdHousingCount: 2,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("sole", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            isRankingDisqualifiedInheritedHouse: true,
          }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("D4 별도세대 단독상속 → 비과세 불변 (회귀·기본값 undefined)", () => {
    const r = calculateTransferTax(
      inheritedInput({
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

  it("★ D6 공동상속 소수지분 + 동일세대(비동거봉양) → 과세 (§155③ 준용 단서, RED→GREEN)", () => {
    const r = calculateTransferTax(
      inheritedInput({
        householdHousingCount: 2,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("co", {
            isInherited: true,
            inheritedDate: new Date("2023-01-01"),
            isCoInherited: true,
            isLargestCoInheritedShareholder: false,
            decedentSameHouseholdAtInheritance: true,
          }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  // ── 헬퍼 단위 (제외 수·부적격 카운트) ──

  const H = (over: Partial<HouseInfo>): HouseInfo =>
    makeHouseInfo("h", { isInherited: true, inheritedDate: new Date("2023-01-01"), ...over });

  it("U1 동일세대 비동거봉양 → 제외 0 + sameHouseholdDisqualified 1", () => {
    const r = resolveInheritedHouseExclusion(
      [makeHouseInfo("selling", {}), H({ decedentSameHouseholdAtInheritance: true })],
      "selling",
      undefined,
    );
    expect(r.excludedCount).toBe(0);
    expect(r.sameHouseholdDisqualifiedCount).toBe(1);
  });

  it("U2 순위 부적격 → 제외 0 + rankingDisqualified 1", () => {
    const r = resolveInheritedHouseExclusion(
      [makeHouseInfo("selling", {}), H({ isRankingDisqualifiedInheritedHouse: true })],
      "selling",
      undefined,
    );
    expect(r.excludedCount).toBe(0);
    expect(r.rankingDisqualifiedCount).toBe(1);
  });

  it("U3 별도세대 단독상속 → 제외 1 (기본값 undefined)", () => {
    const r = resolveInheritedHouseExclusion(
      [makeHouseInfo("selling", {}), H({})],
      "selling",
      undefined,
    );
    expect(r.excludedCount).toBe(1);
  });

  it("U4 단독상속 2채 중 1채 순위부적격 → 적격 1채만 제외 (순위 count 정정)", () => {
    const r = resolveInheritedHouseExclusion(
      [
        makeHouseInfo("selling", {}),
        makeHouseInfo("s1", { isInherited: true, inheritedDate: new Date("2023-01-01") }),
        makeHouseInfo("s2", {
          isInherited: true,
          inheritedDate: new Date("2023-01-01"),
          isRankingDisqualifiedInheritedHouse: true,
        }),
      ],
      "selling",
      undefined,
    );
    expect(r.soleExcludedCount).toBe(1);
    expect(r.rankingDisqualifiedCount).toBe(1);
  });

  it("U5 동거봉양 예외 → 제외 1", () => {
    const r = resolveInheritedHouseExclusion(
      [
        makeHouseInfo("selling", {}),
        H({ decedentSameHouseholdAtInheritance: true, parentalCareMergeInheritedHouse: true }),
      ],
      "selling",
      undefined,
    );
    expect(r.excludedCount).toBe(1);
  });
});
