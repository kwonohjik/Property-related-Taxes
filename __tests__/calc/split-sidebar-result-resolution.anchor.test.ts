/**
 * ⑥ 사이드바 — 토지·건물 분리(split) 자산의 계산 후 취득가액·필요경비 (2026-10-10).
 *
 * 종전 실측(master ddd3f5b16):
 *   · 단건 일반 매매 split + 환산 파트 → 계산 후에도 취득가액 「계산 후 표시」(acq 0 · pending). 결과 해소 분기가 D1-4·D2-2 원인 혼합에만 열려 있었다.
 *   · 단건 split 필요경비 = `result.expenses`(파트 직접경비만) — 환산 파트 개산공제(§163⑥)가 빠졌다(엔진 `estimatedDeduction`에 따로 실림).
 *   · 함께 양도 split 자산 → 값은 엔진 값인데 acqPending이 true로 남았다(엔진 값이 0이면 「계산 후 표시」에 갇힘).
 * 지금: 단건 = `summarizeSplitGain()`의 acquisitionDeducted·necessaryExpense, 함께 양도 = 엔진 `aggregated.properties` — 두 축이 같은 값.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI, type TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { summarizeSplitGain } from "@/lib/tax-engine/transfer-tax-split-display";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 매매 주택 — 건물 2018-03-02 · 토지 2010-01-10(별개 취득), 파트 실가 토지 3억·건물 3.5억, 양도 토지 7억·건물 5억. */
const house = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-02",
    landAcquisitionCause: "purchase",
    landCauseHost: "purchase",
    landAcquisitionDate: "2010-01-10",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "350,000,000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    acquisitionArea: "200",
    transferArea: "200",
    standardPricePerSqmAtAcq: "100000",
    ...over,
  }) as AssetForm;

const CASES: Record<string, Partial<AssetForm>> = {
  "일반 매매 · 토지 환산": { landAcqMode: "estimated", landAcquisitionPrice: "" },
  "일반 매매 · 건물 환산": { buildingAcqMode: "estimated", buildingAcquisitionPrice: "", buildingStandardPriceAtAcq: "100,000,000" },
  "D1-4 1984 토지 상속(§163⑨ 단서 1호)": {
    landAcquisitionCause: "inheritance", landAcquisitionDate: "1984-05-01", landDecedentAcquisitionDate: "1960-01-01",
    pre1990GradeMode: "value", pre1990Grade_current: "1000", pre1990Grade_prev: "1000", pre1990Grade_atAcq: "800", pre1990PricePerSqm_1990: "100,000",
  },
  "D2-4 2003 건물 상속(§163⑨ 단서 2호)": {
    acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01",
    decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10",
    buildingAcquisitionPrice: "30,000,000", inheritanceAssetKind: "house_individual",
    inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
    inhHouseValBuildingStdPriceAtFirst: "50,000,000", inhHouseValBuildingStdPriceAtInheritance: "30,000,000",
  },
};

/** 함께 양도 상대 — 토지 실가 1억 → 3억. */
const land2 = (): AssetForm =>
  ({
    ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 2", regionCode: "1168010100", assetKind: "land",
    acquisitionCause: "purchase", acquisitionDate: "2015-03-03", acquisitionArea: "100", transferArea: "100",
    fixedAcquisitionPrice: "100,000,000", actualSalePrice: "300,000,000", standardPriceAtTransfer: "200,000,000",
  }) as AssetForm;

const form = (assets: AssetForm[]): TransferFormData =>
  ({
    transferDate: "2026-06-30", filingDate: "2026-08-31", assets, houses: [], presaleRights: [],
    contractTotalPrice: assets.length > 1 ? "1500000000" : "1200000000", bundledSaleMode: "actual",
    totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
  }) as unknown as TransferFormData;

async function run(f: TransferFormData): Promise<TransferAPIResult> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      annualBasicDeductionUsed: 0, ...cap.body, isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0,
    }),
  }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: TransferAPIResult }).data;
}

describe("⑥ split 사이드바 — 계산 전 pending → 계산 후 엔진 파트 합 (단건 ≡ 함께 양도)", () => {
  for (const [name, over] of Object.entries(CASES)) {
    it(name, async () => {
      // 단건
      const fs = form([house(over)]);
      expect(computeTransferPerAssetSummary(fs, null).rows[0].acqPending).toBe(true);
      const rs = await run(fs);
      if (rs.mode !== "single") throw new Error(rs.mode);
      const sd = rs.result.splitDetail!;
      const s = summarizeSplitGain(sd);
      const single = computeTransferPerAssetSummary(fs, rs).rows[0];
      expect(single.acqPending).toBe(false);
      expect(single.acqPrice).toBe(s.acquisitionDeducted);
      expect(single.acqPrice).toBeGreaterThan(0);
      expect(single.expense).toBe(s.necessaryExpense);

      // 함께 양도 — 같은 자산을 주 자산으로
      const fb = form([house(over), land2()]);
      const rb = await run(fb);
      if (rb.mode !== "bundled") throw new Error(rb.mode);
      const eng = rb.aggregated!.properties!.find((p) => p.propertyId === "primary")!;
      const bundled = computeTransferPerAssetSummary(fb, rb).rows[0];
      expect(bundled.acqPending).toBe(false);
      expect(bundled.acqPrice).toBe(eng.acquisitionPrice);
      expect(bundled.expense).toBe(eng.necessaryExpense);
      // 두 축이 같은 값(파트 양도가액이 같으니 엔진 파트 합도 같다)
      expect(single.acqPrice).toBe(bundled.acqPrice);
      expect(single.expense).toBe(bundled.expense);
    }, 60_000);
  }

  it("토지 환산 개산공제가 사이드바 필요경비에 들어간다 — 토지 기준시가 100,000 × 200㎡ × 3% = 600,000", async () => {
    const fs = form([house(CASES["일반 매매 · 토지 환산"])]);
    const rs = await run(fs);
    if (rs.mode !== "single") throw new Error(rs.mode);
    expect(rs.result.expenses).toBe(0); // 엔진 `expenses`는 파트 직접경비만 — 이 값을 읽으면 「-」였다
    expect(computeTransferPerAssetSummary(fs, rs).rows[0].expense).toBe(600_000);
  }, 60_000);

  it("부정형 짝 — 파트 실가만이면 계산 전부터 확정(650,000,000), 결과가 와도 프리뷰 값 유지", async () => {
    const fs = form([house()]);
    const pre = computeTransferPerAssetSummary(fs, null).rows[0];
    expect(pre.acqPending).toBe(false);
    expect(pre.acqPrice).toBe(650_000_000);
    const rs = await run(fs);
    const post = computeTransferPerAssetSummary(fs, rs).rows[0];
    expect(post.acqPending).toBe(false);
    expect(post.acqPrice).toBe(650_000_000);
  }, 60_000);
});
