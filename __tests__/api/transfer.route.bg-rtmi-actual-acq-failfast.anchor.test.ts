/**
 * anchor — **조합원입주권 부담부증여 실지취득가액 미입력 ⑫ fail-fast** (열거 이전·보충 승 등 취득가액이 실지인 경로). 상위 `bg-successor-rtmi-bundle-gate.plan.md` §3 · `bg-successor-rtmi-axis-b.plan.md` §4.
 *
 * 종전: 입주권은 K-4 고정(실지취득가액 × 채무비율)인데 ⑫가 값을 요구하는 곳은 «단건 시가 모드»뿐이었다. 기준시가 모드 단건·함께 양도 묶음·축 B 카드는 ⑧이 막아도 ⑫는
 * 취득가액 0으로 200이었다(양도차익 과대 — 막히지 않는 오답). 엔진(`burdened-gift-acquisition.ts` K-4)이 입주권의 총액 ≤ 0을 중단한다.
 *
 * 오라클: 입력을 비웠을 때 종전 200 값 — 단건 기준시가 열거 이전 3,000,000,000(= 양도가액, 취득가액 0) · 묶음 5,485,000,000(주택 2,485,000,000 + 입주권 3,000,000,000) · 축 B 카드 2 비움 2,760,000,000.
 * 정상 입력 값은 불변(I-1 SR-2 · X-1 BG-1 · X-3 XB-1이 덮는다).
 *
 * · ZF-1 비운 입력 — ⑧ 차단 ∧ ⑫ 400 + 엔진 메시지(⑧ ⊇ ⑫ 정합): 단건 기준시가 모드·보충 승·원조합원 · 묶음 · 축 B. ZF-1b 단건 시가 모드는 종전 Zod 400(불변).
 * · ZF-2 쓰이지 않는 경우는 막지 않는다 — 열거 이후 승계(기준시가 강제)는 실지 칸을 비워도 200.
 * · ZF-3 입력하면 그대로 계산된다.
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


const gainAny = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const BLK = x({ successorRightAcqPrice: "", successorRightAddedContribution: "", bgActualAcquisitionTotal: "" });
const S2 = x({ successorRightStdPaidAtAcq: "150,000,000", successorRightStdPremiumAtAcq: "50,000,000" });
const house = () => Object.assign({ ...makeDefaultAsset(1) }, x({
  assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3,000,000,000", bgMortgageSetAmount: "3,000,000,000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
})) as AssetForm;
const cmp = (assets: AssetForm[], date: string) => form(assets, date, { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "9000000000" });
const card = (id: string, num: string, over: Partial<AssetForm>[] = []) => base(SUCC, x({ assetId: id, ownershipNumerator: num, ownershipDenominator: "100" }), ...over);
const axisB = (c1: Partial<AssetForm>[], c2: Partial<AssetForm>[], date: string) =>
  form([card("p", "60", c1), card("s2", "40", c2)], date, { assetSplitMode: "fractional", contractTotalPrice: "3000000000" });
const PRE = "2023-02-27";

describe("ZF-1 실지취득가액을 비우면 — ⑧ 차단 ∧ ⑫ 400 (종전: 기준시가 모드·묶음·축 B는 ⑫ 200 · 취득가액 0)", () => {
  it.each([
    ["단건 · 기준시가 모드 · 담보 · 열거 이전", () => form([base(SUCC, STD, MORT, STDIN, BLK)], PRE)],
    ["단건 · 기준시가 모드 · 보충 승 · 열거 이후", () => form([base(SUCC, STD, SUPP, STDIN, BLK)], "2026-02-16")],
    ["단건 · 원조합원 · 기준시가 모드 · 열거 이전(종전 부동산 실지취득가액 비움)", () => form([base(ORIG, STD, MORT, x({ bgActualAcquisitionTotal: "" }))], PRE)],
    ["묶음 · 시가 모드 · 담보 · 열거 이전", () => cmp([house(), base(SUCC, MKT, MORT, STDIN, BLK)], PRE)],
    ["축 B · 시가 모드 · 담보 · 열거 이전 · 카드 2 비움", () => axisB([MKT, MORT, STDIN], [BLK], PRE)],
  ] as const)("%s", async (_n, mk) => {
    const f = mk();
    expect(full(f).length, "⑧").toBeGreaterThan(0);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(400);
    expect(JSON.stringify(r.j)).toContain("조합원입주권의 취득가액은 실지취득가액을 입력해야 합니다");
  });
});

describe("ZF-1b 단건 시가 모드는 종전부터 ⑫ Zod가 먼저 막는다 (불변 — 메시지만 다르다)", () => {
  it("열거 이전 · 담보: ⑧ 차단 ∧ ⑫ 400 «실지취득가액이 필요합니다»", async () => {
    const f = form([base(SUCC, MKT, MORT, STDIN, BLK)], PRE);
    expect(full(f).length).toBeGreaterThan(0);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain("실지취득가액이 필요합니다");
  });
});

describe("ZF-2 쓰이지 않는 경우는 막지 않는다", () => {
  it("열거 이후 승계 담보 승(기준시가 강제): 실지 칸을 비워도 ⑧ 통과 ∧ ⑫ 200", async () => {
    for (const mode of [MKT, STD]) {
      const f = form([base(SUCC, mode, MORT, STDIN, BLK)], "2026-02-16");
      expect(full(f)).toEqual([]);
      const r = await post(f);
      expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
      expect(gainAny(r)).toBe(2_697_000_000);
    }
  });
});

describe("ZF-3 입력하면 그대로 계산된다 (불변)", () => {
  it.each([
    ["단건 기준시가 모드 · 열거 이전", () => form([base(SUCC, STD, MORT, STDIN)], PRE), 2_600_000_000],
    ["묶음 시가 모드 · 열거 이전", () => cmp([house(), base(SUCC, MKT, MORT, STDIN)], PRE), 5_085_000_000],
    ["축 B 시가 모드 · 열거 이전", () => axisB([MKT, MORT, STDIN], [], PRE), 2_600_000_000],
    ["원조합원 단건 기준시가 모드 · 열거 이전", () => form([base(ORIG, STD, MORT)], PRE), 2_500_000_000],
  ] as const)("%s", async (_n, mk, g) => {
    const f = mk();
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gainAny(r)).toBe(g);
  });
});
