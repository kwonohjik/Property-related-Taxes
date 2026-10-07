/**
 * anchor — §155⑤ 혼인합가: **각각 2주택 이상인 사람끼리의 혼인은 특례 불가** (기획재정부 조세정책과-1199, 2024.6.25.)
 *
 * 「각각 2주택 이상 소유한 배우자간 혼인하여 합가로 1세대가 소유하게 된 주택수가 4주택 이상인 경우」 2안(적용할 수 없음).
 * 서면-2022-법규재산-4283(평가셋 E132)이 장기임대주택을 포함해 이 기준을 적용했고, 사전-2025-법규재산-1062는 한쪽이
 * 1주택이면 ⑳·⑤를 함께 적용했다. 합가 구성 표는 장기임대주택을 뺀 행으로 세므로, 성립한 혼인 구성에 장기임대주택을
 * 다시 넣어 양쪽 주택 수를 센다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | R-1 | leaf | 명부 밖 임대주택(판정 메뉴) — 양쪽 2채 이상이면 불성립, 한쪽 1채면 성립, 혼인 후 취득은 세지 않는다 |
 * | R-2 | leaf | 보유자 미입력 — 불리한 쪽에 넣어도 결론이 안 바뀌면 판정, 바뀔 수 있으면 불성립 + 확인 필요 |
 * | R-3 | leaf | 명부의 장기임대주택 행(계산기 — 제외된 행)이 있으면 그 행의 보유자로 세고 명부 밖 입력은 보지 않는다 |
 * | R-4 | leaf | 동거봉양(혼인 아님)·§155⑳ 미적용이면 보지 않는다 |
 * | R-5 | 배선 | `marriageRentalSidesOf` — 혼인일 때만 · 특례 선언(applyException)일 때만 임대주택 보유자를 넘긴다 |
 * | R-6 | 배선 | 계산기 §155⑳ 세대 구성(`resolveRentalResidenceComposition`) — 명부 장기임대주택 행이 양쪽 2채 이상이면 ⑤로 빠지지 않는다 |
 */
import { describe, it, expect } from "vitest";
import {
  marriageRentalSidesOf,
  resolveMergeComposition,
  type MergeHouseSide,
} from "@/lib/tax-engine/one-house/merge-composition";
import type { HouseInfo, MergeOrigin } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { resolveRentalResidenceComposition } from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const MERGE = D("2020-01-01");

const row = (id: string, acq: string, mergeOrigin?: MergeOrigin, isLongTermRental = false): HouseInfo =>
  ({
    id,
    region: "capital",
    acquisitionDate: D(acq),
    officialPrice: 300_000_000,
    isInherited: false,
    isLongTermRental,
    ...(mergeOrigin ? { mergeOrigin } : {}),
  }) as HouseInfo;

/** 양도 주택(양도자 쪽) + 배우자 쪽 1채 — 장기임대주택을 뺀 구성은 「각자 1주택」으로 성립한다. */
const base = [row("selling", "2015-01-01"), row("a", "2016-03-15", "counterpart_side")];

const compose = (sides?: ReadonlyArray<MergeHouseSide | undefined>, houses = base, excluded: string[] = []) =>
  resolveMergeComposition({
    householdHousingCount: 2,
    houses,
    sellingHouseId: "selling",
    mergeDate: MERGE,
    knownHouseExclusionHouseIds: excluded,
    marriageRentals: sides === undefined ? undefined : { rentalUnitSides: sides },
  });

describe("R-1 명부 밖 장기임대주택 — 양쪽 주택 수", () => {
  it("E132 구성(양도자 쪽 임대 2 · 배우자 쪽 임대 1) → 양쪽 3·2 → 불성립", () => {
    expect(compose(["seller_side", "seller_side", "counterpart_side"])).toMatchObject({
      status: "fails",
      reason: "both_sides_multi_house",
      sellerSide: 3,
      counterpartSide: 2,
    });
  });
  it("경계 — 양쪽 정확히 2·2면 불성립 · 한쪽 1채면 성립(1062)", () => {
    expect(compose(["seller_side", "counterpart_side"])).toMatchObject({ status: "fails", reason: "both_sides_multi_house" });
    expect(compose(["seller_side"])).toEqual({ status: "holds" });
    expect(compose(["seller_side", "seller_side", "seller_side"])).toEqual({ status: "holds" });
  });
  it("혼인 후 취득 임대주택은 세지 않는다", () => {
    expect(compose(["seller_side", "after_merge"])).toEqual({ status: "holds" });
  });
});

