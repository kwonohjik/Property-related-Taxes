/**
 * 양도세 ⑫ — 일반건물 필수 입력 2차분 (2026-09-30 · 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.2).
 *
 * 각 케이스의 🟢는 **화면 입력 → ④ 변환 → route** 그대로의 본문이다(⑧ 통과 + 200 + 세액 고정 — 긍정 짝).
 * 🔴는 그 본문에서 값 하나를 뺀 **API 직접 호출**이다. 수정 전(base `6f2f73c25`)에는 200 + 다른 세액
 * (또는 경로 없는 400 — `TaxCalculationError(INVALID_INPUT)`)이었고, 수정 후에는 400 + 정확한 경로다.
 *
 * base 실측(값 있음 → 생략):
 *   I1  두 파트 상속 실가 — 토지 평가액 67,309,000 → 144,606,000 · 건물 평가액 → 82,357,000
 *   I3  분리 ON 두 파트 실가 — 파트 취득가액 76,170,600 → 163,086,000 (취득가액 0)
 *   I3′ 분리 OFF 매매 실가 — 일괄 취득가액 칸을 비우면 ⑧이 통과시키고 160,446,000(취득가액 0) — **UI 도달**
 *   I2  혼합(토지 실가·건물 환산) — 토지 취득가액 생략 → 경로 없는 400(종전 500)
 *   X1  증축 일괄 취득가액 56,292,192 → 148,849,360
 *   Z4·Z5 실가 일괄 — 취득시 기준시가 둘 다 생략 → 경로 없는 400(종전 500) · 한쪽만 생략 → 200(비율 0/1)
 *   Z3  용도지역 오타 → 경로 없는 400(종전 500)
 *   C1~C4 이월과세 94,165,500 → 파트 생략 92,389,000·55,709,500 · 사건 생략 53,933,000 ·
 *         증여자 취득가액 생략 139,876,000·103,576,000
 *   D1  토지 상속 피상속인 취득일(서브객체) 102,421,000 → 163,625,000 · ⑧은 자산 칸을 비워도 통과(최상위 ⑫가 400)
 *
 * ⚠️ 세액은 mock 세율표 실측값이다(정본 세액 아님).
 */
import { describe, it, expect, vi } from "vitest";
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { APPURTENANT_ZONE_OPTIONS } from "@/components/calc/transfer/appurtenant-zone-options";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Body = Record<string, unknown>;

const gbAsset = (over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2010-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2000000",
    gbTransferBuildingValue: "200000000",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "100000000",
    gbZoneType: "general_residential",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    addressJibun: "서울 강남구 역삼동 1",
    ...over,
  }) as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "600000000",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

/** ⑧ step 0 메시지 */
const issues = (a: AssetForm) => collectStepIssues(0, form(a)).map((i) => i.message);

/** 화면 입력 → ④ 본문 (⑧ 통과를 함께 단언) */
async function uiBody(a: AssetForm): Promise<Body> {
  expect(issues(a)).toEqual([]);
  const cap: { body?: Body } = {};
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

type Json = { data?: { aggregated?: { totalTax?: number } }; error?: { fieldErrors?: Record<string, string[]> } };
async function post(body: Body) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...body,
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
      }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
async function expectTax(body: Body, tax: number) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  expect(r.json.data?.aggregated?.totalTax).toBe(tax);
}
async function expectRejected(body: Body, ...paths: string[]) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  const keys = Object.keys(r.json.error?.fieldErrors ?? {});
  for (const p of paths) expect(keys, JSON.stringify(r.json.error)).toContain(p);
}

const gbv = (b: Body) => b.generalBuildingValuation as Body;
const withGb = (b: Body, patch: Body, ...drop: string[]) => {
  const g: Body = { ...gbv(b), ...patch };
  for (const k of drop) delete g[k];
  return { ...b, generalBuildingValuation: g };
};
const G = (k: string) => `generalBuildingValuation.${k}`;

