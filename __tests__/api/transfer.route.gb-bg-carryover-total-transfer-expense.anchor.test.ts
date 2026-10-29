/**
 * anchor — 일반건물 **부담부증여(§159) × 이월과세(§97의2) × 폼 총 양도비** (계획서 `docs/00-pm/gb-total-transfer-expense-loss.plan.md` §14 실측)
 *
 * 오라클 — 총 양도비 N을 한 번 입력한 결과는 같은 금액을 이미 되던 채널(자산 카드의 양도비 칸)로 넣은 결과와 카드별 필요경비·세액·시나리오 판정이 ±0으로 같다.
 *  · 축 B(지분): 총 N ≡ 각 지분 카드 양도비 칸 N(100% 기준 — 엔진이 × 지분율). 이월과세 지분마다 A/B를 비교한다.
 *  · 함께 양도: 총 N ≡ 두 자산 칸 N/2씩(양도가액 균등).
 *
 * 결과 — 축 B는 18칸(K-5·K-4·K-7 × 증여세 0/2백만 × N 5백만/4억/7억) 전부 ±0이다(A). 함께 양도는 K-7(감정·개산공제만)이 ±0이고 K-4·K-5는 **양도비의 토지:건물 배분이 갈린다**(B):
 *  총 양도비는 부담부증여 자산에서 `withBundledCommonExpense`가 선언 채널(`transferExpense`)로 옮기지 않아(`general-building-part-cards.ts:284` 부담부증여 가드) legacy 한 덩어리(`actualExpenses`)로 간다.
 *  부담부증여 분기는 선언 채널이 비면 그 덩어리를 **`capitalExpenditure` 슬롯**으로 넘기고(`general-building-route-actual.ts:308-309`), §159 안분은 자본적지출을 **취득시 기준시가**로 나눈다
 *  (`burdened-gift-acquisition.ts` `splitBgRealExpenseByNature` — 이월과세 A에서는 당초 증여자 취득시 기준시가 1천만:4천만 = 1:4). 자산 카드 양도비 칸은 선언 채널이라 **양도시 기준시가**(1:1)로 나뉜다.
 *  이 저장소의 기준은 「양도비 = 각 파트에 적용된 양도가액」(`general-building-route-actual.ts:90-91`)이다 — 폼 「총 양도비」는 성질이 양도비로 정해진 칸이므로 총 양도비 쪽이 어긋난 것이다. 합계 Σ는 같다.
 *  세액은 토지·건물의 보유기간(장기보유특별공제)이 같으면 같고(C), 다르면 어긋난다(D) — 이월과세가 아닌 부담부증여도 취득시 비율≠양도시 비율이면 같다(E · #2708의 시료는 두 비율이 같아 못 봤다).
 * (B)~(E)의 어긋난 값은 **현행 값**이다 — 수정되면 해당 셀이 뒤집힌다. 수치는 mock 세율표 실측값. 시료: 시가 10억 · 채무 5억 · 양도 2026-03-01.
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
import { sameDayBuildingDonorDate } from "./_helpers/gb-bg-building-donor-date";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

const TRANSFER_DATE = "2026-03-01";
const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;

/** 일반건물 · 부담부증여 K-5 · 이월과세(당초 증여자 취득 시 기준시가 토지 1천만·건물 4천만 → A 채택) · 지분 50%. `co`/`over` 로 한 칸씩 바꾼다. */
function gbShare(over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm {
  return sameDayBuildingDonorDate({
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
    ...half,
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000",
      giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
      ...co,
    },
    ...over,
  } as AssetForm);
}
/** 둘째 지분 — 카드 id·라벨만 다르다(화면은 자산마다 「자산 n」). */
const second = (a: AssetForm) => ({ ...a, assetId: "a2", assetLabel: "자산 2" }) as AssetForm;
const shares = (a: AssetForm, b: AssetForm, over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE, filingDate: "2026-05-31", assets: [{ ...a, assetLabel: "자산 1" }, second(b)], houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, assetSplitMode: "fractional", ...over,
  }) as unknown as TransferFormData;
const K7 = {
  bgAcquisitionMethod: "appraisal", bgCoDonorPresumedAcquisitionLand: "100,000,000", bgCoDonorPresumedAcquisitionBuilding: "200,000,000",
  bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000",
} as Partial<AssetForm>;

interface Run { status: number; det?: number; message?: string; fieldErrors: string[]; a?: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
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
  return { status: res.status, det: a?.determinedTax, message: json.error?.message, fieldErrors: Object.keys(json.error?.fieldErrors ?? {}), a };
}
const run = async (f: TransferFormData): Promise<Run> => post(await bodyOf(f));
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));


