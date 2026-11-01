/**
 * anchor — **함께 양도 묶음의 조합원입주권 담보·임대 승 ⑧ 게이트** (X-1). 실측: `docs/00-pm/bg-successor-rtmi-extend-measure.md` §2 C1~C3·D1·D5 · 상위 I-1 `bg-successor-rtmi-std-acq.plan.md`.
 *
 * 종전: 묶음 게이트(`transfer-tax-validate.ts`)가 입주권의 비보충 승을 양도일·원조합원 여부와 무관하게 막았다. 그런데 엔진 값은 단건 합과 ±0이다(주택 단건 + 입주권 단건).
 * 이후: 지분 100% 입주권은 (a) 열거 이전(실지)이면 승계·원조합원 모두 (b) 열거 이후면 승계만 계산한다. 원조합원 열거 이후(H-2 대기)·지분 < 1(X-2·X-3)은 계속 막는다.
 *
 * 오라클(손계산, 양도가액 = 채무): 주택 담보 승 = 30억 − 취득시 기준시가 5억 − 개산공제 3% 1,500만 = 2,485,000,000 ·
 *   승계 입주권 담보 승(열거 이후) = 30억 − 3억 − 300만 = 2,697,000,000 · 열거 이전 = 30억 − 실지 4억 = 2,600,000,000 ·
 *   원조합원 열거 이전 = 30억 − (실지 3억 + 청산금 2억) = 2,500,000,000 · 임대(기준시가 모드) 주택 = 30억 − 3.75억 − 1,125만 = 2,613,750,000 / 입주권 2,772,750,000.
 *
 * · BG-1 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 합계 = 단건 합.
 * · BG-2 범위 — 원조합원 열거 이후는 ⑧ 차단 ∧ ⑫ 400(유지) · 열거 이전 원조합원은 통과 · 지분 50% 입주권 묶음은 차단(X-2).
 * · BG-3 입력 요구 정합 ⑧ ⊇ ⑫ — 기준시가 2칸 비움: ⑧ 1건 ∧ ⑫ 400 · 승계취득가액 비움: ⑧·⑫ 통과 · 열거 이전 승계취득가액 비움: ⑧ 차단(⑫는 막지 않는다 — 아래 «확인 필요»).
 * · BG-4 혼합 승자는 종전대로 ⑧·⑫ 모두 막는다.
 * · BG-5 술어 진리표 `bgRtmiBundleWinnerComputable` + 경계일.
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
import { bgRtmiBundleWinnerComputable } from "@/lib/calc/bg-rtmi-std-acq";

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
const house = (over: Record<string, unknown> = {}) => Object.assign({ ...makeDefaultAsset(1) }, x({
  assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3,000,000,000", bgMortgageSetAmount: "3,000,000,000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", ...over,
})) as AssetForm;
const houseRent = () => house({ bgValuationMode: "sangjeungbeop_standard", bgLendingDepositTotal: "3,000,000,000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" });
const cmp = (assets: AssetForm[], date = "2026-02-16") => form(assets, date, { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "9000000000" });
const gate = (f: TransferFormData) => full(f).filter((i) => i.message.includes("함께 양도와 같이 계산하지 않습니다"));
const second = x({ assetId: "o2", addressJibun: "서울 강남구 테스트동 8-8" });

describe("BG-1 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 합계 = 단건 합", () => {
  it.each([
    ["주택 + 승계 입주권 · 시가 · 담보", () => cmp([house(), base(SUCC, MKT, MORT, STDIN)]), 5_182_000_000],
    ["주택 + 승계 입주권 · 기준시가 · 임대", () => cmp([houseRent(), base(SUCC, STD, RENT, STDIN)]), 5_386_500_000],
    ["승계 입주권 2건 · 시가 · 담보", () => cmp([base(SUCC, MKT, MORT, STDIN), base(SUCC, second, MKT, MORT, STDIN)]), 5_394_000_000],
    ["주택 + 승계 입주권 · 열거 이전 2023-02-27 · 담보(실지)", () => cmp([house(), base(SUCC, MKT, MORT, STDIN)], "2023-02-27"), 5_085_000_000],
    ["주택 + 원조합원 입주권 · 열거 이전 2023-02-27 · 담보(실지)", () => cmp([house(), base(ORIG, MKT, MORT)], "2023-02-27"), 4_985_000_000],
  ] as const)("%s", async (_n, mk, g) => {
    const f = mk();
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gainAny(r)).toBe(g);
  });
});

describe("BG-2 범위 — 원조합원 열거 이후·지분 < 1은 계속 막는다", () => {
  it("원조합원 열거 이후: 묶음 게이트가 원조합원 사유로 막는다 ∧ ⑫ 400", async () => {
    const f = cmp([house(), base(ORIG, MKT, MORT, STDIN)]);
    const m = gate(f);
    expect(m.length).toBe(1);
    expect(m[0].message).toContain("조합원입주권 자산은");
    expect(m[0].message).toContain("원조합원 입주권의 기준시가");
    expect((await post(f)).status).toBe(400);
  });
  it("지분 50% 승계 입주권 묶음: 게이트가 막는다(X-2) — 문구는 «지분을 가진 입주권»", () => {
    const f = cmp([house(), base(SUCC, MKT, x({ bgMortgageDebtAmount: "1,500,000,000", bgMortgageSetAmount: "1,500,000,000" }), STDIN, x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" }))]);
    const m = gate(f);
    expect(m.length).toBe(1);
    expect(m[0].message).toContain("지분을 가진 입주권은 확인하지 못했습니다");
    expect(m[0].message).not.toContain("함께 양도 묶음");
  });
});

describe("BG-3 입력 요구 정합 — ⑧ ⊇ ⑫", () => {
  it("열거 이후 승계 · 기준시가 2칸 비움: ⑧ 1건(successorRightStdPaidAtAcq) ∧ ⑫ 400 — 게이트 사유는 더 이상 없다", async () => {
    const f = cmp([house(), base(SUCC, MKT, MORT)]);
    expect(gate(f)).toEqual([]);
    const m = full(f);
    expect(m.length).toBe(1);
    expect(m[0].field).toBe("successorRightStdPaidAtAcq");
    expect((await post(f)).status).toBe(400);
  });
  it("열거 이후 승계 · 승계취득가액·추가분담금·실지취득가액 비움: ⑧ 통과 ∧ ⑫ 200 (쓰이지 않는 값)", async () => {
    const f = cmp([house(), base(SUCC, MKT, MORT, STDIN, x({ successorRightAcqPrice: "", successorRightAddedContribution: "", bgActualAcquisitionTotal: "" }))]);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gainAny(r)).toBe(5_182_000_000);
  });
  it("열거 이전 승계 · 승계취득가액 비움: 실지가 쓰이므로 ⑧이 막는다(종전 — I-1 SR-3과 같다)", () => {
    const f = cmp([house(), base(SUCC, MKT, MORT, STDIN, x({ successorRightAcqPrice: "", successorRightAddedContribution: "", bgActualAcquisitionTotal: "" }))], "2023-02-27");
    expect(full(f).length).toBeGreaterThan(0);
  });
});

describe("BG-4 혼합 승자는 종전대로 막는다", () => {
  it("주택 담보 · 입주권 보충: ⑧ 1건 ∧ ⑫ 400", async () => {
    const f = cmp([house(), base(SUCC, MKT, SUPP, STDIN)]);
    expect(full(f).length).toBe(1);
    expect((await post(f)).status).toBe(400);
  });
});

describe("BG-5 술어 진리표 · 경계일", () => {
  const at = (mode: "mortgage" | "rental", date: string | undefined, a: AssetForm) => bgRtmiBundleWinnerComputable(a, mode, date);
  it("승계: 열거 이전·이후 모두 계산 · 원조합원: 열거 이전만", () => {
    const s = base(SUCC, MKT, MORT, STDIN);
    const o = base(ORIG, MKT, MORT);
    expect(at("mortgage", "2023-02-27", s)).toBe(true);
    expect(at("mortgage", "2023-02-28", s)).toBe(true);
    expect(at("mortgage", "2023-02-27", o)).toBe(true);
    expect(at("mortgage", "2023-02-28", o)).toBe(false);
    expect(at("rental", "2020-02-10", o)).toBe(true);
    expect(at("rental", "2020-02-11", o)).toBe(false);
    expect(at("rental", "2020-02-11", s)).toBe(true);
  });
  it("양도일 없음·지분 < 1·입주권 아님은 계산 대상이 아니다(막는다)", () => {
    const s = base(SUCC, MKT, MORT, STDIN);
    expect(at("mortgage", undefined, s)).toBe(false);
    expect(at("mortgage", "2026-02-16", base(SUCC, x({ ownershipNumerator: "50", ownershipDenominator: "100" })))).toBe(false);
    expect(at("mortgage", "2026-02-16", house())).toBe(false);
  });
  it.each([
    ["담보 2023-02-27", "2023-02-27", 5_085_000_000],
    ["담보 2023-02-28", "2023-02-28", 5_182_000_000],
  ] as const)("묶음 경계 %s", async (_n, date, g) => {
    const f = cmp([house(), base(SUCC, MKT, MORT, STDIN)], date);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(gainAny(r)).toBe(g);
  });
});
