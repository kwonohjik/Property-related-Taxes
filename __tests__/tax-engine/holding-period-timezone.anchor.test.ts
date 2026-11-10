/**
 * 보유기간 계산의 시간대 독립성 anchor — `calculateHoldingPeriod`
 *
 * 결함: 연·일 성분을 date-fns 로컬 시간대 함수(`differenceInYears`·`addYears`·`addDays`·`differenceInDays`)로,
 * 개월 성분만 UTC 달력(`completedMonthsInclusive`)으로 구해, 서머타임이 걸린 구간의 N년 만료일 당일이
 * 시간대에 따라 1년 모자라게(서울 1987·1988년 5~10월 서머타임 취득분) 또는 1년 많게(미주) 나왔다.
 * API·화면의 날짜는 UTC 자정 Date(`date-coerce.toDate`)라서 서버/브라우저 시간대마다 장기보유공제 연수가 달랐다.
 *
 * 정답 = UTC 달력 `floor(completedMonthsInclusive / 12)` (§95④ 초일 산입 + 민법 §160).
 *
 * ⚠️ 이 파일은 `process.env.TZ`를 바꾼다 → vitest `ISOLATION_PATTERN`(`process.env.X = …`)에 걸려 node-isolated로
 *    분류된다. 끝나면 원복한다.
 */
import { afterAll, describe, expect, it } from "vitest";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { completedMonthsInclusive } from "@/lib/tax-engine/civil-period";

const TIMEZONES = [
  "UTC",
  "Asia/Seoul",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

const ORIGINAL_TZ = process.env.TZ;

function setTz(tz: string): void {
  process.env.TZ = tz;
}

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** UTC 자정 Date — API 경유 날짜(`toDate("YYYY-MM-DD")`)와 같다 */
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 취득일 격자(1987·1988 서머타임 포함) × N년 만료일 · 그 전날 */
function buildCases(): Array<{ acq: string; disposal: string }> {
  const out: Array<{ acq: string; disposal: string }> = [];
  const years = [1987, 1988, 1995, 2005, 2007, 2010, 2015, 2018, 2020];
  for (const y of years) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 15, 28]) {
        const acq = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        for (const hold of [3, 5, 10, 15]) {
          out.push({ acq, disposal: iso(new Date(Date.UTC(y + hold, m - 1, d - 1))) }); // N년 만료일(응당일 전날)
          out.push({ acq, disposal: iso(new Date(Date.UTC(y + hold, m - 1, d - 2))) }); // 그 전날(N년 미달)
        }
      }
    }
  }
  return out;
}

const GRID = buildCases();

describe("시간대 가드 — process.env.TZ 변경이 Date에 실제 반영된다", () => {
  it("Asia/Seoul 1987-06-01은 서머타임(UTC+10), UTC는 오프셋 0", () => {
    setTz("Asia/Seoul");
    expect(new Date(Date.UTC(1987, 5, 1)).getTimezoneOffset()).toBe(-600);
    setTz("UTC");
    expect(new Date(Date.UTC(1987, 5, 1)).getTimezoneOffset()).toBe(0);
  });
});

describe("calculateHoldingPeriod — 알려진 사례(손계산) 모든 시간대 동일", () => {
  // [취득, 양도, 기대 {years, months, days}]
  const CASES: Array<[string, string, { years: number; months: number; days: number }]> = [
    // 서울 서머타임(1987.5.10~10.11) 취득 — 3년 만료일(응당일 전날) 당일 = 3년 (초일 산입 §95④)
    ["1987-05-15", "1990-05-14", { years: 3, months: 0, days: 0 }],
    // 하루 전: 2년 11개월 + 4/15~5/13 = 15 + 13 = 29일
    ["1987-05-15", "1990-05-13", { years: 2, months: 11, days: 29 }],
    // 1988-06-01 취득 → 10년 만료일 1998-05-31
    ["1988-06-01", "1998-05-31", { years: 10, months: 0, days: 0 }],
    ["1988-06-01", "1998-05-30", { years: 9, months: 11, days: 30 }],
    // 5년 · 15년 만료일
    ["1987-05-15", "1992-05-14", { years: 5, months: 0, days: 0 }],
    ["1987-05-15", "2002-05-14", { years: 15, months: 0, days: 0 }],
    // 윤년 2/29 취득 — 평년 응당일 없음: 5년 만료는 2001-02-28 (민법 §160③). 일 성분 값은 종전과 동일하게 유지.
    ["1996-02-29", "2001-02-28", { years: 5, months: 0, days: 1 }],
    ["1996-02-29", "2001-02-27", { years: 4, months: 11, days: 30 }],
    // 같은 날 양도 = 1일(초일 산입) · 월말 취득
    ["2020-03-10", "2020-03-10", { years: 0, months: 0, days: 1 }],
    ["2020-01-31", "2020-02-29", { years: 0, months: 1, days: 1 }],
    // 역전 구간은 0
    ["2020-03-10", "2020-03-09", { years: 0, months: 0, days: 0 }],
  ];

  for (const tz of TIMEZONES) {
    it(`TZ=${tz}`, () => {
      setTz(tz);
      for (const [acq, disposal, expected] of CASES) {
        expect(calculateHoldingPeriod(utc(acq), utc(disposal)), `${acq} → ${disposal}`).toEqual(expected);
      }
    });
  }
});

