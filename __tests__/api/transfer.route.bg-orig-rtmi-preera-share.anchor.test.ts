/**
 * anchor — **원조합원 입주권 부담부증여 × 지분(축 A·축 B·묶음) × 담보·임대 승 × 괄호 열거 이전**. 계획서 `docs/00-pm/bg-orig-rtmi-preera-share-open.plan.md`.
 *
 * 종전: 「청산금이 지분만큼 줄지 않아 입력 규약이 불명」으로 시가 모드 축 A·축 B와 묶음을 ⑧이 막았다(⑫는 200 · 기준시가 모드 축 A·축 B와 보충 승은 이미 통과).
 * 규약은 이미 정해져 있었다 — 청산금은 스케일하지 않고 **본인 지분 해당분을 입력**한다(`buildRedevelopmentPayload` · 소령 §166①1호 「납부한 청산금」 · 도시정비법 §39①1호).
 *
 * 시료: 양도가액 전체 30억 · 평가액 전체 9억 · 종전 부동산 실지 전체 3억 · 필요경비 0. 축 A는 본인분 채무 15억, 축 B는 물건 전체 채무 30억(채무비율 1).
 * 오라클(손계산 — §166 산식이 평가액을 약분해 양도가액 − 청산금 − 취득가액이 된다):
 *   · 단독 납부 2억: 30억 − 2억 − 3억 = 2,500,000,000 · 축 A 50% 지분분 1억: 15억 − 1억 − 1.5억 = 1,250,000,000(= 단독의 절반) · 지분분 2억: 1,150,000,000
 *   · 임대 승(2020-02-10 · 채무비율 15억/20억 = 0.75): 15억 − 1억×0.75 − 1.5억×0.75 = 1,312,500,000
 *   · 수령 단독 2억: 가 30억 − (9억 − 2억) = 23억 + 나 (9억 − 3억) × 7/9 = 466,666,666 → 2,766,666,666 · 축 A 50% 지분분 1억: 11.5억 + 233,333,333 = 1,383,333,333
 *   · 축 B 60/40 지분분 1.2억·0.8억: 15억 + 10억 = 2,500,000,000(= 단독) · 수령 1,660,000,000 + 1,106,666,666 = 2,766,666,666
 *   · 축 B 혼합 승계(60%·실지 4억)+원조합원(40%): 18억 − 2.4억 + 12억 − 0.8억 − 1.2억 = 2,560,000,000 · 원조합원(60%)+승계(40%): 18억 − 1.2억 − 1.8억 + 12억 − 1.6억 = 2,540,000,000
 *   · 묶음 주택 2,485,000,000(기준시가 강제 + 개산공제 3%) + 원조합원 50% 1,250,000,000 = 3,735,000,000
 *
 * · OR-1 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 오라클.
 * · OR-2 열거 이후는 계속 막는다(H-2 대기) — 경계일 포함.
 * · OR-3 입력 요구 ⑧ ⊇ ⑫ — 실지취득가액을 비우면 ⑧ 차단 ∧ ⑫ 400.
 * · OR-4 술어 진리표.
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
import { bgRtmiShareWinnerComputable } from "@/lib/calc/bg-rtmi-std-acq";
import { bgRtmiAxisBWinnerComputable } from "@/lib/calc/bg-rtmi-std-acq";
import { bgRtmiBundleWinnerComputable } from "@/lib/calc/bg-rtmi-std-acq";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const base = (...over: Partial<AssetForm>[]): AssetForm =>
  Object.assign({ ...makeDefaultAsset(2) }, x({
    assetId: "o", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevOriginalAssetType: "housing", redevRightsValue: "900,000,000",
    redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "0", useEstimatedAcquisition: false, standardPriceAtAcq: "", standardPriceAtTransfer: "",
    bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual",
  }), ...over) as AssetForm;
const ORIG = x({ isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", acquisitionCause: "purchase", bgActualAcquisitionTotal: "300,000,000" });
const SUCC = x({ isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", acquisitionDate: "2020-01-01", acquisitionCause: "purchase", successorRightAcqPrice: "300,000,000", successorRightAddedContribution: "100,000,000", bgActualAcquisitionTotal: "300,000,000" });
const M30 = x({ bgMortgageDebtAmount: "3,000,000,000", bgMortgageSetAmount: "3,000,000,000" });
const M15 = x({ bgMortgageDebtAmount: "1,500,000,000", bgMortgageSetAmount: "1,500,000,000" });
const RENT15 = x({ bgLendingDepositTotal: "1,500,000,000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "60000000" });
const STD = x({ bgValuationMode: "sangjeungbeop_standard" });
const MKT = x({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000" });
const SHARE = x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
const NOACQ = x({ bgActualAcquisitionTotal: "" });
const s = (v: string, dir: "pay" | "receive" = "pay") => x({ redevSettlementAmount: v, redevSettlementDirection: dir });
const pct = (id: string, n: string) => x({ assetId: id, ownershipNumerator: n, ownershipDenominator: "100" });

const house = () => Object.assign({ ...makeDefaultAsset(1) }, x({
  assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3,000,000,000", bgMortgageSetAmount: "3,000,000,000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
})) as AssetForm;

const form = (assets: AssetForm[], transferDate: string, over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate, assets, contractTotalPrice: "" }, over) as TransferFormData;
const axisB = (assets: AssetForm[], date: string) => form(assets, date, { assetSplitMode: "fractional", contractTotalPrice: "3000000000" });
const bundle = (assets: AssetForm[], date: string) => form(assets, date, { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "9000000000" });
const full = (f: TransferFormData) => { const out: string[] = []; for (let i = 0; i <= 5; i++) for (const m of collectStepIssues(i, f)) out.push(m.message); return out; };
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const gain = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;

const PRE = "2023-02-27";
const POST_DATE = "2026-02-16";
const orig2 = (id: string, n: string, settle: string, dir: "pay" | "receive" = "pay") => base(ORIG, pct(id, n), s(settle, dir));

describe("OR-1 열거 이전 원조합원 지분 — ⑧ 통과 ∧ ⑫ 200 ∧ 오라클", () => {
  it.each([
    ["단독 100% 대조", () => form([base(ORIG, MKT, M30)], PRE), 2_500_000_000],
    ["축 A · 시가 · 납부 지분분 1억", () => form([base(ORIG, MKT, M15, SHARE, s("100,000,000"))], PRE), 1_250_000_000],
    ["축 A · 기준시가 · 납부 지분분 1억", () => form([base(ORIG, STD, M15, SHARE, s("100,000,000"))], PRE), 1_250_000_000],
    ["축 A · 시가 · 납부 지분분 2억(입력값 그대로 — 지분율을 곱하지 않는다)", () => form([base(ORIG, MKT, M15, SHARE, s("200,000,000"))], PRE), 1_150_000_000],
    ["축 A · 시가 · 수령 지분분 1억", () => form([base(ORIG, MKT, M15, SHARE, s("100,000,000", "receive"))], PRE), 1_383_333_333],
    ["축 A · 기준시가 · 임대 · 2020-02-10", () => form([base(ORIG, STD, RENT15, SHARE, s("100,000,000"))], "2020-02-10"), 1_312_500_000],
    ["축 B 60/40 · 시가 · 납부", () => axisB([base(ORIG, pct("p", "60"), MKT, M30, s("120,000,000")), orig2("s2", "40", "80,000,000")], PRE), 2_500_000_000],
    ["축 B 60/40 · 시가 · 수령", () => axisB([base(ORIG, pct("p", "60"), MKT, M30, s("120,000,000", "receive")), orig2("s2", "40", "80,000,000", "receive")], PRE), 2_766_666_666],
    ["축 B 60/40 · 기준시가 · 납부", () => axisB([base(ORIG, pct("p", "60"), STD, M30, s("120,000,000")), orig2("s2", "40", "80,000,000")], PRE), 2_500_000_000],
    ["축 B 혼합 · 승계(첫) + 원조합원", () => axisB([base(SUCC, pct("p", "60"), MKT, M30), orig2("s2", "40", "80,000,000")], PRE), 2_560_000_000],
    ["축 B 혼합 · 원조합원(첫) + 승계", () => axisB([base(ORIG, pct("p", "60"), MKT, M30, s("120,000,000")), base(SUCC, pct("s2", "40"))], PRE), 2_540_000_000],
    ["묶음 · 주택 + 원조합원 50%", () => bundle([house(), base(ORIG, MKT, M15, SHARE, s("100,000,000"))], PRE), 3_735_000_000],
  ] as const)("%s", async (_n, mk, oracle) => {
    const f = mk();
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j)).toBe(200);
    expect(gain(r)).toBe(oracle);
  });

  it("축 A 값은 단독의 지분 비례 · 축 B 카드별 값은 지분 비례(납부 1,500,000,000 / 1,000,000,000)", async () => {
    const whole = gain(await post(form([base(ORIG, MKT, M30)], PRE)))!;
    const half = gain(await post(form([base(ORIG, MKT, M15, SHARE, s("100,000,000"))], PRE)))!;
    expect(half * 2).toBe(whole);
    const r = await post(axisB([base(ORIG, pct("p", "60"), MKT, M30, s("120,000,000")), orig2("s2", "40", "80,000,000")], PRE));
    expect((r.j.data.aggregated.properties as { transferGain: number }[]).map((p) => p.transferGain)).toEqual([1_500_000_000, 1_000_000_000]);
  });
});

describe("OR-2 열거 이후는 계속 막는다 (질의 H-2 대기) — ⑧ 원조합원 사유 ∧ ⑫ 400", () => {
  it.each([
    ["축 A · 담보 · 경계일 2023-02-28", () => form([base(ORIG, MKT, M15, SHARE)], "2023-02-28")],
    ["축 A · 담보", () => form([base(ORIG, MKT, M15, SHARE)], POST_DATE)],
    ["축 A · 임대 · 경계일 2020-02-11", () => form([base(ORIG, STD, RENT15, SHARE)], "2020-02-11")],
    ["축 B · 담보 · 경계일 2023-02-28", () => axisB([base(ORIG, pct("p", "60"), MKT, M30), orig2("s2", "40", "80,000,000")], "2023-02-28")],
    ["축 B 혼합 · 승계(첫) + 원조합원", () => axisB([base(SUCC, pct("p", "60"), MKT, M30, x({ successorRightStdPaidAtAcq: "200,000,000", successorRightStdPremiumAtAcq: "100,000,000" })), orig2("s2", "40", "80,000,000")], POST_DATE)],
    ["묶음 · 경계일 2023-02-28", () => bundle([house(), base(ORIG, MKT, M15, SHARE)], "2023-02-28")],
  ] as const)("%s", async (_n, mk) => {
    const f = mk();
    const m = full(f);
    expect(m.length).toBeGreaterThan(0);
    expect(m.join("\n")).toContain("원조합원 입주권의 기준시가");
    expect((await post(f)).status).toBe(400);
  });
});

describe("OR-3 실지취득가액을 비우면 ⑧ 차단 ∧ ⑫ 400 — ⑧ ⊇ ⑫", () => {
  it.each([
    ["축 A", () => form([base(ORIG, MKT, M15, SHARE, s("100,000,000"), NOACQ)], PRE)],
    ["축 B · 첫 카드 칸 비움", () => axisB([base(ORIG, pct("p", "60"), MKT, M30, s("120,000,000"), NOACQ), orig2("s2", "40", "80,000,000")], PRE)],
    ["축 B 혼합 · 첫 승계 카드의 원조합원 칸 비움", () => axisB([base(SUCC, pct("p", "60"), MKT, M30, NOACQ), orig2("s2", "40", "80,000,000")], PRE)],
    ["묶음", () => bundle([house(), base(ORIG, MKT, M15, SHARE, s("100,000,000"), NOACQ)], PRE)],
  ] as const)("%s", async (_n, mk) => {
    const f = mk();
    expect(full(f).length).toBeGreaterThan(0);
    expect((await post(f)).status).toBe(400);
  });
});

describe("OR-4 술어 진리표", () => {
  const land = () => Object.assign(base(ORIG, MKT, M15, SHARE), { assetKind: "land" }) as AssetForm;
  it("bgRtmiShareWinnerComputable(축 A) — 원조합원은 열거 이전만", () => {
    const a = base(ORIG, MKT, M15, SHARE);
    expect(bgRtmiShareWinnerComputable(a, PRE)).toBe(true);
    expect(bgRtmiShareWinnerComputable(a, "2023-02-28")).toBe(false);
    expect(bgRtmiShareWinnerComputable(a, undefined)).toBe(false);
    expect(bgRtmiShareWinnerComputable(base(ORIG, MKT, M30), PRE)).toBe(false);
    expect(bgRtmiShareWinnerComputable(land(), PRE)).toBe(false);
  });
  it("bgRtmiAxisBWinnerComputable — 원조합원은 열거 이전만 · 승계는 시기 무관", () => {
    const o = base(ORIG, pct("p", "60"), MKT, M30);
    expect(bgRtmiAxisBWinnerComputable(o, PRE)).toBe(true);
    expect(bgRtmiAxisBWinnerComputable(o, "2023-02-28")).toBe(false);
    expect(bgRtmiAxisBWinnerComputable(o, undefined)).toBe(false);
    expect(bgRtmiAxisBWinnerComputable(base(SUCC, pct("p", "60"), MKT, M30), POST_DATE)).toBe(true);
    expect(bgRtmiAxisBWinnerComputable(house(), PRE)).toBe(false);
  });
  it("bgRtmiBundleWinnerComputable — 지분 원조합원은 승자 시기로 갈린다(임대 2020.2.11. · 담보 2023.2.28.)", () => {
    const o = base(ORIG, MKT, M15, SHARE);
    expect(bgRtmiBundleWinnerComputable(o, "mortgage", PRE)).toBe(true);
    expect(bgRtmiBundleWinnerComputable(o, "mortgage", "2023-02-28")).toBe(false);
    expect(bgRtmiBundleWinnerComputable(o, "rental", "2020-02-10")).toBe(true);
    expect(bgRtmiBundleWinnerComputable(o, "rental", "2020-02-11")).toBe(false);
    expect(bgRtmiBundleWinnerComputable(o, "mortgage", undefined)).toBe(false);
  });
});
