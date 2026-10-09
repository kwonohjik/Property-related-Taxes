/**
 * D1-4a — 영 §163⑨ 단서 1호 ②(landSec164Value)가 **세 경로**(단건 · 다건 · 컴패니언)의 ④→⑫→⑭→엔진을 끝까지 건너는지 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1-4.engine.design.md §1.3 · §10 (M-⑭ 변형)
 * 단건 route 직접 호출 anchor는 `transfer.route.split-land-part-cause.d1-4.predo.anchor.test.ts`.
 * ⑭ 매핑은 TypeScript가 못 잡는 침묵 strip 층이라 경로마다 route를 통과시켜 관측한다(`feedback_leaf_anchor_skips_zod_layer`).
 *
 * 시드(단건·다건): 주택, 건물 2018-03-02 매매 4억, 토지 1988-05-01 상속(피상속인 1960) 평가액 3억, 양도 12억(토지 7억/건물 5억).
 *   ② = 면적 100㎡ × ㎡당 3,500,000(등급 22,500/40,000/50,000, 1990.1.1. 7,000,000) = 350,000,000 → 많은 금액 = ② → 104,660,000
 *   (anchor B-1 손계산과 같은 값 — 장특 30% 포화로 날짜 무관).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type Obj = Record<string, unknown>;

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-02",
    landAcquisitionCause: "inheritance",
    landCauseHost: "purchase",
    landAcquisitionDate: "1988-05-01",
    landDecedentAcquisitionDate: "1960-01-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "400,000,000",
    acquisitionArea: "100",
    transferArea: "100",
    pre1990GradeMode: "value",
    pre1990Grade_current: "50000",
    pre1990Grade_prev: "40000",
    pre1990Grade_atAcq: "22500",
    pre1990PricePerSqm_1990: "7000000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as AssetForm;
}

function form(a: AssetForm) {
  const f = createDefaultTransferFormData();
  f.assets[0] = a;
  f.transferDate = "2026-06-30";
  f.contractTotalPrice = "1200000000";
  f.householdHousingCount = "2";
  f.isOneHousehold = false;
  return f;
}

async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
  }));
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
const post = (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("단건 — 화면 ④ body → route (⑫⑭ 포함)", () => {
  async function single(a: AssetForm) {
    const body = await bodyOf(() => callTransferTaxAPI(form(a)));
    const res = await post(SINGLE, "http://l/api/calc/transfer", { ...body, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0 });
    return { body, status: res.status, json: (await res.json()) as { data?: { result?: Obj & { splitDetail?: { land?: Obj } } }; error?: unknown } };
  }
  it("② 채택: 104,660,000 · echo adopted=sec164", async () => {
    const { body, status, json } = await single(asset());
    expect(body.landSec164Value).toBe(350_000_000);
    expect(status, JSON.stringify(json.error)).toBe(200);
    expect(json.data?.result?.determinedTax).toBe(104_660_000);
    expect(json.data?.result?.splitDetail?.land?.acquisitionBasis).toMatchObject({ adopted: "sec164", reported: 300_000_000, sec164: 350_000_000 });
  });
  it("5칸 부분 입력 → ② 미전송 → ⑫ 400 (침묵 통과 없음)", async () => {
    expect((await single(asset({ pre1990Grade_prev: "" }))).status).toBe(400);
  });
});

describe("다건 — /api/calc/transfer/multi ⑭ (multi/route.ts)", () => {
  async function multi(a: AssetForm) {
    const mf = { taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
    const body = await bodyOf(() => callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: form(a), completionPercent: 100 }]));
    const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
    return { status: res.status, json: (await res.json()) as { data?: { totalTax: number }; error?: unknown } };
  }
  it("② 도달: 다건 합산 결과가 단건과 같은 취득가액(②)을 쓴다 — ⑭ 매핑을 지우면 400", async () => {
    const m = await multi(asset());
    expect(m.status, JSON.stringify(m.json.error)).toBe(200);
    const none = await multi(asset({ pre1990Grade_prev: "" }));
    expect(none.status).toBe(400);
    // ② 채택(3.5억)과 ① 채택(4억)은 세액이 다르다 — 다건이 ②를 실제로 쓴다는 증거
    const reported = await multi(asset({ landAcquisitionPrice: "400,000,000" }));
    expect(m.json.data!.totalTax).toBeGreaterThan(reported.json.data!.totalTax);
  });
});

describe("컴패니언 — bundled-split-helpers ⑭", () => {
  const BASE = {
    propertyType: "land" as const,
    transferDate: "2026-06-30",
    transferPrice: 600_000_000,
    acquisitionDate: "2010-01-01",
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 0,
    standardPriceAtTransferForApportion: 400_000_000,
    totalSalePrice: 1_000_000_000,
  };
  const companion = (over: Obj = {}) => [
    {
      assetId: "c1",
      assetLabel: "주택",
      assetKind: "building" as const,
      standardPriceAtTransferForApportion: 400_000_000,
      standardPriceAtTransfer: 400_000_000,
      directExpenses: 0,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2015-01-01",
      fixedAcquisitionPrice: 150_000_000,
      reductions: [] as unknown[],
      isOneHousehold: false,
      landAcquisitionDate: "1988-05-01",
      landAcquisitionCause: "inheritance" as const,
      landDecedentAcquisitionDate: "1960-01-01",
      isSeparateAcquisition: true,
      landAcqMode: "actual" as const,
      buildingAcqMode: "actual" as const,
      landAcquisitionPrice: 100_000_000,
      buildingAcquisitionPrice: 50_000_000,
      landStandardPriceAtTransfer: 250_000_000,
      buildingStandardPriceAtTransfer: 150_000_000,
      ...over,
    },
  ];
  async function run(over: Obj) {
    const res = await post(SINGLE, "http://l/api/calc/transfer", { ...BASE, companionAssets: companion(over) });
    const json = (await res.json()) as { data?: { aggregated: { properties: { propertyId: string; transferGain: number }[] } }; error?: unknown };
    return { status: res.status, json, gain: json.data?.aggregated.properties.find((p) => p.propertyId === "c1")?.transferGain };
  }
  it("② 없음 → ⑫ 400 (companionAssets.0.landSec164Value)", async () => {
    const r = await run({});
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error)).toContain("landSec164Value");
  });
  it("② 있음 → 200 · max 채택이 양도차익을 바꾼다(② 1.3억 > ① 1억이면 차익이 3천만 작다) — ⑭ 매핑 도달 증거", async () => {
    const onlyReported = await run({ landSec164Value: 100_000_000 }); // 동점 → ①
    const sec164Wins = await run({ landSec164Value: 130_000_000 });
    expect(onlyReported.status).toBe(200);
    expect(sec164Wins.status).toBe(200);
    expect(onlyReported.gain! - sec164Wins.gain!).toBe(30_000_000);
  });
  it("일부 양도 사실 + 단서 구간 → 400", async () => {
    const r = await run({ landSec164Value: 130_000_000, isPartialAreaTransfer: true });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error)).toContain("일부만 양도");
  });
});
