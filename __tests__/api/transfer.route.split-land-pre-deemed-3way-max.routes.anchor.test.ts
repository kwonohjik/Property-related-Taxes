/**
 * 1985.1.1. 전 상속 토지 파트(D1) 3자 max — ③ 분자(`landSec164ValueWhole`, ② 지분 반영 전)가 **세 경로**(단건 · 다건 · 컴패니언)의
 * ④→⑫→⑭→엔진을 끝까지 건너는지 + ⑧과 ⑫가 같은 판정인지 (계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §13).
 *
 * 시드: D1-4a 앵커(`transfer.route.split-land-sec164.d1-4a.routes.anchor.test.ts`)와 같고 토지 상속일만 1980-05-01, 양도시 토지 기준시가 4억.
 *   ② = 350,000,000(등급 환산 — 등급 칸 라벨은 1985 전이면 「의제취득일(1985.1.1.) 유효 등급」) · ③ = 7억 × 3.5억 ÷ 4억 = 612,500,000 → ③ 채택.
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";

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


// 건물 양도시 기준시가 3억 — 구분 기재 토지 7억이 기준시가 안분값(12억 × 4 ÷ 7 = 6.857억)과 30% 안이라 그대로 쓰인다(소득세법 §100③).
const PRE = { landAcquisitionDate: "1980-05-01", landStandardPriceAtTransfer: "400,000,000", buildingStandardPriceAtTransfer: "300,000,000" } as Partial<AssetForm>;
/** ⑧ — 자산 단계(0)·세대 단계(1)를 함께 본다. 세대 확인 칸 두 개는 이 시드와 무관하므로 채운다. */
const issues8 = (a: AssetForm) => {
  const f = { ...form(a), householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true } as ReturnType<typeof form>;
  return [...collectStepIssues(0, f), ...collectStepIssues(1, f)];
};

describe("단건 — 화면 ④ body → route (⑫⑭ 포함) · ⑧ 같은 판정", () => {
  async function single(a: AssetForm) {
    const body = await bodyOf(() => callTransferTaxAPI(form(a)));
    const res = await post(SINGLE, "http://l/api/calc/transfer", { ...body, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0 });
    return { body, status: res.status, json: (await res.json()) as { data?: { result?: Obj & { splitDetail?: { land?: Obj } } }; error?: unknown } };
  }
  it("④가 ② 지분 반영 전 값을 보내고 ③ 612,500,000이 채택된다 · ⑧ 통과", async () => {
    const a = asset(PRE);
    expect(issues8(a)).toEqual([]);
    const { body, status, json } = await single(a);
    expect(body.landSec164Value).toBe(350_000_000);
    expect(body.landSec164ValueWhole).toBe(350_000_000);
    expect(status, JSON.stringify(json.error)).toBe(200);
    expect(json.data?.result?.splitDetail?.land?.acquisitionBasis).toMatchObject({ adopted: "converted", converted: 612_500_000 });
    expect(json.data?.result?.splitDetail?.land?.acqMode).toBe("estimated");
  });
  it("지분 50%: ②는 지분 몫, ③ 분자는 전체 값으로 따로 간다", async () => {
    const body = await bodyOf(() => callTransferTaxAPI(form(asset({ ...PRE, ownershipNumerator: "1", ownershipDenominator: "2" } as Partial<AssetForm>))));
    expect(body.landSec164ValueWhole).toBe(350_000_000);
    expect(body.landSec164Value).toBe(175_000_000);
  });
  it("1988(의제취득일 뒤)은 ③ 분자를 보내지 않는다", async () => {
    const body = await bodyOf(() => callTransferTaxAPI(form(asset({ landStandardPriceAtTransfer: "400,000,000", buildingStandardPriceAtTransfer: "300,000,000" }))));
    expect(body.landSec164ValueWhole).toBeUndefined();
  });
  it("양도시 토지 기준시가 비움 → ⑧ 차단(같은 leaf) ∧ ⑫ 400", async () => {
    const a = asset({ ...PRE, landStandardPriceAtTransfer: "" });
    expect(issues8(a).map((i) => i.message).join(" ")).toMatch(/양도시 토지 기준시가를 입력하세요/);
    expect((await single(a)).status).toBe(400);
  });
  // 양도시 감정평가가액이 안분 basis면 V7(양도시 기준시가 파트별 필수)이 건너뛰어진다 — ③ 분모는 이 leaf만 지킨다.
  it("감정평가 안분 + 양도시 토지 기준시가 비움 → ⑧·⑫ 모두 leaf 문구로 차단 (대조: 기준시가 있으면 200)", async () => {
    const appraisal = { landAppraisalAtTransfer: "700,000,000", buildingAppraisalAtTransfer: "500,000,000", appraisalDateAtTransfer: "2026-05-01" } as Partial<AssetForm>;
    const a = asset({ ...PRE, ...appraisal, landStandardPriceAtTransfer: "" });
    expect(issues8(a).map((i) => i.message).join(" ")).toMatch(/양도시 토지 기준시가를 입력하세요/);
    const r = await single(a);
    expect(r.status).toBe(400);
    // ⑫(Zod)에서 칸을 지목해 막는다 — 엔진까지 가서 던지면 같은 문구라도 fieldErrors가 없다
    const err = r.json.error as { message: string; fieldErrors?: { path: string; message: string }[] };
    expect(err.message).toBe("입력값이 올바르지 않습니다");
    expect(JSON.stringify(err.fieldErrors)).toMatch(/landStandardPriceAtTransfer.*양도시 토지 기준시가를 입력하세요/);
    const ok = await single(asset({ ...PRE, ...appraisal }));
    expect(ok.status, JSON.stringify(ok.json.error)).toBe(200);
  });
});

