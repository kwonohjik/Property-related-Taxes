/**
 * route anchor — NBL2611 묶음 A4: V3-PR01(공익수용 의제 「고시일부터 2년」 연혁) · R23(이월과세 배제 토지의 NBL 취득일 = 수증일, Q-11).
 *
 * R23 — 이월과세(§97의2①)가 **적용되는** 시나리오 A만 NBL 소유기간 기산이 증여자 취득일이다(영 §168의14③3호 괄호 「법 제97조의2제1항을 적용받는 경우에는」).
 * 배제(②1호 수용 2년 이전 증여 선언 · ②3호 세액 비교로 B 채택 · ③ 기간 경과)되면 수증일(등기접수일)이다. 같은 사실을 «수증일에 매입한 일반 토지»로 넣은 대조와 세액이 같아야 한다.
 * 세율: route 폴백(`makeMockRates`). 수정 전 값은 각 셀 주석의 «전».
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = "2024-06-03";
/** 농림지역 농지 3,000㎡ · 취득가 4억 · 양도가 10억 · 정밀판정 ON */
const RURAL = {
  assetKind: "land", acquisitionArea: "3000", transferArea: "3000", addressJibun: "강원 홍천군 테스트리 1", fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblZoneType: "agriculture_forest", nblLandType: "farmland",
} as Partial<AssetForm>;
const CAR = (g: string, d: string, over: Record<string, unknown> = {}, excl: Record<string, boolean> = {}) =>
  ({
    giftRegistryDate: g, donorAcquisitionDate: d, donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000", useEstimatedAcquisition: false,
    estimationMode: "", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "100000000", exclusionDeclared: excl, donorRelation: "spouse", ...over,
  }) as unknown as AssetForm["carryover"];
const farm = (s: string, e: string) =>
  ({ nblFarmingSelf: true, nblFarmerResidenceDistance: "5", nblBusinessUsePeriods: [{ startDate: s, endDate: e, usageType: "farming" }] }) as Partial<AssetForm>;

interface Judged {
  status: number;
  issues: string[];
  total?: number;
  nbl?: boolean;
  scenario?: { adopted?: string; excl?: string; a?: number; b?: number };
  warnings: string[];
  steps: string;
}
async function run(f: TransferFormData): Promise<Judged> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cap.body),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = ((await res.json()) as any).data?.result;
  const cd = r?.carryoverTaxationDetail;
  return {
    status: res.status,
    issues: [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f)).map((i) => i.message),
    total: r?.totalTax,
    nbl: r?.nonBusinessLandJudgmentDetail?.isNonBusinessLand,
    scenario: cd ? { adopted: cd.adoptedScenario, excl: cd.exclusionReason, a: cd.scenarioA?.determinedTax, b: cd.scenarioB?.determinedTax } : undefined,
    warnings: r?.nonBusinessLandJudgmentDetail?.warnings ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    steps: (r?.nonBusinessLandJudgmentDetail?.judgmentSteps ?? []).map((s: any) => s.detail).join(" | "),
  };
}
function mainForm(over: Partial<AssetForm>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = T;
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, RURAL, over) as AssetForm];
  return f;
}
const carryover = (carry: AssetForm["carryover"], periods: Partial<AssetForm>) =>
  mainForm({ acquisitionCause: "carryover_gift", acquisitionDate: "", carryover: carry, ...periods } as Partial<AssetForm>);
/** 대조 — 같은 사실을 «수증일에 giftDateValuation으로 매입한 일반 토지»로 */
const purchaseAt = (g: string, periods: Partial<AssetForm>) =>
  mainForm({ acquisitionCause: "purchase", acquisitionDate: g, fixedAcquisitionPrice: "100000000", ...periods });

