/**
 * 축 B(지분 분할) × 재개발 — 「+ 지분 추가」 기본값 지분 카드의 두 결함(계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §23 · §24 · Q-16 a · Q-17 a).
 *
 * D-3j 토지 출자 × 인가전 분 환산(§166③): 종전 토지 면적(`redevLandArea` · ① 기본정보)이 지분 카드에 없고 병합되지 않아
 *   ⑧ 「토지면적(㎡)을 입력하세요」 · ⑫ 400 — 부담부증여 K-5 · 일반 양도 환산 모두 막다른 길이었다. 지금: 자산 1 값을 병합한다(같은 땅).
 * D-3k 승계조합원 지분 카드: ③이 저장값 「일반 양도」로 판정돼 일반 「취득가액」 칸이 떴는데 부담부증여 계산은 그 칸을 읽지 않았다.
 *   지금: 첫 카드가 부담부증여면 승계조합원 지분 카드 ③도 병합값으로 판정한다(`bgShareCardJudgmentFields`).
 *
 * 시료: §19.4 재개발(원조합원 · 청산금 지분 해당분)의 변형 · 지분 2 = `makeDefaultAsset` + 지분 카드에 보이는 칸 · 오라클 = 100% 단건.
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

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Record<string, unknown>;
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const SET = 92_781_500;
const COMMON: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0" };
const REDEV = (set: number): A => ({ assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: String(set),
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false,
  redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" });
/** 토지 출자 — 종전 토지 100㎡ · 취득시 1.5억(㎡당 150만) · 인가일 3억(㎡당 300만). */
const LAND: A = { redevOriginalAssetType: "land", redevLandArea: "100", redevLandStdPriceAtAcq: "150000000", redevLandStdPriceAtApproval: "300000000" };
const SHARE_COMMON = (set: number): A => ({ acquisitionCause: "purchase", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500",
  redevPreApprovalExpenses: "0", redevSettlementDirection: "pay", redevSettlementAmount: String(set) });
/** 토지 출자 지분 카드에 보이는 칸 — 인가전 분 「환산취득가액」 · ㎡당 공시지가 두 칸(토지면적 칸은 없다). */
const LAND_SHARE: A = { ...SHARE_COMMON(SET * 0.4), acquisitionDate: "2015-01-01", redevOriginalAssetType: "land", useEstimatedAcquisition: true, redevLandPricePerSqmAtAcq: "1500000", redevLandPricePerSqmAtApproval: "3000000" };
const SUCC: A = { redevIsSuccessorMember: "yes", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" };
/** 승계조합원 지분 카드에 보이는 칸 — 조합원 구분 · 준공일. */
const SUCC_SHARE: A = { ...SHARE_COMMON(0), acquisitionDate: "2019-03-01", redevOriginalAssetType: "housing", redevIsSuccessorMember: "yes", redevCompletionDate: "2022-09-01" };
const STD: A = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgMortgageDebtAmount: "400000000", bgMortgageSetAmount: "400000000" };
const K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000" };
const K5: A = { ...K4, bgAcquisitionMethod: "converted" };
const REGULAR_EST: A = { transferType: "regular", useEstimatedAcquisition: true, bgValuationMode: "" };
const pct = (n: number): A => ({ ownershipNumerator: String(n), ownershipDenominator: "100" });
const mk = (n: number, ...o: A[]) => Object.assign({ ...makeDefaultAsset(n) }, ...o) as unknown as AssetForm;
const BASE = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const single = (...o: A[]) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assets: [mk(1, COMMON, REDEV(SET), ...o)], contractTotalPrice: "1000000000" })) as TransferFormData;
const frac = (p: A[], s: A[]) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "fractional", contractTotalPrice: "1000000000",
  assets: [mk(1, { assetId: "p" }, COMMON, REDEV(SET * 0.6), pct(60), ...p), mk(2, { assetId: "s" }, pct(40), ...s)] })) as TransferFormData;

