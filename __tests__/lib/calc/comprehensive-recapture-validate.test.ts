/**
 * 합산배제 추징 계산기 ⑧ validation + ⑧↔⑫ 격자 대조 + ④ 변환
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6.2 · §10.7(V-12)
 *
 * 격자 규칙 (같은 폼을 ⑧과 ④→⑫ Zod에 넣는다):
 *   R1. Zod가 거부하는 입력은 ⑧이 반드시 막는다(UI 통과 → API 400 모순 금지) — 그것도 UI 전용 규칙이 아니라 일반 규칙으로.
 *   R2. Zod가 통과시키는데 ⑧이 막는 입력은 UI 전용 코드(`deadline`·`order`·`unanswered`)뿐이다.
 */
import { describe, it, expect } from "vitest";
import { comprehensiveRecaptureInputSchema } from "@/lib/validators/comprehensive-recapture-input";
import { toRecaptureBody } from "@/lib/calc/comprehensive-recapture-api";
import {
  validateRecapture,
  UI_ONLY_ISSUE_CODES,
  type RecaptureIssue,
} from "@/lib/calc/comprehensive-recapture-validate";
import {
  INITIAL_RECAPTURE_FORM,
  RENT_5PCT_TYPES,
  switchReason,
  changeRegistrationType,
  changeApplicationKind,
  type RecaptureFormState,
} from "@/components/calc/comprehensive-recapture/shared";

const row = (taxYear: string, amount: string, id = `r-${taxYear}`) => ({ id, taxYear, amount });

/** 사유 「해당 없음」 정상 폼 — 2021년분 100만 · 고지 2024-12-01 */
const OK_OTHER: RecaptureFormState = {
  ...INITIAL_RECAPTURE_FORM,
  rows: [row("2021", "1000000")],
  noticeDate: "2024-12-01",
};
const OK_1HO: RecaptureFormState = {
  ...OK_OTHER,
  reason: "rent_over_5pct",
  registrationType: "private_purchase_long",
  rentalStartDate: "2015-03-01",
  rentalRegistrationDate: "2015-03-01",
  rentalApplicationDate: "2015-02-20",
  ceasedDate: "2025-03-01",
  noticeDate: "2025-12-01",
  rows: [row("2024", "500000")],
};
const OK_2HO: RecaptureFormState = { ...OK_OTHER, reason: "registration_cancelled", cancelClause: "6⑤" };
const OK_3HO: RecaptureFormState = {
  ...OK_OTHER,
  reason: "replacement_housing",
  cause: "redevelopment_reconstruction",
  originalKind: "other",
  completionDate: "2021-01-01",
  isApartment: "yes",
  registeredAsRental: "no",
  applicationKind: "none",
};

const codes = (f: RecaptureFormState) => validateRecapture(f).map((i) => i.code);
const fields = (f: RecaptureFormState) => validateRecapture(f).map((i) => i.field);

function zodOk(f: RecaptureFormState): boolean {
  // fetch 경유와 같게 JSON 왕복 — undefined 키는 사라지고 NaN은 null이 된다
  return comprehensiveRecaptureInputSchema.safeParse(JSON.parse(JSON.stringify(toRecaptureBody(f)))).success;
}

describe("⑧ validateRecapture — 정상 폼", () => {
  it.each([
    ["해당 없음", OK_OTHER],
    ["1호", OK_1HO],
    ["2호", OK_2HO],
    ["3호", OK_3HO],
  ])("%s: 차단 0건 · Zod 통과", (_n, f) => {
    expect(validateRecapture(f)).toEqual([]);
    expect(zodOk(f)).toBe(true);
  });
});

