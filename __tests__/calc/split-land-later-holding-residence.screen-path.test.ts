/**
 * 역방향 화면 경로 — 폼(①②③) → ④ 전송(구간 겹침 개월) → fetch body(⑬) → 실제 route(⑫⑭) → 엔진
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 (시료 S2 — 건물 2010-03-01 · 토지 2020-03-01 · 2025-01-15 양도 20억)
 * 엔진·route 직접 입력은 `__tests__/tax-engine/transfer/split-land-later-holding-residence.engine.test.ts`·
 * `__tests__/api/transfer.route.split-land-later-holding-residence.anchor.test.ts`가 잠근다. 이 파일은 **폼 값에서 시작**한다.
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-property-payload";
import { buildLandHoldingResidencePayload, landHoldingResidenceApplies } from "@/lib/calc/transfer-land-holding-residence-scope";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { aAsset, aForm } from "./_helpers/split-carryover-a-form";

const interval = (...periods: [string, string][]): Partial<AssetForm> =>
  ({ residenceInputMode: "interval", residencePeriods: periods.map(([moveInDate, moveOutDate]) => ({ moveInDate, moveOutDate })) }) as Partial<AssetForm>;
const direct = (months: string): Partial<AssetForm> =>
  ({ residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: months }) as Partial<AssetForm>;

/** S2 — 일반 주택 분리취득(별개 취득 토글 ON): 건물 2010-03-01 매수 → 토지 2020-03-01 매수. */
const asset = (o: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2020-03-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "900,000,000",
    buildingAcquisitionPrice: "100,000,000",
    actualSalePrice: "2,000,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "1,400,000,000",
    buildingTransferPrice: "600,000,000",
    landStandardPriceAtTransfer: "1,400,000,000",
    buildingStandardPriceAtTransfer: "600,000,000",
    ...interval(["2010-06-01", "2025-01-15"]),
    ...o,
  }) as unknown as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: "2025-01-15",
    filingDate: "2025-03-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "2000000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "0",
  }) as unknown as TransferFormData;

async function body(a: AssetForm): Promise<Record<string, unknown>> {
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

async function route(b: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
        ...b,
      }),
    }),
  );
  const json = await res.json();
  return { status: res.status, json, r: json?.data?.result };
}