describe("calculateHoldingPeriod — 전수 비교: 정답 = UTC 달력 floor(완성개월/12)", () => {
  it("격자 규모 확인 (288 취득일 × 4 × 2 = 2,592건)", () => {
    expect(GRID.length).toBe(2592);
  });

  for (const tz of TIMEZONES) {
    it(`TZ=${tz} — 불일치 0건 (연·월 성분)`, () => {
      setTz(tz);
      const mismatches: string[] = [];
      for (const { acq, disposal } of GRID) {
        const total = completedMonthsInclusive(utc(acq), utc(disposal));
        const expectYears = Math.floor(total / 12);
        const expectMonths = total - expectYears * 12;
        const got = calculateHoldingPeriod(utc(acq), utc(disposal));
        if (got.years !== expectYears || got.months !== expectMonths) {
          mismatches.push(`${acq}→${disposal}: 기대 ${expectYears}y${expectMonths}m, 실제 ${got.years}y${got.months}m`);
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
      expect(mismatches.length).toBe(0);
    });
  }
});

describe("calculateHoldingPeriod — 모든 시간대가 UTC와 같은 값 (매일 취득 × 월 응당일 ±1일, 서머타임 연도)", () => {
  // 1987·1988(서울 서머타임) · 1995·2010(뉴질랜드 등)·2020 취득의 모든 날 × 3·5·10·15년 만료일 ±1일
  function wideCases(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const y of [1987, 1988, 1995, 2010, 2020]) {
      for (let t = Date.UTC(y, 0, 1); t <= Date.UTC(y, 11, 31); t += 86_400_000) {
        const a = new Date(t);
        for (const hold of [3, 5, 10, 15]) {
          for (const off of [-1, 0, 1]) {
            const dis = new Date(Date.UTC(a.getUTCFullYear() + hold, a.getUTCMonth(), a.getUTCDate() - 1 + off));
            out.push([iso(a), iso(dis)]);
          }
        }
      }
    }
    return out;
  }

  it("UTC 결과를 기준으로 6개 시간대가 동일 (연·월·일 전 성분)", () => {
    const cases = wideCases();
    setTz("UTC");
    const base = cases.map(([a, d]) => calculateHoldingPeriod(utc(a), utc(d)));
    for (const tz of TIMEZONES.filter((z) => z !== "UTC")) {
      setTz(tz);
      const diffs: string[] = [];
      cases.forEach(([a, d], i) => {
        const got = calculateHoldingPeriod(utc(a), utc(d));
        const b = base[i];
        if (got.years !== b.years || got.months !== b.months || got.days !== b.days) {
          diffs.push(`${tz} ${a}→${d}: UTC ${JSON.stringify(b)} / 실제 ${JSON.stringify(got)}`);
        }
      });
      expect(diffs.slice(0, 5), tz).toEqual([]);
    }
  });
});

describe("calculateHoldingPeriod — 입력 정규화 (종전 동작 유지)", () => {
  it("Invalid Date / undefined → NaN 성분을 내되 던지지 않는다", () => {
    for (const bad of [new Date("invalid"), undefined as unknown as Date]) {
      const r = calculateHoldingPeriod(bad, utc("2020-01-01"));
      expect(Number.isNaN(r.years)).toBe(true);
      expect(Number.isNaN(r.months)).toBe(true);
      expect(Number.isNaN(r.days)).toBe(true);
      const r2 = calculateHoldingPeriod(utc("2020-01-01"), bad);
      expect(Number.isNaN(r2.years)).toBe(true);
    }
  });

  it("날짜 문자열(ISO)도 받는다 — toDate 정규화", () => {
    setTz("Asia/Seoul");
    expect(calculateHoldingPeriod("1987-05-15T00:00:00.000Z" as unknown as Date, "1990-05-14T00:00:00.000Z" as unknown as Date)).toEqual({
      years: 3,
      months: 0,
      days: 0,
    });
  });
});
