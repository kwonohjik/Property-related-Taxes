/**
 * anchor — **수령 청산금 상한**: 평가액(지분이면 그 지분 해당액) 이상이면 ⑧·⑫가 함께 막는다. 계획서 `docs/00-pm/redev-receive-settlement-limit.plan.md`.
 *
 * 시료: 양도가액 30억 · 평가액 9억 · 종전 부동산 실지 3억. 오라클(손계산 · §166①2호 가 + 나):
 *   · 수령 899,999,999: 가 30억 − 1 = 2,999,999,999 + 나 6억 × 1/9억 = 0 → 2,999,999,999
 *   · 축 B 60/40 수령 5억·2억: 첫째 가 18억 − (5.4억 − 5억) = 1,760,000,000 + 나 (5.4억 − 1.8억) × 0.4/5.4 = 26,666,666 · 둘째 가 12억 − (3.6억 − 2억) = 1,040,000,000 + 나 (3.6억 − 1.2억) × 1.6/3.6 = 106,666,666
 *
 * · RL-1 평가액 이상 차단 격자 — ⑧ 메시지·칸 ∧ ⑫ 400(입주권 실지·환산 · 토지 출자 · 완공 동시·단독 · 축 A·축 B·묶음 · 부담부증여)
 * · RL-2 1원 아래는 통과하고 값이 산식대로 — 경계가 ≥임을 고정
 * · RL-3 범위 밖 — 납부 방향 · 승계조합원 · 수령 0
 * · RL-4 ⑫ 직접 호출 — 평가액 0 · ⑧을 거치지 않는 값
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
import { REDEV_RECEIVE_SETTLEMENT_LIMIT_MESSAGE } from "@/lib/calc/redev-receive-settlement-limit";
import { redevReceiveSettlementReachesValue } from "@/lib/calc/redev-receive-settlement-limit";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const COMMON = { acquisitionCause: "purchase", acquisitionDate: "2010-03-01", redevApprovalDate: "2018-05-01", redevApprovalLawBasis: "urban_renovation_art_74", redevRightsValue: "900000000", redevSettlementDirection: "receive", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", capitalExpenditure: "0", transferExpense: "0", addressJibun: "서울 A 1", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "300000000" };
const RIGHT = { ...COMMON, assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false };
const ESTIMATED = { useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", redevHousingStdPriceAtAcq: "100000000", redevHousingStdPriceAtApproval: "300000000" };
const APT = { ...COMMON, assetKind: "redevelopment_apt", redevSubject: "apt", redevSettlementSaleDate: "2024-03-01", standardPriceAtTransfer: "1000000000", redevReceiveOnlyMode: "no" };
const SHARE = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const BG = { transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000", bgMortgageDebtAmount: "1500000000", bgMortgageSetAmount: "1500000000", acquisitionDate: "2009-07-01", redevApprovalDate: "2018-06-01", redevActualAcquisitionPrice: "" };
const s = (v: string) => ({ redevSettlementAmount: v });
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });

function form(assets: L[], over: L = {}) {
  const f = createDefaultTransferFormData() as L;
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "3000000000", bundledSaleMode: "actual", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true }, over);
  f.assets = assets.map((a, k) => ({ ...makeDefaultAsset(k + 1), assetId: `a${k}`, ...a }));
  return f as never;
}
const axisB = (a: L, b: L) => form([{ ...RIGHT, ...pct("60"), ...a }, { ...RIGHT, ...pct("40"), ...b }], { assetSplitMode: "fractional" });
const single = (a: L, over?: L) => form([a], over);
const BG_DATE = { transferDate: "2023-02-27", filingDate: "2023-05-31", contractTotalPrice: "" };

function issues(f: never) {
  const out: { message: string; field?: string }[] = [];
  for (let i = 0; i <= 5; i++) for (const m of collectStepIssues(i, f)) out.push(m as { message: string; field?: string });
  return out;
}
async function post(body: unknown) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as L };
}
const calc = async (f: never) => post(await captureBody(f));
const gain = (r: { j: L }) => r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain;

const MESSAGE_TAIL = REDEV_RECEIVE_SETTLEMENT_LIMIT_MESSAGE.slice(0, 30);

describe("RL-1 평가액 이상 — ⑧ 차단 ∧ ⑫ 400", () => {
  it.each<[string, () => never]>([
    ["입주권 실지 · 같음", () => single({ ...RIGHT, ...s("900000000") })],
    ["입주권 실지 · 1원 초과", () => single({ ...RIGHT, ...s("900000001") })],
    ["입주권 실지 · 초과", () => single({ ...RIGHT, ...s("2000000000") })],
    ["입주권 환산 · 초과", () => single({ ...RIGHT, ...ESTIMATED, ...s("1000000000") })],
    ["입주권 토지 출자 · 초과", () => single({ ...RIGHT, redevOriginalAssetType: "land", ...s("1000000000") })],
    ["완공 동시 신고 · 초과", () => single({ ...APT, ...s("1000000000") })],
    ["완공 단독 신고 · 초과", () => single({ ...APT, redevReceiveOnlyMode: "yes", ...s("1000000000") }, { transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "1000000000" })],
    ["축 A 50% · 지분 평가액과 같음", () => single({ ...RIGHT, ...SHARE, ...s("450000000") }, { contractTotalPrice: "1500000000" })],
    ["축 A 50% · 지분 평가액 초과 · 전체 평가액 미만", () => single({ ...RIGHT, ...SHARE, ...s("500000000") }, { contractTotalPrice: "1500000000" })],
    ["축 A 부담부증여 · 초과(종전 1,500,000,000)", () => single({ ...RIGHT, ...BG, ...SHARE, ...s("500000000") }, BG_DATE)],
    ["축 B 60/40 · 첫째만 지분 평가액 초과", () => axisB(s("600000000"), s("100000000"))],
    ["축 B 60/40 · 둘째만 지분 평가액 초과", () => axisB(s("100000000"), s("400000000"))],
    ["묶음 둘째 자산 · 초과", () => form([{ ...RIGHT, actualSalePrice: "3000000000", ...s("100000000") }, { ...RIGHT, addressJibun: "서울 B 2", actualSalePrice: "3000000000", ...s("1000000000") }], { assetSplitMode: "companion", contractTotalPrice: "6000000000" })],
  ])("%s", async (_n, make) => {
    const f = make();
    const hit = issues(f).find((m) => m.message.includes(MESSAGE_TAIL));
    expect(hit?.message).toContain(REDEV_RECEIVE_SETTLEMENT_LIMIT_MESSAGE);
    expect(hit?.field).toBe("redevSettlementAmount");
    const r = await calc(f);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain(MESSAGE_TAIL);
  });
});

describe("RL-2 1원 아래 — 통과 ∧ 산식값", () => {
  it.each<[string, () => never, number]>([
    ["입주권 실지 899,999,999", () => single({ ...RIGHT, ...s("899999999") }), 2_999_999_999],
    ["입주권 실지 8억(회귀 대조)", () => single({ ...RIGHT, ...s("800000000") }), 2_966_666_666],
    ["축 B 60/40 수령 5억·2억", () => axisB(s("500000000"), s("200000000")), 2_933_333_332],
  ])("%s", async (_n, make, want) => {
    const f = make();
    expect(issues(f).filter((m) => m.message.includes(MESSAGE_TAIL))).toEqual([]);
    const r = await calc(f);
    expect(r.status).toBe(200);
    expect(gain(r)).toBe(want);
  });

  it("축 A 50% 449,999,999 — 지분 평가액 1원 아래는 통과", async () => {
    const f = single({ ...RIGHT, ...SHARE, ...s("449999999") }, { contractTotalPrice: "1500000000" });
    expect(issues(f).filter((m) => m.message.includes(MESSAGE_TAIL))).toEqual([]);
    expect((await calc(f)).status).toBe(200);
  });
});

describe("RL-3 범위 밖", () => {
  it("승계 표지만 있는 입주권의 옛 수령 값 — ⑧이 통과시키면 ⑫도 통과시킨다", async () => {
    const f = single({ ...RIGHT, isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "", acquisitionDate: "2020-01-01", successorRightAcqPrice: "300000000", ...s("1000000000") });
    const blocked = issues(f).some((m) => m.message.includes(MESSAGE_TAIL));
    const r = await calc(f);
    expect(JSON.stringify(r.j).includes(MESSAGE_TAIL), JSON.stringify(r.j).slice(0, 300)).toBe(blocked);
  });

  it("납부 방향은 평가액을 넘어도 막지 않는다(§166①1호 — 분양 가격이 더 높은 사실)", async () => {
    const f = single({ ...RIGHT, redevSettlementDirection: "pay", ...s("1000000000") });
    expect(issues(f).filter((m) => m.message.includes(MESSAGE_TAIL))).toEqual([]);
    const r = await calc(f);
    expect(r.status).toBe(200);
    expect(gain(r)).toBe(1_700_000_000);
  });

  it("술어 진리표", () => {
    const v = { settlementDirection: "receive" as const, settlementAmount: 10, rightsValue: 10 };
    expect(redevReceiveSettlementReachesValue(v)).toBe(true);
    expect(redevReceiveSettlementReachesValue({ ...v, settlementAmount: 9 })).toBe(false);
    expect(redevReceiveSettlementReachesValue({ ...v, settlementAmount: 0, rightsValue: 0 })).toBe(false);
    expect(redevReceiveSettlementReachesValue({ ...v, settlementDirection: "pay" })).toBe(false);
    expect(redevReceiveSettlementReachesValue({ ...v, isSuccessorMember: true })).toBe(false);
    expect(redevReceiveSettlementReachesValue({ ...v, isSuccessorMember: false })).toBe(true);
    expect(redevReceiveSettlementReachesValue({ ...v, rightsValue: 0 })).toBe(true);
  });
});

describe("RL-4 ⑫ 직접 호출", () => {
  it.each<[string, L]>([
    ["평가액 0 · 입주권 (종전 −300,000,000)", { ...RIGHT, redevRightsValue: "0", ...s("100000000") }],
    ["평가액 0 · 완공 (종전 3,000,000,000)", { ...APT, redevRightsValue: "0", ...s("100000000") }],
  ])("%s → 400", async (_n, a) => {
    const r = await calc(single(a));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain(MESSAGE_TAIL);
  });
});
