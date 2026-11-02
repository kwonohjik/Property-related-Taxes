/**
 * anchor — 재개발·입주권(§166) 양도비의 인가 전·후 안분과 총 양도비 도달.
 * 계획서 `docs/02-design/features/redev-total-transfer-expense.plan.md` (사용자 결정 Q-1 a · Q-2 평가액 : (양도가액 − 평가액) · 환산이면 인가 전 몫 공제 안 함 · Q-3 a).
 *
 * 종전: 안분 몫이 §166 산식이 읽지 않는 `expenses`로만 가서 총 양도비의 §166 자산 몫이 사라졌고, 자산 칸 양도비는 전액 인가 후 분이었다.
 * 검증: A. 총 양도비 ≡ 같은 몫의 자산 칸 · B. 양도비 ≡ 인가 전 분 칸 + 자본적지출 칸(인가 후 분)으로 나눠 입력. 세액은 mock 세율표 값이다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { apportionRedevTransferExpense } from "@/lib/tax-engine/redevelopment-transfer-expense";
import { scaleRedevelopmentForBurdenedGift } from "@/lib/tax-engine/redevelopment-burdened-gift";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { withRedevCommonExpense } from "@/app/api/calc/transfer/engine-input";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
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

describe("A. 총 양도비 1천만 ≡ 같은 몫을 자산 칸에 입력", () => {
  const SALE = "1000000000";
  const pair: [string, (e: string, l: string) => A[]][] = [
    ["완공 APT 납부 + 토지", (e, l) => [apt(1, "700000000", { transferExpense: e }), land(2, "300000000", { transferExpense: l })]],
    ["토지 + 완공 APT 컴패니언", (e, l) => [land(1, "300000000", { transferExpense: l }), apt(2, "700000000", { transferExpense: e })]],
    ["완공 APT 수령 + 토지", (e, l) => [apt(1, "700000000", { transferExpense: e, ...RECEIVE }), land(2, "300000000", { transferExpense: l })]],
    ["완공 APT 환산 + 토지", (e, l) => [apt(1, "700000000", { transferExpense: e, ...ESTIMATED }), land(2, "300000000", { transferExpense: l })]],
    ["완공 APT 승계 + 토지", (e, l) => [apt(1, "700000000", { transferExpense: e, ...SUCCESSOR }), land(2, "300000000", { transferExpense: l })]],
    ["입주권 납부 + 토지", (e, l) => [right(1, "700000000", { transferExpense: e }), land(2, "300000000", { transferExpense: l })]],
    ["토지 + 입주권 컴패니언", (e, l) => [land(1, "300000000", { transferExpense: l }), right(2, "700000000", { transferExpense: e })]],
    ["입주권 수령 + 토지", (e, l) => [right(1, "700000000", { transferExpense: e, ...RECEIVE }), land(2, "300000000", { transferExpense: l })]],
    ["승계 입주권(§166 밖) + 토지", (e, l) => [right(1, "700000000", { transferExpense: e, isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes" }), land(2, "300000000", { transferExpense: l })]],
  ];
  for (const [name, mk] of pair) {
    it(`함께 양도 — ${name}`, async () => {
      const total = await run(form(mk("", ""), SALE, { totalTransferExpense: "10000000" }));
      const direct = await run(form(mk("7000000", "3000000"), SALE));
      const none = await run(form(mk("", ""), SALE));
      expect(total.tax).toBe(direct.tax);
      expect(total.gain).toEqual(direct.gain);
      expect(total.tax).toBeLessThan(none.tax);
    }, 30_000);
  }

  it("함께 양도 — APT + 입주권, 양쪽 몫 모두 닿는다", async () => {
    const mk = (a: string, b: string) => [
      apt(1, "700000000", { transferExpense: a }),
      right(2, "300000000", { transferExpense: b, redevRightsValue: "200000000", redevSettlementAmount: "10000000" }),
    ];
    const total = await run(form(mk("", ""), SALE, { totalTransferExpense: "10000000" }));
    const direct = await run(form(mk("7000000", "3000000"), SALE));
    expect(total.tax).toBe(direct.tax);
    expect(total.gain).toEqual(direct.gain);
  }, 30_000);

  it("함께 양도 — 토지 + APT + 토지 (3자산)", async () => {
    const mk = (a: string, b: string) => [
      land(1, "150000000", { transferExpense: b }),
      apt(2, "700000000", { transferExpense: a }),
      land(3, "150000000", { transferExpense: b }),
    ];
    const total = await run(form(mk("", ""), SALE, { totalTransferExpense: "10000000" }));
    const direct = await run(form(mk("7000000", "1500000"), SALE));
    expect(total.tax).toBe(direct.tax);
    expect(total.gain).toEqual(direct.gain);
  }, 30_000);

  const axisB = (mk: typeof apt, e: string, over: A = {}) => [
    mk(1, "", { ownershipNumerator: "60", ownershipDenominator: "100", transferExpense: e, redevSettlementAmount: "48000000", ...over }),
    mk(2, "", { ownershipNumerator: "40", ownershipDenominator: "100", transferExpense: e, redevSettlementAmount: "32000000", ...over }),
  ];
  const SPLIT = { assetSplitMode: "fractional", bundledSaleMode: "apportioned" };
  const axisCases: [string, typeof apt, A][] = [
    ["APT 납부", apt, {}],
    ["APT 수령", apt, RECEIVE],
    ["APT 환산", apt, ESTIMATED],
    ["입주권", right, {}],
    ["APT 단독 신고", apt, RECEIVE_ONLY],
  ];
  for (const [name, mk, over] of axisCases) {
    it(`축 B 60/40 — ${name}`, async () => {
      const total = await run(form(axisB(mk, "", over), SALE, { ...SPLIT, totalTransferExpense: "10000000" }));
      const direct = await run(form(axisB(mk, "10000000", over), SALE, SPLIT));
      const none = await run(form(axisB(mk, "", over), SALE, SPLIT));
      expect(total.tax).toBe(direct.tax);
      expect(total.gain).toEqual(direct.gain);
      expect(total.tax).toBeLessThan(none.tax);
    }, 30_000);
  }

  it("나누어 떨어지지 않는 금액 — 안분 몫의 합이 총 양도비다", async () => {
    const mk = () => [apt(1, "700000000"), land(2, "300000000")];
    const r = await run(form(mk(), SALE, { totalTransferExpense: "10000001" }));
    expect(r.exp[0] + r.exp[1]).toBe(10_000_001);
  }, 30_000);
});

describe("B. 인가 전·후 안분 — 평가액 : (양도가액 − 평가액)", () => {
  const SALE = "700000000";
  const single = (mk: typeof apt, over: A = {}, sale = SALE) => form([mk(1, sale, over)], sale);

  const cases: [string, typeof apt, A][] = [
    ["완공 APT 납부", apt, {}],
    ["완공 APT 수령", apt, RECEIVE],
    ["입주권 납부", right, {}],
    ["입주권 수령", right, RECEIVE],
  ];
  for (const [name, mk, over] of cases) {
    it(`${name} — 평가액 5억·양도가액 7억·양도비 7백만 = 인가 전 5백만 + 인가 후 2백만`, async () => {
      const r = await run(single(mk, { ...over, transferExpense: "7000000" }));
      const split = await run(single(mk, { ...over, redevPreApprovalExpenses: "5000000", capitalExpenditure: "2000000" }));
      const postOnly = await run(single(mk, { ...over, capitalExpenditure: "7000000" }));
      expect(r.tax).toBe(split.tax);
      expect(r.gain).toEqual(split.gain);
      expect(r.tax).not.toBe(postOnly.tax);
    }, 30_000);
  }

  it("자본적지출은 안분하지 않는다 — 전액 인가 후 분", async () => {
    const r = await run(single(apt, { capitalExpenditure: "3000000", transferExpense: "7000000" }));
    const split = await run(single(apt, { redevPreApprovalExpenses: "5000000", capitalExpenditure: "5000000" }));
    expect(r.tax).toBe(split.tax);
  }, 30_000);

  it("요청 본문 — 양도비는 자본적지출과 분리해 싣는다", async () => {
    const { body } = await run(single(apt, { capitalExpenditure: "3000000", transferExpense: "7000000" }));
    expect(body.redevelopment.postApprovalExpenses).toBe(3_000_000);
    expect(body.redevelopment.transferExpense).toBe(7_000_000);
  }, 30_000);

  it("양도가액이 평가액 이하 — 인가 후 몫이 없어 전액 인가 전 분", async () => {
    const r = await run(single(apt, { transferExpense: "7000000" }, "450000000"));
    const pre = await run(single(apt, { redevPreApprovalExpenses: "7000000" }, "450000000"));
    expect(r.tax).toBe(pre.tax);
    expect(r.gain).toEqual(pre.gain);
  }, 30_000);

  it("환산 — 인가 전 몫 5백만은 개산공제와 택일이라 공제하지 않는다", async () => {
    const r = await run(single(apt, { ...ESTIMATED, transferExpense: "7000000" }));
    const postShareOnly = await run(single(apt, { ...ESTIMATED, capitalExpenditure: "2000000" }));
    const noExpense = await run(single(apt, ESTIMATED));
    expect(r.tax).toBe(postShareOnly.tax);
    expect(r.gain).toEqual(postShareOnly.gain);
    expect(r.gain[0]).toBe(noExpense.gain[0] - 2_000_000);
  }, 30_000);

  it("승계 APT — 인가 전 분이 없어 전액 공제", async () => {
    const r = await run(single(apt, { ...SUCCESSOR, transferExpense: "7000000" }));
    const direct = await run(single(apt, { ...SUCCESSOR, capitalExpenditure: "7000000" }));
    expect(r.tax).toBe(direct.tax);
    expect(r.gain).toEqual(direct.gain);
  }, 30_000);

  it("단독 신고 — 인가 전·후 구분 없이 청산금 비율 안분 규칙 그대로", async () => {
    const f = (o: A) =>
      form(
        [apt(1, "525000000", { ...RECEIVE_ONLY, redevRightsValue: "500000000", redevSettlementAmount: "114000000", redevSettlementSaleDate: "2024-06-01", ...o })],
        "525000000",
      );
    const r = await run(f({ transferExpense: "10000000" }));
    const direct = await run(f({ capitalExpenditure: "10000000" }));
    expect(r.gain).toEqual(direct.gain);
    expect(r.tax).toBe(direct.tax);
  }, 30_000);
});

describe("C. 부담부증여·이월과세", () => {
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

  it("축 B 입주권 부담부증여 — 총 양도비 ≡ 자산 칸, 채무비율이 함께 곱해진다", async () => {
    const total = await run(bg("10000000", ""));
    const direct = await run(bg("", "10000000"));
    const none = await run(bg("", ""));
    expect(total.tax).toBe(direct.tax);
    expect(total.gain).toEqual(direct.gain);
    expect(total.exp.reduce((s, v) => s + v, 0)).toBeGreaterThan(none.exp.reduce((s, v) => s + v, 0));
  }, 30_000);

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

  it.each([
    ["입주권", "right_to_move_in", "right", {}],
    ["완공 APT", "redevelopment_apt", "apt", APT_EXTRA],
  ] as const)("이월과세 %s + 토지 — 총 양도비 ≡ 자산 칸", async (_n, kind, subject, extra) => {
    const total = await run(carry(kind, subject, extra, "10000000", "", ""));
    const direct = await run(carry(kind, subject, extra, "", "7000000", "3000000"));
    expect(total.tax).toBe(direct.tax);
    expect(total.gain).toEqual(direct.gain);
  }, 30_000);
});

describe("D. 안분 함수", () => {
  const info = (o: Partial<RedevelopmentInfo>) =>
    ({ subject: "apt", settlementDirection: "pay", rightsValue: 500_000_000, settlementAmount: 80_000_000, preApprovalExpenses: 1_000, postApprovalExpenses: 2_000, ...o }) as RedevelopmentInfo;

  it("양도비 없음 — 같은 객체를 돌려준다(일반 경로 무변경)", () => {
    const i = info({});
    expect(apportionRedevTransferExpense(i, 700_000_000)).toBe(i);
    const zero = info({ transferExpense: 0 });
    expect(apportionRedevTransferExpense(zero, 700_000_000)).toBe(zero);
  });

  it("기존 칸에 더하고 잔액은 인가 후가 흡수한다", () => {
    const r = apportionRedevTransferExpense(info({ transferExpense: 7_000_001 }), 700_000_000);
    expect(r.preApprovalExpenses).toBe(1_000 + 5_000_000);
    expect(r.postApprovalExpenses).toBe(2_000 + 2_000_001);
    expect(r.transferExpense).toBeUndefined();
  });

  it("양도가액 = 평가액 경계 — 전액 인가 전", () => {
    const r = apportionRedevTransferExpense(info({ transferExpense: 7_000_000 }), 500_000_000);
    expect(r.preApprovalExpenses).toBe(7_001_000);
    expect(r.postApprovalExpenses).toBe(2_000);
  });

  it("양도가액이 평가액보다 크면 인가 후 몫이 생긴다", () => {
    const r = apportionRedevTransferExpense(info({ transferExpense: 1_000_000_000 }), 500_000_001);
    expect(r.postApprovalExpenses).toBeGreaterThan(2_000);
  });

  it("승계조합원·단독 신고 — 전액 인가 후 칸", () => {
    const s = apportionRedevTransferExpense(info({ transferExpense: 7_000_000, isSuccessorMember: true }), 700_000_000);
    expect(s.preApprovalExpenses).toBe(1_000);
    expect(s.postApprovalExpenses).toBe(7_002_000);
    const ro = apportionRedevTransferExpense(info({ transferExpense: 7_000_000, settlementDirection: "receive", receiveOnlyMode: true }), 700_000_000);
    expect(ro.preApprovalExpenses).toBe(1_000);
    expect(ro.postApprovalExpenses).toBe(7_002_000);
  });

  it("부담부증여 — 스케일 뒤 평가액 ÷ 채무액 = 평가액 ÷ 증여가액 비율로 나눈다", () => {
    // 평가액 9억 · 증여가액 12억 · 채무 6억(B/C 1/2) · 양도비 1천만 → 스케일 뒤 양도비 5백만, 평가액 4.5억, 양도가액(채무) 6억 → 5백만 × 9억/12억 = 3,750,000
    const scaled = scaleRedevelopmentForBurdenedGift(
      info({ rightsValue: 900_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0, transferExpense: 10_000_000 }),
      { debt: 600_000_000, valuation: 1_200_000_000 },
    );
    const r = apportionRedevTransferExpense(scaled, 600_000_000);
    expect(r.preApprovalExpenses).toBe(3_750_000);
    expect(r.postApprovalExpenses).toBe(1_250_000);
  });

  it("입주권에 단독 신고 플래그가 남아도 안분한다 — 엔진의 단독 신고 분기는 완공 APT 수령 전용이다", () => {
    const r = apportionRedevTransferExpense(info({ subject: "right", transferExpense: 7_000_000, settlementDirection: "receive", receiveOnlyMode: true }), 700_000_000);
    expect(r.preApprovalExpenses).toBe(5_001_000);
    expect(r.postApprovalExpenses).toBe(2_002_000);
  });
});

describe("D-2. 총 양도비 몫 합산", () => {
  it("자산 칸 양도비에 더한다 — 몫이 없으면 같은 객체", () => {
    expect(withRedevCommonExpense({ transferExpense: 1_000 }, 7_000).transferExpense).toBe(8_000);
    expect(withRedevCommonExpense({} as { transferExpense?: number }, 7_000).transferExpense).toBe(7_000);
    const same = { transferExpense: 1_000 };
    expect(withRedevCommonExpense(same, 0)).toBe(same);
    expect(withRedevCommonExpense(same, undefined)).toBe(same);
  });
});

describe("E. 계산 설명 단계 — 분기가 실제로 뺀 값을 적는다", () => {
  const step = (redevPatch: Partial<RedevelopmentInfo>, inputPatch: Record<string, unknown> = {}) => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...inputPatch,
        propertyType: "redevelopment_apt", transferPrice: 700_000_000, transferDate: new Date("2024-06-01"), acquisitionDate: new Date("2010-01-01"),
        acquisitionPrice: 300_000_000, expenses: 0, useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
        redevelopment: {
          subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2018-05-01"), rightsValue: 500_000_000, settlementDirection: "pay",
          settlementAmount: 80_000_000, settlementSaleDate: new Date("2023-05-01"), preApprovalExpenses: 0, originalAssetType: "housing", exemptionEligibleAtApproval: false,
          ...redevPatch,
        },
      }),
      makeMockRates(),
    );
    return { tax: r.totalTax, step: r.steps.find((s) => s.label === "인가전 분 양도차익")! };
  };

  it("양도비 인가 전 몫이 산식과 금액에 함께 나온다", () => {
    const { step: s, tax } = step({ transferExpense: 7_000_000 });
    expect(s.formula).toContain("필요경비(법 §97①2·3호) 5,000,000");
    expect(s.amount).toBe(500_000_000 - 300_000_000 - 5_000_000);
    expect(tax).toBe(step({ preApprovalExpenses: 5_000_000, postApprovalExpenses: 2_000_000 }).tax);
  });

  it("이월과세 증여세 상당액은 필요경비 항에 겹치지 않고 따로 적는다", () => {
    const { step: s } = step({ transferExpense: 7_000_000 }, { carryoverGiftTaxExpense: 4_000_000 });
    expect(s.formula).toContain("필요경비(법 §97①2·3호) 5,000,000");
    expect(s.formula).toContain("이월과세 증여세 상당액 4,000,000");
    expect(s.amount).toBe(500_000_000 - 300_000_000 - 5_000_000 - 4_000_000);
  });
});
