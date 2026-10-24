/**
 * anchor — 일반건물 **부담부증여 × 이월과세 × 감정가액·매매사례가액(K-7·K-6)** 시나리오 B (F27 B · 계획서 `docs/00-pm/gb-bg-carryover-presumed-scenario-b.plan.md` PR-1)
 *
 * 폼 → ④ → ⑧ → ⑫ → route · mock 세율. 시료: 시가 10억 · 채무 5억(채무비율 0.5) · 증여 등기 2024-05-01 · 당초 증여자 취득 2015-01-01 · 양도 2026-03-01.
 * K-7: 당초 증여자 감정가액 토지 1억·건물 2억 · 양도인 증여일 평가액 토지 3억·건물 3억.
 *
 * 수정 前: ⑧ 통과 → route 400 「취득가액 산정방식 「감정가액」은 취득 당시 감정가액을 입력해야 합니다」 — F27 B 호출이 `info`를 그대로 넘겨
 * 당초 증여자 방식의 양도인 칸(`presumed*` — 이월과세 입력에서는 ④가 싣지 않는다)을 찾았다. 단건 `buildInputB`는 `toTransferorBasisInfo`를 거친다.
 *
 * 등식(대조군): B = 「이월과세 없는 증여 취득 + K-4 실지(증여일 평가액)」 · A = 「이월과세 없는 매매 + K-7(당초 증여자 감정가액 · 취득일 · 취득시 기준시가)」.
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

const TRANSFER_DATE = "2026-03-01";

/** 일반건물 · 부담부증여 K-5 · 이월과세(당초 증여자 취득 시 기준시가 토지 1천만·건물 4천만 → A 채택). `co`/`over` 로 한 칸씩 바꾼다. */
function gbAsset(over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
    bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000",
      giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
      ...co,
    },
    ...over,
  } as AssetForm;
}
const formOf = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE, filingDate: "2026-05-31", assets, houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

type Part = { propertyLabel: string; acquisitionPrice: number; transferGain: number };
type Summary = { parts: Part[]; landHoldingStartDate: string; buildingHoldingStartDate: string };
interface Run { status: number; det?: number; message?: string; fieldErrors: string[]; props?: Part[]; co?: { adoptedScenario: "A" | "B"; determinedTaxA: number; determinedTaxB: number; scenarioA?: Summary; scenarioB?: Summary } }
async function bodyOf(f: TransferFormData): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let captured: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as Response;
  }));
  try { await callTransferTaxAPI(f); } catch { /* body 만 필요하다 */ }
  vi.unstubAllGlobals();
  return captured;
}
async function post(body: Record<string, any>): Promise<Run> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { aggregated?: Record<string, any> }; error?: { message?: string; fieldErrors?: Record<string, string[]> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = json.data?.aggregated;
  return { status: res.status, det: a?.determinedTax, message: json.error?.message, fieldErrors: Object.keys(json.error?.fieldErrors ?? {}), co: a?.burdenedGiftCarryoverDetail, props: a?.properties };
}
const run = async (f: TransferFormData): Promise<Run> => post(await bodyOf(f));
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));

