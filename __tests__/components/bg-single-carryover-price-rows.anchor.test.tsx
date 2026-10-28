/**
 * anchor — 부담부증여 단건 × 이월과세: 상세 명세서·신고서 양식의 양도가액·취득가액 줄은 §159 슬롯 값이다.
 * 계획서 `docs/02-design/features/bg-single-carryover-statement-price-rows.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 a).
 *
 * 종전: 부담부증여에서 폼 계약금액은 빈 칸이라 명세서 양도가액 0 · 취득가액 −30,000,000(역산), 신고서 양식 두 칸은 값 없음(null)이었다.
 * 표시 전용 — 양도차익·결정세액은 바뀌지 않는다(변경 전 측정값 · mock 세율).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
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


const L = ["양도가액", "취득가액", "필요경비", "전체 양도차익"] as const;

/** route 결과 → 상세 명세서 네 줄 + 신고서 양식 합계 열 + 슬롯 합. 단건 결과뷰가 `result`를 그대로 넘기는 것과 같다. */
async function rows(a: A, ex: A = {}) {
  const f = mk([land(1, a)], ex);
  const r = await post(f);
  expect(r.status, JSON.stringify(r.error)).toBe(200);
  const res = r.data.result;
  const asset = f.assets[0] as AssetForm;
  const items = buildStatementItems(res, f, asset, undefined, undefined);
  const st = ["transferPrice", "acquisitionPrice", "expenses", "transferGain"].map((k) => items.get(k)!.value as number);
  const { mode } = deriveColumns(res, undefined, undefined, undefined);
  const filing = buildRows(res, mode, f, asset);
  const fl = L.map((l) => filing.find((x) => x.label.trim() === l)?.values?.total ?? null);
  const bg = res.transferBurdenedGiftBreakdown;
  const slot = (k: "transferPrice" | "acquisitionPrice" | "estimatedDeduction") => bg.perAsset.land[k] + bg.perAsset.building[k];
  return {
    res, items, st, fl, adopted: res.carryoverTaxationDetail?.adoptedScenario as string,
    slots: [slot("transferPrice"), slot("acquisitionPrice"), slot("estimatedDeduction")],
    acqFormula: String(items.get("acquisitionPrice")!.formula).replace(/\s+/g, " "),
  };
}

