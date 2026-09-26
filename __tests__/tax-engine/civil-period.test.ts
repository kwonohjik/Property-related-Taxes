/**
 * 요건 기간 leaf — 민법 §157(초일불산입)·§160②③ 경계 (계획서 one-house-exemption-fix §1 유형 A·B·D).
 *
 * 기대값은 조문 산식으로 손으로 셌다: 사건일 E → 기산일 E+1 → N년 만료 = 기산일 응당일의 전날,
 * 만료 달에 응당일이 없으면 그 달 말일. 거주(D)는 전입일이 기산일이다(서면4팀-82).
 */
import { describe, it, expect } from "vitest";
import {
  completedMonthsInclusive,
  firstDayAfterPeriod,
  isAfterPeriod,
  isWithinPeriod,
  periodEndFrom,
} from "@/lib/tax-engine/civil-period";

const D = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("유형 A — 「~한 날부터 N년 이상이 지난 후」", () => {
  it.each([
    // 조심2019서1704: 종전 2015-03-31 → 2016-03-31 취득은 「1년이 지나지 않은」 날
    ["2015-03-31", "2016-03-31", false],
    ["2015-03-31", "2016-04-01", true],
    // 조심2020서1405: 2016-09-29 → 2017-09-29 역시 미경과
    ["2016-09-29", "2017-09-29", false],
    // 2/29 사건: 기산 03-01 → 1년 만료 2021-02-28(응당일 03-01의 전날)
    ["2020-02-29", "2021-02-28", false],
    ["2020-02-29", "2021-03-01", true],
    // 평년 2/28 사건: 기산 03-01 → 만료 2020-02-29(윤년)
    ["2019-02-28", "2020-02-29", false],
    ["2019-02-28", "2020-03-01", true],
  ])("%s 사건 → %s 는 1년 경과 %s", (event, target, expected) => {
    expect(isAfterPeriod(D(event), 1, D(target))).toBe(expected);
  });

  it("최초 충족일 = 만료일 다음날", () => {
    expect(iso(firstDayAfterPeriod(D("2015-03-31"), 1))).toBe("2016-04-01");
    expect(iso(firstDayAfterPeriod(D("2020-02-29"), 1))).toBe("2021-03-01");
    expect(iso(firstDayAfterPeriod(D("2019-02-28"), 1))).toBe("2020-03-01");
  });
});

describe("유형 B — 「~한 날부터 N년 이내」", () => {
  it.each([
    ["2019-02-28", 1, "2020-02-29"], // 윤년 만료 — addYears(2020-02-28)보다 하루 길다
    ["2021-02-28", 3, "2024-02-29"],
    ["2020-02-29", 3, "2023-02-28"], // §160③ 말일
    ["2016-03-31", 3, "2019-03-31"],
    ["2014-02-28", 10, "2024-02-29"],
  ])("%s + %i년 만료 = %s", (event, years, end) => {
    expect(iso(periodEndFrom(D(event), years))).toBe(end);
  });

  it("만료일 당일은 이내, 다음날은 초과", () => {
    expect(isWithinPeriod(D("2021-02-28"), 3, D("2024-02-29"))).toBe(true);
    expect(isWithinPeriod(D("2021-02-28"), 3, D("2024-03-01"))).toBe(false);
    expect(isWithinPeriod(D("2020-02-29"), 3, D("2023-02-28"))).toBe(true);
    expect(isWithinPeriod(D("2020-02-29"), 3, D("2023-03-01"))).toBe(false);
  });
});

describe("유형 D — 거주기간 개월(전입일~전출일, 초일 산입)", () => {
  it.each([
    ["2020-03-10", "2022-03-09", 24], // 응당일 전날 전출 = 2년
    ["2020-03-10", "2022-03-08", 23],
    ["2020-02-29", "2022-02-28", 24], // §160③
    ["2020-02-29", "2021-02-28", 12],
    ["2001-11-09", "2003-11-08", 24], // 서면4팀-82 사실관계
    ["2020-01-31", "2020-02-29", 1], // §160③ — 2월에 31일이 없어 말일 만료
    ["2020-01-31", "2020-02-28", 0],
    ["2020-03-01", "2020-03-31", 1],
    ["2020-03-01", "2020-03-30", 0],
    ["2022-03-09", "2020-03-10", 0], // 역전 구간
  ])("%s ~ %s = %i개월", (start, end, months) => {
    expect(completedMonthsInclusive(D(start), D(end))).toBe(months);
  });
});
