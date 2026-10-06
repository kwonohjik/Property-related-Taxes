/**
 * ⑳ 없는 3중첩 — §155 특례는 **두 개까지** 겹친다 (`inheritedHouseExclusionCount`, 2026-10-06 사용자 결정: 불허 + 확인 필요).
 *
 * 두 특례가 겹친 3주택(①+④⑤ — 사전-2025-법규재산-1240 · ⑦+① — 서면인터넷방문상담4팀-3617)은 국세청이 인정했다.
 * §155②③ 상속주택 제외까지 더한 **세 특례**를 인정한 해석은 확인되지 않았고 불허 회신만 있다
 * (⑳+③+① — 사전-2016-법령해석재산-0584 · 조심-2021-중-5977). 조특법 §99의4형 제외는 §155 특례가 아니라 세지 않는다.
 *
 * | # | 조합 | 기대 |
 * |---|---|---|
 * | C-1 | ①+④(합가 전 상대 쪽 1 · 합가 후 신규 1) | 비과세 — 긍정 짝 |
 * | C-2 | ②+①+④(C-1 + 별도세대 상속주택) | 과세 · 불성립 사유 「확인 필요」 |
 * | C-3 | ②+①(상속주택 + 신규주택) | 비과세 — 두 특례는 그대로(긍정 짝) |
 * | C-4 | ⑦+① | 비과세 — 긍정 짝 |
 * | C-5 | ②+⑦+① | 과세 |
 * | S-1 | 중과 15호 선판정 | C-1은 합가 중첩 의제 · C-2는 의제 없음 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { collectUnmetExceptions } from "@/lib/tax-engine/one-house/unmet-exceptions";
import { resolveSurchargeDeemedOneHouse } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const h = (id: string, acq: string, extra: Partial<HouseInfo> = {}): HouseInfo => ({
  id,
  acquisitionDate: D(acq),
  officialPrice: 300_000_000,
  region: "non_capital",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});

const SELLING = h("selling", "2015-01-01");
const NEW = h("n", "2024-02-01");
/** 별도세대 피상속인으로부터 2019년 상속 — 양도 주택(2015)이 상속개시 당시 보유 일반주택이라 §155②로 빠진다. */
const INHERITED = h("i", "2019-06-01", {
  isInherited: true,
  inheritedDate: D("2019-06-01"),
  decedentSameHouseholdAtInheritance: false,
  mergeOrigin: "seller_side",
});
const TEMP = { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D("2024-02-01") };

function input(x: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    transferPrice: 500_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: D("2015-01-01"),
    transferDate: D("2026-06-15"),
    isRegulatedArea: false,
    residencePeriodMonths: 0,
    sellingHouseId: "selling",
    temporaryTwoHouse: TEMP,
    ...x,
  });
}

/** 동거봉양 합가(2022) — 합가 전 상대 쪽 1채 · 합가 후 신규 취득 1채 */
const merge = (extraHouses: HouseInfo[]) =>
  input({
    householdHousingCount: 3 + extraHouses.length,
    houses: [SELLING, h("b", "2012-01-01", { mergeOrigin: "counterpart_side" }), NEW, ...extraHouses],
    parentalCareMerge: { mergeDate: D("2022-01-01") },
    isFirstTransferredInMerge: true,
  });

const RURAL = {
  kind: "return_to_farm" as const,
  isOutsideCapitalEupMyeon: true,
  acquisitionDate: D("2022-01-10"),
  isHighPriceAtAcquisition: false,
  landAreaSqm: 300,
  wholeHouseholdMoved: true,
};
const rural = (extraHouses: HouseInfo[]) =>
  input({
    householdHousingCount: 3 + extraHouses.length,
    houses: [SELLING, h("r", "2022-01-10"), NEW, ...extraHouses],
    ruralHouse: RURAL as TransferTaxInput["ruralHouse"],
  });

describe("§155 특례 중첩 상한 — 두 개까지", () => {
  it("C-1 ①+④ → 비과세(긍정 짝)", () => {
    expect(calculateTransferTax(merge([]), rates).isExempt).toBe(true);
  });
  it("C-2 ②+①+④ → 과세", () => {
    expect(calculateTransferTax(merge([INHERITED]), rates).isExempt).toBe(false);
  });
  it("C-3 ②+① → 비과세(두 특례는 그대로)", () => {
    const r = calculateTransferTax(
      input({ householdHousingCount: 3, houses: [SELLING, NEW, INHERITED] }),
      rates,
    );
    expect(r.isExempt).toBe(true);
  });
  it("C-4 ⑦+① → 비과세(긍정 짝)", () => {
    expect(calculateTransferTax(rural([]), rates).isExempt).toBe(true);
  });
  it("C-5 ②+⑦+① → 과세", () => {
    expect(calculateTransferTax(rural([INHERITED]), rates).isExempt).toBe(false);
  });
});

describe("불성립 사유 — 확인 필요", () => {
  const rules = parseRatesFromMap(rates).oneHouseSpecialRules as OneHouseSpecialRulesData;
  it("상속주택을 뺀 뒤 3주택 + 합가 → 세 특례 안내 · 상속 제외가 없으면 그 문구는 없다", () => {
    const reasons = (n: number) =>
      collectUnmetExceptions({ ...merge([]), inheritedHouseExclusionCount: n }, rules)
        .flatMap((u) => u.reasons)
        .join(" | ");
    expect(reasons(1)).toContain("세 가지가 겹친 경우를 인정한 해석이 확인되지 않아");
    expect(reasons(0)).not.toContain("세 가지가 겹친");
  });
});

describe("중과 15호 선판정 — 같은 상한", () => {
  it("①+④면 합가 중첩 의제 · 상속주택까지 겹치면 의제 없음", () => {
    const parsed = parseRatesFromMap(rates);
    expect(resolveSurchargeDeemedOneHouse(merge([]), parsed)).toBe("parental_care_merge_overlap");
    expect(resolveSurchargeDeemedOneHouse(merge([INHERITED]), parsed)).toBeUndefined();
  });
});
