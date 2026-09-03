/**
 * anchor: 가산세 코드리뷰 **B6** — 배관 잔여 (2026-09)
 *
 * | ID | 새던 곳 |
 * |---|---|
 * | G-10 | ④ 변환이 신고 유형과 무관하게 `originalFiledTax`·`excessRefundAmount`를 전송 |
 * | G-11 | 다건 ④ 만 `fraudulentPortion` 키를 빠뜨려 가목·나목 분해가 사라짐 |
 * | G-28 | 다건에는 「수정신고 ↔ 가산세」 상호배타 게이트가 클라이언트·Zod 양쪽 다 없음 |
 * | G-14 | 부동산 `fraudulentPortion`이 ⑫ Zod 층을 태우는 테스트 부재 |
 *
 * ## 🔑 왜 route 를 태우는가 (G-14)
 *
 * 종전 wiring anchor(`__tests__/calc/transfer-penalty-fraud-portion-wiring.anchor.test.ts`)는
 * ④ payload 와 엔진 leaf 만 보고, 주석에 「⑫⑭ 는 route 계열이 덮는다」고 적어 두었다.
 * **그 주장이 사실이 아니었다** — `grep -rn "fraudulentPortion" __tests__/api/` 는 0건이었고,
 * Zod 스키마에서 그 키를 지워 조용히 strip 되게 해도 1,172파일 11,293테스트가 전건 통과했다.
 * 키가 strip 되면 엔진이 「미입력 = 전액 부정」으로 보아 **21,000,000원(2.1배) 불리한** 세액이
 * 나온다. ⇒ payload → Zod → route → 엔진을 **관통**하는 anchor 를 여기에 둔다.
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

// vi.mock 호이스팅 이후 static import
import { POST } from "@/app/api/calc/transfer/route";
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { buildPenaltyAmendmentPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

function form(o: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    enablePenalty: true,
    filingType: "under",
    penaltyReason: "fraudulent",
    priorPaidTax: "0",
    originalFiledTax: "0",
    excessRefundAmount: "0",
    interestSurcharge: "0",
    ...o,
  };
}

type PenaltyBlock = {
  originalFiledTax?: number;
  excessRefundAmount?: number;
  fraudulentPortion?: number;
};
function filingBlockOf(payload: object): PenaltyBlock | undefined {
  return (payload as { filingPenaltyDetails?: PenaltyBlock }).filingPenaltyDetails;
}

// ────────────────────────────────────────────────────────────────────────────
// G-10 — 신고 유형을 바꾸면 대상 밖 금액이 따라가지 않는다
// ────────────────────────────────────────────────────────────────────────────

describe("G-10 ④ 변환 — stale 「당초 신고세액」·「초과환급세액」이 전송되지 않는다", () => {
  /**
   * ⑤ UI 는 두 칸을 조건부로만 노출한다(당초 신고세액 = 과소·초과환급 / 환급세액 = 초과환급).
   * 종전 ④ 는 유형과 무관하게 무조건 실어, 라디오를 바꾸면 화면에서 사라진 값이 그대로
   * 가산세 base 를 움직였다 — 「무신고납부세액」(국세기본법 §47의2①)은 「그 신고로 납부하여야
   * 할 세액」이고 당초 신고세액을 빼라는 문언이 없다.
   */
  it("B6-10-1: 🔴 무신고로 바꾸면 당초 신고세액·초과환급세액이 0으로 전송된다", () => {
    const p = filingBlockOf(
      buildPenaltyAmendmentPayload(
        form({ filingType: "none", originalFiledTax: "100000000", excessRefundAmount: "50000000" }),
      ),
    );
    expect(p).toBeDefined();
    expect(p!.originalFiledTax).toBe(0);
    expect(p!.excessRefundAmount).toBe(0);
  });

  it("B6-10-2: 🔴 과소신고는 당초 신고세액만 살고 환급세액은 0이다", () => {
    const p = filingBlockOf(
      buildPenaltyAmendmentPayload(
        form({ filingType: "under", originalFiledTax: "100000000", excessRefundAmount: "50000000" }),
      ),
    );
    expect(p!.originalFiledTax).toBe(100_000_000);
    expect(p!.excessRefundAmount).toBe(0);
  });

  it("B6-10-3: ⛔ 초과환급신고에서는 둘 다 산다 (양성 대조군)", () => {
    const p = filingBlockOf(
      buildPenaltyAmendmentPayload(
        form({
          filingType: "excess_refund",
          originalFiledTax: "100000000",
          excessRefundAmount: "50000000",
        }),
      ),
    );
    expect(p!.originalFiledTax).toBe(100_000_000);
    expect(p!.excessRefundAmount).toBe(50_000_000);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// G-11 — 다건 ④ 도 가목·나목 분해 입력을 싣는다
// ────────────────────────────────────────────────────────────────────────────

describe("G-11 다건 ④ 변환 — fraudulentPortion 을 payload 에 싣는다", () => {
  it("B6-11-1: 🔴 다건 빌더가 단건 빌더와 같은 키를 만든다", () => {
    const f = form({ fraudulentPortion: "30000000" });
    const single = filingBlockOf(buildPenaltyAmendmentPayload(f));
    const multi = filingBlockOf(buildPropertyPayload(f));
    expect(single!.fraudulentPortion).toBe(30_000_000);
    // 종전: 키 자체가 없어 「미입력 = 전액 부정」으로 떨어졌다
    expect(multi!.fraudulentPortion).toBe(30_000_000);
  });

  it("B6-11-2: ⛔ 빈 문자열이면 키를 넣지 않는다 (미입력 = 전액 부정, 종전 동작 보존)", () => {
    const multi = filingBlockOf(buildPropertyPayload(form({ fraudulentPortion: "" })));
    expect(multi).toBeDefined();
    expect("fraudulentPortion" in multi!).toBe(false);
  });

  it("B6-11-3: 🔑 0 은 「부정행위분이 없다」는 유효한 선언이라 전송한다", () => {
    const multi = filingBlockOf(buildPropertyPayload(form({ fraudulentPortion: "0" })));
    expect(multi!.fraudulentPortion).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// G-28 — 다건 클라이언트 게이트 (수정신고 ↔ 가산세 상호배타)
// ────────────────────────────────────────────────────────────────────────────

describe("G-28 다건 ④ — 신고서 단위 수정신고면 자산별 가산세를 보내지 않는다", () => {
  /**
   * 같은 과소신고 1건에 `amendmentDetail`의 신고불성실가산세와 자산별 §47의2~§47의4
   * 가산세가 **동시에** 산출됐다. 단건 화면에서 같은 조합은 Zod 가 400 으로 거부한다.
   * 🔑 판정 기준은 **신고서 단위** 플래그다 — 자산 form 의 `amendmentMode`가 아니다.
   */
  it("B6-28-1: 🔴 filingUnitAmendment=true 면 filingPenaltyDetails 가 없다", () => {
    const f = form({ paymentDeadline: "2024-08-31", unpaidTax: "10000000" });
    const off = buildPropertyPayload(f, false) as Record<string, unknown>;
    const on = buildPropertyPayload(f, true) as Record<string, unknown>;
    expect(off.filingPenaltyDetails).toBeDefined();
    expect(off.delayedPaymentDetails).toBeDefined();
    expect(on.filingPenaltyDetails).toBeUndefined();
    expect(on.delayedPaymentDetails).toBeUndefined();
  });

  /**
   * 🔑 클라이언트 게이트만으로는 부족하다 — 단건도 ④·⑫ **양쪽**에서 막는다.
   * ④ 만 고치면 route 를 직접 호출하는 경로가 그대로 열려 있다.
   */
  const MULTI_ASSET = {
    propertyId: "a1",
    propertyLabel: "토지",
    propertyType: "land" as const,
    transferDate: "2026-06-01",
    acquisitionDate: "2012-03-01",
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [] as unknown[],
    residencePeriodMonths: 0,
  };
  const AMENDMENT = {
    correctionKind: "amend" as const,
    originalDeterminedTax: 200_000_000,
    applyUnderReportingPenalty: true,
    underReportingReason: "normal" as const,
    underReductionMode: "auto_48_2" as const,
    applyLatePaymentPenalty: false,
  };
  const ASSET_PENALTY = {
    determinedTax: 0,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "under" as const,
    penaltyReason: "normal" as const,
  };

  async function postMulti(body: object) {
    return POST_MULTI(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: 2026, annualBasicDeductionUsed: 0, ...body }),
      }),
    );
  }

  it("B6-28-2: 🔴 ⑫ Zod — 수정신고 + 자산별 가산세를 함께 보내면 400", async () => {
    const res = await postMulti({
      properties: [{ ...MULTI_ASSET, filingPenaltyDetails: ASSET_PENALTY }],
      amendment: AMENDMENT,
    });
    expect(res.status).toBe(400);
  });

  it("B6-28-3: ⛔ 한쪽만 보내면 통과한다 (양성 대조군 · 게이트가 과잉 차단하지 않는다)", async () => {
    const onlyPenalty = await postMulti({
      properties: [{ ...MULTI_ASSET, filingPenaltyDetails: ASSET_PENALTY }],
    });
    expect(onlyPenalty.status).toBe(200);

    const onlyAmendment = await postMulti({
      properties: [MULTI_ASSET],
      amendment: AMENDMENT,
    });
    expect(onlyAmendment.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// G-14 — ⑫ Zod 층을 실제로 태운다 (route 관통)
// ────────────────────────────────────────────────────────────────────────────

const COMMON = {
  propertyType: "land" as const,
  transferDate: "2024-03-01",
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
  filingType: "under" as const,
  penaltyReason: "fraudulent" as const,
};

interface Res {
  determinedTax: number;
  penaltyTax: number;
  penaltyDetail?: {
    filingPenalty?: {
      penaltyBase: number;
      filingPenalty: number;
      fraudSplit?: {
        fraudBase: number;
        fraudRate: number;
        normalBase: number;
        normalRate: number;
      };
    };
  };
}

async function post(fraudulentPortion?: number): Promise<Res> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...COMMON,
        filingPenaltyDetails: {
          ...FILING_BASE,
          ...(fraudulentPortion !== undefined ? { fraudulentPortion } : {}),
        },
      }),
    }),
  );
  const json = (await res.json()) as {
    data?: { mode: string; result: Res };
    error?: unknown;
  };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

describe("G-14 route 관통 — fraudulentPortion 이 ⑫ Zod 를 통과해 엔진에 닿는다", () => {
  it("B6-14-1: 🔴 가목·나목 분해가 결과에 실린다 (키가 strip 되면 RED)", async () => {
    const split = await post(30_000_000);
    const fp = split.penaltyDetail?.filingPenalty;
    expect(fp, "penaltyDetail.filingPenalty 가 없다").toBeDefined();

    const base = fp!.penaltyBase;
    expect(base).toBeGreaterThan(30_000_000);

    // 국세기본법 §47의3①1호 — 가목(부정분 × 40%) + 나목(나머지 × 10%)
    expect(fp!.fraudSplit).toEqual({
      fraudBase: 30_000_000,
      fraudRate: 0.4,
      normalBase: base - 30_000_000,
      normalRate: 0.1,
    });
    expect(fp!.filingPenalty).toBe(
      Math.floor(30_000_000 * 0.4) + Math.floor((base - 30_000_000) * 0.1),
    );
  });

  it("B6-14-2: 🔑 키를 보내지 않으면 전액 40% — 두 값이 실제로 갈린다", async () => {
    const split = await post(30_000_000);
    const whole = await post(undefined);
    const base = whole.penaltyDetail!.filingPenalty!.penaltyBase;

    expect(whole.penaltyDetail!.filingPenalty!.fraudSplit).toBeUndefined();
    expect(whole.penaltyDetail!.filingPenalty!.filingPenalty).toBe(Math.floor(base * 0.4));
    /**
     * 구별력 실증 — 두 격자의 **가산세액**이 실제로 다르다(같으면 이 anchor 는 아무것도
     * 증명하지 못한다).
     *
     * ⚠️ `penaltyTax`가 아니라 `penaltyDetail`을 본다 — 단건 result 의 `penaltyTax` 슬롯은
     *    「소득세법」 §114조의2 환산가액적용가산세 전용이고, 국세기본법 §47의2~§47의4 분은
     *    `penaltyDetail`에 따로 담긴다(G-01 에서 확인한 축 분리). 이 격자는 환산 모드가
     *    아니라 `penaltyTax`가 양쪽 다 0이다.
     */
    const splitPenalty = split.penaltyDetail!.filingPenalty!.filingPenalty;
    const wholePenalty = whole.penaltyDetail!.filingPenalty!.filingPenalty;
    expect(split.penaltyTax).toBe(0);
    expect(whole.penaltyTax).toBe(0);
    expect(splitPenalty).toBeLessThan(wholePenalty);
    // 가목 40% 대신 나목 10%가 붙는 부분만큼 차이난다
    expect(wholePenalty - splitPenalty).toBe(Math.floor((base - 30_000_000) * 0.3));
  });

  it("B6-14-3: 0 을 보내면 전액 나목 10%다 (「미입력」과 구별된다)", async () => {
    const zero = await post(0);
    const fp = zero.penaltyDetail!.filingPenalty!;
    expect(fp.fraudSplit).toEqual({
      fraudBase: 0,
      fraudRate: 0.4,
      normalBase: fp.penaltyBase,
      normalRate: 0.1,
    });
    expect(fp.filingPenalty).toBe(Math.floor(fp.penaltyBase * 0.1));
  });
});
