/**
 * §155① 일시적 2주택 기한·1년 요건 연혁(D14), 부칙 경과조치의 종전주택 보유 전 계약(D13),
 * §155⑦ 귀농주택 5년 단서 연혁(D15) — 연혁 leaf 단위 anchor.
 *
 * 판정 메뉴 시료(해석례 평가셋): D13 `E049-era` · D14 `E006-era`·`E017-era`(2002.3.30. 전 2년) · D15 `E151-era`·`E149-era`.
 * D14의 1년 요건은 판정 결과로 관측되지 않는다 — 신규 취득이 종전 취득 후 1년 안이고 처분기한 2년 안에 양도하면
 * 종전주택 보유가 당시 §154① 3년에 못 미친다(`E033-era-within1y`). 그래서 여기서 직접 고정한다.
 *
 * 근거(DRF eflaw·부칙 실독 2026-10-06): 제17555호(2002.3.30. 2년→1년) · 제21138호(2008.11.28. 1년→2년) ·
 * 제23887호(2012.6.29. 2년→3년 + 1년 요건) — 셋 다 공포일 시행 · 「시행 후 최초로 양도하는 분부터」.
 * 제26982호(2016.2.17.) 부칙 제10조·제22조 — 귀농주택 단서는 「시행 이후 귀농주택을 취득하는 분부터」.
 */
import { describe, it, expect } from "vitest";
import { resolveTemporaryTwoHouseDeadlineEra } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
import { judgeTemporaryTwoHouseTiming } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { qualifiesRuralHouse } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { collectEraUndetermined } from "@/lib/tax-engine/one-house/era-undetermined";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import { makeMockRates } from "../_helpers/mock-rates";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const era = (transfer: string, extra: Partial<Parameters<typeof resolveTemporaryTwoHouseDeadlineEra>[0]> = {}) =>
  resolveTemporaryTwoHouseDeadlineEra({
    bothRegulated: false,
    baseDeadlineYears: 3,
    newAcquisitionDate: d("2001-06-01"),
    transferDate: d(transfer),
    ...extra,
  });

describe("D14 처분기한 연혁 — 양도일 경계", () => {
  it("2002-03-29 양도 → 2년 / 2002-03-30 양도(신규 취득 그 후) → 1년", () => {
    // 경과조치 분기도 2년을 돌려주므로 「보류 신호 없음」까지 봐야 본래 구간(개정 전 2년)과 구별된다.
    expect(era("2002-03-29")).toEqual({ years: 2, moveInRequirementPending: false });
    expect(era("2002-03-30", { newAcquisitionDate: d("2002-04-01") }).years).toBe(1);
  });
  it("2002-03-30 전 신규 취득 · 그 후 양도 → 2년으로 계산 · 보류 신호는 부칙 ③ 1호 단서로 결론이 갈리는 양도일에만", () => {
    const flag = (transfer: string, acq: string) => era(transfer, { newAcquisitionDate: d(acq) }).transition2002Unverified;
    // 1호(취득~시행일 1년 이하): 2003-03-29 뒤 ~ 취득일부터 2년의 말일(2004-03-29) 안 → 단서에 달렸다
    expect(era("2003-06-01", { newAcquisitionDate: d("2002-03-29") })).toMatchObject({ years: 2, transition2002Unverified: true });
    expect(flag("2003-03-30", "2002-03-29")).toBe(true);
    expect(flag("2004-03-29", "2002-03-29")).toBe(true);
    // 1호지만 시행일부터 1년(가장 이른 독법) 안 → 어느 독법이든 충족 / 2년 기한 뒤 → 어느 독법이든 불충족
    expect(flag("2002-06-01", "2002-03-29")).toBeUndefined();
    expect(flag("2003-03-29", "2002-03-29")).toBeUndefined();
    expect(flag("2004-03-30", "2002-03-29")).toBeUndefined();
    // 1호 경계: 취득일부터 1년의 말일 = 시행일(2001-03-30 취득)은 1호 쪽 · 하루 앞(2001-03-29)은 2호 — 2년 말일이 2003-03-29라 1호 하한과 겹치지 않는다
    expect(flag("2003-03-30", "2001-03-30")).toBe(true);
    expect(flag("2003-03-29", "2001-03-29")).toBeUndefined();
    // 2호(1년 초과): 취득일부터 2년 — 엔진 기한과 같다
    expect(flag("2002-12-01", "2001-01-01")).toBeUndefined();
    // 시행 당시 2년이 이미 끝났다 → 부칙 ③ 밖 → 개정 1년(보류 신호 없음) · 2년 말일이 시행일이면 아직 안 끝났다(부칙 ③)
    expect(era("2002-06-01", { newAcquisitionDate: d("2000-01-01") })).toEqual({ years: 1, moveInRequirementPending: false });
    expect(era("2002-06-01", { newAcquisitionDate: d("2000-03-29") }).years).toBe(1); // 2년 말일 2002-03-29
    expect(era("2002-06-01", { newAcquisitionDate: d("2000-03-30") }).years).toBe(2); // 2년 말일 2002-03-30
    // 시행일 이후 취득은 경과조치 대상이 아니다
    expect(flag("2002-06-01", "2002-03-30")).toBeUndefined();
  });
  it("2008-11-27 → 1년 / 2008-11-28 → 2년 / 2012-06-28 → 2년 / 2012-06-29 → 본문(3년)", () => {
    const after = { newAcquisitionDate: d("2008-01-01") };
    expect(era("2008-11-27", after).years).toBe(1);
    expect(era("2008-11-28", after).years).toBe(2);
    expect(era("2012-06-28", after).years).toBe(2);
    expect(era("2012-06-29", after).years).toBe(3);
  });
  it("조정대상지역 여부와 무관하다(2012-06-29 전에는 조정 기한이 없었다)", () => {
    expect(era("2010-01-01", { bothRegulated: true, newAcquisitionDate: d("2009-06-01") }).years).toBe(2);
  });
});

