/**
 * UTC 달력 날짜 연산(`lib/tax-engine/utc-date.ts`)의 시간대 독립성 anchor + date-fns 재도입 차단
 *
 * 결함: 엔진·`lib/calc`·API가 UTC 자정 Date(`date-coerce.toDate`)에 date-fns **로컬 달력** 함수(`addYears`·`differenceInDays`·
 * `format`·`parseISO` 등)와 로컬 getter(`getFullYear()` 등)·로컬 자정 상수(`new Date("2025-01-01T00:00:00")`)를 써서,
 * 서버/브라우저 시간대가 UTC 서쪽(미주)이면 달력일이 하루 어긋나고(양도연도·시한·신고기한·윤년 2/29+N년), 서머타임 구간(서울 1987·88 등)이면
 * N년 만료일 당일이 모자라게 나왔다. 정답 = UTC 달력(아래 독립 기준 구현).
 *
 * ⚠️ 이 파일은 `process.env.TZ`를 바꾼다 → vitest `ISOLATION_PATTERN`에 걸려 node-isolated로 분류된다. 끝나면 원복한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as U from "@/lib/tax-engine/utc-date";
import { getOwnershipStart } from "@/lib/tax-engine/non-business-land/utils/period-math";
import { isWithinCarryoverPeriod } from "@/lib/tax-engine/data/carryover-scope-era";
import { getFilingDeadline } from "@/lib/calc/filing-deadline";
import { LTHD_CONVERSION_95_5_CUTOFF } from "@/lib/tax-engine/tax-utils";
import { PUBLIC_EXPROPRIATION_SUNSET } from "@/lib/tax-engine/public-expropriation-reduction";

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
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ── 독립 기준 구현 (달력 성분 산술 — 모듈 구현과 코드 공유 없음) ─────────────────────
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1~12
function refAddMonths(s: string, n: number): string {
  const [y, m, d] = s.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, dim(ny, nm))).padStart(2, "0")}`;
}
function refDayDiff(a: string, b: string): number {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}
function refYears(later: string, earlier: string): number {
  const [ly, lm, ld] = later.split("-").map(Number);
  const [ey, em, ed] = earlier.split("-").map(Number);
  const raw = ly - ey;
  return lm > em || (lm === em && ld >= ed) ? raw : raw - 1;
}

/** 격자 — 1987·88 서머타임, 윤년, 말일, 연초·연말 */
function dateGrid(): string[] {
  const out: string[] = [];
  for (const y of [1948, 1987, 1988, 1996, 2000, 2007, 2016, 2020, 2024, 2025]) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 15, 28, dim(y, m)]) out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return [...new Set(out)];
}

describe("UTC 달력 연산 — 골든", () => {
  for (const tz of TIMEZONES) {
    it(`[${tz}] 윤년 2/29 + 5년 = 2/28, 말일 + 개월은 말일로, 연말·연초 경계`, () => {
      process.env.TZ = tz;
      expect(iso(U.addYears(utc("2020-02-29"), 5))).toBe("2025-02-28");
      expect(iso(U.addMonths(utc("2018-11-30"), 3))).toBe("2019-02-28");
      expect(iso(U.addMonths(utc("2024-01-31"), 1))).toBe("2024-02-29");
      expect(iso(U.addDays(utc("2024-12-31"), 1))).toBe("2025-01-01");
      expect(iso(U.subYears(utc("2026-12-31"), 2))).toBe("2024-12-31");
      expect(iso(U.endOfMonth(utc("2024-12-02")))).toBe("2024-12-31");
      expect(U.format(utc("2025-01-01"), "yyyy-MM-dd")).toBe("2025-01-01");
      expect(U.format(utc("2025-01-01"), "yyyy.MM.dd")).toBe("2025.01.01");
      expect(iso(U.parseISO("2025-01-01"))).toBe("2025-01-01");
      expect(U.parseISO("2025-01-01").getTime()).toBe(Date.UTC(2025, 0, 1));
      expect(Number.isNaN(U.parseISO("2021-02-30").getTime())).toBe(true);
      expect(Number.isNaN(U.parseISO("2020-1-1").getTime())).toBe(true);
      // N년 만료일 당일 — 서머타임 구간 취득도 정확히 N년
      expect(U.differenceInYears(utc("1998-06-01"), utc("1988-06-01"))).toBe(10);
      expect(U.differenceInYears(utc("1998-05-31"), utc("1988-06-01"))).toBe(9);
      expect(U.differenceInYears(utc("1990-05-15"), utc("1987-05-15"))).toBe(3);
      expect(U.differenceInDays(utc("2025-03-01"), utc("2025-01-01"))).toBe(59);
      expect(U.differenceInCalendarDays(utc("2025-01-01"), utc("2024-12-31"))).toBe(1);
      expect(U.differenceInMonths(utc("2025-03-31"), utc("2025-01-31"))).toBe(2);
      expect(U.getDaysInYear(utc("2024-01-01"))).toBe(366);
      expect(U.getDaysInYear(utc("2025-01-01"))).toBe(365);
    });
  }
});

