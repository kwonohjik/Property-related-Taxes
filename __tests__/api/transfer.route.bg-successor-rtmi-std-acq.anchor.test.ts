/**
 * anchor — **승계 조합원입주권 부담부증여 × 담보(상증법 §66)·임대(§61⑤) 승** — 취득가액 = 입주권 기준시가(소령 §165①) × 채무비율, 개산공제 1% (I-1).
 * 계획서 `docs/00-pm/bg-successor-rtmi-std-acq.plan.md` · 상위 `bg-nonsupp-winner-support.plan.md` §4.2.2 · 사용자 결정 Q-1(착수 순서 … I-0 → I-1 …) · Q-I2(기존 필드 재사용).
 *
 * 법문은 명확하다 — 소령 §159①1호 A 괄호: 양도가액을 상증법 §61①·②·⑤ 및 §66으로 산정한 경우 취득가액도 기준시가로 산정(담보 2023.2.28.~ · 임대 2020.2.11.~).
 * 입주권의 기준시가 = 소령 §165①: 취득일까지 납입한 금액 + 취득일 현재의 프리미엄. 개산공제 = 소령 §163⑥4호 1%(BG 헬퍼의 3%가 아니다).
 * 종전: 기준시가 모드 담보·임대 승은 400(입력 경로 없음), 시가 모드 담보 승은 실지취득가액(K-4)으로 200(I-0이 2023.2.28. 이후를 400으로 대칭).
 *
 * 시료(원 단위): 평가 3항 12억+2억+1억 = 15억(보충적평가) · 담보 30억(채무 30억 · 채무비율 1) · 임대 = 보증금 30억 + 연 1.2억(환산 40억 · 채무 30억 · 비율 0.75) ·
 * 승계 취득 2020-01-01 · 승계취득가액 3억 + 추가분담금 1억(실지 4억) · 취득일 기준시가 = 납입 2억 + 프리미엄 1억 = 3억.
 *
 * 오라클(손계산, 양도가액 B = 채무):
 *   · 담보 승: 양도 30억 − 취득 3억 × 1 − 개산공제 3억 × 1% = 300만 → **2,697,000,000** (시가 모드·기준시가 모드 같다)
 *   · 임대 승(기준시가 모드): 양도 30억 − 취득 3억 × 0.75 = 2.25억 − 개산공제 2.25억 × 1% = 225만 → **2,772,750,000**
 *   · 열거 이전(담보 2023-02-27 · 임대 2020-02-10): 실지 4억 × 비율 → 30억 − 4억 = **2,600,000,000** · 30억 − 4억 × 0.75 = **2,700,000,000**
 *   · 보충 승(채무 6억 · 비율 0.4): 6억 − 실지 4억 × 0.4 = **440,000,000** (불변)
 *
 * · SR-1 격자 — 시가·담보 / 기준시가·담보 / 기준시가·임대: ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클 ∧ 취득가액 3억(또는 2.25억) ∧ 개산공제율 0.01.
 * · SR-2 연혁 경계 — 담보 2023-02-27/28 · 임대 2020-02-10/11: 열거 이전은 실지(값 불변), 이후는 기준시가.
 * · SR-3 입력 요구 정합 ⑧ ⊇ ⑫ — 기준시가 칸 비움: ⑧ 1건 ∧ ⑫ 400 · 승계취득가액 비움: ⑧·⑫ 통과(쓰이지 않는 값) · 열거 이전 승계취득가액 비움: 종전대로 ⑧ 차단.
 * · SR-4 원조합원은 계속 막는다(질의 H-2 대기) — ⑧ 차단 ∧ ⑫ 400 · 기준시가 칸을 채워도 같다.
 * · SR-5 범위 — 지분·함께 양도 묶음 승계 입주권은 막는다 · 보충 승·열거 이전은 막지 않는다.
 * · SR-6 필요경비 — 자본적지출·양도비는 개산공제로 대체돼 값에 영향이 없다 ∧ ⑤ 술어(필요경비 칸 숨김).
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
import { bgRtmiParenEnumerated, bgSuccessorRightStdForced } from "@/lib/calc/bg-rtmi-std-acq";
import { bgExpenseInputsUnused } from "@/lib/calc/burdened-gift-expense-scope";

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
const SUCC = x({ isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", acquisitionDate: "2020-01-01", acquisitionCause: "purchase", successorRightAcqPrice: "300,000,000", successorRightAddedContribution: "100,000,000", bgActualAcquisitionTotal: "400,000,000" });
const ORIG = x({ isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", acquisitionCause: "purchase", bgActualAcquisitionTotal: "300,000,000" });
const MORT = x({ bgMortgageDebtAmount: "3,000,000,000", bgMortgageSetAmount: "3,000,000,000" });
const RENT = x({ bgLendingDepositTotal: "3,000,000,000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" });
const SUPP = x({ bgMortgageDebtAmount: "600,000,000", bgMortgageSetAmount: "600,000,000" });
const STD = x({ bgValuationMode: "sangjeungbeop_standard" });
const MKT = x({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000" });
/** 취득일 기준시가 2칸 — 납입 2억 + 프리미엄 1억 = 3억(소령 §165①). */
const STDIN = x({ successorRightStdPaidAtAcq: "200,000,000", successorRightStdPremiumAtAcq: "100,000,000" });