async function post(f: TransferFormData) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)),
  }));
  const j = (await res.json()) as Loose;
  return { status: res.status, err: JSON.stringify(j.error ?? null).slice(0, 300), gain: (j.data?.aggregated?.totalTransferGain ?? j.data?.result?.transferGain) as number };
}
async function gainOk(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const r = await post(f);
  expect(r.status, r.err).toBe(200);
  return r.gain;
}

describe("LA-1 토지 출자 × 인가전 분 환산 — 지분 카드에 토지면적 칸 없이 ⑧ 0 · ⑫ 200 (D-3j)", () => {
  it("부담부증여 K-5 → 475,865,550 = 100% 단건", async () => {
    const b = await gainOk(frac([LAND, K5], [LAND_SHARE]));
    expect(b).toBe(await gainOk(single(LAND, K5)));
    expect(b).toBe(475_865_550);
  });
  it("일반 양도 · 인가전 분 환산취득가액 → 793,109,250 = 100% 단건", async () => {
    const b = await gainOk(frac([LAND, REGULAR_EST], [LAND_SHARE]));
    expect(b).toBe(await gainOk(single(LAND, REGULAR_EST)));
    expect(b).toBe(793_109_250);
  });
});

describe("LA-2 자산 1 토지면적을 비우면 계속 막는다(형제 안전망)", () => {
  it("부담부증여 K-5 — ⑧ redevLandArea ∧ ⑫ 400", async () => {
    const f = frac([LAND, K5, { redevLandArea: "" }], [LAND_SHARE]);
    expect(allIssues(f).map(String).some((m) => m.includes("redevLandArea"))).toBe(true);
    expect((await post(f)).status).toBe(400);
  });
});

describe("LA-3 병합 범위", () => {
  const primary = mk(1, COMMON, REDEV(SET), LAND);
  it("지분 카드 → 자산 1의 종전 토지 면적", () => {
    expect(mergePrimaryBasic(mk(2, { redevLandArea: "55" }), primary).redevLandArea).toBe("100");
  });
  it("자산 1 자신은 그대로", () => {
    expect(mergePrimaryBasic(primary, primary).redevLandArea).toBe("100");
  });
});

describe("SC-1 승계조합원 지분 카드 ③ 판정값 (D-3k)", () => {
  const primary = mk(1, COMMON, REDEV(SET), SUCC, K4);
  it("첫 카드 부담부증여 · 승계조합원 지분 → 병합값(부담부증여)", () => {
    const f = bgShareCardJudgmentFields(mk(2, SUCC_SHARE), primary);
    expect(f.transferType).toBe("burdened_gift");
    expect(f.bgAcquisitionMethod).toBe("actual");
  });
  it("원조합원 지분도 병합값(vp2c §25 D-3h · Q-19 a) · 첫 카드 일반 양도 → 빈 객체(종전 그대로)", () => {
    expect(bgShareCardJudgmentFields(mk(2, SHARE_COMMON(0)), mk(1, COMMON, REDEV(SET), K4)).transferType).toBe("burdened_gift");
    expect(bgShareCardJudgmentFields(mk(2, SUCC_SHARE), { ...primary, transferType: "regular" })).toEqual({});
  });
});

describe("SC-2 승계조합원 — 지분 카드에 보이는 칸만으로 양도차익 = 100% 단건", () => {
  for (const [name, mode, extra, fixed] of [
    ["기준시가 보충", STD, { standardPriceAtAcq: "400000000" }, 200_000_000],
    ["시가 K-4 실지", K4, {}, 450_000_000],
    ["시가 K-5 환산", K5, { standardPriceAtAcq: "400000000" }, 300_000_000],
  ] as const) {
    it(name, async () => {
      const b = await gainOk(frac([SUCC, mode], [SUCC_SHARE, extra]));
      expect(b).toBe(await gainOk(single(SUCC, mode)));
      expect(b).toBe(fixed);
    });
  }
});
