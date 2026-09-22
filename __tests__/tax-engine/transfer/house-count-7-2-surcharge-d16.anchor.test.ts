/**
 * D16 — 5년 내 상속주택(소득세법 시행령 §167의3①7호)·장기임대(2호)는 **주택 수에 산입**되고
 * 중과 **대상에서만** 빠진다. 계획서: docs/00-pm/transfer-review-4-defects.plan.md §4 · §7.
 *
 * - §167의3① 본문 괄호: 주택 수 불산입은 「제1호 또는 제12호」뿐(2022-01-01판은 제1호만).
 * - 3주택 이상: 7호·2호 주택은 「유일한 일반주택」(§167의3①10호) 판정에 참여한다.
 * - 2주택: §167의10①10호 — 「제1호부터 제7호까지(자신의 호)의 주택을 제외하고 1개의 주택만」.
 *   2호가 §167의3①2호~8호·8호의2를 준용한다(V-1).
 * - 양도 주택 **자체**가 7호·2호면 배제(2주택은 §167의10①2호 준용).
 * - 7호 「제155조제2항에 해당하는」 — 동일세대 단서·순위 게이트(V-2: 서면4팀-2898 · 서면4팀-4227 등).
 *
 * 세율은 프로덕션 fallback(loadFallbackTransferRates) · 조정지역(강남) 8억/3억 · 양도 2026-09-18.
 * 수기 검산(A1): 과세표준 497,500,000 × (40% + 30%p) − 25,940,000 = 322,310,000 × 1.1 = 354,541,000.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import {
  isSurchargeExemptInherited,
  isSurchargeExemptRental,
  isLongTermRentalDutyPeriodPending,
} from "@/lib/tax-engine/multi-house-surcharge-count";

type H = Record<string, unknown>;
const house = (id: string, acq: string, o: H = {}) => ({
  id,
  acquisitionDate: new Date(acq),
  officialPrice: 300_000_000,
  region: "capital" as const,
  regionCode: "11680",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...o,
});

/** 양도 주택(2015 취득) + 다른 주택들(2012 취득). selling은 양도 주택 속성 덮어쓰기. */
function hh(others: H[], selling: H = {}, td = "2026-09-18", sellingAcq = "2015-01-01"): TransferTaxInput {
  const hs = [house("selling", sellingAcq, selling), ...others.map((o, i) => house(`h${i + 2}`, "2012-01-01", o))];
  return baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date(sellingAcq),
    transferDate: new Date(td),
    isRegulatedArea: true,
    isOneHousehold: false,
    householdHousingCount: hs.length,
    houses: hs as TransferTaxInput["houses"],
    sellingHouseId: "selling",
  } as Partial<TransferTaxInput>);
}
function calc(i: TransferTaxInput) {
  const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  const e = r.multiHouseSurchargeEvaluation!;
  return { tax: r.totalTax, count: e.effectiveHouseCount, reasons: (e.exclusionReasons ?? []).map((x) => x.type) };
}

const INH = { isInherited: true, inheritedDate: new Date("2024-01-01") };
/**
 * 🔴 2026-09-22 — 종전엔 `{ isLongTermRental: true }` **하나**였다. 술어가 유형 미선택 입력의
 *    등록·기간을 전혀 보지 않아 그래도 통과했기 때문이다(§167의3①2호 본문은 사업자등록등을,
 *    각 목은 임대기간을 요구한다 — 실독 MST 286211). 술어를 조인 뒤에도 **이 시료들의 의도**
 *    (「요건을 갖춘 장기임대주택」)는 그대로이므로 요건을 채워 보강했다.
 */
const RENTAL = {
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalRegistrationDate: new Date("2017-01-01"),
  businessRegistrationDate: new Date("2017-01-01"),
  rentalPeriodYears: 6,
};
const SAME_HH = { ...INH, decedentSameHouseholdAtInheritance: true };

