/**
 * anchor — 함께 양도로 묶인 일반건물에도 공익수용 §164⑨1호(토지 환산 분모 특례)가 닿는다.
 *
 * ## 결함 (2026-11-09 실측)
 *
 * 일반건물은 단건이면 `dispatchGeneralBuilding`이 최상위 수용 3필드(`transferCause`·`compensationPerSqm`·
 * `compensationBasisStdPrice`)를 환산 payload에 주입한다. 함께 양도는 같은 물건을 카드 함수(`buildGbCompanionItems`)로
 * 펼치는데, 두 호출부(`bundled-route.ts` 주 자산 · `bundled-split-helpers.ts` 컴패니언)가 그 3필드를 넘기지 않아
 * 특례가 **조용히 빠졌다**. ④는 3칸을 보내고 ⑧도 막지 않으므로 화면에서 도달한다.
 *
 * | 주택 + 일반건물(환산) · 수용 ON | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 총세액 | 184,140,000 (OFF와 같다) | 140,844,000 |
 * | 일반건물 토지 카드 양도차익 | 175,500,000 | 55,500,000 (= 단건 일반건물 수용 ON) |
 *
 * 다건 합산 경로는 #3082가 같은 인자(`expropriation`)를 넘기도록 고쳤다(`multi-gb-expansion.ts`).
 * 계획서 `docs/00-pm/multi-building-valuation-support.plan.md` §3.7 V-G3 별건.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Prop = { propertyId: string; transferGain: number };
type Agg = { totalTax?: number; properties?: Prop[] };

/** 폼 → ④(`callTransferTaxAPI`) 본문 → 단건 route. ④를 태워야 「화면에서 도달한다」를 함께 고정한다. */
async function pipeline(form: TransferFormData) {
  let captured: Record<string, unknown> = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* 본문만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  const json = (await res.json()) as { data?: { aggregated?: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return { body: captured, agg: json.data?.aggregated ?? {} };
}

/** 일반건물 환산 — `transfer.route.companion-gb-unregistered-f7.anchor.test.ts`와 같은 물건. */
const GB = {
  assetKind: "general_building",
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
  gbLandArea: "200",
  gbBuildingFootprintArea: "100",
  gbZoneType: "commercial",
  gbBuildingArea: "300",
  gbTransferLandPricePerSqm: "1500000",
  gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "750000",
  gbAcqBuildingValue: "100000000",
  standardPriceAtTransfer: "500000000",
};
/** 보상 1호 — 보상 ㎡당 90만 · 보상 기초 개별공시지가 110만(양도시 150만보다 낮다 → 토지 환산 분모가 내려간다). */
const EXPR = { transferCause: "public_expropriation", compensationPerSqm: "900000", compensationBasisStdPrice: "1100000" };

function asset(i: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-1`,
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
    ...over,
  };
}

function form(assets: unknown[], contractTotalPrice: string): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets,
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice,
    householdHousingCount: "2",
  } as TransferFormData;
}

const landGain = (agg: Agg) => (agg.properties ?? []).find((p) => baseCardId(p.propertyId) === "land")!.transferGain;
const exprIssues = (f: TransferFormData) =>
  [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)).map((i) => i.message).filter((m) => /수용|보상/.test(m));

describe("함께 양도 일반건물 — 공익수용 §164⑨1호", () => {
  it("BE-0 대조군 — 일반건물 단독은 수용 특례가 토지 차익을 175,500,000 → 55,500,000으로 낮춘다", async () => {
    const off = await pipeline(form([asset(1, { ...GB, actualSalePrice: "600000000" })], "600000000"));
    const on = await pipeline(form([asset(1, { ...GB, ...EXPR, actualSalePrice: "600000000" })], "600000000"));
    expect(landGain(off.agg)).toBe(175_500_000);
    expect(landGain(on.agg)).toBe(55_500_000);
  });

  it("BE-1 🔴 컴패니언 일반건물 — 수용 ON이면 토지 차익이 단건과 같고 총세액이 내려간다(수정 전 184,140,000 그대로)", async () => {
    const off = await pipeline(form([asset(1), asset(2, GB)], "1200000000"));
    const onForm = form([asset(1), asset(2, { ...GB, ...EXPR })], "1200000000");
    expect(exprIssues(onForm)).toEqual([]); // ⑧이 막지 않는다 — 화면에서 도달한다
    const on = await pipeline(onForm);
    expect((on.body.companionAssets as Record<string, unknown>[])[0]).toMatchObject({ transferCause: "public_expropriation", compensationPerSqm: 900_000 });
    expect(off.agg.totalTax).toBe(184_140_000);
    expect(landGain(on.agg)).toBe(55_500_000);
    expect(on.agg.totalTax).toBe(140_844_000);
  });

  it("BE-2 🔴 주 자산 일반건물 + 컴패니언 주택 — 같은 특례가 닿는다(수정 전 184,140,000 그대로)", async () => {
    const off = await pipeline(form([asset(1, GB), asset(2)], "1200000000"));
    const on = await pipeline(form([asset(1, { ...GB, ...EXPR }), asset(2)], "1200000000"));
    expect(off.agg.totalTax).toBe(184_140_000);
    expect(landGain(on.agg)).toBe(55_500_000);
    expect(on.agg.totalTax).toBe(140_844_000);
  });
});
