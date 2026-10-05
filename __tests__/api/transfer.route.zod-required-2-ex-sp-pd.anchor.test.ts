/**
 * 양도세 ⑫ — Zod↔엔진 필수 점검 **2차분 (EX · SP · PD)** (2026-09-30).
 * 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.2 · refine `lib/api/transfer-tax-schema-required-refines-2a.ts`.
 *
 * 🔴 = 수정 전 실측(비우면) → 수정 후 400 + 정확한 경로. 🟢 = 값이 있으면 200 + 수정 전과 같은 세액.
 * ⚖️ = ⑧↔⑫ 정합 — 폼이 ⑧을 통과하면 ④ 본문이 ⑫에서 막히지 않는다(막다른 길 없음).
 *
 * - EX §164⑨: 비우면 엔진이 후보값 0으로 보고 특례를 조용히 끈다 → 200 + 일반 환산 세액.
 *   ⑧과 ⑫는 같은 게이트 술어(`lib/calc/expropriation-required-gate.ts`)를 쓴다.
 * - SP 분리취득: 파트 가액·양도시 기준시가 누락은 엔진이 던져 **경로 없는 400**(§4.3 매핑 전 500),
 *   소유자 분리(동시 취득)의 취득시 기준시가 누락은 **200 + 비소유 파트까지 과세**(227,610,000).
 * - PD 의제 전 상속: 취득가액 원천 5종이 모두 비면 취득가액 0.
 *
 * ⚠️ 세액은 mock 세율표 실측값이다(정본 세액 아님).
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

type Form = ReturnType<typeof createDefaultTransferFormData>;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Json = {
  data?: { result?: { determinedTax?: number; total?: { determinedTax: number } } };
  error?: { fieldErrors?: Record<string, unknown> };
};
async function post(handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) {
  const res = await handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
const single = (body: unknown) => post(SINGLE, "http://localhost/api/calc/transfer", body);
const multi = (body: unknown) => post(MULTI, "http://localhost/api/calc/transfer/multi", body);
const taxOf = (json: Json) => json.data?.result?.determinedTax ?? json.data?.result?.total?.determinedTax;

async function expectRejected(body: unknown, path: string, send = single) {
  const r = await send(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain(path);
}
async function expectTax(body: unknown, tax: number) {
  const r = await single(body);
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  expect(taxOf(r.json)).toBe(tax);
}
const without = <T extends Record<string, unknown>>(o: T, ...keys: string[]) => {
  const c: Record<string, unknown> = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

// ── ⑧ → ④ → route (⚖️ 정합) ───────────────────────────────────────────
function issues(f: Form): string[] {
  return [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
}
async function bodyOf(f: Form): Promise<Record<string, unknown>> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
  try {
    await callTransferTaxAPI(f).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  return body as Record<string, unknown>;
}
function form(asset: Record<string, unknown>, top: Record<string, unknown>): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], ...asset } as Form["assets"][number];
  Object.assign(f, top);
  return f;
}

const BASE = {
  propertyType: "land",
  transferPrice: 1_000_000_000,
  transferDate: "2020-06-01",
  acquisitionPrice: 0,
  acquisitionDate: "2010-06-01",
  expenses: 0,
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAtTransfer: 500_000_000,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
};
/** 특례 미적용 대조군 — 양도시 기준시가 5억이 환산 분모 */
const TAX_NO_SPECIAL = 163_680_000;

