/**
 * D2-2 ⑥ — 건물 상속·증여 + 토지 매매 단건 사이드바 취득가액.
 *
 * 입력 단계: 토지·건물이 모두 실가·평가액이면 파트 합이 확정이고, 토지 환산·감정이 있으면 `pending`(계산 후 표시)이다.
 * 결과 도착 후: pending이 풀려 엔진이 실제로 차감한 파트 합을 보인다(D1-4b 사이드바 수정과 같은 정본 `summarizeSplitGain().acquisitionDeducted`).
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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { summarizeSplitGain } from "@/lib/tax-engine/transfer-tax-split-display";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { computeTransferSummary } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const TRANSFER_DATE = "2026-06-30";

/** 건물 상속(2025-05-01) + 토지 매매(2025-01-10) — D2 토글 ON 상태. 토지 3억·건물 평가액 4억(파트 실가). */
function d2(host: "inheritance" | "gift" = "inheritance", over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: host,
    acquisitionDate: "2025-05-01",
    inheritanceStartDate: host === "inheritance" ? "2025-05-01" : "",
    inheritanceDate: host === "inheritance" ? "2025-05-01" : "",
    decedentAcquisitionDate: host === "inheritance" ? "2000-01-01" : "",
    landAcquisitionCause: "purchase",
    landCauseHost: host,
    landAcquisitionDate: "2025-01-10",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    acquisitionArea: "200",
    transferArea: "200",
    standardPricePerSqmAtAcq: "100,000",
    ...over,
  } as AssetForm;
}

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE,
    filingDate: "2026-08-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1200000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

async function full(a: AssetForm) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form(a));
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
        annualBasicDeductionUsed: 0, ...cap.body, isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: { result?: TransferTaxResult } };
  return { status: res.status, result: json.data?.result };
}

describe("D2-2 ⑥ 단건 사이드바", () => {
  for (const host of ["inheritance", "gift"] as const) {
    it(`${host}: 파트 실가·평가액이면 계산 전부터 합 확정(토지 3억 + 건물 4억) · 자산 행 = 사이드바 합계`, () => {
      const f = form(d2(host));
      const row = computeTransferPerAssetSummary(f, null).rows[0];
      expect(row.acqPending).toBe(false);
      expect(row.acqPrice).toBe(700_000_000);
      expect(computeTransferSummary(f, null).totalAcqPrice).toBe(700_000_000);
    });
  }

  it("건물 평가액을 비우면 pending(0) — 숨은 신고가액·증여 신고가액을 읽지 않는다", () => {
    const stale = { publishedValueAtInheritance: "900,000,000", fixedAcquisitionPrice: "800,000,000", buildingAcquisitionPrice: "" };
    for (const host of ["inheritance", "gift"] as const) {
      const f = form(d2(host, stale));
      const row = computeTransferPerAssetSummary(f, null).rows[0];
      expect(row.acqPending).toBe(true);
      expect(row.acqPrice).toBe(0);
      expect(computeTransferSummary(f, null).totalAcqPrice).toBe(0);
    }
  });

  for (const host of ["inheritance", "gift"] as const) {
    it(`${host}: 토지 환산이면 계산 전 pending → 계산 후 엔진 차감 합으로 풀린다`, async () => {
      const a = d2(host, { landAcqMode: "estimated", landAcquisitionPrice: "" });
      const f = form(a);
      const pre = computeTransferPerAssetSummary(f, null).rows[0];
      expect(pre.acqPending).toBe(true);
      expect(computeTransferSummary(f, null).totalAcqPrice).toBe(0);

      const r = await full(a);
      expect(r.status).toBe(200);
      const sd = r.result!.splitDetail!;
      expect(sd.land.acqMode).toBe("estimated");
      const post = computeTransferPerAssetSummary(f, { mode: "single", result: r.result } as never).rows[0];
      expect(post.acqPending).toBe(false);
      expect(post.acqPrice).toBe(summarizeSplitGain(sd).acquisitionDeducted);
      expect(post.acqPrice).toBeGreaterThan(0);
    }, 30_000);
  }
});