describe("⑧ 규칙 — 입력 공백·형식", () => {
  it("고지일 없음 · 행 0개 · 금액 빈칸 · 연도 빈칸 · 연도 중복을 차단한다", () => {
    expect(fields({ ...OK_OTHER, noticeDate: "" })).toContain("noticeDate");
    expect(fields({ ...OK_OTHER, rows: [] })).toContain("rows");
    expect(fields({ ...OK_OTHER, rows: [row("2021", "")] })).toContain("rows.0.amount");
    expect(fields({ ...OK_OTHER, rows: [row("", "100")] })).toContain("rows.0.taxYear");
    const dup = validateRecapture({ ...OK_OTHER, rows: [row("2021", "100", "a"), row("2021", "200", "b")] });
    expect(dup.map((i) => i.code)).toContain("duplicate");
  });

  it("금액 0은 허용한다(⑫와 같다)", () => {
    expect(validateRecapture({ ...OK_OTHER, rows: [row("2021", "0")] })).toEqual([]);
  });

  it("고지일 하한 2009-02-04 — 전날은 차단 · 당일은 통과", () => {
    expect(fields({ ...OK_OTHER, noticeDate: "2009-02-03", rows: [row("2009", "1")] })).toContain("noticeDate");
    expect(validateRecapture({ ...OK_OTHER, noticeDate: "2009-12-31", rows: [row("2009", "1")] })).toEqual([]);
    expect(codes({ ...OK_OTHER, noticeDate: "2009-02-04", rows: [row("2009", "1")] })).not.toContain("range");
  });

  it("연도 범위 2009~고지 연도", () => {
    expect(fields({ ...OK_OTHER, rows: [row("2008", "1")] })).toContain("rows.0.taxYear");
    expect(fields({ ...OK_OTHER, rows: [row("2025", "1")] })).toContain("rows.0.taxYear");
  });

  it("21행은 차단 · 20행은 통과", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => row(String(2009 + i), "1", `x${i}`));
    expect(fields({ ...OK_OTHER, noticeDate: "2030-12-01", rows: mk(21) })).toContain("rows");
    expect(validateRecapture({ ...OK_OTHER, noticeDate: "2030-12-01", rows: mk(20) })).toEqual([]);
  });

  it("존재하지 않는 날짜(2월 31일)는 차단한다", () => {
    expect(codes({ ...OK_OTHER, noticeDate: "2024-02-31" })).toContain("format");
  });
});

describe("⑧ 규칙 — 사유별 사실 칸", () => {
  it("1호: 유형·세 날짜 미입력 차단 · 신청일은 선택", () => {
    const blank = { ...OK_1HO, registrationType: "" as const, rentalStartDate: "", rentalRegistrationDate: "", ceasedDate: "" };
    expect(fields(blank)).toEqual(
      expect.arrayContaining(["exemption.registrationType", "exemption.rentalStartDate", "exemption.rentalRegistrationDate", "exemption.ceasedDate"]),
    );
    expect(validateRecapture({ ...OK_1HO, rentalApplicationDate: "" })).toEqual([]);
  });

  it("1호: §10③1호가 열거하지 않은 유형(기존임대주택 등)은 차단한다", () => {
    expect(fields({ ...OK_1HO, registrationType: "existing_rental" as never })).toContain("exemption.registrationType");
  });

  it("2호·3호: 미선택 차단", () => {
    expect(fields({ ...OK_2HO, cancelClause: "" })).toContain("exemption.cancelClause");
    expect(fields({ ...OK_3HO, cause: "", originalKind: "", isApartment: "", registeredAsRental: "", completionDate: "" })).toEqual(
      expect.arrayContaining([
        "exemption.cause",
        "exemption.originalKind",
        "exemption.newHousing.isApartment",
        "exemption.newHousing.registeredAsRental",
        "exemption.newHousing.completionDate",
      ]),
    );
  });

  it("3호 가목: 신청 사실 미선택은 unanswered · 신청 유형을 골랐으면 신청일 필수", () => {
    const f = { ...OK_3HO, applicationKind: "" as const };
    expect(codes(f)).toEqual(["unanswered"]);
    expect(fields({ ...OK_3HO, applicationKind: "short_term", applicationDate: "" })).toContain("exemption.newHousing.application.date");
    expect(validateRecapture({ ...OK_3HO, applicationKind: "short_term", applicationDate: "2020-08-01" })).toEqual([]);
  });
});

