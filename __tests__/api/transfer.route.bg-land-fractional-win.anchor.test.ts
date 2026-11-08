/**
 * anchor — 부담부증여 **지분 토지의 담보(상증법 §66)·임대(§61⑤) 승** 개방 (V-S1 Q-1 a).
 * 계획서 `docs/00-pm/bg-fractional-winner-kinds-grid.plan.md` §3.1·§3.1.1·§4 Q-1 · 선행 `bg-axis-a-nonsupp-win.plan.md`(주택).
 *
 * 종전: 게이트 `bgFractionalCollateralKindSupported`가 주택만 통과시켜, 토지는 시가 모드 담보 승 3모양(축 A 단건 · 축 B · 함께 양도)과
 * 함께 양도의 기준시가 모드 담보·임대 승을 ⑧이 막았다. 그러나 ⑫(엔진)는 15칸 모두 같은 종류 단건 기준과 일치했다(1원 1칸은 주택 대조군도 같다).
 * 지금: 게이트에 `land`를 더했다. ⑤ 취득시 기준시가 칸 · 필요경비 칸 숨김 · ⑧ 입력 요구가 모두 `bgCollateralForcesStdAcq` 하나를 읽어 함께 따라온다.
 *
 * 오라클 = 같은 종류의 단건(축 A 단건 = 반 크기 단건 · 축 B = 단건 100% · 함께 양도 = 단건 합) + 손계산 고정값(494,000,000).
 *
 * · BL-1 축 A 단건 — 시가 담보(신규 통과) · 기준시가 담보 · 기준시가 임대: ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클.
 * · BL-2 축 B 60/40 시가 담보(신규 통과): 양도차익 = 단건 100%.
 * · BL-3 함께 양도 100%+50% — 시가 담보 · 기준시가 담보 · 기준시가 임대(전부 신규 통과): 양도차익 = 단건 합.
 * · BL-4 입력 요구 정합 — 취득시 기준시가를 총액 / 단가×면적으로 넣으면 같은 값, 비우면 ⑧ 차단(칸 standardPriceAtAcq) ∧ ⑫ 400 (⑧ ⊇ ⑫).
 * · BL-5 ⑤ 술어 — 축 A 토지 담보 승: 취득가액 강제 ∧ 취득시 기준시가 칸 ∧ 필요경비 «개산공제만». 보충 승은 강제하지 않는다.
 * · BL-6 숨은 필요경비(자본적지출·양도비)가 세액으로 새지 않는다.
 * · BL-7 범위 밖 — 일반건물·재개발 APT 지분 담보 승은 종전 사유로 계속 막는다.
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bgCollateralForcesStdAcq, bgFractionalCollateralKindSupported, bgFractionalCollateralWin, bgSplitAxisCollateralWinUnsupported } from "@/lib/calc/burdened-gift-collateral-win";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { bgExpenseInputsUnused } from "@/lib/calc/burdened-gift-expense-scope";

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
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" };
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const RENT = { bgLendingDepositTotal: "100000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const AB = { assetSplitMode: "fractional", contractTotalPrice: "1000000000" };
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" };

/** 화면과 같은 ⑧ 전체 메시지. */
const issues = (f: TransferFormData) => {
  const out: { field?: string; message: string }[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) out.push({ field: i.field, message: i.message });
  return out;
};
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const gainOf = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const ok = (r: Awaited<ReturnType<typeof post>>) => { expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200); return gainOf(r)!; };
/** 오라클: 같은 종류 단건(물건 크기 sc). 채무·보증금·임대료는 입력 그대로. */
const single = async (sc: number, ...over: Record<string, unknown>[]) => ok(await post(form([land("z", sc, ...over)])));

describe("BL-1 축 A 단건 — ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 반 크기 단건", () => {
  // 손계산(기준시가 담보 · 채무 7억): C = max(보충 8억 × 50% = 4억, 담보 7억) = 7억 → 채무비율 1 → 취득가액 = 취득시 기준시가 4억 × 50% × 1 = 2억 · 개산공제 3% = 600만 → 7억 − 2억 − 600만 = 494,000,000
  it.each([
    ["시가 · 담보 (신규 통과)", [debt("700000000")], 494_000_000],
    ["기준시가 · 담보", [STD, debt("700000000")], 494_000_000],
    ["기준시가 · 임대", [STD, RENT], 81_272_728],
  ] as const)("%s", async (_n, over, gain) => {
    const f = form([land("a", 1, HALF, ...over)]);
    expect(issues(f)).toEqual([]);
    const g = ok(await post(f));
    expect(g).toBe(gain);
    expect(g).toBe(await single(0.5, ...over));
  });
  it("보충 승(채무 3억)은 종전 그대로 통과 — 안전망", async () => {
    const f = form([land("a", 1, HALF, debt("300000000"))]);
    expect(issues(f)).toEqual([]);
    expect(ok(await post(f))).toBe(await single(0.5, debt("300000000")));
  });
});

describe("BL-2 축 B 60/40 시가 담보 — 두 카드 합 = 같은 물건 단건 100%", () => {
  it("채무 물건 전체 14억: ⑧ 통과 ∧ ⑫ 200 ∧ 988,000,000", async () => {
    const w = debt("1400000000");
    const f = form([land("p", 1, pct("60"), w), land("s", 1, pct("40"), w)], AB);
    expect(issues(f)).toEqual([]);
    const g = ok(await post(f));
    expect(g).toBe(988_000_000);
    expect(g).toBe(await single(1, w));
  });
});