// ── 픽스처 (화면 입력) ─────────────────────────────────────────────
const INHERITED_BOTH = gbAsset({
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  publishedValueAtInheritance: "250000000",
  gbBuildingInheritedValue: "50000000",
  decedentAcquisitionDate: "1995-01-01",
  fixedAcquisitionPrice: "",
});
const SEPARATE = {
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2008-01-01",
  acquisitionDate: "2012-01-01",
  fixedAcquisitionPrice: "",
};
const SEP_BOTH_ACTUAL = gbAsset({
  ...SEPARATE,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "200000000",
  buildingAcquisitionPrice: "80000000",
});
const SEP_MIXED = gbAsset({
  ...SEPARATE,
  landAcqMode: "actual",
  buildingAcqMode: "estimated",
  landAcquisitionPrice: "200000000",
});
const EXTENSION = gbAsset({
  gbHasExtension: true,
  gbExtensionDate: "2016-01-01",
  gbExtensionAcquisitionCause: "newConstruction",
  gbExtensionAcquisitionMode: "estimated",
  gbTransferExtensionBuildingStdPrice: "50000000",
  gbAcquisitionExtensionBuildingStdPrice: "30000000",
});
const CARRY = {
  giftRegistryDate: "2020-01-01",
  donorAcquisitionDate: "2005-01-01",
  donorAcquisitionPrice: "150000000",
  giftDateValuation: "250000000",
  giftTaxCalculated: "20000000",
  giftTaxBase: "400000000",
  donorRelation: "spouse",
  useEstimatedAcquisition: false,
};
const CARRYOVER_BOTH = gbAsset({
  acquisitionCause: "carryover_gift",
  gbBuildingAcquisitionCause: "carryover_gift",
  acquisitionDate: "2020-01-01",
  landAcquisitionDate: "2020-01-01",
  fixedAcquisitionPrice: "400000000",
  carryover: { ...makeDefaultAsset(1).carryover, ...CARRY },
  buildingCarryover: {
    ...makeDefaultAsset(1).carryover,
    ...CARRY,
    donorAcquisitionPrice: "40000000",
    giftDateValuation: "100000000",
  },
});
/** 상속 2023-06 → 양도 2024-03 (1년 미만) — 피상속인 취득일이 세율 보유기간을 가른다 */
const INHERITED_RECENT = gbAsset({
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  acquisitionDate: "2023-06-01",
  landAcquisitionDate: "2023-06-01",
  publishedValueAtInheritance: "250000000",
  gbBuildingInheritedValue: "50000000",
  decedentAcquisitionDate: "1995-01-01",
  fixedAcquisitionPrice: "",
});

describe("I1 — 두 파트 상속 실가: 상속개시일 평가액", () => {
  it("🟢 화면 본문 67,309,000 / 🔴 토지·건물 평가액 생략 400 (종전 144,606,000 · 82,357,000)", async () => {
    const b = await uiBody(INHERITED_BOTH);
    await expectTax(b, 67_309_000);
    await expectRejected(withGb(b, {}, "inheritedLandValue"), G("inheritedLandValue"));
    await expectRejected(withGb(b, {}, "inheritedBuildingValue"), G("inheritedBuildingValue"));
  });
});

describe("I3 — 실가 경로 취득가액 원천(파트 두 칸 또는 일괄)", () => {
  it("🟢 분리 ON 두 파트 76,170,600 / 🔴 파트 생략 400 (종전 163,086,000 — 취득가액 0)", async () => {
    const b = await uiBody(SEP_BOTH_ACTUAL);
    await expectTax(b, 76_170_600);
    await expectRejected(withGb(b, {}, "landAcquisitionPrice"), G("landAcquisitionPrice"));
    await expectRejected(withGb(b, {}, "buildingAcquisitionPrice"), G("buildingAcquisitionPrice"));
    await expectRejected(withGb(b, {}, "landAcquisitionPrice", "buildingAcquisitionPrice"), "acquisitionPrice");
  });

  it("🔴 분리 OFF 매매 실가 — 일괄 취득가액 칸을 비우면 ⑧이 막는다 (종전 통과 + 160,446,000)", () => {
    expect(issues(gbAsset({ fixedAcquisitionPrice: "" })).join()).toMatch(/취득가액을 입력하세요/);
  });

  it("🟢 분리 OFF 매매 실가 — 일괄 취득가액 300,000,000 → 67,309,000 (경계 짝)", async () => {
    const b = await uiBody(gbAsset());
    await expectTax(b, 67_309_000);
    await expectRejected({ ...b, acquisitionPrice: 0 }, "acquisitionPrice");
  });
});