describe("다건 — /api/calc/transfer/multi ⑭", () => {
  async function multi(a: AssetForm) {
    const mf = { taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
    const body = await bodyOf(() => callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: form(a), completionPercent: 100 }]));
    const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
    return { status: res.status, json: (await res.json()) as { data?: { totalTax: number }; error?: unknown } };
  }
  it("③ 도달: 다건도 ③을 쓴다 — ⑭ 매핑을 지우면 엔진이 ③ 분자 없음으로 던진다", async () => {
    const m = await multi(asset(PRE));
    expect(m.status, JSON.stringify(m.json.error)).toBe(200);
    // ③(6.125억) 채택은 ② 채택(3.5억)보다 세액이 작다 — 같은 입력의 1988 판(③ 없음)과 비교
    const later = await multi(asset({ landStandardPriceAtTransfer: "400,000,000", buildingStandardPriceAtTransfer: "300,000,000" }));
    expect(m.json.data!.totalTax).toBeLessThan(later.json.data!.totalTax);
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
      landAcquisitionDate: "1980-05-01",
      landAcquisitionCause: "inheritance" as const,
      landDecedentAcquisitionDate: "1960-01-01",
      isSeparateAcquisition: true,
      landAcqMode: "actual" as const,
      buildingAcqMode: "actual" as const,
      landAcquisitionPrice: 100_000_000,
      buildingAcquisitionPrice: 50_000_000,
      landStandardPriceAtTransfer: 250_000_000,
      buildingStandardPriceAtTransfer: 150_000_000,
      landSec164Value: 100_000_000,
      ...over,
    },
  ];
  async function run(over: Obj) {
    const res = await post(SINGLE, "http://l/api/calc/transfer", { ...BASE, companionAssets: companion(over) });
    const json = (await res.json()) as { data?: { aggregated: { properties: { propertyId: string; transferGain: number }[] } }; error?: unknown };
    return { status: res.status, json, gain: json.data?.aggregated.properties.find((p) => p.propertyId === "c1")?.transferGain };
  }
  it("③ 분자 없음 → ⑫ 400 (companionAssets.0.landSec164ValueWhole)", async () => {
    const r = await run({});
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error)).toContain("landSec164ValueWhole");
  });
  it("③ 분자 있음 → 200 · ③이 ①②보다 크면 양도차익이 줄어든다 — ⑭ 매핑 도달 증거", async () => {
    const r = await run({ landSec164ValueWhole: 100_000_000 });
    const later = await run({ landAcquisitionDate: "1988-05-01" }); // ③ 없음 → max(①,②)
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(later.status).toBe(200);
    expect(r.gain!).toBeLessThan(later.gain!);
  });
});
