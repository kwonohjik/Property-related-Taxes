/**
 * anchor: ⑭ route — 공통 양도비가 안분 엔진까지 **도달한다** (2026-09-05 · 코드리뷰 Q08)
 *
 * ④·⑬·⑫만 고치면 값이 route에서 멈춘다(memory `feedback_fixed_layer_vs_consumed_layer`).
 * 🔴 실제로 `apportionBundledSale`의 `commonExpenses`는 **구현·단위테스트까지 되어 있었는데
 *    프로덕션 호출자가 0건**이었다 — 「고친 층 ≠ 소비되는 층」의 교과서적 사례다.
 *
 * 여기서는 폼 → ④ → Zod → route → 안분 결과까지 한 번에 통과시켜, 자산별
 * `allocatedExpenses`가 §100② 후단(양도가액 비례)대로 나오는지 본다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 양도가액 7:3 · 공통 양도비 1,000만 → 700만 : 300만 */
function form(totalTransferExpense: string): TransferFormData {
  const mk = (i: number, sale: string, acq: string) => ({
    ...makeDefaultAsset(i),
    assetKind: "land" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2015-02-10",
    actualSalePrice: sale,
    fixedAcquisitionPrice: acq,
    standardPriceAtTransfer: sale,
  });
  return {
    transferDate: "2026-01-27",
    assets: [mk(1, "700,000,000", "300,000,000"), mk(2, "300,000,000", "100,000,000")],
    houses: [],
    presaleRights: [],
    isOneHousehold: false,
    householdHousingCount: "0",
    residencePeriodMonths: "0",
    annualBasicDeductionUsed: "0",
    contractTotalPrice: "1,000,000,000",
    bundledSaleMode: "actual",
    totalTransferExpense,
  } as unknown as TransferFormData;
}

type Apportioned = { assetId: string; allocatedSalePrice: number; allocatedExpenses: number };

async function run(totalTransferExpense: string) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form(totalTransferExpense));
  vi.unstubAllGlobals();

  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as {
    data?: { mode?: string; apportionment?: { apportioned: Apportioned[] } };
  };
  return { status: res.status, apportioned: json.data?.apportionment?.apportioned ?? [] };
}

describe("⑭ 공통 양도비 → 안분 엔진 도달", () => {
  it("🔴 양도가액 7:3 → 공통 양도비도 700만:300만 (종전에는 주 자산 1,000만 · 컴패니언 0)", async () => {
    const { status, apportioned } = await run("10,000,000");
    expect(status).toBe(200);
    expect(apportioned).toHaveLength(2);

    const byId = new Map(apportioned.map((a) => [a.assetId, a]));
    const primary = byId.get("primary")!;
    const companion = apportioned.find((a) => a.assetId !== "primary")!;

    expect(primary.allocatedSalePrice).toBe(700_000_000);
    expect(companion.allocatedSalePrice).toBe(300_000_000);
    expect(primary.allocatedExpenses).toBe(7_000_000);
    expect(companion.allocatedExpenses).toBe(3_000_000);
    // Σ 보존 — 필요경비가 새거나 늘지 않는다.
    expect(primary.allocatedExpenses + companion.allocatedExpenses).toBe(10_000_000);
  });

  it("대조군 — 총 양도비가 없으면 양쪽 다 0 (구별력 확인)", async () => {
    const { apportioned } = await run("");
    expect(apportioned.every((a) => a.allocatedExpenses === 0)).toBe(true);
  });
});
