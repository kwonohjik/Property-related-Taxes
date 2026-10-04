/**
 * E-14h leaf — `resolveRentalResidenceComposition` (영 §155⑳ 「장기임대주택 … 과 그 밖의 1주택」).
 *
 * 비과세 STEP 2.5와 중과 배제 ① 요소가 함께 쓰는 판정이다. 세액 관측은 route anchor
 * `__tests__/api/transfer.route.rental-residence-155-20-e14gh.anchor.test.ts`. 여기서는 route로 만들기 번거로운
 * 판정 보류(`undetermined`) 분기를 leaf로 고정한다 — 판정 보류는 비과세 적용·중과 배제 미개방(양쪽 종전 동작)이다.
 *
 * 2026-10-04 — 「해석 미확보」 겹침은 불성립(+ 확인 필요)으로, 해석례가 확인된 겹침은 `met`으로 바뀌었다
 * (route anchor `__tests__/api/transfer.route.unknown-unfavorable-interp-axes.anchor.test.ts`). L-4·L-5는 그 정책 변경으로
 * 기대값을 갱신했다(종전: `undetermined` other_special_rule · special_act).
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

  it("L-4 다른 주택이 §155⑤ 혼인 합가로 빠지면 → met(상속증여세과-21 · 사전-2025-법규재산-1062)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], {
        marriageMerge: { marriageDate: D("2020-01-01") },
        isFirstTransferredInMerge: true,
      }),
      parsed,
    );
    expect(r).toEqual({ status: "met", via: "marriage_merge" });
  });

  it("L-5 조특법 §99의2 감면주택 제외(해석 확인)로 그 밖의 주택이 없으면 → met(서면-2015-부동산-2422)", () => {
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
    expect(r).toEqual({ status: "met", via: "sole" });
  });

  it("L-6 조특법 제외 후에도 거주주택 외 비임대 2채 → exceeded(3중첩)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER, house("other2", "2013-01-01")]),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded", otherHouseCount: 2 });
  });

  const special = (article: string, contract: string, houseId?: string) =>
    [
      {
        article,
        houseAcquisitionDate: D(contract),
        houseContractDate: D(contract),
        isNationalHousing: false,
        requirementsConfirmed: true,
        ...(houseId ? { houseId } : {}),
      },
    ] as TransferTaxInput["specialHouseExclusions"];

  it("L-7 조특법 §98 제외(시행령 위임 — 확인 목록 밖)로만 그 밖의 주택이 없으면 → exceeded + 확인 필요", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], { specialHouseExclusions: special("unsold_98", "1996-06-01") }),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded", otherHouseCount: 1 });
    expect(r.status === "exceeded" && r.confirmNotice).toContain("조특령 §98②·⑥");
  });

  it("L-7b 조특법 §98의8(§99의2와 같은 문형 — Q2)로만 그 밖의 주택이 없으면 → met(sole)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], { specialHouseExclusions: special("unsold_98_8", "2015-06-01") }),
      parsed,
    );
    expect(r).toEqual({ status: "met", via: "sole" });
  });

  it("L-8 §99의2 제외(행 연결) + 남은 1채가 어느 특례에도 안 걸리면 → exceeded · 고지 없음(결론 무관)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER, house("other2", "2013-01-01")], {
        specialHouseExclusions: special("unsold_99_2", "2013-06-01", "other"),
      }),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded", otherHouseCount: 1 });
    expect(r.status === "exceeded" && r.confirmNotice).toBeFalsy();
  });

  it("L-9 조특법 선언이 명부 행에 연결되지 않아 남는 1채를 특정할 수 없으면 → exceeded + 확인 필요", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER, house("other2", "2013-01-01")], {
        specialHouseExclusions: special("unsold_99_2", "2013-06-01"),
      }),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded" });
    expect(r.status === "exceeded" && r.confirmNotice).toContain("행에 연결");
  });

  it("L-10 명부 없음 · §99의2 제외 후 그 밖의 주택 0 → 판정 보류(no_roster) · §98이면 exceeded + 확인 필요", () => {
    const base = { householdHousingCount: 3, rentalHousingException: { rentalUnits: [{}] } } as Partial<TransferTaxInput>;
    expect(
      resolveRentalResidenceComposition(input([], { ...base, specialHouseExclusions: special("unsold_99_2", "2013-06-01") }), parsed),
    ).toEqual({ status: "undetermined", reason: "no_roster" });
    const r = resolveRentalResidenceComposition(
      input([], { ...base, specialHouseExclusions: special("unsold_98", "1996-06-01") }),
      parsed,
    );
    expect(r).toMatchObject({ status: "exceeded" });
    expect(r.status === "exceeded" && r.confirmNotice).toContain("조특령 §98②·⑥");
  });

  it("L-11 §155④ 동거봉양 합가 → met(부동산거래관리과-44)", () => {
    const r = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, OTHER], {
        parentalCareMerge: { mergeDate: D("2020-01-01") },
        isFirstTransferredInMerge: true,
      } as Partial<TransferTaxInput>),
      parsed,
    );
    expect(r).toEqual({ status: "met", via: "parental_care_merge" });
  });

  it("L-12 §155③ 공동상속 소수지분 2중첩 → met(co_inherited_house — Q3) · 3중첩은 exceeded", () => {
    const co = house("co", "2019-06-01", {
      isInherited: true,
      inheritedDate: D("2019-06-01"),
      isCoInherited: true,
      isLargestCoInheritedShareholder: false,
    } as Partial<House>);
    expect(resolveRentalResidenceComposition(input([SELLING, RENTAL, co]), parsed)).toEqual({
      status: "met",
      via: "co_inherited_house",
    });
    expect(resolveRentalResidenceComposition(input([SELLING, RENTAL, co, OTHER]), parsed)).toMatchObject({
      status: "exceeded",
      otherHouseCount: 2,
    });
  });
  it("L-13 조특법 §98의9(§99의4 문형 — 사용자 결정 2026-10-04)로만 그 밖의 주택이 없으면 → met(sole) · 명부 없음이면 판정 보류", () => {
    const unsold = (acq: string, houseId?: string) =>
      [
        {
          type: "unsold_98_9",
          ...(houseId ? { houseId } : {}),
          unsoldHouseAcquisitionDate: D(acq),
          unsoldHouseAcquisitionPrice: 500_000_000,
          unsoldHouseExclusiveArea: 84,
          isNonCapitalRegion: true,
          wasOneHouseholdAtAcquisition: true,
          meetsSellerAndContractRequirement: true,
        },
      ] as unknown as TransferTaxInput["reductions"];
    const row = house("unsold", "2025-03-01", { region: "non_capital" });
    expect(
      resolveRentalResidenceComposition(input([SELLING, RENTAL, row], { reductions: unsold("2025-03-01", "unsold") }), parsed),
    ).toEqual({ status: "met", via: "sole" });
    // (음성 짝) 취득기간 밖이면 제외가 성립하지 않아 그 행이 남는다 — 사실이 확정이라 고지 없음
    const out = resolveRentalResidenceComposition(
      input([SELLING, RENTAL, house("unsold", "2023-06-01")], { reductions: unsold("2023-06-01", "unsold") }),
      parsed,
    );
    expect(out).toMatchObject({ status: "exceeded", otherHouseCount: 1 });
    expect(out.status === "exceeded" && out.confirmNotice).toBeFalsy();
    const base = { householdHousingCount: 3, rentalHousingException: { rentalUnits: [{}] } } as Partial<TransferTaxInput>;
    expect(resolveRentalResidenceComposition(input([], { ...base, reductions: unsold("2025-03-01") }), parsed)).toEqual({
      status: "undetermined",
      reason: "no_roster",
    });
  });
});
