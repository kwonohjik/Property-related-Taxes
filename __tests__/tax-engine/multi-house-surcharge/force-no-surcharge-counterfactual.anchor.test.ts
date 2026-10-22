/**
 * anchor — 다주택 중과 판정 메뉴 P3a: 반사실 플래그 `forceNoMultiHouseSurcharge` (MH-P6 · MH-P9 · 계획서 §4.7 · F-1).
 *
 * 시뮬레이션 B = 「중과가 애초에 없는 세대 구성」의 세액이어야 한다. 정밀 결과를 `undefined`로 지우면 술어 fallback
 * (`isRegulatedArea && householdHousingCount >= 2`)으로 다시 중과가 되므로 술어 최상단에서 닫는다. 장특 축(`transfer-tax.ts`
 * 리터럴 — 플래그 명시 전달)과 세율 축(`calcTax` — 입력 spread)이 **모두** 닫혀야 한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

// 중과 한시 유예(2022.5.10~2026.5.9)가 끝난 뒤 — 유예 중이면 중과가 없어 구별력이 0이다.
const TD = new Date("2026-09-18");
const SELLING = {
  id: "selling", acquisitionDate: new Date("2015-01-01"), officialPrice: 300_000_000, region: "capital", regionCode: "1168010100",
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
};
/** 강남 — 2주택 중과를 만드는 다른 주택 */
const OTHER_REGULATED = { ...SELLING, id: "h2", acquisitionDate: new Date("2012-01-01") };
/** 아산 2억 — 영 §167의3①1호 지방 저가주택이라 주택 수에 산입하지 않는다(= 중과가 애초에 없는 세대 구성) */
const OTHER_LOW_LOCAL = { ...OTHER_REGULATED, region: "non_capital", regionCode: "4420010100", officialPrice: 200_000_000 };

function input(over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2015-01-01"),
    transferDate: TD,
    isRegulatedArea: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    sellingHouseId: "selling",
    ...over,
  } as Partial<TransferTaxInput>);
}
const run = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
const houses = (...h: object[]) => h as TransferTaxInput["houses"];

describe("MH-P6·P9 반사실 B = 중과 없는 세대 구성의 세액", () => {
  const A = run(input({ houses: houses(SELLING, OTHER_REGULATED) }));
  const B = run(input({ houses: houses(SELLING, OTHER_REGULATED), forceNoMultiHouseSurcharge: true }));
  const REF = run(input({ houses: houses(SELLING, OTHER_LOW_LOCAL) }));

  it("[FN-1] 구별력 — A는 중과(2주택), REF는 중과 없음", () => {
    expect(A.multiHouseSurchargeEvaluation?.surchargeType).toBe("multi_house_2");
    expect(REF.multiHouseSurchargeEvaluation?.surchargeType).toBe("none");
    expect(A.totalTax).toBeGreaterThan(REF.totalTax);
  });

  it("[FN-2] B 세액 = REF 세액 (장특 축·세율 축 모두 닫힘)", () => {
    expect(B.longTermHoldingDeduction).toBe(REF.longTermHoldingDeduction);
    expect(B.longTermHoldingDeduction).toBeGreaterThan(0);
    expect(B.appliedRate).toBe(REF.appliedRate);
    expect(B.totalTax).toBe(REF.totalTax);
  });

  it("[FN-3] 명부 없는 입력(정밀 결과 없음 → fallback 경로)에서도 B는 중과 없음", () => {
    const Af = run(input({}));
    const Bf = run(input({ forceNoMultiHouseSurcharge: true }));
    const REFf = run(input({ isRegulatedArea: false }));
    expect(Af.totalTax).toBeGreaterThan(REFf.totalTax);
    expect(Bf.longTermHoldingDeduction).toBe(REFf.longTermHoldingDeduction);
    expect(Bf.totalTax).toBe(REFf.totalTax);
  });

  it("[FN-4] 중과가 아니면 A = B", () => {
    const B2 = run(input({ houses: houses(SELLING, OTHER_LOW_LOCAL), forceNoMultiHouseSurcharge: true }));
    expect(B2.totalTax).toBe(REF.totalTax);
  });

  it("[FN-5] 비과세면 A = B = 0", () => {
    const one = { isOneHousehold: true, householdHousingCount: 1, transferPrice: 800_000_000, residencePeriodMonths: 120, houses: houses(SELLING) };
    expect(run(input(one)).totalTax).toBe(0);
    expect(run(input({ ...one, forceNoMultiHouseSurcharge: true })).totalTax).toBe(0);
  });
});