describe("⑧ 납부기한 규칙 — 엔진 `recaptureInterestStart` 단일 소스", () => {
  it("2018년분: 납부기한 12.17.(12.15. 토·12.16. 일) → 고지일 12.17.은 차단 · 12.18.은 통과", () => {
    const f = (d: string) => ({ ...OK_OTHER, noticeDate: d, rows: [row("2018", "1000000")] });
    expect(codes(f("2018-12-17"))).toEqual(["deadline"]);
    expect(validateRecapture(f("2018-12-18"))).toEqual([]);
    // 12.16. 고정이었다면 12.16.까지만 막고 12.17.을 통과시켰을 것이다
    expect(codes(f("2018-12-16"))).toEqual(["deadline"]);
  });

  it("2024년분: 12.15.(일) → 납부기한 12.16.(월) → 고지일 12.16.은 차단 · 12.17.은 통과", () => {
    const f = (d: string) => ({ ...OK_OTHER, noticeDate: d, rows: [row("2024", "1")] });
    expect(codes(f("2024-12-16"))).toEqual(["deadline"]);
    expect(validateRecapture(f("2024-12-17"))).toEqual([]);
  });

  it("2021년분: 12.15.(수) → 기산일 12.16. — 고지일 12.15.는 차단 · 12.16.은 통과", () => {
    const f = (d: string) => ({ ...OK_OTHER, noticeDate: d, rows: [row("2021", "1")] });
    expect(codes(f("2021-12-15"))).toEqual(["deadline"]);
    expect(validateRecapture(f("2021-12-16"))).toEqual([]);
  });

  it("이 규칙은 Zod가 통과시킨다 — UI 전용(`deadline`)이다", () => {
    const f = { ...OK_OTHER, noticeDate: "2021-12-15", rows: [row("2021", "1")] };
    expect(zodOk(f)).toBe(true);
    expect(UI_ONLY_ISSUE_CODES).toContain("deadline");
  });
});

describe("⑧ V-12 — 선후 모순만 막는다", () => {
  it("5% 초과 계약일이 임대 기산일보다 앞서면 order", () => {
    expect(codes({ ...OK_1HO, ceasedDate: "2015-02-28" })).toEqual(["order"]);
    expect(validateRecapture({ ...OK_1HO, ceasedDate: "2015-03-01" })).toEqual([]); // 같은 날은 통과
  });

  it("신청일이 등록일보다 뒤면 order(신청을 묻는 유형만) · 같은 날은 통과", () => {
    expect(codes({ ...OK_1HO, rentalApplicationDate: "2015-03-02" })).toEqual(["order"]);
    expect(validateRecapture({ ...OK_1HO, rentalApplicationDate: "2015-03-01" })).toEqual([]);
    // 신청일을 묻지 않는 유형이면 칸이 없으므로 그 값은 보지 않는다
    expect(validateRecapture({ ...OK_1HO, registrationType: "private_construction", rentalApplicationDate: "2015-03-02" })).toEqual([]);
  });

  it("막지 않는 것 — 임대 기산일이 등록일보다 앞섬 · 가목 신청일이 2020.8.18. 이후", () => {
    expect(validateRecapture({ ...OK_1HO, rentalStartDate: "2015-01-01", rentalRegistrationDate: "2015-03-01" })).toEqual([]);
    expect(validateRecapture({ ...OK_3HO, applicationKind: "short_term", applicationDate: "2020-08-20" })).toEqual([]);
    expect(validateRecapture({ ...OK_3HO, applicationKind: "long_general_apartment_purchase", applicationDate: "2020-07-10" })).toEqual([]);
  });
});

describe("① 사유 전환 — onChange에서 다른 호의 칸을 비운다", () => {
  it("1호 → 2호: 1호 칸이 모두 비고 공통 칸(행·고지일)은 남는다", () => {
    const next = switchReason(OK_1HO, "registration_cancelled");
    expect(next.reason).toBe("registration_cancelled");
    expect(next.registrationType).toBe("");
    expect(next.rentalStartDate).toBe("");
    expect(next.ceasedDate).toBe("");
    expect(next.rentalApplicationDate).toBe("");
    expect(next.rows).toEqual(OK_1HO.rows);
    expect(next.noticeDate).toBe(OK_1HO.noticeDate);
  });

  it("3호 → 해당 없음: 3호 칸이 비고 ④ body에 새지 않는다", () => {
    const next = switchReason(OK_3HO, "other");
    expect(next.cause).toBe("");
    expect(next.applicationKind).toBe("");
    expect(toRecaptureBody(next).exemption).toEqual({ reason: "other" });
  });

  it("같은 사유를 다시 고르면 입력을 보존한다", () => {
    expect(switchReason(OK_1HO, "rent_over_5pct")).toBe(OK_1HO);
  });

  it("유형 변경: 신청일을 묻지 않는 유형으로 바꾸면 신청일이 비고, 가목 신청 없음으로 바꾸면 신청일이 빈다", () => {
    expect(changeRegistrationType(OK_1HO, "private_construction").rentalApplicationDate).toBe("");
    expect(changeRegistrationType(OK_1HO, "public_support_purchase").rentalApplicationDate).toBe("2015-02-20");
    expect(changeApplicationKind({ ...OK_3HO, applicationKind: "short_term", applicationDate: "2020-08-01" }, "none").applicationDate).toBe("");
  });
});

