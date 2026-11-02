/**
 * anchor — **권리가액(평가액) 필수**: 토지 출자도 주택 출자처럼 ⑧이 막고, ⑫는 승계조합원이 아닌 재개발 자산의 평가액 0을 거절한다.
 * 계획서 `docs/00-pm/redev-receive-settlement-limit.plan.md` §6.
 *
 * 시료: 양도가액 30억 · 평가액 9억 · 종전 부동산 실지 3억. 오라클(손계산 · 소령 §166①1호, 납부 0):
 *   인가 전 9억 − 3억 = 600,000,000 + 인가 후 30억 − 9억 = 2,100,000,000 → 2,700,000,000
 * 수정 전 실측: 토지 출자 완공 실지 납부 0에서 권리가액을 비우면 −300,000,000 · 세액 0으로 통과했다.
 *
 * · RV-1 토지 출자 권리가액 비움 — ⑧ 칸·메시지 ∧ ⑫ 400(입주권·완공 × 실지·환산 × 납부·수령)
 * · RV-2 대조 — 권리가액을 넣으면 통과하고 값이 산식대로
 * · RV-3 ⑫ 직접 — ⑧을 거치지 않는 평가액 0(주택·토지)
 * · RV-4 범위 밖 — 승계 입주권은 §166 payload가 없고, 승계조합원은 술어가 보지 않는다
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
import { REDEV_RIGHTS_VALUE_REQUIRED_MESSAGE } from "@/lib/calc/redev-rights-value-required";
import { redevRightsValueMissing } from "@/lib/calc/redev-rights-value-required";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const COMMON = { acquisitionCause: "purchase", acquisitionDate: "2010-03-01", redevApprovalDate: "2018-05-01", redevApprovalLawBasis: "urban_renovation_art_74", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevOriginalAssetType: "land", capitalExpenditure: "0", transferExpense: "0", addressJibun: "서울 A 1", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "300000000" };
const RIGHT = { ...COMMON, assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false };
const APT = { ...COMMON, assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2023-06-01", standardPriceAtTransfer: "1000000000", redevReceiveOnlyMode: "no" };
const LAND_ESTIMATED = { useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", redevLandArea: "100", redevLandPricePerSqmAtAcq: "1000000", redevLandPricePerSqmAtApproval: "3000000" };
const RECEIVE = { redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevSettlementSaleDate: "2024-03-01" };
const BLANK = { redevRightsValue: "" };

function single(a: L) {
  const f = createDefaultTransferFormData() as L;
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "3000000000", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true });
  f.assets = [{ ...makeDefaultAsset(1), assetId: "a0", ...a }];
  return f as never;
}
function issues(f: never) {
  const out: { message: string; field?: string }[] = [];
  for (let i = 0; i <= 5; i++) for (const m of collectStepIssues(i, f)) out.push(m as { message: string; field?: string });
  return out;
}
async function calc(f: never) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as L };
}
const gain = (r: { j: L }) => r.j.data?.result?.transferGain;
const HEAD = REDEV_RIGHTS_VALUE_REQUIRED_MESSAGE.slice(0, 20);

describe("RV-1 토지 출자 권리가액 비움 — ⑧ 차단 ∧ ⑫ 400", () => {
  it.each<[string, L]>([
    ["입주권 실지 납부", { ...RIGHT, ...BLANK, redevSettlementAmount: "200000000" }],
    ["입주권 환산 납부 0", { ...RIGHT, ...LAND_ESTIMATED, ...BLANK }],
    ["완공 실지 납부 0(수정 전 −300,000,000 · 세액 0)", { ...APT, ...BLANK }],
    ["완공 환산 납부 0", { ...APT, ...LAND_ESTIMATED, ...BLANK }],
    ["완공 실지 수령 0", { ...APT, ...RECEIVE, redevSettlementAmount: "0", ...BLANK }],
    ["입주권 실지 수령 1억 — 수령 상한보다 먼저", { ...RIGHT, ...RECEIVE, ...BLANK }],
    ["권리가액 0 입력", { ...APT, redevRightsValue: "0" }],
  ])("%s", async (_n, a) => {
    const f = single(a);
    const hit = issues(f).find((m) => m.message.includes(HEAD));
    expect(hit?.message).toContain(REDEV_RIGHTS_VALUE_REQUIRED_MESSAGE);
    expect(hit?.field).toBe("redevRightsValue");
    const r = await calc(f);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain(HEAD);
  });
});

describe("RV-2 대조 — 권리가액 입력 시 통과 ∧ 산식값", () => {
  it.each<[string, L]>([
    ["입주권 실지 납부 0", RIGHT],
    ["완공 실지 납부 0", APT],
  ])("%s → 2,700,000,000", async (_n, a) => {
    const f = single(a);
    expect(issues(f).filter((m) => m.message.includes(HEAD))).toEqual([]);
    const r = await calc(f);
    expect(r.status).toBe(200);
    expect(gain(r)).toBe(2_700_000_000);
  });
});

describe("RV-3 ⑫ 직접 호출 — 평가액 0", () => {
  it.each<[string, L]>([
    ["주택 출자 입주권", { ...RIGHT, redevOriginalAssetType: "housing", ...BLANK }],
    ["주택 출자 완공", { ...APT, redevOriginalAssetType: "housing", ...BLANK }],
    ["토지 출자 완공", { ...APT, ...BLANK }],
  ])("%s → 400", async (_n, a) => {
    const r = await calc(single(a));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain(HEAD);
  });
});

describe("RV-4 범위 밖", () => {
  it("승계 입주권은 §166 payload가 없어 ⑧·⑫ 모두 권리가액을 묻지 않는다", async () => {
    const f = single({ ...RIGHT, ...BLANK, isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "", acquisitionDate: "2020-01-01", successorRightAcqPrice: "300000000" });
    expect(issues(f).filter((m) => m.message.includes(HEAD))).toEqual([]);
    const r = await calc(f);
    expect(JSON.stringify(r.j)).not.toContain(HEAD);
  });

  it("술어 진리표", () => {
    expect(redevRightsValueMissing({ rightsValue: 0 })).toBe(true);
    expect(redevRightsValueMissing({ rightsValue: 0, isSuccessorMember: false })).toBe(true);
    expect(redevRightsValueMissing({ rightsValue: 1 })).toBe(false);
    expect(redevRightsValueMissing({ rightsValue: 0, isSuccessorMember: true })).toBe(false);
  });
});
