/**
 * #16-1 영 §167의10①4호 가드 — ⑧ 주택이 중과 주택 수 2채 **안**에 있을 때만 4호로 배제한다(엔진 단위).
 *
 * 4호 슬롯(`unavoidableOutsideCapitalHouse`)은 §155②③·조특법 제외 **후** 주택 수로 서므로, ⑧ 주택이 중과 주택 수 밖이고
 * 남은 2채가 다른 주택이어도 슬롯이 선다. 명부 행의 ⑧ 표시(`isUnavoidableOutsideCapital`)로 그 주택이 2채 안인지 가린다.
 * 행 표시가 하나도 없으면(명부 없는 합성 주택·세대 단위 레거시 선언) 종전 대리 지표(다른 효과 주택이 상속주택이면 건너뜀)를 쓴다.
 * route 관측은 `__tests__/api/transfer.route.dec16-overlap-deemed.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { defaultRules, mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const TD = new Date("2021-09-18");
const SELLING = makeHouse("h1", { regionCode: "11680", acquisitionDate: new Date("2015-01-01") });
/** 중과 주택 수 밖 — 수도권·광역시 밖 기준시가 3억 이하(영 §167의3①1호) */
const OUTSIDE_COUNT = (over: Partial<HouseInfo> = {}) =>
  makeHouse("h-out", { region: "non_capital", officialPrice: 100_000_000, isApartment: false, ...over });

function evaluate(houses: HouseInfo[]) {
  const r = determineMultiHouseSurcharge(
    makeInput(houses, { sellingHouseId: "h1", transferDate: TD, unavoidableOutsideCapitalHouse: true }),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );
  return { eff: r.effectiveHouseCount, uoc: r.exclusionReasons.some((e) => e.type === "unavoidable_outside_capital") };
}

describe("#16-1 4호 — ⑧ 행이 중과 주택 수 2채 안에 있을 때만", () => {
  it("⑧ 행이 다른 효과 주택 → 4호 배제", () => {
    expect(evaluate([SELLING, makeHouse("h2", { isUnavoidableOutsideCapital: true })])).toEqual({ eff: 2, uoc: true });
  });
  it("⑧ 행이 양도 주택 자신 → 4호 배제", () => {
    expect(evaluate([{ ...SELLING, isUnavoidableOutsideCapital: true }, makeHouse("h2")])).toEqual({ eff: 2, uoc: true });
  });
  it("⑧ 행이 중과 주택 수 밖 · 남은 2채는 일반 주택 → 4호 배제 없음 (수정 전: 대리 지표가 통과시켜 배제)", () => {
    expect(evaluate([SELLING, makeHouse("h2"), OUTSIDE_COUNT({ isUnavoidableOutsideCapital: true })])).toEqual({ eff: 2, uoc: false });
  });

  // ── 행 표시 없음(합성 주택·레거시) — 종전 대리 지표 유지 ──
  it("행 표시 없음 · 다른 효과 주택이 상속주택 아님 → 종전대로 4호 배제", () => {
    expect(evaluate([SELLING, makeHouse("h2")])).toEqual({ eff: 2, uoc: true });
  });
  it("행 표시 없음 · 다른 효과 주택이 상속주택 → 종전대로 4호 건너뜀", () => {
    const inherited = makeHouse("h2", { isInherited: true, inheritedDate: new Date("2010-01-01") });
    expect(evaluate([SELLING, inherited])).toEqual({ eff: 2, uoc: false });
  });
});
