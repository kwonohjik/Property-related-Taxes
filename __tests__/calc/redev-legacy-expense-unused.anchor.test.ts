/**
 * anchor — 재개발·재건축 자산(§166)의 이전 입력 형식 필요경비(`directExpenses`) ⑧ 차단 (계획서 `docs/02-design/features/redev-transfer-expense-residual.plan.md` Q-1 a).
 *
 * 옛 칸은 ④가 `expenses`로 보내지만 재개발 산식은 `redevelopment` 서브객체만 읽어 세액에 닿지 않는다(R 묶음이 그 전제를 지킨다 — 엔진이 읽게 되면 차단을 다시 본다).
 * ⑤ 안내와 ⑧ 차단은 같은 술어·같은 문장(`redev-legacy-expense-unused.ts`). 세액은 mock 세율표 값이다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { redevLegacyExpenseUnused } from "@/lib/calc/redev-legacy-expense-unused";
import { redevLegacyExpenseUnusedMessage } from "@/lib/calc/redev-legacy-expense-unused";

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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Record<string, unknown>;
const redev = (i: number, kind: string, subject: string, sale: string, over: A = {}): A => ({
  ...makeDefaultAsset(i), assetKind: kind, acquisitionCause: "purchase", acquisitionDate: "2010-01-01",
  redevSubject: subject, redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2018-05-01", redevSettlementDirection: "pay", redevSettlementSaleDate: "2023-05-01",
  redevRightsValue: "500000000", redevSettlementAmount: "80000000", redevPreApprovalExpenses: "0",
  redevActualAcquisitionPrice: "300000000", fixedAcquisitionPrice: "300000000",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "300000000", actualSalePrice: sale, ...over,
});
const apt = (i: number, sale: string, over: A = {}) => redev(i, "redevelopment_apt", "apt", sale, over);
const right = (i: number, sale: string, over: A = {}) => redev(i, "right_to_move_in", "right", sale, over);
const land = (i: number, sale: string, over: A = {}): A => ({
  ...makeDefaultAsset(i), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-02-10",
  actualSalePrice: sale, fixedAcquisitionPrice: "100000000", standardPriceAtTransfer: sale, ...over,
});
const form = (assets: A[], contract: string, over: A = {}) =>
  ({
    transferDate: "2024-06-01", filingDate: "2024-08-31", assets, houses: [], presaleRights: [], isOneHousehold: false,
    householdHousingCount: "2", residencePeriodMonths: "0", annualBasicDeductionUsed: "0", contractTotalPrice: contract,
    bundledSaleMode: "actual", totalTransferExpense: "", ...over,
  }) as unknown as TransferFormData;

const ESTIMATED: A = {
  useEstimatedAcquisition: true, redevAcquisitionMethod: "estimated", redevAcquisitionStdPrice: "200000000", redevManagementDisposalStdPrice: "400000000",
  redevManagementDisposalHousingPrice: "400000000", redevAcquisitionHousingPrice: "200000000", fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "",
};
const SUCCESSOR: A = { redevIsSuccessorMember: "yes", redevCompletionDate: "2022-12-01" };
const RECEIVE: A = { redevSettlementDirection: "receive" };
const RECEIVE_ONLY: A = { redevSettlementDirection: "receive", redevReceiveOnlyMode: "yes" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(f: TransferFormData): Promise<{ tax: number; exp: number[]; gain: number[]; body: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap: { body?: any } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try {
    await callTransferTaxAPI(f);
  } finally {
    vi.unstubAllGlobals();
  }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
      ...cap.body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    }),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  const agg = json.data.aggregated;
  if (agg) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = agg.properties as any[];
    return { tax: agg.totalTax, exp: props.map((p) => p.necessaryExpense), gain: props.map((p) => p.transferGain), body: cap.body };
  }
  const r = json.data.result;
  return { tax: r.totalTax, exp: [r.necessaryExpense], gain: [r.transferGain], body: cap.body };
}

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };

const BB = {
  transferDate: "2024-06-01", filingDate: "2024-08-31", householdHousingCount: "2", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, bundledSaleMode: "actual",
};
const ORIG: A = {
  isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", redevOriginalAssetType: "housing", redevRightsValue: "900,000,000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100,000,000", redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74",
};
const first = (o: A) => ({
  ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", acquisitionCause: "purchase",
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
  bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2018-06-01", standardPriceAtAcq: "", standardPriceAtTransfer: "", ...HALF, ...o,
}) as AssetForm;
const share = (o: A) => ({ ...makeDefaultAsset(2), assetId: "s", ...HALF, acquisitionCause: "purchase", redevApprovalDate: "2018-06-01", ...o }) as AssetForm;
const bg = (t: string, e: string) =>
  Object.assign(createDefaultTransferFormData(), BB, {
    assetSplitMode: "fractional", contractTotalPrice: "1500000000", totalTransferExpense: t,
    assets: [first({ ...ORIG, transferExpense: e, bgActualAcquisitionTotal: "300,000,000" }), share({ ...ORIG, transferExpense: e })],
  }) as TransferFormData;

const CAR = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
  useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000",
  exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01",
};
const carry = (kind: string, subject: string, extra: A, t: string, a: string, b: string) =>
  Object.assign(createDefaultTransferFormData(), BB, {
    transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "1000000000", totalTransferExpense: t,
    assets: [
      {
        ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1", assetKind: kind, redevSubject: subject, redevOriginalAssetType: "housing",
        redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay",
        redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0", actualSalePrice: "700,000,000", transferType: "regular", acquisitionCause: "carryover_gift",
        acquisitionDate: "2023-06-01", acquisitionPrice: "100000000", carryover: CAR, transferExpense: a, ...extra,
      },
      land(2, "300000000", { transferExpense: b }),
    ],
  }) as unknown as TransferFormData;
const APT_EXTRA: A = { redevCompletionDate: "2025-09-01", redevManagementDisposalHousingPrice: "600000000", redevAcquisitionHousingPrice: "250000000" };


// 소재지가 비면 ⑧이 자산 검증을 그 오류에서 멈춘다 — 모든 자산에 채운다.
const withDir = (f: TransferFormData, d: string, idx: number[] = [0]) =>
  Object.assign(f, {
    assets: f.assets.map((a, i) => ({ ...a, addressJibun: a.addressJibun || `서울 강남구 테스트동 ${i + 1}`, ...(idx.includes(i) ? { directExpenses: d } : {}) })),
  }) as TransferFormData;
const dirIssues = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f)).filter((i) => i.field === "directExpenses");

// 승계조합원 — 입주권을 인가 뒤에 취득하고 청산금 분기가 없다(⑧ 승계 분기 요건).
const SUCCESSOR_AFTER: A = { ...SUCCESSOR, acquisitionDate: "2019-03-01", redevSettlementAmount: "0" };

describe("L. §166 자산 — 옛 칸이 있으면 ⑧이 막고, 비우면 통과한다", () => {
  const cases: [string, (d: string) => TransferFormData, number[]][] = [
    ["완공 APT 납부", (d) => withDir(form([apt(1, "700000000")], "700000000"), d), [0]],
    ["완공 APT 수령", (d) => withDir(form([apt(1, "700000000", RECEIVE)], "700000000"), d), [0]],
    ["완공 APT 환산", (d) => withDir(form([apt(1, "700000000", ESTIMATED)], "700000000"), d), [0]],
    ["완공 APT 승계", (d) => withDir(form([apt(1, "700000000", SUCCESSOR_AFTER)], "700000000"), d), [0]],
    ["완공 APT 청산금 수령 단독 신고", (d) => withDir(form([apt(1, "700000000", RECEIVE_ONLY)], "700000000"), d), [0]],
    ["입주권 납부", (d) => withDir(form([right(1, "700000000")], "700000000"), d), [0]],
    ["입주권 수령", (d) => withDir(form([right(1, "700000000", RECEIVE)], "700000000"), d), [0]],
    ["APT + 토지 함께 양도", (d) => withDir(form([apt(1, "700000000"), land(2, "300000000")], "1000000000"), d), [0]],
    ["토지 + APT 컴패니언", (d) => withDir(form([land(1, "300000000"), apt(2, "700000000")], "1000000000"), d, [1]), [1]],
    ["축 B 입주권 부담부증여 첫 지분", (d) => withDir(bg("", ""), d), [0]],
    ["이월과세 입주권 + 토지", (d) => withDir(carry("right_to_move_in", "right", {}, "", "", ""), d), [0]],
    ["이월과세 APT + 토지", (d) => withDir(carry("redevelopment_apt", "apt", APT_EXTRA, "", "", ""), d), [0]],
    // 남은 분리 토글은 분리 계산 술어를 참으로 만들지만 분리 ⑧은 재개발 자산에 돌지 않는다 — 이 차단이 유일하다.
    ["완공 APT · 남은 「토지·건물 취득일 다름」 토글", (d) => withDir(form([apt(1, "700000000", { hasSeperateLandAcquisitionDate: true })], "700000000"), d), [0]],
  ];
  it.each(cases)("%s", (_n, mk, idx) => {
    const f = mk("7000000");
    for (const i of idx) expect(redevLegacyExpenseUnused(f.assets[i])).toBe(true);
    const issues = dirIssues(f);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain(redevLegacyExpenseUnusedMessage(f.assets[idx[0]]));
    expect(dirIssues(mk(""))).toEqual([]);
  });
});

describe("N. 막지 않는 경우", () => {
  it.each([
    ["승계 입주권 — §166 밖, 옛 칸이 필요경비가 된다", withDir(form([right(1, "700000000", { isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes" })], "700000000"), "7000000")],
    ["토지", withDir(form([land(1, "700000000")], "700000000"), "7000000")],
    ["자본적지출 칸에 값이 있다(옛 칸 숨김)", withDir(form([apt(1, "700000000", { capitalExpenditure: "1000000" })], "700000000"), "7000000")],
    ["양도비 칸에 값이 있다(옛 칸 숨김)", withDir(form([apt(1, "700000000", { transferExpense: "1000000" })], "700000000"), "7000000")],
  ] as const)("%s", (_n, f) => {
    expect(redevLegacyExpenseUnused(f.assets[0])).toBe(false);
    expect(dirIssues(f)).toEqual([]);
  });
});

describe("M. 문구 — 「인가전 분 필요경비」는 그 칸이 보일 때만 지목한다", () => {
  it.each([
    ["원조합원 실가", apt(1, "700000000"), true],
    ["원조합원 환산(인가 전 개산공제)", apt(1, "700000000", ESTIMATED), false],
    ["승계 완공 APT", apt(1, "700000000", SUCCESSOR_AFTER), false],
  ] as const)("%s", (_n, a, mentions) => {
    expect(redevLegacyExpenseUnusedMessage(a as unknown as AssetForm).includes("「인가전 분 필요경비」")).toBe(mentions);
  });
});

describe("R. 차단의 전제 — 옛 칸은 §166 세액에 닿지 않는다", () => {
  it("완공 APT 납부 — 옛 칸 7백만이 있어도 없어도 세액이 같다", async () => {
    const none = await run(form([apt(1, "700000000")], "700000000"));
    const legacy = await run(form([apt(1, "700000000", { directExpenses: "7000000" })], "700000000"));
    expect(legacy.tax).toBe(none.tax);
    expect(none.tax).toBe(74_435_178);
  }, 30_000);

  it("대조 — 승계 입주권은 옛 칸이 세액을 바꾼다", async () => {
    const s = { isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes" };
    const none = await run(form([right(1, "700000000", s)], "700000000"));
    const legacy = await run(form([right(1, "700000000", { ...s, directExpenses: "7000000" })], "700000000"));
    expect(none.tax).toBe(282_711_000);
    expect(legacy.tax).toBe(279_477_000);
  }, 30_000);
});