describe("D16 3주택 — 7호·2호는 주택 수에 산입", () => {
  it("D16-A1 일반 + 일반 + 5년 내 상속 → 3주택 중과 354,541,000 (종전 2주택 299,816,000)", () => {
    const r = calc(hh([{}, INH]));
    expect(r.count).toBe(3);
    expect(r.tax).toBe(354_541_000);
  });

  it("D16-A2 긍정 짝: 3번째가 1호(지방 저가) → 주택 수 불산입 → 2주택 299,816,000", () => {
    const r = calc(hh([{}, { region: "non_capital", regionCode: "43111", officialPrice: 100_000_000 }]));
    expect(r.count).toBe(2);
    expect(r.tax).toBe(299_816_000);
  });

  it("D16-A3 장기임대(2호)도 같다 → 3주택 중과 354,541,000", () => {
    const r = calc(hh([{}, RENTAL]));
    expect(r.count).toBe(3);
    expect(r.tax).toBe(354_541_000);
  });

  it("D16-A4 양도 주택 **자체**가 5년 내 상속 → 중과 배제(기본세율) 190,366,000 (종전 2주택 중과)", () => {
    const r = calc(hh([{}, {}], INH, "2026-09-18", "2024-01-01"));
    expect(r.reasons).toEqual(["inherited_house_5years"]);
    expect(r.tax).toBe(190_366_000);
  });

  it("D16-A5 다른 두 채가 7호·2호 → §167의3①10호 유일한 일반주택 → 배제", () => {
    const r = calc(hh([INH, RENTAL]));
    expect(r.count).toBe(3);
    expect(r.reasons).toEqual(["only_one_remaining"]);
  });

  it("D16-A6 동일세대 상속(§155② 단서) → 7호 불해당 → 3주택 354,541,000", () => {
    expect(calc(hh([{}, SAME_HH])).tax).toBe(354_541_000);
  });
});

describe("D16 2주택 — §167의10①10호", () => {
  it("D16-B1 과다 방지 짝: 일반 + §155② 적격 5년 내 상속 → 10호 배제 141,966,000", () => {
    const r = calc(hh([INH]));
    expect(r.count).toBe(2);
    expect(r.reasons).toEqual(["only_general_two_house"]);
    expect(r.tax).toBe(141_966_000);
  });

  it("D16-B2 일반 + 동일세대 상속 → 10호 불성립 → 2주택 중과 299,816,000 (종전 1주택 141,966,000)", () => {
    const r = calc(hh([SAME_HH]));
    expect(r.count).toBe(2);
    expect(r.tax).toBe(299_816_000);
  });

  it("D16-B3 동일세대라도 동거봉양 합가 전 보유분이면 §155② 단서 예외 → 10호 배제", () => {
    expect(calc(hh([{ ...SAME_HH, parentalCareMergeInheritedHouse: true }])).tax).toBe(141_966_000);
  });

  it("D16-B4 순위 부적격 상속(§155②1~4호) → 10호 불성립 → 299,816,000", () => {
    expect(calc(hh([{ ...INH, isRankingDisqualifiedInheritedHouse: true }])).tax).toBe(299_816_000);
  });

  it("D16-B5 상속 5년 경과 → 7호 불해당 → 299,816,000", () => {
    expect(calc(hh([{ isInherited: true, inheritedDate: new Date("2021-01-01") }])).tax).toBe(299_816_000);
  });

  it("D16-B6 일반 + 장기임대 → 10호 배제 141,966,000", () => {
    expect(calc(hh([RENTAL])).reasons).toEqual(["only_general_two_house"]);
  });

  it("D16-B7 일반 + 사원용(§167의3①4호 → §167의10①2호) → 10호 배제 (종전 +20%p)", () => {
    const r = calc(hh([{ isEmployeeHousing: true, freeProvisionYears: 10 }]));
    expect(r.reasons).toEqual(["only_general_two_house"]);
    expect(r.tax).toBe(141_966_000);
  });

  it("D16-B8 음성 짝: 일반 + 일반 → 2주택 중과 299,816,000", () => {
    expect(calc(hh([{}])).tax).toBe(299_816_000);
  });

  it("D16-B9 양도 주택 자체가 장기임대 → 배제 (§167의10①2호 준용)", () => {
    expect(calc(hh([{}], RENTAL)).reasons).toEqual(["long_term_rental_house"]);
  });
});

describe("D16 시점축", () => {
  it("D16-T1 2022-03-01 양도(유예 전) — 3주택 중과 355,135,000 (종전 300,410,000)", () => {
    const r = calc(hh([{}, INH], {}, "2022-03-01"));
    expect(r.count).toBe(3);
    expect(r.tax).toBe(355_135_000);
  });
});

