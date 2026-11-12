/**
 * anchor — 부담부증여(소령 §159) 묶음 × 폼 「총 양도비」 (2026-11-12 · 사용자 지시 · Q-5 후속)
 *
 * 결함: §159 안분(`burdened-gift-acquisition.ts`)은 선언 채널(자본적지출·양도비)만 읽는다. 총 양도비 몫은 옛 덩어리 `expenses`로만 와서
 *   **선언 채널 유무와 무관하게 통째로 버려졌다** — 토지 2건(시가 각 10억 · 채무 3억) · 총 양도비 2천만이 세액에 0원 반영.
 *   수정 전 실측: 같은 크기 +1,872,000 · 2:1 +2,496,000 · 축 B 60/40 +1,778,400(자산 칸 양도비 직접 입력 대비).
 * 수정: `withCommonExpenseInDeclaredChannel`이 부담부증여면 몫을 **항상** 양도비 칸에 싣는다(일반건물 부담부증여 `withBurdenedGiftCommonExpense`와 같은 성질 판단 —
 *   폼 「총 양도비」= 양도비 · 소득세법 §97①3호 · §100② 후문).
 * 약속: 총 양도비 한 번 입력 ≡ 각 자산 양도비 칸에 몫 직접 입력(같은 채무비율 · 같은 안분).
 * K-5(환산) 부담부증여는 개산공제만 쓰는 경로라 수정 전에도 같았다(회귀로 고정).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
/** 경제 입력: 양도시 기준시가 8억 · 취득시 4억 · 시가 10억 · 실지 2.5억. `sc`는 물건 크기 배율(오라클 단건용). */
const S = (n: number, sc: number) => String(Math.round(n * sc));
const BASE = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual" };
const land = (id: string, sc: number, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({
    assetId: id, ...BASE, bgMarketValueAtTransfer: S(1_000_000_000, sc), standardPriceAtTransfer: S(800_000_000, sc), standardPriceAtAcq: S(400_000_000, sc),
    assetKind: "land", bgActualAcquisitionLand: S(250_000_000, sc), landAreaM2: "100", landNature: "independent", companionLandNature: "independent",
  }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const AB = { assetSplitMode: "fractional", contractTotalPrice: "1000000000" };
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" };

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const ok2 = (r: Awaited<ReturnType<typeof post>>) => { expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200); return r; };


const K5 = { bgAcquisitionMethod: "converted", bgActualAcquisitionLand: "" };
const tax = (r: Awaited<ReturnType<typeof post>>) => r.j.data.aggregated.calculatedTax as number;
const exps = (r: Awaited<ReturnType<typeof post>>) => (r.j.data.aggregated.properties as { necessaryExpense: number }[]).map((p) => p.necessaryExpense);

describe("BGC-1 함께 양도 — 총 양도비 ≡ 자산 칸 양도비 몫 직접 입력", () => {
  const grid: [string, string, Record<string, unknown>, string, number, number, number, string, Record<string, unknown>][] = [];
  for (const kind of ["land", "building", "commercial_building"])
    for (const [m, mode] of [["K-4", {}], ["K-5", K5]] as const)
      for (const [sz, sc2, s1, s2] of [["같은 크기", 1, 10_000_000, 10_000_000], ["2:1", 0.5, 13_333_333, 6_666_667]] as const)
        for (const [c, ch] of [["선언 없음", {}], ["자본적지출", { capitalExpenditure: "10000000" }]] as const) grid.push([kind, m, mode, sz, sc2, s1, s2, c, ch]);
  it.each(grid)("%s · %s · %s · %s · %s", async (kind, _m, mode, _sz, sc2, s1, s2, _c, ch) => {
    const k = kind === "land" ? {} : { assetKind: kind, bgActualAcquisitionTotal: mode === K5 ? "" : "250000000", bgActualAcquisitionLand: "" };
    const two = (t: string, e0: Record<string, unknown>, e1: Record<string, unknown>) =>
      form([land("a", 1, debt("300000000"), k, mode, ch, e0), land("b", sc2, debt("300000000"), k, mode, { addressJibun: "제주특별자치도 강남구 테스트동 2-2" }, e1)], { ...BD, totalTransferExpense: t });
    const a = ok2(await post(two("20000000", {}, {})));
    const o = ok2(await post(two("0", { transferExpense: String(s1) }, { transferExpense: String(s2) })));
    expect(tax(a)).toBe(tax(o));
    expect(exps(a)).toEqual(exps(o));
  });
});

describe("BGC-2 고정값 — 토지 K-4 같은 크기", () => {
  const two = (t: string, e0: Record<string, unknown> = {}) =>
    form([land("a", 1, debt("300000000"), e0), land("b", 1, debt("300000000"), { addressJibun: "제주특별자치도 강남구 테스트동 2-2" })], { ...BD, totalTransferExpense: t });
  it("선언 없음 — 몫 1천만 × 채무비율 0.3 = 3,000,000씩 · 111,588,000(수정 전 113,460,000 · 필요경비 0)", async () => {
    const r = ok2(await post(two("20000000")));
    expect(tax(r)).toBe(111_588_000);
    expect(exps(r)).toEqual([3_000_000, 3_000_000]);
  });
  it("자본적지출 1천만 — 6,000,000 · 3,000,000 · 110,652,000(수정 전 112,524,000 · 몫 소실)", async () => {
    const r = ok2(await post(two("20000000", { capitalExpenditure: "10000000" })));
    expect(tax(r)).toBe(110_652_000);
    expect(exps(r)).toEqual([6_000_000, 3_000_000]);
  });
});

describe("BGC-3 축 B 지분 60/40 — 지분 카드 양도비 칸은 물건 전체 금액(× 지분율)", () => {
  it.each([["선언 없음", {}, 44_021_600], ["자본적지출", { capitalExpenditure: "10000000" }, 43_488_080]] as const)("%s", async (_c, ch, fixed) => {
    const ab = (t: string, e0: Record<string, unknown>, e1: Record<string, unknown>) =>
      form([land("a", 1, pct("60"), debt("300000000"), ch, e0), land("b", 1, pct("40"), debt("200000000"), e1)], { ...AB, totalTransferExpense: t });
    const a = ok2(await post(ab("20000000", {}, {})));
    const o = ok2(await post(ab("0", { transferExpense: "20000000" }, { transferExpense: "20000000" })));
    expect(tax(a)).toBe(tax(o));
    expect(tax(a)).toBe(fixed); // 수정 전 +1,778,400
  });
});
