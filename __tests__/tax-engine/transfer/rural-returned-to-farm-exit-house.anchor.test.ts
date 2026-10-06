/**
 * §155⑦2호·3호 — 이농했다가 그 주택으로 다시 귀농(`ruralHouse.returnedToFarmExitHouse`).
 *
 * - 3호: 「당초 5년 이상 거주한 사실이 있는 이농주택으로 귀농하는 경우 해당 이농주택은 영농을 목적으로 취득한
 *   귀농주택에 해당하지 아니」(재산세과-1504 · 부동산납세과-67 · 재재산46014-267)
 * - 2호: 같은 사실에서 「이농주택 특례 적용대상에도 해당되지 아니」(부동산납세과-67 — 사유는 회신에 없다)
 *
 * route 결론은 해석례 평가셋 `E156-farmexit`(과세)·`P-E156-farmexit-not-returned`(비과세)가 고정한다. 여기서는 정본 술어를
 * 직접 본다 — 비과세(E-3.8)와 중과 15호가 같은 `qualifiesRuralHouse`를 쓴다.
 *
 * | # | 유형 | 재귀농 | 기대 |
 * |---|---|---|---|
 * | R-1 | 2호 | 아니다 / 그렇다 / 미전송(레거시) | 성립 / 불성립 / 성립 |
 * | R-2 | 3호 | 아니다 / 그렇다 / 미전송(레거시) | 성립 / 불성립 / 성립 |
 * | R-3 | 불성립 사유 | 2호·3호 각 그 사유 · 「아니다」면 그 사유 없음 |
 */
import { describe, it, expect } from "vitest";
import { qualifiesRuralHouse } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { collectUnmetExceptions } from "@/lib/tax-engine/one-house/unmet-exceptions";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

type Rural = NonNullable<TransferTaxInput["ruralHouse"]>;
const FARM_EXIT: Rural = { kind: "farm_exit", isOutsideCapitalEupMyeon: true, ownerResidenceYears: 20 };
const RETURN_TO_FARM: Rural = {
  kind: "return_to_farm",
  isOutsideCapitalEupMyeon: true,
  acquisitionDate: new Date("2023-01-01"),
  isHighPriceAtAcquisition: false,
  landAreaSqm: 500,
  wholeHouseholdMoved: true,
};
const judge = (r: Rural) =>
  qualifiesRuralHouse({ householdHousingCount: 2, transferDate: new Date("2026-06-15"), ruralHouse: r });

describe("정본 술어", () => {
  it("R-1 2호 이농 — 재귀농이면 불성립 · 아니거나 미전송이면 성립", () => {
    expect(judge({ ...FARM_EXIT, returnedToFarmExitHouse: false })).toBe(true);
    expect(judge({ ...FARM_EXIT, returnedToFarmExitHouse: true })).toBe(false);
    expect(judge(FARM_EXIT)).toBe(true);
  });
  it("R-2 3호 귀농 — 재귀농이면 불성립 · 아니거나 미전송이면 성립", () => {
    expect(judge({ ...RETURN_TO_FARM, returnedToFarmExitHouse: false })).toBe(true);
    expect(judge({ ...RETURN_TO_FARM, returnedToFarmExitHouse: true })).toBe(false);
    expect(judge(RETURN_TO_FARM)).toBe(true);
  });
});

describe("R-3 불성립 사유", () => {
  const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules as OneHouseSpecialRulesData;
  const reasons = (r: Rural) =>
    collectUnmetExceptions(
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        householdHousingCount: 2,
        acquisitionDate: new Date("2015-01-01"),
        transferDate: new Date("2026-06-15"),
        ruralHouse: r,
      }),
      rules,
    )
      .flatMap((u) => u.reasons)
      .join(" | ");
  it("2호·3호가 각자의 사유를 내고, 「아니다」면 그 사유는 없다", () => {
    expect(reasons({ ...FARM_EXIT, returnedToFarmExitHouse: true })).toContain("2호 이농주택 특례를 적용하지 않는다");
    expect(reasons({ ...RETURN_TO_FARM, returnedToFarmExitHouse: true })).toContain("3호 귀농주택으로 보지 않습니다");
    expect(reasons({ ...FARM_EXIT, returnedToFarmExitHouse: false })).not.toContain("다시 귀농");
    expect(reasons({ ...RETURN_TO_FARM, returnedToFarmExitHouse: false })).not.toContain("다시 귀농");
  });
});
