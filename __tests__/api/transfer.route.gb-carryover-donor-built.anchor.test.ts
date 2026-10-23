/**
 * anchor — 일반건물 **건물 파트 이월과세(§97의2) × 증여자가 신축·증축한 건물** 「소득세법」 §114조의2 가산세 (PR-5a · 계획서 §3.2·§9)
 *
 * ## 결함(수정 前)
 * 일반건물 건물 카드는 이월과세(`buildingCarryoverTaxation`·`buildingCarryoverPart`)를 받아도 증여자 신축 가산세가 **입력 경로에서 막혀** 있다
 * (⑫ `rejectDonorBuiltRefine`·`donorBuiltRejectedKey` 400 / 엔진 `assertDonorBuiltInput` 의 `general_building_unit` 거부). 같은 조건의 단건 건물(PR-1)은 붙는다.
 *
 * ## 픽스처 (PR-0b anchor 와 같은 숫자)
 * 총 양도가 1,000,000,000 · 토지 100㎡×2,000,000(양도시 2억) · 건물 양도시 기준시가 2억 → 건물 양도가 5억 ·
 * 증여자 건물 취득 당시 기준시가 1억 → 증여자 환산취득가액(건물분) = 5억 × 1억/2억 = 250,000,000 → 가산세 5% = 12,500,000.
 * 증여자 신축 2022-01-10 · 양도 2026-03-01 (5년 이내) · 증여 등기접수일 2024-05-01 · 증여자 건물 취득일 2015-01-01.
 * 증축 donor(2-way 건물에 donorBuilt.extension): base = 건물 양도가 5억 × 증축 부분 취득 당시 기준시가 5천만 ÷ 건물 양도시 기준시가 2억 = 125,000,000 → 6,250,000.
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

const GB = {
  landArea: 100, buildingArea: 200, buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
  acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
  buildingAcquisitionCause: "carryover_gift" as const, buildingAcquisitionDate: "2024-05-01",
};
const COMMON = {
  propertyType: "general_building" as const,
  transferDate: "2026-03-01", transferPrice: 1_000_000_000, acquisitionDate: "2024-05-01", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[],
  annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
/** 엔진 모양(legacy) 이월과세 서브객체 */
const ct = (over: object = {}) => ({
  giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: 0,
  useEstimatedAcquisition: true, giftTaxAmount: 0, giftDateValuation: 800_000_000, donorStandardPriceAtAcquisition: 100_000_000,
  ...over,
});
const DB_NEW = { buildingType: "new", constructionDate: "2022-01-10" };
const DB_EXT = (area: number) => ({ buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: area, extensionStdPriceAtAcquisition: 50_000_000 });

interface Prop {
  propertyId: string; transferGain: number; penaltyTax?: number; penaltyBase?: number;
  carryoverTaxationDetail?: {
    adoptedScenario: string; scenarioA: { acquisitionPrice: number };
    donorBuiltPenalty?: { applied: boolean; notAppliedReason?: string; base?: number; penalty?: number; buildingType?: string };
  };
}
interface Out { status: number; error?: unknown; props: Prop[]; totalTax: number; determinedTax: number; penaltyTax: number; warnings: string[] }
async function post(b: object): Promise<Out> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  }));
  const json = (await res.json()) as { data?: { aggregated?: Record<string, unknown> }; error?: unknown };
  const a = (json.data?.aggregated ?? {}) as Record<string, unknown>;
  return {
    status: res.status, error: json.error, props: (a.properties as Prop[]) ?? [], totalTax: a.totalTax as number,
    determinedTax: a.determinedTax as number, penaltyTax: (a.penaltyTax as number) ?? 0, warnings: (a.warnings as string[]) ?? [],
  };
}
const body = (gb: object = {}, top: object = {}) => ({ ...COMMON, generalBuildingValuation: { ...GB, ...gb }, ...top });
/** 건물 이월과세(legacy 엔진 모양) + donorBuilt */
const withDb = (db: object | undefined, ctOver: object = {}, gb: object = {}) =>
  body({ buildingCarryoverTaxation: { ...ct(ctOver), ...(db ? { donorBuilt: db } : {}) }, ...gb });
const bld = (o: Out, id = "building") => o.props.find((p) => p.propertyId === id)!;
const errText = (o: Out) => JSON.stringify(o.error);

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

