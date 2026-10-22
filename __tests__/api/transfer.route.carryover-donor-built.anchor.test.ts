/**
 * anchor — 이월과세 × 증여자 신축·증축 §114조의2 가산세 · API 경로 (⑫ Zod · ⑭ route 매핑)
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-1)
 *
 * 침묵 strip 방지가 이 파일의 존재 이유다 — ⑫에 없는 키는 400이 아니라 200 + 가산세 0으로 조용히 사라진다(TS 미감지).
 *  · DBR-1 단건 인라인 shape(⑫)·route 매핑(⑭)을 지나 엔진에 닿는다 — 비주택 25,000,000 / 일체 주택 건물분 9,375,000
 *  · DBR-2 ⑫ 거부 — 실가 승계·자산 종류·PHD·취득원인·일체 주택 입력 누락
 *  · DBR-3 컴패니언(엔진 shape)은 수용하고 ⑭가 일자를 Date 로 바꾼다 / GB 파트·split 파트 wire 는 명시 거부(침묵 strip 금지)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { carryoverTaxationEngineShape, generalBuildingValuationSchema } from "@/lib/api/transfer-tax-building-schemas";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { splitCarryoverBuildingPartShape, splitCarryoverPartShape } from "@/lib/api/transfer-tax-schema-split-carryover";
import { buildCompanionEngineInputs } from "@/app/api/calc/transfer/bundled-split-helpers";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const HOUSING = {
  landPricePerSqmAtAcquisition: 1_000_000,
  landArea: 100,
  buildingStdPriceAtAcquisition: 60_000_000,
  landStdPriceAtTransfer: 240_000_000,
  buildingStdPriceAtTransfer: 160_000_000,
};
const BASE = {
  transferPrice: 1_000_000_000,
  transferDate: "2026-03-01",
  acquisitionPrice: 0,
  acquisitionDate: "2024-05-01",
  expenses: 0,
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAtTransfer: 400_000_000,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  acquisitionCause: "carryover_gift",
};
const CT = {
  giftRegistryDate: "2024-05-01",
  donorAcquisitionDate: "2022-01-10",
  useEstimatedAcquisition: true,
  giftTaxAmount: 0,
  giftDateValuation: 800_000_000,
};
const body = (type: "building" | "housing", donorBuilt?: object, over: object = {}, ctOver: object = {}) => ({
  ...BASE,
  propertyType: type,
  carryoverTaxation: { ...CT, ...ctOver, ...(donorBuilt ? { donorBuilt } : {}) },
  ...over,
});
const DB_NEW = { buildingType: "new", constructionDate: "2022-01-10" };

interface Result {
  penaltyTax: number;
  penaltyBase: number;
  totalTax: number;
  carryoverTaxationDetail?: { donorBuiltPenalty?: { applied: boolean; notAppliedReason?: string; base?: number } };
}
async function call(b: object): Promise<{ status: number; result?: Result; error?: unknown }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
  const json = (await res.json()) as { data?: { result: Result }; error?: unknown };
  return { status: res.status, result: json.data?.result, error: json.error };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("DBR-1 ⑫·⑭ — donorBuilt 가 엔진에 닿는다 (strip 이면 가산세 0)", () => {
  it("비주택 건물 A 채택: 가산세 25,000,000 · 총납부 197,837,200 (donorBuilt 없으면 170,337,200)", async () => {
    const on = await call(body("building", DB_NEW));
    expect(on.status, JSON.stringify(on.error)).toBe(200);
    expect(on.result!.penaltyTax).toBe(25_000_000);
    expect(on.result!.totalTax).toBe(197_837_200);
    expect(on.result!.carryoverTaxationDetail?.donorBuiltPenalty).toMatchObject({ applied: true, base: 500_000_000 });
    const off = await call(body("building"));
    expect(off.result!.penaltyTax).toBe(0);
    expect(off.result!.totalTax).toBe(170_337_200);
  });

  it("일체 주택 건물분: base 187,500,000 · 가산세 9,375,000 · 총납부 180,649,700", async () => {
    const r = await call(body("housing", { ...DB_NEW, housing: HOUSING }));
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(r.result!.penaltyBase).toBe(187_500_000);
    expect(r.result!.penaltyTax).toBe(9_375_000);
    expect(r.result!.totalTax).toBe(180_649_700);
  });

  it("일체 주택 구분 기재(sale) 와이어도 닿는다 — 토지 7억/건물 3억 → base 140,625,000", async () => {
    const r = await call(
      body("housing", { ...DB_NEW, housing: { ...HOUSING, sale: { landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000 } } }),
    );
    expect(r.result!.penaltyBase).toBe(140_625_000);
  });

  it("②3호 B 채택: 가산세 0 · 총납부 현행(218,900,000)과 같다", async () => {
    const r = await call(body("building", DB_NEW, {}, { giftDateValuation: 500_000_000 }));
    expect(r.result!.penaltyTax).toBe(0);
    expect(r.result!.totalTax).toBe(218_900_000);
    expect(r.result!.carryoverTaxationDetail?.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });
});

describe("DBR-2 ⑫ 거부 — 조용히 무시하지 않는다 (400)", () => {
  it.each([
    ["실가 승계(환산 OFF)", () => body("building", DB_NEW, { useEstimatedAcquisition: false }, { useEstimatedAcquisition: false, donorAcquisitionPrice: 100_000_000 })],
    ["신축일이 증여자 취득일보다 앞", () => body("building", { ...DB_NEW, constructionDate: "2021-01-01" })],
    ["증축인데 바닥면적 없음", () => body("building", { buildingType: "extension", constructionDate: "2022-01-10", extensionStdPriceAtAcquisition: 80_000_000 })],
    ["일체 주택인데 housing 없음", () => body("housing", DB_NEW)],
    ["토지", () => body("building", DB_NEW, { propertyType: "land" })],
    ["취득 원인이 이월과세가 아님", () => body("building", DB_NEW, { acquisitionCause: "gift" })],
  ])("%s", async (_label, make) => {
    const r = await call(make());
    expect(r.status).toBe(400);
  });
});

describe("DBR-2b ⑫ 자체가 거부한다 (엔진 throw 와 별개 계층 — route 400 은 둘 중 하나만 있어도 통과하므로 Zod 를 직접 본다)", () => {
  const issuesOf = (b: object) => {
    const r = propertySchema.safeParse(b);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}`);
  };
  it("정상 입력은 통과한다 (대조군)", () => {
    expect(propertySchema.safeParse(body("building", DB_NEW)).success).toBe(true);
    expect(propertySchema.safeParse(body("housing", { ...DB_NEW, housing: HOUSING })).success).toBe(true);
  });
  it("실가 승계 / 신축일 범위 밖 / 증축 칸 누락 / 일체 주택 housing 누락 / 자산 종류 / 취득 원인", () => {
    expect(issuesOf(body("building", DB_NEW, {}, { useEstimatedAcquisition: false, donorAcquisitionPrice: 1 }))).toContain("carryoverTaxation.donorBuilt");
    expect(issuesOf(body("building", { ...DB_NEW, constructionDate: "2021-01-01" }))).toContain("carryoverTaxation.donorBuilt.constructionDate");
    expect(
      issuesOf(body("building", { buildingType: "extension", constructionDate: "2022-01-10" })).filter((p) => p.startsWith("carryoverTaxation.donorBuilt")),
    ).toEqual(expect.arrayContaining(["carryoverTaxation.donorBuilt.extensionFloorArea", "carryoverTaxation.donorBuilt.extensionStdPriceAtAcquisition"]));
    expect(issuesOf(body("housing", DB_NEW))).toContain("carryoverTaxation.donorBuilt.housing");
    expect(issuesOf(body("building", DB_NEW, { propertyType: "land" }))).toContain("carryoverTaxation.donorBuilt");
    expect(issuesOf(body("building", DB_NEW, { acquisitionCause: "gift" }))).toContain("carryoverTaxation.donorBuilt");
  });
  it("일체 주택 sale 의 음수·소수 / housing 양수 제약", () => {
    expect(propertySchema.safeParse(body("housing", { ...DB_NEW, housing: { ...HOUSING, landStdPriceAtTransfer: 0 } })).success).toBe(false);
    expect(propertySchema.safeParse(body("housing", { ...DB_NEW, housing: { ...HOUSING, sale: { landTransferPrice: -1 } } })).success).toBe(false);
  });
});

describe("DBR-3 컴패니언 ⑭ · wire 별 수용/거부", () => {
  const COMPANION = {
    assetId: "c1",
    assetLabel: "이월과세 건물",
    assetKind: "building" as const,
    standardPriceAtTransfer: 400_000_000,
    standardPriceAtTransferForApportion: 400_000_000,
    directExpenses: 0,
    isOneHousehold: false,
    reductions: [] as unknown[],
    acquisitionCause: "carryover_gift" as const,
    acquisitionDate: "2024-05-01",
    donorAcquisitionDate: "2022-01-10",
    carryoverTaxation: { ...CT, donorBuilt: DB_NEW },
  };

  it("엔진 shape(컴패니언)는 donorBuilt 를 보존한다 (단건 인라인 shape 과 parity)", () => {
    const parsed = carryoverTaxationEngineShape.parse({ ...CT, donorBuilt: DB_NEW });
    expect(parsed.donorBuilt).toMatchObject({ buildingType: "new", constructionDate: "2022-01-10" });
  });

  it("⑭ 컴패니언 매핑이 신축일을 Date 로 변환한다 (string 이면 Date 비교가 침묵 false)", () => {
    const [engineInput] = buildCompanionEngineInputs(
      COMPANION as never,
      { allocatedSalePrice: 500_000_000, allocatedAcquisitionPrice: 0, allocatedExpenses: 0 },
      {
        transferDate: new Date("2026-03-01"),
        mixedUseCtx: null,
        primaryAcquisitionCause: "purchase",
        primaryEngineInput: {
          householdHousingCount: 1,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          residencePeriodMonths: 0,
          propertyType: "land",
        },
      },
    );
    expect(engineInput.carryoverTaxation!.donorBuilt!.constructionDate).toBeInstanceOf(Date);
  });

  it("GB 파트(land/buildingCarryoverTaxation)는 거부 — 받아서 무시하지 않는다", () => {
    type Field = { safeParse: (v: unknown) => { success: boolean } };
    const shape = (generalBuildingValuationSchema as unknown as { shape: Record<string, Field> }).shape;
    expect(shape.landCarryoverTaxation).toBeDefined(); // 키가 없으면 아래 단언이 공허해진다
    expect(shape.buildingCarryoverTaxation).toBeDefined();
    expect(shape.landCarryoverTaxation.safeParse({ ...CT }).success).toBe(true);
    expect(shape.landCarryoverTaxation.safeParse({ ...CT, donorBuilt: DB_NEW }).success).toBe(false);
    expect(shape.buildingCarryoverTaxation.safeParse({ ...CT, donorBuilt: DB_NEW }).success).toBe(false);
  });

  it("split 파트 wire — 토지 파트(splitCarryoverPartShape)는 donorBuilt 거부, 건물 파트(splitCarryoverBuildingPartShape)만 수용(PR-3)", () => {
    const part = { donorAcquisitionDate: "2020-01-01", donorAcquisitionPrice: 100_000_000 };
    expect(splitCarryoverPartShape.safeParse(part).success).toBe(true);
    expect(splitCarryoverPartShape.safeParse({ ...part, donorBuilt: DB_NEW }).success).toBe(false);
    expect(splitCarryoverBuildingPartShape.safeParse({ ...part, donorBuilt: DB_NEW }).success).toBe(true);
  });
});
