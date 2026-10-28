/**
 * anchor — 부담부증여 단건 × 이월과세: 상세 계산 명세서 「필요경비」 줄은 개산공제를 「양도비 등」으로 적지 않는다.
 * 계획서 `docs/02-design/features/bg-single-carryover-statement-expense-label.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 a).
 *
 * 종전: 엔진이 §159 경로에서 `necessaryExpenseIsLumpDeduction`을 false로 고정해 개산공제 900,000을 「양도비 등 900,000 (중개수수료·법무사 비용 등)」으로 적었다.
 * 표시 전용 — 세액은 바뀌지 않는다(결정세액은 변경 전 측정값 · mock 세율).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { resolveBgSingleDisplay, resolveBgCarryoverSingleDisplay } from "@/components/calc/results/transfer/DetailedStatementBgFormulas";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;

/** 시료 — 토지 · 채무 80,000,000 · 시가 400,000,000(채무비율 0.2) · 당초 증여자 감정가액 250,000,000 · 취득시 기준시가 150,000,000 · 양도인 증여일 평가액 300,000,000 · 증여세 상당액 4,000,000. */
const CARRYOVER: A = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
  useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {},
};
const land = (id: number, over: A = {}): A => ({
  addressJibun: `서울 강남구 테스트동 ${id}-1`, assetKind: "land", transferType: "burdened_gift", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  carryover: CARRYOVER, bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "appraisal", standardPriceAtTransfer: "320000000", standardPriceAtAcq: "180000000",
  bgActualAcquisitionLand: "300000000", bgCoDonorPresumedAcquisitionLand: "250000000", bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0", ...over,
});
/** 이월과세가 아닌 감정가액 자산 — 양도인 칸의 감정가액이 정본이다. */
const PURCHASE: A = {
  acquisitionCause: "purchase", acquisitionDate: "2015-03-01", carryover: undefined, bgActualAcquisitionLand: "", bgCoDonorPresumedAcquisitionLand: "",
  bgCoDonorLandStdPriceAtAcq: "", bgCoDonorBuildingStdPriceAtAcq: "", bgPresumedAcquisitionLand: "250000000",
};
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;


// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(f: TransferFormData): Promise<{ status: number; data: any; error?: { message?: string } }> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...cap.body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: unknown; error?: { message?: string } };
  return { status: res.status, data: json.data, error: json.error };
}

const gt = (n: string, over: A = {}): A => ({ carryover: { ...CARRYOVER, giftTaxAmount: n, ...over } });
const HOUSE_CARRY = (g: string, extra: A = {}): A => ({
  assetKind: "housing", bgActualAcquisitionLand: "", bgActualAcquisitionTotal: "300000000", bgCoDonorPresumedAcquisitionLand: "", bgCoDonorPresumedAcquisitionTotal: "250000000",
  standardPriceAtTransfer: "300000000", carryover: { ...CARRYOVER, giftTaxAmount: g, donorHouseholdHoldingStartDate: "2012-01-01" }, ...extra,
});

