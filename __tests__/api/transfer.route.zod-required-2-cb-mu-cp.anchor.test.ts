/**
 * 양도세 ⑫ — Zod↔엔진 필수 불일치 2차분 (상가 CB1 · 겸용 MU-4~7 · 컴패니언 CP-1·2·4·5).
 * 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.2.
 *
 * 각 행은 **비우면 200 + 다른 세액**(또는 500)이었다. 수정 후: 비우면 400 + 정확한 경로,
 * 값이 있으면 200 + 종전과 같은 세액(🟢 긍정 짝). 조건은 각 refine 주석의 ⑧ 위치의 거울이다.
 *
 * 본문은 가능한 한 **④가 실제로 만든 것**을 쓴다(폼 → `callTransferTaxAPI` 가로채기) — ⑧을 통과한
 * 본문에서 한 키만 지워 API 직접 호출을 흉내 낸다. 그래서 긍정 짝은 곧 「UI 경로는 막히지 않는다」다.
 *
 * ⚠️ 세액은 mock 세율표 실측값이다(정본 세액 아님). 괄호 안 「종전」은 수정 전 base 실측이다.
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
/** 단건·겸용·일괄 응답에서 결정세액(일괄은 합계) */
function taxOf(json: Body): number {
  const d = json.data;
  return d.aggregated?.totalTax ?? d.result?.total?.determinedTax ?? d.result?.determinedTax;
}
async function expectTax(body: unknown, tax: number) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  expect(taxOf(r.json)).toBe(tax);
}
async function expectRejected(body: unknown, path: string) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain(path);
}

/** ④ 본문을 가로챈다 (fetch stub) */
async function bodyOf(f: TransferFormData): Promise<Body> {
  let body: Body | undefined;
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
  return body!;
}
const issues = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));

// ── CB1 상가 §164⑥ 산식 괄호 단서(§164⑧ 준용) ─────────────────────────
const CB_BASE = {
  propertyType: "commercial_building",
  transferPrice: 1_000_000_000,
  transferDate: "2021-06-01",
  acquisitionPrice: 0,
  acquisitionDate: "2001-05-10",
  expenses: 0,
  useEstimatedAcquisition: true,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
};
/** 취득당시 합계(1,000,000 × 100 + 120,000,000) = 최초고시당시 합계 → 괄호 단서 해당 */
const CBV = {
  isPreDisclosure: true,
  exclusiveArea: 150,
  commonArea: 50,
  landArea: 100,
  unitPriceAtTransfer: 2_500_000,
  unitPriceAtFirstDisclosure: 1_200_000,
  buildingStdPriceAtAcquisition: 120_000_000,
  buildingStdPriceAtFirstDisclosure: 120_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landPriceAtAcquisition: 1_000_000,
  landPriceAtFirstDisclosure: 1_000_000,
  landPriceAtTransfer: 3_000_000,
};

describe("CB1 상가 — 두 시점 기준시가합이 같으면 전기 기준시가합(B) 필수 (⑧ `validateCommercialEstimatedAsset`)", () => {
  it("🟢 B 있음 → 128,552,000 / 🔴 B 생략 → 400 (종전 200 · 117,184,000 — 분모 대체 없이 비율 1)", async () => {
    await expectTax({ ...CB_BASE, commercialBuildingValuation: { ...CBV, prevStdPriceSum: 200_000_000 } }, 128_552_000);
    await expectRejected({ ...CB_BASE, commercialBuildingValuation: CBV }, "commercialBuildingValuation.prevStdPriceSum");
  });
  it("🟢 두 합계가 다르면 B를 요구하지 않는다 (142,446,222 — 종전과 같음)", async () => {
    await expectTax(
      { ...CB_BASE, commercialBuildingValuation: { ...CBV, landPriceAtFirstDisclosure: 1_500_000 } },
      142_446_222,
    );
  });
  it("🟢 호별고시 후 취득(isPreDisclosure=false)은 대상이 아니다", async () => {
    const r = await post({
      ...CB_BASE,
      acquisitionDate: "2008-05-10",
      commercialBuildingValuation: { ...CBV, isPreDisclosure: false, unitPriceAtAcquisition: 1_200_000 },
    });
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("commercialBuildingValuation.prevStdPriceSum");
  });
});

// ── MU 겸용주택 ──────────────────────────────────────────────────────
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
};
function mixedForm(over: Record<string, unknown> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], ...MIXED, ...over } as TransferFormData["assets"][number];
  Object.assign(f, {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1,200,000,000",
    householdHousingCount: "2",
    // 명부 필수화(PR-1) — 명부 없이 스칼라만으로 선언(D-4 폴백, Q-8). ⑧ 0행 게이트만 통과시킨다.
    householdNoOtherHousesConfirmed: true,
    residencePeriodMonths: "0",
  });
  return f;
}
const ACTUAL = { useEstimatedAcquisition: false, fixedAcquisitionPrice: "500000000" };
const APPRAISAL = { useEstimatedAcquisition: false, isAppraisalAcquisition: true, fixedAcquisitionPrice: "500000000" };
const INHERIT = {
  acquisitionCause: "inheritance",
  acquisitionDate: "2010-03-01",
  decedentAcquisitionDate: "2000-01-01",
  useEstimatedAcquisition: false,
  mixedHousingInheritedValueOverride: "400000000",
  mixedCommercialInheritedValueOverride: "200000000",
};

