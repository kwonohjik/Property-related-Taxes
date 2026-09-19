/**
 * anchor — F-11 · 중과 주택 수 불산입 목록의 **시점**과 **근거** (소득세법 시행령 §167의3① 괄호).
 *
 * 괄호가 주택 수 불산입으로 정한 것은 「제1호」(~2024-02-28) → 「제1호 또는 제12호」(2024-02-29~)뿐이다
 * (DRF eflaw 2021-01-01~2028-01-01 시행본 전수 대조).
 *
 * | # | 항목 | 법령 |
 * |---|---|---|
 * | A | 12호 가·나목 | 2024.2.29 개정 부칙 §11① — 「이 영 시행 이후 주택을 **양도**하는 경우부터」 (그 전 12호는 「삭제<2023.2.28>」) |
 * | B | 12호 나목2) 취득가액 | 6억 → 7억(2026.2.27 개정 · 부칙 §11 — 「이 영 시행 이후 … **취득**하는 경우부터」) |
 * | C | 12호 다·라목 세컨드홈 | 2026.2.27 시행본에서 신설 · 호 본문 「2026년 1월 1일 이후 **취득**하는 주택」 |
 * | D | 조특법 감면 미분양·신축주택 | 조특법은 §89①3호(비과세)에서만 소유주택 제외 → 중과 주택 수에는 **산입**, §167의3①5호로 중과 **대상**에서만 제외 |
 * | E | 주거용 오피스텔 | 불산입 규정 없음 — 심사-양도-2020-0038 · 조심-2023-서-10142가 3주택 판정에 산입 |
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

type Over = Parameters<typeof makeHouse>[1];
function run(others: Over[], transferDate: string) {
  const houses = [makeHouse("h1", { regionCode: "11680" }), ...others.map((o, i) => makeHouse(`h${i + 2}`, o))];
  return determineMultiHouseSurcharge(
    makeInput(houses, { sellingHouseId: "h1", transferDate: new Date(transferDate) }),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );
}
const reasonOf = (r: ReturnType<typeof run>, id: string) => r.excludedHouses.find((e) => e.houseId === id)?.reason;

/** 12호 가목 소형 신축 — 2024-01-15 취득·2024-01-12 준공 · 50㎡ · 비아파트 · 2억 */
const SMALL_NEW = {
  acquisitionDate: new Date("2024-01-15"),
  completionDate: new Date("2024-01-12"),
  exclusiveArea: 50,
  isApartment: false,
  acquisitionPrice: 200_000_000,
};
/** 12호 나목 준공 후 미분양 — 비수도권 · 80㎡ · 6.5억 (6억 초과 · 7억 이하) */
const UNSOLD_NEW = (acq: string) => ({
  acquisitionDate: new Date(acq),
  region: "non_capital" as const,
  regionCode: "43111",
  exclusiveArea: 80,
  acquisitionPrice: 650_000_000,
  officialPrice: 400_000_000,
  isUnsoldNewHouse: true,
});
const SECOND_HOME = (acq: string) => ({
  acquisitionDate: new Date(acq),
  isPopulationDeclineArea: true,
  isSecondHomeRegistered: true,
});

describe("F-11 A — 12호 가·나목은 2024-02-29 이후 양도분부터", () => {
  it("F11-A1 2024-02-20 양도: 소형 신축 산입 → 3주택", () => {
    const r = run([{}, SMALL_NEW], "2024-02-20");
    expect(r.effectiveHouseCount).toBe(3);
    expect(reasonOf(r, "h3")).toBeUndefined();
  });
  it("F11-A2 (대조) 2024-02-29 양도: 불산입 → 2주택", () => {
    const r = run([{}, SMALL_NEW], "2024-02-29");
    expect(r.effectiveHouseCount).toBe(2);
    expect(reasonOf(r, "h3")).toBe("small_new_house");
  });
});

describe("F-11 B — 12호 나목2) 취득가액 6억 → 7억(2026-02-27 이후 취득)", () => {
  it("F11-B1 2025-06-01 취득 6.5억: 6억 초과 → 산입", () => {
    expect(reasonOf(run([{}, UNSOLD_NEW("2025-06-01")], "2026-09-18"), "h3")).toBeUndefined();
  });
  it("F11-B2 (대조) 2026-03-01 취득 6.5억: 7억 이하 → 불산입", () => {
    expect(reasonOf(run([{}, UNSOLD_NEW("2026-03-01")], "2026-09-18"), "h3")).toBe("small_new_house");
  });
});

describe("F-11 C — 12호 다·라목 세컨드홈: 2026-01-01 이후 취득 · 2026-02-27 이후 양도", () => {
  it("F11-C1 2025-12-01 취득: 산입", () => {
    expect(reasonOf(run([SECOND_HOME("2025-12-01")], "2026-09-18"), "h2")).toBeUndefined();
  });
  it("F11-C2 2026-01-15 취득 · 2026-02-20 양도(시행 전): 산입", () => {
    expect(reasonOf(run([SECOND_HOME("2026-01-15")], "2026-02-20"), "h2")).toBeUndefined();
  });
  it("F11-C3 (대조) 2026-01-15 취득 · 2026-03-10 양도: 불산입", () => {
    expect(reasonOf(run([SECOND_HOME("2026-01-15")], "2026-03-10"), "h2")).toBe("population_decline_second_home");
  });
});

describe("F-11 D — 조특법 감면 미분양·신축주택은 산입 + §167의3①5호", () => {
  it("F11-D1 일반 + 일반 + 감면주택 → 3주택 (종전 2주택)", () => {
    const r = run([{}, { isUnsoldHousing: true }], "2026-09-18");
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeType).toBe("multi_house_3plus");
  });
  it("F11-D2 일반 + 감면주택 → 2주택이지만 10호로 중과 배제(다른 주택이 5호)", () => {
    const r = run([{ isUnsoldHousing: true }], "2026-09-18");
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.surchargeApplicable).toBe(false);
    const d = r.exclusionReasons.find((e) => e.type === "only_general_two_house")?.detail ?? "";
    expect(d).toMatch(/조특법 감면/);
  });
  it("F11-D3 감면주택 **자신**을 양도하면 5호로 중과 배제", () => {
    const houses = [makeHouse("h1", { regionCode: "11680", isUnsoldHousing: true }), makeHouse("h2"), makeHouse("h3")];
    const r = determineMultiHouseSurcharge(
      makeInput(houses, { sellingHouseId: "h1", transferDate: new Date("2026-09-18") }),
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons.map((e) => e.type)).toContain("tax_special_exemption");
  });
});

describe("F-11 E — 주거용 오피스텔은 취득일과 무관하게 산입", () => {
  it("F11-E1 2020 취득 주거용 오피스텔 → 3주택 (종전 2주택)", () => {
    const r = run([{}, { isOfficetel: true, isApartment: false, acquisitionDate: new Date("2020-01-01") }], "2026-09-18");
    expect(r.effectiveHouseCount).toBe(3);
  });
});