/** route 결과 + 단건 결과뷰와 같은 방식(`result` 그대로)으로 만든 「필요경비」 항목. */
async function expense(a: A, ex: A = {}) {
  const f = mk([land(1, a)], ex);
  const r = await post(f);
  expect(r.status, JSON.stringify(r.error)).toBe(200);
  const res = r.data.result;
  const item = buildStatementItems(res, f, f.assets[0] as AssetForm, undefined, undefined).get("expenses")!;
  const bg = res.transferBurdenedGiftBreakdown;
  const slot = bg.perAsset.land.estimatedDeduction + bg.perAsset.building.estimatedDeduction;
  const formula = String(item.formula);
  const ends = [...formula.matchAll(/= ([0-9,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  return { res, bg, item, slot, formula, flat: formula.replace(/\s+/g, " "), last: ends[ends.length - 1], adopted: res.carryoverTaxationDetail?.adoptedScenario as string };
}

describe("부담부증여 단건 × 이월과세 — 필요경비 줄은 개산공제를 「양도비 등」으로 적지 않는다 (계획서 §1.1)", () => {
  it.each([
    ["감정가액 · 증여세 0", "appraisal", "0", "A", 900_000, 1_507_800],
    ["감정가액 · 증여세 2M", "appraisal", "2000000", "A", 1_300_000, 1_464_600],
    ["매매사례가액 · 증여세 2M", "salesCase", "2000000", "A", 1_300_000, 1_464_600],
    ["환산 · 증여세 2M (B 채택)", "converted", "2000000", "B", 1_080_000, 3_453_000],
  ] as const)("%s", async (_n, method, g, adopted, value, tax) => {
    const c = await expense({ bgAcquisitionMethod: method, ...gt(g) });
    expect(c.adopted).toBe(adopted);
    expect(c.item.value).toBe(value);
    expect(c.slot).toBe(value);
    expect(c.last).toBe(value); // 적힌 산식의 맺음값 = 적힌 값
    expect(c.flat).toContain("개산공제, 소령 §163⑥");
    expect(c.flat).not.toContain("양도비 등");
    expect(c.flat).not.toContain("중개수수료");
    expect(c.res.determinedTax).toBe(tax);
  });

  it("산입 줄 — 증여세 상당액이 있으면 개산공제 뒤에 더하고 슬롯으로 맺는다 · 없으면 산입 줄이 없다", async () => {
    const withGift = await expense({ bgAcquisitionMethod: "appraisal", ...gt("2000000") });
    expect(withGift.formula).toContain("= 150,000,000 × 80,000,000 / 400,000,000 × 0.03");
    expect(withGift.flat).toContain("= 900,000 + 증여세 상당액 400,000 — 이월과세 §97의2①3호·시행령 §163의2② = 1,300,000");
    const none = await expense({ bgAcquisitionMethod: "appraisal", ...gt("0") });
    expect(none.flat).not.toContain("증여세 상당액");
  });

  it("실지(K-4)는 종전과 같이 실비 안분 + 산입분 (실비 0 · 산입 400,000)", async () => {
    const c = await expense({ bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionLand: "250000000", ...gt("2000000") });
    expect(c.adopted).toBe("A");
    expect(c.flat).toContain("채무비율 안분 실비 (자본적지출·양도비) = 0 + 증여세 상당액 400,000");
    expect(c.last).toBe(400_000);
    expect(c.res.determinedTax).toBe(1_561_800);
  });

  it("B 채택(증여세가 커서 미적용) — 실지 경로 문구 · 값 0", async () => {
    const c = await expense({ bgAcquisitionMethod: "appraisal", ...gt("30000000") });
    expect(c.adopted).toBe("B");
    expect(c.item.value).toBe(0);
    expect(c.flat).toContain("채무비율 안분 실비 (자본적지출·양도비) = 0");
    expect(c.flat).not.toContain("양도비 등");
  });

  it("🔴 #2686 회귀 — 감정가액 + 증여자 자본적지출 50,000,000: 개산공제 900,000을 「증여자 자본적지출」로 적지 않는다", async () => {
    const c = await expense({ bgAcquisitionMethod: "appraisal", ...gt("2000000", { donorCapitalExpenditure: "50000000" }) });
    expect(c.adopted).toBe("A");
    expect(c.item.value).toBe(1_300_000);
    expect(c.flat).not.toContain("증여자 자본적지출");
    expect(c.flat).toContain("개산공제, 소령 §163⑥");
    expect(c.last).toBe(1_300_000);
  });

  it("주택(토지 100M · 건물 50M) — 파트별 줄: 토지 600,000 · 건물 300,000 + 산입 400,000 = 700,000", async () => {
    const c = await expense(HOUSE_CARRY("2000000", { bgAcquisitionMethod: "appraisal", bgCoDonorLandStdPriceAtAcq: "100000000", bgCoDonorBuildingStdPriceAtAcq: "50000000" }), { householdHousingCount: "2" });
    expect(c.item.value).toBe(1_300_000);
    expect(c.flat).toContain("토지 필요경비 = ");
    expect(c.flat).toContain("= 100,000,000 × 80,000,000 / 400,000,000 × 0.03 = 600,000");
    expect(c.flat).toContain("건물 필요경비 = ");
    expect(c.flat).toContain("= 50,000,000 × 80,000,000 / 400,000,000 × 0.03 = 300,000 + 증여세 상당액 400,000 — 이월과세 §97의2①3호·시행령 §163의2② = 700,000");
    expect(c.flat).not.toContain("양도비 등");
  });

  it("양도일 2024-01-01 전 · 증여자 자본적지출 입력 — 불산입 부기를 산식 뒤에 한 번 붙인다 (A 채택)", async () => {
    const f = mk([land(1, { acquisitionDate: "2021-06-01", bgAcquisitionMethod: "appraisal", ...gt("200000", { giftRegistryDate: "2021-06-01", donorCapitalExpenditure: "50000000" }) })], { transferDate: "2023-12-01", filingDate: "2024-02-28" });
    const r = await post(f);
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const co = r.data.result.carryoverTaxationDetail;
    const text = String(buildStatementItems(r.data.result, f, f.assets[0] as AssetForm, undefined, undefined).get("expenses")!.formula);
    expect(co.scenarioA.donorCapexGuardApplied).toBe(true);
    expect(co.adoptedScenario).toBe("A");
    expect(text.split("증여자 자본적지출 불산입").length - 1).toBe(1);
    expect(text).toContain("개산공제, 소령 §163⑥");
  });
  it("같은 양도일 · 미적용(B) 채택이면 불산입 부기를 붙이지 않는다 (부기는 A 채택의 사실)", async () => {
    const f = mk([land(1, { bgAcquisitionMethod: "appraisal", ...gt("200000", { donorCapitalExpenditure: "50000000" }) })], { transferDate: "2023-12-01", filingDate: "2024-02-28" });
    const r = await post(f);
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const co = r.data.result.carryoverTaxationDetail;
    expect(co.adoptedScenario).toBe("B");
    expect(co.scenarioA.donorCapexGuardApplied).toBe(true); // A 쪽 사실은 참이지만 채택되지 않았다
    const text = String(buildStatementItems(r.data.result, f, f.assets[0] as AssetForm, undefined, undefined).get("expenses")!.formula);
    expect(text).not.toContain("불산입");
  });

  it("해석 함수 경계 — 이월과세 결과는 종전 함수가 제외하고(양도가액·취득가액 줄은 별건), 필요경비 전용 함수만 받는다 · 이월과세가 아니면 반대", async () => {
    const carry = (await post(mk([land(1, { bgAcquisitionMethod: "appraisal", ...gt("2000000") })]))).data.result;
    expect(carry.carryoverTaxationDetail).toBeDefined();
    expect(resolveBgSingleDisplay(carry)).toBeUndefined();
    expect(resolveBgCarryoverSingleDisplay(carry)?.expenses).toBe(1_300_000);
    const plain = (await post(mk([land(1, { ...PURCHASE, bgAcquisitionMethod: "appraisal" })]))).data.result;
    expect(plain.carryoverTaxationDetail).toBeUndefined();
    expect(resolveBgCarryoverSingleDisplay(plain)).toBeUndefined();
    expect(resolveBgSingleDisplay(plain)?.expenses).toBe(1_080_000);
  });
});

describe("회귀 방어 — 이월과세가 아닌 단건은 종전 문구 그대로", () => {
  it("이월과세 아닌 감정가액 단건: 개산공제 줄 · 감정가액 경로 안내", async () => {
    const c = await expense({ ...PURCHASE, bgAcquisitionMethod: "appraisal" });
    expect(c.res.carryoverTaxationDetail).toBeUndefined();
    expect(c.flat).toContain("필요경비 = 취득시 기준시가 × 채무액 / 증여재산 평가액 × 3% (개산공제, 소령 §163⑥) = 180,000,000 × 80,000,000 / 400,000,000 × 0.03 = 1,080,000");
    expect(c.flat).toContain("감정가액 경로");
  });
});
