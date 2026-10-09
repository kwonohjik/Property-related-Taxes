/**
 * D1-4b ⑥ — 영 §163⑨ 단서 1호(1990.8.30. 전 상속·증여 토지) 단건 사이드바 취득가액.
 *
 * 입력 단계는 max(평가액, 영 §164④ 가액)를 엔진만 알아 pending(「계산 후 표시」)이다. 결과가 오면 엔진이 실제로 차감한
 * 파트 합을 보여야 한다. 종전(sync 검사 Medium)엔 단건 fallback 체인이 `splitDetail`을 읽지 않아 계산 후에도
 * `acqPrice 0 · pending`에 갇혔다 — D1-4b 전에는 평가액 합이 보였으므로 퇴행이었다.
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

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const TRANSFER_DATE = "2026-06-30";

/** §164④ 5칸 + 면적 — 등급가액 직접입력 모드(`value`): 현재 1000 · 직전 1000 · 취득시 800 → 비율 0.8. */
const SEC164_FILLED: Partial<AssetForm> = {
  acquisitionArea: "200",
  transferArea: "200",
  pre1990GradeMode: "value",
  pre1990Grade_current: "1000",
  pre1990Grade_prev: "1000",
  pre1990Grade_atAcq: "800",
  pre1990PricePerSqm_1990: "100,000",
};

/** 신축(2020-06-01) + 토지 상속 1984-05-01(피상속인 1960-01-01) — 신축 호스트에서 토글을 켠 상태. */
function newConstruction(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "newConstruction",
    acquisitionDate: "2020-06-01",
    occupancyApprovalDate: "2020-06-01",
    landAcquisitionCause: "inheritance",
    landCauseHost: "newConstruction",
    landAcquisitionDate: "1984-05-01",
    landDecedentAcquisitionDate: "1960-01-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    fixedAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as AssetForm;
}

/** 매매(2018-03-02, 건물 3.5억) + 토지 상속 1984-05-01 — 매매 호스트에서 토글을 켠 상태. */
function purchase(over: Partial<AssetForm> = {}): AssetForm {
  return newConstruction({
    acquisitionCause: "purchase",
    occupancyApprovalDate: "",
    acquisitionDate: "2018-03-02",
    landCauseHost: "purchase",
    buildingAcquisitionPrice: "350,000,000",
    ...over,
  });
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


async function bodyOf(a: AssetForm): Promise<Record<string, unknown>> {
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
  return cap.body!;
}
async function full(a: AssetForm) {
  const body = await bodyOf(a);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
        annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: { result?: TransferTaxResult } };
  return { status: res.status, result: json.data?.result };
}

describe("D1-4b ⑥ 단건 사이드바 — 단서 구간은 계산 전 pending, 계산 후 엔진 파트 합", () => {
  for (const [host, mk] of [["신축", newConstruction], ["매매", purchase]] as const) {
    it(`${host} 호스트 1984 상속: 계산 전 pending → 계산 후 엔진 차감 합(acquisitionBasis 있음)`, async () => {
      const a = mk(SEC164_FILLED);
      const f = form(a);
      const pre = computeTransferPerAssetSummary(f, null).rows[0];
      expect(pre.acqPending).toBe(true);
      const r = await full(a);
      expect(r.status).toBe(200);
      const sd = r.result!.splitDetail!;
      expect(sd.land.acquisitionBasis).toBeDefined();
      const post = computeTransferPerAssetSummary(f, { mode: "single", result: r.result } as never).rows[0];
      expect(post.acqPending).toBe(false);
      expect(post.acqPrice).toBe(summarizeSplitGain(sd).acquisitionDeducted);
      expect(post.acqPrice).toBeGreaterThan(0);
    }, 30_000);
    it(`${host} 긍정 짝: 단서 밖(2015 상속)은 계산 전부터 평가액 합(pending 아님)`, () => {
      const pre = computeTransferPerAssetSummary(form(mk({ ...SEC164_FILLED, landAcquisitionDate: "2015-03-10" })), null).rows[0];
      expect(pre.acqPending).toBe(false);
      expect(pre.acqPrice).toBeGreaterThan(0);
    });
  }
});