describe("D14 요건 A(종전주택 취득 후 1년 경과 후 신규 취득) — 2012-06-29 전 양도분엔 없다", () => {
  const timing = (transfer: string) =>
    judgeTemporaryTwoHouseTiming({
      previousAcquisitionDate: d("2011-01-01"),
      newAcquisitionDate: d("2011-06-01"), // 종전 취득 후 5개월
      transferDate: d(transfer),
      deadlineYears: 2,
      oneYearWaived: false,
    });
  it("2012-06-28 양도 → 충족 / 2012-06-29 양도 → 불충족", () => {
    expect(timing("2012-06-28").oneYearMet).toBe(true);
    expect(timing("2012-06-29").oneYearMet).toBe(false);
  });
});

describe("D13 부칙 경과조치 — 종전주택 보유 전 계약은 기준이 아니다(재산세제과-512 Case 2)", () => {
  // E049: 분양권 계약 2017-09-15(종전주택 없음) · 종전주택 2018-12-15 · 신규 2020-02-15 · 조정→조정 · 양도 2022-04-15
  const e049 = (prev?: string) =>
    resolveTemporaryTwoHouseDeadlineEra({
      bothRegulated: true,
      baseDeadlineYears: 3,
      newAcquisitionDate: d("2020-02-15"),
      newContractDate: d("2017-09-15"),
      ...(prev ? { previousAcquisitionDate: d(prev) } : {}),
      transferDate: d("2022-04-15"),
    }).years;
  it("Case 2 — 기준일 = 종전주택 취득(2018-12-15) → 2년", () => {
    expect(e049("2018-12-15")).toBe(2);
  });
  it("Case 1 짝 — 계약 당시 종전주택 보유(2016-01-01) → 계약일 기준 종전 3년", () => {
    expect(e049("2016-01-01")).toBe(3);
  });
});

describe("D15 귀농주택 5년 단서 — 귀농주택 취득일 2016-02-17 이후분만", () => {
  const rural = (acq: string) =>
    qualifiesRuralHouse({
      householdHousingCount: 2,
      transferDate: d("2024-04-15"),
      ruralHouse: {
        kind: "return_to_farm",
        isOutsideCapitalEupMyeon: true,
        acquisitionDate: d(acq),
        isHighPriceAtAcquisition: false,
        landAreaSqm: 500,
        wholeHouseholdMoved: true,
      },
    });
  it("2016-02-16 취득 · 8년 후 양도 → 단서 없음(충족) / 2016-02-17 취득 → 5년 초과로 불충족", () => {
    expect(rural("2016-02-16")).toBe(true);
    expect(rural("2016-02-17")).toBe(false);
  });
});

describe("D14 부칙 ③ 판정 보류 — 판정 메뉴 고지 배선", () => {
  const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules as OneHouseSpecialRulesData;
  const ids = (transfer: string, acq: string) =>
    collectEraUndetermined(
      {
        propertyType: "housing",
        isOneHousehold: true,
        householdHousingCount: 2,
        transferDate: d(transfer),
        temporaryTwoHouse: { previousAcquisitionDate: d("1995-01-01"), newAcquisitionDate: d(acq) },
      } as unknown as OneHouseJudgeInput,
      rules,
      true,
    ).map((u) => u.id);
  const ID = "155-1-2002-transition-unverified";
  it("1호 단서 구간 양도만 고지 · 1호라도 시행일부터 1년 안이거나 2호면 고지 없음", () => {
    expect(ids("2003-06-01", "2002-03-29")).toContain(ID);
    expect(ids("2002-06-01", "2002-03-29")).not.toContain(ID);
    expect(ids("2002-12-01", "2001-01-01")).not.toContain(ID);
  });
});