describe("UTC 달력 연산 — 독립 기준 구현과 전 시간대에서 일치", () => {
  const grid = dateGrid();
  for (const tz of TIMEZONES) {
    it(`[${tz}] 가감·차이 ${grid.length}일 격자`, () => {
      process.env.TZ = tz;
      const bad: string[] = [];
      for (const s of grid) {
        const d = utc(s);
        for (const n of [-25, -13, -12, -3, -1, 1, 2, 3, 6, 12, 24, 60, 120]) {
          if (iso(U.addMonths(d, n)) !== refAddMonths(s, n)) bad.push(`addMonths ${s} ${n}`);
        }
        for (const n of [-10, -5, -3, -2, -1, 1, 2, 3, 5, 8, 10, 20]) {
          if (iso(U.addYears(d, n)) !== refAddMonths(s, n * 12)) bad.push(`addYears ${s} ${n}`);
        }
        for (const n of [-366, -31, -1, 1, 30, 31, 365, 366]) {
          const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
          if (iso(U.addDays(d, n)) !== iso(r)) bad.push(`addDays ${s} ${n}`);
        }
        for (const t of grid) {
          const e = utc(t);
          if (U.differenceInCalendarDays(e, d) !== refDayDiff(t, s)) bad.push(`calDays ${t} ${s}`);
          if (U.differenceInDays(e, d) !== refDayDiff(t, s)) bad.push(`days ${t} ${s}`);
          if (t >= s && U.differenceInYears(e, d) !== refYears(t, s)) bad.push(`years ${t} ${s}`);
        }
        if (U.format(d, "yyyy-MM-dd") !== s) bad.push(`format ${s}`);
        if (iso(U.parseISO(s)) !== s) bad.push(`parseISO ${s}`);
      }
      expect(bad.slice(0, 10)).toEqual([]);
    });
  }
});

describe("엔진 함수 — 시간대와 무관하게 같은 값", () => {
  const snapshot = () => ({
    ownershipStart: iso(getOwnershipStart(utc("2024-12-31"))),
    carryoverEdge: isWithinCarryoverPeriod(utc("2024-01-01"), utc("2025-01-01"), "stock"),
    carryoverAfter: isWithinCarryoverPeriod(utc("2024-01-01"), utc("2025-01-02"), "stock"),
    filing: getFilingDeadline("2024-12-02"),
    filingBurdened: getFilingDeadline("2025-11-30", true),
    // 시한 상수는 UTC 자정이다 — 2025-01-01 당일 양도(UTC 자정)는 「이후」, 12-31은 「이전」
    cutoffOnDay: utc("2025-01-01").getTime() >= LTHD_CONVERSION_95_5_CUTOFF.getTime(),
    cutoffDayBefore: utc("2024-12-31").getTime() >= LTHD_CONVERSION_95_5_CUTOFF.getTime(),
    sunsetLastDay: utc("2026-12-31").getTime() <= PUBLIC_EXPROPRIATION_SUNSET.getTime(),
    sunsetNextDay: utc("2027-01-01").getTime() <= PUBLIC_EXPROPRIATION_SUNSET.getTime(),
  });
  const expected = {
    ownershipStart: "2025-01-01",
    carryoverEdge: true,
    carryoverAfter: false,
    filing: "2025-02-28",
    filingBurdened: "2026-02-28",
    cutoffOnDay: true,
    cutoffDayBefore: false,
    sunsetLastDay: true,
    sunsetNextDay: false,
  };
  for (const tz of TIMEZONES) {
    it(`[${tz}] 소유기간 시작·이월과세 기간(주식 1년)·신고기한·시한 상수`, () => {
      process.env.TZ = tz;
      expect(snapshot()).toEqual(expected);
    });
  }
});

// ── 재도입 차단 — 엔진·계산 변환·API 라우트에서 date-fns 로컬 달력 함수를 쓰지 않는다 ───────────────
describe("date-fns 로컬 달력 함수 재도입 차단", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const DIRS = ["lib/tax-engine", "lib/calc", "app/api/calc"];
  const ALLOWED_NAMES = new Set(["toDate"]); // 시간대와 무관(Date 복제)

  function walk(dir: string, out: string[]): void {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
  }

  it("date-fns import는 `toDate`만 허용 — 나머지는 `lib/tax-engine/utc-date`", () => {
    const files: string[] = [];
    for (const d of DIRS) walk(path.join(ROOT, d), files);
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"date-fns"/g)) {
        const bad = m[1].split(",").map((x) => x.trim()).filter(Boolean).filter((n) => !ALLOWED_NAMES.has(n.split(/\s+as\s+/)[0]));
        if (bad.length) offenders.push(`${path.relative(ROOT, f)}: ${bad.join(", ")}`);
      }
      if (/from\s*"date-fns\/|import\s+\*\s+as\s+\w+\s+from\s*"date-fns"/.test(src)) offenders.push(`${path.relative(ROOT, f)}: 네임스페이스/서브패스 import`);
    }
    expect(offenders).toEqual([]);
  });
});
