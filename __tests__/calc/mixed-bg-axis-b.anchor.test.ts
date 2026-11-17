/**
 * anchor — 겸용주택 부담부증여 × 지분 분할 취득(축 B) · M-2 PR-C (계획서 `docs/00-pm/bg-mixed-use-m2-bundle-share.plan.md` §3.3).
 *
 * 화면 경로: 폼 → ⑧(`collectStepIssues`) → ④(`callTransferTaxAPI` body) → route. 오라클 = 같은 물건을 단독 소유 단건 겸용 부담부증여로 계산한 값.
 * 축 B는 물건이 하나라 같은 취득이면 결정세액 + 지방소득세가 같아야 한다 — 차이는 카드별 절사 ±수 원(V-P1b-2 · 법령상 올바른 반올림).
 * 고정값은 2026-11-17 throwaway 실측(계획서 §3.3.2 표)과 같다.
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
import { allIssues, captureBody } from "./_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";
import { MIXED_BG_AXIS_B_MARKET_COLLATERAL_MESSAGE } from "@/lib/tax-engine/mixed-use-burdened-gift-prepare";
import { bgCollateralForcesStdAcq } from "@/lib/calc/burdened-gift-collateral-win";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Over = Record<string, unknown>;

const OBJECT = {
  assetKind: "housing", isMixedUseHouse: true,
  residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
const ACQ = {
  acquisitionCause: "purchase", acquisitionDate: "2010-03-15",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000",
};
export const BG_STD = {
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000", bgMortgageAttribution: "unallocated",
};
export const BG_MKT = {
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgDonorRelation: "lineal_descendant",
  bgMarketValueAtTransfer: "1500000000", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000", bgLendingDepositTotal: "0",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "700000000", bgHousingAppraisalDeclared: "none", bgMortgageAttribution: "unallocated",
};
const FORM = { transferDate: "2024-03-01", filingDate: "2024-05-31", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const ONE = { isOneHousehold: true, householdHousingCount: "1" };
/** 1세대1주택 시료의 거주(취득일부터 양도일까지) — 모든 카드에 둔다(지분 카드도 거주 칸이 있다) */
const RES = { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2010-03-15", moveOutDate: "2024-03-01" }] };
const R = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const base = (i: number) => ({ ...makeDefaultAsset(i), addressJibun: "제주특별자치도 강남구 테스트동 1-1" });

function single(over: Over, form: Over = {}): TransferFormData {
  const a = Object.assign(base(1), OBJECT, ACQ, form.isOneHousehold ? RES : {}, over) as AssetForm;
  return rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, { assets: [a], contractTotalPrice: "" }, form)) as TransferFormData;
}
/** 화면 상태: 자산 1 = 물건 단위 + 부담부증여 칸 + 지분, 지분 카드 = 취득 쪽 칸 + 지분(부담부증여 칸 없음 — ② 숨김) */
export function axisB(bg: Over, form: Over = {}, shareOver: Over = {}, obj: Over = {}, ratios: string[] = ["60", "40"]): TransferFormData {
  const res = form.isOneHousehold ? RES : {};
  const a1 = Object.assign(base(1), OBJECT, obj, ACQ, res, bg, R(ratios[0])) as AssetForm;
  const rest = ratios.slice(1).map((r, k) => Object.assign(base(k + 2), ACQ, res, R(r), { transferType: "burdened_gift" }, shareOver) as AssetForm);
  return rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, { assets: [a1, ...rest], contractTotalPrice: "", assetSplitMode: "fractional" }, form)) as TransferFormData;
}

export async function run(f: TransferFormData) {
  const issues = allIssues(f);
  const body = (await captureBody(f)) as Loose;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Loose;
  const d = j?.data;
  const total: number | undefined = d?.mode === "mixed-use" ? d.result.total.determinedTax + d.result.total.localTax : d?.aggregated?.totalTax;
  return { issues, body, status: res.status, j, d, total };
}