const form = (assets: AssetForm[], transferDate = "2026-02-16", over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, { transferDate, assets, contractTotalPrice: "" }, over) as TransferFormData;
const full = (f: TransferFormData) => { const out: { field?: string; message: string }[] = []; for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) out.push({ field: i.field, message: i.message }); return out; };
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const gain = (r: Awaited<ReturnType<typeof post>>) => r.j.data?.result?.transferGain as number | undefined;
const bgOf = (r: Awaited<ReturnType<typeof post>>) => r.j.data?.result?.transferBurdenedGiftBreakdown;

describe("SR-1 승계 입주권 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클 ∧ 개산공제 1%", () => {
  it.each([
    ["시가 · 담보", [MKT, MORT, STDIN], 2_697_000_000, 300_000_000, 3_000_000],
    ["기준시가 · 담보", [STD, MORT, STDIN], 2_697_000_000, 300_000_000, 3_000_000],
    ["기준시가 · 임대", [STD, RENT, STDIN], 2_772_750_000, 225_000_000, 2_250_000],
  ] as const)("%s", async (_n, over, g, acq, deduction) => {
    const f = form([base(SUCC, ...over)]);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gain(r)).toBe(g);
    const b = bgOf(r);
    expect(b.acquisitionMethodUsed).toBe("standard_price");
    expect(b.perAsset.building.acquisitionPrice).toBe(acq);
    expect(b.perAsset.building.estimatedDeduction).toBe(deduction);
    expect(b.perAsset.building.estimatedDeductionRate).toBe(0.01);
  });
  it("시가 모드 담보 승은 «시가보다 큰 담보평가로 기준시가 강제» 표지가 켜진다(고지 근거)", async () => {
    const r = await post(form([base(SUCC, MKT, MORT, STDIN)]));
    expect(bgOf(r).acquisitionStdForcedByCollateral).toBe(true);
  });
  it("프리미엄 칸을 비우고 납입금 3억만 넣어도 합계가 양수라 통과한다(소령 §165① — 프리미엄이 0일 수 있다)", async () => {
    const f = form([base(SUCC, MKT, MORT, x({ successorRightStdPaidAtAcq: "300,000,000", successorRightStdPremiumAtAcq: "" }))]);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(gain(r)).toBe(2_697_000_000);
  });
});

describe("SR-2 연혁 경계 — 괄호가 열거된 시기에만 기준시가, 이전은 실지(값 불변)", () => {
  it.each([
    ["담보 2023-02-27(열거 이전)", [MKT, MORT, STDIN], "2023-02-27", 2_600_000_000, "actual"],
    ["담보 2023-02-28(열거 당일)", [MKT, MORT, STDIN], "2023-02-28", 2_697_000_000, "standard_price"],
    ["임대 2020-02-10(열거 이전)", [STD, RENT, STDIN], "2020-02-10", 2_700_000_000, "actual"],
    ["임대 2020-02-11(열거 당일)", [STD, RENT, STDIN], "2020-02-11", 2_772_750_000, "standard_price"],
  ] as const)("%s", async (_n, over, date, g, method) => {
    const f = form([base(SUCC, ...over)], date);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gain(r)).toBe(g);
    expect(bgOf(r).acquisitionMethodUsed).toBe(method);
  });
});

describe("SR-3 입력 요구 정합 — ⑧ ⊇ ⑫", () => {
  it("괄호 열거 시기 · 기준시가 2칸 비움: ⑧ 1건(칸 successorRightStdPaidAtAcq) ∧ ⑫ 400", async () => {
    const f = form([base(SUCC, MKT, MORT)]);
    const m = full(f);
    expect(m.length).toBe(1);
    expect(m[0].field).toBe("successorRightStdPaidAtAcq");
    expect((await post(f)).status).toBe(400);
  });
  it("승계취득가액·추가분담금을 비워도 ⑧ 통과 ∧ ⑫ 200 — 쓰이지 않는 값을 요구하지 않는다", async () => {
    const f = form([base(SUCC, MKT, MORT, STDIN, x({ successorRightAcqPrice: "", successorRightAddedContribution: "", bgActualAcquisitionTotal: "" }))]);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gain(r)).toBe(2_697_000_000);
  });
  it.each([["기준시가 · 담보", [STD, MORT]], ["기준시가 · 임대", [STD, RENT]]] as const)("%s도 승계취득가액·추가분담금을 비워도 ⑧ 통과 ∧ ⑫ 200", async (_n, over) => {
    const f = form([base(SUCC, ...over, STDIN, x({ successorRightAcqPrice: "", successorRightAddedContribution: "", bgActualAcquisitionTotal: "" }))]);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
  });
  it("열거 이전(2023-02-27)에는 승계취득가액 요구가 그대로다 — 실지를 쓰므로", () => {
    const m = full(form([base(SUCC, MKT, MORT, x({ successorRightAcqPrice: "" }))], "2023-02-27"));
    expect(m.some((i) => i.field === "successorRightAcqPrice")).toBe(true);
  });
  it("보충 승은 승계취득가액 요구가 그대로다 — 안전망", () => {
    const m = full(form([base(SUCC, MKT, SUPP, x({ successorRightAcqPrice: "" }))]));
    expect(m.some((i) => i.field === "successorRightAcqPrice")).toBe(true);
  });
});

