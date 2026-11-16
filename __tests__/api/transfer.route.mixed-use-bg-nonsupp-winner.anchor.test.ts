/**
 * anchor — 겸용주택 × 부담부증여의 담보(상증법 §66)·임대(같은 법 §61⑤) 승 계산 (종전 MB-7 차단 해제).
 *
 * 사용자 결정 H-1(2026-11-16 — 질의서 `docs/00-pm/bg-nonsupp-winner-inquiries.md` §2, 회신 대신 결정):
 *  ① 건물 전체 근저당·귀속 불분명 → 평가액 전체를 증여일 현재 기준시가 비율로 안분
 *  ② 상가 보증금만 → 부동산거래관리과-119에 따라 채무 전액을 상가의 양도로
 *  ③ 주택·상가 모두 보증금 → 부분별로 소령 §159① (주택 양도가액 = 주택분 평가액 × 주택 채무 ÷ 주택분 증여가액), 근저당만 기준시가 비율 안분
 *  ④ 담보 승(C = B)에서 귀속 채무가 기준시가 안분 몫을 넘으면 → 부분 증여가액 = 그 부분 귀속 채무 + 불분명 채무의 기준시가 비율 몫(각 부분 채무비율 1)
 *
 * 시료: 주택 100㎡·상가 100㎡(§154③ 단서) · 양도시 개별주택가격 6억(토지 5억 + 건물 1억) · 상가 토지 5억 + 건물 1억 = 양도시 기준시가 1:1 · 합 12억 ·
 *       취득시 주택 3억(토지 2.5억 + 건물 0.5억) · 상가 토지 2.5억 + 건물 0.5억 · 증여일 2024-03-01 · 증여자 취득 2010-03-15.
 * 손계산(4부분 양도가액·취득가액·개산공제 3%)은 각 it 주석. 결정세액은 그 값 위의 기존 파이프라인 실측이다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const form = (assets: AssetForm[]): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

interface BundledData {
  mode?: string;
  aggregated?: {
    totalTax?: number;
    properties?: { transferGain: number }[];
    burdenedGift?: {
      debtRatio: number;
      assumedDebtAmount: number;
      giftTax?: { taxBase: number; finalTax: number };
    };
  };
  result?: { transferGain?: number; totalTax?: number };
}

async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: BundledData };
  return { status: res.status, body: cap.body!, data: json.data };
}


const mixed = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-15",
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedIsMetropolitanArea: true,
  fixedAcquisitionPrice: "700000000",
};
const BG_ON = {
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "700000000",
  standardPriceAtTransfer: "1500000000",
  standardPriceAtAcq: "700000000",
};
const mk = (over: Record<string, unknown>) =>
  ({ ...form([{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", ...mixed, ...over } as AssetForm]), contractTotalPrice: "1500000000" }) as TransferFormData;


const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "", bgHousingAppraisalDeclared: "" };
type R = {
  total: { determinedTax: number };
  warnings: string[];
  burdenedGift: {
    sangjeungbeopValuation: { selectedMode: string; max: number };
    acquisitionMethodUsed: string;
    acquisitionStdForcedByCollateral?: true;
    debtAttribution: { housingDebt: number; commercialDebt: number; housingGiftValue: number; commercialGiftValue: number; housingRatio: number; commercialRatio: number };
    perPart: Record<string, { transferPrice: number; acquisitionPrice: number; estimatedDeduction: number }>;
    highValue: { judgmentBase: number };
  };
};
async function calc(over: Record<string, unknown>, f: Record<string, unknown> = {}) {
  const form0 = { ...mk(over), ...f } as TransferFormData;
  const issues = collectStepIssues(0, form0 as never);
  const r = await run(form0);
  return { issues, status: r.status, body: r.body, res: (r.data as unknown as { result: R } | undefined)?.result };
}
const parts = (b: R["burdenedGift"]) => Object.fromEntries(Object.entries(b.perPart).map(([k, p]) => [k, [p.transferPrice, p.acquisitionPrice, p.estimatedDeduction]]));

describe("겸용 × 부담부증여 — 담보·임대 승 (사용자 결정 H-1)", () => {
  it("[MN-1] ① 기준시가 모드 담보 승 · 근저당 15억 전부 불분명 → 기준시가 1:1로 7.5억/7.5억, 채무비율 1·1 · 237,135,600", async () => {
    const { issues, status, res } = await calc({ ...BG_ON, ...STD, bgMortgageDebtAmount: "1500000000", bgMortgageAttribution: "unallocated" });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    const b = res!.burdenedGift;
    expect(b.sangjeungbeopValuation).toMatchObject({ selectedMode: "mortgage", max: 1_500_000_000 });
    expect(b.debtAttribution).toMatchObject({ housingGiftValue: 750_000_000, commercialGiftValue: 750_000_000, housingDebt: 750_000_000, commercialDebt: 750_000_000, housingRatio: 1, commercialRatio: 1 });
    // 주택 7.5억 = 토지 7.5억×5/6 625,000,000 + 건물 125,000,000 · 취득 = 취득시 기준시가 × 1 · 개산공제 3%
    expect(parts(b)).toEqual({
      housingLand: [625_000_000, 250_000_000, 7_500_000], housingBuilding: [125_000_000, 50_000_000, 1_500_000],
      commercialLand: [625_000_000, 250_000_000, 7_500_000], commercialBuilding: [125_000_000, 50_000_000, 1_500_000],
    });
    expect(b.acquisitionMethodUsed).toBe("standard_price");
    expect(res!.total.determinedTax).toBe(237_135_600);
    expect(res!.warnings.some((w) => w.includes("주택·상가 기준시가 비율로 나누었습니다"))).toBe(true);
    expect(res!.warnings.some((w) => w.includes("담보채권액 평가(「상속세 및 증여세법」 제66조)로 정해졌습니다"))).toBe(true);
  });

  it("[MN-2] ②+④ 상가 보증금 3억(상가 귀속) + 근저당 10억(불분명) · 담보 승 C = B = 13억 → 주택 5억 / 상가 8억, 채무비율 1·1 · 174,975,600", async () => {
    // 기준시가 1:1로 C를 나누면 상가 6.5억 < 상가 채무 8억 → 종전 MB-14. 결정 ④: 상가 증여가액 = 3억 + 10억×1/2 = 8억, 주택 = 5억.
    const { issues, status, res } = await calc({ ...BG_ON, ...STD, bgLendingDepositTotal: "300000000", bgDepositAttribution: "commercial", bgMortgageDebtAmount: "1000000000", bgMortgageAttribution: "unallocated" });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    const b = res!.burdenedGift;
    expect(b.sangjeungbeopValuation).toMatchObject({ selectedMode: "mortgage", max: 1_300_000_000 });
    expect(b.debtAttribution).toMatchObject({ housingGiftValue: 500_000_000, commercialGiftValue: 800_000_000, housingDebt: 500_000_000, commercialDebt: 800_000_000, housingRatio: 1, commercialRatio: 1 });
    // 주택 5억 → 토지 floor(5억×5/6) 416,666,666 + 건물 83,333,334 · 상가 8억 → 666,666,666 + 133,333,334
    expect(parts(b).housingLand[0]).toBe(416_666_666);
    expect(parts(b).housingBuilding[0]).toBe(83_333_334);
    expect(parts(b).commercialLand[0]).toBe(666_666_666);
    expect(parts(b).commercialBuilding[0]).toBe(133_333_334);
    // 12억 판정 = 주택 증여가액(단서 — 주택 = 상가 면적)
    expect(b.highValue.judgmentBase).toBe(500_000_000);
    expect(res!.total.determinedTax).toBe(174_975_600);
  });

  it("[MN-3] ③ 기준시가 모드 임대 승 · 보증금 주택 2억/상가 3억 · 연 임대료 1.2억 → C = 5억 + 1.2억÷12% = 15억을 기준시가 1:1로 · 주택 2/7.5 · 상가 3/7.5 · 61,782,801", async () => {
    const { issues, status, res } = await calc({
      ...BG_ON, ...STD, bgLendingDepositTotal: "500000000", bgDepositAttribution: "split", bgDepositSplitHousing: "200000000", bgDepositSplitCommercial: "300000000",
      bgDepositSplitUnallocated: "0", bgMortgageDebtAmount: "0", bgAnnualRentTotal: "120000000",
    });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    const b = res!.burdenedGift;
    expect(b.sangjeungbeopValuation).toMatchObject({ selectedMode: "rental", max: 1_500_000_000 });
    expect(b.debtAttribution).toMatchObject({ housingGiftValue: 750_000_000, commercialGiftValue: 750_000_000, housingDebt: 200_000_000, commercialDebt: 300_000_000 });
    // 주택 양도가액 = 7.5억 × 2억/7.5억 = 2억 → 166,666,666 + 33,333,334 · 취득 250,000,000×2/7.5 = 66,666,666 · 개산공제 floor(66,666,666×3%) = 1,999,999
    expect(parts(b).housingLand).toEqual([166_666_666, 66_666_666, 1_999_999]);
    expect(parts(b).housingBuilding).toEqual([33_333_334, 13_333_333, 399_999]);
    // 상가 = 3억 → 250,000,000 + 50,000,000 · 취득 × 0.4
    expect(parts(b).commercialLand).toEqual([250_000_000, 100_000_000, 3_000_000]);
    expect(parts(b).commercialBuilding).toEqual([50_000_000, 20_000_000, 600_000]);
    expect(res!.total.determinedTax).toBe(61_782_801);
    expect(res!.warnings.some((w) => w.includes("임대료 환산 평가(「상속세 및 증여세법」 제61조 제5항)로 정해졌습니다"))).toBe(true);
  });

  it("[MN-4] 시가 모드 담보 승(시가 12.5억 < 담보 13억) → 취득가액 = 취득시 기준시가 × 1(§159①1호 괄호) · 구분 감정평가 선언은 읽지 않는다", async () => {
    const base = { ...BG_ON, bgMarketValueAtTransfer: "1250000000", bgMortgageDebtAmount: "1300000000", bgMortgageAttribution: "unallocated" };
    const a = await calc({ ...base, bgHousingAppraisalDeclared: "none" });
    expect(a.issues).toEqual([]);
    expect(a.status).toBe(200);
    const b = a.res!.burdenedGift;
    expect(b.acquisitionStdForcedByCollateral).toBe(true);
    expect(b.acquisitionMethodUsed).toBe("standard_price");
    expect(b.debtAttribution).toMatchObject({ housingGiftValue: 650_000_000, commercialGiftValue: 650_000_000, housingRatio: 1, commercialRatio: 1 });
    expect(parts(b).housingLand).toEqual([541_666_666, 250_000_000, 7_500_000]);
    expect(a.res!.total.determinedTax).toBe(174_975_600);
    // 구분 감정평가 «있음»을 남겨도 결과가 같다(담보 승은 시가를 나누지 않는다)
    const e = await calc({ ...base, bgHousingAppraisalDeclared: "exists", bgHousingAppraisalValue: "900000000" });
    expect(e.status).toBe(200);
    expect(e.res!.total.determinedTax).toBe(174_975_600);
  });

  it("[MN-5] 시가 모드 담보 승 × 증여자 상속 취득 → 상속개시일 평가액을 쓰지 않고(④ 미전송) 취득시 기준시가 · 값을 남겨도 같다", async () => {
    const base = { ...BG_ON, bgMarketValueAtTransfer: "1250000000", bgMortgageDebtAmount: "1300000000", bgMortgageAttribution: "unallocated", bgHousingAppraisalDeclared: "none", acquisitionCause: "inheritance", inheritanceStartDate: "2009-03-01", decedentAcquisitionDate: "2000-01-01" };
    const a = await calc(base);
    expect(a.issues).toEqual([]);
    expect(a.status).toBe(200);
    expect(a.res!.total.determinedTax).toBe(174_975_600);
    const v = await calc({ ...base, mixedHousingInheritedValueOverride: "500000000", mixedCommercialInheritedValueOverride: "400000000" });
    expect((v.body.mixedUse as { housingInheritedValue?: number }).housingInheritedValue).toBeUndefined();
    expect(v.res!.total.determinedTax).toBe(174_975_600);
  });

  it("[MN-6] 담보 승 · 증여일 2023.2.28. 전 → 괄호 시기 확인 필요 안내(§66 열거 전)", async () => {
    const { status, res } = await calc({ ...BG_ON, ...STD, bgMortgageDebtAmount: "1500000000", bgMortgageAttribution: "unallocated" }, { transferDate: "2022-06-01", filingDate: "2022-08-31" });
    expect(status).toBe(200);
    expect(res!.warnings.some((w) => w.includes("2023.2.28. 개정으로 추가"))).toBe(true);
  });

  it("[MN-7] 남은 한계 — 임대 승에서 귀속 채무가 기준시가 안분 몫을 넘으면 MB-14로 막는다(결정 ④는 담보 승만)", async () => {
    // 임대 환산 = 7억 + 0.72억÷12% = 13억 → 상가 6.5억 < 상가 보증금 7억
    const { issues, status } = await calc({ ...BG_ON, ...STD, bgLendingDepositTotal: "700000000", bgDepositAttribution: "commercial", bgMortgageDebtAmount: "0", bgAnnualRentTotal: "72000000" });
    expect(issues[0]?.field).toBe("bgDepositAttribution");
    expect(status).toBe(400);
  });
});
