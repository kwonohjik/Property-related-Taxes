/**
 * anchor — ⑫ `refineRedevelopment166_3Inputs`의 부담부증여 §166③ 필수 판정이 **지분 축소 후 승자**를 본다 (K-5 전면 개방 PR-1 · Q-2 a).
 * 계획서 `docs/00-pm/bg-redev-fractional-k5-full-open.plan.md` §1.2 · §3-3.
 *
 * 재개발 완공 아파트 · 원조합원 · 부담부증여 · 시가 모드 · 환산취득가액(K-5) · 지분 · 담보(상증법 §66) 승 — 엔진은 시가를 지분분으로 줄여(`scaleBurdenedGiftInfo`)
 * 담보 승을 판정하고 취득가액을 취득시 기준시가 × 채무비율로 강제하므로 §166③ 칸을 쓰지 않는다. 종전 ⑫는 줄이지 않은 시가로 판정해 지분 담보 승을 보충 승으로 읽고
 * §166③ 칸(분모·분자)을 요구해 400을 냈다(엔진이 쓰지 않는 칸).
 *
 * PR-1 시점에는 화면 경로를 ⑧ 게이트가 막았고 ④가 주 자산에 `useEstimatedAcquisition: true`를 보냈으므로(축 없는 `redevPreApprovalAcqMode` — PR-2에서 축을 실어 열었다)
 * 여기서는 ④ 본문을 직접 API 본문으로 쓴다 — 주 자산은 `useEstimatedAcquisition: false`(부담부증여는 엔진이 §159 산정방식으로 다시 판정한다). 함께 양도의 지분 자산은
 * 컴패니언이라 ④ 본문 그대로다. 화면 개방은 PR-2.
 *
 * 오라클 = 같은 시나리오 단건(축 A = 반 크기 단건 · 축 B = 100% 단건 · 함께 양도 = 단건 합) — 화면 경로로 계산.
 *
 * · K5S-1 축 A·B × 납부·수령·토지 출자: §166③ 칸을 비워도 200 ∧ 양도차익 = 오라클 (수정 전 400)
 * · K5S-2 함께 양도의 50% 자산(컴패니언): ④ 본문 그대로 200 ∧ = 단건 합 (수정 전 400)
 * · K5S-3 안전망 — 지분 보충 승은 §166③ 칸이 필요해 400 그대로 · 단독 100% 담보 승은 종전부터 200
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
/** 세대 주택 수 1 + «다른 주택 없음» 확인 — 재개발은 주택 계열이라 명부 확인이 필요하다(어긋나면 ⑧이 재개발과 무관한 사유를 얹는다). */
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const S = (n: number, sc: number) => String(Math.round(n * sc));
const BASE = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual" };
type Variant = "pay" | "receive" | "land";
/** 원조합원 · 주택 출자 · 청산금 납부가 기본. 크기 sc — 청산금은 «지분 해당분»을 호출자가 정한다(화면 규약). */
const redevFields = (sc: number, v: Variant): Record<string, unknown> => {
  const b: Record<string, unknown> = { assetKind: "redevelopment_apt", actualSalePrice: S(525_000_000, sc), redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevRightsValue: S(219_218_500, sc), redevSettlementDirection: "pay", redevSettlementAmount: S(92_781_500, sc), redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing",
    redevActualAcquisitionPrice: S(100_000_000, sc), bgActualAcquisitionTotal: S(250_000_000, sc), useEstimatedAcquisition: false };
  if (v === "receive") Object.assign(b, { redevSettlementDirection: "receive", redevSettlementAmount: S(30_000_000, sc), actualSalePrice: S(189_218_500, sc), redevSettlementSaleDate: "2022-10-01" });
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
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const AB = { assetSplitMode: "fractional", contractTotalPrice: "525000000" };
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" };
const set = (v: Variant, frac: number) => ({ redevSettlementAmount: S(Number(redevFields(1, v).redevSettlementAmount), frac) });

async function postBody(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
/** ④ 본문을 직접 API 본문으로 — 주 자산 `useEstimatedAcquisition`만 false(부담부증여는 §159 산정방식이 정한다). */
async function postDirect(f: TransferFormData, primaryEstimated?: false) {
  const body = (await captureBody(f)) as Record<string, unknown>;
  if (primaryEstimated === false) body.useEstimatedAcquisition = false;
  return postBody(body);
}
type Res = Awaited<ReturnType<typeof postBody>>;
const gainOf = (r: Res) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const ok = (r: Res) => { expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200); return gainOf(r)!; };
const single = async (v: Variant, sc: number, ...over: Record<string, unknown>[]) => ok(await postDirect(form([redev("z", sc, v, K5(sc), ...over)])));
/** §166③ 칸 4개를 비운다(주택 출자 D·P_A · 토지 출자 분자·분모). */
const BLANK_166_3 = { redevManagementDisposalHousingPrice: "", redevAcquisitionHousingPrice: "", redevLandStdPriceAtAcq: "", redevLandStdPriceAtApproval: "" };
const w = debt("700000000");
const wB = debt("1400000000");
const cases: [string, Variant, number, number][] = [
  ["청산금 납부", "pay", 447_609_250, 895_218_500],
  ["청산금 수령", "receive", 509_000_001, 1_018_000_000],
  ["토지 출자", "land", 447_609_250, 895_218_500],
];

describe("K5S-1 축 A·B — 지분 담보 승은 §166③ 칸을 요구하지 않는다", () => {
  it.each(cases)("%s 축 A 50%%: 200 ∧ = 반 크기 단건", async (_n, v, gainA) => {
    const r = await postDirect(form([redev("a", 1, v, HALF, K5(1), w, set(v, 0.5), BLANK_166_3)]), false);
    const g = ok(r);
    expect(g).toBe(gainA);
    expect(g).toBe(await single(v, 0.5, w));
    expect(r.j.data.result.transferBurdenedGiftBreakdown.acquisitionStdForcedByCollateral).toBe(true);
  });
  it.each(cases)("%s 축 B 60/40: 200 ∧ = 100% 단건", async (_n, v, _a, gainB) => {
    const f = form([redev("p", 1, v, pct("60"), K5(1), wB, set(v, 0.6), BLANK_166_3), redev("s", 1, v, pct("40"), K5(1), wB, set(v, 0.4), BLANK_166_3)], AB);
    const g = ok(await postDirect(f, false));
    expect(g).toBe(gainB);
    expect(g).toBe(await single(v, 1, wB));
  });
});

describe("K5S-2 함께 양도의 50% 자산(컴패니언) — ④ 본문 그대로 200", () => {
  it.each(cases)("%s: = 단건 100% + 반 크기 단건", async (_n, v) => {
    const w100 = debt("1600000000");
    const f = form([redev("a", 1, v, K5(1), w100, set(v, 1)), redev("b", 1, v, HALF, K5(1), w, set(v, 0.5), BLANK_166_3)], BD);
    const g = ok(await postDirect(f));
    expect(g).toBe((await single(v, 1, w100)) + (await single(v, 0.5, w)));
  });
});

describe("K5S-3 안전망", () => {
  it.each(cases)("%s 지분 보충 승(채무 3억)은 §166③ 칸이 필요하다 — 400", async (_n, v) => {
    const r = await postDirect(form([redev("a", 1, v, HALF, K5(1), debt("300000000"), set(v, 0.5), BLANK_166_3)]), false);
    expect(r.status).toBe(400);
    const field = v === "land" ? "redevelopment.landStdPriceAtAcq" : "redevelopment.managementDisposalHousingPrice";
    expect(Object.keys(r.j.error?.fieldErrors ?? {})).toContain(field);
  });
  it.each(cases)("%s 단독 100% 담보 승은 종전부터 200 (§166③ 칸 비움)", async (_n, v, gainA) => {
    expect(ok(await postDirect(form([redev("z", 0.5, v, K5(0.5), w, BLANK_166_3)]), false))).toBe(gainA);
  });
});