describe("SR-4 원조합원은 계속 막는다 — 취득일·납입한 금액의 범위가 불명확하다(질의 H-2 대기)", () => {
  it.each([
    ["시가 · 담보", [MKT, MORT]],
    ["기준시가 · 담보", [STD, MORT]],
    ["기준시가 · 임대", [STD, RENT]],
  ] as const)("%s: ⑧ 1건(원조합원 사유) ∧ ⑫ 400 — 기준시가 칸을 채워도 같다", async (_n, over) => {
    for (const filled of [false, true]) {
      const f = form([base(ORIG, ...over, ...(filled ? [STDIN] : []))]);
      const m = full(f).filter((i) => i.message.includes("원조합원 입주권의 기준시가"));
      expect(m.length).toBe(1);
      const r = await post(f);
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.j)).toContain("원조합원 입주권의 기준시가");
    }
  });
  it("원조합원 열거 이전 양도는 막지 않는다 — 실지(K-4)로 계산(2023-02-27 담보: 25억 = 30억 − 실지 3억 − 청산금 2억)", async () => {
    const f = form([base(ORIG, MKT, MORT)], "2023-02-27");
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(gain(r)).toBe(2_500_000_000);
  });
});

describe("SR-5 범위 — 승계 입주권 단건만", () => {
  it("보충 승(채무 6억)은 시가·기준시가 모두 ⑧ 통과 ∧ ⑫ 200 · 440,000,000 (불변)", async () => {
    for (const mode of [MKT, STD]) {
      const f = form([base(SUCC, mode, SUPP)]);
      expect(full(f)).toEqual([]);
      const r = await post(f);
      expect(r.status).toBe(200);
      expect(gain(r)).toBe(440_000_000);
    }
  });
  it("지분 50% 승계 입주권 담보 승: ⑧ 차단(단독 소유 단건만)", () => {
    const f = form([base(SUCC, MKT, MORT, STDIN, x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" }))]);
    expect(full(f).some((i) => i.message.includes("단독 소유 단건만 합니다"))).toBe(true);
  });
  it("함께 양도 묶음의 승계 입주권 담보 승: 묶음 게이트가 «단독 소유 단건만» 사유로 막는다", () => {
    const house = Object.assign({ ...makeDefaultAsset(1) }, x({
      assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
      standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
      bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3,000,000,000", bgMortgageSetAmount: "3,000,000,000",
      bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
    })) as AssetForm;
    const f = form([house, base(SUCC, MKT, MORT, STDIN)], "2026-02-16", { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "6000000000" });
    const m = full(f).filter((i) => i.message.includes("함께 양도와 같이 계산하지 않습니다"));
    expect(m.length).toBe(1);
    expect(m[0].message).toContain("조합원입주권 자산은");
    expect(m[0].message).toContain("단독 소유 단건만 합니다");
  });
});

describe("SR-6 필요경비 — 개산공제로 대체 · ⑤ 술어", () => {
  it("자본적지출 1억·양도비 5천만을 넣어도 양도차익이 같다 — 개산공제만 쓰인다", async () => {
    const f = form([base(SUCC, MKT, MORT, STDIN, x({ capitalExpenditure: "100000000", transferExpense: "50000000" }))]);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(gain(r)).toBe(2_697_000_000);
  });
  it("⑤ 술어: 열거 시기·승계·담보 승이면 취득가액 강제 ∧ 필요경비 «개산공제만» — 열거 이전·보충 승·원조합원은 아니다", () => {
    const succMort = base(SUCC, MKT, MORT, STDIN);
    expect(bgSuccessorRightStdForced(succMort, "2026-02-16")).toBe(true);
    expect(bgExpenseInputsUnused(succMort, false, "2026-02-16")).toBe(true);
    expect(bgSuccessorRightStdForced(succMort, "2023-02-27")).toBe(false);
    expect(bgExpenseInputsUnused(succMort, false, "2023-02-27")).toBe(false);
    expect(bgSuccessorRightStdForced(succMort, undefined)).toBe(false);
    expect(bgSuccessorRightStdForced(base(SUCC, MKT, SUPP, STDIN), "2026-02-16")).toBe(false);
    expect(bgSuccessorRightStdForced(base(ORIG, MKT, MORT, STDIN), "2026-02-16")).toBe(false);
    // 원조합원도 «열거 시기»에는 든다(⑧이 막는 근거) — 강제(계산)와 열거는 다르다.
    expect(bgRtmiParenEnumerated(base(ORIG, MKT, MORT), "2026-02-16")).toBe(true);
  });
});