describe("MU-4 겸용 실가·감정 안분 — 총액 필수 (⑧ `validateMixedUseAsset` 매매 실가 블록)", () => {
  it.each([
    ["실거래가 — 🟢 총액 있음 → 169,060,001 / 🔴 생략 → 400 (종전 200 · 315,810,001 — 취득가액 0)", ACTUAL, 169_060_001],
    ["감정가액 — 🟢 총액 있음 → 163,180,001 / 🔴 생략 → 400 (종전 200 · 309,636,001 — 취득가액 0)", APPRAISAL, 163_180_001],
  ] as const)("%s", async (_n, over, tax) => {
    const f = mixedForm(over);
    expect(issues(f)).toEqual([]);
    const b = await bodyOf(f);
    await expectTax(b, tax);
    const c = structuredClone(b);
    delete c.mixedUse.acquisitionActualTotalPrice;
    await expectRejected(c, "mixedUse.acquisitionActualTotalPrice");
  });
});

describe("MU-5 겸용 실가·감정 안분 — 안분 비율의 취득시 개별주택공시가격 필수", () => {
  it.each([
    ["실거래가 — 🔴 생략 → 400 (종전 200 · 194,599,915 — 주택분 안분 비율 0)", ACTUAL],
    ["감정가액 — 🔴 생략 → 400 (종전 200 · 187,288,915 — 주택분 안분 비율 0)", APPRAISAL],
  ] as const)("%s", async (_n, over) => {
    const b = await bodyOf(mixedForm(over));
    delete b.mixedUse.acquisitionStandardPrice.housingPrice;
    await expectRejected(b, "mixedUse.acquisitionStandardPrice.housingPrice");
  });
});

describe("MU-6 겸용 상속·증여 — 주택분 평가액(신고가액 또는 개별주택가격) 필수 (⑧ `validateMixedUseInheritanceAsset`)", () => {
  it("🟢 신고가액 있음 → 145,860,000", async () => {
    const f = mixedForm(INHERIT);
    expect(issues(f)).toEqual([]);
    await expectTax(await bodyOf(f), 145_860_000);
  });
  it("🟢 신고가액 없이 개별주택가격만 → 200 (⑧도 통과시킨다 — `override || mixedAcqHousingPrice`)", async () => {
    const b = await bodyOf(mixedForm(INHERIT));
    delete b.mixedUse.housingInheritedValue;
    const r = await post(b);
    expect(r.status).toBe(200);
  });
  it("🔴 둘 다 없음 → 400 (종전 500 — 엔진 `resolveHousingInheritedAcqDirect`가 던졌다)", async () => {
    const b = await bodyOf(mixedForm(INHERIT));
    delete b.mixedUse.housingInheritedValue;
    delete b.mixedUse.acquisitionStandardPrice.housingPrice;
    await expectRejected(b, "mixedUse.housingInheritedValue");
  });
  it("🟢 PHD(§164⑦) 경로는 개별주택가격 없이도 요구하지 않는다 — ⑧과 같은 게이트", async () => {
    const b = await bodyOf(mixedForm(INHERIT));
    delete b.mixedUse.housingInheritedValue;
    delete b.mixedUse.acquisitionStandardPrice.housingPrice;
    b.mixedUse.usePreHousingDisclosure = true;
    const r = await post(b);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("mixedUse.housingInheritedValue");
  });
});

describe("MU-7 propertyType=mixed-use-house인데 `mixedUse` 없음", () => {
  it("🟢 있음 → 175,236,001 / 🔴 생략 → 400 (종전 200 · 315,810,000 — 평범한 주택으로 계산)", async () => {
    const b = await bodyOf(mixedForm());
    expect(b.propertyType).toBe("mixed-use-house");
    await expectTax(b, 175_236_001);
    const c = structuredClone(b);
    delete c.mixedUse;
    await expectRejected(c, "mixedUse");
  });
});

// ── CP 컴패니언 ──────────────────────────────────────────────────────
const asset = (id: number, over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(id),
    addressJibun: `서울 강남구 테스트동 ${id}`,
    assetKind: "land",
    landNature: "standalone",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    standardPriceAtTransfer: "500000000",
    ...over,
  }) as AssetForm;
function bundle(companion: Record<string, unknown>): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets: [asset(1), asset(2, { standardPriceAtTransfer: "300000000", ...companion })],
    contractTotalPrice: "1600000000",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    bundledSaleMode: "apportioned",
  } as unknown as TransferFormData;
}
const INH_COMP = {
  acquisitionCause: "inheritance",
  acquisitionDate: "2010-03-01",
  decedentAcquisitionDate: "2000-01-01",
  fixedAcquisitionPrice: "",
  publishedValueAtInheritance: "200000000",
  acquisitionArea: "100",
};
const NEW_COMP = {
  assetKind: "housing",
  acquisitionCause: "newConstruction",
  acquisitionDate: "",
  occupancyApprovalDate: "2012-05-01",
  fixedAcquisitionPrice: "250000000",
};