describe("R23 — 이월과세 배제(시나리오 B) 토지의 NBL 소유기간 기산 = 수증일 (대조 = 수증일 매입 일반 토지)", () => {
  // 증여자 소유 2000-01-01~ · 수증 2013-03-01. 자경이 증여자 소유기간 앞쪽(~2017-12-31)에만 있다:
  //   증여자 취득일 기산 24.4년 중 17.9년(73%) → 사업용 / 수증일 기산 11.25년 중 4.8년(43%) → 비사업용.
  const G1 = "2013-03-01";
  const P1 = farm("2000-01-02", "2017-12-31");
  it("③ 기간 경과 배제(수증 후 5년 초과 양도): B 채택 · NBL = 수증일 기준 비사업용 — 전: 증여자 취득일로 사업용 판정, totalTax 283,635,000", async () => {
    const r = await run(carryover(CAR(G1, "2000-01-01"), P1));
    const control = await run(purchaseAt(G1, P1));
    expect(r.issues).toEqual([]);
    expect(r.scenario).toMatchObject({ adopted: "B", excl: "period_exceeded" });
    expect(r.nbl).toBe(true);
    expect(r.total).toBe(360_580_000);
    expect(r.total).toBe(control.total);
    expect(r.warnings.filter((w) => w.includes("증여자 취득일"))).toEqual([]); // B는 증여자 취득일 기산 고지가 붙지 않는다
  });
  it("②1호 수용 2년 이전 증여 선언 배제: B 채택 · NBL = 수증일 기준 — 전: 사업용, totalTax 375,111,000", async () => {
    const G = "2022-03-01";
    const periods = farm("2000-01-02", G);
    const r = await run(carryover(CAR(G, "2000-01-01", {}, { expropriationWithin2Years: true }), periods));
    const control = await run(purchaseAt(G, periods));
    expect(r.issues).toEqual([]);
    expect(r.scenario).toMatchObject({ adopted: "B", excl: "expropriation" });
    expect(r.nbl).toBe(true);
    expect(r.total).toBe(473_836_000);
    expect(r.total).toBe(control.total);
  });
  it("②3호 세액 비교로 B 채택(증여자 취득가 8억 · 증여 당시 평가액 1억 → A 세액 < B 세액): B 채택 · B 세액이 수증일 기준 — 전: B 341,010,000 → 총 375,111,000", async () => {
    const G = "2022-03-01";
    const periods = farm("2000-01-02", G);
    const r = await run(carryover(CAR(G, "2000-01-01", { donorAcquisitionPrice: "800000000" }), periods));
    const control = await run(purchaseAt(G, periods));
    expect(r.issues).toEqual([]);
    expect(r.scenario).toMatchObject({ adopted: "B", excl: "tax_comparison", a: 32_685_000, b: 430_760_000 });
    expect(r.nbl).toBe(true);
    expect(r.total).toBe(473_836_000);
    expect(r.total).toBe(control.total);
  });
  it("대조 — 이월과세가 적용(A 채택)되면 증여자 취득일 기산 그대로(L22): 같은 자경 구간 · 수증 2022-03-01 · A 세액이 더 큼 → 사업용", async () => {
    const G = "2022-03-01";
    const r = await run(carryover(CAR(G, "2000-01-01", { giftDateValuation: "900000000" }), farm("2000-01-02", G)));
    expect(r.scenario?.adopted).toBe("A");
    expect(r.nbl).toBe(false);
    expect(r.total).toBe(250_371_000);
    expect(r.warnings.filter((w) => w.includes("이월과세")).length).toBe(1); // 증여자 취득일 기산 고지 유지
  });
});

describe("V3-PR01 route — 공익수용 의제(고시 2019-01-01 · 취득 2015-06-01 · 양도 2024-06-01)", () => {
  const expr = (over: Partial<AssetForm>) =>
    mainForm({
      acquisitionCause: "purchase", acquisitionDate: "2015-06-01", transferCause: "public_expropriation", expropriationNoticeDate: "2019-01-01",
      ...farm("2015-06-02", "2016-06-01"), ...over,
    });
  it("2년 이전 연혁: 의제 사업용 — 전: 비사업용(5년 단일 기준), totalTax 240,691,000 → 186,846,000", async () => {
    const f = expr({});
    f.transferDate = "2024-06-01";
    const r = await run(f);
    expect(r.issues).toEqual([]);
    expect(r.total).toBe(186_846_000);
    expect(r.nbl).toBe(false);
    expect(r.steps).toContain("2년 이전");
  });
});

describe("V3-PR01 화면 어댑터 — 배지·안내가 같은 leaf를 쓴다", () => {
  const asset = (notice: string, acquired: string) =>
    ({ ...makeDefaultAsset(1), ...RURAL, acquisitionCause: "purchase", acquisitionDate: acquired, transferCause: "public_expropriation", expropriationNoticeDate: notice, nblExemptPublicExpropriation: true }) as AssetForm;
  it("고시 2019-01-01(종전 2년): 취득 2015-06-01 → 충족 · 안내 「2년 이전」", () => {
    const e = evaluateUnconditionalExemption(asset("2019-01-01", "2015-06-01"), "2024-06-01");
    expect(e.isExempt).toBe(true);
    expect(e.perToggle.publicExpropriation?.qualifies).toBe(true);
    expect(e.perToggle.publicExpropriation?.requirementHint).toContain("2년 이전");
    expect(e.matched?.legalBasis).toContain("2년 이전");
  });
  it("고시 2021-05-04(5년): 취득이 고시일 3년 전 → 미충족 · 안내 「5년 이전」", () => {
    const e = evaluateUnconditionalExemption(asset("2021-05-04", "2018-05-04"), "2024-06-01");
    expect(e.perToggle.publicExpropriation?.qualifies).toBe(false);
    expect(e.perToggle.publicExpropriation?.requirementHint).toContain("5년 이전");
  });
  it("양도일 2014-02-20(구 5년) — 안내 「5년 이전」", () => {
    const e = evaluateUnconditionalExemption(asset("2013-01-01", "2009-01-01"), "2014-02-20");
    expect(e.perToggle.publicExpropriation?.requirementHint).toContain("5년 이전");
  });
  it("고시일 미입력 — 안내가 연혁에 따라 2년·5년임을 밝힌다(숫자를 단정하지 않는다)", () => {
    const e = evaluateUnconditionalExemption(asset("", "2015-06-01"), "2024-06-01");
    expect(e.perToggle.publicExpropriation?.requirementHint).toContain("2년 또는 5년");
  });
});
