/**
 * anchor — 겸용주택 × 부담부증여: 화면(⑧)은 막고(PR-3까지), API 직접 호출(⑫)은 엔진이 열렸다.
 *
 * 이력: 겸용 경로가 `burdenedGiftInfo`(소령 §159 안분)를 읽지 않아 **오류 없이 결정세액 0**이 나와서 ⑧·⑫ 둘 다 막았다
 * (실측: 겸용 + 시가 15억 + 채무 6억 → 0원, 같은 겸용을 일반 양도로 두면 211,650,000원).
 * PR-1(엔진)이 `mixed-use-burdened-gift.ts` seam을 열면서 ⑫는 «일괄 차단»에서 «MB-1~MB-18 가드 + 채무 귀속 필수»로 바뀌었다.
 * ⑧(M-1)은 UI가 귀속 입력을 갖는 PR-3까지 그대로 막는다 — 화면에서는 귀속을 입력할 수 없어 계산할 수 없다.
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

  // ── ⑫ · API 경로 — PR-1 엔진이 겸용 × 부담부증여를 열었다. 화면(⑧)은 PR-3까지 막혀 있고, API 직접 호출만 열린다. ──
  const post = async (body: Record<string, unknown>) =>
    POST(
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
  /** 설계서 §4 M-0 입력 — 시가 15억 · 채무 6억 전부 불분명 · K-4 실지 7억. 양도시 4부분 기준시가 합 = 12억. */
  const bgInfo = (over: Record<string, unknown> = {}) => ({
    valuationMode: "sangjeungbeop_market",
    lendingDepositTotal: 0,
    mortgageDebtAmount: 600_000_000,
    annualRentTotal: 0,
    marketValueAtTransfer: 1_500_000_000,
    acquisitionMethod: "actual",
    actualAcquisitionTotal: 700_000_000,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_200_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 700_000_000,
    donorRelation: "lineal_descendant",
    debtAttribution: { housing: 0, commercial: 0, unallocated: 600_000_000 },
    housingAppraisal: { exists: false },
    ...over,
  });
  const bgBody = async (over: Record<string, unknown> = {}, info: Record<string, unknown> = {}) => {
    const base = await run(mk({}));
    return { ...base.body, transferType: "burdened_gift", burdenedGiftInfo: bgInfo(info), ...over };
  };

  it("[M-3] 🔴 ⑫: burdenedGiftInfo 없이 부담부증여로 보내면(⑧ 우회) 400 — 오류 없이 세액 0으로 계산되지 않는다", async () => {
    const base = await run(mk({}));
    const res = await post({ ...base.body, transferType: "burdened_gift" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/burdenedGiftInfo가 필요합니다/);
  });

  it("[M-3a] API 경로 계산 — 채무 귀속을 실으면 계산된다: M-0 69,094,001 (일반 양도 15억은 211,650,000)", async () => {
    const res = await post(await bgBody());
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { mode: string; result: { total: { determinedTax: number }; burdenedGift?: { assumedDebtAmount: number; debtAttribution: { housingDebt: number; commercialDebt: number } } } } };
    expect(j.data.mode).toBe("mixed-use");
    expect(j.data.result.total.determinedTax).toBe(69_094_001);
    expect(j.data.result.burdenedGift?.assumedDebtAmount).toBe(600_000_000);
    expect(j.data.result.burdenedGift?.debtAttribution.housingDebt).toBe(300_000_000);
  });

  it("[M-3b] 🔴 귀속 미입력(기본값 없음, G-4) → 400 — 균일 안분으로 조용히 계산하지 않는다", async () => {
    const res = await post(await bgBody({}, { debtAttribution: undefined }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/귀속/);
  });

  it("[M-3c] 🔴 귀속 합 ≠ 인수 채무 → 400", async () => {
    const res = await post(await bgBody({}, { debtAttribution: { housing: 0, commercial: 0, unallocated: 500_000_000 } }));
    expect(res.status).toBe(400);
  });

  it("[M-3d] 🔴 임대료 환산 평가가 보충적평가를 이기는 입력(MB-7) → 400", async () => {
    const res = await post(await bgBody({}, { valuationMode: "sangjeungbeop_standard", annualRentTotal: 600_000_000, marketValueAtTransfer: undefined, acquisitionMethod: undefined, actualAcquisitionTotal: undefined, housingAppraisal: undefined }));
    expect(res.status).toBe(400);
  });

  it("[M-3e] 🔴 비겸용에 채무 귀속을 실으면 400 — 조용히 무시되는 입력 금지", async () => {
    const r = await run(form([asset(1, "100", { acquisitionDate: "2010-03-15" })]));
    const res = await post({ ...r.body, burdenedGiftInfo: { ...(r.body.burdenedGiftInfo as object), debtAttribution: { housing: 1, commercial: 0, unallocated: 0 } } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/겸용주택 부담부증여에서만/);
  });

  it("[M-3f] 🔴 구 표식(acquisitionCause=burdened_gift) → 400", async () => {
    const res = await post(await bgBody({ acquisitionCause: "burdened_gift" }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/양도 형태/);
  });

  it("[M-3g] 🔴 증여일 2022-01-01 미만 → 400 (엔진 throw가 아니라 ⑫가 먼저)", async () => {
    const res = await post(await bgBody({ transferDate: "2021-12-31" }));
    expect(res.status).toBe(400);
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
