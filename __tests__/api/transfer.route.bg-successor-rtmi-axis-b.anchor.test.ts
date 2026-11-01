/**
 * anchor — **같은 물건 지분 분할 취득(축 B) 승계 조합원입주권 부담부증여 × 담보(상증법 §66)·임대(§61⑤) 승** (X-3). 실측 `docs/00-pm/bg-successor-rtmi-extend-measure.md` B1~B5 · 계획서 `bg-successor-rtmi-axis-b.plan.md`.
 *
 * 종전: 시가 모드는 ⑧ 차단, 기준시가 모드는 ⑧ 통과 ∧ ⑫ 400(카드 2의 «취득일 기준시가» 칸이 없는 막다른 길).
 * 이후: 승계 카드마다 자기 취득 시점의 입주권 기준시가 2칸을 입력한다(물건 전체 기준 값). 취득가액 = Σ 지분 × 카드 기준시가 × 채무비율, 개산공제 1%. 채무·시가는 물건 전체 입력(축 B 규약).
 * 비주 카드는 ② 양도정보가 숨겨져 ⑤ 판정에 첫 카드의 부담부증여 값이 필요하다 → `bgRtmiShareJudgmentFields`가 주입한다(⑧은 `axisBEffectiveAsset`).
 *
 * 시료: 60/40 두 카드(둘 다 승계) · 평가 3항 15억 · 담보 30억(채무 30억) · 시가 15억 · 양도일 2026-02-16 · 카드 1 기준시가 3억(납입 2억+프리미엄 1억) · 카드 2 2억(1.5억+0.5억).
 * 오라클(손계산, 양도가액 = 채무 30억):
 *   · 담보 승: 취득가액 = 0.6×3억 + 0.4×2억 = 2.6억 − 개산공제 260만 → 30억 − 2.6억 − 260만 = **2,737,400,000** (시가·기준시가 모드 같다)
 *   · 카드 2도 3억: 30억 − 3억 − 300만 = **2,697,000,000** (단건과 같다)
 *   · 임대 승(환산 40억 · 비율 0.75): 취득가액 2.6억 × 0.75 = 1.95억 − 195만 → **2,803,050,000**
 *   · 열거 이전(2023-02-27, 카드마다 실지 4억): 30억 − 4억 = **2,600,000,000**
 *   · 보충 승: **440,000,000** (불변)
 *
 * · XB-1 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클.
 * · XB-2 입력 요구 정합 ⑧ ⊇ ⑫ — 카드 2(또는 카드 1) 기준시가 2칸 비움: ⑧ 1건 ∧ ⑫ 400 · 승계취득가액 비움: ⑧·⑫ 통과 · 열거 이전 실지 비움: ⑧ 차단.
 * · XB-3 범위 — 원조합원 카드(열거 이후)는 ⑧ 차단 ∧ ⑫ 400.
 * · XB-4 술어 · ⑤ 주입 — 비주 카드는 주입 없이는 승자를 몰라 칸이 닫힌다.
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
import { bgSuccessorRightStdForced, bgRtmiAxisBWinnerComputable, bgRtmiShareJudgmentFields } from "@/lib/calc/bg-rtmi-std-acq";

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
const card = (id: string, num: string, over: Partial<AssetForm>[] = []) => base(SUCC, x({ assetId: id, ownershipNumerator: num, ownershipDenominator: "100" }), ...over);
const fb = (c1: Partial<AssetForm>[], c2: Partial<AssetForm>[], date = "2026-02-16") =>
  form([card("p", "60", c1), card("s2", "40", c2)], date, { assetSplitMode: "fractional", contractTotalPrice: "3000000000" });

describe("XB-1 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클", () => {
  it.each([
    ["시가 · 담보 (3억/2억)", () => fb([MKT, MORT, STDIN], [S2]), 2_737_400_000],
    ["기준시가 · 담보 (3억/2억)", () => fb([STD, MORT, STDIN], [S2]), 2_737_400_000],
    ["기준시가 · 담보 (3억/3억 — 단건과 같다)", () => fb([STD, MORT, STDIN], [STDIN]), 2_697_000_000],
    ["기준시가 · 임대 (3억/2억)", () => fb([STD, RENT, STDIN], [S2]), 2_803_050_000],
    ["시가 · 담보 · 열거 이전 2023-02-27 (실지)", () => fb([MKT, MORT, STDIN], [], "2023-02-27"), 2_600_000_000],
    ["시가 · 보충 승 (불변)", () => fb([MKT, SUPP, STDIN], []), 440_000_000],
  ] as const)("%s", async (_n, mk, g) => {
    const f = mk();
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gainAny(r)).toBe(g);
  });
});

describe("XB-2 입력 요구 정합 — ⑧ ⊇ ⑫", () => {
  it.each([
    ["기준시가 모드 · 카드 2 비움", () => fb([STD, MORT, STDIN], []), "자산 2"],
    ["시가 모드 · 카드 2 비움", () => fb([MKT, MORT, STDIN], []), "자산 2"],
    ["시가 모드 · 카드 1 비움", () => fb([MKT, MORT], [S2]), "자산 1"],
  ] as const)("%s: ⑧ 1건(successorRightStdPaidAtAcq) ∧ ⑫ 400 (종전: 기준시가 모드 ⑧ 통과 ∧ ⑫ 400 막다른 길)", async (_n, mk, who) => {
    const f = mk();
    const m = full(f);
    expect(m.length).toBe(1);
    expect(m[0].field).toBe("successorRightStdPaidAtAcq");
    expect(m[0].message).toContain(who);
    expect((await post(f)).status).toBe(400);
  });
  it("승계취득가액·추가분담금·실지취득가액을 두 카드 모두 비워도 ⑧ 통과 ∧ ⑫ 200 (쓰이지 않는 값)", async () => {
    const f = fb([MKT, MORT, STDIN, BLK], [S2, BLK]);
    expect(full(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gainAny(r)).toBe(2_737_400_000);
  });
  it("열거 이전 · 카드 2 실지 비움: 실지가 쓰이므로 ⑧이 막는다", () => {
    expect(full(fb([MKT, MORT, STDIN], [BLK], "2023-02-27")).length).toBeGreaterThan(0);
  });
});

describe("XB-3 범위 — 원조합원 카드(열거 이후)는 계속 막는다", () => {
  const origCard = (id: string, num: string, over: Partial<AssetForm>[] = []) => base(ORIG, x({ assetId: id, ownershipNumerator: num, ownershipDenominator: "100" }), ...over);
  it.each([
    ["카드 2가 원조합원", () => form([card("p", "60", [MKT, MORT, STDIN]), origCard("s2", "40")], "2026-02-16", { assetSplitMode: "fractional", contractTotalPrice: "3000000000" })],
    ["카드 1이 원조합원", () => form([origCard("p", "60", [MKT, MORT]), card("s2", "40", [STDIN])], "2026-02-16", { assetSplitMode: "fractional", contractTotalPrice: "3000000000" })],
  ] as const)("%s: ⑧ 원조합원 사유 ∧ ⑫ 400", async (_n, mk) => {
    const f = mk();
    const m = full(f);
    expect(m.length).toBe(1);
    expect(m[0].message).toContain("원조합원 입주권의 기준시가");
    expect((await post(f)).status).toBe(400);
  });
});

describe("XB-3b 범위 — 열거 이전 원조합원 카드는 계산한다 (`transfer.route.bg-orig-rtmi-preera-share.anchor.test.ts`)", () => {
  it("카드 2가 원조합원 · 2023-02-27 · 시가 담보: ⑧ 통과", () => {
    const orig2 = base(ORIG, x({ assetId: "s2", ownershipNumerator: "40", ownershipDenominator: "100" }));
    const f = form([card("p", "60", [MKT, MORT, STDIN]), orig2], "2023-02-27", { assetSplitMode: "fractional", contractTotalPrice: "3000000000" });
    expect(full(f)).toEqual([]);
  });
});

describe("XB-4 술어 · ⑤ 주입", () => {
  it("bgSuccessorRightStdForced — 축 B(true)에서도 켜진다 · bgRtmiAxisBWinnerComputable은 승계 또는 열거 이전 원조합원", () => {
    const c = card("p", "60", [MKT, MORT, STDIN]);
    expect(bgSuccessorRightStdForced(c, "2026-02-16", true)).toBe(true);
    expect(bgSuccessorRightStdForced(c, "2023-02-27", true)).toBe(false);
    expect(bgRtmiAxisBWinnerComputable(c, "2026-02-16")).toBe(true);
    expect(bgRtmiAxisBWinnerComputable(base(ORIG), undefined)).toBe(false);
  });
  it("비주 카드: 주입 없이는 승자를 몰라 칸이 닫히고, 첫 카드 주입값을 받으면 열린다(⑤ CompanionAssetCard와 같은 병합)", () => {
    const primary = card("p", "60", [MKT, MORT, STDIN]);
    const second = card("s2", "40", [S2]);
    // 둘째 카드의 저장값에는 부담부증여 평가 값이 없다(② 숨김).
    const raw = { ...second, transferType: "regular", bgMortgageDebtAmount: "", bgMarketValueAtTransfer: "" } as AssetForm;
    expect(bgSuccessorRightStdForced(raw, "2026-02-16", true)).toBe(false);
    const injected = { ...raw, ...bgRtmiShareJudgmentFields(raw, primary) } as AssetForm;
    expect(bgSuccessorRightStdForced(injected, "2026-02-16", true)).toBe(true);
  });
  it("주입은 승계 입주권 카드만 — 원조합원 카드·다른 종류는 빈 객체", () => {
    const primary = card("p", "60", [MKT, MORT, STDIN]);
    expect(bgRtmiShareJudgmentFields(base(ORIG), primary)).toEqual({});
    expect(Object.keys(bgRtmiShareJudgmentFields(card("s2", "40"), primary)).length).toBeGreaterThan(0);
  });
});