describe("부담부증여 단건 × 이월과세 — 명세서·신고서 양식 양도가액·취득가액은 슬롯 값 (계획서 §1.1)", () => {
  it.each([
    ["토지 감정가액 · 증여세 0", "appraisal", "0", "A", [80_000_000, 50_000_000, 900_000], 29_100_000, 1_507_800],
    ["토지 감정가액 · 증여세 2M", "appraisal", "2000000", "A", [80_000_000, 50_000_000, 1_300_000], 28_700_000, 1_464_600],
    ["토지 매매사례가액 · 증여세 2M", "salesCase", "2000000", "A", [80_000_000, 50_000_000, 1_300_000], 28_700_000, 1_464_600],
    ["토지 환산 · 증여세 2M (B 채택)", "converted", "2000000", "B", [80_000_000, 45_000_000, 1_080_000], 33_920_000, 3_453_000],
    ["토지 감정가액 · 증여세 30M (B 채택)", "appraisal", "30000000", "B", [80_000_000, 60_000_000, 0], 20_000_000, 1_365_000],
  ] as const)("%s", async (_n, method, g, adopted, slots, gain, tax) => {
    const c = await rows({ bgAcquisitionMethod: method, ...gt(g) });
    expect(c.adopted).toBe(adopted);
    expect(c.slots).toEqual(slots);
    // 상세 명세서: 양도가액·취득가액·필요경비·양도차익 = 슬롯·엔진 값 (종전 0 / 음수)
    expect(c.st).toEqual([slots[0], slots[1], slots[2], gain]);
    expect(c.st[0] - c.st[1] - c.st[2]).toBe(c.st[3]); // 양도 − 취득 − 경비 = 차익
    // 신고서 양식 합계 열: 종전 양도가액·취득가액 null (필요경비 0은 칸 없음)
    expect(c.fl).toEqual([slots[0], slots[1], slots[2] || null, gain]);
    expect(c.res.determinedTax).toBe(tax);
  });

  it("실지(K-4) · 증여세 2M — 취득가액 50,000,000 · 필요경비 400,000", async () => {
    const c = await rows({ bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionLand: "250000000", ...gt("2000000") });
    expect(c.adopted).toBe("A");
    expect(c.st).toEqual([80_000_000, 50_000_000, 400_000, 29_600_000]);
    expect(c.fl).toEqual([80_000_000, 50_000_000, 400_000, 29_600_000]);
    expect(c.res.determinedTax).toBe(1_561_800);
  });

  it("🔴 수증자 자본적지출 입력 — 필요경비 줄이 0으로 눌리지 않는다 (슬롯 값 · 양도 − 취득 − 경비 = 차익)", async () => {
    const actual = await rows({ bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionLand: "250000000", capitalExpenditure: "5000000", transferExpense: "1000000", ...gt("2000000") });
    expect(actual.adopted).toBe("A");
    expect(actual.slots).toEqual([80_000_000, 50_000_000, 1_600_000]);
    expect(actual.st).toEqual([80_000_000, 50_000_000, 1_600_000, 28_400_000]); // 종전 필요경비 0
    expect(actual.fl).toEqual([80_000_000, 50_000_000, 1_600_000, 28_400_000]);
    // 취득가액 산식은 값(슬롯 50,000,000)을 만든다 — 자본적지출은 필요경비(안분 실비) 쪽이라 「+ 자본적지출」을 적지 않는다
    expect(actual.acqFormula).toContain("증여자 취득 당시 취득가액 50,000,000 — 이월과세 §97의2① (증여자 취득가액 승계)");
    expect(actual.acqFormula).not.toContain("자본적지출");
    const appraisal = await rows({ bgAcquisitionMethod: "appraisal", capitalExpenditure: "5000000", ...gt("2000000") });
    expect(appraisal.slots).toEqual([80_000_000, 50_000_000, 1_300_000]);
    expect(appraisal.st).toEqual([80_000_000, 50_000_000, 1_300_000, 28_700_000]);
    expect(appraisal.st[0] - appraisal.st[1] - appraisal.st[2]).toBe(appraisal.st[3]);
  });

  it("취득가액 산식 — A는 「증여자 취득가액 승계」 문구 유지 · B는 슬롯 산식(음수 문구 없음)", async () => {
    const a = await rows({ bgAcquisitionMethod: "appraisal", ...gt("2000000") });
    expect(a.acqFormula).toContain("증여자 취득 당시 취득가액 50,000,000 — 이월과세 §97의2① (증여자 취득가액 승계)");
    const b = await rows({ bgAcquisitionMethod: "converted", ...gt("2000000") });
    expect(b.adopted).toBe("B");
    expect(b.acqFormula).toContain("취득가액 = 자산별 양도가액 × 취득시 기준시가 / 양도시 기준시가 (소득세법 시행령 §176의2②2호 — 환산취득가액)");
    expect(b.acqFormula).toContain("= 45,000,000");
    expect(b.acqFormula).not.toMatch(/취득가액 -[0-9]/);
    expect(b.acqFormula).not.toContain("실제 거래가액");
  });

  it("양도가액 줄 산식 문구는 종전 그대로 — 값만 80,000,000", async () => {
    const c = await rows({ bgAcquisitionMethod: "appraisal", ...gt("2000000") });
    expect(String(c.items.get("transferPrice")!.formula)).toContain("양도가액 = 인수 채무액 (임대보증금 + 담보차입금) = 80,000,000");
  });

  it("주택(토지 100M · 건물 50M) — 파트 합: 양도 80,000,000 · 취득 49,999,999 · 필요경비 1,300,000", async () => {
    const c = await rows(HOUSE_CARRY("2000000", { bgAcquisitionMethod: "appraisal", bgCoDonorLandStdPriceAtAcq: "100000000", bgCoDonorBuildingStdPriceAtAcq: "50000000" }), { householdHousingCount: "2" });
    expect(c.adopted).toBe("A");
    expect(c.st).toEqual([80_000_000, 49_999_999, 1_300_000, 28_700_001]);
    expect(c.fl).toEqual([80_000_000, 49_999_999, 1_300_000, 28_700_001]);
    expect(c.res.determinedTax).toBe(1_464_600);
  });
});

describe("회귀 방어 — 이월과세가 아닌 단건은 종전 그대로", () => {
  it("이월과세 아닌 감정가액 단건: 양도 80,000,000 · 취득 50,000,000 · 필요경비 1,080,000 (명세서·신고서 같음)", async () => {
    const c = await rows({ ...PURCHASE, bgAcquisitionMethod: "appraisal" });
    expect(c.res.carryoverTaxationDetail).toBeUndefined();
    expect(c.st).toEqual([80_000_000, 50_000_000, 1_080_000, 28_920_000]);
    expect(c.fl).toEqual([80_000_000, 50_000_000, 1_080_000, 28_920_000]);
  });
});