// ─────────────────────────────────────────────────────────────────────
const K7 = { bgAcquisitionMethod: "appraisal", bgCoDonorPresumedAcquisitionLand: "100,000,000", bgCoDonorPresumedAcquisitionBuilding: "200,000,000", bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000" } as Partial<AssetForm>;
const K6 = { ...K7, bgAcquisitionMethod: "salesCase" } as Partial<AssetForm>;
const calc = async (over: Partial<AssetForm>, co: Record<string, unknown> = {}) => {
  const f = formOf([gbAsset(over, co)]);
  return { issues: issues(f).map((i) => i.message), r: await run(f) };
};

describe("PR-1 단건 F27 — K-7·K-6 × 이월과세가 계산된다", () => {
  it("🔴 K-7: ⑧ 통과 · 200 · A 채택 82,627,700 (B 79,000,000) — 수정 前 400", async () => {
    const { issues: iss, r } = await calc(K7);
    expect(iss).toEqual([]);
    expect(r.status, r.message).toBe(200);
    expect(r.co).toMatchObject({ adoptedScenario: "A", determinedTaxA: 82_627_700, determinedTaxB: 79_000_000 });
    expect(r.det).toBe(82_627_700);
  });

  it("🔴 K-6(매매사례가액): 같은 값 — 매매사례가액 입력이 감정가액 입력과 같다", async () => {
    const { r } = await calc(K6);
    expect(r.status, r.message).toBe(200);
    expect(r.co).toMatchObject({ adoptedScenario: "A", determinedTaxA: 82_627_700, determinedTaxB: 79_000_000 });
  });

  it("🔴 K-7 · 증여세 3천만(§97의2①3호) → A 78,181,700 < B 79,000,000 → ②3호로 B 채택", async () => {
    const { r } = await calc(K7, { giftTaxAmount: "30,000,000" });
    expect(r.status, r.message).toBe(200);
    expect(r.co).toMatchObject({ adoptedScenario: "B", determinedTaxA: 78_181_700, determinedTaxB: 79_000_000 });
    expect(r.det).toBe(79_000_000);
  });

  it("구별력 — A는 당초 증여자 값을 읽는다(K-6 토지 1.2억 → A 79,663,700) · B는 그대로", async () => {
    const { r } = await calc({ ...K6, bgCoDonorPresumedAcquisitionLand: "120,000,000" });
    expect(r.co).toMatchObject({ determinedTaxA: 79_663_700, determinedTaxB: 79_000_000 });
  });

  it("구별력 — B는 양도인 증여일 평가액을 읽는다(토지 2억 → B 99,000,000) · A는 그대로", async () => {
    const { r } = await calc({ ...K7, bgActualAcquisitionLand: "200,000,000" });
    expect(r.co?.determinedTaxA).toBe(82_627_700);
    expect(r.co?.determinedTaxB).toBe(99_000_000);
  });
});

describe("등식 — 두 시나리오가 대조군과 정확히 같다", () => {
  it("B = 이월과세 없는 증여 취득 + K-4 실지(증여일 평가액 3억·3억)", async () => {
    const { r: ref } = await calc({ bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000", acquisitionCause: "gift" });
    const { r } = await calc(K7);
    expect(ref.status).toBe(200);
    expect(r.co?.determinedTaxB).toBe(ref.det);
  });

  it("A = 이월과세 없는 매매 + K-7(감정가액 1억·2억 · 취득일 2015-01-01 · 취득시 기준시가 = 당초 증여자 값 토지 1천만·건물 4천만)", async () => {
    const { r: ref } = await calc({
      bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "100,000,000", bgPresumedAcquisitionBuilding: "200,000,000",
      acquisitionCause: "purchase", acquisitionDate: "2015-01-01", gbAcqLandPricePerSqm: "100,000", gbAcqBuildingValue: "40,000,000",
    });
    const { r } = await calc(K7);
    expect(ref.status).toBe(200);
    expect(r.co?.determinedTaxA).toBe(ref.det);
  });
});

describe("회귀 — K-1~K-5는 그대로", () => {
  it("K-5(환산) × 이월과세: A 109,326,000 · B 97,800,000 · A 채택(수정 前과 같다)", async () => {
    const { r } = await calc({});
    expect(r.status).toBe(200);
    expect(r.co).toMatchObject({ adoptedScenario: "A", determinedTaxA: 109_326_000, determinedTaxB: 97_800_000 });
  });
});

describe("⑧ ↔ ⑫ — 미입력은 둘 다 막는다(400이 엔진까지 가지 않는다)", () => {
  it.each([
    ["당초 증여자 감정가액 없음", { bgCoDonorPresumedAcquisitionLand: "", bgCoDonorPresumedAcquisitionBuilding: "" }, "당초 증여자"],
    ["양도인 증여일 평가액 없음", { bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "" }, "시나리오 B"],
  ])("%s", async (_n, over, word) => {
    const { issues: iss, r } = await calc({ ...K7, ...over } as Partial<AssetForm>);
    expect(iss.join("\n")).toContain(word);
    expect(r.status).toBe(400);
    expect(r.fieldErrors.length).toBeGreaterThan(0); // ⑫(Zod)에서 막힌다 — 엔진 throw 가 아니다
  });
});

describe("PR-4 — 시나리오별 카드 요약 echo (결과 화면 [A]/[B] 비교 카드가 읽는다)", () => {
  const pick = (ps: Part[] | undefined) => ps?.map(({ propertyLabel, acquisitionPrice, transferGain }) => ({ propertyLabel, acquisitionPrice, transferGain }));

  it("K-7 A 채택: A 요약 = 응답 카드 그대로(토지 5천만·건물 1억 = 당초 증여자 감정가액 × 채무비율) · 기산일 2015-01-01", async () => {
    const { r } = await calc(K7);
    expect(r.co?.scenarioA?.parts).toEqual(pick(r.props));
    expect(r.co?.scenarioA?.parts.map((p) => p.acquisitionPrice)).toEqual([50_000_000, 100_000_000]);
    expect(r.co?.scenarioA).toMatchObject({ landHoldingStartDate: "2015-01-01", buildingHoldingStartDate: "2015-01-01" });
  });

  it("K-7 A 채택: 미채택 B 요약도 남는다(토지·건물 1.5억 = 증여일 평가액 3억 × 채무비율) · 기산일 2024-05-01", async () => {
    const { r } = await calc(K7);
    expect(r.co?.scenarioB?.parts.map((p) => p.acquisitionPrice)).toEqual([150_000_000, 150_000_000]);
    expect(r.co?.scenarioB).toMatchObject({ landHoldingStartDate: "2024-05-01", buildingHoldingStartDate: "2024-05-01" });
  });

  it("②3호 B 채택(증여세 3천만): B 요약 = 응답 카드 그대로 · A 요약은 당초 증여자 값", async () => {
    const { r } = await calc(K7, { giftTaxAmount: "30,000,000" });
    expect(r.co?.adoptedScenario).toBe("B");
    expect(r.co?.scenarioB?.parts).toEqual(pick(r.props));
    expect(r.co?.scenarioA?.parts.map((p) => p.acquisitionPrice)).toEqual([50_000_000, 100_000_000]);
  });

  it("B 기산일은 카드 취득일 축을 따른다 — 토지 취득일만 다르면 토지·건물 기산일이 갈린다", async () => {
    const { r } = await calc({ ...K7, landAcquisitionDate: "2024-04-01" } as Partial<AssetForm>);
    expect(r.status, r.message).toBe(200);
    expect(r.co?.scenarioB).toMatchObject({ landHoldingStartDate: "2024-04-01", buildingHoldingStartDate: "2024-05-01" });
    expect(r.co?.scenarioA).toMatchObject({ landHoldingStartDate: "2015-01-01", buildingHoldingStartDate: "2015-01-01" });
  });
});