describe("CP-1 컴패니언 상속 — 상속 평가액(①) 또는 §163⑨ ② 운반 필수 (⑧ `postDeemedClauseARequiredError`)", () => {
  /**
   * ④는 이제 ①을 `inheritanceValuation`과 `inheritedAcquisition`(CP-3 — 주 자산과 같은 빌더) **두 곳에** 싣는다.
   * API 직접 호출 결함은 「둘 다 없음」이다 — 종전 base에는 `inheritedAcquisition` 칸이 없었으므로 종전 본문은
   * `inheritanceValuation` 하나만 지운 것과 같다(그때 385,275,000).
   */
  const omitClauseA = (b: Body) => {
    delete b.companionAssets[0].inheritanceValuation;
    delete b.companionAssets[0].inheritedAcquisition;
  };
  it("🟢 있음 → 318,747,000 / 🔴 생략 → 400 (종전 200 · 385,275,000 — 취득가액 0)", async () => {
    const f = bundle(INH_COMP);
    expect(issues(f)).toEqual([]);
    const b = await bodyOf(f);
    await expectTax(b, 318_747_000);
    omitClauseA(b);
    await expectRejected(b, "companionAssets.0.inheritanceValuation");
  });
  it("🔴 평가액 0(① 미입력)이고 §163⑨ ②·의제 전 환산도 없음 → 400", async () => {
    const b = await bodyOf(bundle(INH_COMP));
    b.companionAssets[0].inheritanceValuation.publishedValueAtInheritance = 0;
    delete b.companionAssets[0].inheritedAcquisition;
    await expectRejected(b, "companionAssets.0.inheritanceValuation");
  });
  it("🟢 구 계약 — `inheritanceValuation` 없이 `fixedAcquisitionPrice`(route가 취득가액으로 쓰는 명시 값)는 통과", async () => {
    const b = await bodyOf(bundle(INH_COMP));
    omitClauseA(b);
    b.companionAssets[0].fixedAcquisitionPrice = 200_000_000;
    await expectTax(b, 318_747_000);
  });
  it("🟢 pre-deemed(1985.1.1. 前)는 요구하지 않는다 — ⑧이 「가목 확인 불가」 선언으로 ③을 허용한다", async () => {
    const b = await bodyOf(bundle({ ...INH_COMP, acquisitionDate: "1980-03-01", decedentAcquisitionDate: "1970-01-01" }));
    omitClauseA(b);
    const r = await post(b);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("companionAssets.0.inheritanceValuation");
  });
});

describe("CP-2 컴패니언 신축 — 신축비용(취득가액) 필수 (⑧ `validateAssetAcquisition` 신축 분기)", () => {
  it("🟢 있음 → 311,817,000 / 🔴 생략 → 400 (종전 200 · 401,907,000 — 취득가액 0)", async () => {
    const b = await bodyOf(bundle(NEW_COMP));
    expect(b.companionAssets[0].acquisitionDate).toBe("2012-05-01"); // ④가 4시점 중 가장 이른 날을 싣는다
    await expectTax(b, 311_817_000);
    delete b.companionAssets[0].fixedAcquisitionPrice;
    await expectRejected(b, "companionAssets.0.fixedAcquisitionPrice");
  });
});

describe("CP-4·5 컴패니언 취득일 — route가 주 자산 취득일로 대신 채우던 것 제거 (C) + 필수", () => {
  it.each([
    ["상속 — 🟢 있음 → 318,747,000 / 🔴 생략 → 400 (종전 200 · 315,051,000 — 주 자산 취득일 2009-03-01로 계산)", INH_COMP, 318_747_000],
    ["신축 — 🟢 있음 → 311,817,000 / 🔴 생략 → 400 (종전 200 · 298,881,000 — 주 자산 취득일로 계산)", NEW_COMP, 311_817_000],
  ] as const)("%s", async (_n, comp, tax) => {
    const b = await bodyOf(bundle(comp));
    await expectTax(b, tax);
    delete b.companionAssets[0].acquisitionDate;
    await expectRejected(b, "companionAssets.0.acquisitionDate");
  });

  it("🟢 이월과세 컴패니언 — ④가 주 자산과 같은 규칙(증여 등기접수일)으로 취득일을 싣는다", async () => {
    const f = bundle({
      acquisitionCause: "carryover_gift",
      acquisitionDate: "",
      fixedAcquisitionPrice: "",
      carryover: {
        ...CARRYOVER_DEFAULTS,
        giftRegistryDate: "2020-05-01",
        donorAcquisitionDate: "2005-01-01",
        donorRelation: "spouse",
        donorAcquisitionPrice: "100000000",
        giftDateValuation: "250000000",
        useEstimatedAcquisition: false,
      },
    });
    const b = await bodyOf(f);
    expect(b.companionAssets[0].acquisitionDate).toBe("2020-05-01");
  });
});
