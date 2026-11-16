/**
 * anchor — 겸용주택 × 부담부증여 × 공유지분 단건 — 화면 경로(④ → ⑧ → ⑫ → ⑭ → 엔진) (MB-6 중 지분 해제 · PR-A).
 *
 * 규약: 시가·취득총액·기준시가는 물건 전체(100%) 입력, 채무·귀속은 지분 인수분. 시료는 겸용 단건 anchor와 같은 F1(주택 100㎡·상가 100㎡·양도시 기준시가 합 12억)이고
 * 지분 50%에 시가 15억·지분 인수 채무 3억(전부 불분명)·취득 7억 — 같은 물건 100%에 채무 6억(M-0: 69,094,001)의 절반 규모다.
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
const NONE = { bgHousingAppraisalDeclared: "none" };
const SHARE = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
type R = {
  total: { determinedTax: number };
  warnings: string[];
  burdenedGift: {
    sangjeungbeopValuation: { selectedMode: string; max: number };
    gratuitousPortion: number;
    debtAttribution: { housingDebt: number; commercialDebt: number; housingGiftValue: number; commercialGiftValue: number; housingRatio: number; commercialRatio: number };
    perPart: Record<string, { transferPrice: number; acquisitionPrice: number; estimatedDeduction: number }>;
    highValue: { judgmentBase: number; prorationBase: number };
  };
};
async function calc(over: Record<string, unknown>, f: Record<string, unknown> = {}) {
  const form0 = { ...mk(over), ...f } as TransferFormData;
  const issues = collectStepIssues(0, form0 as never);
  const r = await run(form0);
  return { issues, status: r.status, body: r.body, res: (r.data as unknown as { result: R } | undefined)?.result };
}
const parts = (b: R["burdenedGift"]) => Object.fromEntries(Object.entries(b.perPart).map(([k, p]) => [k, [p.transferPrice, p.acquisitionPrice, p.estimatedDeduction]]));

describe("겸용 × 부담부증여 × 공유지분 — 화면 경로", () => {
  it("[SH-1] 시가 15억 · 지분 50% · 인수 채무 3억 불분명 · 취득 7억 → ⑧ 통과 · 200 · 4부분 = 단독 M-0(채무 6억)의 절반", async () => {
    const { issues, status, res } = await calc({ ...BG_ON, bgMortgageDebtAmount: "300000000", bgMortgageAttribution: "unallocated", ...NONE, ...SHARE });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    const b = res!.burdenedGift;
    expect(b.sangjeungbeopValuation).toMatchObject({ selectedMode: "supplementary", max: 750_000_000 });
    expect(b.gratuitousPortion).toBe(450_000_000);
    expect(b.debtAttribution).toMatchObject({ housingDebt: 150_000_000, commercialDebt: 150_000_000, housingGiftValue: 375_000_000, housingRatio: 0.4 });
    // 단독 100% M-0(채무 6억): 양도가액 250M/50M · 취득 116,666,666/23,333,333 — 절반
    expect(parts(b).housingLand).toEqual([125_000_000, 58_333_333, 0]);
    expect(parts(b).housingBuilding).toEqual([25_000_000, 11_666_666, 0]);
    // 12억 판정은 물건 전체(시가 15억의 주택분 7.5억 = 단서 안분 분모)
    expect(b.highValue.prorationBase).toBe(750_000_000);
    expect(res!.warnings.some((w) => w.includes("겸용주택 공유지분 부담부증여는 직접 다룬 해석례가 확인되지 않았습니다"))).toBe(true);
    expect(res!.total.determinedTax).toBe(25_125_001); // 엔진 anchor S-F와 같은 시료·같은 값
  });

  it("[SH-2] 지분 50% · 「나머지 지분은 타인 소유」 선언 없음 → ⑧ 차단(종전 Gate-A 그대로)", async () => {
    const { issues } = await calc({ ...BG_ON, bgMortgageDebtAmount: "300000000", bgMortgageAttribution: "unallocated", ...NONE, ...SHARE, ownershipRemainderThirdParty: "" });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("[SH-3] 기준시가 모드 · 지분 인수 채무 7억 → 지분분 보충 6억 < 담보 7억 · 담보 승 · ⑧ 통과 · 200", async () => {
    const { issues, status, res } = await calc({ ...BG_ON, ...STD, bgMortgageDebtAmount: "700000000", bgMortgageAttribution: "unallocated", ...SHARE });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    expect(res!.burdenedGift.sangjeungbeopValuation).toMatchObject({ selectedMode: "mortgage", max: 700_000_000 });
    expect(res!.burdenedGift.debtAttribution).toMatchObject({ housingRatio: 1, commercialRatio: 1 });
  });

  it("[SH-4] 시가 모드 담보 승(지분분 시가 7.5억 < 담보 8억) → 취득가액 = 취득시 기준시가 × 지분 · ⑧ 통과 · 200", async () => {
    const { issues, status, res } = await calc({ ...BG_ON, bgMortgageDebtAmount: "800000000", bgMortgageAttribution: "unallocated", ...NONE, ...SHARE });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    expect(res!.burdenedGift.sangjeungbeopValuation.selectedMode).toBe("mortgage");
    expect(res!.burdenedGift.acquisitionStdForcedByCollateral).toBe(true);
  });

  it("[SH-5] 함께 양도·축 B는 계속 막는다(MB-6 · PR-B) — 안내 문구가 「함께 양도(여러 물건)·지분 분할 취득」", async () => {
    const extra = { ...makeDefaultAsset(2), assetKind: "housing", acquisitionCause: "purchase" } as AssetForm;
    const f = { ...mk({ ...BG_ON, bgMortgageDebtAmount: "300000000", bgMortgageAttribution: "unallocated" }) } as TransferFormData;
    f.assets = [...f.assets, extra] as never;
    const issues = collectStepIssues(0, f as never);
    expect(issues.some((i) => i.message.includes("함께 양도(여러 물건)·지분 분할 취득"))).toBe(true);
  });
});
