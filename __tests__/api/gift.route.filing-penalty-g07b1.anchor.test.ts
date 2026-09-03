/**
 * anchor: 🔴 G-07 B1 — `filingPenalty`가 **⑫ Zod 를 통과해 엔진에 닿는다** (route 관통)
 *
 * ## 왜 route 를 태우는가
 *
 * 부동산 G-14가 정확히 이 층의 테스트 부재였다 — `fraudulentPortion`이 ⑫ 스키마에서 사라져도
 * 1,172파일 11,293테스트가 전건 통과했다. Zod 는 **알 수 없는 키를 조용히 strip** 하므로
 * 엔진 leaf 테스트로는 절대 잡히지 않는다(TypeScript 도 미감지).
 *
 * ⇒ payload → Zod → route → 엔진을 **관통**해 세액을 단언한다.
 *
 * ## ④ 층도 함께 본다
 *
 * 폼의 3-state(`filingStatus`) 하나에서 ④가 **두 축**을 파생한다 —
 * §69 신고세액공제(`creditInput.isFiledOnTime`)와 가산세(`filingPenalty`).
 * 대상 밖 값(당초 신고세액·기한후신고일)이 payload 로 새면 base·감면율이 조용히 움직인다.
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

import { POST } from "@/app/api/calc/gift/route";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

beforeEach(() => vi.clearAllMocks());

const BASE = {
  giftDate: "2025-01-01",
  donorRelation: "lineal_descendant" as const,
  donor: "mother" as const,
  giftItems: [
    { id: "g1", category: "real_estate_apartment", name: "재산", marketValue: 1_000_000_000 },
  ],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_descendant" as const },
};

interface Res {
  finalTax: number;
  underreportPenalty?: number;
  totalPayableWithPenalty?: number;
  filingPenaltyDetail?: { penaltyBase: number; penaltyRate: number; reductionRate: number };
}

async function post(body: object): Promise<Res> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/gift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { result?: Res; error?: unknown; details?: unknown };
  expect(res.status, JSON.stringify(json.error ?? json.details)).toBe(200);
  return json.result!;
}

describe("G-07 B1 ⑫ — filingPenalty 가 Zod strip 되지 않고 엔진에 닿는다", () => {
  it("R-0: 대조군 — 키가 없으면 가산세 0", async () => {
    const r = await post({ ...BASE, creditInput: { isFiledOnTime: true } });
    expect(r.underreportPenalty ?? 0).toBe(0);
    expect(r.filingPenaltyDetail).toBeUndefined();
  });

  it("R-1: 🔴 무신고 → 45,000,000 (스키마에서 키를 지우면 0이 되어 RED)", async () => {
    const r = await post({
      ...BASE,
      creditInput: { isFiledOnTime: false },
      filingPenalty: { filingStatus: "none" },
    });
    expect(r.finalTax).toBe(225_000_000);
    expect(r.underreportPenalty).toBe(45_000_000);
    expect(r.totalPayableWithPenalty).toBe(270_000_000);
  });

  it("R-2: 🔴 기한후신고 감면(§48②2호)이 route 를 통과한다 — 1개월 이내 50%", async () => {
    const r = await post({
      ...BASE,
      creditInput: { isFiledOnTime: false },
      filingPenalty: {
        filingStatus: "late",
        statutoryDeadline: "2025-04-30",
        actualFilingDate: "2025-05-20",
      },
    });
    expect(r.filingPenaltyDetail!.reductionRate).toBe(0.5);
    expect(r.underreportPenalty).toBe(22_500_000);
  });

  it("R-3: 🔴 과소신고 base 가 route 를 통과한다 — 당초 신고세액이 실제로 빠진다", async () => {
    const r = await post({
      ...BASE,
      creditInput: { isFiledOnTime: true },
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 50_000_000,
      },
    });
    expect(r.filingPenaltyDetail!.penaltyBase).toBe(168_250_000);
    expect(r.underreportPenalty).toBe(16_825_000);
  });

  it("R-4: 🔴 §47의3④1호 적용제외가 route 를 통과한다 — 다목", async () => {
    const r = await post({
      ...BASE,
      creditInput: { isFiledOnTime: true },
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 50_000_000,
        underReportExclusion: "supplementary_valuation",
      },
    });
    expect(r.underreportPenalty).toBe(0);
  });

  it("R-5: ⛔ 잘못된 enum 은 400 으로 거부된다 (스키마가 실제로 검사한다)", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BASE,
          creditInput: { isFiledOnTime: true },
          filingPenalty: { filingStatus: "정기신고" },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ④ 변환 — 폼 3-state 하나에서 두 축이 나온다
// ────────────────────────────────────────────────────────────────────────────

function form(o: Partial<FormState> = {}): FormState {
  return { ...INITIAL_FORM, giftDate: "2025-01-01", donor: "mother", ...o } as FormState;
}

describe("G-07 B1 ④ — 3-state → §69 축 + 가산세 축", () => {
  it("B4-1: 정기신고 + 과소신고 아님 → **키 자체를 넣지 않는다** (종전 payload 보존)", () => {
    const b = buildGiftTaxInput(form({ filingStatus: "on_time" }));
    expect(b.creditInput.isFiledOnTime).toBe(true);
    expect(b.filingPenalty).toBeUndefined();
  });

  it("B4-2: 기한후신고 → §68① 법정신고기한을 ④가 파생한다", () => {
    const b = buildGiftTaxInput(
      form({ filingStatus: "late", lateFilingDate: "2025-05-20" }),
    );
    expect(b.creditInput.isFiledOnTime).toBe(false);
    expect(b.filingPenalty).toEqual({
      filingStatus: "late",
      statutoryDeadline: "2025-04-30",
      actualFilingDate: "2025-05-20",
    });
  });

  it("B4-3: 🔴 stale 누출 차단 — 무신고로 바꾸면 기한후신고일·당초 신고세액이 실리지 않는다", () => {
    const b = buildGiftTaxInput(
      form({
        filingStatus: "none",
        lateFilingDate: "2025-05-20",
        isUnderReported: true,
        originalFiledTax: "50000000",
      }),
    );
    expect(b.filingPenalty).toEqual({ filingStatus: "none" });
  });

  it("B4-4: 🔴 정기신고로 바꾸면 기한후신고 축이 실리지 않는다", () => {
    const b = buildGiftTaxInput(
      form({
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: "50000000",
        lateFilingDate: "2025-05-20",
        priorAssessmentNotified: true,
      }),
    );
    expect(b.filingPenalty).toEqual({
      filingStatus: "on_time",
      isUnderReported: true,
      originalFiledTax: 50_000_000,
    });
  });

  it("B4-5: 적용제외를 고르면 함께 실린다", () => {
    const b = buildGiftTaxInput(
      form({
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: "50000000",
        underReportExclusion: "deduction_error",
      }),
    );
    expect(b.filingPenalty?.underReportExclusion).toBe("deduction_error");
  });
});