const gbAsset = (o: Partial<AssetForm> = {}, co: Record<string, unknown> = {}) =>
  gbShare({ ownershipNumerator: makeDefaultAsset(1).ownershipNumerator, ownershipDenominator: makeDefaultAsset(1).ownershipDenominator, ...o }, co);
const formOf = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData =>
  ({ transferDate: TRANSFER_DATE, filingDate: "2026-05-31", assets, houses: [], presaleRights: [], contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over }) as unknown as TransferFormData;
const BUNDLE = { assetSplitMode: "companion", bundledSaleMode: "actual" };

const K4 = { bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionLand: "100,000,000", bgCoDonorActualAcquisitionBuilding: "200,000,000", bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000" } as Partial<AssetForm>;
const K5 = {} as Partial<AssetForm>;
/** 당초 증여자가 건물을 토지보다 늦게 취득 — 파트별 보유기간(장기보유특별공제)이 갈려 배분 차이가 세액에 닿는다. */
const LATER_BUILDING = { buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2023-01-01" } } as Partial<AssetForm>;
const money = (n: number) => n.toLocaleString("en-US");

async function pick(f: TransferFormData) {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  const a = r.a!;
  return {
    det: a.determinedTax as number,
    exp: a.properties.map((p: { necessaryExpense: number }) => p.necessaryExpense) as number[],
    adopted: Object.values(a.burdenedGiftCarryoverUnits ?? {}).map((v: any) => `${v.adoptedScenario}:${v.determinedTaxA}/${v.determinedTaxB}`), // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe("BC-1 축 B(지분) × 부담부증여 × 이월과세 — 총 양도비 ≡ 각 지분 카드 양도비 칸 (A)", () => {
  const cells = [["K-5 환산", K5], ["K-4 실지", K4], ["K-7 감정", K7]] as const;
  const rows = cells.flatMap(([name, m]) => ["0", "2,000,000"].flatMap((g) => ["5,000,000", "400,000,000", "700,000,000"].map((n) => ({ name, m, g, n }))));
  it.each(rows)("$name · 증여세 $g · 총 양도비 $n", async ({ m, g, n }) => {
    const mk = (o: Partial<AssetForm>, total: string) =>
      shares(gbShare({ ...m, ...o }, { giftTaxAmount: g }), gbShare({ ...m, ...o }, { giftTaxAmount: g }), { totalTransferExpense: total });
    const none = await pick(mk({}, "0"));
    const tot = await pick(mk({}, n));
    const card = await pick(mk({ transferExpense: n }, "0"));
    expect(tot).toEqual(card);
    // 양도비가 필요경비에 닿는 셀만 「양도비 없음」과 달라야 한다(빈 일치 방지) — 감정은 개산공제만, 환산 5백만은 가목(환산취득가+개산공제)이 커서 안 닿는다.
    if (m === K4 || (m === K5 && n !== "5,000,000")) expect(tot.exp).not.toEqual(none.exp);
  });
});

describe("BC-2 함께 양도 × 부담부증여 × 이월과세 — 총 양도비 ≡ 자산 칸 N/2씩", () => {
  const half = (s: string) => money(Number(s.replace(/,/g, "")) / 2);
  const mk = (m: Partial<AssetForm>, o: Partial<AssetForm>, g: string, total: string) => {
    const A = (x: Partial<AssetForm> = {}) => gbAsset({ ...m, ...o, ...x }, { giftTaxAmount: g });
    return formOf([A(), second(A())], { ...BUNDLE, contractTotalPrice: "2,000,000,000", totalTransferExpense: total });
  };
  const mkCard = (m: Partial<AssetForm>, o: Partial<AssetForm>, g: string, n: string) => {
    const A = (x: Partial<AssetForm> = {}) => gbAsset({ ...m, ...o, ...x, transferExpense: half(n) }, { giftTaxAmount: g });
    return formOf([A(), second(A())], { ...BUNDLE, contractTotalPrice: "2,000,000,000", totalTransferExpense: "0" });
  };

  it.each(["0", "2,000,000"].flatMap((g) => ["5,000,000", "400,000,000", "700,000,000"].map((n) => [g, n] as const)))(
    "(A) K-7 감정(개산공제만) · 증여세 %s · 총 양도비 %s → ±0", async (g, n) => {
      expect(await pick(mk(K7, {}, g, n))).toEqual(await pick(mkCard(K7, {}, g, n)));
    });

  it("(A) K-5 환산 · 총 5,000,000 → ±0(개산공제가 크므로 양도비는 필요경비에 안 든다 — 가목 채택)", async () => {
    expect(await pick(mk(K5, {}, "0", "5,000,000"))).toEqual(await pick(mkCard(K5, {}, "0", "5,000,000")));
  });

  it("(B) K-4 실지 · 총 400,000,000 · 건물일 같음 → 필요경비 총 [2천만·8천만] ≠ 카드 [5천만·5천만], Σ 같음 · 세액은 같다(C)", async () => {
    const tot = await pick(mk(K4, {}, "0", "400,000,000"));
    const card = await pick(mkCard(K4, {}, "0", "400,000,000"));
    expect(tot.exp).toEqual([20_000_000, 80_000_000, 20_000_000, 80_000_000]);
    expect(card.exp).toEqual([50_000_000, 50_000_000, 50_000_000, 50_000_000]);
    expect(sum(tot.exp)).toBe(sum(card.exp));
    expect(tot.det).toBe(129_060_000);
    expect(card.det).toBe(129_060_000);
  });

  it.each([
    ["K-4 실지 · 증여세 0 · 총 5,000,000", K4, "0", "5,000,000", [250_000, 1_000_000, 250_000, 1_000_000], [625_000, 625_000, 625_000, 625_000], 211_536_600, 211_587_000],
    ["K-4 실지 · 증여세 0 · 총 400,000,000", K4, "0", "400,000,000", [20_000_000, 80_000_000, 20_000_000, 80_000_000], [50_000_000, 50_000_000, 50_000_000, 50_000_000], 138_020_000, 141_860_000],
    ["K-5 환산 · 증여세 0 · 총 400,000,000(§97②2호 단서 채택)", K5, "0", "400,000,000", [20_000_000, 80_000_000, 20_000_000, 80_000_000], [50_000_000, 50_000_000, 50_000_000, 50_000_000], 247_938_000, 251_970_000],
    ["K-4 실지 · 증여세 2,000,000 · 총 400,000,000", K4, "2,000,000", "400,000,000", [20_500_000, 80_500_000, 20_500_000, 80_500_000], [50_500_000, 50_500_000, 50_500_000, 50_500_000], 137_332_000, 141_172_000],
  ])("(D) 건물 증여자 취득일이 늦어 파트 보유기간이 갈리면 세액이 어긋난다 — %s", async (_n, m, g, n, expTot, expCard, detTot, detCard) => {
    const tot = await pick(mk(m, LATER_BUILDING, g, n));
    const card = await pick(mkCard(m, LATER_BUILDING, g, n));
    expect(tot.exp).toEqual(expTot);
    expect(card.exp).toEqual(expCard);
    expect([tot.det, card.det]).toEqual([detTot, detCard]);
  });
});

describe("BC-3 (E) 이월과세가 아닌 부담부증여 묶음도 취득시 비율≠양도시 비율이면 같다 — #2708 시료는 두 비율이 같아 못 봤다", () => {
  /** 취득시 기준시가 토지 1억 : 건물 4억(1:4) · 양도시 2억 : 2억(1:1) · 토지 취득일이 건물보다 10년 이르다. */
  const plain = (o: Partial<AssetForm> = {}) => ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01", landAcquisitionDate: "2005-03-01", gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "400,000,000",
    transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000",
    bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "150,000,000", bgActualAcquisitionBuilding: "150,000,000", ...o,
  }) as unknown as AssetForm;
  const mk = (total: string, over: Partial<AssetForm> = {}) =>
    formOf([plain(over), second(plain(over))], { ...BUNDLE, contractTotalPrice: "2,000,000,000", totalTransferExpense: total });

  it("K-4 · 총 5,000,000 → 필요경비 [25만·100만] vs 카드 [62.5만·62.5만], 세액 179,767,800 vs 179,793,000", async () => {
    const tot = await pick(mk("5,000,000"));
    const card = await pick(mk("0", { transferExpense: "2,500,000" }));
    expect([tot.exp, card.exp]).toEqual([[250_000, 1_000_000, 250_000, 1_000_000], [625_000, 625_000, 625_000, 625_000]]);
    expect([tot.det, card.det]).toEqual([179_767_800, 179_793_000]);
  });
  it("K-4 · 총 400,000,000 → 세액 119,140,000 vs 카드 121,060,000(Δ −1,920,000)", async () => {
    const tot = await pick(mk("400,000,000"));
    const card = await pick(mk("0", { transferExpense: "200,000,000" }));
    expect([tot.det, card.det]).toEqual([119_140_000, 121_060_000]);
    expect(sum(tot.exp)).toBe(sum(card.exp));
  });
  it("비율이 같은 시료(취득시 1:1)에서는 ±0 — #2708 BT-2가 고정한 셀과 같다", async () => {
    const tot = await pick(mk("400,000,000", { gbAcqBuildingValue: "100,000,000" }));
    const card = await pick(mk("0", { gbAcqBuildingValue: "100,000,000", transferExpense: "200,000,000" }));
    expect(tot).toEqual(card);
  });
});