describe("D16 술어", () => {
  const TD = new Date("2026-09-18");
  it("D16-P1 7호: 5년 경계 · §155② 동일세대·순위 게이트", () => {
    expect(isSurchargeExemptInherited(house("x", "2012-01-01", INH) as never, TD)).toBe(true);
    expect(isSurchargeExemptInherited(house("x", "2012-01-01", { isInherited: true, inheritedDate: new Date("2021-09-18") }) as never, TD)).toBe(false);
    expect(isSurchargeExemptInherited(house("x", "2012-01-01", { isInherited: true, inheritedDate: new Date("2021-09-19") }) as never, TD)).toBe(true);
    expect(isSurchargeExemptInherited(house("x", "2012-01-01", SAME_HH) as never, TD)).toBe(false);
    expect(isSurchargeExemptInherited(house("x", "2012-01-01", { ...INH, isRankingDisqualifiedInheritedHouse: true }) as never, TD)).toBe(false);
    expect(isSurchargeExemptInherited(house("x", "2012-01-01", { isInherited: true }) as never, TD)).toBe(false);
  });

  /**
   * 🔴 **정정 2026-09-22** — 종전 이름은 「유형 없으면 등록(말소 전) **선언으로 인정**」이었고
   *    `{ isLongTermRental: true }` 하나로 `true`를 단언했다. 법문에 근거가 없다:
   *    §167의3①2호 **본문**이 사업자등록등을, **각 목 전부**가 임대기간을 요구한다
   *    (실독 MST 286211). ⇒ 유형 미선택도 등록 완비 + 5년을 요구하도록 정정했다.
   *
   *    긍정 짝(등록 완비 + 6년)을 함께 둬 분기가 양방향으로 고정된다
   *    ([[feedback_negative_anchor_needs_positive_twin]] ·
   *     [[feedback_shared_assertion_reversal_erases_sibling_net]]).
   */
  it("D16-P2 2호: 유형 미선택도 등록 완비 + 5년을 요구한다 · 말소 후 불해당", () => {
    const at = (o: Record<string, unknown>) => house("x", "2012-01-01", o) as never;
    // 긍정 짝 — 등록 완비 + 6년
    expect(isSurchargeExemptRental(at(RENTAL), TD)).toBe(true);
    // 말소가 양도일 이전이면 불해당
    expect(isSurchargeExemptRental(at({ ...RENTAL, rentalCancelledDate: new Date("2026-01-01") }), TD)).toBe(false);
    // 장기임대 선언 자체가 없으면 불해당
    expect(isSurchargeExemptRental(at({}), TD)).toBe(false);
    // 🔑 토글만 — 종전에는 이것이 `true`였다(실측 −212,575,000 무근거 감세)
    expect(isSurchargeExemptRental(at({ isLongTermRental: true }), TD)).toBe(false);
    // 등록 완비인데 기간(5년) 미달 → 2호 불해당
    expect(isSurchargeExemptRental(at({ ...RENTAL, rentalPeriodYears: 4 }), TD)).toBe(false);
    // 기간은 채웠으나 사업자등록일 누락 → 등록 미완비로 불해당
    expect(isSurchargeExemptRental(at({ ...RENTAL, businessRegistrationDate: undefined }), TD)).toBe(false);
  });

  /**
   * §167의3④ — 기간만 모자란 임대주택도 **일반주택 양도 시** 10호를 적용받는다.
   * 2호를 조이면서 이 혜택을 함께 없애지 않았음을 고정한다(유형 미선택 분기 신설).
   */
  it("D16-P3 ④ 의무기간 미달: 유형 미선택도 10호 의제 대상이다 (2호 조이기의 짝)", () => {
    const at = (o: Record<string, unknown>) => house("x", "2012-01-01", o) as never;
    const 기간미달 = { ...RENTAL, rentalPeriodYears: 4 };
    expect(isLongTermRentalDutyPeriodPending(at(기간미달), TD)).toBe(true);
    // 기간을 채웠으면 ④가 아니라 2호 본체로 간다
    expect(isLongTermRentalDutyPeriodPending(at(RENTAL), TD)).toBe(false);
    // 등록이 미완비면 「기간 외 요건」을 못 갖춘 것이라 ④도 아니다
    expect(isLongTermRentalDutyPeriodPending(at({ isLongTermRental: true }), TD)).toBe(false);
  });
});
