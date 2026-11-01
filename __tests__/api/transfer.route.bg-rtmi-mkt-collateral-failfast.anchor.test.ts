/**
 * anchor — 조합원입주권 부담부증여 **시가 모드 × 담보(상증법 §66) 승 × 양도일 2023.2.28. 이후**의 엔진 fail-fast 대칭 (I-0).
 * 계획서 `docs/00-pm/bg-rtmi-mkt-collateral-failfast.plan.md` · 상위 `bg-nonsupp-winner-support.plan.md` §4.2.1 · 사용자 결정 Q-1(착수 순서 … I-0 → I-1 …) · Q-I1 채택.
 *
 * 종전: 기준시가 모드에서 입주권의 담보·임대 승은 엔진이 400으로 막는다(`burdened-gift-apportionment.ts` fail-fast — 괄호가 취득가액을 기준시가로 정하는데 입주권의 기준시가
 * (소령 §165①) 입력 경로가 없다). 같은 사실(담보평가액이 C)을 시가 모드로 넣으면 엔진이 입주권을 괄호 발동에서 빼 **실지취득가액(K-4)으로 계산**했다 — 같은 입력이 모드에 따라
 * 막히기도 하고 실지로 계산되기도 했다(⑧은 #2788부터 두 모드 모두 막는다 — API 직접 호출에서만 드러나는 비대칭).
 * 법문은 명확하다: 소령 §159①1호 A 괄호는 2023.2.28.부터 양도가액을 §66으로 산정한 경우를 열거한다(`BG_PAREN_MORTGAGE_66_FROM`).
 *
 * ※ I-1(`bg-successor-rtmi-std-acq.plan.md`)이 이 fail-fast를 승계 입주권에서는 «취득시 입주권 기준시가 요구»로 교체했다 — 이 anchor의 400은 원조합원(질의 H-2 대기)과 승계의 기준시가 칸 비움이다.
 * · RT-1 양도일 2023.2.28. 이후 시가 모드 담보 승: ⑫ 400(기준시가 모드와 같은 중단 사유) · 종전 값은 실지(K-4) 양도차익 2,500,000,000(`bg-nonsupp-winner-support.plan.md` §3.2 실측).
 * · RT-2 양도일 2023.2.28. 이전은 종전 그대로 실지(K-4)로 계산한다(열거에 §66 없음) — 경계 하루 전·당일.
 * · RT-3 안전망 — 보충 승(시가 모드)·기준시가 모드 보충 승은 계속 200 · 기준시가 모드 담보 승은 종전부터 400(같은 사유 문구).
 * · RT-4 ⑧ ⊇ ⑫ — ⑧은 이미 시가 모드 담보 승 입주권을 막는다(#2788).
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

/** 원조합원 입주권 — 평가 3항 12억+2억+1억 = 15억 · 취득 2009-07-01 · 종전 실지 3억 (`bg-nonsupp-winner-reason` 완성 시료). */
const rtmi = (mode: "std" | "mkt", debt: string, ...over: Partial<AssetForm>[]): AssetForm =>
  Object.assign({ ...makeDefaultAsset(2) }, x({
    assetId: "o", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right",
    acquisitionCause: "purchase", acquisitionDate: "2009-07-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
    bgValuationMode: mode === "std" ? "sangjeungbeop_standard" : "sangjeungbeop_market", ...(mode === "mkt" ? { bgMarketValueAtTransfer: "1500000000" } : {}),
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    bgActualAcquisitionTotal: "300,000,000", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevOriginalAssetType: "housing", redevRightsValue: "900,000,000", redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000",
    redevPreApprovalExpenses: "0", useEstimatedAcquisition: false, standardPriceAtAcq: "", standardPriceAtTransfer: "",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: debt, bgMortgageSetAmount: debt,
  }), ...over) as AssetForm;
const form = (a: AssetForm, transferDate: string) => Object.assign(createDefaultTransferFormData(), FORM, { transferDate, assets: [a], contractTotalPrice: "" }) as TransferFormData;
const full = (f: TransferFormData) => { const out: string[] = []; for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) out.push(i.message); return out; };
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const gain = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const MORT = "3,000,000,000"; // 담보 30억 > 보충적평가 15억 → 담보 승 (채무비율 1)
const SUPP = "600,000,000"; // 채무 6억 < 15억 → 보충 승

describe("RT-1 양도일 2023.2.28. 이후 — 시가 모드 담보 승 입주권은 기준시가 모드와 같이 400", () => {
  it("시가 모드(원조합원): ⑫ 400 · 사유 문구가 원조합원 입주권 기준시가의 불명확을 말한다(I-1 이후 — 승계는 계산한다)", async () => {
    const r = await post(form(rtmi("mkt", MORT), "2026-02-16"));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(400);
    const m = JSON.stringify(r.j);
    expect(m).toContain("원조합원 입주권의 기준시가");
    expect(m).toContain("담보(§66) 평가로 결정됐습니다");
  });
  it("기준시가 모드 담보 승은 종전부터 400 — 같은 사실이 두 모드에서 같게 막힌다", async () => {
    const r = await post(form(rtmi("std", MORT), "2026-02-16"));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain("원조합원 입주권의 기준시가");
  });
  it("경계 당일(2023-02-28)부터 막는다", async () => {
    expect((await post(form(rtmi("mkt", MORT), "2023-02-28"))).status).toBe(400);
  });
});

describe("RT-2 양도일 2023.2.28. 이전 — 종전 그대로 실지(K-4)로 계산한다", () => {
  it("2023-02-27(경계 하루 전): 200 · 양도차익 2,500,000,000 (30억 − 실지 3억 − 청산금 납부 2억 = 25억 · 종전 실측과 같다)", async () => {
    const r = await post(form(rtmi("mkt", MORT), "2023-02-27"));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gain(r)).toBe(2_500_000_000);
  });
  it("2022-06-01도 같다", async () => {
    const r = await post(form(rtmi("mkt", MORT), "2022-06-01"));
    expect(r.status).toBe(200);
    expect(gain(r)).toBe(2_500_000_000);
  });
});

describe("RT-3 안전망 — 막지 않아야 할 것", () => {
  it.each([["시가 모드 보충 승", "mkt"], ["기준시가 모드 보충 승", "std"]] as const)("%s: 200", async (_n, mode) => {
    const r = await post(form(rtmi(mode, SUPP), "2026-02-16"));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
  });
  it("승계 입주권도 같은 판정 — 시가 모드 담보 승이면 400(원조합원과 같은 사유)", async () => {
    const succ = rtmi("mkt", MORT, x({ isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", acquisitionDate: "2020-01-01", bgActualAcquisitionTotal: "400,000,000" }));
    const r = await post(form(succ, "2026-02-16"));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(400);
  });
});

describe("RT-4 ⑧ ⊇ ⑫ — 화면은 이미 막고 있다(#2788)", () => {
  it("시가 모드 담보 승 입주권: ⑧ 1건 차단(담보평가액 사유) ∧ ⑫ 400", async () => {
    const f = form(rtmi("mkt", MORT), "2026-02-16");
    const m = full(f).filter((t) => t.includes("담보평가액"));
    expect(m.length).toBe(1);
    expect((await post(f)).status).toBe(400);
  });
});
