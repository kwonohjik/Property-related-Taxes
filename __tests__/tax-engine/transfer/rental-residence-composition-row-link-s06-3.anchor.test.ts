/**
 * S06-3 anchor — 「그 밖의 주택」에서 빼는 조특법 소유주택 제외는 **그 밖의 주택 행**에 연결된 것(또는 행에 연결되지 않은
 * 선언 — L-5)뿐이다. 장기임대주택 행 **자신**의 제외는 「그 밖의 주택」을 줄이지 않는다.
 *
 * 근거: 「소득세법 시행령」 §155⑳ 본문 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대」(MST 290841).
 * 임대 행을 장기임대주택으로 보든 조특법 §99의2②(「소유주택으로 보지 아니한다」)로 빼든, **일반주택 h6은 어느 특례로도
 * 빠지지 않는다** → ⑳도 §154①도 불성립이다. 종전에는 `others`(임대 행 제외 목록)에서 임대 행 자신의 제외를 한 번 더 빼
 * 일반주택이 남는데도 `met`이 됐다 — 비과세 특례와 13호 중과 배제가 함께 열렸다(시료 차이 약 12.3억).
 */
import { describe, it, expect } from "vitest";
import { resolveRentalResidenceComposition } from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const parsed = parseRatesFromMap(makeMockRates());
const D = (s: string) => new Date(s);
type House = NonNullable<TransferTaxInput["houses"]>[number];
const house = (id: string, acq: string, o: Partial<House> = {}): House =>
  ({
    id, acquisitionDate: D(acq), officialPrice: 300_000_000, region: "capital", isInherited: false,
    isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, ...o,
  }) as House;
const SELLING = house("selling", "2015-01-01");
const RENTAL = house("rental", "2013-06-01", { isLongTermRental: true, isApartment: false });
const OTHER = house("other", "2013-06-01");
const input = (houses: House[], o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", acquisitionDate: D("2015-01-01"), transferDate: D("2026-09-18"), isOneHousehold: true,
    householdHousingCount: houses.length, houses, sellingHouseId: "selling", ...o,
  } as Partial<TransferTaxInput>);
const special = (article: string, houseId?: string, date = "2013-06-01") =>
  [{
    article, houseAcquisitionDate: D(date), houseContractDate: D(date), isNationalHousing: false,
    requirementsConfirmed: true, ...(houseId ? { houseId } : {}),
  }] as TransferTaxInput["specialHouseExclusions"];

describe("S06-3 임대 행 자신의 조특법 제외는 「그 밖의 주택」을 줄이지 않는다", () => {
  it("A [임대 행에 §99의2 + 일반주택 1채] → exceeded(일반주택이 남는다)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], { specialHouseExclusions: special("unsold_99_2", "rental") }),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded", otherHouseCount: 1 });
  });
  it("C 긍정 짝 [임대 행 · 일반주택 행에 §99의2] → met(sole) — 같은 선언을 일반주택에 붙이면 정당하게 빠진다", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], { specialHouseExclusions: special("unsold_99_2", "other") }),
      parsed,
    );
    expect(r).toEqual({ status: "met", via: "sole" });
  });
  it("L-5 보존 [행에 연결되지 않은 선언] → 그 밖의 주택에서 뺀다 → met(sole)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], { specialHouseExclusions: special("unsold_99_2") }),
      parsed,
    );
    expect(r).toEqual({ status: "met", via: "sole" });
  });
  it("B 임대 행에 §99의2 + 일반주택 2채 → 3중첩 exceeded(2채) — 임대 행 제외가 한 번 더 빠지지 않는다", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER, house("other2", "2013-01-01")], { specialHouseExclusions: special("unsold_99_2", "rental") }),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded", otherHouseCount: 2 });
  });
  it("임대 행에 걸린 확인 목록 밖 제외(§98)는 「그 밖의 주택」 판정에 섞이지 않는다 — 확인 필요 고지가 붙지 않는다", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], { specialHouseExclusions: special("unsold_98", "rental", "1996-06-01") }),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded", otherHouseCount: 1 });
    expect(r.status === "exceeded" && r.confirmNotice).toBeFalsy();
  });
});