describe("DB-1 환산 경로(2-way) — 건물 카드에 증여자 신축 가산세", () => {
  it("A 채택 · 5년 이내: 건물 환산취득가액 250,000,000 × 5% = 12,500,000 · 결정세액 불변 · echo applied", async () => {
    const on = await post(withDb(DB_NEW));
    const off = await post(withDb(undefined));
    expect(on.status, errText(on)).toBe(200);
    expect(off.status).toBe(200);
    expect(bld(on).penaltyBase).toBe(250_000_000);
    expect(bld(on).penaltyTax).toBe(12_500_000);
    expect(on.penaltyTax).toBe(12_500_000);
    expect(on.determinedTax).toBe(off.determinedTax); // §92③ — 가산세는 결정세액 밖
    expect(on.totalTax - off.totalTax).toBe(13_750_000); // 12,500,000 + 지방소득세 10%
    expect(bld(on).carryoverTaxationDetail?.donorBuiltPenalty).toMatchObject({ applied: true, base: 250_000_000, penalty: 12_500_000, buildingType: "new" });
    expect(bld(off).penaltyTax ?? 0).toBe(0);
    // 토지 카드는 어떤 경우에도 가산세가 없다 (D4 건물분만)
    for (const p of on.props.filter((x) => x.propertyId !== "building")) expect(p.penaltyTax ?? 0).toBe(0);
  });

  it("신축 2020-12-31(양도일 2026-03-01 기준 5년 초과): 가산세 0 · echo outside_penalty_window", async () => {
    const r = await post(withDb({ ...DB_NEW, constructionDate: "2020-12-31" }));
    expect(r.status, errText(r)).toBe(200);
    expect(bld(r).penaltyTax ?? 0).toBe(0);
    expect(bld(r).carryoverTaxationDetail?.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
  });

  it("②3호 B 채택(수증자 기준이 더 큰 세액): 가산세 0 · echo scenario_b", async () => {
    // 증여 당시 평가액 1억 → B 양도차익 4억(단기 세율) > A → B 채택
    const r = await post(withDb(DB_NEW, { giftDateValuation: 100_000_000 }));
    expect(r.status, errText(r)).toBe(200);
    expect(bld(r).carryoverTaxationDetail?.adoptedScenario).toBe("B");
    expect(bld(r).penaltyTax ?? 0).toBe(0);
    expect(bld(r).carryoverTaxationDetail?.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });

  it("증여자 증축 85㎡(경계 — 초과만 대상): 0 / 85.01㎡: base 125,000,000 · 6,250,000", async () => {
    const at85 = await post(withDb(DB_EXT(85)));
    expect(at85.status, errText(at85)).toBe(200);
    expect(bld(at85).penaltyTax ?? 0).toBe(0);
    const over = await post(withDb(DB_EXT(85.01)));
    expect(over.status, errText(over)).toBe(200);
    expect(bld(over).penaltyBase).toBe(125_000_000);
    expect(bld(over).penaltyTax).toBe(6_250_000);
    expect(bld(over).carryoverTaxationDetail?.donorBuiltPenalty).toMatchObject({ applied: true, buildingType: "extension", base: 125_000_000 });
  });

  it("donorBuilt 부재 회귀: 이월과세 건물 총납부 166,177,880 · 가산세 0 (수정 前 실측 — 이 픽스처의 PR-0b 이후 현행)", async () => {
    const r = await post(withDb(undefined));
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(166_177_880);
    expect(r.penaltyTax).toBe(0);
    expect(bld(r).carryoverTaxationDetail?.donorBuiltPenalty).toBeUndefined();
  });
});

describe("DB-2 실가 경로 · 신규 파트 모양 — 같은 카드 형태라 같은 결과", () => {
  it("실가 경로(actualPriceMode): 12,500,000", async () => {
    const r = await post(withDb(DB_NEW, {}, { actualPriceMode: true, landAcquisitionDate: "2015-01-01" }));
    expect(r.status, errText(r)).toBe(200);
    expect(bld(r).penaltyBase).toBe(250_000_000);
    expect(bld(r).penaltyTax).toBe(12_500_000);
  });

  it("신규 파트 모양(carryoverGiftEvent + buildingCarryoverPart.donorBuilt): 12,500,000 — ⑭ fromPart 갈래", async () => {
    const part = {
      donorAcquisitionDate: "2015-01-01", giftDateAssetValue: 800_000_000, useEstimatedAcquisition: true,
      donorStandardPriceAtAcquisition: 100_000_000, donorBuilt: DB_NEW,
    };
    const r = await post(body({
      carryoverGiftEvent: { giftRegistryDate: "2024-05-01", giftTaxCalculated: 0, giftTaxBase: 800_000_000 },
      buildingCarryoverPart: part,
    }));
    expect(r.status, errText(r)).toBe(200);
    expect(bld(r).penaltyBase).toBe(250_000_000);
    expect(bld(r).penaltyTax).toBe(12_500_000);
  });
});

/** 400 의 이유까지 고정한다 — 「donorBuilt 를 통째로 거부」하던 종전 상태와 구별하려고 fieldErrors 경로·메시지를 본다. */
function expectRejected(o: Out, pathPart: string, msgPart: string) {
  expect(o.status).toBe(400);
  const fe = (o.error as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
  const hit = Object.entries(fe).find(([k]) => k.includes(pathPart));
  expect(hit, JSON.stringify(fe)).toBeDefined();
  expect(hit![1].join(" ")).toContain(msgPart);
}

describe("DB-3 ⑫ 거부 — 계산에 닿을 수 없는 조합은 침묵 무시 대신 400 (이유까지 고정)", () => {
  it("환산 OFF(실지거래가액 승계) + donorBuilt → 환산일 때만", async () => {
    expectRejected(
      await post(withDb(DB_NEW, { useEstimatedAcquisition: false, donorAcquisitionPrice: 200_000_000, donorStandardPriceAtAcquisition: undefined })),
      "buildingCarryoverTaxation.donorBuilt", "환산취득가액으로 계산할 때만",
    );
  });
  it("건물 취득원인이 본인 신축 + donorBuilt → 본인 신축과 다른 축(이중 부과 방지)", async () => {
    expectRejected(await post(withDb(DB_NEW, {}, { buildingAcquisitionCause: "newConstruction" })), "buildingCarryoverTaxation.donorBuilt", "본인 신축과 다른 축");
  });
  it("건물 취득원인이 매매 + donorBuilt → 이월과세일 때만", async () => {
    expectRejected(await post(withDb(DB_NEW, {}, { buildingAcquisitionCause: "purchase" })), "buildingCarryoverTaxation.donorBuilt", "이월과세(증여)일 때만");
  });
  it("증축(3-way) 동시 입력", async () => {
    expectRejected(
      await post(withDb(DB_NEW, {}, {
        extensionInfo: {
          extensionDate: "2022-06-01", extensionArea: 100, extensionFloorArea85: 100,
          transferExtensionBuildingStdPrice: 50_000_000, acquisitionExtensionBuildingStdPrice: 20_000_000,
          extensionAcquisitionCause: "newConstruction", acquisitionMode: "estimated",
        },
      })),
      "buildingCarryoverTaxation.donorBuilt", "3-way",
    );
  });
  it("신축일이 증여 등기접수일 이후 / 증여자 취득일 이전", async () => {
    expectRejected(await post(withDb({ ...DB_NEW, constructionDate: "2024-06-01" })), "donorBuilt.constructionDate", "증여 등기접수일 이전");
    expectRejected(await post(withDb({ ...DB_NEW, constructionDate: "2014-12-31" })), "donorBuilt.constructionDate", "증여자 취득일 이후");
  });
  it("증축인데 바닥면적·증축 부분 기준시가 누락", async () => {
    expectRejected(await post(withDb({ buildingType: "extension", constructionDate: "2022-01-10", extensionStdPriceAtAcquisition: 50_000_000 })), "donorBuilt.extensionFloorArea", "바닥면적");
    expectRejected(await post(withDb({ buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 100 })), "donorBuilt.extensionStdPriceAtAcquisition", "기준시가");
  });
  it("일체 주택 건물분 입력(housing)은 받지 않는다 — 카드가 이미 건물분", async () => {
    const housing = { landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000, landStdPriceAtTransfer: 240_000_000, buildingStdPriceAtTransfer: 160_000_000 };
    expectRejected(await post(withDb({ ...DB_NEW, housing })), "buildingCarryoverTaxation.donorBuilt.housing", "housing");
  });
  it("토지 쪽 이월과세의 donorBuilt 는 거부 유지(가산세는 건물분만)", async () => {
    expectRejected(
      await post(body({ buildingAcquisitionCause: "purchase", landAcquisitionCause: "carryover_gift", landCarryoverTaxation: { ...ct(), donorBuilt: DB_NEW } })),
      "landCarryoverTaxation.donorBuilt", "아직 지원하지 않습니다",
    );
  });
  it("부담부증여 + 건물 이월과세 donorBuilt → 엔진 방어선이 막는다", async () => {
    const r = await post({ ...withDb(DB_NEW), transferType: "burdened_gift" });
    expect(r.status).toBe(400);
  });
});

describe("DB-3b 신규 파트 모양(⑫ Part) 거부", () => {
  const part = (over: object = {}, db: object = DB_NEW) => ({
    donorAcquisitionDate: "2015-01-01", giftDateAssetValue: 800_000_000, useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 100_000_000, donorBuilt: db, ...over,
  });
  const ev = { giftRegistryDate: "2024-05-01", giftTaxCalculated: 0, giftTaxBase: 800_000_000 };
  it("증여 사건(carryoverGiftEvent) 없이 파트만 → 조용히 버려지므로 거부", async () => {
    expectRejected(await post(body({ buildingCarryoverPart: part() })), "buildingCarryoverPart.donorBuilt", "증여 사건");
  });
  it("환산 OFF · 신축일 범위 · 증축 필수 칸 — 엔진 모양과 같은 규칙", async () => {
    expectRejected(await post(body({ carryoverGiftEvent: ev, buildingCarryoverPart: part({ useEstimatedAcquisition: false, donorAcquisitionPrice: 1, donorStandardPriceAtAcquisition: undefined }) })), "buildingCarryoverPart.donorBuilt", "환산취득가액으로 계산할 때만");
    expectRejected(await post(body({ carryoverGiftEvent: ev, buildingCarryoverPart: part({}, { ...DB_NEW, constructionDate: "2024-06-01" }) })), "buildingCarryoverPart.donorBuilt.constructionDate", "증여 등기접수일 이전");
    expectRejected(await post(body({ carryoverGiftEvent: ev, buildingCarryoverPart: part({}, { buildingType: "extension", constructionDate: "2022-01-10", extensionStdPriceAtAcquisition: 5 }) })), "buildingCarryoverPart.donorBuilt.extensionFloorArea", "바닥면적");
  });
  it("housing 키는 .strict() 로 거부", async () => {
    const r = await post(body({ carryoverGiftEvent: ev, buildingCarryoverPart: part({}, { ...DB_NEW, housing: { landArea: 1 } }) }));
    expect(r.status).toBe(400);
  });
  it("본인 신축 · 증축 3-way 동시 입력도 파트 모양에서 같은 이유로 거부", async () => {
    expectRejected(await post(body({ carryoverGiftEvent: ev, buildingCarryoverPart: part(), buildingAcquisitionCause: "newConstruction" })), "buildingCarryoverPart.donorBuilt", "본인 신축과 다른 축");
  });
  it("토지 파트(landCarryoverPart)의 donorBuilt 는 거부 유지", async () => {
    expectRejected(await post(body({ carryoverGiftEvent: ev, landCarryoverPart: part({}, DB_NEW), buildingAcquisitionCause: "purchase", landAcquisitionCause: "carryover_gift" })), "landCarryoverPart.donorBuilt", "아직 지원하지 않습니다");
  });
});

describe("DB-4 지분(축 B) — 지분 카드마다 자기 건물 이월과세 donorBuilt", () => {
  it("지분 B(40%)만 건물 이월과세 + donorBuilt: 건물 base = 200,000,000 × 1억/2억 = 100,000,000 → 5,000,000", async () => {
    const level = {
      landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000,
      transferBuildingStdPrice: 200_000_000, zoneType: "general_residential" as const,
    };
    const shareA = {
      shareId: "share-a", shareLabel: "60% 지분", ownershipRatio: 0.6, acquisitionDate: "2009-03-01",
      valuation: { ...level, acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000, buildingAcquisitionCause: "purchase" as const },
    };
    const shareB = (db?: object) => ({
      shareId: "share-b", shareLabel: "40% 지분", ownershipRatio: 0.4, acquisitionDate: "2024-05-01",
      valuation: {
        ...level, acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
        buildingAcquisitionCause: "carryover_gift" as const, buildingAcquisitionDate: "2024-05-01",
        buildingCarryoverTaxation: { ...ct({ giftDateValuation: 320_000_000 }), ...(db ? { donorBuilt: db } : {}) },
      },
    });
    const mk = (db?: object) => ({
      ...COMMON, transferPrice: 1_000_000_000, totalPropertyTransferPrice: 1_000_000_000, acquisitionDate: "2009-03-01",
      generalBuildingValuation: shareA.valuation, generalBuildingShares: [shareA, shareB(db)],
    });
    const off = await post(mk());
    const on = await post(mk(DB_NEW));
    expect(off.status, errText(off)).toBe(200);
    expect(on.status, errText(on)).toBe(200);
    expect(on.penaltyTax).toBe(5_000_000);
    expect(on.determinedTax).toBe(off.determinedTax);
    const penalised = on.props.filter((p) => (p.penaltyTax ?? 0) > 0);
    expect(penalised.map((p) => p.propertyId)).toEqual(["building#1"]);
    expect(penalised[0].penaltyBase).toBe(100_000_000);
  });
});