describe("I2 — 환산 경로의 비-환산 파트 실지거래가액", () => {
  it("🟢 토지 실가·건물 환산 52,979,960 / 🔴 토지 취득가액 생략 400 + 경로 (종전 경로 없는 오류)", async () => {
    const b = await uiBody(SEP_MIXED);
    await expectTax(b, 52_979_960);
    await expectRejected(withGb(b, {}, "landAcquisitionPrice"), G("landAcquisitionPrice"));
  });

  it("🟢 토지 환산·건물 실가 / 🔴 건물 취득가액 생략 400 + 경로", async () => {
    const b = await uiBody(
      gbAsset({ ...SEPARATE, landAcqMode: "estimated", buildingAcqMode: "actual", buildingAcquisitionPrice: "80000000" }),
    );
    expect(b.generalBuildingValuation).toBeDefined();
    const r = await post(b);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    await expectRejected(withGb(b, {}, "buildingAcquisitionPrice"), G("buildingAcquisitionPrice"));
  });
});

describe("X1 — 증축 일괄 취득가액", () => {
  it("🟢 56,292,192 / 🔴 일괄 취득가액·자산 취득가액 생략 400 (종전 148,849,360)", async () => {
    const b = await uiBody(EXTENSION);
    await expectTax(b, 56_292_192);
    // 자산 취득가액만 남기면 route가 그 값을 일괄 취득가액으로 쓴다 — 거부하지 않는다(route와 같은 fallback)
    await expectTax(withGb(b, {}, "bundledAcquisitionPrice"), 56_292_192);
    await expectRejected({ ...withGb(b, {}, "bundledAcquisitionPrice"), acquisitionPrice: 0 }, G("bundledAcquisitionPrice"));
  });
});

describe("Z4·Z5 — 실가 경로 취득시 기준시가 (일괄 취득가액 안분)", () => {
  it("🟢 67,309,000 / 🔴 토지·건물 취득시 기준시가 생략 400 + 경로", async () => {
    const b = await uiBody(gbAsset());
    await expectTax(b, 67_309_000);
    await expectRejected(withGb(b, {}, "acquisitionLandPricePerSqm"), G("acquisitionLandPricePerSqm"));
    await expectRejected(withGb(b, {}, "acquisitionBuildingStdPrice"), G("acquisitionBuildingStdPrice"));
    await expectRejected(
      withGb(b, {}, "acquisitionLandPricePerSqm", "acquisitionBuildingStdPrice"),
      G("acquisitionLandPricePerSqm"),
      G("acquisitionBuildingStdPrice"),
    );
  });

  it("🟢 파트 취득가액 두 칸이면 안분이 없어 요구하지 않는다 (거짓 차단 금지)", async () => {
    const b = await uiBody(SEP_BOTH_ACTUAL);
    await expectTax(withGb(b, {}, "acquisitionLandPricePerSqm", "acquisitionBuildingStdPrice"), 76_170_600);
  });
});

describe("Z3 — 용도지역은 §101② 표의 키", () => {
  it("🔴 오타 400 + 경로 (종전 경로 없는 오류)", async () => {
    const b = await uiBody(gbAsset());
    await expectRejected(withGb(b, { zoneType: "generl_residential" }), G("zoneType"));
  });

  it("🟢 화면 선택지 전부 + 레거시 별칭은 받는다", async () => {
    const b = await uiBody(gbAsset());
    const keys = [...APPURTENANT_ZONE_OPTIONS.map((o) => o.value), "agricultural", "nature_preserve", "conservation_green"];
    for (const zoneType of keys) {
      const r = await post(withGb(b, { zoneType }));
      expect(r.status, zoneType).toBe(200);
    }
  });
});

