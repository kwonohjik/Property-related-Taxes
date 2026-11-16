/**
 * 겸용주택 × 토지를 건물보다 나중에 취득 — 화면 경로(폼 → ④ `buildMixedUsePayload` → ⑫ mixedUse refine → ⑭ `...s.mixedUse` → 엔진)
 * 겸용 probe는 최상위 필드 덮어쓰기 함정이 있어(memory) body를 ④ 빌더로 만든다.
 * 엔진 직접·leaf는 `__tests__/tax-engine/transfer/mixed-use-later-land-holding-residence.anchor.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

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
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-property-payload";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine() as never);
});

const interval = (...p: [string, string][]): Partial<AssetForm> =>
  ({ residenceInputMode: "interval", residencePeriods: p.map(([moveInDate, moveOutDate]) => ({ moveInDate, moveOutDate })) }) as Partial<AssetForm>;
const direct = (m: string): Partial<AssetForm> => ({ residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: m }) as Partial<AssetForm>;

const MIX = {
  assetKind: "housing",
  isMixedUseHouse: true,
  addressJibun: "서울 강남구 역삼동 1",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-01",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2020-03-01",
  useEstimatedAcquisition: false,
  residentialFloorArea: "150",
  nonResidentialFloorArea: "100",
  buildingFootprintArea: "100",
  mixedUseTotalLandArea: "200",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "500000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "350000000",
  mixedAcqCommercialBuildingPrice: "80000000",
  mixedAcqLandPricePerSqm: "1500000",
  mixedAcqLandPricePerSqmAtBuildingAcq: "1400000",
  actualSalePrice: "2500000000",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "600000000",
  buildingAcquisitionPrice: "300000000",
  ...interval(["2010-06-01", "2025-01-15"]),
} as Partial<AssetForm>;

const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, MIX, ...over) as AssetForm;
function form(a: AssetForm): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2025-01-15";
  f.filingDate = "2025-03-31";
  f.contractTotalPrice = "2500000000";
  f.householdHousingCount = "1";
  f.isOneHousehold = true;
  f.assets = [a];
  return withIdentityHousingBuildingStdOnForm(f);
}
async function run(a: AssetForm) {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
  await callTransferTaxAPI(form(a));
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = await res.json();
  return { status: res.status, json, body, mu: body.mixedUse as Record<string, unknown> };
}

type Res = Awaited<ReturnType<typeof run>>;
const result = (r: Res) => r.json.data.result;
const landLthd = (r: Res) => result(r).housingPart.partLthd.land;
const buildingLthd = (r: Res) => result(r).housingPart.partLthd.building;
const capNote = (r: Res) => ((result(r).warnings ?? []) as string[]).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

describe("겸용 × 토지 나중 취득 — ④ → ⑫ → 엔진", () => {
  it("구간 입력 2010-06-01~2025-01-15: ④가 겹침 58개월 ÷ 12 = 4년을 싣고 합계(14년)는 그대로 · 토지 32% · 건물 80% · 고지 없음", async () => {
    const r = await run(asset());
    expect(r.status, JSON.stringify(r.json.error ?? {})).toBe(200);
    expect(r.mu.residencePeriodYears).toBe(14);
    expect(r.mu.landHoldingResidencePeriodYears).toBe(4);
    expect(landLthd(r).longTermRate).toBeCloseTo(0.32, 10);
    expect(landLthd(r).longTermDeduction).toBe(37_161_498); // 토지 과세 양도차익 116,129,684 × 32%
    expect(buildingLthd(r).longTermRate).toBeCloseTo(0.8, 10);
    expect(capNote(r)).toHaveLength(0);
    expect(result(r).total.determinedTax).toBe(136_849_380);
  });

  it("직접 입력 168개월: 새 키 없음 · 엔진이 보유 연수로 상한 — 같은 32% · 같은 세액 · 고지 1건", async () => {
    const r = await run(asset(direct("168")));
    expect(r.mu).not.toHaveProperty("landHoldingResidencePeriodYears");
    expect(r.mu.residencePeriodYears).toBe(14);
    expect(landLthd(r).longTermRate).toBeCloseTo(0.32, 10);
    expect(result(r).total.determinedTax).toBe(136_849_380);
    expect(capNote(r)).toHaveLength(1);
  });

  it("토지 취득 전에만 거주(2010-06-01~2015-05-31 = 60개월): 겹침 0 · 합계 5년 그대로 · 토지 16%(보유분만) · 건물 60%", async () => {
    const r = await run(asset(interval(["2010-06-01", "2015-05-31"])));
    expect(r.mu.landHoldingResidencePeriodYears).toBe(0);
    expect(r.mu.residencePeriodYears).toBe(5); // 60개월 → 5년 — 합계는 줄이지 않는다(표2 대상 판정·건물분이 읽는다)
    expect(landLthd(r).longTermRate).toBeCloseTo(0.16, 10);
    expect(buildingLthd(r).longTermRate).toBeCloseTo(0.6, 10); // 보유 14년 40% + 거주 5년 20%
  });

  it("짝 — 토지가 먼저·같은 날 취득: 새 키 없음 · route 200 · 토지 보유 연수 그대로", async () => {
    for (const d of ["2000-03-01", "2010-03-01"]) {
      const r = await run(asset({ landAcquisitionDate: d } as Partial<AssetForm>));
      expect(r.mu, d).not.toHaveProperty("landHoldingResidencePeriodYears");
      // 같은 날은 파트 모델이 아니라 총액 입력이 필요해 이 시료로는 200이 아니다 — 키 부재만 본다(토지가 먼저인 경우는 200 · 고지 없음)
      if (d !== "2010-03-01") {
        expect(r.status, d + JSON.stringify(r.json.error ?? {})).toBe(200);
        expect(capNote(r), d).toHaveLength(0);
      }
    }
  });

  it("⑫ 게이트 — ④ body에 값을 얹어 보내면: 토지가 먼저이면 400 · 거주 합계(14)를 넘으면 400 · 14는 통과", async () => {
    const post = async (mu: Record<string, unknown>, bodyOver: Record<string, unknown> = {}) => {
      const r = await run(asset());
      const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...r.body, ...bodyOver, mixedUse: { ...r.mu, ...mu } }) }));
      return { status: res.status, json: await res.json() };
    };
    expect((await post({ landHoldingResidencePeriodYears: 15 })).status).toBe(400);
    expect((await post({ landHoldingResidencePeriodYears: 14 })).status).toBe(200);
    const early = await post({ landAcquisitionDate: "2000-03-01", landHoldingResidencePeriodYears: 2 });
    expect(early.status).toBe(400);
    // ⑫(Zod fieldErrors)가 막는다 — 엔진 throw만으로 400이 나는 것과 구별한다
    expect(early.json.error.fieldErrors["mixedUse.landHoldingResidencePeriodYears"]).toHaveLength(1);
  });
});

describe("다건(연간 합산) — 겸용주택은 합산 route가 받지 않는다(⑫ 거부) — 이 규칙이 닿을 입력 경로가 없다", () => {
  it("multi payload에는 mixedUse가 실리지 않고, 실어 보내면 400(MULTI_MIXED_USE_UNSUPPORTED)", async () => {
    const prop = buildPropertyPayload(form(asset())) as Record<string, unknown>;
    expect(prop.mixedUse).toBeUndefined();
    const single = await run(asset());
    const res = await MULTI(new NextRequest("http://localhost/api/calc/transfer/multi", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxYear: 2025, properties: [{ propertyId: "p1", propertyLabel: "p1", ...prop, mixedUse: single.mu }], annualBasicDeductionUsed: 0, basicDeductionAllocation: "EARLIEST_TRANSFER", priorPaidTax: 0, priorPaidLocalTax: 0, priorReductionUsage: [] }),
    }));
    expect(res.status).toBe(400);
  });
});
