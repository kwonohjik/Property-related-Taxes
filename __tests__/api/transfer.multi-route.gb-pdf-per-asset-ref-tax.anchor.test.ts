/**
 * 실제 다건 route 응답(일반건물 + 토지)으로 PDF 자산별 양식을 렌더한다 — 일반건물 분할 파트(land#·building#)는
 * «산출세액/결정세액 기여분 (참고)» 두 행을 싣지 않고(화면 `gb-part-card.ts` 규칙) 일반 자산(토지)만 싣는다.
 * 합성 시료만으로는 실제 응답의 id 모양(`land#p2`)·상세 키(`generalBuildingDetailsByAsset.p2`)를 보장하지 못해 이 파일이 맡는다.
 * 계획서 docs/00-pm/multi-per-asset-display-followup.plan.md (Q-1 a).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TD = "2024-03-01";

/** `transfer.route.gb-amendment.predo.anchor.test.ts`·`gb-reduction-penalty-f17`과 같은 물건 — 실가 198,210,000 · 환산 111,380,000. */
const COMMON = {
  transferDate: TD,
  expenses: 0,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: false,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    gbZoneType: "general_residential",
    ...over,
  } as AssetForm;
}


/** 같은 물건의 단건 body(다건 항목에도 그대로 쓴다). */
function gbBody(asset: AssetForm, top: Obj = {}): Obj {
  return {
    ...COMMON,
    useEstimatedAcquisition: asset.useEstimatedAcquisition,
    propertyType: "general_building",
    transferPrice: 1_000_000_000,
    totalPropertyTransferPrice: 1_000_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: asset.acquisitionDate,
    generalBuildingValuation: buildGeneralBuildingValuation(asset, TD),
    ...top,
  };
}

/** 같은 해 먼저 양도한 토지(기본공제를 먼저 쓴다). */
const LAND: Obj = {
  ...COMMON,
  transferDate: "2024-01-15",
  propertyType: "land",
  transferPrice: 300_000_000,
  acquisitionPrice: 100_000_000,
  acquisitionDate: "2015-01-01",
  useEstimatedAcquisition: false,
};

const post = async (h: (r: NextRequest) => Promise<Response>, url: string, body: unknown) => {
  const res = await h(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Obj };
};

async function multi(items: Obj[]): Promise<Obj> {
  const r = await post(MULTI, "http://l/api/calc/transfer/multi", {
    taxYear: 2024,
    annualBasicDeductionUsed: 0,
    basicDeductionAllocation: "EARLIEST_TRANSFER",
    properties: items.map((it, i) => ({ propertyId: `p${i + 1}`, propertyLabel: `양도 ${i + 1}번`, ...it })),
  });
  expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
  return r.json.data;
}


function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (typeof el.type === "function") {
    try { collect((el.type as (p: unknown) => unknown)(el.props), out); } catch { /* 렌더 불가 노드 */ }
    return out;
  }
  collect((el.props ?? {}).children, out);
  return out;
}
const allAfter = (t: string[], label: string) => t.flatMap((x, i) => (x === label ? [t[i + 1]] : []));

describe("실제 응답 — 일반건물 분할 파트는 PDF 참고 세액 두 행이 없다", () => {
  it("토지 + 일반건물: 응답 모양 전제 → 두 행은 토지 1건분만", async () => {
    const m = await multi([LAND, gbBody(gbAsset())]);
    expect(m.properties.map((p: Obj) => p.propertyId)).toEqual(["p1", "land#p2", "building#p2"]);
    expect(m.generalBuildingDetailsByAsset?.p2).toBeDefined();
    const t = collect(TransferMultiSection({ r: m }));
    expect(allAfter(t, "산출세액 기여분 (참고)")).toEqual([m.properties[0].refCalculatedTax.toLocaleString()]);
    expect(allAfter(t, "결정세액 기여분 (참고)")).toEqual([m.properties[0].refDeterminedTax.toLocaleString()]);
  });

  it("일반건물만(1건): 토지·건물 파트 모두 두 행 없음", async () => {
    const m = await multi([gbBody(gbAsset())]);
    expect(m.properties.map((p: Obj) => p.propertyId)).toEqual(["land#p1", "building#p1"]);
    const t = collect(TransferMultiSection({ r: m }));
    expect(allAfter(t, "산출세액 기여분 (참고)")).toEqual([]);
    expect(allAfter(t, "결정세액 기여분 (참고)")).toEqual([]);
  });
});