const capNote = (r: { warnings?: string[] }) => (r.warnings ?? []).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("④⑬ → ⑫⑭ → 엔진 — S2 화면 경로", () => {
  it("구간 입력 2010-06-01~2025-01-15(175개월): ④가 겹침 58개월을 싣는다 · 토지 32% · 건물 80% · 45,990,000 · 상한 고지 없음", async () => {
    const b = await body(asset());
    expect(b.landHoldingResidenceMonths).toBe(58);
    expect(b.residencePeriodMonths).toBe(175);
    const { status, json, r } = await route(b);
    expect(status, JSON.stringify(json.error ?? {})).toBe(200);
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(r.splitDetail.building.longTermRate).toBeCloseTo(0.8, 10);
    expect(r.calculatedTax).toBe(45_990_000);
    expect(capNote(r)).toHaveLength(0);
  });

  it("직접 입력 178개월: 새 키 없음 · 엔진이 보유 개월로 상한 — 같은 32% · 45,990,000 · 고지 1건", async () => {
    const b = await body(asset(direct("178")));
    expect(b).not.toHaveProperty("landHoldingResidenceMonths");
    const { status, r } = await route(b);
    expect(status).toBe(200);
    expect(r.calculatedTax).toBe(45_990_000);
    expect(capNote(r)).toHaveLength(1);
  });

  it("토지 취득 전에만 거주한 구간(2010-06-01~2015-05-31 = 60개월): 겹침 0 — 토지 거주분 없음(16%) · 건물은 60개월 그대로(60%) · 직접 입력 60개월이면 32%", async () => {
    const b = await body(asset(interval(["2010-06-01", "2015-05-31"])));
    expect(b.landHoldingResidenceMonths).toBe(0);
    expect(b.residencePeriodMonths).toBe(60);
    const { r } = await route(b);
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.16, 10);
    expect(r.splitDetail.building.longTermRate).toBeCloseTo(0.6, 10);
    expect(capNote(r)).toHaveLength(0);
    const d = await route(await body(asset(direct("60"))));
    expect(d.r.splitDetail.land.longTermRate).toBeCloseTo(0.32, 10);
  });

  it("구간이 토지 취득일에 걸친 경우 걸친 부분만(2018-03-01~2022-02-28 중 2020-03-01부터 = 24개월) · 구간 여러 개는 합산(2020-06-01~2023-05-31 36개월 + 2012-01-01~2019-12-31 → 36)", async () => {
    const straddle = await body(asset(interval(["2018-03-01", "2022-02-28"])));
    expect(straddle.landHoldingResidenceMonths).toBe(24);
    expect(straddle.residencePeriodMonths).toBe(48);
    const multi = await body(asset(interval(["2012-01-01", "2019-12-31"], ["2020-06-01", "2023-05-31"])));
    expect(multi.landHoldingResidenceMonths).toBe(36);
    const { status, r } = await route(multi);
    expect(status).toBe(200);
    expect(r.splitDetail.land.residenceYears).toBe(3);
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.28, 10); // 보유 4년 16% + 거주 3년 12%
  });

  it("짝 — 토지가 먼저(2000-03-01)·같은 날: 새 키 없음(stale 방지) · 종전 거주 연수", async () => {
    for (const land of ["2000-03-01", "2010-03-01"]) {
      const b = await body(asset({ landAcquisitionDate: land }));
      expect(b, land).not.toHaveProperty("landHoldingResidenceMonths");
      const { status, r } = await route(b);
      expect(status, land).toBe(200);
      expect(r.splitDetail.land.residenceYears, land).toBe(14);
    }
  });

  it("짝 — 일반건물(토지 취득일이 건물보다 늦은 분리 입력): 새 키 없음 · route 200(⑫ 게이트에 걸리지 않는다)", async () => {
    const gb = { assetKind: "general_building", acquisitionDate: "1988-05-01", landAcquisitionDate: "2000-01-01" } as Partial<AssetForm>;
    const b = await body(asset(gb));
    expect(b).not.toHaveProperty("landHoldingResidenceMonths");
  });

  it("🔑 토지만 본인(V-4): 토글 없이도 토지 취득일이 실려 같은 겹침 58개월을 싣는다 · 건물만 본인은 키 없음", async () => {
    const lo = { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false } as Partial<AssetForm>;
    expect((await body(asset(lo))).landHoldingResidenceMonths).toBe(58);
    expect((await body(asset({ ...lo, hasSeperateLandAcquisitionDate: false } as Partial<AssetForm>))).landHoldingResidenceMonths).toBe(58);
    expect(await body(asset({ selfOwns: "building_only" } as Partial<AssetForm>))).not.toHaveProperty("landHoldingResidenceMonths");
  });

  it("짝 — 별개 취득 토글 OFF 잔재(토지·건물 모두 본인): 새 키 없음", async () => {
    // 토글을 껐으면 토지 취득일 잔재를 싣지 않는다 — 분리 계산 자체가 아니다
    expect(await body(asset({ hasSeperateLandAcquisitionDate: false } as Partial<AssetForm>))).not.toHaveProperty("landHoldingResidenceMonths");
  });
});

describe("다건(연간 합산) ④ — 단건과 같은 leaf", () => {
  it("구간 입력이면 다건 payload도 같은 겹침 개월을 싣는다 · 직접 입력·토지가 먼저면 싣지 않는다", () => {
    const m = buildPropertyPayload(form(asset())) as Record<string, unknown>;
    expect(m.landHoldingResidenceMonths).toBe(58);
    expect(buildPropertyPayload(form(asset(direct("178")))) as Record<string, unknown>).not.toHaveProperty("landHoldingResidenceMonths");
    expect(buildPropertyPayload(form(asset({ landAcquisitionDate: "2000-03-01" }))) as Record<string, unknown>).not.toHaveProperty("landHoldingResidenceMonths");
  });
});

