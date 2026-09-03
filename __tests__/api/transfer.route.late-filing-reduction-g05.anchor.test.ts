/**
 * anchor: 가산세 코드리뷰 **G-05** — 기한 후 신고 감면 ⑫⑭ 관통
 *
 * 「국세기본법」 §48②2호·§48②3호라목의 감면은 ④ payload → **⑫ Zod** → ⑭ route →
 * 엔진을 관통해야 도달한다. ⑫에 `lateFiling` 키가 없으면 Zod 가 **조용히 strip** 하고
 * 세액은 감면 전 전액 그대로 나온다 — TypeScript 가 잡지 못하는 층이다(리뷰 G-14 교훈).
 *
 * 여기서 고정하는 것:
 *   1. ④ 단건·다건 빌더가 **같은 `lateFiling` 블록**을 만든다 (G-11 재발 방지)
 *   2. 그 블록이 ⑫를 통과해 엔진 세액을 실제로 **절반으로** 바꾼다
 *   3. 배제 토글이 route 를 관통해 감면을 끈다
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import {
  buildPenaltyAmendmentPayload,
  buildLateFilingPayload,
} from "@/lib/calc/transfer-tax-api-body-blocks";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// ────────────────────────────────────────────────────────────────────────────
// ④ — 단건·다건이 같은 블록을 만든다
// ────────────────────────────────────────────────────────────────────────────

function form(o: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    enablePenalty: true,
    filingType: "none",
    penaltyReason: "normal",
    transferDate: "2025-01-10",
    filingDate: "2025-04-15",
    priorPaidTax: "0",
    originalFiledTax: "0",
    excessRefundAmount: "0",
    interestSurcharge: "0",
    ...o,
  };
}

type LateFiling = {
  statutoryDeadline: string;
  actualFilingDate: string;
  finalReturnDeadline?: string;
  priorAssessmentNotified?: boolean;
};
function lateFilingOf(payload: object): LateFiling | undefined {
  return (payload as { filingPenaltyDetails?: { lateFiling?: LateFiling } })
    .filingPenaltyDetails?.lateFiling;
}

describe("G05-P1 ④ 변환 — 세 날짜를 기존 헬퍼에서 파생한다", () => {
  it("G05-P1-1: 🔴 예정신고기한·신고일·확정신고기한이 실린다", () => {
    const lf = lateFilingOf(buildPenaltyAmendmentPayload(form()));
    expect(lf).toEqual({
      statutoryDeadline: "2025-03-31", // 소득세법 §105①1호 — 양도월 말일 + 2개월
      actualFilingDate: "2025-04-15",
      finalReturnDeadline: "2026-05-31", // 소득세법 §110① — 다음 해 5월 31일
      priorAssessmentNotified: false,
    });
  });

  it("G05-P1-2: ⭐ 부담부증여는 §105①3호로 기한이 3개월이 된다 — 같은 헬퍼가 판정한다", () => {
    const f = form({
      assets: form().assets.map((a) => ({ ...a, transferType: "burdened_gift" as const })),
    });
    expect(lateFilingOf(buildPenaltyAmendmentPayload(f))!.statutoryDeadline).toBe("2025-04-30");
  });

  it("G05-P1-3: 🔑 다건 빌더가 단건 빌더와 **같은 블록**을 만든다 (G-11 재발 방지)", () => {
    const f = form();
    expect(lateFilingOf(buildPropertyPayload(f))).toEqual(
      lateFilingOf(buildPenaltyAmendmentPayload(f)),
    );
  });

  it("G05-P1-4: ⛔ 과소신고에는 블록 자체를 만들지 않는다 — §47의2 전용", () => {
    expect(buildLateFilingPayload(form({ filingType: "under" }))).toEqual({});
  });

  it("G05-P1-5: ⛔ 신고일이 없으면 만들지 않는다 — 기한 후 신고 사실이 없다", () => {
    expect(buildLateFilingPayload(form({ filingDate: "" }))).toEqual({});
  });

  it("G05-P1-6: 배제 토글이 그대로 실린다", () => {
    expect(
      lateFilingOf(buildPenaltyAmendmentPayload(form({ lateFilingNotified: true })))!
        .priorAssessmentNotified,
    ).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ⑫⑭ — route 를 실제로 태운다
// ────────────────────────────────────────────────────────────────────────────

const COMMON = {
  propertyType: "land" as const,
  transferDate: "2025-01-10",
  acquisitionDate: "2015-03-01",
  transferPrice: 1_000_000_000,
  acquisitionPrice: 200_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
};

const FILING_BASE = {
  determinedTax: 0,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
  filingType: "none" as const,
  penaltyReason: "normal" as const,
};

interface Res {
  penaltyDetail?: {
    filingPenalty?: {
      penaltyBase: number;
      filingPenalty: number;
      grossFilingPenalty: number;
      lateFilingReductionRate: number;
      lateFilingReductionAmount: number;
    };
  };
}

async function post(lateFiling?: LateFiling): Promise<Res> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...COMMON,
        filingPenaltyDetails: { ...FILING_BASE, ...(lateFiling ? { lateFiling } : {}) },
      }),
    }),
  );
  const json = (await res.json()) as { data?: { result: Res }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

const LATE: LateFiling = {
  statutoryDeadline: "2025-03-31",
  actualFilingDate: "2025-04-15",
  finalReturnDeadline: "2026-05-31",
};

describe("G05-P2 route 관통 — ⑫가 strip 하면 RED", () => {
  it("G05-P2-1: 🔴 감면이 세액을 실제로 절반으로 바꾼다", async () => {
    const withLate = await post(LATE);
    const without = await post(undefined);

    const a = withLate.penaltyDetail?.filingPenalty;
    const b = without.penaltyDetail?.filingPenalty;
    expect(a, "penaltyDetail.filingPenalty 가 없다").toBeDefined();
    expect(b).toBeDefined();

    // 기준금액은 같고 감면만 다르다.
    expect(a!.penaltyBase).toBe(b!.penaltyBase);
    expect(a!.grossFilingPenalty).toBe(b!.filingPenalty);
    expect(a!.lateFilingReductionRate).toBe(0.5);
    expect(a!.lateFilingReductionAmount).toBe(Math.floor(a!.grossFilingPenalty / 2));
    expect(a!.filingPenalty).toBe(a!.grossFilingPenalty - a!.lateFilingReductionAmount);

    // 두 값이 실제로 갈린다 — 격자가 구별력을 갖는다.
    expect(a!.filingPenalty).toBeLessThan(b!.filingPenalty);
  });

  it("G05-P2-2: 🔴 배제 단서가 route 를 관통해 감면을 끈다", async () => {
    const notified = await post({ ...LATE, priorAssessmentNotified: true });
    const plain = await post(undefined);
    expect(notified.penaltyDetail!.filingPenalty!.lateFilingReductionRate).toBe(0);
    expect(notified.penaltyDetail!.filingPenalty!.filingPenalty).toBe(
      plain.penaltyDetail!.filingPenalty!.filingPenalty,
    );
  });

  it("G05-P2-3: ⭐ 확정신고기한 축을 빼면 §48②2호로 내려간다 (6개월 초과 → 감면 0)", async () => {
    const raMok = await post({ ...LATE, actualFilingDate: "2025-11-30" });
    const clause2 = await post({
      statutoryDeadline: "2025-03-31",
      actualFilingDate: "2025-11-30",
    });
    expect(raMok.penaltyDetail!.filingPenalty!.lateFilingReductionRate).toBe(0.5);
    expect(clause2.penaltyDetail!.filingPenalty!.lateFilingReductionRate).toBe(0);
  });
});
