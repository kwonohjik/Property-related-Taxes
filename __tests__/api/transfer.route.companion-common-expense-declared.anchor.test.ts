/**
 * anchor — Q-5: 함께 양도(일반건물·재개발 외) × 폼 상단 「총 양도비」 × 자산 칸 자본적지출(선언 채널) (2026-11-12 · 사용자 지시)
 *
 * 결함: 엔진은 자본적지출·양도비(선언 채널)가 하나라도 있으면 `expenses`(= 직접 + 총 양도비 몫)를 읽지 않고,
 *   환산이면 선언 채널만 §97②2호 단서 비교에 쓴다 → 총 양도비의 그 자산 몫이 통째로 사라졌다.
 *   실측(토지 2건 · 총 양도비 20,000,000 · 양도가액 4억:3억): 실가 자본적지출 주 자산 세액 +3,291,428 · 컴패니언 +2,468,571 ·
 *   환산 단서 미발동 +5,823,772 · 축 B 지분 +3,456,000 · 이월과세 A 컴패니언 필요경비 40,000,000(정답 45,714,286).
 * 수정: `withCommonExpenseInDeclaredChannel`(`app/api/calc/transfer/engine-input.ts`) — 선언 채널이 있거나 환산이면 몫을 양도비 칸에 더한다
 *   (일반건물 `withBundledCommonExpense`와 같은 규칙). 주 자산(`bundled-route.ts`)·컴패니언(`bundled-split-helpers.ts`) 같은 leaf.
 * 약속(BC-4와 같다): **총 양도비 N 한 번 입력 ≡ 각 자산 양도비 칸에 몫(양도가액 비례 · 마지막 자산 잔액 흡수) 직접 입력** (소득세법 §100② 후문).
 *   총 양도비를 넣으면 자산 칸 양도비는 꺼진다(O-9) — 그래서 선언 채널은 자본적지출로 잰다.
 *
 * 부담부증여(§159) 묶음은 후속 수정 — `transfer.route.bg-bundle-common-expense.anchor.test.ts`. 범위 밖(별건): 겸용 컴패니언은 직접 입력이 없어도 몫이 빠진다.
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
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { withCommonExpenseInDeclaredChannel } from "@/app/api/calc/transfer/engine-input";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});



const landAsset = (id: number, over: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000", ...over,
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, {
    transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual",
    contractTotalPrice: "2000000000", ...over,
  });
  return f as unknown as TransferFormData;
};
async function run(f: TransferFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  expect(res.status, `${JSON.stringify(j.error)} ${String(allIssues(f)).slice(0, 120)}`).toBe(200);
  const ps = j.data.aggregated.properties as { propertyId: string; necessaryExpense: number }[];
  return { tax: j.data.aggregated.calculatedTax as number, cards: ps.map((p) => p.necessaryExpense) };
}

const EST = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "" } as Partial<AssetForm>;
const land2 = (id: number, sale: string, over: Partial<AssetForm> = {}) => landAsset(id, { addressJibun: `서울 강남구 테스트동 ${id}-${id}`, actualSalePrice: sale, ...over });
const T = 20_000_000;
const S1 = Math.floor((T * 4) / 7);
const S2 = T - S1;
type Ch = Partial<AssetForm>;
const CAPEX: Ch = { capitalExpenditure: "20000000" };
const CAPEX_BIG: Ch = { capitalExpenditure: "195000000" };
/** 총 양도비 한 번(A) ↔ 각 자산 양도비 칸에 몫 직접 입력(오라클). `ch`는 `pos` 자산의 선언 채널. */
async function pair(kind: string, mode: Ch, pos: 0 | 1, ch: Ch) {
  const k = { assetKind: kind } as Ch;
  const mk = (e0: Ch, e1: Ch) => [
    land2(1, "400000000", { ...k, ...mode, ...(pos === 0 ? ch : {}), ...e0 }),
    land2(2, "300000000", { ...k, ...mode, ...(pos === 1 ? ch : {}), ...e1 }),
  ];
  const a = await run(bundle(mk({}, {}), { contractTotalPrice: "700000000", totalTransferExpense: String(T) }));
  const o = await run(bundle(mk({ transferExpense: String(S1) }, { transferExpense: String(S2) }), { contractTotalPrice: "700000000", totalTransferExpense: "0" }));
  return { a, o };
}

describe("Q5-1 총 양도비 ≡ 자산 칸 몫 직접 입력 — 토지·건물·상가 × 실가·환산 × 주/컴패니언 × 선언 채널", () => {
  const grid: [string, string, Ch, 0 | 1, string, Ch][] = [];
  for (const kind of ["land", "building", "commercial_building"])
    for (const [m, mode] of [["실가", {}], ["환산", EST]] as const)
      for (const pos of [0, 1] as const)
        for (const [c, ch] of [["자본적지출", CAPEX], ["선언 없음", {}], ["자본적지출 큼(단서 경계)", CAPEX_BIG]] as const) grid.push([kind, m, mode, pos, c, ch]);
  it.each(grid)("%s · %s · 자산 %i · %s", async (kind, _m, mode, pos, _c, ch) => {
    const { a, o } = await pair(kind, mode, pos, ch);
    expect(a.tax).toBe(o.tax);
    expect(a.cards.slice(0, 2)).toEqual(o.cards.slice(0, 2));
  });
});

