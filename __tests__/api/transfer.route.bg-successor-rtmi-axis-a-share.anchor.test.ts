/**
 * anchor — **공유 지분(축 A) 승계 조합원입주권 부담부증여 × 담보(상증법 §66)·임대(§61⑤) 승** (X-2). 실측 `docs/00-pm/bg-successor-rtmi-extend-measure.md` A1~A5·BS · 계획서 `bg-successor-rtmi-axis-a-share.plan.md`.
 *
 * 종전: ⑧이 시가 모드 지분 담보 승을 막았고(A1), 기준시가 모드는 ⑧이 통과하는데 ⑫(엔진)가 «기준시가를 입력하세요» 400이었다(A2n — ⑤ 칸이 없는 막다른 길).
 * 이후: `bgSuccessorRightStdForced`가 축 A(`isFractionalSplit === false`)에서 켜진다 → ⑤ 기준시가 2칸 · ⑧ (5-c‴) 요구 · 승계취득가액 면제가 단건과 같다.
 * 취득가액 = 입주권 기준시가(물건 전체 입력) × 지분 × 채무비율, 개산공제 1%. 채무는 본인 인수분을 입력한다(축 A 규약).
 *
 * 시료: 지분 50%(제3자 공유) · 평가 3항 15억(물건 전체) · 담보 본인분 15억 · 시가 15억(물건 전체 → 본인분 7.5억) · 기준시가 3억(물건 전체) · 양도일 2026-02-16.
 * 오라클(손계산, 양도가액 = 채무 = 본인분):
 *   · 담보 승: 15억 − 3억 × 0.5 × 1 = 1.5억 − 개산공제 1.5억 × 1% = 150만 → **1,348,500,000**
 *   · 임대 승(본인분 보증금 15억 + 연 6천만 → 환산 15억 + 6천만 ÷ 0.12 = 20억 · 비율 15억/20억 = 0.75): 15억 − 3억 × 0.5 × 0.75 = 1.125억 − 112.5만 → **1,386,375,000**
 *   · 열거 이전(2023-02-27) 담보: 15억 − 실지 4억 × 0.5 × 1 = 2억 → **1,300,000,000**
 *   · 보충 승(본인분 3억): 3억 − 실지 4억 × 0.5 × (3억/7.5억 = 0.4) = 8천만 → **220,000,000** (불변)
 *   · 묶음 — 주택(100%) 2,485,000,000 + 승계 지분 1,348,500,000 = **3,833,500,000** · 주택(50%, 본인분 15억) 1,242,500,000 + 승계 지분 = **2,591,000,000**
 *
 * · XA-1 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클 ∧ 취득가액·개산공제.
 * · XA-2 입력 요구 정합 ⑧ ⊇ ⑫ — 기준시가 2칸 비움: ⑧ 1건 ∧ ⑫ 400 · 승계취득가액 비움: ⑧·⑫ 통과 · 열거 이전 실지 비움: ⑧ 차단 ∧ ⑫ 400.
 * · XA-3 범위 — 원조합원 열거 이후 ⑧ 차단 ∧ ⑫ 400 · 원조합원 열거 이전 지분은 막는다(청산금 규약 불명). 축 B는 X-3이 열었다.
 * · XA-4 함께 양도 묶음 — 승계 지분 입주권 포함 균일 승자 묶음이 ⑧ 통과 ∧ 단건 합.
 * · XA-5 술어 진리표.
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
import { bgSuccessorRightStdForced, bgRtmiShareWinnerComputable } from "@/lib/calc/bg-rtmi-std-acq";
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


const gainAny = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const SHARE = x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
const M15 = x({ bgMortgageDebtAmount: "1,500,000,000", bgMortgageSetAmount: "1,500,000,000" });
const R15 = x({ bgLendingDepositTotal: "1,500,000,000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "60000000" });
const S3 = x({ bgMortgageDebtAmount: "300,000,000", bgMortgageSetAmount: "300,000,000" });
const BLK = x({ successorRightAcqPrice: "", successorRightAddedContribution: "", bgActualAcquisitionTotal: "" });
const house = (over: Record<string, unknown> = {}) => Object.assign({ ...makeDefaultAsset(1) }, x({
  assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3,000,000,000", bgMortgageSetAmount: "3,000,000,000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", ...over,
})) as AssetForm;
const cmp = (assets: AssetForm[], date = "2026-02-16") => form(assets, date, { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "9000000000" });
const gate = (f: TransferFormData) => full(f).filter((i) => i.message.includes("함께 양도와 같이 계산하지 않습니다"));

describe("XA-1 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클", () => {
  it.each([
    ["시가 · 담보", [MKT, M15, STDIN], "2026-02-16", 1_348_500_000, "standard_price", 150_000_000, 1_500_000],
    ["기준시가 · 담보", [STD, M15, STDIN], "2026-02-16", 1_348_500_000, "standard_price", 150_000_000, 1_500_000],
    ["기준시가 · 임대", [STD, R15, STDIN], "2026-02-16", 1_386_375_000, "standard_price", 112_500_000, 1_125_000],
    ["시가 · 담보 · 열거 이전 2023-02-27(실지)", [MKT, M15, STDIN], "2023-02-27", 1_300_000_000, "actual", 200_000_000, 0],
    ["시가 · 보충 승(불변)", [MKT, S3, STDIN], "2026-02-16", 220_000_000, "actual", 80_000_000, 0],
  ] as const)("%s", async (_n, over, date, g, method, acq, ded) => {
    const f = form([base(SUCC, ...over, SHARE)], date);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gain(r)).toBe(g);
    const b = bgOf(r);
    expect(b.acquisitionMethodUsed).toBe(method);
    expect(b.perAsset.building.acquisitionPrice).toBe(acq);
    expect(b.perAsset.building.estimatedDeduction).toBe(ded);
  });
});

describe("XA-2 입력 요구 정합 — ⑧ ⊇ ⑫", () => {
  it.each([["시가 · 담보", MKT], ["기준시가 · 담보", STD]] as const)("기준시가 2칸 비움 — %s: ⑧ 1건(successorRightStdPaidAtAcq) ∧ ⑫ 400 (종전: 기준시가 모드는 ⑧ 통과 ∧ ⑫ 400 막다른 길)", async (_n, mode) => {
    const f = form([base(SUCC, mode, M15, SHARE)]);
    const m = full(f);
    expect(m.length).toBe(1);
    expect(m[0].field).toBe("successorRightStdPaidAtAcq");
    expect((await post(f)).status).toBe(400);
  });
  it("승계취득가액·추가분담금·실지취득가액을 비워도 ⑧ 통과 ∧ ⑫ 200 (쓰이지 않는 값)", async () => {
    const f = form([base(SUCC, MKT, M15, STDIN, SHARE, BLK)]);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gain(r)).toBe(1_348_500_000);
  });
  it("열거 이전 · 실지 칸 비움: ⑧ 차단 ∧ ⑫ 400 (실지가 쓰인다)", async () => {
    const f = form([base(SUCC, MKT, M15, STDIN, SHARE, BLK)], "2023-02-27");
    expect(full(f).length).toBeGreaterThan(0);
    expect((await post(f)).status).toBe(400);
  });
});

describe("XA-3 범위 — 원조합원은 계속 막는다", () => {
  it.each([["시가", MKT], ["기준시가", STD]] as const)("원조합원 열거 이후 — %s · 담보: ⑧ 원조합원 사유 ∧ ⑫ 400", async (_n, mode) => {
    const f = form([base(ORIG, mode, M15, STDIN, SHARE)]);
    const m = full(f);
    expect(m.length).toBe(1);
    expect(m[0].message).toContain("원조합원 입주권의 기준시가");
    expect((await post(f)).status).toBe(400);
  });
  it("원조합원 열거 이전 지분 · 시가 담보: ⑧ 차단 (⑫는 200이지만 청산금이 지분만큼 줄지 않아 입력 규약이 불명 — 계획서 §3)", () => {
    const f = form([base(ORIG, MKT, M15, SHARE)], "2023-02-27");
    expect(full(f).length).toBeGreaterThan(0);
  });
});

describe("XA-4 함께 양도 묶음 — 승계 지분 입주권 포함", () => {
  it.each([
    ["주택(100%) + 승계 지분 50%", () => cmp([house(), base(SUCC, MKT, M15, STDIN, SHARE)]), 3_833_500_000],
    ["주택(50%) + 승계 지분 50%", () => cmp([house({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", bgMortgageDebtAmount: "1,500,000,000", bgMortgageSetAmount: "1,500,000,000" }), base(SUCC, MKT, M15, STDIN, SHARE)]), 2_591_000_000],
  ] as const)("%s", async (_n, mk, g) => {
    const f = mk();
    expect(gate(f)).toEqual([]);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gainAny(r)).toBe(g);
  });
  it("기준시가 2칸 비움: ⑧ 1건 ∧ ⑫ 400", async () => {
    const f = cmp([house(), base(SUCC, MKT, M15, SHARE)]);
    expect(full(f).length).toBe(1);
    expect((await post(f)).status).toBe(400);
  });
});

describe("XA-5 술어 진리표", () => {
  it("bgSuccessorRightStdForced — 축 A(false)에서 지분 < 1도 켜지고 축 미지정(undefined)은 꺼진다 (축 B true는 X-3이 켠다)", () => {
    const a = base(SUCC, MKT, M15, STDIN, SHARE);
    expect(bgSuccessorRightStdForced(a, "2026-02-16", false)).toBe(true);
    expect(bgSuccessorRightStdForced(a, "2026-02-16", undefined)).toBe(false);
    expect(bgSuccessorRightStdForced(a, "2023-02-27", false)).toBe(false);
    expect(bgSuccessorRightStdForced(base(ORIG, MKT, M15, STDIN, SHARE), "2026-02-16", false)).toBe(false);
    expect(bgSuccessorRightStdForced(base(SUCC, MKT, MORT, STDIN), "2026-02-16", undefined)).toBe(true);
  });
  it("bgRtmiShareWinnerComputable — 지분 < 1 승계만(양도일 필요)", () => {
    expect(bgRtmiShareWinnerComputable(base(SUCC, SHARE), "2026-02-16")).toBe(true);
    expect(bgRtmiShareWinnerComputable(base(SUCC, SHARE), "2023-02-27")).toBe(true);
    expect(bgRtmiShareWinnerComputable(base(SUCC, SHARE), undefined)).toBe(false);
    expect(bgRtmiShareWinnerComputable(base(ORIG, SHARE), "2023-02-27")).toBe(false);
    expect(bgRtmiShareWinnerComputable(base(SUCC), "2026-02-16")).toBe(false);
    expect(bgRtmiShareWinnerComputable(house(), "2026-02-16")).toBe(false);
  });
  it("⑤ 필요경비 칸 숨김 술어(bgExpenseInputsUnused) — 축 A 지분 승계 입주권 기준시가 강제도 «개산공제만»", () => {
    expect(bgExpenseInputsUnused(base(SUCC, MKT, M15, STDIN, SHARE), false, "2026-02-16")).toBe(true);
  });
});