describe("C1~C4 — 일반건물 이월과세 파트 입력", () => {
  it("🟢 94,165,500 / 🔴 파트·사건·증여자 취득가액 생략 400 (종전 200 + 다른 세액)", async () => {
    const b = await uiBody(CARRYOVER_BOTH);
    await expectTax(b, 94_165_500);
    await expectRejected(withGb(b, {}, "landCarryoverPart"), G("landCarryoverPart"));
    await expectRejected(withGb(b, {}, "buildingCarryoverPart"), G("buildingCarryoverPart"));
    await expectRejected(withGb(b, {}, "carryoverGiftEvent"), G("carryoverGiftEvent"));
    const part = (k: string) => gbv(b)[k] as Body;
    await expectRejected(
      withGb(b, { landCarryoverPart: { ...part("landCarryoverPart"), donorAcquisitionPrice: undefined } }),
      G("landCarryoverPart.donorAcquisitionPrice"),
    );
    await expectRejected(
      withGb(b, { buildingCarryoverPart: { ...part("buildingCarryoverPart"), donorAcquisitionPrice: undefined } }),
      G("buildingCarryoverPart.donorAcquisitionPrice"),
    );
    await expectRejected(
      withGb(b, { landCarryoverPart: { ...part("landCarryoverPart"), giftDateAssetValue: 0 } }),
      G("landCarryoverPart.giftDateAssetValue"),
    );
    await expectRejected(
      withGb(b, {
        buildingCarryoverPart: { ...part("buildingCarryoverPart"), useEstimatedAcquisition: true, donorAcquisitionPrice: undefined },
      }),
      G("buildingCarryoverPart.donorStandardPriceAtAcquisition"),
    );
    // Σ 파트 평가액(250,000,000 + 100,000,000) > 과세가액
    await expectRejected(
      withGb(b, { carryoverGiftEvent: { ...(gbv(b).carryoverGiftEvent as Body), giftTaxBase: 300_000_000 } }),
      G("carryoverGiftEvent.giftTaxBase"),
    );
  });

  it("🟢 이월과세는 일괄 취득가액 칸이 없다 — 비워도 ⑧·⑫ 모두 통과한다 (I3·I3′의 제외 조건)", async () => {
    const b = await uiBody({ ...CARRYOVER_BOTH, fixedAcquisitionPrice: "" });
    expect(b.acquisitionPrice ?? 0).toBe(0);
    const r = await post(b);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("🟢 관계 「그 외」는 엔진이 이월과세를 적용하지 않는다 — 증여자 값을 요구하지 않는다", async () => {
    const b = await uiBody(CARRYOVER_BOTH);
    const r = await post(
      withGb(b, {
        carryoverGiftEvent: { ...(gbv(b).carryoverGiftEvent as Body), donorRelation: "other" },
        landCarryoverPart: { ...(gbv(b).landCarryoverPart as Body), donorAcquisitionPrice: undefined },
      }),
    );
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

describe("D1 — 토지 상속 피상속인 취득일", () => {
  it("🟢 102,421,000 / 🔴 서브객체 피상속인 취득일 생략 400 (종전 163,625,000 — 단기세율)", async () => {
    const b = await uiBody(INHERITED_RECENT);
    await expectTax(b, 102_421_000);
    await expectRejected(withGb(b, {}, "decedentAcquisitionDate"), G("decedentAcquisitionDate"));
  });

  it("🔴 ⑧ — 자산의 피상속인 취득일을 비우면 막는다 (종전 ⑧ 통과 → 최상위 ⑫ 400 막다른 길)", () => {
    expect(issues({ ...INHERITED_RECENT, decedentAcquisitionDate: "" }).join()).toMatch(/피상속인 취득일을 입력하세요\. 상속받은 토지/);
  });
});
