/**
 * anchor — 겸용주택 × 부담부증여: 계산할 수 없어 막는다 (⑧ · ⑫ Zod).
 *
 * 겸용주택 경로(`calcMixed`)는 `burdenedGiftInfo`(소령 §159 안분)를 읽지 않고, 부담부증여는 양도가액 입력도 받지 않아 **오류 없이 결정세액 0**이 나왔다
 * (실측: 겸용 + 시가 15억 + 채무 6억 → 0원, 같은 겸용을 일반 양도로 두면 211,650,000원). ⑧이 못 잡으면 API 직접 호출도 같다.
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

/** 물건 전체 채무 6억 · 양도시 기준시가 10억 · 취득시 5억 */
const BG = {
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_standard",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "300000000",
  bgMortgageDebtAmount: "300000000",
  standardPriceAtTransfer: "1000000001",
  standardPriceAtAcq: "500000001",
};

const asset = (id: number, numerator: string, over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    ownershipNumerator: numerator,
    ownershipDenominator: "100",
    ...BG,
    ...over,
  }) as AssetForm;

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


const PRESUMED = {
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1000000000",
  bgAcquisitionMethod: "appraisal",
};

const tranche = (id: number, numerator: string, acqDate: string, wholeValue: string, stdAcq: string) =>
  asset(id, numerator, {
    ...PRESUMED,
    acquisitionDate: acqDate,
    bgPresumedAcquisitionTotal: wholeValue,
    standardPriceAtAcq: stdAcq,
  });

const bundle = () => [
  tranche(1, "60", "2009-03-01", "400000000", "200000000"),
  tranche(2, "40", "2012-03-01", "500000000", "300000000"),
];


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

describe("겸용주택 × 부담부증여", () => {
  it("[M-1] ⑧: 막는다 — 양도 형태 칸으로 이동", () => {
    const issues = collectStepIssues(0, mk(BG_ON) as never);
    const hit = issues.find((i) => /겸용주택은 부담부증여로 계산할 수 없습니다/.test(i.message));
    expect(hit).toBeTruthy();
    expect(hit?.assetIndex).toBe(0);
  });

  it("[M-2] 🔴 대조군 — 같은 겸용주택을 일반 양도로 두면 막지 않고 계산된다(세액 > 0)", async () => {
    expect(collectStepIssues(0, mk({}) as never).some((i) => /부담부증여로 계산할 수 없습니다/.test(i.message))).toBe(false);
    const r = await run(mk({}));
    expect(r.status).toBe(200);
    const total = (r.data as unknown as { result?: { total?: { determinedTax?: number } } }).result?.total?.determinedTax;
    expect(total).toBeGreaterThan(0);
  });

  it("[M-3] 🔴 ⑫: API를 직접 불러도(⑧ 우회) 400 — 오류 없이 세액 0으로 계산되지 않는다", async () => {
    // ⑧을 거치지 않은 요청 — 일반 양도 body에 양도 형태만 부담부증여로 바꾼다
    const base = await run(mk({}));
    const body = { ...base.body, transferType: "burdened_gift" };
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
          ...body,
          isOneHousehold: false,
          householdHousingCount: 2,
          residencePeriodMonths: 0,
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/겸용주택은 부담부증여로 계산할 수 없습니다/);
  });

  it("[M-4] 🔴 대조군(⑫) — 일반 주택 × 부담부증여 API 호출은 막지 않는다(겸용만 막는 refine이다)", async () => {
    const r = await run(form([asset(1, "100", { acquisitionDate: "2010-03-15" })]));
    expect(r.status).toBe(200);
  });

  it("🔴 대조군 — 일반 주택 × 부담부증여는 막지 않는다", () => {
    const a = { ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-15", ...BG_ON } as AssetForm;
    expect(collectStepIssues(0, form([a]) as never).some((i) => /부담부증여로 계산할 수 없습니다/.test(i.message))).toBe(false);
  });
});
