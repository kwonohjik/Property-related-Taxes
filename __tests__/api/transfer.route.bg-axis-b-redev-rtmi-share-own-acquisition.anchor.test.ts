/**
 * 축 B(지분 분할) × 부담부증여 — 재개발 APT · 조합원입주권 지분의 「이 지분 실지취득가액」(계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §25 · §26 · Q-18 a · Q-19 a).
 *
 * D-3g: ④ `mergePrimaryBasic`이 `bgActualAcquisitionTotal`을 자산 1 값으로 덮어, 지분마다 실지취득가액이 달라도 자산 1 값으로 계산됐다
 *   (재개발 원조합원 · 승계조합원 시가 K-4 실지 +12M · +21M, 입주권 원조합원 기준시가 · K-4 +16M · +28M — 60/40 · 30/70).
 *   지금: #3093 토글(`bgShareOwnAcquisition`)을 재개발(시가 · K-4 실지 · 담보 승 아님) · 입주권 원조합원 지분에 연다 — 실지취득가액 한 칸만(산정방식은 자산 1).
 * D-3h: 원조합원 지분 카드 ③이 저장값 「일반 양도」로 판정돼 쓰이지 않는 ⑤ 「실거래가 취득가액」 칸이 떴다. 지금: ③을 병합값(부담부증여)으로 판정한다.
 *
 * 오라클 = 지분마다 그 지분 재료로 넣은 축 A 단건(지분 r · 제3자 공유 · 물건 전체 재료 · 채무 × r · 청산금 × r · 계약총액 × r)의 양도차익 합(§25 — 같은 재료면 = 100% 단건).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";
import { bgShareCardJudgmentFields } from "@/lib/calc/bg-pre-deemed-shares";
import { bgShareOwnAcquisitionApplies, bgShareOwnAcquisitionFields } from "@/lib/calc/bg-share-own-acquisition";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Record<string, unknown>;
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const BASE = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const mk = (n: number, ...o: A[]) => Object.assign({ ...makeDefaultAsset(n) }, ...o) as unknown as AssetForm;
const pct = (n: number): A => ({ ownershipNumerator: String(Math.round(n * 100)), ownershipDenominator: "100" });
const debtOf = (d: number): A => ({ bgMortgageDebtAmount: String(d), bgMortgageSetAmount: String(d) });
const OWN = (v: string): A => ({ bgShareOwnAcquisition: true, bgActualAcquisitionTotal: v });

// ── 재개발 APT(§19.4 · §23 시료) ──
const SET = 92_781_500;
const COMMON: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0" };
const REDEV = (set: number): A => ({ assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: String(set),
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false,
  redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" });
const SUCC: A = { redevIsSuccessorMember: "yes", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" };
const SHARE_COMMON = (set: number): A => ({ acquisitionCause: "purchase", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500",
  redevPreApprovalExpenses: "0", redevSettlementDirection: "pay", redevSettlementAmount: String(set), redevCompletionDate: "2022-09-01", redevOriginalAssetType: "housing" });
const K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual" };
const K5: A = { ...K4, bgAcquisitionMethod: "converted" };
const STD: A = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" };
type V = "orig" | "succ";
const share2Redev = (v: V, r2: number): A =>
  v === "succ" ? { ...SHARE_COMMON(0), acquisitionDate: "2020-01-01", redevIsSuccessorMember: "yes" } : { ...SHARE_COMMON(SET * r2), acquisitionDate: "2017-01-01", standardPriceAtAcq: "400000000",
      redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" };
const redevB = (v: V, mode: A, debt: number, r1: number, own2: A = {}, own1: A = {}) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "fractional", contractTotalPrice: "1000000000",
  assets: [mk(1, { assetId: "p" }, COMMON, REDEV(v === "succ" ? 0 : SET * r1), v === "succ" ? SUCC : {}, mode, debtOf(debt), pct(r1), own1), mk(2, { assetId: "s" }, pct(1 - r1), share2Redev(v, 1 - r1), own2)] })) as TransferFormData;
const redevA = (v: V, mode: A, debt: number, r: number, own: A) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: String(1_000_000_000 * r),
  assets: [mk(1, COMMON, REDEV(v === "succ" ? 0 : SET * r), v === "succ" ? SUCC : {}, mode, debtOf(debt * r), pct(r), { ownershipRemainderThirdParty: "yes" }, own)] })) as TransferFormData;

// ── 조합원입주권 원조합원(`bg-axis-b-right-share-inputs` 시료) ──
const RV: A = { bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000" };
const ORIG = (set: number): A => ({ isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", acquisitionCause: "purchase", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: String(set), redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01" });
const RTMI: A = { addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", ...RV,
  standardPriceAtAcq: "", standardPriceAtTransfer: "" };
const R_STD: A = { bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" };
const R_K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000", bgAcquisitionMethod: "actual" };
const RSET = 100_000_000;
const rtmiB = (mode: A, r1: number, own2: A = {}) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "fractional", contractTotalPrice: "1500000000",
  assets: [mk(1, { assetId: "p" }, RTMI, ORIG(RSET * r1), mode, debtOf(600_000_000), pct(r1), { bgActualAcquisitionTotal: "300000000" }),
           mk(2, { assetId: "s" }, pct(1 - r1), ORIG(RSET * (1 - r1)), { acquisitionDate: "2012-01-01" }, own2)] })) as TransferFormData;
const rtmiA = (mode: A, r: number, acq: string, date: string) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: String(1_500_000_000 * r),
  assets: [mk(1, RTMI, ORIG(RSET * r), mode, debtOf(600_000_000 * r), pct(r), { ownershipRemainderThirdParty: "yes", bgActualAcquisitionTotal: acq, acquisitionDate: date })] })) as TransferFormData;

async function post(f: TransferFormData) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  const j = (await res.json()) as Loose;
  return { status: res.status, err: JSON.stringify(j.error ?? null).slice(0, 300), gain: (j.data?.aggregated?.totalTransferGain ?? j.data?.result?.transferGain) as number };
}
async function gainOk(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const r = await post(f);
  expect(r.status, r.err).toBe(200);
  return r.gain;
}

describe("RO-1 토글 켬 · 지분 2 실지 +5천만(입주권 +1억) → 축 B 양도차익 = 지분별 재료 축 A 단건 합 (D-3g)", () => {
  for (const [v, fixed] of [["orig", [382_331_100, 373_331_101]], ["succ", [438_000_000, 429_000_000]]] as const) {
    for (const [i, r1] of [0.6, 0.3].entries()) {
      it(`재개발 ${v === "orig" ? "원조합원" : "승계조합원"} · 시가 K-4 실지 · ${r1 * 100}/${100 - r1 * 100}`, async () => {
        const date2 = v === "succ" ? "2020-01-01" : "2017-01-01";
        const b = await gainOk(redevB(v, K4, 600_000_000, r1, OWN("300000000")));
        const oracle = (await gainOk(redevA(v, K4, 600_000_000, r1, {}))) + (await gainOk(redevA(v, K4, 600_000_000, 1 - r1, { bgActualAcquisitionTotal: "300000000", acquisitionDate: date2 })));
        expect(b).toBe(oracle);
        expect(b).toBe(fixed[i]);
      });
    }
  }
  for (const [name, mode] of [["기준시가", R_STD], ["시가 K-4", R_K4]] as const) {
    for (const [i, r1] of [0.6, 0.3].entries()) {
      it(`입주권 원조합원 + 원조합원 · ${name} · ${r1 * 100}/${100 - r1 * 100}`, async () => {
        const b = await gainOk(rtmiB(mode, r1, OWN("400000000")));
        const oracle = (await gainOk(rtmiA(mode, r1, "300000000", "2009-07-01"))) + (await gainOk(rtmiA(mode, 1 - r1, "400000000", "2012-01-01")));
        expect(b).toBe(oracle);
        expect(b).toBe([424_000_000, 412_000_000][i]);
      });
    }
  }
});

describe("RO-2 토글 끔 — 자산 1 값 그대로(종전 동작 · 지분 카드에 남은 값은 쓰지 않는다)", () => {
  it.each([
    ["재개발 원조합원 K-4", () => redevB("orig", K4, 600_000_000, 0.6, { bgShareOwnAcquisition: false, bgActualAcquisitionTotal: "300000000" }), 394_331_100],
    ["재개발 승계조합원 K-4", () => redevB("succ", K4, 600_000_000, 0.6, { bgShareOwnAcquisition: false, bgActualAcquisitionTotal: "300000000" }), 450_000_000],
    ["입주권 원조합원 기준시가", () => rtmiB(R_STD, 0.6, { bgShareOwnAcquisition: false, bgActualAcquisitionTotal: "400000000" }), 440_000_000],
  ] as const)("%s", async (_n, f, g) => {
    expect(await gainOk(f())).toBe(g);
  });
});

describe("RO-3 토글 켬 + 이 지분 실지취득가액 비움 → ⑧ 차단 ∧ ⑫ 400 (⑧ ⊇ ⑫)", () => {
  it.each([
    ["재개발 원조합원 K-4", () => redevB("orig", K4, 600_000_000, 0.6, OWN(""))],
    ["재개발 승계조합원 K-4", () => redevB("succ", K4, 600_000_000, 0.6, OWN(""))],
    ["입주권 원조합원 기준시가", () => rtmiB(R_STD, 0.6, OWN(""))],
  ] as const)("%s", async (_n, f) => {
    const form = f();
    expect(allIssues(form).map(String).some((m) => m.includes("bgActualAcquisitionTotal"))).toBe(true);
    expect((await post(form)).status).toBe(400);
  });
});

describe("RO-4 범위 — 실지취득가액이 쓰이지 않는 칸에서는 토글이 숨고 켜 둔 값도 쓰지 않는다", () => {
  it.each([
    ["재개발 시가 K-5 환산", () => redevB("orig", K5, 600_000_000, 0.6, { ...OWN("300000000"), useEstimatedAcquisition: true }), 475_865_550],
    ["재개발 기준시가", () => redevB("orig", STD, 400_000_000, 0.6, OWN("300000000")), 147_609_250],
    ["재개발 시가 K-4 담보 승(채무 12억)", () => redevB("orig", K4, 1_200_000_000, 0.6, { ...OWN("300000000"), standardPriceAtAcq: "400000000" }), 695_218_500],
  ] as const)("%s", async (_n, f, g) => {
    const form = f();
    const primary = form.assets[0];
    expect(bgShareOwnAcquisitionApplies(mergePrimaryBasic(form.assets[1], primary))).toBe(false);
    expect(await gainOk(form)).toBe(g);
  });
  it("leaf — 입주권 승계 지분 · 일반 양도 · 재개발 의제취득일 전 상속 지분은 닫힌다 · 재개발 · 입주권은 실지 한 칸만", () => {
    const rp = rtmiB(R_STD, 0.6).assets[0];
    expect(bgShareOwnAcquisitionApplies(mergePrimaryBasic(mk(2, { isSuccessorRightToMoveIn: true }), rp))).toBe(false);
    expect(bgShareOwnAcquisitionApplies(mergePrimaryBasic(mk(2, ORIG(0)), rp))).toBe(true);
    expect(bgShareOwnAcquisitionApplies(mergePrimaryBasic(mk(2, ORIG(0)), { ...rp, transferType: "regular" }))).toBe(false);
    const redevPrimary = redevB("orig", K4, 600_000_000, 0.6).assets[0];
    expect(bgShareOwnAcquisitionApplies(mergePrimaryBasic(mk(2, share2Redev("orig", 0.4), { acquisitionCause: "inheritance", acquisitionDate: "1980-01-01" }), redevPrimary))).toBe(false);
    const redevMerged = mergePrimaryBasic(mk(2, share2Redev("orig", 0.4)), redevPrimary);
    expect(bgShareOwnAcquisitionApplies(redevMerged)).toBe(true);
    expect(bgShareOwnAcquisitionFields(redevMerged)).toEqual(["bgActualAcquisitionTotal"]);
    expect(bgShareOwnAcquisitionFields(mergePrimaryBasic(mk(2, ORIG(0)), rp))).toEqual(["bgActualAcquisitionTotal"]);
  });
  it("산정방식은 자산 1 — 지분 카드에 남은 산정방식은 되돌리지 않는다", () => {
    const f = redevB("orig", K4, 600_000_000, 0.6, { ...OWN("300000000"), bgAcquisitionMethod: "converted" });
    expect(mergePrimaryBasic(f.assets[1], f.assets[0]).bgAcquisitionMethod).toBe("actual");
    expect(mergePrimaryBasic(f.assets[1], f.assets[0]).bgActualAcquisitionTotal).toBe("300000000");
  });
});

describe("RO-5 ③ 판정값 — 원조합원 지분도 병합값(부담부증여)으로 판정 (D-3h)", () => {
  it("재개발 원조합원 · 입주권 원조합원 지분 → transferType 부담부증여", () => {
    expect(bgShareCardJudgmentFields(mk(2, share2Redev("orig", 0.4)), redevB("orig", K4, 600_000_000, 0.6).assets[0]).transferType).toBe("burdened_gift");
    expect(bgShareCardJudgmentFields(mk(2, ORIG(0)), rtmiB(R_STD, 0.6).assets[0]).transferType).toBe("burdened_gift");
  });
  it("입주권 승계 지분 · 첫 카드 일반 양도 → 빈 객체(종전 그대로)", () => {
    expect(bgShareCardJudgmentFields(mk(2, { isSuccessorRightToMoveIn: true }), rtmiB(R_STD, 0.6).assets[0])).toEqual({});
    expect(bgShareCardJudgmentFields(mk(2, ORIG(0)), { ...rtmiB(R_STD, 0.6).assets[0], transferType: "regular" })).toEqual({});
  });
});

describe("RO-6 재개발 원조합원 K-5 — 판정값이 바뀌어 ⑤ 라디오가 사라져도 지분 카드의 D · E만으로 계산된다", () => {
  it("지분 카드 useEstimatedAcquisition 없이 475,865,550 = 100% 단건", async () => {
    expect(await gainOk(redevB("orig", K5, 600_000_000, 0.6, { useEstimatedAcquisition: false, redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" }))).toBe(475_865_550);
  });
});