describe("④ toRecaptureBody — 전사 변환", () => {
  it("빈 금액·연도는 0으로 보정하지 않고 생략한다", () => {
    const b = toRecaptureBody({ ...OK_OTHER, rows: [row("", ""), row("2021", "")] });
    expect(b.rows).toEqual([{ taxYear: undefined, amount: undefined }, { taxYear: 2021, amount: undefined }]);
  });

  it("1호: 신청일을 묻지 않는 유형은 신청일을 보내지 않는다", () => {
    const b = toRecaptureBody({ ...OK_1HO, registrationType: "private_construction", rentalApplicationDate: "2015-02-20" });
    expect((b.exemption as Record<string, unknown>).rentalApplicationDate).toBeUndefined();
  });

  it("3호 가목 신청 없음 → application: null · 미선택 → 생략", () => {
    expect((toRecaptureBody(OK_3HO).exemption as { newHousing: { application: unknown } }).newHousing.application).toBeNull();
    const body = toRecaptureBody({ ...OK_3HO, applicationKind: "" });
    expect((body.exemption as { newHousing: { application: unknown } }).newHousing.application).toBeUndefined();
  });
});

// ============================================================
// ⑧ ↔ ⑫ 격자 전수 대조
// ============================================================

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DATES = [
  "", "2024-02-31", "2024-2-3", "2025-13-01", "abc", "2009-02-03", "2009-02-04", "2015-03-01", "2018-12-17", "2018-12-18",
  "2019-02-11", "2020-07-10", "2020-07-11", "2020-08-20", "2021-12-15", "2021-12-16", "2024-12-15", "2024-12-16", "2024-12-17",
  "2025-03-01", "2025-12-01", "2026-11-01",
];
const YEARS = ["", "0", "2008", "2009", "2018", "2019", "2021", "2023", "2024", "2025", "2026", "20x", "99999999999"];
const AMOUNTS = ["", "0", "1", "1000000", "007", "9007199254740991", "9007199254740993", "12a", "-5"];
const TYPES: string[] = ["", ...RENT_5PCT_TYPES.map((t) => t.value), "existing_rental", "bogus"];

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

function randomForm(r: () => number): RecaptureFormState {
  const nRows = pick(r, [0, 1, 1, 1, 2, 2, 3, 20, 21]);
  return {
    reason: pick(r, ["other", "rent_over_5pct", "registration_cancelled", "replacement_housing"] as const),
    registrationType: pick(r, TYPES) as RecaptureFormState["registrationType"],
    rentalStartDate: pick(r, DATES),
    rentalApplicationDate: pick(r, DATES),
    rentalRegistrationDate: pick(r, DATES),
    ceasedDate: pick(r, DATES),
    cancelClause: pick(r, ["", "6①11호", "6⑤", "other"] as const),
    cause: pick(r, ["", "redevelopment_reconstruction", "small_scale_redevelopment", "remodeling"] as const),
    originalKind: pick(r, ["", "short_term", "other"] as const),
    completionDate: pick(r, DATES),
    isApartment: pick(r, ["", "yes", "no"] as const),
    registeredAsRental: pick(r, ["", "yes", "no"] as const),
    applicationKind: pick(r, ["", "none", "long_general_apartment_purchase", "short_term"] as const),
    applicationDate: pick(r, DATES),
    rows: Array.from({ length: nRows }, (_, i) => ({
      id: `g${i}`,
      // 20·21행 격자는 연도를 겹치지 않게 — 행 수 규칙만 따로 본다
      taxYear: nRows >= 20 ? String(2009 + i) : pick(r, YEARS),
      amount: pick(r, AMOUNTS),
    })),
    noticeDate: pick(r, DATES),
  };
}

