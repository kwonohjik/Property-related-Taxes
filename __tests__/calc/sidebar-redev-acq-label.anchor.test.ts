/**
 * anchor — 사이드바 재개발 취득가액 라벨: 「인가전 분 취득가액」은 계산 전 ⑤ 입력값일 때만 쓴다.
 * 계산 후 값은 신고서·계산명세서 「취득가액」 합계(양도가액 − 필요경비 − 양도차익 역산)라 라벨도 「취득가액」이다.
 * 청산금 수령 단독 신고는 인가 전 분을 신고하지 않으므로 계산 전에도 「취득가액」이고 값은 「계산 후 표시」다.
 *
 * 시료: 양도 30억 · 종전 부동산 실지 3억 · 권리가액 9억(mock 세율). 수정 전 실측:
 *   · 납부 2억 — 계산 후 「인가전 분 취득가액」 500,000,000(인가 전 분 300,000,000 + 납부 청산금 200,000,000)
 *   · 수령 1억 단독 — 계산 전 「인가전 분 취득가액」 300,000,000(양도가액 100,000,000 옆) · 계산 후 33,333,333
 *
 * · SL-1 계산 전 — 원조합원은 「인가전 분 취득가액」 + ⑤ 값(기존 계약 유지)
 * · SL-2 계산 후 — 「취득가액」 + 신고서 합계(= 양도가액 − 필요경비 − 양도차익)
 * · SL-3 청산금 수령 단독 신고 — 계산 전 「취득가액」·계산 후 표시 → 계산 후 33,333,333
 * · SL-4 묶음 둘째 자산 — 계산 후 라벨 「취득가액」
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
import { captureBody } from "./_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const COMMON = { acquisitionCause: "purchase", acquisitionDate: "2010-03-01", redevApprovalDate: "2018-05-01", redevApprovalLawBasis: "urban_renovation_art_74", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", capitalExpenditure: "0", transferExpense: "0", addressJibun: "서울 A 1", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "300000000", actualSalePrice: "3000000000" };
const RIGHT = { ...COMMON, assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false };
const APT = { ...COMMON, assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2023-06-01", standardPriceAtTransfer: "1000000000", redevReceiveOnlyMode: "no" };
const EST = { useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", redevAcquisitionHousingPrice: "100000000", redevManagementDisposalHousingPrice: "300000000" };
const RECEIVE_ONLY = { redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevSettlementSaleDate: "2024-03-01", redevReceiveOnlyMode: "yes", actualSalePrice: "100000000" };
const RECEIVE_ONLY_DATES = { transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "100000000" };

function form(assets: L[], over: L = {}) {
  const f = createDefaultTransferFormData() as L;
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "3000000000", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true }, over);
  f.assets = assets.map((a, k) => ({ ...makeDefaultAsset(k + 1), assetId: `a${k}`, ...a }));
  return rosterForDeclaredCount(f) as never;
}
function noIssues(f: never) {
  const out: string[] = [];
  for (let i = 0; i <= 5; i++) for (const m of collectStepIssues(i, f)) out.push((m as { message: string }).message);
  expect(out).toEqual([]);
}
async function calc(f: never) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const j = (await res.json()) as L;
  expect(res.status, JSON.stringify(j).slice(0, 300)).toBe(200);
  return j.data;
}
const rowsOf = (f: never, result: unknown) => computeTransferPerAssetSummary(f, result as never).rows;

describe("SL-1 계산 전 — 「인가전 분 취득가액」 + ⑤ 값", () => {
  it.each<[string, L, number, boolean]>([
    ["입주권 실지 납부 2억", RIGHT, 300_000_000, false],
    ["완공 실지 납부 2억", APT, 300_000_000, false],
    ["완공 환산 납부 2억(계산 후 표시)", { ...APT, ...EST }, 0, true],
  ])("%s", (_n, a, acq, pending) => {
    const row = rowsOf(form([a]), null)[0];
    expect(row.acqLabel).toBe("인가전 분 취득가액");
    expect(row.acqPrice).toBe(acq);
    expect(row.acqPending).toBe(pending);
  });
});

describe("SL-2 계산 후 — 「취득가액」 + 신고서 합계", () => {
  it.each<[string, L, number]>([
    ["입주권 실지 납부 2억", RIGHT, 500_000_000],
    ["완공 실지 납부 2억", APT, 500_000_000],
    ["완공 환산 납부 2억", { ...APT, ...EST }, 500_000_000],
    ["완공 토지 출자 실지 납부 2억", { ...APT, redevOriginalAssetType: "land" }, 500_000_000],
    ["완공 실지 납부 0", { ...APT, redevSettlementAmount: "0" }, 300_000_000],
  ])("%s → %d", async (_n, a, acq) => {
    const f = form([a]);
    noIssues(f);
    const data = await calc(f);
    const row = rowsOf(f, data)[0];
    expect(row.acqLabel).toBe("취득가액");
    expect(row.acqPrice).toBe(acq);
    expect(row.acqPrice).toBe(row.salePrice - row.expense - data.result.transferGain);
  });
});

describe("SL-3 청산금 수령 단독 신고", () => {
  it("계산 전 「취득가액」·계산 후 표시 → 계산 후 33,333,333", async () => {
    const f = form([{ ...APT, ...RECEIVE_ONLY }], RECEIVE_ONLY_DATES);
    noIssues(f);
    const pre = rowsOf(f, null)[0];
    expect(pre.acqLabel).toBe("취득가액");
    expect(pre.acqPrice).toBe(0);
    expect(pre.acqPending).toBe(true);
    expect(pre.salePrice).toBe(100_000_000);
    const post = rowsOf(f, await calc(f))[0];
    expect(post.acqLabel).toBe("취득가액");
    expect(post.acqPrice).toBe(33_333_333);
    expect(post.acqPending).toBe(false);
  });
});

describe("SL-4 묶음", () => {
  it("둘째 재개발 자산 — 계산 전 「인가전 분 취득가액」, 계산 후 「취득가액」", async () => {
    const f = form([{ ...RIGHT }, { ...RIGHT, addressJibun: "서울 B 2" }], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "6000000000" });
    noIssues(f);
    expect(rowsOf(f, null)[1].acqLabel).toBe("인가전 분 취득가액");
    const post = rowsOf(f, await calc(f))[1];
    expect(post.acqLabel).toBe("취득가액");
    expect(post.acqPrice).toBe(500_000_000);
  });
});