describe("④ leaf — buildLandHoldingResidencePayload", () => {
  const periods = interval(["2010-06-01", "2025-01-15"]);
  const sent = { propertyType: "housing", landAcquisitionDate: "2020-03-01", buildingAcquisitionDate: "2010-03-01" };
  it("게이트 — 나중 취득 ∧ 구간 입력일 때만 값을 싣는다", () => {
    expect(buildLandHoldingResidencePayload(periods as never, sent)).toEqual({ landHoldingResidenceMonths: 58 });
    expect(buildLandHoldingResidencePayload(direct("178") as never, sent)).toEqual({});
    expect(buildLandHoldingResidencePayload(periods as never, { ...sent, landAcquisitionDate: "2010-03-01" })).toEqual({});
    expect(buildLandHoldingResidencePayload(periods as never, { ...sent, selfOwns: "land_only" })).toEqual({ landHoldingResidenceMonths: 58 });
    expect(buildLandHoldingResidencePayload(periods as never, { ...sent, selfOwns: "building_only" })).toEqual({});
    expect(buildLandHoldingResidencePayload(periods as never, { propertyType: "housing", buildingAcquisitionDate: "2010-03-01" })).toEqual({});
    // 분리 계산 대상 자산(주택·건물)이 아니면 싣지 않는다 — 일반건물·겸용주택은 ⑫가 막는다
    expect(buildLandHoldingResidencePayload(periods as never, { ...sent, propertyType: "general_building" })).toEqual({});
    expect(buildLandHoldingResidencePayload(periods as never, { ...sent, propertyType: "mixed-use-house" })).toEqual({});
    expect(buildLandHoldingResidencePayload(periods as never, { ...sent, propertyType: "building" })).toEqual({ landHoldingResidenceMonths: 58 });
    expect(buildLandHoldingResidencePayload(periods as never, { ...sent, landAcquisitionDate: undefined })).toEqual({});
  });
  it("퇴거일이 빈 구간은 0개월(자동 양도일 보정 없음 — 거주 합산과 같은 규칙)", () => {
    expect(buildLandHoldingResidencePayload(interval(["2020-06-01", ""]) as never, sent)).toEqual({ landHoldingResidenceMonths: 0 });
  });
});

describe("⑧ ⇒ ⑫ — ④가 실은 값은 ⑫를 항상 통과한다(구간 격자)", () => {
  const grids: [string, string][][] = [
    [["2010-06-01", "2025-01-15"]],
    [["2010-06-01", "2015-05-31"]],
    [["2019-01-01", "2020-02-29"]],
    [["2020-03-01", "2025-01-15"]],
    [["2020-03-01", "2020-03-01"]],
    [["2012-01-01", "2019-12-31"], ["2020-06-01", "2023-05-31"]],
    [["2018-03-01", "2022-02-28"], ["2022-06-01", "2025-01-15"]],
  ];
  for (const g of grids)
    it(`구간 ${JSON.stringify(g)} → 200`, async () => {
      const b = await body(asset(interval(...g)));
      const { status, json } = await route(b);
      expect(status, JSON.stringify(json.error ?? {})).toBe(200);
      expect(b.landHoldingResidenceMonths as number).toBeLessThanOrEqual(b.residencePeriodMonths as number);
    });
});

describe("⑤ 표시 술어 ≡ ④ 전송 — landHoldingResidenceApplies(폼) ⇔ 구간 입력 body에 키가 실린다(3중 패턴 격자)", () => {
  const cells: [string, Partial<AssetForm>][] = [
    ["토지가 나중", {}],
    ["토지가 먼저", { landAcquisitionDate: "2000-03-01" }],
    ["같은 날", { landAcquisitionDate: "2010-03-01" }],
    ["별개 취득 토글 OFF(토지 취득일 잔재)", { hasSeperateLandAcquisitionDate: false } as Partial<AssetForm>],
    ["토지만 본인", { selfOwns: "land_only" } as Partial<AssetForm>],
    ["토지만 본인 · 별개 취득 토글 OFF(④는 토지 취득일을 그대로 싣는다)", { selfOwns: "land_only", hasSeperateLandAcquisitionDate: false } as Partial<AssetForm>],
    ["건물만 본인", { selfOwns: "building_only" } as Partial<AssetForm>],
    ["일반건물", { assetKind: "general_building" } as Partial<AssetForm>],
    ["건물(비주택)", { assetKind: "building" } as Partial<AssetForm>],
    ["토지 취득일 빈칸", { landAcquisitionDate: "" }],
  ];
  for (const [name, o] of cells)
    it(name, async () => {
      const a = asset(o);
      const b = await body(a);
      expect("landHoldingResidenceMonths" in b, name).toBe(landHoldingResidenceApplies(a));
    });
});

describe("파트 이월과세(토지만 이월과세 + 건물 매매) — 토지가 나중 취득이어도 싣지 않는다(엔진 시나리오가 파트 취득일을 치환한다)", () => {
  it("P3 A 시드(건물 2021-03-01 · 토지 증여 2023-03-01) 구간 입력: ④ body에 새 키 없음 · ⑤ 술어도 거짓 · route 200", async () => {
    const a = aAsset("purchase", { ...interval(["2021-04-01", "2025-06-30"]) });
    expect(landHoldingResidenceApplies(a)).toBe(false);
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    await callTransferTaxAPI(aForm("purchase", {}, a));
    vi.unstubAllGlobals();
    expect(cap.body).not.toHaveProperty("landHoldingResidenceMonths");
    expect(cap.body).toHaveProperty("carryoverGiftEvent"); // 이월과세 사건은 그대로 실린다
  });
});
