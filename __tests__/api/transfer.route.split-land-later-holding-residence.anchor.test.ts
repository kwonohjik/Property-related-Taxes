/**
 * Pre-Do anchor — 토지를 건물보다 **나중에** 취득한 분리취득 주택의 토지 파트 거주기간별 공제율 (역방향 · 계획서 split-land-residence-rate-4289 §8)
 *
 * 시료 S2: 건물 2010-03-01 매수 · 토지 2020-03-01 매수 · 2025-01-15 양도 20억(토지 14억·건물 6억) · 1세대 1주택 · 비조정 · 토지 보유 58개월.
 *   손계산·기대값은 엔진 직접 테스트(`__tests__/tax-engine/transfer/split-land-later-holding-residence.engine.test.ts`) 머리말.
 *   (a) 직접 178개월 → 토지 32%(현행 56%) · 45,990,000(현행 28,485,000) · 고지 1건
 *   (b) 구간 입력 겹침 58개월(④가 싣는 `landHoldingResidenceMonths`) → 토지 32% · 45,990,000 · 고지 없음
 *   (c) 직접 60개월 → 토지 32%(현행 36%) · 61,190,000
 *
 * 이 파일은 화면 경로의 서버 쪽 전부(Zod ⑫ → route ⑭ → 엔진)를 잠근다.
 * Pre-Do(구현 전) 실패 메시지: (b)는 ⑫가 새 키를 조용히 strip → 직접 입력과 같은 28,485,000(`expected 28485000 to be 45990000`).
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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  LAND_HOLDING_RESIDENCE_GATE_MESSAGE,
  LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE,
  LAND_HOLDING_RESIDENCE_INVALID_MESSAGE,
} from "@/lib/tax-engine/transfer-land-holding-residence";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

const S2 = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 2_000_000_000,
  transferDate: "2025-01-15",
  acquisitionDate: "2010-03-01",
  landAcquisitionDate: "2020-03-01",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: true,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 178,
  annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 1_400_000_000,
  buildingTransferPrice: 600_000_000,
  landStandardPriceAtTransfer: 1_400_000_000,
  buildingStandardPriceAtTransfer: 600_000_000,
  landAcquisitionPrice: 900_000_000,
  buildingAcquisitionPrice: 100_000_000,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(over: Record<string, unknown>): Promise<{ status: number; body: any; r: any }> {
  const res = await POST(req({ ...S2, ...over }));
  const body = await res.json();
  return { status: res.status, body, r: body?.data?.result };
}

const capNote = (r: { warnings?: string[] }) => (r.warnings ?? []).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("역방향 S2 — route(⑫⑭) → 엔진", () => {
  it("(a) 직접 178개월: 토지 32% · 건물 80% · 45,990,000 · 고지 1건 · 파트 거주 연수 4/14", async () => {
    const { status, r } = await post({});
    expect(status).toBe(200);
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(r.splitDetail.building.longTermRate).toBeCloseTo(0.8, 10);
    expect(r.calculatedTax).toBe(45_990_000);
    expect(r.splitDetail.land.residenceYears).toBe(4);
    expect(r.splitDetail.building.residenceYears).toBe(14);
    expect(capNote(r)).toHaveLength(1);
  });

  it("(b) 구간 입력 겹침 58개월을 ⑫가 받아 ⑭가 엔진에 옮긴다: 같은 32% · 45,990,000 · 고지 없음 (strip되면 직접 입력과 같은 값이라 고지가 남는다)", async () => {
    const { status, r } = await post({ landHoldingResidenceMonths: 58 });
    expect(status).toBe(200);
    expect(r.calculatedTax).toBe(45_990_000);
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(capNote(r)).toHaveLength(0);
  });

  it("⑭ 매핑 확인 — 겹침 24개월을 보내면 토지 거주 2년(24%) · 상한 고지 없음 (직접 입력 상한 58개월이 아니다)", async () => {
    const { r } = await post({ landHoldingResidenceMonths: 24 });
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.24, 10);
    expect(r.splitDetail.land.residenceYears).toBe(2);
    expect(capNote(r)).toHaveLength(0);
  });

  it("(c) 직접 60개월: 토지 32% · 61,190,000 · 고지 1건", async () => {
    const { r } = await post({ residencePeriodMonths: 60 });
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(r.calculatedTax).toBe(61_190_000);
    expect(capNote(r)).toHaveLength(1);
  });

  it("다건(연간 합산) parity — 같은 입력의 건별 산출세액·장특·파트 공제율이 단건과 같다(⑭ 다건 매핑 · 구간 값 포함)", async () => {
    const multiBody = (over: Record<string, unknown>) => ({
      taxYear: 2025,
      properties: [{
        propertyId: "p1", propertyLabel: "p1", ...S2, transferCause: "general", acquisitionMethod: "actual", householdRightCount: 0,
        reductions: [], specialHouseExclusions: [], householdNoPresaleRightsConfirmed: false, ...over,
      }],
      annualBasicDeductionUsed: 0, basicDeductionAllocation: "EARLIEST_TRANSFER", priorPaidTax: 0, priorPaidLocalTax: 0, priorReductionUsage: [],
    });
    const postMulti = async (over: Record<string, unknown>) => {
      const res = await MULTI(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(multiBody(over)) }));
      return { status: res.status, body: await res.json() };
    };
    for (const over of [{}, { landHoldingResidenceMonths: 58 }, { landHoldingResidenceMonths: 24 }, { residencePeriodMonths: 60 }]) {
      const single = await post(over);
      const multi = await postMulti(over);
      expect(multi.status, JSON.stringify(multi.body)).toBe(200);
      const p = multi.body.data.properties[0];
      expect(p.refCalculatedTax, JSON.stringify(over)).toBe(single.r.calculatedTax);
      expect(p.longTermHoldingDeduction, JSON.stringify(over)).toBe(single.r.longTermHoldingDeduction);
      expect(p.splitDetail.land.longTermRate).toBeCloseTo(single.r.splitDetail.land.longTermRate, 12);
      expect(p.splitDetail.land.residenceYears).toBe(single.r.splitDetail.land.residenceYears);
    }
    // 다건도 같은 게이트 — 걸리지 않는 입력(토지가 먼저)에 값이 오면 400
    expect((await postMulti({ landAcquisitionDate: "2000-03-01", landHoldingResidenceMonths: 10 })).status).toBe(400);
  });
});

describe("역방향 — 짝(종전과 같다)", () => {
  it("토지가 먼저 취득(S1과 같은 방향): 상한 없음 — 거주 178개월 그대로", async () => {
    const { r } = await post({ landAcquisitionDate: "2000-03-01" });
    expect(r.splitDetail.land.residenceYears).toBe(14);
    expect(capNote(r)).toHaveLength(0);
  });

  it("같은 날 취득: 상한 없음", async () => {
    const { r } = await post({ landAcquisitionDate: "2010-03-01" });
    expect(r.splitDetail.land.residenceYears).toBe(14);
    expect(capNote(r)).toHaveLength(0);
  });

  it("토지 표2 대상 판정은 건물 거주 그대로 — 거주 23개월(대상 아님·표1): 상한과 무관 · 고지 없음", async () => {
    const { r } = await post({ residencePeriodMonths: 23 });
    expect(capNote(r)).toHaveLength(0);
  });
});

describe("역방향 — ⑫ 차단(엔진·⑧과 같은 leaf)", () => {
  const issues = (body: Record<string, unknown>) => {
    const r = propertySchema.safeParse(body);
    return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  };
  const mine = (body: Record<string, unknown>) => issues(body).filter((i) => i.path.endsWith("landHoldingResidenceMonths"));

  it("기준(58 · 없음)은 issue 0 — 거주 합계(178) 이하는 통과 · 초과 400", async () => {
    expect(issues({ ...S2, landHoldingResidenceMonths: 58 })).toEqual([]);
    expect(issues({ ...S2 })).toEqual([]);
    expect(mine({ ...S2, landHoldingResidenceMonths: 178 })).toEqual([]);
    expect(mine({ ...S2, landHoldingResidenceMonths: 179 })).toEqual([{ path: "landHoldingResidenceMonths", message: LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE }]);
    expect((await post({ landHoldingResidenceMonths: 179 })).status).toBe(400);
  });

  it("토지가 나중 취득이 아니면(먼저·같은 날·건물만 본인) 값이 와도 400 — 조용히 버려지지 않는다 · 토지만 본인은 받는다(V-4)", async () => {
    expect(mine({ ...S2, selfOwns: "land_only", landHoldingResidenceMonths: 10 })).toEqual([]);
    for (const o of [{ landAcquisitionDate: "2000-03-01" }, { landAcquisitionDate: "2010-03-01" }, { selfOwns: "building_only" }]) {
      expect(mine({ ...S2, ...o, landHoldingResidenceMonths: 10 }).map((i) => i.message), JSON.stringify(o)).toContain(LAND_HOLDING_RESIDENCE_GATE_MESSAGE);
    }
    expect((await post({ landAcquisitionDate: "2000-03-01", landHoldingResidenceMonths: 10 })).status).toBe(400);
  });

  it("정수·음수 — 소수·음수는 Zod(정수·0 이상)가 400", async () => {
    expect(issues({ ...S2, landHoldingResidenceMonths: 1.5 }).some((i) => i.path === "landHoldingResidenceMonths")).toBe(true);
    expect(issues({ ...S2, landHoldingResidenceMonths: -1 }).some((i) => i.path === "landHoldingResidenceMonths")).toBe(true);
    expect(LAND_HOLDING_RESIDENCE_INVALID_MESSAGE).toContain("0 이상");
  });
});

describe("역방향 — 함께 양도(컴패니언) 주택 분리취득: ⑫가 키를 받고 ⑭가 엔진에 옮긴다", () => {
  const companion = (o: Partial<AssetForm> = {}) =>
    buildAssetPayload(
      {
        ...makeDefaultAsset(2), assetId: "c1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
        landAcquisitionDate: "2020-03-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
        landAcquisitionPrice: "900000000", buildingAcquisitionPrice: "100000000", actualSalePrice: "2000000000",
        saleSplitMode: "actual", landTransferPrice: "1400000000", buildingTransferPrice: "600000000",
        landStandardPriceAtTransfer: "1400000000", buildingStandardPriceAtTransfer: "600000000", standardPriceAtTransfer: "2000000000",
        ...o,
      } as unknown as AssetForm,
      "actual",
      "2025-01-15",
    ) as Record<string, unknown>;
  const bundled = (c: Record<string, unknown>) => ({
    propertyType: "land", transferDate: "2025-01-15", transferPrice: 300_000_000, acquisitionDate: "2015-01-01", acquisitionPrice: 100_000_000,
    expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
    isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
    standardPriceAtTransferForApportion: 400_000_000, totalSalePrice: 2_300_000_000, bundledSaleMode: "actual", primaryActualSalePrice: 300_000_000,
    companionAssets: [c],
  });
  const post2 = async (c: Record<string, unknown>) => {
    const res = await POST(req(bundled(c)));
    const body = await res.json();
    return { status: res.status, body, comp: body?.data?.aggregated?.properties?.find((p: { propertyId: string }) => p.propertyId === "c1") };
  };

  it("자기 거주 개월을 가진 컴패니언: 키 없음 → 보유 개월 상한(거주 4년) · 구간 겹침 24개월을 보내면 거주 2년(⑫ 통과 · ⑭ 매핑)", async () => {
    const capped = await post2({ ...companion(), residencePeriodMonths: 178 });
    expect(capped.status, JSON.stringify(capped.body.error ?? {})).toBe(200);
    expect(capped.comp.splitDetail.land.residenceYears).toBe(4);
    const exact = await post2({ ...companion(), residencePeriodMonths: 178, landHoldingResidenceMonths: 24 });
    expect(exact.status, JSON.stringify(exact.body.error ?? {})).toBe(200);
    expect(exact.comp.splitDetail.land.residenceYears).toBe(2);
  });

  it("컴패니언도 같은 게이트 — 토지가 먼저인 컴패니언에 값이 오면 400(companionAssets.0.landHoldingResidenceMonths)", async () => {
    const r = await post2({ ...companion({ landAcquisitionDate: "2000-03-01" } as Partial<AssetForm>), residencePeriodMonths: 178, landHoldingResidenceMonths: 24 });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("landHoldingResidenceMonths");
  });
});
