/**
 * anchor: POST /api/calc/comprehensive-recapture — 정상 1건 · §10③ 배제 1건 · Zod 400 3건(중복 연도·하한 고지일·21행)
 * 엔진 판정은 __tests__/tax-engine/comprehensive/comprehensive-recapture.anchor.test.ts.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §5.5
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/comprehensive-recapture/route";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";

type Json = { data?: any; error?: { code: string; details: unknown } }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/comprehensive-recapture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}

describe("POST /api/calc/comprehensive-recapture", () => {
  it("정상: 2018·2021년분 · 고지 2024-12-01 — 이월 기산일 2018-12-18 · 구간 3개 · 이자 516,170 + 239,870", async () => {
    // 2018년분 100만 = 56일×30 + 1,099일×25 + 1,021일×22 = 16,800 + 274,750 + 224,620 = 516,170 (기산일 12.18. — 12.15.(토)·12.16.(일))
    // 2021년분 100만 = 61일×25 + 1,021일×22 = 15,250 + 224,620 = 239,870
    const { status, json } = await post({
      noticeDate: "2024-12-01",
      rows: [
        { taxYear: 2018, amount: 1_000_000 },
        { taxYear: 2021, amount: 1_000_000 },
      ],
      exemption: { reason: "other" },
    });
    expect(status).toBe(200);
    const r = json.data;
    expect(r.exempt).toBe(false);
    expect(r.totalRecoveryTax).toBe(2_000_000);
    expect(r.interestAmount).toBe(756_040);
    expect(r.totalPayable).toBe(2_756_040);
    expect(r.annualInterest[0]).toMatchObject({ taxYear: 2018, paymentDeadline: "2018-12-17", interestFrom: "2018-12-18", days: 2176, interest: 516_170 });
    expect(r.annualInterest[0].segments.map((g: { days: number; ratePer100k: number }) => [g.days, g.ratePer100k])).toEqual([[56, 30], [1099, 25], [1021, 22]]);
    expect(r.notices.some((n: string) => n.includes("기산일"))).toBe(false);
  });

  it("§10③ 배제: 3호 나목(아파트 · 미등록 · 준공 2021-01-01) → 추징하지 않음 · 금액 0 · 근거 echo — 날짜 문자열이 엔진에 Date로 도달한다", async () => {
    const { status, json } = await post({
      noticeDate: "2026-11-01",
      rows: [{ taxYear: 2023, amount: 1_000_000 }],
      exemption: {
        reason: "replacement_housing",
        cause: "redevelopment_reconstruction",
        originalKind: "other",
        newHousing: { completionDate: "2021-01-01", isApartment: true, registeredAsRental: false, application: null },
      },
    });
    expect(status).toBe(200);
    expect(json.data).toMatchObject({ exempt: true, totalPayable: 0, annualInterest: [] });
    expect(json.data.exemption).toMatchObject({ clause: "10③3호 나목", legalBasis: COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_REPLACEMENT_HOUSING });
  });

  it("§10③1호 경계가 Date 비교로 동작한다(문자열 비교 silent false 회귀 방지): 기산 2015-03-01 · 10년 · 위반 2025-03-01 배제 / 2025-02-28 추징", async () => {
    const body = (ceasedDate: string) => ({
      noticeDate: "2026-11-01",
      rows: [{ taxYear: 2023, amount: 1_000_000 }],
      exemption: {
        reason: "rent_over_5pct",
        registrationType: "private_purchase_long",
        rentalStartDate: "2015-03-01",
        rentalApplicationDate: "2020-08-20",
        rentalRegistrationDate: "2020-09-01",
        ceasedDate,
      },
    });
    expect((await post(body("2025-03-01"))).json.data.exempt).toBe(true);
    expect((await post(body("2025-02-28"))).json.data.exempt).toBe(false);
  });

  const base = { noticeDate: "2024-12-01", rows: [{ taxYear: 2021, amount: 1 }], exemption: { reason: "other" } };

  it("400: 연도 중복", async () => {
    const { status, json } = await post({ ...base, rows: [{ taxYear: 2021, amount: 1 }, { taxYear: 2021, amount: 2 }] });
    expect(status).toBe(400);
    expect(json.error?.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(json.error?.details)).toContain("중복");
  });

  it("400: 고지일이 2009-02-04 전(2009-02-03) — 2009-02-04는 통과", async () => {
    const low = await post({ ...base, noticeDate: "2009-02-03", rows: [{ taxYear: 2009, amount: 1 }] });
    expect(low.status).toBe(400);
    expect(JSON.stringify(low.json.error?.details)).toContain("2009-02-04");
    expect((await post({ ...base, noticeDate: "2009-02-04", rows: [{ taxYear: 2009, amount: 1 }] })).status).toBe(200);
  });

  it("400: 21행(상한 20행) — 20행은 통과", async () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ taxYear: 2009 + i, amount: 1 }));
    expect((await post({ ...base, noticeDate: "2030-12-01", rows: rows(21) })).status).toBe(400);
    expect((await post({ ...base, noticeDate: "2030-12-01", rows: rows(20) })).status).toBe(200);
  });

  it("400: 연도 범위(고지 연도 초과) · 음수·비정수 금액 · 존재하지 않는 날짜", async () => {
    expect((await post({ ...base, rows: [{ taxYear: 2025, amount: 1 }] })).status).toBe(400);
    expect((await post({ ...base, rows: [{ taxYear: 2021, amount: -1 }] })).status).toBe(400);
    expect((await post({ ...base, rows: [{ taxYear: 2021, amount: 1.5 }] })).status).toBe(400);
    expect((await post({ ...base, noticeDate: "2024-02-31" })).status).toBe(400);
  });
});
