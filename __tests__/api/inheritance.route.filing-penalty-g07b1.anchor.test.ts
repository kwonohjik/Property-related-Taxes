/**
 * anchor: 🔴 G-07 B1 — 상속 `filingPenalty`가 **⑫ Zod + ⑭ route 매핑을 통과해** 엔진에 닿는다
 *
 * ## 왜 route 를 태우는가
 *
 * 상속 route 는 `parsedData` 를 spread 하지 않고 **키를 하나씩 명시 매핑**한다
 * (`app/api/calc/inheritance/route.ts` ⑭). 그래서 실패 경로가 **둘**이다:
 *
 * 1. ⑫ Zod 스키마에 키가 없으면 → **조용히 strip**(TypeScript 미감지)
 * 2. ⑫는 통과해도 ⑭ 매핑에 줄이 없으면 → **엔진에 닿지 않음**(역시 TypeScript 미감지)
 *
 * 실제로 이 작업에서 ⑭ 누락이 있었다. 엔진 leaf 테스트는 두 경로를 모두 못 잡는다.
 *
 * ## ④ 층도 함께 본다
 *
 * 상속 폼은 `filingStatus` 단일 필드가 아니라 **`isFiledOnTime`+`isUnfiled` 두 불린**이다
 * (§21① 단서 일괄공제 축이 이미 그 조합에 걸려 있다). 그 파생과 stale 누출 차단을 단언한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/inheritance/route";
import { buildFilingPenaltyInput } from "@/lib/calc/inheritance-gift-filing-penalty-input";
import { resolveInheritanceFilingStatus } from "@/components/calc/inheritance/shared";
import { EXAMPLE_INPUT } from "../tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";

beforeEach(() => vi.clearAllMocks());

interface Res {
  finalTax: number;
  underreportPenalty?: number;
  totalPayableWithPenalty?: number;
  filingPenaltyDetail?: { penaltyBase: number; penaltyRate: number; reductionRate: number };
}

const BASE = { ...EXAMPLE_INPUT } as unknown as Record<string, unknown>;

async function post(body: object): Promise<Res> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/inheritance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { result?: Res; error?: unknown; details?: unknown };
  expect(res.status, JSON.stringify(json.error ?? json.details)).toBe(200);
  return json.result!;
}

const credit = (onTime: boolean) => ({ ...EXAMPLE_INPUT.creditInput, isFiledOnTime: onTime });

describe("G-07 B1 ⑫⑭ — filingPenalty 가 Zod strip·⑭ 누락 없이 엔진에 닿는다", () => {
  it("R-I-0: 대조군 — 키가 없으면 가산세 0", async () => {
    const r = await post({ ...BASE, creditInput: credit(true) });
    expect(r.underreportPenalty ?? 0).toBe(0);
    expect(r.filingPenaltyDetail).toBeUndefined();
  });

  it("R-I-1: 🔴 무신고 → 213,146,439 (⑫에서 지우거나 ⑭에서 빼면 0이 되어 RED)", async () => {
    const r = await post({
      ...BASE,
      creditInput: credit(false),
      filingPenalty: { filingStatus: "none" },
    });
    expect(r.finalTax).toBe(1_065_732_198);
    expect(r.underreportPenalty).toBe(213_146_439);
    expect(r.totalPayableWithPenalty).toBe(1_278_878_637);
  });

  it("R-I-2: 🔴 기한후신고 감면(§48②2호)이 route 를 통과한다 — 1개월 이내 50%", async () => {
    const r = await post({
      ...BASE,
      creditInput: credit(false),
      filingPenalty: {
        filingStatus: "late",
        statutoryDeadline: "2023-09-30",
        actualFilingDate: "2023-10-20",
      },
    });
    expect(r.filingPenaltyDetail!.reductionRate).toBe(0.5);
    expect(r.underreportPenalty).toBe(106_573_220);
  });

  it("R-I-3: 🔴 과소신고 base 가 route 를 통과한다 — 당초 신고세액이 실제로 빠진다", async () => {
    const r = await post({
      ...BASE,
      creditInput: credit(true),
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 100_000_000,
      },
    });
    expect(r.filingPenaltyDetail!.penaltyBase).toBe(933_760_232);
    expect(r.underreportPenalty).toBe(93_376_023);
  });

  it("R-I-4: 🔴 §47의3④1호 적용제외가 route 를 통과한다 — 다목", async () => {
    const r = await post({
      ...BASE,
      creditInput: credit(true),
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 100_000_000,
        underReportExclusion: "supplementary_valuation",
      },
    });
    expect(r.underreportPenalty).toBe(0);
  });

  it("R-I-5: ⛔ 잘못된 enum 은 400 으로 거부된다 (스키마가 실제로 검사한다)", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/inheritance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BASE,
          creditInput: credit(true),
          filingPenalty: { filingStatus: "정기신고" },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ④ 변환 — 두 불린에서 3-state 를 파생하고, 대상 밖 값을 흘리지 않는다
// ────────────────────────────────────────────────────────────────────────────

const FIELDS = {
  // 🔴 B2 신설 — 부정행위 축은 기본 일반(`normal`)이라 B1 수치가 그대로 유지된다.
  penaltyReason: "normal" as const,
  fraudulentPortion: "",
  corporateAdjustmentByFraud: false,
  lateFilingDate: "",
  priorAssessmentNotified: false,
  isUnderReported: false,
  originalFiledTax: "",
  underReportExclusion: "" as const,
};

describe("G-07 B1 ④ — isFiledOnTime + isUnfiled → 3-state", () => {
  it.each([
    [{ isFiledOnTime: true, isUnfiled: false }, "on_time"],
    [{ isFiledOnTime: false, isUnfiled: false }, "late"],
    [{ isFiledOnTime: false, isUnfiled: true }, "none"],
    // 🔑 isUnfiled 가 우선한다 — §21① 단서(일괄공제 5억 고정)가 걸린 축이다
    [{ isFiledOnTime: true, isUnfiled: true }, "none"],
  ])("B4-I-1: %o → %s", (flags, expected) => {
    expect(resolveInheritanceFilingStatus(flags as never)).toBe(expected);
  });

  it("B4-I-2: 정기신고 + 과소신고 아님 → **키 자체를 넣지 않는다** (종전 payload 보존)", () => {
    expect(buildFilingPenaltyInput("on_time", FIELDS, "2023-09-30")).toEqual({});
  });

  it("B4-I-3: 기한후신고 → §67① 법정신고기한이 실린다", () => {
    expect(
      buildFilingPenaltyInput(
        "late",
        { ...FIELDS, lateFilingDate: "2023-10-20" },
        "2023-09-30",
      ),
    ).toEqual({
      filingPenalty: {
        filingStatus: "late",
        statutoryDeadline: "2023-09-30",
        actualFilingDate: "2023-10-20",
      },
    });
  });

  it("B4-I-4: 🔴 stale 누출 차단 — 무신고로 바꾸면 앞서 입력한 값이 실리지 않는다", () => {
    expect(
      buildFilingPenaltyInput(
        "none",
        {
          ...FIELDS,
          lateFilingDate: "2023-10-20",
          priorAssessmentNotified: true,
          isUnderReported: true,
          originalFiledTax: "100000000",
          underReportExclusion: "deduction_error",
          // 🔴 B2 신설 축도 함께 막히는지 본다 — 무신고에는 가목·나목 분해가 없고
          //    라목 단서는 라목을 골랐을 때만 의미가 있다.
          fraudulentPortion: "30000000",
          corporateAdjustmentByFraud: true,
        },
        "2023-09-30",
      ),
    ).toEqual({ filingPenalty: { filingStatus: "none" } });
  });

  it("B4-I-5: 🔴 정기신고로 바꾸면 기한후신고 축이 실리지 않는다", () => {
    expect(
      buildFilingPenaltyInput(
        "on_time",
        {
          ...FIELDS,
          lateFilingDate: "2023-10-20",
          priorAssessmentNotified: true,
          isUnderReported: true,
          originalFiledTax: "100000000",
          underReportExclusion: "",
        },
        "2023-09-30",
      ),
    ).toEqual({
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 100_000_000,
      },
    });
  });

  it("B4-I-6: 🔑 「미입력」과 「0원 신고」를 구분한다 — 빈 칸은 키를 넣지 않는다", () => {
    const blank = buildFilingPenaltyInput(
      "on_time",
      { ...FIELDS, isUnderReported: true, originalFiledTax: "" },
      "2023-09-30",
    );
    const zero = buildFilingPenaltyInput(
      "on_time",
      { ...FIELDS, isUnderReported: true, originalFiledTax: "0" },
      "2023-09-30",
    );
    // 빈 칸이면 키가 없다 → ⑧이 「미입력」으로 차단할 수 있다
    expect(blank.filingPenalty!.originalFiledTax).toBeUndefined();
    // 0을 직접 입력했으면 유효한 값이다
    expect(zero.filingPenalty!.originalFiledTax).toBe(0);
  });
});