describe("R-2 보유자 미입력 — 결론을 가를 때만 불성립 + 확인 필요", () => {
  it("1채만 모르면 어느 쪽에 넣어도 양쪽 2채 이상이 될 수 없다 → 성립", () => {
    expect(compose([undefined])).toEqual({ status: "holds" });
  });
  it("2채를 모르거나, 1채를 몰라도 한쪽이 이미 2채면 → rental_origin_missing(확인 필요 문구)", () => {
    const r = compose([undefined, undefined]);
    expect(r).toMatchObject({ status: "fails", reason: "rental_origin_missing" });
    expect(r.status === "fails" && r.confirmNotice).toMatch(/혼인 전 보유자/);
    expect(compose(["seller_side", undefined])).toMatchObject({ status: "fails", reason: "rental_origin_missing" });
  });
});

describe("R-3 명부의 장기임대주택 행(계산기)", () => {
  const houses = [
    ...base,
    row("r1", "2017-03-15", "seller_side", true),
    row("r2", "2017-10-15", "seller_side", true),
    row("r3", "2018-05-15", "counterpart_side", true),
  ];
  it("제외된 장기임대주택 행의 보유자로 센다 — 명부 밖 입력(다른 값)은 보지 않는다", () => {
    expect(compose(["seller_side"], houses, ["r1", "r2", "r3"])).toMatchObject({
      status: "fails",
      reason: "both_sides_multi_house",
      sellerSide: 3,
      counterpartSide: 2,
    });
  });
  it("구성에서 이미 센(제외되지 않은) 장기임대주택 행은 다시 세지 않고, 명부 밖 입력도 보지 않는다", () => {
    const counted = [row("selling", "2015-01-01"), row("r1", "2017-03-15", "counterpart_side", true)];
    expect(compose(["seller_side", "counterpart_side", "counterpart_side"], counted)).toEqual({ status: "holds" });
  });
  it("행의 취득일이 혼인 후면 입력값과 무관하게 세지 않는다(날짜 우선)", () => {
    const late = [...base, row("r1", "2017-03-15", "seller_side", true), row("r3", "2021-05-15", "counterpart_side", true)];
    expect(compose([], late, ["r1", "r3"])).toEqual({ status: "holds" });
  });
});

describe("R-4 범위 밖", () => {
  it("marriageRentals가 없으면(동거봉양) 임대주택을 세지 않는다", () => {
    expect(compose(undefined)).toEqual({ status: "holds" });
  });
});

describe("R-5 marriageRentalSidesOf", () => {
  const rh = (applyException: boolean) => ({
    rentalHousingException: { applyException, rentalUnits: [{ mergeOrigin: "seller_side" as const }, {}] },
  });
  it("혼인일 때만 · 특례 선언일 때만 넘긴다", () => {
    expect(marriageRentalSidesOf(rh(true), true)).toEqual({ rentalUnitSides: ["seller_side", undefined] });
    expect(marriageRentalSidesOf(rh(false), true)).toEqual({ rentalUnitSides: [] });
    expect(marriageRentalSidesOf(rh(true), false)).toBeUndefined();
  });
});

describe("R-6 계산기 §155⑳ 세대 구성 — 명부의 장기임대주택 행", () => {
  const parsed = parseRatesFromMap(makeMockRates());
  const rentalRows = (sides: MergeOrigin[]) => sides.map((o, i) => row(`r${i}`, "2017-03-15", o, true));
  const judge = (sides: MergeOrigin[]) => {
    const houses = [...base, ...rentalRows(sides)];
    return resolveRentalResidenceComposition(
      baseTransferInput({
        propertyType: "housing",
        acquisitionDate: D("2015-01-01"),
        transferDate: D("2026-05-20"),
        isOneHousehold: true,
        householdHousingCount: houses.length,
        houses,
        sellingHouseId: "selling",
        marriageMerge: { marriageDate: MERGE },
        isFirstTransferredInMerge: true,
      } as Partial<TransferTaxInput>),
      parsed,
    );
  };
  it("양도자 쪽 임대 2 · 배우자 쪽 임대 1(E132 구성) → 혼인합가로 빠지지 않는다", () => {
    expect(judge(["seller_side", "seller_side", "counterpart_side"])).toMatchObject({ status: "exceeded" });
  });
  it("짝 — 임대주택이 모두 양도자 쪽이면 혼인합가로 빠진다(met)", () => {
    expect(judge(["seller_side", "seller_side", "seller_side"])).toEqual({ status: "met", via: "marriage_merge" });
  });
});
