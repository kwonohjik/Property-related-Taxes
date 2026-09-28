/**
 * E-14h leaf — `resolveRentalResidenceComposition` (영 §155⑳ 「장기임대주택 … 과 그 밖의 1주택」).
 *
 * 비과세 STEP 2.5와 중과 배제 ① 요소가 함께 쓰는 판정이다. 세액 관측은 route anchor
 * `__tests__/api/transfer.route.rental-residence-155-20-e14gh.anchor.test.ts`. 여기서는 route로 만들기 번거로운
 * 판정 보류(`undetermined`) 분기를 leaf로 고정한다 — 판정 보류는 비과세 적용·중과 배제 미개방(양쪽 종전 동작)이다.
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
    id,
    acquisitionDate: D(acq),
    officialPrice: 300_000_000,
    region: "capital",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...o,
  }) as House;

const SELLING = house("selling", "2015-01-01");
const RENTAL = house("rental", "2016-01-01", { isLongTermRental: true, isApartment: false });
const OTHER = house("other", "2012-01-01");

function input(houses: House[], o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D("2015-01-01"),
    transferDate: D("2026-09-18"),
    isOneHousehold: true,
    householdHousingCount: houses.length,
    houses,
    sellingHouseId: "selling",
    ...o,
  } as Partial<TransferTaxInput>);
}

describe("E-14h resolveRentalResidenceComposition", () => {
  it("L-1 명부 없음 → 판정 보류(no_roster)", () => {
    expect(resolveRentalResidenceComposition(input([]), parsed)).toEqual({
      status: "undetermined",
      reason: "no_roster",
    });
  });

  it("L-2 거주주택 + 임대주택뿐 → met(sole)", () => {
    expect(resolveRentalResidenceComposition(input([SELLING, RENTAL]), parsed)).toEqual({
      status: "met",
      via: "sole",
    });
  });

  it("L-3 다른 일반주택(특례 없음) → exceeded", () => {
    expect(resolveRentalResidenceComposition(input([SELLING, RENTAL, OTHER]), parsed)).toMatchObject({
      status: "exceeded",
      otherHouseCount: 1,
    });
  });

  it("L-4 다른 주택이 §155④⑤ 합가로 빠지면 → 판정 보류(other_special_rule — 2중첩 해석 미확보)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], {
        marriageMerge: { marriageDate: D("2020-01-01") },
        isFirstTransferredInMerge: true,
      }),
      parsed,
    );
    expect(r).toEqual({ status: "undetermined", reason: "other_special_rule" });
  });

  it("L-5 조특법 감면주택 제외가 섞이면 → 판정 보류(special_act)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], {
        specialHouseExclusions: [
          {
            article: "unsold_99_2",
            houseAcquisitionDate: D("2013-06-01"),
            houseContractDate: D("2013-06-01"),
            isNationalHousing: false,
            requirementsConfirmed: true,
          },
        ] as TransferTaxInput["specialHouseExclusions"],
      }),
      parsed,
    );
    expect(r).toEqual({ status: "undetermined", reason: "special_act" });
  });

  it("L-6 조특법 제외 후에도 거주주택 외 비임대 2채 → exceeded(3중첩)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER, house("other2", "2013-01-01")]),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded", otherHouseCount: 2 });
  });
});
