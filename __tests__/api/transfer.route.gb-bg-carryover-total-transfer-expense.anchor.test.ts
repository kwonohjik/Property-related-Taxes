/**
 * anchor — 일반건물 **부담부증여(§159) × (이월과세 §97의2) × 폼 총 양도비** (계획서 `docs/00-pm/gb-total-transfer-expense-loss.plan.md` §14 · `gb-bg-companion-total-expense-channel.plan.md`)
 *
 * 오라클 — 총 양도비 N을 한 번 입력한 결과는 같은 금액을 이미 되던 채널(자산 카드의 양도비 칸)로 넣은 결과와 카드별 필요경비·세액·시나리오 판정이 ±0으로 같다.
 *  · 축 B(지분): 총 N ≡ 각 지분 카드 양도비 칸 N(100% 기준 — 엔진이 × 지분율). 이월과세 지분마다 A/B를 비교한다.
 *  · 함께 양도: 총 N ≡ 두 자산 칸 N/2씩(양도가액 균등).
 *
 * 수정 前(#2712 측정) — 축 B는 전부 ±0이었지만 함께 양도(K-4·K-5)는 ① 자산 칸에 자본적지출이 있으면 총 양도비가 **통째로 소실**되고 ② 없어도 총 양도비가 **취득시** 기준시가로 나뉘었다
 *  (옛 덩어리가 부담부증여 분기에서 `capitalExpenditure` 슬롯으로 읽혀 §159 안분이 자본적지출로 다뤘다 — `general-building-route-actual.ts` · `burdened-gift-acquisition.ts` `splitBgRealExpenseByNature`).
 * 수정 後 — `withBurdenedGiftCommonExpense`(`general-building-part-cards.ts`)가 공통 몫을 **양도비 칸**으로, 옛 덩어리 직접분을 **자본적지출 칸**(종전 분류 그대로)으로 옮긴다. 이 파일은 그 전 격자가 전부 ±0임을 고정한다.
 * 수치는 mock 세율표 실측값. 시료: 시가 10억 · 채무 5억 · 양도 2026-03-01.
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
import { withBurdenedGiftCommonExpense } from "@/app/api/calc/transfer/general-building-part-cards";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

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

describe("BC-2 함께 양도 × 부담부증여 × 이월과세 — 총 양도비 ≡ 자산 칸 N/2씩 (전 격자 ±0)", () => {
  const half = (s: string) => money(Number(s.replace(/,/g, "")) / 2);
  const mk = (m: Partial<AssetForm>, o: Partial<AssetForm>, g: string, total: string) => {
    const A = (x: Partial<AssetForm> = {}) => gbAsset({ ...m, ...o, ...x }, { giftTaxAmount: g });
    return formOf([A(), second(A())], { ...BUNDLE, contractTotalPrice: "2,000,000,000", totalTransferExpense: total });
  };
  const mkCard = (m: Partial<AssetForm>, o: Partial<AssetForm>, g: string, n: string) => {
    const A = (x: Partial<AssetForm> = {}) => gbAsset({ ...m, ...o, ...x, transferExpense: half(n) }, { giftTaxAmount: g });
    return formOf([A(), second(A())], { ...BUNDLE, contractTotalPrice: "2,000,000,000", totalTransferExpense: "0" });
  };
  const modes = [["K-5 환산", K5], ["K-4 실지", K4], ["K-7 감정", K7]] as const;
  const variants = [["건물일 같음", {}], ["건물일 늦음", LATER_BUILDING]] as const;
  const capexes = [["자본적지출 없음", {}], ["자본적지출 10,000,000", { capitalExpenditure: "10,000,000" }]] as const;
  const rows = modes.flatMap(([mn, m]) => variants.flatMap(([vn, v]) => capexes.flatMap(([cn, c]) =>
    ["0", "2,000,000"].flatMap((g) => ["5,000,000", "400,000,000", "700,000,000"].map((n) => ({ mn, m, vn, v, cn, c, g, n }))))));

  it.each(rows)("$mn · $vn · $cn · 증여세 $g · 총 양도비 $n", async ({ m, v, c, g, n }) => {
    const over = { ...v, ...c } as Partial<AssetForm>;
    const none = await pick(mk(m, over, g, "0"));
    const tot = await pick(mk(m, over, g, n));
    const card = await pick(mkCard(m, over, g, n));
    expect(tot).toEqual(card);
    // 양도비가 필요경비에 닿는 셀만 「양도비 없음」과 달라야 한다(빈 일치 방지) — 감정은 개산공제만, 환산 5백만은 가목이 커서 안 닿는다.
    if (m === K4 || (m === K5 && n !== "5,000,000")) expect(tot.exp).not.toEqual(none.exp);
  });

  it("K-4 · 총 400,000,000 · 건물일 같음 → 필요경비 [5천만 ×4](종전 [2천만·8천만]) · 세액 129,060,000", async () => {
    const tot = await pick(mk(K4, {}, "0", "400,000,000"));
    expect(tot.exp).toEqual([50_000_000, 50_000_000, 50_000_000, 50_000_000]);
    expect(tot.det).toBe(129_060_000);
  });

  it.each([
    ["K-4 실지 · 증여세 0 · 총 5,000,000", K4, "0", "5,000,000", 211_587_000],
    ["K-4 실지 · 증여세 0 · 총 400,000,000", K4, "0", "400,000,000", 141_860_000],
    ["K-5 환산 · 증여세 0 · 총 400,000,000(§97②2호 단서 채택)", K5, "0", "400,000,000", 251_970_000],
    ["K-4 실지 · 증여세 2,000,000 · 총 400,000,000", K4, "2,000,000", "400,000,000", 141_172_000],
  ])("건물 증여자 취득일이 늦어 파트 보유기간이 갈려도 자산 칸과 같은 세액 — %s", async (_n, m, g, n, det) => {
    expect((await pick(mk(m, LATER_BUILDING, g, n))).det).toBe(det);
  });
});

describe("BC-3 이월과세가 아닌 부담부증여 묶음 — 취득시 비율(1:4)≠양도시 비율(1:1)·토지 취득일 상이에서도 자산 칸과 같다", () => {
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
  const half = (s: string) => money(Number(s.replace(/,/g, "")) / 2);

  it("K-4 · 총 5,000,000 → 필요경비 [62.5만 ×4](종전 [25만·100만]) · 세액 179,793,000(종전 179,767,800)", async () => {
    const tot = await pick(mk("5,000,000"));
    expect(tot).toEqual(await pick(mk("0", { transferExpense: "2,500,000" })));
    expect([tot.det, tot.exp]).toEqual([179_793_000, [625_000, 625_000, 625_000, 625_000]]);
  });
  it("K-4 · 총 400,000,000 → 세액 121,060,000(종전 119,140,000)", async () => {
    const tot = await pick(mk("400,000,000"));
    expect(tot).toEqual(await pick(mk("0", { transferExpense: "200,000,000" })));
    expect(tot.det).toBe(121_060_000);
  });
  it("비율이 같은 시료(취득시 1:1)에서도 ±0 — #2708 BT-2가 고정한 셀과 같다", async () => {
    const tot = await pick(mk("400,000,000", { gbAcqBuildingValue: "100,000,000" }));
    expect(tot).toEqual(await pick(mk("0", { gbAcqBuildingValue: "100,000,000", transferExpense: "200,000,000" })));
  });

  describe("BC-4 자산 칸 자본적지출 + 총 양도비 — 종전엔 총 양도비가 통째로 소실(세액이 총 양도비 없음과 같았다)", () => {
    it.each([
      ["5,000,000", 176_584_200, [1_625_000, 4_625_000, 1_625_000, 4_625_000]],
      ["400,000,000", 118_004_000, [51_000_000, 54_000_000, 51_000_000, 54_000_000]],
    ])("비이월 K-4 · 자본적지출 10,000,000 + 총 %s", async (n, det, exp) => {
      const none = await pick(mk("0", { capitalExpenditure: "10,000,000" }));
      const tot = await pick(mk(n, { capitalExpenditure: "10,000,000" }));
      expect(none).toMatchObject({ det: 177_361_200, exp: [1_000_000, 4_000_000, 1_000_000, 4_000_000] });
      expect(tot).toEqual(await pick(mk("0", { capitalExpenditure: "10,000,000", transferExpense: half(n) })));
      expect([tot.det, tot.exp]).toEqual([det, exp]);
    });
  });

  describe("BC-5 옛 필요경비 칸 직접분 + 총 양도비 — 직접분은 종전 분류(자본적지출) 그대로, 총 양도비만 양도비 몫", () => {
    it.each([
      ["5,000,000", 178_830_360, [925_000, 1_825_000, 925_000, 1_825_000]],
      ["400,000,000", 120_143_200, [50_300_000, 51_200_000, 50_300_000, 51_200_000]],
    ])("옛 칸 3,000,000 + 총 %s ≡ 자본적지출 3,000,000 + 양도비 N/2", async (n, det, exp) => {
      const tot = await pick(mk(n, { directExpenses: "3,000,000" }));
      expect(tot).toEqual(await pick(mk("0", { capitalExpenditure: "3,000,000", transferExpense: half(n) })));
      expect([tot.det, tot.exp]).toEqual([det, exp]);
    });
    it("회귀 — 총 양도비 없음이면 옛 칸 단독은 종전 값 그대로(179,607,360 · 취득시 비율 [30만·120만])", async () => {
      expect(await pick(mk("0", { directExpenses: "3,000,000" }))).toMatchObject({ det: 179_607_360, exp: [300_000, 1_200_000, 300_000, 1_200_000] });
    });
  });
});

describe("BC-6 withBurdenedGiftCommonExpense — 이동 규칙 단위", () => {
  const BG = {} as unknown as BurdenedGiftInfo;
  it("부담부증여가 아니면 그대로", () => {
    const g = { transferExpense: 7 };
    expect(withBurdenedGiftCommonExpense(g, 100, 130, undefined)).toEqual({ gbv: g, legacyExpenses: 130 });
  });
  it("몫 0이면 그대로(옛 덩어리 단독은 종전 경로)", () => {
    const g = {};
    expect(withBurdenedGiftCommonExpense(g, 0, 30, BG)).toEqual({ gbv: g, legacyExpenses: 30 });
  });
  it("증축 이전 형식 직접분(bundledExpenses > 0)이면 그대로", () => {
    const g = { bundledExpenses: 5 };
    expect(withBurdenedGiftCommonExpense(g, 100, 130, BG)).toEqual({ gbv: g, legacyExpenses: 130 });
  });
  it("부담부증여 · 몫 100 · 옛 덩어리 130 → 양도비 +100 · 자본적지출 +30(직접분) · 옛 덩어리 0", () => {
    expect(withBurdenedGiftCommonExpense({ capitalExpenditure: 10, transferExpense: 20 }, 100, 130, BG))
      .toEqual({ gbv: { capitalExpenditure: 40, transferExpense: 120 }, legacyExpenses: 0 });
  });
  it("옛 덩어리가 몫보다 작아도 음수가 되지 않는다", () => {
    expect(withBurdenedGiftCommonExpense({}, 100, 40, BG)).toEqual({ gbv: { capitalExpenditure: 0, transferExpense: 100 }, legacyExpenses: 0 });
  });
});
