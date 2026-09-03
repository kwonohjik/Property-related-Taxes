/**
 * anchor: 🔴 G-02 · G-13 — 가산세가 **신고서 단위**로 aggregate에 도달한다
 *
 * ## 종전 결함
 *
 * 일괄양도(`companionAssets`)와 일반건물 지분분할 두 경로는 `calculateTransferTaxAggregate`에
 * `filingPenaltyDetails`·`delayedPaymentDetails`를 넘기지 않아 **신고불성실·납부지연 가산세가
 * 항상 0원**이었다. 단건 경로의 2-pass(`route.ts:551~`)는 이 두 분기가 **그 앞에서 반환**하므로
 * 도달하지 않는다. 형제 분기는 이미 배선돼 있었다 — mixedUse `route.ts:404`, GB `:493`.
 *
 * ## 왜 자산-수준이 아니라 신고서 단위인가 (실측)
 *
 * 같은 payload를 자산-수준(`properties[0].filingPenaltyDetails`)으로만 주면 aggregate가
 * **무시한다**. 아래 B-1이 그 사실을 고정한다 — 「자산-수준만 주면 0」이 유지되어야
 * bundled가 스프레드로 자산-수준에 흘리는 값이 이중부과를 만들지 않는다
 * (`transfer-tax-aggregate.ts:458`의 상호배타 전제).
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

/** 무신고(20%) — determinedTax는 aggregate가 주입하므로 0으로 둔다(route가 보내는 형태). */
const FILING = {
  determinedTax: 0,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
  filingType: "none" as const,
  penaltyReason: "normal" as const,
};

/** 과세되는 2건 격자 (1세대1주택 비과세를 피한다) */
function taxableItems(assetLevelPenalty: boolean): TransferTaxItemInput[] {
  const common = { isOneHousehold: false, householdHousingCount: 2 };
  return [
    {
      ...baseTransferInput(common),
      propertyId: "primary",
      propertyLabel: "주 자산",
      ...(assetLevelPenalty ? { filingPenaltyDetails: { ...FILING } } : {}),
    },
    { ...baseTransferInput(common), propertyId: "c1", propertyLabel: "컴패니언" },
  ] as TransferTaxItemInput[];
}

function run(opts: { assetLevel?: boolean; filingUnit?: boolean }) {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2024,
      properties: taxableItems(opts.assetLevel ?? false),
      annualBasicDeductionUsed: 0,
      ...(opts.filingUnit ? { filingPenaltyDetails: { ...FILING } } : {}),
    },
    makeMockRates(),
  );
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("G-02/G-13 신고서 단위 가산세가 aggregate에 도달한다", () => {
  it("B-0: 가산세 입력이 없으면 0 (대조군)", () => {
    const r = run({});
    expect(r.penaltyTax).toBe(0);
    expect(r.filingUnitPenaltyDetail).toBeUndefined();
  });

  it("B-1: 자산-수준으로만 주면 aggregate가 무시한다 — 이중부과 방지 전제", () => {
    const r = run({ assetLevel: true });
    expect(r.penaltyTax).toBe(0);
    expect(r.filingUnitPenaltyDetail).toBeUndefined();
  });

  it("B-2: 신고서 단위로 주면 무신고가산세가 실린다 (결정세액 × 20%)", () => {
    const base = run({});
    const r = run({ filingUnit: true });

    // 결정세액이 그대로이고 가산세만 더해진다
    expect(r.determinedTax).toBe(base.determinedTax);
    expect(r.penaltyTax).toBeGreaterThan(0);
    expect(r.filingUnitPenaltyDetail?.totalPenalty).toBe(r.penaltyTax);

    // 국세기본법 §47의2①2호 — 무신고 일반 20%. base는 aggregate가 주입한 결정세액.
    const fp = r.filingUnitPenaltyDetail!.filingPenalty!;
    expect(fp.penaltyRate).toBe(0.2);
    expect(fp.penaltyBase).toBe(base.determinedTax);
    expect(fp.filingPenalty).toBe(Math.floor(base.determinedTax * 0.2));

    // 총세액도 정확히 가산세만큼 늘어난다
    expect(r.totalTax).toBe(base.totalTax + r.penaltyTax);
  });

  it("B-3: 자산-수준과 신고서 단위가 함께 와도 신고서 단위 1회만 부과된다", () => {
    const only = run({ filingUnit: true });
    const both = run({ assetLevel: true, filingUnit: true });
    expect(both.penaltyTax).toBe(only.penaltyTax);
    expect(both.totalTax).toBe(only.totalTax);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 🔴 route 레벨 — leaf anchor(위 B-1~B-3)는 route 배선을 태우지 않는다.
//    결함이 있던 자리가 바로 `route.ts`의 두 분기이므로 여기서 확인한다.
// ────────────────────────────────────────────────────────────────────────────

const COMMON = {
  transferDate: "2024-03-01",
  acquisitionDate: "2019-03-01",
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

interface Agg {
  determinedTax: number;
  penaltyTax: number;
  totalTax: number;
  filingUnitPenaltyDetail?: { totalPenalty: number };
}

async function postBundled(withPenalty: boolean): Promise<Agg> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...COMMON,
        propertyType: "housing",
        transferPrice: 900_000_000,
        acquisitionPrice: 300_000_000,
        totalSalePrice: 1_000_000_000,
        standardPriceAtTransferForApportion: 500_000_000,
        bundledSaleMode: "apportioned",
        companionAssets: [
          {
            assetId: "land-1",
            assetLabel: "부속토지",
            assetKind: "land",
            standardPriceAtTransfer: 200_000_000,
            directExpenses: 0,
            acquisitionCause: "purchase",
            acquisitionDate: "2019-03-01",
            fixedAcquisitionPrice: 100_000_000,
          },
        ],
        ...(withPenalty ? { filingPenaltyDetails: FILING } : {}),
      }),
    }),
  );
  const json = (await res.json()) as { data?: { aggregated?: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated!;
}

describe("G-02 route — 일괄양도(companionAssets) 분기가 가산세를 엔진에 전달한다", () => {
  it("R-1: 🔴 무신고 가산세가 실제로 세액을 움직인다 (종전 Δ 0)", async () => {
    const base = await postBundled(false);
    const pen = await postBundled(true);

    expect(base.penaltyTax).toBe(0);
    expect(base.filingUnitPenaltyDetail).toBeUndefined();

    // 결정세액은 그대로, 가산세만 더해진다
    expect(pen.determinedTax).toBe(base.determinedTax);
    expect(pen.penaltyTax).toBeGreaterThan(0);
    // 국세기본법 §47의2①2호 — 무신고 일반 20%
    expect(pen.penaltyTax).toBe(Math.floor(base.determinedTax * 0.2));
    expect(pen.filingUnitPenaltyDetail?.totalPenalty).toBe(pen.penaltyTax);
    expect(pen.totalTax).toBe(base.totalTax + pen.penaltyTax);
  });
});
