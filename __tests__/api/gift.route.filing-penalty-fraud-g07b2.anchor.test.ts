/**
 * anchor: 🔴 G-07 **B2** — 부정행위 축이 ④ → ⑫ Zod → route → 엔진을 **관통**한다
 *
 * B1 의 route anchor(`gift.route.filing-penalty-g07b1.anchor.test.ts`)와 같은 이유로 존재한다:
 * Zod 는 **알 수 없는 키를 조용히 strip** 하므로, `penaltyReason`·`fraudulentPortion`·
 * `corporateAdjustmentByFraud` 가 ⑫ 스키마에 없으면 ④가 실어 보내도 엔진은 일반율로
 * 계산하고 **테스트는 전건 통과한다**(TypeScript 도 미감지).
 *
 * ④ 게이팅도 함께 본다 — 대상 밖 값이 새면 화면에 없는 입력이 세액을 움직인다.
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
import { buildFilingPenaltyInput } from "@/lib/calc/inheritance-gift-filing-penalty-input";
import type { FilingPenaltyFormFields } from "@/lib/calc/inheritance-gift-filing-penalty-input";

beforeEach(() => vi.clearAllMocks());

// ────────────────────────────────────────────────────────────────────────────
// ④ — 게이팅
// ────────────────────────────────────────────────────────────────────────────

const FIELDS: FilingPenaltyFormFields = {
  lateFilingDate: "",
  priorAssessmentNotified: false,
  isUnderReported: false,
  originalFiledTax: "",
  underReportExclusion: "",
  penaltyReason: "normal",
  fraudulentPortion: "",
  corporateAdjustmentByFraud: false,
};

describe("B2-P1 ④ 게이팅 — 대상 밖 축은 싣지 않는다", () => {
  it("B2-P1-1: 일반(`normal`)이면 키를 넣지 않는다 — 엔진 기본값과 같다", () => {
    expect(
      buildFilingPenaltyInput("none", { ...FIELDS, penaltyReason: "normal" }).filingPenalty,
    ).toEqual({ filingStatus: "none" });
  });

  it("B2-P1-2: 🔴 무신고·기한후신고에도 부정행위 축이 실린다 (§47의2①1호)", () => {
    expect(
      buildFilingPenaltyInput("none", { ...FIELDS, penaltyReason: "offshore_fraud" })
        .filingPenalty,
    ).toEqual({ filingStatus: "none", penaltyReason: "offshore_fraud" });

    expect(
      buildFilingPenaltyInput(
        "late",
        { ...FIELDS, penaltyReason: "fraudulent", lateFilingDate: "2025-05-20" },
        "2025-04-30",
      ).filingPenalty,
    ).toMatchObject({ penaltyReason: "fraudulent" });
  });

  it("B2-P1-3: ⛔ 무신고에는 `fraudulentPortion` 을 싣지 않는다 — 가목·나목 분해가 없다", () => {
    expect(
      buildFilingPenaltyInput("none", {
        ...FIELDS,
        penaltyReason: "fraudulent",
        fraudulentPortion: "30000000",
      }).filingPenalty,
    ).toEqual({ filingStatus: "none", penaltyReason: "fraudulent" });
  });

  it("B2-P1-4: ⛔ 일반이면 `fraudulentPortion` 을 싣지 않는다 — 분해 자체가 없다", () => {
    expect(
      buildFilingPenaltyInput("on_time", {
        ...FIELDS,
        isUnderReported: true,
        penaltyReason: "normal",
        fraudulentPortion: "30000000",
      }).filingPenalty,
    ).not.toHaveProperty("fraudulentPortion");
  });

  it("B2-P1-5: 🔑 빈 칸이면 키를 넣지 않고, 0 은 싣는다 — 「미입력」 ≠ 「부정행위분 없음」", () => {
    const blank = buildFilingPenaltyInput("on_time", {
      ...FIELDS,
      isUnderReported: true,
      penaltyReason: "fraudulent",
      fraudulentPortion: "",
    }).filingPenalty;
    const zero = buildFilingPenaltyInput("on_time", {
      ...FIELDS,
      isUnderReported: true,
      penaltyReason: "fraudulent",
      fraudulentPortion: "0",
    }).filingPenalty;
    expect(blank).not.toHaveProperty("fraudulentPortion");
    expect(zero!.fraudulentPortion).toBe(0);
  });

  it("B2-P1-6: ⛔ 라목 단서는 **라목을 골랐을 때만** 실린다", () => {
    expect(
      buildFilingPenaltyInput("on_time", {
        ...FIELDS,
        isUnderReported: true,
        underReportExclusion: "supplementary_valuation",
        corporateAdjustmentByFraud: true,
      }).filingPenalty,
    ).not.toHaveProperty("corporateAdjustmentByFraud");

    expect(
      buildFilingPenaltyInput("on_time", {
        ...FIELDS,
        isUnderReported: true,
        underReportExclusion: "corporate_adjustment",
        corporateAdjustmentByFraud: true,
      }).filingPenalty!.corporateAdjustmentByFraud,
    ).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ⑫⑭ — route 관통
// ────────────────────────────────────────────────────────────────────────────

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
  filingPenaltyDetail?: {
    penaltyBase: number;
    penaltyRate: number;
    reductionRate: number;
    fraudSplit?: { fraudBase: number; fraudRate: number; normalBase: number; normalRate: number };
    exclusionApplied?: string;
    exclusionOverriddenByFraud?: string;
  };
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

describe("B2-P2 route 관통 — ⑫가 strip 하면 RED", () => {
  it("B2-P2-1: 🔴 무신고 부정행위 40% — 일반율 45,000,000 이 90,000,000 이 된다", async () => {
    const normal = await post({
      ...BASE,
      creditInput: { isFiledOnTime: false },
      filingPenalty: { filingStatus: "none" },
    });
    const fraud = await post({
      ...BASE,
      creditInput: { isFiledOnTime: false },
      filingPenalty: { filingStatus: "none", penaltyReason: "fraudulent" },
    });
    expect(normal.underreportPenalty).toBe(45_000_000);
    expect(fraud.underreportPenalty).toBe(90_000_000);
    expect(fraud.filingPenaltyDetail!.penaltyRate).toBe(0.4);
  });

  it("B2-P2-2: 🔴 역외 60% — 40%와 실제로 갈린다", async () => {
    const r = await post({
      ...BASE,
      creditInput: { isFiledOnTime: false },
      filingPenalty: { filingStatus: "none", penaltyReason: "offshore_fraud" },
    });
    expect(r.filingPenaltyDetail!.penaltyRate).toBe(0.6);
    expect(r.underreportPenalty).toBe(135_000_000);
  });

  it("B2-P2-3: 🔴 가목·나목 분해가 route 를 통과한다", async () => {
    const r = await post({
      ...BASE,
      creditInput: { isFiledOnTime: true },
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 25_000_000,
        penaltyReason: "fraudulent",
        fraudulentPortion: 100_000_000,
      },
    });
    const d = r.filingPenaltyDetail!;
    // 🔑 정기신고는 §69 신고세액공제 3%가 붙어 결정세액이 225,000,000 → 218,250,000 이다
    //    (무신고 격자와 base 가 다르다). base = 218,250,000 − 25,000,000.
    expect(r.finalTax).toBe(218_250_000);
    expect(d.penaltyBase).toBe(193_250_000);
    expect(d.fraudSplit).toEqual({
      fraudBase: 100_000_000,
      fraudRate: 0.4,
      normalBase: 93_250_000,
      normalRate: 0.1,
    });
    expect(r.underreportPenalty).toBe(40_000_000 + 9_325_000);
  });

  it("B2-P2-4: 🔴 다목 적용제외가 부정행위 단서로 뒤집힌다 (§47의3④1호 다목 괄호)", async () => {
    const plain = await post({
      ...BASE,
      creditInput: { isFiledOnTime: true },
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 25_000_000,
        underReportExclusion: "supplementary_valuation",
      },
    });
    expect(plain.underreportPenalty ?? 0).toBe(0);
    expect(plain.filingPenaltyDetail!.exclusionApplied).toBe("supplementary_valuation");

    const fraud = await post({
      ...BASE,
      creditInput: { isFiledOnTime: true },
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 25_000_000,
        underReportExclusion: "supplementary_valuation",
        penaltyReason: "fraudulent",
      },
    });
    expect(fraud.filingPenaltyDetail!.exclusionOverriddenByFraud).toBe("supplementary_valuation");
    expect(fraud.underreportPenalty).toBe(77_300_000); // 193,250,000 × 40%
  });

  it("B2-P2-5: 🔴 라목 단서(`corporateAdjustmentByFraud`)가 route 를 관통한다", async () => {
    const body = (extra: object) => ({
      ...BASE,
      creditInput: { isFiledOnTime: true },
      filingPenalty: {
        filingStatus: "on_time",
        isUnderReported: true,
        originalFiledTax: 25_000_000,
        underReportExclusion: "corporate_adjustment",
        ...extra,
      },
    });
    expect((await post(body({}))).underreportPenalty ?? 0).toBe(0);
    const overridden = await post(body({ corporateAdjustmentByFraud: true }));
    expect(overridden.filingPenaltyDetail!.exclusionOverriddenByFraud).toBe(
      "corporate_adjustment",
    );
    expect(overridden.underreportPenalty).toBe(19_325_000); // 193,250,000 × 10%
  });
});