function checkParity(f: RecaptureFormState): string | null {
  const issues: RecaptureIssue[] = validateRecapture(f);
  const zod = zodOk(f);
  if (!zod && issues.length === 0) return "R1: Zod는 거부하는데 ⑧이 통과";
  if (!zod && issues.every((i) => UI_ONLY_ISSUE_CODES.includes(i.code))) return "R1: Zod 거부를 UI 전용 규칙만 잡음";
  if (zod && issues.some((i) => !UI_ONLY_ISSUE_CODES.includes(i.code))) return "R2: Zod는 통과하는데 ⑧이 일반 규칙으로 차단";
  return null;
}

describe("⑧ ↔ ⑫ 격자 전수 대조", () => {
  it("사유 4 × 정상 기준 폼에서 필드 하나씩 풀 값을 바꾼 격자 — 전건 일치", () => {
    const bases = [OK_OTHER, OK_1HO, OK_2HO, OK_3HO];
    const pools: Record<string, readonly string[]> = {
      noticeDate: DATES,
      registrationType: TYPES,
      rentalStartDate: DATES,
      rentalApplicationDate: DATES,
      rentalRegistrationDate: DATES,
      ceasedDate: DATES,
      cancelClause: ["", "6①11호", "6⑤", "other", "x"],
      cause: ["", "redevelopment_reconstruction", "small_scale_redevelopment", "remodeling", "x"],
      originalKind: ["", "short_term", "other", "x"],
      completionDate: DATES,
      isApartment: ["", "yes", "no", "x"],
      registeredAsRental: ["", "yes", "no", "x"],
      applicationKind: ["", "none", "long_general_apartment_purchase", "short_term", "x"],
      applicationDate: DATES,
    };
    const bad: string[] = [];
    let n = 0;
    for (const base of bases) {
      for (const [key, pool] of Object.entries(pools)) {
        for (const v of pool) {
          const f = { ...base, [key]: v } as RecaptureFormState;
          n++;
          const msg = checkParity(f);
          if (msg) bad.push(`${msg} — ${base.reason}.${key}=${JSON.stringify(v)}`);
        }
      }
      for (const y of YEARS) for (const a of AMOUNTS) {
        n++;
        const msg = checkParity({ ...base, rows: [{ id: "q", taxYear: y, amount: a }] });
        if (msg) bad.push(`${msg} — ${base.reason} year=${y} amount=${a}`);
      }
    }
    expect(n).toBeGreaterThan(500);
    expect(bad).toEqual([]);
  });

  it("무작위 조합 6,000건(고정 시드) — 전건 일치", () => {
    const r = mulberry32(20261117);
    const bad: string[] = [];
    const tally = { zodOk: 0, zodNg: 0, uiOnly: 0 };
    for (let i = 0; i < 6000; i++) {
      const f = randomForm(r);
      const msg = checkParity(f);
      if (zodOk(f)) {
        tally.zodOk++;
        if (validateRecapture(f).length > 0) tally.uiOnly++;
      } else tally.zodNg++;
      if (msg && bad.length < 10) bad.push(`${msg} — ${JSON.stringify(f)}`);
    }
    expect(bad).toEqual([]);
    // 격자가 양쪽을 실제로 밟는지 — Zod 통과·거부가 모두 충분하다
    expect(tally.zodOk).toBeGreaterThan(100);
    expect(tally.zodNg).toBeGreaterThan(1000);
  });

  it("행 수 격자 0·1·20·21 × 사유 — 전건 일치", () => {
    const bad: string[] = [];
    for (const base of [OK_OTHER, OK_1HO, OK_2HO, OK_3HO]) {
      for (const n of [0, 1, 20, 21]) {
        const f = { ...base, noticeDate: "2030-12-01", rows: Array.from({ length: n }, (_, i) => row(String(2009 + (i % 21)), "1", `k${i}`)) };
        const msg = checkParity(f);
        if (msg) bad.push(`${msg} — ${base.reason} rows=${n}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