// ── EX · §164⑨ ────────────────────────────────────────────────────────
describe("EX §164⑨ — 비우면 400 (종전 200 + 특례가 조용히 빠진 세액)", () => {
  const LAND = {
    ...BASE,
    transferCause: "public_expropriation",
    standardPricePerSqmAtTransfer: 2_500_000,
    transferArea: 200,
    compensationPerSqm: 1_500_000,
    compensationBasisStdPrice: 2_000_000,
  };

  it("EX-1 원/㎡ 트랙 — 🟢 79,159,333 / 🔴 보상가액·보상기초 생략 400 (종전 163,680,000)", async () => {
    await expectTax(LAND, 79_159_333);
    await expectRejected(without(LAND, "compensationPerSqm"), "compensationPerSqm");
    await expectRejected(without(LAND, "compensationBasisStdPrice"), "compensationBasisStdPrice");
  });

  it("EX-1 게이트 밖은 요구하지 않는다 — 수용 아님 · 양도 2009.02.03 · 실가", async () => {
    const bare = without(LAND, "compensationPerSqm", "compensationBasisStdPrice");
    await expectTax({ ...bare, transferCause: "general" }, TAX_NO_SPECIAL);
    const early = await single({ ...bare, transferDate: "2009-02-03", acquisitionDate: "2000-06-01" });
    expect(early.status, JSON.stringify(early.json.error)).toBe(200);
    const actual = await single({ ...bare, useEstimatedAcquisition: false, acquisitionPrice: 300_000_000 });
    expect(actual.status, JSON.stringify(actual.json.error)).toBe(200);
  });

  it("EX-1 이월과세는 요구하지 않는다 — ④가 환산 플래그를 폼과 무관하게 true로 보내 ⑧과 어긋날 수 있다", async () => {
    const r = await single({ ...without(LAND, "compensationPerSqm", "compensationBasisStdPrice"), acquisitionCause: "carryover_gift" });
    const paths = Object.keys(r.json.error?.fieldErrors ?? {});
    expect(paths).not.toContain("compensationPerSqm");
    expect(paths).not.toContain("compensationBasisStdPrice");
  });

  it("EX-1 다건도 같은 규칙 — 🔴 properties.0.compensationPerSqm", async () => {
    await expectRejected(
      {
        taxYear: 2020,
        properties: [{ ...without(LAND, "compensationPerSqm"), propertyId: "p1", propertyLabel: "p1" }],
        annualBasicDeductionUsed: 0,
      },
      "properties.0.compensationPerSqm",
      multi,
    );
  });

  const AUCTION = {
    ...without(LAND, "transferCause", "compensationPerSqm", "compensationBasisStdPrice"),
    isAuctionTransfer: true,
    auctionPrice: 300_000_000,
  };
  it("EX-2 공매·경락 — 🟢 79,159,333 / 🔴 공매·경락가액 생략 400 (종전 163,680,000)", async () => {
    await expectTax(AUCTION, 79_159_333);
    await expectRejected(without(AUCTION, "auctionPrice"), "auctionPrice");
  });

  const HOUSE = {
    ...without(LAND, "compensationPerSqm", "compensationBasisStdPrice", "standardPricePerSqmAtTransfer", "transferArea"),
    propertyType: "housing",
    householdHousingCount: 2,
    housingCompensationTotal: 350_000_000,
    housingCompensationBasisTotal: 400_000_000,
  };
  it("EX-3 주택 총액 트랙 — 🟢 108,822,857 / 🔴 총액 2필드 생략 400 (종전 163,680,000)", async () => {
    await expectTax(HOUSE, 108_822_857);
    await expectRejected(without(HOUSE, "housingCompensationTotal"), "housingCompensationTotal");
    await expectRejected(without(HOUSE, "housingCompensationBasisTotal"), "housingCompensationBasisTotal");
  });

  const SPLIT_BLDG = {
    ...without(LAND, "compensationPerSqm", "compensationBasisStdPrice", "standardPricePerSqmAtTransfer", "transferArea"),
    propertyType: "building",
    transferDate: "2023-06-01",
    acquisitionDate: "2015-06-01",
    landAcquisitionDate: "2010-06-01",
    landStandardPriceAtTransfer: 250_000_000,
    buildingStandardPriceAtTransfer: 250_000_000,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    isSeparateAcquisition: true,
    buildingStandardPriceAtAcquisition: 100_000_000,
    standardPricePerSqmAtAcquisition: 500_000,
    acquisitionArea: 200,
    splitLandCompensationTotal: 150_000_000,
    splitLandCompensationBasisTotal: 200_000_000,
  };
  it("EX-4 건물 split 토지분 — 🟢 121,297,333 / 🔴 토지분 보상 2필드 생략 400 (종전 160,764,000)", async () => {
    await expectTax(SPLIT_BLDG, 121_297_333);
    await expectRejected(without(SPLIT_BLDG, "splitLandCompensationTotal"), "splitLandCompensationTotal");
    await expectRejected(without(SPLIT_BLDG, "splitLandCompensationBasisTotal"), "splitLandCompensationBasisTotal");
  });

  it("EX-4 토지 취득일이 ④ fallback일 수 있으면(같은 날 · 소유자 분리) 토지분 보상을 요구하지 않는다", async () => {
    const bare = without(SPLIT_BLDG, "splitLandCompensationTotal", "splitLandCompensationBasisTotal");
    for (const body of [
      { ...bare, landAcquisitionDate: "2015-06-01" },
      { ...bare, selfOwns: "land_only" },
    ]) {
      const r = await single(body);
      expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("splitLandCompensationTotal");
    }
  });

  const MIXED = {
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: true,
    addressRoad: "서울 강남구 테헤란로 1",
    residentialFloorArea: "60",
    nonResidentialFloorArea: "40",
    buildingFootprintArea: "50",
    mixedUseTotalLandArea: "600",
    mixedZoneType: "general_residential",
    mixedTransferHousingPrice: "900000000",
    mixedTransferCommercialBuildingPrice: "300000000",
    mixedTransferLandPricePerSqm: "2000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqCommercialBuildingPrice: "100000000",
    mixedAcqLandPricePerSqm: "1000000",
    transferCause: "public_expropriation",
    housingCompensationTotal: "700000000",
    housingCompensationBasisTotal: "800000000",
    mixedCommercialLandCompensationTotal: "400000000",
    mixedCommercialLandCompensationBasisTotal: "500000000",
  };
  const MIXED_TOP = {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1,200,000,000",
    householdHousingCount: "2",
    // 명부 필수화(PR-1) — 명부 없이 스칼라만으로 선언(D-4 폴백, Q-8). ⑧ 0행 게이트만 통과시킨다.
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true, // 명부 필수화(PR-D) — 분양권·입주권 없음
    residencePeriodMonths: "0",
  };
  it("EX-5 겸용 — ⚖️ ⑧ 통과 · 🟢 150,265,715 / 🔴 서브객체 4필드 생략 400 (종전 167,408,572·158,037,144)", async () => {
    const f = form(MIXED, MIXED_TOP);
    expect(issues(f)).toEqual([]);
    const b = await bodyOf(f);
    await expectTax(b, 150_265_715);
    // SP 범위 밖 — 겸용 서브객체가 있으면 분리취득 refine은 요구하지 않는다(겸용 엔진이 자체 안분).
    const asHousing = await single({ ...b, propertyType: "housing", landAcquisitionDate: "2009-03-01" });
    expect(Object.keys(asHousing.json.error?.fieldErrors ?? {})).not.toContain("landStandardPriceAtTransfer");
    for (const k of [
      "housingCompensationTotal",
      "housingCompensationBasisTotal",
      "commercialLandCompensationTotal",
      "commercialLandCompensationBasisTotal",
    ]) {
      const mu = { ...(b.mixedUse as Record<string, unknown>) };
      delete mu[k];
      await expectRejected({ ...b, mixedUse: mu }, `mixedUse.${k}`);
    }
  });

  it("⚖️ 토지 수용 폼 — ⑧ 통과 본문은 ⑫를 통과한다", async () => {
    const f = form(
      {
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-06-01",
        addressJibun: "서울 강남구 테스트동 1-1",
        landNature: "independent_bare_land",
        useEstimatedAcquisition: true,
        standardPriceAtAcq: "200,000,000",
        standardPriceAtTransfer: "500,000,000",
        standardPricePerSqmAtTransfer: "2,500,000",
        transferArea: "200",
        acquisitionArea: "200",
        transferCause: "public_expropriation",
        compensationPerSqm: "1,500,000",
        compensationBasisStdPrice: "2,000,000",
      },
      { transferDate: "2020-06-01", filingDate: "2020-08-31", contractTotalPrice: "1,000,000,000", householdHousingCount: "0" },
    );
    expect(issues(f)).toEqual([]);
    const r = await single(await bodyOf(f));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

// ── SP · 토지·건물 분리취득 ─────────────────────────────────────────────
describe("SP 분리취득 — 비우면 400 + 경로 (종전 경로 없는 400·500 또는 200 + 소유분 무시)", () => {
  const SP = {
    ...BASE,
    propertyType: "building",
    useEstimatedAcquisition: false,
    standardPriceAtAcquisition: undefined,
    standardPriceAtTransfer: undefined,
    transferDate: "2023-06-01",
    acquisitionDate: "2015-06-01",
    landAcquisitionDate: "2010-06-01",
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: 100_000_000,
    buildingAcquisitionPrice: 150_000_000,
    saleSplitMode: "apportioned",
    landStandardPriceAtTransfer: 250_000_000,
    buildingStandardPriceAtTransfer: 250_000_000,
  };

  it("SP-1 별개 취득 파트 취득가액 — 🟢 210,810,000 / 🔴 생략 400 + 경로 (종전 경로 없는 400)", async () => {
    await expectTax(SP, 210_810_000);
    await expectRejected(without(SP, "landAcquisitionPrice"), "landAcquisitionPrice");
    await expectRejected(without(SP, "buildingAcquisitionPrice"), "buildingAcquisitionPrice");
  });

  it("SP-1 비소유 파트는 요구하지 않는다 (selfOwns=land_only → 건물 취득가액 불요)", async () => {
    const r = await single({ ...without(SP, "buildingAcquisitionPrice"), selfOwns: "land_only" });
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("buildingAcquisitionPrice");
  });

  it("SP-2 구분양도 근거 — 🟢 토지 양도가 215,010,000 / 🔴 양도가·기준시가 모두 없음 400 + landTransferPrice", async () => {
    await expectTax({ ...SP, saleSplitMode: "actual", landTransferPrice: 400_000_000 }, 215_010_000);
    await expectRejected(
      { ...without(SP, "landStandardPriceAtTransfer", "buildingStandardPriceAtTransfer"), saleSplitMode: "actual" },
      "landTransferPrice",
    );
  });

  it("SP-3 양도시 기준시가 파트별 — 🔴 토지분·건물분 생략 400 + 경로 (구분 기재가 있어도 §100③ 판정에 필요)", async () => {
    await expectRejected(without(SP, "landStandardPriceAtTransfer"), "landStandardPriceAtTransfer");
    await expectRejected(without(SP, "buildingStandardPriceAtTransfer"), "buildingStandardPriceAtTransfer");
    await expectRejected(
      { ...without(SP, "landStandardPriceAtTransfer"), saleSplitMode: "actual", landTransferPrice: 400_000_000 },
      "landStandardPriceAtTransfer",
    );
  });

  const EST = {
    ...SP,
    useEstimatedAcquisition: true,
    standardPriceAtTransfer: 500_000_000,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    standardPricePerSqmAtAcquisition: 500_000,
    acquisitionArea: 200,
    buildingStandardPriceAtAcquisition: 100_000_000,
  };
  it("SP-3 별개 취득 환산 — 취득시 기준시가 파트별 🔴 생략 400 + 경로", async () => {
    const ok = await single(EST);
    expect(ok.status, JSON.stringify(ok.json.error)).toBe(200);
    await expectRejected(without(EST, "buildingStandardPriceAtAcquisition"), "buildingStandardPriceAtAcquisition");
    await expectRejected(without(EST, "standardPricePerSqmAtAcquisition"), "standardPricePerSqmAtAcquisition");
    await expectRejected(without(EST, "acquisitionArea"), "acquisitionArea");
  });

  it("SP-3 양도시 감정평가가액 양쪽이 있으면 기준시가를 요구하지 않는다 (엔진 안분 basis 1순위)", async () => {
    const r = await single({
      ...without(SP, "landStandardPriceAtTransfer", "buildingStandardPriceAtTransfer"),
      landAppraisalAtTransfer: 300_000_000,
      buildingAppraisalAtTransfer: 200_000_000,
    });
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("SP-3 파트가 실가면 그 파트 취득시 기준시가를 요구하지 않는다 (양쪽 실가 = SP 🟢)", async () => {
    const r = await single(SP);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toEqual([]);
  });

  const SO = {
    ...without(SP, "isSeparateAcquisition", "landAcqMode", "buildingAcqMode", "landAcquisitionPrice", "buildingAcquisitionPrice"),
    landAcquisitionDate: "2015-06-01",
    selfOwns: "land_only",
    acquisitionPrice: 250_000_000,
    standardPricePerSqmAtAcquisition: 500_000,
    acquisitionArea: 200,
    standardPriceAtAcquisition: 200_000_000,
  };
  it("SP-4 소유자 분리(동시 취득) — 🟢 99,060,000 / 🔴 취득시 기준시가 3종 생략 400 (종전 200 · 227,610,000 = 비소유 건물분까지 과세)", async () => {
    await expectTax(SO, 99_060_000);
    await expectRejected(without(SO, "standardPricePerSqmAtAcquisition"), "standardPricePerSqmAtAcquisition");
    await expectRejected(without(SO, "acquisitionArea"), "acquisitionArea");
    await expectRejected(without(SO, "standardPriceAtAcquisition"), "standardPriceAtAcquisition");
  });

  // 명부 필수화(PR-1) — 명부 없이 스칼라만으로 선언(D-4 폴백, Q-8). ⑧ 0행 게이트만 통과시킨다.
  const SPLIT_TOP = { transferDate: "2026-03-01", filingDate: "2026-05-31", contractTotalPrice: "500,000,000", householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
  it("⚖️ 별개 취득 주택 폼 — ⑧ 통과 본문은 ⑫를 통과한다", async () => {
    const f = form(
      {
        assetKind: "housing",
        addressJibun: "서울 강남구 테스트동 1-1",
        acquisitionDate: "2020-01-01",
        hasSeperateLandAcquisitionDate: true,
        landAcquisitionDate: "2005-01-01",
        landAcquisitionPrice: "100,000,000",
        buildingAcquisitionPrice: "200,000,000",
        standardPricePerSqmAtAcq: "50000",
        acquisitionArea: "1000",
        buildingStandardPriceAtAcq: "80,000,000",
        standardPriceAtAcq: "130,000,000",
        standardPricePerSqmAtTransfer: "300000",
        transferArea: "1000",
        buildingStandardPriceAtTransfer: "100,000,000",
      },
      SPLIT_TOP,
    );
    expect(issues(f)).toEqual([]);
    const r = await single(await bodyOf(f));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("⚖️ 소유자 분리 주택 폼 — 본인 파트 취득가액을 직접 넣으면 취득시 기준시가를 요구하지 않는다(엔진 비율 불요)", async () => {
    const f = form(
      {
        assetKind: "housing",
        addressJibun: "서울 강남구 테스트동 1-1",
        acquisitionDate: "2010-01-01",
        fixedAcquisitionPrice: "300,000,000",
        selfOwns: "land_only",
        landAcquisitionPrice: "200,000,000",
        standardPricePerSqmAtTransfer: "300,000",
        transferArea: "1000",
        acquisitionArea: "1000",
        buildingStandardPriceAtTransfer: "100,000,000",
      },
      SPLIT_TOP,
    );
    const r = await single(await bodyOf(f));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("SP 범위 밖 — 분리 축이 아니면(토지 취득일·소유자 분리 없음) 파트 필드를 요구하지 않는다", async () => {
    const r = await single({ ...BASE, propertyType: "building", useEstimatedAcquisition: false, acquisitionPrice: 300_000_000 });
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

// ── PD · 의제취득일 전 상속 ──────────────────────────────────────────────
describe("PD-1 의제 전 상속 — 취득가액 원천이 모두 비면 400 (종전 취득가액 0)", () => {
  const PD = {
    ...without(BASE, "standardPriceAtAcquisition", "standardPriceAtTransfer"),
    useEstimatedAcquisition: false,
    acquisitionDate: "1980-03-01",
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: "1970-01-01",
    transferDate: "2024-03-01",
  };
  const ia = (extra: Record<string, unknown>) => ({
    ...PD,
    inheritedAcquisition: { mode: "pre-deemed", inheritanceStartDate: "1980-03-01", assetKind: "land", ...extra },
  });

  it("🟢 ① 상증법 평가액 5천만 → 242,310,000 / 🔴 원천 없음 400 (종전 257,010,000 — 취득가액 0)", async () => {
    await expectTax(ia({ reportedValue: 50_000_000 }), 242_310_000);
    await expectRejected(ia({}), "inheritedAcquisition.reportedValue");
  });

  it("🟢 ③ 환산 → 242,221,800 / 🔴 환산 분모(양도시 기준시가) 없음 400 (종전 256,921,800 — 환산 0)", async () => {
    await expectTax(ia({ standardPriceAtDeemedDate: 10_000_000, standardPriceAtTransfer: 200_000_000 }), 242_221_800);
    await expectRejected(ia({ standardPriceAtDeemedDate: 10_000_000 }), "inheritedAcquisition.standardPriceAtTransfer");
    // 최상위 양도시 기준시가도 엔진 분모로 쓰인다(`standardPriceAtTransfer ?? currentInput.standardPriceAtTransfer`)
    const top = await single({ ...ia({ standardPriceAtDeemedDate: 10_000_000 }), standardPriceAtTransfer: 200_000_000 });
    expect(top.status, JSON.stringify(top.json.error)).toBe(200);
  });

  it("감정가액·매매사례 모드는 요구하지 않는다 (취득가액 소스가 따로 있다)", async () => {
    for (const acquisitionMethod of ["appraisal", "salesCase"]) {
      const r = await single({ ...ia({}), acquisitionMethod, appraisalValue: 50_000_000, similarSalesValue: 50_000_000 });
      expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("inheritedAcquisition.reportedValue");
    }
  });

  it("⚖️ 「가목 확인 불가」 선언 + 환산 폼 — ⑧ 통과 본문(③ 분자·분모 실림)은 ⑫를 통과한다", async () => {
    const f = form(
      {
        assetKind: "land",
        addressJibun: "서울 강남구 테스트동 1-1",
        landNature: "independent_bare_land",
        acquisitionCause: "inheritance",
        acquisitionDate: "1980-03-01",
        decedentAcquisitionDate: "1970-01-01",
        inheritanceAssetKind: "land",
        useEstimatedAcquisition: true,
        standardPriceAtAcq: "10,000,000",
        standardPriceAtTransfer: "200,000,000",
        preDeemedClauseAUnconfirmed: true,
      },
      { transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "1,000,000,000", householdHousingCount: "0" },
    );
    expect(issues(f)).toEqual([]);
    const b = await bodyOf(f);
    expect((b.inheritedAcquisition as { mode: string }).mode).toBe("pre-deemed");
    const r = await single(b);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("post-deemed는 이 규칙 밖이다 (reportedValue 필수는 스키마가 이미 요구)", async () => {
    const r = await single({
      ...PD,
      acquisitionDate: "1995-03-01",
      inheritedAcquisition: {
        mode: "post-deemed",
        inheritanceStartDate: "1995-03-01",
        assetKind: "land",
        reportedValue: 50_000_000,
        reportedMethod: "supplementary",
      },
    });
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});
