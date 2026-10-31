/**
 * anchor — 부담부증여 비보충 승자(담보 §66 · 임대 §61⑤)를 계산하지 않는 자산(조합원입주권 · 겸용주택)의 ⑧ 안내 문구 · 입주권 ⑧ ⊇ ⑫.
 *
 * 종전에는 세 종류(지분 보유 포함) 모두 「이 경우의 취득가액 산정 기준을 확인하지 못했습니다」였다. 실제 사유는 종류마다 다르다:
 *  · 조합원입주권 — 「소득세법 시행령」 제159조 제1항 제1호 괄호가 취득가액을 기준시가로 정하는데 입주권의 기준시가(같은 영 제165조 제1항) 입력 경로가 없다
 *    (엔진 `burdened-gift-apportionment.ts` fail-fast).
 *  · 겸용주택 — 담보·임대 평가액을 주택과 상가로 나눌 법정 기준이 없다(엔진 MB-7 · 함께 양도는 MB-6).
 *  · 지분 보유 — 주택은 S-2가 열었다(`transfer.route.bg-axis-a-nonsupp-win.anchor.test.ts`). 주택 외 지분의 문구는 그 anchor가 단언한다.
 * 또 하나: 기준시가 모드 입주권 단건의 담보·임대 승은 ⑧이 통과시키고 ⑫가 400으로 막았다(⑧ ⊉ ⑫) — ⑧이 같은 사유로 앞서 막는다.
 *
 * · NR-1 묶음 승자 게이트 문구 — 종류 2 × (기준시가 모드 담보 · 기준시가 모드 임대 · 시가 모드 담보).
 * · NR-2 입주권 단건 — 기준시가 모드 담보·임대 승: ⑧ 차단 ∧ ⑫ 400(⑧ ⊇ ⑫) · 시가 모드 담보 승: ⑧ 차단 문구 · 보충적평가 승은 ⑧ 통과 ∧ ⑫ 200(안전망).
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

const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };



const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const GATE = "함께 양도와 같이 계산하지 않습니다";
const OLD = "취득가액 산정 기준을 확인하지 못했습니다";
const RTMI_CAUSE = "조합원입주권의 기준시가(같은 영 제165조 제1항) 입력 경로가 없어 계산하지 않습니다";
const MIXED_CAUSE = "증여가액을 주택과 상가로 나눌 법정 기준이 없어 계산하지 않습니다";
/** allIssues는 80자로 자르므로 전체 메시지를 직접 모은다. */
const full = (f: TransferFormData) => { const out: string[] = []; for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) out.push(i.message); return out; };

type Mode = "std" | "mkt";
type Win = "mortgage" | "rental";
const WINS = {
  mortgage: x({ bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3,000,000,000", bgMortgageSetAmount: "3,000,000,000" }),
  rental: x({ bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" }),
};
const housing = (id: number, mode: Mode, win: Win | "supp", ...over: Partial<AssetForm>[]): AssetForm => {
  const w = win === "supp" ? x({ bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "200000000" }) : WINS[win];
  return Object.assign({ ...makeDefaultAsset(id) }, x({
    assetId: `h${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000",
    standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", useEstimatedAcquisition: false, transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
    bgValuationMode: mode === "std" ? "sangjeungbeop_standard" : "sangjeungbeop_market",
    ...(mode === "mkt" ? { bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000" } : {}),
  }), w, ...over) as AssetForm;
};
/** 원조합원 입주권 — 기존 `transfer.sidebar-burdened-gift-sale.anchor`의 완성 시료. */
const rtmi = (mode: Mode, win: Win | "supp", ...over: Partial<AssetForm>[]): AssetForm => {
  // 입주권의 보충적평가액(권리가액 합 수준)을 넘기려면 임대는 보증금이 커야 임대 승이 된다.
  const w = win === "supp" ? x({ bgMortgageDebtAmount: "600,000,000" }) : win === "rental" ? x({ ...WINS.rental, bgLendingDepositTotal: "3,000,000,000" }) : WINS[win];
  return Object.assign({ ...makeDefaultAsset(2) }, x({
    assetId: "o", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right",
    acquisitionCause: "purchase", acquisitionDate: "2009-07-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
    bgValuationMode: mode === "std" ? "sangjeungbeop_standard" : "sangjeungbeop_market", ...(mode === "mkt" ? { bgMarketValueAtTransfer: "1500000000" } : {}),
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    bgActualAcquisitionTotal: "300,000,000", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevOriginalAssetType: "housing", redevRightsValue: "900,000,000", redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000",
    redevPreApprovalExpenses: "0", useEstimatedAcquisition: false, standardPriceAtAcq: "", standardPriceAtTransfer: "",
  }), w, ...over) as AssetForm;
};
const bundle = (assets: AssetForm[]): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }) as TransferFormData;
const single = (a: AssetForm): TransferFormData => Object.assign(createDefaultTransferFormData(), FORM, { assets: [a], contractTotalPrice: "" }) as TransferFormData;
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const SECOND = {
  입주권: (mode: Mode, win: Win) => rtmi(mode, win),
  겸용: (mode: Mode, win: Win) => housing(2, mode, win, x({ isMixedUseHouse: true })),
} as const;
const CELLS = (["입주권", "겸용"] as const).flatMap((k) => ([["std", "mortgage"], ["std", "rental"], ["mkt", "mortgage"]] as const).map(([mode, win]) => ({ k, mode, win })));

describe("NR-1 묶음 승자 게이트 — 종류별 실제 사유", () => {
  it.each(CELLS)("$k · $mode · $win", ({ k, mode, win }) => {
    const msgs = full(bundle([housing(1, mode, win), SECOND[k](mode, win)])).filter((m) => m.includes(GATE));
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain(`${k === "입주권" ? "조합원입주권" : "겸용주택"} 자산은`);
    if (k === "입주권") { expect(msgs[0]).toContain(RTMI_CAUSE); expect(msgs[0]).not.toContain(OLD); }
    if (k === "겸용") { expect(msgs[0]).toContain(MIXED_CAUSE); expect(msgs[0]).not.toContain(OLD); }
  });
});

describe("NR-2 조합원입주권 단건 — ⑧ ⊇ ⑫", () => {
  it.each([["std", "mortgage"], ["std", "rental"]] as const)("기준시가 모드 %s·%s 승: ⑧ 차단 ∧ ⑫ 400 (종전 ⑧ 통과)", async (mode, win) => {
    const f = single(rtmi(mode, win));
    const msgs = full(f).filter((m) => m.includes(RTMI_CAUSE));
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain(win === "mortgage" ? "담보평가액" : "임대료 환산액");
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain("조합원입주권의 기준시가(같은 영 제165조 제1항) 입력 경로가 없어");
  });
  it("시가 모드 담보 승: ⑧ 차단 문구가 실제 사유를 말한다", () => {
    const msgs = full(single(rtmi("mkt", "mortgage"))).filter((m) => m.includes("담보평가액"));
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain("이 시가보다 커서 증여가액이 담보평가액이 됩니다");
    expect(msgs[0]).toContain(RTMI_CAUSE);
    expect(msgs[0]).not.toContain(OLD);
  });
  it.each(["std", "mkt"] as const)("보충적평가 승(%s): ⑧ 통과 ∧ ⑫ 200 — 막지 않았다는 안전망", async (mode) => {
    const f = single(rtmi(mode, "supp"));
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
  });
});
