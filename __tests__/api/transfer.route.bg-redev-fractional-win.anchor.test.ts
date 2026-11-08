/**
 * anchor — 부담부증여 **지분 재개발 APT(완공 아파트)의 담보(상증법 §66)·임대(§61⑤) 승** 부분 개방 (V-S1g · Q-1 a).
 * 계획서 `docs/00-pm/bg-redev-fractional-collateral-win.plan.md` §3·§4 · 선행 `bg-fractional-winner-kinds-grid.plan.md` §3.3.
 *
 * 종전: 게이트 `bgFractionalCollateralKindSupported`가 주택·토지만 통과시켜, 재개발은 시가 모드 담보 승 3모양(축 A 단건 · 축 B · 함께 양도)과
 * 함께 양도의 기준시가 모드 담보·임대 승을 ⑧이 막았다. ⑫(엔진)는 84칸 모두 같은 종류 단건 기준과 맞았다(±1~3원 5칸은 게이트 무관 — 축 B 안분 반올림).
 * 지금: 게이트에 `redevelopment_apt`를 더하되, **시가 모드 · 환산취득가액(K-5) · 승계조합원 아님**은 연 채로 두지 않는다 —
 * 그 조합은 ⑤가 취득시 기준시가 칸을 안 띄우는데(`redevPreApprovalAcqMode`가 담보 승을 축 없이 읽어 «환산»으로 판정) ⑫가 그 값을 요구해
 * ⑧ 0건 → ⑫ 400의 막다른 길이 된다(계획서 §3.3). 그 조합은 ⑧이 계속 막는다.
 *
 * 오라클 = 같은 종류·같은 시나리오의 단건(축 A 단건 = 반 크기 단건 · 축 B = 단건 100% · 함께 양도 = 단건 합) + 안분 이전 손계산(명세 필드).
 *
 * · RD-1 청산금 납부 — 신규 통과 6칸: ⑧ 0건 ∧ ⑫ 200 ∧ 양도차익 = 오라클 (+ 명세: 담보 승 · 채무비율 1 · 취득가액 2억 · 개산공제 600만).
 * · RD-2 시나리오 변형 — 청산금 수령 · 토지 출자 · 승계조합원(K-5 포함, 승계는 §166 밖이라 열린다).
 * · RD-3 시가 · K-5 · 담보 승 · 지분(승계 제외)은 ⑧이 계속 막는다 — 막다른 길 방지(⑧ ⊇ ⑫) · 안내 문구 · 보충 승은 종전 그대로 통과.
 * · RD-4 취득시 기준시가를 비우면 ⑧ 차단(칸 standardPriceAtAcq) ∧ ⑫ 400 (⑧ ⊇ ⑫).
 * · RD-5 ⑤ 술어 — 게이트 · 강제 · 취득시 기준시가 칸 · 산정방식 판정.
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
import { bgCollateralForcesStdAcq, bgFractionalCollateralKindSupported } from "@/lib/calc/burdened-gift-collateral-win";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { redevPreApprovalAcqMode } from "@/lib/calc/redev-pre-approval-acq-mode";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
/** 세대 주택 수 1 + «다른 주택 없음» 확인 — 재개발은 주택 계열이라 명부 확인이 필요하다(어긋나면 ⑧이 재개발과 무관한 사유를 얹는다). */
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const S = (n: number, sc: number) => String(Math.round(n * sc));
const BASE = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual" };
type Variant = "pay" | "receive" | "land" | "successor";
/** 원조합원 · 주택 출자 · 청산금 납부가 기본. 크기 sc — 청산금은 «지분 해당분»을 호출자가 정한다(화면 규약). */
const redevFields = (sc: number, v: Variant): Record<string, unknown> => {
  const b: Record<string, unknown> = { assetKind: "redevelopment_apt", actualSalePrice: S(525_000_000, sc), redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevRightsValue: S(219_218_500, sc), redevSettlementDirection: "pay", redevSettlementAmount: S(92_781_500, sc), redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing",
    redevActualAcquisitionPrice: S(100_000_000, sc), bgActualAcquisitionTotal: S(250_000_000, sc), useEstimatedAcquisition: false };
  if (v === "receive") Object.assign(b, { redevSettlementDirection: "receive", redevSettlementAmount: S(30_000_000, sc), actualSalePrice: S(189_218_500, sc), redevSettlementSaleDate: "2022-10-01" });
  if (v === "successor") Object.assign(b, { redevIsSuccessorMember: "yes", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" });
  if (v === "land") Object.assign(b, { redevOriginalAssetType: "land" });
  return b;
};
/** 시가 모드 K-5(환산취득가액) 칸 — 인가일 개별주택공시가격 · 취득당시 개별주택가격 (토지 출자는 §166③ 토지 칸). */
const K5 = (sc: number) => ({ bgAcquisitionMethod: "converted", redevManagementDisposalHousingPrice: S(300_000_000, sc), redevAcquisitionHousingPrice: S(150_000_000, sc),
  redevLandArea: "100", redevLandStdPriceAtAcq: S(150_000_000, sc), redevLandStdPriceAtApproval: S(300_000_000, sc) });
const redev = (id: string, sc: number, v: Variant, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({
    assetId: id, ...BASE, bgMarketValueAtTransfer: S(1_000_000_000, sc), standardPriceAtTransfer: S(800_000_000, sc), standardPriceAtAcq: S(400_000_000, sc), ...redevFields(sc, v),
  }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" };
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const RENT = { bgLendingDepositTotal: "100000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const AB = { assetSplitMode: "fractional", contractTotalPrice: "525000000" };
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" };
const set = (v: Variant, frac: number) => ({ redevSettlementAmount: S(Number(redevFields(1, v).redevSettlementAmount), frac) });

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
type Res = Awaited<ReturnType<typeof post>>;
const gainOf = (r: Res) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const ok = (r: Res) => { expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200); return gainOf(r)!; };
/** 오라클: 같은 시나리오 단건(물건 크기 sc). 채무·보증금·임대료는 입력 그대로. */
const single = async (v: Variant, sc: number, ...over: Record<string, unknown>[]) => ok(await post(form([redev("z", sc, v, ...over)])));

describe("RD-1 청산금 납부 — 신규 통과 6칸 (⑧ 0건 ∧ ⑫ 200 ∧ 양도차익 = 오라클)", () => {
  it("축 A 단건 시가 · 담보: 447,609,250 + 명세 — 담보 승 · 채무비율 1 · 취득가액 2억 · 개산공제 600만 · 양도가액 7억", async () => {
    const f = form([redev("a", 1, "pay", HALF, debt("700000000"), set("pay", 0.5))]);
    expect(issues(f)).toEqual([]);
    const r = await post(f);
    const g = ok(r);
    expect(g).toBe(447_609_250);
    expect(g).toBe(await single("pay", 0.5, debt("700000000")));
    // 안분(인가 전·후) 이전의 손계산: C = max(보충 10억×50%=5억, 담보 7억) = 7억 → 채무비율 1 → 취득가액 = 취득시 기준시가 4억 × 50% × 1 = 2억 · 개산공제 3% = 600만
    const bd = r.j.data.result.transferBurdenedGiftBreakdown;
    expect(bd.giftValuation.selectedMode).toBe("mortgage");
    expect(bd.giftValuation.max).toBe(700_000_000);
    expect(bd.acquisitionStdForcedByCollateral).toBe(true);
    expect(bd.debtRatio).toBe(1);
    expect(bd.perAsset.building.transferPrice).toBe(700_000_000);
    expect(bd.perAsset.building.acquisitionPrice).toBe(200_000_000);
    expect(bd.perAsset.building.estimatedDeduction).toBe(6_000_000);
  });
  it("축 B 60/40 시가 · 담보(물건 전체 채무 14억): 두 카드 합 = 단건 100% = 895,218,500", async () => {
    const w = debt("1400000000");
    const f = form([redev("p", 1, "pay", pct("60"), w, set("pay", 0.6)), redev("s", 1, "pay", pct("40"), w, set("pay", 0.4))], AB);
    expect(issues(f)).toEqual([]);
    const g = ok(await post(f));
    expect(g).toBe(895_218_500);
    expect(g).toBe(await single("pay", 1, w));
  });
  it.each([
    ["시가 · 담보", [], 1_542_827_750],
    ["기준시가 · 담보", [STD], 1_542_827_750],
    ["기준시가 · 임대", [STD], 231_166_162],
  ] as const)("함께 양도 100%+50% %s: 단건 합", async (name, extra, gain) => {
    const isRent = name.includes("임대");
    const w100 = isRent ? { ...RENT, bgLendingDepositTotal: "200000000", bgAnnualRentTotal: "240000000" } : debt("1600000000");
    const w50 = isRent ? RENT : debt("700000000");
    const f = form([redev("a", 1, "pay", ...extra, w100, set("pay", 1)), redev("b", 1, "pay", HALF, ...extra, w50, set("pay", 0.5))], BD);
    expect(issues(f)).toEqual([]);
    const g = ok(await post(f));
    expect(g).toBe(gain);
    expect(g).toBe((await single("pay", 1, ...extra, w100)) + (await single("pay", 0.5, ...extra, w50)));
  });
  it.each([
    ["기준시가 · 담보", [STD, debt("700000000")], 447_609_250],
    ["기준시가 · 임대", [STD, RENT], 77_055_388],
    ["시가 · 보충(채무 3억)", [debt("300000000")], 197_165_550],
  ] as const)("축 A 단건 %s — 종전 그대로(안전망)", async (_n, over, gain) => {
    const f = form([redev("a", 1, "pay", HALF, ...over, set("pay", 0.5))]);
    expect(issues(f)).toEqual([]);
    const g = ok(await post(f));
    expect(g).toBe(gain);
    expect(g).toBe(await single("pay", 0.5, ...over));
  });
});

describe("RD-2 시나리오 변형 — 청산금 수령 · 토지 출자 · 승계조합원", () => {
  it.each([
    ["청산금 수령", "receive", 509_000_001],
    ["토지 출자", "land", 447_609_250],
    ["승계조합원", "successor", 500_000_000],
  ] as const)("%s 축 A 시가 · K-4 · 담보: 신규 통과 ∧ = 반 크기 단건", async (_n, v, gain) => {
    const w = debt("700000000");
    const f = form([redev("a", 1, v, HALF, w, v === "successor" ? {} : set(v, 0.5))]);
    expect(issues(f)).toEqual([]);
    const g = ok(await post(f));
    expect(g).toBe(gain);
    expect(g).toBe(await single(v, 0.5, w));
  });
  it("승계조합원은 K-5여도 열린다(§166 밖 — 취득시 기준시가 칸이 뜬다): 500,000,000", async () => {
    const f = form([redev("a", 1, "successor", HALF, K5(1), debt("700000000"))]);
    expect(issues(f)).toEqual([]);
    expect(ok(await post(f))).toBe(500_000_000);
    expect(needsBgAcqStdPriceInput(f.assets[0], false)).toBe(true);
  });
});

describe("RD-3 시가 · K-5 · 담보 승 · 지분(승계 제외) — ⑧이 계속 막는다 (막다른 길 방지)", () => {
  const w = debt("700000000");
  const cases: [string, Variant][] = [["청산금 납부", "pay"], ["청산금 수령", "receive"], ["토지 출자", "land"]];
  it.each(cases)("%s 축 A: ⑧ 차단 + 안내가 «실지취득가액»을 가리킨다", (_n, v) => {
    const f = form([redev("a", 1, v, HALF, K5(1), w, v === "receive" ? set(v, 0.5) : set(v, 0.5))]);
    const is = issues(f);
    expect(is.length).toBeGreaterThan(0);
    expect(is.some((i) => /실지취득가액/.test(i.message) && /재개발/.test(i.message))).toBe(true);
  });
  it.each(cases)("%s 축 B 60/40: ⑧ 차단", (_n, v) => {
    const wB = debt("1400000000");
    const f = form([redev("p", 1, v, pct("60"), K5(1), wB, set(v, 0.6)), redev("s", 1, v, pct("40"), K5(1), wB, set(v, 0.4))], AB);
    expect(issues(f).length).toBeGreaterThan(0);
  });
  it.each(cases)("%s 함께 양도의 50% 자산: ⑧ 차단", (_n, v) => {
    const f = form([redev("a", 1, v, K5(1), debt("1600000000"), set(v, 1)), redev("b", 1, v, HALF, K5(1), w, set(v, 0.5))], BD);
    expect(issues(f).length).toBeGreaterThan(0);
  });
  it("⑧ ⊇ ⑫: 막힌 조합은 취득시 기준시가를 비우면 ⑫ 400 — ⑧이 막지 않았다면 막다른 길이었다", async () => {
    const f = form([redev("a", 1, "pay", HALF, K5(1), w, set("pay", 0.5), { standardPriceAtAcq: "" })]);
    expect(issues(f).length).toBeGreaterThan(0);
    expect((await post(f)).status).toBe(400);
  });
  it.each([
    ["축 A 단건", () => form([redev("a", 1, "pay", HALF, K5(1), debt("300000000"), set("pay", 0.5))]), 237_932_775],
    ["축 B 60/40", () => form([redev("p", 1, "pay", pct("60"), K5(1), debt("600000000"), set("pay", 0.6)), redev("s", 1, "pay", pct("40"), K5(1), debt("600000000"), set("pay", 0.4))], AB), 475_865_550],
  ] as const)("K-5 보충 승 %s는 종전 그대로 통과", async (_n, mk, gain) => {
    const f = mk();
    expect(issues(f)).toEqual([]);
    expect(ok(await post(f))).toBe(gain);
  });
});

describe("RD-4 취득시 기준시가를 비우면 ⑧ 차단(칸 있음) ∧ ⑫ 400 (⑧ ⊇ ⑫)", () => {
  const BL = { standardPriceAtAcq: "" };
  const w = debt("700000000");
  it.each([
    ["축 A", () => form([redev("a", 1, "pay", HALF, w, set("pay", 0.5), BL)])],
    ["축 B", () => form([redev("p", 1, "pay", pct("60"), debt("1400000000"), set("pay", 0.6), BL), redev("s", 1, "pay", pct("40"), debt("1400000000"), set("pay", 0.4), BL)], AB)],
    ["함께 양도", () => form([redev("a", 1, "pay", debt("1600000000"), set("pay", 1), BL), redev("b", 1, "pay", HALF, w, set("pay", 0.5), BL)], BD)],
  ] as const)("시가 · K-4 · 담보 %s", async (_n, mk) => {
    const f = mk();
    expect(issues(f).some((i) => i.field === "standardPriceAtAcq")).toBe(true);
    expect((await post(f)).status).toBe(400);
  });
});

describe("RD-5 ⑤ 술어 — 게이트 · 강제 · 칸 · 산정방식", () => {
  const w = debt("700000000");
  it("게이트: K-4·기준시가·승계는 열림, 시가·K-5(승계 제외)는 닫힘, 이월과세·일반건물은 종전 그대로", () => {
    expect(bgFractionalCollateralKindSupported(redev("a", 1, "pay", HALF, w))).toBe(true);
    expect(bgFractionalCollateralKindSupported(redev("a", 1, "pay", HALF, STD, K5(1)))).toBe(true);
    expect(bgFractionalCollateralKindSupported(redev("a", 1, "successor", HALF, K5(1), w))).toBe(true);
    expect(bgFractionalCollateralKindSupported(redev("a", 1, "pay", HALF, K5(1), w))).toBe(false);
    expect(bgFractionalCollateralKindSupported(redev("a", 1, "pay", HALF, w, { acquisitionCause: "carryover_gift" }))).toBe(false);
  });
  it("축 A 시가 · K-4 · 담보: 강제 ∧ 취득시 기준시가 칸 ∧ 산정방식 burdened_gift", () => {
    const a = redev("a", 1, "pay", HALF, w);
    expect(bgCollateralForcesStdAcq(a, false)).toBe(true);
    expect(needsBgAcqStdPriceInput(a, false)).toBe(true);
    expect(redevPreApprovalAcqMode(a)).toBe("burdened_gift");
  });
  it("보충 승은 강제하지 않는다", () => {
    expect(bgCollateralForcesStdAcq(redev("a", 1, "pay", HALF, debt("300000000")), false)).toBe(false);
  });
});