/** 증여자가 증여로 취득(§163⑨ 평가액 = 취득가액 경로) — 지분 카드도 같은 취득(같은 날 · 같은 원인) */
const GIFT_ACQ = { acquisitionCause: "gift", acquisitionDate: "2015-01-01", donorAcquisitionDate: "1970-01-01", giftDonorRelation: "lineal_ascendant", giftSameHousehold: "no", mixedHousingGiftValueOverride: "400000000", mixedCommercialGiftValueOverride: "300000000" };
const S3C = { ...BG_MKT, bgMortgageAttribution: "split", bgMortgageSplitHousing: "200000000", bgMortgageSplitCommercial: "100000000", bgMortgageSplitUnallocated: "300000000" };
const SAMPLES: [name: string, bg: Over, obj: Over, form: Over, single: number, axisB: number, ratios?: string[]][] = [
  ["S1 기준시가 보충 승 · 불분명 6억", BG_STD, {}, {}, 67_033_120, 67_033_120],
  ["S2 시가 15억 · 불분명 6억 · 실지 7억", BG_MKT, {}, {}, 76_003_401, 76_003_401],
  ["S3c 시가 15억 · 주택 2억 + 상가 1억 + 불분명 3억", S3C, {}, {}, 76_003_401, 76_003_402],
  ["S4 기준시가 고가(주택 20억) · 1세대1주택(보유·거주 14년)", { ...BG_STD, bgMortgageDebtAmount: "1200000000", bgMortgageSetAmount: "1200000000" }, { mixedTransferHousingPrice: "2000000000" }, ONE, 44_663_689, 44_663_690],
  ["S5 부분 증여가액 하한(결정 5) · 주택 귀속 9억", { ...BG_MKT, bgMortgageDebtAmount: "900000000", bgMortgageSetAmount: "900000000", bgMortgageAttribution: "housing" }, {}, {}, 149_446_000, 149_446_000],
  ["S9a 기준시가 담보 승(채무 13억)", { ...BG_STD, bgMortgageDebtAmount: "1300000000", bgMortgageSetAmount: "1300000000" }, {}, {}, 192_473_160, 192_473_160],
  ["S9c 기준시가 임대 승", { ...BG_STD, bgMortgageDebtAmount: "0", bgMortgageSetAmount: "", bgMortgageAttribution: "", bgLendingDepositTotal: "300000000", bgAnnualRentTotal: "120000000", bgDepositAttribution: "unallocated" }, {}, {}, 26_892_378, 26_892_379],
  ["S13 시가 + 주택분 구분 감정평가 8억", { ...BG_MKT, bgHousingAppraisalDeclared: "exists", bgHousingAppraisalValue: "800000000" }, {}, {}, 76_003_401, 76_003_401],
  ["S14b 3분할 50/30/20 · 시가 + 귀속 3칸", S3C, {}, {}, 76_003_401, 76_003_403, ["50", "30", "20"]],
  ["S10 시가 15억 · 채무 10억(시가 승 · 40% 카드를 담보 승으로 읽지 않는다)", { ...BG_MKT, bgMortgageDebtAmount: "1000000000", bgMortgageSetAmount: "1000000000" }, {}, {}, 144_019_334, 144_019_334],
  ["S10g S10 × 증여자 2015 증여 취득(§163⑨ 평가액 경로)", { ...BG_MKT, bgMortgageDebtAmount: "1000000000", bgMortgageSetAmount: "1000000000", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "", ...GIFT_ACQ }, {}, {}, 162_792_667, 162_792_667],
  ["S12 채무 9억 · 담보 설정 5억(⑧ 미리보기 ×r)", { ...BG_STD, bgMortgageDebtAmount: "900000000", bgMortgageSetAmount: "500000000" }, {}, {}, 112_490_400, 112_490_400],
];

describe("PRC-1 축 B = 단독 소유 단건(±카드별 절사)", () => {
  it.each(SAMPLES)("%s", async (_n, bg, obj, form, singleTotal, axisTotal, ratios) => {
    const s = await run(single({ ...bg, ...obj }, form));
    expect(s.issues).toEqual([]);
    expect(s.total).toBe(singleTotal);
    const b = await run(axisB(bg, form, bg.acquisitionCause === "gift" ? GIFT_ACQ : {}, obj, ratios));
    expect(b.issues).toEqual([]);
    expect(b.status, JSON.stringify(b.j).slice(0, 600)).toBe(200);
    expect(b.total).toBe(axisTotal);
    // 계약 단위 증여세 1회 — 단건과 같다(§3.3.3 3)
    expect(b.d.aggregated.burdenedGift?.giftTax?.finalTax).toBe(s.d.result.burdenedGift?.giftTax?.finalTax);
  });
});

describe("PRC-2 귀속 ×r은 항목별(NEG) — 합계 단위면 불분명이 음수가 된다", () => {
  it("보증금 100,000,001 · 담보 500,000,001 모두 주택 → 전송 귀속 주택 360,000,000 · 불분명 0 · 단건과 같은 세액", async () => {
    const bg = { ...BG_STD, bgLendingDepositTotal: "100000001", bgDepositAttribution: "housing", bgMortgageDebtAmount: "500000001", bgMortgageSetAmount: "500000001", bgMortgageAttribution: "housing" };
    const s = await run(single(bg));
    const b = await run(axisB(bg));
    expect(b.issues).toEqual([]);
    expect(b.status, JSON.stringify(b.j).slice(0, 600)).toBe(200);
    const attr = b.body.burdenedGiftInfo?.debtAttribution;
    expect(attr.housing).toBe(360_000_000);
    expect(attr.unallocated).toBe(0);
    expect(Math.abs((b.total ?? 0) - (s.total ?? 0))).toBeLessThanOrEqual(2);
  });
});

describe("PRC-3 Q-10 (b) — 시가 모드 담보 승은 축 B에서도 계산하지 않는다", () => {
  it("시가 12억 < 담보 13억 → ⑧ 차단(종전 문구) · 짝: 기준시가 담보 승(S9a)은 PRC-1에서 계산", async () => {
    const bg = { ...BG_MKT, bgMarketValueAtTransfer: "1200000000", bgMortgageDebtAmount: "1300000000", bgMortgageSetAmount: "1300000000" };
    const b = await run(axisB(bg));
    expect(b.issues.some((m) => m.includes("담보평가액") && m.includes("지분 분할 취득"))).toBe(true);
    expect(b.status).toBe(400);
    // ⑫ · 직접 API도 같은 조합을 막는다 — 엔진 MB-22(종전엔 MB-6이 축 B 전체를 막았다)
    expect(JSON.stringify(b.j)).toContain(MIXED_BG_AXIS_B_MARKET_COLLATERAL_MESSAGE);
  });
});

describe("PRC-4 ⑤ 산정방식 라디오 술어 — 축 B는 물건 전체로 담보 승을 판정한다(S10)", () => {
  it("시가 15억 · 채무 10억 · 지분 60% — 축 B는 시가 승(라디오 보임) · 짝: 같은 값의 공유지분 단건(채무 = 내 인수분)은 담보 승", () => {
    const bg = { ...BG_MKT, bgMortgageDebtAmount: "1000000000", bgMortgageSetAmount: "1000000000" };
    const f = axisB(bg);
    expect(bgCollateralForcesStdAcq(f.assets[0], true)).toBe(false);
    expect(bgCollateralForcesStdAcq(f.assets[0], false)).toBe(true);
  });
});
