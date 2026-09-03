/**
 * anchor: 🔴 G-07 **B3** — 납부지연 축이 ④ → ⑫ Zod → route → 엔진을 **관통**한다
 *
 * ⑫에 `unpaidTax`·`paymentDeadline`·`actualPaymentDate`·`paidOnTimeThenRevalued` 키가 없으면
 * ④가 실어 보내도 Zod 가 **조용히 strip** 하고 납부지연가산세가 0이 된다(TypeScript 미감지).
 *
 * ④ 게이팅도 함께 본다 — 특히 **신고 상태와 독립**이라는 계약(정기·정확 신고에도 실린다)이
 * ④에서 깨지면 입력 경로가 통째로 사라진다.
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

const FIELDS: FilingPenaltyFormFields = {
  lateFilingDate: "",
  priorAssessmentNotified: false,
  isUnderReported: false,
  originalFiledTax: "",
  underReportExclusion: "",
  penaltyReason: "normal",
  fraudulentPortion: "",
  corporateAdjustmentByFraud: false,
  applyLatePaymentPenalty: false,
  unpaidTax: "",
  paymentDeadline: "",
  actualPaymentDate: "",
  paidOnTimeThenRevalued: false,
};

const LATE_ON = {
  applyLatePaymentPenalty: true,
  unpaidTax: "100000000",
  paymentDeadline: "2025-04-30",
  actualPaymentDate: "2025-08-08",
};

// ────────────────────────────────────────────────────────────────────────────
// ④ — 게이팅
// ────────────────────────────────────────────────────────────────────────────

describe("B3-P1 ④ 게이팅", () => {
  it("B3-P1-1: 🔴 정기·정확 신고(과소신고 아님)여도 납부지연 축이 실린다", () => {
    // 종전에는 이 조합이 **키 자체를 만들지 않았다**(§47의3 축이 없으므로).
    // §47의4 는 독립이라 그러면 입력 경로가 통째로 사라진다.
    expect(
      buildFilingPenaltyInput("on_time", { ...FIELDS, ...LATE_ON }).filingPenalty,
    ).toEqual({
      filingStatus: "on_time",
      unpaidTax: 100_000_000,
      paymentDeadline: "2025-04-30",
      actualPaymentDate: "2025-08-08",
    });
  });

  it("B3-P1-2: ⛔ 토글 OFF 면 세 칸을 보내지 않는다 (stale 누출 차단)", () => {
    expect(
      buildFilingPenaltyInput("on_time", {
        ...FIELDS,
        ...LATE_ON,
        applyLatePaymentPenalty: false,
      }),
    ).toEqual({});
  });

  it.each(["late", "none"] as const)("B3-P1-3: %s 에도 납부지연 축이 실린다", (status) => {
    expect(
      buildFilingPenaltyInput(status, { ...FIELDS, ...LATE_ON }).filingPenalty,
    ).toMatchObject({ unpaidTax: 100_000_000, paymentDeadline: "2025-04-30" });
  });

  it("B3-P1-4: 과소신고 축과 **함께** 실린다 (두 축은 배타가 아니다)", () => {
    expect(
      buildFilingPenaltyInput("on_time", {
        ...FIELDS,
        ...LATE_ON,
        isUnderReported: true,
        originalFiledTax: "25000000",
      }).filingPenalty,
    ).toMatchObject({
      isUnderReported: true,
      originalFiledTax: 25_000_000,
      unpaidTax: 100_000_000,
    });
  });

  it("B3-P1-5: §47의4③6호 토글이 실린다", () => {
    expect(
      buildFilingPenaltyInput("on_time", {
        ...FIELDS,
        ...LATE_ON,
        paidOnTimeThenRevalued: true,
      }).filingPenalty!.paidOnTimeThenRevalued,
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
  creditInput: { isFiledOnTime: true },
};

interface Res {
  finalTax: number;
  underreportPenalty?: number;
  latePaymentPenalty?: number;
  totalPayableWithPenalty?: number;
  latePaymentPenaltyDetail?: {
    penalty: number;
    unpaidTax: number;
    elapsedDays: number;
    exclusionApplied?: string;
  };
  besshi10Rows?: Array<{ number: string; amount: number; display: string }>;
}

async function post(filingPenalty?: object): Promise<Res> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/gift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...BASE, ...(filingPenalty ? { filingPenalty } : {}) }),
    }),
  );
  const json = (await res.json()) as { result?: Res; error?: unknown; details?: unknown };
  expect(res.status, JSON.stringify(json.error ?? json.details)).toBe(200);
  return json.result!;
}

const LATE_BODY = {
  filingStatus: "on_time",
  unpaidTax: 100_000_000,
  paymentDeadline: "2025-04-30",
  actualPaymentDate: "2025-08-08",
};

describe("B3-P2 route 관통 — ⑫가 strip 하면 RED", () => {
  it("B3-P2-1: 🔴 납부지연가산세가 실제 세액을 바꾼다", async () => {
    const none = await post();
    const late = await post(LATE_BODY);

    expect(none.latePaymentPenalty ?? 0).toBe(0);
    // 미납 1억 × 99일 × 0.022%
    expect(late.latePaymentPenalty).toBe(2_178_000);
    expect(late.latePaymentPenaltyDetail!.elapsedDays).toBe(99);
    // 결정세액은 불변, 총 납부세액만 늘어난다
    expect(late.finalTax).toBe(none.finalTax);
    expect(late.totalPayableWithPenalty).toBe(none.finalTax + 2_178_000);
  });

  it("B3-P2-2: 🔴 신고불성실과 **합산**된다 (두 축은 독립이다)", async () => {
    const both = await post({
      ...LATE_BODY,
      isUnderReported: true,
      originalFiledTax: 25_000_000,
    });
    expect(both.underreportPenalty!).toBeGreaterThan(0);
    expect(both.latePaymentPenalty).toBe(2_178_000);
    expect(both.totalPayableWithPenalty).toBe(
      both.finalTax + both.underreportPenalty! + both.latePaymentPenalty!,
    );
  });

  it("B3-P2-3: 🔴 §47의4③6호 적용제외가 route 를 관통한다", async () => {
    const r = await post({ ...LATE_BODY, paidOnTimeThenRevalued: true });
    expect(r.latePaymentPenalty).toBe(0);
    expect(r.latePaymentPenaltyDetail!.exclusionApplied).toBe("revalued_after_timely_filing");
  });

  it("B3-P2-4: 🔴 별지10호 ㊸ 가 dash 에서 금액으로 바뀐다", async () => {
    const none = await post();
    const late = await post(LATE_BODY);
    const row = (r: Res) => r.besshi10Rows!.find((x) => x.number === "㊸")!;
    expect(row(none).display).toBe("dash");
    expect(row(late).display).toBe("amount");
    expect(row(late).amount).toBe(2_178_000);
  });

  it("B3-P2-5: 🔑 별지10호 ㊺ 항등식이 그대로 성립한다 (㊸ 가 산식에 들어 있다)", async () => {
    const late = await post(LATE_BODY);
    const get = (n: string) => late.besshi10Rows!.find((x) => x.number === n)!.amount;
    expect(get("㊺")).toBe(
      get("㉞") + get("㉟") - get("㊱") - get("㊲") + get("㊷") + get("㊸") + get("㊹"),
    );
  });
});