describe("BL-3 함께 양도 100%+50% — 양도차익 = 자산별 단건의 합", () => {
  it.each([
    ["시가 · 담보", [], debt("1600000000"), debt("700000000"), 1_682_000_000],
    ["기준시가 · 담보", [STD], debt("1600000000"), debt("700000000"), 1_682_000_000],
    ["기준시가 · 임대", [STD], { ...RENT, bgLendingDepositTotal: "200000000", bgAnnualRentTotal: "240000000" }, RENT, 243_818_183],
  ] as const)("%s", async (_n, mode, w100, w50, gain) => {
    const f = form([land("a", 1, ...mode, w100), land("b", 1, HALF, ...mode, w50)], BD);
    expect(issues(f)).toEqual([]);
    const g = ok(await post(f));
    expect(g).toBe(gain);
    expect(g).toBe((await single(1, ...mode, w100)) + (await single(0.5, ...mode, w50)));
  });
});

describe("BL-4 입력 요구 정합 — 취득시 기준시가", () => {
  const PER_AREA = { standardPriceAtAcq: "", standardPricePerSqmAtAcq: "4000000", acquisitionArea: "100" };
  it("총액 입력과 단가 × 면적(총액 비움)은 같은 값 — ⑧ 통과 ∧ ⑫ 200", async () => {
    const a = form([land("a", 1, HALF, debt("700000000"))]);
    const b = form([land("a", 1, HALF, debt("700000000"), PER_AREA)]);
    expect(issues(b)).toEqual([]);
    expect(ok(await post(b))).toBe(ok(await post(a)));
  });
  it("전부 비우면 ⑧ 차단(칸 standardPriceAtAcq) ∧ ⑫ 400 (⑧ ⊇ ⑫) — 막다른 길이 아니다", async () => {
    for (const over of [[debt("700000000")], [STD, debt("700000000")]]) {
      const f = form([land("a", 1, HALF, ...over, x({ standardPriceAtAcq: "" }))]);
      const m = issues(f);
      expect(m.length).toBe(1);
      expect(m[0].field).toBe("standardPriceAtAcq");
      expect((await post(f)).status).toBe(400);
    }
  });
  it("시가 담보 승은 실지취득가액을 비워도 통과(엔진이 읽지 않는 값을 요구하지 않는다)", async () => {
    const f = form([land("a", 1, HALF, debt("700000000"), x({ bgActualAcquisitionLand: "" }))]);
    expect(issues(f)).toEqual([]);
    expect((await post(f)).status).toBe(200);
  });
});

describe("BL-5 ⑤ 술어 — 축 A 토지 담보 승", () => {
  const a = land("a", 1, HALF, debt("700000000"));
  it("축 A(false): 취득가액 강제 ∧ 취득시 기준시가 칸 ∧ 필요경비 «개산공제만»", () => {
    expect(bgCollateralForcesStdAcq(a, false)).toBe(true);
    expect(needsBgAcqStdPriceInput(a, false)).toBe(true);
    expect(bgExpenseInputsUnused(a, false)).toBe(true);
  });
  it("보충 승 지분(채무 3억)은 강제하지 않는다", () => {
    expect(bgCollateralForcesStdAcq(land("a", 1, HALF, debt("300000000")), false)).toBe(false);
  });
});

describe("BL-6 숨은 필요경비(자본적지출 5,000만 · 양도비 2,000만)가 세액으로 새지 않는다", () => {
  const STALE = { capitalExpenditure: "50000000", transferExpense: "20000000" };
  it.each([
    ["축 A 단건 시가 담보", (o: Record<string, unknown>) => form([land("a", 1, HALF, debt("700000000"), o)])],
    ["축 B 60/40 시가 담보", (o: Record<string, unknown>) => form([land("p", 1, pct("60"), debt("1400000000"), o), land("s", 1, pct("40"), debt("1400000000"), o)], AB)],
    ["축 A 단건 기준시가 담보", (o: Record<string, unknown>) => form([land("a", 1, HALF, STD, debt("700000000"), o)])],
  ])("%s", async (_n, mk) => {
    expect(ok(await post(mk(STALE)))).toBe(ok(await post(mk({}))));
  });
});

describe("BL-7 범위 밖 — 일반건물·재개발 APT·입주권·겸용은 계속 막는다 (종류 게이트)", () => {
  const kind = (k: string, ...over: Record<string, unknown>[]) => land("a", 1, HALF, debt("700000000"), x({ assetKind: k }), ...over);
  it("토지·주택은 열리고 일반건물·재개발 APT·입주권은 닫힌다", () => {
    expect(bgFractionalCollateralKindSupported(kind("land"))).toBe(true);
    expect(bgFractionalCollateralKindSupported(kind("housing"))).toBe(true);
    for (const k of ["general_building", "redevelopment_apt", "right_to_move_in"]) expect(bgFractionalCollateralKindSupported(kind(k)), k).toBe(false);
  });
  it("겸용 주택·이월과세 토지는 닫힌다", () => {
    expect(bgFractionalCollateralKindSupported(kind("housing", x({ isMixedUseHouse: true })))).toBe(false);
    expect(bgFractionalCollateralKindSupported(kind("land", x({ acquisitionCause: "carryover_gift" })))).toBe(false);
  });
  it("닫힌 종류의 지분 담보 승은 ⑧ 술어가 막는다(bgSplitAxisCollateralWinUnsupported · bgFractionalCollateralWin)", () => {
    // 축 B 판정은 물건 전체 — 채무 14억 > 시가 10억이어야 담보 승이다.
    const big = (k: string) => kind(k, debt("1400000000"));
    expect(bgSplitAxisCollateralWinUnsupported(big("general_building"))).toBe(true);
    expect(bgSplitAxisCollateralWinUnsupported(big("land"))).toBe(false);
    expect(bgFractionalCollateralWin(kind("land"))).toBe(true);
  });
});