describe("Q5-2 고정값 — 토지 실가 자본적지출(수정 전 세액)", () => {
  it.each([
    [0, 105_540_000, [31_428_571, 8_571_429]], // 수정 전 108,831,428 · 주 자산 20,000,000
    [1, 105_540_000, [11_428_571, 28_571_429]], // 수정 전 108,008,571 · 컴패니언 20,000,000
  ] as const)("자산 %i", async (pos, tax, cards) => {
    const { a } = await pair("land", {}, pos, CAPEX);
    expect(a.tax).toBe(tax);
    expect(a.cards).toEqual(cards);
  });
  it("환산 · 자본적지출 2억 — 몫이 들어가야 §97②2호 단서가 발동한다(수정 전 73,228,400)", async () => {
    const { a } = await pair("land", EST, 0, { capitalExpenditure: "200000000" });
    expect(a.tax).toBe(70_922_343);
    expect(a.cards[0]).toBe(211_428_571);
  });
});

describe("Q5-3 축 B 토지 지분 60/40 — 지분 카드 양도비 칸은 물건 전체 금액(× 지분율)", () => {
  it.each([["실가", {}], ["환산", EST]] as const)("%s · 자본적지출", async (_m, mode) => {
    const sh = (id: number, n: string, extra: Ch) => land2(1, "700000000", { assetId: `s${id}`, ownershipNumerator: n, ownershipDenominator: "100", ...mode, ...extra } as Ch);
    const mk = (e0: Ch, e1: Ch) => [sh(1, "60", { ...CAPEX, ...e0 }), sh(2, "40", e1)];
    const a = await run(bundle(mk({}, {}), { assetSplitMode: "fractional", contractTotalPrice: "700000000", totalTransferExpense: String(T) }));
    const o = await run(bundle(mk({ transferExpense: String(T) }, { transferExpense: String(T) }), { assetSplitMode: "fractional", contractTotalPrice: "700000000", totalTransferExpense: "0" }));
    expect(a.tax).toBe(o.tax);
  });
  it("실가 고정값 — 136,644,000 · 주 자산 24,000,000(수정 전 12,000,000 · 세액 +3,456,000)", async () => {
    const sh = (id: number, n: string, extra: Ch) => land2(1, "700000000", { assetId: `s${id}`, ownershipNumerator: n, ownershipDenominator: "100", ...extra } as Ch);
    const a = await run(bundle([sh(1, "60", CAPEX), sh(2, "40", {})], { assetSplitMode: "fractional", contractTotalPrice: "700000000", totalTransferExpense: String(T) }));
    expect(a.tax).toBe(136_644_000);
    expect(a.cards).toEqual([24_000_000, 8_000_000]);
  });
});

describe("Q5-4 환산 · 선언 없음 — 몫이 환산취득가액 + 개산공제보다 크면 §97②2호 단서", () => {
  it("취득시 기준시가 1천만(환산 2천만 + 개산공제 30만) · 총 양도비 1억 → 몫이 단서 비교에 들어간다", async () => {
    const small = { ...EST, standardPriceAtAcq: "10000000" } as Ch;
    const T2 = 100_000_000;
    const s1 = Math.floor((T2 * 4) / 7);
    const mk = (e0: Ch, e1: Ch) => [land2(1, "400000000", { ...small, ...e0 }), land2(2, "300000000", { ...small, ...e1 })];
    const a = await run(bundle(mk({}, {}), { contractTotalPrice: "700000000", totalTransferExpense: String(T2) }));
    const o = await run(bundle(mk({ transferExpense: String(s1) }, { transferExpense: String(T2 - s1) }), { contractTotalPrice: "700000000", totalTransferExpense: "0" }));
    expect(a.tax).toBe(o.tax);
    expect(a.cards[0]).toBe(s1);
  });
});

describe("Q5-5 leaf 규칙 — 어느 칸에 싣는가", () => {
  const W = withCommonExpenseInDeclaredChannel;
  it("실가 · 선언 없음 → 그대로(`expenses`가 몫을 싣는다)", () => {
    expect(W({ useEstimatedAcquisition: false }, 5)).toEqual({ useEstimatedAcquisition: false });
  });
  it("선언 채널(자본적지출) 있음 → 양도비 칸에 더한다", () => {
    expect(W({ capitalExpenditure: 10 }, 5)).toEqual({ capitalExpenditure: 10, transferExpense: 5 });
    expect(W({ transferExpense: 1 }, 5)).toEqual({ transferExpense: 6 });
  });
  it("환산 → 선언 없어도 양도비 칸에(§97②2호 단서 비교)", () => {
    expect(W({ useEstimatedAcquisition: true }, 5)).toEqual({ useEstimatedAcquisition: true, transferExpense: 5 });
  });
  it("부담부증여(§159)는 선언 채널이 없어도 항상 양도비 칸에(§159 안분은 선언 채널만 읽는다 — `transfer.route.bg-bundle-common-expense`)", () => {
    expect(W({ burdenedGiftInfo: {} }, 5)).toEqual({ burdenedGiftInfo: {}, transferExpense: 5 });
    expect(W({ capitalExpenditure: 10, burdenedGiftInfo: {} }, 5)).toEqual({ capitalExpenditure: 10, burdenedGiftInfo: {}, transferExpense: 5 });
  });
  it("재개발(§166 — `withRedevCommonExpense`)·몫 0은 건드리지 않는다", () => {
    expect(W({ capitalExpenditure: 10, redevelopment: {} }, 5)).toEqual({ capitalExpenditure: 10, redevelopment: {} });
    expect(W({ redevelopment: {}, burdenedGiftInfo: {} }, 5)).toEqual({ redevelopment: {}, burdenedGiftInfo: {} });
    expect(W({ capitalExpenditure: 10 }, 0)).toEqual({ capitalExpenditure: 10 });
    expect(W({ capitalExpenditure: 10 }, undefined)).toEqual({ capitalExpenditure: 10 });
  });
});
